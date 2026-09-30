import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * O app que o e2e lança é o **bundle** (`main` do `package.json` é `dist/index.cjs`), e não o
 * TypeScript: sem reconstruí-lo aqui, o teste roda contra o que o último `pnpm build` deixou —
 * e uma mutação em `src/` passa por ele sem cair (medido, na primeira versão deste spec).
 */
export default function globalSetup(): void {
  execFileSync("pnpm", ["exec", "tsx", "build.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "ignore",
  });
}
