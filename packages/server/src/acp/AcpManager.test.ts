import type { LoadSessionRequest } from "@agentclientprotocol/sdk";

import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PtyManager } from "../pty/PtyManager.js";
import {
  FAKE_GROUPED_CONFIG_OPTIONS,
  FAKE_MODES,
  fakeAgentProcess,
  type FakeAgentScript,
  type FakeAgentTurn,
} from "../testing/acp-fake-agent.js";
import { AcpManager, modeOwnerOf, type AcpManagerOptions } from "./AcpManager.js";
import type { AcpProcess } from "./process.js";
import {
  createMemoryTranscriptStore,
  createTranscriptStore,
  type TranscriptStore,
} from "./TranscriptStore.js";

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
  /** Os blocos de cada `session/prompt`, para provar o que atravessou. */
  promptBlocks: readonly (readonly string[])[];
}

interface StartOptions {
  /** Where the conversation is kept. Defaults to the manager's in-memory store. */
  transcripts?: TranscriptStore;
  log?: { warn: (...args: never[]) => void };
  /** O que a memória do workspace tem a dizer. Ausente é o default. */
  preamble?: AcpManagerOptions["preamble"];
}

async function start(
  script: FakeAgentScript = {},
  options: StartOptions = {},
): Promise<Harness> {
  const fake = fakeAgentProcess(script);
  const manager = new AcpManager({
    spawner: () => fake.process,
    handshakeTimeoutMs: 2_000,
    isAvailable: () => true,
    ...(options.transcripts ? { transcripts: options.transcripts } : {}),
    ...(options.log ? { log: options.log as unknown as { warn: () => void } } : {}),
    ...(options.preamble ? { preamble: options.preamble } : {}),
  });

  const info = await manager.spawn({
    command: "claude-agent-acp",
    cwd: "/repos/lorebase",
    adapterVersion: "0.69.0",
  });

  const events: AcpEvent[] = [];
  manager.onEvent(info.id, ({ event }) => events.push(event));

  return {
    manager,
    events,
    sessionId: info.id,
    process: fake.process,
    killed: fake.killed,
    promptBlocks: fake.promptBlocks,
  };
}

const typesOf = (events: readonly AcpEvent[]): string[] => events.map((event) => event.type);

/** Every piece of text a transcript holds, for asserting what was recorded. */
const textsOf = (entries: readonly AcpTranscriptEntry[]): string[] =>
  entries.flatMap((entry) => ("text" in entry.event ? [entry.event.text] : []));

/** One agent message, the way the protocol sends one. */
const say = (turn: FakeAgentTurn, text: string): Promise<void> =>
  turn.update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
  });

/** Temporary checkouts the disk tests make, cleaned up together. */
const dirs: string[] = [];
/** PTY managers the terminal tests build, killed together. */
const ptyManagers: PtyManager[] = [];
/** Transcript stores the disk tests open, closed together. */
const stores: TranscriptStore[] = [];
afterEach(async () => {
  await Promise.all(ptyManagers.splice(0).map((manager) => manager.killAll()));
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

    const mode = info?.configOptions.find((option) => option.id === "mode");

    expect(info?.mode).toBe("default");
    expect(mode?.choices.map((choice) => choice.value)).toEqual([
      "auto",
      "default",
      "acceptEdits",
      "plan",
      "bypassPermissions",
    ]);
    expect(mode?.choices.find((choice) => choice.value === "acceptEdits")?.description).toBe(
      "Auto-accept file edit operations",
    );
  });

  it("reads the model out of configOptions, where the protocol actually puts it", async () => {
    const { manager, sessionId } = await start();
    const info = manager.get(sessionId);

    const model = info?.configOptions.find((option) => option.id === "model");

    expect(info?.model).toBe("opus[1m]");
    expect(model?.choices.map((choice) => choice.value)).toEqual(["opus[1m]", "sonnet"]);
  });

  it("flattens a grouped model select", async () => {
    // The protocol allows `Array<SessionConfigSelectGroup>` as well as a flat
    // list. A reader that assumes flat silently finds no models at all, and the
    // selector renders empty with nothing to explain it.
    const { manager, sessionId } = await start({
      newSession: () => ({ configOptions: FAKE_GROUPED_CONFIG_OPTIONS }),
    });

    const info = manager.get(sessionId);

    const model = info?.configOptions.find((option) => option.id === "model");

    expect(info?.model).toBe("opus[1m]");
    expect(model?.choices.map((choice) => choice.value)).toEqual(["opus[1m]", "sonnet", "haiku"]);
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
      async prompt(_text, turn) {
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

    // The user's own message opens the turn. The adapter does not echo it, so
    // recording it here is what makes a replay show the questions and not only
    // the answers.
    expect(events.slice(1)).toEqual([
      { type: "message", messageId: "m-1", role: "agent", text: "O parser " },
      { type: "message", messageId: "m-1", role: "agent", text: "saiu." },
      { type: "turn_end", stopReason: "end_turn" },
    ]);
    expect(events[0]).toMatchObject({
      type: "message",
      role: "user",
      text: "arruma o frontmatter vazio",
    });
  });

  it("carries a tool call from announcement to result", async () => {
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn) {
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

    expect(events[1]).toMatchObject({ type: "tool_call", status: "running", name: "Edit" });
    expect(events[2]).toMatchObject({ type: "tool_call_update", status: "ok" });
  });

  it("gives each turn its own fallback message id", async () => {
    // Chunks with no `messageId` belong to the turn that produced them. Sharing
    // one id across turns would glue yesterday's answer to today's.
    const { manager, events, sessionId } = await start({
      async prompt(text, turn) {
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
      .filter(
        (event): event is Extract<AcpEvent, { type: "message" }> =>
          event.type === "message" && event.role === "agent",
      )
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
    manager.onEvent(info.id, ({ event }) => events.push(event));

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

  it("forwards a plan, now that there is somewhere to show it", async () => {
    // This test used to assert the opposite — that a plan was ignored without
    // being called unrecognised, which was true while nothing rendered one. The
    // plan card is what changed the premise.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "plan",
          entries: [{ content: "extrair o parser", status: "in_progress", priority: "high" }],
        } as never);
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "planeja");

    expect(typesOf(events)).toEqual(["message", "plan", "turn_end"]);
    expect(events[1]).toEqual({
      type: "plan",
      entries: [{ content: "extrair o parser", status: "in_progress", priority: "high" }],
    });
  });

  it("still ignores what phase 4 has not reached", async () => {
    // The ignore list shrinks one task at a time. What is still on it must stay
    // silent rather than showing up as an unrecognised event.
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn) {
        await turn.update({ sessionUpdate: "session_info_update", title: "algo" } as never);
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "conta");

    expect(typesOf(events)).toEqual(["message", "turn_end"]);
  });
});

