import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync } from "node:fs";

/**
 * Um daemon **com o papel do supervisor feito pelo teste** (`038`, C41).
 *
 * `system.update` instala por cima e sai com 0, e é o launchd ou o systemd que o
 * sobe de novo — e nenhum dos dois existe num runner de CI (`pnpm smoke:service`
 * é quem prova o de verdade, na máquina de quem verifica). Aqui o teste faz o que
 * eles fazem, e só isso: **relança o processo quando ele sai**, seja qual for o
 * código, como `KeepAlive` e `Restart=always`.
 *
 * O que fica de verdade é o que este e2e existe para provar: o daemon, o bundle, o
 * `@fastify/static` registrando uma rota por arquivo no boot, e a página.
 */
export interface SupervisedDaemon {
  url: string;
  /** Quantas vezes o supervisor precisou subir o processo de novo. */
  restarts(): number;
  /** Para de vez: sem relançar. */
  stop(): Promise<void>;
  /** Onde o daemon escreve o que loga — para o teste dizer o que houve quando falha. */
  logFile: string;
}

const RELAUNCH_DELAY_MS = 200;

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(`${url}/trpc/health`)).ok) return;
    } catch {
      /* ainda não subiu */
    }
    if (Date.now() > deadline) throw new Error(`o daemon não subiu em ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function startSupervised(options: {
  /** O arquivo `.mjs` do daemon. */
  entry: string;
  port: number;
  env: Record<string, string>;
  logFile: string;
}): Promise<SupervisedDaemon> {
  let child: ChildProcess | undefined;
  let stopping = false;
  let restarts = 0;
  const log = openSync(options.logFile, "a");

  function launch(): void {
    const next = spawn(process.execPath, [options.entry], {
      env: { ...process.env, ...options.env, LUMEM_PORT: String(options.port) },
      stdio: ["ignore", log, log],
    });
    child = next;
    next.once("exit", () => {
      if (stopping) return;
      restarts += 1;
      setTimeout(() => {
        if (!stopping) launch();
      }, RELAUNCH_DELAY_MS);
    });
  }

  launch();
  const url = `http://127.0.0.1:${String(options.port)}`;
  const stop = async (): Promise<void> => {
    stopping = true;
    const running = child;
    if (running !== undefined && running.exitCode === null && running.signalCode === null) {
      await new Promise<void>((resolve) => {
        running.once("exit", () => resolve());
        // SIGTERM e não SIGKILL: o desligamento gracioso é o que fecha o banco.
        running.kill("SIGTERM");
      });
    }
    closeSync(log);
  };

  try {
    await waitForHealth(url, 30_000);
  } catch (error) {
    await stop();
    throw error;
  }

  return { url, restarts: () => restarts, stop, logFile: options.logFile };
}
