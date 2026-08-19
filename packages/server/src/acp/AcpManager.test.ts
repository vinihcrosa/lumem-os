import type { StopReason } from "@agentclientprotocol/sdk";
import type { AcpEvent } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { fakeAgentProcess, type FakeAgentScript } from "../testing/acp-fake-agent.js";
import { AcpManager } from "./AcpManager.js";
import type { AcpProcess } from "./process.js";

/**
 * The transport, proven without spending a token.
 *
 * Every test here drives a real newline-delimited ACP conversation over
 * in-memory pipes, with the SDK on both ends. What that leaves uncovered on
 * purpose is the process itself — spawning, killing, exit codes — which
 * `AcpManager.process.test.ts` covers against a real child.
 */

interface Harness {
  manager: AcpManager;
  events: AcpEvent[];
  sessionId: string;
  process: AcpProcess;
  killed: Promise<void>;
}

async function start(script: FakeAgentScript = {}): Promise<Harness> {
  const fake = fakeAgentProcess(script);
  const manager = new AcpManager({
    spawner: () => fake.process,
    handshakeTimeoutMs: 2_000,
    isAvailable: () => true,
  });

  const info = await manager.spawn({
    command: "claude-agent-acp",
    cwd: "/repos/lorebase",
    adapterVersion: "0.69.0",
  });

  const events: AcpEvent[] = [];
  manager.onEvent(info.id, (event) => events.push(event));

  return { manager, events, sessionId: info.id, process: fake.process, killed: fake.killed };
}

const typesOf = (events: readonly AcpEvent[]): string[] => events.map((event) => event.type);

