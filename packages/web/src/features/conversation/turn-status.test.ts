import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { replayConversation } from "./conversation-model.js";
import { activityText, formatElapsed, turnActivity } from "./turn-status.js";

/**
 * O que a linha de estado do turno escreve (`035` S3), antes de ser componente.
 *
 * Os estados vêm do redutor, e não montados à mão: a linha lê o que a dobra
 * produz, e um estado que a dobra não produz não é um caso que a tela encontra.
 */

let clock = 1_700_000_000_000;
function at(event: AcpEvent, deltaMs = 1000): AcpTranscriptEntry {
  clock += deltaMs;
  return { at: clock, event };
}

const asked = (): AcpTranscriptEntry =>
  at({ type: "message", messageId: "u-1", role: "user", text: "roda o gate" });

const toolCall = (status: "pending" | "running"): AcpTranscriptEntry =>
  at({
    type: "tool_call",
    toolCallId: "tc-1",
    title: "Bash pnpm gate:quick",
    kind: "execute",
    status,
    locations: [],
  });

describe("o decorrido", () => {
  it("formata o decorrido", () => {
    const cases: ReadonlyArray<readonly [seconds: number, text: string]> = [
      [12, "12 s"],
      [59, "59 s"],
      [60, "1 min 0 s"],
      [72, "1 min 12 s"],
      [3_599, "59 min 59 s"],
      [3_600, "1 h 00 min"],
      [11_100, "3 h 05 min"],
      [-5, "0 s"],
    ];

    for (const [seconds, text] of cases) {
      expect(formatElapsed(seconds * 1000), `${String(seconds)} s`).toBe(text);
    }
  });
});

describe("o fazer do agente", () => {
  it("diz o que o agente está fazendo", () => {
    const cases: ReadonlyArray<readonly [label: string, entries: AcpTranscriptEntry[], text: string]> = [
      ["raciocínio", [asked(), at({ type: "thought", messageId: "t-1", text: "hmm" })], "pensando"],
      [
        "mensagem",
        [asked(), at({ type: "message", messageId: "a-1", role: "agent", text: "Vou rodar." })],
        "escrevendo",
      ],
      ["ferramenta running", [asked(), toolCall("running")], "rodando Bash pnpm gate:quick"],
      ["ferramenta pending", [asked(), toolCall("pending")], "rodando Bash pnpm gate:quick"],
      [
        "permissão pendente",
        [
          asked(),
          toolCall("pending"),
          at({
            type: "permission_request",
            policyReason: null,
            requestId: "rq-1",
            toolCallId: "tc-1",
            title: "Bash pnpm gate:quick",
            command: "pnpm gate:quick",
            cwd: "/repos/lorebase",
            options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
          }),
        ],
        "esperando sua resposta",
      ],
      ["nenhum bloco do agente", [asked()], "começando"],
      [
        "ferramenta terminada",
        [asked(), toolCall("running"), at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" })],
        "pensando",
      ],
    ];

    for (const [label, entries, text] of cases) {
      const state = replayConversation(entries);
      expect(state.streaming, label).toBe(true);
      expect(activityText(turnActivity(state)), label).toBe(text);
    }
  });

  it("não lê o turno anterior como o fazer deste", () => {
    // A resposta do turno passado é do agente, e é o último bloco do agente na
    // conversa — mas o turno de agora ainda não mandou nada.
    const state = replayConversation([
      asked(),
      at({ type: "message", messageId: "a-1", role: "agent", text: "pronto" }),
      at({ type: "turn_end", stopReason: "end_turn" }),
      at({ type: "message", messageId: "u-2", role: "user", text: "e agora?" }),
    ]);

    expect(activityText(turnActivity(state))).toBe("começando");
  });
});
