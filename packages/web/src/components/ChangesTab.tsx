import { useEffect, useRef, useState } from "react";

import {
  statusMark,
  statusTone,
  useCheckoutChanges,
  type ChangeRef,
  type ChangedFile,
} from "../hooks/useCheckoutChanges.js";
import type { Scope } from "../hooks/useSessionsByScope.js";

export interface ChangesTabProps {
  scope: Scope;
  /** The path whose patch the tab's split is showing, if any. */
  openPath: string | null;
  onOpenPatch(path: string, ref: ChangeRef): void;
  /** So the column's footer can say which comparison is on screen. */
  onRefChange?(ref: ChangeRef): void;
}

/**
 * What changed in the checkout, in either of the two views (D1).
 *
 * `não commitado` answers what the agent just did; `vs base` answers what this
 * worktree did in total, commits included. Clicking a file opens its patch in
 * the tab's split — the same place a file opens, because there is one place
 * where content is read.
 */
export function ChangesTab({ scope, openPath, onOpenPatch, onRefChange }: ChangesTabProps) {
  const [ref, setRef] = useState<ChangeRef>("worktree");
  const changes = useCheckoutChanges(scope, ref);

  // The client cannot know a branch is gone before asking, so the toggle stays
  // live until the daemon refuses — and then says why, rather than going quiet.
  const baseRefused = ref === "base" && changes.isError ? changes.error.message : null;

  // Remembered rather than read from the current answer: when the base view is
  // refused there is no answer to read, and the toggle would rename itself to
  // "vs base" at the exact moment the user is trying to understand it.
  const knownBase = useRef("base");
  useEffect(() => {
    if (changes.data !== undefined) knownBase.current = changes.data.baseBranch;
  }, [changes.data]);
  const baseBranch = changes.data?.baseBranch ?? knownBase.current;

  const files = changes.data?.files ?? [];
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);

  function select(next: ChangeRef): void {
    setRef(next);
    onRefChange?.(next);
  }

  return (
    <>
      <div className="seg-wrap">
        <div className="seg" role="group" aria-label="o que comparar">
          <button
            type="button"
            className={`seg__btn${ref === "worktree" ? " seg__btn--on" : ""}`}
            aria-pressed={ref === "worktree"}
            onClick={() => select("worktree")}
          >
            não commitado
          </button>
          <button
            type="button"
            className={`seg__btn${ref === "base" ? " seg__btn--on" : ""}${
              baseRefused === null ? "" : " seg__btn--off"
            }`}
            aria-pressed={ref === "base"}
            onClick={() => select("base")}
          >
            vs {baseBranch}
          </button>
        </div>
      </div>

      {baseRefused !== null && (
        <p className="fnote" role="alert">
          <span className="fnote__glyph" aria-hidden="true">
            ⚠
          </span>
          <span>{baseRefused}</span>
        </p>
      )}

      {changes.isPending ? (
        <div className="rp__scroll">
          <p className="fnote">carregando…</p>
        </div>
      ) : files.length === 0 && baseRefused === null ? (
        emptyState(ref, baseBranch)
      ) : (
        <>
          <p className="sum">
            <span>
              {files.length} {files.length === 1 ? "arquivo" : "arquivos"}
            </span>
            {additions > 0 && <span className="plus">+{additions}</span>}
            {deletions > 0 && <span className="minus">−{deletions}</span>}
          </p>
          <div className="rp__scroll">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                open={openPath === file.path}
                onOpen={() => onOpenPatch(file.path, ref)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FileRow({
  file,
  open,
  onOpen,
}: {
  file: ChangedFile;
  open: boolean;
  onOpen(): void;
}) {
  const cut = file.path.lastIndexOf("/");
  const dir = cut === -1 ? "" : file.path.slice(0, cut + 1);
  const name = file.path.slice(cut + 1);

  return (
    <button type="button" className={`drow${open ? " drow--open" : ""}`} onClick={onOpen}>
      <span className={`mark mark--${statusTone(file.status)}`} title={file.status}>
        {statusMark(file.status)}
      </span>
      <span className="dpath" title={file.path}>
        <span className="dpath__dir">{dir}</span>
        <span className="dpath__name">{name}</span>
      </span>
      {file.binary ? (
        <span className="dstat">binário</span>
      ) : (
        <>
          {file.additions > 0 && <span className="dstat plus">+{file.additions}</span>}
          {file.deletions > 0 && <span className="dstat minus">−{file.deletions}</span>}
        </>
      )}
      {file.oldPath !== null && <span className="drow__was">era {file.oldPath}</span>}
      <span className="drow__gap" />
    </button>
  );
}

/** Two views, two different kinds of nothing (F4.7). */
function emptyState(ref: ChangeRef, baseBranch: string) {
  return (
    <div className="empty">
      <span className="empty__glyph" aria-hidden="true">
        ✓
      </span>
      <span className="empty__title">
        {ref === "worktree" ? "nada por commitar" : `idêntica a ${baseBranch}`}
      </span>
      <span className="empty__why">
        {ref === "worktree"
          ? "a árvore de trabalho está igual ao HEAD. O que já foi commitado aparece na outra vista."
          : "nada nesta worktree diverge da base — nem commitado, nem por commitar."}
      </span>
    </div>
  );
}
