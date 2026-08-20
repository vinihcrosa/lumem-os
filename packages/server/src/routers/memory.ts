import { z } from "zod";

import { MemoryService, writeMemorySchema } from "../memory/MemoryService.js";
import { createPlaybookService, lifecycleOf } from "../memory/playbook.js";
import { requireAccess } from "../memory/access.js";
import { MEMORY_ACTORS, MEMORY_SCOPES, MEMORY_TYPES } from "../memory/entry.js";
import { MAX_LIMIT } from "../memory/recall.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * A segunda superfície da memória — a mesma função, o mesmo contrato de erro.
 *
 * A PR 03 é sobre isto: um **núcleo com superfícies**. A CLI e este router não
 * têm lógica própria; os dois chamam `MemoryService` e deixam o `domainSafe`
 * traduzir `DomainError` do mesmo jeito que os outros routers já fazem. É o
 * princípio de paridade que o estudo do Compozy recomendou (§11.33) — e o que
 * garante que a terceira superfície, o MCP, não vire uma terceira semântica.
 *
 * O que **não** está aqui, de propósito: nada que escreva sem o portão. Toda
 * escrita passa por `MemoryService.write`, que decide, registra e só então grava.
 */

const scopeIds = z.object({
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  /**
   * Quem está lendo, e de onde. Não é decoração: é o que o registro de acesso
   * guarda, e sem isso o funil responde "alguém leu algo".
   *
   * Vem do cliente **por enquanto** — a sessão ainda não carrega workspace e
   * projeto (a `acp-sessions` é que vai). Enquanto vem, cada leitura atravessa o
   * funil e fica registrada, que é a diferença entre uma fronteira e um filtro.
   */
  fromProjectId: z.string().min(1).optional(),
  actor: z.enum(MEMORY_ACTORS).default("human"),
});

