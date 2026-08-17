import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import type { MemoryDecisionRow, MemoryEntryRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { writeAtomically } from "../files/FileService.js";
import { execGit, type GitExec } from "../git/exec.js";

import {
  hashContent,
  listEntries,
  reindex,
  removeEntry,
  upsertEntry,
  type ReindexResult,
} from "./catalog.js";
import {
  attachCommit,
  decide,
  listDecisions,
  recordDecision,
  type DecisionQuery,
  type GateDecision,
} from "./gate.js";
import {
  entrySignature,
  parseEntry,
  resolveScope,
  serializeEntry,
  slugify,
  type MemoryActor,
  type MemoryEntry,
  type MemoryScope,
  type MemoryType,
} from "./entry.js";
import { entryPathFor, memoryDirFor, repoRelative, slugOf, type ScopeTarget } from "./paths.js";
import {
  indexEntry,
  rebuildIndex,
  recall,
  removeFromIndex,
  summarizeUsage,
  usage,
  type RecallOptions,
  type RecallResult,
  type UsageSummary,
} from "./recall.js";
import { resolveVisible, type ResolvedView, type ScopeFilter } from "./shadow.js";
import { commitChange } from "./repo.js";

/**
 * Escrever, ler, listar, reindexar — **e desfazer**, tudo por um portão só.
 *
 * A PR 01 fez o ciclo de baixo (disco, commit, catálogo); a PR 02 pôs o portão
 * na frente: nada é gravado sem passar pelo scan e sem virar decisão no WAL.
 * A inbox de propostas é a PR 05 — até lá, o que a regra não resolve é recusa
 * explícita, nunca palpite.
 *
 * A ordem dentro de `write` não é arbitrária. Disco, catálogo, git — nessa
 * sequência, e cada passo seguinte pode falhar sem desfazer o anterior. É a
 * consequência de a fonte da verdade ser o arquivo: o histórico e o índice são
 * serviços prestados a ele, e um serviço que falha não apaga o dado que serve.
 */

export interface WriteMemoryInput {
  name: string;
  description: string;
  type: MemoryType;
  /** Quando ausente, é derivado do tipo (§6 do PRD). */
  scope?: MemoryScope;
  workspaceId?: string;
  projectId?: string;
  body: string;
  actor: MemoryActor;
  confidence?: "low" | "medium" | "high";
  /** O que sustenta a memória. Obrigatório para `auto_research`, quando ele existir (D7). */
  evidence?: string;
  sourceSessions?: readonly string[];
  /** Worktree é origem, nunca escopo (Q5). */
  worktreeId?: string;
}

export interface WriteMemoryResult {
  path: string;
  scope: MemoryScope;
  /** `null` quando o git não pôde commitar — a escrita aconteceu assim mesmo. */
  commit: string | null;
  created: boolean;
  /** O que o portão decidiu. `noop` não toca o disco. */
  outcome: GateDecision["outcome"];
  /** Por que não foi aplicada, quando não foi. */
  reason: string | null;
}

/** Escrita barrada pelo portão. Carrega o motivo, nunca o conteúdo escaneado. */
export class MemoryRejected extends DomainError {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super("BLOCKED", `memória recusada: ${reason}`);
    this.name = "MemoryRejected";
  }
}

export interface MemoryServiceOptions {
  db: Db;
  stateDir: string;
  exec?: GitExec;
  log?: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
}

export class MemoryService {
  private readonly db: Db;
  private readonly stateDir: string;
  private readonly exec: GitExec | undefined;
  private readonly log: Pick<FastifyBaseLogger, "warn"> | undefined;
  private readonly now: () => Date;

  constructor({ db, stateDir, exec, log, now = () => new Date() }: MemoryServiceOptions) {
    this.db = db;
    this.stateDir = stateDir;
    this.exec = exec;
    this.log = log;
    this.now = now;
  }

