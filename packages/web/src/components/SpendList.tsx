import { formatTokens } from "./UsageFooter.js";
import { Glyph } from "../ui/index.js";

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
}

export interface SpendListProps {
  rows: readonly SpendRow[];
}

export function SpendList({ rows }: SpendListProps) {
  // O maior define a escala. Zero em tudo não desenha barra nenhuma, em vez de
  // desenhar todas cheias — o que uma divisão por zero faria.
  const top = Math.max(...rows.map((row) => row.tokens), 0);

  return (
    <div className="spend">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`spend__row${row.tokens === 0 ? " spend__row--idle" : ""}${
            row.outside === true ? " spend__row--outside" : ""
          }`}
        >
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
            {row.turns === 0 ? "nenhum turno" : `${String(row.turns)} turnos`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** `US$ 12,4071`. Quatro casas, porque um turno custa menos que um centavo. */
function money(amount: number, currency: string | null): string {
  const value = amount.toFixed(4).replace(".", ",");
  return currency === "USD" || currency === null ? `US$ ${value}` : `${currency} ${value}`;
}
