import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "default" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Decorative character, usually a `Glyph`. */
  glyph?: ReactNode;
}

/**
 * Every clickable thing that is not a row.
 *
 * `type` defaults to `button`: inside a form, the HTML default is `submit`,
 * and a cancel button that submits is the kind of bug that only shows up once
 * something is typed.
 */
export function Button({
  variant = "default",
  size = "md",
  glyph,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variant === "default" ? "" : `btn--${variant}`,
    size === "sm" ? "btn--sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // eslint-disable-next-line react/button-has-type -- narrowed by the default
    <button type={type} className={classes} {...rest}>
      {glyph}
      {children}
    </button>
  );
}
