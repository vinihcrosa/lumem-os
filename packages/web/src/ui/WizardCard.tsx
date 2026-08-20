import type { ReactNode } from "react";

export interface WizardCardProps {
  /** `passo 3 de 5` — the position, in words. */
  eyebrow?: ReactNode;
  title: string;
  lede?: ReactNode;
  /** Narrower and centred: the opening and the closing screens. */
  narrow?: boolean;
  children?: ReactNode;
  /** The actions, plus whatever hint rides beside them. */
  footer?: ReactNode;
}

/**
 * One step of a flow: a heading, an explanation, the step's body, the actions.
 *
 * The title is an `h2` and not the `h1` the prototype draws, because in the app
 * this card renders under a topbar whose `h1` is the product. Two `h1`s leave a
 * screen reader with two competing outlines — the same reason `Topbar` documents
 * for keeping the product as the only one.
 */
export function WizardCard({
  eyebrow,
  title,
  lede,
  narrow = false,
  children,
  footer,
}: WizardCardProps) {
  return (
    <div className={`wizard__card${narrow ? " wizard__card--narrow" : ""}`}>
      <div className="wizard__head">
        {eyebrow !== undefined && <span className="wizard__eyebrow">{eyebrow}</span>}
        <h2 className="wizard__title">{title}</h2>
        {lede !== undefined && <p className="wizard__lede">{lede}</p>}
      </div>
      {children}
      {footer !== undefined && <div className="wizard__foot">{footer}</div>}
    </div>
  );
}

export interface WizardSectionProps {
  /** The uppercase line above the section. */
  title: string;
  children: ReactNode;
}

/** A labelled block inside a step — detection, the wire, what gets written. */
export function WizardSection({ title, children }: WizardSectionProps) {
  return (
    <section className="wizard__sec">
      <span className="wizard__sec-t">{title}</span>
      {children}
    </section>
  );
}
