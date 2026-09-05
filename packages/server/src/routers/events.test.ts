import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEventBus, type LumemEvent } from "../events.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/**
 * Collects what the subscription delivers, and stops on demand.
 *
 * Written as a helper rather than inline so every test asserts on the same
 * lifecycle: subscribe, act, read, abort.
 */
function listen(ctx: TestCaller): {
  events: LumemEvent[];
  stop: () => void;
  waitFor: (predicate: (events: LumemEvent[]) => boolean) => Promise<void>;
} {
  const events: LumemEvent[] = [];
  // Held so `stop` can return it: closing the iterator is what propagates
  // through the procedure's `for await` and releases the emitter listener,
  // which is exactly what a disconnecting client does over the wire.
  let iterator: AsyncIterator<unknown> | undefined;

  void (async () => {
    const stream = await ctx.api.events.onChange();
    iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    try {
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) break;
        events.push(next.value as LumemEvent);
      }
    } catch {
      /* closing is how this ends */
    }
  })();

  return {
    events,
    stop: () => {
      void iterator?.return?.();
    },
    waitFor: (predicate) =>
      vi.waitFor(() => expect(predicate(events)).toBe(true), { timeout: 5_000, interval: 10 }),
  };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("event bus", () => {
  it("delivers to every subscriber", async () => {
    const bus = createEventBus();
    const controller = new AbortController();
    const seen: LumemEvent[][] = [[], []];

    for (const index of [0, 1]) {
      void (async () => {
        try {
          for await (const event of bus.subscribe(controller.signal)) seen[index]!.push(event);
        } catch {
          /* aborted */
        }
      })();
    }
    await vi.waitFor(() => expect(bus.listenerCount).toBe(2));

    bus.emit({ type: "workspace.changed" });

    await vi.waitFor(() => {
      expect(seen[0]).toEqual([{ type: "workspace.changed" }]);
      expect(seen[1]).toEqual([{ type: "workspace.changed" }]);
    });
    controller.abort();
  });

  it("releases the listener when the subscriber goes away", async () => {
    // A daemon meant to run for weeks cannot leak one listener per reconnect.
    const bus = createEventBus();
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const _ of bus.subscribe(controller.signal)) void _;
      } catch {
        /* aborted */
      }
    })();
    await vi.waitFor(() => expect(bus.listenerCount).toBe(1));

    controller.abort();

    await vi.waitFor(() => expect(bus.listenerCount).toBe(0));
  });

  it("drops events with nobody listening instead of buffering them", async () => {
    const bus = createEventBus();

    expect(() => bus.emit({ type: "workspace.changed" })).not.toThrow();
    expect(bus.listenerCount).toBe(0);
  });
});

describe("events.onChange", () => {
  it("fires when a workspace is created", async () => {
    context = createTestCaller();
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    await context.api.workspace.create({ name: "pessoal" });

    await stream.waitFor((events) => events.some((e) => e.type === "workspace.changed"));
    stream.stop();
  });

  it("names the project whose worktrees changed", async () => {
    // Coarse but addressed: the client needs to know which list is stale, and
    // invalidating everything on every event would refetch the whole sidebar.
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lorebase",
    });
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    await context.api.worktree.create({ projectId: project.id, name: "teste" });

    await stream.waitFor((events) =>
      events.some((e) => e.type === "worktree.changed" && e.projectId === project.id),
    );
    stream.stop();
  });

  it("tells the worktree list it is stale when the project that owned it is removed", async () => {
    /*
     * A cascata (F2.5, WS-Q22) tira o registro de N worktrees, e quem removeu
     * não é o único cliente ligado. Numa segunda janela a lista daquele projeto
     * continua na tela: sem este evento ela mostra worktrees que não existem
     * mais até alguém recarregar.
     *
     * O `projectId` é o do projeto que acabou de sumir de propósito — é a chave
     * da lista que ficou velha, não uma promessa de que o projeto existe.
     */
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lorebase",
    });
    await context.api.worktree.create({ projectId: project.id, name: "teste" });
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    await context.api.project.remove({ id: project.id });

    await stream.waitFor((events) =>
      events.some((e) => e.type === "worktree.changed" && e.projectId === project.id),
    );
    await stream.waitFor((events) =>
      events.some((e) => e.type === "project.changed" && e.workspaceId === workspace.id),
    );
    stream.stop();
  });

  it("stays quiet about worktrees when the removed project had none", async () => {
    // O evento existe para uma lista que ficou velha. Projeto sem worktree não
    // tem lista, e um evento a mais faz toda janela aberta refazer a busca.
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lorebase",
    });
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    await context.api.project.remove({ id: project.id });

    await stream.waitFor((events) => events.some((e) => e.type === "project.changed"));
    expect(stream.events.some((e) => e.type === "worktree.changed")).toBe(false);
    stream.stop();
  });

  it("fires when a session is opened and again when it is closed", async () => {
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lorebase",
    });
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    const session = await context.api.session.createShell({
      scopeType: "project",
      scopeId: project.id,
    });
    await stream.waitFor((events) => events.filter((e) => e.type === "session.changed").length >= 1);

    await context.api.session.close({ id: session.id });

    await stream.waitFor((events) => events.filter((e) => e.type === "session.changed").length >= 2);
    stream.stop();
  });

  it("fires when a process dies on its own", async () => {
    // F3.7's hardest case: nobody clicked anything. An agent that hits its
    // quota has to change the sidebar by itself.
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lorebase",
    });
    const config = await context.api.agentConfig.create({
      name: "curto",
      command: "/bin/sh",
      args: ["-c", "exit 0"],
    });
    const stream = listen(context);
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    await context.api.session.createAgent({
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    });

    // Two: one for the launch, one for the death nobody asked for.
    await stream.waitFor((events) => events.filter((e) => e.type === "session.changed").length >= 2);
    stream.stop();
  });

  it("streams over SSE and releases the listener when the request is aborted", async () => {
    // The production path, end to end: the fastify adapter has to serve a
    // subscription as text/event-stream, and the aborted request has to be
    // what releases the listener — a daemon meant to run for weeks cannot leak
    // one per reconnect.
    context = createTestCaller();
    const { createServer } = await import("../server.js");
    const app = await createServer({
      config: context.config,
      db: context.db,
      ptyManager: context.ptyManager,
      sessionStore: context.sessionStore,
      events: context.events,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const controller = new AbortController();

    const response = await fetch(`http://127.0.0.1:${port}/trpc/events.onChange`, {
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await vi.waitFor(() => expect(context.events.listenerCount).toBe(1));

    controller.abort();

    await vi.waitFor(() => expect(context.events.listenerCount).toBe(0), { timeout: 5_000 });
    await app.close();
  });
});
