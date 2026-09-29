/**
 * The documentation gate, over fixtures and over the real tree.
 *
 * The real-tree test at the bottom is the gate. The fixture tests exist because
 * a gate that has never been red is a gate that checks nothing — and this one
 * was green on its first run against the repository, so every check is proved
 * by making it fail on purpose.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anchorsOf,
  checkDocs,
  checkCodePaths,
  checkIndexDuplicates,
  checkLinks,
  checkStatus,
  formatFindings,
  headingSlug,
  stripFences,
} from "./check-docs.js";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "check-docs-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const feature = (status: string) => `# PRD — x\n\n> **Status:** ${status}\n`;
const tasks = (status: string) => `# x — Tasks\n\n**Status:** ${status}\n`;

describe("headingSlug", () => {
  it("matches GitHub on the anchor shapes this repository actually uses", () => {
    // A real anchor from 011-project-from-url, pointing into 001-walking-skeleton.
    expect(headingSlug("2.1 Isto reverte um requisito do walking-skeleton")).toBe(
      "21-isto-reverte-um-requisito-do-walking-skeleton",
    );
    // Markdown is stripped before slugging.
    expect(headingSlug("**Q3** — o `portão` de escrita")).toBe(
      "q3--o-portão-de-escrita",
    );
    expect(headingSlug("[x] Q1 — De onde vem o dado")).toBe(
      "x-q1--de-onde-vem-o-dado",
    );
  });

  it("keeps accents, because folding them would break a working anchor", () => {
    // 011-project-from-url has #q9--onde-o-clone-cai-por-padrão--substituída-pela-q14
    expect(headingSlug("Onde o clone cai por padrão")).toBe(
      "onde-o-clone-cai-por-padrão",
    );
  });
});

describe("anchorsOf", () => {
  it("de-duplicates like GitHub, so the second `## Bom` is `bom-1`", () => {
    expect(anchorsOf("## Bom\n\n## Bom\n\n## Bom\n")).toEqual(
      new Set(["bom", "bom-1", "bom-2"]),
    );
  });

  it("ignores a heading inside a fence", () => {
    expect(anchorsOf("## Real\n\n```md\n## Exemplo\n```\n")).toEqual(
      new Set(["real"]),
    );
  });
});

describe("stripFences", () => {
  it("keeps the line count, so a reported line number is still true", () => {
    const text = "a\n```\nb\n```\nc";
    expect(stripFences(text).split("\n")).toHaveLength(5);
    expect(stripFences(text).split("\n")[4]).toBe("c");
  });
});

describe("checkLinks", () => {
  it("reports a relative link that does not resolve", () => {
    const root = tree({ "docs/a.md": "[b](b.md)\n" });
    expect(checkLinks(root)).toMatchObject([
      { kind: "broken-link", file: "docs/a.md", line: 1 },
    ]);
  });

  it("reports an anchor the target file does not offer", () => {
    const root = tree({
      "docs/a.md": "[b](b.md#nao-existe)\n",
      "docs/b.md": "## Existe\n",
    });
    expect(checkLinks(root)).toMatchObject([
      { kind: "broken-anchor", file: "docs/a.md", line: 1 },
    ]);
  });

  it("accepts an anchor that resolves, including across a directory", () => {
    const root = tree({
      "docs/features/001-a/prd.md": "[b](../002-b/prd.md#21-isto-reverte)\n",
      "docs/features/002-b/prd.md": "### 2.1 Isto reverte\n",
    });
    expect(checkLinks(root)).toEqual([]);
  });

  it("skips external schemes and bare fragments", () => {
    const root = tree({
      "docs/a.md": "[x](https://e.com/y) [y](mailto:a@b.c) [z](#local)\n",
    });
    expect(checkLinks(root)).toEqual([]);
  });

  it("does not report a link written inside a fence as an example", () => {
    const root = tree({ "docs/a.md": "```md\n[b](nao-existe.md)\n```\n" });
    expect(checkLinks(root)).toEqual([]);
  });

  it("checks the three files at the root, not only docs/", () => {
    const root = tree({ "CLAUDE.md": "[x](docs/nao-existe.md)\n" });
    expect(checkLinks(root)).toMatchObject([
      { kind: "broken-link", file: "CLAUDE.md" },
    ]);
  });
});

describe("checkStatus", () => {
  it("accepts the closed grammar", () => {
    for (const value of ["proposta", "em execução", "completa"]) {
      const files: Record<string, string> = {
        "docs/features/001-a/prd.md": feature(value),
      };
      if (value !== "proposta") files["docs/features/001-a/tasks.md"] = tasks(value);
      expect(checkStatus(tree(files))).toEqual([]);
    }
  });

  it("accepts `superada por` when it carries a target", () => {
    const root = tree({
      "docs/features/001-a/prd.md": feature("superada por [x](../../adr/y.md)"),
      "docs/features/001-a/tasks.md": tasks("superada por [x](../../adr/y.md)"),
    });
    expect(checkStatus(root)).toEqual([]);
  });

  it("rejects `superada por` with nothing after it", () => {
    const root = tree({ "docs/features/001-a/prd.md": feature("superada por") });
    expect(checkStatus(root)).toMatchObject([{ kind: "status-value" }]);
  });

  it("rejects prose outside the grammar — the shape all 45 old values had", () => {
    const root = tree({
      "docs/features/001-a/prd.md": feature("decisões fechadas, pronto pra revisão final"),
      "docs/features/001-a/tasks.md": tasks("Draft — aguardando aprovação"),
    });
    expect(checkStatus(root).map((f) => f.kind)).toEqual([
      "status-value",
      "status-value",
    ]);
  });

  it("reports the two files disagreeing — the pull-request-status defect", () => {
    const root = tree({
      "docs/features/013-pr/prd.md": feature("em execução"),
      "docs/features/013-pr/tasks.md": tasks("completa"),
    });
    expect(checkStatus(root)).toMatchObject([
      {
        kind: "status-disagrees",
        file: "docs/features/013-pr/prd.md",
        message: expect.stringContaining("completa"),
      },
    ]);
  });

  it("requires `proposta` when there is no tasks.md", () => {
    const root = tree({ "docs/features/019-a/prd.md": feature("completa") });
    expect(checkStatus(root)).toMatchObject([{ kind: "status-not-proposta" }]);
  });

  it("allows `proposta` with a tasks.md, because written tasks are not begun tasks", () => {
    // 024-dev-harness: 16 tasks written, none started.
    const root = tree({
      "docs/features/024-a/prd.md": feature("proposta"),
      "docs/features/024-a/tasks.md": tasks("proposta"),
    });
    expect(checkStatus(root)).toEqual([]);
  });

  it("reports a missing Status field", () => {
    const root = tree({ "docs/features/001-a/prd.md": "# PRD — x\n" });
    expect(checkStatus(root)).toMatchObject([
      { kind: "status-missing", file: "docs/features/001-a/prd.md" },
    ]);
  });

  it("ignores checkbox state entirely, in both directions", () => {
    // 001-walking-skeleton shipped with 244 open boxes; 003-worktree-tabs has
    // 44 ticked. Neither says anything about the phase.
    const open = tree({
      "docs/features/001-a/prd.md": feature("completa"),
      "docs/features/001-a/tasks.md": `${tasks("completa")}\n- [ ] um\n- [ ] dois\n`,
    });
    expect(checkStatus(open)).toEqual([]);
    const ticked = tree({
      "docs/features/001-a/prd.md": feature("em execução"),
      "docs/features/001-a/tasks.md": `${tasks("em execução")}\n- [x] um\n`,
    });
    expect(checkStatus(ticked)).toEqual([]);
  });
});

describe("checkStatus, com o checks.md do fluxo novo", () => {
  it("uma feature com prd.md e checks.md pode estar em execução", () => {
    const root = tree({
      "docs/features/040-new/prd.md": "**Status:** em execução\n",
      "docs/features/040-new/checks.md": "**Status:** em execução\n",
    });
    expect(checkStatus(root)).toEqual([]);
  });

  it("sem tasks.md nem checks.md, só pode ser proposta", () => {
    const root = tree({ "docs/features/040-new/prd.md": "**Status:** em execução\n" });
    expect(checkStatus(root).map((f) => f.kind)).toEqual(["status-not-proposta"]);
  });

  it("o prd.md discordando do checks.md é reportado", () => {
    const root = tree({
      "docs/features/040-new/prd.md": "**Status:** completa\n",
      "docs/features/040-new/checks.md": "**Status:** em execução\n",
    });
    expect(checkStatus(root).map((f) => f.kind)).toEqual(["status-disagrees"]);
  });
});

describe("checkCodePaths", () => {
  const done = "# PRD\n\n**Status:** completa\n";
  it("reports a backtick path to code that does not exist, in a finished feature", () => {
    const root = tree({
      "docs/features/001-a/prd.md": `${done}\nO arquivo \`packages/web/src/Gone.tsx\` foi criado.\n`,
      "docs/features/001-a/tasks.md": "**Status:** completa\n",
    });
    const findings = checkCodePaths(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("stale-code-path");
    expect(findings[0]?.message).toContain("packages/web/src/Gone.tsx");
  });

  it("accepts a path that exists, and a historical one written without backticks", () => {
    const root = tree({
      "packages/web/src/Here.tsx": "",
      "docs/project/x.md": "Vive em `packages/web/src/Here.tsx`; antes, em packages/web/src/Gone.tsx.\n",
    });
    expect(checkCodePaths(root)).toEqual([]);
  });

  it("does not check a plan — a feature that is not `completa` names files it is about to create", () => {
    const root = tree({
      "docs/features/002-b/prd.md": "**Status:** em execução\n\nCria `scripts/new-thing.ts`.\n",
      "docs/features/002-b/tasks.md": "**Status:** em execução\n",
    });
    expect(checkCodePaths(root)).toEqual([]);
  });

  it("does not check an ADR, which is never edited, nor a reference, which describes another product", () => {
    const root = tree({
      "docs/adr/2026-01-01-0000-x.md": "Apaga `scripts/design-sync.ts`.\n",
      "docs/references/other.md": "Lá existe `packages/desktop/src/main.ts`.\n",
    });
    expect(checkCodePaths(root)).toEqual([]);
  });

  it("ignores a build output, which exists only after a build", () => {
    const root = tree({ "docs/project/x.md": "O bundle sai em `packages/server/dist/server/main.mjs`.\n" });
    expect(checkCodePaths(root)).toEqual([]);
  });

  it("ignores a path inside a fence", () => {
    const root = tree({ "docs/project/x.md": "```\n`packages/web/src/Gone.tsx`\n```\n" });
    expect(checkCodePaths(root)).toEqual([]);
  });
});

describe("checkIndexDuplicates", () => {
  it("reports the same target twice in one table of the index", () => {
    const root = tree({ "docs/README.md": "| a | b |\n|---|---|\n| [x](adr/x.md) | 1 |\n| [x de novo](adr/x.md) | 2 |\n" });
    expect(checkIndexDuplicates(root).map((f) => f.line)).toEqual([4]);
  });

  it("accepts the same target in two different tables", () => {
    const root = tree({ "docs/README.md": "| [x](adr/x.md) | 1 |\n\ntexto\n\n| [o ADR](adr/x.md) | 2 |\n" });
    expect(checkIndexDuplicates(root)).toEqual([]);
  });
});

describe("formatFindings", () => {
  it("says ok when there is nothing, and counts when there is", () => {
    expect(formatFindings([])).toBe("docs ok");
    const out = formatFindings([
      { kind: "broken-link", file: "docs/a.md", line: 7, message: "x" },
    ]);
    expect(out).toContain("docs/a.md:7");
    expect(out).toContain("1 achado(s)");
  });
});

describe("the real documentation tree", () => {
  it("has no broken link, no broken anchor and no Status that disagrees with disk", () => {
    // This is the gate. It was red in 45 places before the Status was
    // normalised, and the four dead links to a worktree-tabs prd.md that never
    // existed lived here for days with nothing to notice them.
    const root = join(__dirname, "..");
    const findings = checkDocs(root);
    expect(formatFindings(findings)).toBe("docs ok");
  });
});
