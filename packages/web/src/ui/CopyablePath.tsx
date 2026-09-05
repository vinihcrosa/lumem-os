import { useEffect, useState } from "react";

export interface CopyablePathProps {
  /** The absolute path, verbatim and whole. */
  path: string;
}

/**
 * A path that fits, and that can leave the browser.
 *
 * This is the piece the worktree-first-tab exists for. While the checkout was a
 * fixed header two lines tall, the disk path was the first thing to be cut —
 * and it is the one value on the screen nobody can retype from memory, so a
 * truncated one is the same as an absent one. As a tab it has the room, so it
 * WRAPS instead of clipping: costing a second line beats costing the answer.
 *
 * The button is a convenience on top of that and disappears when the platform
 * has no clipboard. The text stays selectable either way, which is the part
 * that has to work.
 */
export function CopyablePath({ path }: CopyablePathProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [path]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const clipboard = navigator.clipboard;

  return (
    <span className="path">
      <span className="path__value">{path}</span>
      {clipboard !== undefined && (
        <button
          type="button"
          className="path__copy"
          aria-label={copied ? "caminho copiado" : "copiar caminho"}
          onClick={() => {
            // Fire and forget: a rejected write leaves the text exactly as
            // selectable as it already was, and a banner about a convenience
            // is noise.
            void clipboard.writeText(path).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
        </button>
      )}
    </span>
  );
}
