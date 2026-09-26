import { useAgentProbe } from "./queries.js";
import { Glyph } from "../../ui/index.js";

/** O que uma linha do rodapé precisa saber sobre a configuração dela. */
export interface AgentConfigView {
  id: string;
  name: string;
  command: string;
  args: readonly string[];
  adapterVersion: string | null;
}

type AgentProbe = ReturnType<typeof useAgentProbe>;

/** Verde passa, âmbar espera, vermelho não vai — a escala de três da barra da PR. */
function stateOf(probe: AgentProbe): { tone: "on" | "off" | "warn" | "err"; word: string } {
  if (probe.isPending) return { tone: "off", word: "verificando" };
  if (probe.isError) return { tone: "err", word: "falhou" };
  // Instalado e sem credencial não é `nenhum` nem `falhou`: é uma pendência com
  // saída, e a saída é clicar na linha. O rótulo é um **verbo** por isso.
  if (probe.data?.authRequired === true) return { tone: "warn", word: "entrar" };
  return { tone: "on", word: "conectado" };
}

/** Uma linha do rodapé: o estado de um agente, e o clique que abre o painel dele. */
export function AgentRow({
  config,
  open,
  onOpen,
}: {
  config: AgentConfigView;
  open: boolean;
  onOpen: () => void;
}) {
  const probe = useAgentProbe(config);
  const { tone, word } = stateOf(probe);

  return (
    <button
      type="button"
      className={`foot-row foot-row--${tone}${open ? " is-open" : ""}`}
      aria-label={`${config.name}: ${word}`}
      onClick={onOpen}
    >
      <Glyph tone="agent">◆</Glyph>
      <span className="foot-row__label">{config.name}</span>
      {/*
        O ponto tem a cor do estado. Ele nascia cinza nos três — herda a cor da
        linha, e a cor do estado vive na palavra ao lado. Com uma linha a palavra
        bastava; com duas, o ponto é o que o olho varre primeiro.
      */}
      <span className="pip" />
      <span className="foot-row__st">{word}</span>
    </button>
  );
}
