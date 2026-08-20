import type { FastifyBaseLogger } from "fastify";

import type { AcpManager } from "../acp/AcpManager.js";

import { playbookLoadedBy } from "./playbook-telemetry.js";
import type { PlaybookService } from "./playbook.js";

/**
 * Liga a telemetria de playbook no fluxo de eventos do ACP.
 *
 * A costura, como o `capture.ts` e o `preamble.ts`: o `AcpManager` não aprende o
 * que é playbook, e o serviço de playbook não aprende o que é ACP.
 *
 * A lista de playbooks é lida **a cada evento de `tool_call`**, e não guardada em
 * memória: é uma consulta indexada, os eventos de Skill são raros, e um cache
 * aqui erraria justamente no caso que interessa — o playbook criado agora e
 * carregado no turno seguinte.
 */
export function trackPlaybookLoads({
  acpManager,
  playbooks,
  log,
}: {
  acpManager: AcpManager;
  playbooks: PlaybookService;
  log?: Pick<FastifyBaseLogger, "warn">;
}): () => void {
  return acpManager.watchEvents(({ event }) => {
    if (event.type !== "tool_call") return;
    try {
      const loaded = playbookLoadedBy(event, playbooks.list());
      if (loaded !== null) playbooks.recordLoad(loaded.path);
    } catch (error) {
      // Contar uso não pode atrapalhar o turno: o `watchEvents` roda dentro do
      // `emit`, que é o caminho por onde a resposta do agente chega na tela.
      log?.warn({ err: error }, "falha ao contar carregamento de playbook");
    }
  });
}
