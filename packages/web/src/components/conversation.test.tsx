import type { AcpConfigOption, AcpServerMessage, AcpTranscriptEntry } from "@lumem/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AwaitingPermissionProvider } from "../hooks/useAwaitingPermission.js";
import type { AcpClientMessage } from "@lumem/shared";
import { Conversation } from "./Conversation.js";

/**
 * The conversation end to end, against a socket that never leaves the process.
 *
 * The assertions here are about the seams the pieces do not cover on their own:
 * that a reattach replaces rather than stacks, that the composer knows when it is
 * blocked, and that a launch failure reads as a sentence with a way out instead
 * of as an empty panel.
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

function mount(options: { active?: boolean } = {}): { socket: FakeSocket; rerender: () => void } {
  const socket = new FakeSocket();
  const { active = true } = options;

  const connect = (
    _sessionId: string,
    handlers: { onMessage(message: AcpServerMessage): void },
  ) => {
    socket.deliver = handlers.onMessage;
    return socket;
  };

  const view = render(
    <AwaitingPermissionProvider>
      <Conversation sessionId="s-1" connect={connect} active={active} />
    </AwaitingPermissionProvider>,
  );

  return {
    socket,
    rerender: () =>
      view.rerender(
        <AwaitingPermissionProvider>
          <Conversation sessionId="s-1" connect={connect} active={active} />
        </AwaitingPermissionProvider>,
      ),
  };
}

let clock = 1_700_000_000_000;
function entry(event: AcpTranscriptEntry["event"], deltaMs = 0): AcpTranscriptEntry {
  clock += deltaMs;
  return { at: clock, event };
}

function attached(
  transcript: AcpTranscriptEntry[] = [],
  configOptions: AcpConfigOption[] = [],
  /** Quem é o dono do seletor de modo (`session-mode`, A1). */
  modeOwner: "agent" | "lumem" = "agent",
): AcpServerMessage {
  return {
    type: "attached",
    modeOwner,
    cwd: "/repos/lorebase",
    lumemMode: "ask",
    lumemModeDefault: "ask",
    sessionId: "s-1",
    state: "running",
    acpSessionId: "d81b05ee-d361",
    model: "opus[1m]",
    mode: "auto",
    configOptions,
    transcript,
  };
}

