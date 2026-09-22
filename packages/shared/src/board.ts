/**
 * O quadro e o selo, do lado que atravessa a rede (`032` T9).
 *
 * As datas chegam como `string`: é o que o tRPC entrega sem `transformer`, e é
 * a fronteira que este arquivo descreve — a serializada, não a do banco. O
 * servidor produz este tipo explicitamente (`packages/server/src/tasks/board.ts`,
 * `toWireCard`); um campo novo aqui sem o servidor preencher **derruba o
 * typecheck do servidor**, e não o do web em silêncio.
 */

/**
 * As sete etapas do §4 da `028-autonomous-orchestration`, em ordem de leitura.
 *
 * `proposed` e `dropped` não estão aqui de propósito: o primeiro mora na fila
 * de Propostas da `022`, e o segundo sai do quadro e vira arquivo.
 */
export const BOARD_COLUMNS = [
  "backlog",
  "open",
  "in_progress",
  "review",
  "testing",
  "ready_to_merge",
  "done",
] as const;

export type BoardStatus = (typeof BOARD_COLUMNS)[number];

/** O papel de cada coluna — só as três etapas da máquina têm um. */
export type SealRole = "implementador" | "revisor" | "testador";

/**
 * O selo do cartão, derivado e nunca guardado (`028` §4.1).
 *
 * Cinco estados: `manual` é o default do produto (esteira desligada ou etapa
 * sem papel), `waiting`/`working` são a esteira ligada, `blocked` é uma decisão
 * registrada, `paused` é cota — e essa distinção é a razão de existir.
 */
export type Seal =
  | { kind: "manual" }
  | { kind: "waiting"; role: SealRole }
  | { kind: "working"; role: SealRole | null; since: string }
  | { kind: "blocked"; reason: string }
  | { kind: "paused"; until: string };

export interface BoardCard {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  /** `null` até alguém cortar o checkout — o estado mais comum na To-Do. */
  worktreeId: string | null;
  worktreeName: string | null;
  branch: string | null;
  /** Onde ele está na coluna. A posição **é** a prioridade. */
  position: number;
  /** Desde quando ele está nesta coluna. O sinal de encalhe. */
  statusChangedAt: string;
  /** Custo **até aqui**, sem janela: uma tarefa velha não ficou mais barata. */
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
  createdBy: string;
  links: string[];
  seal: Seal;
  /** Quantas vezes a esteira já tentou **nesta etapa**. `0` é o caso comum. */
  attempts: number;
  /** `off` quando você assumiu o volante — a tela diz isso, e a fila obedece. */
  autonomy: string;
  /** O prompt que o `assistido` montou e não enviou, ou `null`. */
  preparedPrompt: string | null;
  /**
   * Está na fila **além das vagas** (`028` Parte 4, T34 · Q54).
   *
   * Quem espera vaga **não encalha**: esperar vaga é desenho, e cobrar o que é
   * desenho é a forma mais rápida de tornar o aviso invisível (§8). É a mesma
   * família do `pausada`.
   *
   * Derivado, e sem coluna nenhuma: é a posição do cartão na fila comparada com
   * as vagas livres. Guardar *"quanto tempo esperou"* seria um contador que o
   * daemon reescreve de 15 em 15 segundos para cada cartão devido.
   */
  queuedBeyondSlots: boolean;
  /**
   * A frase a avisar, ou `null` — e `null` é o caso comum (`028` Parte 4, T35).
   *
   * **Vem pronta do daemon**, e é ele quem sabe se você já foi avisado: a aba só
   * conhece o que está na tela dela agora, e duas abas abertas avisariam duas
   * vezes. A aba notifica e responde *"mostrei"*; quem decide é o outro lado.
   */
  notice: string | null;
}

export interface BoardColumn {
  status: BoardStatus;
  cards: BoardCard[];
}
