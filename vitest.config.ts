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

    /**
     * Cobertura.
     *
     * **O `include` é a configuração inteira, e não higiene.** O provider `v8`
     * instrumenta tudo que o processo carrega, e a suíte carrega os bundles de
     * `packages/web/dist/assets` e `packages/cli/dist/web/assets` — 186 376
     * linhas de saída minificada, 0% cobertas por definição. Sem esta lista, o
     * relatório sai com **12,05% de linha e 88,06% de ramo no mesmo cabeçalho**,
     * que não é um projeto mal testado: é um denominador errado. Medido antes de
     * escrever este bloco; com o `include`, os mesmos 3374 testes dão 94,0% —
     * e a execução fica **mais rápida** (73,5s contra 86,8s), porque instrumentar
     * 186 mil linhas de bundle também custa tempo.
     *
     * Um número de cobertura só vale se o denominador for código que alguém
     * escreveu e pode consertar.
     */
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "scripts/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        // Os ajudantes de teste são teste. Contá-los é medir a régua.
        "packages/*/src/testing/**",
        "packages/web/src/test/**",
        // `import.meta.env.DEV` em `main.tsx` — não existe no build de
        // produção, então é a maior linha não coberta do repositório (444)
        // medindo algo que não é entregue.
        "packages/web/src/ui/Styleguide.tsx",
        // Derivado do Open Design pelo `design:sync`, como diz o CLAUDE.md.
        // Ninguém escreve, ninguém conserta — e o `sonar-project.properties`
        // já o exclui da análise pelo mesmo motivo. As duas listas concordam
        // de propósito: número local diferente do número do Sonar é como se
        // aprende a não olhar nenhum dos dois.
        "packages/web/src/styles/tokens.ts",
      ],
      reporter: ["text-summary", "lcov"],
    },
  },
});
