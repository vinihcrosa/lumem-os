import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * The daemon's state, as PRD §6 describes it.
 *
 * Two rules are enforced here rather than in application code, on purpose:
 *
 * - Every foreign key is ON DELETE RESTRICT. No delete here reaches a row the
 *   caller did not name, and a rule that lives only in a procedure is a rule the
 *   next procedure forgets. Where a cascade *is* the decision — removing a
 *   project takes its worktrees' registrations (F2.5, WS-Q22) — it is written as
 *   the order of two deletes inside one transaction, which satisfies the
 *   constraint instead of loosening it.
 * - `state` and `kind` are CHECK constraints, not conventions. A typo in an
 *   UPDATE would otherwise produce a row no reader knows how to interpret.
 *
 * Foreign keys only bite when `PRAGMA foreign_keys = ON`, which SQLite leaves
 * OFF by default. See `db/index.ts`.
 */

/** Milliseconds since the epoch, defaulted by SQLite so no writer can forget. */
const NOW = sql`(unixepoch('subsec') * 1000)`;

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(NOW),
};

export const workspace = sqliteTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    /**
     * O modo do Lumem que uma sessão nova deste workspace herda (`session-mode`, Q5).
     *
     * Sem `'free'` no CHECK, e isso é a decisão inteira em uma linha: o portão do
     * `liberado` é **por sessão**, e um padrão que o atravessasse sozinho o
     * anularia. Recusar na ESCRITA, e não silenciar na leitura — silenciar é o
     * modo de falha que ninguém percebe.
     */
    defaultLumemMode: text("default_lumem_mode").notNull().default("ask"),
    /**
     * Os três tetos do workspace (`028` §6, Parte 3 — T14).
     *
     * **`NULL` é *sem teto*, e `0` é *bloqueia tudo*.** São coisas diferentes e
     * as duas são escrevíveis de propósito: um workspace que nunca pediu teto
     * não pode ganhar um na migração — o §6 da PRD já diz que os interruptores
     * que gastam token nascem desligados —, e quem quer parar tudo por um
     * momento tem como dizer isso sem apagar o número que configurou.
     *
     * Um único `DEFAULT NULL` é o que faz a migração não mudar o comportamento
     * de ninguém. Um teto que nasce valendo transformaria o produto de todo
     * mundo num produto que recusa trabalho.
     *
     * **Duas unidades, e não uma** (T13): dinheiro só é cobrável contra um
     * adaptador que o relata, e a fase 0 da `021` mediu o Codex atravessando um
     * turno inteiro com `cost: null`. Token e turno chegam sempre — no evento
     * `usage`, `used` e `size` são obrigatórios e só `cost` é `nullish`. Um
     * produto que só soubesse cobrar em dólar deixaria um workspace com Codex
     * rodando **sem teto nenhum**, sem nada na tela dizendo isso.
     */
    budgetCostPerTask: real("budget_cost_per_task"),
    budgetCostPerDay: real("budget_cost_per_day"),
    /** O chão que todo adaptador informa, e o único que não depende de moeda. */
    budgetTurnsPerSession: integer("budget_turns_per_session"),
    /**
     * O interruptor da esteira (`028` §6, Parte 2 — T29).
     *
     * **Nasce em `manual`**, que é o Lumem de hoje e o default do produto — um
     * `~/.lumem` que atravessa a migração continua não andando sozinho. O
     * `assistido` é o degrau que torna a feature adotável: ele prepara tudo e
     * **para antes de enviar**, e a
     * [Q51](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
     * decidiu que *preparar* não inclui subir o adaptador.
     */
    autonomy: text("autonomy").notNull().default("manual"),
    /**
     * Quantas de uma vez (`028` Parte 2, T25 · Q52).
     *
     * **`NOT NULL`, ao contrário dos três tetos acima**, e a diferença é a
     * decisão: `NULL` lá quer dizer *sem teto*, e uma fila sem teto de
     * paralelismo é como se gasta tudo num minuto. `0` continua querendo dizer
     * *bloqueia tudo* — o mesmo vocabulário da Parte 3 —, o que dá um jeito de
     * pausar a esteira sem desligar a autonomia de cada tarefa.
     *
     * O default é **2**, que é o número que a folha do Open Design já desenha.
     */
    autonomyMaxParallel: integer("autonomy_max_parallel").notNull().default(2),
    ...timestamps,
  },
  (table) => [
    check("workspace_default_lumem_mode", sql`${table.defaultLumemMode} IN ('ask', 'auto')`),
    check("workspace_autonomy", sql`${table.autonomy} IN ('manual', 'assistido', 'autonomo')`),
    // Sem acento na coluna e sem acento no CHECK: o valor é dado, e dado do
    // Lumem é inglês-ou-ascii pela convenção do repositório. Quem traduz é a
    // tela, que já traduz `manual` para a mesma palavra por coincidência.
    check("workspace_autonomy_max_parallel", sql`${table.autonomyMaxParallel} >= 0`),
    // Negativo não é "sem teto" — `NULL` é. Um número negativo aqui seria um
    // teto que nunca passa escrito de um jeito que ninguém lê como isso.
    check(
      "workspace_budget_not_negative",
      sql`(${table.budgetCostPerTask} IS NULL OR ${table.budgetCostPerTask} >= 0)
        AND (${table.budgetCostPerDay} IS NULL OR ${table.budgetCostPerDay} >= 0)
        AND (${table.budgetTurnsPerSession} IS NULL OR ${table.budgetTurnsPerSession} >= 0)`,
    ),
  ],
);

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Absolute path to the repository root. Unique across every workspace. */
    path: text("path").notNull().unique(),
    /** Resolved once, when the project is added. */
    defaultBranch: text("default_branch").notNull(),
    /**
     * Where it was cloned from, sanitized — never with a credential, F6.8.
     *
     * Null means "registered by path, with no known origin". It is the first
     * piece of data Q291 (stable project identity) needs in order to be
     * discussed at all, and what any future `fetch` will read.
     */
    remoteUrl: text("remote_url"),
    /**
     * The Lumem wrote these bytes, into a directory the Lumem chose.
     *
     * A column and not a deduction from `remote_url != null` or from the path's
     * prefix: `project.remove` deletes the directory when this is true (F6.9),
     * and a deduction fails silently the first time somebody moves something —
     * where the failure is deleting somebody else's repository.
     */
    managed: integer("managed", { mode: "boolean" }).notNull().default(false),
    /**
     * A assinatura do `[scripts]` que você já leu e aceitou rodar (S11).
     *
     * Um projeto clonado de uma URL traz comandos de alguém, e depois da
     * `project-from-url` "colei uma URL para dar uma olhada" não pode significar
     * execução arbitrária. Então o `[scripts]` de um projeto **gerenciado** nasce
     * não confiado, e a primeira execução mostra o comando antes de rodar.
     *
     * Um hash e não um booleano: confiança é sobre **este** comando. Um `[scripts]`
     * que muda depois de aprovado — porque você deu `git pull` — volta a perguntar,
     * que é o único jeito de a aprovação querer dizer alguma coisa.
     */
    scriptsTrustedHash: text("scripts_trusted_hash"),
    ...timestamps,
  },
  (table) => [uniqueIndex("project_name_per_workspace").on(table.workspaceId, table.name)],
);

