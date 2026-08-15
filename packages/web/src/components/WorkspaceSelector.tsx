import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { trpc } from "../lib/trpc.js";
import { WORKSPACES_KEY } from "../lib/queryKeys.js";

export interface WorkspaceOption {
  id: string;
  name: string;
}

export interface WorkspaceSelectorProps {
  workspaces: readonly WorkspaceOption[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/** Top of the sidebar, F3.5: which workspace everything below belongs to. */
export function WorkspaceSelector({ workspaces, activeId, onSelect }: WorkspaceSelectorProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (workspaceName: string) => trpc.workspace.create.mutate({ name: workspaceName }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
      // Creating one and staying on the old one would be a surprise every time.
      onSelect(workspace.id);
      setAdding(false);
      setName("");
    },
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate(name);
  };

  return (
    <div className="workspace-selector">
      <label htmlFor="workspace-select">Workspace</label>
      <select
        id="workspace-select"
        value={activeId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>

      {adding ? (
        <form onSubmit={submit}>
          <label htmlFor="new-workspace-name">Nome do novo workspace</label>
          <input
            id="new-workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <button type="submit" disabled={create.isPending || name.trim() === ""}>
            criar
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            cancelar
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          novo workspace
        </button>
      )}

      {create.isError && <p role="alert">{create.error.message}</p>}
    </div>
  );
}
