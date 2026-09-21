import { useState } from "react";

import { EmptyState } from "../../ui/index.js";
import {
  useMemoryCore,
  useMemoryList,
  useMemorySearch,
  usePinMemory,
  type MemoryEntry,
  type MemoryScopeFilter,
} from "./useMemory.js";

/**
 * A aba `Memória` — a lista agrupada por escopo, com busca embutida.
 *
 * O desenho saiu do protótipo `lumem-os-design/lumem-memory.html`, e duas
 * decisões da renderização estão aqui inteiras:
 *
 * - **escopo e tipo têm formas diferentes**, porque respondem perguntas
 *   diferentes ("onde vale" e "o que é");
 * - **a memória sombreada aparece**, apagada, e diz quem a sombreou — esconder
 *   sem explicar é como o shadow vira mistério.
 */

/**
 * O valor de confiança em português.
 *
 * O daemon fala `low | medium | high`, que é o vocabulário do dado. Ecoar isso
 * numa tela em português deixava "confiança medium" na linha de toda entrada.
 * Exportado: `MemoryProposals` mostra a mesma confiança no conflito de escopo.
 */
export const CONFIDENCE: Record<string, string> = { low: "baixa", medium: "média", high: "alta" };

/**
 * Quem escreveu, em português. O daemon fala o vocabulário do dado.
 * Exportado pelo mesmo motivo que `CONFIDENCE`.
 */
export const ACTOR: Record<string, string> = {
  human: "você",
  agent: "agente",
  distiller: "destilação",
  auto_research: "auto-learn",
  import: "importação",
};

/**
 * O rótulo do grupo responde "onde isto vale".
 * Exportado: `MemoryPlaybooks` usa o mesmo rótulo para a mesma pergunta.
 */
export const SCOPE_LABEL: Record<string, string> = {
  global: "você · atravessa workspace",
  workspace: "workspace",
  project: "projeto",
};

