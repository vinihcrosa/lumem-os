import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import {
  AwaitingPermissionProvider,
  useAwaitingPermission,
} from "./useAwaitingPermission.js";
import { Row, Tab } from "../ui/index.js";

/**
 * The signal that leaves the tab it happened in.
 *
 * F2.4 and A10. With `auto` as the default the ask is rare, so a conversation
 * quietly stuck behind a dialog nobody can see is the failure mode — and the tab
 * strip and the sidebar are not ancestors of each other, which is why the fact
 * lives above both instead of in either.
 */

/** Stands in for a conversation reporting its own state. */
function Reporter({ sessionId, waiting }: { sessionId: string; waiting: boolean }) {
  const awaiting = useAwaitingPermission();
  useEffect(() => {
    awaiting.setWaiting(sessionId, waiting);
  }, [sessionId, waiting, awaiting]);
  return null;
}

/** Stands in for the tab strip and the sidebar reading it. */
function Watcher({ sessionIds }: { sessionIds: string[] }) {
  const awaiting = useAwaitingPermission();
  return (
    <>
      <span data-testid="count">{awaiting.countIn(sessionIds)}</span>
      {sessionIds.map((id) => (
        <span key={id} data-testid={`waiting-${id}`}>
          {String(awaiting.isWaiting(id))}
        </span>
      ))}
    </>
  );
}

describe("the shared set", () => {
  it("reports a session that is waiting", () => {
    render(
      <AwaitingPermissionProvider>
        <Reporter sessionId="s-1" waiting />
        <Watcher sessionIds={["s-1", "s-2"]} />
      </AwaitingPermissionProvider>,
    );

    expect(screen.getByTestId("waiting-s-1")).toHaveTextContent("true");
    expect(screen.getByTestId("waiting-s-2")).toHaveTextContent("false");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("counts only the sessions it was asked about", () => {
    // The sidebar asks per worktree. A blocked session in another worktree must
    // not light this one up.
    render(
      <AwaitingPermissionProvider>
        <Reporter sessionId="outra" waiting />
        <Watcher sessionIds={["s-1"]} />
      </AwaitingPermissionProvider>,
    );

    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("clears when the conversation says it is no longer waiting", () => {
    const { rerender } = render(
      <AwaitingPermissionProvider>
        <Reporter sessionId="s-1" waiting />
        <Watcher sessionIds={["s-1"]} />
      </AwaitingPermissionProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    rerender(
      <AwaitingPermissionProvider>
        <Reporter sessionId="s-1" waiting={false} />
        <Watcher sessionIds={["s-1"]} />
      </AwaitingPermissionProvider>,
    );

    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("does nothing outside a provider, rather than throwing", () => {
    // A screen with no conversations has nothing to report. Making every one of
    // them wrap itself in a provider to say so would be ceremony.
    expect(() =>
      render(
        <>
          <Reporter sessionId="s-1" waiting />
          <Watcher sessionIds={["s-1"]} />
        </>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});

describe("what it looks like", () => {
  it("replaces the tab's running dot rather than adding a second one", () => {
    const { container } = render(
      <Tab label="claude" onSelect={() => {}} state="asking" />,
    );

    expect(container.querySelectorAll(".tab-item__dot")).toHaveLength(1);
    expect(container.querySelector(".tab-item__dot--asking")).not.toBeNull();
    expect(container.querySelector(".tab-item__dot--running")).toBeNull();
  });

  it("changes the sidebar count's tone, and what it says out loud", () => {
    // The number alone would read as "two sessions running" to anyone who cannot
    // see the colour.
    render(
      <Row depth={1} label="frontmatter-vazio" onSelect={() => {}} count={1} countTone="asking" />,
    );

    expect(screen.getByText("sessão esperando permissão", { exact: false })).toBeInTheDocument();
    expect(document.querySelector(".row__count--asking")).not.toBeNull();
  });

  it("still says running when nothing is waiting", () => {
    render(<Row depth={1} label="teste" onSelect={() => {}} count={2} />);

    expect(screen.getByText("sessões rodando", { exact: false })).toBeInTheDocument();
    expect(document.querySelector(".row__count--running")).not.toBeNull();
  });

  it("does not answer the request by being looked at", async () => {
    // Opening the tab must not count as an answer. Only the dialog answers.
    const user = userEvent.setup();
    let selected = 0;
    render(
      <AwaitingPermissionProvider>
        <Reporter sessionId="s-1" waiting />
        <Tab label="claude" state="asking" onSelect={() => (selected += 1)} />
        <Watcher sessionIds={["s-1"]} />
      </AwaitingPermissionProvider>,
    );

    await user.click(screen.getByRole("tab"));

    expect(selected).toBe(1);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
