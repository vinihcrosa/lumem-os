import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import type { AcpEvent } from "../packages/shared/src/acp-protocol.js";
import { CLAUDE_ADAPTER } from "../packages/shared/src/adapters.js";

import { AcpManager } from "../packages/server/src/acp/AcpManager.js";
import { spawnAcpProcess, type AcpProcess, type AcpSpawnRequest } from "../packages/server/src/acp/process.js";

/**
 * A medição do C7 da `035-reasoning` — **gasta token**, poucos, na conta padrão do Claude.
 *
 * Pergunta duas coisas à cópia do adaptador que o daemon de dev instalou, pelo
 * `AcpManager` de verdade (o mesmo `_meta` que a conversa manda):
 *
 * 1. no modelo padrão, com o pedido da spec, chega pelo menos um `thought` com texto?
 * 2. em **cada** modelo que o `session/new` oferece, o turno fecha com `end_turn`?
 *
 * Sai 0 só se as duas valem. Imprime também o turno do modelo padrão **sem** o
 * pedido (sessão sem `adapterId`), com os tokens de saída de cada turno — a
 * [Q2](../docs/features/035-reasoning/open-questions.md) reabre se o pedido
 * mudar o gasto.
 *
 * Os tokens vêm do `usage` da **resposta** do `session/prompt`, lido no fio: o
 * `AcpManager.prompt` devolve só o `StopReason`, e o evento `usage` da conversa
 * é a ocupação da janela de contexto, não o que o turno gerou.
 *
 * `LUMEM_ADAPTER` troca o binário; o padrão é o do `~/.lumem-dev/shared`.
 */

const ADAPTER =
  process.env["LUMEM_ADAPTER"] ??
  join(homedir(), ".lumem-dev/shared/adapters/claude/node_modules/.bin/claude-agent-acp");

/** Um problema que faz o modelo pensar, e uma resposta curta — o turno barato que ainda pensa. */
const PROMPT =
  "Quantos inteiros de 1 a 200 são divisíveis por 3 ou por 5, mas não por 7? " +
  "Responda só com o número, sem explicar e sem usar ferramenta nenhuma.";

interface PromptUsage {
  outputTokens?: number;
  cachedWriteTokens?: number;
}

/** O `usage` da última resposta de `session/prompt` que passou pelo fio. Os turnos são um por vez. */
let lastPromptUsage: PromptUsage | null = null;

/** O spawner de sempre, com uma cópia do stdout lida de lado — o `AcpManager` recebe a outra. */
function sniffingSpawner(request: AcpSpawnRequest): AcpProcess {
  const child = spawnAcpProcess(request);
  const [forManager, forUs] = child.stdout.tee();
  void (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of forUs as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try {
          const message = JSON.parse(line) as { result?: { stopReason?: string; usage?: PromptUsage } };
          if (message.result?.stopReason !== undefined) lastPromptUsage = message.result.usage ?? null;
        } catch {
          // Linha que não é JSON-RPC: não é a resposta que se procura.
        }
      }
    }
  })();
  return {
    stdin: child.stdin,
    stdout: forManager,
    exited: child.exited,
    kill: (signal) => child.kill(signal),
  };
}

interface Run {
  model: string;
  asked: boolean;
  thoughtChars: number;
  stopReason: string | null;
  outputTokens: number | null;
  cachedWriteTokens: number | null;
  error: string | null;
}

async function turn(manager: AcpManager, cwd: string, model: string | null, asked: boolean): Promise<Run> {
  const info = await manager.spawn({
    command: ADAPTER,
    cwd,
    adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
    // Sem `adapterId` a spec não é lida — é o turno "como era antes".
    ...(asked ? { adapterId: CLAUDE_ADAPTER.id } : {}),
  });
  const current = info.configOptions.find((option) => option.id === "model")?.currentValue ?? "?";
  const run: Run = {
    model: model ?? `${current} (padrão)`,
    asked,
    thoughtChars: 0,
    stopReason: null,
    outputTokens: null,
    cachedWriteTokens: null,
    error: null,
  };
  manager.onEvent(info.id, ({ event }: { event: AcpEvent }) => {
    if (event.type === "thought") run.thoughtChars += event.text.trim().length;
    if (event.type === "turn_end") run.stopReason = event.stopReason;
  });
  lastPromptUsage = null;
  try {
    if (model !== null) await manager.setConfig(info.id, "model", model);
    await manager.prompt(info.id, PROMPT);
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
  } finally {
    // O leitor do fio corre ao lado do `AcpManager`, e pode chegar à resposta um instante depois dele.
    for (let waited = 0; lastPromptUsage === null && waited < 1_000; waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // Escrito pelo leitor do fio; o TypeScript não vê isso e o estreitaria para `null`.
    const usage = lastPromptUsage as PromptUsage | null;
    run.outputTokens = usage?.outputTokens ?? null;
    run.cachedWriteTokens = usage?.cachedWriteTokens ?? null;
    manager.kill(info.id);
  }
  return run;
}

async function main(): Promise<number> {
  if (!existsSync(ADAPTER)) {
    console.error(`adaptador ausente em ${ADAPTER} — suba o \`pnpm dev\` uma vez, ou aponte LUMEM_ADAPTER`);
    return 2;
  }
  const manager = new AcpManager({ spawner: sniffingSpawner });
  const cwd = mkdtempSync(join(tmpdir(), "measure-thinking-"));

  const probe = await manager.spawn({ command: ADAPTER, cwd, adapterId: CLAUDE_ADAPTER.id });
  const models = (probe.configOptions.find((option) => option.id === "model")?.choices ?? []).map(
    (choice) => choice.value,
  );
  manager.kill(probe.id);

  const runs: Run[] = [await turn(manager, cwd, null, true), await turn(manager, cwd, null, false)];
  for (const model of models) runs.push(await turn(manager, cwd, model, true));

  console.table(runs);
  await manager.killAll();

  const [withMeta] = runs;
  const thinks = withMeta!.thoughtChars > 0;
  // `end_turn` e nada mais: `refusal` ou `max_tokens` também são `turn_end`, e não são o turno fechado.
  const refused = runs.filter((run) => run.asked && (run.stopReason !== "end_turn" || run.error !== null));
  console.log(`\nC7 · pensamento no modelo padrão: ${thinks ? "sim" : "NÃO"} (${withMeta!.thoughtChars} caracteres)`);
  console.log(
    `C7 · end_turn em todos os ${models.length} modelos: ${refused.length === 0 ? "sim" : `NÃO — ${refused.map((run) => run.model).join(", ")}`}`,
  );
  // Sem modelo nenhum, "todos fecharam" é verdade vazia: um adaptador que renomeasse a opção passaria verde.
  return thinks && models.length > 0 && refused.length === 0 ? 0 : 1;
}

process.exit(await main());
