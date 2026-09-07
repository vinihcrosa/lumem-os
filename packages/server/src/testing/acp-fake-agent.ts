import {
  AgentSideConnection,
  ndJsonStream,
  type Agent,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type RequestPermissionOutcome,
  type RequestPermissionRequest,
  type SessionConfigOption,
  type SessionModeState,
  type SessionNotification,
  type SessionUpdate,
  type StopReason,
  type CreateTerminalRequest,
  type TerminalHandle,
} from "@agentclientprotocol/sdk";

import type { AcpProcess } from "../acp/process.js";

/**
 * An agent on the other side of the pipe that costs nothing to run.
 *
 * §8 of the PRD: the transport is testable without an LLM. This is what makes
 * that true, and it is built on the SDK's own `AgentSideConnection` rather than
 * on hand-rolled JSON-RPC — so the wire between the two halves is the real
 * newline-delimited protocol, and the fake cannot drift into speaking a dialect
 * the adapter does not.
 *
 * It is in-process. The streams are `TransformStream`s instead of a child's
 * stdio, which keeps the whole suite free of process startup and makes ordering
 * deterministic. What that deliberately does *not* cover is spawning, killing
 * and exit codes — `acp-fake-agent.mjs` is the same agent as a real subprocess,
 * used by the handful of tests that are about the process itself.
 */

/** What the script can do while a turn is in flight. */
export interface FakeAgentTurn {
  /** Push a `session/update` notification. */
  update(update: SessionUpdate): Promise<void>;
  /** Ask for permission and wait for the answer, exactly as an agent would. */
  requestPermission(
    request: Omit<RequestPermissionRequest, "sessionId">,
  ): Promise<RequestPermissionOutcome>;
  /** Asks the client to read a file, as the agent would. */
  readFile(path: string, window?: { line?: number; limit?: number }): Promise<string>;
  /** Asks the client to write a file. */
  writeFile(path: string, content: string): Promise<void>;
  /** Asks the client for a terminal, as `terminal/create` does. */
  createTerminal(command: string, args?: string[]): Promise<TerminalHandle>;
  /** Resolves when the client sends `session/cancel`. */
  readonly cancelled: Promise<void>;
}

/** O que o `authenticate` do script pode fazer enquanto ninguém respondeu. */
export interface FakeAgentLogin {
  /** A chave que o cliente mandou em `_meta["api-key"]`, se mandou. */
  readonly apiKey: string | undefined;
  /**
   * Pede ao cliente que mostre uma URL, e espera a resposta.
   *
   * É o `elicitation/create` do protocolo, no modo `url`. O código vai **dentro
   * da mensagem**, porque é onde o adaptador de verdade o põe.
   */
  elicitUrl(input: { url: string; message: string; elicitationId?: string }): Promise<string>;
  /** Avisa que aquela URL já foi usada — `elicitation/complete`. */
  completeElicitation(elicitationId: string): Promise<void>;
}

export interface FakeAgentScript {
  /** Answers `session/set_mode`. Throw to refuse, as a real agent may. */
  setMode?(modeId: string): void;
  /**
   * Answers `authenticate` (`second-agent`, T10).
   *
   * `login` é o que faz este agente parecer com um de verdade nos dois casos que
   * importam: o que **pede uma URL** antes de responder, e o que recusa. Lançar
   * é recusar, com a frase do agente; resolver é ter entrado.
   */
  authenticate?(methodId: string, login: FakeAgentLogin): Promise<void> | void;
  /**
   * Answers `session/set_config_option` with the whole set, as the protocol says.
   *
   * Returning a different value than asked is the case worth exercising: an agent
   * that adjusts `sonnet` to `sonnet[1m]` is reporting what is actually in effect.
   */
  setConfigOption?(configId: string, value: string | boolean): SessionConfigOption[] | void;
  /** Overrides the handshake response. Return nothing to keep the default. */
  initialize?(params: InitializeRequest): Partial<InitializeResponse> | void;
  /** Throw to make the handshake fail, as a broken adapter would. */
  newSession?(params: NewSessionRequest): Partial<NewSessionResponse> | void;
  /**
   * Answers `session/load` (F5.2).
   *
   * `replay` is what a real adapter does while answering: it re-streams the
   * conversation as `session/update` notifications before the response lands. A
   * script that uses it is asking whether the daemon throws that copy away (D14).
   */
  loadSession?(
    params: LoadSessionRequest,
    replay: (update: SessionUpdate) => Promise<void>,
  ): Promise<Partial<LoadSessionResponse> | void> | Partial<LoadSessionResponse> | void;
  /**
   * The whole turn. Whatever it resolves to becomes the stop reason.
   *
   * `Promise<StopReason>` rather than `MaybePromise<StopReason>`: a union return
   * type defeats contextual typing, so every `async prompt() { return
   * "end_turn" }` in every test widened to `Promise<string>` and had to be
   * annotated by hand. Every script here is async anyway.
   */
  prompt?(text: string, turn: FakeAgentTurn): Promise<StopReason>;
}

