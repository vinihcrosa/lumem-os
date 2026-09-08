/**
 * The one place every error the client saw is kept, so nothing fails in silence.
 *
 * A banner tells you *this* action broke; it is gone the moment you navigate
 * away. This is the opposite: a durable list of everything that went wrong,
 * newest first, that survives a reload and can be copied out whole to hand to
 * whoever fixes the bug.
 *
 * An external store rather than React state on purpose. The errors are recorded
 * from the query and mutation caches and from `window` — none of which is inside
 * a component — so the store has to live outside React and be read through
 * `useSyncExternalStore`.
 */

/**
 * The source of an error, in code. English because it is an identifier that also
 * gets written to `localStorage`; the Portuguese the user reads is derived at
 * render, so renaming the label never touches what is on disk.
 */
export type ErrorKind = "query" | "mutation" | "app";

export interface ErrorEntry {
  id: string;
  /** First and most recent time this exact error was seen (ms). */
  at: number;
  firstAt: number;
  /** How many times it repeated — a failing poll collapses into one row. */
  count: number;
  kind: ErrorKind;
  /** The tRPC path, the query key, or where a window error came from. */
  label: string;
  message: string;
  /** Stack or extra data, for the copy that a fix actually needs. */
  detail: string | null;
}

/**
 * Versioned on purpose. The shape of an entry is now a contract with what is on
 * disk, and a reader that trusted an old or hand-edited shape would print
 * `undefined` or `Invalid Date`. Bumping the suffix discards anything that does
 * not match — which is also how the `ErrorKind` rename costs no migration.
 */
const STORAGE_KEY = "lumem.errorLog.v1";
/** Old bugs matter less than fresh ones, and localStorage is not infinite. */
const CAP = 200;

const KINDS = new Set<ErrorKind>(["query", "mutation", "app"]);

// Declared and initialised before `load()` runs below: `load` validates through
// `isEntry`, which reads `KINDS`, and a `const` in its temporal dead zone would
// throw — a throw `load` catches, silently turning a full disk into an empty log.
let seq = 0;
const listeners = new Set<() => void>();

/** Only a shape this version wrote survives a reload; the rest is discarded. */
function isEntry(value: unknown): value is ErrorEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["id"] === "string" &&
    typeof entry["at"] === "number" &&
    typeof entry["firstAt"] === "number" &&
    typeof entry["count"] === "number" &&
    typeof entry["label"] === "string" &&
    typeof entry["message"] === "string" &&
    (entry["detail"] === null || typeof entry["detail"] === "string") &&
    KINDS.has(entry["kind"] as ErrorKind)
  );
}

function load(): ErrorEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    // A corrupt or unavailable store is an empty log, never a crash on boot.
    return [];
  }
}

// After `load`, `isEntry` and `KINDS` all exist, so the boot read is validated
// rather than throwing into the catch above.
let entries: ErrorEntry[] = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A log that cannot be written to disk is still a log for this session.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeErrors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable between changes, which `useSyncExternalStore` requires. */
export function errorSnapshot(): ErrorEntry[] {
  return entries;
}

export interface RecordErrorInput {
  kind: ErrorKind;
  label: string;
  message: string;
  detail?: string | null;
}

export function recordError(input: RecordErrorInput): void {
  const now = Date.now();
  // The same error, again, is a count and a fresher timestamp — not a new row.
  // Without this a daemon that is down floods the log every poll and buries the
  // one error that is actually a bug.
  const existing = entries.find(
    (entry) =>
      entry.kind === input.kind &&
      entry.label === input.label &&
      entry.message === input.message,
  );
  if (existing !== undefined) {
    const bumped: ErrorEntry = {
      ...existing,
      at: now,
      count: existing.count + 1,
      detail: input.detail ?? existing.detail,
    };
    entries = [bumped, ...entries.filter((entry) => entry.id !== existing.id)];
    persist();
    emit();
    return;
  }

  seq += 1;
  const entry: ErrorEntry = {
    id: `${now}-${seq}`,
    at: now,
    firstAt: now,
    count: 1,
    kind: input.kind,
    label: input.label,
    message: input.message,
    detail: input.detail ?? null,
  };
  entries = [entry, ...entries].slice(0, CAP);
  persist();
  emit();
}

export function dismissError(id: string): void {
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  persist();
  emit();
}

export function clearErrors(): void {
  if (entries.length === 0) return;
  entries = [];
  persist();
  emit();
}

/** The Portuguese the user reads, kept out of what is written to disk. */
const KIND_LABEL: Record<ErrorKind, string> = {
  query: "consulta",
  mutation: "ação",
  app: "app",
};

export function kindLabel(kind: ErrorKind): string {
  return KIND_LABEL[kind];
}

function stamp(ms: number): string {
  return new Date(ms).toISOString();
}

/** One error as plain text, the shape a bug report wants. */
export function formatError(entry: ErrorEntry): string {
  const times = entry.count > 1 ? ` ×${entry.count}` : "";
  const head = `[${stamp(entry.at)}] ${kindLabel(entry.kind)} · ${entry.label}${times}`;
  const body = entry.detail === null ? entry.message : `${entry.message}\n${entry.detail}`;
  return `${head}\n${body}`;
}

/** The whole log as plain text, newest first — what "copy all" produces. */
export function formatErrorLog(list: ErrorEntry[]): string {
  return list.map(formatError).join("\n\n");
}

/**
 * Pulls a readable label and message out of whatever was thrown.
 *
 * A tRPC client error carries the procedure path in `data.path`; using it means
 * the log says "session.resume" instead of the query key React Query happened to
 * cache it under.
 */
export function describeError(error: unknown): { label: string | null; message: string; detail: string | null } {
  const path = (error as { data?: { path?: unknown } } | null)?.data?.path;
  const label = typeof path === "string" && path.length > 0 ? path : null;
  if (error instanceof Error) {
    return { label, message: error.message, detail: error.stack ?? null };
  }
  return { label, message: String(error), detail: null };
}

/**
 * Whether a failed call is a defect worth logging, or a normal answer.
 *
 * Most failed queries are the daemon saying "no" on purpose: a path that is not
 * a repo (`NOT_FOUND`/`BAD_REQUEST`), a worktree off disk in a poll (`CONFLICT`
 * from `BLOCKED`), an adapter not installed. Those already have their own inline
 * sentence on screen; putting them in the bug log would make the badge noise on
 * the first onboarding with a typo. Only a defect on the server
 * (`INTERNAL_SERVER_ERROR`) or a call that never reached it — no `data`, i.e. a
 * network or parse failure, the daemon unreachable — is a bug.
 */
export function isReportableError(error: unknown): boolean {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  if (data === undefined || data === null) return true;
  return data.code === "INTERNAL_SERVER_ERROR";
}
