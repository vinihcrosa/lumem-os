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
 * The protocol surface needed here is small enough to read in one sitting.
 *
 * It also answers `session/load`, which is what lets the resume spec restart the
 * daemon and continue yesterday's conversation — still without calling a model.
 *
 * It never calls a model, so the e2e spends nothing. What it does do is act out one
 * turn using every shape the conversation renders: a thought, a streamed message, a
 * tool call that finishes, a write whose diff the card paints, a permission request
 * that blocks until answered, a plan it reissues as it advances, the commands it
 * offers, a terminal it asks the *client* to open, and what the turn cost.
 */

import { createInterface } from "node:readline";

const SESSION_ID = "e2e-acp-session";

/** Resolves when the client answers the permission request. */
let resolvePermission = null;
/** Resolves when the client answers `terminal/create`. */
let resolveTerminal = null;
/** Answers to `session/set_mode` and `session/set_config_option`. */
let currentMode = "auto";
let currentModel = "opus[1m]";

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

/** The selectors, in the shape the real adapter sends them. */
function configOptions() {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: [
        { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
        { value: "sonnet", name: "sonnet", description: "Sonnet 5" },
      ],
    },
  ];
}

/**
 * The turn the e2e reads.
 *
 * Paced with small delays so the streaming is observable: without them every chunk
 * lands in one frame and the test cannot tell a stream from a single message.
 */
/** A frase que pede o eco. Combinada com o spec, e com mais nada. */
const ECHO = "eco do que recebeu";

/** A primeira linha do prompt de destilação, como o daemon a escreve. */
const DISTILL_OPENER = "Uma sessão de trabalho terminou.";

/** Um candidato de memória, no formato que o destilador valida. */
async function runDistill() {
  update({
    sessionUpdate: "agent_message_chunk",
    messageId: "destilacao",
    content: {
      type: "text",
      text: JSON.stringify({
        memories: [
          {
            type: "process",
            name: "O frontmatter deste repo",
            description: "frontmatter vazio é erro, não ausência",
            body: "Frontmatter vazio quebra o loader: trate como erro nomeado.",
            evidence: "src/lore/loader.ts:1",
          },
        ],
      }),
    },
  });
  await sleep(10);
  return "end_turn";
}

/**
 * Repete o que chegou, bloco por bloco.
 *
 * Numerado de propósito: o que o teste precisa saber não é só o texto, é
 * **quantos blocos** vieram e em que ordem — o núcleo entra como bloco separado
 * antes da mensagem da pessoa, e concatenado isso é indistinguível de um texto
 * que alguém colou na mensagem.
 */
async function runEcho(blocks) {
  for (const [index, block] of blocks.entries()) {
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "eco",
      content: { type: "text", text: `[bloco ${index + 1}] ${block}\n` },
    });
    await sleep(10);
  }
  return "end_turn";
}

