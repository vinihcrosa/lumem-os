import { CheckoutFiles, useRightPanel, useRunDock, widenColumnOnOpen } from "./features/checkout/index.js";
import { arrive, useNavigation } from "./lib/navigation.js";

/**
 * A coluna de arquivos do checkout selecionado, `032` T24.
 *
 * Lê `selection` e `rightPanel` direto do store/contexto em vez de recebê-los
 * por prop: quem monta este componente (`WorkspaceShell`) já decidiu que ele
 * deve existir — `selection !== null && rightPanel.open` —, então o `null`
 * abaixo nunca deveria disparar; é defesa, não fluxo esperado.
 */
export function RightColumn() {
  const { selection } = useNavigation();
  const rightPanel = useRightPanel();
  const dock = useRunDock();

  if (selection === null) return null;

  return (
    <CheckoutFiles
      // Keyed by checkout: a path from one worktree does not exist in
      // another, so the tree's expansion starts over on purpose (F2.6).
      key={`${selection.scope.scopeType}:${selection.scope.scopeId}`}
      scope={selection.scope}
      onClose={rightPanel.toggle}
      onResize={rightPanel.setWidth}
      onAskAgent={(sessionId, text) => {
        arrive({ sessionId, text, send: true });
      }}
      // Abrir o rodapé pelo chevron alarga a coluna quando ela é estreita demais
      // para um terminal (S1) — e é o único gesto que faz isso. Chegar não faz:
      // o rodapé já nasce aberto, então nunca passa por aqui.
      dock={widenColumnOnOpen(dock, rightPanel)}
    />
  );
}
