/**
 * Is this the Node the repository is pinned to? (T5 of
 * docs/features/024-dev-harness/tasks.md)
 *
 * The failure it exists for is written in `.lumem/project.toml`: the default Node
 * of this machine (v26, from Homebrew) breaks jsdom in 340 tests, while the
 * terminal's (v22, from nvm) passes. Same command, same checkout, and an agent
 * that got the red would go debug code. `>= 22` accepted both.
 *
 * Only a **major** difference refuses. A patch or minor ahead of the pin is
 * reported and passes: refusing 22.18 over 22.17 would buy friction and no
 * defect this repository has ever seen.
 *
 * Runs under `node --experimental-strip-types`, before `pnpm install` — so it
 * imports nothing but `node:`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type NodeCheck =
  | { kind: "ok"; message: string }
  | { kind: "minor-differs"; message: string }
  | { kind: "major-differs"; message: string };

function parse(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.trim().replace(/^v/, "").split(".").map(Number);
  return [major, minor, patch];
}

export function checkNodeVersion(found: string, pinned: string): NodeCheck {
  const [foundMajor] = parse(found);
  const [pinnedMajor] = parse(pinned);
  const want = pinned.trim().replace(/^v/, "");
  const got = found.trim().replace(/^v/, "");
  if (got === want) return { kind: "ok", message: `node ${got}` };
  if (foundMajor !== pinnedMajor) {
    return {
      kind: "major-differs",
      message:
        `o repositório está pinado no node ${want} (.nvmrc) e encontrei ${got}. ` +
        "O jsdom quebra fora do major pinado, e o vermelho parece defeito de código. " +
        "Saída: `nvm use` (ou `nvm install`), ou `mise install`, na raiz do repositório.",
    };
  }
  return {
    kind: "minor-differs",
    message: `node ${got}, e o pino é ${want}: mesmo major, segue — mas o CI roda o ${want}`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = join(import.meta.dirname, "..");
  const pinned = readFileSync(join(root, ".nvmrc"), "utf8");
  const result = checkNodeVersion(process.versions.node, pinned);
  const stream = result.kind === "major-differs" ? process.stderr : process.stdout;
  stream.write(`${result.kind === "major-differs" ? "erro: " : ""}${result.message}\n`);
  process.exit(result.kind === "major-differs" ? 1 : 0);
}