const permissionRequest: AcpTranscriptEntry["event"] = {
  type: "permission_request",
  policyReason: null,
  requestId: "rq-1",
  toolCallId: "tc-1",
  title: "Bash rm -rf .vite",
  command: "rm -rf node_modules/.vite",
  cwd: "/repos/lorebase",
  options: [
    { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
    { optionId: "no", name: "não", kind: "reject_once" },
  ],
};

describe("attaching", () => {
  it("says it is connecting until the daemon answers", () => {
    mount();

    expect(screen.getByText("conectando…")).toBeInTheDocument();
  });

  it("shows the session's own details once attached", async () => {
    const { socket } = mount();

    socket.deliver(attached());

    await waitFor(() => {
      expect(screen.getByText(/sessão d81b05ee · opus\[1m\] · auto/)).toBeInTheDocument();
    });
  });

  it("explains what a new session already cost", async () => {
    // Not a blank panel: the session cost about 39k of system prompt before
    // anyone typed, measured in the spike, and that is the first thing worth
    // knowing.
    const { socket } = mount();
    socket.deliver(attached());

    await waitFor(() => {
      expect(screen.getByText("sessão aberta, nada pedido ainda")).toBeInTheDocument();
    });
    expect(screen.getByText(/39,2k/)).toBeInTheDocument();
  });

  it("replays the transcript instead of stacking a second copy on it", async () => {
    // A reattach after a dropped socket delivers `attached` again. Merging would
    // show every message twice.
    const { socket } = mount();
    const transcript = [
      entry({ type: "message", messageId: "u-1", role: "user", text: "arruma isso" }),
      entry({ type: "turn_end", stopReason: "end_turn" }),
    ];

    socket.deliver(attached(transcript));
    await waitFor(() => expect(screen.getByText("arruma isso")).toBeInTheDocument());

    socket.deliver(attached(transcript));

    await waitFor(() => expect(screen.getAllByText("arruma isso")).toHaveLength(1));
  });
});

describe("sending", () => {
  it("sends the draft on ⌘⏎ and clears the box", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("arruma o frontmatter");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(socket.sent).toEqual([{ type: "prompt", text: "arruma o frontmatter" }]);
    expect(box).toHaveValue("");
  });

  it("sends on a plain Enter", async () => {
    /*
     * Reversed on purpose, and it is a product decision made twice.
     *
     * It used to be ⌘⏎ to send and Enter for a newline, because a prompt is often
     * several lines. The other way round won: Enter is what fingers already do in
     * a chat box, and a multi-line prompt pays a modifier instead of getting one
     * for free.
     */
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("uma linha{Enter}");

    expect(socket.sent).toEqual([{ type: "prompt", text: "uma linha" }]);
    expect(box).toHaveValue("");
  });

  it("makes a newline on ⇧⏎, so a multi-line prompt is still possible", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("primeira linha{Shift>}{Enter}{/Shift}segunda");

    expect(socket.sent).toEqual([]);
    expect(box).toHaveValue("primeira linha\nsegunda");
  });

  it("keeps ⌘⏎ working, so nothing anyone learned stopped working", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.type(box, "oi");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(socket.sent).toEqual([{ type: "prompt", text: "oi" }]);
  });

  it("does not send while an IME is composing", async () => {
    // Enter accepts a candidate there. Sending would cut the word in half and
    // fire the turn on it.
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.type(box, "こんにち");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });

    expect(socket.sent).toEqual([]);
  });

  it("refuses to send nothing", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("   ");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(socket.sent).toEqual([]);
    expect(screen.getByRole("button", { name: /enviar/ })).toBeDisabled();
  });

  it("não envia antes de a sessão estar atada — e não perde o texto", async () => {
    /*
     * O socket recusa escrita antes de abrir, e o rascunho tinha que sobreviver a
     * isso. Antes, o envio saía, o socket largava, e o texto era limpo de
     * qualquer jeito: a pessoa perdia a mensagem e a tela não dizia nada.
     *
     * Quem cobrou foi o CI, e só no Linux — numa máquina mais lenta o `attached`
     * chega depois do primeiro clique, e o primeiro turno não acontecia.
     */
    const user = userEvent.setup();
    const { socket } = mount();
    // Sem `socket.deliver(attached())`: é exatamente a janela do defeito.

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.type(box, "arruma o frontmatter");
    await user.keyboard("{Enter}");

    expect(socket.sent).toEqual([]);
    expect(box).toHaveValue("arruma o frontmatter");
    expect(screen.getByRole("button", { name: /enviar/ })).toBeDisabled();

    // E quando ata, o mesmo texto vai — sem redigitar nada.
    socket.deliver(attached());
    await user.keyboard("{Enter}");

    expect(socket.sent).toEqual([{ type: "prompt", text: "arruma o frontmatter" }]);
  });

  it("detaches on unmount without ending the conversation", () => {
    const { socket } = mount();
    const view = render(<div />);
    view.unmount();

    // The component's own cleanup closes the socket; the daemon keeps the agent.
    expect(socket.closed).toBe(false);
  });
});

