import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import type { AcpEvent } from "../packages/shared/src/acp-protocol.js";
import { CLAUDE_ADAPTER } from "../packages/shared/src/adapters.js";

import { AcpManager } from "../packages/server/src/acp/AcpManager.js";

/**
 * A medição do C7 da `035-reasoning` — **gasta token**, poucos, na conta padrão do Claude.
 *
 * Pergunta duas coisas à cópia do adaptador que o daemon de dev instalou, pelo
 * `AcpManager` de verdade (o mesmo `_meta` que a conversa manda):
 *
 * 1. no modelo padrão, com o pedido da spec, chega pelo menos um `thought` com texto?
 * 2. em **cada** modelo que o `session/new` oferece, o turno fecha com `turn_end`?
 *
 * Sai 0 só se as duas valem. Imprime também o turno do modelo padrão **sem** o
 * pedido (sessão sem `adapterId`), com o `used` e o `cost` do último `usage` de
 * cada um — a [Q2](../docs/features/035-reasoning/open-questions.md) reabre se o
 * pedido mudar o gasto.
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

interface Run {
  model: string;
  asked: boolean;
  thoughtChars: number;
  stopReason: string | null;
  used: number | null;
  cost: number | null;
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
    used: null,
    cost: null,
    error: null,
  };
  manager.onEvent(info.id, ({ event }: { event: AcpEvent }) => {
    if (event.type === "thought") run.thoughtChars += event.text.trim().length;
    if (event.type === "turn_end") run.stopReason = event.stopReason;
    if (event.type === "usage") {
      run.used = event.used;
      run.cost = event.cost?.amount ?? null;
    }
  });
  try {
    if (model !== null) await manager.setConfig(info.id, "model", model);
    await manager.prompt(info.id, PROMPT);
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
  } finally {
    manager.kill(info.id);
  }
  return run;
}

async function main(): Promise<number> {
  if (!existsSync(ADAPTER)) {
    console.error(`adaptador ausente em ${ADAPTER} — suba o \`pnpm dev\` uma vez, ou aponte LUMEM_ADAPTER`);
    return 2;
  }
  const manager = new AcpManager({});
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
  const refused = runs.filter((run) => run.asked && (run.stopReason === null || run.error !== null));
  console.log(`\nC7 · pensamento no modelo padrão: ${thinks ? "sim" : "NÃO"} (${withMeta!.thoughtChars} caracteres)`);
  console.log(
    `C7 · turnos fechados em todos os ${models.length} modelos: ${refused.length === 0 ? "sim" : `NÃO — ${refused.map((run) => run.model).join(", ")}`}`,
  );
  return thinks && refused.length === 0 ? 0 : 1;
}

process.exit(await main());
