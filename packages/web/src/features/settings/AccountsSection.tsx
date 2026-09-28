import { useState } from "react";

import { ADAPTERS, type AdapterCatalogView, type AdapterSpec } from "@lumem/shared";

import {
  useAdapterCatalog,
  useAdoptMachineLogin,
  useAgentAccounts,
  useSetupAgentsReport,
  type AgentAccountView,
} from "../agent/index.js";
import { Button } from "../../ui/index.js";
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
            report={agents.data}
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
  report,
  accounts,
  catalog,
  defaultConnecting,
}: {
  spec: AdapterSpec;
  installed: string | null;
  report: ReturnType<typeof useSetupAgentsReport>["data"];
  accounts: readonly AgentAccountView[];
  catalog: readonly AdapterCatalogView[];
  defaultConnecting: boolean;
}) {
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(defaultConnecting);
  const loginAccount = accounts.find((account) => account.id === loginFor) ?? null;

  /*
   * Um grupo por agente, e `display: contents` para a grade da seção não
   * mudar: com dois agentes, os dois têm uma conta `principal`, e "a conta
   * principal" só é endereçável — por leitor de tela e por e2e — dentro do
   * agente dela.
   */
  return (
    <div className="set__agent" role="group" aria-label={`agente ${spec.label}`}>
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

      {accounts.length === 0 && <AdoptMachineLogin spec={spec} report={report} />}

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

      {/*
        Um agente de conta única (`accountEnv: null`) não tem o que conectar, e um
        sem conta nenhuma adota o login da máquina antes — a conta de diretório
        próprio é a **segunda**.
      */}
      {spec.accountEnv !== null &&
        accounts.length > 0 &&
        (connecting ? (
          <ConnectAccountPanel
            spec={spec}
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
    </div>
  );
}

/**
 * A sub-linha do agente sem conta nenhuma: o login que já existe nesta máquina
 * entra como `principal`, e é o único gesto — um `＋ conectar conta` aqui
 * criaria uma conta de diretório vazio, pedindo login do zero.
 */
function AdoptMachineLogin({
  spec,
  report,
}: {
  spec: AdapterSpec;
  report: ReturnType<typeof useSetupAgentsReport>["data"];
}) {
  const adopt = useAdoptMachineLogin(report);
  return (
    <div className="set__acct">
      <div className="set__row set__row--sub" role="group" aria-label={`nenhuma conta do ${spec.label}`}>
        <span className="set__d">nenhuma conta ainda — o login que já existe nesta máquina entra como principal</span>
        <span className="set__ctl">
          <Button size="sm" variant="primary" disabled={adopt.isPending} onClick={() => adopt.mutate(spec)}>
            {adopt.isPending ? "conectando…" : `conectar ${spec.label}`}
          </Button>
        </span>
        <span className="own">máquina</span>
        {adopt.error !== null && (
          <span className="set__err set__wide" role="alert">
            {adopt.error.message}
          </span>
        )}
      </div>
    </div>
  );
}
