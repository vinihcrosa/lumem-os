import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { trpc } from "../lib/trpc.js";
import { Banner, Button, Card, Field, Input } from "../ui/index.js";

export interface FirstRunProps {
  onCreated: (workspaceId: string) => void;
}

/**
 * The whole screen when no workspace exists, PRD §5.
 *
 * "e nada mais": the sidebar, the project list and the terminals are all
 * scoped to a workspace, and showing empty versions of them would present a
 * broken app instead of a first step.
 */
export function FirstRun({ onCreated }: FirstRunProps) {
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (workspaceName: string) => trpc.workspace.create.mutate({ name: workspaceName }),
    onSuccess: (workspace) => onCreated(workspace.id),
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate(name);
  };

  return (
    <main className="centered">
      <Card
        title="Nenhum workspace ainda"
        lede="Um workspace agrupa os projetos que você acompanha junto. Dá pra ter vários; comece com um."
      >
        <form onSubmit={submit}>
          <Field id="workspace-name" label="Nome do workspace">
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="pessoal"
              autoFocus
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || name.trim() === ""}
          >
            {create.isPending ? "criando…" : "criar workspace"}
          </Button>
        </form>

        {create.isError && (
          <div className="detail__banner">
            <Banner tone="danger">{create.error.message}</Banner>
          </div>
        )}
      </Card>
    </main>
  );
}
