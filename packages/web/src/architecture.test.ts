import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O sensor da arquitetura do `web` — a fase 0 da
 * [`032`](../../../docs/features/032-web-architecture/prd.md).
 *
 * Sem ele as fases seguintes são intenção; com ele cada uma é *"a lista de exceções
 * encolheu para N"*, e o número aparece no diff em vez de exigir leitura de
 * componente. Mora dentro do `web` porque regula fronteira **interna** de um pacote
 * só ([Q1](../../../docs/features/032-web-architecture/open-questions.md)).
 *
 * Duas propriedades fazem o mecanismo funcionar, e a segunda é a que costuma faltar:
 * a lista de exceções **só encolhe** — um arquivo que deixou de violar e continua
 * listado reprova, senão a lista vira o lugar onde a regra morre em silêncio.
 *
 * A mensagem de falha é **remediação**, e não regra: quem lê precisa saber o que
 * fazer sem abrir este arquivo.
 *
 * O que o sensor **não** garante é comportamento. Direção de dependência, chave de
 * cache e transporte são forma; se a tela mostra o dado certo é assunto dos testes
 * de componente e dos e2e.
 */

const SRC = import.meta.dirname;

type Source = {
  /** Caminho com `/`, relativo a `src/` — é o que as listas de exceção guardam. */
  readonly path: string;
  readonly text: string;
  readonly imports: readonly Import[];
};

type Import = { readonly spec: string; readonly line: number };

type Violation = { readonly path: string; readonly remedy: string };

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Lê os imports por regex, e não por parser.
 *
 * O que ela casa é o `from "…"` — e não a linha inteira do `import`, porque o
 * repositório tem import de várias linhas (`ScopePanel.tsx`, `useMemory.ts` e mais
 * vinte). O único `from "` deste `src` que não é import mora dentro de uma string
 * de teste (`changes-tab.test.tsx`), e o módulo dela (`node:fs/promises`) não
 * interessa a regra nenhuma daqui.
 */
function importsOf(text: string): Import[] {
  return [...text.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => ({
    spec: m[1]!,
    line: lineOf(text, m.index),
  }));
}

function collect(): Source[] {
  const found: Source[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, path);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        found.push({ path, text, imports: importsOf(text) });
      }
    }
  };
  walk(SRC, "");
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

const sources = collect();

/**
 * O portão único: violação fora da lista reprova, e **exceção que sobrou reprova
 * também**. As duas metades num lugar só porque esquecer a segunda é o modo de
 * falha que o mecanismo existe para evitar.
 */
function gate(list: string, violations: readonly Violation[], allowed: readonly string[]): void {
  const problems = [
    ...violations.filter((v) => !allowed.includes(v.path)).map((v) => v.remedy),
    ...allowed
      .filter((p) => !violations.some((v) => v.path === p))
      .map((p) => `\`${p}\` não precisa mais de exceção — remova-o da lista \`${list}\`.`),
  ];
  expect(problems.join("\n")).toBe("");
}

const isScreen = (spec: string): boolean => /(^|\/)features\//.test(spec);
const isHook = (spec: string): boolean => /(^|\/)hooks\//.test(spec);
const isTransport = (spec: string): boolean => /(^|\/)lib\/trpc(\.js)?$/.test(spec);
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);

/**
 * O hook de recurso de uma feature (`032` T17, Q6): `queries.ts` ou
 * `use<Recurso>.ts`, e o teste dele — que só existe em `.tsx` porque
 * `renderHook` precisa do wrapper em JSX. Mora dentro de `features/<x>/` de
 * propósito (é o dado da feature), então a regra 3 o isenta do mesmo jeito que
 * isenta `hooks/`: `import { trpc }` aqui é o ponto **certo**, não a violação.
 */
const isFeatureQueryFile = (path: string): boolean =>
  /^features\/[^/]+\/(queries[\w-]*|use[A-Z]\w*)(\.test)?\.tsx?$/.test(path);

/** Varre linha a linha, que é o que permite a mensagem apontar `arquivo:linha`. */
function eachLine(file: Source, visit: (line: string, number: number) => void): void {
  const lines = file.text.split("\n");
  for (const [index, line] of lines.entries()) visit(line, index + 1);
}

// -- Regra 1: `ui/` não conhece dado ------------------------------------------

