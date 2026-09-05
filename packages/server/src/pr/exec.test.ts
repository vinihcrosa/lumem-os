import { describe, expect, it } from "vitest";

import { DEFAULT_GH_TIMEOUT_MS, GH_MAX_BUFFER, execGh } from "./exec.js";

/**
 * O executor de verdade — e sim, ele executa um processo.
 *
 * Isto **não** contradiz a regra de nunca chamar o `gh` em teste: o que roda
 * aqui é `/bin/sh`, e o que está sob teste é o **contorno** do `execFile` —
 * timeout e `maxBuffer`, que a P2 exige e que nenhum outro teste tocava. Sem
 * este arquivo, apagar as duas opções deixava a suíte inteira verde, e o daemon
 * ficaria à mercê de um `gh` travado ou de um repositório com 300 PRs.
 */

/** Um executor com o mesmo contorno do `execGh`, apontado para outro binário. */
const runSh = (script: string, timeoutMs?: number) =>
  execGh(["-c", script], { cwd: process.cwd(), timeoutMs, bin: "/bin/sh" });

describe("o contorno do processo", () => {
  it("desiste quando o comando não responde a tempo", async () => {
    const result = await runSh("sleep 30", 300);

    expect(result.timedOut).toBe(true);
  });

  it("aguenta uma resposta maior que o padrão do Node", async () => {
    /*
     * O teto é declarado **para cima**, e é aí que ele tem dentes.
     *
     * O padrão do `execFile` é 1 MiB, e um repositório com dezenas de PRs
     * passa disso: o spike mediu 236 KB para 50 PRs já projetadas, e sem a
     * projeção eram 300 KB. Apagar a opção não deixaria o daemon vulnerável —
     * deixaria o `gh pr list` de um repositório grande falhar por
     * `maxBuffer exceeded`, que é um erro que ninguém liga à causa.
     *
     * Dois MiB: o dobro do padrão, e um quarto do nosso teto.
     */
    const bytes = 2 * 1024 * 1024;
    const result = await runSh(`yes 0123456789abcdef | head -c ${String(bytes)}`);

    expect(result.spawnError).toBeNull();
    expect(result.stdout.length).toBe(bytes);
    expect(GH_MAX_BUFFER).toBeGreaterThan(bytes);
  });

  it("binário ausente vira `ENOENT`, e não uma exceção", async () => {
    const result = await execGh(["--version"], {
      cwd: process.cwd(),
      bin: "lumem-binario-que-nao-existe",
    });

    expect(result.spawnError).toBe("ENOENT");
  });

  it("código diferente de zero é resposta, e não lançamento", async () => {
    // Quem classifica é quem chamou. Um executor que lançasse obrigaria cada
    // chamador a repetir a tradução, e é assim que duas telas passam a dizer
    // coisas diferentes sobre a mesma falha.
    const result = await runSh("echo erro >&2; exit 3");

    expect(result.code).toBe(3);
    expect(result.stderr.trim()).toBe("erro");
  });

  it("o orçamento de tempo tem um padrão, e ele é curto", () => {
    // A barra é polida a cada 15 s: um `gh` travado não pode segurar o ciclo.
    expect(DEFAULT_GH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
