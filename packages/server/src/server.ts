import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import type { Db } from "./db/index.js";
import { createEventBus, type EventBus } from "./events.js";
import { MAX_FILE_BYTES } from "./files/FileService.js";
import { createGitService, type GitService } from "./git/GitService.js";
import { AcpManager } from "./acp/AcpManager.js";
import { registerAcpWebSocket } from "./acp/websocket.js";
import type { PtyManager } from "./pty/PtyManager.js";
import { registerPtyWebSocket } from "./pty/websocket.js";
import { createSessionStore, type SessionStore } from "./sessions/SessionStore.js";
import { appRouter, type AppRouter } from "./routers/index.js";
import type { Context } from "./trpc.js";

/**
 * httpBatchLink packs every procedure name of a batch into the URL path, and
 * fastify's default cap is 100 characters. One sidebar refresh already batches
 * five procedures; blowing the cap fails the whole batch with an opaque HTTP
 * 414 that never reaches tRPC's onError.
 */
const MAX_PARAM_LENGTH = 5_000;

/**
 * What JSON does to one byte of a file on the way here, at its worst.
 *
 * `"`, `\` and a newline cost two bytes each; a control byte costs six, spelled
 * as a u-escape. A file made of those is odd and perfectly legal — no NUL byte,
 * so it reads as text, and it survives the UTF-8 round trip, so `files.write`
 * accepts it. Sizing for the common case instead would put the same bug back,
 * only rarer, and therefore worse to diagnose.
 */
const JSON_ESCAPE_WORST_CASE = 6;

/**
 * The largest body the daemon accepts, derived from the file ceiling.
 *
 * Fastify's default is 1 MiB — exactly `MAX_FILE_BYTES` — so a `files.write` of
 * a file at the ceiling never reached tRPC at all: it came back as
 * FST_ERR_CTP_BODY_TOO_LARGE, a transport 413 with no `TRPCError` and no domain
 * message, and the editor's footer (E9) would have had nothing to show but a
 * number. Measured on this server: a 1,024,011-byte body passes, a 1,048,587
 * one does not.
 *
 * Derived, then, rather than guessed: the text at its ceiling, times what JSON
 * can do to it, plus the envelope tRPC's batching link wraps it in — the index
 * of the batch, the scope, the path and a 64-character revision, none of which
 * is close to 64 KiB. Nothing else the daemon accepts is near this size, and
 * the limit is a ceiling rather than an allocation, so paying it globally costs
 * nothing until someone actually sends it.
 */
export const MAX_BODY_BYTES = MAX_FILE_BYTES * JSON_ESCAPE_WORST_CASE + 64 * 1024;

export interface CreateServerOptions {
  config: ServerConfig;
  /** Already migrated. Opening it is the caller's job because closing it is too. */
  db: Db;
  /**
   * Owner of every PTY the daemon has spawned.
   *
   * Passed in rather than constructed here because its lifetime is longer than
   * the HTTP server's: shutdown has to kill the children *before* closing the
   * server, so whoever closes the daemon has to hold the reference.
   */
  ptyManager: PtyManager;
  /**
   * Owner of every ACP agent the daemon has launched.
   *
   * Same reasoning as `ptyManager`: it outlives the HTTP server, because
   * shutdown has to end the conversations before closing the socket they travel
   * on. Defaulted rather than required so that a test which only cares about the
   * PTY does not have to build one.
   */
  acpManager?: AcpManager;
  /**
   * Keeps records in step with processes. Built here when absent, but the
   * daemon passes its own so shutdown can unhook the exit watcher.
   */
  sessionStore?: SessionStore;
  /** Fan-out of state changes to connected clients. */
  events?: EventBus;
  /** Overridable only so a test can watch the commands; nothing mocks git. */
  git?: GitService;
  /** Fastify's own request logging. Off in tests, on for the daemon. */
  logger?: boolean;
}

export async function createServer({
  config,
  db,
  ptyManager,
  acpManager = new AcpManager(),
  sessionStore = createSessionStore({ db, ptyManager }),
  events = createEventBus(),
  git = createGitService(),
  logger = false,
}: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
    bodyLimit: MAX_BODY_BYTES,
    // Without this, close() waits forever on an attached websocket.
    forceCloseConnections: true,
  });

  const createContext = (): Context => ({ config, db, ptyManager, sessionStore, git, events });

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
  registerAcpWebSocket({ app, acpManager });

  return app;
}
