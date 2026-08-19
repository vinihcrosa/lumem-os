import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import type { EventBus } from "../events.js";
import type { AcpServerMessage } from "@lumem/shared";

import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { AcpManager } from "../acp/AcpManager.js";
import type { PtyManager } from "../pty/PtyManager.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import {
  createSessionRepository,
  type ScopeType,
  type SessionKind,
} from "../repositories/session.js";

/**
 * The process and its record, kept in step.
 *
 * `PtyManager` owns the process and knows nothing about storage; the
 * repository owns the row and knows nothing about processes. This is the one
 * place that holds both, so neither has to learn about the other.
 */

export interface StartSessionInput {
  kind: SessionKind;
  agentConfigId?: string | null;
  scopeType: ScopeType;
  scopeId: string;
  cwd: string;
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cols?: number;
  rows?: number;
  /**
   * Which manager owns this session, from the agent configuration.
   *
   * Passed in rather than looked up: the router already holds the configuration
   * it validated, and reading it a second time here would let the two reads
   * disagree if it changed in between. Defaults to `pty`, so a caller written
   * before ACP existed keeps producing the session it used to.
   */
  transport?: "pty" | "acp";
  /** Pinned adapter version, for the launch failure message (F1.6). */
  adapterVersion?: string | null;
}

export interface SessionStore {
  start(input: StartSessionInput): Promise<SessionRow>;
  /**
   * Continues a conversation that has already ended (F5.2, D12).
   *
   * Produces a **new** row carrying the old one's `acpSessionId` and pointing back at
   * it, because `session/load` starts a new adapter rather than reviving the dead
   * one. The old row keeps its state and its transcript.
   */
  resume(id: string): Promise<SessionRow>;
  /**
   * A finished conversation, read from disk (F5.4, D13).
   *
   * The same frame the websocket sends on attach, so the client has one input rather
   * than two shapes to reconcile — and nothing is launched to produce it.
   */
  transcript(id: string): Promise<AcpAttachedFrame>;
  close(id: string): Promise<void>;
  findById(id: string): Promise<SessionRow | undefined>;
  listByScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  listRunningInScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  /**
   * Keeps records following processes that die on their own.
   *
   * Returns an unsubscribe function. Call it once at boot: without it a crashed
   * agent stays `running` in the database forever, and F4.9 would then block
   * removals on sessions that are long gone.
   */
  trackExits(log?: Pick<FastifyBaseLogger, "warn">): () => void;
}

/**
 * What an attaching client is sent, for a session that is not running.
 *
 * The websocket's own frame, not a shape of its own: the client rebuilds the view from
 * one input either way, and two shapes would be two ways for the same conversation to
 * look different.
 */
export type AcpAttachedFrame = Extract<AcpServerMessage, { type: "attached" }>;

export interface SessionStoreOptions {
  db: Db;
  ptyManager: PtyManager;
  /**
   * Owner of ACP sessions.
   *
   * Optional so that a caller which only ever starts shells does not have to
   * build one. Asking for an ACP session without it is a domain error rather
   * than a crash: it is a wiring mistake, and it should read like one.
   */
  acpManager?: AcpManager;
  /**
   * Told when a process dies on its own.
   *
   * F3.7 covers this case specifically: an agent that hits its quota or crashes
   * changes the sidebar without anyone having clicked anything.
   */
  events?: EventBus;
}

