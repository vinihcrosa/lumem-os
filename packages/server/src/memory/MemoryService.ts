import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";

import type { Db } from "../db/index.js";
import type { MemoryDecisionRow, MemoryEntryRow, MemoryProposalRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { writeAtomically } from "../files/FileService.js";
import { execGit, type GitExec } from "../git/exec.js";

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
import { scanMemoryContent } from "./scan.js";
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
  MEMORY_ACTORS,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  parseEntry,
  resolveScope,
  serializeEntry,
  slugify,
  type MemoryActor,
  type MemoryEntry,
  type MemoryScope,
  type MemoryType,
} from "./entry.js";
import {
  assertEntryPath,
  entryPathFor,
  memoryDirFor,
  repoRelative,
  slugOf,
  type ScopeTarget,
} from "./paths.js";
import {
  clearSignal,
  indexEntry,
  indexIsStale,
  resetIndex,
  recall,
  removeFromIndex,
  summarizeUsage,
  usage,
  type RecallOptions,
  type RecallResult,
  type UsageOptions,
  type UsageSummary,
} from "./recall.js";
import {
  createProposal,
  findProposal,
  listProposals,
  requiresProposal,
  resolveProposal,
  type ProposalQuery,
} from "./proposals.js";
import { resolveVisible, type ResolvedView, type ScopeFilter } from "./shadow.js";
import { commitChange } from "./repo.js";

/**
 * Escrever, ler, listar, reindexar — **e desfazer**, tudo por um portão só.
 *
 * A PR 01 fez o ciclo de baixo (disco, commit, catálogo); a PR 02 pôs o portão
 * na frente: nada é gravado sem passar pelo scan e sem virar decisão no WAL.
 * A inbox de propostas é a PR 05, e ela existe: escrita para cima feita por
 * quem não é você **desvia** para revisão em vez de virar recusa. O que a regra
 * não resolve continua sendo recusa explícita, nunca palpite.
 *
 * A ordem dentro de `write` não é arbitrária. Disco, catálogo, git — nessa
 * sequência, e cada passo seguinte pode falhar sem desfazer o anterior. É a
 * consequência de a fonte da verdade ser o arquivo: o histórico e o índice são
 * serviços prestados a ele, e um serviço que falha não apaga o dado que serve.
 */

/**
 * Os limites de uma escrita, **no núcleo** — e não em cada superfície.
 *
 * Estavam só no zod do router, e o resultado era a segunda semântica que esta
 * PR existe para evitar, só que na entrada: a CLI passava `--scope` com um cast
 * e o mesmo núcleo aceitava pela linha de comando o que a API recusava. O schema
 * mora aqui, e as superfícies o **reusam** — o router como `input` (para o
 * cliente ganhar os tipos) e este método como validação de verdade.
 */
export const writeMemorySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  type: z.enum(MEMORY_TYPES),
  /** Quando ausente, é derivado do tipo (§6 do PRD). */
  scope: z.enum(MEMORY_SCOPES).optional(),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  body: z.string().max(100_000).default(""),
  /**
   * Declarado, e ainda não provado.
   *
   * O default é `human` nas duas superfícies, de propósito — elas contam a mesma
   * história. Quem **impõe** o ator (transporte, ambiente ou token de sessão) é a
   * [Q46](../../../../docs/prd/workspace-memory/open-questions.md), aberta: até
   * ela fechar, o desvio da Q27 protege contra engano, não contra quem quer
   * burlá-lo — e o WAL registra o ator declarado de toda escrita.
   */
  actor: z.enum(MEMORY_ACTORS).default("human"),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  /** O que sustenta a memória. Obrigatório para `auto_research`, quando ele existir (D7). */
  evidence: z.string().max(4_000).optional(),
  sourceSessions: z.array(z.string()).optional(),
  /** Worktree é origem, nunca escopo (Q5). */
  worktreeId: z.string().optional(),
  /**
   * A origem, quando a escrita vem de uma proposta aprovada.
   *
   * O ator da escrita passa a ser `human` — quem revisou foi você —, e é por
   * isso que quem propôs precisa de campo próprio: sem ele a origem se perde no
   * momento em que a proposta é aceita.
   */
  proposedBy: z.enum(MEMORY_ACTORS).optional(),
  proposalId: z.string().min(1).optional(),
  /**
   * `false` desliga o desvio para a inbox.
   *
   * Existe para um caso só: aprovar uma proposta é gravar, e gravar o que você
   * acabou de aprovar não pode virar proposta outra vez.
   */
  proposal: z.boolean().optional(),
});

