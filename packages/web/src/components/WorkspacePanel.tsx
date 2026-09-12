import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";

import {
  useUsageByProject,
  useUsageByProjectAndAgent,
  USAGE_WINDOWS,
  type ProjectAgentUsage,
  type UsageWindow,
} from "../hooks/useUsage.js";
import { projectsKey, WORKSPACES_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  MetaGrid,
  SectionHead,
  Skeleton,
} from "../ui/index.js";

import { MemoryPanel } from "./MemoryPanel.js";
import { ProposalQueue } from "./ProposalQueue.js";
import { TaskDetail } from "./TaskDetail.js";
import { TaskList } from "./TaskList.js";
import { SpendList, type SpendAgent, type SpendRow } from "./SpendList.js";

import "./detail.css";
import "./workspace.css";

/**
 * O workspace, como tela (`workspace-screen`).
 *
 * Ele ocupa o lugar onde estava escrito *"selecione uma worktree"* — a única
 * resposta do produto a "onde eu estou" que era uma instrução em vez de uma tela.
 *
 * **Sem abas** (W5): uma coluna. O painel direito já tem abas, e duas barras na
 * mesma tela obrigariam a pessoa a aprender qual é qual.
 *
 * **A memória é o mesmo componente da aba do projeto**, com `projectId: null`
 * (W1). Uma segunda tela de memória seria uma segunda semântica de precedência —
 * o defeito que a `workspace-memory` levou uma PR inteira para não ter. E é aqui
 * que ela deixa de depender de haver um projeto aberto, que era o buraco que
 * originou esta feature.
 */

export interface WorkspacePanelProps {
  workspaceId: string;
  workspaceName: string;
  /** Quando o workspace deixa de existir, quem navega é quem nos chamou. */
  onRemoved: () => void;
  /**
   * Abrir a conversa que "trabalhar nesta tarefa" acabou de criar.
   *
   * Quem navega é o App: esta tela não sabe o que é seleção de checkout, e
   * ensinar ela seria dar a uma tela a responsabilidade de outra.
   */
  onWorkOnTask?: (target: {
    projectId: string;
    worktreeId: string | null;
    sessionId: string;
    draft: string;
  }) => void;
}

