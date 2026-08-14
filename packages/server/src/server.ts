import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import { appRouter, type AppRouter } from "./routers/index.js";
import type { Context } from "./trpc.js";

export interface CreateServerOptions {
  config: ServerConfig;
  /** Fastify's own request logging. Off in tests, on for the daemon. */
  logger?: boolean;
}

export async function createServer({
  config,
  logger = false,
}: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

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

  return app;
}
