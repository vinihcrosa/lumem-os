import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Field, Glyph, Input, Modal } from "../ui/index.js";

export interface CreateWorktreeDialogProps {
  projectId: string;
  /** Said in the header — the row the `+` was pressed on (F1.3). */
  projectName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (worktreeId: string) => void;
  /**
   * Whether the repository has any commit at all, F6.13.
   *
   * Null means the daemon could not look. A repository cloned empty is a
   * legitimate project (Q19) and simply has no commit to cut a worktree from
   * for a while — the branch exists as a name and not as a commit.
   */
  hasCommits?: boolean | null;
}

/**
 * Creating a worktree, F4.1. The name is also the branch, F4.2.
 *
 * Since `sidebar-actions` it opens from the `+` on the project's own row, which
 * is why it has no project selector: the gesture already answered that, and the
 * header repeats it rather than asking again.
 */
export function CreateWorktreeDialog({
  projectId,
  projectName,
  open,
  onClose,
  onCreated,
  hasCommits = null,
}: CreateWorktreeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => trpc.worktree.create.mutate({ projectId, name: name.trim() }),
    onSuccess: async (worktree) => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onCreated(worktree.id);
      close();
    },
  });

  function close(): void {
    setName("");
    create.reset();
    onClose();
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate();
  };

  const unborn = hasCommits === false;
  const fieldId = `worktree-name-${projectId}`;

  return (
    <Modal
      open={open}
      title="Nova worktree"
      where={
        <>
          em
          <Glyph tone="project">■</Glyph>
          <b>{projectName}</b>
        </>
      }
      onClose={close}
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            disabled={create.isPending || name.trim() === "" || unborn}
          >
            {/* `git worktree add` copies a whole checkout. On a large repository
                this is seconds, and a button that looks idle invites a second
                click that would fail on the branch the first one just made. */}
            {create.isPending ? "criando…" : "criar"}
          </Button>
          <Button variant="ghost" onClick={close}>
            {unborn ? "fechar" : "cancelar"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
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
          />
        </Field>
        {unborn ? (
          /*
           * F6.13. The server refuses this too — the screen avoids the error,
           * the daemon forbids it. Letting git answer would print "invalid
           * reference", which explains nothing to anybody.
           *
           * It is said *here* now, and not on a disabled trigger: since the
           * trigger is a 24px `+` on a tree row, disabling it would have been a
           * grey button with its reason nowhere on screen.
           */
          <Banner tone="warning">
            este repositório ainda não tem nenhum commit — faça o primeiro para poder cortar
            worktrees
          </Banner>
        ) : (
          <p className="create-worktree__hint">
            A branch tem o mesmo nome. Barra vira diretório aninhado.
          </p>
        )}

        {create.isPending && (
          <Banner tone="info">copiando o checkout — em repositório grande isto leva alguns segundos</Banner>
        )}
      </form>
    </Modal>
  );
}

/** Ties the footer's submit button to the body's form across the modal. */
const FORM_ID = "create-worktree";
