import { readFileSync } from "node:fs";

/**
 * O par de portas default do repositório, impresso como "daemon web".
 *
 * Existe porque `env.sh` é bash e a fonte é o `ports.json` da raiz — o mesmo
 * que o vite, o playwright e `packages/shared/src/constants.ts` leem. Repetir
 * `4317` dentro do shell seria um quarto lugar para o número divergir.
 */

const file = process.argv[2] ?? new URL("../../ports.json", import.meta.url);
const ports = JSON.parse(readFileSync(file, "utf8"));

for (const key of ["server", "web"]) {
  if (typeof ports[key] !== "number") {
    process.stderr.write(`ports.json não tem "${key}"\n`);
    process.exit(1);
  }
}

process.stdout.write(`${ports.server} ${ports.web}\n`);
