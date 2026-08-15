import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  /** One line under the title saying what this is for. */
  lede?: ReactNode;
  children: ReactNode;
}

/**
 * A self-contained panel: first run, a confirmation, a short form.
 *
 * Its width is `--size-dialog-width`, not the detail column's — a field for one
 * word does not need eight hundred pixels, and the prototype proved that by
 * looking absurd when it had them.
 */
export function Card({ title, lede, children }: CardProps) {
  return (
    <div className="card">
      {title !== undefined && <h2 className="card__title">{title}</h2>}
      {lede !== undefined && <p className="card__lede">{lede}</p>}
      {children}
    </div>
  );
}
