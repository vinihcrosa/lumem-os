import type { AcpManager } from "../acp/AcpManager.js";
import type { ScriptRunner } from "../scripts/ScriptRunner.js";

/**
 * O que ainda está vivo e que uma reinicialização mataria (`038`, Parte 2).
 *
 * **Ocioso** é as duas contagens em zero: nenhum turno em voo e nenhum script de
 * projeto rodando. Um shell aberto **não** conta — ele avisa (a tela diz quantos
 * fecham), mas nunca fecha sozinho, então esperar por ele seria esperar para
 * sempre (ADR de 2026-09-29-2004).
 *
 * Mora aqui e não no router porque a Parte 5 pergunta o mesmo a cada 60 s, e duas
 * definições de *ocioso* são como uma atualização automática mata o turno que a
 * manual teria recusado.
 */
export interface Busy {
  liveTurns: number;
  runningScripts: number;
}

export async function busyNow(sources: {
  acpManager: Pick<AcpManager, "liveTurns">;
  scripts: Pick<ScriptRunner, "runningCount">;
}): Promise<Busy> {
  return {
    liveTurns: sources.acpManager.liveTurns().length,
    runningScripts: await sources.scripts.runningCount(),
  };
}

export function isIdle(busy: Busy): boolean {
  return busy.liveTurns === 0 && busy.runningScripts === 0;
}
