import { accessSync, constants, existsSync, statfsSync } from "node:fs";

import { LUMEM_VERSION, MIN_GIT_VERSION } from "@lumem/shared";

import type { ServerConfig } from "../config.js";
import { runCommand, type CommandRunner } from "./run-command.js";

/**
 * What the machine can and cannot do, onboarding F2.
 *
 * Five reads, no writes — not even to test whether a directory is writable
 * (D3): `access(W_OK)` answers that, and a temporary file would make the screen
 * that diagnoses the problem capable of being the problem.
 *
 * Every check fails on its own. A preflight that reports "erro" once, for the
 * whole machine, is worth less than a list with one red line in it — and the one
 * red line is the reason someone opened this screen.
 */

export type CheckState = "ok" | "warn" | "fail";

export interface Check {
  /** Stable across runs; the client keys rows on it. */
  id: "daemon" | "git" | "node" | "stateDir" | "disk";
  /** What was checked, in the user's words. */
  label: string;
  state: CheckState;
  /** What was found. A value, never a verdict. */
  value: string;
  /**
   * The command that fixes it, when one exists and is unambiguous.
   *
   * Deliberately absent for "git is too old": `brew upgrade git`,
   * `apt install git` and a source build are all wrong on some machine, and a
   * suggestion that fails is worse than none. The value says what is wrong.
   */
  fix: string | null;
}

export interface PreflightOptions {
  config: ServerConfig;
  run?: CommandRunner;
  /** Free bytes of the volume holding the state directory. A seam for tests. */
  freeBytes?: (path: string) => number;
  /** Seams so a test never depends on the machine it runs on. */
  nodeVersion?: string;
  nodePath?: string;
}

/**
 * Where the daemon keeps things, so the flow can say what a step wrote.
 *
 * Reported rather than composed on the client: these come from `ServerConfig`,
 * which `LUMEM_STATE_DIR` moves, and a client that guessed `~/.lumem` would be
 * confidently wrong on exactly the machine where someone moved it.
 */
export interface StatePaths {
  stateDir: string;
  databasePath: string;
  worktreesDir: string;
  transcriptsDir: string;
}

export interface Preflight {
  checks: readonly Check[];
  paths: StatePaths;
}

function freeBytesOf(path: string): number {
  const stats = statfsSync(path);
  return Number(stats.bsize) * Number(stats.bavail);
}

