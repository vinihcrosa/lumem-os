import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { installedStartArgs, parseSmokeArgs } from "./smoke-install.js";

describe("smoke:install", () => {
  it("starts the installed binary with lumem run", () => {
    // `lumem` sem verbo é `lumem start` desde a 038: instala um serviço e volta,
    // sem deixar ao script um processo para esperar nem para matar.
    const args = installedStartArgs(4_397);

    expect(args[0]).toBe("run");
    expect(args).toEqual(["run", "--port", "4397"]);
  });
});

describe("smoke:install arguments", () => {
  it("keeps the bare tarball the release passes, and adds --only", () => {
    // O `release.yml` chama `smoke-install.ts <tarball>` desde antes da 038: continua valendo.
    expect(parseSmokeArgs([])).toEqual({ only: null, tarball: null });
    expect(parseSmokeArgs(["lumem.tgz"])).toEqual({ only: null, tarball: "lumem.tgz" });
    expect(parseSmokeArgs(["--only", "desktop"])).toEqual({ only: "desktop", tarball: null });
    expect(parseSmokeArgs(["--only", "desktop", "app.tgz"])).toEqual({ only: "desktop", tarball: "app.tgz" });
  });

  it("refuses a step it does not have", () => {
    expect(() => parseSmokeArgs(["--only", "nope"])).toThrow("desktop");
  });
});

describe("smoke:install on a bare runner", () => {
  // O `release.yml` roda `npx tsx scripts/smoke-install.ts <tarball>` num runner sem `pnpm install`,
  // de propósito. Um `import` estático de código do workspace passa em toda máquina de quem
  // desenvolve (há `node_modules`) e morre no runner com `ERR_MODULE_NOT_FOUND: @lumem/shared` —
  // foi o que o dry run de 2026-09-30 achou. O passo que precisa do workspace o carrega por
  // `import()` dinâmico, dentro de si, depois do `pnpm install` do job `desktop`.
  const source = readFileSync(join(import.meta.dirname, "smoke-install.ts"), "utf8");

  function staticSpecifiers(code: string): string[] {
    const fromClause = /^\s*(?:import(?!\s+type\b)|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm;
    const bare = /^\s*import\s*["']([^"']+)["']/gm;
    return [...code.matchAll(fromClause), ...code.matchAll(bare)].map((match) => match[1] ?? "");
  }

  it("the default path imports nothing from the workspace", () => {
    const fromWorkspace = staticSpecifiers(source).filter(
      (specifier) => specifier.startsWith("@lumem/") || specifier.includes("packages/"),
    );

    expect(fromWorkspace).toEqual([]);
    // Não basta a busca achar zero: que ela ache os imports que existem, ou o teste não enxerga nada.
    expect(staticSpecifiers(source)).toContain("node:child_process");
  });
});
