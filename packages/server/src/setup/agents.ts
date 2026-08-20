import {
  ACP_ADAPTER_COMMAND,
  ACP_ADAPTER_INSTALL,
  ANTHROPIC_API_KEY_ENV,
  CLAUDE_CLI_COMMAND,
} from "@lumem/shared";

import { resolveCommandPath } from "../agents/availability.js";
import { runCommand, type CommandRunner } from "./run-command.js";

/**
 * What the machine has of the two binaries a conversation needs, onboarding F3.1.
 *
 * The version is *informative*. What decides whether the step can continue is the
 * probe, not this — a `--version` that a third-party binary answers in a format
 * nobody promised is a fact worth showing and a terrible thing to branch on.
 */
export interface BinaryReport {
  command: string;
  path: string | null;
  version: string | null;
  /** Why there is no version, when the binary was found but did not say. */
  versionNote: string | null;
  /** The command that installs it, for the one that has an unambiguous one. */
  install: string | null;
}

export interface AgentsReport {
  claude: BinaryReport;
  adapter: BinaryReport;
  /**
   * Presence only, never the value.
   *
   * The screen reports which credential the adapter is going to find (F3.6), and
   * a key echoed back into a browser would be a secret leaving the daemon for no
   * reason at all.
   */
  apiKeyInEnv: boolean;
}

export interface AgentsOptions {
  path?: string | undefined;
  env?: Record<string, string | undefined>;
  run?: CommandRunner;
}

/** `2.0.14 (Claude Code)` → `2.0.14`; anything shapeless comes back whole. */
export function parseVersion(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed === "") return null;
  const match = /\d+\.\d+(\.\d+)?/.exec(trimmed);
  return match?.[0] ?? trimmed.split("\n")[0]?.slice(0, 60) ?? null;
}

async function inspect(
  command: string,
  install: string | null,
  { path, run }: { path: string | undefined; run: CommandRunner },
): Promise<BinaryReport> {
  const resolved = resolveCommandPath(command, { path });

  if (resolved === null) {
    return { command, path: null, version: null, versionNote: null, install };
  }

  const outcome = await run(resolved, ["--version"]);
  const version = parseVersion(outcome.output);

  return {
    command,
    path: resolved,
    version,
    // A binary that is there but will not say what it is stays usable: the
    // probe is what answers the question that matters.
    versionNote: version === null ? outcome.failure ?? "não disse a versão" : null,
    install,
  };
}

export async function detectAgents({
  path = process.env["PATH"],
  env = process.env,
  run = runCommand,
}: AgentsOptions = {}): Promise<AgentsReport> {
  const [claude, adapter] = await Promise.all([
    inspect(CLAUDE_CLI_COMMAND, null, { path, run }),
    inspect(ACP_ADAPTER_COMMAND, ACP_ADAPTER_INSTALL, { path, run }),
  ]);

  const key = env[ANTHROPIC_API_KEY_ENV];

  return { claude, adapter, apiKeyInEnv: key !== undefined && key.trim() !== "" };
}
