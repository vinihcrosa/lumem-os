import { useState } from "react";

import { daysAgo } from "../../lib/relative-time.js";
import { EmptyState } from "../../ui/index.js";
import { SCOPE_LABEL } from "./MemoryEntries.js";
import { useArchivePlaybook, usePlaybooks, type MemoryScopeFilter } from "./useMemory.js";

/**
 * A aba `Playbooks` — o procedimento que já funcionou, e o uso dele.
 *
 * Aba própria, e não uma seção de `MemoryEntries`: playbook não é memória
 * (§6 do PRD), e o que a lista dele mostra é uso, não escopo.
 */

/** O estado do ciclo de vida, em português. O daemon fala o vocabulário do dado. */
const LIFECYCLE: Record<string, string> = {
  active: "ativo",
  stale: "parado",
  archived: "arquivado",
};

export function MemoryPlaybooks({ workspaceId, projectId }: MemoryScopeFilter) {
  const [archived, setArchived] = useState(false);
  const query = usePlaybooks({ workspaceId, projectId, archived });
  const archive = useArchivePlaybook();

  return (
    <>
      {/*
       * Arquivado é uma **vista**, e não um estado escondido: arquivar não apaga,
       * e uma lista que só soubesse mostrar o que está vivo faria arquivar
       * parecer deleção.
       */}
      <div className="mem-seg" role="group" aria-label="Vista dos playbooks">
        {[
          { label: "ativos", value: false },
          { label: "arquivados", value: true },
        ].map((view) => (
          <button
            key={view.label}
            type="button"
            className={`mem-seg__item${archived === view.value ? " mem-seg__item--active" : ""}`}
            aria-pressed={archived === view.value}
            onClick={() => setArchived(view.value)}
          >
            {view.label}
          </button>
        ))}
      </div>

      {query.isPending ? <p className="mem-meta">carregando…</p> : null}
      {query.isError ? (
        <EmptyState title="Não deu para ler os playbooks">{query.error.message}</EmptyState>
      ) : null}
      {query.data?.length === 0 ? (
        <EmptyState title={archived ? "Nenhum playbook arquivado" : "Nenhum playbook ainda"}>
          {archived
            ? "Arquivar não apaga: o que for arquivado aparece aqui."
            : "Playbook é procedimento — o caminho que já funcionou, para a próxima vez."}
        </EmptyState>
      ) : null}

      {query.data?.map((playbook) => (
        <div key={playbook.path} className="pb">
          <p className="pb__row">
            <span className="life" data-life={playbook.lifecycle}>
              {LIFECYCLE[playbook.lifecycle] ?? playbook.lifecycle}
            </span>
            <span className="pb__class">{playbook.taskClass}</span>
          </p>
          <p className="pb__desc">{playbook.description}</p>
          <p className="pb__use">
            <span className="pb__loads">{playbook.loads}×</span>
            <span>
              {playbook.lastLoadedAt === null
                ? "nunca carregado"
                : `último uso ${daysAgo(playbook.lastLoadedAt)}`}
            </span>
            <span className="mem-scope" data-scope={playbook.scope}>
              {SCOPE_LABEL[playbook.scope] ?? playbook.scope}
            </span>
            <button
              type="button"
              className="pb__act focus-ring"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ path: playbook.path, archived: !playbook.archived })}
            >
              {playbook.archived ? "desarquivar" : "arquivar"}
            </button>
          </p>
          {/*
           * Sugestão, nunca ação: a telemetria subconta (Q16), então uma tela que
           * arquivasse sozinha estaria apagando o que ela não tem como saber que
           * morreu.
           */}
          {playbook.lifecycle === "stale" ? (
            <p className="pb__suggest">
              parado há muito tempo — talvez o procedimento tenha mudado. Arquivar não apaga:
              carregar de novo reativa.
            </p>
          ) : null}
        </div>
      ))}
    </>
  );
}
