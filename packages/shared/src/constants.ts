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

/**
 * The ACP adapter the onboarding flow looks for, and the package that installs it.
 *
 * Two strings because they are not the same string, and that is exactly the trap:
 * the package is scoped and the binary is not. Measured against
 * `@agentclientprotocol/claude-agent-acp@0.69.0` — see
 * `docs/project/pty-vs-acp.md` §9 — and shared so the screen, the daemon and the
 * e2e cannot each hold a different opinion about what to install.
 */
export const ACP_ADAPTER_COMMAND = "claude-agent-acp";
export const ACP_ADAPTER_PACKAGE = "@agentclientprotocol/claude-agent-acp";
export const ACP_ADAPTER_INSTALL = `npm i -g ${ACP_ADAPTER_PACKAGE}`;

/** The CLI the adapter drives. Detected for the same reason: it is what breaks. */
export const CLAUDE_CLI_COMMAND = "claude";

/** The environment variable that means "billing by token" instead of the local credential. */
export const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";

/**
 * Below this, `git worktree` behaves differently.
 *
 * 2.30 is where `--orphan` settled, and the whole product is worktrees — so this
 * is a hard floor rather than a recommendation.
 */
export const MIN_GIT_VERSION = { major: 2, minor: 30 } as const;

/**
 * The adapter version the daemon installs and pins.
 *
 * A constant, so bumping it is a code change someone reviewed — never
 * `@latest`, because an overnight release of a third-party adapter must not
 * change how the agent behaves. Measured: this is what
 * `@agentclientprotocol/claude-agent-acp` reported as `agentInfo.version` on the
 * machine this was written on.
 */
export const ACP_ADAPTER_PINNED_VERSION = "0.40.0";

/** Where the daemon keeps the adapter it installed, under the state directory. */
export const ADAPTERS_DIR_NAME = "adapters";

/**
 * The JSON-RPC code ACP uses for "you have to log in first".
 *
 * `session/new` answers with it when the agent has no usable credential, and it
 * is the signal that opens the login panel — not a guess about the credential's
 * state (`RequestError.authRequired` in the SDK).
 */
export const ACP_AUTH_REQUIRED_CODE = -32000;
