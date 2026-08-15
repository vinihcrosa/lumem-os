import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * A daemon the suite owns.
 *
 * Playwright's `webServer` starts the daemon the UI talks to and will not
 * restart it, so anything about surviving a restart — F7.3 and F7.4 — needs a
 * process the test can stop and start itself.
 */
export interface ManagedDaemon {
  url: string;
  stop(): Promise<void>;
}

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${url}/trpc/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`o daemon não subiu em ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Stops the daemon *and* whatever pnpm put between us and it.
 *
 * `pnpm --filter … start` is a process that spawns tsx, which spawns the
 * daemon. Signalling only the first one leaves the daemon alive on Linux: the
 * next `startDaemon` then finds the port taken, health answers from the old
 * process, and a test about restarting never restarts anything — it reads the
 * state of a daemon that never rebooted. Signalling the whole group is what
 * makes "stop" mean stop.
 */
function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    // SIGTERM, not SIGKILL: the graceful path is what closes the database and
    // kills the children, and skipping it would test a crash instead.
    try {
      // Negative pid = the group, which `detached: true` gave this child.
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

export async function startDaemon(options: {
  port: number;
  stateDir: string;
  shell?: string;
}): Promise<ManagedDaemon> {
  const child = spawn("pnpm", ["--filter", "@lumem/server", "start"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      LUMEM_PORT: String(options.port),
      LUMEM_STATE_DIR: options.stateDir,
      SHELL: options.shell ?? "/bin/sh",
    },
    stdio: "ignore",
    // Its own process group, so stopping it can reach the daemon underneath.
    detached: true,
  });

  const url = `http://127.0.0.1:${options.port}`;
  try {
    await waitForHealth(url);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }

  return { url, stop: () => stopProcess(child) };
}

/** One tRPC mutation over plain HTTP. The API is the contract; using it is fair. */
export async function call(url: string, path: string, input: unknown): Promise<unknown> {
  const response = await fetch(`${url}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { result?: { data?: unknown }; error?: unknown };
  if (!response.ok) throw new Error(`${path} falhou: ${JSON.stringify(body.error)}`);
  return body.result?.data;
}

/** One tRPC query over plain HTTP. */
export async function query(url: string, path: string, input: unknown): Promise<unknown> {
  const search = new URLSearchParams({ input: JSON.stringify(input) });
  const response = await fetch(`${url}/trpc/${path}?${search.toString()}`);
  const body = (await response.json()) as { result?: { data?: unknown }; error?: unknown };
  if (!response.ok) throw new Error(`${path} falhou: ${JSON.stringify(body.error)}`);
  return body.result?.data;
}
