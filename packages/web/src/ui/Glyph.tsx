import type { ReactNode } from "react";

/**
 * What a glyph means, not what colour it is.
 *
 * The mapping to a colour lives in one CSS rule, so "make a waiting agent
 * louder" is one edit rather than three that have to agree.
 */
export type GlyphTone =
  | "workspace"
  | "project"
  | "worktree"
  | "shell"
  | "agent"
  | "warn"
  | "off"
  | "none";

export interface GlyphProps {
  tone?: GlyphTone;
  children: ReactNode;
}

/**
 * A single decorative character in a fixed box.
 *
 * `aria-hidden` because every glyph in this app sits beside the same meaning
 * spelled out — the row label, the item state, the button text. Announcing it
 * would read the thing twice.
 */
export function Glyph({ tone = "none", children }: GlyphProps) {
  const toneClass = tone === "none" ? "" : ` glyph--${tone}`;
  return (
    <span className={`glyph${toneClass}`} aria-hidden="true">
      {children}
    </span>
  );
}
