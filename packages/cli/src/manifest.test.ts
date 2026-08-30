import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LUMEM_VERSION } from "@lumem/shared";
import { describe, expect, it } from "vitest";

/**
 * What gets published, checked as a package rather than as source.
 *
 * Everything here fails in the same place if it regresses: on someone else's
 * machine, after `npm i -g lumem`, with an error that names a file they have
 * never heard of. None of it is visible to typecheck, to the unit suites or to
 * the e2e, because all three run against the repository.
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
  license: string;
  bin: Record<string, string>;
  files: string[];
  engines: { node: string };
  dependencies: Record<string, string>;
};

describe("o manifesto publicado", () => {
  it("declara exatamente as duas dependências nativas", () => {
    // Tudo o mais está dentro do bundle. Uma terceira dependência aqui é uma
    // dependência que alguém esqueceu de bundlar — e ela instala, e quebra no
    // boot da máquina de outra pessoa.
    expect(Object.keys(manifest.dependencies).sort()).toEqual(["better-sqlite3", "node-pty"]);
  });

  it("diz a mesma versão que o daemon reporta", () => {
    expect(manifest.version).toBe(LUMEM_VERSION);
  });

  it("é o pacote que a decisão D1 e a D8 descrevem", () => {
    expect(manifest.name).toBe("lumem");
    expect(manifest.license).toBe("MIT");
    expect(manifest.engines.node).toBe(">=22");
    expect(manifest.bin["lumem"]).toBe("bin/lumem.mjs");
  });
});

describe("o tarball", () => {
  it("leva o binário, o daemon, o web e as migrações", () => {
    // Constrói antes de olhar: o que interessa é o que `npm pack` levaria hoje,
    // e não o que sobrou de um build anterior. Turbo cacheia, então o custo
    // depois da primeira vez é uma consulta.
    execFileSync("pnpm", ["build"], { cwd: repoRoot, stdio: "pipe" });

    const packed = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    const files = (JSON.parse(packed) as [{ files: { path: string }[] }])[0].files.map((f) => f.path);

    expect(files).toContain("bin/lumem.mjs");
    expect(files).toContain("bin/postinstall.mjs");
    expect(files).toContain("dist/server/main.mjs");
    expect(files).toContain("dist/web/index.html");
    expect(files).toContain("README.md");
    expect(files).toContain("LICENSE");
    // Uma migração qualquer não basta: o `drizzle/` inteiro tem que ir, ou o
    // banco do usuário para na versão de esquema que o tarball levou.
    const migrations = files.filter((path) => path.startsWith("drizzle/") && path.endsWith(".sql"));
    expect(migrations.length).toBeGreaterThanOrEqual(10);
    expect(files.some((path) => path.startsWith("dist/web/assets/"))).toBe(true);
  }, 300_000);
});
