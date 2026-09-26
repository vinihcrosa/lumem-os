/**
 * How long ago, in words, for something that started at `iso`.
 *
 * Reads an ISO string rather than a `Date` because that is what the daemon
 * sends: there is no tRPC transformer in play, so a timestamp column crosses
 * the wire as text. The types say so too — this just makes the conversion the
 * one obvious place instead of scattering `new Date(...)` across components.
 *
 * Minutes and hours only. A session's age is a glance, not a measurement, and
 * "há 3 minutos e 12 segundos" is worse at answering "is this one stuck?".
 */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return "";

  const seconds = Math.max(0, Math.round((now - started) / 1000));
  if (seconds < 60) return "agora";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}

/**
 * "3 s", "12 min", "4 h", "2 d" — from a millisecond delta the caller already
 * computed, not from an instant to compare against `now`.
 *
 * Moved from `pr-words.ts` (`032` T20), where it backed `freshnessOf`. It
 * looks like `relativeAge` with the corners filed off, and isn't folded into
 * it: a PR's freshness badge has to say "3 s" the moment it updates, while
 * `relativeAge` collapses anything under a minute to "agora" on purpose (a
 * session's age is a glance, not a stopwatch). Same shape, different question.
 */
export function agoOf(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h`;
  return `${String(Math.floor(hours / 24))} d`;
}

/**
 * "hoje", "ontem", "há 5 dias" — day granularity, with the two closest days
 * named instead of counted.
 *
 * Moved from `MemoryPanel.tsx` (`032` T20), where it lived as `lastUse` and
 * returned the whole sentence ("último uso hoje"). The prefix is the one
 * caller's copy, not part of what the function measures, so it stays at the
 * call site and this returns the bare phrase.
 */
export function daysAgo(at: Date | string): string {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${String(days)} dias`;
}

/**
 * An absolute stamp — day, hour and minute always; the month as digits for a
 * list where every row needs the same width, or as a word for a divider that
 * stands alone and reads better spelled out.
 *
 * Moved from two places that had each hand-written the same four `Intl`
 * fields under a different name (`032` T20): `MemoryPanel.tsx`'s
 * `formatStamp` (numeric month) and `Conversation.tsx`'s `formatWhen` (word
 * month) — the two `formatWhen`s collided by name for unrelated functions,
 * which is why this one is named by what it renders instead.
 */
export function absoluteStamp(when: Date | string | number, month: "2-digit" | "short" = "2-digit"): string {
  return new Date(when).toLocaleString("pt-BR", {
    day: "2-digit",
    month,
    hour: "2-digit",
    minute: "2-digit",
  });
}
