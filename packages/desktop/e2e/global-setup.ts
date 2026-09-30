import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * O app que o e2e lança é o **bundle** (`main` do `package.json` é `dist/index.cjs`), e não o
 * TypeScript: sem reconstruí-lo aqui, o teste roda contra o que o último `pnpm build` deixou —
 * e uma mutação em `src/` passa por ele sem cair (medido, na primeira versão deste spec).
 */
export default function globalSetup(): void {
  // O `pnpm` é o do `PATH` de quem roda o e2e, de propósito: vem do corepack, do mise ou do
  // nvm, e não tem caminho fixo. Quem roda o e2e já roda `pnpm` com esse mesmo `PATH`.
  execFileSync("pnpm", ["exec", "tsx", "build.ts"], { // NOSONAR S4036: intencional, ver acima
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "ignore",
  });
}
