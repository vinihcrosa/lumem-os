import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useCheckoutChanges, type ChangeRef, type ChangeStatus } from "../hooks/useCheckoutChanges.js";
import type { RunDockState } from "../hooks/useRunDock.js";
import { useFileTree } from "../hooks/useFileTree.js";
import { useProposals } from "../hooks/useMemory.js";
import { useOpenFiles } from "../hooks/useOpenFiles.js";
import { useScopeIds } from "../hooks/useScopeIds.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { ChangesTab } from "./ChangesTab.js";
import { FileTree, NewInRoot } from "./FileTree.js";
import { MemoryPanel } from "./MemoryPanel.js";
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
}

/**
 * The column's contents for one checkout.
 *
 * It belongs to the checkout, not to the tab: switching sessions does not
 * change which files exist. What it opens, on the other hand, belongs to the
 * tab — which is why the opening goes through `useOpenFiles` instead of state
 * held here.
 */
export function CheckoutFiles({ scope, onClose, onResize, dock }: CheckoutFilesProps) {
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
  const statusByPath = new Map<string, ChangeStatus>(
    (changes.data?.files ?? []).map((file) => [file.path, file.status as ChangeStatus]),
  );

  const active = openFiles.activeTab === null ? null : openFiles.fileFor(openFiles.activeTab);

  return (
    <RightPanel
      tab={tab}
      onSelectTab={setTab}
      changeCount={changes.data?.files.length ?? null}
      proposalCount={proposals.data?.length ?? null}
      // Only where it means something: on `Mudanças` there is no tree to create
      // into, and a button that opens a field on another tab is a trap.
      actions={tab === "files" ? <NewInRoot edits={edits} /> : undefined}
      onReload={() => {
        // "read the disk again", not "read this one directory again".
        void queryClient.invalidateQueries({ queryKey: ["files"] });
        void queryClient.invalidateQueries({ queryKey: ["changes"] });
      }}
      onClose={onClose}
      onResize={onResize}
      dock={<RunDock scope={scope} dock={dock} />}
      footLeft={changes.isError ? "não deu para ler o checkout" : undefined}
      footRight={
        tab === "changes"
          ? shownRef === "worktree"
            ? "árvore de trabalho vs HEAD"
            : `vs ${changes.data?.baseBranch ?? "base"}`
          : undefined
      }
    >
      {tab === "files" && (
        <FileTree
          scope={scope}
          openPath={active?.view === "file" ? active.path : null}
          onOpen={(path) => openFiles.open({ path, view: "file" })}
          statusOf={(path) => statusByPath.get(path)}
          edits={edits}
        />
      )}
      {tab === "changes" && (
        <ChangesTab
          scope={scope}
          openPath={active?.view === "patch" ? active.path : null}
          onOpenPatch={(path, ref) => openFiles.open({ path, view: "patch", ref })}
          onRefChange={setShownRef}
        />
      )}
      {tab === "memory" && (
        // O escopo da memória segue o do checkout: o projeto é sempre conhecido,
        // e o workspace vem com ele. Uma worktree resolve para o mesmo projeto,
        // porque worktree é origem e não escopo (Q5).
        <MemoryPanel workspaceId={ids.workspaceId} projectId={ids.projectId} />
      )}
    </RightPanel>
  );
}
