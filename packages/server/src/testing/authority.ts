import type { AddressInfo } from "node:net";

import type { FastifyInstance } from "fastify";

/**
 * The `Host` an honest request to this app carries (daemon-auth, F1).
 *
 * `light-my-request` defaults to `localhost:80`, which the guard rightly reads as
 * a page that rebound its DNS to this machine — so every `app.inject` in the
 * suite has to say who it is talking to. The port is the one the app listens on
 * when it does (`listen({ port: 0 })` picks one), and the configured one under
 * plain injection, which is the same rule the guard itself applies.
 */
export function loopbackAuthority(app: FastifyInstance, configuredPort: number): string {
  const address = app.server.address();
  const port =
    address !== null && typeof address === "object" ? (address as AddressInfo).port : configuredPort;
  return `127.0.0.1:${String(port)}`;
}
