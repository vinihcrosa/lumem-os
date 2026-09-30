import { Actions } from "./Actions.js";
import { Headline } from "./Headline.js";
import { ResourcesBlock } from "./ResourcesBlock.js";
import { TurnList } from "./TurnList.js";
import { useNow } from "./useNow.js";
import { VersionLine } from "./VersionLine.js";

export interface MenubarScreenProps {
  /** Só um teste passa: a hora de agora, para o texto de *"há 5 min"* não depender de quando rodou. */
  now?: number;
}

/**
 * O painel do ícone da barra, em `/menubar` (`038`, Parte 3).
 *
 * Uma página como qualquer outra: o app de desktop a carrega numa janela sem moldura, e
 * uma aba comum a abre igual — é isso que a torna testável sem Electron. A ordem é a do
 * AC 48: o consumo, os turnos em voo, os recursos, a versão e as ações. Cada bloco lê o
 * que é dele e falha sozinho.
 */
export function MenubarScreen({ now }: MenubarScreenProps) {
  const ticking = useNow();
  const at = now ?? ticking;

  return (
    <main className="menubar" aria-label="Painel do Lumem">
      <Headline now={at} />
      <TurnList now={at} />
      <ResourcesBlock />
      <VersionLine now={at} />
      <Actions />
    </main>
  );
}
