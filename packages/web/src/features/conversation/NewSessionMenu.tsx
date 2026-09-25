import { usePopover } from "../../hooks/usePopover.js";
import { useSessionMutations } from "../checkout/index.js";
import { Banner, Glyph, Menu, MenuItem } from "../../ui/index.js";


export interface NewSessionMenuProps {
  scopeType: "project" | "worktree";
  scopeId: string;
  onCreated: (sessionId: string) => void;
  /**
   * `＋ novo agente`. The menu does not know what an agent is made of: which
   * adapter and which model are chosen in the pill, and where that happens is the
   * caller's business.
   */
  onNewAgent: () => void;
  /**
   * Why `novo agente` cannot be pressed right now, or null when it can. Shown in
   * the item, because a disabled verb with no reason leaves nothing to fix.
   */
  newAgentBlocked?: string | null;
}

/**
 * The two verbs of a scope: a new agent and a terminal (`033` F5.6).
 *
 * It used to list one line per agent configuration, and that is how the transport
 * leaked into the gesture — choosing an agent was choosing a row of
 * `agent_config`. An agent is always a conversation now, and the adapter is picked
 * where the model is.
 */
export function NewSessionMenu({
  scopeType,
  scopeId,
  onCreated,
  onNewAgent,
  newAgentBlocked = null,
}: NewSessionMenuProps) {
  const popover = usePopover();

  const { createShell: openShell } = useSessionMutations({ scopeType, scopeId });

  return (
    <>
      <div className="new-session">
        <button
          type="button"
          ref={popover.triggerRef}
          className="tabs-new"
          aria-haspopup="menu"
          aria-expanded={popover.open}
          disabled={openShell.isPending}
          onClick={popover.toggle}
        >
          <span aria-hidden="true">＋</span> nova sessão
        </button>

        {popover.open && (
          <div className="new-session__panel" ref={popover.panelRef}>
            <Menu label="nova sessão">
              <MenuItem
                glyph={<Glyph tone="agent">◆</Glyph>}
                disabled={newAgentBlocked !== null}
                {...(newAgentBlocked !== null ? { hint: newAgentBlocked } : {})}
                onSelect={() => {
                  popover.close();
                  onNewAgent();
                }}
              >
                novo agente
              </MenuItem>
              <MenuItem
                glyph={<Glyph tone="shell">●</Glyph>}
                hint="shell de login"
                onSelect={() => {
                  popover.close();
                  openShell.mutate(undefined, { onSuccess: (created) => onCreated(created.id) });
                }}
              >
                terminal
              </MenuItem>
            </Menu>
          </div>
        )}
      </div>

      {openShell.error && (
        <div className="new-session__error">
          <Banner tone="danger">{openShell.error.message}</Banner>
        </div>
      )}
    </>
  );
}
