import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { probePort } from "./port.js";

/**
 * Updating the daemon in place.
 *
 * The daemon is not a separate artifact from the CLI: `bin/lumem.mjs` and
 * `dist/server/main.mjs` ship in the same npm package, so "atualizar o daemon"
 * is "reinstalar o pacote". What this file adds over typing
 * `npm i -g @vinihcrosa/lumem-os@latest` by hand is the part that command gets
 * wrong on the two machines that are not npm-on-a-clean-prefix:
 *
 *  - it asks the registry **first**, so being already up to date costs one HTTP
 *    request and not a full reinstall;
 *  - it installs with the package manager that **owns the installed copy**. A
 *    `npm i -g` over a pnpm global install leaves two `lumem` on the PATH and
 *    the older one usually wins;
 *  - it says out loud that a daemon already running keeps the old code until it
 *    is restarted, which is the one way this command silently looks broken.
 */

export const PACKAGE_NAME = "@vinihcrosa/lumem-os";

/** The `latest` dist-tag, and nothing else — a few hundred bytes, not the full packument. */
export const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Which package manager installed the copy that is running.
 *
 * Read from the path of this very file, because that is the only evidence that
 * survives: the environment of `npm i -g` is long gone by the time someone types
 * `lumem upgrade`, and every manager puts its global store somewhere it names.
 */
export function detectPackageManager(installPath: string): PackageManager {
  const path = installPath.replace(/\\/g, "/");
  if (/\/\.?pnpm[/-]/.test(path)) return "pnpm";
  if (path.includes("/.bun/")) return "bun";
  if (/\/\.?yarn\//.test(path)) return "yarn";
  return "npm";
}

export interface InstallCommand {
  command: string;
  args: string[];
}

export function installCommand(manager: PackageManager, spec: string): InstallCommand {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["add", "--global", spec] };
    case "yarn":
      return { command: "yarn", args: ["global", "add", spec] };
    case "bun":
      return { command: "bun", args: ["add", "--global", spec] };
    case "npm":
      return { command: "npm", args: ["install", "--global", spec] };
  }
}

/**
 * Orders two versions, with a prerelease sorting **before** its release.
 *
 * Enough semver for a dist-tag comparison and no more: the only two versions
 * ever compared here are what is installed and what `latest` points at.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const split = (version: string) => {
    const [core = "", pre = ""] = version.trim().replace(/^v/, "").split("-", 2);
    return { parts: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const left = split(a);
  const right = split(b);

  for (let i = 0; i < 3; i += 1) {
    const l = left.parts[i] ?? 0;
    const r = right.parts[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  if (left.pre === right.pre) return 0;
  // `1.0.0-rc.1` is older than `1.0.0`, and an absent prerelease is the release.
  if (left.pre === "") return 1;
  if (right.pre === "") return -1;
  return left.pre < right.pre ? -1 : 1;
}

export interface FetchLatestOptions {
  /** Injected by tests; `fetch` in production. */
  request?: typeof fetch;
  timeoutMs?: number;
}

/** @throws when the registry is unreachable, refuses, or answers something else. */
export async function fetchLatestVersion({
  request = fetch,
  timeoutMs = 10_000,
}: FetchLatestOptions = {}): Promise<string> {
  const response = await request(REGISTRY_URL, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`o registry respondeu ${String(response.status)}`);

  const body = (await response.json()) as { version?: unknown };
  if (typeof body.version !== "string" || body.version === "") {
    throw new Error("o registry respondeu sem versão");
  }
  return body.version;
}

export interface UpgradeDeps {
  out: (line: string) => void;
  err: (line: string) => void;
  /** The version running right now. */
  current: string;
  /** Only report; never install. */
  check: boolean;
  /** Where a daemon would be, so the "restart it" line only appears when there is one. */
  origin: string;
  fetchLatest?: () => Promise<string>;
  /** @returns the exit code of the installer. */
  install?: (command: InstallCommand) => Promise<number>;
  manager?: PackageManager;
  probe?: typeof probePort;
}

export async function upgrade(deps: UpgradeDeps): Promise<number> {
  const {
    out,
    err,
    current,
    check,
    origin,
    fetchLatest = () => fetchLatestVersion(),
    install = runInstall,
    manager = detectPackageManager(fileURLToPath(import.meta.url)),
    probe = probePort,
  } = deps;

  let latest: string;
  try {
    latest = await fetchLatest();
  } catch (error) {
    err(`não consegui perguntar ao npm qual é a última versão: ${message(error)}`);
    return 1;
  }

  const order = compareVersions(current, latest);
  if (order === 0) {
    out(`já está na última versão (v${current}).`);
    return 0;
  }
  if (order === 1) {
    // A local build, or a publish that was rolled back. Downgrading silently
    // would be a surprise, and there is nothing to upgrade to.
    out(`a versão instalada (v${current}) é mais nova que a do npm (v${latest}); nada a fazer.`);
    return 0;
  }

  if (check) {
    out(`tem versão nova: v${current} → v${latest}`);
    out("rode `lumem upgrade` para instalar.");
    return 0;
  }

  const command = installCommand(manager, `${PACKAGE_NAME}@${latest}`);
  out(`atualizando o Lumem: v${current} → v${latest}`);
  out(`$ ${command.command} ${command.args.join(" ")}`);

  let code: number;
  try {
    code = await install(command);
  } catch (error) {
    err(`não consegui rodar o ${command.command}: ${message(error)}`);
    return 1;
  }
  if (code !== 0) {
    err(`o ${command.command} saiu com ${String(code)}; o Lumem continua na v${current}.`);
    return code;
  }

  out(`pronto: v${latest} instalado.`);

  const occupant = await probe({ origin });
  if (occupant.kind === "lumem") {
    // The daemon loaded its code at boot. The new files are on disk and the
    // process running is still the old one.
    out(`o daemon em ${origin} ainda está na v${occupant.version}: pare e suba de novo para valer.`);
  }
  return 0;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Inherits stdio: the installer's own progress is the progress of this command. */
async function runInstall({ command, args }: InstallCommand): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
