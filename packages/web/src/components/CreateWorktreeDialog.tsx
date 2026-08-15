import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface CreateWorktreeDialogProps {
  projectId: string;
  onCreated: (worktreeId: string) => void;
}

/** Creating a worktree, F4.1. The name is also the branch, F4.2. */
export function CreateWorktreeDialog({ projectId, onCreated }: CreateWorktreeDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => trpc.worktree.create.mutate({ projectId, name: name.trim() }),
    onSuccess: async (worktree) => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onCreated(worktree.id);
      setOpen(false);
      setName("");
    },
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        nova worktree
      </button>
    );
  }

  return (
    <form className="create-worktree" onSubmit={submit}>
      <label htmlFor={`worktree-name-${projectId}`}>Nome da worktree</label>
      <input
        id={`worktree-name-${projectId}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="teste-prd"
        autoFocus
      />
      <button type="submit" disabled={create.isPending || name.trim() === ""}>
        {/* `git worktree add` copies a whole checkout. On a large repository
            this is seconds, and a button that looks idle invites a second
            click that would fail on the branch the first one just made. */}
        {create.isPending ? "criando…" : "criar"}
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        cancelar
      </button>

      {create.isPending && <p role="status">criando a worktree…</p>}
      {/* The daemon's own words: "a branch X já existe; escolha outro nome"
          tells the user what to do, "erro" does not. */}
      {create.isError && <p role="alert">{create.error.message}</p>}
    </form>
  );
}
