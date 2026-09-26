import type { AcpPlanEntry } from "@lumem/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlanCard } from "./PlanCard.js";

/**
 * The plan card.
 *
 * What is worth asserting is the three things the design decided and a component
 * can quietly get wrong: that progress is the only colour axis, that a finished
 * plan stops taking up the screen, and that a long step wraps instead of being
 * cut — a step cut in half stops being a step.
 */

const plan: AcpPlanEntry[] = [
  { content: "ler o loader e achar onde o frontmatter é lido", status: "completed" },
  { content: "extrair o parser para frontmatter.ts", status: "completed" },
  { content: "cobrir frontmatter vazio, aberto e ausente", status: "in_progress" },
  { content: "apontar o loader para o parser novo", status: "pending" },
];

describe("the steps", () => {
  it("shows every step with the tone of its own progress", () => {
    const { container } = render(<PlanCard entries={plan} />);

    expect(container.querySelectorAll(".plan__row--done")).toHaveLength(2);
    expect(container.querySelectorAll(".plan__row--active")).toHaveLength(1);
    expect(container.querySelectorAll(".plan__row--pending")).toHaveLength(1);
  });

  it("marks only the current step as where we are", () => {
    // The one step in the brand's colour. Two would make "you are here" a guess.
    render(<PlanCard entries={plan} />);

    expect(screen.getAllByText("agora")).toHaveLength(1);
  });

  it("counts what is done against what there is", () => {
    render(<PlanCard entries={plan} />);

    expect(screen.getByText("2 de 4")).toBeInTheDocument();
  });

  it("shows a step's text whole, however long it is", () => {
    // Wrapping is CSS; what a component test can assert is that nothing was
    // shortened on the way in.
    const long =
      "migrar toda configuração existente para transport: 'pty', sem tocar em sessão viva, e conferir que a reconciliação de boot continua achando as duas";
    render(<PlanCard entries={[{ content: long, status: "in_progress" }]} />);

    expect(screen.getByText(long)).toBeInTheDocument();
  });
});

describe("a plan that is finished", () => {
  const finished: AcpPlanEntry[] = plan.map((entry) => ({ ...entry, status: "completed" }));

  it("collapses to its heading", () => {
    // Four struck-out steps say nothing the count does not, and they are the
    // longest block on the screen.
    render(<PlanCard entries={finished} />);

    expect(screen.getByText("4 de 4")).toBeInTheDocument();
    expect(screen.queryByText(plan[0]!.content)).not.toBeInTheDocument();
  });

  it("opens again on request", async () => {
    const user = userEvent.setup();
    render(<PlanCard entries={finished} />);

    await user.click(screen.getByRole("button", { name: "mostrar os passos" }));

    expect(screen.getByText(plan[0]!.content)).toBeInTheDocument();
  });

  it("marks its glyph as finished too", () => {
    const { container } = render(<PlanCard entries={finished} />);

    expect(container.querySelector(".plan__glyph--done")).not.toBeNull();
  });

  it("offers no toggle while there is still work", () => {
    // Collapsing a live plan would hide the thing the card exists to show.
    render(<PlanCard entries={plan} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the edges", () => {
  it("renders a plan the agent has announced but not filled in", () => {
    // An empty plan is not the absence of one. `plan_removed` is that, and the
    // reducer keeps them apart.
    render(<PlanCard entries={[]} />);

    expect(screen.getByText("0 de 0")).toBeInTheDocument();
  });

  it("does not treat an empty plan as finished", () => {
    // `0 === 0` is true and would collapse a card that has nothing to collapse,
    // and offer a toggle for nothing.
    render(<PlanCard entries={[]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a plan where nothing has started", () => {
    const { container } = render(
      <PlanCard entries={plan.map((entry) => ({ ...entry, status: "pending" }))} />,
    );

    expect(container.querySelectorAll(".plan__row--pending")).toHaveLength(4);
    expect(screen.queryByText("agora")).not.toBeInTheDocument();
  });
});
