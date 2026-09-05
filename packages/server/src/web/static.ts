import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * The daemon serving its own interface, which is what installing the product
 * means: one process, one port, one URL.
 *
 * In development nothing here runs — vite serves the web and proxies `/trpc`,
 * `/pty` and `/acp` to this daemon. In an installed Lumem there is no vite, and
 * the assets travel over the same origin as the API, which is why the client
 * never needed a base URL: it already speaks in relative paths.
 */

/**
 * Prefixes that belong to the daemon and must never fall back to the SPA.
 *
 * A single-page application answers "route not found" with its own HTML, and
 * that is correct for `/workspace/abc` and catastrophic for `/trpc/session.get`:
 * the client would receive `<!doctype html>` where it expected JSON, and report
 * a parse error instead of the 404 that actually happened.
 */
export const DAEMON_PREFIXES = ["/trpc", "/pty", "/acp", "/memory"] as const;

/**
 * Where the built web lives, or `null` when it was not built.
 *
 * The default candidate is resolved from this module's own URL, and it only
 * lands anywhere useful after bundling: the whole daemon collapses into
 * `dist/server/main.mjs`, so `../web` is `dist/web`. Running from source it
 * points at this very directory, which has no `index.html` — so development
 * gets `null`, which is exactly right, because vite is serving.
 */
export function resolveWebRoot(override: string | null = null): string | null {
  const candidate = override ?? fileURLToPath(new URL("../web/", import.meta.url));
  return existsSync(join(candidate, "index.html")) ? candidate : null;
}

/** Assets carry a content hash in their name, so they can be cached forever. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** The entry document must not be, or a deploy is invisible until a hard reload. */
const REVALIDATE = "no-cache";

function isDaemonRoute(url: string): boolean {
  return DAEMON_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

/**
 * A path the SPA should answer for.
 *
 * The extension check is what separates `/workspace/abc` (a route the client
 * knows) from `/assets/index-a1b2.js` (a file that should have existed). Serving
 * HTML for a missing script is how a blank page with a MIME type error in the
 * console happens, and that error names neither the file nor the cause.
 */
export function wantsAppShell(request: Pick<FastifyRequest, "method" | "url" | "headers">): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const path = request.url.split("?")[0] ?? "/";
  if (isDaemonRoute(path)) return false;
  if (/\.[a-z0-9]+$/i.test(path)) return false;

  const accept = request.headers.accept ?? "";
  return accept === "" || accept.includes("text/html") || accept.includes("*/*");
}

export interface RegisterWebOptions {
  app: FastifyInstance;
  /** Already resolved by `resolveWebRoot`; this function does not guess. */
  root: string;
}

export async function registerWeb({ app, root }: RegisterWebOptions): Promise<void> {
  await app.register(fastifyStatic, {
    root,
    // Routes are registered per file instead of a `/*` catch-all, so an unknown
    // path reaches the not-found handler below and can be told apart from a
    // missing asset.
    wildcard: false,
    index: ["index.html"],
    // Off, because it wins over `setHeaders` otherwise: the plugin writes its
    // own `cache-control: public, max-age=0` afterwards, and every asset would
    // be revalidated on every load despite the hash in its name.
    cacheControl: false,
    setHeaders(response, path) {
      response.setHeader("cache-control", path.endsWith(".html") ? REVALIDATE : IMMUTABLE);
    },
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    if (!wantsAppShell(request)) {
      return reply.code(404).send({ error: "not found", url: request.url });
    }
    return reply.header("cache-control", REVALIDATE).sendFile("index.html");
  });
}
