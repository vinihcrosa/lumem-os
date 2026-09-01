import type { ReactNode } from "react";

/**
 * What the tab's dot reports.
 *
 * `asking` is not a session state — a session waiting on permission is still
 * running. It is here because it *replaces* the running dot: a tab cannot show
 * two dots, and "someone has to answer me" outranks "I am busy" (F2.4, A10).
 *
 * `dirty` is not a session state at all. It belongs to the checkout's own tab,
 * which is not a session, and it is a different ramp on purpose: sujeira is
 * amber everywhere else in the product, and `running` is green. Two meanings
 * wearing one colour is the failure to avoid here — the dot is the only thing
 * left saying the tree is dirty once another tab is in front.
 */
export type TabState = "running" | "exited" | "failed" | "asking" | "dirty";

export interface TabProps {
  label: string;
  onSelect: () => void;
  glyph?: ReactNode;
  /**
   * Only the second and later homonyms carry one.
   *
   * A session has no name of its own — three agents from the same
   * configuration would otherwise be three identical tabs.
   */
  ordinal?: number;
  active?: boolean;
  state?: TabState;
  /**
   * A word about what the tab is, not about how it is doing.
   *
   * The dot already reports state; this is for a tab that is a different kind
   * of thing — the record of a session that ended, which is read, not used.
   */
  note?: string;
  /**
   * What the dot means, spelled out.
   *
   * The dot reports in colour, and a colour has no name. Without this the only
   * tab that survives another tab being in front announces itself as a bare
   * label — which is the same as not reporting at all.
   */
  stateLabel?: string;
  /** Absent on a tab that cannot be dismissed, like the context tab. */
  onClose?: () => void;
}

/**
 * One open thing inside a worktree.
 *
 * Wrapper plus two sibling buttons, for the same reason `Row` is: selecting and
 * closing are different actions and a button inside a button is invalid HTML.
 */
export function Tab({
  label,
  onSelect,
  glyph,
  ordinal,
  active = false,
  state,
  stateLabel,
  note,
  onClose,
}: TabProps) {
  return (
    <div className={`tab-item${active ? " tab-item--active" : ""}`}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className="tab-item__main"
        onClick={onSelect}
      >
        {glyph}
        <span className="tab-item__label">{label}</span>
        {ordinal !== undefined && <span className="tab-item__ord">{ordinal}</span>}
        {note !== undefined && <span className="tab-item__note">{note}</span>}
        {state !== undefined && (
          <>
            <span className={`tab-item__dot tab-item__dot--${state}`} />
            {stateLabel !== undefined && <span className="sr-only">{stateLabel}</span>}
          </>
        )}
      </button>
      {onClose !== undefined && (
        <button
          type="button"
          className="tab-item__close"
          aria-label={`fechar ${label}`}
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}

export interface TabStripProps {
  label: string;
  /** Pinned open at the left — the tab that is always there. */
  lead?: ReactNode;
  /**
   * The tabs that come and go. These are what scrolls.
   *
   * Optional because a worktree with nothing open is a real state, and the
   * strip does not go away for it — the way to start something lives in it.
   */
  children?: ReactNode;
  /** Pinned open at the right. What starts new work. */
  action?: ReactNode;
  /**
   * Pinned open at the far right, past a separator.
   *
   * Two right-hand slots and not one because the two things there obey
   * different rules: `action` creates something that does not exist yet, and
   * this one switches something that does. A separator is cheaper than a label
   * at telling them apart, and the strip is the row that fights hardest for
   * width.
   */
  end?: ReactNode;
}

/**
 * Three zones, and the middle one is the only one that scrolls.
 *
 * What is pinned is pinned for a reason: a menu anchored to the action would be
 * clipped by the scroller's own overflow, and the button that opens new work
 * must not slide off screen because there is already too much work open. The
 * lead stays for the same reason — the way back to the worktree's own context
 * cannot depend on scrolling left.
 */
export function TabStrip({ label, lead, children, action, end }: TabStripProps) {
  return (
    <div className="tabs-bar" role="tablist" aria-label={label}>
      {lead !== undefined && (
        <>
          {lead}
          <span className="tabs-bar__sep" aria-hidden="true" />
        </>
      )}
      <div className="tabs-bar__scroll">{children}</div>
      {action !== undefined && <span className="tabs-bar__action">{action}</span>}
      {end !== undefined && (
        <>
          <span className="tabs-bar__sep" aria-hidden="true" />
          <span className="tabs-bar__end">{end}</span>
        </>
      )}
    </div>
  );
}

export interface TabToggleProps {
  /** What it switches, as a noun — the label is built from it. */
  label: string;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A switch that lives in the strip, and survives what it switches off.
 *
 * Glyph only, and the reason is not space alone: the pressed state is already
 * drawn on screen, beside the button, as the thing it opened. A label would
 * repeat a column that is right there. The name still has to be said out loud
 * for anyone not looking at it, so it says the verb — `abrir` or `fechar` —
 * rather than the noun, because a toggle whose name never changes reads as a
 * button that does one thing.
 *
 * 24x24 is the AA floor for a target (WCAG 2.5.8), the same as the tab's `✕`:
 * the glyph stays small and the target lives around it.
 */
export function TabToggle({ label, pressed, onToggle, children }: TabToggleProps) {
  return (
    <button
      type="button"
      className="tab-toggle"
      aria-pressed={pressed}
      aria-label={`${pressed ? "fechar" : "abrir"} ${label}`}
      onClick={onToggle}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