describe("a conversa que nasceu de um pedido", () => {
  /** O mesmo `mount`, com uma primeira mensagem que o produto já traz escrita. */
  function mountWithPrompt(text: string): { socket: FakeSocket; rerender: () => void } {
    const socket = new FakeSocket();
    const connect = (
      _sessionId: string,
      handlers: { onMessage(message: AcpServerMessage): void },
    ) => {
      socket.deliver = handlers.onMessage;
      return socket;
    };

    const view = render(
      <AwaitingPermissionProvider>
        <Conversation sessionId="s-1" connect={connect} initialPrompt={text} />
      </AwaitingPermissionProvider>,
    );
    return {
      socket,
      rerender: () =>
        view.rerender(
          <AwaitingPermissionProvider>
            <Conversation sessionId="s-1" connect={connect} initialPrompt={text} />
          </AwaitingPermissionProvider>,
        ),
    };
  }

  it("manda o pedido sozinha, depois de anexar", async () => {
    // O valor do botão "pedir para o agente criar" é não obrigar ninguém a
    // redigitar a pergunta: a conversa é aberta **para** ela.
    const { socket } = mountWithPrompt("escreva o [scripts] deste projeto");

    expect(socket.sent).toHaveLength(0);
    socket.deliver(attached());

    await waitFor(() => {
      expect(socket.sent).toEqual([
        { type: "prompt", text: "escreva o [scripts] deste projeto" },
      ]);
    });
  });

  /**
   * Uma vez, mesmo quando o efeito roda de novo.
   *
   * O `useEffect` já não dispara por repintura — as dependências não mudam —, então
   * a trava do `ref` existe para o caso em que ele **roda outra vez**: o
   * `StrictMode` do `main.tsx`, que monta, desmonta e monta de novo em
   * desenvolvimento, e qualquer pai que passe um `connect` novo a cada render, que
   * reseta o estado e faz `attached` voltar de falso para verdadeiro.
   *
   * O preço de não ter a trava é um turno duplicado — e turno custa dinheiro.
   */
  it("manda uma vez só, mesmo se o efeito rodar de novo", async () => {
    const socket = new FakeSocket();
    const view = render(
      <AwaitingPermissionProvider>
        <Conversation
          sessionId="s-1"
          connect={(_id, handlers) => {
            socket.deliver = handlers.onMessage;
            return socket;
          }}
          initialPrompt="pergunta"
        />
      </AwaitingPermissionProvider>,
    );
    socket.deliver(attached());
    await waitFor(() => expect(socket.sent).toHaveLength(1));

    // Um `connect` novo: o efeito de conexão reseta o estado, `attached` cai para
    // falso e volta com o próximo frame.
    view.rerender(
      <AwaitingPermissionProvider>
        <Conversation
          sessionId="s-1"
          connect={(_id, handlers) => {
            socket.deliver = handlers.onMessage;
            return socket;
          }}
          initialPrompt="pergunta"
        />
      </AwaitingPermissionProvider>,
    );
    // `act` em vez de `waitFor`: o `waitFor` acerta na primeira checagem — quando
    // ainda é 1 — e passaria mesmo com o segundo envio saindo logo depois. Provado
    // por mutação: com a trava removida, esta versão falha e a anterior não.
    await act(async () => {
      socket.deliver(attached());
      await Promise.resolve();
    });

    expect(socket.sent).toHaveLength(1);
  });

  it("não manda antes de o socket abrir", () => {
    // O `acp-socket` recusa escrita antes de abrir de propósito, e mandar assim
    // perderia a mensagem em silêncio — o defeito que o CI já cobrou uma vez.
    const { socket } = mountWithPrompt("pergunta");

    expect(socket.sent).toHaveLength(0);
  });

  it("conversa encerrada não recebe pedido nenhum", async () => {
    // Ela é um registro: não há socket, e mandar prompt para uma sessão que não
    // pode responder é a coisa que o `readOnly` existe para impedir.
    const socket = new FakeSocket();
    const connect = vi.fn(() => socket);
    render(
      <AwaitingPermissionProvider>
        <Conversation
          sessionId="s-1"
          live={false}
          load={async () => ({ ...attached(), state: "exited" as const })}
          connect={connect}
          initialPrompt="pergunta"
        />
      </AwaitingPermissionProvider>,
    );

    // Espera o caminho de leitura terminar antes de afirmar sobre o socket: sem
    // isto o teste passaria por chegar cedo demais, e não por estar certo.
    await waitFor(() => expect(document.querySelector(".conv__scroll")).not.toBeNull());
    expect(connect).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(0);
  });
});

describe("interrupting", () => {
  it("offers to interrupt only while a turn is in flight", async () => {
    const { socket } = mount();
    socket.deliver(attached());
    expect(screen.queryByRole("button", { name: /interromper/ })).not.toBeInTheDocument();

    socket.deliver({
      type: "event",
      at: clock,
      event: { type: "message", messageId: "u-1", role: "user", text: "roda o gate" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /interromper/ })).toBeInTheDocument();
    });
  });

  it("sends a cancel", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })]));

    await user.click(await screen.findByRole("button", { name: /interromper/ }));

    expect(socket.sent).toEqual([{ type: "cancel" }]);
  });

  it("stops offering it once the turn ends", async () => {
    const { socket } = mount();
    socket.deliver(attached([entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })]));
    await screen.findByRole("button", { name: /interromper/ });

    socket.deliver({ type: "event", at: clock, event: { type: "turn_end", stopReason: "end_turn" } });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /interromper/ })).not.toBeInTheDocument();
    });
  });
});

/*
 * `esc` interrompe.
 *
 * O botão do cabeçalho já existia e não era suficiente: a mão de quem espera está
 * no composer, e `esc` é o reflexo de quem usa um agente no terminal. O que estes
 * testes fixam não é só que ele manda `cancel` — é a **ordem** dos três `esc` da
 * tela, porque cada um deles já tinha dono antes deste chegar.
 */
