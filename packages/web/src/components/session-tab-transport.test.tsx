import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionTab } from "../hooks/useWorktreeTabs.js";

/**
 * The one line that changes what the user sees.
 *
 * It is the last task of the phase for a reason: it is the only one whose
 * regression removes a screen that was working. So the assertions are about
 * exclusion as much as inclusion — a shell must never reach the conversation
 * renderer, and a PTY agent must keep exactly the terminal it had.
 *
 * `Terminal` and `Conversation` are both replaced by markers. Neither is under
 * test here; which one gets mounted is.
 */

vi.mock("./Terminal.js", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal">{sessionId}</div>
  ),
}));

vi.mock("./Conversation.js", () => ({
  Conversation: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="conversation">{sessionId}</div>
  ),
}));

const { SessionTabPanel } = await import("./SessionTab.js");

function tab(overrides: Partial<SessionTab> = {}): SessionTab {
  return {
    sessionId: "se-1",
    label: "claude",
    kind: "agent",
    state: "running",
    exitCode: null,
    command: "claude-agent-acp",
    transport: "acp",
    ...overrides,
  };
}

describe("which renderer the tab mounts", () => {
  it("mounts the conversation for an ACP session", () => {
    render(<SessionTabPanel tab={tab()} cwd="/repos/lorebase" active />);

    expect(screen.getByTestId("conversation")).toHaveTextContent("se-1");
    expect(screen.queryByTestId("terminal")).not.toBeInTheDocument();
  });

  it("mounts the terminal for a PTY agent, unchanged", () => {
    render(
      <SessionTabPanel
        tab={tab({ transport: "pty", command: "claude" })}
        cwd="/repos/lorebase"
        active
      />,
    );

    expect(screen.getByTestId("terminal")).toHaveTextContent("se-1");
    expect(screen.queryByTestId("conversation")).not.toBeInTheDocument();
  });

  it("never mounts a conversation for a shell", () => {
    // F1.2, at the last place it could still go wrong. There is no conversation
    // to have with a shell, and the column forbids it — but the column is not what
    // decides which component renders.
    render(
      <SessionTabPanel
        tab={tab({ kind: "shell", transport: "pty", label: "shell", command: "/bin/zsh" })}
        cwd="/repos/lorebase"
        active
      />,
    );

    expect(screen.queryByTestId("conversation")).not.toBeInTheDocument();
    expect(screen.getByTestId("terminal")).toBeInTheDocument();
  });
});

describe("the chrome around it", () => {
  it("gives the conversation no second header", () => {
    // It carries its own — agent, session, model, mode and the interrupt button.
    // The terminal's would say less, in more space.
    const { container } = render(<SessionTabPanel tab={tab()} cwd="/repos/lorebase" active />);

    expect(container.querySelector(".term-head")).toBeNull();
  });

  it("keeps the terminal's header for a PTY session", () => {
    const { container } = render(
      <SessionTabPanel tab={tab({ transport: "pty", command: "claude" })} cwd="/r" active />,
    );

    expect(container.querySelector(".term-head")).not.toBeNull();
    expect(screen.getByText("claude", { exact: false })).toBeInTheDocument();
  });

  it("drops the pane's padding for a conversation and keeps it for a terminal", () => {
    // The conversation is a full-bleed surface with its own head, foot and
    // composer — not a card inside a padded pane.
    const conv = render(<SessionTabPanel tab={tab()} cwd="/r" active />);
    expect(conv.container.querySelector(".pane--conv")).not.toBeNull();

    const term = render(<SessionTabPanel tab={tab({ transport: "pty" })} cwd="/r" active />);
    expect(term.container.querySelector(".pane--term")).not.toBeNull();
  });
});

describe("staying mounted", () => {
  it("hides an inactive conversation rather than unmounting it", () => {
    // The same promise the terminal already makes, for the same reason:
    // unmounting would close the socket and lose the scroll position, and the
    // switch between two tabs happens far more often than a reload.
    render(<SessionTabPanel tab={tab()} cwd="/repos/lorebase" active={false} />);

    const panel = screen.getByRole("tabpanel", { hidden: true });
    expect(panel).toHaveAttribute("hidden");
    // Still there, just not shown.
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
  });
});
