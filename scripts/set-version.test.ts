import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setVersion, VERSION_FILES } from "./set-version.js";

let root: string;

function write(relative: string, contents: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lumem-version-"));
  write("packages/shared/src/constants.ts", 'export const LUMEM_VERSION = "0.0.0";\n');
  write("packages/shared/package.json", '{\n  "name": "@lumem/shared",\n  "version": "0.0.0"\n}\n');
  write("packages/cli/package.json", '{\n  "name": "lumem",\n  "version": "0.0.0"\n}\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("setVersion", () => {
  it("escreve os três lugares", () => {
    setVersion(root, "0.2.0");

    expect(readFileSync(join(root, "packages/shared/src/constants.ts"), "utf8")).toContain(
      'LUMEM_VERSION = "0.2.0"',
    );
    expect(readFileSync(join(root, "packages/shared/package.json"), "utf8")).toContain('"0.2.0"');
    expect(readFileSync(join(root, "packages/cli/package.json"), "utf8")).toContain('"0.2.0"');
  });

  it("aceita prerelease", () => {
    expect(() => setVersion(root, "0.2.0-rc.1")).not.toThrow();
  });

  it("recusa versão torta antes de escrever qualquer coisa", () => {
    // O ponto do "antes": metade dos arquivos escritos deixa o repositório
    // afirmando duas versões ao mesmo tempo, e o teste que compara as duas passa
    // a falhar sem dizer quem mentiu.
    expect(() => setVersion(root, "v0.2")).toThrow(/versão inválida/);
    expect(readFileSync(join(root, "packages/cli/package.json"), "utf8")).toContain("0.0.0");
  });

  it("os três caminhos existem de verdade neste repositório", () => {
    // Guarda contra o modo de falhar mais bobo: renomear um arquivo e descobrir
    // no dia do release que o script escrevia num caminho que não existe mais.
    const repo = fileURLToPath(new URL("..", import.meta.url));

    for (const file of VERSION_FILES) {
      expect(() => readFileSync(join(repo, file.path), "utf8"), file.path).not.toThrow();
    }
  });
});