describe("esc interrupts the turn", () => {
  it("sends a cancel while a turn is in flight", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })]));
    await screen.findByRole("button", { name: /interromper/ });

    await user.keyboard("{Escape}");

    expect(socket.sent).toEqual([{ type: "cancel" }]);
  });

  it("does nothing when no turn is running", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());
    await screen.findByLabelText("mensagem para o agente");

    await user.keyboard("{Escape}");

    expect(socket.sent).toEqual([]);
  });

  it("denies the permission instead, when one is waiting", async () => {
    // O turno já está parado no pedido: ali `esc` é "não, uma vez" (F5.4), e
    // cancelar a conversa inteira por reflexo seria outra coisa.
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(
      attached([
        entry({ type: "message", messageId: "u-1", role: "user", text: "vai" }),
        entry(permissionRequest),
      ]),
    );
    await screen.findByRole("group", { name: "pedido de permissão" });

    await user.keyboard("{Escape}");

    expect(socket.sent).toEqual([
      { type: "permission_response", requestId: "rq-1", optionId: "no" },
    ]);
  });

  it("closes the slash menu instead, when it is open", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })]));
    socket.deliver({
      type: "event",
      at: clock,
      event: {
        type: "commands",
        commands: [{ name: "compact", description: "resume a conversa", takesInput: false }],
      },
    });

    await user.type(await screen.findByLabelText("mensagem para o agente"), "/comp");
    await screen.findByRole("listbox", { name: "comandos do agente" });

    await user.keyboard("{Escape}");

    expect(socket.sent).toEqual([]);
    expect(screen.queryByRole("listbox", { name: "comandos do agente" })).not.toBeInTheDocument();
  });

  it("stays quiet in a tab that is not the one on screen", async () => {
    // As abas escondidas seguem montadas. Um ouvinte de janela sem esta guarda
    // cancelaria o turno de todas as conversas abertas de uma vez.
    const user = userEvent.setup();
    const { socket } = mount({ active: false });
    socket.deliver(attached([entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })]));
    await screen.findByRole("button", { name: /interromper/ });

    await user.keyboard("{Escape}");

    expect(socket.sent).toEqual([]);
  });
});

/*
 * O balão da primeira permissão lembra que já foi visto, e a memória é do
 * navegador. Sem limpar, o segundo teste que o exercita herda a decisão do
 * primeiro — e passa por engano.
 */
beforeEach(() => {
  window.localStorage.clear();
});

describe("a permission blocks the composer", () => {
  it("disables the box and says why", async () => {
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));

    const box = await screen.findByLabelText("mensagem para o agente");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute(
      "placeholder",
      "responda o pedido de permissão para continuar",
    );
  });

  it("answers the request the conversation is actually blocked on", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));

    await user.click(await screen.findByRole("button", { name: /permitir uma vez/ }));

    expect(socket.sent).toEqual([
      { type: "permission_response", requestId: "rq-1", optionId: "allow" },
    ]);
  });

  it("explains the Auto mode the first time it stops and asks", async () => {
    // Depois do pedido, nunca sobre ele: a primeira ação continua sendo
    // responder, e o turno está parado esperando uma pessoa (F5.4).
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));

    expect(await screen.findByRole("note")).toHaveTextContent(/modo/);
    expect(screen.getByRole("button", { name: /permitir uma vez/ })).toBeInTheDocument();
  });

  it("does not explain it again after 'não mostrar de novo'", async () => {
    const user = userEvent.setup();
    const first = mount();
    first.socket.deliver(attached([entry(permissionRequest)]));

    await user.click(await screen.findByRole("button", { name: "não mostrar de novo" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    // Uma vez por máquina, não por sessão: o que se ensina é o conceito, e ele
    // se aprende na primeira vez que acontece.
    cleanup();
    const second = mount();
    second.socket.deliver(attached([entry(permissionRequest)]));

    await screen.findByRole("button", { name: /permitir uma vez/ });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("dismisses the explanation without remembering it", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));
    await user.click(await screen.findByRole("button", { name: "entendi" }));

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("lumem.coach.permission")).toBeNull();
  });

  it("frees the composer once the request is resolved", async () => {
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));
    expect(await screen.findByLabelText("mensagem para o agente")).toBeDisabled();

    socket.deliver({
      type: "event",
      at: clock,
      event: {
        type: "permission_resolved",
        requestId: "rq-1",
        outcome: { optionId: "allow" },
        by: "user",
        reason: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("mensagem para o agente")).not.toBeDisabled();
    });
  });
});

