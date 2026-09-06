/**
 * Where the daemon is allowed to listen, and the only names a request may
 * address it by (daemon-auth, F1 and S5).
 *
 * Shared because two things have to agree on it without talking: the CLI, which
 * refuses `--host` before anything starts, and the daemon, which refuses
 * `LUMEM_HOST` at configuration time and every `Host` header afterwards. Two
 * hand-written lists is how one of them ends up accepting `0.0.0.0`.
 *
 * Deliberately three names and not a prefix match on `127.`: the allowlist has to
 * be enumerable, because the `Host` header carries the port and the daemon
 * compares the whole `hostname:port` string.
 */

/** The three ways a browser or a `curl` spells this machine. IPv6 bracketed, as `Host` carries it. */
export const LOOPBACK_HOSTNAMES = ["127.0.0.1", "localhost", "[::1]"] as const;

function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  // `::1` is how a bind address is written; `[::1]` is how a `Host` header and a
  // URL carry it. Accept both spellings and compare on one.
  return trimmed === "::1" ? "[::1]" : trimmed;
}

/** Whether a bind address or a bare hostname is one of this machine's loopback names. */
export function isLoopbackHost(host: string): boolean {
  return (LOOPBACK_HOSTNAMES as readonly string[]).includes(normalizeHostname(host));
}

/** The `hostname:port` values a `Host` header may carry for a daemon on `port`. */
export function loopbackAuthorities(port: number): readonly string[] {
  return LOOPBACK_HOSTNAMES.map((name) => `${name}:${String(port)}`);
}

/** The origins the daemon itself is served from: the web it serves lives on the same port. */
export function loopbackOrigins(port: number): readonly string[] {
  return loopbackAuthorities(port).map((authority) => `http://${authority}`);
}
