/**
 * The repository's own skills say what they are, cite only commands that exist,
 * and can be seen (T20 of docs/features/024-dev-harness/tasks.md).
 *
 * "Seen" was measured, not assumed: on 2026-09-28 a project skill reached Claude
 * Code **without its description** — listed by name, never triggered by one —
 * because the listing is capped at 1% of the context window and the user-level
 * plugins filled it; Claude Code drops the least-used skills' descriptions
 * first, and a new project skill is always the least used. With
 * `skillListingBudgetFraction: 0.03` in the project settings the description came
 * back (`docs/project/harness-audit.md` §11).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const skillsDir = join(repoRoot, ".claude", "skills");
const ours = readdirSync(skillsDir).filter((name) => name.startsWith("lumem-"));
const scripts = new Set(
  Object.keys((JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts),
);

function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = /^([a-z_-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^'(.*)'$/, "$1");
  }
  return out;
}

describe("as skills do repositório", () => {
  it("existem as três — ADR, feature e Outline", () => {
    expect(ours.sort()).toEqual(["lumem-adr", "lumem-feature", "lumem-outline"]);
  });

  it.each(ours)("%s tem `name` igual à pasta e `description` que cabe no teto de 1536", (skill) => {
    const meta = frontmatter(readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8"));
    expect(meta["name"]).toBe(skill);
    expect(meta["description"]?.length ?? 0).toBeGreaterThan(40);
    expect(meta["description"]?.length ?? 0).toBeLessThanOrEqual(1536);
  });

  it.each(ours)("%s só cita `pnpm <script>` que existe no package.json", (skill) => {
    const files = [join(skillsDir, skill, "SKILL.md")];
    const refs = join(skillsDir, skill, "references");
    if (existsSync(refs)) for (const f of readdirSync(refs)) files.push(join(refs, f));
    const missing = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/pnpm (?:-s )?([a-z][a-z0-9:-]*)/g)]
        .map((m) => m[1] as string)
        .filter((name) => !["install", "exec", "add", "vitest", "dlx", "turbo"].includes(name) && !scripts.has(name))
        .map((name) => `${file.slice(repoRoot.length + 1)} cita \`pnpm ${name}\`, que não existe no package.json`),
    );
    expect(missing.join("\n")).toBe("");
  });

  it.each(ours)("%s: todo link relativo resolve", (skill) => {
    const file = join(skillsDir, skill, "SKILL.md");
    const broken = [...readFileSync(file, "utf8").matchAll(/\]\(([^)#:\s]+)(#[^)]*)?\)/g)]
      .map((m) => m[1] as string)
      .filter((target) => !existsSync(resolve(dirname(file), target)))
      .map((target) => `${skill}/SKILL.md aponta para ${target}, que não existe`);
    expect(broken.join("\n")).toBe("");
  });

  it("o orçamento da lista de skills está acima do default de 1%, senão a descrição de uma skill nova some", () => {
    const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8")) as {
      skillListingBudgetFraction?: number;
    };
    expect(settings.skillListingBudgetFraction ?? 0).toBeGreaterThan(0.01);
  });
});
