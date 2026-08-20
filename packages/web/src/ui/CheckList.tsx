import type { ReactNode } from "react";

/**
 * The four states a check can be in.
 *
 * `running` exists because every screen that shows checks also offers to run
 * them again — without it, "verificar de novo" would either freeze the old
 * answer on screen or blank the list, and both read as the button doing nothing.
 */
export type CheckState = "ok" | "warn" | "fail" | "running";

const GLYPH: Record<CheckState, string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✕",
  running: "◐",
};

export interface CheckRowProps {
  state: CheckState;
  /** What was checked: `git`, `node`, `~/.lumem`. */
  what: string;
  /** What was found. The daemon's value, not a verdict. */
  value: ReactNode;
  /** The verdict, in one or two words: `ok`, `falta`, `vai criar`. */
  status: string;
  /** What to do about it, when there is something to do — a copyable command. */
  action?: ReactNode;
}

/**
 * One line of a preflight, a handshake, or a summary.
 *
 * The colour axis is the state and nothing else: `what` names the category in
 * words, so the glyph and the status word can both ride the single `--ck`
 * variable. An element with two colour axes has none.
 */
export function CheckRow({ state, what, value, status, action }: CheckRowProps) {
  return (
    <div className={`ck ck--${state}`}>
      <span className="ck__glyph" aria-hidden="true">
        {GLYPH[state]}
      </span>
      <span className="ck__what">{what}</span>
      <span className="ck__val">{value}</span>
      <span className="ck__st">{status}</span>
      {action !== undefined && <span className="ck__act">{action}</span>}
    </div>
  );
}

export interface CheckListProps {
  /** Named, because a screen can carry more than one list of checks. */
  label: string;
  children: ReactNode;
}

/** A group of `CheckRow`s, announced as a group so the label is read once. */
export function CheckList({ label, children }: CheckListProps) {
  return (
    <div className="check" role="group" aria-label={label}>
      {children}
    </div>
  );
}
