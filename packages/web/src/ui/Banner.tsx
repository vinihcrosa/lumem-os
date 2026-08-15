import type { ReactNode } from "react";

export type BannerTone = "info" | "warning" | "danger";

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  actions?: ReactNode;
}

const GLYPH: Record<BannerTone, string> = {
  info: "◆",
  warning: "⚠",
  danger: "⚠",
};

/**
 * Something the daemon refused, or a state the user has to know about.
 *
 * `danger` announces itself: those are refusals that arrive in response to a
 * click, and an assistive reader that stays silent leaves the click looking
 * like it did nothing. `info` and `warning` are ambient and only get read when
 * the user arrives at them.
 */
export function Banner({ tone, children, actions }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="banner__glyph" aria-hidden="true">
        {GLYPH[tone]}
      </span>
      <span>{children}</span>
      {actions !== undefined && <span className="banner__actions">{actions}</span>}
    </div>
  );
}

export interface RawOutputProps {
  /** Already split: one entry per line, printed verbatim. */
  lines: readonly string[];
  label?: string;
}

/**
 * A command's own words, untranslated — PRD §8 requires the git error to reach
 * the user as git wrote it.
 */
export function RawOutput({ lines, label }: RawOutputProps) {
  return (
    <div className="raw" aria-label={label}>
      {lines.map((line, index) => (
        // Output lines have no identity of their own and never reorder, so the
        // index is the honest key here.
        // eslint-disable-next-line react/no-array-index-key
        <span className="raw__line" key={index}>
          {line}
        </span>
      ))}
    </div>
  );
}
