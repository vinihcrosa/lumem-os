#!/usr/bin/env node
/**
 * A real ACP agent, over real stdio, that costs nothing to run.
 *
 * `src/testing/acp-fake-agent.ts` is the in-process one, and it is what the unit
 * suite uses: fast, deterministic, no subprocess. It cannot serve the e2e,
 * because the e2e's whole point is that the daemon spawns something — the
 * `AcpManager`'s spawner is the real one there, and the thing it spawns has to
 * exist on disk and speak the protocol over a pipe.
 *
 * Hand-rolled JSON-RPC rather than the SDK, deliberately. The e2e boots the built
 * daemon and a Vite dev server; adding a module resolution step for a fixture is
 * a way for the suite to fail for reasons that have nothing to do with the app.
 * The protocol surface needed here is four methods.
 *
 * It never calls a model, so the e2e spends nothing. What it does do is act out
 * one turn with every shape the conversation renders: a thought, a streamed
 * message, a tool call that finishes, a permission request that blocks until
 * answered, and a write whose diff the card paints.
 */

import { createInterface } from "node:readline";

const SESSION_ID = "e2e-acp-session";

/** Resolves when the client answers the permission request. */
let resolvePermission = null;

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function update(update_) {
  notify("session/update", { sessionId: SESSION_ID, update: update_ });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The turn the e2e reads.
 *
 * Paced with small delays so the streaming is observable: without them every
 * chunk lands in one frame and the test cannot tell a stream from a single
 * message.
 */
async function runTurn(text) {
  update({
    sessionUpdate: "agent_thought_chunk",
    messageId: "t-1",
    content: { type: "text", text: "o parser está embutido no loader" },
  });

  for (const chunk of ["Vou separar ", "o parser ", "antes de consertar."]) {
    await sleep(40);
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "a-1",
      content: { type: "text", text: chunk },
    });
  }

  // A read that finishes on its own.
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tc-read",
    title: "Read src/lore/loader.ts",
    name: "Read",
    kind: "read",
    status: "in_progress",
    locations: [{ path: "/repos/lorebase/src/lore/loader.ts" }],
  });
  await sleep(40);
  update({ sessionUpdate: "tool_call_update", toolCallId: "tc-read", status: "completed" });

  // A write, so the card has a diff to paint.
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tc-write",
    title: "Write src/lore/frontmatter.ts",
    name: "Write",
    kind: "edit",
    status: "in_progress",
    locations: [
      {
        path: "/repos/lorebase/packages/web/src/components/right-panel/__tests__/file-tree-keyboard-navigation.test.tsx",
      },
    ],
  });
  await sleep(40);
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "tc-write",
    status: "completed",
    content: [
      {
        type: "diff",
        path: "/repos/lorebase/src/lore/frontmatter.ts",
        oldText: "const FENCE = '---';\nmantida\n",
        newText: "export function parseFrontmatter() {}\nmantida\n",
      },
    ],
  });

  // The one that blocks. Nothing after this line happens until the client
  // answers, which is exactly the property the e2e is checking.
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tc-bash",
    title: "Bash rm -rf node_modules/.vite",
    name: "Bash",
    kind: "execute",
    status: "pending",
    locations: [],
  });

  const outcome = await new Promise((resolve) => {
    resolvePermission = resolve;
    write({
      jsonrpc: "2.0",
      id: "perm-1",
      method: "session/request_permission",
      params: {
        sessionId: SESSION_ID,
        toolCall: {
          toolCallId: "tc-bash",
          title: "Bash rm -rf node_modules/.vite",
          rawInput: { command: "rm -rf node_modules/.vite" },
        },
        options: [
          { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
          { optionId: "no", name: "não", kind: "reject_once" },
        ],
      },
    });
  });

  const allowed = outcome?.outcome === "selected" && outcome.optionId === "allow";
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "tc-bash",
    status: allowed ? "completed" : "failed",
    content: [{ type: "content", content: { type: "text", text: allowed ? "limpo" : "recusado" } }],
  });

  await sleep(20);
  update({
    sessionUpdate: "agent_message_chunk",
    messageId: "a-2",
    content: { type: "text", text: `Pronto. Você pediu: ${text}` },
  });

  return "end_turn";
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim() === "") return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  // The answer to our own request, rather than a call to us.
  if (message.id === "perm-1" && message.result) {
    resolvePermission?.(message.result.outcome);
    resolvePermission = null;
    return;
  }

  switch (message.method) {
    case "initialize":
      reply(message.id, {
        protocolVersion: 1,
        agentCapabilities: {
          promptCapabilities: { image: false, embeddedContext: false },
          loadSession: true,
        },
        agentInfo: { name: "e2e-fake-agent", title: "Fake Agent", version: "0.0.0" },
        // Like the real adapter: it asks for nothing.
        authMethods: [],
      });
      return;

    case "session/new":
      reply(message.id, {
        sessionId: SESSION_ID,
        modes: {
          currentModeId: "auto",
          availableModes: [
            { id: "auto", name: "Auto", description: "Use a model classifier" },
            { id: "default", name: "Default", description: "Standard behavior" },
            { id: "plan", name: "Plan Mode", description: "No actual tool execution" },
          ],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "opus[1m]",
            // `value`, not `id` — the shape the real adapter sends, and the one
            // the in-process fake got wrong until a real handshake said so.
            options: [
              { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
              { value: "sonnet", name: "sonnet", description: "Sonnet 5" },
            ],
          },
        ],
      });
      return;

    case "session/prompt": {
      const text = (message.params?.prompt ?? [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      void runTurn(text).then((stopReason) => reply(message.id, { stopReason }));
      return;
    }

    case "session/cancel":
      // Unblocks a turn waiting on permission, so cancelling works even mid-ask.
      resolvePermission?.({ outcome: "cancelled" });
      resolvePermission = null;
      return;

    default:
      // A request we do not implement still needs an answer, or the client waits
      // forever. A notification needs none.
      if (message.id !== undefined) reply(message.id, {});
  }
});