export const worktree = sqliteTable(
  "worktree",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    branch: text("branch").notNull(),
    /** Absolute, and outside the project's own path. */
    path: text("path").notNull(),
    state: text("state").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("worktree_name_per_project").on(table.projectId, table.name),
    check("worktree_state", sql`${table.state} IN ('active', 'missing')`),
  ],
);

export const agentConfig = sqliteTable(
  "agent_config",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    command: text("command").notNull(),
    /** JSON array. SQLite has no list type and a join table would buy nothing. */
    args: text("args", { mode: "json" }).notNull().$type<string[]>().default([]),
    /** JSON object of extra environment variables. */
    env: text("env", { mode: "json" }).notNull().$type<Record<string, string>>().default({}),
    /**
     * How the daemon talks to this agent.
     *
     * Defaults to `pty` so that migrating an existing row changes nothing about
     * how it behaves (A11): every configuration that already worked was a PTY
     * configuration, and a default of `acp` would silently re-point it at a
     * transport it was never tested on.
     */
    transport: text("transport").notNull().default("pty"),
    /**
     * The ACP adapter version, pinned.
     *
     * Never `@latest` (A12, F5.5). The adapter publishes almost daily, and one
     * that changes underneath a running session is the definition of an
     * invisible failure — so the version is data, and updating it is an act.
     */
    adapterVersion: text("adapter_version"),
    ...timestamps,
  },
  (table) => [
    check("agent_config_transport", sql`${table.transport} IN ('pty', 'acp')`),
    // Both directions. An ACP row with no version cannot be launched
    // reproducibly; a PTY row with one makes a claim about something it never
    // runs, and the next reader has no way to tell that it is noise.
    check(
      "agent_config_adapter_version",
      sql`(${table.transport} = 'acp' AND ${table.adapterVersion} IS NOT NULL)
        OR (${table.transport} = 'pty' AND ${table.adapterVersion} IS NULL)`,
    ),
  ],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    /**
     * Qual script esta sessão é — `setup`, `run` ou `teardown`.
     *
     * Coluna, e não dedução do `command`, porque a pergunta do rodapé é *"tem run
     * vivo neste checkout?"* e procurar por string de comando responderia errado no
     * dia em que dois projetos rodam o mesmo `pnpm dev`. Nula para tudo que não é
     * script, e obrigatória para o que é — o CHECK cobra os dois sentidos.
     */
    scriptName: text("script_name"),
    agentConfigId: text("agent_config_id").references(() => agentConfig.id, {
      onDelete: "restrict",
    }),
    scopeType: text("scope_type").notNull(),
    /**
     * A project id or a worktree id, depending on `scope_type`.
     *
     * No foreign key is possible on a polymorphic column, so "no session
     * orphaned from its scope" is enforced by the session router instead.
     */
    scopeId: text("scope_id").notNull(),
    cwd: text("cwd").notNull(),
    /** What was actually launched, so the detail view never has to guess. */
    command: text("command").notNull(),
    state: text("state").notNull().default("running"),
    exitCode: integer("exit_code"),
    /**
     * What this session *is*, not what its configuration currently asks for.
     *
     * Denormalised from `agent_config` on purpose (D1): transport is chosen when
     * the session is born and never changes, and boot reconciliation has to know
     * which manager owns a row without going back to a configuration that may
     * have been edited since.
     */
    transport: text("transport").notNull().default("pty"),
    /** The adapter's own session id. Only an ACP session has one. */
    acpSessionId: text("acp_session_id"),
    /** Current permission mode and model, as the protocol reports them. */
    mode: text("mode"),
    model: text("model"),
    /**
     * A política do Lumem desta conversa (`session-mode`, F1.4).
     *
     * Coluna própria, e **não** reaproveitamento do `mode` acima: aquele é o modo
     * do protocolo, relatado pelo agente, e este é o que o daemon responde a um
     * pedido de permissão. Guardar os dois no mesmo lugar seria perder a única
     * informação que separa "o agente tentou" de "o Lumem deixou passar".
     *
     * `NOT NULL DEFAULT 'ask'` faz toda sessão gravada antes desta feature
     * acordar perguntando — nenhuma acorda liberada.
     */
    lumemMode: text("lumem_mode").notNull().default("ask"),
    /**
     * The session this one continues (F5.2, D12).
     *
     * `session/load` does not resurrect yesterday's process: it starts a new adapter
     * and tells it which conversation to load. So resuming produces a *new* row that
     * carries the old one's `acp_session_id` and points back at it — the conversation
     * continues, and the session that died stays dead with its transcript intact.
     *
     * No foreign key, deliberately. This is provenance, not a dependency: deleting
     * yesterday's session should not be blocked by the fact that today's continues
     * it, and `ON DELETE RESTRICT` — the only cascade rule this schema allows — would
     * do exactly that to a purge. The invariant that a resumed session is an ACP one
     * lives in the session store, which is also the only thing that can write this.
     */
    resumedFromId: text("resumed_from_id"),
    /**
     * A tarefa que esta sessão serve (workspace-tasks §3.1).
     *
     * Nula, e `ON DELETE SET NULL`: **uma sessão pertence a no máximo uma
     * tarefa**, e uma tarefa tem N sessões. Vale para os três `kind` — se você
     * subiu a aplicação numa `shell` para conferir o que o agente fez, aquilo
     * foi trabalho desta tarefa, e o custo dela tem que contar.
     *
     * É a única coluna deste schema com `SET NULL`, e a exceção se paga: a
     * sessão sobrevive à tarefa como já sobrevive à worktree, e sem ela um
     * `task.remove` ficaria preso a um histórico que ninguém quer preservar por
     * causa do ponteiro.
     */
    // A referência é preguiçosa porque `task` é declarada depois — `session`
    // veio antes dela por três features.
    taskId: text("task_id").references((): AnySQLiteColumn => task.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check("session_kind", sql`${table.kind} IN ('shell', 'agent', 'script')`),
    check("session_scope_type", sql`${table.scopeType} IN ('project', 'worktree')`),
    check("session_state", sql`${table.state} IN ('running', 'exited')`),
    // Both directions: an agent session without a config cannot be relaunched
    // or explained, and a shell pointing at one is a lie about what it runs.
    check(
      "session_agent_config",
      sql`(${table.kind} = 'agent' AND ${table.agentConfigId} IS NOT NULL)
        OR (${table.kind} <> 'agent' AND ${table.agentConfigId} IS NULL)`,
    ),
    // Os dois sentidos, como o `session_agent_config`: script sem nome de fase é
    // sessão que o rodapé não sabe em qual aba mostrar, e nome de fase numa shell
    // é uma sessão mentindo sobre quem escolheu o comando dela.
    //
    // O `IS NOT NULL` explícito não é redundante, e o teste que o exigiu está no
    // `db.test.ts`: `NULL IN ('setup', …)` avalia para NULL, e um CHECK só recusa
    // quando avalia para FALSE. Sem ele, `kind='script'` com fase nula passava —
    // exatamente a linha que este CHECK existe para impedir.
    check(
      "session_script_name",
      sql`(${table.kind} = 'script' AND ${table.scriptName} IS NOT NULL
          AND ${table.scriptName} IN ('setup', 'run', 'teardown', 'test'))
        OR (${table.kind} <> 'script' AND ${table.scriptName} IS NULL)`,
    ),
    // A running process cannot have an exit code, and an exited one must.
    check(
      "session_exit_code",
      sql`(${table.state} = 'running' AND ${table.exitCode} IS NULL)
        OR (${table.state} = 'exited')`,
    ),
    check("session_transport", sql`${table.transport} IN ('pty', 'acp')`),
    // A shell is always a PTY (F1.2). There is no conversation to have with one,
    // and letting the column say otherwise would put a shell in front of the
    // conversation renderer.
    check("session_shell_transport", sql`${table.kind} = 'agent' OR ${table.transport} = 'pty'`),
    // Both directions again: an ACP session without the adapter's id cannot be
    // reconciled after a restart, and a PTY session carrying one is claiming a
    // conversation that does not exist.
    check(
      "session_acp_id",
      sql`(${table.transport} = 'acp' AND ${table.acpSessionId} IS NOT NULL)
        OR (${table.transport} = 'pty' AND ${table.acpSessionId} IS NULL)`,
    ),
    // Os três valores da política, e o `free` entra aqui — o que o workspace não
    // pode é *herdar* liberado; uma sessão pode chegar lá pelo portão.
    check("session_lumem_mode", sql`${table.lumemMode} IN ('ask', 'auto', 'free')`),
  ],
);

