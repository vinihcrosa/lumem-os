import { useEffect, useState } from "react";

import type { AcpCommand } from "@lumem/shared";

/**
 * The agent's own commands (F2.8).
 *
 * The list is the agent's, with its descriptions verbatim (A13) — which means the
 * repository's own skills show up in it without Lumem knowing they exist. That is
 * the whole appeal, and it is also why nothing here tries to interpret a command.
 *
 * Choosing one **inserts** it and does not send. A command may take an argument,
 * and firing on selection would send `/compact` when the user meant
 * `/compact até o último commit`. The caret is left where the argument goes.
 */

/** What the draft has to look like for the menu to be open. */
export function slashQuery(draft: string): string | null {
  // Only at the very start, and only while it is still one word: `/` inside a
  // sentence is a path, and offering a command menu over `src/lore` would be the
  // interface arguing with what is being typed.
  const match = /^\/([^\s]*)$/.exec(draft);
  return match ? match[1]! : null;
}

/** The commands that match what has been typed so far. */
export function filterCommands(
  commands: readonly AcpCommand[],
  query: string,
): readonly AcpCommand[] {
  if (query === "") return commands;
  const needle = query.toLowerCase();
  return commands.filter((command) => command.name.toLowerCase().startsWith(needle));
}

export interface SlashMenuProps {
  commands: readonly AcpCommand[];
  /** What comes after the `/`. Empty means the whole list. */
  query: string;
  /** Called with the text the composer should now hold. */
  onChoose(draft: string): void;
  onDismiss(): void;
}

export function SlashMenu({ commands, query, onChoose, onDismiss }: SlashMenuProps) {
  const matches = filterCommands(commands, query);
  const [active, setActive] = useState(0);

  // Typing changes what matches, so the highlight has to come back to the top —
  // otherwise the third of four stays selected when only one is left.
  useEffect(() => setActive(0), [query, commands]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (matches.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => (current + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (current - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        /*
         * Plain Enter chooses; ⌘⏎ still sends.
         *
         * Two distinct gestures, and the guard is not cosmetic: after inserting a
         * command that takes no argument the draft is `/gate`, which still matches
         * the menu's own open condition — so without the modifier check this
         * handler swallowed the send and the composer looked broken.
         */
        event.preventDefault();
        event.stopPropagation();
        choose(matches[active]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };

    // Capture, so this runs before the textarea's own handler sees the key.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  function choose(command: AcpCommand): void {
    // A trailing space when it takes an argument: the caret ends up where the
    // argument goes, instead of glued to the command.
    onChoose(`/${command.name}${command.takesInput ? " " : ""}`);
  }

  // An agent that offers nothing, or a query that matches nothing, shows nothing —
  // an empty popover is a thing to dismiss rather than information.
  if (matches.length === 0) return null;

  return (
    <div className="slash" role="listbox" aria-label="comandos do agente">
      {matches.map((command, index) => (
        <button
          type="button"
          role="option"
          aria-selected={index === active}
          className={`slash__row focus-ring${index === active ? " slash__row--on" : ""}`}
          key={command.name}
          // `mouseDown`, not `click`: the textarea loses focus on mouse down, and by
          // the time a click lands the composer has already closed the menu.
          onMouseDown={(event) => {
            event.preventDefault();
            choose(command);
          }}
        >
          <span className="slash__cmd">/{command.name}</span>
          <span className="slash__desc">{command.description}</span>
        </button>
      ))}
    </div>
  );
}