describe("handshake", () => {
  it("does not hand back a session until the adapter has given it a name", async () => {
    // A PTY is usable the moment it exists; an ACP session is not. Returning
    // before `session/new` answers would hand out an id no prompt could use.
    const fake = fakeAgentProcess();
    const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });

    const info = await manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });

    expect(info.acpSessionId).toBe("fake-acp-session");
    expect(info.state).toBe("running");
  });

  it("reports the modes and models the adapter offers, in the adapter's own words", async () => {
    // A13: the descriptions are the agent's strings, and translating them would
    // create a table that ages with every adapter release.
    const { manager, sessionId } = await start();
    const info = manager.get(sessionId);

    expect(info?.mode).toBe("default");
    expect(info?.availableModes.map((mode) => mode.id)).toEqual([
      "auto",
      "default",
      "acceptEdits",
      "plan",
      "bypassPermissions",
    ]);
    expect(info?.availableModes.find((mode) => mode.id === "acceptEdits")?.description).toBe(
      "Auto-accept file edit operations",
    );
  });

  it("reads the model out of configOptions, where the protocol actually puts it", async () => {
    const { manager, sessionId } = await start();
    const info = manager.get(sessionId);

    expect(info?.model).toBe("opus[1m]");
    expect(info?.availableModels.map((model) => model.id)).toEqual(["opus[1m]", "sonnet"]);
  });

  it("survives an adapter that offers no model select at all", async () => {
    // Not every agent has models. Losing the session over a missing select would
    // make Lumem stricter than the protocol.
    const { manager, sessionId } = await start({ newSession: () => ({ configOptions: [] }) });

    expect(manager.get(sessionId)?.model).toBe("");
  });

  it("refuses an adapter speaking a protocol version it does not know", async () => {
    const fake = fakeAgentProcess({ initialize: () => ({ protocolVersion: 99 }) });
    const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });

    await expect(
      manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" }),
    ).rejects.toMatchObject({ code: "SPAWN_FAILED", message: /versão 99/ });
  });

  it("kills the adapter it could not finish talking to", async () => {
    // Otherwise a failed handshake leaves a live subprocess nothing references.
    const fake = fakeAgentProcess({ initialize: () => ({ protocolVersion: 99 }) });
    const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });

    await expect(
      manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" }),
    ).rejects.toThrow();
    await expect(fake.killed).resolves.toBeUndefined();
  });

  it("says the adapter is missing before waiting on a handshake that cannot happen", async () => {
    // F1.6, and the reason it is checked up front: without this the failure
    // surfaces as a handshake timeout fifteen seconds later, and the user reads
    // a message about a protocol step they never chose.
    const manager = new AcpManager({
      spawner: () => {
        throw new Error("nunca deveria chegar aqui");
      },
      isAvailable: () => false,
    });

    await expect(
      manager.spawn({
        command: "claude-agent-acp",
        cwd: "/repos/lorebase",
        adapterVersion: "0.69.0",
      }),
    ).rejects.toMatchObject({
      code: "SPAWN_FAILED",
      message: /não está no PATH.*0\.69\.0.*npm i -g @agentclientprotocol\/claude-agent-acp@0\.69\.0/s,
    });
  });

  it("builds the install line from the pinned version, never a hard-coded one", async () => {
    // A hard-coded version would drift from `agent_config` and send the user to
    // install something this session would then refuse (A12).
    const manager = new AcpManager({
      spawner: () => fakeAgentProcess().process,
      isAvailable: () => false,
    });

    await expect(
      manager.spawn({ command: "claude-agent-acp", cwd: "/r", adapterVersion: "0.40.0" }),
    ).rejects.toMatchObject({ message: /@0\.40\.0/ });
  });

  it("still says something useful when no version is pinned", async () => {
    const manager = new AcpManager({
      spawner: () => fakeAgentProcess().process,
      isAvailable: () => false,
    });

    await expect(
      manager.spawn({ command: "meu-agente", cwd: "/r" }),
    ).rejects.toMatchObject({ message: /deixe "meu-agente" no PATH/ });
  });

  it("reports an adapter that accepts the connection and then never answers", async () => {
    // The failure with no symptom: no error, no log, and a tab that spins. A
    // deadline is what turns it into something the user can read.
    const silent = fakeAgentProcess({
      initialize: () => {
        throw new Error("this agent never answers");
      },
    });
    const manager = new AcpManager({
      spawner: () => silent.process,
      handshakeTimeoutMs: 50,
      isAvailable: () => true,
    });

    await expect(
      manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" }),
    ).rejects.toMatchObject({ code: "SPAWN_FAILED" });
  });

  it("refuses an empty command instead of spawning nothing", async () => {
    const manager = new AcpManager({
      spawner: () => fakeAgentProcess().process,
      isAvailable: () => true,
    });

    await expect(manager.spawn({ command: "  ", cwd: "/repos/lorebase" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });
});

describe("a turn", () => {
  it("streams message chunks in order", async () => {
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "O parser " },
        });
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "saiu." },
        });
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "arruma o frontmatter vazio");

    expect(events).toEqual([
      { type: "message", messageId: "m-1", role: "agent", text: "O parser " },
      { type: "message", messageId: "m-1", role: "agent", text: "saiu." },
      { type: "turn_end", stopReason: "end_turn" },
    ]);
  });

  it("carries a tool call from announcement to result", async () => {
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Edit loader.ts",
          name: "Edit",
          kind: "edit",
          status: "in_progress",
        });
        await turn.update({
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "completed",
          content: [{ type: "diff", path: "/repos/lorebase/loader.ts", newText: "ok" }],
        });
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "arruma");

    expect(events[0]).toMatchObject({ type: "tool_call", status: "running", name: "Edit" });
    expect(events[1]).toMatchObject({ type: "tool_call_update", status: "ok" });
  });

  it("gives each turn its own fallback message id", async () => {
    // Chunks with no `messageId` belong to the turn that produced them. Sharing
    // one id across turns would glue yesterday's answer to today's.
    const { manager, events, sessionId } = await start({
      async prompt(text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        });
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "primeiro");
    await manager.prompt(sessionId, "segundo");

    const ids = events
      .filter((event): event is Extract<AcpEvent, { type: "message" }> => event.type === "message")
      .map((event) => event.messageId);

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("refuses an empty prompt rather than paying for a turn", async () => {
    const { manager, sessionId } = await start();

    await expect(manager.prompt(sessionId, "   ")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("ignores an update it does not recognise, and keeps the session alive", async () => {
    // D3, and it has to be posed on the raw wire: the SDK validates
    // `session/update` on the way out, so a fake built on it cannot emit a
    // variant the current schema rejects. What is being asked here is what
    // happens when a *future* adapter sends a field this daemon never saw.
    const fake = fakeAgentProcess();
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
    });
    const info = await manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const events: AcpEvent[] = [];
    manager.onEvent(info.id, (event) => events.push(event));

    await fake.sendRaw({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "fake-acp-session", update: { sessionUpdate: "steering_update" } },
    });

    const unknownEvent = await waitFor(() =>
      events.find((event) => event.type === "unknown"),
    );

    expect(unknownEvent).toEqual({ type: "unknown", sessionUpdate: "steering_update" });
    expect(manager.get(info.id)?.state).toBe("running");

    // And the session still works afterwards, which is the part that matters:
    // "ignored with a log" is only true if the next turn goes through.
    await expect(manager.prompt(info.id, "e agora?")).resolves.toBe("end_turn");
  });

  it("does not report a plan as unrecognised", async () => {
    // Phase 4 renders plans. Calling one "unrecognised" today would put a grey
    // apology on screen about something the protocol defines.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({ sessionUpdate: "plan", entries: [] } as never);
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "planeja");

    expect(typesOf(events)).toEqual(["turn_end"]);
  });
});