/** O que uma superfície manda; `body` e `actor` têm default no schema. */
export type WriteMemoryInput = z.input<typeof writeMemorySchema>;

/** O mesmo pedido, já validado — o que o núcleo usa daqui para baixo. */
type ValidatedWrite = z.output<typeof writeMemorySchema>;

export interface WriteMemoryResult {
  path: string;
  scope: MemoryScope;
  /** `null` quando o git não pôde commitar — a escrita aconteceu assim mesmo. */
  commit: string | null;
  created: boolean;
  /** O que o portão decidiu. `noop` não toca o disco. */
  outcome: GateDecision["outcome"] | "proposed";
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
  async write(requested: WriteMemoryInput): Promise<WriteMemoryResult> {
    const input = parseWrite(requested);
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
        // Origem **acumula**, não substitui: cada sessão que ensinou a mesma
        // coisa é uma origem a mais, e trocar a lista faria a segunda escrita
        // apagar quem ensinou primeiro. É também o que faz a duplicata voltar a
        // ser `noop` quando a mesma sessão repropõe o mesmo texto.
        source_sessions: this.originsOf(previous, path, input.sourceSessions ?? []),
        ...(input.projectId === undefined ? {} : { project_id: input.projectId }),
        ...(input.worktreeId === undefined ? {} : { worktree_id: input.worktreeId }),
        confidence: input.confidence ?? "medium",
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
        ...(input.proposedBy === undefined ? {} : { proposed_by: input.proposedBy }),
        ...(input.proposalId === undefined ? {} : { proposal_id: input.proposalId }),
        // Substituir preserva a data de nascimento: é ela que diz há quanto
        // tempo o sistema sabe daquilo.
        created_at: this.birthOf(previous, path, timestamp),
        updated_at: timestamp,
      },
      // Fixar é curadoria, não conteúdo: reescrever o texto de uma memória não
      // pode tirá-la do núcleo. A `entrySignature` já ignora `pinned` — sem esta
      // linha, a próxima reescrita gravaria o default `false` e desfixaria em
      // silêncio uma memória que alguém escolheu à mão.
      pinned: this.pinnedOf(previous, path),
      body: input.body,
    };

    const candidate = serializeEntry(entry);
    const operation = previous === null ? "add" : "update";

    // Q27: ator não-humano escrevendo para cima vira **proposta**, não memória. O
    // desvio acontece aqui, antes do portão gravar decisão, porque uma proposta
    // não é uma escrita que falhou — é uma escrita que ainda não foi pedida.
    //
    // É o que a 03 deixou como `proposalRefusal`: enquanto a inbox não existia, a
    // mesma regra recusava com motivo. Agora ela desvia, e a recusa provisória
    // saiu junto com o motivo dela.
    //
    // **O scan vem primeiro, e é o único que continua recusando.** Conteúdo com
    // segredo não vira proposta: ele seria persistido no banco e mostrado na
    // inbox, que é exatamente o que o scan existe para impedir. Sujo cai no
    // portão abaixo, vira `rejected` no WAL, e responde "por que isso não foi
    // salvo?" com um registro só.
    const suspect = scanMemoryContent(candidate).verdict === "reject";
    if (input.proposal !== false && !suspect && requiresProposal(input.actor, scope, input.type)) {
      const proposal = createProposal(this.db, {
        path,
        type: input.type,
        scope,
        slug,
        workspaceId: target.workspaceId ?? null,
        projectId: target.projectId ?? null,
        name: input.name,
        description: input.description,
        body: input.body,
        actor: input.actor,
        fromProjectId: input.projectId ?? null,
        sessionId: input.sourceSessions?.[0] ?? null,
        confidence: entry.provenance.confidence,
        evidence: input.evidence ?? null,
      });
      return {
        path,
        scope,
        commit: null,
        created: false,
        outcome: "proposed",
        reason: `aguardando revisão (proposta ${proposal.id})`,
      };
    }

    // O portão decide antes de qualquer coisa tocar o disco (§7 do PRD).
    const decision = decide({
      path,
      operation,
      actor: input.actor,
      confidence: entry.provenance.confidence,
      content: candidate,
      signature: entrySignature(entry),
      previousSignature: this.signatureOf(previous, path),
    });
    const record = recordDecision(this.db, {
      ...decision,
      path,
      operation,
      actor: input.actor,
      confidence: entry.provenance.confidence,
      sourceSessions: entry.provenance.source_sessions,
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
   * A assinatura do que está no disco, ou `null` quando não há o que comparar.
   *
   * `null` também para arquivo ilegível, e pela mesma razão do `birthOf`: o que
   * não se consegue ler não pode ser declarado duplicata, senão reescrever por
   * cima da corrupção viraria `noop` e a memória ficaria impossível de
   * consertar pela própria ferramenta. Sem aviso aqui — o `birthOf` já registra
   * o mesmo arquivo, e avisar duas vezes pelo mesmo defeito é ruído.
   */
  private signatureOf(previous: string | null, path: string): string | null {
    if (previous === null) return null;
    try {
      return entrySignature(parseEntry(previous, path));
    } catch {
      return null;
    }
  }

  /**
   * As sessões que originaram — **acumulando**, nunca trocando.
   *
   * Cada sessão que ensinou a mesma coisa é uma origem a mais. Substituir a
   * lista apagaria quem ensinou primeiro, e faria cada nova sessão custar uma
   * escrita cujo único delta é quem leva o crédito.
   *
   * Ilegível vira lista vazia, pela mesma razão do `birthOf`: arquivo corrompido
   * não pode bloquear a escrita que o conserta. Perde-se de quem veio o que já
   * não se consegue ler.
   */
  private originsOf(previous: string | null, path: string, incoming: readonly string[]): string[] {
    let known: readonly string[] = [];
    if (previous !== null) {
      try {
        known = parseEntry(previous, path).provenance.source_sessions;
      } catch {
        // Sem aviso: o `birthOf` já registra o mesmo arquivo.
      }
    }
    return [...new Set([...known, ...incoming])];
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

  /**
   * Se o que está no disco faz parte do núcleo.
   *
   * `false` para arquivo ilegível, pela mesma razão do `birthOf`: quem não se
   * consegue ler não pode bloquear a escrita que o conserta. Sem aviso — o
   * `birthOf` já registra o mesmo arquivo.
   */
  private pinnedOf(previous: string | null, path: string): boolean {
    if (previous === null) return false;
    try {
      return parseEntry(previous, path).pinned;
    } catch {
      return false;
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

  /**
   * Apaga. Só quando pedido diretamente (Q29) — nada aqui apaga sozinho.
   *
   * E só por você: *"apagar é sempre ação sua"*. A escrita de agente virou
   * proposta nesta PR; deixar a **deleção** aberta seria fechar a porta da frente
   * e esquecer a dos fundos — pior, porque o commit ia para o `git log` do
   * `~/.lumem` com a sua assinatura.
   */
  async forget(
    type: MemoryType,
    name: string,
    scope?: MemoryScope,
    ids: { workspaceId?: string; projectId?: string; actor?: MemoryActor } = {},
  ): Promise<{ path: string; commit: string | null }> {
    const actor = ids.actor ?? "human";
    if (actor !== "human") {
      throw new DomainError(
        "BLOCKED",
        `apagar memória é sempre ação sua (Q29) — ${actor} não apaga, propõe`,
      );
    }
    const resolved = resolveScope(type, scope);
    const slug = slugify(name);
    const absolute = entryPathFor(this.stateDir, this.targetFor(resolved, ids), type, slug);
    const path = repoRelative(this.stateDir, absolute);

    // Apagar também é decisão, e é a única que o git não consegue explicar
    // sozinho: o commit diz *que* sumiu, nunca *quem pediu* nem *por quê*. Sem
    // esta linha, "por que isso não está mais salvo?" não tem resposta no WAL.
    const record = await this.recordDeletion(path, "human");

    await rm(absolute, { force: true });
    removeEntry(this.db, path);
    removeFromIndex(this.db, path);
    // O sinal vai junto: o caminho é derivado de `(tipo, slug)`, então uma
    // memória recriada com o mesmo nome herdaria o contador da apagada — e o
    // critério objetivo da Q25 passaria a contar recall de conteúdo que não
    // existe mais.
    clearSignal(this.db, path);

    const { commit } = await commitChange({
      stateDir: this.stateDir,
      paths: [path],
      operation: "delete",
      subject: `${type}/${slug}`,
      actor,
      ...(this.exec ? { exec: this.exec } : {}),
      ...(this.log ? { log: this.log } : {}),
    });
    attachCommit(this.db, record.id, commit);

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
  async revert(requested: string): Promise<{ path: string; outcome: "reverted" | "deleted"; commit: string | null }> {
    // O caminho vem do cliente e vira `rm` + commit dentro do `~/.lumem`. O git
    // barra `../`; ele não barra `.gitignore`.
    const path = assertEntryPath(requested);
    const history = await this.git(["log", "-n", "2", "--format=%H", "--", path]);
    const [current, previousSha] = history.split("\n").filter(Boolean);
    if (current === undefined) {
      throw new DomainError("NOT_FOUND", `${path} não tem histórico para desfazer`);
    }

    const absolute = join(this.stateDir, path);

    if (previousSha === undefined) {
      // Nasceu no commit atual: desfazer é fazê-la deixar de existir.
      // A decisão vem antes do disco, como em toda deleção: a Q29 promete que
      // apagar é reversível pelo WAL, e o git sabe *que* o arquivo sumiu, nunca
      // *quem pediu*.
      const record = await this.recordDeletion(path, "human");
      await rm(absolute, { force: true });
      removeEntry(this.db, path);
      removeFromIndex(this.db, path);
      clearSignal(this.db, path);
      const { commit } = await this.commit([path], "delete", path, "human");
      attachCommit(this.db, record.id, commit);
      return { path, outcome: "deleted", commit };
    }

    const restored = await this.git(["show", `${previousSha}:${path}`]);
    const head = await this.head();

    // O portão vem **antes** do disco, aqui como em `write`. O conteúdo anterior
    // é conteúdo como qualquer outro: pode ter sido editado à mão no `~/.lumem`,
    // ou escrito antes de o portão existir. Decidir depois de gravar seria
    // registrar `rejected` no WAL e mandar o segredo para o `HEAD` assim mesmo.
    const confidence = parseEntry(restored, path).provenance.confidence;
    const decision = decide({
      path,
      operation: "update",
      actor: "human",
      confidence,
      content: restored,
      // A chave carrega o ponto restaurado **e** o `HEAD` de onde se voltou:
      // desfazer duas vezes a partir do mesmo estado é a mesma decisão, e um
      // commit que falhou não faz o revert seguinte herdar a linha do anterior.
      idempotencyKey: `revert:${path}:${previousSha}:${head}`,
    });
    const record = recordDecision(this.db, {
      ...decision,
      path,
      operation: "update",
      actor: "human",
      confidence,
    });
    if (decision.outcome === "rejected") {
      throw new MemoryRejected(path, decision.reason ?? "recusada pelo portão");
    }

    // `decision.content`, nunca `restored`: é o texto que o portão aprovou.
    const entry = parseEntry(decision.content, path);
    await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
    await writeAtomically(absolute, Buffer.from(decision.content, "utf8"), 0o600);
    upsertEntry(this.db, path, entry, this.locationOf(entry, path), decision.content);
    indexEntry(this.db, path, entry.name, entry.description, slugOf(path, entry.type), entry.body);

    const { commit } = await this.commit([path], "update", path, "human");
    attachCommit(this.db, record.id, commit);
    return { path, outcome: "reverted", commit };
  }

  /**
   * Põe — ou tira — uma memória do **núcleo**, o texto que entra em toda sessão.
   *
   * Ato **seu**, e só seu. Um agente que pudesse se fixar no núcleo escolheria
   * sozinho o que todo turno seguinte carrega: o custo é recorrente e cobrado
   * de você, então a escolha é sua. É a mesma linha que o `forget` desenha.
   *
   * Escreve o arquivo, e não só a coluna: o Markdown é a fonte, e um `pinned`
   * que morasse no banco desapareceria no primeiro `reindex`. Vai ao portão pela
   * mesma razão que o `revert` vai — o conteúdo pode ter sido editado à mão
   * desde a última passagem, e o núcleo é justamente o texto que o agente lê.
   */
  async pin(requested: string, pinned: boolean, actor: MemoryActor = "human"): Promise<{
    path: string;
    pinned: boolean;
    commit: string | null;
    changed: boolean;
  }> {
    if (actor !== "human") {
      throw new DomainError("BLOCKED", `fixar memória no núcleo é sempre ação sua — ${actor} não fixa`);
    }
    const path = assertEntryPath(requested);
    const absolute = join(this.stateDir, path);
    const text = await readFile(absolute, "utf8").catch(() => null);
    if (text === null) throw new DomainError("NOT_FOUND", `${path} não existe`);

    const current = parseEntry(text, path);
    // Já está como se pediu: nem commit vazio, nem linha no WAL. É o mesmo
    // `noop` que o portão daria, decidido antes de escrever para não gastá-lo.
    if (current.pinned === pinned) {
      return { path, pinned, commit: null, changed: false };
    }

    const candidate = serializeEntry({ ...current, pinned });
    const decision = decide({
      path,
      operation: "update",
      actor,
      confidence: current.provenance.confidence,
      content: candidate,
      // A chave carrega o estado pedido: fixar duas vezes é a mesma decisão,
      // fixar e desfixar são duas.
      idempotencyKey: `pin:${path}:${pinned}`,
    });
    const record = recordDecision(this.db, {
      ...decision,
      path,
      operation: "update",
      actor,
      confidence: current.provenance.confidence,
    });
    if (decision.outcome === "rejected") {
      throw new MemoryRejected(path, decision.reason ?? "recusada pelo portão");
    }

    const entry = parseEntry(decision.content, path);
    await writeAtomically(absolute, Buffer.from(decision.content, "utf8"), 0o600);
    upsertEntry(this.db, path, entry, this.locationOf(entry, path), decision.content);
    indexEntry(this.db, path, entry.name, entry.description, slugOf(path, entry.type), entry.body);

    const { commit } = await this.commit([path], "update", path, actor);
    attachCommit(this.db, record.id, commit);
    return { path, pinned: entry.pinned, commit, changed: true };
  }

  /** As decisões — inclusive as que **não** viraram arquivo. */
  decisions(query: DecisionQuery = {}): MemoryDecisionRow[] {
    return listDecisions(this.db, query);
  }

  /** A inbox: o que os agentes querem ensinar ao workspace. */
  proposals(query: ProposalQuery = {}): MemoryProposalRow[] {
    return listProposals(this.db, query);
  }

  /**
   * Aprova uma proposta — com edição, se você quiser.
   *
   * A escrita resultante é **sua**: o ator vira `human`, porque quem revisou e
   * mandou gravar foi você. A origem continua registrada na proposta, que fica
   * como `approved` em vez de sumir.
   */
  async approveProposal(
    id: string,
    edits: { name?: string; description?: string; body?: string } = {},
  ): Promise<WriteMemoryResult> {
    const proposal = findProposal(this.db, id);
    const result = await this.write({
      name: edits.name ?? proposal.name,
      description: edits.description ?? proposal.description,
      body: edits.body ?? proposal.body,
      type: proposal.type as MemoryType,
      scope: proposal.scope as MemoryScope,
      ...(proposal.workspaceId ? { workspaceId: proposal.workspaceId } : {}),
      ...(proposal.projectId ? { projectId: proposal.projectId } : {}),
      actor: "human",
      confidence: proposal.confidence as "low" | "medium" | "high",
      ...(proposal.evidence ? { evidence: proposal.evidence } : {}),
      // A escrita é sua, a origem é dela: quem propôs, de qual sessão, e por
      // qual proposta ficam no arquivo — o `path` sozinho não distingue duas
      // propostas do mesmo alvo.
      proposedBy: proposal.actor as MemoryActor,
      proposalId: proposal.id,
      ...(proposal.sessionId === null ? {} : { sourceSessions: [proposal.sessionId] }),
      // Já é a revisão: não pode virar proposta de novo.
      proposal: false,
    });
    resolveProposal(this.db, id, "approved");
    return result;
  }

  /** Rejeita. A proposta fica visível — recusar é histórico, não apagamento. */
  rejectProposal(id: string, note?: string): MemoryProposalRow {
    return resolveProposal(this.db, id, "rejected", note);
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
    resetIndex(this.db);
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

  /**
   * Busca lexical e explicável. **Não registra** a não ser que peçam.
   *
   * Registrar é escrever, e buscar é ler: quem liga o `record` é o caminho do
   * agente, não a tela que remonta nem o retry que repete.
   */
  search(query: string, options: RecallOptions = {}): RecallResult {
    return recall(this.db, query, options);
  }

  /** Os números do §6 do context-delivery. */
  usageSummary(): UsageSummary[] {
    return summarizeUsage(this.db);
  }

  /**
   * Registra um uso que não passou pela busca — leitura, escrita, injeção.
   *
   * O `sessionId` é o que separa "quantas chamadas" de "quantas chamadas **por
   * sessão**", que é a medida que o §6 do context-delivery pede. Quem monta o
   * contexto passa a sessão aqui quando registra o `inject`.
   */
  recordUsage(
    kind: "read" | "write" | "inject",
    amount: number,
    durationMs = 0,
    options: UsageOptions = {},
  ): void {
    usage(this.db, kind, amount, durationMs, options);
  }

  /**
   * Reconstrói o índice quando ele está atrasado em relação ao catálogo.
   *
   * Chamada no boot. O índice FTS5 é derivado e nasce fora das migrations, então
   * um banco com catálogo e sem índice existe — toda instalação anterior a esta
   * feature. Sem isto, a primeira busca acharia o índice vazio e responderia
   * "nada encontrado" para o acervo inteiro, sem erro e sem sinal.
   */
  async ensureIndexFresh(): Promise<{
    rebuilt: boolean;
    indexed: number;
    failures: ReindexResult["failures"];
  }> {
    if (!indexIsStale(this.db)) return { rebuilt: false, indexed: 0, failures: [] };
    const result = await this.reindex();
    // As falhas sobem: o `reindex` **substitui** o catálogo, então memória que
    // não pôde ser lida some da lista e da busca. Engolir isso num boot de
    // upgrade seria memória desaparecendo sem uma linha de log.
    if (result.failures.length > 0) {
      this.log?.warn({ failures: result.failures }, "memórias ilegíveis no reindex de boot");
    }
    return { rebuilt: true, indexed: result.indexed, failures: result.failures };
  }

  /** O hash que o catálogo guarda, exposto para quem precisa comparar sem reler. */
  static hash(text: string): string {
    return hashContent(text);
  }

  /**
   * A decisão que registra um apagamento, **antes** de o arquivo sair da árvore.
   *
   * A Q29 promete que apagar é sempre reversível pelo WAL, e a Q37 lista
   * `delete` entre os resultados. Sem esta linha, deleção só existiria no git —
   * que sabe *que* o arquivo sumiu, nunca *quem pediu*.
   *
   * A chave carrega o `HEAD` do momento: apagar o mesmo caminho de novo, depois
   * de ele voltar, é outra decisão.
   */
  private async recordDeletion(path: string, actor: string): Promise<MemoryDecisionRow> {
    const head = await this.head();
    const decision = decide({
      path,
      operation: "delete",
      actor,
      // Apagar só acontece a pedido direto (Q29): a confiança é no ato, e o ato
      // é explícito.
      confidence: "high",
      content: "",
      idempotencyKey: `delete:${path}:${head}`,
    });
    return recordDecision(this.db, {
      ...decision,
      path,
      operation: "delete",
      actor,
      confidence: "high",
    });
  }

  /** O `HEAD` do `~/.lumem`, ou vazio quando ainda não há commit nenhum. */
  private async head(): Promise<string> {
    return this.git(["rev-parse", "HEAD"])
      .then((stdout) => stdout.trim())
      .catch(() => "");
  }

  /**
   * Git sobre o `~/.lumem`, sempre **literal**.
   *
   * `log -- <path>` e `show <sha>:<path>` recebem caminho vindo do cliente, e
   * pathspec não é nome: sem isto, um `*` no lugar do id casa a memória de outro
   * workspace. A forma do caminho já barra o glob (`assertEntryPath`); as duas
   * guardas existem porque a de forma protege esta chamada e a de interpretação
   * protege a próxima que alguém escrever.
   */
  private async git(args: readonly string[]): Promise<string> {
    const exec = this.exec ?? execGit;
    const { stdout } = await exec(["--literal-pathspecs", ...args], { cwd: this.stateDir });
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
    ids: { workspaceId?: string | undefined; projectId?: string | undefined },
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

/** Valida na fronteira do núcleo, com o erro de domínio que as duas superfícies traduzem igual. */
function parseWrite(requested: WriteMemoryInput): ValidatedWrite {
  const result = writeMemorySchema.safeParse(requested);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.join(".") ?? "?";
  throw new DomainError("INVALID_ARGUMENT", `${field} — ${issue?.message ?? "inválido"}`);
}
