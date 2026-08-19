import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ToolCallView } from "../lib/conversation-model.js";
import { formatElapsed, OUTPUT_LINE_CEILING, ToolCard } from "./ToolCard.js";

/**
 * The card, at the widths and in the states it actually meets.
 *
 * The truncation case is measured rather than assumed: the prototype passed it
 * at full width and overran the status chip at 360px, which is the width of the
 * column it will live beside.
 */

function call(overrides: Partial<ToolCallView> = {}): ToolCallView {
  return {
    toolCallId: "tc-1",
    title: "Edit src/lore/loader.ts",
    name: "Edit",
    kind: "edit",
    status: "ok",
    locations: [{ path: "/repo/src/lore/loader.ts", line: 41 }],
    content: [],
    elapsedMs: null,
    added: null,
    removed: null,
    verdict: null,
    startedAt: 0,
    ...overrides,
  };
}

describe("the five states", () => {
  it.each([
    ["pending", "na fila"],
    ["running", "rodando"],
    ["ok", "ok"],
    ["failed", "falhou"],
    ["cancelled", "interrompido"],
  ] as const)("renders %s with its own class and label", (status, label) => {
    const { container } = render(<ToolCard call={call({ status })} />);

    expect(container.querySelector(`.tc--${status}`)).not.toBeNull();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says interrupted rather than failed", () => {
    // A14. Nothing broke — the user stopped. A card that reads "falhou" teaches
    // that pressing stop was a mistake.
    render(<ToolCard call={call({ status: "cancelled" })} />);

    expect(screen.queryByText("falhou")).not.toBeInTheDocument();
    expect(screen.getByText("interrompido")).toBeInTheDocument();
  });
});

