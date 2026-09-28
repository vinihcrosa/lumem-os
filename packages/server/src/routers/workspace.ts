import { z } from "zod";

import { ROLES, createAgentCatalog } from "../agents/catalog.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * Workspaces over the wire, PRD F1.1–F1.5.
 *
 * The router validates shape and the repository owns the rules. Nothing here
 * re-checks uniqueness by reading first: two requests can pass that check at
 * the same time, and the database constraint cannot.
 */

/**
 * Trimmed, because " pessoal" and "pessoal" are the same workspace to a person
 * and two different rows to SQLite. Capped so the selector stays a selector.
 */
const nameSchema = z.string().trim().min(1, "o nome não pode ficar vazio").max(80);

const idSchema = z.object({ id: z.string().min(1) });

export const workspaceRouter = router({
  list: publicProcedure.query(({ ctx }) => createWorkspaceRepository(ctx.db).list()),

  get: publicProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      (await createWorkspaceRepository(ctx.db).findById(input.id)) ?? null,
    ),

  create: publicProcedure.input(z.object({ name: nameSchema })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const created = await createWorkspaceRepository(ctx.db).create(input);
      ctx.events.emit({ type: "workspace.changed" });
      return created;
    }),
  ),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const renamed = await createWorkspaceRepository(ctx.db).rename(input.id, input.name);
        ctx.events.emit({ type: "workspace.changed" });
        return renamed;
      }),
    ),

  /**
   * Os três tetos (`028` Parte 3, T18).
   *
   * `null` é **sem teto** e `0` é **bloqueia tudo**, e os dois são escrevíveis:
   * quem quer parar por um momento diz `0` sem apagar o número que configurou.
   * Os três campos são obrigatórios de propósito — *"não mandei"* e *"mandei
   * nada"* precisam ser coisas diferentes, senão desligar um teto não tem gesto.
   */
  setBudget: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        costPerTask: z.number().nonnegative().nullable(),
        costPerDay: z.number().nonnegative().nullable(),
        turnsPerSession: z.number().int().nonnegative().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...caps } = input;
        const saved = await createWorkspaceRepository(ctx.db).setBudget(id, caps);
        ctx.events.emit({ type: "workspace.changed" });
        return saved;
      }),
    ),

  /**
   * O interruptor da esteira (`028` Parte 2, T29).
   *
   * Os três degraus do §6, e o teto junto. `autonomo` sem acento porque é dado,
   * e dado do Lumem é ascii pela convenção do repositório — quem traduz é a
   * tela.
   */
  setAutonomy: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        autonomy: z.enum(["manual", "assistido", "autonomo"]),
        maxParallel: z.number().int().nonnegative(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...switches } = input;
        const saved = await createWorkspaceRepository(ctx.db).setAutonomy(id, switches);
        ctx.events.emit({ type: "workspace.changed" });
        return saved;
      }),
    ),

  /**
   * *"PR mesclada sempre remove a worktree"* (`028` Parte 4, T40 · Q27).
   *
   * Separado do `setAutonomy` porque é outra pergunta: aquele é *quanto este
   * workspace gasta sozinho*, e este é *o que ele pode apagar*. Juntá-los faria
   * ligar a esteira parecer que autoriza apagar rascunho, que é exatamente a
   * confusão que o texto do interruptor existe para evitar.
   */
  setCleanup: publicProcedure
    .input(z.object({ id: z.string().min(1), mergedAlwaysRemoves: z.boolean() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const saved = await createWorkspaceRepository(ctx.db).setCleanup(
          input.id,
          input.mergedAlwaysRemoves,
        );
        ctx.events.emit({ type: "workspace.changed" });
        return saved;
      }),
    ),

  /**
   * O trio de cada encaixe da esteira no workspace (`034` T16, Q5): de onde veio
   * (`workspace` ou `default`), adaptador, conta, modelo e effort. Nulo é
   * *herde* — a conta padrão do agente, e os padrões da conta —, e a tela diz
   * isso em vez de inventar um valor.
   */
  slots: publicProcedure.input(idSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const catalog = createAgentCatalog(ctx.db);
      const accounts = createAgentAccountRepository(ctx.db);
      return Promise.all(
        ROLES.map(async (role) => {
          const resolved = await catalog.resolveWorkspace({ workspaceId: input.id, role });
          const account = resolved.accountId === null ? undefined : await accounts.get(resolved.accountId);
          return {
            role,
            from: resolved.from === "default" ? ("default" as const) : ("workspace" as const),
            adapter: resolved.adapter,
            accountId: resolved.accountId,
            accountLabel: account?.label ?? null,
            model: resolved.model,
            effort: resolved.effort,
          };
        }),
      );
    }),
  ),

  /** Troca o trio de um encaixe — só daquele (Q5: trocar só o revisor é um gesto). */
  setSlot: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        role: z.enum(ROLES),
        adapter: z.string().trim().min(1),
        accountId: z.string().min(1).nullable(),
        model: z.string().trim().min(1).nullable(),
        effort: z.string().trim().min(1).nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...slot } = input;
        await createAgentCatalog(ctx.db).setWorkspaceSlot({ workspaceId: id, ...slot });
        ctx.events.emit({ type: "workspace.changed" });
        return { ok: true as const };
      }),
    ),

  remove: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      await createWorkspaceRepository(ctx.db).remove(input.id);
      ctx.events.emit({ type: "workspace.changed" });
      return { ok: true as const };
    }),
  ),
});