describe("permission", () => {
  it("emits the request, waits, and lets the agent finish once answered", async () => {
    let outcome: unknown;
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Bash",
          kind: "execute",
          status: "pending",
        });
        outcome = await turn.requestPermission({
          toolCall: { toolCallId: "tc-1", title: "Bash rm -rf .vite", rawInput: { command: "rm -rf .vite" } },
          options: [
            { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
            { optionId: "never", name: "nunca", kind: "reject_always" },
          ],
        });
        return "end_turn";
      },
    });

    const turn = manager.prompt(sessionId, "limpa o cache");

    // The turn cannot finish before the answer: that is what "the agent waits
    // forever without the dialog" means, stated as a test.
    const request = await waitFor(() =>
      events.find(
        (event): event is Extract<AcpEvent, { type: "permission_request" }> =>
          event.type === "permission_request",
      ),
    );

    expect(request).toMatchObject({
      toolCallId: "tc-1",
      title: "Bash rm -rf .vite",
      command: "rm -rf .vite",
      cwd: "/repos/lorebase",
    });
    expect(request.options.map((option) => option.name)).toEqual(["permitir uma vez", "nunca"]);

    manager.respondToPermission(sessionId, request.requestId, "allow");
    await turn;

    expect(outcome).toEqual({ outcome: "selected", optionId: "allow" });
    expect(events).toContainEqual({
      type: "permission_resolved",
      requestId: request.requestId,
      outcome: { optionId: "allow" },
    });
  });

  it("refuses to answer a request nobody is waiting on", async () => {
    // Swallowing it would leave the agent blocked with nothing on screen to say
    // why — the exact failure the dialog exists to prevent.
    const { manager, sessionId } = await start();

    expect(() => manager.respondToPermission(sessionId, "rq-nobody", "allow")).toThrow(
      /no permission request/,
    );
  });

  it("releases a request the agent will never get an answer to when it dies", async () => {
    const { manager, events, sessionId, process } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.requestPermission({
          toolCall: { toolCallId: "tc-1", title: "Bash" },
          options: [{ optionId: "allow", name: "allow", kind: "allow_once" }],
        });
        return "end_turn";
      },
    });

    void manager.prompt(sessionId, "roda").catch(() => {});
    await waitFor(() => events.find((event) => event.type === "permission_request"));

    process.kill();

    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));
    expect(manager.get(sessionId)?.state).toBe("exited");
  });
});

describe("interruption", () => {
  it("closes an open call as cancelled, not as failed", async () => {
    // A14, and the only place the fifth state can come from: ACP has no
    // `cancelled` tool status, so a call still open when the user pressed stop
    // would otherwise stay `running` forever or be painted red.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Bash pnpm gate:full",
          kind: "execute",
          status: "in_progress",
        });
        await turn.cancelled;
        return "cancelled";
      },
    });

    const turn = manager.prompt(sessionId, "roda o gate");
    await waitFor(() => events.find((event) => event.type === "tool_call"));
    manager.cancel(sessionId);
    await turn;

    expect(events.at(-2)).toEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      status: "cancelled",
    });
    expect(events.at(-1)).toEqual({ type: "turn_end", stopReason: "cancelled" });
  });

  it("leaves a finished call alone when the turn is cancelled", async () => {
    // Only what was still open gets closed. Re-marking a completed call would
    // rewrite history the user already read.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Read",
          kind: "read",
          status: "completed",
        });
        await turn.cancelled;
        return "cancelled";
      },
    });

    const turn = manager.prompt(sessionId, "lê");
    await waitFor(() => events.find((event) => event.type === "tool_call"));
    manager.cancel(sessionId);
    await turn;

    expect(typesOf(events)).toEqual(["tool_call", "turn_end"]);
  });

  it("is a no-op on a session that already ended", async () => {
    const { manager, sessionId, process } = await start();
    process.kill();
    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));

    expect(() => manager.cancel(sessionId)).not.toThrow();
  });
});

