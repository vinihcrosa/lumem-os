import { spawn } from "node:child_process";

/**
 * Opens a URL in whatever the machine considers a browser.
 *
 * Best effort by design: the daemon is already up by the time this runs, and the
 * product is reachable at the URL that was printed either way. Failing to open a
 * browser is not a reason to fail to run.
 */
export interface OpenOptions {
  url: string;
  platform?: NodeJS.Platform;
  /** Injected by tests. */
  launch?: (command: string, args: string[]) => void;
}

export function openInBrowser({
  url,
  platform = process.platform,
  launch = (command, args) => {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  },
}: OpenOptions): boolean {
  const command = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    launch(command, [url]);
    return true;
  } catch {
    return false;
  }
}
