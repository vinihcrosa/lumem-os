import { useState } from "react";

import { ADAPTERS, type AdapterCatalogView, type AdapterSpec } from "@lumem/shared";

import {
  useAdapterCatalog,
  useAgentAccounts,
  useSetupAgentsReport,
  type AgentAccountView,
} from "../agent/index.js";
import { AccountLogin } from "./AccountLogin.js";
import { AccountRow } from "./AccountRow.js";
import { readingFor } from "./account-words.js";
import { ConnectAccountPanel } from "./ConnectAccountPanel.js";
import { SettingRow, SettingSection } from "./SettingsPanel.js";

const NO_ACCOUNTS: readonly AgentAccountView[] = [];
const NO_CATALOG: readonly AdapterCatalogView[] = [];

/**
 * Agentes — e as contas de cada um (`034` T13).
 *
 * A linha do agente continua a de antes, só leitura: qual versão o daemon tem
 * **no disco**, que é a regra do
 * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 * Embaixo dela, uma sub-linha por conta. Com uma conta só, a seção é a de antes
 * mais uma linha — que é o que o §6 promete a quem não tem duas.
 *
 * O login saiu do rodapé para cá (a Q6 da `030-settings`); o rodapé fica até a
 * LUM-57, falando da conta padrão.
 */
export function AccountsSection({
  defaultConnecting,
}: {
  /**
   * Nasce com o painel de conectar deste agente aberto — o `defaultOpen` da
   * pílula, pelo mesmo motivo: é o estado que a galeria precisa mostrar sem
   * um clique.
   */
  defaultConnecting?: string;
} = {}) {
  const agents = useSetupAgentsReport();
  const accounts = useAgentAccounts().data ?? NO_ACCOUNTS;
  const catalog = useAdapterCatalog(null).data ?? NO_CATALOG;

  return (
    <SettingSection
      title="Agentes"
      description={
        <>
          O adaptador é a cópia que o daemon instalou, e o <code>PATH</code> não decide. Cada agente pode
          ter mais de uma conta, e cada uma vale para <b>todo workspace desta máquina</b>. A conversa nova
          nasce na conta <b>padrão</b> — é dela que o rodapé da coluna fala.
        </>
      }
    >
      <div className="set__rows">
        {ADAPTERS.map((spec) => (
          <AgentAccounts
            key={spec.id}
            spec={spec}
            installed={agents.data?.adapters.find((row) => row.id === spec.id)?.adapter.version ?? null}
            accounts={accounts.filter((account) => account.adapterId === spec.id)}
            catalog={catalog}
            defaultConnecting={defaultConnecting === spec.id}
          />
        ))}
      </div>
    </SettingSection>
  );
}

function AgentAccounts({
  spec,
  installed,
  accounts,
  catalog,
  defaultConnecting,
}: {
  spec: AdapterSpec;
  installed: string | null;
  accounts: readonly AgentAccountView[];
  catalog: readonly AdapterCatalogView[];
  defaultConnecting: boolean;
}) {
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(defaultConnecting);
  const loginAccount = accounts.find((account) => account.id === loginFor) ?? null;

  return (
    <>
      <SettingRow
        label={spec.label}
        description={
          <>
            {spec.package ?? spec.command} · pino <code>{spec.pinnedVersion}</code>
          </>
        }
        owner="máquina"
        readOnly
      >
        <span className="set__val">{installed ?? "não instalado"}</span>
      </SettingRow>

      {accounts.map((account) => (
        <div className="set__acct" key={account.id}>
          <AccountRow
            account={account}
            reading={readingFor(catalog, account)}
            onLogin={() => setLoginFor(account.id)}
          />
          {loginAccount?.id === account.id && (
            <AccountLogin account={loginAccount} onClose={() => setLoginFor(null)} />
          )}
        </div>
      ))}

      {/* Um agente de conta única (`accountEnv: null`) não tem o que conectar. */}
      {spec.accountEnv !== null &&
        (connecting ? (
          <ConnectAccountPanel
            spec={spec}
            hasAccounts={accounts.length > 0}
            onClose={() => setConnecting(false)}
            onConnected={(account) => {
              setConnecting(false);
              // A de assinatura nasce desconectada: entrar é o passo seguinte, e ele já abre.
              if (account.kind === "subscription") setLoginFor(account.id);
            }}
          />
        ) : (
          <button type="button" className="set__add focus-ring" onClick={() => setConnecting(true)}>
            ＋ conectar conta
          </button>
        ))}
    </>
  );
}
