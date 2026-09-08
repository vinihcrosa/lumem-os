import { existsSync, realpathSync } from "node:fs";

import { z } from "zod";

import type { WorktreeRow } from "../db/schema.js";
import { worktreeAddArgs, type AddWorktreeSource } from "../git/GitService.js";
import { DomainError } from "../errors.js";
import { tryRecordSignal } from "../memory/signals.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";
import { releasePort } from "../scripts/ports.js";
import { homeOfProject } from "./project.js";
import { worktreeDir } from "../workspace-layout.js";

/**
 * Worktrees over the wire, PRD F4.1–F4.10.
 *
 * This is where git and the database meet, and the order is the requirement:
 * git first, registry second. A registration without a checkout is the state
 * PRD §8 forbids, and it is the one a user cannot fix from the UI.
 */

/**
 * Branch-name rules, F4.5, minus the ones that would let a name escape its
 * directory or be read as a flag.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, "informe um nome")
  .max(120)
  .refine((value) => !value.startsWith("-"), "o nome não pode começar com '-'")
  .refine((value) => !value.includes(".."), "o nome não pode conter '..'")
  .refine((value) => !value.startsWith("/") && !value.endsWith("/"), "barra sobrando no nome")
  .refine((value) => !/[\s~^:?*[\\]/.test(value), "o nome tem caracteres que o git não aceita");

const idSchema = z.object({ id: z.string().min(1) });

/**
 * Um nome de ref que veio da tela.
 *
 * Mais frouxo que o `nameSchema` — uma branch que já existe pode ter maiúscula,
 * ponto e barra — e apertado nas mesmas três coisas que importam: nada que
 * escape de diretório, nada que seja lido como flag, nada de controle. O que
 * viaja daqui vira `argv`.
 */
const refSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.startsWith("-"), "a ref não pode começar com '-'")
  .refine((value) => !value.includes(".."), "a ref não pode conter '..'")
  .refine((value) => !/[\s~^:?*[\\\u0000-\u001f\u007f]/.test(value), "a ref tem caracteres que o git não aceita");

/**
 * De onde cortar (`026-worktree-from` F1.2).
 *
 * Opcional, e ausente quer dizer `default` — que é o que o produto sempre fez.
 * `pr` e `issue` carregam **só o número**: o `headRefName` vem do cache do
 * daemon e nunca do cliente, que é a mesma regra que a `pull-request-status`
 * fixou para o merge (§4.2.12 daquele PRD).
 */
const fromSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({ kind: z.literal("branch"), ref: refSchema }),
  z.object({ kind: z.literal("issue"), number: z.number().int().positive() }),
  z.object({ kind: z.literal("pr"), number: z.number().int().positive() }),
]);

export type WorktreeFrom = z.infer<typeof fromSchema>;

/** O endereço do host: o do banco quando há, o do disco quando não. */
async function remoteOf(
  ctx: Context,
  project: { path: string; remoteUrl: string | null },
): Promise<string | null> {
  return project.remoteUrl ?? (await ctx.git.getRemoteUrl(project.path));
}

/**
 * A origem pedida, virada em comando.
 *
 * Uma função, usada pelo `create` **e** pelo `plan`: é o que faz o preview
 * mostrar o comando que vai rodar em vez de um parecido. Ela devolve também a
 * branch em que a worktree termina, que desde a Q9 pode não ser o nome dela.
 */