  /** Escreve — ou substitui — uma memória, pela identidade `(tipo, slug)`. */
  async write(input: WriteMemoryInput): Promise<WriteMemoryResult> {
    const scope = resolveScope(input.type, input.scope);
    const target = this.targetFor(scope, input);
    const slug = slugify(input.name);
    const absolute = entryPathFor(this.stateDir, target, input.type, slug);
    const path = repoRelative(this.stateDir, absolute);

    const previous = await readFile(absolute, "utf8").catch(() => null);
    const timestamp = this.now().toISOString();
    const entry: MemoryEntry = {
      name: input.name,
      description: input.description,
      type: input.type,
      scope,
      provenance: {
        source_actor: input.actor,
        source_sessions: [...(input.sourceSessions ?? [])],
        ...(input.projectId === undefined ? {} : { project_id: input.projectId }),
        ...(input.worktreeId === undefined ? {} : { worktree_id: input.worktreeId }),
        confidence: input.confidence ?? "medium",
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
        // Substituir preserva a data de nascimento: é ela que diz há quanto
        // tempo o sistema sabe daquilo.
        created_at: previous === null ? timestamp : parseEntry(previous, path).provenance.created_at,
        updated_at: timestamp,
      },
      body: input.body,
    };

    const candidate = serializeEntry(entry);
    const operation = previous === null ? "add" : "update";

    // O portão decide antes de qualquer coisa tocar o disco (§7 do PRD).
    const decision = decide({
      path,
      operation,
      actor: input.actor,
      confidence: entry.provenance.confidence,
      content: candidate,
      signature: entrySignature(entry),
      previousSignature: previous === null ? null : entrySignature(parseEntry(previous, path)),
    });
    const record = recordDecision(this.db, {
      ...decision,
      path,
      operation,
      actor: input.actor,
      confidence: entry.provenance.confidence,
    });

    if (decision.outcome === "rejected") {
      throw new MemoryRejected(path, decision.reason ?? "recusada pelo portão");
    }
    if (decision.outcome === "noop") {
      return { path, scope, commit: null, created: false, outcome: "noop", reason: decision.reason };
    }

    // `decision.content` e não `candidate`: o scan pode ter limpado Unicode
    // invisível, e o que vale é o texto que o portão aprovou.
    const text = decision.content;
    await mkdir(memoryDirFor(this.stateDir, target), { recursive: true, mode: 0o700 });
    await writeAtomically(absolute, Buffer.from(text, "utf8"), 0o600);

    const stored = parseEntry(text, path);
    upsertEntry(this.db, path, stored, this.locationFor(scope, target), text);
    indexEntry(this.db, path, stored.name, stored.description, slug, stored.body);

    const { commit } = await commitChange({
      stateDir: this.stateDir,
      paths: [path],
      operation,
      subject: `${input.type}/${slug}`,
      actor: input.actor,
      ...(this.exec ? { exec: this.exec } : {}),
      ...(this.log ? { log: this.log } : {}),
    });
    attachCommit(this.db, record.id, commit);

    return { path, scope, commit, created: previous === null, outcome: "applied", reason: null };
  }

  /** Lê uma memória pelo par que a identifica. */
  async read(
    type: MemoryType,
    name: string,
    scope?: MemoryScope,
    ids: { workspaceId?: string; projectId?: string } = {},
  ): Promise<MemoryEntry> {
    const resolved = resolveScope(type, scope);
    const path = entryPathFor(
      this.stateDir,
      this.targetFor(resolved, ids),
      type,
      slugify(name),
    );
    const text = await readFile(path, "utf8").catch(() => null);
    if (text === null) {
      throw new DomainError("NOT_FOUND", `memória ${type}/${slugify(name)} não existe em ${resolved}`);
    }
    return parseEntry(text, repoRelative(this.stateDir, path));
  }

  /** Tudo que existe, sem resolver escopo. É a lista crua do catálogo. */
  list(): MemoryEntryRow[] {
    return listEntries(this.db);
  }

  /**
   * O que o escopo ativo **enxerga**, com o que ficou sombreado ao lado.
   *
   * Duas listas e não uma: esconder sem dizer o que foi escondido é como o
   * shadow vira mistério. A segunda lista é o que a UI da PR 05 mostra quando
   * você pergunta "por que esta memória não está valendo?".
   */
  visible(filter: ScopeFilter = {}): ResolvedView {
    return resolveVisible(listEntries(this.db), filter);
  }

  /** Apaga. Só quando pedido diretamente (Q29) — nada aqui apaga sozinho. */
  async forget(
    type: MemoryType,
    name: string,
    scope?: MemoryScope,
    ids: { workspaceId?: string; projectId?: string } = {},
  ): Promise<{ path: string; commit: string | null }> {
    const resolved = resolveScope(type, scope);
    const slug = slugify(name);
    const absolute = entryPathFor(this.stateDir, this.targetFor(resolved, ids), type, slug);
    const path = repoRelative(this.stateDir, absolute);

    await rm(absolute, { force: true });
    removeEntry(this.db, path);
    removeFromIndex(this.db, path);

    const { commit } = await commitChange({
      stateDir: this.stateDir,
      paths: [path],
      operation: "delete",
      subject: `${type}/${slug}`,
      actor: "human",
      ...(this.exec ? { exec: this.exec } : {}),
      ...(this.log ? { log: this.log } : {}),
    });

    // O arquivo saiu da árvore; o histórico continua sabendo que ele existiu.
    return { path, commit };
  }

