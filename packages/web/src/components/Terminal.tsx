import type { PtyServerMessage } from "@lumem/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

import { connectPtySocket, type PtyConnect } from "../lib/pty-socket.js";
import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_LINE_HEIGHT,
  xtermTheme,
} from "../lib/xterm-theme.js";

export interface TerminalProps {
  sessionId: string;
  /** Injected by tests; defaults to a real websocket to the daemon. */
  connect?: PtyConnect;
  /**
   * The session behind this view has already exited.
   *
   * The buffer stays on screen — that is F5.9 — but it is a record, and the
   * view has to say so: no cursor, no focus stolen, and nothing sent to a PTY
   * that is not there to read it.
   */
  readOnly?: boolean;
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
export function Terminal({
  sessionId,
  connect = connectPtySocket,
  readOnly = false,
  onReady,
  onMessage,
}: TerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  // Read inside the effect for the same reason the callbacks are: a session
  // dying must not tear down the view that is showing why.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
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
      cursorBlink: !readOnlyRef.current,
      disableStdin: readOnlyRef.current,
      scrollback: 10_000,
      // The emulator paints a canvas and never sees the stylesheet, so its
      // palette and type have to be handed over as values. Both come from the
      // same generated tokens as everything else on the screen.
      theme: xtermTheme,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitQuietly(fit);
    // A record does not take the caret. Focusing it would put a blinking
    // cursor on a buffer nothing can be typed into.
    if (!readOnlyRef.current) terminal.focus();

    const socket = connect(sessionId, {
      onMessage(message) {
        if (message.type === "attached") {
          /*
           * Fit again, before writing.
           *
           * `fit()` already ran at mount, but a terminal mounted into a container
           * that was just revealed — the agent's terminal opens inside a tool
           * card — can be measured before the layout settles, and the resize that
           * follows discards rows the snapshot had already written into. Fitting
           * first means the scrollback lands at the size it will be read at.
           */
          fitQuietly(fit);
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

    const typing = terminal.onData((data) => {
      // `disableStdin` already stops the keyboard; this stops everything else
      // xterm can emit — a paste, a bracketed-paste sequence, a mouse report.
      if (readOnlyRef.current) return;
      socket.send({ type: "input", data });
    });
    const resizing = terminal.onResize(({ cols, rows }) =>
      socket.send({ type: "resize", cols, rows }),
    );

    // fit() reads the host's box and only then emits onResize, so the daemon
    // hears about the real size instead of xterm's 80x24 default.
    const onWindowResize = (): void => fitQuietly(fit);
    window.addEventListener("resize", onWindowResize);

    // The window is no longer the only thing that changes this box: opening the
    // files column, dragging its edge, or splitting the tab to read a file all
    // resize the terminal without the window moving at all. Observing the host
    // covers every one of them, including the ones not written yet.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onWindowResize);
    observer?.observe(host);

    onReadyRef.current?.(terminal);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      typing.dispose();
      resizing.dispose();
      // Detach, then drop the renderer. The session keeps running on the daemon.
      socket.close();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [sessionId, connect]);

  // A session that exits while its tab is open becomes a record without
  // remounting: flipping the options in place keeps the scrollback, and the
  // position the user had scrolled to, exactly where they were.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal === null) return;
    terminal.options.disableStdin = readOnly;
    terminal.options.cursorBlink = !readOnly;
    // A session dying while its view held focus would leave a caret blinking on
    // a buffer nothing can be typed into. Drop the focus on the way into the
    // record — but only if it is ours, so a click elsewhere is not stolen back.
    if (readOnly && hostRef.current?.contains(document.activeElement)) {
      terminal.blur();
    }
  }, [readOnly]);

  return (
    <div
      className="terminal"
      data-testid="terminal"
      data-readonly={readOnly ? "true" : undefined}
      ref={hostRef}
    />
  );
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
