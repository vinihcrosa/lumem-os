import { useState } from "react";

import { absoluteStamp } from "../../lib/relative-time.js";
import { Banner, Button, EmptyState, Field, Input } from "../../ui/index.js";
import { ACTOR, CONFIDENCE } from "./MemoryEntries.js";
import {
  useProposals,
  useResolveProposal,
  type Proposal,
  type ProposalStatus,
  type ResolveProposal,
} from "./useMemory.js";

/**
 * A inbox — e, ao lado dela, o que você já decidiu.
 *
 * Rejeitar **não** apaga: sem o segundo filtro a proposta recusada
 * desapareceria da tela inteira — o WAL registra o que passou pelo portão, e
 * proposta é exatamente o que não passou. Também exportado por
 * `features/memory/index.ts`: `ProposalQueue.tsx` a hospeda na fila única do
 * workspace (`022` T4) — a fronteira entre as duas telas passa a existir como
 * arquivo, não como comportamento.
 */

export type { ProposalStatus };

const STATUS_FILTERS: readonly { id: ProposalStatus; label: string }[] = [
  { id: "pending", label: "Pendentes" },
  { id: "resolved", label: "Resolvidas" },
];

/**
 * As propostas de memória.
 *
 * **O filtro de estado é opcional, e isso não é conveniência.** Quando a fila
 * única da [`022`](../../../docs/features/022-workspace-tasks/prd.md) hospeda
 * esta lista, o `pendentes · resolvidas` tem que valer para os **dois** tipos
 * — um segmentado que filtra metade da lista é pior que nenhum —, então quem
 * hospeda passa `status`, e o controle mora lá em cima. Sem `status`, ela
 * volta a ser autônoma — com o próprio segmentado —, que é como os testes a
 * montam.
 */
export function MemoryProposals({ status: controlled }: { status?: ProposalStatus } = {}) {
  const [internal, setInternal] = useState<ProposalStatus>("pending");
  const status = controlled ?? internal;
  const proposals = useProposals(status);

  return (
    <>
      {controlled === undefined && (
        <div className="mem-seg" role="group" aria-label="Propostas por estado">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`mem-seg__item${status === filter.id ? " mem-seg__item--active" : ""}`}
              aria-pressed={status === filter.id}
              onClick={() => setInternal(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
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

/**
 * Duas memórias do **mesmo** escopo dizendo coisas diferentes.
 *
 * O shadow resolve o cruzamento de escopos — projeto vence workspace, e o
 * perdedor fica no disco. Isto é outra coisa: no mesmo escopo não há
 * precedência a aplicar, então é **bug de curadoria**, e a única resposta
 * honesta é mostrar as duas e deixar você decidir — nada de merge automático.
 * Não muda os botões (aprovar já **substitui**, rejeitar já **mantém**): o
 * que faltava era ver o que vai ser perdido antes de clicar.
 */
function Conflict({
  current,
  proposal,
}: {
  current: NonNullable<Proposal["current"]>;
  proposal: Proposal;
}) {
  return (
    <div className="mem-conflict">
      <p className="mem-conflict__t">
        <span className="mem-warn">conflito no mesmo escopo</span>
        já existe memória aqui — aprovar substitui
      </p>
      <div className="mem-split">
        <div>
          <strong>A que está valendo</strong>
          <p className="mem-desc">{current.description}</p>
          <p className="mem-meta">
            <span>{ACTOR[current.sourceActor] ?? current.sourceActor}</span>
            <span>confiança {CONFIDENCE[current.confidence] ?? current.confidence}</span>
          </p>
        </div>
        <div>
          <strong>A que chegou</strong>
          <p className="mem-desc">{proposal.description}</p>
          <p className="mem-meta">
            <span>{ACTOR[proposal.actor] ?? proposal.actor}</span>
            <span>{proposal.evidence === null ? "sem evidência" : "com evidência"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

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
      {proposal.current === null ? null : <Conflict current={proposal.current} proposal={proposal} />}

      {gesture === "edit" ? (
        <EditAndApprove proposal={proposal} approve={approve} onCancel={() => setGesture("none")} />
      ) : gesture === "reject" ? (
        <ConfirmReject proposal={proposal} reject={reject} onCancel={() => setGesture("none")} />
      ) : (
        <div className="mem-actions">
          <Button
            variant="primary"
            disabled={approve.isPending}
            onClick={() => approve.mutate({ id: proposal.id })}
          >
            Aprovar
          </Button>
          <Button onClick={() => setGesture("edit")}>Editar e aprovar</Button>
          <Button variant="ghost" onClick={() => setGesture("reject")}>
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
 * Corrigir antes de aceitar. Só o que você mudou é enviado: aprovar sem
 * edição e aprovar reenviando o mesmo texto são gestos diferentes, e o
 * servidor não deveria precisar adivinhar qual dos dois aconteceu.
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
 * `resolveProposal` recusa qualquer nova resolução, e não existe reabrir em
 * lugar nenhum: um clique só seria uma decisão sem volta tomada sem intenção.
 * O motivo é o que responde depois por que o sistema insiste — ou não — num
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
        {proposal.resolvedAt === null ? null : <span>{absoluteStamp(proposal.resolvedAt)}</span>}
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