const DEFAULT_SESSION_ID = "fake-acp-session";

/** The five modes and five models the real adapter reported in the spike. */
export const FAKE_MODES: SessionModeState = {
  currentModeId: "default",
  availableModes: [
    { id: "auto", name: "Auto", description: "Use a model classifier to approve/deny prompts" },
    { id: "default", name: "Default", description: "Standard behavior" },
    { id: "acceptEdits", name: "Accept Edits", description: "Auto-accept file edit operations" },
    { id: "plan", name: "Plan Mode", description: "Planning mode, no actual tool execution" },
    { id: "bypassPermissions", name: "Bypass", description: "Bypass all permission checks" },
  ],
};

/**
 * The model select, in the shape the real adapter actually sends.
 *
 * `value`, not `id`. The first version of this fixture used `id`, the code under
 * test read `id`, and both were wrong together — which is the failure mode a
 * fake has that a real process does not. Only
 * `AcpManager.integration.test.ts` caught it.
 */
export const FAKE_CONFIG_OPTIONS = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "opus[1m]",
    options: [
      { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M context" },
      { value: "sonnet", name: "sonnet", description: "Sonnet 5" },
    ],
  },
] as unknown as SessionConfigOption[];

/** The same select, grouped — the other shape the protocol allows. */
export const FAKE_GROUPED_CONFIG_OPTIONS = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "opus[1m]",
    options: [
      {
        group: "claude",
        name: "Claude",
        options: [
          { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M context" },
          { value: "sonnet", name: "sonnet", description: "Sonnet 5" },
        ],
      },
      {
        group: "outros",
        name: "Outros",
        options: [{ value: "haiku", name: "haiku", description: "Haiku 4.5" }],
      },
    ],
  },
] as unknown as SessionConfigOption[];

/**
 * Os modos do Codex, como ele os reporta — três, e o do meio é o corrente.
 *
 * Medidos na fase 0 da `second-agent` (§4.3). O que importa aqui não é o nome:
 * é que o `read-only` dele se chama *"Ask for approval"* e significa **arquivo
 * externo e internet**, não *tudo*. Um teste que trate esse modo como "pergunta
 * antes de escrever" está testando o Claude com outro rótulo.
 */
export const FAKE_CODEX_MODES: SessionModeState = {
  currentModeId: "agent",
  availableModes: [
    { id: "read-only", name: "Ask for approval", description: "Always ask to edit external files" },
    { id: "agent", name: "Approve for me", description: "Only ask for potentially unsafe actions" },
    { id: "agent-full-access", name: "Full access", description: "Unrestricted access" },
  ],
};

/**
 * Os cinco seletores do Codex, com as três categorias que nenhuma tela viu.
 *
 * `mode` aparece **aqui e em `modes`** — é o que faz dele o primeiro agente em
 * que a opção de modo e o modo são a mesma coisa, e o que quebrou o
 * `currentValue` da opção quando se trocava de modo (§4.9).
 */
export const FAKE_CODEX_CONFIG_OPTIONS = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select" as const,
    currentValue: "agent",
    options: [
      { value: "read-only", name: "Ask for approval" },
      { value: "agent", name: "Approve for me" },
      { value: "agent-full-access", name: "Full access" },
    ],
  },
  {
    id: "collaboration_mode",
    name: "Collaboration mode",
    category: "collaboration_mode",
    type: "select" as const,
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan", description: "Plan before making changes" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "gpt-5.5",
    options: [
      { value: "gpt-5.5", name: "GPT-5.5" },
      { value: "gpt-5.4-mini", name: "GPT-5.4-Mini" },
    ],
  },
  {
    id: "reasoning_effort",
    name: "Reasoning effort",
    category: "thought_level",
    type: "select" as const,
    currentValue: "medium",
    options: [
      { value: "low", name: "Low" },
      { value: "medium", name: "Medium" },
      { value: "high", name: "High" },
    ],
  },
  {
    id: "fast-mode",
    name: "Fast mode",
    category: "model_config",
    type: "select" as const,
    currentValue: "off",
    options: [
      { value: "off", name: "Off" },
      { value: "on", name: "On" },
    ],
  },
] as unknown as SessionConfigOption[];

