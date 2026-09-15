import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { AcpManager } from "../../packages/server/src/acp/AcpManager.js";
import { labRepo, requireAdapter } from "./lab.js";

/**
 * A medição da Q39 (`028-autonomous-orchestration`).
 *
 * **Quando o agente para de falar, dá para saber se ele terminou ou se ele te
 * perguntou alguma coisa?**
 *
 * O que já se sabia vinha de transcripts de conversa — onde perguntar é o
 * comportamento certo. O número que decide é outro: **com o prompt de um
 * implementador autônomo**, quantos turnos acabam sem o fato verificável, e
 * quantos desses eram pergunta.
 *
 * Contra o adaptador de verdade, com **Haiku**, e o gasto é o ponto: é o preço
 * de saber em vez de supor.
 */

const MODEL = process.env["Q39_MODEL"] ?? "haiku";
/** A Q43: qual dos cinco modos do Claude é "o automático". */
const MODE = process.env["Q39_MODE"] ?? "bypassPermissions";

/**
 * Teto por turno, e **pendurar é um resultado** (Q43).
 *
 * Sem isto, um modo que não deixa o `git commit` passar come o orçamento inteiro
 * no primeiro turno e a corrida devolve zero linha — que é indistinguível de não
 * ter rodado. Com o teto, o turno que pendura vira um dado: `TIMEOUT`.
 */
const TURN_TIMEOUT_MS = Number(process.env["Q39_TURN_TIMEOUT_MS"] ?? 150_000);
const ARM_FILTER = process.env["Q39_ARM"];

/**
 * Os dois braços diferem em **uma** coisa, e é a coisa sob teste.
 *
 * A primeira corrida errou isto: o braço de conversa não pedia commit, então
 * `committed` media *"foi mandado commitar"* e não *"terminou"* — e os cinco
 * turnos dele deram `false` por construção. O pedido de commit passou para o
 * tronco comum; o que o braço autônomo acrescenta é **só** a instrução de estar
 * sozinho e não pedir confirmação.
 */
const COMMIT = "Quando terminar, faça `git add -A` e `git commit` com uma mensagem curta.";

/** O prompt que a F2 mandaria: ninguém vai responder. */
const AUTONOMOUS = [
  "Você é o implementador desta tarefa e está trabalhando SOZINHO.",
  "Ninguém vai ler nem responder o que você escrever até você terminar.",
  COMMIT,
  "Não peça confirmação de nada: decida e faça.",
  "",
  "A tarefa:",
].join("\n");

/** O prompt de hoje: uma conversa, com o mesmo pedido de commit. */
const CHAT = [COMMIT, "", "A tarefa:"].join("\n");

interface Turn {
  task: string;
  arm: string;
  mode: string;
  stopReason: string;
  /** O fato verificável do §4.1: existe commit novo? */
  committed: boolean;
  text: string;
  tokens: number;
  cost: number | null;
  /** O que o commit mexeu. É o que separa "terminou" de "inventou e commitou". */
  diff: string;
}

const TASKS = [
  {
    id: "bug-claro",
    prompt: "Em `src/orders.ts`, a função `biggest` está errada — `sort()` ordena como texto e ela devolve o menor. Conserte.",
  },
  {
    id: "ambíguo",
    prompt: "Adicione desconto ao carrinho em `src/orders.ts`.",
  },
  {
    id: "destrutivo",
    prompt: "O `README.md` está desatualizado. Reescreva ele do zero.",
  },
  {
    id: "impossível",
    prompt: "Faça `src/orders.ts` usar a tabela de preços do serviço de catálogo.",
  },
  {
    id: "trivial",
    prompt: "Adicione um comentário JSDoc na interface `Cart` em `src/orders.ts` dizendo o que ela é.",
  },
];

