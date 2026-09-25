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

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const SESSION_ID = "e2e-acp-session";

/**
 * O perfil deste fake: `claude` (o padrão) ou `codex`.
 *
 * Por variável de ambiente, como o `LUMEM_FAKE_NO_MODES` já era: é **outro
 * adaptador**, não outro estado deste. O que o perfil `codex` muda é o que a
 * fase 0 da `second-agent` mediu contra o `codex-acp@1.10.0` — o nome que ele
 * declara, os dois métodos de login sem `type`, e um `usage_update` com
 * `used`/`size` e nada mais. Sem o atalho, provar duas conversas de dois agentes
 * de ponta a ponta exigiria um segundo arquivo com as outras 500 linhas
 * copiadas.
 */
const PROFILE = process.env["LUMEM_FAKE_PROFILE"] === "codex" ? "codex" : "claude";

/** Resolves when the client answers the permission request. */
let resolvePermission = null;
/** Resolves when the client answers `terminal/create`. */
let resolveTerminal = null;
/** Answers to `session/set_mode` and `session/set_config_option`. */
let currentMode = "auto";
let currentModel = process.env["LUMEM_FAKE_MANY_MODELS"] === "1" ? "modelo-01" : "opus[1m]";

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
 * A lista longa de modelos (`composer-menus`).
 *
 * Ligada por variável de ambiente, como o `LUMEM_FAKE_NO_MODES` já era: um
 * adaptador que oferece vinte modelos não é outro estado deste, é outro
 * adaptador. Dois modelos cabem em qualquer menu — e é por caberem que o
 * recorte da caixa do composer atravessou três features sem aparecer.
 */
const MANY_MODELS = process.env["LUMEM_FAKE_MANY_MODELS"] === "1";

/** Vinte modelos, com o último nomeado para o e2e poder pedi-lo pelo nome. */
const LONG_MODEL_LIST = Array.from({ length: 20 }, (_, index) =>
  index === 19
    ? { value: "modelo-do-fundo", name: "modelo-do-fundo", description: "o último da lista" }
    : {
        value: `modelo-${String(index + 1).padStart(2, "0")}`,
        name: `modelo-${String(index + 1).padStart(2, "0")}`,
        description: `descrição do modelo ${index + 1}`,
      },
);

/**
 * O *effort* do Claude (`033` M1): id `effort`, categoria `thought_level`.
 *
 * Atrás de `LUMEM_FAKE_EFFORT=1` porque é **medido**, não suposto — a M1 achou
 * a opção só depois de rodar o `0.75.1` de verdade, e um fake que a mostrasse
 * sempre provaria a T22 antes de ela existir. Sem a variável, este fake
 * continua sem `effort` nenhum, como sempre foi.
 */
const EFFORT = process.env["LUMEM_FAKE_EFFORT"] === "1";
let currentEffort = "medium";

/**
 * `available_commands_update` logo depois do `session/new` (`033` T22).
 *
 * O Claude de verdade manda os comandos assim — assíncrono, sem o cliente
 * pedir — e é o que a M2/M3 mediram (`~/.lumem/adapters/claude/…/acp-agent.js`,
 * `setTimeout(…, 0)`). Atrás de variável porque é **outro comportamento**, não
 * um padrão novo deste fake: o `runTurn` já manda comandos dentro do turno, e
 * os dois caminhos coexistem para os specs que precisam de um ou de outro.
 */
const COMMANDS_ON_NEW = process.env["LUMEM_FAKE_COMMANDS_ON_NEW"] === "1";

