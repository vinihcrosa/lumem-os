import { createRequire } from "node:module";
import { dirname } from "node:path";

import { ensureExecutable, findSpawnHelpers } from "../../../scripts/ensure-pty-helper.js";

/**
 * Restores the executable bit on node-pty's `spawn-helper`, after `npm i -g`.
 *
 * The repository already does this for its own `node_modules` — the bit is lost
 * in tarball extraction, and every `pty.spawn` then fails with
 * `posix_spawnp failed`, naming neither permissions nor the file. The installed
 * package needs the same fix in a different tree, which is why the location is
 * resolved rather than assumed.
 *
 * **It never throws.** A postinstall that fails aborts `npm i -g` entirely, and
 * trading "the product is not installed" for "terminals do not open" is a bad
 * trade — especially since the preflight on the first screen exists to say the
 * second one out loud, in the product, where it can be read.
 */

/** Where node-pty actually ended up, whatever the installer decided. */
export function resolveNodePtyRoot(
  resolve: (specifier: string) => string = createRequire(import.meta.url).resolve,
): string | null {
  try {
    return dirname(resolve("node-pty/package.json"));
  } catch {
    // Not installed yet, or installed somewhere unreachable. Normal during a
    // partial install.
    return null;
  }
}

/** @returns the paths whose mode actually had to change. */
export function fixSpawnHelpers(root: string | null): string[] {
  if (root === null) return [];
  return ensureExecutable(findSpawnHelpers(root));
}

export function main(log: (message: string) => void = (m) => process.stderr.write(`${m}\n`)): void {
  try {
    const fixed = fixSpawnHelpers(resolveNodePtyRoot());
    if (fixed.length > 0) log(`lumem: permissão de execução restaurada em ${String(fixed.length)} arquivo(s)`);
  } catch (error) {
    log(
      `lumem: não consegui preparar o node-pty (${error instanceof Error ? error.message : String(error)}). ` +
        "A instalação segue; se os terminais não abrirem, a primeira tela do Lumem diz o que houve.",
    );
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("postinstall.mjs")) main();
