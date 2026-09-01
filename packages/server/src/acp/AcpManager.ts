import {
  client,
  ndJsonStream,
  type NewSessionResponse,
  type ClientConnection,
  type RequestPermissionOutcome,
  type RequestPermissionResponse,
  type StopReason,
  type ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import {
  ACP_AUTH_REQUIRED_CODE,
  newId,
  type AcpConfigOption,
  type AcpEvent,
  type AcpModeOwner,
  type AcpTranscriptEntry,
  type LumemMode,
  type LumemModeDefault,
} from "@lumem/shared";

import type { FastifyBaseLogger } from "fastify";

import { isCommandAvailable } from "../agents/availability.js";
import { DomainError } from "../errors.js";
import { createFileService, type FileService } from "../files/FileService.js";
import { createFsBridge, type FsBridge } from "./fs-bridge.js";
import { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";
import type { PtyManager } from "../pty/PtyManager.js";
import { spawnAcpProcess, type AcpProcess, type AcpProcessSpawner } from "./process.js";
import { createMemoryTranscriptStore, type TranscriptStore } from "./TranscriptStore.js";
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
  /**
   * The policy this conversation starts under (`session-mode`, Q5 and F1.4).
   *
   * Passed in rather than read here, because the manager has no database: on a
   * new session it is the workspace's default, and on a resume it is what the
   * dead row was carrying. `LumemMode` and not `LumemModeDefault` for exactly
   * that second case — a session resumed from one that went through the gate
   * comes back `free`, and narrowing the type here would silently downgrade it.
   */
  lumemMode?: LumemMode;
  /** What a new session in this workspace would start at — the menu's footer. */
  lumemModeDefault?: LumemModeDefault;
}


export interface AcpResumeOptions extends AcpSpawnOptions {
  /**
   * The adapter's own id for the conversation being continued (F5.2).
   *
   * Ours is not enough: `session/load` names the session in the *agent's* vocabulary,
   * and the row that died is where that name was kept.
   */
  acpSessionId: string;
  /**
   * The session that ended, ours (D12, D15).
   *
   * Given, not derived: the manager knows the adapter's id for the conversation and
   * nothing about the registry. With it, the record of the old conversation is copied
   * forward and the new transcript is self-contained.
   */
  fromSessionId?: string;
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
  /**
   * Every selector the agent offers, normalised (F2.6).
   *
   * One list rather than a field per selector. The protocol reports mode, model,
   * effort, fast and agent the same way, and the only irregularity — that mode
   * has a dedicated `session/set_mode` — is the daemon's to absorb, not the
   * browser's (D8).
   */
  configOptions: readonly AcpConfigOption[];
  /**
   * The policy Lumem applies when the agent offers no modes of its own (Q1).
   *
   * Kept even while the agent owns the selector, and that is deliberate: an
   * adapter that stops reporting modes hands the conversation back to the policy
   * it already had, instead of to a default nobody chose (T12).
   */
  lumemMode: LumemMode;
  /** What a new session in this workspace starts at — the menu's footer (Q5). */
  lumemModeDefault: LumemModeDefault;
}

/**
 * Which of the two authorities owns the mode selector of a session (A1).
 *
 * Derived, and derived *here*, because the rule is the daemon's: the agent's
 * mode and Lumem's never coexist. Deriving it in the browser would be a second
 * copy of the rule, free to drift from this one.
 */
export function modeOwnerOf(info: {
  configOptions: readonly AcpConfigOption[];
}): AcpModeOwner {
  return info.configOptions.some((option) => option.id === MODE_OPTION) ? "agent" : "lumem";
}

/**
 * What one handshake said, without a session existing afterwards (onboarding F3.3).
 *
 * Every field is something the adapter reported — nothing here is inferred. That is
 * the point of the screen it feeds: it is the proof that the thing connected, and a
 * proof made of guesses proves nothing.
 */
export interface AcpProbeReport {
  command: string;
  args: readonly string[];
  /** The adapter's own name and version, when it declares them. */
  agentInfo: { name: string; title: string | null; version: string } | null;
  protocolVersion: number;
  /**
   * How this adapter says a person logs in — its list, not ours.
   *
   * Empty means it offers nothing, which for `claude-agent-acp` happens when the
   * client does not declare `auth.terminal`; the daemon declares it, so an empty
   * list here means the adapter really has nothing to offer.
   *
   * Every method the daemon can act on is `type: "terminal"`: a command to run in
   * a real terminal, which is what the two Claude logins actually are. `agent`
   * methods would go through `authenticate`, and `env_var` ones would need a
   * secret stored somewhere — neither is offered by this adapter, and both are
   * reported here as unusable rather than drawn as a button that fails.
   */
  authMethods: readonly AcpAuthMethod[];
  /** `session/new` refused with `auth_required`: there is no usable credential. */
  authRequired: boolean;
  capabilities: readonly string[];
  /** The test session's id. It is dead by the time this is read. */
  acpSessionId: string;
  modes: readonly string[];
  currentMode: string | null;
  /** Milliseconds, per stage. The screen reports them; nothing branches on them. */
  timings: { spawnMs: number; initializeMs: number; sessionMs: number };
}

/**
 * One way in, as the adapter described it.
 *
 * `command` and `args` are what the daemon will run. They come from the method's
 * `_meta["terminal-auth"]` when the adapter provides it — which is the honest
 * source, because the adapter knows which binary of itself to launch — and are
 * null for a method the daemon cannot execute, so the screen can say why instead
 * of offering it.
 */
export interface AcpAuthMethod {
  id: string;
  name: string;
  description: string | null;
  type: "terminal" | "agent" | "env_var" | "unknown";
  command: string | null;
  args: readonly string[];
  /** What to call the terminal that runs it. */
  label: string | null;
}

export type AcpEventListener = (entry: AcpTranscriptEntry) => void;
export type AcpExitWatcher = (info: AcpSessionInfo) => void;
/**
 * Told whenever a session's selectors change.
 *
 * The seam the session store hangs off, exactly as `watchExits` is: the switch has
 * to reach the database (D9) and the manager has no business knowing there is one.
 */
export type AcpConfigWatcher = (info: AcpSessionInfo) => void;

/** Um evento, e de qual sessão ele veio. */
export type AcpEventWatcher = (frame: { sessionId: string; event: AcpEvent }) => void;

interface PendingPermission {
  resolve(outcome: RequestPermissionOutcome): void;
}

interface Session {
  info: AcpSessionInfo;
  process: AcpProcess;
  connection: ClientConnection;
  listeners: Set<AcpEventListener>;
  /** Calls still open, so a cancelled turn can close them (A14). */
  openToolCalls: Set<string>;
  pendingPermissions: Map<string, PendingPermission>;
  /**
   * What kind of value each selector takes.
   *
   * Kept beside the normalised options because `session/set_config_option` needs
   * it and the browser does not: the wire carries a string, and this is what turns
   * `"true"` into a boolean for the one option that wants one.
   */
  optionTypes: Map<string, "select" | "boolean">;
  /**
   * A turn is running.
   *
   * Tracked here rather than derived from the events, because the one thing that
   * needs the answer — refusing a switch mid-turn — has to know *before* any event
   * about it exists.
   */
  promptInFlight: boolean;
  /**
   * This is a probe, not a session (onboarding D4).
   *
   * The only thing it changes is who gets told when the process dies: a probe has
   * no row in the database, so notifying the exit watchers would have the session
   * store looking for an id it never wrote.
   */
  probe: boolean;
  /** Disk access, scoped to this session's checkout and nothing else. */
  fs: FsBridge;
  /** Terminals the agent asked for. Absent when no `PtyManager` was wired. */
  terminals: TerminalBridge | undefined;
  /** One id per turn, for chunks the agent sends without a message id. */
  turnId: string;
  /**
   * The agent is still replaying a loaded conversation (D14).
   *
   * The adapter re-streams the whole history around `session/load`. Those updates are
   * dropped: the daemon already has a better copy of the same conversation on disk —
   * one with the tool cards, the plans and the usage the replay does not carry — and
   * recording both would show it twice.
   *
   * Cleared by the **first prompt**, not by the load's own response. The response and
   * the notifications travel the same pipe and the SDK does not promise that a
   * notification written before a reply is *handled* before it: clearing on the reply
   * dropped the replay in-process and recorded it against a real subprocess, which is
   * the worst possible shape for a bug. Nothing new happens in a conversation nobody
   * has spoken to yet, so "before the first prompt" is a boundary that cannot race.
   */
  replaying: boolean;
  /**
   * O núcleo da memória já entrou nesta sessão (workspace-memory, D2).
   *
   * O bloco vai **uma vez**, no primeiro turno, e não em todo turno. A razão é o
   * cache do provedor: prompt que muda no meio da conversa invalida o prefixo
   * cacheado, e o spike do `acp-sessions` mediu 22.708 tokens de escrita de
   * cache num turno trivial. Reinjetar diretriz que o agente já leu é pagar
   * aquilo de novo para não dizer nada de novo.
   */
  coreInjected: boolean;
}

export interface AcpManagerOptions {
  spawner?: AcpProcessSpawner;
  handshakeTimeoutMs?: number;
  /**
   * How the agent reaches the disk (F4.1).
   *
   * Injectable so a test can hand it a checkout of its own; the production value
   * is the same `FileService` the editor uses, which is what makes "the same
   * guard, without exception" true rather than aspirational.
   */
  files?: FileService;
  /**
   * The one the daemon already owns (F3.2, D7).
   *
   * Required for `terminal/*`: without it the capability is not declared and the
   * agent never asks. Optional so a manager built for a test that never touches a
   * terminal does not have to build one.
   */
  ptyManager?: PtyManager;
  /**
   * The clock that stamps transcript entries.
   *
   * A seam because a test that asserts on elapsed time cannot depend on how long
   * the machine took, and because `Date.now()` buried in a method is a
   * dependency nobody can see.
   */
  now?: () => number;
  /**
   * How the daemon decides the adapter exists. A seam for tests only — the
   * production answer is `isCommandAvailable`, reused as it stands (F1.6).
   */
  isAvailable?: (command: string) => boolean;
  /**
   * Where the conversation is kept (F5.4).
   *
   * Injectable, and in-memory by default, so a test that is not about the disk does
   * not have to name a directory. `bootstrap` passes the real one.
   */
  transcripts?: TranscriptStore;
  /**
   * Where an unrecognised event goes.
   *
   * "Ignored with a log, never thrown" (D3) needs somewhere for the log to
   * land, and a `console.warn` in a daemon is a message nobody reads.
   */
  log?: Pick<FastifyBaseLogger, "warn">;
  /**
   * O que a memória do workspace tem a dizer antes da primeira mensagem.
   *
   * Uma função injetada, e não um `MemoryService` aqui dentro, por direção de
   * dependência: este arquivo é o único que entende ACP, e ele não tem por que
   * aprender o que é um escopo de memória. Quem constrói o manager sabe as duas
   * coisas e amarra uma na outra.
   *
   * Ausente é o default: um manager de teste que não é sobre memória não
   * injeta nada, e a conversa é exatamente a que era antes desta feature.
   */
  preamble?: AcpPreambleSource;
}

/**
 * O bloco que entra antes da primeira mensagem da pessoa.
 *
 * `null` quando não há o que dizer — e é diferente de bloco vazio: sessão sem
 * memória nenhuma não recebe cabeçalho de uma seção que não existe.
 */
export type AcpPreambleSource = (session: AcpSessionInfo) => Promise<AcpPreamble | null>;

export interface AcpPreamble {
  text: string;
  /** Quantas memórias fixadas ele carrega — a marca d'água, na conversa. */
  entries: number;
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
  private readonly configWatchers = new Set<AcpConfigWatcher>();
  private readonly eventWatchers = new Set<AcpEventWatcher>();
  private readonly spawner: AcpProcessSpawner;
  private readonly handshakeTimeoutMs: number;
  private readonly isAvailable: (command: string) => boolean;
  private readonly files: FileService;
  private readonly ptyManager: PtyManager | undefined;
  private readonly now: () => number;
  private readonly transcripts: TranscriptStore;
  private readonly log: Pick<FastifyBaseLogger, "warn"> | undefined;
  private readonly preamble: AcpPreambleSource | undefined;

  constructor({
    spawner = spawnAcpProcess,
    handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
    isAvailable = (command) => isCommandAvailable(command),
    files = createFileService(),
    ptyManager,
    now = () => Date.now(),
    transcripts = createMemoryTranscriptStore(),
    log,
    preamble,
  }: AcpManagerOptions = {}) {
    this.spawner = spawner;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.isAvailable = isAvailable;
    this.files = files;
    this.ptyManager = ptyManager;
    this.now = now;
    this.transcripts = transcripts;
    this.log = log;
    this.preamble = preamble;
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
    const { session, child } = this.launch(options);

    try {
      Object.assign(session.info, await this.handshake(session, options.cwd));
    } catch (error) {
      child.kill();
      throw error instanceof DomainError
        ? error
        : launchFailure(options.command, options.adapterVersion, error);
    }

    this.sessions.set(session.info.id, session);
    return { ...session.info };
  }

  /**
   * Continues a conversation in a new adapter (F5.2, A7, D12).
   *
   * Not a resurrection: yesterday's process is gone and nothing brings it back. This
   * launches a new adapter and hands it the old conversation's id, which is what the
   * protocol offers and the reason resuming produces a *new* session rather than
   * reviving a dead one.
   *
   * The old transcript is not read here. The daemon keeps its own copy on disk and
   * that is the one the client is shown — see `loading` for why the adapter's replay
   * is thrown away.
   */
  async resume(options: AcpResumeOptions): Promise<AcpSessionInfo> {
    if (options.acpSessionId.trim() === "") {
      throw new DomainError("INVALID_ARGUMENT", "sem o id da conversa não há o que retomar");
    }

    const { session, child } = this.launch(options);
    session.info.acpSessionId = options.acpSessionId;

    try {
      Object.assign(
        session.info,
        await this.handshake(session, options.cwd, options.acpSessionId),
      );
    } catch (error) {
      child.kill();
      throw error instanceof DomainError
        ? error
        : launchFailure(options.command, options.adapterVersion, error);
    }

    this.sessions.set(session.info.id, session);

    /*
     * The old record is copied forward before anything new is written (D15), so the
     * order on disk is the order on screen: yesterday's conversation, the separator,
     * then today's.
     *
     * A failure here loses the history and not the session, so it is logged and the
     * conversation goes on — the same trade `emit` makes about a write that fails.
     */
    if (options.fromSessionId !== undefined) {
      try {
        this.transcripts.copy(options.fromSessionId, session.info.id);
      } catch (error) {
        this.log?.warn(
          { sessionId: session.info.id, from: options.fromSessionId, err: error },
          "falha ao copiar a transcrição anterior para a sessão retomada",
        );
      }
      // Recorded rather than inferred: the client draws a separator here, and a
      // separator that only existed live would be missing from every replay.
      this.emit(session, { type: "resumed", fromSessionId: options.fromSessionId });
    }

    return { ...session.info };
  }

  /**
   * Connects, asks what the adapter is, and throws the session away (F3.3, D4).
   *
   * Not `spawn` with a flag: this is a different question. `spawn` exists to hand
   * back something a prompt can use, and everything about it — the row in the
   * database, the exit watchers, the transcript — is about keeping a conversation
   * alive. This one exists to answer "does this work here", and the honest shape of
   * that answer is a report plus a dead process.
   *
   * It costs **no tokens**. `initialize` and `session/new` are the whole path, and
   * the spike measured both at zero: nothing is generated until `session/prompt`,
   * which never happens here.
   */
  async probe(options: AcpSpawnOptions): Promise<AcpProbeReport> {
    const startedAt = this.now();
    const { session, child } = this.launch(options, { probe: true });
    const spawnedAt = this.now();

    try {
      const initialize = await this.initialize(session);
      const initializedAt = this.now();

      if (initialize.protocolVersion !== ACP_PROTOCOL_VERSION) {
        throw new DomainError(
          "SPAWN_FAILED",
          `o adaptador fala a versão ${initialize.protocolVersion} do protocolo, e este daemon fala a ${ACP_PROTOCOL_VERSION}`,
        );
      }

      /*
       * `auth_required` is an answer, not a failure.
       *
       * It is the whole reason the login panel exists, and the only way to know a
       * credential is missing without spending a turn to find out. Anything else
       * that goes wrong here still throws.
       */
      /*
       * The SDK's own response type, reached through the request it answers.
       *
       * Spelling the shape out by hand drifts: `modes` is nullable there and was
       * not here, and the compiler caught it — which is the argument for not
       * writing a second copy of a type the SDK already owns.
       */
      let created: NewSessionResponse | null;
      try {
        created = await this.withTimeout(
          session.connection.agent.request("session/new", { cwd: options.cwd, mcpServers: [] }),
          "session/new",
        );
      } catch (error) {
        if (!isAuthRequired(error)) throw error;
        created = null;
      }
      const createdAt = this.now();

      const capabilities = initialize.agentCapabilities ?? {};
      const declared: string[] = [];
      if (capabilities.loadSession === true) declared.push("loadSession");
      if (capabilities.promptCapabilities?.image === true) declared.push("prompt.image");
      if (capabilities.promptCapabilities?.audio === true) declared.push("prompt.audio");
      if (capabilities.promptCapabilities?.embeddedContext === true) {
        declared.push("prompt.embeddedContext");
      }

      return {
        command: options.command,
        args: [...(options.args ?? [])],
        authRequired: created === null,
        agentInfo:
          initialize.agentInfo === undefined || initialize.agentInfo === null
            ? null
            : {
                name: initialize.agentInfo.name,
                title: initialize.agentInfo.title ?? null,
                version: initialize.agentInfo.version,
              },
        protocolVersion: initialize.protocolVersion,
        authMethods: (initialize.authMethods ?? []).map(toAuthMethod),
        capabilities: declared,
        acpSessionId: created?.sessionId ?? "",
        modes: created?.modes?.availableModes.map((mode) => mode.id) ?? [],
        currentMode: created?.modes?.currentModeId ?? null,
        timings: {
          spawnMs: spawnedAt - startedAt,
          initializeMs: initializedAt - spawnedAt,
          sessionMs: createdAt - initializedAt,
        },
      };
    } catch (error) {
      throw error instanceof DomainError
        ? error
        : launchFailure(options.command, options.adapterVersion, error);
    } finally {
      /*
       * Always, and this is the line that matters most in the method.
       *
       * The path where `session/new` refuses — an adapter that wants
       * authentication first — is the one where a leaked adapter process is
       * easiest to produce and hardest to notice: the screen shows a refusal, and
       * a stray Node process keeps running until the machine is rebooted.
       */
      child.kill();
    }
  }

  /**
   * Everything both entry points do before the handshake.
   *
   * Split out rather than duplicated because the shared part is the part with the
   * teeth: the availability check, the sniffer, the exit registration, and the two
   * per-session bridges. A second copy of it for `resume` would be a second place for
   * one of those to go missing.
   */
  private launch(
    options: AcpSpawnOptions,
    { probe = false }: { probe?: boolean } = {},
  ): { session: Session; child: AcpProcess } {
    const { command, args = [], cwd, env, adapterVersion } = options;

    if (command.trim() === "") {
      throw new DomainError("INVALID_ARGUMENT", "command must not be empty");
    }

    // Asked before spawning, not discovered after. A missing adapter otherwise
    // shows up as a handshake that times out fifteen seconds later — the user
    // waits, and then reads a message about a protocol step they never chose.
    // `isCommandAvailable` already answers this for the PTY path; F1.6 asks for
    // the same answer, not a second implementation of it.
    if (!this.isAvailable(command)) {
      throw notInstalled(command, adapterVersion);
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
        configOptions: [],
        /*
         * A session is born asking, always (F1.5).
         *
         * The workspace default is applied by the caller that knows which
         * workspace this is — the store — and even that one cannot make a
         * session start free: the gate for `free` is per session, and a default
         * that walked through it would annul it (Q5).
         */
        lumemMode: options.lumemMode ?? "ask",
        lumemModeDefault: options.lumemModeDefault ?? "ask",
      },
      process: child,
      connection: undefined as unknown as ClientConnection,
      listeners: new Set(),
      openToolCalls: new Set(),
      pendingPermissions: new Map(),
      optionTypes: new Map(),
      promptInFlight: false,
      probe,
      // One bridge per session, rooted at its own cwd. A shared one would need
      // the root passed on every call, and the call that forgot would read
      // another worktree.
      fs: createFsBridge({ files: this.files, root: cwd }),
      // One bridge per session too, for the same reason: its default cwd is this
      // session's checkout, and a shared one would run the agent's commands wherever
      // the last caller happened to be.
      terminals: this.ptyManager
        ? createTerminalBridge({ ptyManager: this.ptyManager, cwd })
        : undefined,
      turnId: newId(),
      replaying: false,
      coreInjected: false,
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

    return { session, child };
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
    session.promptInFlight = true;
    // Whatever the agent said before this moment was it retelling a conversation the
    // daemon already had on disk (D14). From here on it is answering.
    session.replaying = false;

    // O núcleo da memória, e só no primeiro turno (workspace-memory, D2). Antes
    // da mensagem da pessoa na transcrição porque foi antes dela no prompt: a
    // conversa gravada tem que estar na ordem em que o agente leu.
    const preamble = session.coreInjected ? null : await this.coreFor(session);
    if (preamble !== null) {
      // Marcado antes de emitir: se o `session/prompt` falhar, o núcleo já foi
      // para a transcrição e reinjetar no turno seguinte diria duas vezes a
      // mesma coisa. Um turno perdido é menos ruim que diretriz duplicada.
      session.coreInjected = true;
      this.emit(session, {
        type: "memory_core",
        entries: preamble.entries,
        chars: preamble.text.length,
      });
    }

    // The user's own message goes into the transcript before the agent hears it.
    // The adapter does not echo it, so without this line reopening the tab would
    // show every answer and none of the questions — and the replay would not
    // reproduce what the live client saw, since the live client would have had to
    // paint its own message locally.
    this.emit(session, {
      type: "message",
      messageId: session.turnId,
      role: "user",
      text,
    });

    const { stopReason } = await session.connection.agent.request("session/prompt", {
      sessionId: session.info.acpSessionId,
      // Bloco **separado**, nunca concatenado: o texto da pessoa vai verbatim,
      // como sempre foi, e o que o daemon acrescentou é distinguível de fora.
      prompt:
        preamble === null
          ? [{ type: "text", text }]
          : [{ type: "text", text: preamble.text }, { type: "text", text }],
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

    session.promptInFlight = false;
    this.emit(session, { type: "turn_end", stopReason });
    return stopReason;
  }

  /**
   * O que a memória do workspace tem a dizer, ou `null`.
   *
   * Falha aqui **não** derruba o turno: memória é o que melhora a resposta, não
   * o que autoriza a pergunta. Um `~/.lumem` corrompido ou um banco travado
   * viraria sessão inutilizável, e o agente funcionava sem nada disso até esta
   * feature existir.
   */
  private async coreFor(session: Session): Promise<AcpPreamble | null> {
    if (this.preamble === undefined) return null;
    try {
      return await this.preamble({ ...session.info });
    } catch (error) {
      this.log?.warn(
        { sessionId: session.info.id, err: error },
        "não foi possível montar o núcleo da memória; a sessão segue sem ele",
      );
      return null;
    }
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
    this.emit(session, {
      type: "permission_resolved",
      requestId,
      outcome: { optionId },
      by: "user",
      reason: null,
    });
  }

  /**
   * Switch the policy Lumem applies to permission requests (F1.1).
   *
   * Synchronous, and that is the whole difference from `setConfig`: nothing
   * leaves the daemon. `setConfig` forwards a value to the agent and waits for it
   * to answer; this changes what *we* answer, and the agent never learns a policy
   * exists.
   *
   * Two refusals, and both are named rather than silent:
   *
   * - **the agent owns the selector** (A1). Accepting the switch and doing
   *   nothing with it would leave a stored value that never applies — the tell
   *   would be a pill that changes and a behaviour that does not.
   * - **a turn is running** (F1.7). Same reason `setConfig` refuses, and
   *   deliberately the same message: from where the user stands it is the same
   *   act, and two wordings for one rule teach that there are two rules.
   */
  setLumemMode(id: string, mode: LumemMode): void {
    const session = this.require(id);
    if (session.info.state === "exited") {
      throw new DomainError("SESSION_EXITED", `session ${id} has exited`);
    }

    if (modeOwnerOf(session.info) === "agent") {
      throw new DomainError(
        "BLOCKED",
        "este agente oferece modos próprios: troque o modo dele, não a política do Lumem",
      );
    }

    if (session.promptInFlight) {
      throw new DomainError(
        "BLOCKED",
        "não dá para trocar de modo ou modelo no meio de um turno: interrompa ou espere ele acabar",
      );
    }

    session.info.lumemMode = mode;
    this.emitConfig(session);
  }

  /**
   * Everything an attaching client needs to catch up, in one frame.
   *
   * Read from the store, not from memory: the array this replaced grew for the life
   * of the session with no ceiling, which is the reason F5.4 exists at all.
   */
  transcript(id: string): readonly AcpTranscriptEntry[] {
    this.require(id);
    return this.transcripts.read(id);
  }

  /**
   * A conversation with no live session behind it (F5.2, D13).
   *
   * Straight from disk, and deliberately without `require`: the whole point is a
   * session that is gone. Reading is not attaching — nothing is launched, nothing is
   * subscribed, and the ~39k tokens of system prompt an adapter costs are not spent
   * because someone clicked a tab to reread something.
   */
  storedTranscript(sessionId: string): readonly AcpTranscriptEntry[] {
    return this.transcripts.read(sessionId);
  }

  /** Returns an unsubscribe function. Detaching must never end the session. */
  onEvent(id: string, listener: AcpEventListener): () => void {
    const session = this.require(id);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  /**
   * Todo evento de toda sessão, para quem não pode se inscrever numa só.
   *
   * O `onEvent` serve um cliente que abriu uma aba; isto serve o daemon
   * reagindo ao que qualquer sessão faz — hoje, contar carregamento de playbook
   * pelo `tool_call` que a Q16 nomeia. É o mesmo formato do `watchExits` e do
   * `watchConfig`, que existem pela mesma razão: algo de fora precisa saber, e
   * não tem como saber em qual sessão vai acontecer.
   */
  watchEvents(watcher: AcpEventWatcher): () => void {
    this.eventWatchers.add(watcher);
    return () => this.eventWatchers.delete(watcher);
  }

  watchExits(watcher: AcpExitWatcher): () => void {
    this.exitWatchers.add(watcher);
    return () => this.exitWatchers.delete(watcher);
  }

  /** Notified whenever any session's mode or model changes. Returns an unsubscribe. */
  watchConfig(watcher: AcpConfigWatcher): () => void {
    this.configWatchers.add(watcher);
    return () => this.configWatchers.delete(watcher);
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
    // The file stays; only the handle goes. Dropping the conversation is `drop` on
    // the store, and it is a different decision from forgetting the process.
    this.transcripts.release(id);
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
   * `fs/read_text_file` and `fs/write_text_file` go through the same
   * `FileService` — and therefore the same path guard — that the editor uses,
   * scoped per session to its own checkout. The terminal methods are still left
   * out, and `clientCapabilities` says so: an agent told the client can do
   * something it cannot fails in the middle of a turn instead of at the
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
      .onRequest("fs/read_text_file", async ({ params }) => ({
        content: await session.fs.read(params.path, { line: params.line, limit: params.limit }),
      }))
      .onRequest("fs/write_text_file", async ({ params }) => {
        await session.fs.write(params.path, params.content);
        return {};
      })
      .onRequest("terminal/create", ({ params }) => {
        const bridge = this.requireTerminals(session);
        const { terminalId, ptySessionId } = bridge.create({
          command: params.command,
          ...(params.args ? { args: params.args } : {}),
          ...(params.env
            ? { env: Object.fromEntries(params.env.map(({ name, value }) => [name, value])) }
            : {}),
          cwd: params.cwd ?? null,
          outputByteLimit: params.outputByteLimit ?? null,
        });

        // The event is what lets the card show it (D7). Emitted here rather than
        // when the agent first mentions the terminal in a tool call, because this is
        // the moment the PTY exists and the card needs its id to attach.
        this.emit(session, {
          type: "terminal",
          terminalId,
          ptySessionId,
          command: params.command,
        });

        return { terminalId };
      })
      .onRequest("terminal/output", ({ params }) =>
        this.requireTerminals(session).output(params.terminalId),
      )
      // Flat, not nested under `exitStatus`: `terminal/output` wraps it and
      // `wait_for_exit` does not, which is the protocol's shape rather than ours.
      .onRequest("terminal/wait_for_exit", ({ params }) =>
        this.requireTerminals(session).waitForExit(params.terminalId),
      )
      .onRequest("terminal/kill", ({ params }) => {
        this.requireTerminals(session).kill(params.terminalId);
        return {};
      })
      .onRequest("terminal/release", ({ params }) => {
        this.requireTerminals(session).release(params.terminalId);
        return {};
      })
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
          /*
           * Two variants are handled here rather than in `translate`, and for the
           * same reason D8 gives: they are partial. `current_mode_update` carries a
           * mode and nothing else, `config_option_update` carries options and no
           * mode, and the `config` event the client reads carries both. Merging
           * needs the session's current state, which the translator — pure, one
           * update at a time — does not have.
           */
          if (this.absorbConfigUpdate(session, params?.update)) return;

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

          /*
           * The replay of a loaded conversation goes nowhere (D14).
           *
           * Content only: the selectors and the command list are the agent describing
           * *itself*, not retelling the conversation, and dropping those would leave a
           * resumed tab with no pills and an empty slash menu.
           */
          if (session.replaying && event.type !== "config" && event.type !== "commands") {
            return;
          }

          this.emit(session, event);
        },
      );
  }

  /**
   * Absorbs a partial config update, if that is what this is.
   *
   * Returns whether it handled the update, so the caller can fall through to the
   * translator for everything else.
   */
  private absorbConfigUpdate(session: Session, update: unknown): boolean {
    if (typeof update !== "object" || update === null) return false;
    const record = update as Record<string, unknown>;

    if (record["sessionUpdate"] === "current_mode_update") {
      if (typeof record["currentModeId"] !== "string") return false;
      session.info.mode = record["currentModeId"];
      this.emitConfig(session);
      return true;
    }

    if (record["sessionUpdate"] === "config_option_update") {
      const options = normaliseOptions(
        Array.isArray(record["configOptions"]) ? record["configOptions"] : [],
        undefined,
      );
      // Merged rather than replaced: the update carries the options the agent
      // changed, and the `mode` this daemon folds in from `modes` is not among
      // them. Replacing would drop the mode selector on the first such update.
      const merged = [...session.info.configOptions];
      for (const option of options) {
        const at = merged.findIndex((existing) => existing.id === option.id);
        if (at === -1) merged.push(option);
        else merged[at] = option;
      }
      session.info.configOptions = merged;
      session.info.model = valueOf(merged, "model") || session.info.model;
      this.emitConfig(session);
      return true;
    }

    return false;
  }

  /**
   * The terminal bridge, or a refusal the agent can read.
   *
   * Reachable only if the agent asks despite the capability not being declared —
   * which a well-behaved one will not, and a broken one should be told about rather
   * than crashing on.
   */
  private requireTerminals(session: Session): TerminalBridge {
    if (!session.terminals) {
      throw new DomainError(
        "BLOCKED",
        "esta sessão não oferece terminal: nenhum PtyManager foi ligado ao AcpManager",
      );
    }
    return session.terminals;
  }

  /**
   * The `initialize` request, in one place.
   *
   * Extracted because the probe needs the *same* declaration a real session
   * makes: a probe that claimed different capabilities would answer a different
   * question from the one the user is asking, which is "will my agent work here".
   */
  private async initialize(session: Session) {
    return this.withTimeout(
      session.connection.agent.request("initialize", {
        protocolVersion: ACP_PROTOCOL_VERSION,
        /*
         * Declared only for what `appFor` actually registers.
         *
         * `fs` is claimed now that both methods exist — and not before, which is
         * the whole point of the order: an agent told the client can write, that
         * then finds it cannot, fails in the middle of a turn instead of at the
         * handshake. `terminal` stays unclaimed until the five methods behind it
         * do exist.
         */
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          // Only when there is a `PtyManager` behind it. Claiming it without one
          // would have the agent ask for a shell and get an error mid-turn, which
          // is exactly what declaring capabilities honestly avoids.
          ...(this.ptyManager ? { terminal: true } : {}),
          /*
           * Login by terminal, declared for the same reason and with the same rule.
           *
           * Measured, not assumed: `claude-agent-acp` advertises **no** `authMethods`
           * to a client that does not declare this — which is why the spike read an
           * empty list and concluded "it asked for nothing". It was never asked.
           * With `auth.terminal` it offers `claude-ai-login` and `console-login`,
           * both `type: "terminal"`; with `_meta["terminal-auth"]` it also hands over
           * the exact command and args to run, so the daemon does not have to guess
           * which binary logs in.
           *
           * Gated on the `PtyManager` too: the methods it offers are commands, and
           * a client that cannot run one has no business being offered it.
           */
          ...(this.ptyManager ? { auth: { terminal: true } } : {}),
        },
        ...(this.ptyManager ? { _meta: { "terminal-auth": true } } : {}),
        clientInfo: { name: "lumem", version: LUMEM_CLIENT_VERSION },
      }),
      "initialize",
    );
  }

  private async handshake(
    session: Session,
    cwd: string,
    loadAcpSessionId?: string,
  ): Promise<Partial<AcpSessionInfo>> {
    const initialize = await this.initialize(session);

    if (initialize.protocolVersion !== ACP_PROTOCOL_VERSION) {
      throw new DomainError(
        "SPAWN_FAILED",
        `o adaptador fala a versão ${initialize.protocolVersion} do protocolo, e este daemon fala a ${ACP_PROTOCOL_VERSION}`,
      );
    }

    if (loadAcpSessionId !== undefined) {
      // Asked, not assumed. An adapter without `loadSession` answers `session/load`
      // with a method-not-found from deep inside the SDK, and F1.6's rule is that a
      // launch failure reads as a sentence rather than as a protocol error.
      if (initialize.agentCapabilities?.loadSession !== true) {
        throw new DomainError(
          "BLOCKED",
          `o adaptador ${session.info.command} não sabe retomar conversa: ele não declara a capacidade loadSession`,
        );
      }

      return await this.load(session, cwd, loadAcpSessionId);
    }

    let created;
    try {
      created = await this.withTimeout(
        session.connection.agent.request("session/new", { cwd, mcpServers: [] }),
        "session/new",
      );
    } catch (error) {
      /*
       * The one refusal a person can act on, so it gets its own sentence.
       *
       * Everything else that goes wrong here is a broken adapter or a broken
       * machine. This one means "log in", and the place to do that is a screen —
       * so the message names it instead of surfacing a JSON-RPC code.
       */
      if (isAuthRequired(error)) {
        throw new DomainError(
          "BLOCKED",
          `o agente ${session.info.command} não tem credencial: entre na conta em "conectar um agente", no rodapé da coluna da esquerda`,
          { cause: error },
        );
      }
      throw error;
    }

    const configOptions = normaliseOptions(created.configOptions, created.modes);
    session.optionTypes = typesOf(created.configOptions);

    return {
      acpSessionId: created.sessionId,
      mode: created.modes?.currentModeId ?? valueOf(configOptions, "mode"),
      model: valueOf(configOptions, "model"),
      configOptions,
    };
  }

  /**
   * `session/load`, with the replay muted.
   *
   * The mute is lifted by the first prompt rather than here — see `replaying`. A load
   * that fails takes the adapter with it, so a session left muted is not reachable.
   */
  private async load(
    session: Session,
    cwd: string,
    acpSessionId: string,
  ): Promise<Partial<AcpSessionInfo>> {
    session.replaying = true;
    const loaded = await this.withTimeout(
      session.connection.agent.request("session/load", {
        sessionId: acpSessionId,
        cwd,
        mcpServers: [],
      }),
      "session/load",
    );

    const configOptions = normaliseOptions(loaded?.configOptions ?? undefined, loaded?.modes);
    session.optionTypes = typesOf(loaded?.configOptions ?? undefined);

    return {
      acpSessionId,
      mode: loaded?.modes?.currentModeId ?? valueOf(configOptions, "mode"),
      model: valueOf(configOptions, "model"),
      configOptions,
    };
  }

  /**
   * Switches a selector (D8).
   *
   * The one place that knows the protocol treats mode specially. Everything else
   * goes through `session/set_config_option`, and the browser sends the same
   * message either way — putting the irregularity on the wire would mean every
   * client had to learn it.
   */
  async setConfig(id: string, optionId: string, value: string): Promise<void> {
    const session = this.require(id);
    if (session.info.state === "exited") {
      throw new DomainError("SESSION_EXITED", `session ${id} has exited`);
    }

    /*
     * Refused while a turn is running, with a reason.
     *
     * The protocol does not say what `session/set_mode` means half way through a
     * turn, and the agent may already have acted under the old one. Applying it
     * silently would let the user believe they changed the rules for what is
     * happening now, which is the worst of the three options — the other two being
     * refuse, or apply it to the next turn and say so.
     *
     * Open as A15: someone who sees a dangerous call and wants to tighten the mode
     * *right now* has a real case, and the permission dialog is the answer today.
     */
    if (session.promptInFlight) {
      throw new DomainError(
        "BLOCKED",
        "não dá para trocar de modo ou modelo no meio de um turno: interrompa ou espere ele acabar",
      );
    }

    if (optionId === MODE_OPTION) {
      await session.connection.agent.request("session/set_mode", {
        sessionId: session.info.acpSessionId,
        modeId: value,
      });
      session.info.mode = value;
      this.emitConfig(session);
      return;
    }

    const kind = session.optionTypes.get(optionId);
    if (!kind) {
      throw new DomainError("NOT_FOUND", `o agente não oferece a opção "${optionId}"`);
    }

    const response = await session.connection.agent.request("session/set_config_option", {
      sessionId: session.info.acpSessionId,
      configId: optionId,
      // The wire carries a string because a select is the common case; the one
      // boolean option is coerced here, where the declared type is known.
      ...(kind === "boolean" ? { type: "boolean", value: value === "true" } : { type: "select", value }),
    });

    // The agent answers with the whole set, which is also how it reports a value
    // it adjusted on its own — asking for `sonnet` and being given `sonnet[1m]`,
    // say. Trusting the request over the response would show a value that is not
    // the one in effect.
    const configOptions = normaliseOptions(response.configOptions, undefined);
    session.optionTypes = typesOf(response.configOptions);
    session.info.configOptions = configOptions;
    session.info.model = valueOf(configOptions, "model") || session.info.model;
    this.emitConfig(session);
  }

  /** The selectors as an event, so every attached client sees the same switch. */
  private emitConfig(session: Session): void {
    this.emit(session, {
      type: "config",
      mode: session.info.mode,
      options: [...session.info.configOptions],
      modeOwner: modeOwnerOf(session.info),
      lumemMode: session.info.lumemMode,
      lumemModeDefault: session.info.lumemModeDefault,
    });

    for (const watcher of [...this.configWatchers]) {
      try {
        watcher({ ...session.info });
      } catch {
        /* a broken watcher must not take the daemon with it */
      }
    }
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

    const entry: AcpTranscriptEntry = { at: this.now(), event };
    try {
      this.transcripts.append(session.info.id, entry);
    } catch (error) {
      // A disk that refuses the write must not take the turn with it. Losing one
      // line of the record is bad; losing the answer the user is waiting for
      // because the record could not be written is worse.
      this.log?.warn(
        { sessionId: session.info.id, err: error },
        "falha ao gravar a transcrição, evento só foi entregue ao vivo",
      );
    }

    // A throwing listener must not take down the daemon or starve the other
    // attached clients — the same rule the PTY manager follows.
    for (const listener of [...session.listeners]) {
      try {
        listener(entry);
      } catch {
        /* a broken client is the client's problem */
      }
    }

    // E os observadores globais, pela mesma regra: um que estoura não pode levar
    // o turno com ele.
    for (const watcher of [...this.eventWatchers]) {
      try {
        watcher({ sessionId: session.info.id, event });
      } catch {
        /* um observador quebrado é problema dele */
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

    /*
     * The agent's terminals go with it.
     *
     * They are children of the daemon, not of the adapter, so nothing else would
     * end them — and an orphaned shell with nothing pointing at it is precisely
     * what `killAll` exists to prevent for the sessions the user started.
     */
    for (const ptySessionId of session.terminals?.ptySessionIds() ?? []) {
      try {
        this.ptyManager?.kill(ptySessionId);
      } catch {
        /* already gone is the common case, not a failure */
      }
    }

    // A probe has no row anywhere, so there is nothing for a watcher to update.
    if (session.probe) return;

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

/** The one option the protocol has a dedicated call for. */
const MODE_OPTION = "mode";

/**
 * The agent's selectors, in the shape the browser reads.
 *
 * Two facts about `configOptions` cost a bug each before a real handshake said
 * so, and both are absorbed here: an option is keyed by **`value`** rather than
 * `id`, and its choices may arrive **grouped** rather than flat. A reader that
 * assumes either renders an empty dropdown with nothing to explain it.
 *
 * `modes` is folded in as the `mode` option when `configOptions` does not already
 * carry one. The adapter seen so far sends both, and the dedicated `modes` field
 * is the authority on which one is current.
 */
function normaliseOptions(
  raw: readonly unknown[] | null | undefined,
  modes: { currentModeId: string; availableModes: readonly unknown[] } | null | undefined,
): AcpConfigOption[] {
  const options = (raw ?? []).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record["id"] !== "string") return [];

    return [
      {
        id: record["id"],
        name: typeof record["name"] === "string" ? record["name"] : record["id"],
        category: typeof record["category"] === "string" ? record["category"] : null,
        currentValue: currentValueOf(record),
        choices: flattenChoices(record["options"]),
      },
    ];
  });

  if (modes && !options.some((option) => option.id === MODE_OPTION)) {
    options.unshift({
      id: MODE_OPTION,
      name: "Mode",
      category: MODE_OPTION,
      currentValue: modes.currentModeId,
      choices: flattenChoices(modes.availableModes),
    });
  }

  return options;
}

/** A boolean option reports `true`; the wire carries strings. */
function currentValueOf(record: Record<string, unknown>): string {
  const value = record["currentValue"];
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return "";
}

/** What kind of value each option takes, for `session/set_config_option`. */
function typesOf(raw: readonly unknown[] | null | undefined): Map<string, "select" | "boolean"> {
  const types = new Map<string, "select" | "boolean">();
  for (const entry of raw ?? []) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record["id"] !== "string") continue;
    types.set(record["id"], record["type"] === "boolean" ? "boolean" : "select");
  }
  return types;
}

