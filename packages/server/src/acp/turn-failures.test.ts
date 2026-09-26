import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { TURN_FAILURES_FILE, createTurnFailureSink } from "./turn-failures.js";

afterEach(() => {
  cleanupGitFixtures();
});

function lines(stateDir: string): unknown[] {
  return readFileSync(join(stateDir, TURN_FAILURES_FILE), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}

describe("o retrato do turno que falhou, em disco", () => {
  it("escreve uma linha de JSON por falha, e o diretório nasce se não existir", () => {
    const stateDir = tempDir("lumem-turn-failures-");
    const sink = createTurnFailureSink({ stateDir });

    sink({ tag: "turn-failed", code: -32603 });

    // `_system/` não é criado por este arquivo no boot — quem o cria é o
    // `ensureMemoryHome` —, e um retrato que se perde porque o diretório ainda
    // não existia é exatamente o defeito que esta peça veio consertar.
    expect(lines(stateDir)).toEqual([{ tag: "turn-failed", code: -32603 }]);
  });

  it("acrescenta, e não sobrescreve — o arquivo é a amostra acumulada", () => {
    const stateDir = tempDir("lumem-turn-failures-");
    const sink = createTurnFailureSink({ stateDir });

    sink({ tag: "turn-failed", windowSpent: false });
    sink({ tag: "turn-failed", windowSpent: true });

    /*
     * A Q46 diz que a amostra é o que **vai ser lido no dia em que uma cota
     * fechar**. Uma escrita que trunca deixaria só a última falha, que é
     * justamente a que não precisa de arquivo — ela ainda está no terminal.
     */
    expect(lines(stateDir)).toEqual([
      { tag: "turn-failed", windowSpent: false },
      { tag: "turn-failed", windowSpent: true },
    ]);
  });

  it("disco recusado não vira exceção: quem falhou foi o turno, não a observação", () => {
    const stateDir = tempDir("lumem-turn-failures-");
    const errors: unknown[] = [];
    // Um `_system` que existe e não deixa escrever. Sem o `try`, esta linha
    // derrubaria o turno que ela veio observar — remédio pior que a doença.
    const systemDir = join(stateDir, "_system");
    mkdirSync(systemDir);
    chmodSync(systemDir, 0o500);

    const sink = createTurnFailureSink({ stateDir, onError: (error) => errors.push(error) });
    expect(() => {
      sink({ tag: "turn-failed" });
    }).not.toThrow();

    chmodSync(systemDir, 0o700);
    expect(errors).toHaveLength(1);
    expect(existsSync(join(stateDir, TURN_FAILURES_FILE))).toBe(false);
  });
});
