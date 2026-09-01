import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import { relativeAge } from "../lib/relative-time.js";
import { worktreeDetailKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  Chip,
  CopyablePath,
  Glyph,
  MetaGrid,
  Skeleton,
} from "../ui/index.js";
import { ScopePanel } from "./ScopePanel.js";

import "./detail.css";

export interface WorktreePanelProps {
  worktreeId: string;
  projectId: string;
  workspaceName: string;
  onRemoved: () => void;
  /**
   * O caminho de volta (W7).
   *
   * Dois, e não um: de dentro de uma worktree, o workspace **e** o projeto dela
   * estão acima. Resolver só o workspace deixaria o mesmo beco um nível abaixo.
   */
  onOpenWorkspace: () => void;
  onOpenProject: () => void;
  /** Passed through to the tabs: a session to open on arrival, once. */
  openSessionId?: string | undefined;
  /** O pedido que abriu uma conversa (ver `ScopePanel`). */
  initialPrompt?: { sessionId: string; text: string } | undefined;
}

/** Branch, path, cleanliness and distance from the base — F4.10 — plus its tabs. */
export function WorktreePanel({
  worktreeId,
  projectId,
  workspaceName,
  onRemoved,
  onOpenWorkspace,
  onOpenProject,
  openSessionId,
  initialPrompt,
}: WorktreePanelProps) {
  const queryClient = useQueryClient();
  const [confirmingForce, setConfirmingForce] = useState(false);

  const detail = useQuery({
    queryKey: worktreeDetailKey(worktreeId),
    queryFn: () => trpc.worktree.getDetail.query({ id: worktreeId }),
  });

  // Same key the local panel uses, so the crumb costs a cache read.
  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  const remove = useMutation({
    mutationFn: (force: boolean) => trpc.worktree.remove.mutate({ id: worktreeId, force }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onRemoved();
    },
  });

  if (detail.isPending) {
    return (
      <div className="pane">
        <Skeleton label="carregando a worktree" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="pane">
        <Banner tone="danger">{detail.error.message}</Banner>
      </div>
    );
  }

  const { name, branch, path, state, present, status, aheadBehind, baseBranch, createdAt } =
    detail.data;
  const gone = !present || state === "missing";
  /** Quantos arquivos sujos, ou `null` quando não há sujeira a reportar. */
  const dirty = gone || status === null || status.clean ? null : status.changedFiles;
  const scope: Scope = { scopeType: "worktree", scopeId: worktreeId };

  return (
    <ScopePanel
      scope={scope}
      cwd={path}
      openSessionId={openSessionId}
      initialPrompt={initialPrompt}
      crumb={
        <nav className="crumb">
          {/* Todo segmento menos o último navega. O último é onde você está. */}
          <button type="button" className="crumb__up focus-ring" onClick={onOpenWorkspace}>
            {workspaceName}
          </button>
          <span className="crumb__sep" aria-hidden="true">
            /
          </span>
          <button type="button" className="crumb__up focus-ring" onClick={onOpenProject}>
            {project.data?.name ?? "…"}
          </button>
          <span className="crumb__sep" aria-hidden="true">
            /
          </span>
          {/*
            Q1, leitura B′. Com uma aba de sessão na frente, a branch sai da
            tela — e o caminho é o que sobra dizendo onde você está. Ele escreve
            o NOME do checkout, que no caminho comum é a mesma string da branch:
            imprimir as duas seria imprimir uma duas vezes.

            Quando elas divergem — worktree importada, ou clonada de fora — o
            nome deixa de responder "qual branch", e aí a branch entra. É a
            mesma regra que a sidebar já aplica na linha da worktree, e mantê-la
            aqui é o que impede a promessa de valer só no caso fácil.
          */}
          <span className="crumb__here">{name}</span>
          {branch !== name && <span className="crumb__branch">{branch}</span>}
        </nav>
      }
      checkout={{
        name,
        glyph: <Glyph tone={gone ? "warn" : "worktree"}>{gone ? "⚠" : "◇"}</Glyph>,
        // O ponto é o que sobrevive a outra aba estar na frente. Só a sujeira o
        // acende: limpa não põe nada, porque ponto que está sempre lá deixa de
        // ser sinal, e uma worktree ausente não tem árvore para estar suja.
        ...(dirty === null
          ? {}
          : {
              state: "dirty" as const,
              stateLabel: `árvore suja · ${dirty} ${dirty === 1 ? "arquivo" : "arquivos"}`,
            }),
      }}
      context={
        <>
          <div className="detail__title">
            <h2>
              <Glyph tone={gone ? "warn" : "worktree"}>{gone ? "⚠" : "◇"}</Glyph> {name}
            </h2>
            <span className="detail__kind">{gone ? "worktree ausente" : "worktree"}</span>
            <span className="actions__spacer" />
            {/* Stays put while the refusal is on screen. A blocked removal is
                usually fixed and retried — closing the sessions the daemon
                named, committing the work — and hiding this would leave forcing
                as the only way forward. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                remove.mutate(false, {
                  // The daemon decides whether it is blocked; the UI never
                  // second-guesses it by reading the status itself.
                  onError: () => setConfirmingForce(true),
                })
              }
              disabled={remove.isPending}
            >
              {remove.isPending ? "removendo…" : "remover worktree"}
            </Button>
          </div>

          {confirmingForce && (
            <div className="detail__banner">
              {/* Lives in the header, not in the context tab: the button that
                  triggers it is here, and a refusal that renders inside a tab
                  the user does not have open reads as the click doing nothing.

                  Explicit, and only after the daemon has already refused once —
                  this is the click that can destroy uncommitted work. */}
              <Banner
                tone="danger"
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove.mutate(true)}
                      disabled={remove.isPending}
                    >
                      remover mesmo assim
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingForce(false)}>
                      cancelar
                    </Button>
                  </>
                }
              >
                {remove.error?.message ?? "isso descarta as alterações não salvas."}
              </Banner>
            </div>
          )}

          {gone && (
            <div className="detail__banner">
              <Banner tone="warning">
                O diretório não está em <code>{path}</code>. Remover aqui só apaga o registro; a
                branch <code>{branch}</code> continua existindo.
              </Banner>
            </div>
          )}

          {/*
            O que a fila de chips não cabia. No cabeçalho fixo tudo isto tinha de
            entrar em duas linhas e virava chip truncado; como aba, cada coisa
            tem uma linha e um rótulo — e a distância da base e a idade, que
            simplesmente não cabiam, passam a existir na tela.
          */}
          <MetaGrid
            entries={[
              {
                label: "branch",
                value: (
                  <>
                    <Chip tone="branch" dot>
                      {branch}
                    </Chip>{" "}
                    <span className="dim">nasceu de {baseBranch}</span>
                  </>
                ),
              },
              {
                label: `em relação a ${baseBranch}`,
                value:
                  aheadBehind === null ? (
                    "desconhecido"
                  ) : (
                    <>
                      <span className="ahead">↑{aheadBehind.ahead}</span>{" "}
                      <span className="behind">↓{aheadBehind.behind}</span>{" "}
                      <span className="dim">
                        {aheadBehind.ahead} à frente, {aheadBehind.behind} atrás
                      </span>
                    </>
                  ),
              },
              {
                label: "estado",
                value: gone ? (
                  <Chip tone="missing" dot>
                    ausente do disco
                  </Chip>
                ) : status === null ? (
                  <Chip>estado desconhecido</Chip>
                ) : status.clean ? (
                  <Chip tone="clean" dot>
                    limpa
                  </Chip>
                ) : (
                  <Chip tone="dirty" dot>
                    suja · {status.changedFiles}{" "}
                    {status.changedFiles === 1 ? "arquivo" : "arquivos"}
                  </Chip>
                ),
              },
              // Inteiro e copiável, que é a razão de a aba existir.
              { label: "caminho", value: <CopyablePath path={path} /> },
              {
                label: "criada",
                value: <span className="dim">{relativeAge(createdAt)}</span>,
              },
            ]}
          />
          <p className="detail__hint">a branch não é apagada</p>
        </>
      }
    />
  );
}
