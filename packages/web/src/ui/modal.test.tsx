import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button, Input, Modal } from "./index.js";

/**
 * O invólucro que os dois diálogos da árvore herdam.
 *
 * O que vale pinar aqui é o contrato de foco e as três saídas — é o que a
 * seção 8 do protótipo escreve, e é o que ninguém repara quando quebra: um
 * `Tab` que escapa para a sidebar atrás do véu não deixa rastro na tela.
 */
describe("Modal", () => {
  function Harness({ dismissible = true }: { dismissible?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          abrir
        </button>
        <Modal
          open={open}
          title="Nova worktree"
          where="em lumem-os"
          dismissible={dismissible}
          reason="não fecha enquanto clona"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="primary">criar</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                cancelar
              </Button>
            </>
          }
        >
          <Input aria-label="Nome" />
        </Modal>
      </>
    );
  }

  it("is a labelled modal dialog, or nothing at all", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "abrir" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Named by its title: `aria-modal` without a name announces "dialog" and
    // leaves the reader to guess which one.
    expect(dialog).toHaveAccessibleName("Nova worktree");
  });

  it("puts focus in the first field and gives it back to whoever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "abrir" });
    await user.click(trigger);
    expect(screen.getByLabelText("Nome")).toHaveFocus();

    await user.keyboard("{Escape}");
    // The `+` of a tree row is the real opener, and leaving focus on a button
    // that no longer exists sends the next Tab to the top of the document.
    expect(trigger).toHaveFocus();
  });

  it("closes on Esc, on the veil and on the ✕ — the three the design promises", async () => {
    const user = userEvent.setup();

    for (const way of ["esc", "scrim", "close"] as const) {
      const { unmount, container } = render(<Harness />);
      await user.click(screen.getByRole("button", { name: "abrir" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      if (way === "esc") await user.keyboard("{Escape}");
      if (way === "scrim") await user.click(container.querySelector(".modal__scrim")!);
      if (way === "close") await user.click(screen.getByRole("button", { name: "fechar" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });

  it("keeps Tab inside, in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "abrir" }));

    const field = screen.getByLabelText("Nome");
    const close = screen.getByRole("button", { name: "fechar" });

    // O anel da seção 8 do protótipo: campo → confirmar → cancelar → ✕ → campo.
    // O `✕` é o último de propósito — ver o comentário no `Modal.tsx`.
    expect(field).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "criar" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "cancelar" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    // E ele fecha o círculo em vez de sair para a sidebar atrás do véu.
    await user.tab();
    expect(field).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("holds the door shut while it says it is holding it (Q5a)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness dismissible={false} />);
    await user.click(screen.getByRole("button", { name: "abrir" }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(container.querySelector(".modal__scrim")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Disabled and still on screen: a button that disappears is a button that
    // gets looked for.
    expect(screen.getByRole("button", { name: "fechar" })).toBeDisabled();
    // And the promise is withdrawn out loud, rather than silently broken.
    expect(screen.getByText(/não fecha enquanto clona/)).toBeInTheDocument();
  });

  it("does not call onClose when it is not dismissible", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Adicionar projeto" dismissible={false} reason="x" onClose={onClose}>
        <Input aria-label="Caminho" />
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
