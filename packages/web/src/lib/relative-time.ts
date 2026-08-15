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
