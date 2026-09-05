import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  ...timestamps,
});

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
