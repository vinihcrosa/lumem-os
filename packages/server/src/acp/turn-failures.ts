import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * O retrato de um turno que falhou, em disco (`028` Q46).
 *
 * A Q46 foi respondida **como instrumento**: o daemon não sabe reconhecer uma
 * recusa por cota — o protocolo não tem código para isso —, então em vez de
 * adivinhar a forma do erro ele a **guarda quando ela acontecer**, com o último
 * relato de cota junto para a amostra ter rótulo.
 *
 * O que ela não tinha era **onde**. O retrato saía pelo logger do Fastify, que
 * não tem destino em arquivo, e o binário `lumem` não redireciona: ia tudo para
 * `stdout`. Isso anula o propósito — a cota fecha durante trabalho autônomo, que
 * é exatamente quando ninguém está olhando o terminal.
 *
 * **Este arquivo é o conserto pontual, e só ele.** Mandar o log inteiro do
 * daemon para disco é outra conversa — pede destino, rotação, tamanho, e uma
 * decisão sobre o que **não** pode ir para lá, porque o log atravessa caminho de
 * arquivo e prompt. Está no backlog, com o nome.
 */

/** Onde o retrato mora, sob o `stateDir`. Dentro do `_system`, que o git ignora. */
export const TURN_FAILURES_FILE = join("_system", "turn-failures.jsonl");

/**
 * Uma linha por falha, ou nada.
 *
 * Devolve uma função em vez de uma classe porque é isso que o `AcpManager`
 * precisa saber a respeito: ele é o único arquivo que entende ACP, e não tem por
 * que aprender onde fica o `~/.lumem`. Quem constrói o manager sabe as duas
 * coisas — a mesma direção de dependência do `preamble` e do `budget`.
 */
export type TurnFailureSink = (record: Record<string, unknown>) => void;

/**
 * O sink de produção: JSONL sob `<stateDir>/_system/turn-failures.jsonl`.
 *
 * **Síncrono, e de propósito.** O caminho é o de um turno que já morreu — uma
 * linha de I/O contra uma falha que vai virar mensagem na tela de qualquer jeito
 * —, e escrever assim dá ordem entre chamadas sem fila nenhuma. Uma escrita
 * assíncrona aqui pediria uma fila para não intercalar duas falhas, e fila é mais
 * código que o problema.
 *
 * **E nunca lança.** A falha do turno já sobe para quem chamou; uma linha de
 * observabilidade que derruba o turno que ela veio observar é remédio pior que a
 * doença. Quando o disco recusa, o que sobra é o `log.warn`, que continua saindo.
 *
 * Sem rotação, e isso é uma escolha anotada: uma linha por `session/prompt`
 * **recusado**, que é um evento raro por construção — as 3 tentativas da
 * [Q32](../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * são três linhas, não três mil. O dia em que isso deixar de ser verdade é o
 * mesmo em que o item de log do backlog volta, e ele decide os dois juntos.
 */
export function createTurnFailureSink({
  stateDir,
  onError,
}: {
  stateDir: string;
  onError?: (error: unknown) => void;
}): TurnFailureSink {
  const path = join(stateDir, TURN_FAILURES_FILE);

  return (record) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    } catch (error) {
      onError?.(error);
    }
  };
}
