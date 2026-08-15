import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { trpc } from "../lib/trpc.js";

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
    <main className="first-run">
      <h2>Primeiro uso</h2>
      <p>Um workspace agrupa seus projetos. Crie o primeiro para começar.</p>

      <form onSubmit={submit}>
        <label htmlFor="workspace-name">Nome do workspace</label>
        <input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="pessoal"
          autoFocus
        />
        <button type="submit" disabled={create.isPending || name.trim() === ""}>
          {create.isPending ? "criando…" : "criar workspace"}
        </button>
      </form>

      {create.isError && <p role="alert">{create.error.message}</p>}
    </main>
  );
}