describe("permission", () => {
  it("emits the request, waits, and lets the agent finish once answered", async () => {
    let outcome: unknown;
    const { manager, events, sessionId } = await start({
      async prompt(_text, turn) {
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
      by: "user",
      reason: null,
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
      async prompt(_text, turn) {
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
      async prompt(_text, turn) {
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
      async prompt(_text, turn) {
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

    expect(typesOf(events)).toEqual(["message", "tool_call", "turn_end"]);
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
      async prompt(_text, turn) {
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

    expect(manager.transcript(sessionId).some(({ event }) => event.type === "message")).toBe(true);
  });

  it("replays the whole conversation to a client that attaches late", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "oi" },
        });
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "primeiro");

    expect(typesOf(manager.transcript(sessionId).map(({ event }) => event))).toEqual([
      "message",
      "message",
      "turn_end",
    ]);
  });

  it("hands every attached client the same events", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "para os dois" },
        });
        return "end_turn";
      },
    });

    const first: AcpEvent[] = [];
    const second: AcpEvent[] = [];
    manager.onEvent(sessionId, ({ event }) => first.push(event));
    manager.onEvent(sessionId, ({ event }) => second.push(event));

    await manager.prompt(sessionId, "vai");

    expect(first).toEqual(second);
  });

  it("keeps serving the other clients when one listener throws", async () => {
    const { manager, sessionId } = await start({
      async prompt(_text, turn) {
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
    manager.onEvent(sessionId, ({ event }) => survivor.push(event));

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

describe("the agent reaching the disk", () => {
  /** A checkout the manager is allowed to touch, and one it is not. */
  function checkout(): { root: string; outside: string } {
    const base = mkdtempSync(join(tmpdir(), "lumem-acp-mgr-fs-"));
    dirs.push(base);
    const root = join(base, "repo");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "notas.md"), "linha um\n");
    const outside = join(base, "fora");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "segredo.txt"), "não\n");
    return { root, outside };
  }

  async function startIn(root: string, script: FakeAgentScript) {
    const fake = fakeAgentProcess(script);
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    const info = await manager.spawn({ command: "claude-agent-acp", cwd: root });
    return { manager, sessionId: info.id };
  }

  it("declares the capability, now that both methods exist", async () => {
    // Claimed only after they do. An agent told the client can write, that then
    // finds it cannot, fails in the middle of a turn instead of at the handshake.
    let capabilities: unknown;
    const { root } = checkout();
    const { manager, sessionId } = await startIn(root, {
      initialize: (params) => {
        capabilities = params.clientCapabilities;
        return {};
      },
    });

    expect(capabilities).toMatchObject({ fs: { readTextFile: true, writeTextFile: true } });
    // And nothing claimed about the terminal, which does not exist yet. The SDK
    // normalises the absent field to `false`, so the assertion is about the
    // claim rather than about the key being there.
    expect((capabilities as { terminal?: unknown }).terminal).not.toBe(true);
    expect(manager.get(sessionId)?.state).toBe("running");
  });

  it("reads a file inside the session's own checkout", async () => {
    const { root } = checkout();
    let read: string | undefined;
    const { manager, sessionId } = await startIn(root, {
      async prompt(_text, turn) {
        read = await turn.readFile(join(root, "notas.md"));
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "lê");

    expect(read).toBe("linha um\n");
  });

  it("writes a file inside the checkout", async () => {
    const { root } = checkout();
    const { manager, sessionId } = await startIn(root, {
      async prompt(_text, turn) {
        await turn.writeFile(join(root, "src", "novo.ts"), "export {};\n");
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "escreve");

    expect(readFileSync(join(root, "src", "novo.ts"), "utf8")).toBe("export {};\n");
  });

  it("refuses a path outside the checkout, and the session keeps going", async () => {
    /*
     * The refusal has to reach the agent as a protocol error rather than as an
     * exception that ends the conversation. With `auto` as the default mode there
     * is less human confirmation in this path than anywhere else, so the guard is
     * the floor — and a floor that takes the session down with it is a floor
     * nobody can act on.
     */
    const { root, outside } = checkout();
    let refusal: string | undefined;
    const { manager, sessionId } = await startIn(root, {
      async prompt(_text, turn) {
        try {
          await turn.readFile(join(outside, "segredo.txt"));
        } catch (error) {
          refusal = error instanceof Error ? error.message : String(error);
        }
        return "end_turn";
      },
    });

    await expect(manager.prompt(sessionId, "tenta")).resolves.toBe("end_turn");

    expect(refusal).toBeDefined();
    expect(manager.get(sessionId)?.state).toBe("running");
  });

  it("scopes each session to its own checkout", async () => {
    // One bridge per session, rooted at its own cwd. A shared one would need the
    // root passed on every call, and the call that forgot would read a neighbour.
    const first = checkout();
    const second = checkout();
    writeFileSync(join(second.root, "notas.md"), "do segundo\n");

    let leaked: string | undefined;
    const { manager, sessionId } = await startIn(first.root, {
      async prompt(_text, turn) {
        try {
          leaked = await turn.readFile(join(second.root, "notas.md"));
        } catch {
          leaked = undefined;
        }
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "tenta o vizinho");

    expect(leaked).toBeUndefined();
  });
});

describe("switching mode and model", () => {
  it("uses session/set_mode for the mode, and nothing else", async () => {
    // D8's whole point: the protocol treats mode specially, and the daemon is the
    // only side that has to know.
    const asked: string[] = [];
    const { manager, sessionId } = await start({
      setMode: (modeId) => asked.push(modeId),
      setConfigOption: () => {
        throw new Error("mode must not go through the generic call");
      },
    });

    await manager.setConfig(sessionId, "mode", "plan");

    expect(asked).toEqual(["plan"]);
    expect(manager.get(sessionId)?.mode).toBe("plan");
  });

  it("uses the generic call for everything else", async () => {
    const asked: [string, string | boolean][] = [];
    const { manager, sessionId } = await start({
      setConfigOption: (configId, value) => {
        asked.push([configId, value]);
      },
    });

    await manager.setConfig(sessionId, "model", "sonnet");

    expect(asked).toEqual([["model", "sonnet"]]);
  });

  it("trusts the agent's answer over the request", async () => {
    // An agent asked for `sonnet` may hand back `sonnet[1m]`, which is what is
    // actually in effect. Believing the request would show a value that is not.
    const { manager, sessionId } = await start({
      setConfigOption: () =>
        [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "sonnet[1m]",
            options: [{ value: "sonnet[1m]", name: "sonnet[1m]" }],
          },
        ] as never,
    });

    await manager.setConfig(sessionId, "model", "sonnet");

    expect(manager.get(sessionId)?.model).toBe("sonnet[1m]");
  });

  it("tells every attached client about the switch", async () => {
    const { manager, events, sessionId } = await start();

    await manager.setConfig(sessionId, "mode", "plan");

    expect(events.at(-1)).toMatchObject({ type: "config", mode: "plan" });
  });

  it("refuses an option the agent does not offer", async () => {
    const { manager, sessionId } = await start();

    await expect(manager.setConfig(sessionId, "telepatia", "on")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses a switch in the middle of a turn, with a reason", async () => {
    // The protocol does not say what a mid-turn switch means, and the agent may
    // already have acted under the old value. Applying it silently would let the
    // user believe they changed the rules for what is happening now. Open as A15.
    const { manager, sessionId } = await start({
      async prompt(_text, turn) {
        await turn.cancelled;
        return "cancelled";
      },
    });

    const turn = manager.prompt(sessionId, "roda algo longo");
    await expect(manager.setConfig(sessionId, "mode", "plan")).rejects.toMatchObject({
      code: "BLOCKED",
      message: /no meio de um turno/,
    });

    manager.cancel(sessionId);
    await turn;

    // And it works again once the turn is over.
    await expect(manager.setConfig(sessionId, "mode", "plan")).resolves.toBeUndefined();
  });

  it("refuses a switch on a session whose agent is gone", async () => {
    const { manager, sessionId, process } = await start();
    process.kill();
    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));

    await expect(manager.setConfig(sessionId, "mode", "plan")).rejects.toMatchObject({
      code: "SESSION_EXITED",
    });
  });
});

describe("the agent switching on its own", () => {
  it("follows a mode the agent changed by itself", async () => {
    // A `/plan` command makes the agent switch. The pill has to follow without the
    // client having asked for anything.
    const fake = fakeAgentProcess();
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    const info = await manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const events: AcpEvent[] = [];
    manager.onEvent(info.id, ({ event }) => events.push(event));

    await fake.sendRaw({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "fake-acp-session",
        update: { sessionUpdate: "current_mode_update", currentModeId: "plan" },
      },
    });

    await waitFor(() => events.find((event) => event.type === "config"));
    expect(manager.get(info.id)?.mode).toBe("plan");
  });

  it("merges an options update instead of replacing the whole set", async () => {
    // The update carries what changed. Replacing would drop the mode selector the
    // daemon folds in from `modes`, which is not among the agent's own options.
    const fake = fakeAgentProcess();
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    const info = await manager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const before = manager.get(info.id)?.configOptions.map((option) => option.id);
    const events: AcpEvent[] = [];
    manager.onEvent(info.id, ({ event }) => events.push(event));

    await fake.sendRaw({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "fake-acp-session",
        update: {
          sessionUpdate: "config_option_update",
          configOptions: [
            {
              id: "effort",
              name: "Effort",
              type: "select",
              currentValue: "high",
              options: [{ value: "high", name: "high" }],
            },
          ],
        },
      },
    });

    await waitFor(() => events.find((event) => event.type === "config"));
    const after = manager.get(info.id)?.configOptions.map((option) => option.id);

    expect(before).toContain("model");
    expect(after).toContain("model");
    expect(after).toContain("effort");
  });
});

describe("the terminal the agent asks for", () => {
  async function startWithPty(script: FakeAgentScript = {}) {
    const fake = fakeAgentProcess(script);
    const ptyManager = new PtyManager();
    ptyManagers.push(ptyManager);
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
      ptyManager,
    });
    const info = await manager.spawn({ command: "claude-agent-acp", cwd: tmpdir() });
    const events: AcpEvent[] = [];
    manager.onEvent(info.id, ({ event }) => events.push(event));
    return { manager, ptyManager, events, sessionId: info.id, process: fake.process };
  }

  it("declares the capability only when there is a PtyManager behind it", async () => {
    let withPty: unknown;
    let withoutPty: unknown;

    await startWithPty({
      initialize: (params) => {
        withPty = params.clientCapabilities;
        return {};
      },
    });
    await start({
      initialize: (params) => {
        withoutPty = params.clientCapabilities;
        return {};
      },
    });

    expect(withPty).toMatchObject({ terminal: true });
    // Claiming it without one would have the agent ask for a shell and get an error
    // mid-turn, which is what declaring capabilities honestly avoids.
    expect((withoutPty as { terminal?: unknown }).terminal).not.toBe(true);
  });

  it("runs the command and tells the card which PTY to attach to", async () => {
    // D7: the event carries a PTY session id, so the embedded xterm uses the endpoint
    // that already exists and no second streaming path had to be built.
    const { manager, ptyManager, events, sessionId } = await startWithPty({
      async prompt(_text, turn) {
        await turn.createTerminal("sh", ["-c", "echo do-agente"]);
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "roda algo");

    const terminal = events.find((event) => event.type === "terminal");
    expect(terminal).toMatchObject({ command: "sh" });
    const ptySessionId = (terminal as Extract<AcpEvent, { type: "terminal" }>).ptySessionId;
    await vi.waitFor(() => expect(ptyManager.snapshot(ptySessionId)).toContain("do-agente"));
  });

  it("keeps the agent's terminal out of the worktree's session list", async () => {
    /*
     * A5 and D7: it lives inside the card. The user did not start it and cannot close
     * it — the agent owns its lifetime — so a tab for it would offer a close button
     * that fights the agent for control.
     *
     * The PTY exists in the manager, which is how the xterm reaches it; what must not
     * happen is a `session` row, and nothing here writes one.
     */
    const { manager, ptyManager, sessionId } = await startWithPty({
      async prompt(_text, turn) {
        await turn.createTerminal("sh", ["-c", "sleep 30"]);
        return "end_turn";
      },
    });

    await manager.prompt(sessionId, "roda");

    expect(ptyManager.list()).toHaveLength(1);
    // The ACP session is the only thing the manager lists as a session.
    expect(manager.list()).toHaveLength(1);
  });

  it("kills the agent's terminals when the agent itself dies", async () => {
    // They are children of the daemon, not of the adapter, so nothing else would end
    // them — and an orphaned shell with nothing pointing at it is exactly what
    // `killAll` exists to prevent for the sessions a user started.
    const { manager, ptyManager, events, sessionId, process } = await startWithPty({
      async prompt(_text, turn) {
        await turn.createTerminal("sh", ["-c", "sleep 30"]);
        await turn.cancelled;
        return "cancelled";
      },
    });

    const turn = manager.prompt(sessionId, "roda");
    await waitFor(() => events.find((event) => event.type === "terminal"));
    const ptySessionId = (
      events.find((event) => event.type === "terminal") as Extract<
        AcpEvent,
        { type: "terminal" }
      >
    ).ptySessionId;
    expect(ptyManager.get(ptySessionId)?.state).toBe("running");

    process.kill();
    manager.cancel(sessionId);
    await turn.catch(() => {});

    await waitFor(() =>
      ptyManager.get(ptySessionId)?.state === "exited" ? true : undefined,
    );
  });

  it("refuses politely when no PtyManager was wired", async () => {
    // Only reachable from an agent that asks despite the capability not being
    // declared. Telling it beats crashing on it.
    let refusal: string | undefined;
    const { manager, sessionId } = await start({
      async prompt(_text, turn) {
        try {
          await turn.createTerminal("sh", ["-c", "true"]);
        } catch (error) {
          refusal = error instanceof Error ? error.message : String(error);
        }
        return "end_turn";
      },
    });

    await expect(manager.prompt(sessionId, "tenta")).resolves.toBe("end_turn");
    expect(refusal).toBeDefined();
  });
});

describe("where the conversation is kept", () => {
  /**
   * F5.4. Until this, the transcript was an array on the session object: it grew for
   * the life of the conversation with no ceiling, and it died with the daemon. Both
   * halves of that are the point — the ceiling is why the task exists, and the
   * dying is why phase 5 exists.
   */

  function onDisk(): { transcripts: TranscriptStore; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "lumem-acp-transcript-"));
    dirs.push(dir);
    const transcripts = createTranscriptStore({ dir });
    stores.push(transcripts);
    return { transcripts, dir };
  }

  it("writes the turn to the store, and reads the attach back out of it", async () => {
    const { transcripts } = onDisk();
    const { manager, sessionId } = await start(
      {
        async prompt(_text, turn) {
          await say(turn, "respondido");
          return "end_turn";
        },
      },
      { transcripts },
    );

    await manager.prompt(sessionId, "pergunta");

    // What `attached` sends. Same list either way, which is the invariant that
    // makes replaying equal to having been there.
    expect(manager.transcript(sessionId).map((entry) => entry.event.type)).toEqual([
      "message",
      "message",
      "turn_end",
    ]);
    expect(transcripts.read(sessionId).map((entry) => entry.event.type)).toEqual([
      "message",
      "message",
      "turn_end",
    ]);
  });

  it("survives the daemon that wrote it", async () => {
    // The whole promise of the phase, at the level where it is cheap to prove: a
    // second store over the same directory is what a restart looks like from here.
    const { transcripts, dir } = onDisk();
    const { manager, sessionId } = await start(
      {
        async prompt(_text, turn) {
          await say(turn, "de ontem");
          return "end_turn";
        },
      },
      { transcripts },
    );
    await manager.prompt(sessionId, "pergunta de ontem");
    transcripts.close();

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);

    expect(reopened.read(sessionId).map((entry) => entry.event.type)).toEqual([
      "message",
      "message",
      "turn_end",
    ]);
  });

  it("keeps two sessions in two files", async () => {
    const { transcripts } = onDisk();
    const first = await start({}, { transcripts });
    const second = await start({}, { transcripts });

    await first.manager.prompt(first.sessionId, "da primeira");
    await second.manager.prompt(second.sessionId, "da segunda");

    expect(textsOf(transcripts.read(first.sessionId))).toContain("da primeira");
    expect(textsOf(transcripts.read(first.sessionId))).not.toContain("da segunda");
  });

  it("finishes the turn even when the disk refuses the write", async () => {
    /*
     * A full disk, a revoked permission, a state directory that moved. Losing a line
     * of the record is bad; losing the answer the user is waiting for because the
     * record could not be written is worse — so the failure is logged and the turn
     * goes on.
     */
    const warn = vi.fn();
    const refusing: TranscriptStore = {
      append() {
        throw new Error("disco cheio");
      },
      read: () => [],
      copy: () => 0,
      drop() {},
      release() {},
      close() {},
    };

    const { manager, sessionId, events } = await start(
      {
        async prompt(_text, turn) {
          await say(turn, "respondido mesmo assim");
          return "end_turn";
        },
      },
      { transcripts: refusing, log: { warn } as never },
    );

    await expect(manager.prompt(sessionId, "pergunta")).resolves.toBe("end_turn");
    // The live client still saw everything; only the record was lost.
    expect(typesOf(events)).toContain("turn_end");
    expect(warn).toHaveBeenCalled();
  });

  it("keeps the conversation when the process is forgotten", async () => {
    /*
     * Forgetting the process is not forgetting the conversation: `forget` drops the
     * manager's record and releases the file handle, and the file stays. Erasing it is
     * `drop` on the store, which is a different decision made in a different place.
     *
     * The handle being released is fd hygiene — a handle per session held for the
     * life of the daemon is a descriptor that never comes back — and it is not
     * observable from here. What is observable, and what would actually hurt, is the
     * conversation disappearing.
     */
    const { transcripts } = onDisk();
    const { manager, sessionId, process } = await start({}, { transcripts });

    await manager.prompt(sessionId, "algo dito");
    process.kill();
    await waitFor(() => (manager.get(sessionId)?.state === "exited" ? true : undefined));

    manager.forget(sessionId);

    expect(manager.get(sessionId)).toBeUndefined();
    expect(textsOf(transcripts.read(sessionId))).toContain("algo dito");
  });
});

