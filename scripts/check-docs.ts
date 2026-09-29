/**
 * The documentation gate. Pure and importable; the entry point is
 * `run-check-docs.ts`, and `check-docs.test.ts` runs it against the real tree.
 *
 * It exists because `docs/prd/` became `docs/features/NNN-name/` and nothing in
 * this repository could tell whether the rename was complete. There was no
 * link-checker, no markdown lint, and no assert that a documentation path
 * resolves — and the repository already carried four dead links to a file that
 * never existed, two of them created by tasks marked `[x]` whose job was to
 * propagate a note. The convention failed one in five, silently, for days.
 *
 * Three checks, in order of what they pay for:
 *
 * 1. `broken-link` — a relative link inside the docs surface resolves to a real
 *    file. This is what catches an incomplete rename.
 * 2. `broken-anchor` — a `#heading` fragment resolves to a heading that exists.
 *    `grep` cannot do this, and the anchor is the mechanism of the reversal
 *    note (`.../prd.md#21-isto-reverte-um-requisito-do-walking-skeleton`) — the
 *    pattern the whole precedence rule leans on.
 * 3. The `**Status:**` of a feature, against the disk. Five `prd.md` disagreed
 *    with their own `tasks.md` before this existed, and both root READMEs
 *    published "designed, not built" about a shipped feature.
 *
 * What it deliberately does NOT check, because the check would be wrong here:
 * **checkbox state.** `001-walking-skeleton` shipped with 244 open boxes and
 * `005-file-editor` with 126 — neither ever ticked one — while
 * `023-composer-menus` has none at all. A box is an acceptance criterion, not a
 * progress bar, and `lumem-reviewer.md` already said so: *"não existe convenção
 * de marcar checkbox no `tasks.md`"*. Deriving phase from boxes would mark two
 * delivered features as in-progress forever.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The closed grammar. A fifth value is a decision, not a typo. */
export const STATUS_VALUES = ["proposta", "em execução", "completa"] as const;
/** `superada por <link do ADR>` carries a target, so it is matched, not listed. */
export const SUPERSEDED_PATTERN = /^superada por .*\S/;

export type FindingKind =
  | "broken-link"
  | "broken-anchor"
  | "status-missing"
  | "status-value"
  | "status-disagrees"
  | "status-not-proposta"
  | "stale-code-path"
  | "duplicate-index-row";

export interface Finding {
  kind: FindingKind;
  /** Repository-relative, so the message is clickable from the root. */
  file: string;
  line: number;
  message: string;
}

/** Files whose links are checked. `docs/**` plus the three at the root. */
const ROOT_FILES = ["CLAUDE.md", "README.md", "README.pt-BR.md"];

function markdownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  };
  const docs = join(root, "docs");
  if (existsSync(docs)) walk(docs);
  for (const name of ROOT_FILES) {
    const full = join(root, name);
    if (existsSync(full)) out.push(full);
  }
  return out.sort();
}

/**
 * Blanks out fenced code blocks, keeping the line count so reported lines stay
 * true. A markdown link inside a fence is an example, not a link — this file's
 * own doc comment would otherwise report itself.
 */
export function stripFences(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/**
 * GitHub's heading slug, which is what a `#fragment` in this repository is
 * written against: markdown stripped, lowercased, punctuation dropped, spaces
 * to hyphens, accents kept. Duplicates get `-1`, `-2`, like GitHub.
 *
 * Accents are kept on purpose — the repository has
 * `#q9--onde-o-clone-cai-por-padrão--substituída-pela-q14`, and folding them
 * would report a working anchor as broken.
 */
export function headingSlug(heading: string): string {
  const text = heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]/g, "");
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N} \-_]/gu, "")
    .replace(/ /g, "-");
}

/** Every anchor a file offers, in document order, with GitHub's de-duplication. */
export function anchorsOf(text: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of stripFences(text).split("\n")) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m?.[1] === undefined) continue;
    const base = headingSlug(m[1]);
    if (base === "") continue;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

interface Link {
  target: string;
  line: number;
}

/** Relative links only. `http(s)`, `mailto:` and bare `#fragment` are skipped. */
function linksOf(text: string): Link[] {
  const out: Link[] = [];
  const lines = stripFences(text).split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (target === undefined) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (target.startsWith("#")) continue;
      out.push({ target, line: i + 1 });
    }
  });
  return out;
}

