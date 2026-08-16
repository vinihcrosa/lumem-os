import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { usePopover } from "../hooks/usePopover.js";
import { useFileTree, type FileTreeEdits } from "../hooks/useFileTree.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { statusMark, statusTone, type ChangeStatus } from "../hooks/useCheckoutChanges.js";
import { fileListKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Card, Glyph, Menu, MenuItem } from "../ui/index.js";

export interface FileTreeProps {
  scope: Scope;
  /** Which file the tab's split is showing, if any. */
  openPath: string | null;
  onOpen(path: string): void;
  /** Status of a path in the working tree, for the marker. */
  statusOf(path: string): ChangeStatus | undefined;
}

/**
 * The checkout's files, one level at a time (D2), and now editable (F4).
 *
 * Nothing is hidden — `node_modules`, `.git` and everything `.gitignore`
 * covers all show up, because a build that broke is exactly when someone wants
 * to look inside `dist/`. The price is a ceiling per directory, and a listing
 * that stops has to say so: silence there reads as "that is all of it".
 *
 * The actions live in the row rather than in a bar over the column: renaming and
 * removing need a target, and a bar would have to invent "what is selected" in a
 * tree whose only selection is "what the split has open".
 */
export function FileTree({ scope, openPath, onOpen, statusOf }: FileTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const edits = useFileTree(scope);

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  // Creating draws the name field inside the directory it will land in, so the
  // directory has to be open — picking "novo arquivo" on a collapsed row would
  // otherwise put the field somewhere nobody is looking.
  const expand = useCallback((path: string) => {
    setExpanded((current) => (current.has(path) ? current : new Set(current).add(path)));
  }, []);

  return (
    <>
      <div className="rp__scroll" role="tree" aria-label="arquivos">
        <Level
          scope={scope}
          path=""
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onExpand={expand}
          edits={edits}
          openPath={openPath}
          onOpen={onOpen}
          statusOf={statusOf}
        />
      </div>
      <RemoveDialog edits={edits} />
    </>
  );
}

interface LevelProps extends FileTreeProps {
  path: string;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle(path: string): void;
  onExpand(path: string): void;
  edits: FileTreeEdits;
}

