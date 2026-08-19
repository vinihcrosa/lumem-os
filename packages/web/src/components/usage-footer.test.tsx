import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { UsageView } from "../lib/conversation-model.js";
import {
  UsageFooter,
  formatCost,
  formatReset,
  formatTokens,
  limitTone,
} from "./UsageFooter.js";

/**
 * The footer that replaced `/usage`.
 *
 * The meter has a test of its own width, and that is not padding: the prototype's
 * meter rendered an empty track in every state — at 4% and at 94% alike — because
 * an inline span ignores `width`. Nothing about the markup looked wrong. Only the
 * rendered pixel did.
 */

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0);

function usage(overrides: Partial<UsageView> = {}): UsageView {
  return {
    used: 39_200,
    size: 1_000_000,
    cost: { amount: 0.235433, currency: "USD" },
    rateLimit: null,
    totalCost: 0.235433,
    currency: "USD",
    ...overrides,
  };
}

const limit = (overrides: Partial<NonNullable<UsageView["rateLimit"]>> = {}) => ({
  utilization: 0.31,
  surpassedThreshold: 0.75,
  isUsingOverage: false,
  resetsAt: null,
  kind: "seven_day",
  ...overrides,
});

describe("the meter actually fills", () => {
  it("gives the fill a width proportional to what was spent", () => {
    // The regression this exists for. A meter that never fills is worse than no
    // meter: it reports "nothing spent" in every state, including the one that
    // matters.
    const { container } = render(<UsageFooter usage={usage()} now={NOW} />);
    const meter = container.querySelector(".meter");

    expect(meter).toHaveAttribute("data-fill", "3.92%");
    expect(container.querySelector(".meter__f")).toHaveStyle({ "--w": "3.92%" });
  });

  it("reports a fraction of a percent rather than rounding it to nothing", () => {
    // At a 1M window a whole percent is 10,000 tokens, and a meter that only moves
    // in whole percents looks stuck for the first ten minutes of every session.
    const { container } = render(
      <UsageFooter usage={usage({ used: 1_500, size: 1_000_000 })} now={NOW} />,
    );

    expect(container.querySelector(".meter")).toHaveAttribute("data-fill", "0.15%");
  });

  it("clamps rather than overflowing when the agent reports more than the window", () => {
    const { container } = render(
      <UsageFooter usage={usage({ used: 2_000_000, size: 1_000_000 })} now={NOW} />,
    );

    expect(container.querySelector(".meter")).toHaveAttribute("data-fill", "100.00%");
  });

  it("fills the subscription meter from its own utilization", () => {
    const { container } = render(
      <UsageFooter usage={usage({ rateLimit: limit({ utilization: 0.94 }) })} now={NOW} />,
    );
    const meters = container.querySelectorAll(".meter");

    expect(meters).toHaveLength(2);
    expect(meters[1]).toHaveAttribute("data-fill", "94.00%");
  });
});

describe("the meter starts quiet", () => {
  it("stays quiet below the threshold the agent itself reports", () => {
    // A session at 31% is not good news, it is the absence of news. Painting that
    // green teaches the eye to ignore the colour for the one moment it matters.
    const { container } = render(
      <UsageFooter usage={usage({ rateLimit: limit({ utilization: 0.31 }) })} now={NOW} />,
    );

    // Quiet has no class of its own: it is what `.usage` already is, and a
    // modifier restating the default would be a second place to change one colour.
    expect(container.querySelector(".u--warn")).toBeNull();
    expect(container.querySelector(".u--over")).toBeNull();
    expect(screen.getByText("31%", { exact: false })).toBeInTheDocument();
  });

  it("warns once the agent's own threshold is passed", () => {
    const { container } = render(
      <UsageFooter
        usage={usage({ rateLimit: limit({ utilization: 0.94, surpassedThreshold: 0.75 }) })}
        now={NOW}
      />,
    );

    expect(container.querySelector(".u--warn")).not.toBeNull();
  });

  it("stays quiet when the agent reports no threshold at all", () => {
    // The boundary is the agent's, not ours. Inventing one would disagree with its
    // own idea of trouble.
    expect(limitTone(limit({ utilization: 0.99, surpassedThreshold: null }))).toBe("quiet");
  });

  it("turns to overage the moment the agent says so, whatever the number", () => {
    expect(limitTone(limit({ utilization: 0.4, isUsingOverage: true }))).toBe("over");
  });

  it("is quiet with no limit information at all", () => {
    expect(limitTone(null)).toBe("quiet");
  });
});

