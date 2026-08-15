import type { ReactNode } from "react";

export interface SectionHeadProps {
  title: string;
  /** How many, and anything else worth saying about the whole list. */
  count?: ReactNode;
  /** Pushed to the far end — an action for the section. */
  aside?: ReactNode;
}

/** The rule above a list, saying what the list is. */
export function SectionHead({ title, count, aside }: SectionHeadProps) {
  return (
    <div className="section-head">
      <span className="section-head__title">{title}</span>
      {count !== undefined && <span className="section-head__count">{count}</span>}
      {aside !== undefined && <span className="section-head__aside">{aside}</span>}
    </div>
  );
}
