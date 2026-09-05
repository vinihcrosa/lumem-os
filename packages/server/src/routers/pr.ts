import type {
  PrFailureView,
  PrMark,
  PrMergeStrategy,
  PrStatus,
  PullRequestView,
} from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import type { PrEntry, PrProject } from "../pr/PrCache.js";
import { compareUrl } from "../pr/url.js";
import { pickForBranch, viewOf } from "../pr/view.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * O estado da pull request, por worktree e por projeto.
 *
 * As duas procedures saem do **mesmo** cache (F3.3): a sidebar e a barra não
 * podem discordar, e a única forma de garantir isso é elas não terem duas
 * fontes. Uma worktree cuja branch não tem PR responde `none` — resposta, e não
 * erro.
 */

const worktreeInput = z.object({ worktreeId: z.string().min(1) });
const projectInput = z.object({ projectId: z.string().min(1) });

const strategySchema = z.enum(["merge", "squash", "rebase"]);

/**
 * O que um checkout é, para esta feature.
 *
 * O `resolveScope` responde "onde no disco", que é o que sessão e arquivo
 * precisam. Aqui a pergunta é outra — **de qual projeto**, e **em qual branch**
 * —, porque a consulta é por projeto e o casamento é por branch.
 */
interface Checkout {
  project: PrProject;
  branch: string;
  base: string;
  /** Onde perguntar. A worktree, e não o repositório: `gh` lê o remote de lá. */
  cwd: string;
}

