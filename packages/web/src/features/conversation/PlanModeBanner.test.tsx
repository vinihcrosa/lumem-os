import type { AcpTranscriptEntry } from "@lumem/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Composer } from "./Composer.js";
import { reduceConversation, replayConversation, type ConversationState } from "./conversation-model.js";

/**
 * A faixa de plan mode (`035` S1), no composer de verdade.
 *
 * Pelo `Composer` e não pelo componente solto: o que os critérios afirmam é
 * onde ela aparece — acima da caixa — e quando, a partir do `mode` que o
 * reducer tira do evento `config`. Um teste da faixa isolada passaria com ela
 * esquecida fora do composer.
 */

const TEXT = "modo plano — o agente não altera arquivos até você aprovar o plano";

function config(mode: string): AcpTranscriptEntry {
  return {
    at: 1,
    event: { type: "config", mode, options: [], modeOwner: "agent", lumemMode: "ask", lumemModeDefault: "ask" },
  };
}

function composer(conversation: ConversationState, readOnly = false) {
  return (
    <Composer
      sessionId="s-plan"
      conversation={conversation}
      session={null}
      attached
      readOnly={readOnly}
      active
      send={() => true}
      cancel={() => {}}
      setMode={() => {}}
      setConfig={() => {}}
    />
  );
}

describe("a faixa de plan mode", () => {
  it("em plan mode a faixa aparece com o texto exato", () => {
    render(composer(replayConversation([config("plan")])));

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(new RegExp(`^${TEXT}$`));
    // Acima da caixa de texto: a caixa vem depois da faixa no documento.
    const box = screen.getByLabelText("mensagem para o agente");
    expect(banner.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a faixa some quando o modo sai de plan", () => {
    const planning = replayConversation([config("plan")]);
    const view = render(composer(planning));
    expect(screen.getByText(TEXT)).toBeInTheDocument();

    view.rerender(composer(reduceConversation(planning, config("auto"))));

    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it.each([["auto"], ["default"], ["bypassPermissions"], [""]])(
    "fora de plan mode não há faixa (%j)",
    (mode) => {
      render(composer(replayConversation([config(mode)])));

      expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    },
  );

  it("conversa em leitura não mostra a faixa", () => {
    render(composer(replayConversation([config("plan")]), true));

    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });
});
