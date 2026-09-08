import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";
import { countStatusEntries, createGitService, parseWorktreeList } from "./GitService.js";

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

/** A repository plus a directory to put worktrees in, as the daemon would. */
async function repoWithWorktreeRoot(): Promise<{ repo: string; root: string }> {
  const repo = await createRepo({ branch: "main" });
  const root = join(tempDir("lumem-worktrees-"), "lorebase");
  mkdirSync(root, { recursive: true });
  return { repo, root };
}

/**
 * Um repositório com um remoto de verdade — outro repositório em disco.
 *
 * Sem rede e sem dublê: `git remote add` mais `git fetch` de um caminho local
 * produzem `refs/remotes/origin/*` iguais aos de um clone. É o único jeito de
 * exercitar o caminho de branch remota, que é onde mora a armadilha do HEAD
 * destacado.
 */
async function repoWithRemote(branches: string[] = ["feature-a"]): Promise<{
  repo: string;
  root: string;
  remote: string;
}> {
  const remote = await createRepo({ branch: "main" });
  for (const branch of branches) await runGit(remote, "branch", branch);

  const { repo, root } = await repoWithWorktreeRoot();
  await runGit(repo, "remote", "add", "origin", remote);
  await runGit(repo, "fetch", "origin");
  return { repo, root, remote };
}

describe("branchExists", () => {
  it("finds a branch that is there", async () => {
    const repo = await createRepo({ branch: "main" });

    expect(await git.branchExists(repo, "main")).toBe(true);
  });

  it("answers false rather than failing for a branch that is not", async () => {
    const repo = await createRepo();

    expect(await git.branchExists(repo, "ghost")).toBe(false);
  });
});

describe("addWorktree", () => {
  it("creates the checkout and the branch from the base", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");

    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    expect(existsSync(join(target, "README.md"))).toBe(true);
    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("teste");
  });

  it("shows up in the original repository's worktree list", async () => {
    // PRD §9 checks this by hand; a real `git worktree add` is the only way it
    // can be true.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");

    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    expect(await runGit(repo, "worktree", "list")).toContain("teste");
  });

  it("refuses a branch that already exists, before touching anything", async () => {
    // F4.2: the user is told to pick another name. git's own message for this
    // talks about refs and leaves them guessing.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "main-again");

    const failure = git.addWorktree({
      repoPath: repo,
      branch: "main",
      targetPath: target,
      source: { kind: "new-branch", base: "main" },
    });

    await expect(failure).rejects.toThrow(DomainError);
    await expect(failure).rejects.toThrow(/já existe; escolha outro nome/);
    expect(existsSync(target)).toBe(false);
  });

  it("turns a name with a slash into a nested directory", async () => {
    // F4.5. This is the case that breaks naive path joining and naive branch
    // handling at the same time.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "feat/login");

    await git.addWorktree({
      repoPath: repo,
      branch: "feat/login",
      targetPath: target,
      source: { kind: "new-branch", base: "main" },
    });

    expect(existsSync(join(target, "README.md"))).toBe(true);
    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feat/login");
  });

  it("starts the branch at the base, not at whatever HEAD points to", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    await runGit(repo, "checkout", "-b", "outra");
    writeFileSync(join(repo, "only-here.txt"), "x");
    await runGit(repo, "add", "only-here.txt");
    await runGit(repo, "commit", "-m", "on outra");
    const target = join(root, "from-main");

    await git.addWorktree({
      repoPath: repo,
      branch: "from-main",
      targetPath: target,
      source: { kind: "new-branch", base: "main" },
    });

    expect(existsSync(join(target, "only-here.txt"))).toBe(false);
  });

  it("leaves no branch behind when git refuses", async () => {
    // PRD §8: a failed `worktree add` registers nothing — including in git.
    const { repo, root } = await repoWithWorktreeRoot();
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");

    await expect(
      git.addWorktree({
        repoPath: repo,
        branch: "teste",
        targetPath: occupied,
        source: { kind: "new-branch", base: "main" },
      }),
    ).rejects.toThrow(DomainError);

    // git creates the branch before it discovers the directory is unusable, so
    // without the cleanup the next attempt fails on "branch already exists".
    expect(await git.branchExists(repo, "teste")).toBe(false);
  });

  it("lets the same name be retried after a failure", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");
    await expect(
      git.addWorktree({ repoPath: repo, branch: "teste", targetPath: occupied, source: { kind: "new-branch", base: "main" } }),
    ).rejects.toThrow();

    await git.addWorktree({
      repoPath: repo,
      branch: "teste",
      targetPath: join(root, "teste"),
      source: { kind: "new-branch", base: "main" },
    });

    expect(existsSync(join(root, "teste", "README.md"))).toBe(true);
  });

  it("fails with git's own words for a base branch that does not exist", async () => {
    const { repo, root } = await repoWithWorktreeRoot();

    await expect(
      git.addWorktree({
        repoPath: repo,
        branch: "teste",
        targetPath: join(root, "teste"),
        source: { kind: "new-branch", base: "no-such-base" },
      }),
    ).rejects.toThrow(/no-such-base/);
  });
});