const searchInput = scopeIds.extend({
  query: z.string().min(1).max(500),
  // O número tem nome no núcleo, e é lá que a invariante mora. Aqui ele
  // **recusa** em vez de clampar: pedido malformado pelo tRPC é erro do
  // chamador, e a CLI não tem schema para dizer isso.
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

const identity = scopeIds.extend({
  type: z.enum(MEMORY_TYPES),
  name: z.string().min(1).max(200),
  scope: z.enum(MEMORY_SCOPES).optional(),
});

/** O pedido que o funil registra: quem, de onde, para onde, e o que foi pedido. */
function accessRequest(
  input: z.output<typeof scopeIds>,
  target: string,
): Parameters<typeof requireAccess>[1] {
  return {
    fromProjectId: input.fromProjectId ?? null,
    targetProjectId: input.projectId ?? null,
    workspaceId: input.workspaceId ?? null,
    kind: "memory",
    target,
    actor: input.actor,
  };
}

export const memoryRouter = router({
  /** O que o escopo ativo enxerga, e o que ficou sombreado ao lado. */
  list: publicProcedure.input(scopeIds.optional()).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const scope = input ?? scopeIds.parse({});
      // Livre (Q26) **e registrada** (D8): o funil não é o que nega, é o que
      // responde depois "quem leu o quê, de onde".
      // O alvo diz **qual** escopo foi listado: `*` respondia "alguém listou
      // algo", que é a linha de auditoria que não serve para nada.
      await requireAccess(
        ctx.db,
        accessRequest(scope, `list:${scope.workspaceId ?? "-"}/${scope.projectId ?? "-"}`),
      );
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      const { visible, shadowed } = memory.visible({
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
      });
      return {
        entries: visible,
        // Duas listas, e não uma: esconder sem dizer o que foi escondido é como
        // o shadow vira mistério.
        shadowed: shadowed.map((pair) => ({
          winner: pair.winner.path,
          loser: pair.loser.path,
          identity: `${pair.loser.type}/${pair.loser.slug}`,
        })),
      };
    }),
  ),

  read: publicProcedure.input(identity).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      await requireAccess(ctx.db, accessRequest(input, `${input.type}/${input.name}`));
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.read(input.type, input.name, input.scope, {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
    }),
  ),

  write: publicProcedure.input(writeMemorySchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.write(input);
    }),
  ),

  forget: publicProcedure.input(identity).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      // O `actor` chega até o núcleo, e não é decoração: a Q29 diz que apagar é
      // sempre ação sua, então quem não é humano é recusado lá — e o commit no
      // `~/.lumem` para de sair com a sua assinatura por omissão.
      return memory.forget(input.type, input.name, input.scope, {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        actor: input.actor,
      });
    }),
  ),

  revert: publicProcedure.input(z.object({ path: z.string().min(1).max(4_096) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.revert(input.path);
    }),
  ),

  /**
   * Põe — ou tira — uma memória do núcleo.
   *
   * `mutation`, e sem `actor` no input: fixar é ato **seu** (o serviço recusa
   * qualquer outro ator), e aceitar o ator pelo pedido seria oferecer pela API a
   * porta que o serviço fecha.
   */
  pin: publicProcedure
    .input(z.object({ path: z.string().min(1).max(4_096), pinned: z.boolean() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => {
        const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
        return memory.pin(input.path, input.pinned);
      }),
    ),

  /**
   * Os playbooks do escopo, com o uso e o estado do ciclo de vida.
   *
   * O estado é derivado aqui e não no cliente: `lifecycleOf` é a mesma função que
   * a CLI usa, e duas respostas para "isto ainda vale?" seriam duas verdades.
   */
  playbooks: publicProcedure
    .input(scopeIds.extend({ archived: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      domainSafeAsync(() => {
        const scope = input ?? scopeIds.parse({});
        const playbooks = createPlaybookService({ db: ctx.db, stateDir: ctx.config.stateDir });
        const rows = playbooks.list({
          ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
          archived: input?.archived ?? false,
        });
        return Promise.resolve(
          rows.map((row) => ({
            path: row.path,
            slug: row.slug,
            scope: row.scope,
            taskClass: row.taskClass,
            description: row.description,
            loads: row.loads,
            lastLoadedAt: row.lastLoadedAt,
            pinned: row.pinned,
            archived: row.archived,
            lifecycle: lifecycleOf(row),
          })),
        );
      }),
    ),

  /**
   * Escreve — ou substitui — um playbook.
   *
   * Existe por **paridade**: a CLI escreve, e uma superfície que só sabe ler é
   * uma superfície onde a mesma pergunta tem duas respostas. O ator default é
   * `human` porque quem chama daqui é a tela.
   */
  writePlaybook: publicProcedure
    .input(
      scopeIds.extend({
        taskClass: z.string().min(1).max(200),
        description: z.string().min(1).max(500),
        body: z.string().max(20_000),
        scope: z.enum(["workspace", "project"]).default("workspace"),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => {
        const playbooks = createPlaybookService({ db: ctx.db, stateDir: ctx.config.stateDir });
        return playbooks.write({
          taskClass: input.taskClass,
          description: input.description,
          body: input.body,
          scope: input.scope,
          ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          actor: input.actor,
        });
      }),
    ),

  /** Arquiva ou desarquiva um playbook. Sempre gesto seu (§9). */
  archivePlaybook: publicProcedure
    .input(z.object({ path: z.string().min(1).max(4_096), archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => {
        const playbooks = createPlaybookService({ db: ctx.db, stateDir: ctx.config.stateDir });
        const row = playbooks.setArchived(input.path, input.archived);
        return Promise.resolve({ path: row.path, archived: row.archived });
      }),
    ),

  /**
   * O que está ligado — hoje, só a destilação de fim de sessão.
   *
   * Existe porque desligado por padrão só é honesto se for **visível**: uma
   * captura que ninguém sabe se está ligada é uma captura que ninguém confere.
   */
  settings: publicProcedure.query(({ ctx }) => ({
    distill: ctx.config.distill,
    autoLearn: ctx.config.autoLearn,
    autoLearnBudget: ctx.config.autoLearnBudget,
  })),

  /**
   * A marca d'água: o que o núcleo custa em toda sessão.
   *
   * Sem o `text`. Ele é grande, a tela não mostra, e trafegar o núcleo inteiro
   * para desenhar um número seria pagar o próprio custo que a tela existe para
   * vigiar.
   */
  core: publicProcedure.input(scopeIds.optional()).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const scope = input ?? scopeIds.parse({});
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      const core = await memory.core({
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
      });
      return {
        chars: core.chars,
        recentChars: core.recentChars,
        entries: core.entries.map(({ path, name, scope: entryScope, chars }) => ({
          path,
          name,
          scope: entryScope,
          chars,
        })),
      };
    }),
  ),

  /**
   * Busca lexical, explicável — e que respeita escopo e shadow.
   *
   * `query`, e portanto **não registra**: refetch, retry e remontagem do cliente
   * subiriam o `recall_count` e inflariam o próprio número que o §6 quer medir.
   * Quem registra é o `recall` abaixo, o caminho do agente.
   */
  search: publicProcedure
    .input(searchInput)
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.search(input.query, {
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        ...(input.limit ? { limit: input.limit } : {}),
      });
    }),

  /**
   * A mesma busca, pelo caminho do agente — e **com** sinal e uso registrados.
   *
   * Mutation de propósito: registrar é escrever, e a sessão que perguntou é o
   * que separa "quantas chamadas" de "quantas chamadas por sessão".
   */
  recall: publicProcedure
    .input(searchInput.extend({ sessionId: z.string().min(1).max(128).optional() }))
    .mutation(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.search(input.query, {
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        record: true,
        ...(input.limit ? { limit: input.limit } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });
    }),

  /** A inbox: o que os agentes querem ensinar ao workspace. */
  proposals: publicProcedure
    .input(
      z
        .object({
          // `resolved` é as duas juntas: rejeitar mantém a proposta visível, e a
          // tela precisa de uma pergunta só para "o que eu já decidi".
          status: z.enum(["pending", "approved", "rejected", "resolved"]).optional(),
          workspaceId: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.proposals({
        ...(input?.status ? { status: input.status } : {}),
        ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input?.limit ? { limit: input.limit } : {}),
      });
    }),

  approveProposal: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        description: z.string().min(1).max(500).optional(),
        body: z.string().max(100_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
        const { id, ...edits } = input;
        return memory.approveProposal(id, edits);
      }),
    ),

  rejectProposal: publicProcedure
    .input(z.object({ id: z.string().min(1), note: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () =>
        new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir }).rejectProposal(
          input.id,
          input.note,
        ),
      ),
    ),

  /** Os números do §6 do context-delivery. */
  usage: publicProcedure.query(({ ctx }) => {
    const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
    return memory.usageSummary();
  }),

  /** As decisões — inclusive as que não viraram arquivo. */
  decisions: publicProcedure
    .input(z.object({ path: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.decisions({
        ...(input?.path ? { path: input.path } : {}),
        ...(input?.limit ? { limit: input.limit } : {}),
      });
    }),

  reindex: publicProcedure.mutation(({ ctx }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.reindex();
    }),
  ),
});
