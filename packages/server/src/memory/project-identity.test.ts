import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import {
  PROJECT_FILE,
  classifyClaim,
  fingerprintOf,
  readProjectId,
  resolveProjectIdentity,
  resolveRepoRoot,
  writeProjectId,
} from "./project-identity.js";

const run = promisify(execFile);

afterEach(() => {
  cleanupGitFixtures();
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Teste",
      GIT_AUTHOR_EMAIL: "teste@local",
      GIT_COMMITTER_NAME: "Teste",
      GIT_COMMITTER_EMAIL: "teste@local",
    },
  });
  return stdout.trim();
}

/**
 * Um repositório de verdade, com um commit de verdade.
 *
 * `realpathSync` porque no macOS o `tmpdir` é um symlink (`/var` → `/private/var`)
 * e o git responde sempre pelo caminho canônico. Quem compara caminho com git no
 * meio compara canônico dos dois lados, ou compara sorte.
 */
async function repo(prefix = "lumem-projeto-"): Promise<string> {
  const root = realpathSync(tempDir(prefix));
  await git(root, "init", "-b", "main");
  writeFileSync(join(root, "README.md"), "# projeto\n");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "primeiro commit");
  return root;
}

describe("resolveRepoRoot", () => {
  it("resolve a raiz a partir de um subdiretório", async () => {
    const root = await repo();
    await mkdir(join(root, "src", "fundo"), { recursive: true });

    expect(await resolveRepoRoot(join(root, "src", "fundo"))).toBe(root);
  });

  it("resolve a worktree para o projeto a que ela pertence", async () => {
    const root = await repo();
    const wt = join(realpathSync(tempDir("lumem-wt-")), "feature");
    await git(root, "worktree", "add", "-b", "feature", wt);

    // É o ponto da T4: worktree é execução, e a identidade é do projeto.
    expect(await resolveRepoRoot(wt)).toBe(root);
  });
});

describe("fingerprintOf", () => {
  it("lê o commit raiz e o remote", async () => {
    const root = await repo();
    await git(root, "remote", "add", "origin", "https://github.com/vinihcrosa/exemplo.git");
    const raiz = await git(root, "rev-list", "--max-parents=0", "HEAD");

    const fingerprint = await fingerprintOf(root);

    expect(fingerprint.rootCommits).toEqual([raiz]);
    expect(fingerprint.remote).toBe("https://github.com/vinihcrosa/exemplo.git");
  });

  it("aguenta repositório sem commit e sem remote", async () => {
    const root = realpathSync(tempDir("lumem-vazio-"));
    await git(root, "init", "-b", "main");

    const fingerprint = await fingerprintOf(root);

    expect(fingerprint.rootCommits).toEqual([]);
    expect(fingerprint.remote).toBeNull();
  });
});

describe("resolveProjectIdentity", () => {
  it("adota o id que já está no project.toml", async () => {
    const root = await repo();
    await writeProjectId(root, "id-do-time");

    const identity = await resolveProjectIdentity({ path: root });

    expect(identity.id).toBe("id-do-time");
    expect(identity.origin).toBe("file");
    expect(identity.wroteFile).toBe(false);
  });

  it("a worktree adota o id do projeto, sem arquivo próprio", async () => {
    const root = await repo();
    await writeProjectId(root, "id-do-time");
    const wt = join(realpathSync(tempDir("lumem-wt-")), "feature");
    await git(root, "worktree", "add", "-b", "feature", wt);

    const identity = await resolveProjectIdentity({ path: wt });

    expect(identity.id).toBe("id-do-time");
    expect(identity.repoRoot).toBe(root);
  });

  it("sem permissão, o id fica só no banco e o repositório não é tocado", async () => {
    const root = await repo();

    const identity = await resolveProjectIdentity({ path: root, generateId: () => "id-novo" });

    expect(identity.origin).toBe("local");
    expect(identity.id).toBe("id-novo");
    expect(existsSync(join(root, PROJECT_FILE))).toBe(false);
    expect(await git(root, "status", "--porcelain")).toBe("");
  });

  it("com permissão, escreve o arquivo e o deixa **não** commitado", async () => {
    const root = await repo();

    const identity = await resolveProjectIdentity({
      path: root,
      writeFile: true,
      generateId: () => "id-novo",
    });

    expect(identity.origin).toBe("generated");
    expect(await readProjectId(root)).toBe("id-novo");
    // Quem commita é o usuário: o arquivo aparece como pendente, não como fato.
    expect(await git(root, "status", "--porcelain", "-uall")).toContain(".lumem/project.toml");
  });
});

describe("writeProjectId", () => {
  it("preserva a configuração de time que já estava no arquivo", async () => {
    const root = await repo();
    await mkdir(join(root, ".lumem"), { recursive: true });
    writeFileSync(
      join(root, PROJECT_FILE),
      '# config do time\n[scripts]\nsetup = "pnpm install"\n',
      "utf8",
    );

    await writeProjectId(root, "id-novo");

    const text = readFileSync(join(root, PROJECT_FILE), "utf8");
    // O arquivo é do time. O Lumem escreve o id dele e não mexe no resto.
    expect(text).toContain('setup = "pnpm install"');
    expect(text).toContain("# config do time");
    expect(await readProjectId(root)).toBe("id-novo");
  });

  it("troca o id sem duplicar a linha", async () => {
    const root = await repo();
    await writeProjectId(root, "antigo");

    await writeProjectId(root, "rotacionado");

    const text = readFileSync(join(root, PROJECT_FILE), "utf8");
    expect(text.match(/^id = /gm)).toHaveLength(1);
    expect(await readProjectId(root)).toBe("rotacionado");
  });
});

describe("classifyClaim — clone ou fork", () => {
  const candidate = (repoRoot: string, remote: string | null) => ({
    id: "id",
    origin: "file" as const,
    repoRoot,
    fingerprint: { rootCommits: ["abc"], remote },
    wroteFile: false,
  });

  it("mesmo caminho é o mesmo projeto", () => {
    expect(
      classifyClaim({
        knownRepoRoot: "/repos/a",
        knownRemote: null,
        candidate: candidate("/repos/a", null),
      }),
    ).toBe("same-project");
  });

  it("caminho diferente com o mesmo remote é clone", () => {
    expect(
      classifyClaim({
        knownRepoRoot: "/repos/a",
        knownRemote: "git@github.com:v/x.git",
        candidate: candidate("/repos/b", "git@github.com:v/x.git"),
      }),
    ).toBe("same-project");
  });

  it("caminho diferente com outro remote pergunta, em vez de adivinhar", () => {
    // É o caso do fork e o do template: o arquivo veio junto, o projeto é outro.
    expect(
      classifyClaim({
        knownRepoRoot: "/repos/a",
        knownRemote: "git@github.com:v/x.git",
        candidate: candidate("/repos/fork", "git@github.com:outro/x.git"),
      }),
    ).toBe("ask");
  });
});
