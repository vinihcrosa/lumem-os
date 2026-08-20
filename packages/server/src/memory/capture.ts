import type { FastifyBaseLogger } from "fastify";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import type { SessionRow } from "../db/schema.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { isKilledEarly } from "./signals.js";

import { MemoryService } from "./MemoryService.js";
import { distill, type Distiller } from "./distiller.js";
import { projectSession } from "./projection.js";
import { memoryScopeOfSession } from "./scope-of-session.js";

/**
 * A captura estrutural, ligada no fim de uma sessão de agente.
 *
 * Este arquivo é a costura, e existe pela mesma razão que o `preamble.ts`: o
 * `SessionStore` não precisa saber o que é memória, e o `MemoryService` não
 * precisa saber o que é sessão de agente. Eles se encontram numa função.
 *
 * Nada aqui grava memória por conta própria: o candidato entra pelo
 * `MemoryService.write` com ator `distiller`, e a Q27 decide sozinha o que vira
 * proposta. É por isso que ligar a captura não abriu nenhum caminho novo de
 * escrita — só um produtor novo para o caminho que já era vigiado.
 */

export interface SessionCaptureOptions {
  db: Db;
  stateDir: string;
  acpManager: AcpManager;
  /** Ligada ou não (§10 do PRD). Desligada é o default do daemon. */
  enabled: boolean;
  log?: Pick<FastifyBaseLogger, "warn">;
  now?: () => number;
}

export type SessionCapture = (row: SessionRow, endedAt: Date) => Promise<void>;

export function createSessionCapture({
  db,
  stateDir,
  acpManager,
  enabled,
  log,
  now = () => Date.now(),
}: SessionCaptureOptions): SessionCapture {
  return async (row, endedAt) => {
    if (!enabled) return;
    // Sessão de agente por ACP: um shell não tem transcrição para projetar, e
    // uma sessão PTY de agente não emite `tool_call` — a captura estrutural é o
    // que a decisão por ACP comprou, e fora dela não existe.
    if (row.kind !== "agent" || row.transport !== "acp") return;
    /*
     * Q21: **só a sessão raiz** alimenta a memória automaticamente.
     *
     * Uma sessão retomada carrega a transcrição da anterior copiada para dentro
     * dela (D15), então destilá-la produziria de novo os candidatos que a
     * sessão de ontem já produziu — e, se você tivesse recusado aqueles, eles
     * voltariam para a inbox toda vez que a conversa fosse retomada.
     */
    if (row.resumedFromId !== null) return;
    // Sessão morta em segundos já é um sinal (`session_killed_early`), e o que
    // ela tem para ensinar é que nada aconteceu.
    if (isKilledEarly(row.createdAt, endedAt)) return;

    const startedAt = now();
    const memory = new MemoryService({ db, stateDir, ...(log ? { log } : {}) });
    // `storedTranscript` e não `transcript`: a sessão já morreu, e `require`
    // recusaria um id que não está mais no mapa de sessões vivas.
    const projection = projectSession(acpManager.storedTranscript(row.id), { cwd: row.cwd });

    const { candidates, skipped } = await distill({
      enabled,
      projection,
      ask: askAgent({ acpManager, db, row, log }),
      ...(log ? { log: { warn: (object, message) => log.warn(object, message) } } : {}),
    });

    const scope = await memoryScopeOfSession(db, row.id);
    // Instrumentada mesmo quando não produz nada (Q20): "destilou e não achou" é
    // um número, e é o número que decide se isto vale o que custa.
    memory.recordUsage("distill", candidates.length, now() - startedAt, {
      sessionId: row.id,
      ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
      ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
    });
    if (skipped !== null) return;

    for (const candidate of candidates) {
      try {
        await memory.write({
          ...candidate,
          // O escopo vem do **tipo**, e não da destilação: deixar o agente
          // escolher escopo seria deixá-lo escolher se passa pela sua revisão.
          ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
          ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
          actor: "distiller",
          sourceSessions: [row.id],
          confidence: "low",
        });
      } catch (error) {
        // Um candidato recusado pelo portão não impede os outros: a recusa já
        // ficou no WAL com o motivo, e é lá que ela se responde.
        log?.warn({ session: row.id, name: candidate.name, err: error }, "candidato recusado");
      }
    }
  };
}

/**
 * O agente que responde a destilação — o mesmo adaptador que a sessão usou.
 *
 * Uma sessão nova, e não a que acabou: aquela morreu, e é justamente o fim dela
 * que dispara isto. Custa os ~39k tokens de prompt de sistema que o spike mediu,
 * uma vez por sessão — que é o preço que o §10 aceitou ao escolher destilação
 * por sessão, e a razão de a coisa vir desligada.
 */
function askAgent({
  acpManager,
  db,
  row,
  log,
}: {
  acpManager: AcpManager;
  db: Db;
  row: SessionRow;
  log?: Pick<FastifyBaseLogger, "warn">;
}): Distiller {
  return async (prompt) => {
    if (row.agentConfigId === null) throw new Error("a sessão não tem configuração de agente");
    const config = await createAgentConfigRepository(db).findById(row.agentConfigId);
    if (config === undefined) throw new Error("a configuração do agente não existe mais");

    const session = await acpManager.spawn({
      command: config.command,
      args: config.args,
      cwd: row.cwd,
      env: config.env,
      ...(config.adapterVersion === null ? {} : { adapterVersion: config.adapterVersion }),
    });
    // Esta sessão **não** tem linha no banco, e é de propósito: ela não é um
    // trabalho seu, não aparece em aba nenhuma, e não deve sobreviver a nada. É
    // também o que faz o núcleo da memória não ser injetado nela — o preâmbulo
    // recusa sessão que o daemon não registrou.

    const said: string[] = [];
    const off = acpManager.onEvent(session.id, ({ event }) => {
      if (event.type === "message" && event.role === "agent") said.push(event.text);
    });

    try {
      await acpManager.prompt(session.id, prompt);
      return said.join("");
    } finally {
      off();
      try {
        acpManager.kill(session.id);
      } catch (error) {
        log?.warn({ session: session.id, err: error }, "falha ao encerrar a sessão de destilação");
      }
    }
  };
}
