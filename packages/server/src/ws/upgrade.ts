import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { FastifyInstance } from "fastify";

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

interface Router {
  routes: Map<string, UpgradeHandler>;
  listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
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
    const url = new URL(request.url ?? "/", "http://localhost");
    const handler = routes.get(url.pathname);

    if (!handler) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    handler(request, socket, head, url);
  };

  const router: Router = { routes, listener };
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
