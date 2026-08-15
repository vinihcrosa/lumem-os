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
  | "INVALID_ARGUMENT";

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
