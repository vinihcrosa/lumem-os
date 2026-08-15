import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { trpc } from "../lib/trpc.js";
import { WORKSPACES_KEY } from "../lib/queryKeys.js";
import { Button, Field, Input } from "../ui/index.js";

export interface WorkspaceOption {
  id: string;
  name: string;
}

export interface WorkspaceSelectorProps {
  workspaces: readonly WorkspaceOption[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Top of the sidebar, F3.5: which workspace everything below belongs to.
 *
 * A native `select` rather than a built menu. It looks a little less like the
 * prototype and it brings keyboard handling, screen reader behaviour and
 * platform conventions for free — and it removes the click-outside, `Esc` and
 * focus-return code a custom listbox would need. Open-questions Q8 records when
 * that trade stops being worth it: the day an option needs more than a string.
 */
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
    <div className="ws">
      <div className="ws__bar">
        <label className="sr-only" htmlFor="workspace-select">
          Workspace
        </label>
        <span className="ws__glyph" aria-hidden="true">
          ◈
        </span>
        <select
          id="workspace-select"
          className="ws__select"
          value={activeId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        {/* `appearance: none` removes the platform's own arrow along with its
            box, and a selector with nothing to click reads as a label. */}
        <span className="ws__caret" aria-hidden="true">
          ▾
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="novo workspace"
          title="novo workspace"
          onClick={() => setAdding(true)}
        >
          ＋
        </Button>
      </div>

      {adding && (
        <form className="ws__form" onSubmit={submit}>
          <Field id="new-workspace-name" label="Nome do novo workspace">
            <Input
              id="new-workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="trabalho"
              autoFocus
            />
          </Field>
          <div className="ws__actions">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={create.isPending || name.trim() === ""}
            >
              criar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              cancelar
            </Button>
          </div>
        </form>
      )}

      {create.isError && (
        <p className="ws__error" role="alert">
          {create.error.message}
        </p>
      )}
    </div>
  );
}
