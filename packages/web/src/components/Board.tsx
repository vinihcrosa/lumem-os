import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  COLUMN_LABEL,
  needsYou,
  RAIL_BY_DEFAULT,
  staleCount,
  YOURS,
  type BoardColumn,
  type BoardStatus,
} from "../lib/board.js";
import { trpc } from "../lib/trpc.js";
import { useBoardNotices } from "../hooks/notice.js";
import { TaskCard } from "./TaskCard.js";

/**
 * O quadro (`028-autonomous-orchestration` F1, T8–T11).
 *
 * **Uma chamada serve a tela inteira**, e é o daemon que agrupa: sete colunas
 * sempre, mesmo vazias. Coluna vazia é uma resposta — um quadro que esconde a
 * etapa sem cartão obriga a pessoa a lembrar quantas etapas existem.
 */

/**
 * Onde as sete colunas param de caber, medido no navegador.
 *
 * Busca binária estreitando a janela até o primeiro pixel de rolagem, não
 * aritmética — que erra por borda e por arredondamento de `flex`. A coluna tem
 * **piso de 200px** (abaixo disso o título vira três linhas) e a sidebar são
 * 264 fixos.
 *
 * **Este é o primeiro requisito de largura mínima do produto**, e ele existe
 * porque o quadro é a primeira tela que precisa mostrar sete coisas ao mesmo
 * tempo.
 */
export const FITS_FIVE_AND_TWO_RAILS = 1418;

/** O piso medido da coluna. Abaixo dele o título vira três linhas. */
export const COLUMN_FLOOR = 200;

/**
 * Quantas colunas ficaram fora — a partir do que **transbordou**, não da janela.
 *
 * A medida do desenho é de janela (1418px), mas a janela não é o que decide:
 * a sidebar recolhe, o painel direito abre, e nos dois casos o quadro muda de
 * largura com `innerWidth` parado. Perguntar à faixa de colunas quanto ela
 * transbordou é derivar da própria coisa — o mesmo raciocínio do selo e do
 * relógio de encalhe.
 */
export function columnsOutside(scrollWidth: number, clientWidth: number): number {
  const overflow = scrollWidth - clientWidth;
  if (overflow <= 0) return 0;
  return Math.max(1, Math.ceil(overflow / COLUMN_FLOOR));
}

export interface BoardProps {
  workspaceId: string;
  projectId?: string;
  onOpen: (taskId: string) => void;
  /** Injetado pelo teste, para o relógio de encalhe não depender da hora. */
  now?: number;
}

