import { realpath, stat } from "node:fs/promises";

import { DomainError } from "../errors.js";
import { cloneEnv } from "./clone.js";
import { execGit, type GitExec } from "./exec.js";

/**
 * Everything the daemon does to git, PRD §7 ("git via CLI, não biblioteca").
 *
 * Five commands in this version. A library would buy abstraction over an API
 * that is already stable and already installed.
 */

/**
 * O orçamento da busca de uma ref.
 *
 * Quatro vezes o default do `execGit`, que é dimensionado para disco. Uma ref de
 * um repositório grande e uma rede ruim passam dos 30 s sem que nada esteja
 * errado — e o teto existe porque o outro extremo é o daemon pendurado.
 */
export const FETCH_TIMEOUT_MS = 120_000;

export type RepoProblem = "missing" | "not-a-directory" | "not-a-repo" | "not-root";

export type RepoCheck =
  | { ok: true; root: string }
  | { ok: false; problem: RepoProblem; message: string };

export interface WorktreeEntry {
  path: string;
  /** Absent on a detached HEAD; `git worktree list` prints no branch line then. */
  branch: string | null;
  head: string | null;
  detached: boolean;
  /** git itself already knows the directory is gone. */
  prunable: boolean;
}

/**
 * De onde a worktree é cortada — a união da `026-worktree-from`.
 *
 * Ela existe porque as três formas do `git worktree add` **não são a mesma
 * chamada com um argumento diferente**: elas divergem no `argv`, no que o git
 * cria, e no que sobra quando falha. Medido em 2026-09-07, e cada linha aqui é
 * uma resposta a uma dessas medições:
 *
 * - `worktree add <path> origin/<branch>` devolve **exit 0 e HEAD destacado**.
 *   Por isso `remote-branch` carrega o ref remoto E o nome local: nunca se passa
 *   um ref remoto sozinho.
 * - a forma esperta — `worktree add <path> <nome>`, com o nome só no remoto —
 *   funciona com um remoto e **mente** com dois (`invalid reference` sobre uma
 *   ref que existe duas vezes). Por isso nenhuma variante daqui a usa.
 * - a limpeza da branch órfã depende de a branch **ter existido antes**, e não
 *   de quem a criou ([Q7](../../../../docs/features/026-worktree-from/open-questions.md)).
 */
export type AddWorktreeSource =
  /** O caminho de sempre: `-b <branch> <path> <base>`. O default do produto. */
  | { kind: "new-branch"; base: string }
  /** Uma branch local que já existe. O git não cria nada, e nada é limpo depois. */
  | { kind: "existing-branch" }
  /** Uma branch publicada: `--track -b <branch> <path> <remote>/<ref>`. */
  | { kind: "remote-branch"; remoteRef: string }
  /**
   * Uma branch nova num commit, **sem rastrear nada** — `--no-track`.
   *
   * O `--no-track` é explícito porque o git faz o contrário sozinho: com
   * `branch.autoSetupMerge` no default, criar a partir de uma ref de
   * `refs/remotes/` configura upstream. Medido aqui: a branch de uma PR de fork
   * saía rastreando `origin/pr/42`, e `git pull` ali tentaria
   * `refs/heads/pr/42` no upstream — uma ref que não existe.
   *
   * É o caso da head de fork ([ADR](../../../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md)):
   * o repositório de onde o código veio não é onde ele vai voltar.
   */
  | { kind: "branch-at"; ref: string };

export interface AddWorktreeInput {
  repoPath: string;
  /**
   * A branch em que o checkout termina.
   *
   * Em `new-branch` e `remote-branch` ela é criada; em `existing-branch` ela já
   * existe e este campo a nomeia. Deixou de ser sempre igual ao nome da
   * worktree — ver a [Q9](../../../../docs/features/026-worktree-from/open-questions.md).
   */
  branch: string;
  targetPath: string;
  source: AddWorktreeSource;
}

export interface FetchRefInput {
  repoPath: string;
  remote: string;
  /** `+refs/heads/x:refs/remotes/origin/x`. Com `+`: sobrescreve o que havia. */
  refspec: string;
  /** Rede é mais lenta que disco, e o default do `execGit` é para disco. */
  timeoutMs?: number;
}

/** Uma branch que se pode escolher como origem, F2.1 da `026-worktree-from`. */
export interface BranchEntry {
  /** Nome curto: `feat/login`, e não `refs/heads/feat/login`. */
  name: string;
  /** Existe em `refs/heads`. */
  local: boolean;
  /** Os remotos que a conhecem, em ordem. Vazio quando é só local. */
  remotes: string[];
  /**
   * O checkout que já está nela, quando há — o principal incluído.
   *
   * `git worktree add` recusa uma branch já usada, e a recusa chega depois do
   * gesto. Com isto a tela responde antes, e a resposta não é um erro: é ir
   * para a worktree que já existe.
   */
  worktreePath: string | null;
}

