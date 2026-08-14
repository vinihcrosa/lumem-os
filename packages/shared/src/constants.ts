/** Version of the Lumem contract. Kept in sync with packages/shared/package.json. */
export const LUMEM_VERSION = "0.0.0";

/**
 * Default TCP port of the daemon.
 *
 * Mirrors `ports.json` at the repo root, which is what the vite dev proxy and
 * the playwright harness read — those are plain configs loaded by node and
 * cannot import TypeScript from a workspace package. `constants.test.ts`
 * asserts the two stay equal, so the duplication cannot drift silently.
 */
export const DEFAULT_SERVER_PORT = 4317;

/** Default port of the vite dev server. Mirrors `ports.json`. */
export const DEFAULT_WEB_PORT = 4318;