describe("resuming yesterday's conversation", () => {
  /**
   * F5.2, A7, D12. `session/load` does not bring the old process back — nothing can.
   * It starts a new adapter and tells it which conversation to continue, which is why
   * this returns a session with a **new** id of ours and the **old** id of the
   * agent's.
   */

  interface Resumed extends Harness {
    loaded: LoadSessionRequest[];
  }

  async function resume(
    script: FakeAgentScript = {},
    acpSessionId = "conversa-de-ontem",
  ): Promise<Resumed> {
    const loaded: LoadSessionRequest[] = [];
    const fake = fakeAgentProcess({
      ...script,
      loadSession: async (params, replay) => {
        loaded.push(params);
        return (await script.loadSession?.(params, replay)) ?? {};
      },
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
    });

    const info = await manager.resume({
      command: "claude-agent-acp",
      cwd: "/repos/lorebase",
      adapterVersion: "0.69.0",
      acpSessionId,
    });

    const events: AcpEvent[] = [];
    manager.onEvent(info.id, ({ event }) => events.push(event));

    return {
      manager,
      events,
      sessionId: info.id,
      process: fake.process,
      killed: fake.killed,
      promptBlocks: fake.promptBlocks,
      loaded,
    };
  }

  it("keeps the agent's id and takes a new one of its own", async () => {
    const { manager, sessionId } = await resume();

    const info = manager.get(sessionId)!;
    expect(info.acpSessionId).toBe("conversa-de-ontem");
    // Ours is new: the row that died stays dead, with its transcript intact (D12).
    expect(info.id).not.toBe("conversa-de-ontem");
    expect(info.state).toBe("running");
  });

  it("names the conversation in the agent's own vocabulary", async () => {
    const { loaded } = await resume();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ sessionId: "conversa-de-ontem", cwd: "/repos/lorebase" });
  });

  it("takes the mode and the selectors from the load, not from a new session", async () => {
    const { manager, sessionId } = await resume({
      loadSession: () => ({ modes: { ...FAKE_MODES, currentModeId: "plan" } }),
    });

    expect(manager.get(sessionId)?.mode).toBe("plan");
    expect(manager.get(sessionId)?.configOptions.map((option) => option.id)).toContain("model");
  });

  it("throws away the conversation the adapter replays at it", async () => {
    /*
     * D14. A real adapter re-streams the whole history while answering
     * `session/load`. The daemon already has that conversation on disk, in a better
     * copy — one with the tool cards, the plans and the usage the replay does not
     * carry — so recording the replay too would show the conversation twice, and the
     * second copy would be the worse one.
     */
    const { manager, sessionId } = await resume({
      loadSession: async (_params, replay) => {
        await replay({
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: "o que eu disse ontem" },
        });
        await replay({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "o que ele respondeu ontem" },
        });
      },
    });

    expect(manager.transcript(sessionId)).toEqual([]);
  });

  it("keeps discarding the replay after the load has already answered", async () => {
    /*
     * The boundary is the first prompt, not the load's response, and this is the test
     * that says so.
     *
     * The reply and the notifications travel the same pipe, and the SDK does not
     * promise that a notification written before a reply is *handled* before it. The
     * first version cleared the mute in the load's `finally`: in-process the replay was
     * dropped and the unit suite was green, and against a real subprocess the same
     * replay was recorded — the conversation appeared twice on screen, and only the e2e
     * saw it.
     *
     * What is left uncovered, and named rather than hidden: a replay line still in
     * flight when the user prompts *is* recorded. Nothing in the protocol says how long
     * a replay lasts, and the user cannot type before the tab is open, so the window is
     * small — but it is real.
     */
    const fake = fakeAgentProcess({
      async prompt(_text, turn) {
        await say(turn, "respondendo de verdade");
        return "end_turn";
      },
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
    });
    const info = await manager.resume({
      command: "claude-agent-acp",
      cwd: "/repos/lorebase",
      acpSessionId: "fake-acp-session",
    });

    // Both written after the load answered, which is where the race was. The command
    // list survives the mute and the message does not, so the first one arriving is the
    // proof that the second was *handled* and dropped rather than merely late.
    for (const update of [
      { sessionUpdate: "available_commands_update", availableCommands: [{ name: "gate", description: "roda o gate" }] },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "replay-atrasado" } },
    ]) {
      await fake.sendRaw({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: "fake-acp-session", update },
      });
    }
    await waitFor(() =>
      manager.transcript(info.id).some((entry) => entry.event.type === "commands")
        ? true
        : undefined,
    );

    await manager.prompt(info.id, "e agora?");

    expect(textsOf(manager.transcript(info.id))).not.toContain("replay-atrasado");
    expect(textsOf(manager.transcript(info.id))).toContain("respondendo de verdade");
  });

  it("keeps the selectors and the commands the agent sends while replaying", async () => {
    // Content only. The selectors and the slash list are the agent describing *itself*
    // rather than retelling the conversation, and dropping them would leave a resumed
    // tab with no pills and an empty menu.
    const { manager, sessionId, events } = await resume({
      loadSession: async (_params, replay) => {
        await replay({
          sessionUpdate: "available_commands_update",
          availableCommands: [{ name: "gate", description: "roda o gate" }],
        });
        await replay({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "o que foi dito ontem" },
        });
      },
    });

    expect(typesOf(events)).toEqual([]);
    expect(manager.transcript(sessionId).map((entry) => entry.event.type)).toEqual(["commands"]);
  });

  it("hears the next turn, once the load is done", async () => {
    // The other half of muting the replay: a flag left set would leave a session that
    // looks alive and says nothing.
    const { manager, sessionId, events } = await resume({
      async prompt(_text, turn) {
        await say(turn, "continuando de onde paramos");
        return "end_turn";
      },
      loadSession: async (_params, replay) => {
        await replay({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "de ontem" },
        });
      },
    });

    await manager.prompt(sessionId, "e agora?");

    expect(typesOf(events)).toEqual(["message", "message", "turn_end"]);
    expect(textsOf(manager.transcript(sessionId))).toContain("continuando de onde paramos");
  });

  it("brings the old conversation with it, and records where it resumed", async () => {
    /*
     * D15 and D12 together. The history is copied into the new session's file before
     * anything new is written, and the resume itself is an *event* — so the separator
     * the client draws sits in the same place on a replay as it did live, which is the
     * property the whole transcript design rests on.
     */
    const transcripts = createMemoryTranscriptStore();
    transcripts.append("sessao-de-ontem", {
      at: 1,
      event: { type: "message", messageId: "m-1", role: "user", text: "o que eu disse ontem" },
    });
    const fake = fakeAgentProcess({
      async prompt(_text, turn) {
        await say(turn, "e hoje");
        return "end_turn";
      },
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
      transcripts,
    });

    const info = await manager.resume({
      command: "claude-agent-acp",
      cwd: "/repos/lorebase",
      acpSessionId: "conversa-de-ontem",
      fromSessionId: "sessao-de-ontem",
    });
    await manager.prompt(info.id, "e agora?");

    expect(manager.transcript(info.id).map((entry) => entry.event.type)).toEqual([
      "message",
      "resumed",
      "message",
      "message",
      "turn_end",
    ]);
    expect(textsOf(manager.transcript(info.id))).toContain("o que eu disse ontem");
    // The session that ended keeps its own record: a copy, not a move.
    expect(textsOf(transcripts.read("sessao-de-ontem"))).toEqual(["o que eu disse ontem"]);
  });

  it("still resumes when the old transcript cannot be copied", async () => {
    // Losing the history is bad; losing the conversation because the history could not
    // be copied is worse. The same trade a failed write makes.
    const warn = vi.fn();
    const refusing = {
      ...createMemoryTranscriptStore(),
      copy: () => {
        throw new Error("disco cheio");
      },
    };
    const fake = fakeAgentProcess();
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
      transcripts: refusing,
      log: { warn },
    });

    const info = await manager.resume({
      command: "claude-agent-acp",
      cwd: "/repos/x",
      acpSessionId: "conversa-de-ontem",
      fromSessionId: "sessao-de-ontem",
    });

    expect(info.state).toBe("running");
    expect(manager.transcript(info.id).map((entry) => entry.event.type)).toEqual(["resumed"]);
    expect(warn).toHaveBeenCalled();
  });

  it("refuses an adapter that cannot resume, in a sentence", async () => {
    // F1.6's rule. Without the check the SDK answers with a method-not-found from
    // several frames down, which says nothing about what the user asked for.
    const fake = fakeAgentProcess({
      initialize: () => ({
        agentCapabilities: { promptCapabilities: { image: false, embeddedContext: false } },
      }),
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
    });

    await expect(
      manager.resume({ command: "claude-agent-acp", cwd: "/repos/x", acpSessionId: "antiga" }),
    ).rejects.toThrow(/loadSession/);
    // And the adapter does not stay running behind the refusal.
    await expect(fake.killed).resolves.toBeUndefined();
  });

  it("refuses to resume nothing", async () => {
    const fake = fakeAgentProcess();
    const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });

    await expect(
      manager.resume({ command: "claude-agent-acp", cwd: "/repos/x", acpSessionId: "  " }),
    ).rejects.toThrow(/retomar/);
  });

  it("reports a load the adapter refuses as a launch failure", async () => {
    const fake = fakeAgentProcess({
      loadSession: () => {
        throw new Error("essa conversa não existe mais");
      },
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      handshakeTimeoutMs: 2_000,
      isAvailable: () => true,
    });

    await expect(
      manager.resume({
        command: "claude-agent-acp",
        cwd: "/repos/x",
        adapterVersion: "0.69.0",
        acpSessionId: "sumiu",
      }),
    ).rejects.toThrow(/claude-agent-acp/);
  });
});

