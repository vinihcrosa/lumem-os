import type { AcpClientMessage, AcpServerMessage } from "@lumem/shared";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AwaitingPermissionProvider, useAwaitingPermission } from "../../hooks/useAwaitingPermission.js";
import type { AcpSocketHandlers } from "./acp-socket.js";
import { useConversationSession } from "./useConversationSession.js";

/**
 * O transporte isolado do resto da conversa (`032` T26).
 *
 * As asserções aqui são sobre o que a `conversation.test.tsx` só conseguia
 * provar através do DOM: a forma exata da mensagem que cada verbo manda, os
 * guardas que decidem se `send` manda algo, e o que acontece quando ninguém
 * está montado para ver — desmontar, sem passar por textarea nem botão.
 */

class FakeSocket {
  readonly sent: AcpClientMessage[] = [];
  closed = false;
  deliver!: (message: AcpServerMessage) => void;

  send(message: AcpClientMessage): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
  }
}

function connectStub(): {
  socket: FakeSocket;
  connect: (sessionId: string, handlers: AcpSocketHandlers) => FakeSocket;
} {
  const socket = new FakeSocket();
  const connect = (_sessionId: string, handlers: AcpSocketHandlers): FakeSocket => {
    socket.deliver = handlers.onMessage;
    return socket;
  };
  return { socket, connect };
}

function attached(): AcpServerMessage {
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
    transcript: [],
  };
}

describe("attaching", () => {
  it("conecta ao montar e aplica o attach no `state`", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    expect(result.current.attached).toBe(false);

    act(() => socket.deliver(attached()));

    expect(result.current.attached).toBe(true);
    expect(result.current.state.session?.acpSessionId).toBe("d81b05ee-d361");
  });

  it("desconecta ao desmontar, sem terminar a conversa", () => {
    const { socket, connect } = connectStub();
    const { unmount } = renderHook(() => useConversationSession("s-1", { connect }));

    unmount();

    // Apenas detach. O daemon mantém a conversa — o teste é sobre o socket, e
    // não sobre o que ele significa para a sessão.
    expect(socket.closed).toBe(true);
  });

  it("lê o transcript do disco quando `live` é falso, sem abrir socket", async () => {
    const connect = (): FakeSocket => {
      throw new Error("não deveria conectar em modo de leitura");
    };
    const load = async (): Promise<AcpServerMessage> =>
      ({ ...attached(), state: "exited" }) as AcpServerMessage;

    const { result } = renderHook(() => useConversationSession("s-1", { live: false, connect, load }));

    await waitFor(() => expect(result.current.attached).toBe(true));
    expect(result.current.readOnly).toBe(true);
  });
});

describe("send", () => {
  it("recusa mandar antes de atado, e não devolve sucesso", () => {
    const { connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    expect(result.current.send("oi")).toBe(false);
  });

  it("recusa texto vazio mesmo já atado", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));
    act(() => socket.deliver(attached()));

    expect(result.current.send("   ")).toBe(false);
    expect(socket.sent).toEqual([]);
  });

  it("manda o texto sem espaço nas pontas, e devolve sucesso", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));
    act(() => socket.deliver(attached()));

    expect(result.current.send("  roda o gate  ")).toBe(true);
    expect(socket.sent).toEqual([{ type: "prompt", text: "roda o gate" }]);
  });

  it("recusa mandar quando a sessão está fechada para escrita", async () => {
    const load = async (): Promise<AcpServerMessage> =>
      ({ ...attached(), state: "exited" }) as AcpServerMessage;
    const { result } = renderHook(() => useConversationSession("s-1", { live: false, load }));

    await waitFor(() => expect(result.current.readOnly).toBe(true));
    expect(result.current.send("oi")).toBe(false);
  });
});

describe("os outros verbos", () => {
  it("cancel manda `cancel`", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    result.current.cancel();

    expect(socket.sent).toEqual([{ type: "cancel" }]);
  });

  it("answer manda a resposta do pedido de permissão", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    result.current.answer("rq-1", "allow");

    expect(socket.sent).toEqual([
      { type: "permission_response", requestId: "rq-1", optionId: "allow" },
    ]);
  });

  it("setMode manda a política do Lumem", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    result.current.setMode("free");

    expect(socket.sent).toEqual([{ type: "set_lumem_mode", mode: "free" }]);
  });

  it("setConfig manda a configuração do agente", () => {
    const { socket, connect } = connectStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect }));

    result.current.setConfig("model", "sonnet");

    expect(socket.sent).toEqual([{ type: "set_config", optionId: "model", value: "sonnet" }]);
  });
});

/**
 * A costura que a `conversation.test.tsx` não isola: o aviso a quem está
 * esperando é a `AwaitingPermissionProvider`, que mora **acima** da
 * conversa — desmontar só a sessão, com o provider vivo por cima, é o que
 * prova a limpeza. Um `renderHook` sozinho desmontaria os dois juntos e o
 * teste não provaria nada: por isso a sonda (`Watcher`) e o que se desmonta
 * (`SessionProbe`) são dois componentes na mesma árvore, no molde de
 * `hooks/awaiting-permission.test.tsx`.
 */
describe("o aviso de quem está esperando", () => {
  it("reporta esperando enquanto há permissão pendente, e limpa ao desmontar", () => {
    const { socket, connect } = connectStub();
    const captured: { current: ReturnType<typeof useAwaitingPermission> | null } = {
      current: null,
    };

    function Watcher() {
      captured.current = useAwaitingPermission();
      return null;
    }

    function SessionProbe() {
      useConversationSession("s-1", { connect });
      return null;
    }

    const { rerender } = render(
      <AwaitingPermissionProvider>
        <Watcher />
        <SessionProbe />
      </AwaitingPermissionProvider>,
    );

    expect(captured.current?.isWaiting("s-1")).toBe(false);

    act(() =>
      socket.deliver({
        type: "event",
        at: 1,
        event: {
          type: "permission_request",
          policyReason: null,
          requestId: "rq-1",
          toolCallId: "tc-1",
          title: "Bash rm -rf .vite",
          command: "rm -rf node_modules/.vite",
          cwd: "/repos/lorebase",
          options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
        },
      }),
    );

    expect(captured.current?.isWaiting("s-1")).toBe(true);

    // O provider e o `Watcher` continuam montados; só a sessão vai embora.
    rerender(
      <AwaitingPermissionProvider>
        <Watcher />
      </AwaitingPermissionProvider>,
    );

    expect(captured.current?.isWaiting("s-1")).toBe(false);
  });
});