/**
 * A porta que cada checkout ganha para rodar (project-scripts S5).
 *
 * Sem isto, duas worktrees do mesmo projeto sobem na mesma porta e a segunda morre
 * com um erro que ninguém lê — que é exatamente o cenário que o Lumem existe para
 * não ter. O precedente é o `CONDUCTOR_PORT`, que o `scripts/workspace/env.sh` deste
 * repositório já lê.
 *
 * **Gravada, e não sorteada a cada run**: o valor entra em `.env`, em configuração
 * de proxy e na barra do navegador de quem está trabalhando. Porta que muda a cada
 * start é porta que não serve para nada disso.
 *
 * Sem foreign key, pelo mesmo motivo de `session.scope_id`: a coluna é polimórfica
 * — projeto ou worktree. Quem apaga o checkout apaga a reserva.
 */
export const checkoutPort = sqliteTable(
  "checkout_port",
  {
    id: text("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    /** A primeira porta do bloco. O bloco inteiro é dela até `base + tamanho - 1`. */
    port: integer("port").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("checkout_port_scope").on(table.scopeType, table.scopeId),
    // Duas reservas na mesma porta seriam duas aplicações brigando por ela — o
    // problema que a tabela existe para resolver, reintroduzido pela tabela.
    uniqueIndex("checkout_port_port").on(table.port),
    check("checkout_port_scope_type", sql`${table.scopeType} IN ('project', 'worktree')`),
    check("checkout_port_range", sql`${table.port} > 0 AND ${table.port} < 65536`),
  ],
);

/**
 * O catálogo de memórias — **projeção**, não fonte da verdade.
 *
 * A Q3 decidiu que Markdown no `~/.lumem` é a fonte; esta tabela existe para
 * responder rápido "o que existe" e, mais tarde, para o índice FTS5 da PR 04.
 * Apagar este banco e rodar `reindex` tem que devolver exatamente o mesmo
 * conteúdo — é o `Done when` da T5, e a razão de nada de domínio nascer aqui.
 *
 * Sem foreign key para `workspace` e `project` de propósito: o id de projeto
 * vem do `project.toml` do repositório (Q3.1) e pode existir antes de a linha
 * existir no banco. Uma FK aqui recusaria memória de um projeto que o daemon
 * ainda não registrou — e a fonte da verdade está no disco de qualquer forma.
 */
export const memoryEntry = sqliteTable(
  "memory_entry",
  {
    id: text("id").primaryKey(),
    /** Caminho relativo ao state dir, com barra. É o que o git também usa. */
    path: text("path").notNull().unique(),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    /** A segunda metade da identidade `(tipo, slug)` da Q12. */
    slug: text("slug").notNull(),
    /**
     * `''` quando o escopo não tem workspace — nunca NULL.
     *
     * O vazio é sentinela deliberada, e a razão está no índice de identidade
     * abaixo: no SQLite NULL nunca colide com NULL, então uma coluna nula aqui
     * desligaria a unicidade de `(tipo, slug)` em todo escopo que não seja
     * `project`. Quem lê estas colunas trata `''` como "não se aplica".
     */
    workspaceId: text("workspace_id").notNull().default(""),
    /** `''` fora do escopo `project` — mesmo motivo de `workspace_id`. */
    projectId: text("project_id").notNull().default(""),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Do frontmatter, para responder "por que esta memória existe" sem abrir o arquivo. */
    sourceActor: text("source_actor").notNull(),
    confidence: text("confidence").notNull(),
    /** sha256 do arquivo inteiro, para comparar conteúdo sem reler o disco. */
    /**
     * Projeção do `pinned` do frontmatter — o núcleo, em forma de consulta.
     *
     * Existe como coluna para uma pergunta só: montar o núcleo é filtrar por
     * escopo mais `pinned`, e ler os arquivos todos para descobrir isso seria
     * pagar o acervo inteiro em cada primeiro turno.
     */
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "memory_entry_type",
      sql`${table.type} IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')`,
    ),
    check("memory_entry_scope", sql`${table.scope} IN ('global', 'workspace', 'project')`),
    // A identidade da Q12 é única dentro do escopo em que ela vale.
    //
    // Só funciona porque `workspace_id` e `project_id` são `''` — e não NULL —
    // fora do escopo em que valem: no SQLite **NULL não colide com NULL**, e
    // com colunas nulas esta unicidade valeria apenas no escopo `project`.
    uniqueIndex("memory_entry_identity").on(
      table.scope,
      table.workspaceId,
      table.projectId,
      table.type,
      table.slug,
    ),
  ],
);

/**
 * O WAL de decisões de memória — **magro**, como a Q37 decidiu.
 *
 * Com o `~/.lumem` versionado por git (Q36), o conteúdo anterior é o commit
 * anterior: guardar `prior_content` aqui seria manter dois históricos do mesmo
 * texto. O que esta tabela guarda é a **decisão** — origem, regra que bateu,
 * confiança, idempotência, resultado — e o SHA que ela produziu.
 *
 * E guarda o que o git não tem como guardar: **rejeição e no-op**. Escrita
 * barrada pelo scan nunca vira arquivo, então ela só existe aqui — e é
 * exatamente o que se pergunta depois ("por que isso não foi salvo?").
 */
