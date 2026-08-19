import {
  client,
  ndJsonStream,
  type ClientConnection,
  type RequestPermissionOutcome,
  type RequestPermissionResponse,
  type StopReason,
  type ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import { newId, type AcpEvent } from "@lumem/shared";

import type { FastifyBaseLogger } from "fastify";

import { DomainError } from "../errors.js";
import { spawnAcpProcess, type AcpProcess, type AcpProcessSpawner } from "./process.js";
import { translateSessionUpdate } from "./translate.js";
import { sniffUnknownUpdates } from "./unknown-updates.js";

/** The protocol version this daemon was written against. */
export const ACP_PROTOCOL_VERSION = 1;

/** What the daemon calls itself in the handshake. */
const LUMEM_CLIENT_VERSION = "0.1.0";

/** How long the handshake may take before it is called a failure. */
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;

export type AcpSessionState = "running" | "exited";

export interface AcpSpawnOptions {
  command: string;
  args?: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
  /**
   * The pinned adapter version (A12).
   *
   * Carried for the error message alone: it is what turns "not installed" into a
   * sentence with the command that fixes it (F1.6).
   */
  adapterVersion?: string;
}

export interface AcpChoice {
  id: string;
  name: string;
  /** The agent's own words, kept verbatim (A13). */
  description?: string | null;
}

export interface AcpSessionInfo {
  id: string;
  /** The adapter's own session id — what `session/load` will need (F5.2). */
  acpSessionId: string;
  command: string;
  args: readonly string[];
  cwd: string;
  state: AcpSessionState;
  exitCode: number | null;
  mode: string;
  model: string;
  availableModes: readonly AcpChoice[];
  availableModels: readonly AcpChoice[];
}

export type AcpEventListener = (event: AcpEvent) => void;
export type AcpExitWatcher = (info: AcpSessionInfo) => void;

interface PendingPermission {
  resolve(outcome: RequestPermissionOutcome): void;
}

interface Session {
  info: AcpSessionInfo;
  process: AcpProcess;
  connection: ClientConnection;
  /**
   * Every event this session has produced, in order.
   *
   * Held so an attaching client can be brought up to date in one frame — the
   * same promise the PTY endpoint makes with its scrollback. It grows without a
   * ceiling for now; F5.4 moves it to a database per session, with compression
   * past thirty days, and that is where a bound belongs.
   */
  transcript: AcpEvent[];
  listeners: Set<AcpEventListener>;
  /** Calls still open, so a cancelled turn can close them (A14). */
  openToolCalls: Set<string>;
  pendingPermissions: Map<string, PendingPermission>;
  /** One id per turn, for chunks the agent sends without a message id. */
  turnId: string;
}

export interface AcpManagerOptions {
  spawner?: AcpProcessSpawner;
  handshakeTimeoutMs?: number;
  /**
   * Where an unrecognised event goes.
   *
   * "Ignored with a log, never thrown" (D3) needs somewhere for the log to
   * land, and a `console.warn` in a daemon is a message nobody reads.
   */
  log?: Pick<FastifyBaseLogger, "warn">;
}

/**
 * Owns every ACP agent the daemon has launched.
 *
 * The `PtyManager`'s sibling, and deliberately its shape: sessions live here
 * rather than on a connection, because closing the browser must not end the
 * conversation. Clients attach and detach; the agent does not notice.
 *
 * What differs is what crosses the boundary. The PTY forwards bytes and knows
 * nothing about them. This forwards *events*, which means it is also the only
 * place that understands ACP — the translation, the fifth card state, and the
 * decision to ignore an unrecognised update rather than throw all live here so
 * that nothing downstream has to.
 */
export class AcpManager {
  private readonly sessions = new Map<string, Session>();
  private readonly exitWatchers = new Set<AcpExitWatcher>();
  private readonly spawner: AcpProcessSpawner;
  private readonly handshakeTimeoutMs: number;
  private readonly log: Pick<FastifyBaseLogger, "warn"> | undefined;

  constructor({
    spawner = spawnAcpProcess,
    handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
    log,
  }: AcpManagerOptions = {}) {
    this.spawner = spawner;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.log = log;
  }

  /**
   * Launches the adapter and completes the handshake.
   *
   * Async, unlike `PtyManager.spawn`: a PTY is usable the moment it exists,
   * while an ACP session does not exist until `initialize` and `session/new`
   * have both answered. Returning early would hand back a session id that no
   * prompt could use.
   */
  async spawn(options: AcpSpawnOptions): Promise<AcpSessionInfo> {
    const { command, args = [], cwd, env, adapterVersion } = options;

    if (command.trim() === "") {
      throw new DomainError("INVALID_ARGUMENT", "command must not be empty");
    }

    const id = newId();
    let child: AcpProcess;
    try {
      child = this.spawner({ command, args, cwd, env });
    } catch (error) {
      throw launchFailure(command, adapterVersion, error);
    }

    const session: Session = {
      info: {
        id,
        acpSessionId: "",
        command,
        args: [...args],
        cwd,
        state: "running",
        exitCode: null,
        mode: "",
        model: "",
        availableModes: [],
        availableModels: [],
      },
      process: child,
      connection: undefined as unknown as ClientConnection,
      transcript: [],
      listeners: new Set(),
      openToolCalls: new Set(),
      pendingPermissions: new Map(),
      turnId: newId(),
    };

    // The sniffer sits between the adapter and the SDK. See `unknown-updates.ts`
    // for why it has to: the SDK validates `session/update` before any handler
    // runs, so this is the only place left where an unrecognised variant can be
    // turned into something the user sees instead of a stderr dump.
    const stdout = sniffUnknownUpdates(child.stdout, {
      onUnknown: (sessionUpdate) => {
        this.log?.warn(
          { sessionId: session.info.id, sessionUpdate },
          "evento ACP não reconhecido, ignorado",
        );
        this.emit(session, { type: "unknown", sessionUpdate });
      },
    });

    session.connection = this.appFor(session).connect(ndJsonStream(child.stdin, stdout));

    // Registered before the handshake so that an adapter dying mid-handshake is
    // recorded as an exit rather than leaving a row that claims to be running.
    void child.exited.then(({ exitCode }) => this.markExited(session, exitCode));

    try {
      const handshake = await this.handshake(session, cwd);
      Object.assign(session.info, handshake);
    } catch (error) {
      child.kill();
      throw error instanceof DomainError ? error : launchFailure(command, adapterVersion, error);
    }

    this.sessions.set(id, session);
    return { ...session.info };
  }

  /**
   * Runs one turn to completion.
   *
   * Resolves with the stop reason after the turn's last event has been emitted,
   * so a caller that awaits it can be sure the transcript is complete.
   */
  async prompt(id: string, text: string): Promise<StopReason> {
    const session = this.require(id);
    if (session.info.state === "exited") {
      throw new DomainError("SESSION_EXITED", `session ${id} has exited`);
    }
    if (text.trim() === "") {
      throw new DomainError("INVALID_ARGUMENT", "prompt must not be empty");
    }

    session.turnId = newId();

    const { stopReason } = await session.connection.agent.request("session/prompt", {
      sessionId: session.info.acpSessionId,
      prompt: [{ type: "text", text }],
    });

    // The fifth card state, and the only place it can be derived (A14). ACP has
    // no `cancelled` status: a call that was still open when the user pressed
    // stop would otherwise stay `running` forever, or be painted red as though
    // it had failed.
    if (stopReason === "cancelled") {
      for (const toolCallId of [...session.openToolCalls]) {
        this.emit(session, { type: "tool_call_update", toolCallId, status: "cancelled" });
      }
    }
    session.openToolCalls.clear();

    this.emit(session, { type: "turn_end", stopReason });
    return stopReason;
  }

  /** Asks the agent to stop. The turn's own promise reports how it ended. */
  cancel(id: string): void {
    const session = this.require(id);
    if (session.info.state === "exited") return;
    void session.connection.agent.notify("session/cancel", {
      sessionId: session.info.acpSessionId,
    });
  }

  /**
   * Answers a pending permission request.
   *
   * Unknown ids are a domain error rather than a silent no-op: the agent is
   * blocked on exactly this call, and swallowing the answer would leave it
   * waiting forever with nothing on screen to say why.
   */
  respondToPermission(id: string, requestId: string, optionId: string): void {
    const session = this.require(id);
    const pending = session.pendingPermissions.get(requestId);
    if (!pending) {
      throw new DomainError("NOT_FOUND", `no permission request ${requestId} is waiting`);
    }

    session.pendingPermissions.delete(requestId);
    pending.resolve({ outcome: "selected", optionId });
    this.emit(session, { type: "permission_resolved", requestId, outcome: { optionId } });
  }

  /** Everything an attaching client needs to catch up, in one frame. */
  transcript(id: string): readonly AcpEvent[] {
    return [...this.require(id).transcript];
  }

  /** Returns an unsubscribe function. Detaching must never end the session. */
  onEvent(id: string, listener: AcpEventListener): () => void {
    const session = this.require(id);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  watchExits(watcher: AcpExitWatcher): () => void {
    this.exitWatchers.add(watcher);
    return () => this.exitWatchers.delete(watcher);
  }

  get(id: string): AcpSessionInfo | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session.info } : undefined;
  }

  list(): AcpSessionInfo[] {
    return [...this.sessions.values()].map((session) => ({ ...session.info }));
  }

  kill(id: string): void {
    const session = this.require(id);
    if (session.info.state === "exited") return;
    session.process.kill();
  }

  /** Drops the record entirely. The agent must already be gone. */
  forget(id: string): void {
    const session = this.require(id);
    if (session.info.state === "running") {
      throw new DomainError("INVALID_ARGUMENT", `session ${id} is still running`);
    }
    this.sessions.delete(id);
  }

  /** What shutdown calls, for the reason `PtyManager.killAll` exists. */
  async killAll(timeoutMs = 2_000): Promise<void> {
    const running = [...this.sessions.values()].filter((s) => s.info.state === "running");

    await Promise.all(
      running.map(
        (session) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, timeoutMs);
            timer.unref?.();
            void session.process.exited.then(() => {
              clearTimeout(timer);
              resolve();
            });
            try {
              session.process.kill();
            } catch {
              clearTimeout(timer);
              resolve();
            }
          }),
      ),
    );
  }

  // ------------------------------------------------------------------ private

  /**
   * The client half of the protocol.
   *
   * Only the two methods a conversation needs are registered. `fs/*` and the
   * terminal methods are left out, and that is what makes `clientCapabilities`
   * in the handshake honest: an agent told the client can write files, that
   * then finds it cannot, fails in the middle of a turn instead of at the
   * handshake.
   *
   * `session/update` is registered with a **passthrough parser**, and that is
   * the one non-obvious line in this file. The SDK's built-in registration
   * validates the notification against the current `SessionUpdate` union and
   * drops anything that does not match — it never reaches a handler, and the
   * daemon cannot say what it was. That makes D3 ("ignored with a log, never
   * thrown, and visible in grey") impossible to honour: the protocol evolves,
   * v2 is a draft, and a field that did not exist when this was written is the
   * normal case, not the exception. Parsing it ourselves is what lets
   * `translate` decide between "known but not rendered yet" and "nobody has
   * seen this".
   */
  private appFor(session: Session) {
    return client({ name: "lumem" })
      .onRequest("session/request_permission", ({ params }) => {
        const requestId = newId();

        this.emit(session, {
          type: "permission_request",
          requestId,
          toolCallId: params.toolCall.toolCallId,
          title: params.toolCall.title ?? params.toolCall.toolCallId,
          command: commandOf(params.toolCall),
          cwd: session.info.cwd,
          options: params.options.map((option) => ({
            optionId: option.optionId,
            name: option.name,
            kind: option.kind,
          })),
        });

        return new Promise<RequestPermissionResponse>((resolve) => {
          session.pendingPermissions.set(requestId, {
            resolve: (outcome) => resolve({ outcome }),
          });
        });
      })
      .onNotification(
        "session/update",
        // Deliberately permissive. See the note above.
        (params: unknown) => params as { update?: unknown },
        ({ params }) => {
          const event = translateSessionUpdate(params?.update, {
            fallbackMessageId: session.turnId,
          });
          if (!event) return;

          // `unknown` cannot reach here: the sniffer diverts those before the
          // SDK sees them. It stays reachable in `translate` for the malformed
          // shapes a known variant can still carry — an unrecognised tool
          // status, say — which the SDK's own union does let through.
          if (event.type === "unknown") {
            this.log?.warn(
              { sessionId: session.info.id, sessionUpdate: event.sessionUpdate },
              "evento ACP malformado, ignorado",
            );
          }
          this.emit(session, event);
        },
      );
  }

  private async handshake(session: Session, cwd: string): Promise<Partial<AcpSessionInfo>> {
    const initialize = await this.withTimeout(
      session.connection.agent.request("initialize", {
        protocolVersion: ACP_PROTOCOL_VERSION,
        // Claims nothing the client cannot do. See `appFor`.
        clientCapabilities: {},
        clientInfo: { name: "lumem", version: LUMEM_CLIENT_VERSION },
      }),
      "initialize",
    );

    if (initialize.protocolVersion !== ACP_PROTOCOL_VERSION) {
      throw new DomainError(
        "SPAWN_FAILED",
        `o adaptador fala a versão ${initialize.protocolVersion} do protocolo, e este daemon fala a ${ACP_PROTOCOL_VERSION}`,
      );
    }

    const created = await this.withTimeout(
      session.connection.agent.request("session/new", { cwd, mcpServers: [] }),
      "session/new",
    );

    return {
      acpSessionId: created.sessionId,
      mode: created.modes?.currentModeId ?? "",
      availableModes: (created.modes?.availableModes ?? []).map(toChoice),
      ...modelsOf(created.configOptions),
    };
  }

  /**
   * An adapter that never answers is a session that never starts.
   *
   * Without this the promise simply never settles: no error, no log, and a tab
   * that spins with nothing to click. A deadline turns that into F1.6's domain
   * answer.
   */
  private async withTimeout<T>(work: Promise<T>, step: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new DomainError(
                  "SPAWN_FAILED",
                  `o adaptador não respondeu a ${step} em ${this.handshakeTimeoutMs} ms`,
                ),
              ),
            this.handshakeTimeoutMs,
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private emit(session: Session, event: AcpEvent): void {
    if (event.type === "tool_call") {
      if (event.status === "pending" || event.status === "running") {
        session.openToolCalls.add(event.toolCallId);
      }
    } else if (event.type === "tool_call_update" && event.status) {
      if (event.status === "pending" || event.status === "running") {
        session.openToolCalls.add(event.toolCallId);
      } else {
        session.openToolCalls.delete(event.toolCallId);
      }
    }

    session.transcript.push(event);

    // A throwing listener must not take down the daemon or starve the other
    // attached clients — the same rule the PTY manager follows.
    for (const listener of [...session.listeners]) {
      try {
        listener(event);
      } catch {
        /* a broken client is the client's problem */
      }
    }
  }

  private markExited(session: Session, exitCode: number | null): void {
    if (session.info.state === "exited") return;

    session.info.state = "exited";
    session.info.exitCode = exitCode;

    // Anything still blocked on a person will never be answered now. Resolving
    // as cancelled is what keeps the agent's own promises from dangling.
    for (const [, pending] of session.pendingPermissions) {
      pending.resolve({ outcome: "cancelled" });
    }
    session.pendingPermissions.clear();
    session.listeners.clear();

    for (const watcher of [...this.exitWatchers]) {
      try {
        watcher({ ...session.info });
      } catch {
        /* a broken watcher must not take the daemon with it */
      }
    }
  }

  private require(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new DomainError("SESSION_NOT_FOUND", `no session ${id}`);
    return session;
  }
}

