import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import { statusMark, statusTone, type ChangeStatus } from "../hooks/useCheckoutChanges.js";
import { fileListKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface FileTreeProps {
  scope: Scope;
  /** Which file the tab's split is showing, if any. */
  openPath: string | null;
  onOpen(path: string): void;
  /** Status of a path in the working tree, for the marker. */
  statusOf(path: string): ChangeStatus | undefined;
}

/**
 * The checkout's files, one level at a time (D2).
 *
 * Nothing is hidden — `node_modules`, `.git` and everything `.gitignore`
 * covers all show up, because a build that broke is exactly when someone wants
 * to look inside `dist/`. The price is a ceiling per directory, and a listing
 * that stops has to say so: silence there reads as "that is all of it".
 */
export function FileTree({ scope, openPath, onOpen, statusOf }: FileTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="rp__scroll" role="tree" aria-label="arquivos">
      <Level
        scope={scope}
        path=""
        depth={0}
        expanded={expanded}
        onToggle={toggle}
        openPath={openPath}
        onOpen={onOpen}
        statusOf={statusOf}
      />
    </div>
  );
}

interface LevelProps extends FileTreeProps {
  path: string;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle(path: string): void;
}

function Level({
  scope,
  path,
  depth,
  expanded,
  onToggle,
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

  if (listing.isPending) {
    return (
      <p className="fnote" style={{ "--depth": depth } as never}>
        carregando…
      </p>
    );
  }
  if (listing.isError) {
    return (
      <p className="fnote" style={{ "--depth": depth } as never} role="alert">
        <span className="fnote__glyph" aria-hidden="true">
          ⚠
        </span>
        <span>{listing.error.message}</span>
      </p>
    );
  }

  const { entries, total, truncated } = listing.data;
  if (entries.length === 0) {
    return (
      <p className="fnote" style={{ "--depth": depth } as never}>
        vazio
      </p>
    );
  }

  return (
    <>
      {entries.map((entry) => {
        const full = path === "" ? entry.name : `${path}/${entry.name}`;
        const isDir = entry.kind === "dir";
        const open = expanded.has(full);
        const status = statusOf(full);

        return (
          <div key={full} role="group">
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
              <span className="frow__twist" style={{ "--depth": depth } as never} aria-hidden="true">
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

            {isDir && open && (
              <Level
                scope={scope}
                path={full}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
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

/** Bytes as something a human reads at a glance, not as a number to compare. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
