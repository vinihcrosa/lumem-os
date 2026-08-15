import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import type { PtyManager } from "./pty/PtyManager.js";
import { registerPtyWebSocket } from "./pty/websocket.js";
import { appRouter, type AppRouter } from "./routers/index.js";
import type { Context } from "./trpc.js";

/**
 * httpBatchLink packs every procedure name of a batch into the URL path, and
 * fastify's default cap is 100 characters. One sidebar refresh already batches
 * five procedures; blowing the cap fails the whole batch with an opaque HTTP
 * 414 that never reaches tRPC's onError.
 */
const MAX_PARAM_LENGTH = 5_000;

export interface CreateServerOptions {
  config: ServerConfig;
  /**
   * Owner of every PTY the daemon has spawned.
   *
   * Passed in rather than constructed here because its lifetime is longer than
   * the HTTP server's: shutdown has to kill the children *before* closing the
   * server, so whoever closes the daemon has to hold the reference.
   */
  ptyManager: PtyManager;
  /** Fastify's own request logging. Off in tests, on for the daemon. */
  logger?: boolean;
}

export async function createServer({
  config,
  ptyManager,
  logger = false,
}: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
    // Without this, close() waits forever on an attached websocket.
    forceCloseConnections: true,
  });

  const createContext = (): Context => ({ config });

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        // Procedures translate domain failures into TRPCError themselves.
        // Anything landing here with INTERNAL_SERVER_ERROR is a real bug.
        app.log.error({ path, err: error }, "trpc procedure failed");
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  registerPtyWebSocket({ app, ptyManager });

  return app;
}
