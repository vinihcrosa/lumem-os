import type { AcpEvent, AcpPermissionOption, AcpTranscriptEntry } from "@lumem/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { replayConversation } from "./conversation-model.js";
import { Transcript } from "./Transcript.js";

/**
 * O cartão de aprovação do plano (`035` S3), pelo transcript de verdade.
 *
 * Pelo `Transcript` e não pelo cartão solto: o que os critérios afirmam passa
 * pela ligação do pedido ao tool call pelo `toolCallId` — o cartão no lugar do
 * tool call, e o bloco genérico de permissão sumindo para esse pedido. Os
 * eventos são os do adaptador `0.75.1`, verbatim.
 */

/** 30 linhas: um título e 29 passos. Mais que o dobro do teto de 12 do `ToolCard`. */
const PLAN = [
  "# Separar o parser do loader",
  ...Array.from({ length: 29 }, (_, index) => `- passo ${String(index + 2)}`),
].join("\n");

const OPTIONS: AcpPermissionOption[] = [
  { optionId: "exit-plan-clear-auto", name: "Yes, clear context (32% used) and use auto mode", kind: "allow_always" },
  { optionId: "exit-plan-auto", name: "Yes, and use auto mode", kind: "allow_always" },
  { optionId: "exit-plan-default", name: "Yes, manually approve edits", kind: "allow_once" },
  { optionId: "reject", name: "No, keep planning", kind: "reject_once" },
];

let clock = 1_700_000_000_000;
function at(event: AcpEvent): AcpTranscriptEntry {
  clock += 10;
  return { at: clock, event };
}

function toolCall(content: boolean): AcpTranscriptEntry {
  return at({
    type: "tool_call",
    toolCallId: "tc-plan",
    title: "Approve Plan",
    name: "ExitPlanMode",
    kind: "switch_mode",
    status: "pending",
    locations: [],
    ...(content ? { content: [{ type: "content" as const, text: PLAN }] } : {}),
  });
}

const request = (): AcpTranscriptEntry =>
  at({
    type: "permission_request",
    requestId: "rq-plan",
    toolCallId: "tc-plan",
    title: "Approve Plan",
    command: null,
    cwd: "/repos/lorebase",
    options: OPTIONS,
    policyReason: null,
  });

const resolved = (outcome: "cancelled" | { optionId: string }): AcpTranscriptEntry =>
  at({ type: "permission_resolved", requestId: "rq-plan", outcome, by: "user", reason: null });

function show(entries: AcpTranscriptEntry[]) {
  const answer = vi.fn();
  const view = render(
    <Transcript
      conversation={replayConversation(entries)}
      session={null}
      failure={null}
      readOnly={false}
      answer={answer}
    />,
  );
  return { answer, view };
}

const pending = () => show([toolCall(true), request()]);

/** O cartão do plano: as buscas das opções ficam dentro dele, e não no transcript inteiro. */
const card = () => within(screen.getByRole("group", { name: "aprovar o plano" }));

function optionButtons() {
  return OPTIONS.map((option) => screen.queryByRole("button", { name: option.name }));
}

describe("o plano pendente", () => {
  it("o plano pendente aparece inteiro e renderizado", () => {
    const { view } = pending();

    expect(screen.getByRole("heading", { name: "Separar o parser do loader" })).toBeVisible();
    expect(screen.getByText("passo 2")).toBeVisible();
    expect(screen.getByText("passo 30")).toBeVisible();
    expect(view.container.querySelector(".perm")).toBeNull();
  });

  it("as opções aparecem verbatim e a recusa vem separada", () => {
    pending();

    const buttons = OPTIONS.map((option) => screen.getByRole("button", { name: option.name }));
    const keep = screen.getByText("ou continuar planejando");
    // As três `allow_*` na ordem recebida, e antes do texto; a recusa depois dele.
    for (const [index, button] of buttons.slice(0, 3).entries()) {
      const next = buttons[index + 1] ?? keep;
      expect(button.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(button.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(keep.compareDocumentPosition(buttons[3]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(OPTIONS.map((option) => [option.optionId, option.name]))(
    "cada opção responde com o seu optionId (%s)",
    async (optionId, name) => {
      const { answer } = pending();

      await userEvent.click(card().getByRole("button", { name }));

      expect(answer).toHaveBeenCalledExactlyOnceWith("rq-plan", optionId);
    },
  );

  it("Enter aprova a allow_once e Esc recusa", async () => {
    const enter = pending();
    expect(card().getByRole("button", { name: "Yes, manually approve edits" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(enter.answer).toHaveBeenCalledExactlyOnceWith("rq-plan", "exit-plan-default");
    enter.view.unmount();

    const escape = pending();
    expect(card().getByRole("button", { name: "No, keep planning" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(escape.answer).toHaveBeenCalledExactlyOnceWith("rq-plan", "reject");
  });

  it("sem texto do plano o cartão diz e mantém as opções", () => {
    show([toolCall(false), request()]);

    expect(screen.getByText("o agente não mandou o texto do plano")).toBeInTheDocument();
    for (const button of optionButtons()) expect(button).toBeInTheDocument();
  });
});

describe("o plano decidido", () => {
  it.each([
    ["exit-plan-auto", "Yes, and use auto mode"],
    ["exit-plan-clear-auto", "Yes, clear context (32% used) and use auto mode"],
    ["exit-plan-default", "Yes, manually approve edits"],
  ])("aprovar vira registro com o nome da opção (%s)", (optionId, name) => {
    show([toolCall(true), request(), resolved({ optionId })]);

    expect(screen.getByText(`plano aprovado — ${name}`)).toBeInTheDocument();
    for (const button of optionButtons()) expect(button).toBeNull();
  });

  it("recusar vira registro de continuar planejando", () => {
    show([toolCall(true), request(), resolved({ optionId: "reject" })]);

    expect(screen.getByText("você pediu para continuar planejando")).toBeInTheDocument();
    for (const button of optionButtons()) expect(button).toBeNull();
  });

  it("pedido cancelado vira registro", () => {
    show([toolCall(true), request(), resolved("cancelled")]);

    expect(screen.getByText("pedido cancelado")).toBeInTheDocument();
    for (const button of optionButtons()) expect(button).toBeNull();
  });

  it("o registro recolhe o plano e ver o plano o abre", async () => {
    show([toolCall(true), request(), resolved({ optionId: "exit-plan-auto" })]);

    expect(screen.queryByText("passo 30")).not.toBeInTheDocument();

    const card = screen.getByText("plano aprovado — Yes, and use auto mode").closest("[role=group]");
    await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "ver o plano" }));

    expect(screen.getByRole("heading", { name: "Separar o parser do loader" })).toBeInTheDocument();
    expect(screen.getByText("passo 30")).toBeInTheDocument();
  });
});