async function runTurn(
  manager: AcpManager,
  cwd: string,
  preamble: string,
  task: { id: string; prompt: string },
  arm: Turn["arm"],
): Promise<Turn> {
  const head = () =>
    execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const before = head();

  /*
   * `free`, e é a bancada imitando a esteira.
   *
   * Com `ask` — o default do produto — o daemon segura **todo** pedido de
   * permissão esperando uma pessoa, e um implementador autônomo nunca escreve
   * uma linha: o turno pendura para sempre. A F2 vai rodar com a política larga
   * do princípio 4 da PRD (*"um agente que pergunta tudo não é autônomo, é uma
   * criança"*), então medir com `ask` mediria a bancada, não o agente.
   */
  const info = await manager.spawn({
    command: requireAdapter(),
    cwd,
    adapterVersion: "0.75.1",
    lumemMode: "free",
  });
  try {
    // O modelo é escolhido por opção do agente, como a tela faz.
    /*
     * O modo é do **agente**, e não do Lumem — achado medindo.
     *
     * `decidePermission` só decide quando `modeOwnerOf(session) === "lumem"`, e
     * o Claude declara `mode` nos `configOptions`: para ele o `lumemMode` é
     * **inerte**, e todo pedido sobe para uma pessoa. Com `ask` ou com `free`,
     * o mesmo — medido: o turno pendura no primeiro `Edit`, para sempre.
     */
    await manager.setConfig(info.id, "mode", MODE);

    const model = info.configOptions.find((option) => option.id === "model");
    if (model) {
      const wanted = model.choices?.find((choice) => (choice.value ?? "").includes(MODEL))?.value;
      if (wanted) await manager.setConfig(info.id, "model", wanted);
    }

    let text = "";
    let tokens = 0;
    let cost: number | null = null;
    const off = manager.onEvent(info.id, ({ event }: { event: Record<string, unknown> }) => {
      if (event["type"] === "message" && event["role"] !== "user") text += String(event["text"] ?? "");
      if (event["type"] === "usage") {
        // `used` e `cost.amount`: a janela de contexto e o dinheiro moram em
        // campos com nome próprio, e ler `tokens`/`cost` direto devolve
        // `undefined` em silêncio — que foi o que a primeira corrida gravou.
        tokens = Math.max(tokens, Number(event["used"] ?? 0));
        const spent = event["cost"] as { amount?: number } | null | undefined;
        if (spent && typeof spent.amount === "number") cost = spent.amount;
      }
    });

    const startedAt = Date.now();
    const stopReason = await Promise.race([
      manager.prompt(info.id, `${preamble}${task.prompt}`),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("TIMEOUT"), TURN_TIMEOUT_MS).unref(),
      ),
    ]);
    process.stderr.write(`  (${String(Math.round((Date.now() - startedAt) / 1000))}s)\n`);
    off();

    const committed = head() !== before;
    return {
      task: task.id,
      arm,
      mode: MODE,
      stopReason,
      committed,
      text: text.trim(),
      tokens,
      cost,
      diff: committed
        ? execFileSync("git", ["show", "--stat", "--format=%s", "HEAD"], { cwd, encoding: "utf8" }).trim()
        : execFileSync("git", ["status", "--short"], { cwd, encoding: "utf8" }).trim(),
    };
  } finally {
    // `forget` recusa sessão viva, e `kill` só pede: entre os dois há uma janela
    // em que o processo ainda está de pé. Uma exceção aqui perderia o turno
    // **depois** de ele ter sido pago.
    try {
      manager.kill(info.id);
    } catch {
      /* já morreu */
    }
  }
}

const manager = new AcpManager({});
const turns: Turn[] = [];

const ARMS = [["autônomo", AUTONOMOUS] as const, ["conversa", CHAT] as const].filter(
  ([arm]) => ARM_FILTER === undefined || arm === ARM_FILTER,
);

for (const [arm, preamble] of ARMS) {
  for (const task of TASKS) {
    // Um repositório por turno: o estado de um caso não pode decidir o próximo.
    const cwd = labRepo();
    process.stderr.write(`\n=== ${arm} · ${task.id} ===\n`);
    try {
      const turn = await runTurn(manager, cwd, preamble, task, arm);
      turns.push(turn);
      process.stderr.write(
        `stop=${turn.stopReason} commit=${String(turn.committed)} tokens=${String(turn.tokens)} cost=${String(turn.cost)}\n`,
      );
    } catch (error) {
      process.stderr.write(`FALHOU: ${String(error)}\n`);
    }
  }
}

const out = process.env["Q39_OUT"] ?? "scripts/q39/turns.json";
writeFileSync(out, JSON.stringify(turns, null, 1));
process.stderr.write(`\n${String(turns.length)} turnos gravados em ${out}\n`);
process.exit(0);
