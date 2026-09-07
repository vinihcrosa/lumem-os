import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CLAUDE_ADAPTER, type AdapterSpec } from "@lumem/shared";

import { resolveCommandPath } from "../agents/availability.js";
import { DomainError } from "../errors.js";
import { runCommand, type CommandRunner } from "./run-command.js";

/**
 * The daemon installs the adapter, into its own directory, at a pinned version.
 *
 * This reverses a decision that shipped a day earlier — that the screen would
 * hand over a command and never run one — and the reversal is the design's, made
 * with a different shape than the one that was refused. What was refused was
 * `npm i -g`: global, possibly needing `sudo`, and with no place for two minutes
 * of output to go. This is none of those things: it writes inside
 * `~/.lumem/adapters`, needs no privilege, and the only thing it can break is
 * itself.
 *
 * What it costs, named: the daemon runs a package manager and then executes what
 * that package manager downloaded. That is a real widening of what a local daemon
 * does on a click, and the guards around it are the ones that make it acceptable
 * — a pinned version rather than `@latest`, a directory of its own, and a
 * refusal that reads as a sentence when `npm` is not there at all.
 *
 * **Per spec since the second agent.** Each adapter installs into
 * `<adaptersDir>/<id>`, because two adapters sharing one `node_modules` would
 * have the second install decide the first one's dependency tree. A spec with no
 * `package` installs nothing: it is expected on the PATH, and this reports what
 * it found there or says which binary is missing.
 */

export interface AdapterInstall {
  /** Absolute path to the installed binary. */
  path: string;
  /** The version that was pinned, which is the version that was installed. */
  version: string;
  /** True when it was already there and nothing was downloaded. */
  alreadyInstalled: boolean;
}

export interface InstallAdapterOptions {
  /** Which adapter. Defaults to the one the first run installs. */
  spec?: AdapterSpec;
  /** The directory that holds every adapter — `<stateDir>/adapters`. */
  dir: string;
  run?: CommandRunner;
  /** npm can take a while on a cold cache; a minute is generous and finite. */
  timeoutMs?: number;
  /** Seam for the PATH lookup a spec without a package falls back to. */
  resolve?: (command: string) => string | null;
}

/** Where a spec's own `node_modules` lives: `<adaptersDir>/<id>`. */
export function adapterDir(dir: string, spec: AdapterSpec = CLAUDE_ADAPTER): string {
  return join(dir, spec.id);
}

/** `<adaptersDir>/<id>/node_modules/.bin/<command>`, which is where npm puts it. */
export function adapterBinaryPath(dir: string, spec: AdapterSpec = CLAUDE_ADAPTER): string {
  return join(adapterDir(dir, spec), "node_modules", ".bin", spec.command);
}

/**
 * Where the adapter used to be installed, before the catalogue existed.
 *
 * `<adaptersDir>/node_modules/.bin/<command>` — flat, because there was one
 * adapter and it did not need a name. Every machine that ran the product before
 * the second agent has 255 MB sitting there, and a daemon that stopped looking
 * would redownload all of it on the first boot after an upgrade.
 *
 * Not keyed on `claude`: the flat directory can only ever hold what was installed
 * into it, so asking for this spec's binary is the same question with no special
 * case in it.
 */
export function legacyAdapterBinaryPath(dir: string, spec: AdapterSpec): string {
  return join(dir, "node_modules", ".bin", spec.command);
}

export async function installAdapter({
  spec = CLAUDE_ADAPTER,
  dir,
  run = runCommand,
  timeoutMs = 120_000,
  resolve = resolveCommandPath,
}: InstallAdapterOptions): Promise<AdapterInstall> {
  /*
   * A spec with no package is not installed — it is found.
   *
   * A native agent (`gemini --acp`) has no adapter to download, and running npm
   * against a package that does not exist would fail with a registry error for a
   * machine whose only actual problem is a missing binary.
   */
  if (spec.package === null) {
    const found = resolve(spec.command);
    if (found === null) {
      throw new DomainError(
        "NOT_FOUND",
        `${spec.label} não tem adaptador para instalar: o binário ${spec.command} tem que estar no PATH, e não está`,
      );
    }
    return { path: found, version: spec.pinnedVersion, alreadyInstalled: true };
  }

  const target = adapterDir(dir, spec);
  const binary = adapterBinaryPath(dir, spec);

  if (existsSync(binary)) {
    return { path: binary, version: spec.pinnedVersion, alreadyInstalled: true };
  }

  const legacy = legacyAdapterBinaryPath(dir, spec);
  if (existsSync(legacy)) {
    return { path: legacy, version: spec.pinnedVersion, alreadyInstalled: true };
  }

  await mkdir(target, { recursive: true });

  /*
   * `--prefix`, and never a global install.
   *
   * Also `--no-fund --no-audit`: both write to the network and to stdout for a
   * report nobody here will read, and the second one has been known to fail a
   * whole install on a registry that answers slowly.
   */
  const outcome = await run(
    "npm",
    [
      "install",
      "--prefix",
      target,
      "--no-fund",
      "--no-audit",
      `${spec.package}@${spec.pinnedVersion}`,
    ],
    { timeoutMs },
  );

  if (!outcome.ok) {
    throw new DomainError(
      "SPAWN_FAILED",
      // npm's own words. The common failures — no network, a registry behind a
      // proxy, a corporate mirror without the package — are all things it says
      // better than a translation would.
      `não deu para instalar o adaptador: ${outcome.failure ?? "npm falhou"}\n${outcome.output}`.trim(),
    );
  }

  if (!existsSync(binary)) {
    throw new DomainError(
      "SPAWN_FAILED",
      `o npm terminou sem erro mas ${binary} não existe — o pacote ${spec.package} pode ter mudado de layout`,
    );
  }

  return { path: binary, version: spec.pinnedVersion, alreadyInstalled: false };
}