async function runTurn(text) {
  // The plan, reissued whole as it advances — which is what the card's "one card
  // that rewrites itself" has to survive.
  update({
    sessionUpdate: "plan",
    entries: [
      { content: "ler o loader", status: "in_progress", priority: "high" },
      { content: "extrair o parser", status: "pending", priority: "medium" },
    ],
  });

  update({
    sessionUpdate: "available_commands_update",
    availableCommands: [
      { name: "gate", description: "roda o gate declarado pela task" },
      { name: "compact", description: "comprime a conversa", input: { hint: "quanto" } },
    ],
  });

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

  // A terminal the agent asks the *client* for. The card embeds the xterm against
  // the PTY session the daemon opens for it (D7).
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tc-term",
    title: "Bash echo do-agente",
    name: "Bash",
    kind: "execute",
    status: "in_progress",
    locations: [],
  });

  const terminal = await new Promise((resolve) => {
    resolveTerminal = resolve;
    write({
      jsonrpc: "2.0",
      id: "term-1",
      method: "terminal/create",
      params: {
        sessionId: SESSION_ID,
        command: "sh",
        args: ["-c", "echo saida-do-terminal; sleep 30"],
      },
    });
  });

  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "tc-term",
    status: terminal ? "in_progress" : "failed",
    content: terminal
      ? [{ type: "terminal", terminalId: terminal.terminalId }]
      : [{ type: "content", content: { type: "text", text: "o cliente recusou o terminal" } }],
  });

  // The plan advances, and the card has to rewrite rather than accumulate.
  update({
    sessionUpdate: "plan",
    entries: [
      { content: "ler o loader", status: "completed", priority: "high" },
      { content: "extrair o parser", status: "in_progress", priority: "medium" },
    ],
  });

  // What the turn cost, with the subscription's own limit attached — the block the
  // spike found and the reason `/usage` is unnecessary.
  update({
    sessionUpdate: "usage_update",
    used: 39_200,
    size: 1_000_000,
    cost: { amount: 0.235433, currency: "USD" },
    _meta: {
      "_claude/rateLimit": {
        rateLimitType: "seven_day",
        utilization: 0.31,
        isUsingOverage: false,
        surpassedThreshold: 0.75,
      },
    },
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

  // The answer to one of our own requests, rather than a call to us.
  if (message.id === "perm-1" && message.result) {
    resolvePermission?.(message.result.outcome);
    resolvePermission = null;
    return;
  }
  if (message.id === "term-1") {
    /*
     * Resolved on an error too, with nothing.
     *
     * A fake that only reacted to `result` hung forever when the client refused —
     * and a hanging agent shows up as a turn that never ends, which points at the
     * conversation rather than at the refusal that caused it. It cost exactly that
     * confusion once.
     */
    resolveTerminal?.(message.result ?? null);
    resolveTerminal = null;
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
          currentModeId: currentMode,
          availableModes: [
            { id: "auto", name: "Auto", description: "Use a model classifier" },
            { id: "default", name: "Default", description: "Standard behavior" },
            { id: "plan", name: "Plan Mode", description: "No actual tool execution" },
          ],
        },
        // `value`, not `id` — the shape the real adapter sends, and the one the
        // in-process fake got wrong until a real handshake said so.
        configOptions: configOptions(),
      });
      return;

    /*
     * Retomar (F5.2). Um adaptador de verdade re-transmite a conversa inteira
     * enquanto responde, e é isso que a linha abaixo faz — de propósito, para o e2e
     * poder afirmar que o daemon **descarta** essa cópia (D14). Se ela aparecesse na
     * tela, a conversa apareceria duas vezes.
     */
    case "session/load":
      update({
        sessionUpdate: "agent_message_chunk",
        messageId: "replay-1",
        content: { type: "text", text: "replay-do-adaptador" },
      });
      reply(message.id, {
        modes: {
          currentModeId: currentMode,
          availableModes: [
            { id: "auto", name: "Auto", description: "Use a model classifier" },
            { id: "default", name: "Default", description: "Standard behavior" },
            { id: "plan", name: "Plan Mode", description: "No actual tool execution" },
          ],
        },
        configOptions: configOptions(),
      });
      return;

    case "session/prompt": {
      const blocks = (message.params?.prompt ?? []).map((block) =>
        block.type === "text" ? block.text : "",
      );
      const text = blocks.join("");
      // O eco existe por um teste só, e é o único que ele pode provar: que o
      // núcleo da memória **atravessou o protocolo**. Ver o evento na conversa
      // prova que o daemon montou o bloco; só o agente repetindo o que recebeu
      // prova que ele chegou do outro lado. Sai antes do turno roteirizado
      // porque o roteiro pede permissão e trava — e este teste não é sobre isso.
      // A destilação (PR 07) pergunta sobre a sessão que terminou, e responde-se
      // com JSON. Antes do turno roteirizado, que pede permissão e trava — não
      // há ninguém para responder permissão numa destilação.
      if (text.startsWith(DISTILL_OPENER)) {
        void runDistill().then((stopReason) => reply(message.id, { stopReason }));
        return;
      }
      if (text.includes(ECHO)) {
        void runEcho(blocks).then((stopReason) => reply(message.id, { stopReason }));
        return;
      }
      void runTurn(text).then((stopReason) => reply(message.id, { stopReason }));
      return;
    }

    case "session/set_mode":
      currentMode = message.params?.modeId ?? currentMode;
      reply(message.id, {});
      // Reported back as the protocol does, so the pill follows the agent and not
      // the click.
      update({ sessionUpdate: "current_mode_update", currentModeId: currentMode });
      return;

    case "session/set_config_option":
      if (message.params?.configId === "model") currentModel = message.params.value;
      reply(message.id, { configOptions: configOptions() });
      return;

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
