import { useEffect, useRef } from "react";

/**
 * The gate in front of `free` (`session-mode`, Q4).
 *
 * It is the dangerous decision of the feature and the only one that needs a
 * gate: what `free` opens is writing and command execution inside a worktree,
 * with nothing asked. Three things here are deliberate, and each one is a way
 * the gate could quietly stop being a gate:
 *
 * - **the scope is a path on disk**, not "the worktree". The path is what says
 *   the size of the damage;
 * - **focus starts on `cancelar`**, and the confirming button is `btn--danger`
 *   rather than the primary one. A dangerous default is not a default;
 * - **there is no remember-me.** The day this becomes a saved preference it
 *   stops being a gate.
 *
 * The comparison with `project-scripts` matters and is written down: there the
 * gate is **per origin**, because trusting a repository is durable. Here it is
 * **per session**, because letting an agent loose is not.
 */

export interface FreeModeGateProps {
  /** The checkout the agent would be turned loose in. */
  cwd: string;
  onCancel(): void;
  onConfirm(): void;
}

export function FreeModeGate({ cwd, onCancel, onConfirm }: FreeModeGateProps) {
  const cancel = useRef<HTMLButtonElement>(null);

  // Focus lands on the way out, not on the way through.
  useEffect(() => cancel.current?.focus(), []);

  return (
    <div
      className="gate"
      role="dialog"
      aria-modal="true"
      aria-label="liberar esta sessão"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="gate__t">
        <span className="gate__g" aria-hidden="true">
          ⚠
        </span>
        Liberar esta sessão?
      </div>
      <div className="gate__b">
        O Lumem vai <b>parar de perguntar</b> e responder <b>sim</b> a tudo que este agente pedir,
        até o fim desta conversa.
      </div>
      <ul className="gate__list">
        <li>escrever e apagar arquivos</li>
        <li>rodar qualquer comando de shell</li>
        <li>
          <span>
            tudo isso dentro de <span className="gate__scope">{cwd}</span>
          </span>
        </li>
      </ul>
      <div className="gate__acts">
        <button type="button" className="btn btn--ghost btn--sm focus-ring" ref={cancel} onClick={onCancel}>
          cancelar <span className="kbd">esc</span>
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn--danger btn--sm focus-ring" onClick={onConfirm}>
          liberar esta sessão
        </button>
      </div>
      <div className="gate__note">
        Vale só para esta conversa. Uma sessão nova volta a perguntar tudo.
      </div>
    </div>
  );
}
