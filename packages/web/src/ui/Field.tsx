import type { InputHTMLAttributes, ReactNode } from "react";

export interface FieldProps {
  /** Ties the label, the control and the error together. */
  id: string;
  label: string;
  /** The daemon's own words. It is the only thing that knows what failed. */
  error?: ReactNode;
  children: ReactNode;
}

/**
 * A labelled control and, when the daemon refuses it, why.
 *
 * The error is wired through `aria-describedby` rather than just sitting
 * nearby, so it is read when the field takes focus instead of only being
 * visible to someone looking at the right part of the screen.
 */
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error !== undefined && (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** The text control. `invalid` is the visual half of `Field`'s error. */
export function Input({ invalid = false, className, id, ...rest }: InputProps) {
  const classes = ["input", invalid ? "input--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <input
      id={id}
      className={classes}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id !== undefined ? `${id}-error` : undefined}
      {...rest}
    />
  );
}
