import { useEffect, useState } from "react";

import { Button } from "./Button.js";

export interface CopyCommandProps {
  /** The command, verbatim. It is meant to be pasted into a real shell. */
  command: string;
}

/**
 * A command the user is supposed to run somewhere else.
 *
 * The daemon never runs it (onboarding D5), so the only job here is to make the
 * text easy to get out of the browser. The button is a convenience on top of
 * that, and it disappears when the platform has no clipboard API — the text
 * stays selectable either way, which is the part that has to work.
 */
export function CopyCommand({ command }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  // Reset when the command itself changes: a "copiado" left over from the
  // previous command would claim something that never happened.
  useEffect(() => setCopied(false), [command]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const clipboard = navigator.clipboard;

  return (
    <div className="copy">
      <code className="copy__cmd">{command}</code>
      {clipboard !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            // Fire and forget on purpose: a rejected write (no permission, no
            // focus) leaves the text exactly as selectable as it already was,
            // and an error banner about a convenience is noise.
            void clipboard.writeText(command).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "copiado" : "copiar"}
        </Button>
      )}
    </div>
  );
}
