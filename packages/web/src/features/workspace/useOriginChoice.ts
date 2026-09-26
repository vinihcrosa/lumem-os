import { useState } from "react";

import { useWorktreeBranches, useWorktreeOrigins } from "./useWorktrees.js";

/** As quatro origens da `026-worktree-from`, na ordem em que aparecem. */
export type OriginKind = "default" | "branch" | "issue" | "pr";

/** O que foi escolhido na lista, se algo foi. */
export type Pick =
  | { kind: "branch"; ref: string; local: boolean }
  | { kind: "issue"; number: number }
  | { kind: "pr"; number: number };

/**
 * As falhas do host que **apagam as abas** em vez de aparecerem dentro delas.
 *
 * Três, e todas dizem a mesma coisa: aqui não há host nenhum. As outras —
 * `offline`, `rate-limit`, `timeout` — são temporárias, e para essas a aba fica
 * e a lista explica: sumir com ela faria a tela mudar de forma por causa de um
 * wi-fi ruim.
 */
const NO_HOST = new Set(["no-binary", "no-auth", "unsupported-host"]);

/**
 * O nome da branch a partir de uma issue, montado **aqui**.
 *
 * `<número>-<slug>`, a mesma forma que o GitHub gera. O `gh issue develop` daria
 * a mesma string e **criaria uma branch no repositório remoto** — um terceiro
 * verbo de escrita no host, sem portão, disparado por digitar num modal
 * ([Q1](../../../../docs/features/026-worktree-from/open-questions.md)).
 */
export function branchNameForIssue(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? String(number) : `${number}-${slug}`;
}

/**
 * O pedido que vai ao daemon. `default` não viaja: ausente quer dizer isso.
 *
 * Recebe o `active`, e não o `kind` cru — a diferença entre os dois aparece
 * quando a aba escolhida **desaparece debaixo da escolha**: o host responde
 * `no-auth` numa releitura, as abas de host somem, o trilho passa a desenhar
 * `default` pressionado, e o `kind` continua `"pr"`. Com o `kind`, o `criar`
 * mandaria a origem da PR enquanto a tela dizia que estava cortando da default.
 */
export function fromOf(kind: OriginKind, pick: Pick | null) {
  if (kind === "default" || pick === null) return undefined;
  // A aba mudou e a escolha é de outra: ela não vale mais.
  if (kind !== pick.kind) return undefined;
  return pick;
}

export interface UseOriginChoiceOptions {
  open: boolean;
  /** A origem **sugere** um nome — quem grava no campo é quem chamou o hook. */
  onSuggestName?: (name: string) => void;
}

/**
 * O estado do trilho de origem — qual aba está aberta, o que foi escolhido
 * nela, e as duas leituras que alimentam as listas.
 *
 * Extraído do `CreateWorktreeDialog` na T19: o diálogo continua sendo quem
 * decide o `from` que vai ao daemon (via `fromOf`) e quem grava o nome
 * sugerido; este hook só descreve o que o trilho mostra.
 */
export function useOriginChoice(projectId: string, { open, onSuggestName }: UseOriginChoiceOptions) {
  const [kind, setKind] = useState<OriginKind>("default");
  const [pick, setPick] = useState<Pick | null>(null);

  /*
   * Duas leituras, e não uma — a diferença é de duas ordens de grandeza.
   *
   * As branches são disco: 10 ms medidos para 85 refs. As issues e as PRs são
   * rede: ~730 ms. Numa consulta só, a aba `branch` — a única que existe em
   * projeto sem remoto — esperaria um `gh` que talvez nem esteja instalado.
   *
   * As duas começam **depois** de o diálogo existir, e nenhuma segura o campo de
   * nome: é a F3.5, e é o que a `sidebar-actions` aprendeu na Q5a.
   */
  const branches = useWorktreeBranches(projectId, { enabled: open });
  const host = useWorktreeOrigins(projectId, { enabled: open });

  /*
   * Se este projeto tem host, e a resposta enquanto ninguém sabe ainda.
   *
   * Enquanto a leitura não voltou, as quatro abas estão lá: a aparência de
   * carregando é a lista, não o trilho. Quando a resposta diz que não há host —
   * sem remoto, sem `gh`, ou sem autenticação — as duas somem, e o motivo
   * aparece uma vez abaixo do trilho.
   */
  const hostFailure = host.data?.issues.failure ?? host.data?.pulls.failure ?? null;
  const hostOff =
    host.data !== undefined &&
    (host.data.host === null || NO_HOST.has(hostFailure?.kind ?? ""));
  const kinds: OriginKind[] = hostOff ? ["default", "branch"] : ["default", "branch", "issue", "pr"];

  // A aba escolhida sumiu debaixo da escolha: volta para a que sempre existe, em
  // vez de deixar um corpo sem trilho correspondente.
  const active = kinds.includes(kind) ? kind : "default";

  /*
   * A escolha que ainda descreve a aba aberta.
   *
   * `pick` sozinho descreveria uma origem que a tela não está mostrando: com as
   * abas de host sumindo debaixo da escolha, o eco diria "da head da PR #19"
   * embaixo de um trilho com `default` pressionado. O `fromOf` faz a mesma
   * pergunta do outro lado, e as duas respostas têm que ser a mesma.
   */
  const chosen = pick !== null && pick.kind === active ? pick : null;

  /**
   * O número da PR quando o `criar` vai passar pela rede, e `null` quando não.
   *
   * Sai da mesma lista que desenha a nota cinza, e não de um estado novo: se a
   * linha diz `busca ao criar`, o banner diz o que está buscando. Duas leituras
   * do mesmo dado, uma antes e uma durante.
   */
  const fetching =
    chosen?.kind === "pr" &&
    host.data?.pulls.items.some((pull) => pull.number === chosen.number && !pull.onDisk) === true
      ? chosen.number
      : null;

  function select(next: OriginKind): void {
    setKind(next);
    setPick(null);
  }

  function choose(next: Pick, suggested: string): void {
    setPick(next);
    // A origem **sugere**: ela escreve no campo, e o campo continua editável.
    onSuggestName?.(suggested);
  }

  function reset(): void {
    setKind("default");
    setPick(null);
  }

  return {
    kinds,
    active,
    select,
    pick,
    chosen,
    choose,
    branches,
    host,
    hostOff,
    hostFailure,
    fetching,
    reset,
  };
}

/** O que `useOriginChoice` devolve — o `OriginPicker` só conhece esta forma. */
export type OriginChoice = ReturnType<typeof useOriginChoice>;