describe("addWorktree, de uma branch que já existe", () => {
  it("entra na branch local sem criar nada, e sem mexer no upstream dela", async () => {
    // O upstream é parte do estado da branch, e uma worktree nova não é motivo
    // para reconfigurá-lo: quem já tinha `origin/feature-a` continua tendo.
    const { repo, root } = await repoWithRemote(["feature-a"]);
    await runGit(repo, "branch", "feature-a", "origin/feature-a");
    const target = join(root, "a");

    await git.addWorktree({
      repoPath: repo,
      branch: "feature-a",
      targetPath: target,
      source: { kind: "existing-branch" },
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feature-a");
    expect((await runGit(target, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("recusa antes de executar quando a branch não existe", async () => {
    // Sem isto o git responde `invalid reference`, que fala de refs e não de
    // worktree — a mesma razão pela qual a F4.2 já não deixava ele responder.
    const { repo, root } = await repoWithWorktreeRoot();

    const failure = git.addWorktree({
      repoPath: repo,
      branch: "fantasma",
      targetPath: join(root, "f"),
      source: { kind: "existing-branch" },
    });

    await expect(failure).rejects.toThrow(DomainError);
    await expect(failure).rejects.toThrow(/não existe/);
  });

  it("diz qual checkout já tem a branch, em vez de deixar o git recusar", async () => {
    // Medido: o git responde `fatal: 'x' is already used by worktree at <path>`
    // com código 128 — e só DEPOIS do gesto. `listWorktrees` sabe o mesmo antes.
    const { repo, root } = await repoWithWorktreeRoot();
    await git.addWorktree({
      repoPath: repo,
      branch: "ocupada",
      targetPath: join(root, "primeira"),
      source: { kind: "new-branch", base: "main" },
    });

    const failure = git.addWorktree({
      repoPath: repo,
      branch: "ocupada",
      targetPath: join(root, "segunda"),
      source: { kind: "existing-branch" },
    });

    await expect(failure).rejects.toThrow(DomainError);
    await expect(failure).rejects.toThrow(/primeira/);
    expect(existsSync(join(root, "segunda"))).toBe(false);
  });

  it("não apaga a branch quando o alvo está ocupado", async () => {
    // Q7: a limpeza só vale para branch que NÓS criamos. Apagar uma que já
    // existia seria apagar trabalho por causa de um diretório ocupado.
    const { repo, root } = await repoWithWorktreeRoot();
    await runGit(repo, "branch", "preciosa");
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");

    await expect(
      git.addWorktree({
        repoPath: repo,
        branch: "preciosa",
        targetPath: occupied,
        source: { kind: "existing-branch" },
      }),
    ).rejects.toThrow();

    expect(await git.branchExists(repo, "preciosa")).toBe(true);
  });
});

describe("addWorktree, de uma branch remota", () => {
  it("cria a branch local rastreando a remota — e o HEAD não fica destacado", async () => {
    // A armadilha medida: `git worktree add <path> origin/<branch>` devolve
    // exit 0 e HEAD DESTACADO. A worktree existe, funciona e não tem branch —
    // e a linha da sidebar, o ahead/behind e o status de PR assumem que tem.
    const { repo, root } = await repoWithRemote(["feature-a"]);
    const target = join(root, "a");

    await git.addWorktree({
      repoPath: repo,
      branch: "feature-a",
      targetPath: target,
      source: { kind: "remote-branch", remoteRef: "origin/feature-a" },
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feature-a");
    expect((await runGit(target, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("aceita um nome local diferente do nome remoto", async () => {
    const { repo, root } = await repoWithRemote(["feature-a"]);
    const target = join(root, "outro-nome");

    await git.addWorktree({
      repoPath: repo,
      branch: "outro-nome",
      targetPath: target,
      source: { kind: "remote-branch", remoteRef: "origin/feature-a" },
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("outro-nome");
    expect((await runGit(target, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("não deixa branch para trás quando o alvo está ocupado", async () => {
    const { repo, root } = await repoWithRemote(["feature-a"]);
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");

    await expect(
      git.addWorktree({
        repoPath: repo,
        branch: "feature-a",
        targetPath: occupied,
        source: { kind: "remote-branch", remoteRef: "origin/feature-a" },
      }),
    ).rejects.toThrow();

    expect(await git.branchExists(repo, "feature-a")).toBe(false);
  });
});

describe("listBranches", () => {
  it("lista local e remota sem duplicar o mesmo nome", async () => {
    const { repo } = await repoWithRemote(["feature-a", "feature-b"]);
    await runGit(repo, "branch", "so-local");

    const branches = await git.listBranches(repo);
    const byName = new Map(branches.map((branch) => [branch.name, branch]));

    expect(byName.get("main")).toMatchObject({ local: true, remotes: ["origin"] });
    expect(byName.get("feature-a")).toMatchObject({ local: false, remotes: ["origin"] });
    expect(byName.get("so-local")).toMatchObject({ local: true, remotes: [] });
    expect(branches.filter((branch) => branch.name === "main")).toHaveLength(1);
  });

  it("não devolve o HEAD simbólico do remoto como se fosse branch", async () => {
    const { repo } = await repoWithRemote();
    await runGit(repo, "remote", "set-head", "origin", "main");

    expect((await git.listBranches(repo)).map((branch) => branch.name)).not.toContain("HEAD");
  });

  it("diz qual checkout ocupa cada branch, inclusive o principal", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    await git.addWorktree({
      repoPath: repo,
      branch: "ocupada",
      targetPath: join(root, "ocupada"),
      source: { kind: "new-branch", base: "main" },
    });
    await runGit(repo, "branch", "livre");

    const byName = new Map((await git.listBranches(repo)).map((b) => [b.name, b]));

    expect(byName.get("ocupada")?.worktreePath).toMatch(/ocupada$/);
    expect(byName.get("main")?.worktreePath).not.toBeNull();
    expect(byName.get("livre")?.worktreePath).toBeNull();
  });

  it("junta dois remotos com o mesmo nome numa entrada só", async () => {
    // É o caso que faz a forma esperta do `worktree add` mentir: com o nome em
    // dois remotos ela responde `invalid reference` sobre uma ref que existe
    // duas vezes. Quem escolhe precisa ver os dois remotos para qualificar.
    const { repo, remote } = await repoWithRemote(["feature-a"]);
    await runGit(repo, "remote", "add", "outro", remote);
    await runGit(repo, "fetch", "outro");

    const entry = (await git.listBranches(repo)).find((b) => b.name === "feature-a");

    expect(entry?.remotes).toEqual(["origin", "outro"]);
  });
});

describe("listWorktrees", () => {
  it("lists the main repository and every worktree with its branch", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    await git.addWorktree({
      repoPath: repo,
      branch: "teste",
      targetPath: join(root, "teste"),
      source: { kind: "new-branch", base: "main" },
    });

    const entries = await git.listWorktrees(repo);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.branch)).toEqual(
      expect.arrayContaining(["main", "teste"]),
    );
  });

  it("marks a worktree whose directory was deleted by hand as prunable", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    rmSync(target, { recursive: true, force: true });

    // Matched by suffix: git reports the real path, and /var is a symlink to
    // /private/var on macOS.
    const entry = (await git.listWorktrees(repo)).find((item) => item.path.endsWith("/teste"));
    expect(entry?.prunable).toBe(true);
  });
});

describe("parseWorktreeList", () => {
  it("reads a NUL-separated porcelain listing", () => {
    const stdout = "worktree /a\0HEAD abc\0branch refs/heads/main\0\0worktree /b\0HEAD def\0detached\0\0";

    expect(parseWorktreeList(stdout)).toEqual([
      { path: "/a", head: "abc", branch: "main", detached: false, prunable: false },
      { path: "/b", head: "def", branch: null, detached: true, prunable: false },
    ]);
  });

  it("keeps a path containing a space intact", () => {
    // The reason for `-z`: plain porcelain C-quotes this one.
    const stdout = "worktree /Users/eu/Meus Projetos/x\0HEAD abc\0branch refs/heads/main\0\0";

    expect(parseWorktreeList(stdout)[0]?.path).toBe("/Users/eu/Meus Projetos/x");
  });

  it("keeps the last record when the stream does not end with a separator", () => {
    expect(parseWorktreeList("worktree /a\0HEAD abc\0")).toHaveLength(1);
  });

  it("is empty for empty output", () => {
    expect(parseWorktreeList("")).toEqual([]);
  });
});

describe("removeWorktree", () => {
  it("removes the checkout and keeps the branch", async () => {
    // F4.7. The branch is where the work is; deleting it with the directory
    // would throw away commits nobody asked to lose.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    await git.removeWorktree({ repoPath: repo, path: target });

    expect(existsSync(target)).toBe(false);
    expect(await git.branchExists(repo, "teste")).toBe(true);
  });

  it("refuses a dirty worktree unless forced", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "README.md"), "changed");

    await expect(git.removeWorktree({ repoPath: repo, path: target })).rejects.toThrow(DomainError);
    expect(existsSync(target)).toBe(true);
  });

  it("removes a dirty worktree when forced", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "README.md"), "changed");

    await git.removeWorktree({ repoPath: repo, path: target, force: true });

    expect(existsSync(target)).toBe(false);
  });

  it("runs from the repository, so a directory deleted by hand can still be dropped", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    rmSync(target, { recursive: true, force: true });

    await git.removeWorktree({ repoPath: repo, path: target, force: true });

    expect((await git.listWorktrees(repo)).map((entry) => entry.path)).not.toContain(target);
  });
});

describe("getStatus", () => {
  it("reports a fresh worktree as clean", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    expect(await git.getStatus(target)).toEqual({ clean: true, changedFiles: 0 });
  });

  it("counts a modified file", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "README.md"), "changed");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 1 });
  });

  it("counts an untracked file as dirty", async () => {
    // F4.8. A new file is unpushed, uncommitted work — losing it to a forced
    // removal is the worst outcome this whole check exists to prevent.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "novo.txt"), "x");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 1 });
  });

  it("counts an untracked file inside a new directory", async () => {
    // Without --untracked-files=all git reports the directory once, no matter
    // how many files are in it.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    mkdirSync(join(target, "novo"));
    writeFileSync(join(target, "novo", "a.txt"), "x");
    writeFileSync(join(target, "novo", "b.txt"), "x");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 2 });
  });

  it("adds up several kinds of change", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "README.md"), "changed");
    writeFileSync(join(target, "novo.txt"), "x");

    expect(await git.getStatus(target)).toMatchObject({ clean: false, changedFiles: 2 });
  });
});

