import { describe, expect, it } from "vitest";

import {
  checkAdapter,
  checkAdapters,
  fails,
  formatFindings,
  isExact,
  latestOf,
  MAX_RUNTIME_RELEASES_BEHIND,
  npmRegistry,
  releasesBetween,
  type PackageFacts,
  type Registry,
} from "./check-adapters.js";
import { CLAUDE_ADAPTER, CODEX_ADAPTER } from "../packages/shared/src/adapters.js";

/**
 * A conferência de envelhecimento, com o registro npm dublado.
 *
 * Dublado porque os casos que decidem não podem ser produzidos por uma rede
 * funcionando — estar offline, um runtime que saiu de `dependencies`, um caret no
 * lugar de uma versão exata — e porque uma suíte que pergunta ao registro em cada
 * `vitest run` é uma suíte que fica vermelha no avião.
 *
 * O registro de verdade aparece **uma vez**, no fim, contra o catálogo real: é o
 * gate. Ele se pula sozinho sem rede, e o `describe` invertido diz que se pulou.
 */

/** Um registro de mentira, montado a partir de um mapa de pacote → fatos. */
function registryOf(map: Record<string, PackageFacts>): Registry {
  return (pkg, version) => {
    const facts = map[pkg];
    if (facts === undefined) return null;
    // Sem versão, quem pergunta quer a lista; com versão, quer as deps dela.
    return version === undefined ? { ...facts, dependencies: {} } : facts;
  };
}

/** `0.3.150` … `0.3.160`, para contar distância sem escrever cem strings. */
function series(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n += 1) out.push(`${prefix}${n}`);
  return out;
}

const RUNTIME = "@anthropic-ai/claude-agent-sdk";

describe("releasesBetween", () => {
  it("conta publicações, não distância de semver", () => {
    // O que decide é quantas vezes o pacote publicou sem o pino andar. `0.3.160`
    // para `0.3.263` são 103 números de patch e foram 87 publicações — contar
    // número de patch responderia uma pergunta que ninguém fez.
    const versions = ["0.3.1", "0.3.5", "0.3.9"];

    expect(releasesBetween(versions, "0.3.1", "0.3.9")).toBe(2);
  });

  it("devolve null para uma versão que o registro não conhece", () => {
    // Zero aqui significaria "está em dia", que é a mentira mais cara possível
    // nesta função.
    expect(releasesBetween(["1.0.0"], "0.9.0", "1.0.0")).toBeNull();
  });
});

describe("latestOf", () => {
  it("é a última da lista do registro", () => {
    expect(latestOf(["1.0.0", "1.1.0"])).toBe("1.1.0");
  });

  it("é null para um pacote sem publicação nenhuma", () => {
    expect(latestOf([])).toBeNull();
  });
});

describe("isExact", () => {
  it("aceita versão literal e recusa faixa", () => {
    expect(isExact("0.3.257")).toBe(true);
    expect(isExact("1.0.0-rc.1")).toBe(true);
    for (const range of ["^0.153.3", "~1.2.3", "*", ">=1.0.0", "latest", "1.x"]) {
      expect(isExact(range)).toBe(false);
    }
  });
});

