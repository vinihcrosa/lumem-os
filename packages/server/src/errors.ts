/**
 * Domain failures the daemon raises on purpose, as opposed to bugs.
 *
 * Every one of these is a case a caller can reasonably hit and should be shown
 * a real message for. Anything that escapes as a plain Error is a defect.
 */
export type DomainErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_EXITED"
  | "SPAWN_FAILED"
  | "INVALID_ARGUMENT"
  /** Nothing with that id. */
  | "NOT_FOUND"
  /** A name or path already taken. */
  | "DUPLICATE"
  /** Refused because something else still depends on it. */
  | "IN_USE"
  /** The state forbids it — a dirty worktree, a live session. */
  | "BLOCKED"
  /** A database constraint nobody mapped. Always a defect in the mapping. */
  | "CONSTRAINT_VIOLATION"
  /** A git command failed; the message is git's own, untranslated. */
  | "GIT_FAILED";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
