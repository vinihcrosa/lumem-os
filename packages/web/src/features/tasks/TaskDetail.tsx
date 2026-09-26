import { useState } from "react";

import { useAgentConfigs } from "../agent/index.js";
import { useSessionsByTask } from "../checkout/index.js";
import { useTaskDetail, useTaskStatusMutation, useWorkOnTaskMutation } from "./queries.js";
import { useWorktrees } from "../workspace/index.js";
import { Banner, Button, Chip, Modal, SectionHead, Skeleton } from "../../ui/index.js";


/**
 * O detalhe da tarefa (`022-workspace-tasks` F1, T9 e T10).
 *
 * É a **única tela do produto que soma sessões**: `session_usage` já tinha
 * sessão, e a sessão passou a ter tarefa — a soma é uma consulta, não uma coluna
 * nova. E ela conta as três espécies: se você subiu a aplicação numa `shell`
 * para conferir o que o agente fez, aquilo foi trabalho desta tarefa.
 *
 * **`marcar done` aparece porque você é humano** (T9). Nenhum caminho desta tela
 * oferece `done` a um agente: o que ele alcança é `review`, pela porta HTTP, que
 * é a palavra certa para o que ele sabe.
 */

export interface TaskDetailProps {
  taskId: string;
  workspaceId: string;
  onBack: () => void;
  /** Abre a conversa que acabou de nascer, com o corpo já no composer. */
  onWork: (target: {
    projectId: string;
    worktreeId: string | null;
    sessionId: string;
    draft: string;
  }) => void;
}

export function TaskDetail({ taskId, workspaceId, onBack, onWork }: TaskDetailProps) {
  const [working, setWorking] = useState(false);

  const task = useTaskDetail(taskId);
  const setStatus = useTaskStatusMutation(workspaceId, taskId);

  if (task.isError) return <Banner tone="danger">{task.error.message}</Banner>;
  if (task.isPending) return <Skeleton label="buscando a tarefa" />;
  if (task.data === null) {
    return <Banner tone="warning">esta tarefa não existe mais</Banner>;
  }

  const row = task.data;
  const closed = row.status === "done" || row.status === "dropped";

  return (
    <div className="task-detail">
      <div className="crumb">
        <button type="button" className="crumb__up focus-ring" onClick={onBack}>
          Tarefas
        </button>
        <span className="crumb__sep">/</span>
        <span className="crumb__here">{row.title}</span>
      </div>

      <div className="task-detail__head">
        <h2 className="task-detail__title">{row.title}</h2>
        <span className="task-detail__acts">
          {!closed && (
            <Button variant="primary" onClick={() => setWorking(true)}>
              trabalhar nesta tarefa
            </Button>
          )}
          {!closed && (
            <Button onClick={() => setStatus.mutate({ status: "done" })}>marcar done</Button>
          )}
          {!closed && (
            <Button
              variant="ghost"
              onClick={() => {
                // Sem motivo, `dropped` é indistinguível de esquecimento — e o
                // daemon recusa, então perguntar aqui é o que evita um erro que
                // a pessoa não pediu.
                const reason = window.prompt("por que descartar esta tarefa?");
                if (reason !== null && reason.trim() !== "") {
                  setStatus.mutate({ status: "dropped", reason: reason.trim() });
                }
              }}
            >
              descartar
            </Button>
          )}
          {closed && <Button onClick={() => setStatus.mutate({ status: "open" })}>reabrir</Button>}
        </span>
      </div>

      {setStatus.isError && <Banner tone="danger">{setStatus.error.message}</Banner>}

      <div className="chips">
        <Chip>{row.status}</Chip>
        {row.createdBy === "agent" && <Chip>◆ proposta por agente</Chip>}
        {row.worktreeId === null ? (
          <Chip>sem checkout</Chip>
        ) : (
          <Chip tone="branch">◇ checkout</Chip>
        )}
        {row.reason !== null && row.reason !== "" && <Chip>{row.reason}</Chip>}
      </div>

      {row.body !== "" && (
        <section className="section">
          <SectionHead title="O corpo" />
          <div className="task-detail__body">{row.body}</div>
        </section>
      )}

      <TaskSessions taskId={taskId} />

      {working && (
        <WorkOnTask
          taskId={taskId}
          projectId={row.projectId}
          title={row.title}
          body={row.body}
          worktreeId={row.worktreeId}
          onClose={() => setWorking(false)}
          onOpened={(target) => {
            setWorking(false);
            onWork(target);
          }}
        />
      )}
    </div>
  );
}

/**
 * As sessões da tarefa, com o custo somado.
 *
 * Lidas do escopo e filtradas pelo `taskId` da linha: uma tarefa tem N sessões e
 * uma sessão tem no máximo uma tarefa, então a ligação já existe e não precisa
 * de um endpoint próprio.
 */
