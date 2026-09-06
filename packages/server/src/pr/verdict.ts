/**
 * De tudo o que o host disse sobre uma pull request, uma pergunta: **dá pra
 * mesclar?**
 *
 * Esta é a parte da feature que a tela inteira depende e a única que é pura.
 * Ela mora sozinha porque a F4.4 do PRD exige que o veredito seja derivado no
 * **daemon**: se a regra morasse na tela, a barra e o marcador da sidebar
 * poderiam discordar — e a resposta para "dá pra mesclar?" teria duas versões.
 *
 * Nada aqui importa rede, processo ou banco. O teste é uma tabela.
 */

/** O que o `gh` responde por verificação, normalizado pela projeção da P0. */
export interface GhCheck {
  name: string;
  /** `workflowName`, ou o `context` do status de commit antigo. */
  app: string;
  /** `QUEUED`, `IN_PROGRESS`, `COMPLETED`, `PENDING`, `WAITING`, `REQUESTED`. */
  status: string;
  /** `SUCCESS`, `FAILURE`, `SKIPPED`, `NEUTRAL`, … Vazio enquanto não terminou. */
  conclusion: string;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GhReview {
  author: string;
  /** `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`. */
  state: string;
}

/** Uma pull request como o adaptador a entrega — a forma medida no spike. */
export interface GhPullRequest {
  number: number;
  url: string;
  title: string;
  /** `OPEN`, `MERGED`, `CLOSED`. */
  state: string;
  isDraft: boolean;
  /** `MERGEABLE`, `CONFLICTING`, `UNKNOWN`. */
  mergeable: string;
  /** `CLEAN`, `BLOCKED`, `DIRTY`, `BEHIND`, `UNSTABLE`, `DRAFT`, `UNKNOWN`. */
  mergeStateStatus: string;
  /** `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, ou vazio. */
  reviewDecision: string;
  headRefName: string;
  baseRefName: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: string;
  reviews: GhReview[];
  checks: GhCheck[];
}

/**
 * A resposta e o motivo vêm do **contrato**, e não daqui.
 *
 * Eles são o que atravessa a rede, então a definição mora em `@lumem/shared` —
 * um tipo declarado dos dois lados é um tipo que diverge no dia em que alguém
 * acrescenta um estado num só. O `import` é **só de tipo**: ele some na
 * compilação, e a pureza deste arquivo continua sendo verificável (o teste
 * conta os imports que sobrevivem).
 *
 * `pending` carrega a decisão de produto do §2.3 do PRD: metade da vida de uma
 * PR é verificação em andamento, e pintar isso de vermelho é gritar lobo — lobo
 * que grita sozinho para de ser lido.
 */
export type { PrReason, PrVerdict } from "@lumem/shared";

import type { PrCheckCounts, PrCheckGroup, PrReason, PrVerdict } from "@lumem/shared";

export interface PrDecision {
  verdict: PrVerdict;
  reason: PrReason;
}

/** Em que grupo da aba `PR` uma verificação cai — e em que ordem ela é lida. */
export type CheckGroup = PrCheckGroup;

/**
 * `SKIPPED` não é sucesso e não é falha: é "não se aplicava".
 *
 * `NEUTRAL` conta como passou porque é o que o GitHub usa para "rodei e não
 * tenho opinião" — tratá-lo como falha reprovaria PR por causa de um check que
 * decidiu não opinar.
 */
const PASSED = new Set(["SUCCESS", "NEUTRAL"]);
const SKIPPED = new Set(["SKIPPED", "STALE"]);
/**
 * Tudo o mais que **terminou** é falha, e a lista é escrita por extenso porque
 * uma conclusão que ninguém previu não pode virar verde por omissão.
 */
const FAILED = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "ERROR",
]);

export function groupOf(check: GhCheck): CheckGroup {
  const status = check.status.toUpperCase();
  // O status manda enquanto a coisa não terminou: um check em fila traz
  // `conclusion` vazia, e uma conclusão vazia não diz nada sozinha.
  if (status !== "COMPLETED" && status !== "SUCCESS" && status !== "FAILURE") {
    return "running";
  }

  const conclusion = check.conclusion.toUpperCase();
  if (PASSED.has(conclusion)) return "passed";
  if (SKIPPED.has(conclusion)) return "skipped";
  if (FAILED.has(conclusion)) return "failed";
  /*
   * Terminou sem conclusão que a gente conheça — **não é verde**.
   *
   * O §"campo desconhecido" da P1 manda cair para "não sei dizer", e o lugar
   * onde isso aparece é a contagem de rodando, que produz `pending`. A primeira
   * versão devolvia `passed` para conclusão **vazia**, e o comentário aqui já
   * dizia o contrário do código: um check `COMPLETED` sem conclusão entrava na
   * contagem de passou e ajudava a produzir `ready`. Foi a bateria de mutação
   * que cobrou — trocar o ramo por `running` não quebrava teste nenhum, o que
   * quer dizer que o ramo verde não era exigido por ninguém.
   */
  return "running";
}

export type CheckCounts = PrCheckCounts;

export function countChecks(checks: readonly GhCheck[]): CheckCounts {
  const counts: CheckCounts = { failed: 0, running: 0, passed: 0, skipped: 0 };
  for (const check of checks) counts[groupOf(check)] += 1;
  return counts;
}

