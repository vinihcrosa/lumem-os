import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { cutTranscript, TOOL_OUTPUT_LIMIT } from "./transcript-cut.js";

/**
 * O corte da passagem de conta (`034` T11, Q3a).
 *
 * Vai tudo o que foi dito e o registro de cada ferramenta; a saída longa vira
 * uma linha. O limiar é da nota de 2026-09-26: 2 000 caracteres.
 */

function entries(...events: AcpEvent[]): AcpTranscriptEntry[] {
  return events.map((event, index) => ({ at: index, event }));
}

function lines(count: number, width = 60): string {
  return Array.from({ length: count }, (_, index) => `${String(index).padStart(4, "0")} ${"x".repeat(width)}`).join(
    "\n",
  );
}

describe("cutTranscript", () => {
  it("leva o que foi dito, com os pedaços da mesma mensagem juntos", () => {
    const cut = cutTranscript(
      entries(
        { type: "message", messageId: "u1", role: "user", text: "conserta o /orders" },
        { type: "message", messageId: "a1", role: "agent", text: "Vou olhar " },
        { type: "message", messageId: "a1", role: "agent", text: "o handler." },
        { type: "turn_end", stopReason: "end_turn" },
        { type: "message", messageId: "u2", role: "user", text: "e o teste?" },
      ),
    );

    expect(cut.text).toContain("conserta o /orders");
    expect(cut.text).toContain("Vou olhar o handler.");
    expect(cut.text).toContain("e o teste?");
    expect(cut.messages).toBe(3);
    // A ordem é a da conversa.
    expect(cut.text.indexOf("conserta")).toBeLessThan(cut.text.indexOf("Vou olhar"));
    expect(cut.text.indexOf("Vou olhar")).toBeLessThan(cut.text.indexOf("e o teste?"));
  });

  it("saída longa de ferramenta vira uma linha, com o título e quantas linhas tinha", () => {
    const output = lines(120);
    expect(output.length).toBeGreaterThan(TOOL_OUTPUT_LIMIT);

    const cut = cutTranscript(
      entries(
        { type: "message", messageId: "u1", role: "user", text: "lê o schema" },
        {
          type: "tool_call",
          toolCallId: "t1",
          title: "Read schema.ts",
          kind: "read",
          status: "running",
          locations: [],
        },
        {
          type: "tool_call_update",
          toolCallId: "t1",
          status: "ok",
          content: [{ type: "content", text: output }],
        },
      ),
    );

    expect(cut.text).toContain("[Read schema.ts — 120 linhas, omitido]");
    expect(cut.text).not.toContain("0042 xxxx");
    expect(cut.text.length).toBeLessThan(500);
  });

  it("saída curta fica inteira, e o registro da ferramenta diz título, tipo e estado", () => {
    const cut = cutTranscript(
      entries(
        {
          type: "tool_call",
          toolCallId: "t1",
          title: "git status",
          kind: "execute",
          status: "pending",
          locations: [],
        },
        {
          type: "tool_call_update",
          toolCallId: "t1",
          status: "ok",
          content: [{ type: "content", text: "On branch main\nnothing to commit" }],
        },
      ),
    );

    expect(cut.text).toContain("git status · execute · ok");
    expect(cut.text).toContain("On branch main\nnothing to commit");
    expect(cut.text).not.toContain("omitido");
  });

  it("no limiar exato a saída fica; um caractere acima, vira linha", () => {
    const at = "a".repeat(TOOL_OUTPUT_LIMIT);
    const over = "b".repeat(TOOL_OUTPUT_LIMIT + 1);
    const call = (id: string, text: string): AcpEvent[] => [
      { type: "tool_call", toolCallId: id, title: `t-${id}`, kind: "read", status: "running", locations: [] },
      { type: "tool_call_update", toolCallId: id, status: "ok", content: [{ type: "content", text }] },
    ];

    const cut = cutTranscript(entries(...call("1", at), ...call("2", over)));

    expect(cut.text).toContain(at);
    expect(cut.text).not.toContain(over);
    expect(cut.text).toContain("[t-2 — 1 linhas, omitido]");
  });

  it("um diff conta como saída: o caminho e o texto novo, sob o mesmo limiar", () => {
    const cut = cutTranscript(
      entries(
        { type: "tool_call", toolCallId: "t1", title: "Edit a.ts", kind: "edit", status: "running", locations: [] },
        {
          type: "tool_call_update",
          toolCallId: "t1",
          status: "ok",
          content: [{ type: "diff", path: "/wt/a.ts", oldText: "old", newText: "export const a = 1;" }],
        },
        { type: "tool_call", toolCallId: "t2", title: "Write big.ts", kind: "edit", status: "running", locations: [] },
        {
          type: "tool_call_update",
          toolCallId: "t2",
          status: "ok",
          content: [{ type: "diff", path: "/wt/big.ts", newText: lines(80) }],
        },
      ),
    );

    expect(cut.text).toContain("/wt/a.ts");
    expect(cut.text).toContain("export const a = 1;");
    expect(cut.text).toMatch(/\[Write big\.ts — \d+ linhas, omitido\]/);
  });

  it("o título e o estado são os da última atualização, e o conteúdo novo substitui o velho", () => {
    const cut = cutTranscript(
      entries(
        { type: "tool_call", toolCallId: "t1", title: "Terminal", kind: "execute", status: "pending", locations: [] },
        { type: "tool_call_update", toolCallId: "t1", title: "pnpm test", content: [{ type: "content", text: "rodando" }] },
        {
          type: "tool_call_update",
          toolCallId: "t1",
          status: "failed",
          content: [{ type: "content", text: "3 failed" }],
        },
      ),
    );

    expect(cut.text).toContain("pnpm test · execute · failed");
    expect(cut.text).toContain("3 failed");
    expect(cut.text).not.toContain("rodando");
    expect(cut.text).not.toContain("Terminal ·");
  });

  it("não leva pensamento, consumo, seletores, núcleo da memória nem as linhas do daemon", () => {
    const cut = cutTranscript(
      entries(
        { type: "memory_core", entries: 3, chars: 1200 },
        { type: "message", messageId: "u1", role: "user", text: "oi" },
        { type: "thought", messageId: "th1", text: "PENSAMENTO-SECRETO" },
        { type: "usage", used: 1000, size: 200000, cost: { amount: 0.5, currency: "USD" } },
        { type: "config", mode: "default", options: [], modeOwner: "agent", lumemMode: "ask", lumemModeDefault: "ask" },
        { type: "commands", commands: [{ name: "COMANDO-X", description: "d", takesInput: false }] },
        { type: "plan", entries: [{ content: "PASSO-DO-PLANO", priority: "high", status: "pending" }] },
        { type: "model_unavailable", model: "MODELO-VELHO", current: "sonnet" },
        {
          type: "budget",
          outcome: "warn",
          cap: "cost-per-day",
          limit: 1,
          spent: 2,
          message: "FRASE-DO-TETO",
        },
        { type: "resumed", fromSessionId: "SESSAO-ANTIGA" },
        { type: "turn_end", stopReason: "end_turn" },
      ),
    );

    for (const absent of [
      "PENSAMENTO-SECRETO",
      "200000",
      "COMANDO-X",
      "PASSO-DO-PLANO",
      "MODELO-VELHO",
      "FRASE-DO-TETO",
      "SESSAO-ANTIGA",
      "1200",
    ]) {
      expect(cut.text).not.toContain(absent);
    }
    expect(cut.messages).toBe(1);
  });

  it("Claude → Codex: nada do adaptador de origem atravessa — o mesmo registro para as duas formas", () => {
    // O Claude manda o nome programático (`Read`); o Codex não manda nenhum.
    const claude = cutTranscript(
      entries({
        type: "tool_call",
        toolCallId: "toolu_01ABC",
        title: "Read src/orders.ts",
        name: "Read",
        kind: "read",
        status: "ok",
        locations: [{ path: "/wt/src/orders.ts" }],
      }),
    );
    const codex = cutTranscript(
      entries({
        type: "tool_call",
        toolCallId: "call_xyz",
        title: "Read src/orders.ts",
        name: null,
        kind: "read",
        status: "ok",
        locations: [{ path: "/wt/src/orders.ts" }],
      }),
    );

    expect(claude.text).toBe(codex.text);
    expect(claude.text).not.toContain("toolu_01ABC");
    expect(claude.text).not.toContain("Read ·");
  });

  it("os tokens são aproximados por caracteres ÷ 4", () => {
    const cut = cutTranscript(entries({ type: "message", messageId: "u1", role: "user", text: "x".repeat(400) }));

    expect(cut.approxTokens).toBe(Math.ceil(cut.text.length / 4));
    expect(cut.approxTokens).toBeGreaterThanOrEqual(100);
  });

  it("uma conversa sem nada dito corta em vazio", () => {
    const cut = cutTranscript(entries({ type: "turn_end", stopReason: "end_turn" }));

    expect(cut).toEqual({ text: "", messages: 0, approxTokens: 0 });
  });
});
