import { useState } from "react";

import type { AcpToolKind, AcpToolStatus } from "@lumem/shared";

import type { TerminalView, ToolCallView } from "../lib/conversation-model.js";
import { DiffLines, diffLines, type DiffLine } from "./DiffLines.js";
import { Terminal } from "./Terminal.js";

/**
 * The element that replaces text scrolling past (F2.3).
 *
 * Every decision here came out of the prototype, and three of them are the
 * reason the component is not simply a row of text:
 *
 * - **A 2px bar in the speaker's colour, on the left.** It is what makes one
 *   failure among twenty calls findable at a glance, without reading a label.
 * - **The glyph says the category, the text says the tool.** Read, write, run,
 *   fetch, delegate — five shapes, not one colour per tool. Colour is already
 *   spoken for by state, and an element with two colour axes has none.
 * - **The header is always visible and the body is not.** A4: a `read_file` of
 *   2,000 lines cannot be allowed to push the rest of the conversation off the
 *   screen, so the body is collapsed under a height ceiling and says what it left
 *   out.
 */

/**
 * Category, not tool.
 *
 * Grouped on purpose: the glyph answers "did it read, write, run, fetch or
 * delegate", which is what someone scanning wants, and the verb beside it
 * answers exactly which tool. Nine glyphs would make the column noise.
 */
const KIND_GLYPH: Record<AcpToolKind, string> = {
  read: "▤",
  search: "▤",
  edit: "▣",
  delete: "▣",
  move: "▣",
  execute: "❯",
  fetch: "↓",
  think: "◈",
  switch_mode: "◈",
  other: "◈",
};

/** What the state is called on screen. Portuguese, because the label is ours. */
const STATUS_LABEL: Record<AcpToolStatus, string> = {
  pending: "na fila",
  running: "rodando",
  ok: "ok",
  failed: "falhou",
  cancelled: "interrompido",
};

/** How many lines of text output the card shows before offering the rest. */
export const OUTPUT_LINE_CEILING = 12;

export interface ToolCardProps {
  call: ToolCallView;
  /**
   * Terminals the agent opened, so the card can find its own (F3, A5, D7).
   *
   * Looked up by the id the call's own content names, which means a card shows a
   * terminal only if the tool call said it had one — the conversation's list is
   * shared, and a card guessing from position would show a neighbour's.
   */
  terminals?: readonly TerminalView[];
  /** Opens with the body already expanded. Used by the styleguide. */
  defaultOpen?: boolean;
}

