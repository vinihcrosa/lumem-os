import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorHandle } from "../lib/codemirror-setup.js";
import { fileListKey, fileReadKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import type { Scope, ScopeType } from "./useSessionsByScope.js";

/**
 * How long the typing has to stop before the buffer goes to the disk.
 *
 * 800 ms, argued in Q8: keystrokes inside a sentence land 100–300 ms apart and
 * a pause near 600 ms is already someone reading what they wrote, so a shorter
 * number turns every word into a write — and every write into a `git status`
 * on the checkout the agent is using. One place, named, and this is it.
 */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * The three versions the client has when the agent gets there first (F3.4).
 *
 * The server cannot work this out — it keeps a hash, and a hash does not turn
 * back into text — so the two costs are measured here, by the only side that
 * holds the text it read, the text it has, and the text on the disk.
 */
export interface Conflict {
  /** The disk's, from the refusal: what "sobrescrever" writes against. */
  revision: string;
  /** The disk's mtime, epoch ms: "o agente escreveu isto há 8 s". */
  changedAt: number;
  /** What the buffer was built on, and the common ancestor of the other two. */
  base: string;
  /** The buffer, kept up to date for as long as the choice is on screen. */
  mine: string;
  /** Null until the read that measures the other side lands. */
  disk: FileText | null;
}

/** What the footer says about the file, and the only thing autosave says of itself. */
export type SaveState =
  | { kind: "clean" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  /** The daemon threw: gone file, `.git`, no permission, bytes that are not UTF-8. */
  | { kind: "failed"; why: string }
  /** The daemon refused: `ok: false`, which is an answer and not a failure (D3.1). */
  | ({ kind: "stale" } & Conflict);

export interface LineDelta {
  added: number;
  removed: number;
}

/**
 * How many lines stand between two versions of the same file.
 *
 * Common head and common tail are cut off and what is left is the region that
 * differs — which is the exact `+n −n` of a single contiguous edit, the shape
 * an agent's `Edit` has, and a **floor** for anything scattered: two changes
 * far apart are reported as the whole stretch that holds them. That direction
 * is deliberate on a screen whose job is to say what is about to be lost;
 * counting less than the truth there is the one unusable answer.
 *
 * A real diff would tighten the scattered case and costs O(n·m) on files this
 * feature allows up to a mebibyte. Not worth it for a number someone reads
 * once, before clicking.
 */
export function lineDelta(from: string, to: string): LineDelta {
  if (from === to) return { added: 0, removed: 0 };

  const before = from.split("\n");
  const after = to.split("\n");
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;

  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }

  return { added: after.length - head - tail, removed: before.length - head - tail };
}

export interface FileBufferOptions {
  scope: Scope;
  path: string;
  /**
   * False when this tab is behind another one. Every session tab stays mounted
   * (`SessionTabPanel`), so going behind is a prop and not an unmount — which
   * makes this the only way the buffer hears that it left the screen.
   */
  active: boolean;
}

/**
 * Written out rather than inferred, and for a reason the client already knew.
 *
 * The inferred shape reaches into the server package's own files, which this
 * package cannot name (TS2742) — the same wall `trpc.ts` hit and annotated its
 * way past.
 */
export interface FileBuffer {
  /** The daemon's answer for this file: the five refusals arrive in here too. */
  content: UseQueryResult<FileRead>;
  state: SaveState;
  /** Takes the editor as it mounts, and null just before it goes. */
  attach(handle: EditorHandle | null): void;
  /** Writes again after a failure, for the footer's own way out. */
  retry(): void;
  /** One of the two exits: takes the agent's file and drops what was typed. */
  reload(): void;
  /** The other: writes the buffer against the revision the refusal carried. */
  overwrite(): void;
}

interface Target {
  scopeType: ScopeType;
  scopeId: string;
  path: string;
}

/** One write, ready to go, with everything it needs already read off the editor. */
interface Slot {
  target: Target;
  text: string;
  baseRevision: string;
  /** Which edit this text is, so a write that lands can say whether it is still the last one. */
  version: number;
}

function sameTarget(a: Target, b: Target): boolean {
  return a.scopeType === b.scopeType && a.scopeId === b.scopeId && a.path === b.path;
}

/** The directory whose listing has one more — or one different — file in it now. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the daemon answers, named from the client rather than restated by hand. */
export type FileRead = Awaited<ReturnType<typeof trpc.files.read.query>>;

/** The one shape with a buffer in it; the other two have nothing to edit. */
type FileText = Extract<FileRead, { kind: "text" }>;

/**
 * Written as a statement and not as a ternary, and that is not style.
 *
 * `answer.kind === "text" ? answer : null` hands back the whole union widened
 * again — the narrowing does not survive the conditional expression — and every
 * read of `text` past it stops compiling.
 */
function textOf(answer: FileRead | undefined): FileText | null {
  if (answer === undefined || answer.kind !== "text") return null;
  return answer;
}

/**
 * The open file: read from the disk, and written back to it on its own (F2, D2).
 *
 * Reading and writing one file are one concern here and not two, because D4 is
 * exactly the seam between them: **a dirty buffer refuses every refetch**, and
 * that refusal has to live inside the read itself — the gestures that ask for
 * one are the column's reload button, `worktree.changed` and the unfiltered
 * invalidation of every reconnect, and no cache key and no query option
 * separates all three.
 *
 * There is no save button and no dirty state that survives leaving the screen,
 * so the whole promise is one sentence: **the only way to lose what was typed
 * is for it to leave the screen before the debounce is up, and that does not
 * happen.** Five gestures take the file off the screen and every one of them
 * writes first — three land on `attach(null)`, which is the last moment the
 * buffer can still be read.
 *
 * The write is guarded by a revision (F3.2), and the revision the daemon hands
 * back becomes the base of the next one. Without that chaining the *second*
 * stop of typing is refused as `stale` against the client's own previous write.
 */
export function useFileBuffer({ scope, path, active }: FileBufferOptions): FileBuffer {
  const queryClient = useQueryClient();

  const editor = useRef<EditorHandle | null>(null);
  /** What the disk last said, and therefore what the next write is based on. */
  const base = useRef<{ text: string; revision: string } | null>(null);
  /** The file on screen right now, for everything that runs after a render. */
  const here = useRef<Target>({ scopeType: scope.scopeType, scopeId: scope.scopeId, path });
  /**
   * Where the unsaved text belongs, captured when it was typed.
   *
   * Not read off the props at write time: opening another file re-renders this
   * hook with the new path *before* the old editor detaches, and a write aimed
   * at `here` would put the previous file's buffer into the new file.
   */
  const belongsTo = useRef<Target | null>(null);

  const version = useRef(0);
  const written = useRef(0);
  const queued = useRef<Slot | null>(null);
  const busy = useRef(false);
  /** Set by a `stale` refusal: nothing more is written until someone chooses. */
  const halted = useRef(false);
  /** The same conflict the state renders, where the two exits can reach it. */
  const conflict = useRef<Conflict | null>(null);
  const timer = useRef<number | null>(null);
  /** A read that was answered from the screen, and is owed to whoever asked. */
  const missed = useRef(false);

  const [state, setState] = useState<SaveState>({ kind: "clean" });
  const [fresh, setFresh] = useState(true);
  const freshRef = useRef(true);

  const key = fileReadKey(scope.scopeType, scope.scopeId, path);
  const content = useQuery({
    queryKey: key,
    queryFn: () => {
      // D4 as a read and not as a policy: while there is typing the disk does
      // not have, a read of this file answers with what is already on screen.
      //
      // It lives here because the doors are not one. `["files"]` is invalidated
      // by the column's reload button *and* by `worktree.changed`, and every
      // reconnect of the event stream fires an `invalidateQueries()` with no
      // key at all — which separate prefixes do not reach and no option turns
      // off. `enabled: false` would close all three and open another: a query
      // going from disabled to enabled refetches, so every save would be
      // followed by a pointless re-read of the file it had just written.
      const seen = queryClient.getQueryData<FileRead>(key);
      if (!freshRef.current && seen !== undefined) {
        missed.current = true;
        return seen;
      }
      return trpc.files.read.query({ scopeType: scope.scopeType, scopeId: scope.scopeId, path });
    },
    // Losing and regaining the window's focus is the most exercised of the five
    // unloading triggers, and therefore the likeliest refetch. With a clean
    // buffer it adopts the disk (D4); with a dirty one it does not even ask.
    refetchOnWindowFocus: fresh,
  });

  const text = textOf(content.data);
  /**
   * Assigned while rendering rather than from an effect, and it has to be.
   *
   * A change of the answer remounts the editor, and a child's effect body runs
   * before its parent's — so `attach` would be handed the previous answer by an
   * effect that had not run yet, and hang a listener on a file the daemon
   * refuses to write.
   */
  const frozen = useRef(false);
  frozen.current = text === null || text.readOnly !== null;

  const settleFresh = useCallback((next: boolean): void => {
    freshRef.current = next;
    setFresh(next);
  }, []);

  const cancelTimer = useCallback((): void => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const showConflict = useCallback((next: Conflict): void => {
    conflict.current = next;
    setState({ kind: "stale", ...next });
  }, []);

  const invalidateAround = useCallback(
    (target: Target): void => {
      // F2.5: the changes list and the directory that holds the file, and never
      // the file's own read — that one would come back from the disk over what
      // is being typed, which is the cycle this whole feature has to avoid.
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      void queryClient.invalidateQueries({
        queryKey: fileListKey(target.scopeType, target.scopeId, dirOf(target.path)),
      });
    },
    [queryClient],
  );

  const drain = useCallback((): void => {
    if (busy.current || halted.current) return;
    const sent = queued.current;
    if (sent === null) return;

    queued.current = null;
    busy.current = true;
    setState({ kind: "saving" });
    // A read that left before the first keystroke lands after this write and
    // would put the pre-write disk back on screen. The `queryFn` refuses the
    // reads that have not started; this drops the one already in the air.
    void queryClient.cancelQueries({
      queryKey: fileReadKey(sent.target.scopeType, sent.target.scopeId, sent.target.path),
    });

    void trpc.files.write
      .mutate({
        scopeType: sent.target.scopeType,
        scopeId: sent.target.scopeId,
        path: sent.target.path,
        text: sent.text,
        baseRevision: sent.baseRevision,
      })
      .then((result) => {
        if (!result.ok) {
          // A refusal for a file nobody has open any more has no choice to
          // offer: the buffer it was about left with the editor. Stopping the
          // autosave of whatever is open now would be stopping the wrong one.
          if (!sameTarget(sent.target, here.current)) return;

          halted.current = true;
          cancelTimer();
          showConflict({
            revision: result.revision,
            changedAt: result.changedAt,
            base: base.current?.text ?? sent.text,
            mine: editor.current?.getDoc() ?? sent.text,
            disk: null,
          });
          // Straight through the client and not through the cache: the read up
          // there answers a dirty buffer with what is already on screen, and
          // this is the one read that must not do that. It is also the third
          // version — the daemon keeps a hash, and a hash is not text.
          void trpc.files.read
            .query(sent.target)
            .then((answer) => {
              const disk = textOf(answer);
              const current = conflict.current;
              if (disk === null || current === null) return;
              showConflict({ ...current, disk });
            })
            .catch(() => {
              // Without the disk the costs cannot be measured, and the choice
              // is still the user's — it is offered without the numbers.
            });
          return;
        }

        // Only for the file still open: a write that lands after someone
        // switched files must not tell the new file what its disk looks like.
        if (sameTarget(sent.target, here.current)) {
          base.current = { text: sent.text, revision: result.revision };
          if (version.current === sent.version) {
            written.current = sent.version;
            settleFresh(true);
          }
          setState({ kind: "saved", at: Date.now() });
        }
        // What was typed while this one was in flight goes out against the
        // revision it just produced, not against the one it replaced.
        if (queued.current !== null && sameTarget(queued.current.target, sent.target)) {
          queued.current = { ...queued.current, baseRevision: result.revision };
        }
        invalidateAround(sent.target);
      })
      .catch((error: unknown) => {
        // The buffer is not discarded (F2.4): the text stays on screen and
        // `version` still runs ahead of `written`, so the next keystroke — or
        // the footer's own retry — writes it again.
        if (sameTarget(sent.target, here.current)) {
          setState({ kind: "failed", why: messageOf(error) });
        }
      })
      .finally(() => {
        busy.current = false;
        drain();
      });
  }, [cancelTimer, invalidateAround, queryClient, settleFresh, showConflict]);

  const save = useCallback((): void => {
    cancelTimer();
    const current = editor.current;
    const known = base.current;
    const target = belongsTo.current;
    if (current === null || known === null || target === null) return;
    if (version.current === written.current) return;

    queued.current = {
      target,
      text: current.getDoc(),
      baseRevision: known.revision,
      version: version.current,
    };
    drain();
  }, [cancelTimer, drain]);

  const flush = useCallback((): void => {
    if (halted.current) return;
    save();
  }, [save]);

  const changed = useCallback((): void => {
    version.current += 1;
    belongsTo.current = here.current;
    settleFresh(false);
    if (halted.current) {
      // Typing carries on while the choice is on screen, and so does what it
      // costs: a number frozen at the instant of the refusal is an adjective
      // wearing a measurement's clothes.
      const current = conflict.current;
      const editing = editor.current;
      if (current !== null && editing !== null) showConflict({ ...current, mine: editing.getDoc() });
      return;
    }

    cancelTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [cancelTimer, save, settleFresh, showConflict]);

  const attach = useCallback(
    (next: EditorHandle | null): void => {
      if (next === null) {
        // The detach is the last moment the buffer can be read, and it is where
        // closing the split, closing the tab, opening another file and plain
        // unmounting all arrive: React runs a child's cleanup before its
        // parent's, so anything waiting for the parent would find no editor.
        flush();
        editor.current?.onChange(null);
        editor.current = null;
        return;
      }

      editor.current = next;
      if (frozen.current) return;
      next.onChange(changed);
    },
    [changed, flush],
  );

  const retry = useCallback((): void => {
    save();
  }, [save]);

  /*
   * The two exits (F3.4, D3.1). Neither is the default, here or on screen —
   * choosing for someone would be choosing whose work is the disposable one.
   */
  const reload = useCallback((): void => {
    const chosen = conflict.current;
    const target = belongsTo.current;
    if (chosen === null || chosen.disk === null || target === null) return;

    conflict.current = null;
    halted.current = false;
    written.current = version.current;
    settleFresh(true);
    setState({ kind: "clean" });
    // Handing the disk to the cache is the whole of it: with the buffer clean
    // again, the adoption below is what puts the text on screen and moves the
    // revision the next write is based on. Same rule that takes in a change
    // nobody was racing — reloading is that, with the race decided.
    queryClient.setQueryData(
      fileReadKey(target.scopeType, target.scopeId, target.path),
      chosen.disk,
    );
  }, [queryClient, settleFresh]);

  const overwrite = useCallback((): void => {
    const chosen = conflict.current;
    const current = editor.current;
    const target = belongsTo.current;
    if (chosen === null || current === null || target === null) return;

    conflict.current = null;
    halted.current = false;
    // Against the revision the refusal carried, which is the disk's — E7 proved
    // this exact write passes, and it is why the refusal carries one at all.
    queued.current = {
      target,
      text: current.getDoc(),
      baseRevision: chosen.revision,
      version: version.current,
    };
    drain();
  }, [drain]);

  // Another file in the same split is another buffer. The old one has already
  // been written by the detach above — React runs cleanups before effect bodies.
  // Declared above the adoption below because on mount the two run in order,
  // and a reset that ran second would throw away the disk it had just read.
  useEffect(() => {
    here.current = { scopeType: scope.scopeType, scopeId: scope.scopeId, path };
    belongsTo.current = null;
    written.current = version.current;
    halted.current = false;
    conflict.current = null;
    base.current = null;
    settleFresh(true);
    setState({ kind: "clean" });
  }, [scope.scopeType, scope.scopeId, path, settleFresh]);

  // D4, and the reason a refetch cannot be the thing that decides: the buffer
  // adopts the disk only when it has nothing of its own to lose. Keyed on the
  // answer's identity, which react-query keeps when a refetch brings the same
  // bytes back and replaces when it does not.
  useEffect(() => {
    if (text === null) return;
    if (!freshRef.current) return;
    base.current = { text: text.text, revision: text.revision };
    editor.current?.setDoc(text.text);
  }, [text]);

  // "Read the disk again" asked while there was something to lose is owed, not
  // dropped: as soon as the buffer has nothing of its own, it is honoured.
  useEffect(() => {
    if (!fresh || !missed.current) return;
    missed.current = false;
    void queryClient.invalidateQueries({
      queryKey: fileReadKey(scope.scopeType, scope.scopeId, path),
    });
  }, [fresh, queryClient, scope.scopeType, scope.scopeId, path]);

  // Going behind another session's tab does not unmount anything, so this is
  // the only notice the buffer gets that it left the screen.
  useEffect(() => {
    if (active) return;
    flush();
  }, [active, flush]);

  useEffect(() => {
    const onBlur = (): void => flush();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [flush]);

  useEffect(() => cancelTimer, [cancelTimer]);

  return { content, state, attach, retry, reload, overwrite };
}