describe("the session outlives the client", () => {
  it("keeps producing events after every listener has detached", async () => {
    // F1.4. The subprocess belongs to the daemon, so closing the browser must
    // not end the conversation — and the transcript is what proves it happened.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "continuei sozinho" },
        });
        return "end_turn";
      },
    });

    const detach = manager.onEvent(sessionId, () => {});
    detach();
    // The harness listener too: nobody is watching now.
    events.length = 0;

    await manager.prompt(sessionId, "vai");

    expect(manager.transcript(sessionId).some((event) => event.type === "message")).toBe(true);
  });

  it("replays the whole conversation to a client that attaches late", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "oi" },
        });
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "primeiro");

    expect(typesOf(manager.transcript(sessionId))).toEqual(["message", "turn_end"]);
  });

  it("hands every attached client the same events", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "para os dois" },
        });
        return "end_turn";
      },
    });

    const first: AcpEvent[] = [];
    const second: AcpEvent[] = [];
    manager.onEvent(sessionId, (event) => first.push(event));
    manager.onEvent(sessionId, (event) => second.push(event));

    await manager.prompt(sessionId, "vai");

    expect(first).toEqual(second);
  });

  it("keeps serving the other clients when one listener throws", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn): Promise<StopReason> {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "sobrevivi" },
        });
        return "end_turn";
      },
    });

    const survivor: AcpEvent[] = [];
    manager.onEvent(sessionId, () => {
      throw new Error("a broken client");
    });
    manager.onEvent(sessionId, (event) => survivor.push(event));

    await expect(manager.prompt(sessionId, "vai")).resolves.toBe("end_turn");
    expect(survivor.length).toBeGreaterThan(0);
  });
});

describe("the end of a session", () => {
  it("records the exit and tells the watchers", async () => {
    const { manager, sessionId, process } = await start();
    const exits: string[] = [];
    manager.watchExits((info) => exits.push(info.id));

    process.kill();
    await waitFor(() => (exits.length > 0 ? true : undefined));

    expect(exits).toEqual([sessionId]);
    expect(manager.get(sessionId)).toMatchObject({ state: "exited", exitCode: 0 });
  });

  it("refuses a prompt to an agent that is gone", async () => {
    const { manager, sessionId, process } = await start();
    process.kill();
    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));

    await expect(manager.prompt(sessionId, "oi")).rejects.toMatchObject({
      code: "SESSION_EXITED",
    });
  });

  it("refuses to forget a session that is still running", async () => {
    const { manager, sessionId } = await start();

    expect(() => manager.forget(sessionId)).toThrow(/still running/);
  });

  it("forgets a session that has ended", async () => {
    const { manager, sessionId, process } = await start();
    process.kill();
    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));

    manager.forget(sessionId);

    expect(manager.get(sessionId)).toBeUndefined();
    expect(manager.list()).toEqual([]);
  });

  it("kills everything on shutdown", async () => {
    const first = fakeAgentProcess();
    const second = fakeAgentProcess();
    const queue = [first.process, second.process];
    const manager = new AcpManager({ spawner: () => queue.shift()!, isAvailable: () => true });
    await manager.spawn({ command: "a", cwd: "/repos/lorebase" });
    await manager.spawn({ command: "b", cwd: "/repos/lorebase" });

    await manager.killAll(500);

    await expect(first.killed).resolves.toBeUndefined();
    await expect(second.killed).resolves.toBeUndefined();
  });

  it("answers about a session that never existed", async () => {
    const manager = new AcpManager({
      spawner: () => fakeAgentProcess().process,
      isAvailable: () => true,
    });

    expect(() => manager.transcript("nope")).toThrow(/no session/);
    expect(manager.get("nope")).toBeUndefined();
  });
});

/**
 * Polls a predicate until it produces something.
 *
 * The events under test cross a real stream, so they arrive on a later
 * microtask than the call that caused them. A fixed `await` would either be
 * flaky or slow; this is neither.
 */
async function waitFor<T>(probe: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
