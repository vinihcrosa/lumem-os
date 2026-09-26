import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import { useAgentAccountMutations, type AgentAccountView } from "../agent/index.js";
import { Button } from "../../ui/index.js";
import { AccountTrio } from "./AccountTrio.js";
import { accountStatus, identityLine, purgeSentence } from "./account-words.js";

/**
 * Uma conta de um agente — sub-linha, e não coluna (`034` §6).
 *
 * Recuada sob a linha do agente, e com a etiqueta de dono na **mesma** coluna
 * das outras linhas da tela: o recuo é margem à esquerda, e a coluna de dono é
 * de largura fixa e alinhada à direita, então ela não anda.
 *
 * O trio padrão mora numa segunda faixa da mesma linha, porque ele é da conta —
 * e não num painel à parte, onde ninguém saberia de qual conta ele é.
 */
export function AccountRow({
  account,
  reading,
  onLogin,
}: {
  account: AgentAccountView;
  reading: AdapterCatalogView | null;
  onLogin(): void;
}) {
  const [confirmPurge, setConfirmPurge] = useState(false);
  const { disconnect, purge, setDefault, setDefaults } = useAgentAccountMutations();
  const status = accountStatus(account, reading);
  const identity = identityLine(account);
  // A frase do daemon, e não uma nossa: é ele quem sabe o que recusou.
  const failure = disconnect.error ?? setDefault.error ?? purge.error ?? null;

  return (
    <div className="set__row set__row--sub" role="group" aria-label={`conta ${account.label}`}>
      <span className="set__what">
        <span className="set__lbl">
          {account.label}
          {account.isDefault && <span className="set__mark">padrão</span>}
        </span>
        {identity !== null && <span className="set__d">{identity}</span>}
      </span>
      <span className="set__ctl">
        {actions()}
        {state()}
      </span>
      <span className="own">máquina</span>
      <AccountTrio
        account={account}
        reading={reading}
        onSave={(defaults) => setDefaults.mutateAsync({ accountId: account.id, ...defaults })}
      />
      {confirmPurge && (
        <span className="set__confirm">
          <span>{purgeSentence(account.sessionCount)}</span>
          <Button
            size="sm"
            variant="danger"
            disabled={purge.isPending}
            onClick={() => purge.mutate({ accountId: account.id, sessionCount: account.sessionCount })}
          >
            apagar de vez
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmPurge(false)}>
            cancelar
          </Button>
        </span>
      )}
      {failure !== null && (
        <span className="set__err set__wide" role="alert">
          {failure.message}
        </span>
      )}
    </div>
  );

  /** A palavra do estado — e, quando falta entrar, a palavra **é** o gesto. */
  function state() {
    if (status === "needs-login") {
      return (
        <button type="button" className="set__st set__st--warn set__st--act focus-ring" onClick={onLogin}>
          <span className="pip" aria-hidden="true" />
          entrar
        </button>
      );
    }
    return (
      <span className={`set__st set__st--${status === "connected" ? "on" : "off"}`}>
        <span className="pip" aria-hidden="true" />
        {status === "connected" ? "conectada" : "desconectada"}
      </span>
    );
  }

  function actions() {
    // A conta sem diretório é o login desta máquina: desconecta, e não se apaga (Q8).
    const purgeable = !account.bare && account.state === "disconnected";
    return (
      <>
        {status === "connected" && !account.isDefault && (
          <Button size="sm" variant="ghost" disabled={setDefault.isPending} onClick={() => setDefault.mutate(account.id)}>
            tornar padrão
          </Button>
        )}
        {status === "disconnected" && (
          <Button size="sm" variant="ghost" onClick={onLogin}>
            reconectar
          </Button>
        )}
        {account.state === "connected" && (
          <Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate(account.id)}>
            desconectar
          </Button>
        )}
        {purgeable && !confirmPurge && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmPurge(true)}>
            apagar de vez
          </Button>
        )}
      </>
    );
  }
}