export const memoryDecision = sqliteTable(
  "memory_decision",
  {
    id: text("id").primaryKey(),
    /** Repetir a mesma decisão é no-op, e é o que torna o replay seguro. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Caminho relativo ao state dir. Presente mesmo em rejeição: é o alvo pretendido. */
    path: text("path").notNull(),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    /** Quem pediu: `human`, `agent`, `distiller`, `auto_research`, `import`. */
    actor: text("actor").notNull(),
    confidence: text("confidence").notNull(),
    /** sha256 do conteúdo candidato — dedupe sem guardar o conteúdo. */
    candidateHash: text("candidate_hash").notNull(),
    /** As regras que o scan achou, por nome. Nunca o texto que casou. */
    ruleTrace: text("rule_trace", { mode: "json" }).notNull().$type<string[]>().default([]),
    /**
     * As sessões que originaram o pedido — a "sessão" que a Q37 pede no WAL.
     *
     * Vazio quando a origem é humana e direta. É o que liga a decisão à conversa
     * em que ela nasceu, e sem isso "de onde veio isso?" não tem resposta.
     */
    sourceSessions: text("source_sessions", { mode: "json" }).notNull().$type<string[]>().default([]),
    /** Por que não foi aplicada, quando não foi. */
    reason: text("reason"),
    /** O commit no `~/.lumem`. Nulo quando não houve escrita, ou quando o git falhou. */
    commitSha: text("commit_sha"),
    ...timestamps,
  },
  (table) => [
    check("memory_decision_operation", sql`${table.operation} IN ('add', 'update', 'delete')`),
    check(
      "memory_decision_outcome",
      sql`${table.outcome} IN ('applied', 'noop', 'rejected')`,
    ),
  ],
);

/** O maior caminho que um checkout produz, com folga. Acima disso não é alvo. */
export const MAX_SIGNAL_TARGET_LENGTH = 1_024;

/**
 * O sinal de ação — o único insumo que **não depende de cooperação** (Q17).
 *
 * Compozy e Hermes extraem do que foi **dito**. Isto registra o que foi
 * **feito**: você editou por cima do que o agente escreveu, reverteu o commit
 * dele, descartou a worktree, matou a sessão em trinta segundos. É o sinal mais
 * barato que existe, e nenhuma das quatro referências usa.
 *
 * A regra de privacidade da Q18 está no schema, não num comentário: **só evento
 * estrutural**. Há `target` (o quê) e `detail` (um número), e não existe coluna
 * de conteúdo.
 *
 * Não existir coluna não bastava. A afinidade INTEGER do SQLite guarda texto
 * não numérico como TEXT, então `detail` aceitava frase; e `target` era TEXT
 * sem limite, onde cabia um arquivo inteiro. Os dois `CHECK` abaixo são o que
 * torna a regra estrutural em vez de disciplina de quem chama: `detail` só
 * aceita inteiro, e `target` só aceita um identificador de uma linha — caminho,
 * SHA ou id — nunca prosa.
 */
export const actionSignal = sqliteTable(
  "action_signal",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    /** O alvo: caminho de arquivo, id de sessão, id de worktree. */
    target: text("target").notNull(),
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    worktreeId: text("worktree_id"),
    sessionId: text("session_id"),
    /** Um número que qualifica — linhas trocadas, segundos de vida. Nunca texto do usuário. */
    detail: integer("detail"),
    ...timestamps,
  },
  (table) => [
    check(
      "action_signal_kind",
      sql`${table.kind} IN (
        'user_edited_after_agent',
        'user_reverted_agent_commit',
        'worktree_discarded',
        'session_killed_early'
      )`,
    ),
    // Um número, e o banco é quem cobra. Sem isto, "12 linhas trocadas" e
    // "TODO: pedir aumento" entram pela mesma coluna.
    check(
      "action_signal_detail_number",
      sql`${table.detail} IS NULL OR typeof(${table.detail}) = 'integer'`,
    ),
    // Um identificador: caminho de arquivo, SHA ou id. O limite e a proibição
    // de quebra de linha são o que separa isso de um trecho de texto.
    check(
      "action_signal_target_shape",
      sql`length(${table.target}) BETWEEN 1 AND ${sql.raw(String(MAX_SIGNAL_TARGET_LENGTH))}
        AND instr(${table.target}, char(10)) = 0`,
    ),
  ],
);

/**
 * O registro de acesso cross-projeto (D8).
 *
 * Guarda **os dois** casos: o que foi permitido responde "o que foi lido"; o que
 * foi negado responde "o que alguém tentou ler" — e é essa a pergunta que
 * importa quando algo dá errado.
 */
export const memoryAccess = sqliteTable(
  "memory_access",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    /** Quem pediu — o projeto da sessão. */
    fromProjectId: text("from_project_id"),
    /** O que ele quis alcançar. */
    targetProjectId: text("target_project_id"),
    kind: text("kind").notNull(),
    /** O alvo pedido: identidade de memória, ou caminho de arquivo. */
    target: text("target").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    actor: text("actor").notNull(),
    ...timestamps,
  },
  (table) => [
    check("memory_access_kind", sql`${table.kind} IN ('memory', 'repository')`),
    check("memory_access_decision", sql`${table.decision} IN ('allowed', 'denied')`),
  ],
);

/**
 * O sinal de uso (Q25) — o insumo objetivo de toda poda e consolidação futura.
 *
 * O Compozy promove só o que o recall já validou: *memória nunca recuperada
 * nunca é promovida*. Sem estes contadores, consolidar vira o LLM chutando o
 * que é importante — e é a diferença entre um sistema que aprende o que usa e
 * um que acumula o que gerou.
 */
export const memorySignal = sqliteTable("memory_signal", {
  /** O caminho é a chave: ele já é único no catálogo, e sobrevive ao reindex. */
  path: text("path").primaryKey(),
  recallCount: integer("recall_count").notNull().default(0),
  lastRecalledAt: integer("last_recalled_at", { mode: "timestamp_ms" }),
  /**
   * O melhor **bm25 cru** que esta memória já teve numa busca.
   *
   * Cru, e não o score do ranking: aquele é normalizado contra os candidatos da
   * busca, então resultado único sempre tira o teto e o número deixaria de
   * discriminar exatamente onde a poda precisa dele.
   */
  bestScore: real("best_score").notNull().default(0),
  ...timestamps,
});

/**
 * A instrumentação do §6 do context-delivery.
 *
 * O número que mais importa é "quantas vezes o agente perguntou": perto de zero
 * significa que a camada 3 é decoração, e que o desenho precisa mudar. Medir é
 * o que separa decidir com dado de decidir com fé.
 */