function valueOf(options: readonly AcpConfigOption[], id: string): string {
  return options.find((option) => option.id === id)?.currentValue ?? "";
}

/**
 * Select choices, flat or grouped, as one list.
 *
 * A group carries its own `options` and no value of its own, so it recurses. Also
 * accepts the `modes` shape, which keys by `id` — the only place two shapes meet,
 * and folding them here keeps every reader downstream on one.
 */
function flattenChoices(options: unknown): AcpConfigOption["choices"] {
  if (!Array.isArray(options)) return [];

  return options.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;

    if (Array.isArray(record["options"])) return flattenChoices(record["options"]);

    const value = record["value"] ?? record["id"];
    if (typeof value !== "string") return [];
    return [
      {
        value,
        name: typeof record["name"] === "string" ? record["name"] : value,
        description: typeof record["description"] === "string" ? record["description"] : null,
      },
    ];
  });
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
 * The adapter is not on the PATH.
 *
 * Its own error rather than a generic spawn failure, because it is the one
 * launch failure with a known cure — and the install line is built from the
 * pinned version so it cannot drift from `agent_config` and send the user to
 * install something this session would refuse (A12).
 */
function notInstalled(command: string, adapterVersion: string | undefined): DomainError {
  const pinned = adapterVersion ?? "";
  const remedy = pinned
    ? `npm i -g @agentclientprotocol/claude-agent-acp@${pinned}`
    : `instale o adaptador e deixe "${command}" no PATH`;
  const version = pinned ? ` Esta sessão fixa a versão ${pinned}.` : "";

  return new DomainError(
    "SPAWN_FAILED",
    `"${command}" não está no PATH.${version} Para resolver: ${remedy}`,
  );
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

/**
 * Whether a failure is the agent saying "log in first".
 *
 * By code, not by message: the text is the adapter's and may be translated or
 * reworded, while `-32000` is the protocol's (`RequestError.authRequired`).
 */
function isAuthRequired(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === ACP_AUTH_REQUIRED_CODE;
}

/**
 * One `authMethods` entry, in the shape a screen can act on.
 *
 * The command comes from `_meta["terminal-auth"]` when the adapter sent it. A
 * `terminal` method without that meta has `args` but no binary to run them
 * against — the adapter means "itself", and guessing which of its two names is on
 * this machine is exactly the guess that produced the wrong install command in
 * the first place. So it reports `command: null` and the screen says why.
 */
function toAuthMethod(method: {
  id: string;
  name?: string | null;
  description?: string | null;
  type?: string;
  args?: readonly string[];
  _meta?: Record<string, unknown> | null;
}): AcpAuthMethod {
  const meta = method._meta?.["terminal-auth"] as
    | { command?: string; args?: string[]; label?: string }
    | undefined;

  const type =
    method.type === "terminal" || method.type === "agent" || method.type === "env_var"
      ? method.type
      : "unknown";

  return {
    id: method.id,
    name: method.name ?? method.id,
    description: method.description ?? null,
    type,
    command: type === "terminal" ? meta?.command ?? null : null,
    args: meta?.args ?? [...(method.args ?? [])],
    label: meta?.label ?? null,
  };
}
