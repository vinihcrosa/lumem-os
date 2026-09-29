/**
 * The markdown reading the three feature-flow validators share.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0. The originals are `validate_plan.py`, `validate_checks.py` and
 * `validate_verification.py`, each carrying its own copy of these helpers; here
 * they live once, and each validator states where it differs.
 *
 * Everything reads markdown text and nothing reads the codebase, like the
 * originals: that is what keeps the gates stack-agnostic, and it is also what
 * lets every function here be pure.
 */

export type Level = "error" | "warn";

export interface Finding {
  level: Level;
  /**
   * 1-based line in the validated artifact. A finding about something that is
   * *absent* — a section, a `Profile:` line, the whole file — has no line of
   * its own, and reports line 1, where the reader starts looking.
   */
  line: number;
  /** Stable id of the rule that fired, so a test can say which one it proved. */
  rule: string;
  message: string;
}

/** The word class of Python's `re` on `str`: letters, digits and `_`, in any script. */
const WORD = String.raw`\p{L}\p{N}_`;
const BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;

/**
 * A regular expression with Python's Unicode semantics for `\b` and `\w`.
 *
 * The originals are Python, where `\b` and `\w` know that `á` is a letter; in
 * JavaScript they are ASCII-only even under the `u` flag. The rules would read
 * the same on English prose and differently on Portuguese — `## Problemática`
 * matches `^## Problem\b` in JavaScript, because `á` is a boundary there, and
 * does not in Python. The plan here is written in Portuguese, so the port keeps
 * Python's reading. `\w` must not be written inside a character class: nesting
 * a class is not valid without the `v` flag, so those spell `\p{L}\p{N}_` out.
 */
export function re(source: string, flags = ""): RegExp {
  const body = source.replaceAll(String.raw`\b`, BOUNDARY).replaceAll(String.raw`\w`, `[${WORD}]`);
  return new RegExp(body, flags.includes("u") ? flags : `${flags}u`);
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Python's `str.strip(chars)`: removes any of `chars` from both ends. */
export function stripChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text.charAt(start))) start += 1;
  while (end > start && chars.includes(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

export function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|+|\|+$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/**
 * Blanks fenced code blocks, keeping the line count so reported lines stay true.
 *
 * A template example pasted inside a fence must not be parsed as content. Fences
 * whose info string is in `keep` survive: in the plan a mermaid `erDiagram` is
 * content, not an example, and the columns rule has to see inside it.
 */
export function stripFences(lines: readonly string[], keep: readonly string[] = []): string[] {
  let fenceInfo: string | null = null;
  return lines.map((line) => {
    const stripped = line.trim();
    if (stripped.startsWith("```")) {
      fenceInfo = fenceInfo === null ? stripChars(stripped, "`").trim().toLowerCase() : null;
      return "";
    }
    return fenceInfo === null || keep.includes(fenceInfo) ? line : "";
  });
}

/** Body of a section: `start` is the 0-based index right after the heading, `end` exclusive. */
export interface Bounds {
  start: number;
  end: number;
}

/** 1-based line of the heading that opens `bounds`. */
export function headingLine(bounds: Bounds): number {
  return bounds.start;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The first heading (levels 1–4) matching any of `names`, up to the next level 1
 * or 2 heading. Only a top-level heading closes it, so `### S1` inside
 * `## Criteria` stays inside.
 */
export function sectionBounds(lines: readonly string[], names: string | readonly string[]): Bounds | null {
  const list = typeof names === "string" ? [names] : names;
  const heading = re(String.raw`^#{1,4}\s+(?:` + list.map(escapeRegExp).join("|") + String.raw`)\b.*$`, "i");
  const at = lines.findIndex((line) => heading.test(line.trim()));
  if (at === -1) return null;
  const start = at + 1;
  let end = lines.length;
  for (let j = start; j < lines.length; j += 1) {
    if (/^#{1,2}\s+\S/.test(lines[j] ?? "")) {
      end = j;
      break;
    }
  }
  return { start, end };
}

/** Non-blank, trimmed lines of a section. */
export function sectionBody(lines: readonly string[], bounds: Bounds): string[] {
  return lines
    .slice(bounds.start, bounds.end)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export interface Row {
  cells: string[];
  /** 1-based. */
  line: number;
}

/**
 * Data rows of the FIRST contiguous table in a section, header dropped.
 *
 * Scoping to the first table matters: a section may carry a second table (an
 * unresolved-questions table under Assumptions), and validating its rows against
 * the first table's column meaning produces false errors.
 */
export function firstTable(lines: readonly string[], bounds: Bounds | null): Row[] {
  if (!bounds) return [];
  const rows: Row[] = [];
  let started = false;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const stripped = (lines[i] ?? "").trim();
    if (stripped.startsWith("|")) {
      started = true;
      if (!isSeparator(stripped)) rows.push({ cells: splitRow(stripped), line: i + 1 });
    } else if (started && stripped !== "") {
      break;
    }
  }
  return rows.slice(1);
}

export interface Table {
  /** Header cells, lowercased. */
  header: string[];
  rows: Row[];
}

/** Every table in the file with at least a header and one data row. */
export function findTables(lines: readonly string[]): Table[] {
  const tables: Table[] = [];
  let buffer: Row[] = [];
  const flush = () => {
    const [head, ...rows] = buffer;
    if (head && rows.length > 0) tables.push({ header: head.cells.map((c) => c.toLowerCase()), rows });
    buffer = [];
  };
  lines.forEach((line, i) => {
    const stripped = line.trim();
    if (stripped.startsWith("|")) {
      if (!isSeparator(stripped)) buffer.push({ cells: splitRow(stripped), line: i + 1 });
      return;
    }
    flush();
  });
  flush();
  return tables;
}

/** Whether any heading (levels 1–4) starts with one of `names`. */
export function hasHeading(lines: readonly string[], ...names: string[]): boolean {
  const patterns = names.map((name) => re(String.raw`^#{1,4}\s+` + escapeRegExp(name) + String.raw`\b`, "i"));
  return lines.some((line) => patterns.some((p) => p.test(line.trim())));
}

/** `Profile: standard`, `**Profile**: ui` — the same shape in all three artifacts. */
export const PROFILE_LINE = re(String.raw`^\**Profile\**\s*:\s*` + "`?" + String.raw`(\w+)` + "`?", "i");

/** The first `Profile:` line: the value, lowercased, and its 1-based line. */
export function declaredProfile(lines: readonly string[]): { profile: string; line: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const match = PROFILE_LINE.exec((lines[i] ?? "").trim());
    if (match?.[1]) return { profile: match[1].toLowerCase(), line: i + 1 };
  }
  return null;
}

/** A cell or line that is still the template's `[...]` or `<...>`. */
export const PLACEHOLDER = re(String.raw`^\s*[\[<].+[\]>]\s*$`);

/** Python's `text[:n]`, for the excerpts messages quote. */
export function excerpt(text: string, n: number): string {
  return text.slice(0, n);
}
