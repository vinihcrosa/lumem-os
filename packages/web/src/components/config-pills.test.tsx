import type { AcpConfigOption } from "@lumem/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfigPills } from "./ConfigPills.js";

/**
 * The selectors.
 *
 * Every one renders the same way because the protocol reports them the same way,
 * so what is worth asserting is the two exceptions the design does make: the modes
 * that change what the agent may do without asking, and the refusal while a turn is
 * running.
 */

const options: AcpConfigOption[] = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    currentValue: "auto",
    choices: [
      { value: "auto", name: "Auto", description: "Use a model classifier to approve/deny prompts" },
      { value: "default", name: "Default", description: "Standard behavior" },
      { value: "plan", name: "Plan Mode", description: "Planning mode, no actual tool execution" },
      { value: "bypassPermissions", name: "Bypass", description: "Bypass all permission checks" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    currentValue: "opus[1m]",
    choices: [
      { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
      { value: "sonnet", name: "sonnet", description: null },
    ],
  },
];

function pills(overrides: Partial<Parameters<typeof ConfigPills>[0]> = {}) {
  return (
    <ConfigPills mode="auto" options={options} onSwitch={vi.fn()} {...overrides} />
  );
}

describe("what the pills say", () => {
  it("shows one pill per selector the agent offers", () => {
    render(pills());

    expect(screen.getByRole("button", { name: "Mode: Auto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model: opus[1m]" })).toBeInTheDocument();
  });

  it("names each pill by what it switches", () => {
    // "Auto" on its own tells a screen reader nothing about which selector it
    // belongs to.
    render(pills());

    expect(screen.getByRole("button", { name: /^Mode:/ })).toBeInTheDocument();
  });

  it("takes the mode from the daemon's own field, not from the option's value", () => {
    // The daemon keeps `modes.currentModeId` as the authority; the option's
    // `currentValue` can lag it.
    render(pills({ mode: "plan" }));

    expect(screen.getByRole("button", { name: "Mode: Plan Mode" })).toBeInTheDocument();
  });

  it("renders nothing at all for an agent with no selectors", () => {
    const { container } = render(pills({ options: [] }));

    expect(container.querySelectorAll(".pill")).toHaveLength(0);
  });

  it("falls back to the raw value for a choice the agent did not describe", () => {
    render(
      pills({
        mode: "algo-novo",
        options: [{ id: "mode", name: "Mode", currentValue: "algo-novo", choices: [] }],
      }),
    );

    expect(screen.getByRole("button", { name: "Mode: algo-novo" })).toBeInTheDocument();
  });
});

describe("the two modes that change what the agent may do", () => {
  it.each([
    ["auto", "pill--auto"],
    ["plan", "pill--plan"],
    ["bypassPermissions", "pill--bypass"],
  ])("gives %s its own tone", (mode, className) => {
    const { container } = render(pills({ mode }));

    expect(container.querySelector(`.${className}`)).not.toBeNull();
  });

  it("leaves an ordinary mode neutral", () => {
    const { container } = render(pills({ mode: "default" }));

    expect(container.querySelector(".pill--auto")).toBeNull();
    expect(container.querySelector(".pill--plan")).toBeNull();
    expect(container.querySelector(".pill--bypass")).toBeNull();
  });

  it("marks bypass in the list too, not only on the pill", async () => {
    // Not asking anything is the most dangerous option in the menu; in a flat list
    // it would look identical to the other three.
    const user = userEvent.setup();
    render(pills());

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));

    expect(document.querySelector(".slash__row--danger")).toHaveTextContent("bypassPermissions");
  });

  it("puts the model in mono, because a model id is read character by character", () => {
    const { container } = render(pills());

    expect(container.querySelector(".pill--model")).not.toBeNull();
  });
});

describe("switching", () => {
  it("opens the menu and reports the choice", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(pills({ onSwitch }));

    await user.click(screen.getByRole("button", { name: /^Model:/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /sonnet/ }));

    expect(onSwitch).toHaveBeenCalledWith("model", "sonnet");
  });

  it("marks which choice is current", async () => {
    const user = userEvent.setup();
    render(pills());

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));

    expect(screen.getByRole("menuitemradio", { name: /^auto/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /^plan/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("reports a re-selection of the value already in effect", async () => {
    // The agent may answer with something else. Doing nothing would make a
    // deliberate re-selection look broken.
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(pills({ onSwitch }));

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /^auto/ }));

    expect(onSwitch).toHaveBeenCalledWith("mode", "auto");
  });

  it("closes the menu after choosing", async () => {
    const user = userEvent.setup();
    render(pills());

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /^plan/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens one menu at a time", async () => {
    const user = userEvent.setup();
    render(pills());

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));
    await user.click(screen.getByRole("button", { name: /^Model:/ }));

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Model" })).toBeInTheDocument();
  });

  it("shows the agent's own description, verbatim", async () => {
    // A13. Our paraphrase disagreeing with what the option actually does is worse
    // than English.
    const user = userEvent.setup();
    render(pills());

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));

    expect(
      screen.getByText("Use a model classifier to approve/deny prompts"),
    ).toBeInTheDocument();
  });
});

describe("during a turn", () => {
  it("is disabled, and says why", () => {
    // The daemon refuses it (A15), so offering it would be a button that reports an
    // error the user did nothing to cause.
    render(pills({ disabled: true }));

    const pill = screen.getByRole("button", { name: /^Mode:/ });
    expect(pill).toBeDisabled();
    expect(pill).toHaveAttribute("title", "não dá para trocar no meio de um turno");
  });

  it("cannot be opened", async () => {
    const user = userEvent.setup();
    render(pills({ disabled: true }));

    await user.click(screen.getByRole("button", { name: /^Mode:/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
