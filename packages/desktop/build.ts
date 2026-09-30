/**
 * O bundle do app: o processo principal e o preload, cada um num arquivo só.
 *
 * `electron` fica de fora (é o próprio runtime), e tudo o mais — inclusive o `@lumem/shared`
 * — entra no bundle. É por isso que o app empacotado não leva `node_modules`: o pacote de
 * cada plataforma é o `.app` ou a pasta do Linux, e nenhum `npm install` acontece dentro dele.
 *
 * CommonJS, porque o preload de uma janela `sandbox: true` só carrega `.cjs` de um arquivo, e
 * o processo principal acompanha.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));

for (const entry of ["index", "preload"]) {
  await build({
    entryPoints: [join(here, "src", `${entry}.ts`)],
    outfile: join(here, "dist", `${entry}.cjs`),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
    logLevel: "info",
  });
}
