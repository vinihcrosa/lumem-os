import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { WORKSPACES_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Field, Input, MetaGrid, WizardSection } from "../ui/index.js";
import { PREFLIGHT_KEY } from "./MachineStep.js";
import type { SetupResult } from "./SetupFlow.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";

export interface WorkspaceStepProps {
  onNext: (patch: Partial<SetupResult>) => void;
  onBack: () => void;
}

/**
 * Step 3: the first workspace — and the one step with no "pular".
 *
 * Without a workspace there is no app: the sidebar, the project list and every
 * session are scoped to one. That is why this replaced `FirstRun` rather than
 * living beside it — two ways to create a workspace would mean one of them
 * skipping the other four steps.
 */
export function WorkspaceStep({ onNext, onBack }: WorkspaceStepProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("pessoal");

  // Already read by the machine step, so this is a cache hit in the normal path
  // and a real call for someone who skipped straight here.
  const preflight = useQuery({
    queryKey: PREFLIGHT_KEY,
    queryFn: () => trpc.setup.preflight.query(),
    refetchOnWindowFocus: false,
  });

  const create = useMutation({
    mutationFn: () => trpc.workspace.create.mutate({ name: name.trim() }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
      onNext({ workspaceId: workspace.id, workspaceName: workspace.name });
    },
  });

  const paths = preflight.data?.paths;

  return (
    <StepShell
      eyebrow={eyebrowFor("workspace")}
      title="Crie seu primeiro workspace"
      lede="Um workspace agrupa projetos e guarda as worktrees deles num lugar só. Quem trabalha em coisas separadas — pessoal e cliente, por exemplo — mantém dois, e eles nunca se veem."
      primary={{
        label: "Criar workspace",
        disabled: name.trim() === "",
        isPending: create.isPending,
        pending: "criando…",
      }}
      onSubmit={() => create.mutate()}
      onBack={onBack}
    >
      <div className="wizard__body">
        <Field
          id="setup-workspace-name"
          label="Nome"
          // The daemon's own words. A duplicate name is the common one, and only
          // it knows which of its constraints refused.
          error={create.isError ? create.error.message : undefined}
        >
          <Input
            id="setup-workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="pessoal"
            invalid={create.isError}
            autoFocus
          />
        </Field>
        <span className="field__help">
          Aparece no topo da coluna da esquerda. Dá para renomear depois.
        </span>

        {paths !== undefined && (
          <Field id="setup-worktrees-dir" label="Onde ficam as worktrees — leitura">
            <Input id="setup-worktrees-dir" value={paths.worktreesDir} readOnly />
          </Field>
        )}
        <span className="field__help">
          Fora dos seus repositórios, de propósito: worktree dentro do checkout suja{" "}
          <code>git status</code> e acaba commitada por acidente. Quem muda o lugar é a variável{" "}
          <code>LUMEM_STATE_DIR</code> do daemon.
        </span>
      </div>

      {paths !== undefined && (
        <WizardSection title="o que este passo escreve no disco">
          {/* Os caminhos vêm do daemon, não de uma lista escrita à mão aqui: quem
              move o `LUMEM_STATE_DIR` é a única pessoa para quem essa lista
              mentiria, e é justamente ela que precisaria dela certa. */}
          <MetaGrid
            variant="recap"
            entries={[
              { label: "registro", value: paths.databasePath },
              { label: "worktrees", value: paths.worktreesDir },
              {
                label: "conversas",
                value: (
                  <>
                    {paths.transcriptsDir} <span className="dim">— só local</span>
                  </>
                ),
              },
            ]}
          />
        </WizardSection>
      )}
    </StepShell>
  );
}
