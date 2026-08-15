import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, Card, Field, Glyph, Input } from "../ui/index.js";

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
      <button type="button" className="sidebar__add" onClick={() => setOpen(true)}>
        <Glyph>＋</Glyph>
        adicionar projeto
      </button>
    );
  }

  return (
    <form className="add-project" onSubmit={submit}>
      <Card>
        <Field
          id="project-path"
          label="Caminho do repositório"
          // The daemon's own words: it is the only thing that knows *which*
          // validation failed, and F2.2 requires the user to be told.
          error={add.isError ? add.error.message : undefined}
        >
          <Input
            id="project-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/Users/voce/Documents/GitHub/lorebase"
            invalid={add.isError}
            autoFocus
          />
        </Field>

        <Field id="project-name" label="Nome (opcional)">
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="o nome da pasta"
          />
        </Field>

        <div className="add-project__actions">
          <Button
            type="submit"
            variant="primary"
            disabled={add.isPending || path.trim() === ""}
          >
            {add.isPending ? "validando…" : "adicionar"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            cancelar
          </Button>
        </div>
      </Card>
    </form>
  );
}