/** Os métodos de login do Codex: nenhum deles é `type: "terminal"`. */
export const FAKE_CODEX_AUTH_METHODS = [
  {
    id: "api-key",
    name: "API Key",
    description: "Use an API key to authenticate",
    _meta: { "api-key": { provider: "openai" } },
  },
  { id: "chat-gpt", name: "ChatGPT", description: "Use ChatGPT to authenticate" },
] as unknown as InitializeResponse["authMethods"];

/**
 * O método que só existe para quem sabe mostrar uma URL.
 *
 * Medido (§4.2 da `second-agent`): o `getCodexAuthMethods` do adaptador só
 * acrescenta `chat-gpt-device-code` quando `clientCapabilities.elicitation.url`
 * está declarado. O perfil modela essa regra em vez de oferecer os três sempre —
 * é ela que faz um daemon que **para** de declarar a capacidade perder o método,
 * e é o único método que não abre navegador na máquina do daemon.
 */
export const FAKE_CODEX_DEVICE_CODE_METHOD = {
  id: "chat-gpt-device-code",
  name: "ChatGPT (device code)",
  description: "Sign in by opening a verification page and entering a one-time code",
} as unknown as NonNullable<InitializeResponse["authMethods"]>[number];

export interface CodexLikeOptions {
  /** `false` derruba `loadSession` — o caso que o Codex **não** é (§4.6). */
  loadSession?: boolean;
  /** `false` faz o turno não reportar consumo nenhum. Nunca zero: nada (C4). */
  usage?: boolean;
}

/**
 * O perfil "codex-like" do agente falso.
 *
 * Não é um agente novo: é este agente respondendo como o Codex respondeu na fase
 * 0 (§4 da `second-agent`), e existe para **fixar** o que foi medido — porque o
 * que foi medido é que o daemon já aguentava, e o que já passa sem teste é o que
 * volta a quebrar.
 *
 * As quatro diferenças que ele carrega, cada uma com o número que a mediu:
 *
 * 1. `usage_update` com `used`/`size` e **sem** `_meta` — nada de `rateLimit`,
 *    nada de `cost` (§4.4);
 * 2. `availableCommands` **só por notificação**, e depois do primeiro prompt: a
 *    resposta do `session/new` não os traz (§4.3);
 * 3. `mode` nas duas listas, com as categorias que o Lumem nunca viu (§4.3);
 * 4. os métodos de login sem `type`, que é o que tirou a escolha de agente do
 *    primeiro acesso (§4.2, C3).
 *
 * O que ele **não** faz, e é medição também: não pede `fs/*`, não pede
 * `terminal/*` e não pede permissão. Um teste que queira esses caminhos usa o
 * perfil do Claude, que é o agente que os usa.
 */
/** O cliente declarou `elicitation.url`? É o que decide o método de código. */
function hasUrlElicitation(params: InitializeRequest): boolean {
  const capabilities = params.clientCapabilities as unknown as
    | { elicitation?: { url?: unknown } | null }
    | undefined;
  return capabilities?.elicitation?.url != null;
}