  /**
   * Desfaz a última mudança de uma memória, e **grava uma decisão nova**.
   *
   * O histórico nunca é reescrito: reverter é aplicar o conteúdo anterior como
   * uma escrita nova, exatamente como o Compozy faz. E o conteúdo anterior vem
   * do **git** — que é o motivo de o WAL da Q37 não precisar guardá-lo.
   *
   * Se a memória só tem um commit, desfazer é apagá-la: era ela que não existia
   * antes.
   */
  async revert(path: string): Promise<{ path: string; outcome: "reverted" | "deleted"; commit: string | null }> {
    const history = await this.git(["log", "-n", "2", "--format=%H", "--", path]);
    const [current, previousSha] = history.split("\n").filter(Boolean);
    if (current === undefined) {
      throw new DomainError("NOT_FOUND", `${path} não tem histórico para desfazer`);
    }

    const absolute = join(this.stateDir, path);

    if (previousSha === undefined) {
      // Nasceu no commit atual: desfazer é fazê-la deixar de existir.
      await rm(absolute, { force: true });
      removeEntry(this.db, path);
      removeFromIndex(this.db, path);
      const { commit } = await this.commit([path], "delete", path, "human");
      return { path, outcome: "deleted", commit };
    }

    const restored = await this.git(["show", `${previousSha}:${path}`]);
    const entry = parseEntry(restored, path);
    await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
    await writeAtomically(absolute, Buffer.from(restored, "utf8"), 0o600);
    upsertEntry(this.db, path, entry, this.locationOf(entry, path), restored);
    indexEntry(this.db, path, entry.name, entry.description, slugOf(path, entry.type), entry.body);

    const decision = decide({
      path,
      operation: "update",
      actor: "human",
      confidence: entry.provenance.confidence,
      content: restored,
      // A chave carrega o commit restaurado: desfazer duas vezes para o mesmo
      // ponto é a mesma decisão, e não duas.
      idempotencyKey: `revert:${path}:${previousSha}`,
    });
    const record = recordDecision(this.db, {
      ...decision,
      path,
      operation: "update",
      actor: "human",
      confidence: entry.provenance.confidence,
    });

    const { commit } = await this.commit([path], "update", path, "human");
    attachCommit(this.db, record.id, commit);
    return { path, outcome: "reverted", commit };
  }

  /** As decisões — inclusive as que **não** viraram arquivo. */
  decisions(query: DecisionQuery = {}): MemoryDecisionRow[] {
    return listDecisions(this.db, query);
  }

  /**
   * Refaz o catálogo **e o índice** a partir do disco.
   *
   * Os dois juntos porque os dois são derivados: um `reindex` que deixasse o
   * FTS5 para trás produziria busca que não acha o que a lista mostra — pior do
   * que busca que não existe.
   */
  async reindex(): Promise<ReindexResult> {
    const result = await reindex(this.db, this.stateDir);
    rebuildIndex(this.db);
    // O corpo não está no catálogo, então o índice é completado lendo o disco —
    // a mesma fonte da verdade de sempre.
    for (const row of listEntries(this.db)) {
      const text = await readFile(join(this.stateDir, row.path), "utf8").catch(() => null);
      if (text === null) continue;
      const entry = parseEntry(text, row.path);
      indexEntry(this.db, row.path, entry.name, entry.description, row.slug, entry.body);
    }
    return result;
  }

  /** Busca lexical, explicável, com sinal de uso registrado. */
  search(query: string, options: RecallOptions = {}): RecallResult {
    return recall(this.db, query, options);
  }

  /** Os números do §6 do context-delivery. */
  usageSummary(): UsageSummary[] {
    return summarizeUsage(this.db);
  }

  /** Registra um uso que não passou pela busca — leitura, escrita, injeção. */
  recordUsage(kind: "read" | "write" | "inject", amount: number, durationMs = 0): void {
    usage(this.db, kind, amount, durationMs);
  }

  /** O hash que o catálogo guarda, exposto para quem precisa comparar sem reler. */
  static hash(text: string): string {
    return hashContent(text);
  }

  private async git(args: readonly string[]): Promise<string> {
    const exec = this.exec ?? execGit;
    const { stdout } = await exec(args, { cwd: this.stateDir });
    return stdout;
  }

  private async commit(
    paths: readonly string[],
    operation: "add" | "update" | "delete",
    subject: string,
    actor: string,
  ) {
    return commitChange({
      stateDir: this.stateDir,
      paths,
      operation,
      subject,
      actor,
      ...(this.exec ? { exec: this.exec } : {}),
      ...(this.log ? { log: this.log } : {}),
    });
  }

  /** O escopo de uma memória lida do disco, a partir do caminho dela. */
  private locationOf(entry: MemoryEntry, path: string) {
    const parts = path.split("/");
    return {
      scope: entry.scope,
      workspaceId: parts[0] === "workspaces" ? (parts[1] ?? null) : null,
      projectId: parts[2] === "projects" ? (parts[3] ?? null) : null,
    };
  }

  private targetFor(
    scope: MemoryScope,
    ids: { workspaceId?: string; projectId?: string },
  ): ScopeTarget {
    return {
      scope,
      ...(ids.workspaceId === undefined ? {} : { workspaceId: ids.workspaceId }),
      ...(ids.projectId === undefined ? {} : { projectId: ids.projectId }),
    };
  }

  private locationFor(scope: MemoryScope, target: ScopeTarget) {
    return {
      scope,
      workspaceId: target.workspaceId ?? null,
      projectId: target.projectId ?? null,
    };
  }
}
