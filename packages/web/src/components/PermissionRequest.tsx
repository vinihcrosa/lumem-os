import { useEffect, useRef, useState } from "react";

import type { AcpPermissionOption } from "@lumem/shared";

import { Button } from "../ui/index.js";
import type { PendingPermission } from "../lib/conversation-model.js";

/**
 * The one block that stops everything (F2.4).
 *
 * Without an answer the agent waits forever, and with the default mode set to
 * `auto` (A9) it is asked rarely — which makes this the easiest path in the whole
 * feature to break in silence. Hence its own test file, and hence the choices
 * below being explicit rather than incidental:
 *
 * - **The command is shown whole.** It wraps rather than truncates. A truncated
 *   `rm -rf` is an `rm -rf` approved in the dark.
 * - **The options are the agent's, verbatim** (A13), and only one is primary.
 *   Four buttons in four colours is four things shouting; the one that is safe to
 *   press by reflex is the one that gets the fill.
 * - **It answers once.** A second click after the first has been sent would send
 *   an answer to a request nobody is waiting on any more.
 */

export interface PermissionRequestProps {
  request: PendingPermission;
  onRespond(optionId: string): void;
}

export function PermissionRequest({ request, onRespond }: PermissionRequestProps) {
  const [answered, setAnswered] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const primary = pick(request.options, "allow_once") ?? request.options[0]!;
  const rejectOnce = pick(request.options, "reject_once");
  const permanentDeny = pick(request.options, "reject_always");
  const secondary = request.options.filter(
    (option) => option !== primary && option !== rejectOnce && option !== permanentDeny,
  );

  const respond = (optionId: string): void => {
    // Once. The agent is unblocked by the first answer, and a second would be
    // about a request that no longer exists.
    if (answered) return;
    setAnswered(true);
    onRespond(optionId);
  };

  // The dialog appears in the middle of a scrolling conversation. Without moving
  // focus, someone on a keyboard has to hunt for the thing that is blocking them.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [request.requestId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        respond(primary.optionId);
        return;
      }
      // Escape denies once — never permanently. A reflex keystroke must not be
      // able to switch a tool off for the rest of the session.
      if (event.key === "Escape" && rejectOnce) {
        event.preventDefault();
        respond(rejectOnce.optionId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="perm" role="group" aria-label="pedido de permissão">
      <div className="perm__head">
        <span className="perm__glyph" aria-hidden="true">
          ⚠
        </span>
        Permissão
        <span className="spacer" />
        <span className="kbd">{answered ? "enviado" : "o turno está parado aqui"}</span>
      </div>

      <div className="perm__body">
        <div className="perm__what">
          {/* `pre-wrap` in the stylesheet: the command wraps, it never truncates. */}
          <div className="perm__cmd">{request.command ?? request.title}</div>
          <div className="perm__where">cwd {request.cwd}</div>
        </div>

        <div className="perm__opts">
          <Button
            ref={primaryRef}
            // `primary` is already the brand fill the prototype drew as
            // `btn--brand`. Adding a second name for one appearance is how two
            // appearances start.
            variant="primary"
            size="sm"
            disabled={answered}
            onClick={() => respond(primary.optionId)}
          >
            {primary.name} <span className="kbd">⏎</span>
          </Button>

          {secondary.map((option) => (
            <Button
              key={option.optionId}
              variant="ghost"
              size="sm"
              disabled={answered}
              onClick={() => respond(option.optionId)}
            >
              {option.name}
            </Button>
          ))}

          {rejectOnce && (
            <Button
              variant="ghost"
              size="sm"
              disabled={answered}
              onClick={() => respond(rejectOnce.optionId)}
            >
              {rejectOnce.name} <span className="kbd">esc</span>
            </Button>
          )}

          {permanentDeny && (
            <Button
              variant="danger"
              size="sm"
              disabled={answered}
              onClick={() => respond(permanentDeny.optionId)}
            >
              {permanentDeny.name}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The first option of a kind, or nothing. The agent decides which it offers. */
function pick(
  options: readonly AcpPermissionOption[],
  kind: AcpPermissionOption["kind"],
): AcpPermissionOption | undefined {
  return options.find((option) => option.kind === kind);
}
