import type { ReactNode } from "react";

/** How a listed thing is doing. Maps to a colour in one CSS rule. */
export type ItemState = "running" | "exited" | "failed" | "clean" | "dirty" | "missing";

export interface ItemProps {
  name: string;
  glyph?: ReactNode;
  /** The literal behind the name: a path, a command. Truncates. */
  detail?: string;
  state?: { label: string; tone: ItemState };
  /** Age or distance — `12 min`, `↑2 ↓0`. */
  age?: ReactNode;
  onSelect?: () => void;
  /** A control that must stay outside the row's own button. */
  action?: ReactNode;
}

/**
 * One line of a list in the detail pane — a session, a worktree.
 *
 * Same two-element shape as `Row` and for the same reason: an action inside
 * the row cannot be nested in the row's own button.
 */
export function Item({ name, glyph, detail, state, age, onSelect, action }: ItemProps) {
  const body = (
    <>
      {glyph}
      <span className="item__name">{name}</span>
      {detail !== undefined && (
        // The full value stays reachable when the visible one is truncated.
        <span className="item__detail" title={detail}>
          {detail}
        </span>
      )}
      {state !== undefined && (
        <span className={`item__state state--${state.tone}`}>{state.label}</span>
      )}
      {age !== undefined && <span className="item__age">{age}</span>}
    </>
  );

  return (
    <div className="item">
      {onSelect === undefined ? (
        <span className="item__main">{body}</span>
      ) : (
        <button type="button" className="item__main" onClick={onSelect}>
          {body}
        </button>
      )}
      {action !== undefined && <span className="item__act">{action}</span>}
    </div>
  );
}
