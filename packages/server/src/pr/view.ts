import type { PrCheckView, PullRequestView } from "@lumem/shared";

import { safeUrl } from "./url.js";
import { countChecks, decide, groupOf, type GhCheck, type GhPullRequest } from "./verdict.js";

/**
 * De uma PR do host para o que a tela desenha.
 *
 * Duas coisas acontecem aqui, e as duas são de responsabilidade do daemon:
 *
 * - **a ordem** — reprovadas primeiro. Reprovado abaixo de trinta linhas verdes
 *   é reprovado invisível (F2.3), e ordenar na tela deixaria a lista da barra e
 *   a da aba livres para discordar;
 * - **a validação de URL** — §4.6. Um `detailsUrl` que aponta para outro host
 *   vira linha sem link, e não vira link.
 */

/**
 * A ordem dos grupos, que é a ordem da atenção.
 *
 * "O que precisa de você" primeiro, "ignoradas" por último. Dentro do grupo, a
 * ordem do host — que é a ordem em que os checks foram declarados, e é a que a
 * pessoa reconhece do arquivo de workflow.
 */
const GROUP_ORDER = { failed: 0, running: 1, passed: 2, skipped: 3 } as const;

function durationOf(check: GhCheck): number | null {
  if (check.startedAt === null) return null;
  const start = Date.parse(check.startedAt);
  const end = check.completedAt === null ? Date.now() : Date.parse(check.completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  // Relógio do host contra relógio nosso: um check que "começou no futuro"
  // produziria uma duração negativa na tela.
  return Math.max(0, end - start);
}

function checkViewOf(check: GhCheck, host: string | null): PrCheckView {
  return {
    name: check.name,
    app: check.app,
    group: groupOf(check),
    url: safeUrl(check.url, host),
    durationMs: durationOf(check),
  };
}

export interface ViewInput {
  pull: GhPullRequest;
  host: string | null;
  /** Quantas **outras** PRs a mesma branch tem — o `+N` da Q8. */
  alsoOpen: number;
}

export function viewOf({ pull, host, alsoOpen }: ViewInput): PullRequestView {
  const { verdict, reason } = decide(pull);

  const checks = pull.checks
    .map((check) => checkViewOf(check, host))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);

  return {
    number: pull.number,
    url: safeUrl(pull.url, host),
    title: pull.title,
    verdict,
    reason,
    counts: countChecks(pull.checks),
    checks,
    base: pull.baseRefName,
    head: pull.headRefName,
    updatedAt: pull.updatedAt,
    author: pull.author,
    alsoOpen,
  };
}

/**
 * Quantos dias uma PR fechada ainda conta como "a PR desta worktree".
 *
 * O teto da [Q7](../../../../docs/features/013-pull-request-status/open-questions.md).
 * Sem ele, uma worktree cuja branch foi reaproveitada mostraria para sempre uma
 * PR que ninguém lembra — e o produto pareceria estar mentindo.
 */
export const CLOSED_PR_MAX_AGE_DAYS = 30;

/**
 * Qual PR é **a** PR desta branch.
 *
 * A regra da [Q8](../../../../docs/features/013-pull-request-status/open-questions.md):
 * a mais recentemente atualizada, e nunca duas somadas num veredito só — isso
 * produziria uma frase que não é verdade sobre nenhuma delas.
 *
 * PR aberta ganha de PR fechada sempre, e não só por data: uma PR nova aberta
 * hoje sobre uma branch que já teve uma fechada ontem é obviamente a que
 * interessa, mesmo que a fechada tenha recebido um comentário depois.
 */
export function pickForBranch(
  pulls: readonly GhPullRequest[],
  branch: string,
  now: number = Date.now(),
): { pull: GhPullRequest; alsoOpen: number } | null {
  const mine = pulls.filter((pull) => pull.headRefName === branch);
  if (mine.length === 0) return null;

  const open = mine.filter((pull) => pull.state.toUpperCase() === "OPEN");
  const recent = (pull: GhPullRequest): boolean => {
    const at = Date.parse(pull.updatedAt);
    if (Number.isNaN(at)) return false;
    return now - at <= CLOSED_PR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  };

  const byUpdated = (a: GhPullRequest, b: GhPullRequest): number =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

  if (open.length > 0) {
    const [first] = [...open].sort(byUpdated);
    return { pull: first!, alsoOpen: open.length - 1 };
  }

  const closed = mine.filter(recent).sort(byUpdated);
  const [first] = closed;
  return first === undefined ? null : { pull: first, alsoOpen: 0 };
}
