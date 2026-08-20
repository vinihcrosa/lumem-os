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

export interface FakeAgentScript {
  /** Answers `session/set_mode`. Throw to refuse, as a real agent may. */
  setMode?(modeId: string): void;
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

    authenticate() {
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
