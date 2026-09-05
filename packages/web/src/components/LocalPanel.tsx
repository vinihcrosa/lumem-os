import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import { useUsageByWorktree, USAGE_WINDOWS, type UsageWindow } from "../hooks/useUsage.js";
import { projectsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Chip, Glyph, Item, MetaGrid, SectionHead, Skeleton } from "../ui/index.js";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.js";
import { ScopePanel } from "./ScopePanel.js";
import { SpendList, type SpendRow } from "./SpendList.js";

import "./detail.css";
import "./workspace.css";

export interface LocalPanelProps {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  onRemoved: () => void;
  /** O caminho de volta (W7): daqui, o único lugar acima é o workspace. */
  onOpenWorkspace: () => void;
  onSelectWorktree: (worktreeId: string) => void;
  /** Uma sessão para trazer à frente, uma vez — ver `ScopePanel`. */
  openSessionId?: string | undefined;
  /** O pedido que abriu uma conversa (ver `ScopePanel`). */
  initialPrompt?: { sessionId: string; text: string } | undefined;
}

/**
 * The project's own checkout, as a worktree named `local`.
 *
 * It carries what used to be the project detail — path, base branch, the list
 * of worktrees, and the actions on the registration — because that is where a
 * user standing in the main checkout would look for them.
 */
/**
 * O que cada worktree deste projeto gastou (`workspace-screen`, W4).
 *
 * A janela **não** é lembrada da tela do workspace: escopo diferente é pergunta
 * diferente, e herdar o `1m` que você escolheu lá mostraria aqui um número que
 * você não pediu.
 *
 * A linha `direto no projeto` fecha a conta: sessão de escopo `project` não
 * pertence a worktree nenhuma, e sem ela a soma das worktrees não bate com o
 * total que a tela do workspace mostra para este projeto — a diferença apareceria
 * como número faltando sem explicação.
 */
function ProjectSpend({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<NonNullable<UsageWindow>>("7d");
  const usage = useUsageByWorktree(projectId, period);

  const rows: SpendRow[] = [
    ...(usage.data?.worktrees ?? []).map((row) => ({
      id: row.worktreeId,
      name: row.name,
      tokens: row.tokens,
      cost: row.cost,
      currency: row.currency,
      turns: row.turns,
      kind: "worktree" as const,
    })),
  ];
  const outside = usage.data?.outside;
  if (outside !== undefined && (outside.turns > 0 || rows.length > 0)) {
    rows.push({
      id: "__outside__",
      name: "direto no projeto",
      tokens: outside.tokens,
      cost: outside.cost,
      currency: outside.currency,
      turns: outside.turns,
      kind: "project",
      outside: true,
    });
  }

  return (
    <section className="section">
      <SectionHead
        title="Consumo por worktree"
        aside={
          <div className="seg" role="group" aria-label="Janela de tempo do consumo do projeto">
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
        <p className="detail__hint">somando o consumo…</p>
      ) : rows.length === 0 ? (
        <p className="detail__hint">nada gasto ainda neste projeto</p>
      ) : (
        <SpendList rows={rows} />
      )}
    </section>
  );
}

/**
 * A pergunta da confirmação por caminho, com o número que a torna útil.
 *
 * "da lista" carrega o contraste com o projeto clonado, cuja pergunta é "apagar
 * do disco?" — as duas remoções têm que se distinguir na primeira linha.
 *
 * `worktrees` é `null` quando o repositório sumiu do disco: a lista nem é
 * buscada nesse caso, e dizer "e o registro de 0 worktrees" seria afirmar algo
 * que a tela não sabe.
 */
function removalQuestion(name: string, worktrees: number | null): string {
  if (worktrees === null) return `remover ${name} da lista, e o registro das worktrees dele?`;
  if (worktrees === 0) return `remover ${name} da lista?`;
  const plural = worktrees === 1 ? "1 worktree" : `${worktrees} worktrees`;
  return `remover ${name} da lista, e o registro de ${plural}?`;
}

