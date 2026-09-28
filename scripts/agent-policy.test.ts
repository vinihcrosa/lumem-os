/**
 * The agent policy is a file of this repository, and this test is what keeps it
 * one (T4 of docs/features/024-dev-harness/tasks.md).
 *
 * Before it, the whole policy lived in `~/.claude/settings.json` — 103 `allow`
 * and zero `deny`, owned by one machine. A `deny` that disappears in a refactor
 * would leave nothing red; now it names itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DENY_FLOOR } from "./harness/policy.js";

const repoRoot = join(import.meta.dirname, "..");

interface ProjectSettings {
  permissions?: { deny?: string[]; allow?: string[] };
}

function projectSettings(): ProjectSettings {
  return JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8")) as ProjectSettings;
}

describe("a política do agente é do repositório", () => {
  it("todo `deny` do piso está no `.claude/settings.json`", () => {
    const deny = new Set(projectSettings().permissions?.deny ?? []);
    const missing = DENY_FLOOR.filter(({ rule }) => !deny.has(rule)).map(
      ({ rule, reason }) => `falta \`${rule}\` em .claude/settings.json — ${reason}`,
    );
    expect(missing.join("\n")).toBe("");
  });

  it("nenhum `deny` do `.claude/settings.json` existe sem motivo em `scripts/harness/policy.ts`", () => {
    const known = new Set(DENY_FLOOR.map(({ rule }) => rule));
    const unexplained = (projectSettings().permissions?.deny ?? [])
      .filter((rule) => !known.has(rule))
      .map((rule) => `\`${rule}\` está no settings e não tem motivo em DENY_FLOOR`);
    expect(unexplained.join("\n")).toBe("");
  });

  it("nenhuma regra de caminho usa `Write(...)`, que o Claude Code aceita e nunca consulta", () => {
    const settings = projectSettings();
    const all = [...(settings.permissions?.deny ?? []), ...(settings.permissions?.allow ?? [])];
    const ignored = all
      .filter((rule) => /^(Write|MultiEdit|NotebookEdit)\(.+\)$/.test(rule))
      .map((rule) => `\`${rule}\` não tem efeito: use \`Edit(...)\` no lugar`);
    expect(ignored.join("\n")).toBe("");
  });

  it("todo comando de Bash do piso tem as duas formas, a exata e o prefixo com espaço", () => {
    const rules = new Set(DENY_FLOOR.map(({ rule }) => rule));
    const halves = [...rules]
      .filter((rule) => rule.startsWith("Bash(") && !rule.endsWith(" *)"))
      .filter((rule) => !rules.has(rule.replace(/\)$/, " *)")))
      .map((rule) => `\`${rule}\` sem a forma \`… *)\`: um comando com argumento passaria`);
    expect(halves.join("\n")).toBe("");
  });
});
