import { initTRPC, TRPCError } from "@trpc/server";

import type { ServerConfig } from "./config.js";
import type { Db } from "./db/index.js";
import type { EventBus } from "./events.js";
import { isDomainError, type DomainErrorCode } from "./errors.js";
import type { AcpManager } from "./acp/AcpManager.js";
import type { CloneJobStore } from "./git/CloneJobStore.js";
import type { GitService } from "./git/GitService.js";
import type { PtyManager } from "./pty/PtyManager.js";
import type { SessionStore } from "./sessions/SessionStore.js";

/**
 * Everything a procedure is allowed to reach. Repositories and services are
 * added here as they land, so procedures never import singletons directly —
 * that is what keeps them testable without booting the whole daemon.
 */
export interface Context {
  config: ServerConfig;
  db: Db;
  ptyManager: PtyManager;
  /**
   * Reachable directly, and only for the probe (onboarding F3.3).
   *
   * Everything else about a conversation goes through `sessionStore`, which is
   * what keeps a row and a process from disagreeing. The probe has no row on
   * purpose (D4), so it is the one caller with nothing for the store to do.
   */
  acpManager: AcpManager;
  sessionStore: SessionStore;
  git: GitService;
  /**
   * The clone that is running, if any. In memory, and one at a time — Q4, Q17.
   */
  clones: CloneJobStore;
  events: EventBus;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const DOMAIN_TO_TRPC: Record<DomainErrorCode, TRPCError["code"]> = {
  SESSION_NOT_FOUND: "NOT_FOUND",
  NOT_FOUND: "NOT_FOUND",
  // The request was well formed and the state refused it — that is 409, not 400.
  SESSION_EXITED: "CONFLICT",
  DUPLICATE: "CONFLICT",
  IN_USE: "CONFLICT",
  BLOCKED: "CONFLICT",
  INVALID_ARGUMENT: "BAD_REQUEST",
  GIT_FAILED: "BAD_REQUEST",
  SPAWN_FAILED: "INTERNAL_SERVER_ERROR",
  // Reaching here means a repository forgot to declare a constraint it can hit.
  CONSTRAINT_VIOLATION: "INTERNAL_SERVER_ERROR",
};

/**
 * Turns a domain failure into the HTTP-shaped error tRPC expects.
 *
 * Anything that is not a `DomainError` is a defect and keeps its
 * INTERNAL_SERVER_ERROR, which is what `onError` in server.ts logs loudly.
 * Domain messages are passed through verbatim: the PRD wants the user to read
 * what actually failed, not a category.
 */
export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (isDomainError(error)) {
    return new TRPCError({
      code: DOMAIN_TO_TRPC[error.code],
      message: error.message,
      cause: error,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

/** Runs `body`, translating any domain failure on the way out. */
export function domainSafe<TResult>(body: () => TResult): TResult {
  try {
    return body();
  } catch (error) {
    throw toTRPCError(error);
  }
}

/** Same, for the repositories — where every call is a promise. */
export async function domainSafeAsync<TResult>(body: () => Promise<TResult>): Promise<TResult> {
  try {
    return await body();
  } catch (error) {
    throw toTRPCError(error);
  }
}
