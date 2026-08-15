import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { ChangeRef } from "../hooks/useCheckoutChanges.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { patchKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { ViewerFrame } from "./ViewerFrame.js";

export interface PatchViewerProps {
  scope: Scope;
  path: string;
  changeRef: ChangeRef;
  onClose(): void;
}

/**
 * One file's patch, in the same split the file viewer uses (D3.2).
 *
 * Asked per file, F4.4: a whole refactor's diff overruns the daemon's 16 MiB
 * buffer, and one file would take the tab down with it.
 */
export function PatchViewer({ scope, path, changeRef, onClose }: PatchViewerProps) {
  const [wrap, setWrap] = useState(true);

  const patch = useQuery({
    queryKey: patchKey(scope.scopeType, scope.scopeId, changeRef, path),
    queryFn: () =>
      trpc.changes.patch.query({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        ref: changeRef,
        path,
      }),
    refetchOnWindowFocus: true,
  });

  const lines = patch.data === undefined ? [] : parsePatch(patch.data.patch);
  const hunks = lines.filter((line) => line.kind === "hunk").length;

  return (
    <ViewerFrame
      path={path}
      onClose={onClose}
      wrap={wrap}
      onToggleWrap={() => setWrap((current) => !current)}
      footLeft={changeRef === "worktree" ? "não commitado · vs HEAD" : "vs base"}
      footRight={hunks === 0 ? undefined : `${hunks} ${hunks === 1 ? "hunk" : "hunks"}`}
    >
      {renderBody()}
    </ViewerFrame>
  );

  function renderBody() {
    if (patch.isPending) return <div className="patch">carregando…</div>;
    if (patch.isError) {
      return (
        <div className="refuse" role="alert">
          <span className="refuse__glyph" aria-hidden="true">
            ⚠
          </span>
          <span className="refuse__title">não deu para ler o diff</span>
          <span className="refuse__why">{patch.error.message}</span>
        </div>
      );
    }
    if (patch.data.binary) {
      return (
        <div className="refuse">
          <span className="refuse__glyph" aria-hidden="true">
            ▦
          </span>
          <span className="refuse__title">arquivo binário</span>
          <span className="refuse__why">o git conta linhas, e aqui não há linhas para contar.</span>
        </div>
      );
    }
    if (lines.length === 0) {
      return (
        <div className="empty">
          <span className="empty__glyph" aria-hidden="true">
            ✓
          </span>
          <span className="empty__title">sem diferenças neste arquivo</span>
        </div>
      );
    }

    return (
      <div className={`patch${wrap ? "" : " patch--nowrap"}`}>
        {lines.map((line, index) =>
          line.kind === "hunk" ? (
            <div className="hunk" key={index}>
              {line.text}
            </div>
          ) : (
            <div className={`dl${line.kind === "add" ? " dl--add" : line.kind === "del" ? " dl--del" : ""}`} key={index}>
              <span className="dl__sig" aria-hidden="true">
                {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
              </span>
              <span className="dl__t">{line.text}</span>
            </div>
          ),
        )}
      </div>
    );
  }
}

export type PatchLine =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "context"; text: string };

/**
 * Turns a unified diff into lines the viewer can paint.
 *
 * The file headers — `diff --git`, `index`, `---`, `+++` — are dropped: the
 * frame already says which file this is, and repeating it costs four lines of
 * a column that is 360px wide. Everything from the first `@@` on is kept.
 */
export function parsePatch(patch: string): PatchLine[] {
  const lines: PatchLine[] = [];
  let started = false;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      started = true;
      lines.push({ kind: "hunk", text: raw });
      continue;
    }
    if (!started) continue;
    // git ends a file with no trailing newline by saying so, in prose.
    if (raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) lines.push({ kind: "add", text: raw.slice(1) });
    else if (raw.startsWith("-")) lines.push({ kind: "del", text: raw.slice(1) });
    else if (raw !== "" || lines.length > 0) lines.push({ kind: "context", text: raw.slice(1) });
  }

  // A diff ends with a newline, which would otherwise show as an empty line.
  if (lines.at(-1)?.kind === "context" && lines.at(-1)?.text === "") lines.pop();
  return lines;
}