async function resolveSource(
  ctx: Context,
  project: { id: string; path: string; defaultBranch: string; remoteUrl: string | null },
  name: string,
  from: WorktreeFrom | undefined,
): Promise<{ source: AddWorktreeSource; branch: string }> {
  const origin = from ?? { kind: "default" as const };

  switch (origin.kind) {
    // `issue` corta da default, igual ao `default`: o que a issue decide é o
    // NOME, e o nome já veio no pedido — montado na tela, sem escrever no host
    // ([Q1](../../../../docs/features/026-worktree-from/open-questions.md)).
    case "default":
    case "issue":
      return {
        source: { kind: "new-branch", base: project.defaultBranch },
        branch: name,
      };

    case "branch": {
      /*
       * Local ou publicada, decidido **aqui** e não pelo cliente.
       *
       * O pedido carrega só o nome da ref. A tela chegou a mandar o remoto
       * também, e isso produziu duas respostas para a mesma pergunta: ela
       * escolhia `remotes[0]` — que é o primeiro em ordem de refname, `fork`
       * antes de `origin` — enquanto o caminho da PR preferia `origin`. A mesma
       * branch rastreava repositórios diferentes conforme a aba por onde se
       * chegou nela. Uma regra, um lugar.
       */
      if (await ctx.git.branchExists(project.path, origin.ref)) {
        // Local: a branch é a que existe, e o nome é só da worktree (Q9).
        return { source: { kind: "existing-branch" }, branch: origin.ref };
      }

      const remote = await remoteHolding(ctx, project.path, origin.ref);
      if (remote === null) {
        throw new DomainError(
          "BLOCKED",
          `a branch "${origin.ref}" não está no disco; rode um fetch neste projeto e tente de novo`,
        );
      }
      return {
        source: { kind: "remote-branch", remoteRef: `${remote}/${origin.ref}` },
        branch: name,
      };
    }

    case "pr": {
      const entry = await ctx.pr.get({
        id: project.id,
        path: project.path,
        remoteUrl: await remoteOf(ctx, project),
      });
      const pull = entry.snapshot?.pulls.find((item) => item.number === origin.number);
      if (pull === undefined) {
        throw new DomainError(
          "BLOCKED",
          `o Lumem não conhece a PR #${origin.number} deste projeto` +
            (entry.failure === null ? "" : ` — ${entry.failure.message}`),
        );
      }

      /*
       * A ref da head, buscada se preciso — o
       * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md).
       *
       * A ordem não mudou e não pode mudar: a ref existe **antes** do `worktree
       * add`, porque passar uma ref remota solta para ele devolve HEAD destacado
       * com código de saída zero. O que mudou é quem a traz.
       */
      return prSource(ctx, project, name, origin.number, pull);
    }
  }
}

/**
 * Qual remoto tem esta branch — `origin` primeiro quando há mais de um.
 *
 * Preferir `origin` não é gosto: é o remoto que o clone cria e o que a PR do
 * host usa. Com um `fork` configurado, escolher pela ordem alfabética faria a
 * worktree rastrear o repositório errado sem dizer nada.
 */
/**
 * De onde cortar uma PR, buscando a head quando ela não está no clone.
 *
 * Duas formas, e a diferença é de onde a head vive:
 *
 * - **do próprio repositório**: `refs/heads/<head>` do remoto, gravada no
 *   `refs/remotes/<remote>/<head>` de sempre. A worktree rastreia a branch, que
 *   é o que se espera de uma PR que veio de dentro.
 * - **de um fork**: `refs/pull/<n>/head`, que o próprio `origin` serve — não é
 *   preciso o remoto de quem abriu a PR. A branch nasce **sem upstream**: o
 *   repositório de onde o código veio não é onde ele vai voltar, e um upstream
 *   apontando para lá faria o primeiro `push` tentar escrever no fork de outra
 *   pessoa.
 */
async function prSource(
  ctx: Context,
  project: { path: string },
  name: string,
  number: number,
  pull: { headRefName: string; crossRepository?: boolean },
): Promise<{ source: AddWorktreeSource; branch: string }> {
  const fork = pull.crossRepository === true;

  // Já em disco, e do próprio repositório: nada a buscar.
  if (!fork) {
    const holding = await remoteHolding(ctx, project.path, pull.headRefName);
    if (holding !== null) {
      return {
        source: { kind: "remote-branch", remoteRef: `${holding}/${pull.headRefName}` },
        branch: name,
      };
    }
  }

  const remote = await remoteToFetchFrom(ctx, project.path);
  if (remote === null) {
    throw new DomainError(
      "BLOCKED",
      `este projeto não tem remoto configurado, então não há de onde buscar a PR #${number}`,
    );
  }

  // `pr/<n>` e não o nome da branch do fork: dois forks podem ter `patch-1`, e o
  // número da PR é o que não colide. Fora de `refs/remotes/<remote>/heads`, a
  // ref não é confundida com uma branch publicada do upstream.
  const target = fork
    ? `refs/remotes/${remote}/pr/${String(number)}`
    : `refs/remotes/${remote}/${pull.headRefName}`;
  const source = fork
    ? `refs/pull/${String(number)}/head`
    : `refs/heads/${pull.headRefName}`;

  try {
    await ctx.git.fetchRef({ repoPath: project.path, remote, refspec: `+${source}:${target}` });
  } catch (error) {
    // As palavras do git, com o número da PR na frente: `could not read
    // Username` sozinho não diz sobre o que era.
    const detail = error instanceof Error ? error.message : String(error);
    throw new DomainError(
      "BLOCKED",
      `não deu para buscar a branch da PR #${String(number)}: ${detail}`,
    );
  }

  // Fork: a branch nasce no commit buscado, sem rastrear nada.
  return fork
    ? { source: { kind: "branch-at", ref: target }, branch: name }
    : {
        source: { kind: "remote-branch", remoteRef: `${remote}/${pull.headRefName}` },
        branch: name,
      };
}

