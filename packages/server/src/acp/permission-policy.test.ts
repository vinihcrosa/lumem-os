import { join } from "node:path";

import type { AcpPermissionOption } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { decidePermission, type PermissionCall } from "./permission-policy.js";

/**
 * A política, sem processo nenhum (`session-mode`, T6 e Q3).
 *
 * Cada teste aqui é uma frase da regra, e a regra inteira é curta de propósito:
 * `kind === "read"`, `locations` não vazio, e **todos** os caminhos dentro do
 * checkout. O que não está na regra não entra por analogia.
 */

const CWD = "/repos/lorebase";

/** As opções que um agente normalmente oferece. */
const OPTIONS: AcpPermissionOption[] = [
  { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
  { optionId: "always", name: "sempre", kind: "allow_always" },
  { optionId: "no", name: "não", kind: "reject_once" },
];

const call = (over: Partial<PermissionCall> = {}): PermissionCall => ({
  kind: "read",
  locations: [{ path: join(CWD, "src/index.ts"), line: null }],
  options: OPTIONS,
  ...over,
});

describe("perguntar tudo", () => {
  it("nunca aprova, e não inventa justificativa", () => {
    // Sem `reason`: a pessoa ia ser perguntada de qualquer forma, e escrever um
    // porquê para o padrão poria justificativa em todo cartão que não tem uma.
    expect(decidePermission("ask", CWD, call())).toEqual({ approve: false, reason: null });
  });
});

describe("automático", () => {
  it("aprova leitura de arquivo dentro do checkout", () => {
    const decision = decidePermission("auto", CWD, call());

    expect(decision).toMatchObject({ approve: true, optionId: "allow" });
  });

  it("escolhe a opção de permitir uma vez, e não a de sempre", () => {
    /*
     * `allow_always` é memória por ferramenta, que é outra feature. Escolher a
     * opção errada aqui daria ao modo do Lumem um efeito que ele não anuncia:
     * uma aprovação que sobrevive à troca de modo.
     */
    const decision = decidePermission("auto", CWD, call({
      options: [
        { optionId: "always", name: "sempre", kind: "allow_always" },
        { optionId: "allow", name: "uma vez", kind: "allow_once" },
      ],
    }));

    expect(decision).toMatchObject({ optionId: "allow" });
  });

  it("não aprova escrita", () => {
    const decision = decidePermission("auto", CWD, call({ kind: "edit" }));

    expect(decision.approve).toBe(false);
    expect(decision.reason).toMatch(/só leitura de arquivo/);
  });

  it("não aprova comando que só lê, como `git log`", () => {
    /*
     * A parte da Q3 que mais dói, e é deliberada: o protocolo reporta `git log` e
     * `git push` com a mesma forma, e separá-los é casar string de comando — a
     * lista de nomes especiais que a Q3 já recusou, de outro chapéu.
     */
    const decision = decidePermission("auto", CWD, call({ kind: "execute", locations: [] }));

    expect(decision.approve).toBe(false);
  });

  it("não aprova leitura sem caminho: silêncio não vira sim", () => {
    const decision = decidePermission("auto", CWD, call({ locations: [] }));

    expect(decision.approve).toBe(false);
    expect(decision.reason).toMatch(/qual arquivo/);
  });

  it("um caminho fora derruba o pedido inteiro, mesmo com nove dentro", () => {
    const decision = decidePermission("auto", CWD, call({
      locations: [
        ...Array.from({ length: 9 }, (_, i) => ({ path: join(CWD, `a${i}.ts`), line: null })),
        { path: "/etc/passwd", line: null },
      ],
    }));

    expect(decision.approve).toBe(false);
    expect(decision.reason).toMatch(/passwd/);
  });

  it("aprova caminho relativo, resolvido contra o checkout", () => {
    const decision = decidePermission("auto", CWD, call({
      locations: [{ path: "src/index.ts", line: null }],
    }));

    expect(decision.approve).toBe(true);
  });

  it.each([
    ["sobe com ..", "../outro/segredo.ts"],
    ["sobe até a raiz", "../../../etc/passwd"],
    ["irmão com nome prefixado", "/repos/lorebase-privado/segredo.ts"],
  ])("não aprova caminho que %s", (_label, path) => {
    /*
     * O terceiro caso é a razão de a comparação usar `relative` e não
     * `startsWith`: `/repos/lorebase-privado` **é** prefixado por
     * `/repos/lorebase`, e um checkout vizinho passaria por dentro deste.
     */
    const decision = decidePermission("auto", CWD, call({
      locations: [{ path, line: null }],
    }));

    expect(decision.approve).toBe(false);
  });

  it("aprova o próprio diretório do checkout", () => {
    const decision = decidePermission("auto", CWD, call({
      locations: [{ path: CWD, line: null }],
    }));

    expect(decision.approve).toBe(true);
  });

  it("aprova um `.env` dentro do checkout, de propósito", () => {
    /*
     * A Q3 decidiu isto com o custo nomeado: a alternativa é uma lista de nomes
     * de arquivo dentro do daemon, que envelhece mal e dá falsa segurança. A
     * descrição do menu diz que leitura dentro do checkout passa — e `.env` é
     * leitura dentro do checkout.
     */
    const decision = decidePermission("auto", CWD, call({
      locations: [{ path: join(CWD, ".env"), line: null }],
    }));

    expect(decision.approve).toBe(true);
  });

  it("não aprova nada quando o checkout é vazio", () => {
    // Um `cwd` vazio faria todo caminho relativo cair na raiz do processo. É o
    // caminho de leitura de conversa encerrada, e ele não decide nada.
    const decision = decidePermission("auto", "", call({
      locations: [{ path: "src/index.ts", line: null }],
    }));

    expect(decision.approve).toBe(false);
  });
});

describe("liberado", () => {
  it("aprova qualquer chamada, inclusive fora do checkout", () => {
    const decision = decidePermission("free", CWD, call({
      kind: "execute",
      locations: [{ path: "/etc/passwd", line: null }],
    }));

    expect(decision).toMatchObject({ approve: true, optionId: "allow" });
  });
});

describe("o agente que não oferece por onde aprovar", () => {
  /*
   * A Q6, e o único caminho desta feature que poderia negar em silêncio.
   *
   * O daemon não responde "sim" no abstrato: ele escolhe uma das opções que o
   * agente mandou. Sem `allow_once`, aprovar é impossível — e negar seria parar
   * o agente sem nada na tela dizendo por quê.
   */
  it.each(["auto", "free"] as const)("sobe para a pessoa em %s, em vez de negar", (mode) => {
    const decision = decidePermission(mode, CWD, call({
      options: [{ optionId: "no", name: "não", kind: "reject_once" }],
    }));

    expect(decision.approve).toBe(false);
    expect(decision.reason).toMatch(/não ofereceu/);
  });

  it("não aprova quando o agente não ofereceu opção nenhuma", () => {
    const decision = decidePermission("free", CWD, call({ options: [] }));

    expect(decision.approve).toBe(false);
  });
});