function Level({
  scope,
  path,
  depth,
  expanded,
  onToggle,
  onExpand,
  edits,
  openPath,
  onOpen,
  statusOf,
}: LevelProps) {
  // One query per open directory: expanding costs a listing, collapsing costs
  // nothing, and the cache keeps what was already read.
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const listing = useQuery({
    queryKey: [...fileListKey(scope.scopeType, scope.scopeId, path), limit ?? "default"],
    queryFn: () =>
      trpc.files.listDir.query({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        path,
        ...(limit === undefined ? {} : { limit }),
      }),
    refetchOnWindowFocus: true,
  });

  // Drawn in every branch below, empty directory and failed listing included:
  // creating the first file of an empty folder is the case that needs it most.
  const gesture = edits.gesture;
  const field =
    gesture.kind === "create" && gesture.parent === path ? (
      <NameField
        key={`${path}:${gesture.makes}`}
        depth={depth}
        label={gesture.makes === "dir" ? "nova pasta" : "novo arquivo"}
        initial=""
        hint={
          <>
            enter cria em <code>{path === "" ? "./" : `${path}/`}</code> · esc cancela
          </>
        }
        edits={edits}
      />
    ) : null;

  if (listing.isPending) {
    return (
      <>
        {field}
        <p className="fnote" style={{ "--depth": depth } as never}>
          carregando…
        </p>
      </>
    );
  }
  if (listing.isError) {
    return (
      <>
        {field}
        <p className="fnote" style={{ "--depth": depth } as never} role="alert">
          <span className="fnote__glyph" aria-hidden="true">
            ⚠
          </span>
          <span>{listing.error.message}</span>
        </p>
      </>
    );
  }

  const { entries, total, truncated } = listing.data;
  if (entries.length === 0) {
    return (
      <>
        {field}
        <p className="fnote" style={{ "--depth": depth } as never}>
          vazio
        </p>
      </>
    );
  }

  return (
    <>
      {field}
      {entries.map((entry) => {
        const full = path === "" ? entry.name : `${path}/${entry.name}`;
        const isDir = entry.kind === "dir";
        const open = expanded.has(full);
        const status = statusOf(full);

        if (gesture.kind === "rename" && gesture.path === full) {
          return (
            <NameField
              key={full}
              depth={depth}
              label="renomear"
              // The whole path, because renaming is moving (F4.2): a field that
              // starts with the bare name teaches that it only takes a name.
              initial={full}
              hint={<>com barra, move · esc cancela</>}
              edits={edits}
            />
          );
        }

        return (
          <div key={full} role="group">
            <div className="frow-wrap">
              <button
                type="button"
                className={[
                  "frow",
                  isDir ? "frow--dir" : "",
                  status === "deleted" ? "frow--dim" : "",
                  openPath === full ? "frow--open" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-expanded={isDir ? open : undefined}
                onClick={() => (isDir ? onToggle(full) : onOpen(full))}
              >
                <span
                  className="frow__twist"
                  style={{ "--depth": depth } as never}
                  aria-hidden="true"
                >
                  {isDir ? (open ? "▾" : "▸") : ""}
                </span>
                <span className="frow__name">{entry.name}</span>
                {status !== undefined && (
                  <span className={`mark mark--${statusTone(status)}`} title={status}>
                    {statusMark(status)}
                  </span>
                )}
                <span className="frow__gap" />
                {entry.size !== null && entry.size > 0 && (
                  <span className="frow__size">{formatSize(entry.size)}</span>
                )}
              </button>
              <RowActions
                path={full}
                isDir={isDir}
                edits={edits}
                onExpand={onExpand}
              />
            </div>

            {isDir && open && (
              <Level
                scope={scope}
                path={full}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onExpand={onExpand}
                edits={edits}
                openPath={openPath}
                onOpen={onOpen}
                statusOf={statusOf}
              />
            )}
          </div>
        );
      })}

      {truncated && (
        <p className="fnote" style={{ "--depth": depth } as never}>
          <span className="fnote__glyph" aria-hidden="true">
            ⚠
          </span>
          <span>
            {entries.length} de {total} entradas.{" "}
            <button type="button" onClick={() => setLimit(total)}>
              listar assim mesmo
            </button>
          </span>
        </p>
      )}
    </>
  );
}

/**
 * The four actions of a row, behind one `⋯`.
 *
 * A sibling of the row's button and never a child of it: a button inside a
 * button is not markup, and the click would belong to whichever one the browser
 * decided. Four icons of their own would leave no width for the name, which is
 * the content, in a column that starts at 260px.
 */
function RowActions({
  path,
  isDir,
  edits,
  onExpand,
}: {
  path: string;
  isDir: boolean;
  edits: FileTreeEdits;
  onExpand(path: string): void;
}) {
  const popover = usePopover();

  const create = (makes: "file" | "dir") => () => {
    popover.close();
    onExpand(path);
    edits.ask({ kind: "create", parent: path, makes });
  };

  return (
    <>
      <button
        type="button"
        ref={popover.triggerRef}
        className="fact"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-label={`ações de ${path}`}
        onClick={popover.toggle}
      >
        ⋯
      </button>

      {popover.open && (
        <div className="frow-menu" ref={popover.panelRef}>
          <Menu label={`ações de ${path}`}>
            {isDir && (
              <>
                <MenuItem glyph={<Glyph>＋</Glyph>} onSelect={create("file")}>
                  novo arquivo
                </MenuItem>
                <MenuItem glyph={<Glyph>▤</Glyph>} onSelect={create("dir")}>
                  nova pasta
                </MenuItem>
                <div className="frow-menu__sep" role="separator" />
              </>
            )}
            <MenuItem
              glyph={<Glyph>✎</Glyph>}
              onSelect={() => {
                popover.close();
                edits.ask({ kind: "rename", path });
              }}
            >
              renomear
            </MenuItem>
            <MenuItem
              // The one irreversible item, and the only colour in the menu.
              glyph={<Glyph tone="warn">✕</Glyph>}
              onSelect={() => {
                popover.close();
                edits.ask({ kind: "delete", path, directory: isDir });
              }}
            >
              apagar
            </MenuItem>
          </Menu>
        </div>
      )}
    </>
  );
}

/**
 * The name, typed in the row itself.
 *
 * In the indentation the file will have, which is what answers "onde isto está
 * sendo criado" without a sentence. The refusal takes the hint's place, in the
 * daemon's own words — the client has no way of knowing what holds a name, and
 * F4.4 is precisely that nothing gets overwritten to find out.
 */
function NameField({
  depth,
  label,
  initial,
  hint,
  edits,
}: {
  depth: number;
  label: string;
  initial: string;
  hint: ReactNode;
  edits: FileTreeEdits;
}) {
  const [value, setValue] = useState(initial);
  const failed = edits.refusal !== null;

  return (
    <>
      <form
        className="fedit"
        onSubmit={(event) => {
          // In a browser, Enter in a lone text input submits the form on its
          // own — this is that submit, and the only way in.
          event.preventDefault();
          edits.submit(value);
        }}
      >
        <span className="frow__twist" style={{ "--depth": depth } as never} aria-hidden="true" />
        <input
          className={`finput${failed ? " finput--error" : ""}`}
          aria-label={label}
          aria-invalid={failed}
          value={value}
          autoFocus
          disabled={edits.busy}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") edits.cancel();
          }}
        />
      </form>
      <p
        className={`fhint${failed ? " fhint--error" : ""}`}
        style={{ "--depth": depth } as never}
        role={failed ? "alert" : undefined}
      >
        {edits.refusal ?? hint}
      </p>
    </>
  );
}