/**
 * A regra 1 é a única sem exceção, e ela viveu três commits com **uma**.
 *
 * A T1 e a PRD a queriam sem lista, e as duas também exigem o gate verde a cada
 * commit: a story de `RightPanel` violava, e um sensor que nasce vermelho não é
 * sensor. Ela entrou listada, com endereço e prazo; a T3 tirou a story de `ui/` e
 * esvaziou a lista. Se um arquivo de `ui/` precisar de dado, a resposta é mover o
 * arquivo — não voltar a escrever aqui dentro.
 */
const UI_KNOWS_DATA: readonly string[] = [];

describe("regra 1 — a primitiva não conhece dado", () => {
  it("nenhum arquivo de `ui/` importa tela, hook, transporte ou react-query", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("ui/")) continue;
      for (const imported of file.imports) {
        const forbidden =
          isScreen(imported.spec) ||
          isHook(imported.spec) ||
          isTransport(imported.spec) ||
          imported.spec === "@tanstack/react-query";
        if (!forbidden) continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa \`${imported.spec}\`: ` +
            "uma primitiva recebe tudo por props e não busca nada. Mova o que precisa " +
            "de dado para `features/<domínio>/` " +
            "e deixe em `ui/` só o que renderiza o que recebeu.",
        });
      }
    }
    gate("UI_KNOWS_DATA", violations, UI_KNOWS_DATA);
  });
});

// -- Regra 2: `lib/` não conhece tela -----------------------------------------

/** Caiu na T9: `Seal` foi para `@lumem/shared` com o resto do quadro. */
const LIB_KNOWS_SCREEN: readonly string[] = [];

describe("regra 2 — a biblioteca não conhece tela", () => {
  it("nenhum arquivo de `lib/` importa `features/` nem `hooks/`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("lib/")) continue;
      for (const imported of file.imports) {
        if (!isScreen(imported.spec) && !isHook(imported.spec)) continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa \`${imported.spec}\`: ` +
            "função pura não depende de tela. Mova o tipo ou a função para " +
            "`@lumem/shared` se os dois lados da rede o nomeiam, ou para o próprio " +
            "`lib/` se só o web o lê.",
        });
      }
    }
    gate("LIB_KNOWS_SCREEN", violations, LIB_KNOWS_SCREEN);
  });
});

// -- Regra 5: hook tem nome de hook -------------------------------------------
//
// A numeração é a do §3 da PRD; as regras 3 e 4 chegam na T2.

/** Caiu na T17: `notice.ts` virou `features/tasks/useBoardNotices.ts` no `git mv` da fase 4. */
const HOOK_WITHOUT_HOOK_NAME: readonly string[] = [];

describe("regra 5 — o arquivo de hook tem nome de hook", () => {
  it("todo arquivo de `hooks/` que exporta um `use*` chama-se `use*`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("hooks/")) continue;
      const name = file.path.slice("hooks/".length);
      if (name.startsWith("use")) continue;
      const exported = /^export (?:async )?function (use[A-Z]\w*)/m.exec(file.text);
      if (!exported) continue;
      violations.push({
        path: file.path,
        remedy:
          `\`${file.path}:${lineOf(file.text, exported.index)}\` exporta ` +
          `\`${exported[1]}\` de um arquivo que não se chama \`use…\`: renomeie o ` +
          `arquivo para \`hooks/${exported[1]}.ts\`, para o nome do import dizer o ` +
          "que ele é antes de alguém abri-lo.",
      });
    }
    gate("HOOK_WITHOUT_HOOK_NAME", violations, HOOK_WITHOUT_HOOK_NAME);
  });
});

// -- Regra 3: a tela não conhece o transporte ---------------------------------

/**
 * Os 6 que sobraram da fase 3 (T16) — `files`, `changes`, `memory`, `usage` não
 * são recursos que as sete tasks daquela fase prometeram cobrir, e
 * `setup/Done.tsx` bate quatro recursos num `useQueries` só. A T17 só troca o
 * caminho: `components/X.tsx` e `setup/X.tsx` viraram `features/<domínio>/X.tsx`.
 *
 * Só `.tsx`: um `.ts` de `hooks/` é onde o transporte **deve** estar, e os arquivos
 * de teste alcançam o `trpc` por `vi.mock` e por `import()` dinâmico, que não são
 * import estático e não caem aqui.
 */
const COMPONENT_KNOWS_TRANSPORT: readonly string[] = [
  "features/checkout/FileTree.tsx",
  "features/checkout/PatchViewer.tsx",
  "features/conversation/Conversation.tsx",
  "features/memory/ProposalQueue.tsx",
  "features/setup/Done.tsx",
  "features/tasks/TaskList.tsx",
];

