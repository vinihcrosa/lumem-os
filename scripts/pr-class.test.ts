import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classify, labelOf } from "./pr-class.js";

describe("a classe de N3 de uma PR", () => {
  it.each([
    [["docs/features/024-dev-harness/tasks.md", "CLAUDE.md"], "docs"],
    [["packages/web/src/styles/tokens.css", "packages/web/src/styles/tokens.ts"], "css-token"],
    [["packages/web/src/features/checkout/right-panel.css"], "css-token"],
    [["pnpm-lock.yaml", "packages/server/package.json"], "dependência"],
  ] as const)("%j → %s", (paths, expected) => {
    expect(classify(paths)).toBe(expected);
  });

  it.each([
    [["docs/x.md", "packages/server/src/x.ts"]],
    [["packages/web/src/styles/tokens.css", "packages/web/src/App.tsx"]],
    [["pnpm-lock.yaml", "docs/x.md"]],
    [["packages/server/src/x.ts"]],
    [[]],
  ] as const)("a mistura, o código e a PR vazia não têm classe: %j", (paths) => {
    expect(classify(paths)).toBe("sem classe");
  });

  it("o rótulo diz a classe, e `sem classe` é rótulo também", () => {
    expect(labelOf("docs")).toBe("N3: docs");
    expect(labelOf("sem classe")).toBe("sem classe");
  });

  it("o workflow roda este script, e só ele tem permissão de escrever na PR", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", ".github/workflows/pr-signals.yml"), "utf8");
    expect(workflow).toContain("scripts/pr-class.ts");
    expect(workflow).toMatch(/pull-requests:\s*write/);
    const ci = readFileSync(join(import.meta.dirname, "..", ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toMatch(/pull-requests:\s*write/);
  });
});
