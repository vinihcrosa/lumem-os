import type { CSSProperties, ReactNode } from "react";

export interface RowProps {
  /** Nesting level. Drives indentation through the `--depth` custom property. */
  depth: number;
  label: string;
  onSelect: () => void;
  selected?: boolean;
  /** Registered but unusable — a repository off disk, a worktree gone missing. */
  muted?: boolean;
  /** Container rows read a little louder than their children. */
  emphasis?: boolean;
  /**
   * Undefined when the row has no children to reveal. The space is still
   * reserved, so labels of siblings line up whether or not they nest.
   */
  expanded?: boolean;
  onToggle?: () => void;
  glyph?: ReactNode;
  /**
   * What the count is counting.
   *
   * `asking` outranks `running` for the same reason it does on a tab: a worktree
   * with one session waiting on an answer and two busy ones needs the sidebar to
   * say the first thing, because that is the one that will not finish on its own.
   */
  countTone?: "running" | "asking";
  /** Trailing note: a count, `ausente`, `saiu`. */
  meta?: ReactNode;
  /**
   * How many sessions are running in here.
   *
   * Replaces the pip the tree used to carry. With the sessions gone from the
   * tree, "something is alive in there" stops being enough — the row is now the
   * only place that can say how much.
   */
  count?: number;
}

/**
 * One line of the sidebar tree — project, worktree or session alike.
 *
 * Two sibling buttons rather than one, because expanding and selecting are
 * different actions and a `button` inside a `button` is invalid HTML. The
 * background and hover live on the container so the pair still reads as a
 * single line.
 */
export function Row({
  depth,
  label,
  onSelect,
  selected = false,
  muted = false,
  emphasis = false,
  expanded,
  onToggle,
  glyph,
  meta,
  count,
  countTone = "running",
}: RowProps) {
  const classes = [
    "row",
    selected ? "row--selected" : "",
    muted ? "row--muted" : "",
    emphasis ? "row--emphasis" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const twistable = expanded !== undefined && onToggle !== undefined;

  return (
    <div className={classes} style={{ "--depth": depth } as CSSProperties}>
      {twistable ? (
        <button
          type="button"
          className="row__twist"
          aria-expanded={expanded}
          aria-label={`${expanded ? "recolher" : "expandir"} ${label}`}
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>
      ) : (
        <span className="row__twist row__twist--empty" aria-hidden="true" />
      )}

      <button type="button" className="row__main" aria-current={selected} onClick={onSelect}>
        {glyph}
        <span className="row__label">{label}</span>
        {meta !== undefined && <span className="row__meta">{meta}</span>}
        {/* Text, not a live region: a `status` inside a button would announce
            itself as part of the button's own name every time focus lands. As
            hidden text it still reaches a screen reader, once, in order. */}
        {count !== undefined && count > 0 && (
          <span className={`row__count row__count--${countTone}`}>
            <span className="row__count__dot" aria-hidden="true" />
            {count}
            <span className="sr-only">
              {countTone === "asking"
                ? count === 1
                  ? " sessão esperando permissão"
                  : " sessões esperando permissão"
                : count === 1
                  ? " sessão rodando"
                  : " sessões rodando"}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
