import type { PrFailure } from "./exec.js";
import type { GhPullRequest } from "./verdict.js";

/**
 * A porta para o host de git.
 *
 * A interface é *"dado um repositório e as branches dele, o que o host sabe"* —
 * e não *"rode este comando"*. A diferença é o que faz o segundo host (GitLab
 * por `glab`) ser uma implementação e não uma reescrita: o que muda é como se
 * pergunta, não o que se pergunta.
 *
 * Uma implementação no v1 ([Q1](../../../../docs/features/013-pull-request-status/open-questions.md)):
 * GitHub pelo `gh`. O §5 do PRD diz por que não há duas — abstração desenhada
 * contra imaginação é abstração errada, e a segunda entra quando houver um
 * repositório de verdade para exercitá-la.
 */

/** As estratégias que **o repositório** permite. O Lumem não inventa nenhuma (F7.3). */
export interface MergeOptions {
  merge: boolean;
  squash: boolean;
  rebase: boolean;
  /** O host apaga a branch sozinho depois do merge. Muda o que a confirmação diz. */
  deleteBranchOnMerge: boolean;
}

export type MergeStrategy = "merge" | "squash" | "rebase";

/** O que uma leitura do host devolve. Um instante, com carimbo. */
export interface PrSnapshot {
  /** `github.com`, ou o host de uma instalação Enterprise. */
  host: string;
  /** `org/repo`, como o host o chama. Usado para montar a URL de comparação. */
  repo: string;
  /** Todas as PRs do repositório, e não as de uma worktree — F4.3. */
  pulls: GhPullRequest[];
  merge: MergeOptions;
  /** ISO. A idade aparece **sempre** na barra (F1.5), então ela é dado. */
  readAt: string;
}

export type PrRead =
  | { ok: true; snapshot: PrSnapshot }
  | { ok: false; failure: PrFailure };

export interface PrHostInput {
  /** O checkout de onde perguntar. Já resolvido pelo `resolveScope`. */
  repoPath: string;
  /** O `remote` do projeto. `null` quando não há — e aí não há host. */
  remoteUrl: string | null;
}

export interface PrCreateInput extends PrHostInput {
  base: string;
  head: string;
  title: string;
  body: string;
  draft: boolean;
}

export interface PrMergeInput extends PrHostInput {
  /** Vem do **cache do daemon**, nunca do cliente (§4.2.12 do PRD). */
  number: number;
  strategy: MergeStrategy;
  deleteBranch: boolean;
}

export type PrWrite =
  | { ok: true; url: string }
  | { ok: false; failure: PrFailure };

export interface PrHost {
  /** Como este host se chama na tela, quando ele precisa ser nomeado. */
  readonly name: string;
  /** Se este adaptador fala com o host deste remote. */
  supports(remoteUrl: string | null): boolean;
  read(input: PrHostInput): Promise<PrRead>;
  /** F7 — escrita, e as duas únicas que existem. */
  create(input: PrCreateInput): Promise<PrWrite>;
  merge(input: PrMergeInput): Promise<PrWrite>;
}
