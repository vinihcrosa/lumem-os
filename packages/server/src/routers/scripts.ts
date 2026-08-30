import { z } from "zod";

import { DomainError } from "../errors.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { resolveScope } from "../scope.js";
import { SCRIPT_PHASES, writeProjectScripts } from "../scripts/project-scripts.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * Os scripts do projeto, sobre a rede (project-scripts).
 *
 * Tudo aqui é sobre **um checkout** — projeto ou worktree —, porque é isso que o
 * rodapé é: a faixa pertence ao checkout como a árvore de arquivos pertence, e
 * trocar de aba de sessão não muda o que está rodando.
 */

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
});

const phaseSchema = z.enum(SCRIPT_PHASES);

/** Quem é o projeto deste checkout — para confiar, que é decisão de projeto. */
async function projectOf(ctx: Context, scopeType: "project" | "worktree", scopeId: string) {
  const projects = createProjectRepository(ctx.db);

  if (scopeType === "project") {
    const project = await projects.findById(scopeId);
    if (!project) throw new DomainError("NOT_FOUND", `projeto ${scopeId} não existe`);
    return project;
  }

  const worktree = await createWorktreeRepository(ctx.db).findById(scopeId);
  if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${scopeId} não existe`);
  const project = await projects.findById(worktree.projectId);
  if (!project) throw new DomainError("NOT_FOUND", `projeto ${worktree.projectId} não existe`);
  return project;
}

export const scriptsRouter = router({
  /**
   * O que o rodapé precisa saber, de uma vez.
   *
   * Uma leitura só, e não três: as abas mostram coisas diferentes do mesmo estado, e
   * três consultas dariam três respostas de instantes diferentes na mesma tela.
   */
  status: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(() => ctx.scripts.status(input)),
  ),

  start: publicProcedure
    .input(scopeSchema.extend({ phase: phaseSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { phase, ...scope } = input;
        const { session, stoppedPrevious } = await ctx.scripts.start(scope, phase);
        return { sessionId: session.id, stoppedPrevious };
      }),
    ),

  stop: publicProcedure
    .input(scopeSchema.extend({ phase: phaseSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { phase, ...scope } = input;
        return { stopped: await ctx.scripts.stop(scope, phase) };
      }),
    ),

  /**
   * Escreve o `[scripts]` no repositório de quem está lendo.
   *
   * Não commita, e isso é a decisão: o arquivo aparece como mudança comum na aba
   * `Mudanças`, e quem commita é a pessoa. Um arquivo que aparece já commitado é
   * exatamente a surpresa que a regra do `project.toml` existe para evitar.
   */
  writeFile: publicProcedure
    .input(
      scopeSchema.extend({
        setup: z.string().nullable().optional(),
        run: z.string().nullable().optional(),
        teardown: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { scopeType, scopeId, ...changes } = input;
        const { cwd } = await resolveScope(ctx, scopeType, scopeId);
        return writeProjectScripts(cwd, changes);
      }),
    ),

  /**
   * "Confio no `[scripts]` deste projeto" (S11).
   *
   * Decisão de **projeto** e não de checkout: o arquivo é o mesmo repositório, e
   * confiar por worktree faria a mesma string de comando ser perigosa numa branch e
   * inofensiva na outra.
   */
  trust: publicProcedure.input(scopeSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const project = await projectOf(ctx, input.scopeType, input.scopeId);
      await ctx.scripts.trust(project.id);
      return { projectId: project.id };
    }),
  ),
});
