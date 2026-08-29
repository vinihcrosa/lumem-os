import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { isTerminal, useCloneJob } from "../hooks/useCloneJob.js";
import { cloneJobsKey, projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, Card, Chip, Field, Glyph, Input } from "../ui/index.js";

export interface AddProjectDialogProps {
  workspaceId: string;
  onAdded: (projectId: string) => void;
  /** An address to open with, F6.10 — the ssh spelling of one that failed. */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}

/** What `project.parseSource` answers. Named here so the screen can read it. */
interface Plan {
  kind: "path" | "url" | "refused";
  path?: string;
  scheme?: string;
  url?: string;
  insecure?: boolean;
  name?: string;
  targetPath?: string;
  message?: string;
}

/** Long enough not to ask on every keystroke, short enough to feel immediate. */
const ECHO_DEBOUNCE_MS = 250;

/**
 * Adding a repository — by path, as before, or by URL, which clones it.
 *
 * One field, because there is no ambiguity to break: a project path is already
 * required to be absolute, so anything not starting with `/` or `~` is a URL.
 * What the automatic detection really risks is the person not noticing what is
 * about to happen, and that is what the `↳` line answers — not a mode switch.
 *
 * There is still no directory picker: the daemon may be on another machine, and
 * a browser's file input hands over a file, not a server-side path.
 */
export function AddProjectDialog({
  workspaceId,
  onAdded,
  prefill = null,
  onPrefillConsumed,
}: AddProjectDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  // Reads the same cache the sidebar writes; it does not open a stream of its
  // own. All it needs to know is whether one is running (A11).
  const live = useCloneJob(workspaceId);
  const running = live !== null && !isTerminal(live.state) ? live : null;

  const plan = useEchoedPlan(workspaceId, source, name);

  useEffect(() => {
    if (prefill === null) return;
    setSource(prefill);
    setName("");
    setOpen(true);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const add = useMutation({
    mutationFn: () =>
      trpc.project.add.mutate({
        workspaceId,
        path: plan?.kind === "path" ? plan.path! : source.trim(),
        ...(name.trim() === "" ? {} : { name: name.trim() }),
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onAdded(project.id);
      close();
    },
  });

  const clone = useMutation({
    mutationFn: () =>
      trpc.project.clone.mutate({
        workspaceId,
        source: source.trim(),
        ...(name.trim() === "" ? {} : { name: name.trim() }),
      }),
    onSuccess: async () => {
      // The dialog closes and the clone keeps going: it lives in the sidebar
      // from here, which is where the project will appear.
      await queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) });
      close();
    },
  });

  function close(): void {
    setOpen(false);
    setSource("");
    setName("");
    add.reset();
    clone.reset();
  }

  const isUrl = plan?.kind === "url";
  const refused = plan?.kind === "refused";
  /**
   * The same rule the server applies, used for one thing only: knowing whether
   * the answer is still on its way.
   *
   * Pressing Enter inside the 250 ms debounce leaves `plan` null, and with it
   * null a URL reads as a path and gets sent to `project.add` — which refuses
   * it as "not absolute", a message about the wrong thing entirely. So a URL
   * waits for the daemon to speak; a path never has to, because there is
   * nothing to wait for.
   */
  const looksLocal = source.trim().startsWith("/") || source.trim().startsWith("~");
  const waiting = plan === null && !looksLocal && source.trim() !== "";
  const busy = add.isPending || clone.isPending;
  const failure = add.isError ? add.error.message : clone.isError ? clone.error.message : undefined;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (source.trim() === "" || refused || waiting) return;
    if (isUrl) clone.mutate();
    else add.mutate();
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
          id="project-source"
          label="Caminho ou URL"
          // The daemon's own words: it is the only thing that knows *which*
          // rule refused, and F6.2 requires the user to be told.
          error={failure}
        >
          <Input
            id="project-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="git@gitlab.interno:time/api.git"
            invalid={refused || add.isError || clone.isError}
            autoFocus
          />
        </Field>

        {plan !== null && <Echo plan={plan} />}

        {/* Shown for both kinds. The prototype hid it for a local path, and
            implementing that would have quietly deleted F2.3 — naming a project
            something other than its directory has been possible since the
            walking-skeleton and has nothing to do with cloning. */}
        <Field id="project-name" label="Nome">
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={isUrl ? (plan.name ?? "o nome do repositório") : "o nome da pasta"}
          />
        </Field>

        {isUrl && (
          // Not a field: since Q14 the destination is computed, and the
          // prototype's first draft drew it like the inputs above, where it
          // read as something you could type into.
          <p className="add-project__answer">
            <span className="add-project__answer-label">Vai em</span>
            <span className="add-project__answer-path">{plan.targetPath}</span>
          </p>
        )}

        <div className="add-project__actions">
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy || source.trim() === "" || refused || waiting || (isUrl && running !== null)
            }
          >
            {clone.isPending
              ? "clonando…"
              : add.isPending
                ? "validando…"
                : isUrl
                  ? "clonar"
                  : "adicionar"}
          </Button>
          <Button variant="ghost" onClick={close}>
            cancelar
          </Button>
        </div>

        {isUrl && running !== null && (
          // A11: one clone at a time, and the button says which one rather than
          // queueing in silence.
          <p className="add-project__blocked" role="status">
            {running.name} ainda está sendo clonado
          </p>
        )}
      </Card>
    </form>
  );
}

/** The `↳` line, in the daemon's words rather than the client's guess. */
function Echo({ plan }: { plan: Plan }) {
  if (plan.kind === "refused") {
    return (
      // `status`, not `alert`: this arrives while somebody is still typing and
      // not in response to a click. The field's own error announces on submit,
      // and two live regions saying different things at once is worse than one.
      <p className="echo echo--refused" role="status">
        <span className="echo__arrow" aria-hidden="true">
          ↳
        </span>
        {plan.message}
      </p>
    );
  }

  if (plan.kind === "path") {
    return (
      <p className="echo">
        <span className="echo__arrow" aria-hidden="true">
          ↳
        </span>
        registrar o repositório em <strong>{plan.path}</strong>
      </p>
    );
  }

  return (
    <p className="echo">
      <span className="echo__arrow" aria-hidden="true">
        ↳
      </span>
      clonar via {plan.scheme}
      {/* Q10: `http` stays on the allowlist because an internal server with no
          certificate is the normal case — and the price is saying so on the
          screen, not in a footnote. */}
      {plan.insecure === true && <Chip tone="insecure">sem TLS</Chip>}
    </p>
  );
}

/**
 * What the server understood, asked for again a beat after typing stops.
 *
 * The client does decide this too, to draw the line — but it decides it by
 * asking. A second implementation of the rule here would be a second rule, and
 * the two would disagree the first time either changed.
 */
function useEchoedPlan(workspaceId: string, source: string, name: string): Plan | null {
  const [settled, setSettled] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSettled(source.trim()), ECHO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

  const query = useQuery({
    queryKey: ["project", "parseSource", workspaceId, settled, name.trim()],
    queryFn: () =>
      trpc.project.parseSource.query({
        workspaceId,
        source: settled,
        ...(name.trim() === "" ? {} : { name: name.trim() }),
      }),
    enabled: settled !== "",
  });

  return (query.data as Plan | undefined) ?? null;
}
