import type { ReactNode } from "react";

import { Button } from "./Button.js";

export interface CoachProps {
  /** What this is about, in a few words. */
  title: string;
  children: ReactNode;
  /** Dismiss it now. */
  onUnderstood: () => void;
  /** Dismiss it for good. Absent when there is nothing to remember it in. */
  onNever?: () => void;
}

/**
 * The one-time explanation of a concept, shown where the concept happens.
 *
 * It knows nothing about where "never again" is stored — that is the caller's
 * problem, and it differs per concept. A balloon that reached for
 * `localStorage` itself would be a primitive with an opinion about persistence.
 */
export function Coach({ title, children, onUnderstood, onNever }: CoachProps) {
  return (
    <div className="coach" role="note">
      <span className="coach__t">
        <span aria-hidden="true">◆</span>
        {title}
      </span>
      <span className="coach__b">{children}</span>
      <span className="coach__acts">
        <Button size="sm" variant="primary" onClick={onUnderstood}>
          entendi
        </Button>
        {onNever !== undefined && (
          <Button size="sm" variant="ghost" onClick={onNever}>
            não mostrar de novo
          </Button>
        )}
      </span>
    </div>
  );
}