describe("regra 3 — a tela não conhece o transporte", () => {
  it("nenhum `.tsx` fora de `hooks/` importa `lib/trpc.js`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.endsWith(".tsx") || file.path.startsWith("hooks/")) continue;
      if (isFeatureQueryFile(file.path)) continue;
      for (const imported of file.imports) {
        if (!isTransport(imported.spec)) continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa o transporte: crie ou use um ` +
            "hook em `hooks/use<Recurso>.ts` e receba o dado por ele. A mutação " +
            "também mora lá, e invalida de dentro do hook — o componente nunca vê " +
            "`trpc` nem `useQueryClient`.",
        });
      }
    }
    gate("COMPONENT_KNOWS_TRANSPORT", violations, COMPONENT_KNOWS_TRANSPORT);
  });
});

// -- Regra 4: toda chave de cache nasce em `queryKeys.ts` ---------------------
//
// Três listas, porque são três gestos com três consertos e dois prazos: a chave
// escrita à mão e a constante local caíram na T4; o prefixo de invalidação cai na
// T5, que é onde os `*_PREFIX` nascem.
//
// Arquivo de teste fica **fora** da regra, de propósito: um teste que afirma
// `{ queryKey: ["worktree"] }` está prendendo o valor da chave, que é o contrário de
// declarar uma nova — é a armadilha *"contar a leitura, e não a classe"* do
// testing.md. Pô-lo na lista criaria uma exceção que nunca encolhe.

/**
 * Chave de leitura escrita no lugar da chamada. Caiu com a T4 — as 16 de hoje
 * viraram função em `queryKeys.ts`.
 */
const KEY_WRITTEN_BY_HAND: readonly string[] = [];

/**
 * Chave em constante, com o arquivo que a usa em vez de `queryKeys.ts`. Caiu com
 * a T4. `AGENT_CONFIGS_KEY` estava copiada em cinco arquivos — o defeito da `032`
 * inteira numa linha: cinco cópias, e o login invalidava uma.
 */
const KEY_CONSTANT_OUTSIDE: readonly string[] = [];

/** Prefixo literal dentro de `invalidateQueries` e irmãs. Caiu com a T5 — os 9 de hoje viraram `*_PREFIX` em `queryKeys.ts`. */
const INVALIDATION_PREFIX_OUTSIDE: readonly string[] = [];

/**
 * O que separa leitura de invalidação é a chamada na mesma linha. Quem escrever a
 * invalidação em várias linhas cai na lista da leitura — errar para o lado estrito
 * é o lado certo de errar aqui.
 */
const INVALIDATION = /(?:invalidate|cancel|refetch|remove|reset)Queries\(\{\s*queryKey:\s*\[/;

describe("regra 4 — toda chave de cache nasce em `queryKeys.ts`", () => {
  const regulated = sources.filter((f) => !isTest(f.path) && f.path !== "lib/queryKeys.ts");

  it("nenhuma chave de leitura é escrita no lugar da chamada", () => {
    const violations: Violation[] = [];
    for (const file of regulated) {
      eachLine(file, (line, number) => {
        if (!/queryKey:\s*\[/.test(line) || INVALIDATION.test(line)) return;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${number}\` escreve uma chave de cache à mão: declare-a ` +
            "em `lib/queryKeys.ts` e importe daqui. É o que faz o `invalidateFor` do " +
            "`useLiveState` alcançá-la quando o daemon avisa — uma chave escrita no " +
            "lugar da chamada é um dado que nenhum evento atualiza.",
        });
      });
    }
    gate("KEY_WRITTEN_BY_HAND", violations, KEY_WRITTEN_BY_HAND);
  });

  it("nenhuma constante de chave mora fora de `queryKeys.ts`", () => {
    const violations: Violation[] = [];
    for (const file of regulated) {
      eachLine(file, (line, number) => {
        const declared = /\bconst\s+([A-Za-z0-9_]*_KEY)\b[^=]*=\s*\[/.exec(line);
        if (!declared) return;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${number}\` declara \`${declared[1]}\`: mova a chave para ` +
            "`lib/queryKeys.ts` e importe daqui. Constante local não é melhor que " +
            "literal — ela só esconde a cópia, e quem invalida uma delas não " +
            "invalida as outras.",
        });
      });
    }
    gate("KEY_CONSTANT_OUTSIDE", violations, KEY_CONSTANT_OUTSIDE);
  });

  it("nenhuma invalidação usa prefixo literal", () => {
    const violations: Violation[] = [];
    for (const file of regulated) {
      eachLine(file, (line, number) => {
        if (!INVALIDATION.test(line)) return;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${number}\` invalida por um prefixo escrito à mão: ` +
            "nomeie-o em `lib/queryKeys.ts` (`<RECURSO>_PREFIX`) e importe daqui, " +
            "para o prefixo que se invalida e a chave que se lê serem o mesmo texto.",
        });
      });
    }
    gate("INVALIDATION_PREFIX_OUTSIDE", violations, INVALIDATION_PREFIX_OUTSIDE);
  });
});

