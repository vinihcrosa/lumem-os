import type { ReactNode } from "react";

export interface ChoiceProps {
  title: string;
  description?: ReactNode;
  /** The literal behind the choice: a command, a model, a mode. */
  meta?: ReactNode;
  glyph?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * One card in a small set of mutually exclusive options.
 *
 * `role="radio"` on a `button`, not an `input[type=radio]`: the design draws a
 * card with a title, a sentence and a literal, and a real radio would bring the
 * platform's own box along with it — which is the one control in a browser that
 * cannot be styled into this. The ARIA is what a screen reader needs; the
 * marker glyph is `aria-hidden` because `aria-checked` already says it.
 */
export function Choice({
  title,
  description,
  meta,
  glyph,
  selected,
  onSelect,
  disabled = false,
}: ChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`choice${selected ? " is-on" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="choice__top">
        {glyph}
        <span className="choice__t">{title}</span>
        <span className="choice__mark" aria-hidden="true">
          {selected ? "◉" : "○"}
        </span>
      </span>
      {description !== undefined && <span className="choice__d">{description}</span>}
      {meta !== undefined && <span className="choice__meta">{meta}</span>}
    </button>
  );
}

export interface ChoiceGroupProps {
  label: string;
  /** Two side by side is the design's default; one is what a narrow card gets. */
  columns?: 1 | 2;
  children: ReactNode;
}

export function ChoiceGroup({ label, columns = 2, children }: ChoiceGroupProps) {
  return (
    <div
      className={`choices${columns === 2 ? " choices--2" : ""}`}
      role="radiogroup"
      aria-label={label}
    >
      {children}
    </div>
  );
}
