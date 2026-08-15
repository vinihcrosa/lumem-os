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
  /** Trailing note: a count, `ausente`, `saiu`. */
  meta?: ReactNode;
  /** Something is running inside a node that is currently closed. */
  pip?: boolean;
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
  pip = false,
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
        {pip && (
          <span className="row__pip">
            <span className="sr-only">sessão rodando</span>
          </span>
        )}
      </button>
    </div>
  );
}
