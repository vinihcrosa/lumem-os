import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { PROJECT_FILE } from "../memory/project-identity.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import {
  NO_SCRIPTS,
  projectFilePath,
  readProjectScripts,
  writeProjectScripts,
} from "./project-scripts.js";

afterEach(() => {
  cleanupGitFixtures();
});

/** Um checkout com o `project.toml` que o teste pediu — ou sem nenhum. */
function checkout(contents?: string): string {
  const root = tempDir("lumem-scripts-");
  if (contents !== undefined) {
    const path = join(root, PROJECT_FILE);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
  return root;
}

function read(root: string): string {
  return readFileSync(join(root, PROJECT_FILE), "utf8");
}

describe("readProjectScripts", () => {
  it("projeto sem arquivo nenhum não é erro — é o estado normal", async () => {
    expect(await readProjectScripts(checkout())).toEqual(NO_SCRIPTS);
  });

  it("arquivo sem a tabela devolve as três fases vazias", async () => {
    expect(await readProjectScripts(checkout('id = "prj_1"\n'))).toEqual(NO_SCRIPTS);
  });

  it("lê as quatro fases", async () => {
    const root = checkout(
      [
        'id = "prj_1"',
        "",
        "[scripts]",
        'setup = "./setup.sh"',
        'run = "pnpm dev"',
        'test = "pnpm test"',
        'teardown = "./down.sh"',
        "",
      ].join("\n"),
    );

    expect(await readProjectScripts(root)).toEqual({
      setup: "./setup.sh",
      run: "pnpm dev",
      test: "pnpm test",
      teardown: "./down.sh",
    });
  });

  it("ignora espaço em volta do comando", async () => {
    const root = checkout('[scripts]\nrun = "  pnpm dev  "\n');
    expect((await readProjectScripts(root)).run).toBe("pnpm dev");
  });

  /**
   * O caso que o `readProjectId` resolve caindo para regex, e que aqui **não** pode
   * cair: desistir em silêncio de um TOML quebrado é rodar o comando errado, ou
   * nenhum, com a pessoa jurando que declarou.
   */
  it("recusa TOML inválido em vez de fingir que não há scripts", async () => {
    const root = checkout("[scripts\nrun = pnpm dev\n");
    await expect(readProjectScripts(root)).rejects.toBeInstanceOf(DomainError);
  });

  it("recusa `scripts` que não é tabela", async () => {
    const root = checkout('scripts = "pnpm dev"\n');
    await expect(readProjectScripts(root)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("valor que não é texto vira ausência AVISADA, não ausência silenciosa", async () => {
    const root = checkout("[scripts]\nrun = 3\nsetup = true\n");
    const warnings: string[] = [];

    expect(await readProjectScripts(root, { warn: (message) => warnings.push(message) })).toEqual(
      NO_SCRIPTS,
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toContain("scripts.run");
  });

  it("comando vazio é ausência, e também avisa", async () => {
    const root = checkout('[scripts]\nrun = ""\n');
    const warnings: string[] = [];

    expect((await readProjectScripts(root, { warn: (m) => warnings.push(m) })).run).toBeNull();
    expect(warnings[0]).toContain("texto vazio");
  });

  /** S7: cada worktree tem o seu, e é o do checkout que vale. */
  it("lê o arquivo do checkout que recebeu, e não o de outro", async () => {
    const a = checkout('[scripts]\nrun = "pnpm dev"\n');
    const b = checkout('[scripts]\nrun = "cargo run"\n');

    expect((await readProjectScripts(a)).run).toBe("pnpm dev");
    expect((await readProjectScripts(b)).run).toBe("cargo run");
  });

  it("diz onde o arquivo fica mesmo quando ele não existe", () => {
    const root = checkout();
    expect(projectFilePath(root)).toBe(join(root, PROJECT_FILE));
  });
});

describe("writeProjectScripts", () => {
  it("cria o arquivo quando não há nenhum", async () => {
    const root = checkout();

    const written = await writeProjectScripts(root, { run: "pnpm dev" });

    expect(written.run).toBe("pnpm dev");
    expect(parseToml(read(root))).toMatchObject({ scripts: { run: "pnpm dev" } });
  });

  /** A5: o arquivo é do time, e o `id` dele é a identidade do projeto. */
  it("preserva o `id` que já estava lá, byte a byte", async () => {
    const root = checkout('# meu arquivo\nid = "prj_7f3a"\n');

    await writeProjectScripts(root, { setup: "./setup.sh" });

    const text = read(root);
    expect(text).toContain('id = "prj_7f3a"');
    expect(text).toContain("# meu arquivo");
    expect(parseToml(text)).toMatchObject({ id: "prj_7f3a", scripts: { setup: "./setup.sh" } });
  });

  it("substitui a chave que existe e deixa as outras da tabela em paz", async () => {
    const root = checkout('[scripts]\nsetup = "./setup.sh"\nrun = "pnpm dev"\n');

    await writeProjectScripts(root, { run: "pnpm start" });

    expect(parseToml(read(root))).toMatchObject({
      scripts: { setup: "./setup.sh", run: "pnpm start" },
    });
  });

  it("não toca em tabela de outra ferramenta que venha depois", async () => {
    const root = checkout(
      ['id = "prj_1"', "", "[scripts]", 'run = "pnpm dev"', "", "[outra-coisa]", "chave = 1", ""].join("\n"),
    );

    await writeProjectScripts(root, { run: "pnpm start", setup: "./setup.sh" });

    const parsed = parseToml(read(root)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      id: "prj_1",
      scripts: { run: "pnpm start", setup: "./setup.sh" },
      "outra-coisa": { chave: 1 },
    });
  });

  it("remover uma fase apaga a linha dela, e só ela", async () => {
    const root = checkout('[scripts]\nsetup = "./setup.sh"\nrun = "pnpm dev"\n');

    const written = await writeProjectScripts(root, { run: null });

    expect(written.run).toBeNull();
    expect(written.setup).toBe("./setup.sh");
  });

  it("escapa aspas no comando em vez de gravar TOML quebrado", async () => {
    const root = checkout();

    await writeProjectScripts(root, { run: 'echo "oi"' });

    expect(parseToml(read(root))).toMatchObject({ scripts: { run: 'echo "oi"' } });
  });
});