export interface RemoveWorktreeInput {
  /**
   * Run from the main repository, not from the worktree: a directory deleted
   * by hand is exactly the case that has to keep working, and `cwd` cannot
   * point at something that no longer exists.
   */
  repoPath: string;
  path: string;
  force?: boolean;
}

export interface WorktreeStatus {
  clean: boolean;
  /** Files with any change at all, untracked included, F4.8. */
  changedFiles: number;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

/** Which comparison the right panel is asking for, D1 of the right-panel. */
export type ChangeRef = "worktree" | "base";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface ChangedFile {
  path: string;
  /** Only for a rename; null otherwise. */
  oldPath: string | null;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  /** git counts nothing for these — it prints `-` in numstat. */
  binary: boolean;
}

export interface ChangeSet {
  ref: ChangeRef;
  /**
   * What the working tree was compared against: `HEAD`, or the merge-base with
   * the branch the worktree was cut from. Null when the repository has no
   * commit yet, in which case everything is new.
   */
  comparedTo: string | null;
  files: ChangedFile[];
}

export interface ChangesInput {
  ref: ChangeRef;
  /** Required for `ref: "base"`, ignored otherwise. */
  baseBranch?: string;
}

export interface FilePatch {
  path: string;
  binary: boolean;
  /** Unified diff of this file alone. Empty when there is nothing to show. */
  patch: string;
}

export interface ReadLogInput {
  /** A `git log --format` string. */
  format: string;
  /** How many commits back to read. */
  limit: number;
}

export interface GitService {
  /**
   * Whether a path is the root of a git repository — and if not, which of the
   * four ways it failed. F2.2 requires the user to be told *which*.
   */
  isGitRepo(path: string): Promise<RepoCheck>;
  /**
   * The branch a worktree should be cut from, F4.3.
   *
   * The remote's HEAD when there is one, the checked-out branch otherwise. No
   * fetch: the PRD says to use what is on disk.
   */
  resolveDefaultBranch(path: string): Promise<string>;
  /** Whether a local branch of that name already exists, F4.2. */
  branchExists(repoPath: string, branch: string): Promise<boolean>;
  /**
   * Whether the repository has any commit at all, F6.13.
   *
   * A repository cloned empty is a legitimate project (Q19) and cannot have a
   * worktree cut from it: the branch exists as a name and not as a commit, and
   * `git worktree add` fails on an invalid reference. Asked out loud so the
   * screen can explain instead of letting git answer.
   */
  hasCommits(path: string): Promise<boolean>;
  /** `git worktree add`, F4.1–F4.5 — e as três origens da `026-worktree-from`. */
  addWorktree(input: AddWorktreeInput): Promise<void>;
  /**
   * Os remotos configurados, na ordem em que o git os lista.
   *
   * Existe para escolher de onde buscar quando a ref **não** está no disco — aí
   * `listBranches` não tem o que dizer. `origin` primeiro é regra de quem
   * chama, e não daqui: este método só lê.
   */
  listRemotes(repoPath: string): Promise<string[]>;
  /**
   * Busca **uma** ref, e a grava onde o chamador disse.
   *
   * O único lugar do serviço que vai à rede, e o
   * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md) diz
   * por que ele existe: cortar de uma PR cuja head não está no clone passou a
   * buscar em vez de proibir. Uma ref, e não `--all` — a busca é de um clique
   * numa PR nomeada, e o resto do repositório não foi pedido.
   *
   * O `refspec` é do chamador porque ele muda com o caso: a branch de uma PR do
   * próprio repositório vem de `refs/heads/*`, e a de um fork vem de
   * `refs/pull/<n>/head`, que é o que o `origin` serve sem precisar do remoto de
   * quem abriu a PR.
   */
  fetchRef(input: FetchRefInput): Promise<void>;
  /**
   * O sha curto de uma ref, ou `null` quando ela não resolve.
   *
   * Existe para o preview: desde a `026-worktree-from` a base dele sai da origem
   * escolhida, e um sha do HEAD do checkout principal ao lado do nome de outra
   * branch é o preview mentindo com mais precisão do que antes.
   */
  resolveShortSha(repoPath: string, ref: string): Promise<string | null>;
  /**
   * As branches que servem de origem: locais e remotas, **sem ir à rede**.
   *
   * Uma execução de `for-each-ref` mais uma de `worktree list` — 10 ms medidos
   * para 85 refs, que é o que permite esta lista ser síncrona com abrir o
   * diálogo enquanto a leitura do host ainda está a caminho.
   */
  listBranches(repoPath: string): Promise<BranchEntry[]>;
  listWorktrees(repoPath: string): Promise<WorktreeEntry[]>;
  /** `git worktree remove`. Never deletes the branch, F4.7. */
  removeWorktree(input: RemoveWorktreeInput): Promise<void>;
  /**
   * `git worktree repair`, after a checkout has been moved, F6.12.
   *
   * A worktree keeps **absolute** paths on both sides of its link: the `.git`
   * file inside it, and `gitdir` under `<repo>/.git/worktrees/<nome>/`. A plain
   * `mv` only invalidates the second one — measured, not assumed: the moved
   * checkout still answers `git status`, because its own `.git` points at a
   * repository that did not move.
   *
   * What breaks is the repository's side. It goes on listing the old path, and
   * a `git worktree prune` — which git runs on its own during several ordinary
   * operations — then deletes the administrative directory of a worktree it
   * believes is gone. The checkout breaks later, far from the move that did it.
   */
  repairWorktree(input: { repoPath: string; path: string }): Promise<void>;
  getStatus(path: string): Promise<WorktreeStatus>;
  getAheadBehind(path: string, baseBranch: string): Promise<AheadBehind>;
  /**
   * Se algum remoto conhece esta branch — sem ir à rede.
   *
   * A pergunta que separa "sem pull request" de "branch não publicada" na barra
   * da PR: as duas são neutras, e dizer a errada manda a pessoa procurar uma PR
   * que não podia existir. Lê a referência de rastreamento que já está no
   * disco, e por isso responde offline.
   */
  hasRemoteBranch(path: string, branch: string): Promise<boolean>;
  /**
   * O endereço de `origin`, lido do disco. `null` quando não há remoto.
   *
   * Existe porque o banco **não** é fonte confiável para isto: `remote_url` só é
   * preenchido para projeto que o Lumem clonou, e projeto adicionado por caminho
   * — que é a maioria — nasce com ele nulo mesmo tendo `origin` configurado.
   * Confiar no banco fazia a barra da PR dizer "sem integração" para um
   * repositório do GitHub, e foi o e2e que achou.
   */
  getRemoteUrl(path: string): Promise<string | null>;
  /**
   * O assunto do último commit deste checkout. `null` quando não há commit.
   *
   * Existe para o formulário de criar pull request **propor** um título
   * ([Q4](../../../../docs/features/013-pull-request-status/open-questions.md), F7.6):
   * PR sem título pensado é PR que alguém vai ter de editar, e o título que o
   * git já sabe é melhor ponto de partida que um campo vazio. Só o assunto — o
   * corpo do commit não é corpo de PR.
   */
  getSubject(path: string): Promise<string | null>;
  /**
   * What changed in a checkout, in one of the two views of D1.
   *
   * `worktree` is the working tree against `HEAD`, plus what is not tracked
   * yet. `base` walks further back — to the merge-base with the branch this
   * worktree was cut from — so committed work shows up too.
   */
  listChanges(path: string, input: ChangesInput): Promise<ChangeSet>;
  /**
   * Raw `git log`, in the caller's own `--format`.
   *
   * The format is not this service's business: the one caller today is the
   * revert scan of the action signals (Q17), and what it needs out of a commit
   * is not what a history view would need. Bounded by `limit` because a scan
   * looks back, not all the way.
   */
  readLog(path: string, input: ReadLogInput): Promise<string>;
  /**
   * The unified diff of a single file, F4.4.
   *
   * One file at a time on purpose: a whole refactor's diff overruns the 16 MiB
   * `maxBuffer` of `execGit`, and one file would take the tab down with it.
   */
  filePatch(path: string, file: string, input: ChangesInput): Promise<FilePatch>;
  /**
   * Everything the onboarding shows about a repository before adding it.
   *
   * One method rather than five calls from the router, because the five reads
   * have to agree about *when* they happened: a repository that gets committed to
   * between the commit count and the status would be reported as clean with a
   * stale count.
   */
  describe(path: string): Promise<RepoDescription>;
}

/**
 * What a repository *is*, read before it is registered (onboarding F4.3).
 *
 * Every field is optional-shaped rather than throwing, because each of these is a
 * normal state for a real repository: no remote, no commit yet, a detached HEAD.
 * A screen that refused to describe a fresh `git init` would be refusing the case
 * it is most likely to meet on someone's first day.
 */
export interface RepoDescription {
  root: string;
  /** Null in a repository with no commit yet. */
  head: { branch: string | null; shortSha: string | null };
  /** Null when there is no `origin`. Other remotes are not asked about. */
  origin: string | null;
  /** Zero in a repository with no commit yet. */
  commits: number;
  status: WorktreeStatus;
  /**
   * Every checkout git knows about, the main one included.
   *
   * The main checkout is in this list — `git worktree list` always prints it —
   * and the caller is the one that knows which of the others it created.
   */
  worktrees: WorktreeEntry[];
}

export interface GitServiceOptions {
  exec?: GitExec;
}

/**
 * O `argv` de cada origem, em um lugar só — e **exportado**.
 *
 * Exportado porque o preview do router mostra o comando antes de ele rodar, e a
 * única forma de o preview não mentir é ele imprimir o mesmo vetor que a
 * execução usa. Uma segunda montagem, em outro arquivo, é uma frase que fica
 * errada na primeira vez que uma flag muda — e foi o que aconteceu aqui: o
 * preview de hoje escreve `-b` à mão, e com origem isso vira um comando que não
 * existe.
 */
export function worktreeAddArgs(
  branch: string,
  targetPath: string,
  source: AddWorktreeSource,
): string[] {
  switch (source.kind) {
    case "new-branch":
      return ["worktree", "add", "-b", branch, targetPath, source.base];
    // Sem `-b`: a branch existe, e o git só a coloca no checkout novo.
    case "existing-branch":
      return ["worktree", "add", targetPath, branch];
    // `--track -b`, e nunca o ref remoto sozinho — medido: sozinho ele entrega
    // HEAD destacado com sucesso.
    case "remote-branch":
      return ["worktree", "add", "--track", "-b", branch, targetPath, source.remoteRef];
    // `--no-track` dito por extenso: sem ele o git configura upstream sozinho
    // quando o ponto de partida é uma ref de `refs/remotes/`.
    case "branch-at":
      return ["worktree", "add", "--no-track", "-b", branch, targetPath, source.ref];
  }
}

export function createGitService({ exec = execGit }: GitServiceOptions = {}): GitService {
  async function branchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      await exec(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoPath });
      return true;
    } catch {
      // `--verify --quiet` exits non-zero and says nothing when the ref is
      // absent, which is the answer rather than a failure.
      return false;
    }
  }

  /**
   * Os checkouts, lidos uma vez e usados por dois.
   *
   * `-z` em vez do porcelain simples: sem ele o git aplica aspas C a qualquer
   * caminho com espaço ou acento, e cada consumidor teria que desfazê-las.
   */
  async function readWorktrees(repoPath: string): Promise<WorktreeEntry[]> {
    const { stdout } = await exec(["worktree", "list", "--porcelain", "-z"], { cwd: repoPath });
    return parseWorktreeList(stdout);
  }

  /**
   * Toda ref local e remota, em uma execução e sem rede.
   *
   * Sem padrão de filtro, de propósito: o `wildmatch` do git não usa
   * `WM_PATHNAME` aqui, então `refs/remotes/*\/main` casaria também
   * `refs/remotes/origin/topic/main`. Filtrar em JavaScript é exato e custa a
   * mesma execução — o achado é da `pull-request-status`, e continua valendo.
   *
   * Não falha: um repositório sem ref nenhuma responde vazio, que é a resposta.
   */
  async function readRefs(repoPath: string): Promise<string[]> {
    const { stdout } = await exec(
      ["for-each-ref", "--format=%(refname)", "refs/heads/", "refs/remotes/"],
      { cwd: repoPath },
    ).catch(() => ({ stdout: "", stderr: "" }));

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  const service: GitService = {
    hasCommits,

    async isGitRepo(path) {
      let info;
      try {
        info = await stat(path);
      } catch {
        return { ok: false, problem: "missing", message: `o caminho ${path} não existe` };
      }
      if (!info.isDirectory()) {
        return { ok: false, problem: "not-a-directory", message: `${path} não é um diretório` };
      }

      let root: string;
      try {
        const { stdout } = await exec(["rev-parse", "--show-toplevel"], { cwd: path });
        root = stdout.trim();
      } catch {
        // Any failure here means the same thing to the user, and git's wording
        // ("not a git repository (or any of the parent directories)") describes
        // a search they did not ask for.
        return {
          ok: false,
          problem: "not-a-repo",
          message: `${path} não é um repositório git`,
        };
      }

      // Compared through realpath because /tmp is a symlink to /private/tmp on
      // macOS: the same directory, spelled two ways, would look like a
      // subdirectory of itself.
      const [realRoot, realPath] = await Promise.all([realpath(root), realpath(path)]);
      if (realRoot !== realPath) {
        return {
          ok: false,
          problem: "not-root",
          message: `${path} está dentro do repositório ${root}, mas não é a raiz dele`,
        };
      }

      return { ok: true, root };
    },

    async readLog(path, { format, limit }) {
      const { stdout } = await exec(["log", `--max-count=${limit}`, `--format=${format}`], {
        cwd: path,
      });
      return stdout;
    },

    async resolveDefaultBranch(path) {
      // What `git remote set-head` records: the branch the remote itself calls
      // default. Present after a clone, absent in a repository born locally.
      try {
        const { stdout } = await exec(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], {
          cwd: path,
        });
        const ref = stdout.trim();
        if (ref.startsWith("refs/remotes/origin/")) {
          return ref.slice("refs/remotes/origin/".length);
        }
      } catch {
        /* no remote, or no recorded head — fall through */
      }

      // `branch --show-current`, not `rev-parse --abbrev-ref HEAD`: it answers
      // correctly in a repository whose first commit does not exist yet, where
      // rev-parse fails outright.
      const { stdout } = await exec(["branch", "--show-current"], { cwd: path });
      const current = stdout.trim();
      if (current === "") {
        throw new DomainError(
          "GIT_FAILED",
          `não dá para descobrir a branch default de ${path}: o HEAD está destacado`,
        );
      }
      return current;
    },

    branchExists,

    async addWorktree({ repoPath, branch, targetPath, source }) {
      // Uma leitura, três usos: ela decide a recusa, escolhe o `argv` e — o que
      // importa mais — diz se a limpeza pode apagar a branch depois. Perguntar
      // isto DEPOIS da falha responderia sempre `true`, porque a falha é
      // justamente o momento em que o git já criou a branch.
      const existedBefore = await branchExists(repoPath, branch);

      if (source.kind === "existing-branch") {
        // As duas recusas ditas aqui, e não pelo git, pelo mesmo motivo de
        // sempre: a mensagem dele fala de refs, e a nossa fala do que fazer.
        if (!existedBefore) {
          throw new DomainError("BLOCKED", `a branch "${branch}" não existe neste repositório`);
        }
        // Medido: o git responde `fatal: 'x' is already used by worktree at
        // <path>` com código 128. A informação é a mesma; o que muda é a hora.
        // `listWorktrees` sabe antes de o gesto acontecer — e a resposta certa
        // para esta situação nem é um erro, é ir para o checkout que já existe.
        const holder = (await readWorktrees(repoPath)).find((entry) => entry.branch === branch);
        if (holder !== undefined) {
          throw new DomainError(
            "BLOCKED",
            `a branch "${branch}" já está no checkout em ${holder.path}`,
          );
        }
      } else if (existedBefore) {
        // F4.2: a branch é criada, então o nome tem que estar livre.
        throw new DomainError("BLOCKED", `a branch "${branch}" já existe; escolha outro nome`);
      }

      try {
        await exec(worktreeAddArgs(branch, targetPath, source), { cwd: repoPath });
      } catch (error) {
        // Measured, not assumed: `worktree add` creates the branch *before* it
        // discovers the target directory is unusable, and leaves it behind. The
        // PRD says a failed creation registers nothing, and a stray branch is
        // worse than nothing — it makes the next attempt with the same name
        // fail on "branch already exists".
        //
        // A condição é a Q7, e ela corrige o que o pedido dizia: não é "quem
        // criou a branch", é "ela existia antes deste comando". Sem isso, uma
        // origem `existing-branch` com o alvo ocupado apagaria a branch de
        // outra pessoa por causa de um diretório.
        if (!existedBefore) await exec(["branch", "-D", branch], { cwd: repoPath }).catch(() => {});
        throw error;
      }
    },

    async listRemotes(repoPath) {
      const { stdout } = await exec(["remote"], { cwd: repoPath }).catch(() => ({
        stdout: "",
        stderr: "",
      }));
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    },

    async fetchRef({ repoPath, remote, refspec, timeoutMs = FETCH_TIMEOUT_MS }) {
      /*
       * O ambiente é o do clone, e não o do resto do serviço.
       *
       * `cloneEnv` esvazia `GIT_ASKPASS` e `SSH_ASKPASS` e compõe
       * `BatchMode=yes` sobre o `GIT_SSH_COMMAND` de quem usa. Um daemon não tem
       * quem perguntar: sem isto, um remoto que pede credencial deixa o processo
       * pendurado até o timeout, e timeout é uma mensagem pior que a verdade.
       *
       * `--no-tags`: a busca é de uma ref pedida por um clique. Arrastar as tags
       * do repositório junto é trazer o que ninguém pediu.
       */
      await exec(["fetch", "--no-tags", "--", remote, refspec], {
        cwd: repoPath,
        timeoutMs,
        env: cloneEnv(),
      });
    },

    async resolveShortSha(repoPath, ref) {
      // `--verify --quiet` mais o `^{commit}`: sem eles, uma ref que não existe
      // faz o git escrever a própria string de volta e sair com sucesso, e o
      // preview mostraria `origin/fantasma` como se fosse um sha.
      const { stdout } = await exec(["rev-parse", "--short", "--verify", "--quiet", `${ref}^{commit}`], {
        cwd: repoPath,
      }).catch(() => ({ stdout: "", stderr: "" }));
      const sha = stdout.trim();
      return sha === "" ? null : sha;
    },

    async listBranches(repoPath) {
      // Duas execuções, e nenhuma delas vai à rede: as refs que estão no disco,
      // e quem está em cima de quê.
      const [refs, worktrees] = await Promise.all([readRefs(repoPath), readWorktrees(repoPath)]);

      const holderOf = new Map(
        worktrees
          .filter((entry): entry is typeof entry & { branch: string } => entry.branch !== null)
          .map((entry) => [entry.branch, entry.path]),
      );

      const byName = new Map<string, BranchEntry>();
      const entryFor = (name: string): BranchEntry => {
        const existing = byName.get(name);
        if (existing !== undefined) return existing;
        const created: BranchEntry = {
          name,
          local: false,
          remotes: [],
          worktreePath: holderOf.get(name) ?? null,
        };
        byName.set(name, created);
        return created;
      };

      for (const ref of refs) {
        if (ref.startsWith("refs/heads/")) {
          entryFor(ref.slice("refs/heads/".length)).local = true;
          continue;
        }
        const rest = ref.slice("refs/remotes/".length);
        const slash = rest.indexOf("/");
        if (slash === -1) continue;
        const remote = rest.slice(0, slash);
        const name = rest.slice(slash + 1);
        // `refs/remotes/origin/HEAD` é um ponteiro simbólico para outra branch,
        // e não uma branch. Oferecê-lo daria uma origem chamada `HEAD` que já
        // está na lista com o próprio nome.
        if (name === "HEAD") continue;
        entryFor(name).remotes.push(remote);
      }

      return [...byName.values()];
    },

    listWorktrees: readWorktrees,

    async removeWorktree({ repoPath, path, force = false }) {
      // No branch deletion anywhere in here: F4.7 keeps the work reachable
      // after the checkout is gone.
      await exec(["worktree", "remove", ...(force ? ["--force"] : []), path], { cwd: repoPath });
    },

    async repairWorktree({ repoPath, path }) {
      // From the main repository, and naming the new location: git rewrites
      // both sides of the link from here.
      await exec(["worktree", "repair", path], { cwd: repoPath });
    },

    async getStatus(path) {
      // `--porcelain -z` with untracked files included: F4.8 counts a new file
      // as dirty, and losing one to a forced removal is losing work.
      const { stdout } = await exec(["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
        cwd: path,
      });
      const changedFiles = countStatusEntries(stdout);
      return { clean: changedFiles === 0, changedFiles };
    },

    async getAheadBehind(path, baseBranch) {
      const { stdout } = await exec(
        ["rev-list", "--left-right", "--count", `${baseBranch}...HEAD`],
        { cwd: path },
      );
      const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
      // left...right counts the base side first: commits the worktree does not
      // have are what it is *behind* by.
      return { ahead: ahead ?? 0, behind: behind ?? 0 };
    },

    async getRemoteUrl(path) {
      /*
       * `config --get remote.origin.url`, e **não** `remote get-url`.
       *
       * Os dois respondem coisas diferentes quando existe um
       * `url.<outra>.insteadOf` configurado — e ele é comum: a linha
       * `git config --global url."git@github.com:".insteadOf "https://github.com/"`
       * está em meia internet, e empresa com espelho interno usa a mesma
       * mecânica. O `remote get-url` devolve a URL **já reescrita**, que é a de
       * transporte; o `config` devolve a que está gravada, que é a de
       * **identidade**.
       *
       * Quem chama aqui quer identidade: de qual host é este repositório, qual é
       * o `org/repo`, qual URL de comparação montar. Ler a de transporte faz o
       * Lumem dizer "sem integração" para um repositório do GitHub que se busca
       * por um espelho — e foi assim que o defeito apareceu, numa fixture de e2e
       * que usa `insteadOf` justamente para falar com um "GitHub" em disco.
       */
      const { stdout } = await exec(["config", "--get", "remote.origin.url"], {
        cwd: path,
      }).catch(() => ({ stdout: "", stderr: "" }));
      const url = stdout.trim();
      return url === "" ? null : url;
    },

    async getSubject(path) {
      const { stdout } = await exec(["log", "-1", "--format=%s"], { cwd: path }).catch(() => ({
        stdout: "",
        stderr: "",
      }));
      const subject = stdout.trim();
      return subject === "" ? null : subject;
    },

    async hasRemoteBranch(path, branch) {
      // A mesma leitura do `listBranches`, e a mesma comparação por sufixo — o
      // motivo dela está no `readRefs`. Continua uma execução só: esta pergunta
      // é feita por worktree na barra de PR, e um `worktree list` a mais aqui
      // seria um processo a mais por linha da sidebar.
      return (await readRefs(path)).some((ref) => {
        if (!ref.startsWith("refs/remotes/")) return false;
        const rest = ref.slice("refs/remotes/".length);
        const slash = rest.indexOf("/");
        return slash !== -1 && rest.slice(slash + 1) === branch;
      });
    },

    async listChanges(path, input) {
      const comparedTo = await resolveComparison(path, input);

      const tracked = comparedTo === null ? [] : await trackedChanges(path, comparedTo);
      const untracked = await untrackedChanges(path);

      // A rename shows up under its new path, and untracked files cannot
      // collide with tracked ones, so a plain concatenation is enough.
      const files = [...tracked, ...untracked].sort((a, b) => (a.path < b.path ? -1 : 1));
      return { ref: input.ref, comparedTo, files };
    },

    async filePatch(path, file, input) {
      const comparedTo = await resolveComparison(path, input);
      const untracked = comparedTo === null || (await isUntracked(path, file));

      const { stdout } = untracked
        ? // `--no-index` is how git diffs something it does not track. It
          // exits 1 whenever there *is* a difference, which is the normal case
          // here — so the diff arrives as a failure and is read off it.
          await exec(["diff", "--no-index", "--", "/dev/null", file], { cwd: path }).catch(
            (error) => ({ stdout: outputOf(error), stderr: "" }),
          )
        : await exec(["diff", comparedTo, "--", file], { cwd: path });

      const binary = /^Binary files .* differ$/m.test(stdout);
      return { path: file, binary, patch: binary ? "" : stdout };
    },

    async describe(path) {
      const check = await service.isGitRepo(path);
      if (!check.ok) throw new DomainError("INVALID_ARGUMENT", check.message);

      /*
       * Each read answers on its own.
       *
       * A repository with no commit fails `rev-parse HEAD` and counts no commits;
       * one with no remote has no `origin`. Both are ordinary, so neither may take
       * the description down — the caller is describing a repository precisely
       * because it does not know yet what shape it is in.
       */
      const [branch, shortSha, origin, commits, status, worktrees] = await Promise.all([
        exec(["branch", "--show-current"], { cwd: path })
          .then(({ stdout }) => (stdout.trim() === "" ? null : stdout.trim()))
          .catch(() => null),
        exec(["rev-parse", "--short", "HEAD"], { cwd: path })
          .then(({ stdout }) => stdout.trim())
          .catch(() => null),
        exec(["remote", "get-url", "origin"], { cwd: path })
          .then(({ stdout }) => stdout.trim())
          .catch(() => null),
        exec(["rev-list", "--count", "HEAD"], { cwd: path })
          .then(({ stdout }) => Number.parseInt(stdout.trim(), 10) || 0)
          .catch(() => 0),
        service.getStatus(path),
        service.listWorktrees(path),
      ]);

      return { root: check.root, head: { branch, shortSha }, origin, commits, status, worktrees };
    },
  };


  /**
   * What the working tree is compared against, for either view.
   *
   * Returns null for a repository with no commit yet: `git diff HEAD` fails
   * there with "unknown revision", and a brand-new worktree is the common case,
   * not an edge one. Everything is new when there is nothing to compare to.
   */
  async function resolveComparison(path: string, input: ChangesInput): Promise<string | null> {
    if (!(await hasCommits(path))) return null;
    if (input.ref === "worktree") return "HEAD";

    const base = input.baseBranch;
    if (base === undefined || base === "") {
      throw new DomainError("INVALID_ARGUMENT", "a vista contra a base precisa de uma branch");
    }
    try {
      const { stdout } = await exec(["merge-base", base, "HEAD"], { cwd: path });
      return stdout.trim();
    } catch {
      // Told apart from a generic git failure because the UI disables just this
      // view for it, and needs a sentence to explain why.
      throw new DomainError(
        "NOT_FOUND",
        `a branch "${base}" não existe mais neste repositório — sem base, não há o que comparar`,
      );
    }
  }

  async function hasCommits(path: string): Promise<boolean> {
    try {
      await exec(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: path });
      return true;
    } catch {
      // `--verify --quiet` says nothing and exits non-zero on an unborn HEAD,
      // which is the answer rather than a failure.
      return false;
    }
  }

  async function isUntracked(path: string, file: string): Promise<boolean> {
    const { stdout } = await exec(["ls-files", "--error-unmatch", "-z", "--", file], {
      cwd: path,
    }).catch(() => ({ stdout: "", stderr: "" }));
    return stdout.trim() === "";
  }

  /** Everything git already knows about: the two `diff` reads, joined by path. */
  async function trackedChanges(path: string, comparedTo: string): Promise<ChangedFile[]> {
    const [status, numbers] = await Promise.all([
      exec(["diff", "--name-status", "-z", comparedTo], { cwd: path }),
      exec(["diff", "--numstat", "-z", comparedTo], { cwd: path }),
    ]);

    const counts = parseNumstat(numbers.stdout);
    return parseNameStatus(status.stdout).map((entry) => ({
      ...entry,
      ...(counts.get(entry.path) ?? { additions: 0, deletions: 0, binary: false }),
    }));
  }

  /**
   * Files git is not tracking yet, F4.1.
   *
   * Counted one by one with `--no-index`, which is the only way to get real
   * numbers for a file that has no blob. The list is short by construction:
   * `status` already leaves out everything `.gitignore` covers.
   */
  async function untrackedChanges(path: string): Promise<ChangedFile[]> {
    const { stdout } = await exec(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: path },
    );

    const paths = parseUntracked(stdout);
    return Promise.all(
      paths.map(async (file) => {
        const { stdout: numstat } = await exec(
          ["diff", "--numstat", "-z", "--no-index", "--", "/dev/null", file],
          { cwd: path },
        ).catch((error) => ({ stdout: outputOf(error), stderr: "" }));

        const counted = parseNumstat(numstat).get(file);
        return {
          path: file,
          oldPath: null,
          status: "untracked" as const,
          additions: counted?.additions ?? 0,
          deletions: 0,
          binary: counted?.binary ?? false,
        };
      }),
    );
  }

  return service;
}

