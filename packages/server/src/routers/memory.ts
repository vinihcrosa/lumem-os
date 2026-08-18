import { z } from "zod";

import { MemoryService, writeMemorySchema } from "../memory/MemoryService.js";
import { requireAccess } from "../memory/access.js";
import { MEMORY_ACTORS, MEMORY_SCOPES, MEMORY_TYPES } from "../memory/entry.js";
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
      await requireAccess(ctx.db, accessRequest(scope, "*"));
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
      return memory.forget(input.type, input.name, input.scope, {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
    }),
  ),

  revert: publicProcedure.input(z.object({ path: z.string().min(1).max(4_096) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.revert(input.path);
    }),
  ),

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
