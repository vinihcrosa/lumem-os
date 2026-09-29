import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { replayConversation } from "./conversation-model.js";
import { TurnStatus } from "./TurnStatus.js";

afterEach(cleanup);

const STARTED = 1_700_000_000_000;

function entry(atMs: number, event: AcpEvent): AcpTranscriptEntry {
  return { at: atMs, event };
}

const stylesheet = readFileSync(join(import.meta.dirname, "conversation.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("a linha de estado do turno", () => {
  it("desenha trabalhando com o decorrido", () => {
    const live = replayConversation([
      entry(STARTED, { type: "message", messageId: "u-1", role: "user", text: "roda o gate" }),
    ]);

    const view = render(<TurnStatus conversation={live} readOnly={false} clock={() => STARTED + 72_000} />);

    expect(screen.getByText("trabalhando · 1 min 12 s")).toBeInTheDocument();
    // O indicador existe, e a regra dele anima por um `@keyframes` desta folha —
    // jsdom não aplica CSS, então a metade "animado" se lê no texto.
    const pulse = view.container.querySelector(".turn-status__pulse");
    expect(pulse).not.toBeNull();
    const rule = /\.turn-status__pulse\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? "";
    const keyframes = /animation:\s*([a-zA-Z0-9_-]+)/.exec(rule)?.[1];
    expect(keyframes).toBeDefined();
    expect(stylesheet).toContain(`@keyframes ${keyframes ?? "<nenhum>"}`);

    // Sem `streaming`, a linha não existe.
    const ended = replayConversation([
      entry(STARTED, { type: "message", messageId: "u-1", role: "user", text: "roda o gate" }),
      entry(STARTED + 5000, { type: "turn_end", stopReason: "end_turn" }),
    ]);
    view.rerender(<TurnStatus conversation={ended} readOnly={false} clock={() => STARTED + 72_000} />);

    expect(screen.queryByText(/trabalhando/)).not.toBeInTheDocument();
    expect(view.container.querySelector(".turn-status")).toBeNull();
  });

  it("não aparece numa conversa somente leitura", () => {
    const record = replayConversation([
      entry(STARTED, { type: "message", messageId: "u-1", role: "user", text: "sem fecho" }),
    ]);

    const view = render(<TurnStatus conversation={record} readOnly clock={() => STARTED + 72_000} />);

    expect(view.container).toBeEmptyDOMElement();
  });

  it("diz o que o agente está fazendo ao lado do tempo", () => {
    const live = replayConversation([
      entry(STARTED, { type: "message", messageId: "u-1", role: "user", text: "roda o gate" }),
      entry(STARTED + 1000, { type: "thought", messageId: "t-1", text: "hmm" }),
    ]);

    render(<TurnStatus conversation={live} readOnly={false} clock={() => STARTED + 5000} />);

    expect(screen.getByText("trabalhando · 5 s")).toBeInTheDocument();
    expect(screen.getByText("pensando")).toBeInTheDocument();
  });
});
