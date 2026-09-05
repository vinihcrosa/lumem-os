import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useCheckoutChanges, type ChangeRef, type ChangeStatus } from "../hooks/useCheckoutChanges.js";
import {
  usePrDismissal,
  usePrRefresh,
  usePullRequest,
} from "../hooks/usePullRequest.js";
import type { RunDockState } from "../hooks/useRunDock.js";
import { useFileTree } from "../hooks/useFileTree.js";
import { useProposals } from "../hooks/useMemory.js";
import { useOpenFiles } from "../hooks/useOpenFiles.js";
import { useScopeIds } from "../hooks/useScopeIds.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { ChangesTab } from "./ChangesTab.js";
import { ChecksTab, checksBadge } from "./ChecksTab.js";
import { FileTree, NewInRoot } from "./FileTree.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { PrBar } from "./PrBar.js";
import { RightPanel, type RightPanelTab } from "./RightPanel.js";
import { RunDock } from "./RunDock.js";

export interface CheckoutFilesProps {
  scope: Scope;
  onClose(): void;
  onResize(width: number): void;
  /**
   * O rodapé de execução, que mora abaixo do que esta coluna mostra.
   *
   * O estado dele vem de fora porque abrir o rodapé mexe na **largura da coluna**
   * (S1), e a largura é do `App`. Aberto e altura são preferência de tela, como a
   * largura já era: valem para qualquer checkout, não para este.
   */
  dock: RunDockState;
  /** Abre uma conversa nova com o pedido dentro — ver `RunDock`. */
  onAskAgent?: (sessionId: string, prompt: string) => void;
}

/**
 * The column's contents for one checkout.
 *
 * It belongs to the checkout, not to the tab: switching sessions does not
 * change which files exist. What it opens, on the other hand, belongs to the
 * tab — which is why the opening goes through `useOpenFiles` instead of state
 * held here.
 */
export function CheckoutFiles({
  scope,
  onClose,
  onResize,
  dock,
  onAskAgent,
}: CheckoutFilesProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<RightPanelTab>("files");
  const [shownRef, setShownRef] = useState<ChangeRef>("worktree");
  const openFiles = useOpenFiles();

  // Held here rather than inside the tree because one of its gestures has no row
  // to start from: creating in the checkout's own directory. Its trigger is in
  // the bar, which is this component's, and the field it opens is drawn by the
  // tree — one gesture at a time, and therefore one owner.
  const edits = useFileTree(scope);

  const changes = useCheckoutChanges(scope, "worktree");
  const proposals = useProposals("pending");
  const ids = useScopeIds(scope);

  /*
   * A barra é da **worktree**, e não do projeto.
   *
   * O checkout do projeto está na branch base: perguntar "qual PR desta branch"
   * ali responderia a PR de outra pessoa, ou nenhuma. A consulta continua sendo
   * por projeto no daemon — o que muda aqui é só de quem é a pergunta.
   */
  const worktreeId = scope.scopeType === "worktree" ? scope.scopeId : null;
  /*
   * `panelOpen: true`, e não uma variável — este componente **é** o conteúdo do
   * painel, e o `App` só o monta com a coluna aberta. Fechar a coluna
   * desmonta-o, e a consulta para junto. A opção existe no hook mesmo assim,
   * porque a pausa é requisito (P6) e requisito que só existe por acidente de
   * montagem é requisito que a próxima refatoração apaga sem ninguém ver.
   */
  const pr = usePullRequest(worktreeId, { panelOpen: true });
  const refresh = usePrRefresh(ids.projectId);
  const dismissal = usePrDismissal(ids.projectId);

  const status = pr.data ?? null;
  const pull = status?.pull ?? null;
  /*
   * A barra não existe enquanto não se sabe, e some quando foi dispensada.
   *
   * "Enquanto não se sabe" é literal: nada de esqueleto piscando no topo do
   * painel a cada troca de worktree (P6). E ela nunca some sozinha por erro —
   * some quando não há o que dizer **e** a pessoa mandou não mostrar mais.
   */
  const showBar = status !== null && worktreeId !== null && !dismissal.isDismissed;

  /*
   * A aba `PR` some quando a PR some — e a seleção volta para `Arquivos`.
   *
   * Sem isto, mesclar deixaria o painel numa aba que não existe mais, mostrando
   * um corpo vazio sob uma faixa de três abas. Derivado em vez de guardado em
   * estado: a aba em foco é uma função da aba pedida e do que existe.
   */
  const shownTab: RightPanelTab = tab === "pr" && pull === null ? "files" : tab;
  const statusByPath = new Map<string, ChangeStatus>(
    (changes.data?.files ?? []).map((file) => [file.path, file.status as ChangeStatus]),
  );

  const active = openFiles.activeTab === null ? null : openFiles.fileFor(openFiles.activeTab);

  return (
    <RightPanel
      tab={shownTab}
      onSelectTab={setTab}
      changeCount={changes.data?.files.length ?? null}
      proposalCount={proposals.data?.length ?? null}
      prBar={
        showBar && worktreeId !== null ? (
          <PrBar
            status={status}
            worktreeId={worktreeId}
            onRetry={() => refresh.mutate()}
            onDismiss={dismissal.dismiss}
          />
        ) : undefined
      }
      prBadge={pull === null ? null : checksBadge(pull)}
      // Only where it means something: on `Mudanças` there is no tree to create
      // into, and a button that opens a field on another tab is a trap.
      actions={shownTab === "files" ? <NewInRoot edits={edits} /> : undefined}
      onReload={() => {
        // "read the disk again", not "read this one directory again".
        void queryClient.invalidateQueries({ queryKey: ["files"] });
        void queryClient.invalidateQueries({ queryKey: ["changes"] });
      }}
      onClose={onClose}
      onResize={onResize}
      dock={<RunDock scope={scope} dock={dock} onAskAgent={onAskAgent} />}
      footLeft={changes.isError ? "não deu para ler o checkout" : undefined}
      footRight={
        shownTab === "changes"
          ? shownRef === "worktree"
            ? "árvore de trabalho vs HEAD"
            : `vs ${changes.data?.baseBranch ?? "base"}`
          : undefined
      }
    >
      {shownTab === "files" && (
        <FileTree
          scope={scope}
          openPath={active?.view === "file" ? active.path : null}
          onOpen={(path) => openFiles.open({ path, view: "file" })}
          statusOf={(path) => statusByPath.get(path)}
          edits={edits}
        />
      )}
      {shownTab === "changes" && (
        <ChangesTab
          scope={scope}
          openPath={active?.view === "patch" ? active.path : null}
          onOpenPatch={(path, ref) => openFiles.open({ path, view: "patch", ref })}
          onRefChange={setShownRef}
        />
      )}
      {shownTab === "pr" && pull !== null && (
        <ChecksTab pull={pull} readAt={status?.readAt ?? null} />
      )}
      {shownTab === "memory" && (
        // O escopo da memória segue o do checkout: o projeto é sempre conhecido,
        // e o workspace vem com ele. Uma worktree resolve para o mesmo projeto,
        // porque worktree é origem e não escopo (Q5).
        <MemoryPanel workspaceId={ids.workspaceId} projectId={ids.projectId} />
      )}
    </RightPanel>
  );
}
