import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { FastifyInstance } from "fastify";

import type { Verdict } from "../auth/origin-policy.js";

/**
 * One upgrade listener for the whole daemon, dispatching by path.
 *
 * Fastify has no notion of a websocket route, so every endpoint has to hang off
 * `server.on("upgrade")`. With one endpoint that was simple, and the PTY handler
 * answered 404 for anything that was not its own path — deliberately, because a
 * stray socket left open until the kernel times it out hides a typo.
 *
 * The moment there is a second endpoint that rule turns hostile: whichever
 * handler runs first destroys the other's sockets. Node calls every listener,
 * and neither can tell whether a sibling wanted the request.
 *
 * So the 404 moves here, where it can be said once and only after every
 * registered path has been checked.
 */

export type UpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  url: URL,
) => void;

/**
 * Decides whether a handshake may even be looked at (daemon-auth, F1 and F2).
 *
 * Runs before the path lookup, on the raw request, so a refused socket gets an
 * HTTP status and never a completed upgrade — a browser page from the wrong
 * origin must not be able to tell `/acp` from a path that does not exist.
 */
export type UpgradeGuard = (request: IncomingMessage) => Verdict;

interface Router {
  routes: Map<string, UpgradeHandler>;
  guard: UpgradeGuard | null;
  listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

const STATUS_TEXT: Readonly<Record<number, string>> = {
  403: "Forbidden",
  404: "Not Found",
  421: "Misdirected Request",
};

/** Answers a handshake with a plain HTTP refusal and closes the socket. */
function refuse(socket: Duplex, status: number, body: string): void {
  const payload = Buffer.from(`${body}\n`, "utf8");
  socket.write(
    `HTTP/1.1 ${String(status)} ${STATUS_TEXT[status] ?? ""}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${String(payload.byteLength)}\r\n` +
      "Connection: close\r\n\r\n",
  );
  socket.write(payload);
  socket.destroy();
}

/**
 * Keyed on the Fastify instance, not module-global.
 *
 * The suite builds many servers, often at once, and a shared table would let
 * one test's routes answer another test's sockets.
 */
const routers = new WeakMap<FastifyInstance, Router>();

function routerFor(app: FastifyInstance): Router {
  const existing = routers.get(app);
  if (existing) return existing;

  const routes = new Map<string, UpgradeHandler>();
  const listener = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // The guard first, before the path: who is asking is decided before what
    // they are asking for, and an unknown path from a bad origin is still 403.
    const verdict = router.guard?.(request) ?? { ok: true };
    if (!verdict.ok) {
      refuse(socket, verdict.status, verdict.reason);
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const handler = routes.get(url.pathname);

    if (!handler) {
      refuse(socket, 404, "não existe websocket neste caminho");
      return;
    }
    handler(request, socket, head, url);
  };

  const router: Router = { routes, guard: null, listener };
  routers.set(app, router);

  app.server.on("upgrade", listener);
  app.addHook("onClose", async () => {
    app.server.off("upgrade", listener);
    routers.delete(app);
  });

  return router;
}

/**
 * Serves websocket upgrades for one path.
 *
 * Registering the same path twice is a defect, not a merge: two handlers on one
 * path would both try to complete the handshake, and the second would write to a
 * socket the first already owns.
 */
export function onUpgradePath(
  app: FastifyInstance,
  path: string,
  handler: UpgradeHandler,
): void {
  const router = routerFor(app);
  if (router.routes.has(path)) {
    throw new Error(`websocket path ${path} is already served`);
  }
  router.routes.set(path, handler);
}

/**
 * Installs the one guard every upgrade on this app passes through.
 *
 * One, not many: two guards would mean two opinions about the same socket, and
 * the second registration is a wiring mistake, not a stricter policy.
 */
export function setUpgradeGuard(app: FastifyInstance, guard: UpgradeGuard): void {
  const router = routerFor(app);
  if (router.guard !== null) {
    throw new Error("the websocket upgrade guard is already installed");
  }
  router.guard = guard;
}
