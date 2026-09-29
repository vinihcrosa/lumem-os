import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { belowFloor, scoreOf, scoresOf } from "./mutation-floor.js";
import { MUTATION_FLOORS } from "./mutation-floors.js";

const repoRoot = join(import.meta.dirname, "..");

describe("o piso de mutação, por arquivo", () => {
  it("o score conta morto e timeout como detectado, e ignora o que nem compilou", () => {
    expect(scoreOf([{ status: "Killed" }, { status: "Timeout" }, { status: "Survived" }, { status: "NoCoverage" }])).toBe(50);
    expect(scoreOf([{ status: "Killed" }, { status: "CompileError" }])).toBe(100);
    expect(scoreOf([{ status: "Ignored" }])).toBeNull();
  });

  it("um arquivo abaixo do piso é acusado com o nome e os dois números", () => {
    const report = { files: { "a.ts": { mutants: [{ status: "Killed" }, { status: "Survived" }] } } };
    const problems = belowFloor(scoresOf(report), { "a.ts": 60 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("a.ts: 50 < piso 60");
  });

  it("um arquivo que sumiu do relatório também é acusado — piso sem score não passa", () => {
    expect(belowFloor({}, { "a.ts": 10 })).toHaveLength(1);
  });

  it("todo piso aponta para um arquivo que existe, e fica entre 0 e 100", () => {
    const problems = Object.entries(MUTATION_FLOORS)
      .filter(([file, floor]) => !existsSync(join(repoRoot, file)) || floor < 0 || floor > 100)
      .map(([file]) => file);
    expect(problems).toEqual([]);
  });

  it("o gate:mutation cerca a busca de repositório do git no sandbox", () => {
    // Sem o teto, um mutante de `server/src/git/` que troca o `cwd` fez o git subir do sandbox até este
    // repositório e reescrever o `origin` (testing.md, armadilhas).
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["gate:mutation"]).toMatch(/GIT_CEILING_DIRECTORIES="\$PWD\/\.stryker-tmp"/);
  });

  it("o workflow semanal roda o piso depois do Stryker, e nunca numa PR", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/mutation.yml"), "utf8");
    expect(workflow).toContain("scripts/mutation-floor.ts");
    expect(workflow).not.toMatch(/pull_request/);
  });
});
