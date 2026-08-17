import { useState } from "react";

import {
  useDecisions,
  useMemoryList,
  useProposals,
  useResolveProposal,
  useUsage,
  type Decision,
  type MemoryEntry,
  type MemoryScopeFilter,
  type Proposal,
} from "../hooks/useMemory.js";
import { EmptyState } from "../ui/index.js";

import "./memory.css";

/**
 * A memória na tela — quatro vistas, uma coluna.
 *
 * O desenho saiu do protótipo `packages/web/prototype/lumem-memory.html`, e as
 * três decisões que a renderização produziu estão aqui inteiras:
 *
 * - **escopo e tipo têm formas diferentes**, porque respondem perguntas
 *   diferentes ("onde vale" e "o que é");
 * - **a memória sombreada aparece**, apagada, e diz quem a sombreou — esconder
 *   sem explicar é como o shadow vira mistério;
 * - **a linha do tempo mostra o que não virou arquivo**: rejeição e no-op só
 *   existem no WAL, e são a resposta para "por que isso não foi salvo?".
 */

export type MemoryTab = "entries" | "inbox" | "timeline" | "numbers";

export interface MemoryPanelProps extends MemoryScopeFilter {
  tab?: MemoryTab;
  onTabChange?(tab: MemoryTab): void;
}

const TABS: readonly { id: MemoryTab; label: string }[] = [
  { id: "entries", label: "Memória" },
  { id: "inbox", label: "Propostas" },
  { id: "timeline", label: "Histórico" },
  { id: "numbers", label: "Números" },
];

export function MemoryPanel({ workspaceId, projectId, tab, onTabChange }: MemoryPanelProps) {
  const [internal, setInternal] = useState<MemoryTab>("entries");
  const active = tab ?? internal;
  const setTab = (next: MemoryTab) => {
    setInternal(next);
    onTabChange?.(next);
  };

  const list = useMemoryList({ workspaceId, projectId });
  const proposals = useProposals("pending");

  return (
    <section className="mem-panel" aria-label="Memória do workspace">
      <header className="mem-head">
        <span className="mem-title">Memória</span>
        {proposals.data && proposals.data.length > 0 ? (
          <span className="mem-count" title="propostas aguardando revisão">
            {proposals.data.length}
          </span>
        ) : null}
        <span className="mem-spacer" />
        <div role="tablist" aria-label="Vistas da memória" className="mem-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active === item.id}
              onClick={() => {
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mem-body">
        {active === "entries" ? <Entries query={list} /> : null}
        {active === "inbox" ? <Inbox /> : null}
        {active === "timeline" ? <Timeline /> : null}
        {active === "numbers" ? <Numbers /> : null}
      </div>
    </section>
  );
}

function Entries({ query }: { query: ReturnType<typeof useMemoryList> }) {
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

  return (
    <ul className="mem-list">
      {entries.map((entry) => (
        <li key={entry.path} className="mem-item">
          <EntryHead entry={entry} />
          <p className="mem-desc">{entry.description}</p>
          <p className="mem-meta">
            <span>{entry.sourceActor}</span>
            <span>confiança {entry.confidence}</span>
          </p>
          {losersByWinner.get(entry.path)?.map((identity) => (
            <p key={identity} className="mem-shadow-note">
              sombreia <strong>{identity}</strong> — continua no disco
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

function EntryHead({ entry }: { entry: MemoryEntry }) {
  return (
    <p className="mem-row">
      <span className="mem-scope" data-scope={entry.scope}>
        {entry.scope === "global" ? "você" : entry.scope}
      </span>
      <span className="mem-kind">{entry.type}</span>
      <span className="mem-name">{entry.name}</span>
    </p>
  );
}

function Inbox() {
  const proposals = useProposals("pending");
  const { approve, reject } = useResolveProposal();

  if (!proposals.isSuccess) return <p className="mem-meta">carregando…</p>;
  if (proposals.data.length === 0) {
    return (
      <EmptyState title="Nenhuma proposta pendente">Escrita de workspace feita por agente cai aqui antes de valer.</EmptyState>
    );
  }

  return (
    <ul className="mem-list">
      {proposals.data.map((proposal) => (
        <li key={proposal.id} className="mem-item">
          <ProposalHead proposal={proposal} />
          <p className="mem-desc">{proposal.description}</p>
          <div className="mem-evidence">
            {proposal.evidence === null ? (
              <>
                <strong>Sem evidência verificável</strong> — o agente concluiu. Conclusão vira
                proposta; fato vira memória.
              </>
            ) : (
              <>
                <strong>Evidência</strong> — <code>{proposal.evidence}</code>
              </>
            )}
            <br />
            proposta por <strong>{proposal.actor}</strong>
            {proposal.fromProjectId === null ? null : <> · projeto {proposal.fromProjectId}</>}
          </div>
          <div className="mem-actions">
            <button
              type="button"
              disabled={approve.isPending}
              onClick={() => {
                approve.mutate({ id: proposal.id });
              }}
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={reject.isPending}
              onClick={() => {
                reject.mutate({ id: proposal.id });
              }}
            >
              Rejeitar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProposalHead({ proposal }: { proposal: Proposal }) {
  return (
    <p className="mem-row">
      <span className="mem-scope" data-scope={proposal.scope}>
        {proposal.scope === "global" ? "você" : proposal.scope}
      </span>
      <span className="mem-kind">{proposal.type}</span>
      <span className="mem-name">{proposal.name}</span>
    </p>
  );
}

const VERB: Record<string, string> = {
  applied: "aprendeu",
  rejected: "recusou",
  noop: "nada a fazer",
};

function Timeline() {
  const decisions = useDecisions();

  if (!decisions.isSuccess) return <p className="mem-meta">carregando…</p>;
  if (decisions.data.length === 0) {
    return <EmptyState title="Nada decidido ainda">Cada escrita — e cada recusa — aparece aqui.</EmptyState>;
  }

  return (
    <ol className="mem-tl">
      {decisions.data.map((decision) => (
        <li key={decision.id} className="mem-tl-item" data-outcome={decision.outcome}>
          <span className="mem-tl-when">{formatWhen(decision)}</span>
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
          </span>
        </li>
      ))}
    </ol>
  );
}

function formatWhen(decision: Decision): string {
  return new Date(decision.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Os números do §6 do context-delivery.
 *
 * O que interessa não é cada linha: é a **comparação** entre o custo fixo e as
 * perguntas feitas. Perto de zero perguntas significa que a camada 3 é
 * decoração — e é a medida que decide se o desenho continua de pé.
 */
function Numbers() {
  const usage = useUsage();

  if (!usage.isSuccess) return <p className="mem-meta">carregando…</p>;
  if (usage.data.length === 0) {
    return <EmptyState title="Sem uso registrado">Os números aparecem depois da primeira busca.</EmptyState>;
  }

  return (
    <div className="mem-stats">
      {usage.data.map((row) => (
        <div key={row.kind} className="mem-stat">
          <div className="n">{row.events}</div>
          <div className="l">
            {row.kind} · {row.totalAmount} no total · {row.averageDurationMs} ms
          </div>
        </div>
      ))}
    </div>
  );
}
