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
          <AccountName account={account} />
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

/**
 * O nome da conta, que se renomeia no lugar (Q2: *"o nome é seu"*).
 *
 * Quieto de propósito: o nome é texto até alguém clicar nele — um botão
 * `renomear` a mais em cada linha disputaria com os gestos da conta, que são o
 * que a linha existe para oferecer. `Enter` grava, `Esc` e sair do campo
 * desistem: um nome gravado sem `Enter` seria um nome que você não confirmou.
 * Vazio ou igual não chega ao daemon; a recusa dele fica embaixo, com o campo
 * aberto para corrigir.
 */
function AccountName({ account }: { account: AgentAccountView }) {
  const [draft, setDraft] = useState<string | null>(null);
  const { rename } = useAgentAccountMutations();

  if (draft === null) {
    return (
      <button
        type="button"
        className="set__name focus-ring"
        aria-label={`renomear ${account.label}`}
        title="renomear"
        onClick={() => setDraft(account.label)}
      >
        {account.label}
      </button>
    );
  }

  const stop = () => {
    rename.reset();
    setDraft(null);
  };
  const save = () => {
    const label = draft.trim();
    if (label === "" || label === account.label) return stop();
    rename.mutate({ accountId: account.id, label }, { onSuccess: () => setDraft(null) });
  };

  return (
    <>
      <input
        className={`input set__rename${rename.error === null ? "" : " input--error"}`}
        aria-label={`nome da conta ${account.label}`}
        aria-invalid={rename.error === null ? undefined : true}
        value={draft}
        maxLength={80}
        autoFocus
        // `readOnly`, e não `disabled`: desabilitar tira o foco, e a recusa
        // voltaria com o campo sem cursor.
        readOnly={rename.isPending}
        onChange={(event) => {
          setDraft(event.target.value);
          rename.reset();
        }}
        onBlur={() => {
          if (!rename.isPending) stop();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") stop();
        }}
      />
      {rename.error !== null && (
        <span className="set__err set__rename__err" role="alert">
          {rename.error.message}
        </span>
      )}
    </>
  );
}
