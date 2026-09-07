/** Version of the Lumem contract. Kept in sync with packages/shared/package.json. */
export const LUMEM_VERSION = "0.3.0";

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

/**
 * Below this, `git worktree` behaves differently.
 *
 * 2.30 is where `--orphan` settled, and the whole product is worktrees — so this
 * is a hard floor rather than a recommendation.
 */
export const MIN_GIT_VERSION = { major: 2, minor: 30 } as const;

/**
 * Where the daemon keeps the adapters it installed, under the state directory.
 *
 * One level above the per-adapter directory: each spec of `ADAPTERS` installs
 * into `<stateDir>/adapters/<id>`, so two adapters cannot overwrite each other's
 * `node_modules`.
 */
export const ADAPTERS_DIR_NAME = "adapters";

/**
 * The JSON-RPC code ACP uses for "you have to log in first".
 *
 * `session/new` answers with it when the agent has no usable credential, and it
 * is the signal that opens the login panel — not a guess about the credential's
 * state (`RequestError.authRequired` in the SDK).
 */
export const ACP_AUTH_REQUIRED_CODE = -32000;