/** `git version 2.45.1` → `{ major: 2, minor: 45 }`, or null when it is not that. */
export function parseGitVersion(output: string): { major: number; minor: number } | null {
  const match = /(\d+)\.(\d+)/.exec(output);
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** A gigabyte, which is roughly one checkout of anything worth a worktree. */
const LOW_DISK_BYTES = 1_000_000_000;

export async function preflight({
  config,
  run = runCommand,
  freeBytes = freeBytesOf,
  nodeVersion = process.version,
  nodePath = process.execPath,
}: PreflightOptions): Promise<Preflight> {
  const checks = await Promise.all([
    daemonCheck(config),
    gitCheck(run),
    nodeCheck(nodeVersion, nodePath),
    stateDirCheck(config),
    diskCheck(config, freeBytes),
  ]);

  return {
    checks,
    paths: {
      stateDir: config.stateDir,
      databasePath: config.databasePath,
      worktreesDir: config.worktreesDir,
      transcriptsDir: config.transcriptsDir,
    },
  };
}

/**
 * Each check is wrapped, so one broken platform call cannot take the list down.
 *
 * The wrapper is what makes F2.5 true rather than intended: `statfs` does not
 * exist everywhere, and the machine where it is missing is exactly the machine
 * whose other four answers someone needs to read.
 */
async function guard(id: Check["id"], label: string, body: () => Promise<Check> | Check): Promise<Check> {
  try {
    return await body();
  } catch (error) {
    return {
      id,
      label,
      state: "fail",
      value: error instanceof Error ? error.message : String(error),
      fix: null,
    };
  }
}

function daemonCheck(config: ServerConfig): Promise<Check> {
  return guard("daemon", "daemon", () => ({
    id: "daemon" as const,
    label: "daemon",
    state: "ok" as const,
    // It answered this request, so there is nothing to verify: the interesting
    // part is *which* daemon and *where*, for the person with two checkouts.
    value: `v${LUMEM_VERSION} · escutando em ${config.host}:${config.port}`,
    fix: null,
  }));
}

function gitCheck(run: CommandRunner): Promise<Check> {
  return guard("git", "git", async () => {
    const outcome = await run("git", ["--version"]);

    if (!outcome.ok && outcome.output === "") {
      return {
        id: "git" as const,
        label: "git",
        state: "fail" as const,
        value: `não deu para executar o git: ${outcome.failure ?? "sem saída"}`,
        fix: null,
      };
    }

    const version = parseGitVersion(outcome.output);
    if (version === null) {
      return {
        id: "git" as const,
        label: "git",
        state: "warn" as const,
        value: `o git respondeu algo que não é uma versão: ${outcome.output}`,
        fix: null,
      };
    }

    const tooOld =
      version.major < MIN_GIT_VERSION.major ||
      (version.major === MIN_GIT_VERSION.major && version.minor < MIN_GIT_VERSION.minor);

    if (tooOld) {
      return {
        id: "git" as const,
        label: "git",
        state: "fail" as const,
        value:
          `${version.major}.${version.minor} · abaixo de ` +
          `${MIN_GIT_VERSION.major}.${MIN_GIT_VERSION.minor}, onde o comportamento de ` +
          `git worktree --orphan muda — e o produto inteiro é worktree`,
        fix: null,
      };
    }

    return {
      id: "git" as const,
      label: "git",
      state: "ok" as const,
      value: `${version.major}.${version.minor} · git worktree com --orphan`,
      fix: null,
    };
  });
}

function nodeCheck(version: string, path: string): Promise<Check> {
  return guard("node", "node", () => ({
    id: "node" as const,
    label: "node",
    // The daemon is running on it, so "does it work" is already answered. What
    // this line is for is the machine with three Node installs, where the
    // adapter ends up on a different one than the daemon.
    state: "ok" as const,
    value: `${version.replace(/^v/, "")} · ${path}`,
    fix: null,
  }));
}

function stateDirCheck(config: ServerConfig): Promise<Check> {
  return guard("stateDir", "~/.lumem", () => {
    if (!existsSync(config.stateDir)) {
      return {
        id: "stateDir" as const,
        label: "~/.lumem",
        state: "warn" as const,
        value: `${config.stateDir} ainda não existe — o daemon a cria quando precisar`,
        fix: null,
      };
    }

    try {
      accessSync(config.stateDir, constants.W_OK);
    } catch {
      return {
        id: "stateDir" as const,
        label: "~/.lumem",
        state: "fail" as const,
        value: `${config.stateDir} existe mas o daemon não pode escrever nela`,
        fix: null,
      };
    }

    return {
      id: "stateDir" as const,
      label: "~/.lumem",
      state: "ok" as const,
      value: `${config.stateDir} · registro em ${config.databasePath}`,
      fix: null,
    };
  });
}

function diskCheck(config: ServerConfig, freeBytes: (path: string) => number): Promise<Check> {
  return guard("disk", "disco", () => {
    // The state directory may not exist yet; its volume is what matters, and the
    // home directory is on the same one by construction.
    const target = existsSync(config.stateDir) ? config.stateDir : process.env["HOME"] ?? "/";
    const free = freeBytes(target);

    return {
      id: "disk" as const,
      label: "disco",
      state: free < LOW_DISK_BYTES ? ("warn" as const) : ("ok" as const),
      value: `${formatBytes(free)} livres · cada worktree custa o tamanho do checkout`,
      fix: null,
    };
  });
}