export const memoryUsage = sqliteTable("memory_usage", {
  id: text("id").primaryKey(),
  /** `recall`, `read`, `write`, `inject` — o que foi feito. */
  kind: text("kind").notNull(),
  /** A sessão que originou, quando houver. */
  sessionId: text("session_id"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  /** Quantos resultados a busca devolveu, ou quantos caracteres foram injetados. */
  amount: integer("amount").notNull().default(0),
  /** Quanto tempo custou, em milissegundos. */
  durationMs: integer("duration_ms").notNull().default(0),
  ...timestamps,
});

/**
 * O que cada turno consumiu (`workspace-screen`, W4).
 *
 * O `usage_update` do ACP sempre existiu como **evento**: ele chega, a aba que o
 * gastou mostra janela, cache e custo, e some quando ela fecha. Isso responde
 * "quanto custou este turno" e não responde nada sobre projeto, semana ou mês.
 *
 * Duas decisões estão dentro das colunas, e as duas vêm de como o dado é:
 *
 * - **`tokens` é delta, não ocupação.** O `used` do protocolo é a ocupação da
 *   janela de contexto, acumulada na sessão: somar `used` entre turnos conta o
 *   mesmo token tantas vezes quantos turnos houver. O que se soma é a variação.
 *   `cost` não tem esse problema — ele já é por turno.
 * - **`projectId` e `worktreeId` são resolvidos na escrita.** `session.scope_id`
 *   é polimórfico e por isso não tem chave estrangeira; agregar por escopo depois
 *   exigiria um join que o schema não permite expressar. Resolver uma vez, ao
 *   gravar, troca esse join por um `GROUP BY`.
 *
 * Sem chave estrangeira para a sessão, e de propósito: consumo é **histórico**.
 * Apagar a sessão de ontem não pode apagar o que ela gastou, nem ser barrado por
 * isso — é a mesma razão do `resumed_from_id` não ter uma.
 */
export const sessionUsage = sqliteTable(
  "session_usage",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    /** Quem paga a conta. Resolvido na escrita, nunca por join depois. */
    projectId: text("project_id").notNull(),
    /** A worktree, quando a sessão rodou numa. `''` quando ela é do projeto. */
    worktreeId: text("worktree_id").notNull().default(""),
    /**
     * Qual agente gastou (`second-agent`, F5).
     *
     * Resolvido na escrita, como o projeto e a worktree, e pela mesma razão: a
     * pergunta "quanto cada agente custou" não pode depender de um join com a
     * `session`, que é uma tabela que muda e de onde a linha pode sumir.
     *
     * Anulável, e sem chave estrangeira. Anulável porque a sessão de shell e a de
     * script não têm agente, e porque a linha gravada **antes** desta coluna não
     * ganha um agente inventado — ela fica de fora do agrupamento, o que é a
     * verdade. Sem estrangeira porque consumo é histórico: apagar a configuração
     * de ontem não pode apagar o que ela gastou.
     */
    agentConfigId: text("agent_config_id"),
    /** A variação da janela de contexto neste turno. Nunca negativa. */
    tokens: integer("tokens").notNull().default(0),
    /**
     * O custo do turno, na moeda que o agente reportou.
     *
     * `null` quando ele não reporta dinheiro — e a diferença entre `null` e `0`
     * importa: um agente que não informa custo não pode parecer grátis.
     */
    cost: real("cost"),
    currency: text("currency"),
    ...timestamps,
  },
  (table) => [
    check("session_usage_tokens", sql`${table.tokens} >= 0`),
    // As duas perguntas que a tela faz, e as duas ordenam por tempo.
    index("session_usage_project_at").on(table.projectId, table.createdAt),
    index("session_usage_worktree_at").on(table.worktreeId, table.createdAt),
  ],
);

/**
 * O playbook — procedimento, e **não** memória (§6 e §9 do PRD).
 *
 * Tabela própria porque a diferença não é de tipo, é de natureza: memória é fato
 * ou diretriz, e vale por si; playbook é procedimento, tem corpo, é carregado sob
 * demanda e **envelhece por uso**. Nada na memória tem ciclo de vida, e nada no
 * playbook precisa de precedência por escopo.
 *
 * Como no catálogo de memórias, a linha é **projeção**: a verdade é o
 * `PLAYBOOK.md` no `~/.lumem`, e esta tabela existe para as perguntas que arquivo
 * não responde — "quais estão parados", "qual foi carregado mais vezes".
 *
 * A telemetria mora aqui e não num sidecar em disco (o §9 dizia sidecar): dois
 * arquivos por playbook, um versionado e outro mudando a cada carregamento,
 * produziriam commit a cada uso — e o `~/.lumem` é um repositório git.
 */
export const playbook = sqliteTable(
  "playbook",
  {
    id: text("id").primaryKey(),
    /** Relativo ao `~/.lumem`, com barra. */
    path: text("path").notNull().unique(),
    scope: text("scope").notNull(),
    slug: text("slug").notNull(),
    workspaceId: text("workspace_id").notNull().default(""),
    projectId: text("project_id").notNull().default(""),
    /** A **classe de tarefa**: "investigar teste flaky", nunca "consertar o PR 412". */
    taskClass: text("task_class").notNull(),
    description: text("description").notNull(),
    /** Fixado por você: não envelhece. O opt-out ortogonal do §9. */
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Arquivado — **só por gesto seu**, nunca automático. */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    /** Quantas vezes foi carregado. Subcontagem aceita (Q16). */
    loads: integer("loads").notNull().default(0),
    lastLoadedAt: integer("last_loaded_at", { mode: "timestamp_ms" }),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    // Procedimento é de um repositório ou de um time. `global` seria "como eu
    // trabalho em qualquer lugar", e isso é `user` — memória, não playbook.
    check("playbook_scope", sql`${table.scope} IN ('workspace', 'project')`),
    uniqueIndex("playbook_identity").on(table.scope, table.workspaceId, table.projectId, table.slug),
  ],
);

/**
 * A inbox de propostas (Q27).
 *
 * Escrita de **workspace** feita por agente não vira memória: vira proposta.
 * É a assimetria que faz o workspace valer a pena sem deixar um agente
 * contaminar N projetos — leitura livre, escrita para cima revisada.
 *
 * A proposta guarda o **candidato inteiro**, e não um ponteiro: ela precisa
 * sobreviver a a memória de origem mudar, e precisa ser revisável sem que nada
 * tenha sido gravado ainda.
 */
