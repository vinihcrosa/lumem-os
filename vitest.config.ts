import { defineConfig } from "vitest/config";

/**
 * Quantos processos de teste rodam ao mesmo tempo.
 *
 * O default do vitest é um fork por core — 10 nesta máquina. Cada um carrega
 * jsdom, ou sobe processo real, repositório git e SQLite, e a soma come a RAM
 * da máquina inteira: com um agente rodando gate ao lado, o computador engasga
 * antes de a suíte terminar.
 *
 * O teto é baixo de propósito e **não** é lei: `LUMEM_TEST_WORKERS=10` devolve
 * a máquina inteira para quem tiver folga, e o CI, que roda sozinho num runner,
 * pode subir o número sem tocar neste arquivo.
 */
const workers = Number(process.env["LUMEM_TEST_WORKERS"] ?? 4);

export default defineConfig({
  test: {
    projects: ["packages/*", "scripts"],
    // A run that matched no test files is not a pass. `--changed` in
    // particular will happily exit 0 having executed nothing.
    passWithNoTests: false,
    maxWorkers: workers,
    minWorkers: 1,
  },
});
