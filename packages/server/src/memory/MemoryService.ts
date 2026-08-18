import { mkdir, readFile, rm } from "node:fs/promises";

import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import type { MemoryEntryRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { writeAtomically } from "../files/FileService.js";
import type { GitExec } from "../git/exec.js";

import {
  hashContent,
  identityFor,
  listEntries,
  pathClaiming,
  reindex,
  removeEntry,
  upsertEntry,
  type ReindexResult,
} from "./catalog.js";
import {
  parseEntry,
  resolveScope,
  serializeEntry,
  slugify,
  type MemoryActor,
  type MemoryEntry,
  type MemoryScope,
  type MemoryType,
} from "./entry.js";
import { entryPathFor, memoryDirFor, repoRelative, type ScopeTarget } from "./paths.js";
import { commitChange } from "./repo.js";

/**
 * A superfície mínima da PR 01: escrever, ler, listar, reindexar.
 *
 * Ainda **sem portão** — o scan determinístico, o WAL e a inbox são a PR 02, e
 * é por isso que nada aqui é exposto a agente nenhum. O que esta classe fecha é
 * o ciclo de baixo: o Markdown vai para o disco, o commit conta a história, e o
 * catálogo espelha.
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
    this.refuseIfClaimedByAnother(scope, target, input.type, path);

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
        created_at: this.birthOf(previous, path, timestamp),
        updated_at: timestamp,
      },
      body: input.body,
    };

    const text = serializeEntry(entry);
    await mkdir(memoryDirFor(this.stateDir, target), { recursive: true, mode: 0o700 });
    await writeAtomically(absolute, Buffer.from(text, "utf8"), 0o600);

    upsertEntry(this.db, path, entry, this.locationFor(scope, target), text);

    const { commit } = await commitChange({
      stateDir: this.stateDir,
      paths: [path],
      operation: previous === null ? "add" : "update",
      subject: `${input.type}/${slug}`,
      actor: input.actor,
      ...(this.exec ? { exec: this.exec } : {}),
      ...(this.log ? { log: this.log } : {}),
    });

    return { path, scope, commit, created: previous === null };
  }

  /**
   * Recusa quando a identidade já é de **outro** arquivo.
   *
   * Antes desta guarda quem descobria a colisão era o índice único do banco —
   * e descobria tarde: o `writeAtomically` já tinha acontecido, o `commitChange`
   * ainda não, e o `SqliteError` subia cru. Sobrava arquivo novo no disco, sem
   * commit, com o catálogo apontando para o antigo.
   *
   * `write` **recusa em vez de reconciliar**, e é a mesma escolha que o
   * `reindex` faz: deixar os dois caminhos discordarem sobre quem é dono de uma
   * identidade é pior do que qualquer conveniência. A pergunta é feita ao
   * catálogo porque é o índice — e não o disco — que impõe a restrição.
   */
  private refuseIfClaimedByAnother(
    scope: MemoryScope,
    target: ScopeTarget,
    type: MemoryType,
    path: string,
  ): void {
    const identity = identityFor(path, { type, scope }, this.locationFor(scope, target));
    const owner = pathClaiming(this.db, identity);
    if (owner === undefined || owner === path) return;

    throw new DomainError(
      "DUPLICATE",
      `a identidade ${type}/${identity.slug} em ${scope} já é de ${owner}: ` +
        `apague ou renomeie aquele arquivo, ou reindexe se ele não existe mais`,
    );
  }

  /**
   * A data de nascimento do que já estava no disco — ou a de agora.
   *
   * Arquivo corrompido não pode **bloquear a escrita**: recusar aqui deixava a
   * memória impossível de consertar pela própria ferramenta, e a única saída era
   * apagar o arquivo por fora. Perder a data de nascimento de um arquivo que já
   * não se consegue ler é o preço menor, e ele fica registrado no log.
   */
  private birthOf(previous: string | null, path: string, fallback: string): string {
    if (previous === null) return fallback;
    try {
      return parseEntry(previous, path).provenance.created_at;
    } catch (error) {
      this.log?.warn({ err: error, path }, "memória anterior ilegível; a data de nascimento recomeça agora");
      return fallback;
    }
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

  /** O que existe, do catálogo — que é a projeção, e por isso é barato. */
  list(): MemoryEntryRow[] {
    return listEntries(this.db);
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

  /** Refaz o catálogo a partir do disco. */
  async reindex(): Promise<ReindexResult> {
    return reindex(this.db, this.stateDir);
  }

  /** O hash que o catálogo guarda, exposto para quem precisa comparar sem reler. */
  static hash(text: string): string {
    return hashContent(text);
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
