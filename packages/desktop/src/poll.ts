import { SUPPORTED_PROTOCOL, type Snapshot } from "./tray-state.js";

/** `038`, AC 59. */
export const POLL_EVERY_MS = 10_000;
/** Um daemon que não responde em 3 s está parado para quem olha o ícone. */
const REQUEST_TIMEOUT_MS = 3_000;

export interface PollerDeps {
  origin: string;
  /** `fetch` em produção; o teste passa um daemon de mentira. */
  request?: typeof fetch;
  onSnapshot(snapshot: Snapshot): void;
}

export interface Poller {
  /** De dez em dez segundos, e já — a menos que `immediate` diga que a primeira rodada foi feita. */
  start(immediate?: boolean): void;
  stop(): void;
  /** Uma rodada agora, fora do relógio (depois de `Iniciar`, por exemplo). */
  refresh(): Promise<Snapshot>;
}

const STOPPED: Snapshot = {
  reachable: false,
  version: null,
  protocolVersion: null,
  attention: false,
  updateAvailable: false,
};

/** O `data` de uma resposta do tRPC, ou `null` — o daemon não usa transformer. */
async function readData(request: typeof fetch, url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await request(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { data?: unknown } };
    const data = body.result?.data;
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * O `health` e o `system.status` do daemon, juntos numa foto (`038`, AC 59).
 *
 * O `health` decide se há daemon e em que protocolo; o `status` só é perguntado
 * quando o protocolo é o que o app lê — a forma de uma resposta de um protocolo que o
 * app não conhece não vale, e perguntar seria confiar nela.
 */
export function createPoller({ origin, request = fetch, onSnapshot }: PollerDeps): Poller {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<Snapshot> | undefined;

  async function read(): Promise<Snapshot> {
    const health = await readData(request, `${origin}/trpc/health`);
    if (health?.["ok"] !== true || typeof health["version"] !== "string") return STOPPED;

    const protocolVersion = typeof health["protocolVersion"] === "number" ? health["protocolVersion"] : null;
    const snapshot: Snapshot = {
      reachable: true,
      version: health["version"],
      protocolVersion,
      attention: false,
      updateAvailable: false,
    };
    if (protocolVersion !== SUPPORTED_PROTOCOL) return snapshot;

    const status = await readData(request, `${origin}/trpc/system.status`);
    return {
      ...snapshot,
      attention: status?.["attention"] === true,
      updateAvailable: status?.["updateAvailable"] === true,
    };
  }

  function refresh(): Promise<Snapshot> {
    // Uma rodada por vez: um daemon lento não acumula fila de perguntas.
    running ??= read()
      .then((snapshot) => {
        onSnapshot(snapshot);
        return snapshot;
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  }

  return {
    start(immediate = true) {
      if (timer !== undefined) return;
      if (immediate) void refresh();
      timer = setInterval(() => void refresh(), POLL_EVERY_MS);
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
    refresh,
  };
}