function statusOf(text: string): { value: string; line: number } | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = /\*\*Status:\*\*\s*(.*)$/.exec(line);
    if (m?.[1] !== undefined) return { value: m[1].trim(), line: i + 1 };
  }
  return undefined;
}

function statusIsValid(value: string): boolean {
  return (
    (STATUS_VALUES as readonly string[]).includes(value) ||
    SUPERSEDED_PATTERN.test(value)
  );
}

/** Links and anchors across the whole documentation surface. */
export function checkLinks(root: string): Finding[] {
  const findings: Finding[] = [];
  const anchorCache = new Map<string, Set<string>>();
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file);
    for (const { target, line } of linksOf(text)) {
      const [rawPath, anchor] = target.split("#");
      const pathPart = rawPath ?? "";
      const resolved =
        pathPart === ""
          ? file
          : resolve(dirname(file), decodeURIComponent(pathPart));
      if (!existsSync(resolved)) {
        findings.push({
          kind: "broken-link",
          file: rel,
          line,
          message: `link para \`${target}\` não resolve`,
        });
        continue;
      }
      if (anchor === undefined || anchor === "") continue;
      if (statSync(resolved).isDirectory()) continue;
      if (!resolved.endsWith(".md")) continue;
      let anchors = anchorCache.get(resolved);
      if (anchors === undefined) {
        anchors = anchorsOf(readFileSync(resolved, "utf8"));
        anchorCache.set(resolved, anchors);
      }
      if (!anchors.has(decodeURIComponent(anchor).toLowerCase())) {
        findings.push({
          kind: "broken-anchor",
          file: rel,
          line,
          message: `âncora \`#${anchor}\` não existe em \`${relative(root, resolved)}\``,
        });
      }
    }
  }
  return findings;
}

/**
 * The `**Status:**` of every feature, against the disk.
 *
 * Two directions only, because only two are true. A folder with no `tasks.md`
 * has delivered nothing, so it must say `proposta`. And when both files exist
 * they must agree — which is the check that pays: `013-pull-request-status`
 * declared *"em implementação"* in `prd.md` while its own `tasks.md` said
 * *"completa"*, and `001-walking-skeleton/tasks.md` said *"Draft — aguardando
 * aprovação"* about the 34 tasks the product is built on.
 *
 * The reverse — `tasks.md` present therefore not `proposta` — is NOT checked:
 * `024-dev-harness` has 16 tasks written and none started, and tasks written
 * are not tasks begun.
 */
