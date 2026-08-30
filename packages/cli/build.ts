/**
 * Assembles the package that gets published.
 *
 * Nothing here is compiled that was not already built: the daemon comes from
 * `@lumem/server`'s bundle and the interface from `@lumem/web`'s `vite build`,
 * both of which turbo has run by the time this does. What this file owns is the
 * **layout**, and the layout is load-bearing:
 *
 *   lumem/
 *     bin/lumem.mjs          the CLI, bundled here
 *     dist/server/main.mjs   the daemon
 *     dist/web/              index.html + assets
 *     drizzle/               the migrations
 *
 * `dist/server/main.mjs` resolves migrations at `../../drizzle` and the built
 * web at `../web`. Both are relative to that file, and both break silently if
 * this tree is flattened — the daemon boots, finds no tables, and serves
 * nothing.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

export interface AssembleOptions {
  /** Where the package tree is written. The package root itself in production. */
  target?: string;
}

export async function assemble({ target = here }: AssembleOptions = {}): Promise<void> {
  rmSync(join(target, "dist"), { recursive: true, force: true });
  rmSync(join(target, "drizzle"), { recursive: true, force: true });
  mkdirSync(join(target, "dist", "server"), { recursive: true });

  cpSync(
    join(repoRoot, "packages", "server", "dist", "server", "main.mjs"),
    join(target, "dist", "server", "main.mjs"),
  );
  cpSync(join(repoRoot, "packages", "server", "drizzle"), join(target, "drizzle"), {
    recursive: true,
  });
  cpSync(join(repoRoot, "packages", "web", "dist"), join(target, "dist", "web"), {
    recursive: true,
  });

  await build({
    entryPoints: [join(here, "src", "main.ts")],
    outfile: join(target, "bin", "lumem.mjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // The daemon is loaded at runtime by path, not imported here: bundling it
    // into the CLI would move it out of `dist/server/`, and with it the two
    // relative paths above.
    external: ["../dist/server/main.mjs"],
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "info",
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await assemble();
}