describe("what goes wrong", () => {
  it("shows a launch failure as a sentence with the command that fixes it", async () => {
    // F1.6. Not a stack trace, and not an empty panel that leaves the user
    // guessing whether anything is wrong at all.
    const { socket } = mount();

    socket.deliver({
      type: "error",
      code: "ADAPTER_UNAVAILABLE",
      message: '"claude-agent-acp" não está no PATH. Esta sessão fixa a versão 0.69.0',
      remedy: "npm i -g @agentclientprotocol/claude-agent-acp@0.69.0",
    });

    await waitFor(() => {
      expect(screen.getByText("o adaptador ACP não subiu")).toBeInTheDocument();
    });
    expect(
      screen.getByText("npm i -g @agentclientprotocol/claude-agent-acp@0.69.0"),
    ).toBeInTheDocument();
  });

  it("keeps the conversation usable after one bad frame", async () => {
    // An `INVALID_MESSAGE` is the client's mistake about one message. Treating it
    // as fatal would throw away a conversation that is otherwise fine.
    const { socket } = mount();
    socket.deliver(attached());

    socket.deliver({ type: "error", code: "INVALID_MESSAGE", message: "esse frame não serve" });

    await waitFor(() => {
      expect(screen.getByText("esse frame não serve")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("mensagem para o agente")).not.toBeDisabled();
  });

  it("shows an event it does not recognise in place, and carries on", async () => {
    // D3. Silence is what makes a tab look stuck for no reason.
    const { socket } = mount();
    socket.deliver(
      attached([
        entry({ type: "unknown", sessionUpdate: "steering_update" }),
        entry({ type: "message", messageId: "a-1", role: "agent", text: "segui adiante" }),
      ]),
    );

    expect(
      await screen.findByText("evento não reconhecido: steering_update"),
    ).toBeInTheDocument();
    expect(screen.getByText("segui adiante")).toBeInTheDocument();
  });
});

describe("the plan", () => {
  it("shows the plan above the turns, and follows its rewrites", async () => {
    // Above the turns because the plan belongs to the conversation, not to the
    // turn that announced it: nested, the card would jump down the page every
    // time a step finished.
    const { socket } = mount();
    socket.deliver(attached());

    socket.deliver({
      type: "event",
      at: clock,
      event: { type: "plan", entries: [{ content: "extrair o parser", status: "in_progress" }] },
    });
    await waitFor(() => expect(screen.getByText("0 de 1")).toBeInTheDocument());

    socket.deliver({
      type: "event",
      at: clock,
      event: {
        type: "plan",
        entries: [
          { content: "extrair o parser", status: "completed" },
          { content: "rodar o gate", status: "in_progress" },
        ],
      },
    });

    // One card, rewritten. Two would mean the conversation is accumulating copies.
    await waitFor(() => expect(screen.getByText("1 de 2")).toBeInTheDocument());
    expect(document.querySelectorAll(".plan")).toHaveLength(1);
  });

  it("takes the card away when the agent withdraws the plan", async () => {
    const { socket } = mount();
    socket.deliver(
      attached([entry({ type: "plan", entries: [{ content: "um", status: "pending" }] })]),
    );
    await waitFor(() => expect(document.querySelector(".plan")).not.toBeNull());

    socket.deliver({ type: "event", at: clock, event: { type: "plan_removed" } });

    await waitFor(() => expect(document.querySelector(".plan")).toBeNull());
  });
});

describe("the selectors", () => {
  const modelOption: AcpConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    currentValue: "opus[1m]",
    choices: [
      { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
      { value: "sonnet", name: "sonnet", description: null },
    ],
  };

  it("shows the pills the attach frame already carried", async () => {
    // On attach, not only when something changes: a tab that opened with no pills
    // until the agent happened to mention something would look broken.
    const { socket } = mount();

    socket.deliver(attached([], [modelOption]));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Model: opus[1m]" })).toBeInTheDocument();
    });
  });

  it("sends the switch and follows the agent's answer", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached([], [modelOption]));

    await user.click(await screen.findByRole("button", { name: /^Model:/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /sonnet/ }));

    expect(socket.sent).toEqual([{ type: "set_config", optionId: "model", value: "sonnet" }]);

    // The pill follows the `config` event, not the click: the agent may answer with
    // a different value, and that one is what is in effect.
    socket.deliver({
      type: "event",
      at: clock,
      event: {
        type: "config",
        modeOwner: "agent",
        lumemMode: "ask",
        lumemModeDefault: "ask",
        mode: "auto",
        options: [{ ...modelOption, currentValue: "sonnet[1m]" }],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Model: sonnet[1m]" })).toBeInTheDocument();
    });
  });

  it("follows a mode the agent switched by itself", async () => {
    const { socket } = mount();
    socket.deliver(
      attached([], [
        {
          id: "mode",
          name: "Mode",
          currentValue: "auto",
          choices: [
            { value: "auto", name: "Auto", description: null },
            { value: "plan", name: "Plan Mode", description: null },
          ],
        },
      ]),
    );
    await screen.findByRole("button", { name: "Mode: Auto" });

    // The whole set, because that is what the event carries: the daemon merges a
    // partial `config_option_update` before emitting, so the client replaces rather
    // than merging. Sending `options: []` here would be testing something the wire
    // never says — and it would correctly make every pill vanish.
    socket.deliver({
      type: "event",
      at: clock,
      event: {
        type: "config",
        modeOwner: "agent",
        lumemMode: "ask",
        lumemModeDefault: "ask",
        mode: "plan",
        options: [
          {
            id: "mode",
            name: "Mode",
            currentValue: "plan",
            choices: [
              { value: "auto", name: "Auto", description: null },
              { value: "plan", name: "Plan Mode", description: null },
            ],
          },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Plan Mode/ })).toBeInTheDocument();
    });
  });

  it("disables the pills while a turn is running", async () => {
    const { socket } = mount();
    socket.deliver(
      attached(
        [entry({ type: "message", messageId: "u-1", role: "user", text: "vai" })],
        [modelOption],
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Model:/ })).toBeDisabled();
    });
  });
});

