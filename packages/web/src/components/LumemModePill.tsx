import { useState } from "react";

import type { LumemMode, LumemModeDefault } from "@lumem/shared";

/**
 * The mode pill for a conversation whose agent offers none (`session-mode`).
 *
 * The composer's pills are derived entirely from `configOptions`, and an empty
 * one produces zero pills — so an agent that reports no `modes` renders the same
 * pixel as a broken transport: a mute bar. This is what goes there instead, and
 * it is not the agent's selector under another name: the agent's mode changes
 * what it *tries to do*, and this changes what *gets through*.
 *
 * **Ownership is not colour.** Colour carries consequence, and it is already
 * spent on the mode tones; a 24px object with two colour axes does not read. So
 * ownership rides a glyph — `◈` — plus a second signal that was free in the
 * data: Lumem labels in Portuguese sentence case, and the agent hands over the
 * protocol's raw string (`bypassPermissions`, `Plan Mode`). Two pills side by
 * side will never look like they came from the same place.
 *
 * The rejected alternative is recorded in Q2: `◆` on the agent's pill too, which
 * reads better in isolation and costs more — `◆` already means *agent session*
 * in the sidebar and the tab.
 */

interface ModeChoice {
  value: LumemMode;
  label: string;
  description: string;
  /** The tone class, which is about consequence and not about who owns the rule. */
  tone: string;
}

/**
 * The three values, and why two of them borrow the agent's tones.
 *
 * `auto` uses the same tone as the agent's `auto` and `free` the same as
 * `bypassPermissions`, deliberately: to whoever is watching, the consequence is
 * identical — and giving one danger two colours would be worse than the glyph
 * asymmetry. `ask` stays neutral because the floor asks for no attention.
 */
const CHOICES: readonly ModeChoice[] = [
  {
    value: "ask",
    label: "Perguntar tudo",
    description: "Todo pedido para e espera por você. É o padrão, e nenhuma sessão nasce em outro.",
    tone: "pill--ask",
  },
  {
    value: "auto",
    label: "Automático",
    description:
      "Leitura de arquivo com caminho dentro do checkout passa sozinha, e aparece na conversa. Escrita e comando ainda perguntam.",
    tone: "pill--auto",
  },
  {
    value: "free",
    label: "Liberado",
    description: "Nada é perguntado dentro da worktree. Pede confirmação antes de valer.",
    tone: "pill--bypass",
  },
];

const choiceOf = (mode: LumemMode): ModeChoice =>
  CHOICES.find((choice) => choice.value === mode) ?? CHOICES[0]!;

export interface LumemModePillProps {
  mode: LumemMode;
  /** What a new session in this workspace would start at — the menu's footer (Q5). */
  workspaceDefault: LumemModeDefault;
  /** True while a turn runs: the daemon refuses the switch then (F1.7). */
  disabled?: boolean;
  /** A finished conversation shows the mode it was in, and offers nothing (F1.8). */
  readOnly?: boolean;
  onSwitch(mode: LumemMode): void;
  /**
   * `free` was chosen and has **not** been applied.
   *
   * Separate from `onSwitch` because the dangerous value does not change on the
   * click: it opens the gate, and the gate is what switches. Folding the two
   * together would make the gate a decoration shown after the fact (Q4).
   */
  onFreeRequested(): void;
}

export function LumemModePill({
  mode,
  workspaceDefault,
  disabled = false,
  readOnly = false,
  onSwitch,
  onFreeRequested,
}: LumemModePillProps) {
  const [open, setOpen] = useState(false);
  const current = choiceOf(mode);

  /*
   * A finished conversation is not a switched-off control, so it is not a button.
   * No caret and no `disabled`: what is on screen is a fact that was recorded,
   * and reading a transcript without knowing which policy it ran under is
   * reading half of it (F1.8).
   */
  if (readOnly) {
    return (
      <span className={`pill ${current.tone}`} title="conversa encerrada — o modo em que ela esteve">
        <span className="pill__own" aria-hidden="true">
          ◈
        </span>
        <span className="sr-only">regra do Lumem, e a conversa terminou: </span>
        {current.label}
      </span>
    );
  }

  return (
    <span className="config">
      <button
        type="button"
        className={`pill ${current.tone} focus-ring`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The glyph is `aria-hidden`, so the ownership has to live in a word: a
        // screen reader hearing "lozenge" learns nothing about whose rule this is.
        aria-label={`regra do Lumem: ${current.label}`}
        disabled={disabled}
        title={
          disabled
            ? "não dá para trocar no meio de um turno"
            : "regra do Lumem — este agente não oferece modos"
        }
        onClick={() => setOpen(!open)}
      >
        <span className="pill__own" aria-hidden="true">
          ◈
        </span>
        {current.label}
        <span className="pill__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="mmenu" role="menu" aria-label="regra do Lumem">
          {/*
            The header is where ownership becomes a sentence instead of a riddle.
            Without it the glyph explains nothing, and someone switching this
            believes they put the agent in plan mode when all they changed was who
            answers the permission request.
          */}
          <div className="mmenu__head">
            <div className="mmenu__who">
              <span aria-hidden="true">◈</span>Regra do Lumem
            </div>
            <div className="mmenu__why">
              este agente não relatou modos. O que muda aqui é <b>o que o daemon responde</b> a um
              pedido de permissão — o agente não fica sabendo.
            </div>
          </div>

          {CHOICES.map((choice) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={choice.value === mode}
              className={`mopt focus-ring${choice.value === mode ? " mopt--on" : ""}${
                choice.value === "auto" ? " mopt--auto" : ""
              }${choice.value === "free" ? " mopt--free" : ""}`}
              key={choice.value}
              onClick={() => {
                setOpen(false);
                if (choice.value === "free") {
                  onFreeRequested();
                  return;
                }
                onSwitch(choice.value);
              }}
            >
              <span className="mopt__t">
                {choice.label}
                {choice.value === mode && (
                  <span className="mopt__mark" aria-hidden="true">
                    ✓
                  </span>
                )}
              </span>
              <span className="mopt__d">{choice.description}</span>
            </button>
          ))}

          {/*
            Where the current value came from (Q5). The mode is the session's, and
            its default is the workspace's — inheriting without being able to
            diverge would be global policy, and diverging without inheriting would
            mean choosing again in every new conversation.
          */}
          <div className="mmenu__foot">
            padrão do workspace: <b>{choiceOf(workspaceDefault).label.toLowerCase()}</b>
          </div>
        </div>
      )}
    </span>
  );
}