// -- Regra 6: feature importa feature só pelo `index.ts` (`032` T17) ---------
//
// `lib/` e `ui/` não importarem `features/` já é a regra 1 e a regra 2, com o
// regex atualizado para o nome novo da pasta — não precisou de uma terceira
// lista. O que não existia é esta: duas features **dentro** de `features/`
// só podem se falar pela porta.

/**
 * Nasce vazia: o `git mv` da T17 já saiu roteado por `index.ts` — nenhuma
 * feature importa o arquivo interno de outra.
 */
const FEATURE_BYPASSES_INDEX: readonly string[] = [];

describe("regra 6 — feature importa feature só pelo index.ts", () => {
  it("nenhum import de `features/<a>/` de dentro de `features/<b>/` aponta para um arquivo que não é `index.js`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      const ownFeature = /^features\/([^/]+)\//.exec(file.path)?.[1];
      if (ownFeature === undefined) continue;
      const dir = posix.dirname(file.path);
      for (const imported of file.imports) {
        if (!imported.spec.startsWith(".")) continue;
        const resolved = posix.normalize(posix.join(dir, imported.spec.replace(/\.js$/, "")));
        const target = /^features\/([^/]+)\/(.+)$/.exec(resolved);
        if (!target) continue;
        const [, targetFeature, targetRest] = target;
        if (targetFeature === ownFeature || targetRest === "index") continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa \`${imported.spec}\` direto: ` +
            `passe por \`features/${targetFeature}/index.js\` — a porta é o que faz uma ` +
            "feature não saber o arquivo interno de outra, só o que ela exporta.",
        });
      }
    }
    gate("FEATURE_BYPASSES_INDEX", violations, FEATURE_BYPASSES_INDEX);
  });
});

// -- Regra 7: um `index.css` por feature (`032` T18) --------------------------
//
// A cascata deixava de depender de quem monta primeiro no dia em que cada
// `.css` para de chegar por um caminho diferente a cada componente. Só três
// arquivos têm licença: `main.tsx` (o que é global — tokens, fontes, base,
// primitivas), `App.tsx` (`layout.css`, porque o layout é do app e não de
// nenhuma feature) e o `index.ts` de cada feature (o `index.css` dela, uma
// vez). Teste fica fora: `styles/tokens.test.ts` importa `tokens.css` pelo
// efeito colateral **de propósito** — é o que declara a aresta que o
// `vitest --changed` percorre —, e isso é sobre grafo de dependência de teste,
// não sobre a cascata do app.

/** Nasce vazia: o `git mv` da T18 já moveu todo `import "*.css"` para o lugar certo. */
const CSS_IMPORTED_OUTSIDE_THE_DOOR: readonly string[] = [];

const CSS_IMPORT = /^import\s+"([^"]+\.css)"/;

describe("regra 7 — um `index.css` por feature", () => {
  it('nenhum import "…css" fora de `main.tsx`, `App.tsx` e `features/*/index.ts`', () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (isTest(file.path)) continue;
      if (file.path === "main.tsx" || file.path === "App.tsx") continue;
      if (/^features\/[^/]+\/index\.ts$/.test(file.path)) continue;
      eachLine(file, (line, number) => {
        const match = CSS_IMPORT.exec(line.trim());
        if (!match || !match[1]!.startsWith(".")) return; // pacote (`@xterm/...`) não é desta regra
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${number}\` importa \`${match[1]}\` direto: essa folha entra no ` +
            "`index.css` da feature, importado uma vez pelo `index.ts` dela — a cascata não pode " +
            "depender de qual componente monta primeiro.",
        });
      });
    }
    gate("CSS_IMPORTED_OUTSIDE_THE_DOOR", violations, CSS_IMPORTED_OUTSIDE_THE_DOOR);
  });
});
