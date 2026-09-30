import { useVersionReload } from "../../hooks/useVersionReload.js";
import { useUpdateStatus } from "../update/index.js";
import { Actions } from "./Actions.js";
import { Headline } from "./Headline.js";
import { ResourcesBlock } from "./ResourcesBlock.js";
import { TurnList } from "./TurnList.js";
import { useNow } from "./useNow.js";
import { VersionLine } from "./VersionLine.js";

export interface MenubarScreenProps {
  /** Só um teste passa: a hora de agora, para o texto de *"há 5 min"* não depender de quando rodou. */
  now?: number;
  /** Só um teste passa: o jsdom não recarrega nada. */
  reload?: () => void;
}

/**
 * O painel do ícone da barra, em `/menubar` (`038`, Parte 3).
 *
 * Uma página como qualquer outra: o app de desktop a carrega numa janela sem moldura, e
 * uma aba comum a abre igual — é isso que a torna testável sem Electron. A ordem é a do
 * AC 48: o consumo, os turnos em voo, os recursos, a versão e as ações. Cada bloco lê o
 * que é dele e falha sozinho.
 */
export function MenubarScreen({ now, reload }: MenubarScreenProps) {
  const ticking = useNow();
  const at = now ?? ticking;
  // O app **esconde** o painel em vez de fechá-lo, então ele fica aberto por dias — e uma
  // atualização do daemon o deixaria com o bundle velho. A mesma regra do resto da web
  // (AC 34): a versão que o daemon responde diferente da do bundle recarrega, uma vez. A
  // versão vem do `updateStatus` que o painel já pergunta (`current` é o `LUMEM_VERSION` do
  // daemon, o mesmo que o `health` responde): o painel não abre uma pergunta a mais.
  const status = useUpdateStatus();
  useVersionReload({ served: status.data?.current, reload });

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
