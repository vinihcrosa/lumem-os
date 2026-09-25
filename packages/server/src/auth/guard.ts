import type { FastifyInstance } from "fastify";

import type { ServerConfig } from "../config.js";

import {
  allowedHostnames,
  isAllowedAuthority,
  isAllowedFetchSite,
  isAllowedOrigin,
  originOf,
} from "./origins.js";

/**
 * A guarda de transporte da fase 1: `Host`, `Origin` e `Sec-Fetch-Site`.
 *
 * Ela não sabe **quem** está falando — isso é a fase 2, e é um token. O que ela
 * sabe é se o pedido poderia ter saído da página que este daemon serve, e é o
 * bastante para as três ameaças que uma aba aberta em qualquer site exerce
 * hoje: DNS rebinding (§2.1), sequestro de WebSocket (§2.2) e `GET` com efeito
 * (§2.3).
 *
 * Um pedido **sem sinal nenhum de browser** passa, e isso é o produto, não um
 * descuido: a porta do agente é `curl` para `/memory/ask` e `POST /tasks`, e o
 * e2e fala com o daemon pela API. Fechar isso é a fase 2, com uma credencial
 * que o daemon entrega a quem tem direito a ela.
 */

/** Os prefixos fora do `/trpc` que respondem `GET` com efeito. */
const EFFECTFUL_GET_PREFIXES = ["/memory", "/tasks"] as const;

export interface GuardRequest {
  method: string;
  /** Só o caminho, sem query. */
  path: string;
  headers: {
    host?: string | undefined;
    origin?: string | undefined;
    "sec-fetch-site"?: string | undefined;
  };
  /** Handshake de WebSocket: `Origin` é conferido mesmo sendo `GET`. */
  upgrade?: boolean;
}

export interface Refusal {
  status: number;
  /** O que volta no corpo, `text/plain`. Uma frase, como toda recusa do daemon. */
  message: string;
  /** Para o log. Nunca vai para o corpo. */
  reason: string;
}

export interface DaemonGuard {
  /** `null` quando o pedido pode seguir. */
  check(request: GuardRequest): Refusal | null;
}

const MISDIRECTED = 421;
const FORBIDDEN = 403;

const REFUSED_ORIGIN =
  "origem não autorizada: o daemon só aceita pedido de browser vindo da página que ele mesmo serve\n";

export interface CreateGuardOptions {
  config: ServerConfig;
  /**
   * A porta em que o socket **está** escutando.
   *
   * Função, e não número, porque com `LUMEM_PORT=0` quem escolhe é o kernel e o
   * valor só existe depois do `listen`. Conferir contra a configuração daria
   * `421` em todo daemon de porta efêmera — inclusive em cada teste de
   * WebSocket, que é justamente onde o upgrade é exercido de verdade.
   */
  port: () => number;
}

export function createGuard({ config, port }: CreateGuardOptions): DaemonGuard {
  const hostnames = allowedHostnames(config.host);

  return {
    check(request) {
      const listening = port();

      if (!isAllowedAuthority(request.headers.host, { hostnames, port: listening })) {
        return {
          status: MISDIRECTED,
          message: `este daemon só atende por ${hostnames.join(", ")} na porta ${String(listening)}\n`,
          reason: "host",
        };
      }

      if (!needsOriginCheck(request)) return null;

      const origin = request.headers.origin;
      if (origin !== undefined && origin !== "") {
        const allowed = [
          ...hostnames.map((hostname) => originOf(hostname, listening)),
          ...config.webOrigins,
        ];
        return isAllowedOrigin(origin, allowed)
          ? null
          : { status: FORBIDDEN, message: REFUSED_ORIGIN, reason: "origin" };
      }

      return isAllowedFetchSite(request.headers["sec-fetch-site"])
        ? null
        : { status: FORBIDDEN, message: REFUSED_ORIGIN, reason: "sec-fetch-site" };
    },
  };
}

/**
 * Quando a origem importa.
 *
 * Todo upgrade, porque WebSocket não obedece CORS e o handshake é o último
 * ponto em que dá para recusar. Todo método que não é `GET`/`HEAD`, porque é
 * onde mora a mutação. E todo `GET` de `/memory` e `/tasks`, porque são as
 * famílias de rota que respondem `GET` **com efeito** — `/memory/ask` grava
 * `memory_usage` e, com o auto-learn ligado, sobe um agente. O prefixo, e não o
 * caminho exato, para a lista não ficar desatualizada no dia em que existir a
 * segunda rota da família.
 *
 * `GET /trpc/*` fica de fora: não há CORS registrado, então o browser não deixa
 * uma página de fora **ler** a resposta, e uma query do tRPC não muda estado.
 */
function needsOriginCheck(request: GuardRequest): boolean {
  if (request.upgrade === true) return true;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return true;
  return EFFECTFUL_GET_PREFIXES.some(
    (prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`),
  );
}

/**
 * A porta em que o daemon escuta, com a configuração como último recurso.
 *
 * Sem socket — que é o caso do `app.inject` — não há porta real, e a
 * configuração é a melhor resposta disponível.
 */
export function daemonPort(app: FastifyInstance, config: ServerConfig): number {
  const address = app.server.address();
  return typeof address === "object" && address !== null ? address.port : config.port;
}

/**
 * Guardas instaladas, por servidor.
 *
 * Um `WeakMap` e não um global, pelo motivo que `ws/upgrade.ts` já dá para o
 * roteador dele: a suíte constrói muitos servidores, às vezes ao mesmo tempo, e
 * uma tabela compartilhada deixaria a configuração de um teste responder pelo
 * socket de outro.
 */
const guards = new WeakMap<FastifyInstance, DaemonGuard>();

/** A guarda deste servidor, para quem não passa pelo ciclo de request do Fastify. */
export function guardOf(app: FastifyInstance): DaemonGuard | undefined {
  return guards.get(app);
}

export interface RegisterGuardOptions {
  app: FastifyInstance;
  config: ServerConfig;
}

/**
 * Instala a guarda no ciclo de request e a publica para o roteador de upgrade.
 *
 * Tem que ser a **primeira** coisa registrada no servidor: um `onRequest` só
 * alcança as rotas dos contextos criados depois dele, e o `/trpc` inteiro nasce
 * de um `register`.
 */
export function registerGuard({ app, config }: RegisterGuardOptions): DaemonGuard {
  const guard = createGuard({ config, port: () => daemonPort(app, config) });
  guards.set(app, guard);

  app.addHook("onRequest", async (request, reply) => {
    const refusal = guard.check({
      method: request.method,
      path: request.url.split("?")[0] ?? "/",
      headers: request.headers,
    });
    if (refusal === null) return;

    request.log.warn(
      {
        reason: refusal.reason,
        host: request.headers.host,
        origin: request.headers.origin,
        site: request.headers["sec-fetch-site"],
        path: request.url,
      },
      "pedido recusado pela guarda de origem",
    );
    // O detalhe fica no log e não no corpo: quem levou o `421` é, no caso que
    // importa, quem forjou o cabeçalho — e devolver o que ele mandou é contar
    // o que a guarda mede.
    await reply
      .code(refusal.status)
      .type("text/plain; charset=utf-8")
      .header("x-content-type-options", "nosniff")
      .send(refusal.message);
  });

  return guard;
}