describe("overage leaves the footer", () => {
  it("becomes a band, because a footer is what people learn not to read", () => {
    render(
      <UsageFooter usage={usage({ rateLimit: limit({ isUsingOverage: true }) })} now={NOW} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/overage/);
    expect(document.querySelector(".overage")).not.toBeNull();
  });

  it("shows no band while nothing is wrong", () => {
    render(<UsageFooter usage={usage({ rateLimit: limit() })} now={NOW} />);

    expect(document.querySelector(".overage")).toBeNull();
  });

  it("says it is in overage instead of when it resets", () => {
    // A reset time is an answer to "when does this get better". In overage it
    // already did not.
    render(
      <UsageFooter
        usage={usage({ rateLimit: limit({ isUsingOverage: true, resetsAt: 99_999_999_999 }) })}
        now={NOW}
      />,
    );

    // Read off the block rather than with `getByText`: the prototype's markup puts
    // the number and this label as sibling text nodes in one span, and
    // testing-library matches only a node's *direct* text children joined
    // together. Changing the markup to please the query would mean the port no
    // longer matches the design.
    expect(document.querySelector(".u--over")).toHaveTextContent("em overage");
    expect(document.querySelector(".usage")).not.toHaveTextContent(/reseta/);
  });
});

describe("cost", () => {
  it("shows what the turn cost", () => {
    render(<UsageFooter usage={usage()} now={NOW} />);

    expect(document.querySelector(".u--cost")).toHaveTextContent("US$ 0,2354");
  });

  it("shows a dash for an agent that reports no money", () => {
    // Not `US$ 0,0000`: a zero nobody measured is worse than an honest blank.
    render(<UsageFooter usage={usage({ cost: null, totalCost: 0, currency: null })} now={NOW} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(document.querySelector(".u--cost")).toBeNull();
  });

  it("adds the session total once it differs from the turn's", () => {
    render(<UsageFooter usage={usage({ totalCost: 14.26 })} now={NOW} />);

    expect(document.querySelector(".u--cost")).toHaveTextContent("US$ 14,2600");
    expect(screen.getByText("sessão")).toBeInTheDocument();
  });

  it("hides the session total on the first turn, when it is the same number", () => {
    // Two identical numbers side by side read as a rendering mistake.
    render(<UsageFooter usage={usage()} now={NOW} />);

    expect(screen.queryByText("sessão")).not.toBeInTheDocument();
  });

  it("writes a currency it does not know without pretending it is dollars", () => {
    expect(formatCost(3.5, "BRL")).toBe("BRL  3,5000");
  });
});

describe("the numbers people read", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_500, "1,5k"],
    [39_200, "39,2k"],
    [412_000, "412k"],
    [1_000_000, "1M"],
    [12_400_000, "12M"],
  ])("writes %i tokens as %s", (value, expected) => {
    expect(formatTokens(value)).toBe(expected);
  });

  it("shows a clock for a reset that is close, and a count of days when it is not", () => {
    // `reseta em 0 d` would be a worse answer than a time, and `reseta 07:00`
    // four days out is a time nobody can use.
    expect(formatReset(Math.round(NOW / 1_000) + 2 * 3_600, NOW)).toMatch(/^reseta \d\d:\d\d$/);
    expect(formatReset(Math.round(NOW / 1_000) + 10 * 3_600, NOW)).toBe("reseta em 10 h");
    expect(formatReset(Math.round(NOW / 1_000) + 4 * 86_400, NOW)).toBe("reseta em 4 d");
  });

  it("says it already reset rather than counting backwards", () => {
    expect(formatReset(Math.round(NOW / 1_000) - 60, NOW)).toBe("resetou");
  });

  it("shows no subscription block at all when the agent sent none", () => {
    // Another agent will not send it. An empty meter with no number beside it
    // would look like a limit of zero.
    const { container } = render(<UsageFooter usage={usage({ rateLimit: null })} now={NOW} />);

    expect(container.querySelectorAll(".meter")).toHaveLength(1);
    expect(screen.queryByText("assinatura")).not.toBeInTheDocument();
  });
});