/**
 * De qual remoto buscar — `origin` quando existe.
 *
 * `listBranches` não serve aqui: a pergunta é feita justamente quando a ref
 * **não** está no disco, e aí não há entrada nenhuma para consultar.
 */
async function remoteToFetchFrom(ctx: Context, repoPath: string): Promise<string | null> {
  const remotes = await ctx.git.listRemotes(repoPath);
  if (remotes.length === 0) return null;
  return remotes.includes("origin") ? "origin" : (remotes[0] ?? null);
}

async function remoteHolding(
  ctx: Context,
  repoPath: string,
  branch: string,
): Promise<string | null> {
  const entry = (await ctx.git.listBranches(repoPath)).find((item) => item.name === branch);
  if (entry === undefined || entry.remotes.length === 0) return null;
  return entry.remotes.includes("origin") ? "origin" : (entry.remotes[0] ?? null);
}

export interface WorktreeView extends WorktreeRow {
  /** The directory is where the registry says it is. */
  present: boolean;
}

function withPresence(row: WorktreeRow): WorktreeView {
  return { ...row, present: existsSync(row.path) };
}

async function requireProject(ctx: Context, projectId: string) {
  const project = await createProjectRepository(ctx.db).findById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", `projeto ${projectId} não existe`);
  return project;
}


