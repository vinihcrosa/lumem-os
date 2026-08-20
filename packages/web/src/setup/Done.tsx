import { useQueries } from "@tanstack/react-query";

import { sessionsKey, worktreeDetailKey, WORKSPACES_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, MetaGrid, type MetaEntry } from "../ui/index.js";
import type { SetupResult } from "./SetupFlow.js";
import type { Position } from "./steps.js";
import { StepShell } from "./StepShell.js";

const AGENT_CONFIGS_KEY = ["agentConfig", "list"];

export interface DoneProps {
  result: SetupResult;
  skipped: readonly Position[];
  onOpen: () => void;
  onReview: () => void;
}

/**
 * The receipt: what now exists on this machine.
 *
 * Read back from the daemon, not assembled from what the flow remembers having
 * sent. Those are two different facts, and the interesting case is exactly when
 * they disagree — a rename by the daemon, a session that died on spawn, a
 * worktree whose directory the daemon reports as missing. A receipt that shows
 * what was *asked for* is the wrong receipt, and a tool that hides where it
 * wrote is a tool nobody trusts.
 */
export function Done({ result, skipped, onOpen, onReview }: DoneProps) {
  const [workspaces, agents, project, worktree, sessions] = useQueries({
    queries: [
      {
        queryKey: WORKSPACES_KEY,
        queryFn: () => trpc.workspace.list.query(),
      },
      {
        queryKey: AGENT_CONFIGS_KEY,
        queryFn: () => trpc.agentConfig.list.query(),
        enabled: result.agentConfigId !== undefined,
      },
      {
        queryKey: ["project", "get", result.projectId ?? ""],
        queryFn: () => trpc.project.get.query({ id: result.projectId ?? "" }),
        enabled: result.projectId !== undefined,
      },
      {
        queryKey: worktreeDetailKey(result.worktreeId ?? ""),
        queryFn: () => trpc.worktree.getDetail.query({ id: result.worktreeId ?? "" }),
        enabled: result.worktreeId !== undefined,
      },
      {
        queryKey: sessionsKey("worktree", result.worktreeId ?? ""),
        queryFn: () =>
          trpc.session.listByScope.query({ scopeType: "worktree", scopeId: result.worktreeId ?? "" }),
        enabled: result.worktreeId !== undefined,
      },
    ],
  });

  const workspace = workspaces.data?.find((row) => row.id === result.workspaceId);
  const agent = agents.data?.find((row) => row.id === result.agentConfigId);
  const session = sessions.data?.find((row) => row.kind === "agent");

  const entries: MetaEntry[] = [
    {
      label: "workspace",
      value: workspace?.name ?? <Pending />,
    },
    {
      label: "agente",
      value:
        agent === undefined ? (
          <Skipped step="agent" skipped={skipped} onReview={onReview} />
        ) : (
          <>
            {agent.command}
            {agent.adapterVersion !== null && ` @${agent.adapterVersion}`}{" "}
            <span className="dim">
              — {agent.transport === "acp" ? "conversa" : "terminal"}
              {agent.available ? "" : " · fora do PATH"}
            </span>
          </>
        ),
    },
    {
      label: "projeto",
      value:
        project.data == null ? (
          <Skipped step="project" skipped={skipped} onReview={onReview} />
        ) : (
          <>
            {project.data.path}
            {!project.data.available && <span className="dim"> — não está no disco</span>}
          </>
        ),
    },
    {
      label: "worktree",
      value:
        worktree.data == null ? (
          <Skipped step="task" skipped={skipped} onReview={onReview} />
        ) : (
          <>
            {worktree.data.path}
            {!worktree.data.present && <span className="dim"> — não está no disco</span>}
          </>
        ),
    },
    {
      label: "sessão",
      value:
        session === undefined ? (
          <span className="dim">nenhuma — abra uma quando quiser</span>
        ) : (
          <>
            {session.agentName ?? "agente"} <span className="dim">— {session.state}</span>
          </>
        ),
    },
  ];

  return (
    <StepShell
      narrow
      eyebrow="tudo configurado"
      title="Pronto. O resto acontece dentro do produto."
      lede="Foi isto que passou a existir na sua máquina:"
      primary={{ label: "Abrir o workspace" }}
      onSubmit={onOpen}
      extra={
        <Button variant="ghost" onClick={onReview}>
          Revisar a configuração
        </Button>
      }
    >
      <MetaGrid variant="recap" entries={entries} />

      {/*
        Onde as coisas ficam, e não uma lista de atalhos.
        A tela desenhada prometia ⌘K, ⌘⇧N e ⌥⇧P; existe um atalho neste app, e
        ensinar três que não existem é a pior lição possível — a primeira coisa
        que a pessoa tenta não funciona.
      */}
      <div className="keys">
        <div className="key">
          <span className="key__k">⌘⏎</span>
          <span className="key__d">
            enviar o turno — <span className="dim">⏎ faz linha nova</span>
          </span>
        </div>
        <div className="key">
          <span className="key__k">esquerda</span>
          <span className="key__d">
            projetos e worktrees; o rodapé adiciona projeto e configura agente
          </span>
        </div>
        <div className="key">
          <span className="key__k">abas</span>
          <span className="key__d">
            uma por sessão viva, mais <b>contexto</b> — a worktree em si
          </span>
        </div>
        <div className="key">
          <span className="key__k">direita</span>
          <span className="key__d">
            arquivos do checkout e o que mudou neles, ao lado da conversa
          </span>
        </div>
      </div>
    </StepShell>
  );
}

function Pending() {
  return <span className="dim">lendo do daemon…</span>;
}

/**
 * A step that was skipped says so, and says where it is resolved later.
 *
 * "—" would read as "the daemon has nothing", which is a different fact.
 */
function Skipped({
  step,
  skipped,
  onReview,
}: {
  step: Position;
  skipped: readonly Position[];
  onReview: () => void;
}) {
  const where: Record<string, string> = {
    agent: "no rodapé da sidebar, em agentes",
    project: "no rodapé da sidebar, em adicionar projeto",
    task: "no painel do projeto, em nova worktree",
  };

  if (!skipped.includes(step)) return <span className="dim">nada foi criado</span>;

  return (
    <span className="dim">
      pulado — dá para fazer {where[step]},{" "}
      <button type="button" className="key__link" onClick={onReview}>
        ou voltar ao fluxo
      </button>
    </span>
  );
}