describe("slash commands in the composer", () => {
  const withCommands = (): AcpTranscriptEntry[] => [
    entry({
      type: "commands",
      commands: [
        { name: "gate", description: "roda o gate declarado pela task", takesInput: false },
        { name: "compact", description: "comprime a conversa", takesInput: true },
      ],
    }),
  ];

  it("opens on a lone slash and inserts without sending", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached(withCommands()));

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("/");

    await user.click(await screen.findByRole("option", { name: /gate/ }));

    expect(box).toHaveValue("/gate");
    // Inserted, not sent: a command may take an argument.
    expect(socket.sent).toEqual([]);
  });

  it("does not open for a path inside a sentence", async () => {
    // `/` mid-sentence is a path. Offering a command menu over `src/lore` would be
    // the interface arguing with what is being typed.
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached(withCommands()));

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("olha em src/lore");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters as more is typed", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached(withCommands()));

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("/comp");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("/compact");
  });

  it("shows nothing for an agent that offers no commands", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("/");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("still sends on ⌘⏎ once a command has been chosen", async () => {
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached(withCommands()));

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("/");
    await user.click(await screen.findByRole("option", { name: /gate/ }));
    await user.click(box);
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(socket.sent).toEqual([{ type: "prompt", text: "/gate" }]);
  });
});

