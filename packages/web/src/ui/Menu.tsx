import type { ReactNode } from "react";

export interface MenuProps {
  label: string;
  children: ReactNode;
}

/**
 * The panel of a dropdown. Presentational only — opening, closing and focus
 * belong to whoever owns the trigger.
 */
export function Menu({ label, children }: MenuProps) {
  return (
    <div className="menu" role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  onSelect?: () => void;
  glyph?: ReactNode;
  /** The literal behind the label — the command, the path. */
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * One choice.
 *
 * A disabled item stays visible on purpose: PRD F6.5 wants an agent whose
 * command is missing from the `PATH` to be shown and refused, not hidden.
 * Hiding it leaves the user wondering where their agent went.
 */
export function MenuItem({ children, onSelect, glyph, hint, disabled = false }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu__item"
      disabled={disabled}
      onClick={onSelect}
    >
      {glyph}
      {children}
      {hint !== undefined && <span className="menu__hint">{hint}</span>}
    </button>
  );
}
