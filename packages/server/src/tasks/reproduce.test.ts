import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { matches, reproduce } from "./reproduce.js";

/**
 * O daemon rerodando o que o revisor afirmou (`028` Parte 7 — T54).
 *
 * **Processo de verdade, e não dublê**: o que está sob teste é se o comando roda
 * no diretório certo, se o teto mata, e se a saída volta — e nenhuma dessas
 * perguntas sobrevive a um `vi.fn()`.
 */

function checkout(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-repro-"));
  writeFileSync(join(dir, "marca.txt"), "estou aqui\n");
  return dir;
}

describe("a reprodução roda no checkout", () => {
  it("o comando enxerga os arquivos de lá, e não os de quem chamou", async () => {
    const cwd = checkout();

    const result = await reproduce({ command: "cat marca.txt", cwd });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("estou aqui");
  });

  it("a saída de erro volta junto — é metade do que prova um achado", async () => {
    const result = await reproduce({ command: "echo tudo bem >&2; exit 3", cwd: checkout() });

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("tudo bem");
  });

  it("o teto mata, e `exitCode: null` é *não deu para verificar*", async () => {
    /*
     * Não é *"o revisor mentiu"*: um achado não verificado **continua
     * segurando** o cartão, dizendo que segura por não ter sido verificado.
     * Tratar teto como refutação seria o portão falhando aberto.
     */
    const result = await reproduce({ command: "sleep 5", cwd: checkout(), timeoutMs: 150 });

    expect(result.exitCode).toBeNull();
    expect(result.output).toContain("passou do tempo");
  });
});

describe("a saída bate com o que o revisor disse", () => {
  it("sem `expected`, o que conta é o código de saída", () => {
    // A demonstração mais comum é um comando que falha, e exigir texto dela
    // seria cerimônia.
    expect(matches({ exitCode: 1, output: "" }, null)).toBe(true);
    expect(matches({ exitCode: 0, output: "" }, null)).toBe(false);
  });

  it("com `expected`, é substring — deliberadamente burro", () => {
    /*
     * A alternativa é o daemon aprendendo a ler saída de teste de qualquer
     * linguagem, e aí ele erra de um jeito que ninguém prevê a partir do que
     * está escrito no achado.
     */
    expect(matches({ exitCode: 0, output: "19 passed | 0 failed" }, "19 passed")).toBe(true);
    expect(matches({ exitCode: 1, output: "19 passed" }, "20 passed")).toBe(false);
  });

  it("o que não chegou a rodar nunca bate", () => {
    expect(matches({ exitCode: null, output: "" }, null)).toBe(false);
    expect(matches({ exitCode: null, output: "19 passed" }, "19 passed")).toBe(false);
  });
});
