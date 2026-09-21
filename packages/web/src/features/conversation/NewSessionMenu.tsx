import { useAgentConfigs } from "../agent/index.js";
import { usePopover } from "../../hooks/usePopover.js";
import { useSessionMutations } from "../checkout/index.js";
import { Banner, Glyph, Menu, MenuItem } from "../../ui/index.js";

import "./new-session.css";

export interface NewSessionMenuProps {
  scopeType: "project" | "worktree";
  scopeId: string;
  onCreated: (sessionId: string) => void;
}

/** Opening a shell or an agent in one scope, F5.1 and F5.2. */
export function NewSessionMenu({ scopeType, scopeId, onCreated }: NewSessionMenuProps) {
  const popover = usePopover();

  const configs = useAgentConfigs();
  const { createShell: openShell, createAgent: openAgent } = useSessionMutations({
    scopeType,
    scopeId,
  });

  const failure = openShell.error ?? openAgent.error;
  const list = configs.data ?? [];

  return (
    <>
      <div className="new-session">
        <button
          type="button"
          ref={popover.triggerRef}
          className="tabs-new"
          aria-haspopup="menu"
          aria-expanded={popover.open}
          disabled={openAgent.isPending || openShell.isPending}
          onClick={popover.toggle}
        >
          <span aria-hidden="true">＋</span> nova sessão
        </button>

        {popover.open && (
          <div className="new-session__panel" ref={popover.panelRef}>
            <Menu label="nova sessão">
              {/* Shell and agent are the same primitive with a different label,
                  so they belong in the same list rather than in a button and a
                  menu that happen to sit side by side. */}
              <MenuItem
                glyph={<Glyph tone="shell">●</Glyph>}
                hint="shell de login"
                onSelect={() => {
                  popover.close();
                  openShell.mutate(undefined, { onSuccess: (created) => onCreated(created.id) });
                }}
              >
                shell
              </MenuItem>
              {list.map((config) => (
                <MenuItem
                  key={config.id}
                  glyph={<Glyph tone="agent">◆</Glyph>}
                  // F6.5: shown, but not launchable. Hiding it would leave the
                  // user wondering where their agent went; enabling it would let
                  // them watch a terminal open and close with no explanation.
                  disabled={!config.available || openAgent.isPending}
                  hint={config.available ? config.command : "fora do PATH"}
                  onSelect={() =>
                    openAgent.mutate(
                      { agentConfigId: config.id },
                      {
                        onSuccess: (created) => {
                          popover.close();
                          onCreated(created.id);
                        },
                      },
                    )
                  }
                >
                  {config.name}
                </MenuItem>
              ))}
            </Menu>
          </div>
        )}
      </div>

      {failure && (
        <div className="new-session__error">
          <Banner tone="danger">{failure.message}</Banner>
        </div>
      )}
    </>
  );
}
