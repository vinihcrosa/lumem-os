/**
 * Restores the executable bit on node-pty's `spawn-helper`.
 *
 * node-pty ships prebuilt binaries, and pnpm's tarball extraction drops the
 * mode bits on them. On macOS every `pty.spawn` then fails with the singularly
 * unhelpful `posix_spawnp failed` — no mention of permissions, no mention of
 * which file. The whole product is PTYs, so this is not a nice-to-have.
 *
 * Runs from the root `postinstall`, and is idempotent: a repo where the bit
 * survived is left untouched.
 */
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Directory containing the installed node-pty package, if it is installed. */
export function findNodePtyRoot(nodeModules: string): string | null {
  // pnpm's virtual store: node_modules/.pnpm/node-pty@<version>/node_modules/node-pty
  const store = join(nodeModules, ".pnpm");
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("node-pty@")) continue;
      const candidate = join(store, entry, "node_modules", "node-pty");
      if (existsSync(candidate)) return candidate;
    }
  }

  // Flat layout (npm, yarn, or pnpm with node-linker=hoisted).
  const flat = join(nodeModules, "node-pty");
  return existsSync(flat) ? flat : null;
}

/** Every `spawn-helper` shipped in the package's prebuilds. */
export function findSpawnHelpers(nodePtyRoot: string): string[] {
  const prebuilds = join(nodePtyRoot, "prebuilds");
  if (!existsSync(prebuilds)) return [];

  return readdirSync(prebuilds)
    .map((platform) => join(prebuilds, platform, "spawn-helper"))
    .filter((path) => existsSync(path));
}

/** @returns the paths whose mode actually had to change. */
export function ensureExecutable(paths: readonly string[]): string[] {
  const fixed: string[] = [];
  for (const path of paths) {
    const mode = statSync(path).mode;
    // Owner, group and other execute bits.
    const wanted = mode | 0o111;
    if (mode === wanted) continue;
    chmodSync(path, wanted);
    fixed.push(path);
  }
  return fixed;
}

export function run(nodeModules: string): string[] {
  const root = findNodePtyRoot(nodeModules);
  // Not installed yet is a normal state during a partial install.
  if (root === null) return [];
  return ensureExecutable(findSpawnHelpers(root));
}
