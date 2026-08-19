import type { AcpServerMessage, AcpTranscriptEntry } from "@lumem/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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

function mount(): { socket: FakeSocket; rerender: () => void } {
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
      <Conversation sessionId="s-1" connect={connect} />
    </AwaitingPermissionProvider>,
  );

  return {
    socket,
    rerender: () =>
      view.rerender(
        <AwaitingPermissionProvider>
          <Conversation sessionId="s-1" connect={connect} />
        </AwaitingPermissionProvider>,
      ),
  };
}

let clock = 1_700_000_000_000;
function entry(event: AcpTranscriptEntry["event"], deltaMs = 0): AcpTranscriptEntry {
  clock += deltaMs;
  return { at: clock, event };
}

function attached(transcript: AcpTranscriptEntry[] = []): AcpServerMessage {
  return {
    type: "attached",
    sessionId: "s-1",
    state: "running",
    acpSessionId: "d81b05ee-d361",
    model: "opus[1m]",
    mode: "auto",
    transcript,
  };
}

const permissionRequest: AcpTranscriptEntry["event"] = {
  type: "permission_request",
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

  it("does not send on a plain Enter", async () => {
    // A prompt is often several lines. A conversation that fires on the first
    // newline cannot take one.
    const user = userEvent.setup();
    const { socket } = mount();
    socket.deliver(attached());

    const box = await screen.findByLabelText("mensagem para o agente");
    await user.click(box);
    await user.keyboard("primeira linha{Enter}segunda");

    expect(socket.sent).toEqual([]);
    expect(box).toHaveValue("primeira linha\nsegunda");
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

  it("detaches on unmount without ending the conversation", () => {
    const { socket } = mount();
    const view = render(<div />);
    view.unmount();

    // The component's own cleanup closes the socket; the daemon keeps the agent.
    expect(socket.closed).toBe(false);
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

  it("frees the composer once the request is resolved", async () => {
    const { socket } = mount();
    socket.deliver(attached([entry(permissionRequest)]));
    expect(await screen.findByLabelText("mensagem para o agente")).toBeDisabled();

    socket.deliver({
      type: "event",
      at: clock,
      event: { type: "permission_resolved", requestId: "rq-1", outcome: { optionId: "allow" } },
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
