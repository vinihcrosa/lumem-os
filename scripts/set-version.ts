/**
 * The version, in the three places that have to agree. Pure and importable; the
 * entry point is `run-set-version.ts`.
 *
 * `LUMEM_VERSION` is what the daemon reports to the client and what `lumem
 * version` prints. `packages/shared/package.json` is what a test already
 * compares it against. `packages/cli/package.json` is what npm publishes — and
 * it is the one nothing was guarding, because it did not exist until the
 * product started being installable.
 *
 * Three files edited by hand is three chances to publish a build that lies
 * about which build it is.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Semantic version, and the prerelease shapes npm accepts. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface VersionFile {
  /** Relative to the repository root. */
  path: string;
  /** Rewrites the file's contents. Throws when the anchor it needs is missing. */
  apply: (contents: string, version: string) => string;
}

function manifest(path: string): VersionFile {
  return {
    path,
    apply(contents, version) {
      const replaced = contents.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`);
      if (replaced === contents && !contents.includes(`"version": "${version}"`)) {
        throw new Error(`${path} não tem um campo "version" para escrever`);
      }
      return replaced;
    },
  };
}

export const VERSION_FILES: readonly VersionFile[] = [
  {
    path: "packages/shared/src/constants.ts",
    apply(contents, version) {
      const replaced = contents.replace(
        /(export const LUMEM_VERSION = )"[^"]*"/,
        `$1"${version}"`,
      );
      if (replaced === contents && !contents.includes(`LUMEM_VERSION = "${version}"`)) {
        throw new Error("constants.ts não tem LUMEM_VERSION para escrever");
      }
      return replaced;
    },
  },
  manifest("packages/shared/package.json"),
  manifest("packages/cli/package.json"),
];

export function assertVersion(version: string): void {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`versão inválida: ${version}. Esperado x.y.z, opcionalmente com -rc.1`);
  }
}

/**
 * @returns the files that were rewritten.
 *
 * Validates before writing anything: a bad version that updated two of three
 * files would leave the repository claiming two versions at once.
 */
export function setVersion(root: string, version: string): string[] {
  assertVersion(version);

  const pending = VERSION_FILES.map((file) => {
    const path = join(root, file.path);
    const contents = readFileSync(path, "utf8");
    return { path, contents: file.apply(contents, version) };
  });

  for (const { path, contents } of pending) writeFileSync(path, contents);
  return pending.map(({ path }) => path);
}