describe("núcleo da memória no prompt", () => {
  const core = { text: "# Memória do workspace\n\nCommit em inglês.", entries: 2 };

  it("entra como bloco separado, e a mensagem da pessoa vai verbatim", async () => {
    const { manager, sessionId, promptBlocks } = await start(
      {},
      { preamble: () => Promise.resolve(core) },
    );

    await manager.prompt(sessionId, "arruma o frontmatter");

    // Dois blocos, não um texto colado: o que a pessoa escreveu continua sendo
    // exatamente o que ela escreveu, e o acréscimo do daemon é distinguível.
    expect(promptBlocks[0]).toEqual([core.text, "arruma o frontmatter"]);
  });

  it("vai uma vez, e não em todo turno (D2)", async () => {
    const { manager, sessionId, promptBlocks } = await start(
      {},
      { preamble: () => Promise.resolve(core) },
    );

    await manager.prompt(sessionId, "primeira");
    await manager.prompt(sessionId, "segunda");

    // Reinjetar invalidaria o prefixo cacheado para não dizer nada de novo.
    expect(promptBlocks[1]).toEqual(["segunda"]);
  });

  it("a injeção fica visível na conversa, com o custo", async () => {
    const { manager, sessionId, events } = await start(
      {},
      { preamble: () => Promise.resolve(core) },
    );

    await manager.prompt(sessionId, "arruma");

    const injected = events.find((event) => event.type === "memory_core");
    expect(injected).toEqual({ type: "memory_core", entries: 2, chars: core.text.length });
    // Antes da mensagem da pessoa, porque foi antes dela no prompt.
    expect(typesOf(events).indexOf("memory_core")).toBeLessThan(typesOf(events).indexOf("message"));
  });

  it("sem memória nenhuma, nada é injetado e nada é anunciado", async () => {
    const { manager, sessionId, events, promptBlocks } = await start(
      {},
      { preamble: () => Promise.resolve(null) },
    );

    await manager.prompt(sessionId, "arruma");

    expect(promptBlocks[0]).toEqual(["arruma"]);
    expect(typesOf(events)).not.toContain("memory_core");
  });

  it("memória que falha não derruba o turno", async () => {
    const warns: unknown[] = [];
    const { manager, sessionId, promptBlocks } = await start(
      {},
      {
        preamble: () => Promise.reject(new Error("~/.lumem corrompido")),
        log: { warn: ((...args: unknown[]) => warns.push(args)) as never },
      },
    );

    // Memória é o que melhora a resposta, não o que autoriza a pergunta.
    await expect(manager.prompt(sessionId, "arruma")).resolves.toBeDefined();
    expect(promptBlocks[0]).toEqual(["arruma"]);
    expect(warns).toHaveLength(1);
  });
});

