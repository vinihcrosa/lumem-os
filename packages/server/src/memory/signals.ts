import { newId } from "@lumem/shared";
import { and, desc, eq, gte, isNull, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

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

/**
 * Quanto tempo o mesmo sinal, no mesmo alvo e no mesmo escopo, conta como um só.
 *
 * O autosave do editor grava a cada 800 ms de pausa: sem janela, a tabela
 * mediria cadência de digitação, não "editei por cima dele" — e cresceria sem
 * teto. Cinco minutos é maior que qualquer rajada de digitação e menor que uma
 * volta ao mesmo arquivo depois de olhar outra coisa.
 */
export const SIGNAL_WINDOW_MS = 5 * 60_000;

function sameScope(column: SQLiteColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

/**
 * Grava, a menos que o mesmo sinal já esteja gravado dentro da janela.
 *
 * A repetição é (`kind`, `target`, escopo) — `detail` fica de fora de propósito:
 * dois autosaves seguidos no mesmo arquivo são a mesma coisa acontecendo, e o
 * número que qualifica não muda isso.
 *
 * `windowMs: null` é "nunca repete": serve para o sinal que uma varredura pode
 * reencontrar quantas vezes rodar, como o revert que continua no `git log`.
 *
 * Devolve se gravou.
 */
export function recordSignalOnce(
  db: Db,
  input: RecordSignalInput,
  windowMs: number | null = SIGNAL_WINDOW_MS,
): boolean {
  const scope = and(
    eq(actionSignal.kind, input.kind),
    eq(actionSignal.target, input.target),
    sameScope(actionSignal.workspaceId, input.workspaceId ?? null),
    sameScope(actionSignal.projectId, input.projectId ?? null),
    sameScope(actionSignal.worktreeId, input.worktreeId ?? null),
    sameScope(actionSignal.sessionId, input.sessionId ?? null),
  );
  const where =
    windowMs === null
      ? scope
      : and(scope, gte(actionSignal.createdAt, new Date(Date.now() - windowMs)));

  const [existing] = db
    .select({ id: actionSignal.id })
    .from(actionSignal)
    .where(where)
    .limit(1)
    .all();
  if (existing !== undefined) return false;

  recordSignal(db, input);
  return true;
}

export interface TryRecordOptions {
  /** Janela do descarte de repetição, em ms. `null` grava uma vez e nunca mais. */
  windowMs?: number | null;
  onError?: (error: unknown) => void;
}

/**
 * O sinal nunca derruba a ação que o produziu.
 *
 * Quem chama já fez o que o usuário pediu — gravou o arquivo, removeu a
 * worktree. Um `SQLITE_BUSY` no caminho do sinal viraria falha da gravação, e
 * o editor leria como conflito de um arquivo que ele mesmo acabou de salvar
 * certo. Registrar é secundário; falhar em silêncio (com log, quando há um) é
 * o comportamento correto.
 */
export function tryRecordSignal(
  db: Db,
  input: RecordSignalInput,
  { windowMs = SIGNAL_WINDOW_MS, onError }: TryRecordOptions = {},
): boolean {
  try {
    return recordSignalOnce(db, input, windowMs);
  } catch (error) {
    onError?.(error);
    return false;
  }
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
 * quiser. Então o daemon **procura**: lê o `git log` do checkout e reconhece o
 * formato que o próprio `git revert` escreve.
 *
 * Procurar em vez de instrumentar é o que mantém o sinal honesto: ele funciona
 * mesmo quando você não usou o Lumem para reverter — que é justamente quando
 * ele mais quer dizer alguma coisa.
 *
 * O que sai daqui é **só SHA**. O assunto do commit é frase que você digitou, e
 * ele existe nesta função como variável local, nunca como campo de um objeto
 * que alguém possa gravar em `target` (Q18).
 */
export interface RevertScan {
  /** SHA do commit de revert. */
  sha: string;
  /** SHA do commit que ele desfez, tirado do corpo que o `git revert` escreve. */
  revertedSha: string;
}

/** Separadores de registro e de campo: `%b` tem quebra de linha, `\n` não serve. */
const RECORD = "\u001e";
const FIELD = "\u001f";

/** O formato que `findRevertsIn` sabe ler. Quem chama o git passa isto adiante. */
export const REVERT_LOG_FORMAT = `%H${FIELD}%s${FIELD}%b${RECORD}`;

/** Quantos commits a varredura olha para trás. */
export const REVERT_SCAN_COMMITS = 200;

/** O assunto é o portão: o formato do `git revert`, e não qualquer menção à palavra. */
const REVERT_SUBJECT = /^Revert "(.+)"$/;
/** O corpo é onde o git escreve o que foi desfeito, e é de lá que sai o alvo. */
const REVERTS_COMMIT = /^This reverts commit ([0-9a-f]{7,40})\./m;

export function findRevertsIn(log: string): RevertScan[] {
  const found: RevertScan[] = [];
  for (const record of log.split(RECORD)) {
    const [sha, subject = "", body = ""] = record.trim().split(FIELD);
    if (sha === undefined || sha === "") continue;
    // O assunto morre aqui dentro: serve de portão e não vai para lugar nenhum.
    if (!REVERT_SUBJECT.test(subject)) continue;
    const reverted = REVERTS_COMMIT.exec(body);
    if (reverted?.[1] !== undefined) found.push({ sha, revertedSha: reverted[1] });
  }
  return found;
}

export interface RevertSignalScope {
  projectId?: string | null;
  worktreeId?: string | null;
  sessionId?: string | null;
}

/**
 * Transforma o que a varredura achou em sinais, uma vez cada.
 *
 * Sem janela: o mesmo revert continua no `git log` para sempre, e toda
 * varredura futura vai reencontrá-lo. Reencontrar não é acontecer de novo.
 *
 * Devolve quantos sinais novos entraram.
 */
export function recordRevertSignals(db: Db, log: string, scope: RevertSignalScope = {}): number {
  let recorded = 0;
  for (const revert of findRevertsIn(log)) {
    const wrote = tryRecordSignal(
      db,
      { kind: "user_reverted_agent_commit", target: revert.revertedSha, ...scope },
      { windowMs: null },
    );
    if (wrote) recorded += 1;
  }
  return recorded;
}
