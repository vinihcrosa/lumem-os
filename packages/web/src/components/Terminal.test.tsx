import type { PtyClientMessage, PtyServerMessage } from "@lumem/shared";
import type { Terminal as XTerm } from "@xterm/xterm";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PtyConnect, PtySocketHandlers } from "../lib/pty-socket.js";
import { Terminal } from "./Terminal.js";

const WAIT = { timeout: 5_000, interval: 10 } as const;

/**
 * A daemon that never was.
 *
 * Everything the component does to a session goes through this, so a test can
 * assert both directions without a socket.
 */
function fakeConnect() {
  const state = {
    attachedTo: [] as string[],
    sent: [] as PtyClientMessage[],
    closes: 0,
    handlers: undefined as PtySocketHandlers | undefined,
  };

  const connect: PtyConnect = (sessionId, handlers) => {
    state.attachedTo.push(sessionId);
    state.handlers = handlers;
    return {
      send: (message) => state.sent.push(message),
      close: () => {
        state.closes += 1;
      },
    };
  };

  const deliver = (message: PtyServerMessage): void => state.handlers?.onMessage(message);

  return { connect, state, deliver };
}

function attachedFrame(snapshot: string): PtyServerMessage {
  return { type: "attached", sessionId: "s1", state: "running", cols: 80, rows: 24, snapshot };
}

/** What the user would see, joined line by line. */
function screen(terminal: XTerm): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i += 1) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n");
}

function renderTerminal(sessionId = "s1", readOnly = false) {
  const { connect, state, deliver } = fakeConnect();
  let terminal: XTerm | undefined;
  const result = render(
    <Terminal
      sessionId={sessionId}
      connect={connect}
      readOnly={readOnly}
      onReady={(instance) => {
        terminal = instance;
      }}
    />,
  );

  if (!terminal) throw new Error("the component never produced a terminal");
  return { ...result, connect, state, deliver, terminal };
}

describe("Terminal", () => {
  it("renders a host element and attaches to the session", () => {
    const { getByTestId, state } = renderTerminal("session-42");

    expect(getByTestId("terminal")).toBeInTheDocument();
    expect(state.attachedTo).toEqual(["session-42"]);
  });

  it("repaints from the buffer the daemon replays on attach", async () => {
    const { deliver, terminal } = renderTerminal();

    deliver(attachedFrame("restored from the daemon\r\n"));

    await vi.waitFor(() => expect(screen(terminal)).toContain("restored from the daemon"), WAIT);
  });

  it("writes streamed output to the screen", async () => {
    const { deliver, terminal } = renderTerminal();
    deliver(attachedFrame(""));

    deliver({ type: "output", data: "streamed bytes\r\n" });

    await vi.waitFor(() => expect(screen(terminal)).toContain("streamed bytes"), WAIT);
  });

  it("keeps colour escapes intact instead of rewriting the stream", async () => {
    const { deliver, terminal } = renderTerminal();
    deliver(attachedFrame(""));

    deliver({ type: "output", data: "\u001b[31mred\u001b[0m\r\n" });

    await vi.waitFor(() => expect(screen(terminal)).toContain("red"), WAIT);
    // The escape is consumed as an attribute, not printed as text.
    expect(screen(terminal)).not.toContain("[31m");
    const cell = terminal.buffer.active.getLine(0)?.getCell(0);
    expect(cell?.getFgColor()).toBe(1);
  });

  it("repaints rather than appending when the session is reattached", async () => {
    const { deliver, terminal } = renderTerminal();
    deliver(attachedFrame("first paint\r\n"));
    await vi.waitFor(() => expect(screen(terminal)).toContain("first paint"), WAIT);

    // What a reconnect looks like: the daemon replays the whole buffer again.
    deliver(attachedFrame("second paint\r\n"));

    await vi.waitFor(() => expect(screen(terminal)).toContain("second paint"), WAIT);
    expect(screen(terminal)).not.toContain("first paint");
  });

  it("sends keystrokes to the session", () => {
    const { state, terminal } = renderTerminal();

    terminal.input("ls\r");

    expect(state.sent).toEqual([{ type: "input", data: "ls\r" }]);
  });

  it("sends the new dimensions when the terminal is resized", () => {
    const { state, terminal } = renderTerminal();

    terminal.resize(120, 40);

    expect(state.sent).toEqual([{ type: "resize", cols: 120, rows: 40 }]);
  });

  it("survives a window resize with no layout to measure", () => {
    // jsdom gives the host a zero box, which is also what a collapsed panel
    // gives a real browser: fit() must not throw there.
    renderTerminal();

    expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow();
  });

  it("closes the socket on unmount without asking the daemon to end anything", () => {
    const { unmount, state } = renderTerminal();

    unmount();

    expect(state.closes).toBe(1);
    // Closing a tab must not kill the shell — nothing is sent on the way out.
    expect(state.sent).toEqual([]);
  });

  it("stops writing to a disposed terminal", () => {
    const { unmount, deliver, state } = renderTerminal();
    unmount();

    // A frame in flight when the view goes away must not explode.
    expect(() => deliver({ type: "output", data: "after unmount" })).not.toThrow();
    expect(state.closes).toBe(1);
  });

  it("refuses to send anything from the record of a session that exited", () => {
    // Issue #14: the buffer of a dead session stays readable, but it is a
    // record. Typing into it used to fail in silence — now the view does not
    // pretend there is a prompt.
    const { state, terminal, getByTestId } = renderTerminal("s1", true);

    terminal.input("ls\r");

    expect(state.sent).toEqual([]);
    expect(terminal.options.disableStdin).toBe(true);
    expect(terminal.options.cursorBlink).toBe(false);
    expect(getByTestId("terminal")).toHaveAttribute("data-readonly", "true");
  });

  it("turns into a record in place when the session dies under it", () => {
    // The tab is open and the process exits. Remounting would repaint and lose
    // where the user had scrolled to, so the options flip in place instead.
    const { connect, state } = fakeConnect();
    let terminal: XTerm | undefined;
    const view = (readOnly: boolean) => (
      <Terminal
        sessionId="a"
        connect={connect}
        readOnly={readOnly}
        onReady={(instance) => {
          terminal = instance;
        }}
      />
    );

    const { rerender } = render(view(false));
    terminal?.input("while alive\r");
    // Live, it holds the caret — that is what dying under focus has to undo.
    expect(document.activeElement).toBe(terminal?.textarea);
    rerender(view(true));
    terminal?.input("after it died\r");

    // Same attachment, no reconnect — and only what was typed while the
    // session was alive ever left the browser.
    expect(state.attachedTo).toEqual(["a"]);
    expect(state.closes).toBe(0);
    expect(state.sent).toEqual([{ type: "input", data: "while alive\r" }]);
    // And the emulator itself knows: no caret, no stdin, without a remount.
    expect(terminal?.options.disableStdin).toBe(true);
    expect(terminal?.options.cursorBlink).toBe(false);
    // The focus it held while alive is dropped, so no caret blinks on the record.
    expect(document.activeElement).not.toBe(terminal?.textarea);
  });

  it("reattaches when the session changes", () => {
    const { connect, state } = fakeConnect();
    const { rerender } = render(<Terminal sessionId="a" connect={connect} />);

    rerender(<Terminal sessionId="b" connect={connect} />);

    expect(state.attachedTo).toEqual(["a", "b"]);
    expect(state.closes).toBe(1);
  });
});