export function codexLikeScript({
  loadSession = true,
  usage = true,
}: CodexLikeOptions = {}): FakeAgentScript {
  return {
    initialize: (params) => ({
      agentInfo: {
        // O nome do **pacote**, que é o que ele manda de verdade — e o motivo de
        // o rótulo morar no catálogo e não no protocolo (§4.1).
        name: "@agentclientprotocol/codex-acp",
        title: "Codex",
        version: "1.10.0",
      },
      agentCapabilities: {
        promptCapabilities: { image: true, embeddedContext: true },
        loadSession,
      },
      authMethods: [
        ...(FAKE_CODEX_AUTH_METHODS ?? []),
        // A regra medida: o método de código aparece porque o cliente disse que
        // sabe mostrar uma URL.
        ...(hasUrlElicitation(params) ? [FAKE_CODEX_DEVICE_CODE_METHOD] : []),
      ],
    }),

    newSession: () => ({
      sessionId: "fake-codex-session",
      modes: FAKE_CODEX_MODES,
      configOptions: FAKE_CODEX_CONFIG_OPTIONS,
    }),

    prompt: async (text, turn) => {
      // Primeiro os comandos, como ele faz: quem exigir `availableCommands` na
      // resposta do `session/new` fica com o menu de `/` vazio.
      await turn.update({
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "plan", description: "Turn plan mode on." },
          { name: "review", description: "Review uncommitted changes.", input: { hint: "instruções" } },
        ],
      } as SessionUpdate);

      await turn.update({
        sessionUpdate: "agent_message_chunk",
        messageId: "codex-1",
        content: { type: "text", text: `ok: ${text}` },
      } as SessionUpdate);

      if (usage) {
        await turn.update({
          sessionUpdate: "usage_update",
          used: 21_971,
          size: 258_400,
        } as SessionUpdate);
      }

      // O que ele manda e o Lumem ignora por nome — a lista `IGNORED` do
      // `translate.ts`. Aqui para que "ignorado" seja testado, e não suposto.
      await turn.update({
        sessionUpdate: "session_info_update",
        title: text.slice(0, 40),
      } as SessionUpdate);

      return "end_turn";
    },
  };
}

export interface FakeAgentHandle {
  /** Hand this to `AcpManager` in place of a real spawner. */
  readonly process: AcpProcess;
  /** Resolves once the fake has been asked to shut down. */
  readonly killed: Promise<void>;
  /**
   * Writes a JSON-RPC message straight onto the wire, unvalidated.
   *
   * The escape hatch exists because the SDK validates `session/update` on the
   * way *out*, so a fake built on `AgentSideConnection` physically cannot emit a
   * variant the current schema does not know. That is good news about the SDK
   * and useless for testing D3: the whole point is what happens when a future
   * adapter sends a field this daemon has never seen. Only a raw line can pose
   * that question.
   */
  sendRaw(message: unknown): Promise<void>;
  /**
   * Os blocos de cada `session/prompt`, crus.
   *
   * O `script.prompt` recebe o texto já concatenado, o que é o que quase todo
   * teste quer. Um não quer: o núcleo da memória entra como **bloco separado**,
   * e concatenado os dois casos são indistinguíveis.
   */
  readonly promptBlocks: readonly (readonly string[])[];
}

/**
 * A fake agent wired to a pair of in-memory streams.
 *
 * The returned `process` satisfies the same seam a child process does, so
 * `AcpManager` cannot tell the difference — which is the point: a test double
 * the code under test can detect is a test of the double.
 */