/** Quantas verificações estão **na fila**, que é âmbar junto com rodando (Q6). */
function queuedCount(checks: readonly GhCheck[]): number {
  return checks.filter((check) => {
    const status = check.status.toUpperCase();
    return status === "QUEUED" || status === "WAITING" || status === "REQUESTED";
  }).length;
}

function namesOf(checks: readonly GhCheck[], group: CheckGroup): string[] {
  return checks.filter((check) => groupOf(check) === group).map((check) => check.name);
}

/**
 * Quem pediu mudanças, e só quem pediu.
 *
 * `COMMENTED` não entra: comentar não bloqueia, e listar quem comentou junto de
 * quem bloqueou é como uma frase vermelha passa a acusar a pessoa errada.
 */
function changesRequestedBy(reviews: readonly GhReview[]): string[] {
  return reviews
    .filter((review) => review.state.toUpperCase() === "CHANGES_REQUESTED")
    .map((review) => review.author);
}

function approvedBy(reviews: readonly GhReview[]): string[] {
  return reviews
    .filter((review) => review.state.toUpperCase() === "APPROVED")
    .map((review) => review.author);
}

/**
 * A tabela.
 *
 * A **ordem é o algoritmo**, e cada degrau está aqui por um motivo medido:
 *
 * 1. `state` vem antes de tudo porque o spike achou que o GitHub devolve
 *    `mergeable: UNKNOWN` para PR mesclada ou fechada — ele só calcula
 *    mergeabilidade sob demanda, e não a calcula para PR que acabou. Ler
 *    `mergeable` primeiro pintaria toda PR mesclada de âmbar;
 * 2. rascunho vem antes dos bloqueios porque rascunho **não está bloqueado**:
 *    está *não pronto ainda*, que é neutro e não vermelho (§2.3);
 * 3. os quatro bloqueios saem na prioridade da F1.4 — conflito > verificação
 *    reprovada > mudanças pedidas > regra da base. Quatro motivos empilhados
 *    não cabem em 360px, e você resolve um por vez de qualquer forma;
 * 4. verificação rodando ou na fila é `pending`, **nunca** `blocked`. É a
 *    decisão de cor do §2.3, e é aqui que ela é obedecida ou traída.
 */
export function decide(pr: GhPullRequest): PrDecision {
  const state = pr.state.toUpperCase();
  if (state === "MERGED") {
    return { verdict: "merged", reason: { kind: "merged", base: pr.baseRefName } };
  }
  if (state === "CLOSED") {
    return { verdict: "closed", reason: { kind: "closed" } };
  }

  const counts = countChecks(pr.checks);

  if (pr.isDraft) {
    return { verdict: "draft", reason: { kind: "draft", passed: counts.passed } };
  }

  const mergeable = pr.mergeable.toUpperCase();
  const mergeState = pr.mergeStateStatus.toUpperCase();

  if (mergeable === "CONFLICTING" || mergeState === "DIRTY") {
    return { verdict: "blocked", reason: { kind: "conflict", base: pr.baseRefName } };
  }

  if (counts.failed > 0) {
    return {
      verdict: "blocked",
      reason: { kind: "checks-failed", names: namesOf(pr.checks, "failed") },
    };
  }

  const requested = changesRequestedBy(pr.reviews);
  if (pr.reviewDecision.toUpperCase() === "CHANGES_REQUESTED" || requested.length > 0) {
    return { verdict: "blocked", reason: { kind: "changes-requested", by: requested } };
  }

  // Vazio **não** é "falta revisão": o `gh` devolve `""` quando o repositório
  // não exige revisão nenhuma, e tratar isso como exigência bloquearia toda PR
  // de repositório pessoal — o caso mais comum de quem usa o Lumem.
  if (pr.reviewDecision.toUpperCase() === "REVIEW_REQUIRED") {
    return { verdict: "blocked", reason: { kind: "review-required" } };
  }

  if (mergeState === "BEHIND") {
    return { verdict: "blocked", reason: { kind: "behind", base: pr.baseRefName } };
  }

  if (counts.running > 0) {
    return {
      verdict: "pending",
      reason: {
        kind: "checks-running",
        names: namesOf(pr.checks, "running"),
        running: counts.running - queuedCount(pr.checks),
        queued: queuedCount(pr.checks),
      },
    };
  }

  // O host diz que algo trava e a gente não achou o quê. Acontece com regra de
  // base que o `gh` não detalha, e com verificação exigida que ainda nem foi
  // agendada. É vermelho porque é definitivo, e a frase diz que a regra é do
  // host em vez de reimplementá-la.
  if (mergeState === "BLOCKED") {
    return { verdict: "blocked", reason: { kind: "blocked-by-host" } };
  }

  // Campo que ninguém previu não explode e não vira verde: cai em "não sei
  // dizer", que é âmbar. Um `UNKNOWN` numa PR aberta é o GitHub ainda
  // calculando depois de um push, e é honestamente um "ainda não se sabe".
  if (mergeable !== "MERGEABLE") {
    return { verdict: "pending", reason: { kind: "mergeability-unknown" } };
  }
  if (mergeState !== "CLEAN" && mergeState !== "UNSTABLE" && mergeState !== "HAS_HOOKS") {
    return { verdict: "pending", reason: { kind: "mergeability-unknown" } };
  }

  return {
    verdict: "ready",
    reason: { kind: "ready", passed: counts.passed, approvedBy: approvedBy(pr.reviews) },
  };
}
