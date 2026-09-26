import { QueryClientProvider } from "@tanstack/react-query";
import type { AcpClientMessage, AcpServerMessage, AcpTranscriptEntry } from "@lumem/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AwaitingPermissionProvider } from "../../hooks/useAwaitingPermission.js";
import { createQueryClient } from "../../lib/queryClient.js";
import { accountRow } from "../../test/agent-account-fixtures.js";
import { installTrpcDefaults, trpcMock } from "../../test/trpc-mock.js";
import { Conversation, type ConversationProps } from "./Conversation.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * O cabeçalho com a conta e o gesto de continuar (`034` T15).
 *
 * O cabeçalho só diz a conta quando o agente tem mais de uma (o daemon decide
 * isso em `multiAccount`, e a aba repassa o rótulo só então). O gesto aparece
 * quando há duas contas conectadas no total, e as linhas de vínculo levam à
 * outra aba.
 */

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AwaitingPermissionProvider>{children}</AwaitingPermissionProvider>
    </QueryClientProvider>
  );
}

class FakeSocket {
  readonly sent: AcpClientMessage[] = [];
  deliver!: (message: AcpServerMessage) => void;
  send(message: AcpClientMessage): void {
    this.sent.push(message);
  }
  close(): void {}
}

function attached(transcript: AcpTranscriptEntry[] = []): AcpServerMessage {
  return {
    type: "attached",
    modeOwner: "agent",
    cwd: "/repos/lorebase",
    lumemMode: "ask",
    lumemModeDefault: "ask",
    sessionId: "s-1",
    state: "running",
    acpSessionId: "d81b05ee-d361",
    model: "opus[1m]",
    mode: "auto",
    configOptions: [],
    transcript,
  };
}

const SAID: AcpTranscriptEntry = {
  at: 1_700_000_000_000,
  event: { type: "message", messageId: "m-1", role: "agent", text: "feito" },
};

function mount(props: Partial<ConversationProps> = {}) {
  const socket = new FakeSocket();
  const connect = (_id: string, handlers: { onMessage(message: AcpServerMessage): void }) => {
    socket.deliver = handlers.onMessage;
    return socket;
  };
  render(
    <Providers>
      <Conversation sessionId="s-1" agentName="claude" connect={connect} {...props} />
    </Providers>,
  );
  return socket;
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults(trpcMock);
  trpcMock.agentAccount.list.query.mockResolvedValue([accountRow()]);
});

describe("o cabeçalho", () => {
  it("com uma conta, só o agente", () => {
    mount();

    expect(document.querySelector(".conv__who")).toHaveTextContent(/^◆claude$/);
  });

  it("com mais de uma, agente · conta", () => {
    mount({ accountLabel: "trabalho" });

    expect(document.querySelector(".conv__who")).toHaveTextContent(/^◆claude · trabalho$/);
  });
});

describe("continuar em outra conta", () => {
  const TWO = [
    accountRow(),
    accountRow({ id: "acct_trabalho", label: "trabalho", isDefault: false, bare: false }),
    accountRow({ id: "acct_codex", adapterId: "codex", label: "chatgpt", isDefault: true }),
    accountRow({ id: "acct_velha", label: "velha", isDefault: false, bare: false, state: "disconnected" }),
  ];

  it("com uma conta conectada só, o gesto não aparece", async () => {
    mount({ continueIn: { currentAccountId: "acct_pessoal", onContinue: vi.fn(), pending: false } });

    await waitFor(() => expect(trpcMock.agentAccount.list.query).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /continuar em outra conta/ })).toBeNull();
  });

  it("lista as outras contas conectadas, por agente, e manda a escolhida", async () => {
    const user = userEvent.setup();
    trpcMock.agentAccount.list.query.mockResolvedValue(TWO);
    const onContinue = vi.fn();
    const socket = mount({ continueIn: { currentAccountId: "acct_pessoal", onContinue, pending: false } });
    socket.deliver(attached([SAID]));

    const trigger = await screen.findByRole("button", { name: /continuar em outra conta/ });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "continuar em outra conta" });
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    // A de agora e a desconectada ficam de fora; o agente de cada uma vai junto.
    // O nome da aba e do cabeçalho — o da configuração —, e não o do catálogo:
    // dentro da conversa, um vocabulário só.
    expect(items).toEqual(["claude · trabalho", "codex · chatgpt"]);
    await user.click(within(menu).getByRole("menuitem", { name: "codex · chatgpt" }));

    expect(onContinue).toHaveBeenCalledWith("acct_codex");
  });

  it("sem nada dito, o gesto fica travado e diz por quê", async () => {
    trpcMock.agentAccount.list.query.mockResolvedValue(TWO);
    const socket = mount({ continueIn: { currentAccountId: "acct_pessoal", onContinue: vi.fn(), pending: false } });
    socket.deliver(attached());

    const trigger = await screen.findByRole("button", { name: /continuar em outra conta/ });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("title", "nada foi dito nesta conversa ainda — não há o que continuar");
  });

  it("a recusa do daemon aparece embaixo do cabeçalho", async () => {
    trpcMock.agentAccount.list.query.mockResolvedValue(TWO);
    mount({
      continueIn: { currentAccountId: "acct_pessoal", onContinue: vi.fn(), pending: false, error: "conta desconectada" },
    });

    expect(await screen.findByText("conta desconectada")).toBeInTheDocument();
  });
});

describe("as linhas de vínculo", () => {
  const LINKED: AcpTranscriptEntry[] = [
    { at: 1, event: { type: "continued_from", sessionId: "origem", label: "claude · pessoal", messages: 3, approxTokens: 900 } },
    { at: 2, event: { type: "continued_in", sessionId: "longe", label: "codex · chatgpt" } },
  ];

  it("a que aponta para uma sessão deste escopo leva a ela; a outra fica texto", async () => {
    const user = userEvent.setup();
    const openOrigin = vi.fn();
    const socket = mount({ sessionLink: (id) => (id === "origem" ? openOrigin : null) });
    socket.deliver(attached(LINKED));

    const from = await screen.findByRole("button", { name: /continuação de claude · pessoal/ });
    await user.click(from);

    expect(openOrigin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /continuada em Codex/ })).toBeNull();
    expect(screen.getByText("continuada em codex · chatgpt →")).toHaveClass("meta--conversation");
  });
});
