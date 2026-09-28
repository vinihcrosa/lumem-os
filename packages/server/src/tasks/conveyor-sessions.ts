import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { configForAdapter } from "../repositories/agentConfig.js";
import type { AppRouter } from "../routers/index.js";
import type { SessionStore } from "../sessions/SessionStore.js";
import { effortOptionOf, offers } from "../sessions/start-agent-session.js";
import type { ConveyorDeps } from "./conveyor-ports.js";

/**
 * Como a esteira abre e retoma a conversa de um encaixe.
 *
 * Morava em duas closures do `bootstrap`, e saiu dele na `034` T10 por um motivo
 * só: a conta do encaixe vira **processo** aqui — é a última linha antes do
 * `spawn` —, e a única asserção que pega a conta errada é o que o spawner
 * recebeu. Dentro do `bootstrap`, isso só se provava por e2e.
 */

/** O chamador interno do daemon — o único que abre sessão de esteira. */
type InternalApi = ReturnType<AppRouter["createCaller"]>;

export interface ConveyorSessionOpenersOptions {
  db: Db;
  /**
   * Função, e não o chamador: o `bootstrap` constrói a esteira **antes** do
   * chamador interno, que depende do contexto onde ela entra — a mesma
   * preguiça que as closures de antes tinham por estarem dentro de funções.
   */
  api: () => InternalApi;
  acp: AcpManager;
  sessionStore: SessionStore;
  /** O `LUMEM_CONVEYOR_AGENT`, quando alguém apontou uma configuração. */
  conveyorAgent: string | null;
}

export function createConveyorSessionOpeners({
  db,
  api,
  acp,
  sessionStore,
  conveyorAgent,
}: ConveyorSessionOpenersOptions): Pick<ConveyorDeps, "openAgentSession" | "resumeSession"> {
  /**
   * Modo, modelo e effort do encaixe, **depois** do handshake — eles são
   * `configOption`s que o próprio adaptador declara, e só existem com a sessão.
   *
   * Falhar aqui não derruba o turno: um adaptador sem aquele modo vai perguntar
   * alguma coisa e o turno vai morrer, que é a tentativa gasta com o motivo, e
   * não um erro de boot.
   *
   * O effort vem **depois** do modelo, porque é o modelo que diz se há effort.
   * Sem effort no encaixe mas com modelo, vale o effort padrão da conta — só
   * numa conversa **nova** (`fresh`): o `startAgentSession` já aplicou o trio
   * dela, e trocar o modelo por cima pode ter levado o effort junto. Na
   * retomada, não: *"trocar o padrão não mexe em sessão aberta"* (Q1), e o
   * modelo da própria conversa o `SessionStore.resume` já devolveu.
   */
  async function applySlot(
    sessionId: string,
    slot: { agentMode: string | null; model: string | null; effort: string | null },
    fresh: boolean,
  ): Promise<void> {
    if (slot.agentMode !== null) {
      await acp.setConfig(sessionId, "mode", slot.agentMode).catch(() => undefined);
    }
    if (slot.model !== null) {
      await acp.setConfig(sessionId, "model", slot.model).catch(() => undefined);
    }

    let effort = slot.effort;
    if (effort === null && slot.model !== null && fresh) {
      const row = await sessionStore.findById(sessionId);
      const account = row?.agentAccountId
        ? await createAgentAccountRepository(db).get(row.agentAccountId)
        : undefined;
      effort = account?.defaultEffort ?? null;
    }
    if (effort === null) return;
    const option = effortOptionOf(acp.get(sessionId)?.configOptions ?? []);
    if (option === undefined || !offers(option, effort) || option.currentValue === effort) return;
    await acp.setConfig(sessionId, option.id, effort).catch(() => undefined);
  }

  return {
    openAgentSession: async ({
      taskId,
      role,
      adapter,
      accountId,
      model,
      effort,
      cwd,
      worktreeId,
      agentMode,
    }) => {
      // `cwd` não é usado: a sessão da esteira é **de escopo**, e o escopo é a
      // worktree — o daemon resolve o diretório dela, como faz para toda
      // conversa aberta pela tela.
      void cwd;
      const configured = await configForAdapter(db, adapter, conveyorAgent);
      const opened = await api().session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: configured,
        // A conta do encaixe, ou — ausente — a padrão do agente, que o
        // `startAgentSession` resolve com o trio dela (`034` T10).
        ...(accountId === null ? {} : { agentAccountId: accountId }),
        taskId,
        // O encaixe que ela serve: é o que a deixa ser **reencontrada** na
        // tentativa seguinte, em vez de a esteira abrir a sétima conversa
        // sobre a mesma tarefa (Parte 7 — T57).
        taskRole: role,
        // Não há ninguém do outro lado. Ver a nota da procedure: é **nascer**
        // liberada, e não trocar — o portão do `016` protege a troca.
        autonomous: true,
      });
      await applySlot(opened.id, { agentMode, model, effort }, true);
      return { sessionId: opened.id };
    },

    /*
     * Retomar a conversa do encaixe (Parte 7 — T57).
     *
     * `resume` produz uma linha **nova** carregando o `acp_session_id` da
     * velha, e na **conta da sessão**: a conversa mora no diretório dela, e a
     * conta do encaixe de hoje não entra aqui. Modo, modelo e effort, sim —
     * `session/load` sobe um adaptador novo, no modo padrão dele, e sem eles a
     * segunda vez de cada encaixe rodava perguntando permissão a ninguém.
     *
     * Encaixe sem modelo não é *"o padrão da conta"*: é o modelo **da conversa**
     * (`session.model`), que o `resume` reaplica antes de devolver a linha. O
     * effort a sessão não grava, então sem um no encaixe ele fica no que o
     * adaptador trouxer.
     */
    resumeSession: async ({ sessionId, agentMode, model, effort }) => {
      const row = await sessionStore.resume(sessionId);
      await applySlot(row.id, { agentMode, model, effort }, false);
      return { sessionId: row.id };
    },
  };
}
