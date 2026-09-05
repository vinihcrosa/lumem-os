import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { PrMark, PrStatus } from "@lumem/shared";

import { prMarksKey, prStatusKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/**
 * O ritmo da barra, e as duas pausas que fazem a conta fechar.
 *
 * Poll é a única opção real: nem GitHub nem GitLab entregam webhook para uma
 * máquina sem endereço, e `gh` não tem *watch*. Os números são a
 * [Q5](../../../../docs/prd/pull-request-status/open-questions.md) — `15s` com
 * verificação rodando, `60s` sem —, e o daemon tem os mesmos do lado dele: o
 * cliente pedindo mais rápido que o TTL só recebe o valor em cache, e não vira
 * processo.
 *
 * As duas pausas são o que separa "consulta com ritmo" de "processo gasto para
 * ninguém ver":
 *
 * - **janela oculta** — a aba está em outro lugar da sua vida;
 * - **painel colapsado** — e o painel **nasce** colapsado, então esta é a
 *   pausa que vale mais.
 */

const POLL_BUSY_MS = 15_000;
const POLL_IDLE_MS = 60_000;

/** `document.hidden`, como estado de React em vez de leitura solta. */
function useWindowVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = (): void => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

export interface UsePullRequestOptions {
  /**
   * O painel está aberto?
   *
   * Não é `enabled`: a consulta **acontece** mesmo com ele fechado, porque o
   * marcador da sidebar depende dela e o painel nasce fechado (F3.4). O que ela
   * governa é o **relógio** — com o painel fechado, o valor em cache basta e
   * ninguém está olhando para ele envelhecer.
   */
  panelOpen: boolean;
}

export function usePullRequest(
  worktreeId: string | null,
  { panelOpen }: UsePullRequestOptions,
): UseQueryResult<PrStatus> {
  const visible = useWindowVisible();

  return useQuery<PrStatus>({
    queryKey: prStatusKey(worktreeId ?? "-"),
    queryFn: () => trpc.pr.getByWorktree.query({ worktreeId: worktreeId! }),
    enabled: worktreeId !== null,
    refetchInterval: (query) => {
      if (!visible || !panelOpen) return false;
      const data = query.state.data;
      if (!data) return POLL_IDLE_MS;
      // Com verificação rodando o estado muda em segundos; sem nada rodando o
      // que muda é gente, e gente é mais lenta que CI.
      return (data.pull?.counts.running ?? 0) > 0 ? POLL_BUSY_MS : POLL_IDLE_MS;
    },
    // Enquanto não se sabe, a barra **não existe** — nada de esqueleto piscando
    // no topo do painel a cada troca de worktree (P6). Guardar o valor anterior
    // é o que faz trocar de aba não apagar a barra e redesenhá-la.
    placeholderData: (previous) => previous,
  });
}

/**
 * Os marcadores da sidebar, por projeto.
 *
 * Uma consulta para todas as linhas, e não uma por linha: é o que a F3.3 pede,
 * e é o que faz o marcador ser barato o bastante para existir sempre.
 *
 * Ela **não** pausa com o painel fechado, porque é justamente aí que ela é o
 * único sinal de PR que sobra.
 */
export function usePrMarks(projectId: string | null): UseQueryResult<PrMark[]> {
  const visible = useWindowVisible();

  return useQuery<PrMark[]>({
    queryKey: prMarksKey(projectId ?? "-"),
    queryFn: () => trpc.pr.listByProject.query({ projectId: projectId! }),
    enabled: projectId !== null,
    refetchInterval: () => (visible ? POLL_IDLE_MS : false),
    placeholderData: (previous) => previous,
  });
}

/**
 * "Tentar de novo": manda o daemon esquecer o TTL e reler.
 *
 * Recebe o **escopo**, e não o id do projeto: o escopo é o que a tela sabe no
 * instante do clique, e o projeto de uma worktree só chega uma consulta depois.
 * Com o projeto, o botão não fazia nada quando o clique vinha cedo — que é
 * exatamente quando alguém clica em recarregar. Foi o e2e que achou.
 */
export function usePrRefresh(scope: { scopeType: "project" | "worktree"; scopeId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await trpc.pr.refresh.mutate(scope);
    },
    onSettled: async () => {
      /*
       * Cancelar **antes** de reler, e não só invalidar.
       *
       * `invalidateQueries` marca a consulta como velha, mas não reinicia uma
       * busca que já está no ar: ela resolve com o que o daemon respondeu
       * **antes** do clique, e o `⟳` parece não ter feito nada. É o mesmo
       * defeito que o `PrCache` tinha do lado do daemon, com o mesmo formato —
       * um pedido servido por uma leitura que começou antes dele.
       *
       * `["pr"]` inteiro nos dois: a barra e o marcador saem do mesmo cache, e
       * mexer num só seria deixá-los discordarem na tela.
       */
      await queryClient.cancelQueries({ queryKey: ["pr"] });
      await queryClient.refetchQueries({ queryKey: ["pr"] });
    },
  });
}

/**
 * Projetos onde a pessoa mandou não mostrar mais a barra (F1.8).
 *
 * Só as falhas **permanentes até alguém mexer na máquina** oferecem isto — sem
 * `gh`, host sem integração. Rede caída não oferece, porque ela volta sozinha e
 * uma barra que some por causa disso some para sempre.
 *
 * Em `localStorage` e não no daemon porque é preferência de tela, como a
 * largura da coluna: vale para quem está olhando, e não para o projeto.
 */
const DISMISSED_KEY = "lumem.pr.dismissed";

export function usePrDismissal(projectId: string | null) {
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

  return {
    isDismissed: projectId !== null && dismissed.includes(projectId),
    dismiss: (): void => {
      if (projectId === null) return;
      const next = [...new Set([...dismissed, projectId])];
      setDismissed(next);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // Sem `localStorage` — navegação privada, política de site. A dispensa
        // vale para esta sessão, o que é melhor que não valer.
      }
    },
  };
}

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
