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

export type ErrorKind = "consulta" | "ação" | "app";

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

const STORAGE_KEY = "lumem.errorLog";
/** Old bugs matter less than fresh ones, and localStorage is not infinite. */
const CAP = 200;

let entries: ErrorEntry[] = load();
let seq = 0;
const listeners = new Set<() => void>();

function load(): ErrorEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorEntry[]) : [];
  } catch {
    // A corrupt or unavailable store is an empty log, never a crash on boot.
    return [];
  }
}

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

function stamp(ms: number): string {
  return new Date(ms).toISOString();
}

/** One error as plain text, the shape a bug report wants. */
export function formatError(entry: ErrorEntry): string {
  const times = entry.count > 1 ? ` ×${entry.count}` : "";
  const head = `[${stamp(entry.at)}] ${entry.kind} · ${entry.label}${times}`;
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
