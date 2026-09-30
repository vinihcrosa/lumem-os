/**
 * A atualização do Lumem, na parte que o CLI e o daemon dividem (`038`).
 *
 * Nasceu no `upgrade.ts` do CLI e subiu para cá quando o daemon passou a perguntar
 * ao registry sozinho: o CLI e o servidor são dois pacotes que não se importam, e
 * duas cópias de `compareVersions` seriam duas regras para *"há versão nova?"* — o
 * banner da tela e o `lumem upgrade` podiam discordar.
 */

export const PACKAGE_NAME = "@vinihcrosa/lumem-os";

/**
 * O contrato da casca (`038`, porta 4): `health` e `system.status` a respondem, e o app
 * de desktop só fala com a que conhece. Comparar `version` por semver faria toda
 * release parecer compatível ou incompatível por acaso.
 */
export const PROTOCOL_VERSION = 1 as const;

/**
 * The `latest` dist-tag, and nothing else — a few hundred bytes, not the full packument.
 *
 * Only the slash of the scope is escaped, which is how npm itself writes the
 * path (`038`, AC 15). The `@` used to be escaped too (`%40`); the registry
 * answers 200 to both, measured on 2026-09-29.
 */
export const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME.replace("/", "%2F")}/latest`;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Which package manager installed the copy that is running.
 *
 * Read from the path of the running copy (the caller passes its own
 * `import.meta.url`), because that is the only evidence that survives: the environment of `npm i -g` is long gone by the time someone types
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
