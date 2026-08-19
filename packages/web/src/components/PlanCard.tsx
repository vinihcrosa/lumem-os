import { useState } from "react";

import type { AcpPlanEntry, AcpPlanStatus } from "@lumem/shared";

/**
 * The plan, as one card that rewrites itself (F2.5).
 *
 * One card, not one per version: the agent reissues the whole plan on every
 * change, and a block per version would fill the conversation with near-identical
 * copies of one thing.
 *
 * The colour axis is progress and nothing else — the current step is the only one
 * in the brand's colour, because it is the "you are here". Done recedes to
 * tertiary: it already paid off, and what the reader wants is what is left.
 */

const MARK: Record<AcpPlanStatus, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "✓",
};

/** The class the tokens hang off. Named after progress, not after a colour. */
const TONE: Record<AcpPlanStatus, string> = {
  pending: "pending",
  in_progress: "active",
  completed: "done",
};

export interface PlanCardProps {
  entries: readonly AcpPlanEntry[];
  /** Starts expanded even when finished. The styleguide wants both. */
  defaultOpen?: boolean;
}

export function PlanCard({ entries, defaultOpen = false }: PlanCardProps) {
  const done = entries.filter((entry) => entry.status === "completed").length;
  const finished = entries.length > 0 && done === entries.length;
  const [open, setOpen] = useState(defaultOpen);

  // Finished collapses on its own, unless someone opened it: a list of struck-out
  // steps says nothing the count does not, and it is the longest block on screen.
  const showSteps = !finished || open;

  return (
    <div className="plan">
      <div className="plan__head">
        <span className={`plan__glyph${finished ? " plan__glyph--done" : ""}`} aria-hidden="true">
          {finished ? "✓" : "☰"}
        </span>
        Plano
        <span className="spacer" />
        <span className="plan__count">
          {done} de {entries.length}
        </span>
        {finished && (
          <button
            type="button"
            className="tc__twist focus-ring"
            aria-expanded={open}
            aria-label={open ? "esconder os passos" : "mostrar os passos"}
            onClick={() => setOpen(!open)}
          >
            {open ? "▾" : "▸"}
          </button>
        )}
      </div>

      {showSteps &&
        entries.map((entry, index) => (
          <div className={`plan__row plan__row--${TONE[entry.status]}`} key={index}>
            <span className="plan__mark" aria-hidden="true">
              {MARK[entry.status]}
            </span>
            {/* Wraps rather than truncates: a step cut in half stops being a step. */}
            <span className="plan__what">{entry.content}</span>
            {entry.status === "in_progress" && (
              <>
                <span className="spacer" />
                <span className="plan__now">agora</span>
              </>
            )}
          </div>
        ))}
    </div>
  );
}
