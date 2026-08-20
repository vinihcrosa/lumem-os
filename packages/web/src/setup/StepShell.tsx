import type { FormEvent, ReactNode } from "react";

import { Button, WizardCard } from "../ui/index.js";

export interface StepShellProps {
  eyebrow?: ReactNode;
  title: string;
  lede?: ReactNode;
  narrow?: boolean;
  children?: ReactNode;
  /** The primary action. `null` when the step has none — the receipt. */
  primary?: {
    label: string;
    disabled?: boolean;
    /** Shown instead of the label while the daemon is being waited on. */
    pending?: string;
    isPending?: boolean;
  };
  /** Fired by the primary button and by `⏎` inside any field of this step. */
  onSubmit?: () => void;
  /** Absent on the first screen, where there is nowhere to go back to. */
  onBack?: () => void;
  /**
   * Absent on the workspace step, and on that one only: without a workspace
   * there is no app, so it is the single thing this flow will not let go.
   */
  onSkip?: () => void;
  /** Extra buttons: "verificar de novo", "testar de novo". */
  extra?: ReactNode;
  /** What rides to the right of the actions — where it was saved, a warning. */
  hint?: ReactNode;
}

/**
 * One step: the card, the footer, and `⏎`.
 *
 * `⏎` is a real form submit rather than a key listener on the window, and that is
 * the whole reason this component exists. A listener would fire twice whenever the
 * focused element was already a button, and would have to guess whether the caret
 * sitting in a text field meant "advance" or "newline". A form answers both by
 * being what the browser already does.
 *
 * `esc` is not here: it is one listener for the whole flow, in `SetupFlow`.
 */
export function StepShell({
  eyebrow,
  title,
  lede,
  narrow,
  children,
  primary,
  onSubmit,
  onBack,
  onSkip,
  extra,
  hint,
}: StepShellProps) {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (primary?.disabled === true || primary?.isPending === true) return;
    onSubmit?.();
  };

  return (
    <form className="wizard__form" onSubmit={submit}>
      <WizardCard
        {...(eyebrow === undefined ? {} : { eyebrow })}
        title={title}
        {...(lede === undefined ? {} : { lede })}
        {...(narrow === undefined ? {} : { narrow })}
        footer={
          <>
            {primary !== undefined && (
              <Button
                type="submit"
                variant="primary"
                disabled={primary.disabled === true || primary.isPending === true}
              >
                {primary.isPending === true && primary.pending !== undefined
                  ? primary.pending
                  : primary.label}
                {primary.isPending !== true && (
                  <>
                    {" "}
                    <span className="kbd">⏎</span>
                  </>
                )}
              </Button>
            )}
            {extra}
            <span className="spacer" />
            {onSkip !== undefined && (
              <Button variant="ghost" onClick={onSkip}>
                pular este passo
              </Button>
            )}
            {onBack !== undefined && (
              <Button variant="ghost" onClick={onBack}>
                Voltar
              </Button>
            )}
            {hint !== undefined && <span className="hint">{hint}</span>}
          </>
        }
      >
        {children}
      </WizardCard>
    </form>
  );
}
