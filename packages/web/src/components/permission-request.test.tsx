import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PendingPermission } from "../lib/conversation-model.js";
import { PermissionRequest } from "./PermissionRequest.js";

/**
 * Its own file, on purpose (F2.4).
 *
 * With `auto` as the default mode (A9) this dialog is reached rarely, and a path
 * reached rarely is a path that breaks without anyone noticing. Meanwhile it is
 * the only thing standing between the agent and waiting forever. That asymmetry
 * — low traffic, total consequence — is what buys it a test file of its own.
 */

function request(overrides: Partial<PendingPermission> = {}): PendingPermission {
  return {
    requestId: "rq-1",
    toolCallId: "tc-1",
    title: "Bash rm -rf node_modules/.vite",
    command: "rm -rf node_modules/.vite packages/web/node_modules/.vite",
    cwd: "/repos/lorebase/frontmatter-vazio",
    policyReason: null,
    options: [
      { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
      { optionId: "always", name: "sempre para Bash", kind: "allow_always" },
      { optionId: "no", name: "não", kind: "reject_once" },
      { optionId: "never", name: "nunca para Bash", kind: "reject_always" },
    ],
    ...overrides,
  };
}

describe("what it shows", () => {
  it("shows the command whole", () => {
    // Not truncated, at any width. A truncated `rm -rf` is an `rm -rf` approved
    // in the dark.
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(
      screen.getByText("rm -rf node_modules/.vite packages/web/node_modules/.vite"),
    ).toBeInTheDocument();
  });

  it("shows where it would run", () => {
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(screen.getByText(/cwd \/repos\/lorebase\/frontmatter-vazio/)).toBeInTheDocument();
  });

  it("falls back to the title when the call named no command", () => {
    // Not every tool call is a command. Showing an empty box would look broken.
    render(
      <PermissionRequest
        request={request({ command: null, title: "Write settings.json" })}
        onRespond={vi.fn()}
      />,
    );

    expect(screen.getByText("Write settings.json")).toBeInTheDocument();
  });

  it("says the turn is stopped here", () => {
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(screen.getByText("o turno está parado aqui")).toBeInTheDocument();
  });

  it("labels every option with the agent's own words", () => {
    // A13, and it matters most here: our paraphrase of what an option does,
    // disagreeing with what it actually does, is worse than English.
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    for (const label of ["permitir uma vez", "sempre para Bash", "não", "nunca para Bash"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("gives the fill to the safe option and danger only to the permanent denial", () => {
    // One primary. Four buttons in four colours is four things shouting, and the
    // one you press by reflex is the one that should look pressable.
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(screen.getByRole("button", { name: /permitir uma vez/ })).toHaveClass("btn--primary");
    expect(screen.getByRole("button", { name: /nunca para Bash/ })).toHaveClass("btn--danger");
    expect(screen.getByRole("button", { name: /sempre para Bash/ })).toHaveClass("btn--ghost");
  });
});

describe("answering", () => {
  it("reports the option that was clicked", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<PermissionRequest request={request()} onRespond={onRespond} />);

    await user.click(screen.getByRole("button", { name: /sempre para Bash/ }));

    expect(onRespond).toHaveBeenCalledWith("always");
  });

  it("answers once, however many times it is clicked", async () => {
    // The agent is unblocked by the first answer. A second is about a request
    // that no longer exists, and the daemon would refuse it as an error the user
    // did nothing to cause.
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<PermissionRequest request={request()} onRespond={onRespond} />);

    const allow = screen.getByRole("button", { name: /permitir uma vez/ });
    await user.click(allow);
    await user.click(allow);
    await user.click(screen.getByRole("button", { name: /nunca para Bash/ }));

    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it("disables every option once one is taken", async () => {
    const user = userEvent.setup();
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /permitir uma vez/ }));

    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByText("enviado")).toBeInTheDocument();
  });
});

describe("the keyboard", () => {
  it("takes the primary option on Enter", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<PermissionRequest request={request()} onRespond={onRespond} />);

    await user.keyboard("{Enter}");

    expect(onRespond).toHaveBeenCalledWith("allow");
  });

  it("denies once on Escape, and never permanently", async () => {
    // A reflex keystroke must not be able to switch a tool off for the rest of
    // the session.
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<PermissionRequest request={request()} onRespond={onRespond} />);

    await user.keyboard("{Escape}");

    expect(onRespond).toHaveBeenCalledWith("no");
  });

  it("does nothing on Escape when the agent offered no way to deny once", async () => {
    // Guessing the permanent denial would be the worst possible substitution.
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(
      <PermissionRequest
        request={request({
          options: [
            { optionId: "allow", name: "permitir", kind: "allow_once" },
            { optionId: "never", name: "nunca", kind: "reject_always" },
          ],
        })}
        onRespond={onRespond}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onRespond).not.toHaveBeenCalled();
  });

  it("puts focus on the dialog when it appears", () => {
    // It shows up in the middle of a scrolling conversation. Without this,
    // someone on a keyboard has to hunt for the thing that is blocking them.
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(screen.getByRole("button", { name: /permitir uma vez/ })).toHaveFocus();
  });

  it("stops listening to the keyboard once answered", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<PermissionRequest request={request()} onRespond={onRespond} />);

    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");

    expect(onRespond).toHaveBeenCalledTimes(1);
  });
});

describe("options the agent chose not to offer", () => {
  it("works with only one option", () => {
    // The protocol requires at least one and promises nothing more.
    render(
      <PermissionRequest
        request={request({ options: [{ optionId: "ok", name: "ok", kind: "allow_once" }] })}
        onRespond={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("makes the first option primary when none of them is allow_once", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(
      <PermissionRequest
        request={request({
          options: [
            { optionId: "always", name: "sempre", kind: "allow_always" },
            { optionId: "never", name: "nunca", kind: "reject_always" },
          ],
        })}
        onRespond={onRespond}
      />,
    );

    await user.keyboard("{Enter}");

    expect(onRespond).toHaveBeenCalledWith("always");
  });

  it("names itself for a screen reader", () => {
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(screen.getByRole("group", { name: "pedido de permissão" })).toBeInTheDocument();
  });
});

/**
 * Por que a política não respondeu esta (`session-mode`, T7).
 *
 * O caso que esta linha resolve: alguém está em `automático`, o pedido para, e a
 * tela não diz nada. O modo passa a parecer quebrado exatamente quando está
 * funcionando como prometido.
 */
describe("o motivo da política", () => {
  it("diz por que o modo automático não cobriu a chamada", () => {
    render(
      <PermissionRequest
        request={request({
          policyReason: "O modo Automático do Lumem aprova sozinho só leitura de arquivo.",
        })}
        onRespond={vi.fn()}
      />,
    );

    expect(screen.getByText(/só leitura de arquivo/)).toBeInTheDocument();
  });

  it("não escreve nada quando perguntar é a própria regra", () => {
    // Sob `perguntar tudo` não há nada a explicar, e uma justificativa em todo
    // cartão treinaria a pessoa a não ler nenhuma.
    render(<PermissionRequest request={request()} onRespond={vi.fn()} />);

    expect(document.querySelector(".perm__why")).toBeNull();
  });
});
