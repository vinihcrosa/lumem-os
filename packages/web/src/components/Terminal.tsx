import type { PtyServerMessage } from "@lumem/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

import { connectPtySocket, type PtyConnect } from "../lib/pty-socket.js";

export interface TerminalProps {
  sessionId: string;
  /** Injected by tests; defaults to a real websocket to the daemon. */
  connect?: PtyConnect;
  /**
   * Handed the xterm instance once it is live.
   *
   * The terminal owns its own DOM, so this is the only way anything outside can
   * reach the buffer — which is what a test needs to assert on, and what a
   * future search or copy action will need too.
   */
  onReady?: (terminal: XTerm) => void;
  onMessage?: (message: PtyServerMessage) => void;
}

/**
 * One attached view of one PTY session.
 *
 * Mounting attaches and repaints from the daemon's buffer; unmounting closes
 * the socket and disposes the renderer. Neither touches the process: the
 * session outlives every view of it.
 */
export function Terminal({ sessionId, connect = connectPtySocket, onReady, onMessage }: TerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Read inside the effect so a changing callback does not tear down the
  // terminal and lose the scrollback.
  const onReadyRef = useRef(onReady);
  const onMessageRef = useRef(onMessage);
  onReadyRef.current = onReady;
  onMessageRef.current = onMessage;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new XTerm({
      // The daemon replays raw bytes, escape sequences included. Anything that
      // rewrites them here would corrupt a repaint.
      convertEol: false,
      cursorBlink: true,
      scrollback: 10_000,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fitQuietly(fit);
    terminal.focus();

    const socket = connect(sessionId, {
      onMessage(message) {
        if (message.type === "attached") {
          // A repaint, not an append: remounting must not stack the buffer on
          // top of whatever the previous view left behind.
          terminal.reset();
          terminal.write(message.snapshot);
        } else if (message.type === "output") {
          terminal.write(message.data);
        }
        onMessageRef.current?.(message);
      },
    });

    const typing = terminal.onData((data) => socket.send({ type: "input", data }));
    const resizing = terminal.onResize(({ cols, rows }) =>
      socket.send({ type: "resize", cols, rows }),
    );

    // fit() reads the host's box and only then emits onResize, so the daemon
    // hears about the real size instead of xterm's 80x24 default.
    const onWindowResize = (): void => fitQuietly(fit);
    window.addEventListener("resize", onWindowResize);

    onReadyRef.current?.(terminal);

    return () => {
      window.removeEventListener("resize", onWindowResize);
      typing.dispose();
      resizing.dispose();
      // Detach, then drop the renderer. The session keeps running on the daemon.
      socket.close();
      terminal.dispose();
    };
  }, [sessionId, connect]);

  return <div className="terminal" data-testid="terminal" ref={hostRef} />;
}

/**
 * `fit` measures the DOM, and a terminal that is hidden or not laid out yet
 * measures as zero — which throws. That is a normal state during mount and on
 * a collapsed panel, not an error worth propagating.
 */
function fitQuietly(fit: FitAddon): void {
  try {
    fit.fit();
  } catch {
    /* not laid out yet; the next resize will do it */
  }
}