/** The selectors, in the shape the real adapter sends them. */
function configOptions() {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: MANY_MODELS
        ? LONG_MODEL_LIST
        : [
            { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
            { value: "sonnet", name: "sonnet", description: "Sonnet 5" },
          ],
    },
    ...(EFFORT
      ? [
          {
            id: "effort",
            name: "Effort",
            category: "thought_level",
            type: "select",
            currentValue: currentEffort,
            options: [
              { value: "low", name: "Low" },
              { value: "medium", name: "Medium" },
              { value: "high", name: "High" },
            ],
          },
        ]
      : []),
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

/** A primeira linha do prompt de pesquisa, como o daemon a escreve. */
const RESEARCH_OPENER = "Você é o serviço de memória de um workspace";

/**
 * Responde a pergunta com evidência — ou sem, quando o spec pede.
 *
 * A frase mágica está na própria pergunta: um spec que quer testar o caminho da
 * proposta pergunta algo com "sem evidência" no meio.
 */
async function runResearch(prompt) {
  const withEvidence = !prompt.includes("sem evidencia");
  update({
    sessionUpdate: "agent_message_chunk",
    messageId: "pesquisa",
    content: {
      type: "text",
      text: JSON.stringify({
        answer: "O loader recusa frontmatter vazio com erro nomeado.",
        memories: [
          {
            type: "project",
            name: "Frontmatter vazio no loader",
            description: "vazio é erro nomeado, não ausência",
            body: "O loader recusa frontmatter vazio com erro nomeado.",
            ...(withEvidence ? { evidence: "src/lore/loader.ts:12" } : {}),
          },
        ],
      }),
    },
  });
  await sleep(10);
  return "end_turn";
}

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

/**
 * Os três encaixes da esteira, num turno curto (`028` Parte 7 — T59).
 *
 * Ligado por variável de ambiente, como o `LUMEM_FAKE_NO_MODES` já era — e aqui
 * o motivo é mais forte que *"é outro adaptador"*: o turno roteirizado **não
 * commita**, e o e2e da Parte 2 depende disso (o portão responde *"o turno
 * acabou sem commit"*, e é o caso dele). Um fake que commitasse sempre passaria
 * aquele teste a dizer outra coisa sem ninguém ter mudado uma linha do produto.
 *
 * O que ele faz é o mínimo que o portão lê de cada papel: implementador e
 * testador **commitam de verdade** — `git` não é dublado neste repositório —, e
 * o revisor **posta o parecer** pela porta que o preâmbulo descreve.
 */
const CONVEYOR = process.env["LUMEM_FAKE_CONVEYOR"] === "1";

/** O parecer, no corpo que a porta aceita. O default é o parecer vazio. */
const REVIEW = process.env["LUMEM_FAKE_REVIEW"] ?? '{"findings":[]}';

/**
 * A porta do parecer, lida **do próprio prompt**.
 *
 * Não de uma variável de ambiente, e é de propósito: assim o caso prova que o
 * endereço e o id da sessão **chegaram ao agente pelo preâmbulo**. Foi
 * exatamente isso que faltou em produção — a porta viajava dentro do bloco de
 * memória, e um workspace sem acervo não a recebia.
 */
const DOOR = /curl -sX POST '([^']*\/findings)\?session=([^']+)'/;

/** Qual encaixe este prompt é, pela frase da missão que o daemon escreveu. */
function roleOf(text) {
  if (text.includes("poste o parecer")) return "revisor";
  if (text.includes("Implemente a tarefa abaixo")) return "implementador";
  return "testador";
}

/** Um commit de verdade no checkout em que o adaptador foi aberto. */
function commitAs(role) {
  const cwd = process.cwd();
  /*
   * O conteúdo muda a cada turno, e isso **não** é enfeite: com texto fixo, a
   * segunda passada do mesmo encaixe não teria o que commitar, o `git commit`
   * sairia com erro e o turno morreria no meio — o cartão ficaria parado com o
   * portão dizendo, corretamente, que não houve commit.
   */
  writeFileSync(join(cwd, `${role}.txt`), `${role} esteve aqui\n${new Date().toISOString()}\n`);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Lumem E2E",
    GIT_AUTHOR_EMAIL: "e2e@lumem.local",
    GIT_COMMITTER_NAME: "Lumem E2E",
    GIT_COMMITTER_EMAIL: "e2e@lumem.local",
  };
  execFileSync("git", ["add", "-A"], { cwd, env });
  execFileSync("git", ["commit", "-m", `o ${role} passou por aqui`], { cwd, env });
}

async function runConveyorTurn(text) {
  const role = roleOf(text);

  if (role === "revisor") {
    const found = DOOR.exec(text);
    if (found === null) {
      // Dito na conversa, e não engolido: sem a porta no prompt o portão vai
      // responder "o revisor não deixou parecer", e sem esta linha ninguém
      // saberia que a causa foi o preâmbulo e não o revisor.
      update({
        sessionUpdate: "agent_message_chunk",
        messageId: "esteira",
        content: { type: "text", text: "não achei a porta do parecer no prompt" },
      });
      return "end_turn";
    }
    const [, url, session] = found;
    const answer = await fetch(`${url}?session=${session}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: REVIEW,
    }).then((response) => response.text());
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "esteira",
      content: { type: "text", text: `parecer postado: ${answer.trim()}` },
    });
    return "end_turn";
  }

  /*
   * O que falhar aqui **acaba o turno mesmo assim**.
   *
   * Uma exceção solta deixaria o `session/prompt` sem resposta, e o daemon
   * esperaria os 30 minutos do teto — o sintoma de um `git` que reclamou é um
   * cartão dizendo `implementando` a manhã inteira, que não fala de git nenhum.
   */
  try {
    commitAs(role);
  } catch (error) {
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "esteira",
      content: { type: "text", text: `${role}: não deu para commitar — ${String(error)}` },
    });
    return "end_turn";
  }
  update({
    sessionUpdate: "agent_message_chunk",
    messageId: "esteira",
    content: { type: "text", text: `${role}: commitado` },
  });
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

  /*
   * Uma LEITURA que pede permissão, com caminho dentro do checkout de verdade
   * (`session-mode`, T7).
   *
   * Só no adaptador sem modos, porque é o único em que a política do Lumem vale
   * (A1). O caminho sai de `process.cwd()` e não de um literal: a regra do
   * `automático` é "dentro do checkout", e um `/repos/lorebase` fixo estaria fora
   * de qualquer checkout que o e2e cria — o pedido subiria, e o teste passaria a
   * provar o contrário do que quer.
   */
  if (process.env["LUMEM_FAKE_NO_MODES"] === "1") {
    update({
      sessionUpdate: "tool_call",
      toolCallId: "tc-ask-read",
      title: "Read README.md",
      name: "Read",
      kind: "read",
      status: "pending",
      locations: [{ path: `${process.cwd()}/README.md` }],
    });

    const readOutcome = await new Promise((resolve) => {
      resolvePermission = resolve;
      write({
        jsonrpc: "2.0",
        id: "perm-read",
        method: "session/request_permission",
        params: {
          sessionId: SESSION_ID,
          toolCall: {
            toolCallId: "tc-ask-read",
            title: "Read README.md",
            kind: "read",
            locations: [{ path: `${process.cwd()}/README.md` }],
          },
          options: [
            { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
            { optionId: "no", name: "não", kind: "reject_once" },
          ],
        },
      });
    });

    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "tc-ask-read",
      status: readOutcome?.outcome === "selected" ? "completed" : "failed",
    });
  }

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

  /*
   * Em `bypassPermissions`, **não há pedido** — é o que o modo quer dizer, e é
   * o que o adaptador de verdade faz. Com pedido, quem espera é o daemon, e numa
   * sessão de esteira não há ninguém do outro lado para responder.
   */
  const outcome = currentMode === "bypassPermissions"
    ? { outcome: "selected", optionId: "allow" }
    : await new Promise((resolve) => {
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
  update(
    PROFILE === "codex"
      ? // Medido (§4.4): `used` e `size`, sem `_meta`, sem `rateLimit` e sem
        // `cost`. O rodapé não desenha o bloco de limite, e não inventa zero.
        { sessionUpdate: "usage_update", used: 21_971, size: 258_400 }
      : {
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
        },
  );

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
  // Prefixo, e não igualdade: o turno pede permissão mais de uma vez desde a
  // `session-mode` (`perm-read` antes de `perm-1`), e casar o id exato deixava o
  // fake pendurado no primeiro pedido — o turno parava e o e2e via um cartão
  // eternamente "na fila".
  if (typeof message.id === "string" && message.id.startsWith("perm-") && message.result) {
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
        agentInfo:
          PROFILE === "codex"
            ? // O nome do **pacote**, que é o que o codex-acp manda de verdade
              // (§4.1) — e o motivo de o rótulo morar no catálogo.
              { name: "@agentclientprotocol/codex-acp", title: "Codex", version: "1.10.0" }
            : { name: "e2e-fake-agent", title: "Fake Agent", version: "0.0.0" },
        authMethods:
          PROFILE === "codex"
            ? // Nenhum é `type: "terminal"`: é a medição que tirou a escolha de
              // agente do primeiro acesso (§4.2, C3).
              [
                { id: "api-key", name: "API Key", description: "Use an API key to authenticate" },
                { id: "chat-gpt", name: "ChatGPT", description: "Use ChatGPT to authenticate" },
              ]
            : // Like the real adapter: it asks for nothing.
              [],
      });
      return;

    case "session/new":
      /*
       * Um adaptador que **não relata modos** (`session-mode`).
       *
       * Ligado por variável de ambiente porque é um adaptador diferente, não um
       * estado deste: `configOptions` vazio e `modes` nulo é o que faz o composer
       * ficar mudo, e é o caso inteiro da feature. Sem este atalho, provar a
       * pílula do Lumem de ponta a ponta exigiria um segundo arquivo de fake com
       * as outras 400 linhas copiadas.
       */
      if (process.env["LUMEM_FAKE_NO_MODES"] === "1") {
        reply(message.id, { sessionId: SESSION_ID, modes: null, configOptions: [] });
        return;
      }
      reply(message.id, {
        sessionId: SESSION_ID,
        modes: {
          currentModeId: currentMode,
          availableModes: [
            { id: "auto", name: "Auto", description: "Use a model classifier" },
            { id: "default", name: "Default", description: "Standard behavior" },
            { id: "plan", name: "Plan Mode", description: "No actual tool execution" },
            // O modo que **não pergunta**, como o adaptador de verdade tem: a
            // Q43 mediu que dos cinco do Claude só ele fecha o laço, e a esteira
            // o escolhe pela `spec`. Sem ele aqui, o e2e da esteira só poderia
            // provar o caminho do teto de tempo — nunca o do cartão que anda.
            { id: "bypassPermissions", name: "Bypass", description: "Bypass all permission checks" },
          ],
        },
        // `value`, not `id` — the shape the real adapter sends, and the one the
        // in-process fake got wrong until a real handshake said so.
        configOptions: configOptions(),
      });
      // O Claude de verdade manda os comandos por notificação, depois da
      // resposta do `session/new` — nunca dentro dela (M2/M3). `setTimeout(0)`
      // e não síncrono: a resposta tem que chegar primeiro, ou o cliente veria
      // uma notificação para uma sessão que ele ainda não sabe que existe.
      if (COMMANDS_ON_NEW) {
        setTimeout(() => {
          update({
            sessionUpdate: "available_commands_update",
            availableCommands: [
              { name: "gate", description: "roda o gate declarado pela task" },
              { name: "compact", description: "comprime a conversa", input: { hint: "quanto" } },
            ],
          });
        }, 0);
      }
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
            // O modo que **não pergunta**, como o adaptador de verdade tem: a
            // Q43 mediu que dos cinco do Claude só ele fecha o laço, e a esteira
            // o escolhe pela `spec`. Sem ele aqui, o e2e da esteira só poderia
            // provar o caminho do teto de tempo — nunca o do cartão que anda.
            { id: "bypassPermissions", name: "Bypass", description: "Bypass all permission checks" },
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
      // O auto-learn (PR 08) pergunta como serviço de memória, e responde-se com
      // JSON. Mesmo motivo do eco e da destilação: o turno roteirizado trava em
      // permissão, e não há ninguém para responder.
      if (text.startsWith(RESEARCH_OPENER)) {
        void runResearch(text).then((stopReason) => reply(message.id, { stopReason }));
        return;
      }
      if (text.startsWith(DISTILL_OPENER)) {
        void runDistill().then((stopReason) => reply(message.id, { stopReason }));
        return;
      }
      if (text.includes(ECHO)) {
        void runEcho(blocks).then((stopReason) => reply(message.id, { stopReason }));
        return;
      }
      // O turno da esteira, quando o spec o ligou. Antes do roteirizado pelo
      // mesmo motivo dos três acima: o roteiro pede terminal e permissão, e o
      // que este caso mede é o portão — commit e parecer.
      if (CONVEYOR) {
        void runConveyorTurn(text).then((stopReason) => reply(message.id, { stopReason }));
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
      if (message.params?.configId === "effort") currentEffort = message.params.value;
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
