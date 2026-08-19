import { useState } from "react";

import type { AcpConfigOption } from "@lumem/shared";

/**
 * The selectors, as the protocol reports them (F2.6).
 *
 * Every one of them is rendered the same way, because the protocol reports them
 * the same way — mode, model, effort, fast, agent. The only irregularity, that
 * mode has a dedicated call, was absorbed by the daemon (D8), so nothing here
 * knows about it.
 *
 * Two modes get a tone of their own, and they are the two that change what the
 * agent may do without asking: `plan` executes nothing, `bypassPermissions` asks
 * nothing. Not asking anything is a state, not a preference, so it also gets a
 * background — the only pill that does.
 */

/** Which modes are worth a colour. Everything else is neutral. */
const MODE_TONE: Record<string, string> = {
  auto: "auto",
  plan: "plan",
  bypassPermissions: "bypass",
};

export interface ConfigPillsProps {
  /** The current mode id, which the daemon keeps beside the options. */
  mode: string;
  options: readonly AcpConfigOption[];
  /** True while a turn runs: the switch is refused then, so it is disabled. */
  disabled?: boolean;
  onSwitch(optionId: string, value: string): void;
}

export function ConfigPills({ mode, options, disabled = false, onSwitch }: ConfigPillsProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      {options.map((option) => {
        const current = option.id === "mode" ? mode : option.currentValue;
        const label = labelFor(option, current);

        return (
          <span className="config" key={option.id}>
            <button
              type="button"
              className={`pill${toneOf(option, current)} focus-ring`}
              aria-haspopup="menu"
              aria-expanded={open === option.id}
              // Named by what it switches, because "Auto" alone tells a screen
              // reader nothing about which selector it belongs to.
              aria-label={`${option.name}: ${label}`}
              disabled={disabled}
              title={
                disabled
                  ? "não dá para trocar no meio de um turno"
                  : `${option.name}: ${label}`
              }
              onClick={() => setOpen(open === option.id ? null : option.id)}
            >
              {label}
              <span className="pill__caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {open === option.id && (
              <div className="slash" role="menu" aria-label={option.name}>
                {option.choices.map((choice) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={choice.value === current}
                    className={`slash__row focus-ring${
                      choice.value === current ? " slash__row--on" : ""
                    }${choice.value === "bypassPermissions" ? " slash__row--danger" : ""}`}
                    key={choice.value}
                    onClick={() => {
                      setOpen(null);
                      // Reported even when it is the same value: the agent may
                      // answer with something else, and silently doing nothing
                      // would make a deliberate re-selection look broken.
                      onSwitch(option.id, choice.value);
                    }}
                  >
                    <span className="slash__cmd">{choice.value}</span>
                    {/* Verbatim (A13). Our paraphrase disagreeing with what the
                        option actually does is worse than English. */}
                    <span className="slash__desc">{choice.description ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        );
      })}
    </>
  );
}

/** What the pill says. The choice's own name, falling back to its id. */
function labelFor(option: AcpConfigOption, current: string): string {
  return option.choices.find((choice) => choice.value === current)?.name || current || option.name;
}

/**
 * The pill's tone.
 *
 * Mode by which mode it is; the model pill in mono, because a model id is a
 * literal you read character by character; everything else neutral.
 */
function toneOf(option: AcpConfigOption, current: string): string {
  if (option.id === "mode") {
    const tone = MODE_TONE[current];
    return tone ? ` pill--${tone}` : "";
  }
  return option.id === "model" ? " pill--model" : "";
}