/**
 * The stdout of a git command that failed on purpose.
 *
 * `git diff --no-index` exits 1 when the two sides differ, so for an untracked
 * file the diff *is* the failure. `execGit` wraps the original error as the
 * cause of its DomainError, which is where the output survives.
 */
function outputOf(error: unknown): string {
  const cause = (error as { cause?: { stdout?: string } }).cause;
  return cause?.stdout ?? "";
}

interface Counts {
  additions: number;
  deletions: number;
  binary: boolean;
}

/**
 * Parses `git diff --numstat -z`.
 *
 * Ordinary entries are `adds\tdels\tpath\0`. A rename is
 * `adds\tdels\t\0old\0new\0`: the path field is empty and the two names follow
 * as their own records, which is why this cannot be a per-field loop.
 *
 * A binary file has `-` where the counts are; treating that as 0 would be a
 * lie, so it is carried as a flag instead.
 */
export function parseNumstat(stdout: string): Map<string, Counts> {
  const fields = stdout.split("\0");
  const counts = new Map<string, Counts>();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined || field === "") continue;

    const [adds, dels, name] = field.split("\t");
    if (adds === undefined || dels === undefined) continue;

    const binary = adds === "-" || dels === "-";
    const entry: Counts = {
      additions: binary ? 0 : Number(adds),
      deletions: binary ? 0 : Number(dels),
      binary,
    };

    if (name === undefined || name === "") {
      // Rename: the old name is the next field, the new one the field after.
      const to = fields[index + 2];
      index += 2;
      if (to !== undefined && to !== "") counts.set(to, entry);
      continue;
    }
    counts.set(name, entry);
  }

  return counts;
}