export function MemoryEntries({
  query,
  core,
  scope,
}: {
  query: ReturnType<typeof useMemoryList>;
  core: ReturnType<typeof useMemoryCore>;
  scope: MemoryScopeFilter;
}) {
  const [term, setTerm] = useState("");
  const found = useMemorySearch(scope, term);

  const search = (
    /*
     * A busca vive na primeira aba porque é a mesma pergunta que a lista responde
     * — "o que existe" —, com um filtro. Aba própria faria escolher entre navegar
     * e procurar, quando as duas coisas são a mesma.
     */
    <div className="mem-find">
      <input
        type="search"
        className="focus-ring"
        placeholder="buscar na memória…"
        aria-label="Buscar na memória"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
    </div>
  );

  if (term.trim() !== "") {
    return (
      <>
        {search}
        <SearchResults found={found} />
      </>
    );
  }

  if (query.isPending) return <p className="mem-meta">carregando…</p>;
  if (query.isError) return <EmptyState title="Não deu para ler a memória">{query.error.message}</EmptyState>;

  const { entries, shadowed } = query.data;
  if (entries.length === 0) {
    return (
      <EmptyState title="Nada aprendido ainda">A memória aparece aqui quando algo durável for salvo.</EmptyState>
    );
  }

  // Quem sombreia quem, indexado pela vítima: a nota vai na entrada vencedora,
  // que é onde a pergunta "e a outra?" nasce.
  const losersByWinner = new Map<string, string[]>();
  for (const pair of shadowed) {
    losersByWinner.set(pair.winner, [...(losersByWinner.get(pair.winner) ?? []), pair.identity]);
  }

  /*
   * Agrupado por escopo, e não um chip por linha.
   *
   * Renderizado em 360px com três entradas do mesmo escopo, o resultado eram três
   * chips `workspace` idênticos empilhados — a mesma informação repetida onde a
   * largura é a restrição mais dura da tela. O escopo é a pergunta "onde isto
   * vale", e ela se responde **uma vez por grupo**.
   *
   * A ordem é a da precedência: o mais específico primeiro, porque é o que vence.
   */
  // O custo por entrada vem da marca d'água, que é quem leu os arquivos.
  const cost = new Map((core.data?.entries ?? []).map((entry) => [entry.path, entry.chars]));

  const order = ["project", "workspace", "global"];
  const groups = order
    .map((scope) => ({ scope, rows: entries.filter((entry) => entry.scope === scope) }))
    .filter((group) => group.rows.length > 0);

  return (
    <>
      {search}
      {groups.map((group) => (
        // Sem classe no `<section>`: o cabeçalho grudento é quem tem pintura, e
        // classe sem regra é o outro lado do defeito que a auditoria procura.
        <section key={group.scope}>
          <h3 className="mem-group__t">
            <span className="mem-scope" data-scope={group.scope}>
              {SCOPE_LABEL[group.scope] ?? group.scope}
            </span>
            <span className="mem-group__n">{group.rows.length}</span>
          </h3>
          <ul className="mem-list">
            {group.rows.map((entry) => (
              <li key={entry.path} className="mem-item">
                <EntryHead entry={entry} />
                <p className="mem-desc">{entry.description}</p>
                <p className="mem-meta">
                  <span>{ACTOR[entry.sourceActor] ?? entry.sourceActor}</span>
                  <span>confiança {CONFIDENCE[entry.confidence] ?? entry.confidence}</span>
                  <PinButton entry={entry} />
                  {/* O custo ao lado do gesto que o produziu: uma tela que
                      deixa fixar e mostra a conta noutra aba esconde a
                      consequência do próprio botão. */}
                  {entry.pinned && cost.get(entry.path) !== undefined ? (
                    <span className="mem-pin-cost">
                      {(cost.get(entry.path) ?? 0).toLocaleString("pt-BR")} car.
                    </span>
                  ) : null}
                </p>
                {losersByWinner.get(entry.path)?.map((identity) => (
                  <p key={identity} className="mem-shadow-note">
                    sombreia <strong>{identity}</strong> — continua no disco
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Fixar e desfixar — o gesto mais caro da tela.
 *
 * `aria-pressed` e não um ícone: fixado é **estado** da entrada, e quem lê com
 * leitor de tela precisa ouvir "no núcleo, pressionado" em vez de um símbolo sem
 * nome. Desabilitado enquanto a escrita está no ar, porque fixar grava arquivo e
 * commita no `~/.lumem` — dois cliques seriam dois commits.
 */
function PinButton({ entry }: { entry: MemoryEntry }) {
  const pin = usePinMemory();
  return (
    <button
      type="button"
      className="mem-pin focus-ring"
      aria-pressed={entry.pinned}
      disabled={pin.isPending}
      onClick={() => pin.mutate({ path: entry.path, pinned: !entry.pinned })}
    >
      {entry.pinned ? "no núcleo" : "fixar no núcleo"}
    </button>
  );
}

/**
 * O resultado da busca, com o **porquê** de cada achado.
 *
 * O `why` é o `WhyRecalled` do Compozy, e ele é metade do valor: sem ele o
 * resultado é uma lista que apareceu por magia, e ninguém consegue contestar a
 * ordem. Os dois estados degradados também moram aqui, porque é aqui que eles
 * acontecem — *"dizer que não buscou é diferente de dizer que não achou"*.
 */
function SearchResults({ found }: { found: ReturnType<typeof useMemorySearch> }) {
  if (found.isPending) return <p className="mem-meta">buscando…</p>;
  if (found.isError) {
    return <EmptyState title="Não deu para buscar">{found.error.message}</EmptyState>;
  }
  if (found.data.skipped === "trivial_query") {
    return (
      <EmptyState title="Busca não realizada">
        Menos de dois termos significativos — dizer que não buscou é diferente de dizer que não
        achou.
      </EmptyState>
    );
  }

  return (
    <>
      {/* O índice é derivado, e pode estar atrás do catálogo — arquivo que não
          pôde ser lido, ou banco anterior à feature. Sinal, nunca recusa: o
          resultado vale, e pode estar curto. */}
      {found.data.staleIndex ? (
        <p className="mem-stale">índice desatualizado — o resultado pode estar curto</p>
      ) : null}
      {found.data.hits.length === 0 ? (
        <EmptyState title="Nada encontrado">
          Nenhuma memória casa com esses termos no escopo ativo.
        </EmptyState>
      ) : (
        <ul className="mem-list">
          {found.data.hits.map((hit) => (
            <li key={hit.entry.path} className="mem-item">
              <p className="mem-row">
                <span className="mem-scope" data-scope={hit.entry.scope}>
                  {SCOPE_LABEL[hit.entry.scope] ?? hit.entry.scope}
                </span>
                <span className="mem-kind">{hit.entry.type}</span>
                <span className="mem-name">{hit.entry.name}</span>
              </p>
              <p className="mem-desc">{hit.entry.description}</p>
              <p className="mem-why">
                {hit.why.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EntryHead({ entry }: { entry: MemoryEntry }) {
  // Sem o chip de escopo: ele subiu para o cabeçalho do grupo, onde é dito uma vez.
  return (
    <p className="mem-row">
      <span className="mem-kind">{entry.type}</span>
      <span className="mem-name">{entry.name}</span>
    </p>
  );
}
