import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import type { FastifyInstance } from "fastify";

import type { ServerConfig } from "../config.js";
import { setUpgradeGuard } from "../ws/upgrade.js";

import { judge, type GuardedRequest, type OriginPolicy, type Verdict } from "./origin-policy.js";

/**
 * Wires the phase-1 policy into the two doors of the daemon.
 *
 * There are exactly two: Fastify's request lifecycle, and the raw `upgrade`
 * event a WebSocket handshake arrives on — which Fastify never sees. A check
 * that lived only in the hook would leave `/pty` and `/acp` open, and those are
 * the two endpoints an attacker wants (PRD §2.2). So the same `judge` is handed
 * to both, and the upgrade router runs it **before** looking at the path, so
 * that the refusal is an HTTP status on the socket and never a completed
 * handshake.
 *
 * The port is read from the listening socket, not from the configuration, when
 * there is one: `listen({ port: 0 })` — every WebSocket test does this — makes
 * the two differ, and a `Host` check against the configured `0` would refuse
 * every honest request. Under `app.inject` nothing is listening and the
 * configured port is the truth.
 */
export function registerRequestGuard({
  app,
  config,
}: {
  app: FastifyInstance;
  config: Pick<ServerConfig, "port" | "webOrigins">;
}): void {
  const policy = (): OriginPolicy => ({
    port: listeningPort(app) ?? config.port,
    webOrigins: config.webOrigins,
  });

  app.addHook("onRequest", async (request, reply) => {
    const verdict = judge(
      {
        method: request.method,
        pathname: pathnameOf(request.url),
        headers: pick(request.headers),
        upgrade: false,
      },
      policy(),
    );
    if (!verdict.ok) return refuse(reply, verdict);
    return undefined;
  });

  setUpgradeGuard(app, (request: IncomingMessage) =>
    judge(
      {
        method: request.method ?? "GET",
        pathname: pathnameOf(request.url ?? "/"),
        headers: pick(request.headers),
        upgrade: true,
      },
      policy(),
    ),
  );
}

function listeningPort(app: FastifyInstance): number | null {
  const address = app.server.address();
  return address !== null && typeof address === "object" ? (address as AddressInfo).port : null;
}

function pathnameOf(url: string): string {
  const end = url.indexOf("?");
  return end === -1 ? url : url.slice(0, end);
}

/** Node may hand a header as an array when it was sent twice; the first one is the one to judge. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick(headers: IncomingHttpHeaders): GuardedRequest["headers"] {
  return {
    host: first(headers.host),
    origin: first(headers.origin),
    "sec-fetch-site": first(headers["sec-fetch-site"]),
  };
}

/** A refusal is one sentence in `text/plain`, like every error the daemon writes. */
function refuse(
  reply: { code(status: number): unknown; type(mime: string): unknown; send(body: string): unknown },
  verdict: Extract<Verdict, { ok: false }>,
): unknown {
  reply.code(verdict.status);
  reply.type("text/plain; charset=utf-8");
  return reply.send(`${verdict.reason}\n`);
}
