import type { ReactNode } from "react";

import "./viewer.css";

export interface ViewerFrameProps {
  /** Root-relative path, shown as a dim directory and a lit file name. */
  path: string;
  /** Counts and the like, between the path and the actions. */
  headExtra?: ReactNode;
  wrap: boolean;
  onToggleWrap(): void;
  onClose(): void;
  footLeft?: ReactNode;
  footRight?: ReactNode;
  children: ReactNode;
}

/**
 * The frame a file and a patch share inside the split.
 *
 * One place where content is read means one grammar for reading it: the same
 * header, the same wrap toggle, the same ✕. The two differ in what they put
 * between the lines, and in nothing else.
 */
export function ViewerFrame({
  path,
  headExtra,
  wrap,
  onToggleWrap,
  onClose,
  footLeft,
  footRight,
  children,
}: ViewerFrameProps) {
  const cut = path.lastIndexOf("/");
  const dir = cut === -1 ? "" : path.slice(0, cut + 1);
  const name = path.slice(cut + 1);

  return (
    <div className="viewer">
      <div className="viewer__head">
        <span className="fpath" title={path}>
          {/* The directory truncates from the left: the file name is what
              identifies the thing, and cutting at the end would kill it. */}
          <span className="fpath__dir">{dir}</span>
          <span className="fpath__name">{name}</span>
        </span>
        {headExtra}
        <span className="viewer__spacer" />
        <button
          type="button"
          className={`rp__icon${wrap ? " rp__icon--on" : ""}`}
          aria-pressed={wrap}
          onClick={onToggleWrap}
          title="quebrar linhas longas"
        >
          ⇄<span className="sr-only">quebrar linhas longas</span>
        </button>
        <button type="button" className="rp__icon" onClick={onClose} title="fechar">
          ✕<span className="sr-only">fechar</span>
        </button>
      </div>

      {children}

      <div className="viewer__foot">
        <span>{footLeft}</span>
        <span className="viewer__spacer" />
        <span>{footRight}</span>
      </div>
    </div>
  );
}
