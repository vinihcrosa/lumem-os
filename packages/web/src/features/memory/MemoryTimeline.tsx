import { absoluteStamp } from "../../lib/relative-time.js";
import { EmptyState } from "../../ui/index.js";
import { useDecisions } from "./useMemory.js";

/**
 * A aba `Histórico` — o que virou memória, e o que **não** virou (D5).
 *
 * Rejeição e no-op só existem no WAL, e são a resposta para "por que isso não
 * foi salvo?".
 */

const VERB: Record<string, string> = {
  applied: "aprendeu",
  rejected: "recusou",
  noop: "nada a fazer",
};

export function MemoryTimeline() {
  const decisions = useDecisions();

  if (decisions.isPending) return <p className="mem-meta">carregando…</p>;
  if (decisions.isError) {
    return <EmptyState title="Não deu para ler o histórico">{decisions.error.message}</EmptyState>;
  }
  if (decisions.data.length === 0) {
    return <EmptyState title="Nada decidido ainda">Cada escrita — e cada recusa — aparece aqui.</EmptyState>;
  }

  return (
    <ol className="mem-tl">
      {decisions.data.map((decision) => (
        <li key={decision.id} className="mem-tl-item" data-outcome={decision.outcome}>
          <span className="mem-tl-when">{absoluteStamp(decision.createdAt)}</span>
          <span className="mem-tl-dot">{decision.outcome === "rejected" ? "▲" : "●"}</span>
          <span>
            <span className="mem-tl-verb">{VERB[decision.outcome] ?? decision.outcome}</span>{" "}
            <span>{decision.path}</span>
            {decision.reason === null ? null : (
              <>
                {" — "}
                <em>{decision.reason}</em>
              </>
            )}
            {/*
              A tarefa daquela sessão, quando há (`022` F6).

              Só leitura, e **nenhuma coluna nova em memória**: a ligação já
              existe pela sessão. Some quando a sessão não serve tarefa nenhuma,
              que é o caso mais comum — tarefa não é obrigatória.
            */}
            {(decision.taskTitles ?? []).length > 0 && (
              <span className="mem-tl-task"> · {(decision.taskTitles ?? []).join(", ")}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