function toChoice(mode: { id: string; name: string; description?: string | null }): AcpChoice {
  return { id: mode.id, name: mode.name, description: mode.description ?? null };
}

/**
 * Reads the model list out of `configOptions`.
 *
 * The models are not a field of their own: the protocol reports them as one
 * select among several (`mode`, `model`, `effort`, `fast`, `agent`). An adapter
 * that offers no model select is not broken, so this degrades to empty.
 */
function modelsOf(
  options: readonly unknown[] | null | undefined,
): Pick<AcpSessionInfo, "model" | "availableModels"> {
  const select = (options ?? []).find(
    (option): option is { id: string; currentValue?: string; options?: unknown[] } =>
      typeof option === "object" && option !== null && (option as { id?: string }).id === "model",
  );
  if (!select) return { model: "", availableModels: [] };

  const choices = Array.isArray(select.options)
    ? select.options.flatMap((choice) =>
        typeof choice === "object" && choice !== null
          ? [toChoice(choice as { id: string; name: string; description?: string | null })]
          : [],
      )
    : [];

  return { model: select.currentValue ?? "", availableModels: choices };
}

/** The command a permission request is about, when the tool call names one. */
function commandOf(toolCall: ToolCallUpdate): string | null {
  const raw = toolCall.rawInput;
  if (typeof raw === "object" && raw !== null) {
    const command = (raw as { command?: unknown }).command;
    if (typeof command === "string") return command;
  }
  return null;
}

/**
 * F1.6: a launch that fails is a sentence with a way out, not a stack trace.
 *
 * The install line is built from the pinned version rather than hard-coded,
 * because a hard-coded one would drift from `agent_config` and send the user to
 * install a version this session would not accept.
 */
function launchFailure(command: string, adapterVersion: string | undefined, cause: unknown): DomainError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const pinned = adapterVersion ? ` Esta sessão fixa a versão ${adapterVersion}.` : "";
  return new DomainError(
    "SPAWN_FAILED",
    `não foi possível iniciar o adaptador "${command}".${pinned} (${detail})`,
    { cause },
  );
}