export function WorkspacePanel({
  workspaceId,
  workspaceName,
  onRemoved,
  onWorkOnTask,
}: WorkspacePanelProps) {
  const [period, setPeriod] = useState<NonNullable<UsageWindow>>("7d");
  /*
   * A tarefa aberta ocupa a coluna inteira, no lugar das seções.
   *
   * Estado da tela e não da URL: o produto não tem rota, e a volta é o
   * breadcrumb — o mesmo caminho que a `workspace-screen` abriu para sair de um
   * checkout.
   */
  const [openTask, setOpenTask] = useState<string | null>(null);
  const projects = useQuery({
    queryKey: projectsKey(workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId }),
  });
  const usage = useUsageByProject(workspaceId, period);

  /*
   * A divisão por agente só é perguntada quando há mais de um (`second-agent`, C5).
   *
   * `agentConfig.list` é a consulta que o rodapé da coluna já mantém em cache, e é
   * ela que decide: com um agente a comparação não existe, e a segunda consulta
   * também não acontece. É a pergunta respondida em código e não em comentário.
   */
  const configs = useQuery({
    queryKey: AGENT_CONFIGS_KEY,
    queryFn: () => trpc.agentConfig.list.query(),
  });
  const manyAgents = (configs.data ?? []).filter((row) => row.transport === "acp").length > 1;
  const byAgent = useUsageByProjectAndAgent(workspaceId, period, manyAgents);

  const list = projects.data ?? [];
  const rows: SpendRow[] = (usage.data ?? []).map((row) => ({
    id: row.projectId,
    name: row.name,
    tokens: row.tokens,
    cost: row.cost,
    currency: row.currency,
    turns: row.turns,
    kind: "project",
    ...agentsOf(byAgent.data, row.projectId),
  }));

  if (openTask !== null) {
    return (
      <div className="pane wsp">
        <TaskDetail
          taskId={openTask}
          workspaceId={workspaceId}
          onBack={() => setOpenTask(null)}
          onWork={(target) => {
            setOpenTask(null);
            onWorkOnTask?.(target);
          }}
        />
      </div>
    );
  }

  return (
    <div className="pane wsp">
      <div className="detail__title">
        <h2>{workspaceName}</h2>
        <span className="wsp__kind">workspace</span>
        <span className="actions__spacer" />
        <RenameWorkspace id={workspaceId} name={workspaceName} />
        {/*
          `unknown` enquanto a lista não respondeu, e **não** zero: enquanto ela
          carrega, "quantos projetos tem dentro" não tem resposta, e um botão
          destrutivo habilitado por ignorância é o mesmo defeito do composer que
          mandava mensagem antes de o socket abrir.
        */}
        <RemoveWorkspace
          id={workspaceId}
          projects={projects.isPending ? "unknown" : list.length}
          onRemoved={onRemoved}
        />
      </div>

      <div className="chips">
        <Chip>
          {list.length} {list.length === 1 ? "projeto" : "projetos"}
        </Chip>
      </div>

      {projects.isError && (
        <div className="detail__banner">
          <Banner tone="danger">{projects.error.message}</Banner>
        </div>
      )}

      {projects.isPending ? (
        <Skeleton label="carregando os projetos" widths={["70%", "50%"]} />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhum projeto ainda">
          Um workspace é um conjunto de projetos que se conhecem. Adicione o primeiro pela barra da
          esquerda — e o que você ensinar aqui já vale para todos eles.
        </EmptyState>
      ) : (
        <MetaGrid
          entries={[
            { label: "projetos", value: String(list.length) },
            {
              label: "sem diretório",
              value:
                list.filter((project) => !project.available).length === 0 ? (
                  <span className="dim">nenhum</span>
                ) : (
                  `${String(list.filter((project) => !project.available).length)} de ${String(list.length)}`
                ),
            },
          ]}
        />
      )}

      {/*
        A ordem da tela é uma frase: o que precisa de **decisão sua**, o que está
        acontecendo, o que já aconteceu, o que ficou aprendido. A memória desceu
        um lugar, e é o custo de posição da T4.
      */}
      <ProposalQueue
        workspaceId={workspaceId}
        projectName={(id) => list.find((row) => row.id === id)?.name ?? ""}
      />

      <TaskList workspaceId={workspaceId} onOpen={(id) => setOpenTask(id)} />

      <section className="section">
        <SectionHead
          title="Consumo"
          aside={
            /*
              A janela é um segmentado, e ela **não** é lembrada entre escopos: a
              mesma pergunta em dois lugares diferentes é duas perguntas.
            */
            <div className="seg" role="group" aria-label="Janela de tempo do consumo">
              {USAGE_WINDOWS.map((window) => (
                <button
                  key={window.id}
                  type="button"
                  className="seg__btn"
                  aria-pressed={period === window.id}
                  onClick={() => setPeriod(window.id)}
                >
                  {window.label}
                </button>
              ))}
            </div>
          }
        />

        {usage.isError ? (
          <Banner tone="danger">{usage.error.message}</Banner>
        ) : usage.isPending ? (
          <Skeleton label="somando o consumo" widths={["90%", "70%"]} />
        ) : rows.length === 0 ? (
          <p className="detail__hint">nada gasto ainda neste workspace</p>
        ) : (
          <SpendList rows={rows} />
        )}
      </section>

      <section className="section">
        {/*
          O escopo é o do workspace: sem `projectId`, a lista mostra `workspace` e
          `você` e **não** mostra `projeto` — e essa ausência é a diferença visível
          entre este lugar e a aba do projeto.
        */}
        <MemoryPanel workspaceId={workspaceId} projectId={null} />
      </section>
    </div>
  );
}