/**
 * O modo do Lumem (`session-mode`, T1).
 *
 * A regra que sustenta tudo é a A1: as duas autoridades **nunca coexistem**. O
 * agente que relata modos é dono do seletor; o que não relata cede o seletor
 * para a política do daemon. Ela é imposta aqui, e não na tela, porque uma cópia
 * dela no browser seria uma cópia livre para discordar desta.
 */
describe("o modo do Lumem", () => {
  /** Um adaptador que não oferece modo nenhum — o caso que a anotação viu. */
  const noModes: FakeAgentScript = {
    newSession: () => ({ modes: null, configOptions: [] }),
  };

  it("dá o seletor ao Lumem quando o agente não relata modos", async () => {
    const { manager, sessionId } = await start(noModes);

    expect(modeOwnerOf(manager.get(sessionId)!)).toBe("lumem");
  });

  it("deixa o seletor com o agente quando ele relata modos", async () => {
    const { manager, sessionId } = await start();

    expect(modeOwnerOf(manager.get(sessionId)!)).toBe("agent");
  });

  it("nasce perguntando tudo, e nenhuma sessão nasce liberada", async () => {
    const { manager, sessionId } = await start(noModes);

    expect(manager.get(sessionId)?.lumemMode).toBe("ask");
  });

  it("troca o modo sem falar com o agente", async () => {
    // O ponto inteiro da feature: isto muda o que o daemon responde a um pedido
    // de permissão, e o agente não fica sabendo que existe uma política.
    const { manager, sessionId, events } = await start(noModes);

    manager.setLumemMode(sessionId, "auto");

    expect(manager.get(sessionId)?.lumemMode).toBe("auto");
    const config = events.filter((event) => event.type === "config").at(-1);
    expect(config).toMatchObject({ modeOwner: "lumem", lumemMode: "auto" });
  });

  it("recusa a troca quando o agente é o dono do seletor", async () => {
    // Não "ignora": erro nomeado. Uma troca que não acontece e não diz nada é a
    // forma mais barata de a tela mentir.
    const { manager, sessionId } = await start();

    expect(() => manager.setLumemMode(sessionId, "auto")).toThrow(/agente/);
  });

  it("recusa a troca no meio de um turno, com a mensagem de sempre", async () => {
    const { manager, sessionId, events } = await start({
      ...noModes,
      prompt: async (_text, turn) => {
        await say(turn, "comecei");
        await turn.cancelled;
        return "cancelled";
      },
    });

    const running = manager.prompt(sessionId, "vai");
    await vi.waitFor(() => expect(typesOf(events)).toContain("message"));

    expect(() => manager.setLumemMode(sessionId, "auto")).toThrow(/meio de um turno/);

    manager.cancel(sessionId);
    await running.catch(() => undefined);
  });

  it("assina como sua a permissão que você respondeu", async () => {
    // O contrário — o Lumem assinando — chega na T7. O que este teste guarda é
    // que o caminho humano continua dizendo "você", e não passa a dizer "Lumem"
    // por descuido de default.
    const { manager, sessionId, events } = await start({
      prompt: async (_text, turn) => {
        void turn.requestPermission({
          toolCall: { toolCallId: "tc-1", title: "Bash rm -rf" },
          options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
        });
        await turn.cancelled;
        return "cancelled";
      },
    });

    const running = manager.prompt(sessionId, "vai");
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "permission_request")).toBe(true);
    });
    const request = events.find((event) => event.type === "permission_request")!;
    manager.respondToPermission(sessionId, request.requestId, "allow");

    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "permission_resolved")).toBe(true);
    });
    expect(events.find((event) => event.type === "permission_resolved")).toMatchObject({
      by: "user",
      reason: null,
    });

    manager.cancel(sessionId);
    await running.catch(() => undefined);
  });
});