function TaskSessions({ taskId }: { taskId: string }) {
  const sessions = useSessionsByTask(taskId);

  const rows = sessions.data ?? [];

  return (
    <section className="section">
      <SectionHead title="As sessões" count={rows.length} />
      {sessions.isError ? (
        <Banner tone="danger">{sessions.error.message}</Banner>
      ) : sessions.isPending ? (
        <Skeleton label="buscando as sessões" widths={["80%"]} />
      ) : rows.length === 0 ? (
        <p className="detail__hint">ninguém trabalhou nesta tarefa ainda</p>
      ) : (
        <div className="tlist">
          {rows.map((session) => (
            <div className="task-sessions" key={session.id}>
              <span className="task-sessions__kind">
                <span
                  className={`glyph glyph--${session.kind === "agent" ? "agent" : "shell"}`}
                  aria-hidden="true"
                >
                  {session.kind === "agent" ? "◆" : "●"}
                </span>
                {session.agentName ?? session.kind}
              </span>
              <span className="task-sessions__when">{session.command}</span>
              <span className={`task-sessions__st task-sessions__st--${session.state}`}>
                <span className="task-sessions__dot" aria-hidden="true" />
                {session.state === "running" ? "viva" : "encerrada"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Trabalhar nesta tarefa (F2, T10).
 *
 * Duas escolhas, **na ordem em que se pensa**: onde, e só então quem. Invertida,
 * o agente viraria a pergunta principal — e ele tem default, enquanto o checkout
 * não necessariamente tem.
 *
 * **O composer chega preenchido, não enviado** (T6): é a mesma regra do núcleo da
 * memória — injeção invisível é proibida, e um prompt disparado sem você ler é
 * uma injeção que custa dinheiro.
 */
function WorkOnTask({
  taskId,
  projectId,
  title,
  body,
  worktreeId,
  onClose,
  onOpened,
}: {
  taskId: string;
  projectId: string;
  title: string;
  body: string;
  worktreeId: string | null;
  onClose: () => void;
  onOpened: (target: {
    projectId: string;
    worktreeId: string | null;
    sessionId: string;
    draft: string;
  }) => void;
}) {
  // Já existe checkout? Então o default é ele: a tarefa já apontava para lá, e
  // oferecer "worktree nova" primeiro seria propor um segundo lugar para o mesmo
  // trabalho.
  const [mode, setMode] = useState<"new" | "existing">(worktreeId === null ? "new" : "existing");
  const [name, setName] = useState(() => suggestName(title));
  const [checkout, setCheckout] = useState<string | null>(worktreeId);

  const worktrees = useWorktrees(projectId);
  const agents = useAgentConfigs();
  const [agentId, setAgentId] = useState<string | null>(null);
  const chosenAgent = agentId ?? agents.data?.[0]?.id ?? null;

  const open = useWorkOnTaskMutation(taskId, projectId, body);

  const submit = (): void => {
    open.mutate(
      { mode, name, checkout, agentConfigId: chosenAgent },
      { onSuccess: (result) => onOpened({ projectId, ...result }) },
    );
  };

  return (
    <Modal open title="Trabalhar nesta tarefa" onClose={onClose}>
      <div className="work">
        <div className="seg" role="group" aria-label="onde trabalhar">
          <button
            type="button"
            className="seg__btn"
            aria-pressed={mode === "new"}
            onClick={() => setMode("new")}
          >
            worktree nova
          </button>
          <button
            type="button"
            className="seg__btn"
            aria-pressed={mode === "existing"}
            onClick={() => setMode("existing")}
          >
            checkout existente
          </button>
        </div>

        {mode === "new" ? (
          <label className="field">
            <span className="field__label">Nome da worktree</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <span className="field__help">
              derivado do título — a sugestão é do Lumem, e o nome continua seu
            </span>
          </label>
        ) : (
          <div className="work__list" role="listbox" aria-label="checkouts">
            {(worktrees.data ?? []).map((row) => (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={checkout === row.id}
                className={`wopt${checkout === row.id ? " is-selected" : ""}`}
                onClick={() => setCheckout(row.id)}
              >
                <span className="glyph glyph--worktree" aria-hidden="true">
                  ◇
                </span>
                <span className="wopt__name">{row.name}</span>
              </button>
            ))}
          </div>
        )}

        {(agents.data?.length ?? 0) > 1 && (
          <div className="work__list" role="listbox" aria-label="agentes">
            {agents.data?.map((row) => (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={chosenAgent === row.id}
                className={`wopt${chosenAgent === row.id ? " is-selected" : ""}`}
                onClick={() => setAgentId(row.id)}
              >
                <span className="glyph glyph--agent" aria-hidden="true">
                  ◆
                </span>
                <span className="wopt__name">{row.name}</span>
              </button>
            ))}
          </div>
        )}

        {open.isError && <Banner tone="danger">{open.error.message}</Banner>}

        <div className="modal__foot">
          <Button variant="primary" disabled={open.isPending} onClick={submit}>
            {open.isPending ? "abrindo…" : "abrir"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * O nome da worktree, derivado do título.
 *
 * Sugestão, não regra: o campo continua editável. Minúsculas, sem acento, e
 * hífen no lugar do que não é letra — o mesmo alfabeto que uma branch aceita.
 */
export function suggestName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-");
  return slug === "" ? "tarefa" : slug;
}