export function checkStatus(root: string): Finding[] {
  const findings: Finding[] = [];
  const featuresDir = join(root, "docs", "features");
  if (!existsSync(featuresDir)) return findings;
  const features = readdirSync(featuresDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const feature of features) {
    const found: { name: string; value: string; line: number }[] = [];
    // `checks.md` is where a feature's obligations live since the ADR of
    // 2026-09-28-1952 — a new feature has it **instead of** `tasks.md`, and the
    // Status is derived from whichever of the two exists (T21 of the `024`).
    for (const name of ["prd.md", "tasks.md", "checks.md"]) {
      const full = join(featuresDir, feature, name);
      if (!existsSync(full)) continue;
      const rel = `docs/features/${feature}/${name}`;
      const status = statusOf(readFileSync(full, "utf8"));
      if (status === undefined) {
        findings.push({
          kind: "status-missing",
          file: rel,
          line: 1,
          message: "não tem campo `**Status:**`",
        });
        continue;
      }
      if (!statusIsValid(status.value)) {
        findings.push({
          kind: "status-value",
          file: rel,
          line: status.line,
          message:
            `\`${status.value}\` está fora da gramática ` +
            `(${STATUS_VALUES.join(" | ")} | superada por <ADR>)`,
        });
        continue;
      }
      found.push({ name, value: status.value, line: status.line });
    }

    const prd = found.find((f) => f.name === "prd.md");
    for (const plan of found.filter((f) => f.name !== "prd.md")) {
      if (prd !== undefined && prd.value !== plan.value) {
        findings.push({
          kind: "status-disagrees",
          file: `docs/features/${feature}/prd.md`,
          line: prd.line,
          message: `\`${prd.value}\` discorda do \`${plan.name}\`, que diz \`${plan.value}\``,
        });
      }
    }

    const hasPlanFile =
      existsSync(join(featuresDir, feature, "tasks.md")) || existsSync(join(featuresDir, feature, "checks.md"));
    if (!hasPlanFile) {
      for (const f of found) {
        if (f.value !== "proposta") {
          findings.push({
            kind: "status-not-proposta",
            file: `docs/features/${feature}/${f.name}`,
            line: f.line,
            message: `sem \`tasks.md\` nem \`checks.md\`, então \`${f.value}\` só pode ser \`proposta\``,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * A backtick path to code promises the file **exists now**, and an agent that
 * reads one goes to open it (T6 of docs/features/024-dev-harness/tasks.md).
 *
 * Measured on 2026-09-07: 20 of 242 such paths pointed at nothing; on
 * 2026-09-28, after the `032` moved 113 files into `features/<domínio>/`, 121 of
 * 807. The convention that makes the check fair, and that T7 applied: **a
 * historical path loses its backticks**, or points at where the file lives now.
 *
 * Three surfaces are left out, each for a reason that is not "too many hits":
 * - `docs/adr/` — an ADR is never edited after it is written (rule 5), so a path
 *   in it is a fact about its day;
 * - `docs/references/` — they describe the code of **other** products;
 * - a feature whose `**Status:**` is not `completa` — a plan names the files it
 *   is about to create.
 */
export const CODE_PATH = /`((?:packages|scripts|e2e|docs)\/[^`\s*<>{}…]+?\.[A-Za-z]{1,5})`/g;

function featureOf(root: string, file: string): string | null {
  const rel = relative(root, file).split(sep);
  return rel[0] === "docs" && rel[1] === "features" && rel[2] !== undefined ? rel[2] : null;
}

export function checkCodePaths(root: string): Finding[] {
  const findings: Finding[] = [];
  const statusCache = new Map<string, string | undefined>();
  const featureStatus = (feature: string): string | undefined => {
    if (!statusCache.has(feature)) {
      const prd = join(root, "docs", "features", feature, "prd.md");
      const tasks = join(root, "docs", "features", feature, "tasks.md");
      const source = existsSync(prd) ? prd : existsSync(tasks) ? tasks : null;
      statusCache.set(feature, source === null ? undefined : statusOf(readFileSync(source, "utf8"))?.value);
    }
    return statusCache.get(feature);
  };

  for (const file of markdownFiles(root)) {
    const rel = relative(root, file);
    if (rel.startsWith(join("docs", "adr")) || rel.startsWith(join("docs", "references"))) continue;
    const feature = featureOf(root, file);
    if (feature !== null && featureStatus(feature) !== "completa") continue;

    const lines = stripFences(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CODE_PATH)) {
        const target = (match[1] as string).split("#")[0] as string;
        if (existsSync(join(root, target))) continue;
        findings.push({
          kind: "stale-code-path",
          file: rel,
          line: index + 1,
          message:
            `\`${target}\` não existe. Se o arquivo mudou de lugar, aponte para onde ele está; se é histórico, ` +
            "escreva o caminho sem crase — a crase promete que ele existe agora",
        });
      }
    });
  }
  return findings;
}

/**
 * The same target twice in one table of the index — found on 2026-09-28 as the
 * ADR *"agente é sempre ACP"* listed twice in the ADR table, one of them out of
 * chronological order. Per table, and not per file: the same ADR is legitimately
 * linked again from the table of the feature that produced it.
 */
export function checkIndexDuplicates(root: string): Finding[] {
  const index = join(root, "docs", "README.md");
  if (!existsSync(index)) return [];
  const findings: Finding[] = [];
  let seen = new Map<string, number>();
  stripFences(readFileSync(index, "utf8"))
    .split("\n")
    .forEach((line, i) => {
      if (!line.startsWith("|")) {
        seen = new Map();
        return;
      }
      const target = /^\|\s*~*\[[^\]]*\]\(([^)#\s]+)/.exec(line)?.[1];
      if (target === undefined) return;
      const first = seen.get(target);
      if (first !== undefined) {
        findings.push({
          kind: "duplicate-index-row",
          file: "docs/README.md",
          line: i + 1,
          message: `\`${target}\` já está nesta tabela, na linha ${first}`,
        });
      } else seen.set(target, i + 1);
    });
  return findings;
}

export function checkDocs(root: string): Finding[] {
  return [...checkLinks(root), ...checkStatus(root), ...checkCodePaths(root), ...checkIndexDuplicates(root)];
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "docs ok";
  const lines = findings.map(
    (f) => `${f.file}:${f.line}  ${f.kind}: ${f.message}`,
  );
  return [...lines, "", `${findings.length} achado(s)`].join("\n");
}
