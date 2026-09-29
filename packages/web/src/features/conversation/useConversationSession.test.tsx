import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  type AcpClientMessage,
  type AcpServerMessage,
  type AcpTranscriptEntry,
} from "@lumem/shared";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  send(message: AcpClientMessage): boolean {
    this.sent.push(message);
    return true;
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

/**
 * A conexão que cai e volta (`035` S2, door 3).
 *
 * Um socket por `connect`, cada um com os seus handlers: é o que deixa o teste
 * derrubar a conexão corrente e ver se o hook abre **outra**, para a mesma
 * sessão, na hora certa — e não abre nenhuma quando não deve.
 */
class LiveSocket {
  readonly sent: AcpClientMessage[] = [];
  closed = false;

  constructor(
    readonly sessionId: string,
    private readonly handlers: AcpSocketHandlers,
  ) {}

  send(message: AcpClientMessage): boolean {
    this.sent.push(message);
    return true;
  }

  close(): void {
    this.closed = true;
  }

  deliver(message: AcpServerMessage): void {
    this.handlers.onMessage(message);
  }

  /** O daemon, ou a rede, fechando — nunca o cliente. */
  hangUp(code: number): void {
    this.handlers.onClose?.({
      code,
      clean: false,
      refused: code === ACP_CLOSE_SESSION_NOT_FOUND,
    });
  }

  garble(error: string): void {
    this.handlers.onDecodeError?.(error);
  }
}

function liveStub(): {
  sockets: LiveSocket[];
  connect: (sessionId: string, handlers: AcpSocketHandlers) => LiveSocket;
  last: () => LiveSocket;
} {
  const sockets: LiveSocket[] = [];
  const connect = (sessionId: string, handlers: AcpSocketHandlers): LiveSocket => {
    const socket = new LiveSocket(sessionId, handlers);
    sockets.push(socket);
    return socket;
  };
  return { sockets, connect, last: () => sockets.at(-1)! };
}

let clock = 1_700_000_000_000;
function entry(event: AcpTranscriptEntry["event"]): AcpTranscriptEntry {
  clock += 1_000;
  return { at: clock, event };
}

describe("a conexão que cai", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra a queda e reabre o socket", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect: stub.connect }));
    act(() => stub.last().deliver(attached()));

    act(() => stub.last().hangUp(1006));

    expect(result.current.state.failure).toMatchObject({
      message: "conexão com o daemon caiu — reconectando",
      fatal: false,
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(stub.sockets).toHaveLength(2);
    expect(stub.sockets[1]!.sessionId).toBe("s-1");
  });

  it("espaça as tentativas até 10 s e não desiste", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    renderHook(() => useConversationSession("s-1", { connect: stub.connect }));

    // Cada tentativa falha: o socket novo cai antes de o daemon responder.
    for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000]) {
      act(() => stub.last().hangUp(1006));
      const before = stub.sockets.length;

      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      expect(stub.sockets).toHaveLength(before);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(stub.sockets).toHaveLength(before + 1);
    }

    // A oitava reabertura: o teto fica em 10 s, e a aba montada segue tentando.
    act(() => stub.last().hangUp(1006));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(stub.sockets).toHaveLength(9);
    expect(stub.sockets.every((socket) => socket.sessionId === "s-1")).toBe(true);
  });

  it("o attached da reabertura substitui a conversa sem duplicar turnos", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect: stub.connect }));

    const before = [
      entry({ type: "message", messageId: "u-1", role: "user", text: "roda o gate" }),
      entry({ type: "message", messageId: "a-1", role: "agent", text: "rodei" }),
      entry({ type: "turn_end", stopReason: "end_turn" }),
    ];
    act(() => stub.last().deliver(attached(before)));
    expect(result.current.state.conversation.turns).toHaveLength(2);

    act(() => stub.last().hangUp(1006));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(stub.sockets).toHaveLength(2);

    const after = [
      ...before,
      entry({ type: "message", messageId: "u-2", role: "user", text: "e agora?" }),
    ];
    act(() => stub.last().deliver(attached(after)));

    expect(result.current.state.conversation.turns).toHaveLength(3);
    expect(result.current.state.failure).toBeNull();
  });

  it("sessão que sumiu do daemon não reabre", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect: stub.connect }));
    act(() => stub.last().deliver(attached()));

    act(() => stub.last().hangUp(ACP_CLOSE_SESSION_NOT_FOUND));

    expect(result.current.state.failure?.message).toBe("esta sessão não existe mais no daemon");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(stub.sockets).toHaveLength(1);
  });

  it("não reabre depois de desmontar nem ao trocar de sessão", () => {
    vi.useFakeTimers();

    // Desmontar com a reabertura já agendada.
    const unmounted = liveStub();
    const first = renderHook(() => useConversationSession("s-1", { connect: unmounted.connect }));
    act(() => unmounted.last().hangUp(1006));
    first.unmount();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(unmounted.sockets).toHaveLength(1);

    // Trocar de sessão com a reabertura da antiga já agendada.
    const switched = liveStub();
    const second = renderHook(
      ({ id }: { id: string }) => useConversationSession(id, { connect: switched.connect }),
      { initialProps: { id: "s-1" } },
    );
    act(() => switched.last().hangUp(1006));
    second.rerender({ id: "s-2" });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(switched.sockets.filter((socket) => socket.sessionId === "s-1")).toHaveLength(1);
    expect(switched.sockets.filter((socket) => socket.sessionId === "s-2")).toHaveLength(1);
  });

  it("frame que não decodifica vira aviso e não fecha", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect: stub.connect }));
    act(() => stub.last().deliver(attached()));

    act(() => stub.last().garble("event.type: Invalid input"));

    expect(result.current.state.failure).toEqual({
      message: "o daemon mandou algo que esta tela não entende — recarregue a página",
      remedy: null,
      fatal: false,
    });
    expect(stub.last().closed).toBe(false);
    expect(stub.sockets).toHaveLength(1);
    // Não fatal: a conversa segue aceitando envio pelo mesmo socket.
    expect(result.current.send("ainda funciona?")).toBe(true);
    expect(stub.last().sent).toEqual([{ type: "prompt", text: "ainda funciona?" }]);
  });

  it("uma reabertura que recebeu o attached recomeça a espera do início", () => {
    vi.useFakeTimers();
    const stub = liveStub();
    renderHook(() => useConversationSession("s-1", { connect: stub.connect }));

    // Duas quedas seguidas levam a espera a 1 s; a segunda reabertura volta.
    act(() => stub.last().hangUp(1006));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => stub.last().hangUp(1006));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => stub.last().deliver(attached()));
    expect(stub.sockets).toHaveLength(3);

    act(() => stub.last().hangUp(1006));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(stub.sockets).toHaveLength(4);
  });

  it("devolve false quando o socket recusa o envio", () => {
    const stub = liveStub();
    const { result } = renderHook(() => useConversationSession("s-1", { connect: stub.connect }));
    act(() => stub.last().deliver(attached()));
    const socket = stub.last();
    socket.send = () => false;

    let sent = true;
    act(() => {
      sent = result.current.send("oi");
    });

    expect(sent).toBe(false);
  });
});
