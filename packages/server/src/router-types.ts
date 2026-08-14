/**
 * Type-only entry point for clients.
 *
 * The web package needs `AppRouter` to get an end-to-end typed client, but it
 * must never reach the server's runtime — importing `@lumem/server` directly
 * makes it one missing `type` keyword away from bundling fastify into the
 * browser. `export type` is erased at compile time, so this module has no
 * runtime body at all.
 */
export type { AppRouter } from "./routers/index.js";
