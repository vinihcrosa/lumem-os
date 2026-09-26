/**
 * How a diff looks, in one place.
 *
 * Extracted from `PatchViewer` when the conversation needed the same thing: A4
 * decided a tool call's write is rendered by the component the right panel
 * already has, and two renderers that have to agree about what a removed line
 * looks like are two renderers that will eventually disagree.
 *
 * The split is between *reading* a diff and *painting* one. `PatchViewer` fetches
 * a unified diff from git and parses it; the conversation is handed two versions
 * of a file by the agent. Only the painting is shared.
 */

export type DiffLine =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "context"; text: string };

export interface DiffLinesProps {
  lines: readonly DiffLine[];
  /** Off inside a tool card, where the body has a height ceiling. */
  wrap?: boolean;
}

export function DiffLines({ lines, wrap = true }: DiffLinesProps) {
  return (
    <div className={`patch${wrap ? "" : " patch--nowrap"}`}>
      {lines.map((line, index) =>
        line.kind === "hunk" ? (
          <div className="hunk" key={index}>
            {line.text}
          </div>
        ) : (
          <div
            className={`dl${line.kind === "add" ? " dl--add" : line.kind === "del" ? " dl--del" : ""}`}
            key={index}
          >
            <span className="dl__sig" aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
            </span>
            <span className="dl__t">{line.text}</span>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Two versions of a file as lines to paint.
 *
 * Not a real diff, and deliberately not: this is the body of a card with a
 * height ceiling, and the prototype already chose what it shows — the removed
 * lines, then the added ones, grouped rather than interleaved. Anyone who wants
 * to read the change properly opens the file.
 *
 * What it does do is trim the common prefix and suffix, which is what makes a
 * one-line edit show as one line instead of the whole file twice. That is the
 * cheap half of a diff and it covers the case that actually happens; an LCS
 * would buy interleaving this view does not use.
 */
export function diffLines(oldText: string | null | undefined, newText: string): DiffLine[] {
  const before = splitLines(oldText ?? "");
  const after = splitLines(newText);

  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;

  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }

  const removed = before.slice(head, before.length - tail);
  const added = after.slice(head, after.length - tail);

  const lines: DiffLine[] = [];
  // The unchanged head is summarised rather than shown: the card says which file
  // this is, and repeating its untouched top is the one thing the ceiling should
  // spend no rows on.
  if (head > 0) lines.push({ kind: "context", text: `… ${head} linha(s) acima, sem mudança` });
  for (const text of removed) lines.push({ kind: "del", text });
  for (const text of added) lines.push({ kind: "add", text });
  if (tail > 0) lines.push({ kind: "context", text: `… ${tail} linha(s) abaixo, sem mudança` });

  return lines;
}

/** A file that ends with a newline has no empty last line. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const split = text.split("\n");
  if (split.at(-1) === "") split.pop();
  return split;
}
