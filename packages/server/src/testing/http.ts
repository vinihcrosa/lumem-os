import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

import { daemonPort } from "../auth/guard.js";
import type { ServerConfig } from "../config.js";

/**
 * O `Host` que a guarda deste daemon aceita.
 *
 * `app.inject` manda `localhost:80` quando ninguém diz o contrário, e desde a
 * [`019`](../../../../docs/features/019-daemon-auth/prd.md) isso é um `421` — a
 * porta é outra. Existe como função em vez de literal por causa do
 * `LUMEM_PORT=0`: o teste que sobe de verdade só sabe a porta depois do
 * `listen`, e esta é **a mesma resolução que a guarda faz**, importada dela.
 */
export function daemonHost(app: FastifyInstance, config: ServerConfig): string {
  return `127.0.0.1:${String(daemonPort(app, config))}`;
}

/**
 * `app.inject` passando pela guarda de origem.
 *
 * Um teste de transporte é sobre a rota, não sobre a guarda — e sem o `Host`
 * certo ele passaria a ser sobre a guarda, com `421` no lugar de toda asserção.
 * Quem quer testar a recusa passa o `Host` no `headers`, que vence este default.
 */
export function inject(
  app: FastifyInstance,
  config: ServerConfig,
  options: InjectOptions,
): Promise<LightMyRequestResponse> {
  return app.inject({ ...options, headers: { host: daemonHost(app, config), ...options.headers } });
}