describe("a conversation that has ended", () => {
  /**
   * D13: reading is not resuming. Nothing is attached and nothing is launched — the
   * transcript comes off the daemon's disk, and the composer is closed.
   */

  function readOnly(
    transcript: AcpTranscriptEntry[] = [],
    options: { onResume?: () => void; resuming?: boolean } = {},
  ): { connects: number; loads: string[] } {
    const connects: number[] = [];
    const loads: string[] = [];

    const connect = () => {
      connects.push(1);
      return new FakeSocket();
    };
    const load = (sessionId: string): Promise<AcpServerMessage> => {
      loads.push(sessionId);
      return Promise.resolve({ ...attached(transcript), state: "exited" } as AcpServerMessage);
    };

    render(
      <AwaitingPermissionProvider>
        <Conversation
          sessionId="s-1"
          live={false}
          connect={connect}
          load={load}
          {...(options.onResume ? { onResume: options.onResume } : {})}
          resuming={options.resuming ?? false}
        />
      </AwaitingPermissionProvider>,
    );

    return { connects: connects.length, loads };
  }

  it("shows the conversation without opening a socket", async () => {
    // The whole point: an adapter costs ~39k tokens of system prompt before the first
    // word, and clicking a tab to reread something must not spend that.
    const { connects, loads } = readOnly([
      entry({ type: "message", messageId: "m-1", role: "user", text: "o que eu perguntei" }),
      entry({ type: "message", messageId: "m-2", role: "agent", text: "o que ele respondeu" }),
    ]);

    expect(await screen.findByText("o que ele respondeu")).toBeInTheDocument();
    expect(screen.getByText("o que eu perguntei")).toBeInTheDocument();
    expect(connects).toBe(0);
    expect(loads).toEqual(["s-1"]);
  });

  it("closes the composer and says why", async () => {
    readOnly();

    const box = await screen.findByLabelText("mensagem para o agente");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("placeholder", expect.stringContaining("terminou"));
    expect(screen.getByRole("button", { name: /enviar/ })).toBeDisabled();
  });

  it("says the record ends here", async () => {
    // An empty scroll and a finished conversation look the same otherwise.
    readOnly();

    expect(await screen.findByText("conversa encerrada")).toBeInTheDocument();
  });

  it("offers to resume, and only says so once asked", async () => {
    const onResume = vi.fn();
    readOnly([], { onResume });

    const button = await screen.findByRole("button", { name: /retomar/ });
    expect(onResume).not.toHaveBeenCalled();

    await userEvent.click(button);

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("does not offer to resume when the caller has nowhere to put the new session", async () => {
    readOnly();

    await screen.findByText("conversa encerrada");
    expect(screen.queryByRole("button", { name: /retomar/ })).not.toBeInTheDocument();
  });

  it("says the resume is happening while it is", async () => {
    readOnly([], { onResume: vi.fn(), resuming: true });

    expect(await screen.findByRole("button", { name: /retomando/ })).toBeDisabled();
  });

  it("reports a read that failed instead of showing an empty conversation", async () => {
    render(
      <AwaitingPermissionProvider>
        <Conversation
          sessionId="s-1"
          live={false}
          connect={() => new FakeSocket()}
          load={() => Promise.reject(new Error("a transcrição não abriu"))}
        />
      </AwaitingPermissionProvider>,
    );

    expect(await screen.findByText("a transcrição não abriu")).toBeInTheDocument();
  });
});

describe("the mark between two conversations", () => {
  it("draws a separator where the conversation was resumed", async () => {
    // From the recorded event, so a replay puts it where the live client did (D12).
    const { socket } = mount();

    socket.deliver(
      attached([
        entry({ type: "message", messageId: "m-1", role: "agent", text: "de ontem" }),
        entry({ type: "resumed", fromSessionId: "sessao-de-ontem" }),
        entry({ type: "message", messageId: "m-2", role: "user", text: "de hoje" }),
      ]),
    );

    await waitFor(() => expect(screen.getByText(/retomada/)).toBeInTheDocument());
    expect(screen.getByText("de ontem")).toBeInTheDocument();
    expect(screen.getByText("de hoje")).toBeInTheDocument();
  });

  it("keeps the two conversations apart instead of merging them", async () => {
    /*
     * Without its own turn the mark would be appended to whatever the agent was
     * saying, and the last message of yesterday and the first of today would end up
     * inside one frame — which reads as one uninterrupted answer.
     */
    const { socket } = mount();

    socket.deliver(
      attached([
        entry({ type: "message", messageId: "m-1", role: "agent", text: "de ontem" }),
        entry({ type: "resumed", fromSessionId: "sessao-de-ontem" }),
        entry({ type: "message", messageId: "m-2", role: "agent", text: "de hoje" }),
      ]),
    );

    await waitFor(() => expect(screen.getByText(/retomada/)).toBeInTheDocument());
    // Two agent frames, not one: the separator broke the run.
    expect(document.querySelectorAll(".turn--agent")).toHaveLength(2);
  });
});

/**
 * A pílula de modo, no composer (`session-mode`, T2).
 *
 * O componente isolado é testado em `lumem-mode-pill.test.tsx`. O que só se pode
 * provar aqui é a regra que vale entre os dois: **uma pílula de modo, sempre, e
 * nunca duas.** É a A1 na tela, e ela é a única coisa que impede alguém de trocar
 * a política do Lumem achando que pôs o agente em modo plano.
 */
/** O seletor de modo do agente, como o adaptador o relata. */
const modeOption: AcpConfigOption = {
  id: "mode",
  name: "Mode",
  currentValue: "auto",
  choices: [
    { value: "auto", name: "Auto", description: null },
    { value: "plan", name: "Plan Mode", description: null },
  ],
};

describe("a pílula de modo no composer", () => {
  it("mostra a pílula do Lumem quando o agente não relata modos", async () => {
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));

    expect(await screen.findByRole("button", { name: /regra do Lumem/i })).toBeInTheDocument();
  });

  it("não mostra a do Lumem quando o agente é o dono do seletor", async () => {
    const { socket } = mount();
    act(() => socket.deliver(attached([], [modeOption], "agent")));

    expect(await screen.findByRole("button", { name: /Mode: Auto/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /regra do Lumem/i })).not.toBeInTheDocument();
  });

  it("troca a política sem falar com o agente", async () => {
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));

    await userEvent.click(await screen.findByRole("button", { name: /regra do Lumem/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Automático/ }));

    expect(socket.sent).toContainEqual({ type: "set_lumem_mode", mode: "auto" });
  });

  it("só manda liberado depois do portão, e o portão nomeia o checkout", async () => {
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));

    await userEvent.click(await screen.findByRole("button", { name: /regra do Lumem/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Liberado/ }));

    // Nada foi mandado ainda: o clique abriu o portão, não trocou o modo (Q4).
    expect(socket.sent).not.toContainEqual({ type: "set_lumem_mode", mode: "free" });
    expect(screen.getByText("/repos/lorebase")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /liberar esta sessão/ }));
    expect(socket.sent).toContainEqual({ type: "set_lumem_mode", mode: "free" });
  });
});

