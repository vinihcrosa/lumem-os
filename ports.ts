import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Port assignments, shared by the vite dev proxy, the playwright harness and
 * the e2e global setup.
 *
 * Read from JSON rather than declared here because `packages/shared` also needs
 * the values and asserts them against the same file — see `constants.test.ts`.
 */
const ports = JSON.parse(
  readFileSync(fileURLToPath(new URL("./ports.json", import.meta.url)), "utf8"),
) as Record<string, number>;

function required(name: string): number {
  const value = ports[name];
  if (value === undefined) throw new Error(`ports.json is missing "${name}"`);
  return value;
}

export const SERVER_PORT = required("server");
export const WEB_PORT = required("web");
export const E2E_SERVER_PORT = required("e2eServer");
export const E2E_WEB_PORT = required("e2eWeb");

/**
 * Throwaway daemon state for e2e. Deliberately inside the repo and gitignored,
 * so a failed run leaves something inspectable instead of polluting ~/.lumem.
 *
 * fileURLToPath, not URL.pathname: pathname is percent-encoded, so a checkout
 * under a path with a space would produce a literal "Meus%20Projetos" directory.
 */
export const E2E_STATE_DIR = fileURLToPath(new URL(".lumem-e2e/", import.meta.url));