export function createSessionStore({
  db,
  ptyManager,
  acpManager,
  events,
}: SessionStoreOptions): SessionStore {
  const sessions = createSessionRepository(db);

  return {
    async start(input) {
      const { kind, agentConfigId = null, scopeType, scopeId, cwd, command } = input;

      // A shell is always a PTY (F1.2). The column enforces it too, but failing
      // here says why, instead of surfacing a CHECK the caller has to decode.
      const transport = kind === "shell" ? "pty" : (input.transport ?? "pty");

      if (transport === "acp") {
        if (!acpManager) {
          throw new DomainError(
            "INVALID_ARGUMENT",
            "esta instância não sabe iniciar sessão ACP: nenhum AcpManager foi ligado",
          );
        }

        // The agent first, so its id is the record's id — the same identity rule
        // the PTY path follows, for the same reason.
        const agent = await acpManager.spawn({
          command,
          ...(input.args ? { args: input.args } : {}),
          cwd,
          ...(input.env ? { env: input.env } : {}),
          ...(input.adapterVersion ? { adapterVersion: input.adapterVersion } : {}),
        });

        try {
          return await sessions.create({
            id: agent.id,
            kind,
            agentConfigId,
            scopeType,
            scopeId,
            cwd,
            command,
            transport: "acp",
            acpSessionId: agent.acpSessionId,
            mode: agent.mode,
            model: agent.model,
          });
        } catch (error) {
          // A conversation the daemon cannot describe is one nobody can find or
          // stop from the UI. Kill it rather than leak it.
          acpManager.kill(agent.id);
          throw error;
        }
      }

      // The process first, so its id is the record's id: one identity for both
      // halves means no mapping table and no way for them to drift.
      const spawned = ptyManager.spawn({
        command,
        ...(input.args ? { args: input.args } : {}),
        cwd,
        ...(input.env ? { env: input.env } : {}),
        ...(input.cols === undefined ? {} : { cols: input.cols }),
        ...(input.rows === undefined ? {} : { rows: input.rows }),
      });

      try {
        return await sessions.create({
          id: spawned.id,
          kind,
          agentConfigId,
          scopeType,
          scopeId,
          cwd,
          command,
          transport: "pty",
        });
      } catch (error) {
        ptyManager.kill(spawned.id);
        throw error;
      }
    },

    async resume(id) {
      const row = await sessions.findById(id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);

      // Only ACP resumes, and that follows from D1 rather than being a separate rule:
      // transport is chosen at birth, a resumed session is born from `session/load`,
      // and `session/load` is a thing only an ACP adapter has.
      if (row.transport !== "acp") {
        throw new DomainError(
          "BLOCKED",
          "só conversa ACP pode ser retomada: um shell não tem conversa para carregar",
        );
      }
      // A live conversation needs no resuming — it needs the tab that is already
      // showing it. Launching a second adapter against the same conversation would
      // give the user two windows onto one history, both able to write.
      if (row.state === "running") {
        throw new DomainError("BLOCKED", `a sessão ${id} ainda está viva: não há o que retomar`);
      }
      if (!row.acpSessionId) {
        throw new DomainError(
          "BLOCKED",
          `a sessão ${id} não guardou o id da conversa no adaptador, e sem ele não há o que carregar`,
        );
      }
      if (!acpManager) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "esta instância não sabe retomar sessão ACP: nenhum AcpManager foi ligado",
        );
      }

      /*
       * `command` from the row, `args` and the pinned version from the configuration.
       *
       * The split is not arbitrary. What this session *is* was decided at birth and is
       * on the row (D1); how the adapter is invoked today is configuration, and a
       * version that has been bumped since yesterday is the version the user now wants
       * to run. Resuming into a different adapter build is a real risk and it is the
       * same risk as launching a new session into it, which is what A12 already
       * answers by making the version data rather than `@latest`.
       */
      const config = row.agentConfigId
        ? await createAgentConfigRepository(db).findById(row.agentConfigId)
        : undefined;

      const agent = await acpManager.resume({
        command: row.command,
        ...(config?.args?.length ? { args: config.args } : {}),
        cwd: row.cwd,
        ...(config?.env && Object.keys(config.env).length > 0 ? { env: config.env } : {}),
        ...(config?.adapterVersion ? { adapterVersion: config.adapterVersion } : {}),
        acpSessionId: row.acpSessionId,
        // What makes the new session's transcript self-contained (D15): the old
        // conversation is copied in front of it, and the separator recorded after.
        fromSessionId: row.id,
      });

      try {
        return await sessions.create({
          id: agent.id,
          kind: row.kind as SessionKind,
          agentConfigId: row.agentConfigId,
          scopeType: row.scopeType as ScopeType,
          scopeId: row.scopeId,
          cwd: row.cwd,
          command: row.command,
          transport: "acp",
          acpSessionId: agent.acpSessionId,
          mode: agent.mode,
          model: agent.model,
          resumedFromId: row.id,
        });
      } catch (error) {
        // Same rule as `start`: a conversation the daemon cannot describe is one
        // nobody can find or stop from the UI.
        acpManager.kill(agent.id);
        throw error;
      }
    },

    async transcript(id) {
      const row = await sessions.findById(id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);
      if (row.transport !== "acp") {
        throw new DomainError("BLOCKED", "um shell não tem conversa: o que ele tem é scrollback");
      }
      if (!acpManager) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "esta instância não sabe ler conversa ACP: nenhum AcpManager foi ligado",
        );
      }

      return {
        type: "attached" as const,
        sessionId: row.id,
        state: row.state === "running" ? ("running" as const) : ("exited" as const),
        acpSessionId: row.acpSessionId ?? "",
        model: row.model ?? "",
        mode: row.mode ?? "",
        /*
         * Empty, and honestly so.
         *
         * The selectors are the *agent's* answer to what it offers, and there is no
         * agent here. The row remembers which model and mode were in effect (D9) and
         * those are shown; a list of choices nobody can choose from would be an
         * interface offering something it cannot do.
         */
        configOptions: [],
        transcript: [...acpManager.storedTranscript(row.id)],
      };
    },

    async close(id) {
      const row = await sessions.findById(id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);
      if (row.state === "exited") return;

      // The record is not written here: killing is asynchronous, and the exit
      // watcher is what records the code the process actually exited with.
      // Which manager to ask comes from the row, not from the configuration —
      // the configuration may have been edited since this session was born.
      if (row.transport === "acp") acpManager?.kill(id);
      else ptyManager.kill(id);
    },

    findById: (id) => sessions.findById(id),
    listByScope: (scopeType, scopeId) => sessions.listByScope(scopeType, scopeId),
    listRunningInScope: (scopeType, scopeId) => sessions.listRunningInScope(scopeType, scopeId),

    trackExits(log) {
      // One recorder, both transports. A death is a death: an agent that hits
      // its quota and a shell the user typed `exit` into leave the same row in
      // the same wrong state if nobody writes it down.
      const record = (id: string, exitCode: number | null): void => {
        // Fire and forget: this runs inside an exit callback, which cannot
        // await, and a failed write must not take the daemon down.
        void (async () => {
          // Read before writing: the scope is what the event has to carry, and
          // after the update it is still there — but one read is enough.
          const row = await sessions.findById(id);
          await sessions.markExited(id, exitCode ?? 0);
          if (row) {
            events?.emit({
              type: "session.changed",
              scopeType: row.scopeType as "project" | "worktree",
              scopeId: row.scopeId,
            });
          }
        })().catch((error: unknown) => {
          log?.warn({ session: id, err: error }, "falha ao registrar saída de sessão");
        });
      };

      const offPty = ptyManager.watchExits((info) => record(info.id, info.exitCode));
      const offAcp = acpManager?.watchExits((info) => record(info.id, info.exitCode));

      /*
       * D9: the switch persists on the session, not on the configuration.
       *
       * Hooked to the same subscription as the exits because it has the same shape
       * of problem — the manager holds the truth, the row has to follow it, and
       * neither should have to know about the other. Without this, reopening a tab
       * would show the configuration's default instead of what was chosen.
       */
      const offConfig = acpManager?.watchConfig((info) => {
        void sessions
          .setConfig(info.id, { mode: info.mode, model: info.model })
          .catch((error: unknown) => {
            log?.warn({ session: info.id, err: error }, "falha ao registrar troca de configuração");
          });
      });

      return () => {
        offPty();
        offAcp?.();
        offConfig?.();
      };
    },
  };
}
