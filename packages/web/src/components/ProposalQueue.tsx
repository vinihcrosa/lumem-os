import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { tasksKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, SectionHead } from "../ui/index.js";

import { MemoryProposals, type ProposalStatus } from "./MemoryPanel.js";
import type { TaskRow } from "./TaskList.js";

import "./tasks.css";

/**
 * A fila de Propostas (`022-workspace-tasks` F4, T15).
 *
 * **Uma fila, dois tipos, um lugar.** A [T4](../../../docs/features/022-workspace-tasks/open-questions.md)
 * tirou a lista de propostas de memória de dentro do `MemoryPanel` e a trouxe
 * para cá, ao lado das tarefas propostas: um lugar para *"o que o sistema quer
 * que eu decida"* vale mais que dois — e com a `028`, três agentes por tarefa
 * propõem muito mais do que quando aquela pergunta foi escrita.
 *
 * **Ela não tem estado vazio.** Zero propostas é zero pixel: uma seção que diz
 * *"nada aqui"* todo dia ensina o olho a pular aquela região da tela, e no dia
 * em que houver algo ele pula igual.
 *
 * **Os verbos são diferentes por tipo, e é isso que "dois tipos" custa.** Tarefa
 * aprovada vira trabalho; memória aprovada muda o que todo agente lê no primeiro
 * turno. Achatar os dois para ficarem simétricos seria trocar a utilidade da
 * lista pela beleza dela.
 */

export interface ProposalQueueProps {
  workspaceId: string;
  projectName: (projectId: string) => string;
}

export function ProposalQueue({ workspaceId, projectName }: ProposalQueueProps) {
  /*
   * `pendentes · resolvidas`, e ele vale para os **dois** tipos.
   *
   * O controle mora aqui e não dentro da lista de memória: um segmentado que
   * filtra metade da fila é pior que nenhum. Sem ele, rejeitar apagaria a
   * proposta da tela inteira — não está na fila, não está no acervo — e você não
   * teria como lembrar o que já decidiu.
   */
  const [status, setStatus] = useState<ProposalStatus>("pending");
  // `dropped` é onde uma tarefa proposta vai parar quando você rejeita.
  const taskStatus = status === "pending" ? "proposed" : "dropped";

  const proposed = useQuery({
    queryKey: tasksKey(workspaceId, { status: taskStatus }),
    queryFn: () =>
      trpc.task.listByWorkspace.query({ workspaceId, status: taskStatus }) as Promise<TaskRow[]>,
  });
  const memory = useQuery({
    queryKey: ["memory", "proposals", status],
    queryFn: () => trpc.memory.proposals.query({ status }),
  });

  const tasks = proposed.data ?? [];
  const pendingMemory = memory.data?.length ?? 0;
  const total = tasks.length + pendingMemory;

  // Zero propostas = zero pixel, **e só quando não há nada pendente**: o
  // segmentado some junto, e com ele o caminho para "o que eu já decidi".
  if (total === 0 && status === "pending") return null;

  return (
    <section className="section">
      <SectionHead
        title="Propostas"
        count={total}
        aside={
          <div className="mem-seg" role="group" aria-label="Propostas por estado">
            <button
              type="button"
              className={`mem-seg__item${status === "pending" ? " mem-seg__item--active" : ""}`}
              aria-pressed={status === "pending"}
              onClick={() => setStatus("pending")}
            >
              Pendentes
            </button>
            <button
              type="button"
              className={`mem-seg__item${status !== "pending" ? " mem-seg__item--active" : ""}`}
              aria-pressed={status !== "pending"}
              onClick={() => setStatus("rejected")}
            >
              Resolvidas
            </button>
          </div>
        }
      />
      <div className="tlist">
        {tasks.map((row) => (
          <TaskProposal
            key={row.id}
            row={row}
            workspaceId={workspaceId}
            projectName={projectName(row.projectId)}
            decided={status !== "pending"}
          />
        ))}
      </div>
      {pendingMemory > 0 && <MemoryProposals status={status} />}
    </section>
  );
}

/**
 * Uma tarefa proposta por um agente para **outro** projeto.
 *
 * Escrever para cima é proposta (§3.2), e a proveniência é o que separa proposta
 * de lixo: quem propôs e de qual sessão aparecem sempre.
 *
 * **Rejeitar pede motivo** — é o que ensina o agente a não propor de novo, e é
 * o que o daemon cobra de qualquer jeito.
 */
function TaskProposal({
  row,
  workspaceId,
  projectName,
  decided,
}: {
  row: TaskRow;
  workspaceId: string;
  projectName: string;
  /** Já decidida: a mesma peça, sem verbos, com o que você respondeu. */
  decided: boolean;
}) {
  const client = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: (input: { status: string; reason?: string }) =>
      trpc.task.setStatus.mutate({ id: row.id, ...input } as never),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: tasksKey(workspaceId) });
    },
  });

  return (
    <div className="pq-item">
      <div className="pq-item__head">
        <span className="tprov__g" aria-hidden="true">
          ◆
        </span>
        <span className="pq-item__who">agente</span>
        <span className="pq-item__kind">tarefa · {projectName}</span>
      </div>
      <div className="pq-item__title">{row.title}</div>
      {row.body !== "" && <div className="pq-item__why">{row.body}</div>}

      {decide.isError && <Banner tone="danger">{decide.error.message}</Banner>}

      {decided ? (
        <div className="pq-item__acts">
          <span className="pq-item__verdict">✕ rejeitada</span>
          {row.reason !== null && row.reason !== "" && (
            <span className="pq-item__note">"{row.reason}"</span>
          )}
        </div>
      ) : rejecting ? (
        <div className="pq-item__acts">
          <input
            className="input"
            aria-label="por que rejeitar"
            placeholder="por que rejeitar?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            variant="danger"
            disabled={reason.trim() === "" || decide.isPending}
            onClick={() => decide.mutate({ status: "dropped", reason: reason.trim() })}
          >
            rejeitar
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(false)}>
            cancelar
          </Button>
        </div>
      ) : (
        <div className="pq-item__acts">
          <Button
            variant="primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ status: "open" })}
          >
            aprovar
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(true)}>
            rejeitar
          </Button>
          <span className="pq-item__note">
            rejeitar pede um motivo — é o que ensina o agente a não propor de novo
          </span>
        </div>
      )}
    </div>
  );
}
