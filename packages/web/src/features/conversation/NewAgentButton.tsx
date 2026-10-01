export interface NewAgentButtonProps {
  /**
   * `＋ novo agente`. The button does not know what an agent is made of: which
   * adapter and which model are chosen in the pill, and where that happens is the
   * caller's business.
   */
  onNewAgent: () => void;
}

/**
 * The one verb of the session strip: a new agent (LUM-62).
 *
 * This was the `＋ nova sessão` menu, with two items — `novo agente` and
 * `terminal` (`033` F5.6). The terminal left because it already lived in the run
 * dock, and the same shell showed up in both places: one action, one place
 * (`017`). A menu with one item is one click more for nothing, so the menu went
 * with it. Do not put `terminal` back here — if a second verb ever comes, the
 * menu comes back with it, not before.
 */
export function NewAgentButton({ onNewAgent }: NewAgentButtonProps) {
  return (
    // Not `onClick={onNewAgent}`: the handler would receive the click event, and
    // `addDraft`'s first parameter is the draft's initial text.
    <button type="button" className="tabs-new" onClick={() => onNewAgent()}>
      <span aria-hidden="true">＋</span> novo agente
    </button>
  );
}
