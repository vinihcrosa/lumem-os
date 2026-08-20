import { Fragment } from "react";

export interface StepsProps {
  /** One label per step, in order. */
  steps: readonly string[];
  /** Index of the step being worked on. Everything before it is done. */
  current: number;
}

/**
 * The progress rail of a multi-step flow.
 *
 * `aria-hidden`, and that is the design rather than an omission: every screen
 * that shows this rail also says "passo 3 de 5" in words above it, and a rail
 * that announced itself would read the position twice — once as a sentence and
 * once as five list items whose only content is the word "workspace".
 *
 * The bar between two steps is a sibling of both, because that is what lets one
 * CSS rule colour the segment behind a finished step (`--done + __bar`) without
 * the component having to know it is drawing a segment at all.
 */
export function Steps({ steps, current }: StepsProps) {
  return (
    <div className="steps" aria-hidden="true">
      {steps.map((label, index) => {
        const state = index < current ? " steps__i--done" : index === current ? " steps__i--now" : "";
        return (
          <Fragment key={label}>
            <span className={`steps__i${state}`}>
              <span className="steps__n">{index < current ? "✓" : index + 1}</span>
              <span className="steps__l">{label}</span>
            </span>
            {index < steps.length - 1 && <span className="steps__bar" />}
          </Fragment>
        );
      })}
    </div>
  );
}