export const memoryProposal = sqliteTable(
  "memory_proposal",
  {
    id: text("id").primaryKey(),
    /** Onde ela seria gravada, se aprovada. */
    path: text("path").notNull(),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    slug: text("slug").notNull(),
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    body: text("body").notNull().default(""),
    /** Quem propôs, e de onde. */
    actor: text("actor").notNull(),
    fromProjectId: text("from_project_id"),
    sessionId: text("session_id"),
    confidence: text("confidence").notNull(),
    /**
     * O que sustenta a proposta.
     *
     * A D7 decidiu o critério: resposta apoiada em artefato verificável vira
     * memória direta; **conclusão vira proposta**. Quando há evidência, ela vem
     * junto — e a tela mostra a diferença.
     */
    evidence: text("evidence"),
    status: text("status").notNull().default("pending"),
    /** Preenchido quando você decide. */
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolutionNote: text("resolution_note"),
    ...timestamps,
  },
  (table) => [
    check("memory_proposal_status", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    // Os mesmos CHECK do `memory_entry`: aprovar uma proposta faz
    // `proposal.type as MemoryType`, um cast que compila em silêncio sobre
    // qualquer string. O banco é o único lugar que consegue recusar a string
    // antes de ela chegar ao arquivo.
    check(
      "memory_proposal_type",
      sql`${table.type} IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')`,
    ),
    check("memory_proposal_scope", sql`${table.scope} IN ('global', 'workspace', 'project')`),
    check(
      "memory_proposal_actor",
      sql`${table.actor} IN ('human', 'agent', 'distiller', 'auto_research', 'import')`,
    ),
    check("memory_proposal_confidence", sql`${table.confidence} IN ('low', 'medium', 'high')`),
  ],
);

/**
 * Tarefa como entidade do workspace (`022-workspace-tasks` §3.1).
 *
 * O produto chamava de tarefa uma coisa que não existia: o nome da worktree era
 * o único rastro da intenção, e ele sumia com o checkout. Aqui ela tem corpo,
 * estado, proveniência e custo — e é o que a `028` precisa para ter o que
 * orquestrar.
 *
 * Três regras moram no banco porque em código elas seriam esquecidas:
 *
 * - **`project_id` é obrigatório** (T2). Tarefa sem projeto não tem onde virar
 *   worktree, e "escolha o projeto depois" é um estado a mais em toda tela.
 *   Tornar nulo depois é uma migração de uma linha; preencher o que nasceu nulo
 *   não volta.
 * - **`status` e `created_by` são CHECK**, como todo enum deste schema.
 * - **`worktree_id` é `ON DELETE SET NULL`**, e é uma das duas exceções à regra
 *   do RESTRICT neste arquivo. Remover a worktree **não** remove a tarefa: ela
 *   perde o checkout e **fica no estado em que estava**. Voltar para `open`
 *   apagaria o fato de que alguém trabalhou nela — e o custo, que continua
 *   somado, diria o contrário da coluna de estado.
 */
export const task = sqliteTable(
  "task",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    /**
     * Obrigatório (T2). O projeto pertence ao workspace — regra do repositório,
     * porque nenhum FK expressa "a coluna A e a coluna B concordam".
     *
     * RESTRICT, e a cascata é o que a WS-Q22 fez para as worktrees: a ordem de
     * dois deletes dentro de uma transação, que satisfaz a restrição em vez de
     * afrouxá-la.
     */
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    /** Markdown. Vazio é um corpo legítimo — nem toda tarefa precisa de um. */
    body: text("body").notNull().default(""),
    /**
     * As sete colunas do quadro (`028-autonomous-orchestration` §4), mais os
     * dois que não são coluna: `proposed` mora na fila de Propostas e `dropped`
     * sai do quadro e vira arquivo.
     *
     * **`backlog` e `open` são estados separados, e isso é a decisão desta
     * coluna.** As duas parecem "não começou", e colapsá-las apagaria a única
     * fronteira que o quadro tem: To-Do (`open`) é *onde mora a autorização* —
     * entrar na fila é consentimento —, e Backlog é *existe, ainda não é para
     * fazer*. Com um estado só, uma tarefa que o tracker despejou viraria
     * trabalho autorizado sem ninguém ter consentido.
     *
     * O default continua `open`: quem cria pela tela está dizendo que é para
     * fazer, e nenhuma tarefa escrita antes desta migração muda de coluna.
     */
    status: text("status").notNull().default("open"),
    createdBy: text("created_by").notNull().default("human"),
    /**
     * De qual sessão ela nasceu — e **sem foreign key**, de propósito.
     *
     * Isto é proveniência, não dependência, e o precedente é o
     * `session.resumed_from_id` logo acima: apagar a sessão de ontem não pode
     * ficar preso ao fato de que ela propôs uma tarefa. Com RESTRICT, todo
     * `session.remove` de uma sessão que já propôs alguma coisa falharia; com
     * SET NULL, a pergunta *"quem propôs isto?"* perderia a resposta no dia da
     * limpeza. Um id que ficou órfão ainda diz mais que uma coluna nula.
     *
     * A PRD §3.1 escreveu `FK session`; a nota de por que não está lá.
     */
    createdBySession: text("created_by_session"),
    worktreeId: text("worktree_id").references(() => worktree.id, { onDelete: "set null" }),
    /**
     * A prioridade, e ela é a posição na coluna (`028` §4.3).
     *
     * *"Se você quiser outra ordem, arrasta"* — e é por isso que não existe
     * campo de prioridade: arrastar é um gesto que o quadro já tem, e um campo
     * seria vocabulário novo para dizer a mesma coisa pior. Uma coluna guardada,
     * e não derivada, porque **derivada não se arrasta**: o `STATUS_RANK` da
     * `022` ordena por estado, e ninguém reordena um `CASE`.
     *
     * Escopo é `(workspace_id, status)` — a coluna do quadro. Sem estrangeira
     * que expresse isso, então o índice é a única coisa que o banco sabe.
     *
     * Ordinal contíguo dentro da coluna de destino, renumerado na transação do
     * arrasto. Buraco na coluna de **origem** é permitido e não se conserta:
     * ninguém lê o número, só a ordem dele.
     */
    position: integer("position").notNull().default(0),
    /** JSON de URLs — ClickUp, Jira, PR. **Referência por link, e só** (Q013). */
    links: text("links").notNull().default("[]"),
    /**
     * Por que foi `dropped`.
     *
     * Sem motivo, `dropped` é indistinguível de esquecimento — e o arquivo
     * existe justamente para quem foi procurar de propósito.
     */
    reason: text("reason"),
    /**
     * Quando ela entrou **nesta** coluna (`028` §4.2 e §6/F4).
     *
     * O cartão diz *há quanto tempo está nesta coluna*, e esse é o sinal de
     * encalhe do produto — 30 min/2 h nas etapas da máquina, 4 h/1 dia no fim
     * da esteira.
     *
     * **Coluna própria, e não `updated_at`.** Aquele muda com qualquer escrita:
     * corrigir o título de uma tarefa parada há duas horas a faria parecer
     * recém-chegada, e o relógio de encalhe existe justamente para as que
     * ninguém tocou. Um sinal que se apaga quando alguém passa perto é pior que
     * nenhum sinal.
     */
    /**
     * Quantas vezes a esteira abriu sessão para esta tarefa **nesta etapa**
     * (`028` Parte 2, T22).
     *
     * É a **única** peça do lease do Compozy que atravessou inteira, e o
     * [ADR](../../../../docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md)
     * diz por quê: quem está com a tarefa é derivado do turno em voo e não
     * pode mentir; quantas vezes já se tentou **não está em lugar nenhum**
     * depois que o processo morreu. Sem este número, uma tarefa que mata a
     * sessão toda vez volta à fila para sempre, gastando em cada volta — e três
     * dos treze turnos gravados neste repositório morreram no meio do trabalho.
     *
     * **Zera na mudança de etapa**, porque mudar de etapa *é* a conclusão
     * bem-sucedida daquela etapa. É a regra do *unblock-loop breaker* de lá —
     * *"só zera em conclusão bem-sucedida, nunca em unblock ou expiry"* — com o
     * nosso vocabulário. O efeito é deliberado: falhar revisando não é o mesmo
     * defeito que falhar implementando, e cada etapa tem o seu orçamento.
     */
    attempts: integer("attempts").notNull().default(0),
    /**
     * Se a esteira pode pegar **esta** tarefa (`028` Parte 2, T22).
     *
     * Dois valores, e o default é `inherit`: a tarefa segue o interruptor do
     * workspace. `off` é o que **assumir** o volante escreve — o §6, Parte 4 já
     * definia *"abre a conversa e desliga a autonomia daquela tarefa"* —, e a
     * [Q40](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
     * decidiu que arrastar um cartão para uma coluna da máquina é um **segundo
     * caminho para o mesmo interruptor**.
     *
     * Ele **não** zera na mudança de etapa, e é a diferença entre ele e o
     * contador acima: tentativa é sobre a etapa, e autonomia é sobre a tarefa.
     * Você desligou porque quer fazer aquilo na mão, e mover de coluna não
     * desfaz essa intenção.
     */
    autonomy: text("autonomy").notNull().default("inherit"),
    /**
     * O prompt que o `assistido` montou e **não** enviou (`028` Parte 2, T30).
     *
     * Guardado, e não recalculado na leitura, por uma razão que é a promessa do
     * degrau: *"você vê o que ele **ia** fazer"*. Um prompt remontado na hora de
     * pintar a tela poderia diferir do que foi preparado — o corpo da tarefa
     * mudou, a worktree ficou suja — e aí o que você aprovou não é o que vai. O
     * texto preparado é a **proposta**, e proposta se guarda.
     *
     * `NULL` é o caso comum: nada preparado. Some quando o cartão anda, porque
     * o prompt é de uma etapa e não da tarefa.
     */
    preparedPrompt: text("prepared_prompt"),
    /** Para qual encaixe. Sem isto, enviar não saberia que sessão abrir. */
    preparedRole: text("prepared_role"),
    /**
     * Por que a esteira parou nesta tarefa (`028` §4, Parte 2 — T28).
     *
     * **É o único estado do selo que não é derivável, e por isso ele é guardado.**
     * Os outros quatro saem de fatos que continuam existindo — turno em voo,
     * cota relatada, coluna —, e por isso *"o selo não pode divergir da
     * realidade"*. O bloqueio é diferente: ele é o registro de uma **decisão que
     * o daemon tomou** — tentativa esgotada, portão vermelho —, e uma decisão
     * tomada não está em lugar nenhum depois do processo.
     *
     * Bloquear **não** muda a coluna: situação é selo, etapa é coluna (§4), e
     * mover a tarefa por causa de um bloqueio apagaria onde ela parou, que é a
     * informação de que alguém precisa para retomá-la.
     *
     * Some quando a etapa muda, como a tentativa e o preparo: o bloqueio é
     * daquela etapa.
     */
    blockedReason: text("blocked_reason"),
    statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" })
      .notNull()
      // `DEFAULT 0` no banco e o relógio na aplicação, e **não** o `NOW` que o
      // resto da tabela usa: o SQLite recusa `ALTER TABLE ADD COLUMN` com
      // default não-constante, e este é o primeiro carimbo de tempo do produto
      // a chegar numa tabela que já existia. O zero nunca é lido — as três
      // escritas de coluna passam um valor —, ele só existe para o `ALTER`
      // ser aceito.
      .default(sql`0`)
      .$defaultFn(() => new Date()),
    /** Quando saiu do fluxo: `done` ou `dropped`. */
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    check(
      "task_status",
      sql`${table.status} IN ('proposed', 'backlog', 'open', 'in_progress', 'review', 'testing', 'ready_to_merge', 'done', 'dropped')`,
    ),
    check("task_created_by", sql`${table.createdBy} IN ('human', 'agent')`),
    check("task_autonomy", sql`${table.autonomy} IN ('inherit', 'off')`),
    // Tentativa negativa não quer dizer nada, e a coluna é escrita por
    // incremento — um `- 1` em algum lugar viraria um contador que anda para
    // trás sem ninguém notar.
    check("task_attempts_not_negative", sql`${table.attempts} >= 0`),
    // Os dois sentidos: prompt sem papel não sabe que sessão abrir, e papel sem
    // prompt é um preparo que não preparou nada.
    check(
      "task_prepared_pair",
      sql`(${table.preparedPrompt} IS NULL AND ${table.preparedRole} IS NULL)
        OR (${table.preparedPrompt} IS NOT NULL AND ${table.preparedRole} IS NOT NULL)`,
    ),
    // Os dois sentidos, como o `session_agent_config`: tarefa de agente sem
    // sessão é proposta sem proveniência — e proveniência é o que separa
    // proposta de lixo —, e uma tarefa "criada por você" carregando sessão
    // estaria mentindo sobre quem decidiu.
    check(
      "task_agent_provenance",
      sql`(${table.createdBy} = 'agent' AND ${table.createdBySession} IS NOT NULL)
        OR (${table.createdBy} = 'human' AND ${table.createdBySession} IS NULL)`,
    ),
    // `closed_at` é derivado do estado, e um dos dois sozinho é um registro que
    // nenhum leitor sabe interpretar: tarefa `done` sem data não entra em "o que
    // este workspace fez", e data com estado aberto contradiz a própria coluna.
    check(
      "task_closed_at",
      sql`(${table.status} IN ('done', 'dropped') AND ${table.closedAt} IS NOT NULL)
        OR (${table.status} NOT IN ('done', 'dropped') AND ${table.closedAt} IS NULL)`,
    ),
    // A lista é lida por workspace e filtrada por status e projeto (F1) — os
    // três filtros da mesma consulta.
    index("task_by_workspace").on(table.workspaceId, table.status),
    // A leitura do quadro: uma coluna, em ordem. Sem isto toda pintura de
    // cartão ordena em memória.
    index("task_by_position").on(table.workspaceId, table.status, table.position),
    index("task_by_project").on(table.projectId),
  ],
);

