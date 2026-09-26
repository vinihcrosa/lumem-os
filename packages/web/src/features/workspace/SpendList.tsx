import { Fragment, useState } from "react";

import { formatTokens } from "../conversation/index.js";
import { Glyph } from "../../ui/index.js";

/**
 * Quem gastou o quê, numa janela de tempo (`workspace-screen`, W4).
 *
 * Um componente para os dois escopos — projeto no workspace, worktree no projeto —
 * porque a pergunta é a mesma e quem aprendeu a ler uma lê a outra. A ordem é a do
 * gasto, porque a primeira pergunta de quem abre isto é *"onde foi meu dinheiro"*.
 *
 * **A barra é comparação, não medida.** Ela não tem eixo e não tem número em cima:
 * existe para a diferença entre 1,4M e 402k ser **vista** antes de ser lida. Quem
 * quer o número lê a coluna, em mono e alinhada à direita, porque essas colunas
 * existem para ser comparadas verticalmente.
 *
 * **A linha abre por agente quando há mais de um** (`second-agent`, F5 e C5). Não
 * é uma coluna por agente — "uma por agente" é um número que o produto não
 * controla —, nem uma barra segmentada, que pediria uma escala categórica de cor
 * que o `tokens.css` não tem. É a mesma linha, um nível abaixo, com a barra
 * medindo a fração **dentro** do escopo. Com um agente nada disso existe.
 */

export interface SpendRow {
  id: string;
  name: string;
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
  /** `project`, `worktree` — decide o glifo e a cor dele. */
  kind: "project" | "worktree";
  /** A linha que fecha a conta: o que rodou fora de qualquer worktree. */
  outside?: boolean;
  /**
   * Quanto deste escopo foi de cada agente (`second-agent`, F5 e C5).
   *
   * Ausente quando há **um** agente: a comparação só aparece quando há o que
   * comparar, e nesse caso a lista é a de antes desta feature, sem `▸` e sem
   * sub-linha. A soma destas fecha com o `tokens` da linha, porque as duas
   * respostas vêm da mesma janela e da mesma tabela.
   */
  agents?: readonly SpendAgent[];
}

/** Um agente dentro de um escopo. `name` nulo é turno sem agente, não zero. */
export interface SpendAgent {
  id: string;
  name: string | null;
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
  /**
   * Quanto deste agente foi de cada conta (`034` T16). Ausente com uma conta só —
   * aí o agente já é a conta —, e presente só com duas ou mais com consumo.
   */
  accounts?: readonly SpendAccount[];
}

/** Uma conta dentro de um agente. `label` nulo é consumo sem conta, ou de conta apagada. */
export interface SpendAccount {
  id: string;
  label: string | null;
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
}

export interface SpendListProps {
  rows: readonly SpendRow[];
}