/** Parses `git diff --name-status -z` into everything but the counts. */
export function parseNameStatus(
  stdout: string,
): Array<{ path: string; oldPath: string | null; status: ChangeStatus }> {
  const fields = stdout.split("\0").filter((field) => field !== "");
  const entries: Array<{ path: string; oldPath: string | null; status: ChangeStatus }> = [];

  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index]!;
    // R and C carry a similarity score — R100 — and consume two names.
    if (code.startsWith("R") || code.startsWith("C")) {
      const from = fields[index + 1];
      const to = fields[index + 2];
      index += 2;
      if (to !== undefined) entries.push({ path: to, oldPath: from ?? null, status: "renamed" });
      continue;
    }

    const name = fields[index + 1];
    index += 1;
    if (name === undefined) continue;
    const status: ChangeStatus =
      code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    entries.push({ path: name, oldPath: null, status });
  }

  return entries;
}

/**
 * The `??` entries of `git status --porcelain=v1 -z`.
 *
 * Every record is `XY path`, and a rename adds a second path — skipped here
 * because a rename is never untracked.
 */
export function parseUntracked(stdout: string): string[] {
  const fields = stdout.split("\0").filter((field) => field !== "");
  const paths: string[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.startsWith("R") || field.startsWith("C")) index += 1;
    if (field.startsWith("?? ")) paths.push(field.slice(3));
  }

  return paths;
}