/**
 * O que foi dito sobre uma tarefa (`028` Parte 2, T21).
 *
 * **Entidade nova, e ela é pré-requisito da esteira.** A `022` entregou `body`,
 * `links` e `reason`, e nada mais — não havia onde o implementador deixar o
 * resumo nem o revisor deixar o parecer, e a
 * [Q47](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * fechou a lista do que passa de uma sessão para outra **contando com isto**.
 *
 * A regra que a Q47 protege é sobre **canal**, não sobre conteúdo: a sessão A
 * não briefa a sessão B. A tarefa, sim — ela é registro, e você a lê também.
 * Por isso o resumo do implementador é um comentário como outro qualquer, sem
 * campo próprio: um `implementerSummary` faria o produto tratar agente como
 * categoria de autor, e a pergunta seguinte seria *"e o campo do revisor?"*.
 */
export const taskComment = sqliteTable(
  "task_comment",
  {
    id: text("id").primaryKey(),
    /**
     * `cascade`, e é a única relação desta tabela que o é.
     *
     * Um comentário sem tarefa não é nada — ele não tem leitura própria, não
     * aparece em lugar nenhum sozinho, e mantê-lo vivo depois da tarefa seria
     * guardar uma frase sem assunto. É o contrário do ponteiro da sessão logo
     * abaixo, que existe **porque** a sessão pode sumir antes do que ela disse.
     */
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull().default("human"),
    /**
     * Qual sessão escreveu, quando foi agente. **Sem estrangeiro**, e a razão é
     * a mesma que a `022` escreveu para `task.created_by_session` — mas aqui
     * ela foi **provada por um teste que ficou vermelho**, e vale registrar
     * como isso aconteceu.
     *
     * Escrevi a coluna com `references(session, onDelete: "set null")`, que
     * parece o certo: apagar uma sessão não pode ser recusado por causa do que
     * ela disse. Aí o `CHECK` abaixo derrubou o `DELETE`: a ação do estrangeiro
     * **é um `UPDATE`**, e `created_by = 'agent'` com sessão nula viola a
     * proveniência. As duas restrições se contradizem, e o efeito é o pior dos
     * dois mundos — apagar a sessão passa a ser **impossível** depois que um
     * agente comentou.
     *
     * `RESTRICT` seria a mesma prisão dita em voz alta, e é o que a `022`
     * recusou. Então: **id solto**. Um id que ficou órfão ainda diz mais que
     * uma coluna nula, e a proveniência continua sendo obrigatória na escrita,
     * que é onde ela importa.
     */
    createdBySession: text("created_by_session"),
    ...timestamps,
  },
  (table) => [
    check("task_comment_created_by", sql`${table.createdBy} IN ('human', 'agent')`),
    /*
     * Os dois sentidos, como o `task_agent_provenance` da `022`: um comentário
     * de agente **sem** sessão não tem proveniência, e um de pessoa **com** uma
     * é uma mentira sobre quem escreveu. A Q50 decidiu que comentário não passa
     * pelo portão da inbox — então a proveniência é tudo o que resta da regra, e
     * ela não pode ser opcional.
     */
    check(
      "task_comment_provenance",
      sql`(${table.createdBy} = 'agent' AND ${table.createdBySession} IS NOT NULL)
        OR (${table.createdBy} = 'human' AND ${table.createdBySession} IS NULL)`,
    ),
    // A leitura é sempre "os comentários desta tarefa, em ordem de escrita".
    index("task_comment_by_task").on(table.taskId, table.createdAt),
  ],
);