describe("checkAdapter", () => {
  it("reprova o runtime velho, que é a mecânica da LUM-54", () => {
    /*
     * O caso de verdade, com os números de verdade: o pino embutia o `0.3.160`
     * enquanto o `0.3.247` estava publicado, e todo `session/prompt` morria com
     * `400 … Claude Code 2.1.160 does not support this model`. O `claude` do PATH
     * estava novo, e não tinha como salvar — não é ele que responde.
     */
    const findings = checkAdapter(
      { ...CLAUDE_ADAPTER, pinnedVersion: "0.40.0" },
      registryOf({
        [CLAUDE_ADAPTER.package!]: {
          versions: ["0.40.0", "0.75.1"],
          dependencies: { [RUNTIME]: "0.3.160" },
        },
        [RUNTIME]: { versions: series("0.3.", 160, 247), dependencies: {} },
      }),
    );

    const failing = findings.filter((finding) => finding.fails);
    expect(failing).toHaveLength(1);
    expect(failing[0]?.kind).toBe("runtime-behind");
    expect(failing[0]?.message).toContain("0.3.160");
    // A linha diz o que fazer, e não só que algo está errado: trocar o pino sem
    // medir é o que produziu o defeito.
    expect(failing[0]?.message).toContain("docs/project/claude-agent-acp-0.75.md");
    expect(fails(findings)).toBe(true);
  });

  it("passa um runtime dentro do limite", () => {
    // O pino de hoje: seis releases atrás, e um turno inteiro medido em cima
    // dele. Um gate que reclamasse disto seria ruído semanal.
    const findings = checkAdapter(
      CLAUDE_ADAPTER,
      registryOf({
        [CLAUDE_ADAPTER.package!]: {
          versions: [CLAUDE_ADAPTER.pinnedVersion],
          dependencies: { [RUNTIME]: "0.3.257" },
        },
        [RUNTIME]: { versions: series("0.3.", 257, 263), dependencies: {} },
      }),
    );

    expect(findings).toEqual([]);
  });

  it("não reprova por existir versão nova do adaptador", () => {
    // A12 ao contrário: exigir o `latest` de um pacote de terceiro é exatamente
    // o que "nunca `@latest`" proíbe. Isto avisa e segue.
    const findings = checkAdapter(
      CLAUDE_ADAPTER,
      registryOf({
        [CLAUDE_ADAPTER.package!]: {
          versions: [CLAUDE_ADAPTER.pinnedVersion, "0.76.0", "0.77.0"],
          dependencies: { [RUNTIME]: "0.3.257" },
        },
        [RUNTIME]: { versions: ["0.3.257"], dependencies: {} },
      }),
    );

    expect(findings.map((finding) => finding.kind)).toEqual(["adapter-behind"]);
    expect(findings[0]?.message).toContain("2 release(s) atrás");
    expect(fails(findings)).toBe(false);
  });

  it("avisa, e não reprova, quando o runtime vem por faixa", () => {
    // `codex-acp` depende de `@openai/codex: ^0.153.3`. Não há o que consertar
    // deste lado — a faixa é do terceiro —, e o que dá para fazer é saber que
    // pinar o adaptador não pinou o agente.
    const findings = checkAdapter(
      CODEX_ADAPTER,
      registryOf({
        [CODEX_ADAPTER.package!]: {
          versions: [CODEX_ADAPTER.pinnedVersion],
          dependencies: { "@openai/codex": "^0.153.3" },
        },
      }),
    );

    expect(findings.map((finding) => finding.kind)).toEqual(["runtime-not-pinned"]);
    expect(fails(findings)).toBe(false);
  });

  it("avisa quando o adaptador para de declarar o runtime que o catálogo nomeia", () => {
    // O campo `runtime` da spec vira mentira em silêncio de duas formas: o
    // pacote passou a embutir outra coisa, ou moveu para
    // `optionalDependencies`. Nas duas, quem confere tem que aparecer.
    const findings = checkAdapter(
      CLAUDE_ADAPTER,
      registryOf({
        [CLAUDE_ADAPTER.package!]: {
          versions: [CLAUDE_ADAPTER.pinnedVersion],
          dependencies: { zod: "^4.0.0" },
        },
      }),
    );

    expect(findings.map((finding) => finding.kind)).toEqual(["unreadable"]);
    expect(findings[0]?.message).toContain(RUNTIME);
    expect(fails(findings)).toBe(false);
  });

  it("não reprova sem rede", () => {
    // Um gate que reprova no avião é um gate que se aprende a contornar, e a
    // informação que este dá não é urgente: o defeito que ele previne leva meses.
    const findings = checkAdapter(CLAUDE_ADAPTER, () => null);

    expect(findings.map((finding) => finding.kind)).toEqual(["unreadable"]);
    expect(fails(findings)).toBe(false);
  });

  it("não pergunta nada sobre um adaptador que não tem pacote", () => {
    // Um agente nativo do PATH não tem o que envelhecer aqui: não há pacote, não
    // há runtime embutido, e perguntar ao registro por ele responderia um erro.
    expect(checkAdapter({ ...CODEX_ADAPTER, package: null }, () => null)).toEqual([]);
  });
});

describe("formatFindings", () => {
  it("diz que está tudo bem em uma linha", () => {
    expect(formatFindings([])).toBe("adapters ok");
  });

  it("separa o que reprova do que só avisa", () => {
    const text = formatFindings([
      { kind: "adapter-behind", adapter: "claude", fails: false, message: "atrás" },
      { kind: "runtime-behind", adapter: "claude", fails: true, message: "velho" },
    ]);

    expect(text).toContain("aviso  claude: atrás");
    expect(text).toContain("FALHA  claude: velho");
    expect(text).toContain("2 achado(s), 1 reprovando");
  });
});

/*
 * O gate: o catálogo de verdade contra o registro de verdade.
 *
 * Uma pergunta por pacote, sem token e sem credencial. Pulado sem rede, com o
 * `describe` invertido dizendo que foi pulado — uma suíte que abandona em
 * silêncio a única prova de mundo real fica idêntica a uma que tem essa prova.
 */
const online = npmRegistry(15_000)("@agentclientprotocol/claude-agent-acp") !== null;

describe.skipIf(!online)("o catálogo, contra o registro npm", () => {
  it("não fixa adaptador cujo runtime embutido envelheceu", () => {
    const findings = checkAdapters(npmRegistry(15_000));

    // A mensagem inteira no `expect`, porque quando isto ficar vermelho o que a
    // pessoa precisa ler é qual pacote, qual versão e quantos releases.
    expect(formatFindings(findings.filter((finding) => finding.fails))).toBe("adapters ok");
    expect(MAX_RUNTIME_RELEASES_BEHIND).toBeGreaterThan(0);
  });
});

describe.skipIf(online)("o catálogo, contra o registro npm", () => {
  it("foi pulado porque o registro não respondeu", () => {
    expect(online).toBe(false);
  });
});
