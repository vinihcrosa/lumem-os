import { useEffect, useRef, useState } from "react";

import { connectPtySocket, type PtyConnect } from "../lib/pty-socket.js";

/** How many trailing lines of the login's output the panel keeps. */
const TAIL = 12;

export interface LoginTerminal {
  /** The last lines the login command printed. The tail, not the head. */
  output: readonly string[];
  /** Null while it is still running. */
  exitCode: number | null;
  /** True from attach until the process ends. */
  running: boolean;
}

export interface UseLoginTerminalOptions {
  /** The PTY the daemon started for the login, or null when none is running. */
  ptySessionId: string | null;
  /** Called once, when the command ends. */
  onFinished: (exitCode: number | null) => void;
  /** Injectable so a test never needs a live daemon. */
  connect?: PtyConnect;
}

/**
 * Watches the login command run, without drawing a terminal.
 *
 * There is no terminal on screen on purpose: the panel lives in 264 pixels, and
 * `claude auth login` prints a URL and then waits — the useful part is those few
 * lines and the exit code, not a scrollback nobody can read at that width.
 *
 * Nobody is asked to confirm they logged in. What ends this is the process
 * ending, and what decides whether it worked is the *adapter* answering
 * `session/new` afterwards — which is the caller's job, in `onFinished`.
 */
export function useLoginTerminal({
  ptySessionId,
  onFinished,
  connect = connectPtySocket,
}: UseLoginTerminalOptions): LoginTerminal {
  const [output, setOutput] = useState<readonly string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  // Held in a ref so reconnecting does not depend on the callback's identity:
  // a parent that re-renders must not tear the socket down mid-login.
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (ptySessionId === null) return;

    setOutput([]);
    setExitCode(null);
    setRunning(true);

    const socket = connect(ptySessionId, {
      onMessage: (message) => {
        if (message.type === "attached" || message.type === "output") {
          const chunk = message.type === "attached" ? message.snapshot : message.data;
          setOutput((current) => tail([...current, ...lines(chunk)]));
          return;
        }
        if (message.type === "exit") {
          setRunning(false);
          setExitCode(message.exitCode);
          finishedRef.current(message.exitCode);
          return;
        }
        if (message.type === "error") {
          setOutput((current) => tail([...current, message.message]));
        }
      },
      onClose: () => setRunning(false),
    });

    return () => socket.close();
  }, [ptySessionId, connect]);

  return { output, exitCode, running };
}

/**
 * Split on newlines, with the terminal's control bytes dropped.
 *
 * A login command draws a spinner and repaints a URL, so raw bytes here would be
 * a line full of escape sequences. This keeps the words and throws the cursor
 * moves away — the panel is showing text, not emulating a terminal.
 */
function lines(chunk: string): string[] {
  return chunk
    .replace(/\u001B\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function tail(all: readonly string[]): readonly string[] {
  return all.length <= TAIL ? all : all.slice(all.length - TAIL);
}
