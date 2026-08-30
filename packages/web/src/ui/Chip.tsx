import type { ReactNode } from "react";

/** The states a chip can report, named after the domain rather than a colour. */
export type ChipTone =
  | "neutral"
  | "branch"
  | "clean"
  | "dirty"
  | "missing"
  | "running"
  | "exited"
  | "failed"
  /** A transport with no TLS. Named after the fact, not after the colour. */
  | "insecure";

export interface ChipProps {
  tone?: ChipTone;
  /** A leading dot in the chip's own colour. */
  dot?: boolean;
  children: ReactNode;
}

/** One fact about the selected thing: its branch, its cleanliness, its state. */
export function Chip({ tone = "neutral", dot = false, children }: ChipProps) {
  const toneClass = tone === "neutral" ? "" : ` chip--${tone}`;
  return (
    <span className={`chip${toneClass}`}>
      {dot && <span className="chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
