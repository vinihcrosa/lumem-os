import type { CSSProperties, ReactNode } from "react";

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /**
   * The detail fills the pane instead of scrolling inside it.
   *
   * A session needs this: `xterm` measures its host to decide how many columns
   * to report to the daemon, and a host inside a scrolling box has no height to
   * measure.
   */
  fill?: boolean;
  /**
   * The files column, right-panel F1.1.
   *
   * Optional so the shell is unchanged when it is closed — and so the screens
   * that have no checkout selected do not have to invent one.
   */
  right?: ReactNode;
  /** Width of that column in pixels. Ignored when `right` is absent. */
  rightWidth?: number;
}

/**
 * Sidebar on the left, detail in the middle, the checkout's files on the right.
 *
 * It holds no state of its own on purpose: what is selected belongs to the
 * things that render inside it, and a shell that also decided would have to be
 * rewritten every time a new kind of item appears in the tree.
 */
export function AppShell({ sidebar, children, fill = false, right, rightWidth }: AppShellProps) {
  // The width is a real number that a drag changes, so it cannot live in the
  // stylesheet — but it is handed over as the same custom property the CSS
  // would have read, so the column keeps one source of truth for its size.
  const style =
    right !== undefined && rightWidth !== undefined
      ? ({ "--right-width": `${rightWidth}px` } as CSSProperties)
      : undefined;

  return (
    <div className={`app-shell${right !== undefined ? " app-shell--right" : ""}`} style={style}>
      <aside className="app-shell__sidebar" aria-label="navegação">
        {sidebar}
      </aside>
      <main className={`app-shell__main${fill ? " app-shell__main--fill" : ""}`}>{children}</main>
      {right}
    </div>
  );
}
