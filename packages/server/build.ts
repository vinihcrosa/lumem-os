/**
 * Bundles the daemon into a single ESM file.
 *
 * The published package cannot ship the TypeScript source and a `tsx` — a
 * transpiler is a development dependency, and putting one on the production path
 * means shipping it. So the daemon becomes one file, and the only things left
 * outside it are the two packages that contain machine code.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * The two packages that cannot be bundled, because they are not JavaScript.
 *
 * They are also the only two dependencies the published package declares, and
 * `externals.test.ts` proves the bundle imports nothing else — a third bare
 * import here would install fine and crash at boot on someone else's machine.
 */
export const NATIVE_DEPENDENCIES = ["better-sqlite3", "node-pty"] as const;

/**
 * `require` for the CommonJS dependencies that ended up inside an ESM bundle.
 *
 * Not a precaution: without it the daemon dies on the first import with
 * `Error: Dynamic require of "process" is not supported`, thrown from inside
 * `yaml@2.9.0`. Measured on this tree — see docs/prd/distribution/prd.md §3.1.
 */
const REQUIRE_SHIM =
  "import{createRequire as __lumemCreateRequire}from'node:module';" +
  "const require=__lumemCreateRequire(import.meta.url);";

/**
 * Two levels below the package root, and that is load-bearing.
 *
 * `db/index.ts` resolves migrations relative to its own module — `../../drizzle`
 * — so the bundle has to sit exactly this deep for `drizzle/` at the package
 * root to be found. Flattening this produces a daemon that boots, opens a
 * database with no tables in it, and fails on the first query.
 */
export const OUTFILE = "dist/server/main.mjs";

/**
 * The package root, resolved from this module rather than from `process.cwd()`.
 *
 * `pnpm test` runs vitest from the repository root, so a relative entry point
 * resolves against the wrong directory and the build fails with
 * `Could not resolve "src/main.ts"` — in the suite, not in the build.
 */
const packageRoot = dirname(fileURLToPath(import.meta.url));

export async function bundle(outfile: string = OUTFILE): Promise<void> {
  await build({
    entryPoints: [resolve(packageRoot, "src", "main.ts")],
    outfile: resolve(packageRoot, outfile),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    external: [...NATIVE_DEPENDENCIES],
    banner: { js: REQUIRE_SHIM },
    // Kept: the daemon logs stack traces, and a minified one is a stack trace
    // nobody can act on. The 3 MB this costs is a download, once.
    minify: false,
    sourcemap: false,
    logLevel: "info",
  });
}

// Only when this file *is* the entry point. Comparing to `argv[1]` rather than
// matching the filename, because `externals.test.ts` imports `bundle` — and a
// filename check would rebuild the daemon on every import of this module.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await bundle();
}
