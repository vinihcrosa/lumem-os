/**
 * O que o daemon diz sobre uma pull request, e a tela desenha.
 *
 * O veredito é **derivado no daemon** (F4.4 da
 * [pull-request-status](../../../docs/prd/pull-request-status/prd.md)), e por
 * isso ele mora aqui em vez de nascer no cliente: se a regra morasse na tela, a
 * barra e o marcador da sidebar poderiam discordar — e a resposta para "dá pra
 * mesclar?" teria duas versões.
 *
 * O que a tela ainda faz é **traduzir**: a `reason` é estruturada, e virar
 * frase é decisão de quem sabe quanto espaço tem. Uma barra de 260px e uma de
 * 720px não dizem a mesma coisa.
 */

/**
 * A resposta, em seis estados.
 *
 * `none` — "sem pull request" — **não está aqui** de propósito: ele é estado da
 * *barra*, não da PR, e uma worktree sem PR não tem `PullRequestView` nenhuma
 * para carregá-lo.
 */
export type PrVerdict = "ready" | "blocked" | "pending" | "draft" | "merged" | "closed";

/** Por quê, estruturado. Tipo mais nomes; a frase é da tela. */
export type PrReason =
  | { kind: "conflict"; base: string }
  | { kind: "checks-failed"; names: string[] }
  | { kind: "changes-requested"; by: string[] }
  | { kind: "review-required" }
  | { kind: "behind"; base: string }
  | { kind: "blocked-by-host" }
  | { kind: "checks-running"; names: string[]; running: number; queued: number }
  | { kind: "mergeability-unknown" }
  | { kind: "ready"; passed: number; approvedBy: string[] }
  | { kind: "draft"; passed: number }
  | { kind: "merged"; base: string }
  | { kind: "closed" };

export type PrCheckGroup = "failed" | "running" | "passed" | "skipped";

export interface PrCheckCounts {
  failed: number;
  running: number;
  passed: number;
  skipped: number;
}

export interface PrCheckView {
  name: string;
  /** Quem executou: `GitHub Actions`, `Vercel`. Em 360px, vai abaixo do nome. */
  app: string;
  group: PrCheckGroup;
  /**
   * `null` quando a URL não passou na validação do §4.6 — e aí a linha aparece
   * sem link, dizendo por quê. Uma PR pode conter link para qualquer lugar; o
   * `↗` do Lumem só leva ao host de onde o dado veio.
   */
  url: string | null;
  /** Milissegundos, quando dá para saber. `null` para o que nem começou. */
  durationMs: number | null;
}

export interface PullRequestView {
  number: number;
  /** `null` pelo mesmo motivo de `PrCheckView.url`. */
  url: string | null;
  title: string;
  verdict: PrVerdict;
  reason: PrReason;
  counts: PrCheckCounts;
  /** Agrupadas e ordenadas pelo daemon: reprovadas primeiro (F2.3). */
  checks: PrCheckView[];
  base: string;
  head: string;
  updatedAt: string;
  author: string;
  /**
   * Quantas **outras** PRs a mesma branch tem — o `+N` da Q8.
   *
   * Nunca somadas num veredito só: isso produziria uma frase que não é verdade
   * sobre nenhuma delas.
   */
  alsoOpen: number;
}

/**
 * Por que não deu para saber.
 *
 * Cada uma é um estado **desenhado** (§6 do protótipo), e não um erro: a tela
 * diz o que houve e o que fazer, e as abas do painel continuam funcionando.
 */
export type PrFailureKind =
  | "no-binary"
  | "no-auth"
  | "offline"
  | "rate-limit"
  | "not-a-repo"
  | "unsupported-host"
  | "timeout"
  | "failed";

export interface PrFailureView {
  kind: PrFailureKind;
  /** Já classificada. Nunca o `stderr` do `gh` (§4.1.4 do PRD). */
  message: string;
  /** ISO, quando o host informa quando volta. `null` é o caso normal. */
  retryAt: string | null;
}

/** As estratégias que **o repositório** permite. O Lumem não inventa nenhuma. */
export interface PrMergeOptions {
  merge: boolean;
  squash: boolean;
  rebase: boolean;
  deleteBranchOnMerge: boolean;
}

export type PrMergeStrategy = "merge" | "squash" | "rebase";

/**
 * O que a barra precisa saber, de uma vez.
 *
 * `pull` e `failure` **coexistem**: offline com o último dado conhecido é o
 * estado do §6 do protótipo, e é o que faz "verde velho continua verde" ser
 * verdade sem ser mentira.
 */
export interface PrStatus {
  /** `null` quando esta worktree não tem PR — resposta, não erro. */
  pull: PullRequestView | null;
  failure: PrFailureView | null;
  /**
   * ISO da última leitura **bem-sucedida**.
   *
   * A idade aparece **sempre** na barra, e não só quando envelhece (F1.5):
   * número que só existe no erro é número que ninguém aprende a ler.
   */
  readAt: string | null;
  /** `github.com`, ou `null` quando não há host conhecido. */
  host: string | null;
  branch: string;
  base: string;
  /** Um remoto conhece esta branch? Separa "sem PR" de "branch não publicada". */
  published: boolean;
  /**
   * A tela de comparação do host, montada **no daemon** a partir do host, da
   * base e da head — não vem do payload (F5.4).
   */
  compareUrl: string | null;
  merge: PrMergeOptions;
}

/** O marcador da sidebar, por worktree. Sai do **mesmo** cache da barra (F3.3). */
export interface PrMark {
  worktreeId: string;
  number: number;
  verdict: PrVerdict;
}
