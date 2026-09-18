import { useQuery } from "@tanstack/react-query";

import { needsYou, type BoardColumn } from "../lib/board.js";
import { boardKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Glyph, Row } from "../ui/index.js";

/**
 * O bloco de navegação da sidebar (`029-sidebar-nav`, F1.1).
 *
 * Duas telas do produto só existiam **enquanto nada estava selecionado**: a tela
 * do workspace, e o quadro atrás de um botão dentro dela. Clicar em qualquer
 * linha da árvore as substituía, e o caminho de volta era o primeiro segmento de
 * um breadcrumb de 30px que ninguém lê como navegação.
 *
 * **As linhas são `<Row>`, o componente da árvore, e isso é o requisito e não um
 * atalho** (F1.2). A coluna só pode ter uma resposta para *onde eu estou*: com a
 * mesma classe, `row--selected` é a mesma barra de 2px, e selecionar uma
 * worktree apaga o `Home` sem ninguém precisar coordenar nada. Um componente
 * próprio seria uma segunda definição da mesma coisa, livre para divergir.
 *
 * **A terceira linha é de 2026-09-17** (`030-settings`, F4), e ela custou uma
 * pergunta respondida contra a proposta: a entrada de `/settings` ia para o
 * rodapé da sidebar, que é onde o que é *da máquina* mora. Perdeu por dois
 * motivos — o `aria-label` deste bloco era **descrição**, e não regra (escrito
 * quando as duas telas que existiam eram do workspace), e o rodapé está prestes
 * a ser **removido** pelas LUM-57 e LUM-58. Construir a porta dentro da sala em
 * demolição era o outro caminho.
 */

/** Quem está selecionado na coluna — e é um só, na coluna inteira. */
export type SidebarPlace = "home" | "board" | "settings" | "scope";

export interface SidebarNavProps {
  workspaceId: string;
  /** Onde a tela está. `scope` é um checkout ou projeto aberto: nenhuma acende. */
  place: SidebarPlace;
  onHome: () => void;
  onBoard: () => void;
  onSettings: () => void;
}

export function SidebarNav({ workspaceId, place, onHome, onBoard, onSettings }: SidebarNavProps) {
  /*
   * A **mesma** chave do quadro, e por isso a **mesma** requisição.
   *
   * Não é uma leitura a mais quando o quadro está aberto — é a dele, em cache —,
   * e a invalidação por `task.changed` que o quadro já tem vale para as duas. O
   * custo honesto é o outro lado: a sidebar passa a pagar essa leitura mesmo de
   * quem nunca abre o quadro. É uma consulta por workspace, sobre a tabela que a
   * tela de tarefas já lê.
   *
   * E o número é derivado aqui com a **mesma função** que a barra do quadro usa.
   * Uma procedure `task.needsMe` seria uma segunda fonte para o mesmo número, e
   * duas fontes é o que divergem.
   */
  const board = useQuery({
    queryKey: boardKey(workspaceId, null),
    queryFn: () => trpc.task.board.query({ workspaceId }) as Promise<BoardColumn[]>,
  });

  const now = Date.now();
  const needsMe = (board.data ?? []).reduce(
    (total, column) =>
      total + column.cards.filter((card) => needsYou(card, column.status, now)).length,
    0,
  );

  return (
    /*
     * `Telas`, e não mais `Telas do workspace`: duas das três são do workspace e
     * `Configurações` não é — ela mistura workspace, máquina, repositório e
     * navegador. O rótulo antigo era verdadeiro quando foi escrito, e deixou de
     * ser; descrição que envelheceu se reescreve.
     */
    <nav className="nav" aria-label="Telas">
      <Row
        depth={0}
        label="Home"
        glyph={<Glyph>◎</Glyph>}
        selected={place === "home"}
        onSelect={onHome}
      />
      <Row
        depth={0}
        label="Tarefas"
        glyph={<Glyph>▥</Glyph>}
        selected={place === "board"}
        onSelect={onBoard}
        /*
         * No `meta` e não no `count` do `<Row>`: aquele conta sessões vivas e é
         * o único verde da coluna. Some no zero, pela regra do quadro.
         */
        meta={
          needsMe === 0 ? undefined : (
            <span className="row__n">
              {needsMe}
              {/*
                `esperando você`, e **não** `precisa de você`: essa frase já é do
                grupo de checks da barra de PR, e um `getByText` sem âncora passa
                a achar as duas. Texto de leitor de tela é texto — ele não está
                na tela, mas está no `textContent`, e é por ele que metade da
                suíte procura as coisas.
              */}
              <span className="sr-only">
                {needsMe === 1 ? " tarefa esperando você" : " tarefas esperando você"}
              </span>
            </span>
          )
        }
      />
      {/*
        Sem número, e isso é decisão e não falta de dado (Q6a): um agente sem
        login **não** acende sinal aqui. O rodapé mostrava uma linha por agente —
        73px com um, 105px com dois, +28px cada — e isso não escala; dar rolagem
        ao bloco o faria ocupar espaço e parar de cumprir a função. O lugar do
        "alguma coisa caiu" é uma superfície que agrega, e ela não existe ainda:
        está no backlog, como notificações.
      */}
      <Row
        depth={0}
        label="Configurações"
        glyph={<Glyph>⚙</Glyph>}
        selected={place === "settings"}
        onSelect={onSettings}
      />
    </nav>
  );
}
