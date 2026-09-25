import { useState, type FormEvent } from "react";

import { OriginPicker } from "./OriginPicker.js";
import { fromOf, useOriginChoice, type Pick } from "./useOriginChoice.js";
import { useWorktreeMutations } from "./useWorktrees.js";
import { Banner, Button, Field, Glyph, Input, Modal } from "../../ui/index.js";

export interface CreateWorktreeDialogProps {
  projectId: string;
  /** Said in the header — the row the `+` was pressed on (F1.3). */
  projectName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (worktreeId: string) => void;
  /**
   * Ir para a worktree que já existe.
   *
   * Escolher uma branch que outro checkout já tem não é erro: é uma navegação
   * ([Q5](../../../../docs/features/026-worktree-from/open-questions.md)). O
   * destino é o mesmo do `onCreated`, e o nome é outro porque nada foi criado.
   */
  onOpenExisting?: (worktreeId: string) => void;
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
 * Creating a worktree, F4.1. The name is also the branch, F4.2 — **menos**
 * quando a origem é uma branch que já existe, que é a Q9 da `026-worktree-from`.
 *
 * Since `sidebar-actions` it opens from the `+` on the project's own row, which
 * is why it has no project selector: the gesture already answered that, and the
 * header repeats it rather than asking again.
 *
 * O trilho de origem (as quatro abas e as três listas) e a lógica de qual foi
 * escolhida moram em `OriginPicker.tsx` e `useOriginChoice.ts` desde a T19 —
 * este componente decide o `from` que vai ao daemon e desenha o resto do
 * formulário.
 */
export function CreateWorktreeDialog({
  projectId,
  projectName,
  open,
  onClose,
  onCreated,
  onOpenExisting,
  hasCommits = null,
}: CreateWorktreeDialogProps) {
  const [name, setName] = useState("");
  const origin = useOriginChoice(projectId, { open, onSuggestName: setName });

  const { create } = useWorktreeMutations(projectId);

  function close(): void {
    setName("");
    origin.reset();
    create.reset();
    onClose();
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate(
      { name: name.trim(), from: fromOf(origin.active, origin.pick) },
      {
        onSuccess: (worktree) => {
          onCreated(worktree.id);
          close();
        },
      },
    );
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
        {!unborn && (
          <OriginPicker
            origin={origin}
            onOpenExisting={onOpenExisting}
            onCreated={onCreated}
            close={close}
          />
        )}

        <Field
          id={fieldId}
          label="Nome da worktree"
          // The daemon's own words: "a branch X já existe; escolha outro nome"
          // tells the user what to do, "erro" does not.
          error={create.isError ? create.error.message : undefined}
        >
          <Input
            id={fieldId}
            // Onde o foco cai ao abrir, e não no trilho de origem acima: a
            // origem é opcional, o nome não.
            data-modal-focus=""
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
        ) : origin.chosen === null ? (
          <p className="create-worktree__hint">
            A branch tem o mesmo nome. Barra vira diretório aninhado.
          </p>
        ) : (
          <p
            className={`create-worktree__hint fname${
              origin.chosen.kind === "branch" && origin.chosen.local ? " fname--branch" : ""
            }`}
          >
            <span className="fname__g">
              {origin.chosen.kind === "branch" && origin.chosen.local ? "⑂" : "◈"}
            </span>
            <span>{echoOf(origin.chosen)}</span>
          </p>
        )}

        {create.isPending && (
          <Banner tone="info">
            {/* A rede é a única parte do gesto que pode demorar por um motivo
                que não é o disco, então ela é dita quando existe. */}
            {origin.fetching === null
              ? "copiando o checkout — em repositório grande isto leva alguns segundos"
              : `buscando a branch da PR #${String(origin.fetching)} — isto vai à rede`}
          </Banner>
        )}
      </form>
    </Modal>
  );
}

/** O que a origem escolhida diz sobre o nome, abaixo do campo. */
function echoOf(pick: Pick): string {
  switch (pick.kind) {
    case "branch":
      return pick.local
        ? `na branch ${pick.ref}, que já existe — o nome é só desta worktree`
        : `da branch publicada ${pick.ref}, rastreando ela`;
    case "issue":
      return `da issue #${pick.number} — corta da default, como sempre`;
    case "pr":
      return `da head da PR #${pick.number}, que já está no disco`;
  }
}

/** Ties the footer's submit button to the body's form across the modal. */
const FORM_ID = "create-worktree";
