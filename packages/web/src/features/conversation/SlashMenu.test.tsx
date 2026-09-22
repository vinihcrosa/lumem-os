import type { AcpCommand } from "@lumem/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SlashMenu, filterCommands, slashQuery } from "./SlashMenu.js";

/**
 * The agent's own commands.
 *
 * Two behaviours carry the weight, and both are about not getting in the way: the
 * menu opens only where a command could actually be typed, and choosing one
 * inserts rather than sends — a command may take an argument, and firing on
 * selection would send `/compact` when the user meant `/compact até o último
 * commit`.
 */

const commands: AcpCommand[] = [
  { name: "gate", description: "roda o gate declarado pela task", takesInput: false },
  { name: "compact", description: "comprime a conversa", takesInput: true },
  { name: "context", description: "onde os 39,2k estão sendo gastos", takesInput: false },
];

describe("when the menu opens at all", () => {
  it.each([
    ["/", ""],
    ["/co", "co"],
    ["/gate", "gate"],
  ])("opens for %s", (draft, query) => {
    expect(slashQuery(draft)).toBe(query);
  });

  it.each([
    ["", "an empty draft"],
    ["arruma o frontmatter", "ordinary text"],
    ["olha em src/lore", "a path inside a sentence"],
    ["/gate e depois", "a command that already has an argument"],
    [" /gate", "a slash that is not at the start"],
  ])("stays closed for %s (%s)", (draft) => {
    expect(slashQuery(draft)).toBeNull();
  });
});

describe("filtering", () => {
  it("offers everything for a bare slash", () => {
    expect(filterCommands(commands, "")).toHaveLength(3);
  });

  it("matches by prefix, ignoring case", () => {
    expect(filterCommands(commands, "CO").map((command) => command.name)).toEqual([
      "compact",
      "context",
    ]);
  });

  it("matches nothing when nothing starts that way", () => {
    expect(filterCommands(commands, "zzz")).toEqual([]);
  });
});

describe("what it shows", () => {
  it("lists the commands with the agent's own descriptions", () => {
    // A13. The repository's own skills show up here without Lumem knowing they
    // exist, which is the whole appeal — and the reason nothing interprets them.
    render(
      <SlashMenu commands={commands} query="" onChoose={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("/gate")).toBeInTheDocument();
    expect(screen.getByText("roda o gate declarado pela task")).toBeInTheDocument();
  });

  it("shows nothing for an agent that offers no commands", () => {
    // An empty popover is a thing to dismiss, not information.
    const { container } = render(
      <SlashMenu commands={[]} query="" onChoose={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the query matches nothing", () => {
    const { container } = render(
      <SlashMenu commands={commands} query="zzz" onChoose={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("highlights the first match", () => {
    render(<SlashMenu commands={commands} query="" onChoose={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("/gate");
  });
});

describe("choosing", () => {
  it("inserts the command without sending it", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<SlashMenu commands={commands} query="" onChoose={onChoose} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole("option", { name: /gate/ }));

    expect(onChoose).toHaveBeenCalledWith("/gate");
  });

  it("leaves the caret room for an argument, when the command takes one", async () => {
    // `/compact` glued to nothing is a command the user then has to un-glue.
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <SlashMenu commands={commands} query="comp" onChoose={onChoose} onDismiss={vi.fn()} />,
    );

    await user.click(screen.getByRole("option", { name: /compact/ }));

    expect(onChoose).toHaveBeenCalledWith("/compact ");
  });

  it("chooses on mouse down rather than click", async () => {
    /*
     * The textarea loses focus on mouse *down*, which closes the menu — by the time
     * a click would land there is nothing to click. Asserting the event rather than
     * the timing because that is the fix: `pointer` here fires both, and only the
     * order proves anything.
     */
    const onChoose = vi.fn();
    render(<SlashMenu commands={commands} query="" onChoose={onChoose} onDismiss={vi.fn()} />);

    const option = screen.getByRole("option", { name: /gate/ });
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(onChoose).toHaveBeenCalledWith("/gate");
  });
});

describe("the keyboard", () => {
  it("walks down and back up, wrapping around", async () => {
    const user = userEvent.setup();
    render(<SlashMenu commands={commands} query="" onChoose={vi.fn()} onDismiss={vi.fn()} />);

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("/compact");

    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("/context");
  });

  it("takes the highlighted command on Enter", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<SlashMenu commands={commands} query="" onChoose={onChoose} onDismiss={vi.fn()} />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChoose).toHaveBeenCalledWith("/compact ");
  });

  it("dismisses on Escape without inserting anything", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SlashMenu commands={commands} query="" onChoose={onChoose} onDismiss={onDismiss} />,
    );

    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("brings the highlight back to the top when the matches change", () => {
    // Otherwise the third of four stays selected when only one is left, and Enter
    // takes something that is no longer on screen.
    const { rerender } = render(
      <SlashMenu commands={commands} query="" onChoose={vi.fn()} onDismiss={vi.fn()} />,
    );
    render(<div />);

    rerender(<SlashMenu commands={commands} query="co" onChoose={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("/compact");
  });
});
