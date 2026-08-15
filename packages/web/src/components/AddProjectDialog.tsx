import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface AddProjectDialogProps {
  workspaceId: string;
  onAdded: (projectId: string) => void;
}

/**
 * Adding a repository by absolute path, F2.1–F2.3.
 *
 * There is no directory picker: the daemon may be on another machine, and a
 * browser's file input hands over a file, not a server-side path.
 */
export function AddProjectDialog({ workspaceId, onAdded }: AddProjectDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: () =>
      trpc.project.add.mutate({
        workspaceId,
        path,
        // Empty means "use the directory name", which is what the daemon does
        // when the field is absent — sending "" would be a name of no length.
        ...(name.trim() === "" ? {} : { name: name.trim() }),
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onAdded(project.id);
      setOpen(false);
      setPath("");
      setName("");
    },
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (path.trim() === "") return;
    add.mutate();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        adicionar projeto
      </button>
    );
  }

  return (
    <form className="add-project" onSubmit={submit}>
      <label htmlFor="project-path">Caminho do repositório</label>
      <input
        id="project-path"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        placeholder="/Users/voce/Documents/GitHub/lorebase"
        autoFocus
      />

      <label htmlFor="project-name">Nome (opcional)</label>
      <input
        id="project-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="o nome da pasta"
      />

      <button type="submit" disabled={add.isPending || path.trim() === ""}>
        {add.isPending ? "validando…" : "adicionar"}
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        cancelar
      </button>

      {/* The daemon's own words: it is the only thing that knows *which*
          validation failed, and F2.2 requires the user to be told. */}
      {add.isError && <p role="alert">{add.error.message}</p>}
    </form>
  );
}
