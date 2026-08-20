import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  CheckList,
  CheckRow,
  Field,
  Input,
  Skeleton,
  WizardSection,
} from "../ui/index.js";
import type { SetupResult } from "./SetupFlow.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";
import { useSettled } from "./useSettled.js";

export interface ProjectStepProps {
  /** Absent when the workspace step was reached out of order. */
  workspaceId: string | undefined;
  onNext: (patch: Partial<SetupResult>) => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * Step 4: the first project, described before it is registered.
 *
 * The path is typed, absolute, and there is no picker: the daemon may be on
 * another machine, and a browser's file input hands over a *file*, not a
 * server-side path. The design drew a `escolher…` affordance; it cannot exist,
 * and what replaces it is better — the daemon reads the repository while you
 * type and says what it understood.
 */
export function ProjectStep({ workspaceId, onNext, onBack, onSkip }: ProjectStepProps) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const settled = useSettled(path.trim());

  const inspect = useQuery({
    queryKey: ["project", "inspect", settled],
    queryFn: () => trpc.project.inspect.query({ path: settled }),
    // Absolute-only, checked here as well as in the daemon: without it every
    // relative path would spend a round trip to be told the same thing.
    enabled: settled.startsWith("/") || settled.startsWith("~"),
    retry: false,
  });

  const add = useMutation({
    mutationFn: () => {
      if (workspaceId === undefined) throw new Error("sem workspace não há onde adicionar");
      return trpc.project.add.mutate({ workspaceId, path: settled });
    },
    onSuccess: async (project) => {
      if (workspaceId !== undefined) {
        await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      }
      onNext({ projectId: project.id, projectPath: project.path });
    },
  });

  const described = inspect.data;
  const already = described?.alreadyRegistered ?? null;

  return (
    <StepShell
      eyebrow={eyebrowFor("project")}
      title="Adicione o primeiro projeto"
      lede={
        <>
          Projeto é um repositório git que <b>já existe</b> na sua máquina. O Lumem não move nem
          reescreve nada dele — só passa a criar worktrees a partir dele. Clonar de uma URL é outra
          história: rede, credencial e progresso são feature, não um campo.
        </>
      }
      primary={{
        label: already === null ? "Adicionar projeto" : "Usar o que já está aqui",
        disabled: described === undefined,
        isPending: add.isPending,
        pending: "validando…",
      }}
      onSubmit={() => {
        if (already !== null) {
          onNext({ projectId: already.id, projectPath: settled });
          return;
        }
        add.mutate();
      }}
      onBack={onBack}
      onSkip={onSkip}
    >
      <div className="wizard__body">
        <Field
          id="setup-project-path"
          label="Pasta do projeto — caminho absoluto"
          error={
            add.isError
              ? add.error.message
              : inspect.isError && settled !== ""
                ? inspect.error.message
                : undefined
          }
        >
          <Input
            id="setup-project-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/Users/voce/Documents/GitHub/lorebase"
            invalid={add.isError || inspect.isError}
            autoFocus
          />
        </Field>
        <span className="field__help">
          Digitado, não escolhido: o daemon pode estar em outra máquina, e o seletor de arquivo do
          navegador entrega arquivo, não caminho de servidor. Ele valida na hora e diz{" "}
          <b>qual</b> verificação falhou.
        </span>
      </div>

      {inspect.isFetching && <Skeleton label="lendo o repositório" />}

      {described !== undefined && (
        <>
          <WizardSection title="o que o Lumem leu daí">
            <CheckList label="o que o repositório é">
              <CheckRow
                state="ok"
                what="repositório"
                value={`git · ${described.commits} commit(s) · HEAD em ${
                  described.head.branch ?? "HEAD destacado"
                }${described.head.shortSha === null ? "" : ` · ${described.head.shortSha}`}`}
                status="ok"
              />
              <CheckRow
                state={described.origin === null ? "warn" : "ok"}
                what="remoto"
                value={described.origin ?? "sem origin — worktree funciona igual, push é que não"}
                status={described.origin === null ? "sem" : "ok"}
              />
              <CheckRow
                state={described.clean ? "ok" : "warn"}
                what="árvore"
                value={
                  described.clean
                    ? "limpa · nada por commitar"
                    : `${described.changedFiles} arquivo(s) por commitar — o Lumem não toca neles`
                }
                status={described.clean ? "limpa" : "suja"}
              />
              <CheckRow
                state={described.worktrees.length === 0 ? "ok" : "warn"}
                what="worktrees"
                value={
                  described.worktrees.length === 0
                    ? "nenhuma além do checkout principal"
                    : `${described.worktrees.length} já registrada(s) neste repositório, criada(s) fora do Lumem`
                }
                status={described.worktrees.length === 0 ? "ok" : "atenção"}
              />
            </CheckList>
            {described.worktrees.length > 0 && (
              <span className="field__help">
                Elas continuam onde estão. O Lumem não mexe em nenhuma delas, e não passa a
                listá-las — ver e administrar worktree criada fora daqui é outra feature.
              </span>
            )}
          </WizardSection>

          {already !== null && (
            <Banner tone="info">
              Este caminho já é o projeto <strong>{already.name}</strong> aqui. Nada será criado de
              novo — o fluxo segue com ele.
            </Banner>
          )}

          <Banner tone="info">
            Seu checkout em <code>{described.root}</code> continua sendo seu. O agente trabalha nas
            worktrees irmãs, fora dele.
          </Banner>
        </>
      )}
    </StepShell>
  );
}
