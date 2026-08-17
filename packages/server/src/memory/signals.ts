import { newId } from "@lumem/shared";
import { desc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { actionSignal, type ActionSignalRow } from "../db/schema.js";

/**
 * Os sinais de ação (Q17 e Q18).
 *
 * O que este módulo registra é **o que foi feito**, não o que foi dito — e é o
 * único insumo de aprendizado que não depende de o agente cooperar. Quatro
 * eventos, todos que o Lumem já observa hoje sem instrumentação nova:
 *
 * | Sinal | O que ele diz, sem interpretar |
 * |---|---|
 * | `user_edited_after_agent` | você mexeu no que ele acabou de escrever |
 * | `user_reverted_agent_commit` | você desfez o commit dele |
 * | `worktree_discarded` | o trabalho inteiro foi jogado fora |
 * | `session_killed_early` | você matou a sessão logo no começo |
 *
 * **Registrar não é interpretar.** A Q17 fechou em "sinal cru primeiro,
 * interpretação depois, quando houver volume" — e é por isso que aqui não há
 * nenhuma regra do tipo "três edições viram feedback". Uma heurística escrita
 * antes do dado é uma opinião com cara de medida.
 *
 * E a Q18 está no schema, não aqui: só evento estrutural, nunca conteúdo.
 */

export type ActionSignalKind =
  | "user_edited_after_agent"
  | "user_reverted_agent_commit"
  | "worktree_discarded"
  | "session_killed_early";

export interface RecordSignalInput {
  kind: ActionSignalKind;
  target: string;
  workspaceId?: string | null;
  projectId?: string | null;
  worktreeId?: string | null;
  sessionId?: string | null;
  /** Um número que qualifica: linhas trocadas, segundos de vida. Nunca texto. */
  detail?: number | null;
}

export function recordSignal(db: Db, input: RecordSignalInput): void {
  db.insert(actionSignal)
    .values({
      id: newId(),
      kind: input.kind,
      target: input.target,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      worktreeId: input.worktreeId ?? null,
      sessionId: input.sessionId ?? null,
      detail: input.detail ?? null,
    })
    .run();
}

export interface SignalQuery {
  kind?: ActionSignalKind;
  limit?: number;
}

export function listSignals(db: Db, { kind, limit = 100 }: SignalQuery = {}): ActionSignalRow[] {
  const base = db.select().from(actionSignal).orderBy(desc(actionSignal.createdAt)).limit(limit);
  return kind === undefined ? base.all() : base.where(eq(actionSignal.kind, kind)).all();
}

/**
 * Quanto tempo de sessão conta como "matou cedo".
 *
 * Trinta segundos porque é abaixo do que qualquer tarefa real leva — abrir e
 * fechar por engano, ou desistir antes de o agente começar. Acima disso, a
 * sessão fez alguma coisa, e "morreu cedo" deixa de ser um sinal.
 */
export const KILLED_EARLY_SECONDS = 30;

export function isKilledEarly(startedAt: Date, endedAt: Date): boolean {
  return (endedAt.getTime() - startedAt.getTime()) / 1000 < KILLED_EARLY_SECONDS;
}

/**
 * Detecta o quarto sinal: **você desfez o commit do agente**.
 *
 * Não há gancho para isto — você reverte pelo terminal, pelo editor, por onde
 * quiser. Então o daemon **procura**: `git log` com `--grep` do formato de
 * revert do git, e o assunto revertido comparado com os commits que existiam
 * enquanto uma sessão de agente estava viva naquele checkout.
 *
 * Procurar em vez de instrumentar é o que mantém o sinal honesto: ele funciona
 * mesmo quando você não usou o Lumem para reverter — que é justamente quando
 * ele mais quer dizer alguma coisa.
 */
export interface RevertScan {
  /** SHA do commit de revert. */
  sha: string;
  /** O assunto do commit que foi desfeito. */
  revertedSubject: string;
}

const REVERT_SUBJECT = /^Revert "(.+)"$/;

export function findRevertsIn(log: string): RevertScan[] {
  const found: RevertScan[] = [];
  for (const line of log.split("\n")) {
    const [sha, ...rest] = line.split(" ");
    if (sha === undefined || sha === "") continue;
    const match = REVERT_SUBJECT.exec(rest.join(" ").trim());
    if (match?.[1] !== undefined) found.push({ sha, revertedSubject: match[1] });
  }
  return found;
}
