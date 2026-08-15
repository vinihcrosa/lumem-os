import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  children?: ReactNode;
  /** The one thing to do from here. An empty state without it is a dead end. */
  action?: ReactNode;
}

/** Nothing here yet, and what to do about it. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__title">{title}</span>
      {children !== undefined && <span>{children}</span>}
      {action}
    </div>
  );
}

export interface SkeletonProps {
  /** Relative widths, so the placeholder has the shape of what is coming. */
  widths?: readonly string[];
  label?: string;
}

/**
 * Waiting, with the shape of the answer.
 *
 * `role="status"` and a label, because a purely visual placeholder tells a
 * screen reader nothing at all.
 */
export function Skeleton({ widths = ["70%", "40%", "100%", "70%"], label = "carregando" }: SkeletonProps) {
  return (
    <div role="status" aria-label={label}>
      {widths.map((width, index) => (
        // eslint-disable-next-line react/no-array-index-key -- placeholders have no identity
        <div className="skeleton" key={index} style={{ width }} />
      ))}
    </div>
  );
}
