import { adapterById } from "@lumem/shared";

import { usePopover } from "../../hooks/usePopover.js";
import { useAgentAccounts } from "../agent/index.js";
import { Menu, MenuItem } from "../../ui/index.js";

/** O que o cabeçalho precisa para oferecer *continuar em outra conta* (`034` T15). */
export interface ContinueInProps {
  /** A conta desta conversa — ela não é destino. */
  currentAccountId: string | null;
  onContinue(agentAccountId: string): void;
  /** Enquanto a sessão nova sobe. */
  pending: boolean;
  /** A frase do daemon quando ele recusou. */
  error?: string | null;
}

/**
 * O gesto de continuar noutra conta, no cabeçalho da conversa (Q3).
 *
 * Aparece quando a máquina tem **duas contas conectadas** no total — de qualquer
 * agente, porque a conta nova pode ser de outro (o daemon aceita). Com uma só
 * não há para onde ir, e o botão seria um convite sem destino.
 *
 * Travado, e dizendo por quê, quando nada foi dito: o daemon recusa pelo mesmo
 * motivo, e a frase é a dele.
 */
export function ContinueInMenu({
  currentAccountId,
  onContinue,
  pending,
  empty,
}: ContinueInProps & { empty: boolean }) {
  const popover = usePopover();
  const accounts = useAgentAccounts().data ?? [];
  const connected = accounts.filter((account) => account.state === "connected");
  if (connected.length < 2) return null;

  const others = connected.filter((account) => account.id !== currentAccountId);
  const reason = empty ? "nada foi dito nesta conversa ainda — não há o que continuar" : null;

  return (
    <div className="new-session">
      <button
        type="button"
        ref={popover.triggerRef}
        className="btn btn--ghost btn--sm"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        disabled={reason !== null || pending}
        {...(reason === null ? {} : { title: reason })}
        onClick={popover.toggle}
      >
        {pending ? "continuando…" : "⇄ continuar em outra conta"}
      </button>

      {popover.open && (
        <div className="new-session__panel" ref={popover.panelRef}>
          <Menu label="continuar em outra conta">
            {others.map((account) => (
              <MenuItem
                key={account.id}
                onSelect={() => {
                  popover.close();
                  onContinue(account.id);
                }}
              >
                {`${adapterById(account.adapterId)?.label ?? account.adapterId} · ${account.label}`}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
    </div>
  );
}