export function LocalPanel({
  projectId,
  workspaceId,
  workspaceName,
  onRemoved,
  onOpenWorkspace,
  onSelectWorktree,
  openSessionId,
  initialPrompt,
}: LocalPanelProps) {
  const queryClient = useQueryClient();
  const scope: Scope = { scopeType: "project", scopeId: projectId };

  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  const worktrees = useQuery({
    queryKey: worktreesKey(projectId),
    queryFn: () => trpc.worktree.listByProject.query({ projectId }),
    enabled: project.data?.available === true,
  });

  /*
   * Removing the project asks first (F2.5, F6.9).
   *
   * Two reasons, and which one applies depends on the project. For a **cloned**
   * one the directory is about to stop existing, which is reason enough on its
   * own. For one registered **by path** the disk is never at risk — what has no
   * way back is the registration, and it takes N worktrees with it: adopting a
   * checkout the Lumem no longer knows about is in the backlog, unbuilt. The
   * asymmetry is what settles it: removing *one* dirty worktree asks, and this
   * took the whole set without a word.
   */
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  if (confirming && project.data) {
    return (
      <RemoveProjectConfirm
        project={project.data}
        worktrees={worktrees.data?.length ?? null}
        pending={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onCancel={() => {
          setConfirming(false);
          remove.reset();
        }}
        onConfirm={() => remove.mutate()}
      />
    );
  }

  if (project.isPending) {
    return (
      <div className="pane">
        <Skeleton label="carregando o projeto" />
      </div>
    );
  }
  if (!project.data) {
    return (
      <div className="pane">
        <p role="alert">projeto não encontrado</p>
      </div>
    );
  }

  const { name, path, defaultBranch, available } = project.data;
  const list = worktrees.data ?? [];

  return (
    <ScopePanel
      scope={scope}
      cwd={path}
      openSessionId={openSessionId}
      initialPrompt={initialPrompt}
      header={
        <>
          <nav className="crumb">
            <button type="button" className="crumb__up focus-ring" onClick={onOpenWorkspace}>
              {workspaceName}
            </button>
            <span className="crumb__sep" aria-hidden="true">
              /
            </span>
            {name}
            <span className="crumb__sep" aria-hidden="true">
              /
            </span>
            <span className="crumb__here">local</span>
          </nav>

          <div className="detail__title">
            <h2>
              <Glyph tone={available ? "project" : "off"}>▭</Glyph> local
            </h2>
            <span className="actions__spacer" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "removendo…" : "remover projeto"}
            </Button>
          </div>

          <div className="chips">
            {/* No clean/dirty chip: the daemon reports status for a worktree it
                created, not for the checkout it merely registered. Saying
                nothing beats guessing. */}
            <Chip tone="branch" dot>
              {defaultBranch}
            </Chip>
            {available && (
              <Chip>
                {list.length} {list.length === 1 ? "worktree" : "worktrees"}
              </Chip>
            )}
          </div>

          {confirming && (
            <div className="detail__banner">
              {/* In the header, next to the button that opened it: a question
                  rendered inside a tab the user does not have open reads as the
                  click having done nothing. */}
              <Banner
                tone="danger"
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove.mutate()}
                      disabled={remove.isPending}
                    >
                      remover
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                      cancelar
                    </Button>
                  </>
                }
              >
                {remove.isError ? (
                  remove.error.message
                ) : (
                  <>
                    <strong>{removalQuestion(name, available ? list.length : null)}</strong> Os
                    diretórios continuam no disco — some a alça que o Lumem tem sobre eles, e
                    readotar um checkout que já existe é coisa que o Lumem ainda não sabe fazer.
                  </>
                )}
              </Banner>
            </div>
          )}
        </>
      }
      context={
        <>
          {available ? (
            <div className="detail__banner">
              <Banner tone="info">
                <strong>Este é o repositório em si, não uma worktree do Lumem.</strong> Remover o
                projeto tira o registro — o diretório e o que está dentro dele ficam no disco.
              </Banner>
            </div>
          ) : (
            <div className="detail__banner">
              <Banner tone="danger">
                <strong>O repositório não está mais em {path}.</strong> As ações sobre ele ficam
                bloqueadas até que ele volte; o registro continua aqui.
              </Banner>
            </div>
          )}

          <MetaGrid
            entries={[
              { label: "caminho", value: path, title: path },
              {
                label: "branch base",
                value: (
                  <>
                    {defaultBranch} <span className="dim">· resolvida na adição</span>
                  </>
                ),
              },
            ]}
          />

          {available && (
            <>
              <div className="actions">
                <CreateWorktreeDialog
                  projectId={projectId}
                  onCreated={onSelectWorktree}
                  hasCommits={project.data.hasCommits}
                />
              </div>

              {/*
                O consumo por worktree (`workspace-screen`, W4): a mesma linguagem
                da tela do workspace, um nível abaixo — quem aprendeu a ler lá lê
                aqui.
              */}
              <ProjectSpend projectId={projectId} />

              <section className="section">
                <SectionHead title="Worktrees deste projeto" count={list.length} />
                {list.length === 0 ? (
                  <p className="detail__hint">nenhuma worktree ainda</p>
                ) : (
                  list.map((worktree) => (
                    <Item
                      key={worktree.id}
                      name={worktree.name}
                      glyph={
                        <Glyph tone={worktree.state === "missing" ? "warn" : "worktree"}>
                          {worktree.state === "missing" ? "⚠" : "◇"}
                        </Glyph>
                      }
                      detail={worktree.path}
                      state={
                        worktree.state === "missing"
                          ? { label: "ausente", tone: "missing" }
                          : undefined
                      }
                      onSelect={() => onSelectWorktree(worktree.id)}
                    />
                  ))
                )}
              </section>
            </>
          )}
        </>
      }
    />
  );
}

