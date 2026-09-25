import { useCallback, useState } from "react";

import { AgentConfigDialog } from "./AgentConfigDialog.js";
import { AgentPanel } from "./AgentPanel.js";
import { AgentRow } from "./AgentRow.js";
import { ConnectPanel } from "./ConnectPanel.js";
import { Credentials } from "./Credentials.js";
import { useAgentConfigs } from "./queries.js";

/**
 * Os agentes do rodapé: uma linha por agente, e o `＋` que conecta o próximo.
 *
 * Até a `second-agent`, este rodapé tinha **uma** linha, e ela era duas coisas ao
 * mesmo tempo: o estado da conexão e o botão de conectar — `conectar um agente`
 * virava `claude · conectado`. Com dois agentes isso deixa de fechar: a linha só
 * pode ser **estado**, e o verbo precisa de lugar próprio. O cabeçalho `Agentes`
 * com um `＋` é a regra que a `sidebar-actions` já tinha estabelecido para
 * `Projetos` — a ação mora no cabeçalho da lista que ela alimenta, presa ao título
 * e não ao fim da lista, para não se afastar da coisa quando a lista cresce.
 *
 * O custo está medido na folha `lumem-second-agent.html`: o rodapé sai de 45px
 * para 105px com dois agentes, e 28 deles são o cabeçalho — cobrados mesmo de quem
 * tem um agente só.
 *
 * Cada botão de login continua vindo do `authMethods` do handshake, e agora há
 * duas naturezas de método porque os agentes são dois: o `claude-agent-acp`
 * oferece `type: "terminal"` — comandos que o daemon roda num PTY — e o
 * `codex-acp` não oferece comando nenhum, só chamadas de `authenticate`. A tela
 * desenha o que o agente ofereceu, e nada além.
 *
 * A linha, o painel do `＋` e o painel de um agente moram cada um no seu próprio
 * arquivo (`AgentRow`, `ConnectPanel`, `AgentPanel`, com `LoginOptions` dentro
 * deste último); a tradução de catálogo e método vive em `agent-words.ts`. Este
 * arquivo fica só a composição.
 */
export function AgentLogin() {
  /** Qual painel está aberto: o de conectar, o de um agente, ou nenhum. */
  const [open, setOpen] = useState<{ kind: "connect" } | { kind: "agent"; id: string } | null>(
    null,
  );
  const [custom, setCustom] = useState(false);

  const configs = useAgentConfigs();

  // Toda configuração listada é de conversa (`033` F1.1): a aposentada, que rodava
  // num terminal, o daemon nem devolve.
  const agents = configs.data ?? [];

  const chosen = open?.kind === "agent" ? agents.find((row) => row.id === open.id) : undefined;
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      {custom && (
        <div className="setup" role="group" aria-label="outro agente ACP">
          <div className="setup__head">
            <span className="setup__t">Outro agente ACP</span>
            <button
              type="button"
              className="setup__x"
              aria-label="fechar"
              onClick={() => setCustom(false)}
            >
              ✕
            </button>
          </div>
          {/*
            Os cinco campos não desapareceram — viraram uma gaveta que ninguém
            precisa abrir para começar. Este é o caminho que ainda precisa deles:
            um adaptador que o daemon não instala e não sabe nomear.
          */}
          <AgentConfigDialog embedded onClose={() => setCustom(false)} />
        </div>
      )}

      {!custom && open?.kind === "connect" && (
        <ConnectPanel
          configured={agents.map((row) => row.command)}
          onClose={close}
          onCustom={() => {
            setCustom(true);
            setOpen(null);
          }}
          onConnected={(id) => setOpen({ kind: "agent", id })}
        />
      )}

      {!custom && chosen !== undefined && (
        <AgentPanel config={chosen} onClose={close} onCustom={() => setCustom(true)} />
      )}

      <div className="foot-head">
        <span className="foot-head__label">Agentes</span>
        {/*
          O `＋` é o único caminho para o **próximo** agente, e é o único sempre
          visível: com zero agentes não há linha onde passar o ponteiro, e um botão
          que só aparece no hover, num estado em que não existe nada para apontar,
          é uma saída que não existe (`sidebar-actions`, Q1).
        */}
        <button
          type="button"
          className="act"
          title="conectar um agente"
          aria-label="conectar um agente"
          onClick={() => setOpen({ kind: "connect" })}
        >
          ＋
        </button>
      </div>

      {agents.length === 0 ? (
        <span className="foot-empty">nenhum agente conectado</span>
      ) : (
        agents.map((config) => (
          <AgentRow
            key={config.id}
            config={config}
            open={open?.kind === "agent" && open.id === config.id}
            onOpen={() => setOpen({ kind: "agent", id: config.id })}
          />
        ))
      )}

      {/*
        As credenciais dos serviços, no mesmo rodapé (ADR de 2026-09-13).

        Aqui e não numa tela de configuração porque é a **mesma natureza** do
        bloco de cima: o que é da máquina. O cofre mora no `~/.lumem`, que é um
        por instalação — pôr a chave dentro da tela de um workspace prometeria
        que existe outra no workspace seguinte.
      */}
      <Credentials />
    </>
  );
}
