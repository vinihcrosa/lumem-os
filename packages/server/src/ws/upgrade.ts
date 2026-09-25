import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { FastifyInstance } from "fastify";

import { guardOf } from "../auth/guard.js";

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

/** O `WebSocketServer` não está no caminho, então a resposta é escrita à mão. */
const STATUS_TEXT: Record<number, string> = {
  403: "Forbidden",
  404: "Not Found",
  421: "Misdirected Request",
};

/**
 * Uma resposta HTTP inteira num socket cru, e o socket fechado em seguida.
 *
 * `Content-Length` junto porque sem ele um cliente que fale HTTP/1.1 fica
 * esperando o corpo terminar, e o que ele acabou de receber foi uma recusa.
 */
function refuse(socket: Duplex, status: number, text: string, body: string): void {
  const payload = Buffer.from(body, "utf8");
  socket.write(
    `HTTP/1.1 ${String(status)} ${text}\r\n` +
      "content-type: text/plain; charset=utf-8\r\n" +
      `content-length: ${String(payload.byteLength)}\r\n` +
      "connection: close\r\n\r\n",
  );
  if (payload.byteLength > 0) socket.write(payload);
  socket.destroy();
}

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

  /*
   * A guarda tem que já existir (`019` F1/F2).
   *
   * Resolvida aqui, no registro, e não a cada socket: um endpoint montado num
   * servidor sem guarda seria um `/pty` que qualquer página abre, e o tipo
   * `DaemonGuard | undefined` transformaria isso num `?.` que passa calado.
   * `createServer` registra a guarda antes de tudo, então chegar aqui sem ela é
   * um defeito de montagem, não um caso a tolerar.
   */
  const guard = guardOf(app);
  if (!guard) {
    throw new Error("o roteador de upgrade precisa da guarda de origem: registre-a antes");
  }

  const routes = new Map<string, UpgradeHandler>();
  const listener = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? "/", "http://localhost");

    /*
     * Antes do despacho, e antes do handshake.
     *
     * WebSocket não obedece CORS, então qualquer página pode abrir
     * `ws://127.0.0.1:4317/acp?session=<id>` e, se souber o id, ler a
     * transcrição inteira no `attached` e mandar `prompt`. Recusar depois do
     * upgrade seria recusar com a conexão já de pé; aqui o `WebSocketServer`
     * nunca vê o socket. Antes do `404` também: quem não passa na guarda não
     * fica sabendo nem quais caminhos existem.
     */
    const refusal = guard.check({
      method: request.method ?? "GET",
      path: url.pathname,
      headers: request.headers,
      upgrade: true,
    });
    if (refusal) {
      refuse(socket, refusal.status, STATUS_TEXT[refusal.status] ?? "Forbidden", refusal.message);
      return;
    }

    const handler = routes.get(url.pathname);
    if (!handler) {
      refuse(socket, 404, "Not Found", "");
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
