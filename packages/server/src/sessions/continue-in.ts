import { adapterById } from "@lumem/shared";
import { eq } from "drizzle-orm";

import { cutTranscript } from "../acp/transcript-cut.js";
import { session, type SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import type { Context } from "../trpc.js";
import { sendPendingNow } from "./pending-prompt.js";
import { startAgentSession } from "./start-agent-session.js";

/**
 * Continuar uma conversa noutra conta (`034` T11, Q3).
 *
 * A conta de uma conversa é fixa no nascimento — outro processo de adaptador,
 * outra credencial —, então *trocar* é abrir outra: uma sessão nova, no mesmo
 * escopo, na conta escolhida (que pode ser de outro agente), que nasce com o
 * corte da origem como primeiro turno (Q3a). A origem **não é tocada** além da
 * linha de vínculo no fim, e continua aceitando prompt (Q3b).
 *
 * A ordem é a que não deixa estado parcial: o que pode recusar — origem que não
 * é conversa, nada dito, conta que não existe ou foi desconectada — recusa
 * **antes** do `spawn`, e só depois de a sessão nova existir a origem ganha a
 * linha que aponta para ela.
 */
export async function continueIn(
  ctx: Context,
  input: { sessionId: string; agentAccountId: string },
): Promise<SessionRow> {
  const source = await ctx.sessionStore.findById(input.sessionId);
  if (!source) throw new DomainError("NOT_FOUND", `sessão ${input.sessionId} não existe`);
  if (source.kind !== "agent" || source.transport !== "acp") {
    throw new DomainError(
      "BLOCKED",
      "só conversa de agente continua noutra conta: um shell não tem conversa para levar",
    );
  }

  const target = await createAgentAccountRepository(ctx.db).get(input.agentAccountId);
  if (!target) throw new DomainError("NOT_FOUND", `conta ${input.agentAccountId} não existe`);

  const cut = cutTranscript(ctx.acpManager.storedTranscript(source.id));
  // Um turno em que nada foi dito custaria o prompt do sistema da conta nova
  // para levar nada: o que se quer ali é uma conversa nova.
  if (cut.messages === 0) {
    throw new DomainError("BLOCKED", "nada foi dito nesta conversa ainda — não há o que continuar");
  }

  const sourceLabel = await labelOf(ctx, source.agentConfigId, source.agentAccountId);
  const targetLabel = await labelOf(ctx, target.agentConfigId, target.id);

  // A desconectada recusa aqui dentro, no resolvedor de invocação, antes do
  // `spawn` — a mesma frase do `resume` e da conversa nova.
  const started = await startAgentSession(ctx, {
    scopeType: source.scopeType as "project" | "worktree",
    scopeId: source.scopeId,
    agent: { agentConfigId: target.agentConfigId },
    agentAccountId: target.id,
    /*
     * A tarefa atravessa: é o mesmo trabalho, e o custo da continuação tem de
     * contar para ela. O encaixe (`taskRole`) não — ele é da esteira, que
     * reencontra a própria conversa por ele, e esta foi aberta por alguém.
     */
    ...(source.taskId === null ? {} : { taskId: source.taskId }),
  });

  await ctx.db.update(session).set({ continuedFromId: source.id }).where(eq(session.id, started.id));

  // Antes do turno: a linha diz o que a conta nova vai pagar para ler.
  ctx.acpManager.recordEvent(started.id, {
    type: "continued_from",
    sessionId: source.id,
    label: sourceLabel,
    messages: cut.messages,
    approxTokens: cut.approxTokens,
  });

  /*
   * Pelo prompt pendente, e não por um `prompt` solto: um turno recusado antes
   * de entrar — o teto do workspace confere primeiro — deixaria o corte sem
   * casa. Assim ele fica na linha, e a tela oferece `mandar assim mesmo`.
   */
  await createSessionRepository(ctx.db).setPendingPrompt(
    started.id,
    `Continuação de uma conversa em ${sourceLabel}. O que foi dito até aqui:\n\n${cut.text}`,
  );

  ctx.acpManager.recordEvent(source.id, {
    type: "continued_in",
    sessionId: started.id,
    label: targetLabel,
  });

  const row = (await ctx.sessionStore.findById(started.id)) ?? started;
  sendPendingNow(ctx, row);
  ctx.events.emit({
    type: "session.changed",
    scopeType: row.scopeType as "project" | "worktree",
    scopeId: row.scopeId,
  });
  return row;
}

/** `agente · conta`, o mesmo par que o cabeçalho da conversa desenha. */
async function labelOf(
  ctx: Context,
  agentConfigId: string | null,
  agentAccountId: string | null,
): Promise<string> {
  const config = agentConfigId
    ? await createAgentConfigRepository(ctx.db).findById(agentConfigId)
    : undefined;
  const account = agentAccountId
    ? await createAgentAccountRepository(ctx.db).get(agentAccountId)
    : undefined;
  const agent = config ? (adapterById(config.name)?.label ?? config.name) : "agente";
  return account ? `${agent} · ${account.label}` : agent;
}
