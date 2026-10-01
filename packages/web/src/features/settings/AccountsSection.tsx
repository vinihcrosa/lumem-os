import { useEffect, useState } from "react";

import { ADAPTERS, type AdapterCatalogView, type AdapterSpec } from "@lumem/shared";

import {
  AgentConfigDialog,
  useAdapterCatalog,
  useAdoptMachineLogin,
  useAgentAccounts,
  useSetupAgentsReport,
  type AgentAccountView,
} from "../agent/index.js";
import { agentAnchor } from "../../lib/navigation.js";
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
 * O login saiu do rodapé para cá (a Q6 da `030-settings`), e o rodapé acabou com
 * o agente na `039` (LUM-57): `agent_config` é da máquina, e esta tela diz isso.
 * O `entrar ↓` da pílula abre aqui, em `#agent-<adaptador>`.
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
  const [other, setOther] = useState(false);

  return (
    <SettingSection
      title="Agentes"
      description={
        <>
          O adaptador é a cópia que o daemon instalou, e o <code>PATH</code> não decide. Cada agente pode
          ter mais de uma conta, e a configuração de agente é <b>da máquina</b>: vale para todo workspace,
          não para este. A conversa nova nasce na conta <b>padrão</b>.
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

      {/*
        A gaveta de quem o catálogo não cobre: um adaptador ACP que o daemon nem
        instala nem sabe nomear. Era o único caminho que só o rodapé tinha; sem
        ela, quem usa um ACP de fora perderia a porta. A versão do adaptador é
        obrigatória aqui como em qualquer configuração (A12, `027`).
      */}
      {other ? (
        <div className="set__other" role="group" aria-label="outro agente ACP">
          <span className="set__lbl">Outro agente ACP</span>
          <AgentConfigDialog onClose={() => setOther(false)} />
        </div>
      ) : (
        <button type="button" className="set__add focus-ring" onClick={() => setOther(true)}>
          ＋ outro agente ACP…
        </button>
      )}
    </SettingSection>
  );
}

/**
 * O destino do `entrar ↓` (`039`): `/settings#agent-<adaptador>` rola até o grupo
 * daquele agente e põe o foco nele.
 *
 * `display: contents` faz o grupo não ter caixa própria, então `scrollIntoView`
 * nele não rola nada; o alvo é a primeira linha do grupo. O foco fica no grupo —
 * que existe para a árvore de acessibilidade — e o leitor de tela lê `agente
 * Claude Code`.
 */
function useAnchoredSection(anchor: string) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (node === null || window.location.hash !== `#${anchor}`) return;
    node.focus({ preventScroll: true });
    // Sem caixa própria (`display: contents`), a primeira linha é quem rola.
    (node.firstElementChild ?? node).scrollIntoView?.({ block: "start" });
  }, [node, anchor]);
  return [setNode, node] as const;
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
  const anchor = agentAnchor(spec.id);
  const [section] = useAnchoredSection(anchor);
  const loginAccount = accounts.find((account) => account.id === loginFor) ?? null;

  /*
   * Um grupo por agente, e `display: contents` para a grade da seção não
   * mudar: com dois agentes, os dois têm uma conta `principal`, e "a conta
   * principal" só é endereçável — por leitor de tela e por e2e — dentro do
   * agente dela.
   */
  return (
    <div
      className="set__agent"
      role="group"
      aria-label={`agente ${spec.label}`}
      id={anchor}
      tabIndex={-1}
      ref={section}
    >
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
