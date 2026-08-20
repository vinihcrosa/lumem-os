import { useState } from "react";

import {
  useDecisions,
  useMemoryList,
  useProposals,
  useMemoryCore,
  useMemorySettings,
  usePinMemory,
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
  const core = useMemoryCore({ workspaceId, projectId });
  const proposals = useProposals("pending");

  return (
    <section className="mem-panel" aria-label="Memória do workspace">
      {/*
        Sem título próprio, e sem repetir a contagem.
        A faixa do painel direito já diz "Memória" e já traz o número — e a
        primeira aba aqui também se chama Memória. Renderizado em 360px, a mesma
        palavra aparecia três vezes na mesma linha, e a quarta aba (`Números`)
        ficava cortada porque não sobrava largura para ela.
      */}
      <header className="mem-head">
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
        {active === "entries" ? <Entries query={list} core={core} /> : null}
        {active === "inbox" ? <Inbox /> : null}
        {active === "timeline" ? <Timeline /> : null}
        {active === "numbers" ? <Numbers core={core} /> : null}
      </div>
    </section>
  );
}

/**
 * Onde o alarme toca — não onde o corte acontece (D5).
 *
 * Não existe teto: passar disto não corta nada e não recusa nada, só diz que o
 * núcleo virou documentação e que consolidar é decisão sua. A referência é o
 * teto do Hermes (2.200 caracteres), mais a folga que o §6 autoriza depois de o
 * spike mostrar que o piso de uma sessão é ~39k tokens — e não nosso.
 */
const CORE_ALARM_CHARS = 4_000;

/**
 * O valor de confiança em português.
 *
 * O daemon fala `low | medium | high`, que é o vocabulário do dado. Ecoar isso
 * numa tela em português deixava "confiança medium" na linha de toda entrada.
 */
const CONFIDENCE: Record<string, string> = { low: "baixa", medium: "média", high: "alta" };

/** Quem escreveu, em português. O daemon fala o vocabulário do dado. */
const ACTOR: Record<string, string> = {
  human: "você",
  agent: "agente",
  distiller: "destilação",
  auto_research: "auto-learn",
  import: "importação",
};

/** O rótulo do grupo responde "onde isto vale". */
const SCOPE_LABEL: Record<string, string> = {
  global: "você · atravessa workspace",
  workspace: "workspace",
  project: "projeto",
};

function Entries({
  query,
  core,
}: {
  query: ReturnType<typeof useMemoryList>;
  core: ReturnType<typeof useMemoryCore>;
}) {
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

function EntryHead({ entry }: { entry: MemoryEntry }) {
  // Sem o chip de escopo: ele subiu para o cabeçalho do grupo, onde é dito uma vez.
  return (
    <p className="mem-row">
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
function Numbers({ core }: { core: ReturnType<typeof useMemoryCore> }) {
  const usage = useUsage();
  const settings = useMemorySettings();

  if (usage.isPending) return <p className="mem-meta">carregando…</p>;
  if (usage.isError) {
    return <EmptyState title="Não deu para ler os números">{usage.error.message}</EmptyState>;
  }

  const watermark = core.data;

  return (
    <div className="mem-stats">
      {/*
       * A marca d'água vem primeiro, e é o único número desta aba que descreve um
       * custo **recorrente**: o núcleo é cobrado em toda sessão. Não há teto (D5)
       * — cortar diretriz no meio produz regra errada, não regra menor —, então
       * medir é a única coisa que impede "sem teto" de virar "sem controle".
       */}
      {watermark !== undefined && watermark.entries.length > 0 ? (
        <div className={`mem-stat${watermark.chars > CORE_ALARM_CHARS ? " mem-stat--warn" : ""}`}>
          <div className="n">{watermark.chars.toLocaleString("pt-BR")}</div>
          <div className="l">caracteres no núcleo</div>
          <div className="hint">
            {watermark.entries.length}{" "}
            {watermark.entries.length === 1 ? "diretriz fixada" : "diretrizes fixadas"}
            {watermark.recentChars > 0
              ? ` · ${watermark.recentChars.toLocaleString("pt-BR")} entraram em 30 dias`
              : ""}
            {watermark.chars > CORE_ALARM_CHARS ? " · hora de consolidar" : ""}
          </div>
        </div>
      ) : null}
      {/*
       * Desligado por padrão só é honesto se for visível: uma captura que ninguém
       * sabe se está ligada é uma captura que ninguém confere. E ela é a única
       * parte do sistema que gasta token sem você pedir.
       */}
      {settings.data !== undefined ? (
        <div className="mem-stat">
          <div className="n">{settings.data.distill ? "on" : "off"}</div>
          <div className="l">destilação de fim de sessão</div>
          <div className="hint">
            {settings.data.distill
              ? "cada sessão de agente que termina custa uma sessão de destilação"
              : "ligue com LUMEM_MEMORY_DISTILL=1"}
          </div>
        </div>
      ) : null}
      {usage.data.map((row) => (
        <div key={row.kind} className="mem-stat">
          <div className="n">{row.events}</div>
          <div className="l">
            {row.kind} · {row.totalAmount} no total · {row.averageDurationMs} ms
          </div>
        </div>
      ))}
      {/* Zero é um número, e é diferente de tela vazia: antes esta aba sumia
          inteira enquanto ninguém tivesse buscado, escondendo a marca d'água e o
          estado da destilação junto. */}
      {usage.data.length === 0 ? (
        <div className="mem-stat">
          <div className="n">0</div>
          <div className="l">uso registrado</div>
          <div className="hint">os números aparecem depois da primeira busca</div>
        </div>
      ) : null}
    </div>
  );
}
