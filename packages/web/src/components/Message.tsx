import { Glyph } from "../ui/index.js";

import { Markdown } from "./Markdown.js";

/**
 * One person's or one agent's contribution, in the conversation's gutter grid.
 *
 * The 20px gutter is what aligns the speaker's glyph with the tool cards, the
 * plan and the permission dialog below it. Without it every kind of event would
 * start at a different x and the conversation would read as a list of unrelated
 * things instead of a dialogue.
 */

export interface TurnFrameProps {
  role: "user" | "agent";
  children: React.ReactNode;
}

/** The gutter and the glyph. Everything a turn contains goes inside. */
export function TurnFrame({ role, children }: TurnFrameProps) {
  return (
    <div className={`turn turn--${role}`}>
      <span className="turn__g">
        <Glyph tone={role === "agent" ? "agent" : "none"}>{role === "agent" ? "◆" : "❯"}</Glyph>
      </span>
      <div className="turn__b">{children}</div>
    </div>
  );
}

export interface MessageProps {
  text: string;
  /**
   * Draws the caret at the end.
   *
   * The only sign that a turn has not finished (F2.1). Absent when it has, so
   * the difference between "still writing" and "done" is visible without reading
   * the text.
   */
  streaming?: boolean;
}

/**
 * Markdown, e não texto cru.
 *
 * O que um agente escreve é markdown — título, lista, cerca de código, tabela —,
 * e isto renderizava tudo dentro de um `<p>` só. O resultado era uma parede de
 * texto com `##` e `**` à vista, numa linha, sem nem as quebras que ele mandou.
 * O protótipo do Open Design nunca supôs outra coisa: `.msg` sempre teve `<p>` e
 * `<code>` dentro.
 */
export function Message({ text, streaming = false }: MessageProps) {
  return (
    <div className="msg">
      <Markdown text={text} streaming={streaming} />
    </div>
  );
}

export interface ThoughtProps {
  text: string;
  open: boolean;
  onToggle(): void;
  /** True while the agent is still thinking — the live line A3 asked for. */
  streaming?: boolean;
}

/**
 * Reasoning, collapsed by default (F2.2, A3).
 *
 * Collapsed because whoever reads a conversation afterwards wants what was
 * done, not the path to the decision. The path is one click away, and while the
 * agent is still writing it, the peek line is the sign that something is
 * happening at all.
 */
export function Thought({ text, open, onToggle, streaming = false }: ThoughtProps) {
  const label = streaming ? "pensando…" : "pensou";

  return (
    <>
      <button
        type="button"
        className="thought focus-ring"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="thought__twist" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {label}
        {!open && text !== "" && <span className="thought__peek">· {text}</span>}
      </button>
      {open && (
        <div className="thought__text">
          {/* Raciocínio também é markdown: o agente numera passos e cita código
              ali como cita em qualquer outro lugar. */}
          <Markdown text={text} streaming={streaming} />
        </div>
      )}
    </>
  );
}
