import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { projectsKey, tasksKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, EmptyState, SectionHead, Skeleton } from "../ui/index.js";

import "./tasks.css";

/**
 * A lista de tarefas do workspace (`022-workspace-tasks` F1, T8).
 *
 * **Sem cabeçalho de grupo, e isso é a decisão.** A ordem vem do daemon —
 * `review` e `in_progress` primeiro, `open` depois, o que saiu do fluxo por
 * último — e o **estado é o primeiro item da linha**. Quando o primeiro item é o
 * critério de ordenação, a ordem se explica sozinha; cabeçalhos diriam de novo o
 * que o chip já diz e custariam a altura de duas tarefas numa coluna que divide
 * espaço com consumo e memória.
 *
 * **`done` fica recolhido** e `dropped` nem aparece: o primeiro é histórico e o
 * segundo é arquivo, alcançável pelo filtro de status com o motivo junto.
 */

export interface TaskRow {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  status: string;
  createdBy: string;
  createdBySession: string | null;
  worktreeId: string | null;
  links: string;
  reason: string | null;
}

/** O rótulo de cada estado — em minúscula, como o resto das colunas de meta. */
const STATUS_LABEL: Record<string, string> = {
  proposed: "proposta",
  open: "open",
  in_progress: "in progress",
  review: "review",
  done: "done",
  dropped: "dropped",
};

/**
 * O glifo de `done` e `dropped`.
 *
 * Os outros três usam o ponto — anel ou disco —, porque a pergunta deles é
 * *"alguém está?"*. Estes dois saíram do fluxo, e "alguém está" não se aplica:
 * o glifo diz o desfecho em vez de um estado que não existe mais.
 */
const STATUS_GLYPH: Record<string, string> = { done: "✓", dropped: "–" };

export interface TaskListProps {
  workspaceId: string;
  /** Quando presente, a lista é a do projeto — a mesma peça, um nível abaixo. */
  projectId?: string;
  onOpen: (taskId: string) => void;
  onCreate?: () => void;
}

export function TaskList({ workspaceId, projectId, onOpen, onCreate }: TaskListProps) {
  const [project, setProject] = useState<string | null>(projectId ?? null);
  const [showDone, setShowDone] = useState(false);

  const filter = project === null ? undefined : { projectId: project };
  const tasks = useQuery({
    queryKey: tasksKey(workspaceId, filter),
    queryFn: () =>
      trpc.task.listByWorkspace.query({
        workspaceId,
        ...(project === null ? {} : { projectId: project }),
      }) as Promise<TaskRow[]>,
  });

  const projects = useQuery({
    queryKey: projectsKey(workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId }),
    // Só o filtro precisa deles, e a lista do projeto não tem filtro.
    enabled: projectId === undefined,
  });

  const projectName = (id: string): string =>
    projects.data?.find((row) => row.id === id)?.name ?? "";

  const all = tasks.data ?? [];
  // `dropped` é arquivo: sai do fluxo e só volta pelo filtro de status, que é o
  // que faz a lista ser "o que está acontecendo" em vez de tudo que já existiu.
  const live = all.filter((row) => row.status !== "done" && row.status !== "dropped");
  const done = all.filter((row) => row.status === "done");

  return (
    <section className="section">
      <SectionHead
        title="Tarefas"
        count={all.length}
        aside={
          <>
            {projectId === undefined && (projects.data?.length ?? 0) > 1 && (
              <div className="seg" role="group" aria-label="Filtrar tarefas por projeto">
                <button
                  type="button"
                  className="seg__btn"
                  aria-pressed={project === null}
                  onClick={() => setProject(null)}
                >
                  todos
                </button>
                {projects.data?.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="seg__btn"
                    aria-pressed={project === row.id}
                    onClick={() => setProject(row.id)}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
            )}
            {onCreate && (
              <Button size="sm" onClick={onCreate}>
                ＋ tarefa
              </Button>
            )}
          </>
        }
      />

      {tasks.isError ? (
        <Banner tone="danger">{tasks.error.message}</Banner>
      ) : tasks.isPending ? (
        <Skeleton label="buscando as tarefas" widths={["90%", "70%"]} />
      ) : all.length === 0 ? (
        <EmptyState
          title="Nenhuma tarefa ainda"
          action={
            onCreate && (
              <Button variant="primary" onClick={onCreate}>
                criar a primeira
              </Button>
            )
          }
        >
          Tarefa é para o trabalho que você quer acompanhar — ela guarda o corpo, o checkout, as
          sessões e o custo. Conversa rápida continua a um clique, sem tarefa nenhuma.
        </EmptyState>
      ) : (
        <div className="tlist">
          {live.map((row) => (
            <TaskRowButton
              key={row.id}
              row={row}
              projectName={projectName(row.projectId)}
              onOpen={onOpen}
            />
          ))}

          {done.length > 0 && (
            <>
              <button
                type="button"
                className="tfold focus-ring"
                aria-expanded={showDone}
                onClick={() => setShowDone((open) => !open)}
              >
                <span className="tfold__caret" aria-hidden="true">
                  {showDone ? "▾" : "▸"}
                </span>
                done
                <span className="tfold__n">{done.length}</span>
              </button>
              {showDone &&
                done.map((row) => (
                  <TaskRowButton
                    key={row.id}
                    row={row}
                    projectName={projectName(row.projectId)}
                    onOpen={onOpen}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRowButton({
  row,
  projectName,
  onOpen,
}: {
  row: TaskRow;
  projectName: string;
  onOpen: (taskId: string) => void;
}) {
  const glyph = STATUS_GLYPH[row.status];
  return (
    <button
      type="button"
      className={`trow trow--${row.status} focus-ring`}
      onClick={() => onOpen(row.id)}
    >
      <span className="tstat">
        {glyph === undefined ? (
          <span className="tstat__dot" aria-hidden="true" />
        ) : (
          <span className="tstat__g" aria-hidden="true">
            {glyph}
          </span>
        )}
        {STATUS_LABEL[row.status] ?? row.status}
      </span>
      <span className="trow__t">
        {row.title}
        {/*
          O motivo mora no título, em cinza, na mesma linha — e trunca junto com
          ele quando é longo, com o texto inteiro no detalhe. Uma segunda linha
          por tarefa arquivada custaria altura em *toda* a lista para servir ao
          estado menos visitado dela.
        */}
        {row.reason !== null && row.reason !== "" && (
          <span className="trow__why"> — {row.reason}</span>
        )}
      </span>
      <span className="trow__proj">
        {projectName !== "" && (
          <>
            <span className="glyph glyph--project" aria-hidden="true">
              ■
            </span>
            {projectName}
          </>
        )}
      </span>
      <span className="tprov">
        {/*
          Só o que NÃO é o default tem marca: tarefa que você criou não ganha
          glifo nenhum, porque "você" é o normal e marcar o normal gasta a marca.
        */}
        {row.createdBy === "agent" && (
          <>
            <span className="tprov__g" aria-hidden="true">
              ◆
            </span>
            proposta
          </>
        )}
      </span>
      <span className="trow__wt">
        {/*
          Tarefa sem worktree não inventa um checkout: a célula fica vazia, e não
          com um traço ou um "nenhuma". Três `open` sem worktree formam uma coluna
          vazia que se lê de relance como "ninguém começou nenhuma dessas".
        */}
        {row.worktreeId !== null && (
          <span className="glyph glyph--worktree" aria-hidden="true">
            ◇
          </span>
        )}
      </span>
    </button>
  );
}