export const worktreeRouter = router({
  listByProject: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await createWorktreeRepository(ctx.db).listByProject(input.projectId);
      return rows.map(withPresence);
    }),

  /**
   * What `create` is about to do, without doing it (onboarding F5.1).
   *
   * The command in the response is built by `worktreeCommand`, which is also what
   * `GitService.addWorktree` runs — one place, so the preview cannot drift from
   * the execution. A second assembly in the client would be a sentence that lies
   * the first time a flag changes.
   */
  plan: publicProcedure
    .input(z.object({ projectId: z.string().min(1), name: nameSchema, from: fromSchema.optional() }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);
        // The same tree the creation writes into (Q20 of project-from-url):
        // a preview computing the path any other way would preview a place
        // nothing is ever created in.
        const path = worktreeDir(await homeOfProject(ctx, project), input.name);

        const { source, branch } = await resolveSource(ctx, project, input.name, input.from);

        // De onde o checkout sai, dito com a mesma palavra em todos os casos.
        const baseRef =
          source.kind === "new-branch"
            ? source.base
            : source.kind === "remote-branch"
              ? source.remoteRef
              : branch;

        const [branchTaken, occupied, base] = await Promise.all([
          // Numa origem que **usa** a branch existente, "já existe" é a
          // pré-condição e não a recusa: quem recusa é o checkout que já a tem.
          source.kind === "existing-branch"
            ? Promise.resolve(false)
            : ctx.git.branchExists(project.path, branch),
          Promise.resolve(existsSync(path)),
          /*
           * O sha **da origem escolhida**, e não o HEAD do checkout principal.
           *
           * Null num repositório sem commit — que é um repositório de onde
           * ainda se pode pedir um preview —, então ele responde null em vez de
           * recusar. O que ele não pode é emparelhar o nome de uma origem com o
           * sha de outra: a tela desenha os dois lado a lado.
           */
          ctx.git.resolveShortSha(project.path, baseRef),
        ]);

        // O checkout que já tem a branch, quando a origem é uma que já existe.
        // A recusa é mais barata antes, e a resposta certa nem é um erro — é ir
        // para a worktree que existe ([Q5](../../../../docs/features/026-worktree-from/open-questions.md)).
        const holder =
          source.kind === "existing-branch"
            ? (await ctx.git.listWorktrees(project.path)).find((entry) => entry.branch === branch)
            : undefined;

        return {
          name: input.name,
          branch,
          path,
          baseBranch: baseRef,
          baseSha: base,
          // O mesmo vetor que a execução usa — `worktreeAddArgs`, e não uma
          // string montada aqui. Ver o comentário dela.
          command: `git ${worktreeAddArgs(branch, path, source).join(" ")}`,
          /** Said here rather than at creation: the refusal is cheaper before. */
          refusal: branchTaken
            ? `a branch "${branch}" já existe; escolha outro nome`
            : holder !== undefined
              ? `a branch "${branch}" já está no checkout em ${holder.path}`
              : occupied
                ? `${path} já existe`
                : null,
        };
      }),
    ),

  /**
   * As branches que servem de origem — **disco, e nada mais**.
   *
   * Separada da leitura do host de propósito, e a separação é a F3.5: 10 ms
   * medidos contra ~730 ms. Numa procedure só, a lista local esperaria a rede
   * toda vez, e a aba `branch` — a única que existe em projeto sem remoto —
   * ficaria refém de um `gh` que talvez nem esteja instalado.
   */
  branches: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);
        const [branches, worktrees] = await Promise.all([
          ctx.git.listBranches(project.path),
          createWorktreeRepository(ctx.db).listByProject(project.id),
        ]);

        /*
         * Casado por caminho **real**, e não pelo que está gravado.
         *
         * O git responde o caminho resolvido; o banco guarda o que o daemon
         * construiu. No macOS `/var` é link para `/private/var`, então as duas
         * strings descrevem o mesmo diretório e não se comparam. Foi o teste que
         * pegou — a linha da árvore dizia "livre" para uma branch ocupada.
         */
        const realOf = (path: string): string => {
          try {
            return realpathSync(path);
          } catch {
            // Worktree registrada cujo diretório sumiu: `state: "missing"` é um
            // estado legítimo, e o caminho gravado ainda serve de chave.
            return path;
          }
        };
        const rowOfPath = new Map(worktrees.map((row) => [realOf(row.path), row]));
        return branches.map((branch) => {
          // O nome e o id que o produto usa, e não o caminho: a tela diz "está
          // em pr-bar" e navega para lá. Os dois são nulos quando quem ocupa é
          // o checkout principal, que não é uma worktree registrada — ele
          // aparece como ocupada e sem para onde ir.
          const holder = branch.worktreePath === null ? undefined : rowOfPath.get(realOf(branch.worktreePath));
          return {
            ...branch,
            worktreeId: holder?.id ?? null,
            worktreeName: holder?.name ?? null,
          };
        });
      }),
    ),

  /**
   * O que o host sabe: issues abertas e PRs, com a head marcada.
   *
   * As PRs saem do `PrCache`, que a barra já mantém por projeto — nesta
   * procedure elas costumam custar zero. As issues saem do `IssueCache`, que é
   * irmão dele e não pesquisa sozinho.
   */
  hostOrigins: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);
        const remoteUrl = await remoteOf(ctx, project);
        const target = { id: project.id, path: project.path, remoteUrl };

        const [issues, pr, branches] = await Promise.all([
          ctx.issues.get(target),
          ctx.pr.get(target),
          ctx.git.listBranches(project.path),
        ]);

        const published = new Set(
          branches.filter((branch) => branch.remotes.length > 0).map((branch) => branch.name),
        );

        return {
          /** Como o host se chama na tela. Null quando não há host nenhum. */
          host: remoteUrl === null ? null : ctx.prHost.supports(remoteUrl) ? ctx.prHost.name : null,
          issues: { items: issues.issues ?? [], failure: issues.failure, readAt: issues.readAt },
          pulls: {
            items: (pr.snapshot?.pulls ?? [])
              .filter((pull) => pull.state === "OPEN")
              .map((pull) => ({
                number: pull.number,
                title: pull.title,
                url: pull.url,
                headRefName: pull.headRefName,
                isDraft: pull.isDraft,
                updatedAt: pull.updatedAt,
                /*
                 * `onDisk` deixou de ser permissão e passou a ser **previsão de
                 * espera** ([ADR](../../../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md)).
                 *
                 * A tela não desabilita mais nada com isto: ela escreve uma nota
                 * cinza dizendo que aquela linha vai à rede antes de cortar. Duas
                 * linhas idênticas se comportando diferente — uma instantânea e
                 * outra com um fetch no meio — é o que a nota evita.
                 *
                 * Fork nunca está "no disco", mesmo com uma branch homônima
                 * local: numa PR cruzada o `headRefName` é o nome no fork, e a
                 * homônima é outra coisa.
                 */
                crossRepository: pull.crossRepository === true,
                onDisk: pull.crossRepository !== true && published.has(pull.headRefName),
              })),
            failure: pr.failure,
            readAt: pr.readAt,
          },
        };
      }),
    ),

  create: publicProcedure
    .input(z.object({ projectId: z.string().min(1), name: nameSchema, from: fromSchema.optional() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);

        // F6.13. Without a commit there is nothing to cut from: the branch
        // exists as a name and not as a commit, and git answers "invalid
        // reference", which explains nothing. The screen avoids it, the server
        // forbids it — and a repository cloned empty is legitimate (Q19), so
        // this is a state a project can simply be in for a while.
        if (!(await ctx.git.hasCommits(project.path))) {
          throw new DomainError(
            "BLOCKED",
            `o repositório ${project.name} ainda não tem nenhum commit — faça o primeiro para poder cortar worktrees`,
          );
        }

        // The same tree for a cloned project and for one registered by path:
        // `projectHome` is a function of (workspace, project) and never of
        // `managed` (A16). The one without a clone simply has no `repo/`.
        const path = worktreeDir(await homeOfProject(ctx, project), input.name);

        // git first. If this throws — branch taken, target occupied, repository
        // gone — nothing has been written, which is exactly what §8 requires.
        // The branch comes from `default_branch` as recorded when the project
        // was added, with no fetch: F4.3 says use what is on disk.
        // A origem, resolvida antes de escrever. Sem `from` no pedido ela é a de
        // sempre — `new-branch` a partir da default —, byte por byte o mesmo
        // `argv` de antes da `026-worktree-from`.
        const { source, branch } = await resolveSource(ctx, project, input.name, input.from);

        await ctx.git.addWorktree({
          repoPath: project.path,
          branch,
          targetPath: path,
          source,
        });

        try {
          const created = await createWorktreeRepository(ctx.db).create({
            projectId: project.id,
            name: input.name,
            // Desde a Q9 estes dois podem divergir: cortar de uma branch que já
            // existe mantém a branch e dá outro nome à worktree.
            branch,
            path,
          });
          ctx.events.emit({ type: "worktree.changed", projectId: project.id });

          // O setup do projeto, se houver (project-scripts S3).
          //
          // **Em segundo plano, e sem await**: criar worktree é uma operação de
          // segundos e o `pnpm install` é de minutos. Esperar transformaria o
          // gesto mais comum do produto numa barra de progresso, e a conversa
          // com o agente ficaria bloqueada por uma preparação que ela não usa
          // ainda. Quem acompanha é a aba `Setup` do rodapé.
          //
          // Falhar aqui **não desfaz nada** (S4): a worktree existe, funciona, e
          // o que ela não tem é preparo — desfazer seria apagar diretório por
          // causa de rede ruim.
          void ctx.scripts
            .start({ scopeType: "worktree", scopeId: created.id }, "setup")
            .catch(() => {
              // Sem setup declarado, ou projeto ainda não confiado: os dois são
              // estados legítimos, e nenhum deles é assunto de quem criou a
              // worktree. O rodapé conta a história.
            });

          return withPresence(created);
        } catch (error) {
          // The registry refused what git already did — a duplicate name that
          // git had no opinion about. Leaving the checkout would produce a
          // directory the daemon does not know about and cannot clean up.
          await ctx.git
            .removeWorktree({ repoPath: project.path, path, force: true })
            .catch(() => {});
          throw error;
        }
      }),
    ),

  getDetail: publicProcedure.input(idSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const worktrees = createWorktreeRepository(ctx.db);
      const row = await worktrees.findById(input.id);
      if (!row) throw new DomainError("NOT_FOUND", `worktree ${input.id} não existe`);
      const project = await requireProject(ctx, row.projectId);

      const view = withPresence(row);
      if (!view.present) {
        // F4.10 without a directory to read: report what is registered and say
        // the rest is unknown rather than failing the whole panel.
        return { ...view, status: null, aheadBehind: null, baseBranch: project.defaultBranch };
      }

      const [status, aheadBehind] = await Promise.all([
        ctx.git.getStatus(row.path),
        ctx.git
          .getAheadBehind(row.path, project.defaultBranch)
          // A base branch that was deleted after the fact is not a reason to
          // hide the branch, the path and the cleanliness.
          .catch(() => null),
      ]);

      return { ...view, status, aheadBehind, baseBranch: project.defaultBranch };
    }),
  ),

  remove: publicProcedure
    .input(z.object({ id: z.string().min(1), force: z.boolean().default(false) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const worktrees = createWorktreeRepository(ctx.db);
        const row = await worktrees.findById(input.id);
        if (!row) throw new DomainError("NOT_FOUND", `worktree ${input.id} não existe`);
        const project = await requireProject(ctx, row.projectId);

        // F4.9, checked before the dirt check so the message names the reason
        // the user has to act on first. There is no `force` past this one: a
        // live process holding the directory has to be closed, not overridden,
        // and §6 forbids leaving a session pointing at a scope that is gone.
        // Sessão de script não conta aqui, e a diferença é de quem manda nela: a
        // shell e o agente são seus — fechar é decisão sua —, enquanto o `run` e o
        // `setup` são do daemon, que os desliga logo abaixo. Bloquear por causa
        // deles mandaria você caçar um processo que você não abriu.
        const running = (await ctx.sessionStore.listRunningInScope("worktree", row.id)).filter(
          (session) => session.kind !== "script",
        );
        if (running.length > 0) {
          throw new DomainError(
            "BLOCKED",
            `a worktree tem ${running.length} sessão(ões) rodando; encerre-as antes de remover`,
          );
        }

        if (existsSync(row.path) && !input.force) {
          // F4.8: the count, not just "dirty". "3 arquivos modificados" is a
          // decision the user can make; "suja" is a wall.
          const status = await ctx.git.getStatus(row.path);
          if (!status.clean) {
            throw new DomainError(
              "BLOCKED",
              `a worktree tem ${status.changedFiles} arquivo(s) modificado(s); confirme para remover mesmo assim`,
            );
          }
        }

        // O teardown do projeto, antes de o diretório sumir (S8).
        //
        // Esperado, ao contrário do setup: ele existe para desfazer alguma coisa
        // — derrubar container, liberar volume — e uma remoção que não espera
        // teria apagado o diretório debaixo do próprio script. Com teto de tempo,
        // e **falha dele não impede a remoção**: worktree que não se apaga por
        // causa de um script quebrado é pior que a sujeira que ele ia limpar.
        const scope = { scopeType: "worktree", scopeId: row.id } as const;
        if (existsSync(row.path)) {
          await ctx.scripts.runToCompletion(scope, "teardown").catch(() => {});
        }
        // E o que sobrou de pé morre com o checkout: um `run` segurando a porta
        // de uma worktree que não existe mais é um processo órfão com uma porta
        // reservada para ninguém.
        await ctx.scripts.stopAll(scope);

        if (existsSync(row.path)) {
          // F4.7: the checkout goes, the branch stays.
          await ctx.git.removeWorktree({
            repoPath: project.path,
            path: row.path,
            force: input.force,
          });
        }

        await worktrees.remove(row.id);
        // Sem isto a faixa vaza: cada worktree criada e removida levaria dez
        // portas consigo, e "não há bloco livre" chegaria sem nada rodando.
        await releasePort(ctx.db, scope);

        // Sinal de ação (Q17): jogar o trabalho fora é o que mais diz sobre
        // ele. Só depois de o git ter sucedido — uma remoção que falhou não
        // descartou nada. `detail` separa "terminei" de "desisti": 1 quando foi
        // preciso forçar por cima de mudanças não salvas, 0 quando saiu limpa.
        // O alvo é o id, nunca o nome da branch, que é frase que você digitou.
        tryRecordSignal(ctx.db, {
          kind: "worktree_discarded",
          target: row.id,
          projectId: row.projectId,
          worktreeId: row.id,
          detail: input.force ? 1 : 0,
        });

        ctx.events.emit({ type: "worktree.changed", projectId: row.projectId });
        return { ok: true as const };
      }),
    ),
});
