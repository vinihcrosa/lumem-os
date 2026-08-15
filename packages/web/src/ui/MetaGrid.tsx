import { Fragment, type ReactNode } from "react";

export interface MetaEntry {
  label: string;
  value: ReactNode;
  /** The full string, when `value` is decorated and would truncate. */
  title?: string;
}

export interface MetaGridProps {
  entries: readonly MetaEntry[];
}

/**
 * The literals of the selected thing: path, branch, when.
 *
 * A `dl` rather than a table because these are definitions, and the pairing is
 * what a screen reader should hear. `Fragment` rather than a wrapper element so
 * `dt` and `dd` stay direct children of the grid — a wrapper would need
 * `display: contents` to not break the two-column layout.
 */
export function MetaGrid({ entries }: MetaGridProps) {
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
