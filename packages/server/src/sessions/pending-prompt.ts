import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createSessionRepository } from "../repositories/session.js";
import { readProjectScripts } from "../scripts/project-scripts.js";
import { SETUP_TIMEOUT_MS } from "../tasks/conveyor-ports.js";
import type { Context } from "../trpc.js";

/**
 * O primeiro prompt, esperando o `setup` da worktree (`033` §3.3, Q6).
 *
 * A espera mora no daemon, e não na aba, porque ela dura minutos e a aba pode
 * fechar no meio: o texto fica gravado na linha da sessão (`pending_prompt`)
 * e sai quando o checkout estiver pronto. Três chamadores, uma máquina: o
 * `worktree.start`, que acabou de criar a sessão; o `session.resume`, que
 * reabre a sessão cujo `setup` o daemon perdeu (M2a); e o `session.sendPending`,
 * que é a pessoa decidindo mandar depois de uma falha.
 */

/**
 * Prepara e manda — ou grava por que não mandou.
 *
 * Nunca lança: roda em segundo plano (`void`), e o que der errado vira o
 * motivo na linha, que é onde a tela o lê. A linha é **relida** antes de cada
 * decisão, e não levada no argumento: o `setup` leva minutos, e nesse meio
 * tempo a pessoa pode ter descartado o texto ou mandado assim mesmo — o exit
 * que chega depois não pode desfazer nenhum dos dois.
 */
export async function deliverPending(ctx: Context, sessionId: string): Promise<void> {
  try {
    await deliver(ctx, sessionId);
  } catch {
    // Só o banco falha aqui, e uma rejeição solta derrubaria o daemon por um
    // prompt: o texto continua na linha, e a retomada ou o `sendPending` o
    // levam adiante.
  }
}

async function deliver(ctx: Context, sessionId: string): Promise<void> {
  const row = await ctx.sessionStore.findById(sessionId);
  // Um motivo gravado é uma decisão esperando alguém: quem a toma é o
  // `sendPending`, e não uma segunda rodada do `setup`.
  if (!row || row.pendingPrompt === null || row.pendingReason !== null) return;

  const ready = await prepare(ctx, row);

  const now = await ctx.sessionStore.findById(sessionId);
  if (!now || now.pendingPrompt === null) return;

  if (!ready) {
    await createSessionRepository(ctx.db).markPendingFailed(sessionId, "setup_failed");
    emitChanged(ctx, now);
    return;
  }

  try {
    sendPendingNow(ctx, now);
  } catch {
    // A sessão morreu durante o `setup`: o prompt fica na linha, para a
    // retomada levar adiante. Não há o que marcar — o `setup` não falhou.
  }
}

/**
 * O checkout pronto para o primeiro turno: `true` quando não há `setup`, ou
 * quando ele saiu com `0`.
 *
 * O teto é o da esteira, e **não** o default do `runToCompletion`: aquele é
 * de 20 s porque foi escolhido para o `teardown`, e matou o `setup` da `028`
 * Parte 7 no meio de um `pnpm install`. Estourar o teto (`null`) é falha como
 * qualquer exit diferente de zero — o prompt não sai contra um checkout pela
 * metade (F4.6).
 *
 * `start` recusa com `BLOCKED` o projeto clonado que ainda não foi confiado, e
 * isso também é falha: mandar o prompt como se o checkout estivesse pronto
 * seria o agente trabalhando sem dependência e gastando o turno descobrindo.
 */
async function prepare(ctx: Context, row: SessionRow): Promise<boolean> {
  try {
    const scripts = await readProjectScripts(row.cwd);
    if (scripts.setup === null) return true;

    const exitCode = await ctx.scripts.runToCompletion(
      { scopeType: row.scopeType as "project" | "worktree", scopeId: row.scopeId },
      "setup",
      { timeoutMs: SETUP_TIMEOUT_MS },
    );
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Manda o prompt gravado, sem esperar o turno.
 *
 * A pendência zera quando o turno da pessoa **entra na conversa**, e não
 * antes nem depois. Antes, uma recusa que acontece antes do turno — o teto do
 * workspace, que o `prompt` confere primeiro — apagaria um texto que nunca
 * foi mandado. Depois, a linha diria *"esperando"* durante os minutos de um
 * turno que já está rodando.
 *
 * Lança só o que recusa **antes** de mandar — sessão que não está viva —, para
 * o `sendPending` poder dizer por quê. O resto do turno é da conversa.
 */
export function sendPendingNow(ctx: Context, row: SessionRow): void {
  const text = row.pendingPrompt;
  if (text === null) {
    throw new DomainError("BLOCKED", `não há prompt pendente na sessão ${row.id}`);
  }
  if (ctx.acpManager.get(row.id)?.state !== "running") {
    throw new DomainError(
      "SESSION_EXITED",
      "a sessão já terminou; retome-a para mandar o prompt que ficou esperando",
    );
  }

  const off = ctx.acpManager.onEvent(row.id, ({ event }) => {
    if (event.type !== "message" || event.role !== "user") return;
    off();
    void createSessionRepository(ctx.db)
      .clearPending(row.id)
      .then(() => emitChanged(ctx, row))
      .catch(() => {
        // A linha fica dizendo que o prompt espera, e o turno já está na
        // conversa: a tela mostra os dois, e nada se perdeu.
      });
  });

  // Sem `await`, como o websocket: um turno dura minutos. Uma recusa antes do
  // turno já está na transcrição (o teto emite `budget`), e o texto continua na
  // linha porque o turno da pessoa nunca entrou.
  void ctx.acpManager
    .prompt(row.id, text)
    .catch(() => {})
    .finally(off);
}

function emitChanged(ctx: Context, row: SessionRow): void {
  ctx.events.emit({
    type: "session.changed",
    scopeType: row.scopeType as "project" | "worktree",
    scopeId: row.scopeId,
  });
}