describe("countStatusEntries", () => {
  it("counts a rename once, not twice", () => {
    // `R  new\0old\0` is two NUL fields for one change, and the count is what
    // the user reads before deciding to force a removal.
    expect(countStatusEntries("R  novo.txt\0antigo.txt\0")).toBe(1);
  });

  it("counts ordinary entries", () => {
    expect(countStatusEntries(" M README.md\0?? novo.txt\0")).toBe(2);
  });

  it("is zero for a clean tree", () => {
    expect(countStatusEntries("")).toBe(0);
  });
});

describe("getAheadBehind", () => {
  it("is zero and zero right after creation", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 0, behind: 0 });
  });

  it("counts commits made in the worktree as ahead", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "a.txt"), "x");
    await runGit(target, "add", "a.txt");
    await runGit(target, "commit", "-m", "work");

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 1, behind: 0 });
  });

  it("counts commits made on the base as behind", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(repo, "b.txt"), "x");
    await runGit(repo, "add", "b.txt");
    await runGit(repo, "commit", "-m", "moved on");

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 0, behind: 1 });
  });

  it("counts both sides when they diverged", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ repoPath: repo, branch: "teste", targetPath: target, source: { kind: "new-branch", base: "main" } });
    writeFileSync(join(target, "a.txt"), "x");
    await runGit(target, "add", "a.txt");
    await runGit(target, "commit", "-m", "work");
    writeFileSync(join(repo, "b.txt"), "x");
    await runGit(repo, "add", "b.txt");
    await runGit(repo, "commit", "-m", "moved on");

    // Getting these backwards is invisible until someone reads the panel and
    // rebases the wrong way.
    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 1, behind: 1 });
  });
});