/** Renomear em linha, sem modal — o produto não usa modal. */
function RenameWorkspace({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const client = useQueryClient();

  const rename = useMutation({
    mutationFn: (next: string) => trpc.workspace.rename.mutate({ id, name: next }),
    onSuccess: async () => {
      // O seletor do topo e esta tela têm que concordar **na hora**: um nome novo
      // em dois lugares diferentes é o começo de uma tela discordando de si mesma.
      await client.invalidateQueries({ queryKey: WORKSPACES_KEY });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
      >
        renomear
      </Button>
    );
  }

  return (
    <form
      className="wsp__rename"
      onSubmit={(event) => {
        event.preventDefault();
        const next = draft.trim();
        if (next === "" || next === name) {
          setEditing(false);
          return;
        }
        rename.mutate(next);
      }}
    >
      <input
        className="wsp__input focus-ring"
        aria-label="Nome do workspace"
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
      />
      <Button variant="primary" size="sm" type="submit" disabled={rename.isPending}>
        salvar
      </Button>
      {rename.isError && <Banner tone="danger">{rename.error.message}</Banner>}
    </form>
  );
}

/**
 * Remover, com a guarda que o banco já impõe (W2).
 *
 * Desabilitado **com o motivo ao lado**: o schema recusa por `ON DELETE RESTRICT`,
 * e um botão apagado sem explicação é uma recusa que a pessoa vai tentar de novo.
 */
function RemoveWorkspace({
  id,
  projects,
  onRemoved,
}: {
  id: string;
  /** `"unknown"` enquanto a lista de projetos não respondeu. */
  projects: number | "unknown";
  onRemoved: () => void;
}) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => trpc.workspace.remove.mutate({ id }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: WORKSPACES_KEY });
      onRemoved();
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={projects === "unknown" || projects > 0 || remove.isPending}
        onClick={() => remove.mutate()}
      >
        {/*
          `remover workspace` e não `remover`: o rodapé da sidebar tem o seu
          próprio `remover` (o do agente), e dois botões com o mesmo nome na mesma
          tela é ambiguidade para quem lê com leitor de tela antes de ser
          ambiguidade num teste. O precedente é o `remover projeto` do `LocalPanel`.
        */}
        {remove.isPending ? "removendo…" : "remover workspace"}
      </Button>
      {typeof projects === "number" && projects > 0 && (
        <span className="wsp__why">
          {projects} {projects === 1 ? "projeto dentro" : "projetos dentro"}
        </span>
      )}
      {remove.isError && <Banner tone="danger">{remove.error.message}</Banner>}
    </>
  );
}

/** A chave que o rodapé da coluna já mantém: reusada, não duplicada. */
const AGENT_CONFIGS_KEY = ["agentConfig", "list"];

/**
 * As sub-linhas de um projeto, quando a consulta agrupada respondeu.
 *
 * Devolve `{}` — e não `{ agents: [] }` — quando não há divisão: a `SpendList`
 * decide abrir pela **presença** do campo, e um array vazio faria a lista ganhar a
 * coluna do `▸` para não mostrar nada dentro dela.
 */
function agentsOf(
  rows: readonly ProjectAgentUsage[] | undefined,
  projectId: string,
): { agents?: readonly SpendAgent[] } {
  const mine = (rows ?? [])
    .filter((row) => row.projectId === projectId)
    .map(
      (row): SpendAgent => ({
        // O id da linha é o do agente, e `sem-agente` para o turno que não tem um:
        // duas linhas sem chave estável reordenariam a cada resposta.
        id: row.agentConfigId ?? "sem-agente",
        name: row.name,
        tokens: row.tokens,
        cost: row.cost,
        currency: row.currency,
        turns: row.turns,
      }),
    );

  return mine.length > 0 ? { agents: mine } : {};
}