/**
 * As bordas da pílula (`session-mode`, T11).
 *
 * Nenhuma delas é comportamento novo: são a checagem de que a feature não abriu
 * buraco nos estados que já estavam resolvidos.
 */
describe("as bordas da pílula de modo", () => {
  it("não oferece troca no meio de um turno", async () => {
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));
    await screen.findByRole("button", { name: /regra do Lumem/i });

    act(() =>
      socket.deliver({
        type: "event",
        at: 1_700_000_000_000,
        event: { type: "message", messageId: "m-1", role: "user", text: "vai" },
      }),
    );

    expect(screen.getByRole("button", { name: /regra do Lumem/i })).toBeDisabled();
  });

  it("fecha o menu quando o turno começa, em vez de deixá-lo clicável", async () => {
    /*
     * O caminho que uma revisão achou e nenhum teste cobria.
     *
     * A pílula desligava no meio do turno, mas o MENU só olhava se estava aberto.
     * Abrir parado, o turno começar, e clicar numa opção mandava
     * `set_lumem_mode` — o daemon responde `BLOCKED`, e a pessoa lê um erro que
     * não causou.
     */
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));
    await userEvent.click(await screen.findByRole("button", { name: /regra do Lumem/i }));
    expect(screen.getByRole("menu", { name: /regra do Lumem/i })).toBeInTheDocument();

    act(() =>
      socket.deliver({
        type: "event",
        at: 1_700_000_000_000,
        event: { type: "message", messageId: "m-1", role: "user", text: "vai" },
      }),
    );

    expect(screen.queryByRole("menu", { name: /regra do Lumem/i })).not.toBeInTheDocument();
  });

  it("não reabre o menu sozinho quando o turno acaba", async () => {
    // Esconder no render sem limpar o estado devolveria um popover que a pessoa
    // não abriu.
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));
    await userEvent.click(await screen.findByRole("button", { name: /regra do Lumem/i }));

    act(() =>
      socket.deliver({
        type: "event",
        at: 1,
        event: { type: "message", messageId: "m-1", role: "user", text: "vai" },
      }),
    );
    act(() =>
      socket.deliver({
        type: "event",
        at: 2,
        event: { type: "turn_end", stopReason: "end_turn" },
      }),
    );

    expect(screen.queryByRole("menu", { name: /regra do Lumem/i })).not.toBeInTheDocument();
  });

  it("fecha o portão do liberado quando o turno começa", async () => {
    // Mesmo caminho, e mais caro: confirmar um portão que já não vale manda
    // `set_lumem_mode: free` para um daemon que vai recusar.
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));
    await userEvent.click(await screen.findByRole("button", { name: /regra do Lumem/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Liberado/ }));
    expect(screen.getByRole("dialog", { name: /liberar esta sessão/ })).toBeInTheDocument();

    act(() =>
      socket.deliver({
        type: "event",
        at: 1,
        event: { type: "message", messageId: "m-1", role: "user", text: "vai" },
      }),
    );

    expect(screen.queryByRole("dialog", { name: /liberar esta sessão/ })).not.toBeInTheDocument();
    expect(socket.sent).not.toContainEqual({ type: "set_lumem_mode", mode: "free" });
  });

  it("continua na barra quando o daemon reclama", async () => {
    /*
     * Some da barra quem some do protocolo. O modo do Lumem é estado local da
     * sessão — ele não depende de handshake para ser exibido —, então uma falha
     * do daemon não pode fazer a barra voltar a ser muda, que é exatamente o
     * pixel que esta feature existe para tirar do ar.
     */
    const { socket } = mount();
    act(() => socket.deliver(attached([], [], "lumem")));
    await screen.findByRole("button", { name: /regra do Lumem/i });

    act(() =>
      socket.deliver({ type: "error", code: "SESSION_EXITED", message: "a sessão morreu" }),
    );

    expect(screen.getByRole("button", { name: /regra do Lumem/i })).toBeInTheDocument();
  });
});