export function SpendList({ rows }: SpendListProps) {
  // O maior define a escala. Zero em tudo não desenha barra nenhuma, em vez de
  // desenhar todas cheias — o que uma divisão por zero faria.
  const top = Math.max(...rows.map((row) => row.tokens), 0);
  /*
   * A lista abre quando **alguma** linha tem divisão.
   *
   * Uma coluna a mais na grade, e ela é do grupo inteiro: metade das linhas com
   * `▸` e metade sem faria os números de umas não baterem com os das outras, que
   * é justamente o que esta lista existe para permitir.
   */
  const split = rows.some((row) => (row.agents?.length ?? 0) > 0);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className={`spend${split ? " spend--split" : ""}`}>
      {rows.map((row) => {
        const agents = row.agents ?? [];
        const expandable = agents.length > 0;
        const isOpen = open.has(row.id);

        /*
         * Grupo só quando abre; fora disso, nem um `div` a mais.
         *
         * O grupo é o que mantém a linha e as sub-linhas dela juntas — a borda de
         * baixo é dele. Uma linha sem divisão dentro de um grupo seria um nível de
         * grade a mais para nada, e cada nível de grade é um lugar onde o
         * `subgrid` pode deixar de valer.
         */
        const Wrap = expandable ? "div" : Fragment;
        const wrapProps = expandable ? { className: "spend__group" } : {};

        return (
          <Wrap key={row.id} {...wrapProps}>
            <div
              className={`spend__row${row.tokens === 0 ? " spend__row--idle" : ""}${
                row.outside === true ? " spend__row--outside" : ""
              }`}
            >
              {split && (
                <>
                  {expandable ? (
                    <button
                      type="button"
                      className="spend__twist"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "fechar" : "abrir"} a divisão por agente de ${row.name}`}
                      onClick={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          if (!next.delete(row.id)) next.add(row.id);
                          return next;
                        })
                      }
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : (
                    /*
                     * A célula fica, vazia.
                     *
                     * Sem ela a linha sem divisão perderia uma coluna e todos os
                     * números dela andariam para a esquerda — o desalinhamento que
                     * o `subgrid` desta lista foi posto para não ter.
                     */
                    <span className="spend__twist" />
                  )}
                </>
              )}
              <Glyph tone={row.tokens === 0 ? "off" : row.kind}>
                {row.kind === "worktree" ? "◫" : "▣"}
              </Glyph>
              <span className="spend__name">{row.name}</span>
              <span className="spend__bar">
                {top > 0 && row.tokens > 0 && (
                  <span
                    className="spend__fill"
                    style={{ "--w": `${String(Math.round((row.tokens / top) * 100))}%` } as never}
                  />
                )}
              </span>
              <span className="spend__tok">{formatTokens(row.tokens)}</span>
              {/*
                Custo que ninguém reportou **não** é zero: um agente que não informa
                dinheiro não pode parecer grátis. É a mesma distinção que o daemon
                guarda entre `null` e `0` na coluna.
              */}
              {row.cost === null ? (
                <span className="spend__cost spend__cost--none">sem custo reportado</span>
              ) : (
                <span className="spend__cost">{money(row.cost, row.currency)}</span>
              )}
              <span className="spend__turns">
                {turnsText(row.turns)}
              </span>
            </div>

            {isOpen &&
              agents.map((agent) => (
                <Fragment key={agent.id}>
                  <div className={`spend__row spend__row--agent${agent.name === null ? " spend__row--idle" : ""}`}>
                    <span className="spend__twist" />
                    <Glyph tone={agent.name === null ? "off" : "agent"}>◆</Glyph>
                    {/*
                      A linha gravada antes da coluna existir não tem agente, e não
                      ganha um inventado: somar o que ela gastou a um dos dois seria
                      escolher um culpado no lugar de dizer "não sei".
                    */}
                    <span className="spend__name">{agent.name ?? "antes desta versão"}</span>
                    {/* A fração é **dentro do escopo**: quanto deste projeto foi de cada um. */}
                    <Numbers part={agent} whole={row.tokens} />
                  </div>
                  {/*
                    E um nível abaixo, por conta (`034` T16): mesma grade, e o recuo
                    vai no nome — é o que mantém os números na coluna de cima.
                  */}
                  {(agent.accounts ?? []).map((account) => (
                    <div className="spend__row spend__row--agent spend__row--account" key={account.id}>
                      <span className="spend__twist" />
                      <span aria-hidden="true" />
                      <span className="spend__name">{account.label ?? "conta apagada"}</span>
                      <Numbers part={account} whole={agent.tokens} />
                    </div>
                  ))}
                </Fragment>
              ))}
          </Wrap>
        );
      })}
    </div>
  );
}

/** Barra, token, custo e turnos de uma sub-linha — a mesma forma por agente e por conta. */
function Numbers({
  part,
  whole,
}: {
  part: { tokens: number; cost: number | null; currency: string | null; turns: number };
  whole: number;
}) {
  return (
    <>
      <span className="spend__bar">
        {whole > 0 && part.tokens > 0 && (
          <span
            className="spend__fill"
            style={{ "--w": `${String(Math.round((part.tokens / whole) * 100))}%` } as never}
          />
        )}
      </span>
      <span className="spend__tok">{formatTokens(part.tokens)}</span>
      {part.cost === null ? (
        <span className="spend__cost spend__cost--none">sem custo reportado</span>
      ) : (
        <span className="spend__cost">{money(part.cost, part.currency)}</span>
      )}
      <span className="spend__turns">{turnsText(part.turns)}</span>
    </>
  );
}

/** `nenhum turno`, `1 turno`, `N turnos` — as linhas e as sub-linhas dizem igual. */
function turnsText(turns: number): string {
  if (turns === 0) return "nenhum turno";
  return turns === 1 ? "1 turno" : `${String(turns)} turnos`;
}

/** `US$ 12,4071`. Quatro casas, porque um turno custa menos que um centavo. */
function money(amount: number, currency: string | null): string {
  const value = amount.toFixed(4).replace(".", ",");
  return currency === "USD" || currency === null ? `US$ ${value}` : `${currency} ${value}`;
}
