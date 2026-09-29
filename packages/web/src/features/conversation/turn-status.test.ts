import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { replayConversation } from "./conversation-model.js";
import { activityText, formatElapsed, turnActivity, turnLine } from "./turn-status.js";

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

describe("o aviso de silêncio (`035` S4)", () => {
  const T0 = 1_800_000_000_000;
  const user = (atMs: number): AcpTranscriptEntry => ({
    at: atMs,
    event: { type: "message", messageId: "u-1", role: "user", text: "roda o gate" },
  });
  const tool = (atMs: number, status: "pending" | "running"): AcpTranscriptEntry => ({
    at: atMs,
    event: { type: "tool_call", toolCallId: "tc-1", title: "Bash pnpm gate:quick", kind: "execute", status, locations: [] },
  });

  it("fica âmbar a partir de 90 s sem sinal", () => {
    const last = T0 + 2000;
    const state = replayConversation([
      user(T0),
      { at: last, event: { type: "message", messageId: "a-1", role: "agent", text: "Vou rodar." } },
    ]);
    expect(state.lastEventAt).toBe(last);

    const before = turnLine(state, last + 89_000);
    expect(before.tone).toBe("normal");
    expect(before.doing).toBe("escrevendo");

    const at90 = turnLine(state, last + 90_000);
    expect(at90.tone).toBe("warning");
    expect(at90.doing).toBe("sem sinal do agente há 1 min 30 s");

    // Antes de o agente mandar qualquer coisa, o silêncio conta também.
    const quiet = replayConversation([user(T0)]);
    expect(turnLine(quiet, T0 + 89_000).tone).toBe("normal");
    expect(turnLine(quiet, T0 + 90_000)).toEqual({ tone: "warning", doing: "sem sinal do agente há 1 min 30 s" });
  });

  it("ferramenta aberta não é silêncio", () => {
    const now = T0 + 600_000;
    for (const status of ["running", "pending"] as const) {
      const folded = replayConversation([user(T0), tool(now - 240_000, status)]);
      expect(folded.streaming, status).toBe(true);
      // Nenhuma dobra põe `lastEventAt` antes do `startedAt` da chamada — o
      // `tool_call` é ele mesmo um evento. Os dois números do check só coexistem
      // escritos à mão, e é justamente essa distância que prova que o `há` se
      // mede do início da ferramenta, e não do último evento.
      const state = { ...folded, lastEventAt: now - 300_000 };

      const line = turnLine(state, now);
      expect(line.tone, status).toBe("normal");
      expect(line.doing, status).toBe("rodando Bash pnpm gate:quick há 4 min 0 s");
    }
  });

  it("ferramenta aberta mede do início dela, com evento no meio", () => {
    const now = T0 + 600_000;
    const state = replayConversation([
      user(T0),
      tool(now - 240_000, "pending"),
      { at: now - 100_000, event: { type: "tool_call_update", toolCallId: "tc-1", status: "running" } },
    ]);

    expect(turnLine(state, now)).toEqual({ tone: "normal", doing: "rodando Bash pnpm gate:quick há 4 min 0 s" });
  });

  it("permissão pendente não é silêncio", () => {
    const asked = T0 + 3000;
    const state = replayConversation([
      user(T0),
      tool(T0 + 2000, "pending"),
      {
        at: asked,
        event: {
          type: "permission_request",
          policyReason: null,
          requestId: "rq-1",
          toolCallId: "tc-1",
          title: "Bash pnpm gate:quick",
          command: "pnpm gate:quick",
          cwd: "/repos/lorebase",
          options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
        },
      },
    ]);
    expect(state.pendingPermission).not.toBeNull();
    expect(state.lastEventAt).toBe(asked);

    const line = turnLine(state, asked + 300_000);
    expect(line.tone).toBe("normal");
    expect(line.doing).toBe("esperando sua resposta");
  });
});