/**
 * The most dangerous screen of the nine, F6.9.
 *
 * Two removals wearing one word. For a **cloned** project it deletes the
 * directory, because the daemon wrote those bytes into a directory the daemon
 * chose. For a project registered by path it takes it off the list and the disk
 * is untouched, exactly as F2.5 has always promised.
 *
 * The two texts have to be told apart at first reading — which is why they are
 * two texts and not one text with a conditional clause, and why the destructive
 * one prints the absolute path that is about to stop existing.
 */
function RemoveProjectConfirm({
  project,
  worktrees,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  project: { name: string; path: string; managed: boolean };
  /**
   * Quantas worktrees vão junto — só a remoção por caminho as leva (WS-Q22).
   *
   * `null` quando o repositório sumiu do disco e a lista nem foi buscada. No
   * projeto clonado o número não entra na pergunta: lá a worktree **recusa** a
   * remoção em vez de acompanhá-la, e a recusa chega pelo banner.
   */
  worktrees: number | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="pane">
      <div className="remove-confirm" role="alertdialog" aria-label="confirmar remoção">
        {project.managed ? (
          <>
            <h2 className="remove-confirm__title">apagar {project.name} do disco?</h2>
            <p className="remove-confirm__body">
              Este projeto foi clonado pelo Lumem. Remover tira do registro <strong>e apaga o
              diretório</strong>. Não dá para desfazer.
            </p>
            <p className="remove-confirm__path">{project.path}</p>
          </>
        ) : (
          <>
            {/* O número está no título e não no corpo porque é ele que muda a
                resposta: "remover um projeto" e "remover um projeto e o
                registro de 3 worktrees" são duas decisões diferentes. */}
            <h2 className="remove-confirm__title">{removalQuestion(project.name, worktrees)}</h2>
            <p className="remove-confirm__body">
              Este projeto aponta para um repositório <strong>seu</strong>. Sai da lista; o
              diretório fica exatamente onde está — o dele e o de cada worktree, com trabalho
              não commitado e tudo.
            </p>
          </>
        )}

        {/* Worktrees and running sessions refuse before anything is deleted, and
            the refusal shows here rather than after the confirmation — nobody
            should be asked to confirm something that is going to be refused. */}
        {error !== null && <Banner tone="danger">{error}</Banner>}

        <div className="remove-confirm__actions">
          <Button variant={project.managed ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending ? "removendo…" : project.managed ? "apagar" : "remover"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
