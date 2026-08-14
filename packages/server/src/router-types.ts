/**
 * The only entry point the server package exposes.
 *
 * The web package needs `AppRouter` for an end-to-end typed client, but it must
 * never reach the server's runtime — one missing `type` keyword would otherwise
 * pull fastify into the browser bundle. Two things enforce that: this module is
 * pure `export type`, so it compiles to nothing, and it is the *only* subpath in
 * the package's `exports`. `import { createServer } from "@lumem/server"` does
 * not resolve at all.
 */
export type { AppRouter } from "./routers/index.js";
