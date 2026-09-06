import { loopbackAuthorities, loopbackOrigins } from "@lumem/shared";

/**
 * Who may talk to the daemon — phase 1 of daemon-auth, as pure decisions.
 *
 * The daemon executes commands with the user's permissions and, until this
 * module, checked nothing about who asked. Three attacks work from a browser tab
 * without the daemon ever leaving loopback (PRD §2):
 *
 * 1. **DNS rebinding.** A page on `evil.example` re-resolves its own name to
 *    `127.0.0.1`; to the browser that is the same origin, so no CORS applies.
 *    The daemon sees `Host: evil.example:4317`, and the `Host` check is the only
 *    defence — and a sufficient one.
 * 2. **Cross-site WebSocket hijack.** WebSocket ignores CORS; any page can open
 *    `ws://127.0.0.1:4317/acp?session=…`. Browsers always send `Origin` on an
 *    upgrade, so the `Origin` check closes this regardless of the session id.
 * 3. **`GET` with side effects.** `GET /memory/ask` records usage and, with
 *    auto-learn on, spends tokens. An `<img src=…>` on any page fires it.
 *    `Sec-Fetch-Site: cross-site` is what every modern browser sends there.
 *
 * What passes on purpose: a request with **no** browser signal at all — no
 * `Origin`, no `Sec-Fetch-Site`. That is `curl`, the e2e's API calls and the
 * agent asking the memory. It is the product's own door (PRD §3), and closing
 * it is phase 2's job, with a credential the daemon hands the agent itself.
 *
 * Nothing here reads the network or Fastify: the request is a plain record, so
 * every branch is a unit test.
 */

export type Verdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 421 | 403; readonly reason: string };

export interface OriginPolicy {
  /** The port the daemon is listening on — the `Host` header has to carry it. */
  readonly port: number;
  /**
   * Origins besides the daemon's own that may drive it from a browser.
   *
   * In production the list is empty in effect: the daemon serves the web on its
   * own port, so the only origin is its own. The default here is the vite dev
   * server, which is a second origin only while developing (`LUMEM_WEB_ORIGINS`).
   */
  readonly webOrigins: readonly string[];
}

/** The one request shape both the Fastify hook and the upgrade router hand over. */
export interface GuardedRequest {
  readonly method: string;
  /** Path only — no query string. */
  readonly pathname: string;
  readonly headers: {
    readonly host?: string | undefined;
    readonly origin?: string | undefined;
    readonly "sec-fetch-site"?: string | undefined;
  };
  /** A WebSocket handshake. Every upgrade is checked for `Origin`, whatever its path. */
  readonly upgrade: boolean;
}

/**
 * Where a `GET` is not harmless: the memory door has effects (PRD §2.3), and it
 * is the only `GET` route that does. A second one would be listed here, and the
 * test that guards this list is what makes adding it a decision.
 */
const EFFECTFUL_GET_PATHS: ReadonlySet<string> = new Set(["/memory/ask"]);

/** `GET` and `HEAD` are the safe methods; everything else is a mutation as far as the guard cares. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

export function allowedHosts(policy: OriginPolicy): ReadonlySet<string> {
  return new Set(loopbackAuthorities(policy.port));
}

export function allowedOrigins(policy: OriginPolicy): ReadonlySet<string> {
  return new Set([...loopbackOrigins(policy.port), ...policy.webOrigins.map(normalizeOrigin)]);
}

/**
 * `LUMEM_WEB_ORIGINS`: comma-separated, whitespace tolerated, trailing slash
 * forgiven — because someone will paste `http://127.0.0.1:4318/` from a browser
 * bar, and an origin never carries a path.
 */
export function parseWebOrigins(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "")
    .map(normalizeOrigin);
}

function normalizeOrigin(origin: string): string {
  return origin.toLowerCase().replace(/\/+$/, "");
}

/** F1: the request has to be addressed to this daemon, port included. */
export function checkHost(host: string | undefined, policy: OriginPolicy): Verdict {
  if (host !== undefined && allowedHosts(policy).has(host.trim().toLowerCase())) return { ok: true };
  const names = loopbackAuthorities(policy.port).join(", ");
  return {
    ok: false,
    status: 421,
    reason: `este daemon só atende pedidos endereçados a ${names}`,
  };
}

/**
 * F2: a browser signal, when present, has to point at an origin the daemon serves.
 *
 * `Origin` wins over `Sec-Fetch-Site` when both come, because it is the more
 * specific of the two: it names who is asking. Neither present is not a browser,
 * and passes — see the module comment for why.
 */
export function checkOrigin(
  headers: GuardedRequest["headers"],
  policy: OriginPolicy,
): Verdict {
  const origin = headers.origin;
  if (origin !== undefined) {
    if (allowedOrigins(policy).has(normalizeOrigin(origin))) return { ok: true };
    return {
      ok: false,
      status: 403,
      reason: `a origem ${origin} não pode falar com este daemon`,
    };
  }
  if (headers["sec-fetch-site"]?.trim().toLowerCase() === "cross-site") {
    return { ok: false, status: 403, reason: "pedido cross-site recusado" };
  }
  return { ok: true };
}

/** Whether F2 applies: every upgrade, every unsafe method, and the effectful `GET`s. */
export function needsOriginCheck(request: Pick<GuardedRequest, "method" | "pathname" | "upgrade">): boolean {
  if (request.upgrade) return true;
  if (!SAFE_METHODS.has(request.method.toUpperCase())) return true;
  return EFFECTFUL_GET_PATHS.has(request.pathname);
}

/** The whole of phase 1 for one request: `Host` always, `Origin` where it matters. */
export function judge(request: GuardedRequest, policy: OriginPolicy): Verdict {
  const host = checkHost(request.headers.host, policy);
  if (!host.ok) return host;
  if (!needsOriginCheck(request)) return { ok: true };
  return checkOrigin(request.headers, policy);
}
