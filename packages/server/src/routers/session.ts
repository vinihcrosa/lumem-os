import { z } from "zod";

import { isCommandAvailable } from "../agents/availability.js";
import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * Sessions over the wire, PRD F5.1–F5.10.
 *
 * Shell and agent are the same primitive with a different label, exactly as §3
 * says. The only differences are what gets launched and where the label comes
 * from — everything after the spawn is identical, which is what keeps this
 * version small.
 */

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(5_000).optional(),
  rows: z.number().int().min(1).max(5_000).optional(),
});

/**
 * Where a session runs, F5.1 and F5.2.
 *
 * A worktree whose directory is gone is refused here rather than at spawn:
 * node-pty answers a missing cwd with a terminal that exits 1 and prints
 * nothing, which reaches the user as a window that closed for no reason.
 */
async function resolveScope(
  ctx: Context,
  scopeType: "project" | "worktree",
  scopeId: string,
): Promise<{ cwd: string }> {
  if (scopeType === "project") {
    const project = await createProjectRepository(ctx.db).findById(scopeId);
    if (!project) throw new DomainError("NOT_FOUND", `projeto ${scopeId} não existe`);
    return { cwd: project.path };
  }

  const worktree = await createWorktreeRepository(ctx.db).findById(scopeId);
  if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${scopeId} não existe`);
  if (worktree.state === "missing") {
    throw new DomainError("BLOCKED", `a worktree "${worktree.name}" não está no disco`);
  }
  return { cwd: worktree.path };
}

export interface SessionView extends SessionRow {
  /** Null for a shell, and for an agent whose configuration was removed. */
  agentName: string | null;
}

async function toView(ctx: Context, row: SessionRow): Promise<SessionView> {
  if (row.agentConfigId === null) return { ...row, agentName: null };
  const config = await createAgentConfigRepository(ctx.db).findById(row.agentConfigId);
  return { ...row, agentName: config?.name ?? null };
}

export const sessionRouter = router({
  listByScope: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const rows = await ctx.sessionStore.listByScope(input.scopeType, input.scopeId);
      return Promise.all(rows.map((row) => toView(ctx, row)));
    }),
  ),

  getDetail: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const row = await ctx.sessionStore.findById(input.id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${input.id} não existe`);
      return toView(ctx, row);
    }),
  ),

  createShell: publicProcedure.input(scopeSchema.merge(sizeSchema)).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);

      // F5.5: the user's login shell, inheriting their environment. A session
      // without their aliases and prompt is a session they will not use.
      const row = await ctx.sessionStore.start({
        kind: "shell",
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        cwd,
        command: ctx.config.shell,
        args: ["-l"],
        ...(input.cols === undefined ? {} : { cols: input.cols }),
        ...(input.rows === undefined ? {} : { rows: input.rows }),
      });
      return toView(ctx, row);
    }),
  ),

  createAgent: publicProcedure
    .input(scopeSchema.merge(sizeSchema).extend({ agentConfigId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const config = await createAgentConfigRepository(ctx.db).findById(input.agentConfigId);
        if (!config) {
          throw new DomainError("NOT_FOUND", `configuração ${input.agentConfigId} não existe`);
        }

        // F6.5: refused before the spawn. node-pty does not fail for a missing
        // binary — it produces a terminal that exits 1 in silence, which the
        // user reads as the agent crashing rather than as not being installed.
        if (!isCommandAvailable(config.command)) {
          throw new DomainError(
            "BLOCKED",
            `"${config.command}" não está no PATH do servidor; a configuração "${config.name}" está indisponível`,
          );
        }

        // Project scope is allowed on purpose (F5.2, decision WS-Q15): asking
        // an agent about the repository does not need a branch.
        const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);

        const row = await ctx.sessionStore.start({
          kind: "agent",
          agentConfigId: config.id,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          cwd,
          command: config.command,
          args: config.args,
          // F5.5: the daemon's environment plus what the configuration declares.
          env: config.env,
          ...(input.cols === undefined ? {} : { cols: input.cols }),
          ...(input.rows === undefined ? {} : { rows: input.rows }),
        });
        return toView(ctx, row);
      }),
    ),

  close: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      await ctx.sessionStore.close(input.id);
      return { ok: true as const };
    }),
  ),
});
