import { initTRPC } from "@trpc/server";

import type { ServerConfig } from "./config.js";

/**
 * Everything a procedure is allowed to reach. Repositories and services are
 * added here as they land, so procedures never import singletons directly —
 * that is what keeps them testable without booting the whole daemon.
 */
export interface Context {
  config: ServerConfig;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
