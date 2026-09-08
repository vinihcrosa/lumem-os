import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, parse } from "node:path";

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
  /**
   * The version **on disk**, read from the package the install left behind.
   *
   * It used to be `spec.pinnedVersion`, unconditionally — which made this field a
   * restatement of the constant instead of a report. On a machine that already had
   * the adapter, that was a lie, and it is the lie that hid LUM-54 for weeks: the
   * screen said the pinned version while the process answering `session/prompt`
   * was a runtime three months older, which the API then refused. Falls back to the
   * pin only when the layout has no `package.json` to read.
   */
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

/**
 * The version of an installed adapter, from the package npm wrote.
 *
 * `package.json` and not `<binary> --version`: measured on 2026-09-08,
 * `claude-agent-acp@0.40.0` answers `--version` with an **empty string** and exit
 * 0, so the binary itself cannot be asked what it is. Null when there is no
 * package to read — a layout this daemon did not write, and a reason to leave it
 * alone rather than to redownload it on every boot.
 */
export function installedAdapterVersion(root: string, spec: AdapterSpec): string | null {
  if (spec.package === null) return null;
  return versionIn(join(root, "node_modules", ...spec.package.split("/"), "package.json"));
}

/**
 * The version of the package a binary came out of, found from the binary itself.
 *
 * For the copies this daemon did **not** install: a global `npm i -g` puts the
 * bin in `<prefix>/bin` and the package under `<prefix>/lib/node_modules/…`, so no
 * relative walk from the launcher works. Following the symlink does — it lands
 * inside the package — and from there the manifest is the first `package.json`
 * upwards whose `name` matches. Matching the name matters: the first
 * `package.json` above a `dist/` file can belong to a nested dependency.
 *
 * Null for anything that is not a package layout, which is the honest answer for
 * a hand-built binary.
 */
export function packageVersionOf(binary: string, packageName: string): string | null {
  let dir: string;
  try {
    dir = dirname(realpathSync(binary));
  } catch {
    return null;
  }

  const { root } = parse(dir);
  while (true) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest) && nameIn(manifest) === packageName) return versionIn(manifest);
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function readManifest(manifest: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // A manifest that will not parse is a broken install, and the honest answer
    // is "I do not know what is there" — which sends it down the reinstall path.
    return null;
  }
}

function stringField(manifest: string, field: string): string | null {
  const value = readManifest(manifest)?.[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function versionIn(manifest: string): string | null {
  return existsSync(manifest) ? stringField(manifest, "version") : null;
}

function nameIn(manifest: string): string | null {
  return stringField(manifest, "name");
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

  /*
   * Already there is not the same as already right (LUM-54).
   *
   * Before this, any existing binary was accepted and reported as the pinned
   * version. So bumping the pin fixed nothing for anyone who had already run the
   * product: the daemon kept launching the old adapter, and said the new number
   * while doing it. What decides now is the version on disk, and a mismatch
   * reinstalls over the same directory — the version is a constant precisely so
   * that changing it means something.
   *
   * An unreadable version leaves the install alone: it is a layout this daemon
   * did not write, and redownloading 255 MB on a guess is worse than reporting
   * the pin.
   */
  if (existsSync(binary)) {
    const found = installedAdapterVersion(target, spec);
    if (found === null || found === spec.pinnedVersion) {
      return { path: binary, version: found ?? spec.pinnedVersion, alreadyInstalled: true };
    }
  }

  const legacy = legacyAdapterBinaryPath(dir, spec);
  if (existsSync(legacy)) {
    // The flat directory of a pre-catalogue daemon. Same rule, and a stale copy
    // there is not upgraded in place: this install writes to the spec's own
    // directory, which is also the one the daemon looks in first.
    const found = installedAdapterVersion(dir, spec);
    if (found === null || found === spec.pinnedVersion) {
      return { path: legacy, version: found ?? spec.pinnedVersion, alreadyInstalled: true };
    }
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

  return {
    path: binary,
    version: installedAdapterVersion(target, spec) ?? spec.pinnedVersion,
    alreadyInstalled: false,
  };
}
