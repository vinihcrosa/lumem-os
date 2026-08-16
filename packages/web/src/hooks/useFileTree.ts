import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { whenWritesSettle } from "../lib/pending-writes.js";
import { fileListKey, filePreviewKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { useOpenFiles } from "./useOpenFiles.js";
import type { Scope } from "./useSessionsByScope.js";

/**
 * What the tree is in the middle of doing, and there is only ever one.
 *
 * A gesture at a time because every one of them is anchored on a row: two name
 * fields open at once would leave "onde isto está sendo criado" without an
 * answer, which is the whole reason the field is drawn in the row's own
 * indentation instead of in a dialog.
 */
export type TreeGesture =
  | { kind: "idle" }
  | { kind: "create"; parent: string; makes: "file" | "dir" }
  | { kind: "rename"; path: string }
  /** `directory` decides `recursive`, which the daemon requires rather than infers. */
  | { kind: "delete"; path: string; directory: boolean };

/** What the confirmation reads, named from the client instead of restated by hand. */
export type DeletePreview = Awaited<ReturnType<typeof trpc.files.deletePreview.query>>;

export interface FileTreeEdits {
  gesture: TreeGesture;
  /** Opens a gesture, and drops whatever the previous one was refused with. */
  ask(next: TreeGesture): void;
  cancel(): void;
  /** The daemon's own words for the gesture on screen, F4.4 and Q17. */
  refusal: string | null;
  busy: boolean;
  /** The name — or the path, since renaming is moving (F4.2) — typed in the row. */
  submit(typed: string): void;
  /** Only from the click. Opening the dialog reads; it never removes. */
  confirm(): void;
  preview: UseQueryResult<DeletePreview>;
}

/**
 * The directory whose listing has one more, one fewer, or one different entry.
 *
 * A second copy of the one in `useFileBuffer`, deliberately: importing that
 * module for three lines would pull the whole autosave in, and moving it out
 * would touch the most reviewed hook of this feature for a rename.
 */
function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** Whether a path takes the open file with it — itself, or the directory above it. */
function covers(path: string, open: string): boolean {
  return open === path || open.startsWith(`${path}/`);
}

/**
 * Creating, renaming and removing from the column (F4).
 *
 * Two things live here that look unrelated and are the same concern. The first
 * is that every operation names a directory whose listing is now wrong, and
 * F4.5 says only that one is re-read: invalidating `["files"]` would be the
 * column's reload button, which re-reads every open level of the tree.
 *
 * The second is the order in **§ "descarrega antes"**: a gesture on the file the
 * split is showing lets the split go *first*, waits for what was typed to be on
 * the disk, and only then moves the file. The unmount is where `useFileBuffer`
 * flushes (E9), and a flush that lands after the rename writes to a path that no
 * longer exists — the daemon answers NOT_FOUND to a component that is gone, and
 * the typed text disappears with nobody told. Done in this order, the write
 * lands on the old path and the rename carries it over, which is what someone
 * renaming a file they are editing expects.
 *
 * Issuing the two in order is **not** enough, and this used to say it was. The
 * client batches: `httpBatchLink` puts two calls made in the same macrotask into
 * one request, and the daemon starts that request's calls with `Promise.all` —
 * so both orderings are live in a single round trip, and the happy case only
 * won because `resolveForWrite` costs the rename more `await`s than it costs the
 * write. A big file or a busy disk flips it. Waiting for the write to *land* is
 * the property; ordering the two departures was a description of it.
 */
export function useFileTree(scope: Scope): FileTreeEdits {
  const queryClient = useQueryClient();
  const openFiles = useOpenFiles();
  const [gesture, setGesture] = useState<TreeGesture>({ kind: "idle" });

  const tab = openFiles.activeTab;
  const open = tab === null ? null : openFiles.fileFor(tab);
  /** The path the split is showing as a file. A patch of the same path is not it. */
  const shown = open !== null && open.view === "file" ? open.path : null;

  /**
   * What runs once the split has let go and its buffer is on the disk.
   *
   * The release and the arming are two updates of the same event, so React
   * commits them together — and in that commit every passive cleanup runs
   * before every passive effect body. That is what makes the effect below the
   * first moment at which the flush has already been *started*: the editor's
   * detach is a cleanup, and it is where `useFileBuffer` hands its write to
   * `pending-writes`.
   *
   * Started is not landed, so the mutation waits for it. Ordering the two
   * departures was what this did before and it bought nothing the transport
   * keeps: batched into one request, the two race inside the daemon.
   */
  const deferred = useRef<(() => void) | null>(null);
  const [armed, setArmed] = useState(0);

  useEffect(() => {
    const run = deferred.current;
    if (run === null) return;
    deferred.current = null;
    void whenWritesSettle().then(run);
  }, [armed]);

  const letGo = useCallback(
    (run: () => void): void => {
      if (tab === null) {
        run();
        return;
      }
      deferred.current = run;
      openFiles.close(tab);
      setArmed((count) => count + 1);
    },
    [openFiles, tab],
  );

  /** F4.5: the directories that changed, and the diff. Never `["files"]` whole. */
  const reread = useCallback(
    (...dirs: readonly string[]): void => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      for (const dir of new Set(dirs)) {
        void queryClient.invalidateQueries({
          queryKey: fileListKey(scope.scopeType, scope.scopeId, dir),
        });
      }
    },
    [queryClient, scope.scopeType, scope.scopeId],
  );

  const creating = useMutation({
    mutationFn: (input: { path: string; kind: "file" | "dir" }) =>
      trpc.files.create.mutate({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        path: input.path,
        kind: input.kind,
      }),
    onSuccess: (made) => {
      // The daemon's spelling, not the typed one: `./src//a.ts` and `src/a.ts`
      // are one file and the tree keys on the second.
      reread(dirOf(made.path));
      setGesture({ kind: "idle" });
    },
  });

  interface Renaming {
    from: string;
    to: string;
    /** The path the split was showing, when it had to let go of it first. */
    reopen: string | null;
  }

  const renaming = useMutation({
    mutationFn: (input: Renaming) =>
      trpc.files.rename.mutate({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        from: input.from,
        to: input.to,
      }),
    onSuccess: (moved, input) => {
      reread(dirOf(input.from), dirOf(moved.path));
      if (input.reopen !== null) {
        // F4.6, against `moved.path` and never against what was typed: the
        // client cannot normalise a path, and a split pointing at `./x.md`
        // reads a file the tree lists under `x.md`. The tail is what makes
        // renaming a *directory* carry the file open inside it.
        const tail = input.reopen.slice(input.from.length);
        openFiles.open({ path: `${moved.path}${tail}`, view: "file" });
      }
      setGesture({ kind: "idle" });
    },
    onError: (_error, input) => {
      // Nothing moved, so the split goes back to the file it was showing.
      if (input.reopen !== null) openFiles.open({ path: input.reopen, view: "file" });
    },
  });

  const removing = useMutation({
    mutationFn: (input: { path: string; recursive: boolean; reopen: string | null }) =>
      trpc.files.remove.mutate({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        path: input.path,
        recursive: input.recursive,
      }),
    onSuccess: (_removed, input) => {
      reread(dirOf(input.path));
      setGesture({ kind: "idle" });
    },
    onError: (_error, input) => {
      if (input.reopen !== null) openFiles.open({ path: input.reopen, view: "file" });
    },
  });

  const target = gesture.kind === "delete" ? gesture.path : null;
  const preview = useQuery({
    queryKey: filePreviewKey(scope.scopeType, scope.scopeId, target ?? ""),
    queryFn: () =>
      trpc.files.deletePreview.query({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        path: target ?? "",
      }),
    enabled: target !== null,
    // Never from the cache. It answers what git's index has *now*, and the agent
    // beside us is what moves that answer — a dialog reopened after a `git add`
    // would otherwise describe a repository that no longer exists. With no
    // observer left when the dialog closes, there is nothing to serve stale.
    gcTime: 0,
  });

  const reset = creating.reset;
  const resetRename = renaming.reset;
  const resetRemove = removing.reset;

  const ask = useCallback(
    (next: TreeGesture): void => {
      reset();
      resetRename();
      resetRemove();
      setGesture(next);
    },
    [reset, resetRename, resetRemove],
  );

  const cancel = useCallback((): void => ask({ kind: "idle" }), [ask]);

  const submit = useCallback(
    (typed: string): void => {
      const wanted = typed.trim();
      if (wanted === "") return;

      if (gesture.kind === "create") {
        const parent = gesture.parent;
        creating.mutate({
          path: parent === "" ? wanted : `${parent}/${wanted}`,
          kind: gesture.makes,
        });
        return;
      }
      if (gesture.kind !== "rename") return;

      const from = gesture.path;
      // Sent as typed, including a name that only differs in case: which
      // spellings the disk tells apart is the guard's question, not the
      // browser's (Q17, §5).
      const reopen = shown !== null && covers(from, shown) ? shown : null;
      const go = (): void => renaming.mutate({ from, to: wanted, reopen });
      if (reopen === null) go();
      else letGo(go);
    },
    [creating, gesture, letGo, renaming, shown],
  );

  const confirm = useCallback((): void => {
    if (gesture.kind !== "delete") return;
    const path = gesture.path;
    const reopen = shown !== null && covers(path, shown) ? shown : null;
    // `recursive` from what the row is, because the daemon refuses a directory
    // with anything in it otherwise — and the person already agreed to the
    // count this dialog showed them.
    const go = (): void => removing.mutate({ path, recursive: gesture.directory, reopen });
    if (reopen === null) go();
    else letGo(go);
  }, [gesture, letGo, removing, shown]);

  return {
    gesture,
    ask,
    cancel,
    refusal:
      creating.error?.message ?? renaming.error?.message ?? removing.error?.message ?? null,
    busy: creating.isPending || renaming.isPending || removing.isPending,
    submit,
    confirm,
    preview,
  };
}