/**
 * Um agente **nomeado** (`028` §5.1, Parte 2 — T23).
 *
 * **Agente não é adaptador**, e a
 * [Q35](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * comprou essa distinção com uma palavra: o rodapé da sidebar passou a dizer
 * *Adaptadores*, que é por onde o agente fala (`claude`, `codex`), e **agente**
 * é o que você nomeia, instrui e dá orçamento (`revisor-severo`). Sem os dois
 * substantivos, a cascata do §5.1 é impossível de escrever em português.
 *
 * Ele aponta para um `id` do catálogo `ADAPTERS` da
 * [`021`](../../../../docs/features/021-second-agent/prd.md) — que é código, não
 * tabela —, então a coluna é **texto solto de propósito**: um estrangeiro para
 * uma constante do bundle não existe, e validar na escrita é trabalho do
 * repositório.
 */
export const namedAgent = sqliteTable(
  "named_agent",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    /** `revisor-severo`. Único **dentro do workspace**, não no mundo. */
    name: text("name").notNull(),
    /** O `id` de um `AdapterSpec`: `claude`, `codex`. */
    adapter: text("adapter").notNull(),
    /** `null` é *o que o adaptador escolher* — nem todo agente pede modelo. */
    model: text("model"),
    /**
     * O que este agente é, em texto.
     *
     * É o que separa `revisor-severo` de `revisor-rapido` sem que nenhum dos
     * dois seja código. A forma do Compozy, que o §5.1 cita como a melhor
     * referência de extensibilidade: lá o agente é um arquivo com prompt.
     */
    instructions: text("instructions").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    // Dois `revisor-severo` no mesmo workspace seriam dois agentes que a
    // cascata não consegue distinguir por nome — que é como ela é escrita.
    unique("named_agent_name_in_workspace").on(table.workspaceId, table.name),
  ],
);

/**
 * Qual agente faz qual papel, e **onde** (`028` §5.1, Parte 2 — T23).
 *
 * Uma tabela, e não três colunas por nível. A cascata é **tarefa → projeto →
 * workspace → default**, e escrevê-la como colunas daria três colunas em três
 * tabelas — nove lugares para a mesma pergunta, e nenhum jeito de acrescentar
 * um nível sem migração.
 *
 * O quarto degrau — o default — **não mora aqui**: ele é o que sobra quando
 * nenhuma linha responde, e guardá-lo seria guardar a ausência.
 */
export const roleBinding = sqliteTable(
  "role_binding",
  {
    id: text("id").primaryKey(),
    /**
     * `workspace` | `project` | `task`. Polimórfico, como o escopo da sessão já
     * é — e pelo mesmo motivo: nenhum estrangeiro expressa *"aponta para uma
     * destas três tabelas"*, e inventar três colunas nulas seria descrever a
     * exclusão mútua sem conseguir cobrá-la.
     */
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    /** `implementador` | `revisor` | `testador` — os três encaixes do §5.1. */
    role: text("role").notNull(),
    agentId: text("agent_id")
      .notNull()
      .references(() => namedAgent.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    check("role_binding_scope_type", sql`${table.scopeType} IN ('workspace', 'project', 'task')`),
    check(
      "role_binding_role",
      sql`${table.role} IN ('implementador', 'revisor', 'testador')`,
    ),
    // Um papel por escopo. Dois `revisor` no mesmo projeto seriam a cascata
    // tendo que escolher entre dois degraus do mesmo nível, que é uma pergunta
    // sem resposta certa.
    unique("role_binding_one_per_scope").on(table.scopeType, table.scopeId, table.role),
  ],
);

export const schema = {
  workspace,
  project,
  worktree,
  agentConfig,
  session,
  memoryEntry,
  memoryDecision,
  actionSignal,
  memoryAccess,
  memorySignal,
  memoryUsage,
  memoryProposal,
  playbook,
  sessionUsage,
  checkoutPort,
  task,
  taskComment,
  namedAgent,
  roleBinding,
};

export type WorkspaceRow = typeof workspace.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type WorktreeRow = typeof worktree.$inferSelect;
export type AgentConfigRow = typeof agentConfig.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type MemoryEntryRow = typeof memoryEntry.$inferSelect;
export type PlaybookRow = typeof playbook.$inferSelect;
export type SessionUsageRow = typeof sessionUsage.$inferSelect;
export type CheckoutPortRow = typeof checkoutPort.$inferSelect;
export type MemoryDecisionRow = typeof memoryDecision.$inferSelect;
export type ActionSignalRow = typeof actionSignal.$inferSelect;
export type MemoryAccessRow = typeof memoryAccess.$inferSelect;
export type MemorySignalRow = typeof memorySignal.$inferSelect;
export type MemoryUsageRow = typeof memoryUsage.$inferSelect;
export type MemoryProposalRow = typeof memoryProposal.$inferSelect;
export type TaskRow = typeof task.$inferSelect;
export type TaskCommentRow = typeof taskComment.$inferSelect;
export type NamedAgentRow = typeof namedAgent.$inferSelect;
export type RoleBindingRow = typeof roleBinding.$inferSelect;
