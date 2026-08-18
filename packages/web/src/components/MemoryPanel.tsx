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
  type ProposalStatus,
  type ResolveProposal,
} from "../hooks/useMemory.js";
import { Banner, Button, EmptyState, Field, Input } from "../ui/index.js";

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
              id={`mem-tab-${item.id}`}
              aria-selected={active === item.id}
              aria-controls="mem-panel-body"
              // Classe explícita, e não `[aria-selected]` no CSS: é a convenção
              // do resto do app (`tab-item--active`), e sem ela nenhuma das
              // quatro abas aparenta estar aberta.
              className={`mem-tab${active === item.id ? " mem-tab--active" : ""}`}
              onClick={() => {
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mem-body" id="mem-panel-body" role="tabpanel" aria-labelledby={`mem-tab-${active}`}>
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

const STATUS_FILTERS: readonly { id: ProposalStatus; label: string }[] = [
  { id: "pending", label: "Pendentes" },
  { id: "resolved", label: "Resolvidas" },
];

/**
 * A inbox — e, ao lado dela, o que você já decidiu.
 *
 * Rejeitar **não** apaga. Sem o segundo filtro a proposta recusada
 * desapareceria da tela inteira: não está na inbox, não está na lista, e não
 * está no histórico — o WAL registra o que passou pelo portão, e proposta é
 * exatamente o que não passou.
 */
function Inbox() {
  const [status, setStatus] = useState<ProposalStatus>("pending");
  const proposals = useProposals(status);

  return (
    <>
      <div className="mem-seg" role="group" aria-label="Propostas por estado">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`mem-seg__item${status === filter.id ? " mem-seg__item--active" : ""}`}
            aria-pressed={status === filter.id}
            onClick={() => {
              setStatus(filter.id);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <ProposalList query={proposals} status={status} />
    </>
  );
}

function ProposalList({
  query,
  status,
}: {
  query: ReturnType<typeof useProposals>;
  status: ProposalStatus;
}) {
  if (query.isPending) return <p className="mem-meta">carregando…</p>;
  // Erro e carregamento são coisas diferentes: colapsar os dois deixa a aba
  // girando para sempre sem dizer o que falhou.
  if (query.isError) {
    return <EmptyState title="Não deu para ler as propostas">{query.error.message}</EmptyState>;
  }
  if (query.data.length === 0) {
    return status === "pending" ? (
      <EmptyState title="Nenhuma proposta pendente">
        Escrita de workspace feita por agente cai aqui antes de valer.
      </EmptyState>
    ) : (
      <EmptyState title="Nada decidido ainda">
        Aprovar ou rejeitar move a proposta para cá — recusar é histórico, não apagamento.
      </EmptyState>
    );
  }

  return (
    <ul className="mem-list">
      {query.data.map((proposal) => (
        <li key={proposal.id} className="mem-item">
          {proposal.status === "pending" ? (
            <PendingProposal proposal={proposal} />
          ) : (
            <ResolvedProposal proposal={proposal} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Nenhum gesto aberto, o formulário de edição, ou a confirmação da recusa. */
type ProposalGesture = "none" | "edit" | "reject";

function PendingProposal({ proposal }: { proposal: Proposal }) {
  const { approve, reject } = useResolveProposal();
  const [gesture, setGesture] = useState<ProposalGesture>("none");

  return (
    <>
      <ProposalHead proposal={proposal} />
      <p className="mem-desc">{proposal.description}</p>
      {/* O corpo é o texto que vira arquivo. Aprovar é gravar e commitar — e
          gravar o que a revisão não leu não é revisão. */}
      <pre className="mem-body-text">
        {proposal.body === "" ? "(sem corpo — só nome e descrição)" : proposal.body}
      </pre>
      <Evidence proposal={proposal} />

      {gesture === "edit" ? (
        <EditAndApprove
          proposal={proposal}
          approve={approve}
          onCancel={() => {
            setGesture("none");
          }}
        />
      ) : gesture === "reject" ? (
        <ConfirmReject
          proposal={proposal}
          reject={reject}
          onCancel={() => {
            setGesture("none");
          }}
        />
      ) : (
        <div className="mem-actions">
          <Button
            variant="primary"
            disabled={approve.isPending}
            onClick={() => {
              approve.mutate({ id: proposal.id });
            }}
          >
            Aprovar
          </Button>
          <Button
            onClick={() => {
              setGesture("edit");
            }}
          >
            Editar e aprovar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setGesture("reject");
            }}
          >
            Rejeitar
          </Button>
        </div>
      )}

      {approve.isError ? (
        <Banner tone="danger">não deu para aprovar: {approve.error.message}</Banner>
      ) : null}
      {reject.isError ? (
        <Banner tone="danger">não deu para rejeitar: {reject.error.message}</Banner>
      ) : null}
    </>
  );
}

/**
 * Corrigir antes de aceitar.
 *
 * Só o que você mudou é enviado: aprovar sem edição e aprovar reenviando o
 * mesmo texto são gestos diferentes, e o servidor não deveria precisar adivinhar
 * qual dos dois aconteceu.
 */
function EditAndApprove({
  proposal,
  approve,
  onCancel,
}: {
  proposal: Proposal;
  approve: ResolveProposal["approve"];
  onCancel: () => void;
}) {
  const [name, setName] = useState(proposal.name);
  const [description, setDescription] = useState(proposal.description);
  const [body, setBody] = useState(proposal.body);
  const incomplete = name.trim() === "" || description.trim() === "";

  return (
    <div className="mem-form">
      <Field id={`prop-${proposal.id}-name`} label="Nome">
        <Input
          id={`prop-${proposal.id}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field id={`prop-${proposal.id}-description`} label="Descrição">
        <Input
          id={`prop-${proposal.id}-description`}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </Field>
      <Field id={`prop-${proposal.id}-body`} label="Corpo">
        <textarea
          id={`prop-${proposal.id}-body`}
          className="mem-textarea"
          rows={6}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </Field>
      <div className="mem-actions">
        <Button
          variant="primary"
          disabled={approve.isPending || incomplete}
          onClick={() => {
            approve.mutate({
              id: proposal.id,
              ...(name === proposal.name ? {} : { name }),
              ...(description === proposal.description ? {} : { description }),
              ...(body === proposal.body ? {} : { body }),
            });
          }}
        >
          Aprovar com edição
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Recusar é definitivo, e por isso pede confirmação e motivo.
 *
 * `resolveProposal` recusa qualquer nova resolução, e não existe reabrir em
 * lugar nenhum: um clique só seria uma decisão sem volta tomada sem intenção. O
 * motivo é o que responde depois por que o sistema insiste — ou não — num
 * assunto.
 */
function ConfirmReject({
  proposal,
  reject,
  onCancel,
}: {
  proposal: Proposal;
  reject: ResolveProposal["reject"];
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");

  return (
    <div className="mem-form">
      <Banner tone="warning">
        Rejeitar não tem volta: a proposta fica no histórico como recusada, e não há como reabri-la.
      </Banner>
      <Field id={`prop-${proposal.id}-note`} label="Por que não? (fica registrado)">
        <Input
          id={`prop-${proposal.id}-note`}
          value={note}
          // O mesmo teto do router: motivo longo não pode ser digitado em vez de
          // virar recusa do zod depois de escrito.
          maxLength={500}
          placeholder="isso é regra do api, não do produto"
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <div className="mem-actions">
        <Button
          variant="danger"
          disabled={reject.isPending}
          onClick={() => {
            reject.mutate({
              id: proposal.id,
              ...(note.trim() === "" ? {} : { note: note.trim() }),
            });
          }}
        >
          Rejeitar
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** O que você decidiu, e o que disse ao decidir. */
function ResolvedProposal({ proposal }: { proposal: Proposal }) {
  return (
    <>
      <ProposalHead proposal={proposal} />
      <p className="mem-desc">{proposal.description}</p>
      <p className="mem-meta">
        <span className="mem-verdict" data-status={proposal.status}>
          {proposal.status === "approved" ? "aprovada" : "rejeitada"}
        </span>
        <span>proposta por {proposal.actor}</span>
        {proposal.resolvedAt === null ? null : <span>{formatStamp(proposal.resolvedAt)}</span>}
      </p>
      {proposal.resolutionNote === null ? null : (
        <p className="mem-shadow-note">{proposal.resolutionNote}</p>
      )}
    </>
  );
}

/** D7: fato vira memória, conclusão vira proposta — e a tela diz qual é qual. */
function Evidence({ proposal }: { proposal: Proposal }) {
  return (
    <div className="mem-evidence">
      {proposal.evidence === null ? (
        <>
          <strong>Sem evidência verificável</strong> — o agente concluiu. Conclusão vira proposta;
          fato vira memória.
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
  return formatStamp(decision.createdAt);
}

function formatStamp(when: Date | string): string {
  return new Date(when).toLocaleString("pt-BR", {
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

  if (usage.isPending) return <p className="mem-meta">carregando…</p>;
  if (usage.isError) {
    return <EmptyState title="Não deu para ler os números">{usage.error.message}</EmptyState>;
  }
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