export function Board({ workspaceId, projectId, onOpen, now = Date.now() }: BoardProps) {
  const [rails, setRails] = useState<readonly BoardStatus[]>(RAIL_BY_DEFAULT);
  const [onlyMine, setOnlyMine] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  /** O que a limpeza não conseguiu fazer, em uma frase. `null` quase sempre. */
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const { ref: colsRef, clipped } = useOverflow();
  const queryClient = useQueryClient();

  const key = ["task", "board", workspaceId, projectId ?? null];
  const board = useQuery({
    queryKey: key,
    queryFn: () =>
      trpc.task.board.query({
        workspaceId,
        ...(projectId === undefined ? {} : { projectId }),
      }) as Promise<BoardColumn[]>,
  });

  useBoardNotices(board.data);

  const columns = (board.data ?? []).map((column) => ({
    ...column,
    cards: onlyMine
      ? column.cards.filter((card) => needsYou(card, column.status, now))
      : column.cards,
  }));

  /*
   * Quantos ainda não foram avisados. O `notice` vem `null` assim que o daemon
   * registra, então este número **se apaga sozinho** conforme a aba avisa.
   */
  const unseen = (board.data ?? []).reduce(
    (total, column) => total + column.cards.filter((card) => card.notice !== null).length,
    0,
  );

  const mine = (board.data ?? []).reduce(
    (total, column) =>
      total + column.cards.filter((card) => needsYou(card, column.status, now)).length,
    0,
  );

  /*
   * O arrasto (§4.3), e ele **não** é otimista.
   *
   * Quem renumera a coluna é o daemon, numa transação — então pintar a ordem
   * localmente antes da resposta seria desenhar um palpite sobre a única coisa
   * desta tela que tem dono. O cartão anda quando a leitura volta.
   */
  const move = useMutation({
    mutationFn: (target: { id: string; status: BoardStatus; index: number }) =>
      trpc.task.move.mutate(target),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  /*
   * O clique do `assistido` (Q51).
   *
   * Também **não** é otimista, e pelo mesmo motivo do arrasto: quem abre o
   * adaptador é o daemon, e pintar *"enviado"* antes da resposta seria desenhar
   * um palpite sobre a única coisa desta tela que custa dinheiro.
   */
  /** **Parar** (Q57). Não é otimista, pelo mesmo motivo do arrasto. */
  const stop = useMutation({
    mutationFn: (taskId: string) => trpc.task.stop.mutate({ id: taskId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const send = useMutation({
    mutationFn: (taskId: string) => trpc.task.sendPrepared.mutate({ id: taskId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  /**
   * **Assumir o volante** (UC7, T39 · [Q59]).
   *
   * Abrir um cartão que a esteira está tocando **agora** é assumir; abrir
   * qualquer outro é ler. O que separa os dois é o selo — derivado do turno em
   * voo, e já na resposta do quadro —, e a distinção não é zelo: sem ela, olhar
   * três cartões desligaria a autonomia dos três **em silêncio**, e o produto
   * ficaria sem esteira com o motivo em lugar nenhum.
   *
   * **E não interrompe.** É a diferença para o `parar`: o UC7 diz *"você
   * interrompe, escreve … e continua na mão"* — você, na conversa, quando
   * quiser. Matar o turno ao abrir jogaria fora o trabalho pago que você foi
   * olhar.
   */
  const takeOver = useMutation({
    mutationFn: (taskId: string) =>
      trpc.task.setAutonomy.mutate({ id: taskId, autonomy: "off" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  function open(taskId: string) {
    const card = (board.data ?? [])
      .flatMap((column) => column.cards)
      .find((one) => one.id === taskId);
    if (card?.seal.kind === "working" && card.autonomy !== "off") takeOver.mutate(taskId);
    onOpen(taskId);
  }

  /**
   * O `Done` que limpa (T40 · Q27).
   *
   * Mover para `done` passa por uma porta própria porque ele faz **duas** coisas
   * — anda a tarefa e mexe no disco —, e a segunda pode não acontecer. A
   * resposta diz o que houve com o checkout, e é a tela que conta: o daemon não
   * pergunta nada, que é o que impede o diálogo de virar o que a Q27 recusou.
   */
  const finish = useMutation({
    mutationFn: (taskId: string) => trpc.task.finish.mutate({ id: taskId }),
    onSuccess: (result: { cleanup: { kind: string; reason?: string } }) => {
      setCleanupNote(result.cleanup.kind === "keep" ? (result.cleanup.reason ?? null) : null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  function drop(status: BoardStatus, index: number) {
    if (dragging === null) return;
    /*
     * `done` não é um `move` como os outros: ele limpa. Mandar pelo caminho
     * comum deixaria a worktree para trás em silêncio, e o produto acumularia
     * checkout de tarefa acabada até alguém notar.
     *
     * A posição dentro da coluna `done` é perdida no caminho, e tudo bem: ela é
     * a coluna que o §4.4 diz não ser gerenciamento de projeto.
     */
    if (status === "done") {
      finish.mutate(dragging);
      setDragging(null);
      return;
    }
    move.mutate({ id: dragging, status, index });
    setDragging(null);
  }

  return (
    <main className="bd">
      <div className="bd__head">
        <div className="bd__title">
          <h2 className="bd__t">Quadro</h2>
          <span className="bd__sub">
            todas as tarefas deste workspace, em uma tela
          </span>
        </div>
      </div>

      <div className="bd__bar">
        <button
          type="button"
          className="needme focus-ring"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine((on) => !on)}
        >
          precisa de mim
          {/*
            A contagem em `danger` é a única coisa vermelha da barra — e se ela
            for zero, ela some: um zero vermelho ensina a ignorar o vermelho.
          */}
          {mine === 0 ? null : <span className="needme__n">{mine}</span>}
        </button>
        {/*
          O que parou enquanto você não estava (`028` Parte 4, T37 · Q56).

          **Some quando você olha**, e é a única condição que importa: ela não é
          modal, não tem `✕` e não guarda preferência. A frase existe porque a
          notificação é da aba, e uma aba fechada é metade dos casos que a Parte
          4 quer cobrir — o §8 aceita a máquina desligada *"desde que o quadro
          diga o que ficou parado"*, e este é o quadro dizendo.

          O contador é o **mesmo** dado da notificação: cartões que o daemon
          ainda não registrou como avisados. Dois lugares contando coisas
          diferentes seriam dois lugares divergindo.
        */}
        {cleanupNote === null ? null : (
          /*
            A recusa da limpeza, dita **onde o gesto aconteceu** e sem diálogo.
            A Q27 recusou o modal que aparece sempre; este texto aparece só
            quando algo ficou para trás, e diz o quê — que é a parte que faz
            alguém agir em vez de fechar.
          */
          <span className="bd__unseen">a worktree ficou: {cleanupNote}</span>
        )}
        {unseen === 0 ? null : (
          <span className="bd__unseen">
            {unseen === 1
              ? "1 parou enquanto você não estava"
              : `${String(unseen)} pararam enquanto você não estava`}
          </span>
        )}
      </div>

      {clipped === 0 ? null : (
        <div className="bd__clip">
          <span className="bd__clip-g">⟷</span>
          <span>
            <b>
              {clipped === 1 ? "1 coluna fora da tela." : `${String(clipped)} colunas fora da tela.`}
            </b>{" "}
            O quadro pede {String(FITS_FIVE_AND_TWO_RAILS)}px de janela com as duas pontas
            recolhidas — role para o lado, ou alargue.
          </span>
          <span className="bd__clip__which">{COLUMN_LABEL.ready_to_merge}</span>
        </div>
      )}

      <div className="bd__cols" ref={colsRef}>
        {columns.map((column) =>
          rails.includes(column.status) ? (
            <button
              key={column.status}
              type="button"
              className="col col--rail focus-ring"
              aria-expanded={false}
              onClick={() => setRails((open) => open.filter((one) => one !== column.status))}
            >
              <div className="col__h">
                <span className="col__t">{COLUMN_LABEL[column.status]}</span>
                <span className="col__n">{column.cards.length}</span>
              </div>
            </button>
          ) : (
            <section key={column.status} className="col" aria-label={COLUMN_LABEL[column.status]}>
              <ColumnHead column={column} now={now} onCollapse={() => setRails((open) => [...open, column.status])} />
              <div
                className="col__body"
                // Soltar no corpo da coluna, e não sobre um cartão, é soltar no
                // fim — e o daemon encosta no fim em vez de abrir buraco.
                onDragOver={(event) => {
                  if (dragging !== null) event.preventDefault();
                }}
                onDrop={() => drop(column.status, column.cards.length)}
              >
                {column.cards.length === 0 ? (
                  <div className="col__empty">vazia</div>
                ) : (
                  column.cards.map((card, index) => (
                    <div
                      key={card.id}
                      onDragOver={(event) => {
                        if (dragging !== null) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        drop(column.status, index);
                      }}
                    >
                      <TaskCard
                        card={card}
                        status={column.status}
                        now={now}
                        onOpen={open}
                        ghost={dragging === card.id}
                        onDragStart={() => setDragging(card.id)}
                        onDragEnd={() => setDragging(null)}
                        onSend={(taskId) => send.mutate(taskId)}
                        onStop={(taskId) => stop.mutate(taskId)}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>
          ),
        )}
      </div>
    </main>
  );
}

function ColumnHead({
  column,
  now,
  onCollapse,
}: {
  column: BoardColumn;
  now: number;
  onCollapse: () => void;
}) {
  const stale = staleCount(column, now);
  const level = stale.over > 0 ? "over" : stale.warn > 0 ? "warn" : null;
  const stalled = stale.over + stale.warn;

  return (
    <div className="col__h">
      <span className="col__t">{COLUMN_LABEL[column.status]}</span>
      <span className="col__n">{column.cards.length}</span>
      {/*
        "sua vez" é a única diferença desenhada entre coluna da máquina e coluna
        sua, e ela é LÍNGUA, não cor: pintá-las gastaria o eixo de cor que o
        selo já usa.
      */}
      {YOURS.includes(column.status) && column.status !== "done" ? (
        <span className="col__you">sua vez</span>
      ) : null}
      {level === null ? (
        RAIL_BY_DEFAULT.includes(column.status) ? (
          <button type="button" className="col__add focus-ring" onClick={onCollapse} aria-label={`Recolher ${COLUMN_LABEL[column.status]}`}>
            ‹
          </button>
        ) : null
      ) : (
        /*
          O ponto de encalhe. É o que faz uma coluna travada ser achada do outro
          lado da sala — a defesa que o §8 deve ao selo, por ele se ver menos
          que uma sub-coluna.
        */
        <span
          className={`col__stale col__stale--${level}`}
          title={stalled === 1 ? "1 tarefa encalhada" : `${String(stalled)} tarefas encalhadas`}
        />
      )}
    </div>
  );
}

/**
 * Quanto a faixa de colunas transbordou, e um observador que a segue.
 *
 * `ResizeObserver` no próprio elemento, e não `resize` da janela: o quadro
 * encolhe quando o painel direito abre, e aí a janela não muda de tamanho
 * nenhum. Um aviso que depende da janela ficaria calado justo no caso em que a
 * coluna sumiu por causa de outra coisa que você abriu.
 *
 * **E a medida repete a cada pintura**, o que não é zelo — é defeito medido. O
 * observador vê a *caixa* da faixa, e na primeira pintura ela está vazia: a
 * consulta ainda não voltou, não há coluna nenhuma, e portanto não há
 * transbordo. Quando os cartões chegam, quem muda é o **conteúdo** — a caixa
 * fica do mesmo tamanho, o observador não dispara, e a faixa nunca aparece.
 * Foi exatamente o que aconteceu no navegador: 836px de espaço para 1152 de
 * colunas, e nenhum aviso.
 */
function useOverflow(): { ref: (node: HTMLDivElement | null) => void; clipped: number } {
  const [clipped, setClipped] = useState(0);
  const node = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const element = node.current;
    if (element === null) return;
    // `setState` com o mesmo valor não repinta, então medir a cada pintura
    // converge em vez de girar.
    setClipped(columnsOutside(element.scrollWidth, element.clientWidth));
  }, []);

  // A cada pintura: cobre a chegada dos cartões e o painel direito abrindo,
  // que são mudanças de conteúdo e de layout que o React já causa.
  useLayoutEffect(measure);

  /*
   * E o `resize` da janela, que é o **único** caminho que não passa pelo React.
   *
   * `ResizeObserver` seria o instrumento certo e não basta sozinho: medido
   * nesta máquina, ele não entregou uma única notificação ao encolher nem ao
   * alargar o quadro, e a faixa ficava acesa com `scrollWidth === clientWidth`
   * — dizendo que duas colunas estavam fora quando não estava nenhuma. Um
   * aviso que não some é a mesma doença de um aviso que não aparece.
   */
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  const ref = useCallback(
    (next: HTMLDivElement | null) => {
      node.current = next;
    },
    [],
  );

  return { ref, clipped };
}
