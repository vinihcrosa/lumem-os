import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Card, Field, Glyph, Input } from "../ui/index.js";

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
      <Button
        variant="primary"
        glyph={<Glyph>◇</Glyph>}
        onClick={() => setOpen(true)}
      >
        nova worktree
      </Button>
    );
  }

  const fieldId = `worktree-name-${projectId}`;

  return (
    // Takes over the action bar rather than floating above it: the form is the
    // next step of the same task, not an interruption of it.
    <form className="create-worktree" onSubmit={submit}>
      <Card>
        <Field
          id={fieldId}
          label="Nome da worktree"
          // The daemon's own words: "a branch X já existe; escolha outro nome"
          // tells the user what to do, "erro" does not.
          error={create.isError ? create.error.message : undefined}
        >
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="teste-prd"
            invalid={create.isError}
            autoFocus
          />
        </Field>
        <p className="create-worktree__hint">
          A branch tem o mesmo nome. Barra vira diretório aninhado.
        </p>
        <div className="create-worktree__actions">
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || name.trim() === ""}
          >
            {/* `git worktree add` copies a whole checkout. On a large repository
                this is seconds, and a button that looks idle invites a second
                click that would fail on the branch the first one just made. */}
            {create.isPending ? "criando…" : "criar"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            cancelar
          </Button>
        </div>

        {create.isPending && (
          <div className="create-worktree__status">
            <Banner tone="info">criando a worktree…</Banner>
          </div>
        )}
      </Card>
    </form>
  );
}
