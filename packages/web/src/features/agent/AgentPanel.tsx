import { useState } from "react";

import type { AgentConfigView } from "./AgentRow.js";
import { LoginOptions } from "./LoginOptions.js";
import { useAgentProbe, useReprobeAgents } from "./queries.js";
import { Button } from "../../ui/index.js";

/**
 * O painel de **um** agente: conectado, precisando entrar, ou quebrado.
 *
 * Ele é aberto pela linha, e a linha fica marcada enquanto ele está aberto — com
 * duas linhas, um painel sem dono obriga a ler o título para saber de quem ele é.
 */
export function AgentPanel({
  config,
  onClose,
  onCustom,
}: {
  config: AgentConfigView;
  onClose: () => void;
  onCustom: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const probe = useAgentProbe(config);
  const reprobe = useReprobeAgents();

  /** O rótulo do agente: o `title` do handshake, e o nome da configuração antes dele. */
  const label = probe.data?.agentInfo?.title ?? config.name;

  return (
    <div className="setup" role="group" aria-label={`agente ${config.name}`}>
      <div className="setup__head">
        <span className="setup__t">{title()}</span>
        <button type="button" className="setup__x" aria-label="fechar" onClick={onClose}>
          ✕
        </button>
      </div>
      {body()}
    </div>
  );

  function title(): string {
    if (advanced) return "Adaptador";
    if (probe.isError) return "Não deu para conectar";
    if (probe.data?.authRequired === true) return `Entrar no ${label}`;
    return label;
  }

  function body() {
    if (advanced) return advancedDrawer();
    if (probe.isError) return failure(probe.error.message);
    if (probe.data?.authRequired === true) {
      return (
        <LoginOptions
          config={config}
          methods={probe.data.authMethods}
          onDone={() => void reprobe()}
        />
      );
    }
    return connected();
  }

  function connected() {
    const report = probe.data;

    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">agente</span>
            <span className="acct__v">
              <b>{label}</b>
              {report?.agentInfo != null && <> · {report.agentInfo.version}</>}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">entrada</span>
            <span className="acct__v">
              {report?.authMethods.length === 0 ? "credencial local, já válida" : "credencial local"}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">padrão</span>
            <span className="acct__v">{report?.currentMode ?? "o padrão do agente"}</span>
          </div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={() => void reprobe()}>
            verificar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={() => setAdvanced(true)}>
            avançado
          </button>
        </div>
        {/*
          Sem `sair`, e isso é a resposta do protocolo e não uma omissão: o
          `logout` existe no ACP e é gatilhado em `agentCapabilities.auth.logout`.
          O `claude-agent-acp` manda `auth: null`; o `codex-acp` **declara** a
          capacidade, e o Lumem ainda não a chama — está no backlog. Um botão aqui
          mentiria nos dois casos, por motivos diferentes.
        */}
        <span className="setup__note">
          Trocar de conta é <code>/logout</code> no seu agente: o Lumem ainda não chama a capacidade{" "}
          <code>auth.logout</code>, então um botão aqui não faria nada.
        </span>
      </>
    );
  }

  function advancedDrawer() {
    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">comando</span>
            <span className="acct__v">{config.command}</span>
          </div>
          <div className="acct__r">
            <span className="acct__k">args</span>
            <span className="acct__v">{config.args.length ? config.args.join(" ") : "nenhum"}</span>
          </div>
          <div className="acct__r">
            <span className="acct__k">versão</span>
            <span className="acct__v">{config.adapterVersion ?? "não fixada"}</span>
          </div>
        </div>
        <span className="setup__note">
          Só para quem mantém o próprio adaptador. O Lumem usa o que instalou e a versão que fixou —
          para trocar, remova esta configuração em <b>outro agente ACP…</b> e crie a sua.
        </span>
        <button type="button" className="linkbtn" onClick={() => setAdvanced(false)}>
          voltar
        </button>
      </>
    );
  }

  function failure(message: string) {
    return (
      <>
        <div className="fail">
          <span className="fail__title">
            <span aria-hidden="true">✕</span>
            não deu para conectar
          </span>
          <span className="fail__body">
            O adaptador não respondeu ao handshake. O que ele disse está abaixo.
          </span>
          <div className="fail__cmd">{message}</div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="primary" onClick={() => void reprobe()}>
            tentar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={onCustom}>
            outro agente ACP…
          </button>
        </div>
      </>
    );
  }
}