describe("addWorktree numa ref, sem rastrear", () => {
  it("não configura upstream, mesmo partindo de uma ref remota", async () => {
    /*
     * O git faz o contrário sozinho: com `branch.autoSetupMerge` no default,
     * criar a partir de `refs/remotes/...` configura upstream. Foi medido aqui —
     * a branch da PR de fork saía rastreando `origin/pr/42`, e `git pull` ali
     * tentaria `refs/heads/pr/42` no upstream, que não existe.
     */
    const { repo, root } = await repoWithRemote(["feature-a"]);
    const target = join(root, "solta");

    await git.addWorktree({
      repoPath: repo,
      branch: "solta",
      targetPath: target,
      source: { kind: "branch-at", ref: "refs/remotes/origin/feature-a" },
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("solta");
    await expect(runGit(target, "rev-parse", "--abbrev-ref", "@{u}")).rejects.toThrow();
  });
});

describe("fetchRef", () => {
  it("traz uma ref que não estava no clone", async () => {
    const { repo, remote } = await repoWithRemote([]);
    await runGit(remote, "branch", "publicada-depois");

    await git.fetchRef({
      repoPath: repo,
      remote: "origin",
      refspec: "+refs/heads/publicada-depois:refs/remotes/origin/publicada-depois",
    });

    expect(await git.resolveShortSha(repo, "refs/remotes/origin/publicada-depois")).not.toBeNull();
  });

  it("falha com as palavras do git quando a ref não existe no remoto", async () => {
    const { repo } = await repoWithRemote([]);

    await expect(
      git.fetchRef({
        repoPath: repo,
        remote: "origin",
        refspec: "+refs/heads/fantasma:refs/remotes/origin/fantasma",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("não arrasta tag nenhuma junto", async () => {
    // `--no-tags`: a busca é de uma ref pedida num clique, e as tags do
    // repositório não foram pedidas.
    const { repo, remote } = await repoWithRemote([]);
    await runGit(remote, "branch", "com-tag");
    await runGit(remote, "tag", "v9.9.9");

    await git.fetchRef({
      repoPath: repo,
      remote: "origin",
      refspec: "+refs/heads/com-tag:refs/remotes/origin/com-tag",
    });

    expect((await runGit(repo, "tag", "--list")).trim()).toBe("");
  });
});

describe("listRemotes", () => {
  it("lista o que está configurado, e vazio quando não há nada", async () => {
    const { repo } = await repoWithRemote([]);
    expect(await git.listRemotes(repo)).toEqual(["origin"]);
    expect(await git.listRemotes(await createRepo())).toEqual([]);
  });
});

describe("getRemoteUrl", () => {
  it("devolve a URL gravada, e não a que o `insteadOf` reescreve", async () => {
    /*
     * `url.<x>.insteadOf` é transporte, não identidade — e é comum: a linha
     * `url."git@github.com:".insteadOf "https://github.com/"` está em meia
     * internet, e empresa com espelho interno usa a mesma mecânica. Com
     * `remote get-url`, o Lumem dizia "sem integração" para um repositório do
     * GitHub buscado por espelho.
     */
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "remote", "add", "origin", "https://github.com/exemplo/repo.git");
    await runGit(repo, "config", "url./espelho/local.insteadOf", "https://github.com/");

    expect(await git.getRemoteUrl(repo)).toBe("https://github.com/exemplo/repo.git");
  });
});
