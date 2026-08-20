import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { sessionsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Choice,
  ChoiceGroup,
  Field,
  Glyph,
  Input,
  MetaGrid,
  WizardSection,
} from "../ui/index.js";
import type { SetupResult } from "./SetupFlow.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";
import { useSettled } from "./useSettled.js";

export interface TaskStepProps {
  projectId: string | undefined;
  /** Absent when the agent step was skipped — then there is no session to offer. */
  agentConfigId: string | undefined;
  onNext: (patch: Partial<SetupResult>) => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * Step 5: every task is a worktree.
 *
 * The preview is the point of the screen. It shows the branch, the directory and
 * the literal `git worktree add` that is about to run — built by the daemon, in
 * the same place that executes it. It is a dev tool: showing the command teaches
 * the model in one second, and makes the result auditable when it surprises you.
 */
export function TaskStep({ projectId, agentConfigId, onNext, onBack, onSkip }: TaskStepProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("primeira-tarefa");
  const [withSession, setWithSession] = useState(true);
  const settled = useSettled(name.trim());

  const plan = useQuery({
    queryKey: ["worktree", "plan", projectId ?? "", settled],
    queryFn: () => trpc.worktree.plan.query({ projectId: projectId ?? "", name: settled }),
    enabled: projectId !== undefined && settled !== "",
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (projectId === undefined) throw new Error("sem projeto não há de onde cortar worktree");

      const worktree = await trpc.worktree.create.mutate({ projectId, name: settled });

      /*
       * The session comes second, and a failure here does not undo the worktree.
       *
       * That is deliberate: the worktree exists on disk and in the registry by
       * then, and rolling it back to report a failed spawn would delete a
       * checkout the user asked for. The screen says what happened instead.
       */
      let sessionId: string | undefined;
      if (withSession && agentConfigId !== undefined) {
        const session = await trpc.session.createAgent.mutate({
          scopeType: "worktree",
          scopeId: worktree.id,
          agentConfigId,
        });
        sessionId = session.id;
      }

      return { worktree, sessionId };
    },
    onSuccess: async ({ worktree, sessionId }) => {
      if (projectId !== undefined) {
        await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      }
      await queryClient.invalidateQueries({ queryKey: sessionsKey("worktree", worktree.id) });
      onNext({
        worktreeId: worktree.id,
        worktreeName: worktree.name,
        sessionOpened: sessionId !== undefined,
        ...(sessionId === undefined ? {} : { sessionId }),
      });
    },
  });

  const preview = plan.data;

  return (
    <StepShell
      eyebrow={eyebrowFor("task")}
      title="Toda tarefa vira uma worktree"
      lede="É a ideia central: em vez de trocar de branch no seu checkout, cada tarefa ganha uma branch e uma pasta próprias. Você pode ter três agentes trabalhando ao mesmo tempo e nenhum encosta no que o outro está fazendo."
      primary={{
        label: withSession && agentConfigId !== undefined ? "Criar e abrir a conversa" : "Criar a worktree",
        disabled: preview === undefined || preview.refusal !== null,
        isPending: create.isPending,
        pending: "criando…",
      }}
      onSubmit={() => create.mutate()}
      onBack={onBack}
      onSkip={onSkip}
    >
      <div className="wizard__body">
        <Field
          id="setup-task-name"
          label="Nome da tarefa"
          error={
            create.isError
              ? create.error.message
              : plan.isError
                ? plan.error.message
                : (preview?.refusal ?? undefined)
          }
        >
          <Input
            id="setup-task-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="primeira-tarefa"
            invalid={create.isError || plan.isError || preview?.refusal != null}
            autoFocus
          />
        </Field>
        <span className="field__help">Vira o nome da branch e o nome da pasta.</span>

        {preview !== undefined && (
          <MetaGrid
            variant="recap"
            entries={[
              {
                label: "branch",
                value: (
                  <>
                    {preview.branch}{" "}
                    <span className="dim">
                      ← {preview.baseBranch}
                      {preview.baseSha === null ? " · sem commit ainda" : ` · ${preview.baseSha}`}
                    </span>
                  </>
                ),
              },
              { label: "pasta", value: preview.path },
              { label: "comando", value: preview.command },
            ]}
          />
        )}
      </div>

      <WizardSection title="o que abre junto">
        <ChoiceGroup label="o que abre junto">
          <Choice
            title="Uma sessão do Claude"
            description={
              agentConfigId === undefined
                ? "Precisa de um agente ACP configurado — o passo 2 foi pulado."
                : "Abre a conversa já dentro da worktree."
            }
            glyph={<Glyph tone="agent">◆</Glyph>}
            selected={withSession && agentConfigId !== undefined}
            onSelect={() => setWithSession(true)}
            disabled={agentConfigId === undefined}
          />
          <Choice
            title="Só a worktree"
            description="Cria a pasta e a branch. Você abre sessão quando quiser."
            glyph={<Glyph tone="shell">●</Glyph>}
            selected={!withSession || agentConfigId === undefined}
            onSelect={() => setWithSession(false)}
          />
        </ChoiceGroup>
      </WizardSection>

      {projectId === undefined && (
        <Banner tone="warning">
          O passo do projeto foi pulado, então não há de onde cortar uma worktree. Pule este também —
          o painel do projeto tem <b>nova worktree</b> quando você adicionar um.
        </Banner>
      )}
    </StepShell>
  );
}