export function fakeAgentProcess(script: FakeAgentScript = {}): FakeAgentHandle {
  const promptBlocks: string[][] = [];
  // Two pipes: what the client writes, and what the agent writes back.
  const toAgent = new TransformStream<Uint8Array, Uint8Array>();
  const fromAgent = new TransformStream<Uint8Array, Uint8Array>();

  let resolveExit: (value: { exitCode: number | null; signal: string | null }) => void = () => {};
  const exited = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    resolveExit = resolve;
  });
  let resolveKilled: () => void = () => {};
  const killed = new Promise<void>((resolve) => {
    resolveKilled = resolve;
  });

  let cancelTurn: () => void = () => {};

  const agent = (conn: AgentSideConnection): Agent => ({
    initialize(params) {
      const base: InitializeResponse = {
        protocolVersion: 1,
        agentCapabilities: {
          promptCapabilities: { image: true, embeddedContext: true },
          loadSession: true,
        },
        agentInfo: { name: "fake-agent", title: "Fake Agent", version: "0.0.0" },
        // Empty, like the real adapter: it uses the local Claude Code
        // credential and asks for nothing (§2.1 of the PRD).
        authMethods: [],
      };
      return { ...base, ...(script.initialize?.(params) ?? {}) };
    },

    newSession(params) {
      const extra = script.newSession?.(params) ?? {};
      return {
        sessionId: DEFAULT_SESSION_ID,
        modes: FAKE_MODES,
        configOptions: FAKE_CONFIG_OPTIONS,
        ...extra,
      };
    },

    async loadSession(params) {
      const extra =
        (await script.loadSession?.(params, (update) =>
          conn.sessionUpdate({ sessionId: params.sessionId, update } as SessionNotification),
        )) ?? {};
      return { modes: FAKE_MODES, configOptions: FAKE_CONFIG_OPTIONS, ...extra };
    },

    async prompt(params) {
      promptBlocks.push(params.prompt.map((block) => (block.type === "text" ? block.text : "")));
      const text = params.prompt
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");

      const cancelled = new Promise<void>((resolve) => {
        cancelTurn = resolve;
      });

      const turn: FakeAgentTurn = {
        update: (update) =>
          conn.sessionUpdate({ sessionId: params.sessionId, update } as SessionNotification),
        requestPermission: async (request) => {
          const response = await conn.requestPermission({
            ...request,
            sessionId: params.sessionId,
          } as RequestPermissionRequest);
          return response.outcome;
        },
        readFile: async (path, window) => {
          const response = await conn.readTextFile({
            sessionId: params.sessionId,
            path,
            ...(window?.line === undefined ? {} : { line: window.line }),
            ...(window?.limit === undefined ? {} : { limit: window.limit }),
          });
          return response.content;
        },
        writeFile: async (path, content) => {
          await conn.writeTextFile({ sessionId: params.sessionId, path, content });
        },
        createTerminal: (command, args) =>
          conn.createTerminal({
            sessionId: params.sessionId,
            command,
            ...(args ? { args } : {}),
          } as CreateTerminalRequest),
        cancelled,
      };

      const stopReason = script.prompt
        ? await script.prompt(text, turn)
        : ("end_turn" as StopReason);
      return { stopReason };
    },

    setSessionMode(params) {
      script.setMode?.(params.modeId);
      return {};
    },

    setSessionConfigOption(params) {
      const chosen = script.setConfigOption?.(
        params.configId,
        (params as { value: string | boolean }).value,
      );
      return { configOptions: chosen ?? FAKE_CONFIG_OPTIONS };
    },

    /** Lets a script push a mid-turn change the client did not ask for. */
    cancel() {
      cancelTurn();
    },

    async authenticate(params) {
      if (script.authenticate === undefined) return {};

      const meta = params._meta as
        | { "api-key"?: { apiKey?: unknown } | undefined }
        | null
        | undefined;
      const apiKey = meta?.["api-key"]?.apiKey;

      await script.authenticate(params.methodId, {
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        elicitUrl: async ({ url, message, elicitationId = "elicit-1" }) => {
          /*
           * `sessionId` vai junto, e é a armadilha desta parte do protocolo.
           *
           * O `CreateElicitationRequest` exige um **escopo** — `sessionId` ou
           * `requestId` — e o SDK valida a requisição na saída. Sem ele o pedido
           * é recusado antes de chegar ao cliente, e o sintoma é uma tela que
           * nunca mostra a URL, sem erro nenhum em lugar nenhum. É o que o
           * adaptador de verdade manda (`sessionId: params.threadId`).
           */
          const response = await conn.unstable_createElicitation({
            mode: "url",
            sessionId: DEFAULT_SESSION_ID,
            elicitationId,
            url,
            message,
          } as never);
          return response.action;
        },
        completeElicitation: (elicitationId) =>
          conn.unstable_completeElicitation({ elicitationId } as never),
      });

      return {};
    },
  });

  // One writer, two producers. `ndJsonStream` locks whatever writable it is
  // given, and `pipeTo` locks its destination, so neither can be shared — the
  // way to let the SDK and `sendRaw` use the same pipe is to hold the writer
  // here and hand the SDK a writable that forwards into it.
  const out = fromAgent.writable.getWriter();
  const sdkWritable = new WritableStream<Uint8Array>({
    write: (chunk) => out.write(chunk),
  });

  new AgentSideConnection(agent, ndJsonStream(sdkWritable, toAgent.readable));

  return {
    process: {
      stdin: toAgent.writable,
      stdout: fromAgent.readable,
      exited,
      kill() {
        resolveKilled();
        // A real adapter closes its streams and exits 0 on SIGTERM.
        resolveExit({ exitCode: 0, signal: null });
      },
    },
    killed,
    sendRaw: (message) => out.write(new TextEncoder().encode(`${JSON.stringify(message)}\n`)),
    promptBlocks,
  };
}
