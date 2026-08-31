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
 * A pergunta da confirmação, com o número que a torna útil.
 *
 * `worktrees` é `null` quando o repositório sumiu do disco: a lista nem é
 * buscada nesse caso, e dizer "e o registro de 0 worktrees" seria afirmar algo
 * que a tela não sabe.
 */
function removalQuestion(name: string, worktrees: number | null): string {
  if (worktrees === null) return `remover "${name}" e o registro das worktrees dele?`;
  if (worktrees === 0) return `remover "${name}"?`;
  const plural = worktrees === 1 ? "1 worktree" : `${worktrees} worktrees`;
  return `remover "${name}" e o registro de ${plural}?`;
}

export function LocalPanel({
  projectId,
  workspaceId,
  workspaceName,
  onRemoved,
  onOpenWorkspace,
  onSelectWorktree,
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

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  /*
   * Removing the project asks first (F2.5).
   *
   * Not because the disk is at risk — it never is — but because there is no way
   * back: adopting a checkout the Lumem no longer knows about is in the backlog,
   * unbuilt, so the registration is the only handle on those worktrees and one
   * click drops N of them. The asymmetry is what settles it: removing *one*
   * dirty worktree asks, and this takes the whole set without a word.
   *
   * Client-side, unlike the worktree's: there the daemon refuses first and the
   * banner answers the refusal. Here the daemon has nothing to refuse, and a
   * `force` on the route would be a gate with nothing behind it.
   */
  const [confirming, setConfirming] = useState(false);

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
                <CreateWorktreeDialog projectId={projectId} onCreated={onSelectWorktree} />
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
