import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPoller, POLL_EVERY_MS } from "./poll.js";
import type { Snapshot } from "./tray-state.js";

const ORIGIN = "http://127.0.0.1:4317";

function trpc(data: unknown): Response {
  return new Response(JSON.stringify({ result: { data } }), { status: 200 });
}

const HEALTH = { ok: true, version: "0.6.1", supervised: true, protocolVersion: 1 };
const STATUS = {
  version: "0.6.1",
  protocolVersion: 1,
  supervised: true,
  updateAvailable: true,
  attention: false,
  liveTurns: 2,
};

/** O daemon de mentira: responde só o que se lhe deu, e conta quem perguntou o quê. */
function daemon(answers: { health?: unknown; status?: unknown } = { health: HEALTH, status: STATUS }) {
  const asked: string[] = [];
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    asked.push(url.replace(ORIGIN, ""));
    if (url.endsWith("/trpc/health")) {
      if (answers.health === undefined) throw new Error("ECONNREFUSED");
      return trpc(answers.health);
    }
    if (answers.status === undefined) throw new Error("boom");
    return trpc(answers.status);
  }) as unknown as typeof fetch;
  return { request, asked };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a leitura do daemon", () => {
  it("polls health and status every ten seconds", async () => {
    const { request, asked } = daemon();
    const seen: Snapshot[] = [];
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: (s) => seen.push(s) });

    poller.start();
    // A primeira rodada é na hora: o ícone não fica dez segundos sem dizer nada.
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toEqual(["/trpc/health", "/trpc/system.status"]);

    // Nem um milissegundo antes dos dez segundos.
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS - 1);
    expect(asked).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);
    expect(asked).toHaveLength(6);
    expect(POLL_EVERY_MS).toBe(10_000);
    expect(seen).toHaveLength(3);

    // Parar é parar.
    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 3);
    expect(asked).toHaveLength(6);
  });

  it("merges health and status into one snapshot", async () => {
    const { request } = daemon();
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    expect(await poller.refresh()).toEqual({
      reachable: true,
      version: "0.6.1",
      protocolVersion: 1,
      attention: false,
      updateAvailable: true,
    });
  });

  it("reads a daemon that does not answer as stopped, and asks for nothing else", async () => {
    const { request, asked } = daemon({});
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    expect(await poller.refresh()).toEqual({
      reachable: false,
      version: null,
      protocolVersion: null,
      attention: false,
      updateAvailable: false,
    });
    expect(asked).toEqual(["/trpc/health"]);
  });

  it("does not read the status of a protocol it does not know", async () => {
    // Uma forma que o app não conhece: nem se pergunta, porque a resposta não vale.
    const { request, asked } = daemon({ health: { ...HEALTH, protocolVersion: 2 }, status: STATUS });
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    const snapshot = await poller.refresh();

    expect(snapshot).toMatchObject({ reachable: true, protocolVersion: 2, attention: false, updateAvailable: false });
    expect(asked).toEqual(["/trpc/health"]);
  });

  it("keeps the daemon reachable when only the status fails", async () => {
    const { request } = daemon({ health: HEALTH });
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    expect(await poller.refresh()).toMatchObject({ reachable: true, updateAvailable: false, attention: false });
  });

  it("treats something that is not a Lumem on the port as stopped", async () => {
    const request = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    expect((await poller.refresh()).reachable).toBe(false);
  });

  it("never runs two rounds at once", async () => {
    // Um daemon lento não acumula fila de perguntas atrás de si.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async () => {
      await gate;
      return trpc(HEALTH);
    }) as unknown as typeof fetch;
    const poller = createPoller({ origin: ORIGIN, request, onSnapshot: () => {} });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 3);
    expect(request).toHaveBeenCalledTimes(1);

    release();
    poller.stop();
  });
});
