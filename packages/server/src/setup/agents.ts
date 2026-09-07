import {
  ADAPTERS,
  adapterInstallCommand,
  DEFAULT_ADAPTER_ID,
  type AdapterSpec,
} from "@lumem/shared";

import { resolveCommandPath } from "../agents/availability.js";
import { runCommand, type CommandRunner } from "./run-command.js";

/**
 * What the machine has of the binaries a conversation needs, onboarding F3.1.
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
  /** True when this is the copy the daemon installed, not one from the PATH. */
  managed: boolean;
}

/**
 * One adapter of the catalogue, as this machine has it.
 *
 * `cli` is nullable because the second agent measured that the question has two
 * honest answers (`second-agent` §4.8): `claude-agent-acp` drives a `claude` that
 * has to exist, and `codex-acp` brings its own `@openai/codex` — it answers the
 * handshake with `PATH=/nonexistent`. A report that always named two binaries
 * would tell someone to install a CLI nobody needs.
 */
export interface AdapterReport {
  id: string;
  label: string;
  /** The adapter binary — what the daemon launches to speak ACP. */
  adapter: BinaryReport;
  /** The CLI it drives, when the spec declares one. */
  cli: BinaryReport | null;
  /**
   * The name of the key variable found in the daemon's environment, or null.
   *
   * The **name**, never the value: the screen reports which credential the
   * adapter is going to find (F3.6), and a key echoed back into a browser would
   * be a secret leaving the daemon for no reason at all. A name is enough to say
   * "billing by token" and useless to anyone who intercepts it.
   */
  apiKeyEnv: string | null;
}

export interface AgentsReport {
  /** One entry per spec of `ADAPTERS`, in catalogue order. */
  adapters: readonly AdapterReport[];
}

export interface AgentsOptions {
  path?: string | undefined;
  env?: Record<string, string | undefined>;
  run?: CommandRunner;
  /** Which specs to report on. The whole catalogue, unless a test narrows it. */
  specs?: readonly AdapterSpec[];
  /**
   * Where the daemon installed each adapter, checked before the PATH.
   *
   * Before, deliberately: a machine where the daemon installed it has no reason to
   * also have it globally, and finding a stale global copy first would report a
   * version the daemon is not the one running.
   *
   * A function of the spec, not a single path, because each adapter lives in its
   * own directory since the catalogue.
   */
  installedAt?: ((spec: AdapterSpec) => string) | undefined;
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
  { path, run, preferred }: { path: string | undefined; run: CommandRunner; preferred?: string | undefined },
): Promise<BinaryReport> {
  const resolved =
    preferred !== undefined && resolveCommandPath(preferred, { path }) !== null
      ? preferred
      : resolveCommandPath(command, { path });

  if (resolved === null) {
    return { command, path: null, managed: false, version: null, versionNote: null, install };
  }

  const outcome = await run(resolved, ["--version"]);
  const version = parseVersion(outcome.output);

  return {
    command,
    path: resolved,
    managed: preferred !== undefined && resolved === preferred,
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
  specs = ADAPTERS,
  installedAt,
}: AgentsOptions = {}): Promise<AgentsReport> {
  const adapters = await Promise.all(
    specs.map(async (spec) => reportFor(spec, { path, env, run, installedAt })),
  );

  return { adapters };
}

async function reportFor(
  spec: AdapterSpec,
  {
    path,
    env,
    run,
    installedAt,
  }: {
    path: string | undefined;
    env: Record<string, string | undefined>;
    run: CommandRunner;
    installedAt: ((spec: AdapterSpec) => string) | undefined;
  },
): Promise<AdapterReport> {
  const [adapter, cli] = await Promise.all([
    inspect(spec.command, adapterInstallCommand(spec), {
      path,
      run,
      ...(installedAt === undefined ? {} : { preferred: installedAt(spec) }),
    }),
    spec.cli === null
      ? Promise.resolve(null)
      : inspect(spec.cli.command, spec.cli.install, { path, run }),
  ]);

  return {
    id: spec.id,
    label: spec.label,
    adapter,
    cli,
    apiKeyEnv: spec.apiKeyEnv.find((name) => (env[name] ?? "").trim() !== "") ?? null,
  };
}

/** The entry of one id, for the callers that still ask about one adapter. */
export function adapterReport(report: AgentsReport, id = DEFAULT_ADAPTER_ID): AdapterReport | null {
  return report.adapters.find((entry) => entry.id === id) ?? null;
}
