import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { ACP_ADAPTER_COMMAND, ACP_ADAPTER_PACKAGE, ACP_ADAPTER_PINNED_VERSION } from "@lumem/shared";

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
  /** Where the adapter goes — `<stateDir>/adapters`. */
  dir: string;
  run?: CommandRunner;
  /** npm can take a while on a cold cache; a minute is generous and finite. */
  timeoutMs?: number;
}

/** `<dir>/node_modules/.bin/claude-agent-acp`, which is where npm puts it. */
export function adapterBinaryPath(dir: string): string {
  return join(dir, "node_modules", ".bin", ACP_ADAPTER_COMMAND);
}

export async function installAdapter({
  dir,
  run = runCommand,
  timeoutMs = 120_000,
}: InstallAdapterOptions): Promise<AdapterInstall> {
  const binary = adapterBinaryPath(dir);

  if (existsSync(binary)) {
    return { path: binary, version: ACP_ADAPTER_PINNED_VERSION, alreadyInstalled: true };
  }

  await mkdir(dir, { recursive: true });

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
      dir,
      "--no-fund",
      "--no-audit",
      `${ACP_ADAPTER_PACKAGE}@${ACP_ADAPTER_PINNED_VERSION}`,
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
      `o npm terminou sem erro mas ${binary} não existe — o pacote ${ACP_ADAPTER_PACKAGE} pode ter mudado de layout`,
    );
  }

  return { path: binary, version: ACP_ADAPTER_PINNED_VERSION, alreadyInstalled: false };
}