/**
 * Parses `git worktree list --porcelain -z`.
 *
 * Records are separated by an empty NUL-terminated line, so the stream is
 * `key value\0key value\0\0key value\0…`.
 */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;

  for (const line of stdout.split("\0")) {
    if (line === "") {
      if (current) entries.push(current);
      current = null;
      continue;
    }

    const separator = line.indexOf(" ");
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);

    if (key === "worktree") {
      current = { path: value, branch: null, head: null, detached: false, prunable: false };
    } else if (current === null) {
      continue;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    } else if (key === "detached") {
      current.detached = true;
    } else if (key === "prunable") {
      current.prunable = true;
    }
  }

  if (current) entries.push(current);
  return entries;
}

/**
 * Counts entries in `git status --porcelain=v1 -z`.
 *
 * A rename is `R  new\0old\0`: two NUL-separated fields for one change. Counting
 * separators instead of entries would report every rename twice, and the count
 * is what the user reads before deciding to force a removal.
 */
export function countStatusEntries(stdout: string): number {
  const fields = stdout.split("\0").filter((field) => field !== "");
  let count = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    count += 1;
    // XY is the two-letter status; a rename or copy consumes the next field.
    if (field.startsWith("R") || field.startsWith("C")) index += 1;
  }
  return count;
}
