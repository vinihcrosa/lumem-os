import type { FastifyBaseLogger } from "fastify";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";

import { MemoryService } from "./MemoryService.js";
import { markUnverified, routeFor } from "./evidence.js";
import { research, type ResearchCandidate } from "./research.js";
import { memoryScopeOfSession } from "./scope-of-session.js";

/**
 * O auto-learn ligado no `/memory/ask`: "não sei" deixa de ser o fim.
 *
 * A costura, como o `capture.ts`: junta o agente que pesquisa, o critério de
 * evidência e o portão de escrita — e nada aqui inventa caminho novo para o
 * disco.
 *
 * O que este arquivo acrescenta, e que só faz sentido no ponto em que a pergunta
 * chega, é a **contenção de custo** do §5.4: cache por sessão e orçamento por
 * sessão. Sem eles, um agente em loop de retry transformaria uma pergunta em
 * cinquenta sessões de agente.
 */

export interface AutoLearnOptions {
  db: Db;
  stateDir: string;
  acpManager: AcpManager;
  enabled: boolean;
  /** Quantas perguntas de uma sessão podem subir agente. */
  budget: number;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export interface AutoLearnResult {
  /** O texto para quem perguntou. `null` quando não houve resposta. */
  answer: string | null;
  /** O que foi gravado, e como. */
  written: readonly { name: string; route: "direct" | "proposal" }[];
  /** Por que não houve resposta, quando não houve. */
  skipped: "disabled" | "cached" | "over_budget" | "degraded" | null;
}

export type AutoLearn = (question: string, sessionId: string | undefined) => Promise<AutoLearnResult>;

export function createAutoLearn({
  db,
  stateDir,
  acpManager,
  enabled,
  budget,
  log,
}: AutoLearnOptions): AutoLearn {
  /*
   * O cache é por **sessão e pergunta**, e vive em memória.
   *
   * Em memória porque o que ele protege é uma sessão em curso: um agente que
   * tenta a mesma pergunta três vezes no mesmo turno. Persistir isso faria a
   * mesma pergunta, feita amanhã, não subir agente nunca mais — e o acervo muda.
   */
  const asked = new Map<string, string>();
  const spent = new Map<string, number>();

  return async (question, sessionId) => {
    if (!enabled) return { answer: null, written: [], skipped: "disabled" };

    const key = `${sessionId ?? "-"}::${question.trim().toLowerCase()}`;
    const cached = asked.get(key);
    if (cached !== undefined) return { answer: cached, written: [], skipped: "cached" };

    const used = spent.get(sessionId ?? "-") ?? 0;
    if (used >= budget) return { answer: null, written: [], skipped: "over_budget" };
    spent.set(sessionId ?? "-", used + 1);

    const memory = new MemoryService({ db, stateDir, ...(log ? { log } : {}) });
    const started = Date.now();
    const { answer, degraded } = await research({
      question,
      ask: askAgent({ acpManager, db, sessionId, log }),
      ...(log ? { log: { warn: (object, message) => log.warn(object, message) } } : {}),
    });

    const scope = sessionId === undefined ? {} : await memoryScopeOfSession(db, sessionId);
    // Medido mesmo quando degradou: "subiu agente e não respondeu" é o número que
    // diz se o auto-learn está valendo o que custa (§6).
    memory.recordUsage("research", answer?.memories.length ?? 0, Date.now() - started, {
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
      ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
    });

    if (answer === null) {
      // Degradação **dita**: quem perguntou precisa saber que a resposta que
      // chegou é a busca lexical, e não o serviço inteiro. O motivo já está no
      // log; para quem perguntou, o que importa é que degradou.
      void degraded;
      return { answer: null, written: [], skipped: "degraded" };
    }

    // A resposta é cacheada antes de qualquer escrita: ela já custou o agente, e
    // uma falha de gravação não pode fazer a próxima pergunta pagar de novo.
    asked.set(key, answer.answer);

    const written: { name: string; route: "direct" | "proposal" }[] = [];
    for (const candidate of answer.memories) {
      const route = await store(memory, candidate, scope, log);
      if (route !== null) written.push({ name: candidate.name, route });
    }

    return { answer: answer.answer, written, skipped: null };
  };
}

/**
 * Grava um candidato — pelo portão, com proveniência de auto-learn.
 *
 * O `routeFor` decide (D7), e a decisão é **imposta pelo `proposal: true`**: o
 * serviço manda para a inbox mesmo num caso em que a Q27 deixaria passar direto.
 * É o único lugar do sistema que aperta a regra em vez de relaxá-la, e é aqui que
 * ela precisa ser apertada — ninguém revisou, e o agente não conseguiu apontar de
 * onde tirou. O terceiro estado do `proposal` nasceu para isto.
 */
async function store(
  memory: MemoryService,
  candidate: ResearchCandidate,
  scope: { workspaceId?: string; projectId?: string },
  log?: Pick<FastifyBaseLogger, "warn">,
): Promise<"direct" | "proposal" | null> {
  const scopeOf = candidate.type === "project" || candidate.type === "reference" ? "project" : "workspace";
  const route = routeFor({
    scope: scopeOf,
    ...(candidate.evidence === undefined ? {} : { evidence: candidate.evidence }),
  });

  try {
    await memory.write({
      name: candidate.name,
      description: candidate.description,
      type: candidate.type,
      // A marca de não verificada no corpo (§5.2), com a evidência ao lado.
      body: markUnverified(candidate.body, candidate.evidence),
      ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
      ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
      actor: "auto_research",
      // Baixa por padrão: nasceu de uma pergunta que o acervo não sabia responder.
      confidence: "low",
      ...(candidate.evidence === undefined ? {} : { evidence: candidate.evidence }),
      proposal: route === "proposal",
    });
    return route;
  } catch (error) {
    // Um candidato recusado não impede os outros, e a recusa já está no WAL.
    log?.warn({ name: candidate.name, err: error }, "candidato de auto-learn recusado");
    return null;
  }
}

/**
 * O agente que pesquisa — **sem** a skill de memória.
 *
 * Profundidade 1 (§5.4): a sessão de pesquisa não tem linha no banco, e o
 * preâmbulo recusa sessão que o daemon não registrou. Então ela não recebe o
 * núcleo nem a instrução de como chamar o `lumem-memory` — que é exatamente o que
 * fecharia o loop.
 */
function askAgent({
  acpManager,
  db,
  sessionId,
  log,
}: {
  acpManager: AcpManager;
  db: Db;
  sessionId: string | undefined;
  log?: Pick<FastifyBaseLogger, "warn">;
}) {
  return async (prompt: string): Promise<string> => {
    const asking = sessionId === undefined ? undefined : await createSessionRepository(db).findById(sessionId);
    const configs = await createAgentConfigRepository(db).list();
    // O agente de quem perguntou, quando dá; senão o primeiro ACP configurado.
    // Um daemon sem nenhum agente ACP não faz auto-learn, e a degradação diz isso.
    const config =
      configs.find((candidate) => candidate.id === asking?.agentConfigId) ??
      configs.find((candidate) => candidate.transport === "acp");
    if (config === undefined) throw new Error("nenhum agente ACP configurado para pesquisar");

    const session = await acpManager.spawn({
      command: config.command,
      args: config.args,
      // O checkout de quem perguntou: é lá que a resposta está. Sem sessão, o
      // diretório do daemon — e aí o agente não acha nada, o que é honesto.
      cwd: asking?.cwd ?? process.cwd(),
      env: config.env,
      ...(config.adapterVersion === null ? {} : { adapterVersion: config.adapterVersion }),
    });

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
        log?.warn({ session: session.id, err: error }, "falha ao encerrar a sessão de pesquisa");
      }
    }
  };
}
