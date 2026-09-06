import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { isTerminal, useCloneStream } from "../hooks/useCloneJob.js";
import { cloneJobsKey, projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, Chip, Field, Glyph, Input, Modal } from "../ui/index.js";
import { CloneOutcome, CloneProgress, outcomeSpeaks } from "./CloneStatus.js";

export interface AddProjectDialogProps {
  workspaceId: string;
  /** Said in the header — where the project is going to land. */
  workspaceName: string;
  open: boolean;
  onClose: () => void;
  /**
   * Asks to be opened, F1.9.
   *
   * A clone runs on the daemon and outlives the page. With the footer host gone
   * (Q5) this dialog is the only thing that can draw one, so finding one alive
   * has to be enough to bring it back — otherwise reloading during a four minute
   * clone is the same as losing it from sight.
   */
  onRequestOpen: () => void;
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
  workspaceName,
  open,
  onClose,
  onRequestOpen,
  onAdded,
  prefill = null,
  onPrefillConsumed,
}: AddProjectDialogProps) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);
  /**
   * The clone this dialog is holding open, if any.
   *
   * Not derivable from `live`: the job store keeps finished jobs on purpose, so
   * "there is a clone and it is done" is the normal state of a workspace where
   * anybody ever cloned anything. Closing on that would have made the dialog
   * shut itself the instant it opened, for good, on every workspace with a
   * clone in its history — which is what the e2e caught, 55 specs at once.
   */
  const [held, setHeld] = useState<string | null>(null);
  /*
   * The one caller of the stream, since Q5.
   *
   * It used to be `CloneStatus`, in the sidebar footer. The footer is gone and
   * this component is always mounted — closed it renders nothing but still
   * holds the subscription, which is what lets it notice a clone it did not
   * start and ask to come back.
   */
  const live = useCloneStream(workspaceId);
  const running = live !== null && !isTerminal(live.state) ? live : null;
  /** The ending, while it still has something to say and nobody has read it. */
  const outcome =
    live !== null && live.id !== dismissed && isTerminal(live.state) && outcomeSpeaks(live)
      ? live
      : null;

  const plan = useEchoedPlan(workspaceId, source, name);

  useEffect(() => {
    if (prefill === null) return;
    setSource(prefill);
    setName("");
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  /*
   * F1.9. Not "reopen what I closed": there is no closing while a clone runs.
   * This is the page that came back to something it has to draw.
   *
   * An *ended* one counts too, and that is not symmetry for its own sake: the
   * job store keeps finished jobs precisely so that an ending which has just
   * happened survives a reload, which is exactly when somebody most needs to
   * read it. That covers both — a failure, and the F6.4 suffix that renamed a
   * project on the user's behalf. With the footer gone, forgetting this here
   * would have deleted the behaviour without deleting the code providing it.
   */
  useEffect(() => {
    if (open) return;
    if (running !== null || outcome !== null) onRequestOpen();
  }, [running, outcome, open, onRequestOpen]);

  // What is running is what this dialog is responsible for closing on.
  useEffect(() => {
    if (running !== null) setHeld(running.id);
  }, [running?.id]);

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
      // Q5: the dialog stays. From here it *is* the clone — progress, phase,
      // cancelling and both endings, in the place the button was pressed.
      setDismissed(null);
      await queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) });
    },
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => trpc.project.cloneCancel.mutate({ jobId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) }),
  });

  /*
   * Only success closes.
   *
   * A failure that closed would take the URL with it, and the way out of an
   * authentication failure is that same address spelled for ssh — one click, on
   * a field the person should not have to retype (F6.10).
   */
  useEffect(() => {
    if (!open || live === null || live.id !== held || live.state !== "done") return;
    // Unless the ending has something to say — F6.4 suffixes a name when one
    // was already taken, and closing over that would decide on the user's
    // behalf and then not mention it.
    if (outcomeSpeaks(live) && live.id !== dismissed) return;
    void queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
    setHeld(null);
    close();
  }, [open, held, live?.id, live?.state, dismissed]);

  /**
   * Shuts the dialog and forgets what was typed.
   *
   * Separate from `reset` on purpose: a failed clone has to put the form back
   * *with the URL still in it*, and reusing this would have wiped the one thing
   * `tentar por ssh` rewrites.
   */
  function close(): void {
    setSource("");
    setName("");
    add.reset();
    clone.reset();
    onClose();
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
  /**
   * Q5a: while this is true the dialog has no way out but cancelling.
   *
   * It also settles A11 — one clone at a time — by construction rather than by
   * a message: with the form replaced by the progress, there is no second
   * `clonar` to press. The old build had to disable the button and explain
   * which job was in the way.
   */
  const cloning = running !== null;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (source.trim() === "" || refused || waiting) return;
    if (isUrl) clone.mutate();
    else add.mutate();
  };

  return (
    <Modal
      open={open}
      title="Adicionar projeto"
      where={
        <>
          no workspace
          <Glyph tone="workspace">◈</Glyph>
          <b>{workspaceName}</b>
        </>
      }
      onClose={close}
      // Q5a. The only state in the product where a modal refuses to close, and
      // it refuses because it is the only thing holding the clone.
      dismissible={!cloning}
      reason="não fecha enquanto clona"
      footer={
        cloning ? (
          // F6.6: only while it is still downloading. Past that the repository
          // is on disk and what is left is a row in SQLite, so the button goes
          // away instead of lying about what it would undo. The gap is the
          // blink between the last object and the insert, and the body says
          // `registrando` through it.
          running.state === "cloning" ? (
            <Button variant="ghost" onClick={() => cancel.mutate(running.id)}>
              cancelar o clone
            </Button>
          ) : null
        ) : (
          <>
            <Button
              type="submit"
              // `form`, because the buttons live in the modal's footer and the
              // fields in its body: they are siblings, not ancestor and child.
              form={FORM_ID}
              variant="primary"
              disabled={busy || source.trim() === "" || refused || waiting}
            >
              {add.isPending ? "validando…" : isUrl ? "clonar" : "adicionar"}
            </Button>
            <Button variant="ghost" onClick={close}>
              cancelar
            </Button>
          </>
        )
      }
    >
      {outcome !== null && (
        <CloneOutcome
          job={outcome}
          onDismiss={() => setDismissed(outcome.id)}
          // The way back, without a round trip through the app: the field is
          // right here, and the ssh spelling goes straight into it.
          onRetry={(ssh) => {
            setDismissed(outcome.id);
            setSource(ssh);
          }}
        />
      )}

      {cloning ? (
        <CloneProgress job={running} />
      ) : (
        <form id={FORM_ID} className="add-project" onSubmit={submit}>
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
        </form>
      )}
    </Modal>
  );
}

/** Ties the footer's submit button to the body's form across the modal. */
const FORM_ID = "add-project";

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
