/**
 * A única versão do contrato da casca que este app entende (`038`, porta 4).
 *
 * Escrita aqui, e não importada do `PROTOCOL_VERSION` do `shared`: aquela é a versão que
 * o **daemon** responde, e sobe quando o daemon muda de forma. Esta é o que o **app**
 * sabe ler, e só sobe quando alguém ensinar o app — os dois números discordarem é
 * exatamente o que o ícone precisa notar.
 */
export const SUPPORTED_PROTOCOL = 1;

/** O que a última rodada de perguntas ao daemon achou. */
export interface Snapshot {
  /** `false`: o `/trpc/health` não respondeu um Lumem. */
  reachable: boolean;
  version: string | null;
  protocolVersion: number | null;
  attention: boolean;
  updateAvailable: boolean;
}

export type TrayState = "stopped" | "attention" | "update" | "running";

/** O app e o daemon falam a mesma forma? Só faz sentido com o daemon respondendo. */
export function isCompatible(snapshot: Snapshot): boolean {
  return snapshot.protocolVersion === SUPPORTED_PROTOCOL;
}

/**
 * A imagem do ícone (`038`, AC 60): a **primeira** linha que casa vence.
 *
 * | # | quando | estado |
 * | --- | --- | --- |
 * | 1 | `health` sem resposta | `stopped` |
 * | 2 | `attention`, ou protocolo que o app não conhece | `attention` |
 * | 3 | versão nova | `update` |
 * | 4 | nada | `running` |
 *
 * A ordem é o conteúdo: um daemon parado não tem versão nova para oferecer, e um
 * protocolo estranho vale mais que uma atualização — porque atualizar é o que o
 * conserta, e é o `attention` que diz a quem olhar que algo pede um gesto.
 */
export function trayState(snapshot: Snapshot): TrayState {
  if (!snapshot.reachable) return "stopped";
  if (snapshot.attention || !isCompatible(snapshot)) return "attention";
  if (snapshot.updateAvailable) return "update";
  return "running";
}
