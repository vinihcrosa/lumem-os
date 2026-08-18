import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { execGit } from "../git/exec.js";
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

  it("num submódulo, a raiz é o submódulo — e não o `.git` do pai", async () => {
    const pai = await repo("lumem-pai-");
    const filho = await repo("lumem-filho-");
    await git(pai, "-c", "protocol.file.allow=always", "submodule", "add", filho, "sub");
    await git(pai, "commit", "-m", "adiciona submódulo");

    // O git dir do submódulo é `<pai>/.git/modules/sub`, e adivinhar pelo sufixo
    // `.git` mandava o `project.toml` para dentro do `.git` do pai.
    expect(await resolveRepoRoot(join(pai, "sub"))).toBe(join(pai, "sub"));
  });

  it("num repositório bare, a raiz é o próprio diretório", async () => {
    const origem = await repo();
    const bare = join(realpathSync(tempDir("lumem-bare-")), "projeto.git");
    await run("git", ["clone", "--bare", origem, bare]);

    // Sem árvore de trabalho não há `--show-toplevel`; antes o código devolvia o
    // **diretório pai**, ou seja, fora do repositório.
    expect(await resolveRepoRoot(bare)).toBe(bare);
  });

  /**
   * O único teste deste arquivo com dublê de git, e o motivo é que o defeito
   * **não se produz com git de verdade**: o que se testa aqui é o que o daemon
   * faz quando o `--show-toplevel` falha por timeout, e não por ausência de
   * árvore de trabalho. Antes, qualquer falha era lida como "é bare", e o
   * `project.toml` ia para dentro do git dir em silêncio.
   */
  it("falha que não é 'sem árvore de trabalho' propaga, em vez de virar bare", async () => {
    const root = await repo();
    const travado: typeof execGit = async (args, options) => {
      if (args.includes("--show-toplevel")) {
        throw new DomainError("GIT_FAILED", "git rev-parse --show-toplevel não respondeu a tempo");
      }
      return execGit(args, options);
    };

    await expect(resolveRepoRoot(root, travado)).rejects.toThrow(/não respondeu a tempo/);
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
    // E o id fica na **raiz**, não dentro da tabela: anexado no fim ele viraria
    // `scripts.id` para qualquer parser TOML, e a raiz ficaria sem identidade.
    expect(parseToml(text)).toMatchObject({ id: "id-novo", scripts: { setup: "pnpm install" } });
    expect(text.indexOf('id = "id-novo"')).toBeLessThan(text.indexOf("[scripts]"));
  });

  it("não adota como identidade o id que é de outra ferramenta", async () => {
    const root = await repo();
    await mkdir(join(root, ".lumem"), { recursive: true });
    writeFileSync(
      join(root, PROJECT_FILE),
      '[outra-ferramenta]\nid = "nao-e-meu"\n',
      "utf8",
    );

    // O regex de linha ignorava tabela e respondia `nao-e-meu`: o Lumem passava
    // a se identificar pelo id de outro.
    expect(await readProjectId(root)).toBeNull();

    await writeProjectId(root, "meu-id");
    const text = readFileSync(join(root, PROJECT_FILE), "utf8");
    expect(parseToml(text)).toMatchObject({ id: "meu-id", "outra-ferramenta": { id: "nao-e-meu" } });
    expect(await readProjectId(root)).toBe("meu-id");
  });

  it("o arquivo que ele cria do zero é TOML válido", async () => {
    const root = await repo();

    await writeProjectId(root, "id-do-zero");

    expect(parseToml(readFileSync(join(root, PROJECT_FILE), "utf8"))).toEqual({ id: "id-do-zero" });
  });

  /** Escreve um `project.toml` cru e devolve a raiz do repositório. */
  async function comArquivo(text: string): Promise<string> {
    const root = await repo();
    await mkdir(join(root, ".lumem"), { recursive: true });
    writeFileSync(join(root, PROJECT_FILE), text, "utf8");
    return root;
  }

  /**
   * `id = ""` não é identidade — é campo em branco.
   *
   * Sem a guarda, o daemon adotaria a string vazia como id do projeto de todo
   * mundo que tivesse o campo vazio no arquivo do time, e todos eles cairiam no
   * **mesmo** projeto.
   */
  it("id vazio não é identidade: o daemon gera um em vez de adotar o nada", async () => {
    const root = await comArquivo('id = ""\n');

    expect(await readProjectId(root)).toBeNull();

    const identity = await resolveProjectIdentity({ path: root, generateId: () => "id-gerado" });

    expect(identity.id).toBe("id-gerado");
    expect(identity.origin).toBe("local");
  });

  /**
   * A leitura virou parser TOML na E10; a escrita continuou decidindo onde a
   * raiz termina com um regex de linha (`/^\s*\[/`). Valor multilinha cuja
   * continuação começa com `[` era confundido com cabeçalho de tabela — e o
   * arquivo é justamente o que a A5 manda commitar e compartilhar com o time.
   */
  it("array multilinha não vira TOML inválido", async () => {
    const root = await comArquivo("matriz = [\n  [1, 2],\n  [3, 4],\n]\n");

    await writeProjectId(root, "id-novo");

    const text = readFileSync(join(root, PROJECT_FILE), "utf8");
    // Antes: o id caía entre `matriz = [` e `  [1, 2],`, e o repositório do time
    // ficava com um TOML que nenhum parser lê.
    expect(parseToml(text)).toEqual({ id: "id-novo", matriz: [[1, 2], [3, 4]] });
    expect(await readProjectId(root)).toBe("id-novo");
  });

  it("string multilinha não engole o id", async () => {
    const root = await comArquivo('notas = """\n[isto nao e tabela]\nfim\n"""\n');

    await writeProjectId(root, "id-novo");

    const text = readFileSync(join(root, PROJECT_FILE), "utf8");
    // Antes o id caía **dentro** do literal: `readProjectId` devolvia `null`, o
    // boot seguinte gerava outro id, e a identidade do projeto rotacionava
    // sozinha — o caso grave da Q3.1.
    expect(parseToml(text)).toEqual({ id: "id-novo", notas: "[isto nao e tabela]\nfim\n" });
    expect(await readProjectId(root)).toBe("id-novo");
  });

  it("diante de um arquivo que não dá para editar, recusa em vez de corromper", async () => {
    // TOML quebrado no meio de uma edição do time: inserir aqui é chutar.
    const root = await comArquivo("matriz = [1, 2\n");
    const antes = readFileSync(join(root, PROJECT_FILE), "utf8");

    await expect(writeProjectId(root, "id-novo")).rejects.toBeInstanceOf(DomainError);

    // Nada gravado: o arquivo do time continua exatamente como estava.
    expect(readFileSync(join(root, PROJECT_FILE), "utf8")).toBe(antes);
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
