import type { ReactNode } from "react";

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
}

/**
 * Sidebar on the left, detail on the right — the shape PRD §F3 describes.
 *
 * It holds no state of its own on purpose: what is selected belongs to the
 * things that render inside it, and a shell that also decided would have to be
 * rewritten every time a new kind of item appears in the tree.
 */
export function AppShell({ sidebar, children, fill = false }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="navegação">
        {sidebar}
      </aside>
      <main className={`app-shell__main${fill ? " app-shell__main--fill" : ""}`}>{children}</main>
    </div>
  );
}