async function checkoutOf(ctx: Context, worktreeId: string): Promise<Checkout> {
  const worktree = await createWorktreeRepository(ctx.db).findById(worktreeId);
  if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${worktreeId} não existe`);
  if (worktree.state === "missing") {
    throw new DomainError("BLOCKED", `a worktree "${worktree.name}" não está no disco`);
  }

  const project = await createProjectRepository(ctx.db).findById(worktree.projectId);
  if (!project) {
    throw new DomainError("NOT_FOUND", `projeto ${worktree.projectId} não existe`);
  }

  return {
    project: { id: project.id, path: project.path, remoteUrl: project.remoteUrl },
    branch: worktree.branch,
    base: project.defaultBranch,
    cwd: worktree.path,
  };
}

function failureViewOf(entry: PrEntry): PrFailureView | null {
  if (entry.failure === null) return null;
  return {
    kind: entry.failure.kind,
    message: entry.failure.message,
    retryAt: entry.failure.retryAt ?? null,
  };
}

const NO_MERGE_OPTIONS = {
  merge: false,
  squash: false,
  rebase: false,
  deleteBranchOnMerge: false,
} as const;

export const prRouter = router({
  /**
   * A barra, inteira, numa leitura só.
   *
   * Ela precisa de sete coisas que vêm de três lugares — o host, o git local e
   * o banco —, e pedi-las em três chamadas daria três respostas de instantes
   * diferentes na mesma barra.
   */
  getByWorktree: publicProcedure.input(worktreeInput).query(({ ctx, input }) =>
    domainSafeAsync(async (): Promise<PrStatus> => {
      const checkout = await checkoutOf(ctx, input.worktreeId);
      const [entry, published] = await Promise.all([
        ctx.pr.get(checkout.project),
        // Barato e local: lê a referência de rastreamento do disco. É o que
        // separa "sem pull request" de "branch não publicada" — as duas neutras,
        // e dizer a errada manda a pessoa procurar uma PR que não podia existir.
        ctx.git.hasRemoteBranch(checkout.cwd, checkout.branch),
      ]);

      const snapshot = entry.snapshot;
      const host = snapshot?.host ?? null;
      const picked =
        snapshot === null ? null : pickForBranch(snapshot.pulls, checkout.branch);

      return {
        pull:
          picked === null
            ? null
            : viewOf({ pull: picked.pull, host, alsoOpen: picked.alsoOpen }),
        failure: failureViewOf(entry),
        readAt: entry.readAt,
        host,
        branch: checkout.branch,
        base: checkout.base,
        published,
        compareUrl:
          snapshot === null
            ? null
            : compareUrl({
                host,
                repo: snapshot.repo,
                base: checkout.base,
                head: checkout.branch,
              }),
        merge: snapshot?.merge ?? NO_MERGE_OPTIONS,
      };
    }),
  ),

  /**
   * Os marcadores da sidebar, num pedido só.
   *
   * F3.1 e F3.3: N worktrees não fazem N consultas, e a cor sai do **mesmo**
   * veredito da barra. Worktree sem PR não entra na lista — marcador cinza em
   * cinco linhas ensina o olho a ignorar a coluna inteira (Q9).
   */
  listByProject: publicProcedure.input(projectInput).query(({ ctx, input }) =>
    domainSafeAsync(async (): Promise<PrMark[]> => {
      const project = await createProjectRepository(ctx.db).findById(input.projectId);
      if (!project) throw new DomainError("NOT_FOUND", `projeto ${input.projectId} não existe`);

      const entry = await ctx.pr.get({
        id: project.id,
        path: project.path,
        remoteUrl: project.remoteUrl,
      });
      const snapshot = entry.snapshot;
      if (snapshot === null) return [];

      const worktrees = await createWorktreeRepository(ctx.db).listByProject(project.id);

      return worktrees.flatMap((worktree) => {
        const picked = pickForBranch(snapshot.pulls, worktree.branch);
        if (picked === null) return [];
        const view = viewOf({ pull: picked.pull, host: snapshot.host, alsoOpen: picked.alsoOpen });
        return [{ worktreeId: worktree.id, number: view.number, verdict: view.verdict }];
      });
    }),
  ),

  /**
   * F7 — mesclar.
   *
   * O portão é o veredito, e ele é **relido aqui** (F7.2). Recusar só na tela
   * seria conforto: quem garante é a procedure, e o teste que a prova chama
   * daqui, sem passar pelo botão.
   */
  merge: publicProcedure
    .input(worktreeInput.extend({ strategy: strategySchema, deleteBranch: z.boolean() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const checkout = await checkoutOf(ctx, input.worktreeId);
        const entry = await ctx.pr.get(checkout.project);
        const snapshot = entry.snapshot;

        if (snapshot === null) {
          throw new DomainError("BLOCKED", "não deu para ler o estado da pull request");
        }

        const picked = pickForBranch(snapshot.pulls, checkout.branch);
        if (picked === null) {
          throw new DomainError("NOT_FOUND", "esta worktree não tem pull request");
        }

        const view = viewOf({ pull: picked.pull, host: snapshot.host, alsoOpen: picked.alsoOpen });
        if (view.verdict !== "ready") {
          // Um merge a partir de um estado que a barra pintou de vermelho é
          // exatamente o modo de falha que a barra existe para evitar.
          throw new DomainError(
            "BLOCKED",
            `a pull request #${String(view.number)} não está pronta para merge`,
          );
        }

        if (!allows(snapshot.merge, input.strategy)) {
          throw new DomainError(
            "BLOCKED",
            `o repositório não permite merge por ${input.strategy}`,
          );
        }

        const write = await ctx.prHost.merge({
          repoPath: checkout.cwd,
          remoteUrl: checkout.project.remoteUrl,
          // Do cache do daemon, **nunca** do cliente (§4.2.12 do PRD).
          number: view.number,
          strategy: input.strategy,
          deleteBranch: input.deleteBranch,
        });
        if (!write.ok) throw new DomainError("GIT_FAILED", write.failure.message);

        // F7.8: a barra não pode continuar verde depois de o merge acontecer.
        ctx.pr.invalidate(checkout.project.id);
        ctx.events.emit({ type: "worktree.changed", projectId: checkout.project.id });

        return { number: view.number };
      }),
    ),

  /**
   * F7 — criar.
   *
   * Título e corpo vêm da tela, que é o que o §4.2 do PRD existe para aguentar.
   * A base e a head **não** vêm: elas saem do banco e do git local.
   */
  create: publicProcedure
    .input(
      worktreeInput.extend({
        title: z.string().min(1).max(256),
        body: z.string().max(60_000),
        draft: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const checkout = await checkoutOf(ctx, input.worktreeId);

        const published = await ctx.git.hasRemoteBranch(checkout.cwd, checkout.branch);
        if (!published) {
          // Publicar é `git push`, que é escrita no remoto também — e a F7.5
          // manda dizer isso em voz alta em vez de fazer de surpresa.
          throw new DomainError(
            "BLOCKED",
            `a branch "${checkout.branch}" ainda não foi publicada`,
          );
        }

        const write = await ctx.prHost.create({
          repoPath: checkout.cwd,
          remoteUrl: checkout.project.remoteUrl,
          base: checkout.base,
          head: checkout.branch,
          title: input.title,
          body: input.body,
          draft: input.draft,
        });
        if (!write.ok) throw new DomainError("GIT_FAILED", write.failure.message);

        ctx.pr.invalidate(checkout.project.id);
        ctx.events.emit({ type: "worktree.changed", projectId: checkout.project.id });

        return { url: write.url };
      }),
    ),

  /** "Tentar de novo", da barra. Não escreve nada; só invalida. */
  refresh: publicProcedure.input(projectInput).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      ctx.pr.invalidate(input.projectId);
      return { ok: true as const };
    }),
  ),
});

function allows(
  options: { merge: boolean; squash: boolean; rebase: boolean },
  strategy: PrMergeStrategy,
): boolean {
  return options[strategy];
}

/** Só para o teste do router poder nomear o que espera sem redeclarar. */
export type { PrStatus, PullRequestView };
