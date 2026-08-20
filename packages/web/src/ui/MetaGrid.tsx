import { Fragment, type ReactNode } from "react";

export interface MetaEntry {
  label: string;
  value: ReactNode;
  /** The full string, when `value` is decorated and would truncate. */
  title?: string;
}

/**
 * Two densities of the same idea.
 *
 * `meta` is the one that lives in a column: it truncates, because a path that
 * wrapped to four lines would push the rest of the panel off screen. `recap` is
 * the one that lives in a wide card and is meant to be *read* — a receipt of
 * what was just written to disk — so it wraps instead of hiding the tail.
 *
 * One component rather than two because the pairing, the markup and the reason
 * to exist are identical, and a second copy is the one that would stop getting
 * the fix the first one got.
 */
export type MetaVariant = "meta" | "recap";

export interface MetaGridProps {
  entries: readonly MetaEntry[];
  variant?: MetaVariant;
}

/**
 * The literals of the selected thing: path, branch, when.
 *
 * A `dl` rather than a table because these are definitions, and the pairing is
 * what a screen reader should hear. `Fragment` rather than a wrapper element so
 * `dt` and `dd` stay direct children of the grid — a wrapper would need
 * `display: contents` to not break the two-column layout. The `recap` variant is
 * the exception: it lays each pair out as a flex row, and HTML allows a `div`
 * around a `dt`/`dd` pair inside a `dl` for exactly this.
 */
export function MetaGrid({ entries, variant = "meta" }: MetaGridProps) {
  if (variant === "recap") {
    return (
      <dl className="recap">
        {entries.map((entry) => (
          <div className="recap__r" key={entry.label}>
            <dt className="recap__k">{entry.label}</dt>
            <dd className="recap__v" title={entry.title}>
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="meta">
      {entries.map((entry) => (
        <Fragment key={entry.label}>
          <dt>{entry.label}</dt>
          <dd title={entry.title}>{entry.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