describe("category and tool", () => {
  it.each([
    ["read", "▤"],
    ["search", "▤"],
    ["edit", "▣"],
    ["execute", "❯"],
    ["fetch", "↓"],
    ["other", "◈"],
  ] as const)("shows the %s category as one glyph", (kind, glyph) => {
    const { container } = render(<ToolCard call={call({ kind })} />);

    expect(container.querySelector(".tc__glyph")?.textContent).toBe(glyph);
  });

  it("names the tool in text beside the glyph", () => {
    render(<ToolCard call={call({ name: "Edit" })} />);

    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("falls back to the title's first word when the adapter sent no name", () => {
    // `name` is optional in ACP. A blank verb column would be worse than a guess
    // the title already made.
    render(<ToolCard call={call({ name: null, title: "Grep parseFrontmatter" })} />);

    expect(screen.getByText("Grep")).toBeInTheDocument();
  });
});

describe("the target", () => {
  it("splits the path so the directory is what gives way", () => {
    const { container } = render(<ToolCard call={call()} />);

    expect(container.querySelector(".tc__dir")?.textContent).toBe("/repo/src/lore/");
    expect(container.querySelector(".tc__name")?.textContent).toBe("loader.ts");
  });

  it("keeps the whole path reachable on hover", () => {
    // The visible text is allowed to lose the directory; the answer to "where
    // exactly" must not disappear with it.
    const { container } = render(<ToolCard call={call()} />);

    expect(container.querySelector(".tc__target")).toHaveAttribute(
      "title",
      "/repo/src/lore/loader.ts",
    );
  });

  it("shows the command instead, for a call with no path", () => {
    render(
      <ToolCard call={call({ name: "Bash", title: "Bash pnpm gate:quick", locations: [] })} />,
    );

    // The verb is stripped from the front rather than printed twice.
    expect(screen.getByText("pnpm gate:quick")).toBeInTheDocument();
  });

  it("keeps a title that does not start with the tool's name intact", () => {
    render(<ToolCard call={call({ name: "Bash", title: "limpando o cache", locations: [] })} />);

    expect(screen.getByText("limpando o cache")).toBeInTheDocument();
  });
});

describe("the numbers", () => {
  it("shows added and removed lines when there were any", () => {
    render(<ToolCard call={call({ added: 4, removed: 61 })} />);

    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("−61")).toBeInTheDocument();
  });

  it("shows only what happened, for a file that was only added to", () => {
    const { container } = render(<ToolCard call={call({ added: 68, removed: 0 })} />);

    expect(container.querySelector(".tc__delta")?.textContent).toBe("+68");
  });

  it("shows no delta at all for a call that changed no file", () => {
    const { container } = render(<ToolCard call={call({ kind: "read" })} />);

    expect(container.querySelector(".tc__delta")).toBeNull();
  });

  it.each([
    [420, "420 ms"],
    [1_400, "1,4 s"],
    [11_300, "11,3 s"],
    [59_940, "59,9 s"],
    [120_000, "2 min"],
    [221_400, "3 min 41 s"],
  ])("writes %i ms as %s", (ms, expected) => {
    // Comma for the decimal separator, and minutes once seconds stop being
    // readable: `221,4 s` is a number nobody converts in their head.
    expect(formatElapsed(ms)).toBe(expected);
  });

  it("shows no time for a call that has not reported one", () => {
    const { container } = render(<ToolCard call={call({ elapsedMs: null })} />);

    expect(container.querySelector(".tc__time")).toBeNull();
  });
});

describe("the body", () => {
  it("has no toggle when there is nothing to show", () => {
    render(<ToolCard call={call()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays collapsed until asked", async () => {
    const user = userEvent.setup();
    render(
      <ToolCard
        call={call({ content: [{ type: "content", text: "214 testes passaram" }] })}
      />,
    );

    expect(screen.queryByText("214 testes passaram")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("214 testes passaram")).toBeInTheDocument();
  });

  it("keeps the end of a long output, and says how much it left out", async () => {
    // The tail, not the head: the end of a test run is the part that says whether
    // it passed, and the first twelve lines are the banner.
    const user = userEvent.setup();
    const lines = Array.from({ length: 40 }, (_, index) => `linha ${index + 1}`);
    render(
      <ToolCard call={call({ content: [{ type: "content", text: lines.join("\n") }] })} />,
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("linha 40")).toBeInTheDocument();
    expect(screen.queryByText("linha 1")).not.toBeInTheDocument();
    expect(screen.getByText(`▾ mostrar as ${40 - OUTPUT_LINE_CEILING} linhas`)).toBeInTheDocument();
  });

  it("offers nothing extra when the whole output already fits", async () => {
    const user = userEvent.setup();
    render(<ToolCard call={call({ content: [{ type: "content", text: "uma\nduas" }] })} />);

    await user.click(screen.getByRole("button"));

    expect(screen.queryByText(/mostrar as/)).not.toBeInTheDocument();
  });

  it("renders a write as a diff, through the component the right panel already uses", async () => {
    // A4: no second diff renderer. The classes are the panel's, which is what
    // makes "one place decides what a removed line looks like" true.
    const user = userEvent.setup();
    const { container } = render(
      <ToolCard
        call={call({
          content: [
            {
              type: "diff",
              path: "/repo/src/lore/loader.ts",
              oldText: "const FENCE = '---';\nmantida",
              newText: "import { parseFrontmatter } from './frontmatter.js';\nmantida",
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(container.querySelector(".patch")).not.toBeNull();
    expect(container.querySelector(".dl--del")?.textContent).toContain("const FENCE");
    expect(container.querySelector(".dl--add")?.textContent).toContain("parseFrontmatter");
  });

  it("prefers the diff when the tool also printed something", async () => {
    // A write's diff is the answer; whatever it also said about it is commentary.
    const user = userEvent.setup();
    const { container } = render(
      <ToolCard
        call={call({
          content: [
            { type: "content", text: "escrevi o arquivo" },
            { type: "diff", path: "/repo/a.ts", newText: "novo" },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(container.querySelector(".patch")).not.toBeNull();
    expect(screen.queryByText("escrevi o arquivo")).not.toBeInTheDocument();
  });

  it("ignores a terminal it cannot render yet", () => {
    // Carried by the contract so the daemon can forward it; F3 renders it. Until
    // then it must not open an empty body.
    render(<ToolCard call={call({ content: [{ type: "terminal", terminalId: "t-1" }] })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the verdict", () => {
  it("shows what the user allowed", () => {
    render(
      <ToolCard
        call={call({
          verdict: { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
        })}
      />,
    );

    expect(screen.getByText(/permitir uma vez/)).toBeInTheDocument();
    expect(document.querySelector(".verdict--allowed")).not.toBeNull();
  });

  it("shows a denial as a denial", () => {
    render(
      <ToolCard
        call={call({
          status: "failed",
          verdict: { optionId: "never", name: "nunca para Bash", kind: "reject_always" },
        })}
      />,
    );

    expect(document.querySelector(".verdict--denied")).not.toBeNull();
  });

  it("shows no verdict on a call nobody was asked about", () => {
    const { container } = render(<ToolCard call={call()} />);

    expect(container.querySelector(".verdict")).toBeNull();
  });
});