export function ToolCard({ call, terminals = [], defaultOpen = false }: ToolCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const body = bodyOf(call);
  const target = targetOf(call);
  const terminal = terminalOf(call, terminals);

  return (
    <div className={`tc tc--${call.status}`}>
      <div className="tc__head">
        <span className="tc__glyph" aria-hidden="true">
          {KIND_GLYPH[call.kind]}
        </span>
        <span className="tc__verb">{call.name ?? verbFromTitle(call.title)}</span>

        {target ? (
          // The directory yields and the filename does not — until neither fits,
          // at which point the name truncates too. "Never truncate the name" is
          // only a design while there is space; without the fallback it overran
          // the status chip at 360px.
          <span className="tc__target" title={target.full}>
            <span className="tc__dir">{target.dir}</span>
            <span className="tc__name">{target.name}</span>
          </span>
        ) : (
          <span className="tc__arg" title={call.title}>
            {argOf(call)}
          </span>
        )}

        {call.verdict && (
          <span
            className={`verdict verdict--${call.verdict.kind.startsWith("allow") ? "allowed" : "denied"}`}
          >
            {call.verdict.kind.startsWith("allow") ? "✓" : "✕"} {call.verdict.name}
          </span>
        )}

        {(call.added !== null || call.removed !== null) && (
          <span className="tc__delta">
            {call.added ? <span className="plus">+{call.added}</span> : null}
            {call.added && call.removed ? " " : null}
            {call.removed ? <span className="minus">−{call.removed}</span> : null}
          </span>
        )}

        {call.elapsedMs !== null && <span className="tc__time">{formatElapsed(call.elapsedMs)}</span>}

        <span className="tc__st">
          <span className="tc__dot" aria-hidden="true" />
          {STATUS_LABEL[call.status]}
        </span>

        {(body || terminal) && (
          <button
            type="button"
            className="tc__twist focus-ring"
            aria-expanded={open}
            aria-label={open ? "esconder o resultado" : "mostrar o resultado"}
            onClick={() => setOpen(!open)}
          >
            {open ? "▾" : "▸"}
          </button>
        )}
      </div>

      {open && terminal && (
        <div className="tc__body">
          {/*
            The `Terminal` the app already has, unmodified, pointed at the PTY
            session the daemon opened (D7). It lives inside the card because the
            result belongs to the turn that asked for it (A5) — "open in a tab" is
            for the command that turns interactive, which is a later feature.
          */}
          <div className="tc__term">
            <Terminal sessionId={terminal.ptySessionId} />
          </div>
        </div>
      )}

      {open && !terminal && body && (
        <div className="tc__body">
          {body.kind === "diff" ? (
            <DiffLines lines={body.lines} wrap={false} />
          ) : (
            <div className="out">
              {body.lines.map((line, index) => (
                <span className="l" key={index}>
                  {line}
                </span>
              ))}
            </div>
          )}
          {body.hidden > 0 && (
            <div className="tc__more">▾ mostrar as {body.hidden.toLocaleString("pt-BR")} linhas</div>
          )}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- helpers

interface TextBody {
  kind: "text";
  lines: string[];
  hidden: number;
}
interface DiffBody {
  kind: "diff";
  lines: DiffLine[];
  hidden: number;
}

/**
 * What the body shows, and how much it is not showing.
 *
 * A diff wins over text when both are present: a write's diff is the answer, and
 * whatever the tool also printed about it is commentary.
 */
function bodyOf(call: ToolCallView): TextBody | DiffBody | null {
  const diff = call.content.find((item) => item.type === "diff");
  if (diff?.type === "diff") {
    return { kind: "diff", lines: diffLines(diff.oldText, diff.newText), hidden: 0 };
  }

  const text = call.content
    .filter((item): item is Extract<typeof item, { type: "content" }> => item.type === "content")
    .map((item) => item.text)
    .join("");
  if (text === "") return null;

  const all = text.split("\n");
  // The tail, not the head: the end of a test run is the part that says whether
  // it passed. A `vitest` run's first twelve lines are the banner.
  const shown = all.slice(Math.max(0, all.length - OUTPUT_LINE_CEILING));
  return { kind: "text", lines: shown, hidden: all.length - shown.length };
}

/**
 * The terminal this card is about, if it has one.
 *
 * Matched on the id the call's own content names. The conversation keeps one list
 * of terminals for every card, so a card that guessed from position would embed a
 * neighbour's shell.
 */
function terminalOf(
  call: ToolCallView,
  terminals: readonly TerminalView[],
): TerminalView | null {
  const named = call.content.find((item) => item.type === "terminal");
  if (named?.type !== "terminal") return null;
  return terminals.find((terminal) => terminal.terminalId === named.terminalId) ?? null;
}

interface Target {
  dir: string;
  name: string;
  full: string;
}

/**
 * The path this call touched, split so the directory is what gives way.
 *
 * A path cut at the end (`…/__tests__/file-tree-keyboard-nav…`) does not say
 * which file the agent changed, which is the only thing the line has to say.
 */
function targetOf(call: ToolCallView): Target | null {
  const first = call.locations[0];
  if (!first) return null;

  const cut = first.path.lastIndexOf("/");
  if (cut === -1) return { dir: "", name: first.path, full: first.path };
  return {
    dir: first.path.slice(0, cut + 1),
    name: first.path.slice(cut + 1),
    full: first.path,
  };
}

/**
 * What a call without a path is about.
 *
 * The title already reads as a sentence — `Bash pnpm gate:quick` — so the verb is
 * stripped off the front rather than repeated beside it.
 */
function argOf(call: ToolCallView): string {
  const name = call.name;
  if (name && call.title.startsWith(`${name} `)) return call.title.slice(name.length + 1);
  return call.title;
}

/** The first word of the title, when the adapter sent no programmatic name. */
function verbFromTitle(title: string): string {
  const space = title.indexOf(" ");
  return space === -1 ? title : title.slice(0, space);
}

/**
 * Elapsed time the way the prototype writes it.
 *
 * Comma for the decimal separator, and minutes once seconds stop being readable:
 * `221,4 s` is a number nobody converts in their head.
 */
export function formatElapsed(ms: number): string {
  if (ms < 1_000) return `${ms} ms`;

  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1).replace(".", ",")} s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