/**
 * What is about to be lost, named, and whether git brings it back (F4.3).
 *
 * Over the column and not over the app: the target of the gesture is a row of
 * this tree, and a dialog centred on the window would put the question far from
 * the thing it is about.
 */
function RemoveDialog({ edits }: { edits: FileTreeEdits }) {
  const { gesture, cancel } = edits;

  useEffect(() => {
    if (gesture.kind !== "delete") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [gesture.kind, cancel]);

  if (gesture.kind !== "delete") return null;

  const preview = edits.preview;
  const shape = preview.data ?? null;
  const entries = shape !== null && shape.kind === "dir" ? shape.files + shape.dirs : null;
  const floor = shape !== null && shape.kind === "dir" && shape.truncated;

  return (
    <div className="fdim" role="dialog" aria-modal="true" aria-label={`apagar ${gesture.path}`}>
      <Card
        title={gesture.directory ? "apagar esta pasta e o que tem dentro?" : "apagar este arquivo?"}
      >
        {/* Spelled out, in mono, relative to the checkout: in a tree with three
            `loader.ts` the bare name identifies nothing. */}
        <code className="fdim__target">{gesture.path}</code>

        {preview.isPending && <p className="fdim__note">consultando o git…</p>}
        {preview.isError && (
          <Banner tone="danger">
            não deu para consultar o git: {preview.error.message}. Nada foi verificado sobre o que
            volta.
          </Banner>
        )}
        {shape !== null && shape.kind === "file" && <FileVerdict path={gesture.path} tracked={shape.tracked} />}
        {shape !== null && shape.kind === "dir" && (
          <>
            <p className="fdim__note">
              {floor ? "pelo menos " : ""}
              {count(shape.files)} {shape.files === 1 ? "arquivo" : "arquivos"} e{" "}
              {count(shape.dirs)} {shape.dirs === 1 ? "pasta" : "pastas"}, contando os
              subdiretórios.
              {/* The ceiling the server paid for: past it the walk stops, and
                  every number above is a floor. Showing it as a total is the
                  lie F5.7 exists to prevent. */}
              {floor ? " A contagem parou no teto do daemon." : ""}
            </p>
            <DirVerdict path={gesture.path} files={shape.files} untracked={shape.untracked} />
          </>
        )}

        <div className="fdim__actions">
          <Button variant="ghost" onClick={cancel}>
            cancelar
          </Button>
          <Button variant="danger" disabled={edits.busy} onClick={edits.confirm}>
            {entries === null
              ? "apagar"
              : `apagar ${floor ? "pelo menos " : "as "}${count(entries)} ${entries === 1 ? "entrada" : "entradas"}`}
          </Button>
        </div>

        {edits.refusal !== null && <Banner tone="danger">{edits.refusal}</Banner>}
      </Card>
    </div>
  );
}

/**
 * What git can and cannot promise about one entry.
 *
 * `tracked: false` means "git has no copy **or** git could not answer" (Q18):
 * `isTracked` swallows a timeout and a checkout that is not a repository into
 * the same `false`. The direction of that error is safe — it warns too much
 * rather than promising a recovery that does not exist — and the sentence has to
 * stop where the daemon's knowledge stops.
 */
function FileVerdict({ path, tracked }: { path: string; tracked: boolean }) {
  if (tracked) {
    return (
      <Banner tone="info">
        o git tem uma cópia: <code>git checkout -- {path}</code> traz de volta o que está no
        índice.
      </Banner>
    );
  }
  return (
    <Banner tone="danger">
      <strong>o git não confirmou ter uma cópia disto.</strong> Pode não haver nada que traga de
      volta — nem o histórico, nem esta janela.
    </Banner>
  );
}

function DirVerdict({ path, files, untracked }: { path: string; files: number; untracked: number }) {
  if (untracked === 0) {
    // Worded so it stays true of an empty directory too: git tracks no folder,
    // and "traz a pasta de volta" would be a promise about something git has no
    // concept of.
    return (
      <Banner tone="info">
        o git tem cópia do que está aqui dentro: <code>git checkout -- {path}</code> traz de volta o
        que está no índice.
      </Banner>
    );
  }
  const recovered = files - untracked;
  return (
    <Banner tone="danger">
      <strong>
        de {count(files)}, {count(untracked)} o git não confirmou ter.
      </strong>{" "}
      {recovered > 0
        ? `Nada garante que voltem; ${count(recovered)} o git desfaz.`
        : "Nada garante que voltem."}
    </Banner>
  );
}

/** Grouped the way the rest of the app writes numbers, so 2000 reads as 2.000. */
function count(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Bytes as something a human reads at a glance, not as a number to compare. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
