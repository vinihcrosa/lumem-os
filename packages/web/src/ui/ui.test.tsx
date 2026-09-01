import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Banner,
  Button,
  Card,
  CheckList,
  CheckRow,
  Chip,
  Choice,
  ChoiceGroup,
  Coach,
  CopyCommand,
  EmptyState,
  Field,
  Glyph,
  Input,
  Item,
  Menu,
  MenuItem,
  MetaGrid,
  Modal,
  RawOutput,
  Row,
  SectionHead,
  Skeleton,
  Steps,
  Tab,
  TabStrip,
  WizardCard,
} from "./index.js";

/**
 * These assert behaviour and semantics, not appearance.
 *
 * What a primitive looks like is checked by rendering `/styleguide` and looking
 * at it; a test that asserted class names would fail on every restyle without
 * ever catching a real defect. What is worth pinning down is the part a
 * screenshot cannot show: that the disabled item refuses the click, that the
 * twist and the label are two separate targets, that the error is announced.
 */

describe("Glyph", () => {
  it("is hidden from assistive tech, because the meaning is spelled out beside it", () => {
    const { container } = render(<Glyph tone="agent">◆</Glyph>);
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("◆");
  });
});

describe("Button", () => {
  it("defaults to type=button so it cannot submit a form it happens to sit in", () => {
    render(<Button>Cancelar</Button>);
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveAttribute("type", "button");
  });

  it("submits when told to", () => {
    render(<Button type="submit">Criar</Button>);
    expect(screen.getByRole("button", { name: "Criar" })).toHaveAttribute("type", "submit");
  });

  it("does not fire while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Remover
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("shows its text without announcing the decorative dot", () => {
    render(
      <Chip tone="dirty" dot>
        suja · 3 arquivos
      </Chip>,
    );
    expect(screen.getByText("suja · 3 arquivos")).toBeInTheDocument();
  });
});

describe("Row", () => {
  it("separates expanding from selecting", async () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <Row depth={1} label="teste-prd" expanded onToggle={onToggle} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "recolher teste-prd" }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^teste-prd/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("says whether it is open, so the tree is navigable without seeing it", () => {
    const { rerender } = render(
      <Row depth={0} label="lorebase" expanded={false} onToggle={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "expandir lorebase" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    rerender(<Row depth={0} label="lorebase" expanded onToggle={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "recolher lorebase" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("offers no twist when there is nothing to reveal", () => {
    render(<Row depth={2} label="shell" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("keeps the action out of the row's own button, so clicking it is not navigating", async () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onClick = vi.fn();
    render(
      <Row
        depth={0}
        label="lumem-os"
        expanded={false}
        onToggle={onToggle}
        onSelect={onSelect}
        action={{ label: "nova worktree em lumem-os", glyph: "＋", onClick }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "nova worktree em lumem-os" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("reserves the slot with no action in it, so the row does not shift under the pointer", () => {
    const { container, rerender } = render(
      <Row depth={0} label="graphify-out" muted action={null} onSelect={vi.fn()} />,
    );
    expect(container.querySelector(".row__slot")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1); // só a linha

    // Sem `action` nenhuma — a worktree, que não acrescenta nada abaixo de si.
    rerender(<Row depth={1} label="pr-bar" onSelect={vi.fn()} />);
    expect(container.querySelector(".row__slot")).not.toBeInTheDocument();
    expect(container.querySelector(".row__act")).not.toBeInTheDocument();
  });

  it("keeps the action reachable by keyboard, because hover is not a way in", () => {
    render(
      <Row
        depth={0}
        label="lumem-os"
        count={2}
        onSelect={vi.fn()}
        action={{ label: "nova worktree em lumem-os", glyph: "＋", onClick: vi.fn() }}
      />,
    );

    // No DOM mesmo em repouso: é `opacity` que a esconde, e não `display`, que a
    // tiraria da ordem de `Tab`. E o contador continua lá, ao lado dela.
    expect(screen.getByRole("button", { name: "nova worktree em lumem-os" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("carries the depth as a custom property rather than hard-coded padding", () => {
    const { container } = render(<Row depth={3} label="shell" onSelect={vi.fn()} />);
    expect(container.querySelector(".row")).toHaveAttribute("style", expect.stringContaining("--depth: 3"));
  });

  it("says how many sessions are running, not merely that some are", () => {
    // With the sessions out of the tree, the row is the only place left that
    // can answer "how much is happening in there".
    render(<Row depth={1} label="teste-prd" count={3} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "teste-prd 3 sessões rodando" })).toBeInTheDocument();
  });

  it("says nothing when nothing is running", () => {
    render(<Row depth={1} label="teste-prd" count={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "teste-prd" })).toBeInTheDocument();
  });

  it("keeps the twist out of the row's own name, so the two are tellable apart", () => {
    render(<Row depth={0} label="lorebase" expanded onToggle={vi.fn()} onSelect={vi.fn()} />);

    // `/^lorebase/` has to reach the row and not the twist; the twist reads
    // "recolher lorebase" and every test in the suite relies on that.
    expect(screen.getByRole("button", { name: /^lorebase/ })).toBeInTheDocument();
  });
});

describe("Item", () => {
  it("keeps the action outside the row's own button, which cannot nest", () => {
    render(
      <Item
        name="claude-code"
        state={{ label: "running", tone: "running" }}
        action={<Button size="sm">Encerrar</Button>}
        onSelect={vi.fn()}
      />,
    );

    const encerrar = screen.getByRole("button", { name: "Encerrar" });
    const linha = screen.getByRole("button", { name: /claude-code/ });
    expect(linha).not.toContainElement(encerrar);
  });

  it("keeps the full detail reachable when the visible one is truncated", () => {
    const path = "~/.lumem/worktrees/lorebase/feat/reconciliacao-de-boot-com-nome-comprido";
    render(<Item name="worktree" detail={path} />);
    expect(screen.getByText(path)).toHaveAttribute("title", path);
  });

  it("renders without a button when there is nowhere to go", () => {
    render(<Item name="shell" detail="/bin/zsh -l" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("MetaGrid", () => {
  it("pairs each label with its value", () => {
    render(
      <MetaGrid
        entries={[
          { label: "caminho", value: "~/.lumem/worktrees/lorebase/teste-prd" },
          { label: "branch", value: "teste-prd" },
        ]}
      />,
    );

    expect(screen.getByText("caminho")).toBeInTheDocument();
    expect(screen.getByText("~/.lumem/worktrees/lorebase/teste-prd")).toBeInTheDocument();
  });
});

describe("SectionHead", () => {
  it("shows the title, the count and the aside", () => {
    render(<SectionHead title="Sessões" count="2 · 1 rodando" aside={<Button>Nova</Button>} />);

    expect(screen.getByText("Sessões")).toBeInTheDocument();
    expect(screen.getByText("2 · 1 rodando")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova" })).toBeInTheDocument();
  });
});

describe("Banner", () => {
  it("announces a refusal, because it arrives in answer to a click", () => {
    render(<Banner tone="danger">Daemon inacessível.</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Daemon inacessível.");
  });

  it("stays ambient when it is not a refusal", () => {
    render(<Banner tone="info">O buffer continua legível.</Banner>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("O buffer continua legível.");
  });
});

describe("RawOutput", () => {
  it("prints each line as the command wrote it", () => {
    render(<RawOutput label="saída do git" lines={["fatal: a branch 'teste-prd' já existe", "exit 128"]} />);

    const bloco = screen.getByLabelText("saída do git");
    expect(within(bloco).getByText("fatal: a branch 'teste-prd' já existe")).toBeInTheDocument();
    expect(within(bloco).getByText("exit 128")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("carries the one thing to do from here", () => {
    render(
      <EmptyState title="Nenhum projeto" action={<Button>Adicionar projeto</Button>}>
        O Lumem não clona nada.
      </EmptyState>,
    );

    expect(screen.getByText("Nenhum projeto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar projeto" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("says it is loading instead of being a silent grey box", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status", { name: "carregando" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("shows its title and lede", () => {
    render(
      <Card title="Nenhum workspace ainda" lede="Um workspace agrupa seus projetos.">
        <p>corpo</p>
      </Card>,
    );

    expect(screen.getByRole("heading", { name: "Nenhum workspace ainda" })).toBeInTheDocument();
    expect(screen.getByText("Um workspace agrupa seus projetos.")).toBeInTheDocument();
  });
});

describe("Field e Input", () => {
  it("labels the control", () => {
    render(
      <Field id="ws" label="Nome">
        <Input id="ws" defaultValue="pessoal" />
      </Field>,
    );

    expect(screen.getByLabelText("Nome")).toHaveValue("pessoal");
  });

  it("announces the error and points the control at it", () => {
    render(
      <Field id="path" label="Caminho" error="Não é a raiz de um repositório git.">
        <Input id="path" invalid defaultValue="/tmp" />
      </Field>,
    );

    const campo = screen.getByLabelText("Caminho");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAccessibleDescription("Não é a raiz de um repositório git.");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("carries no error wiring when there is no error", () => {
    render(
      <Field id="ws" label="Nome">
        <Input id="ws" />
      </Field>,
    );

    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Menu", () => {
  it("shows an unavailable choice instead of hiding it — F6.5", async () => {
    const onSelect = vi.fn();
    render(
      <Menu label="nova sessão">
        <MenuItem hint="claude">claude-code</MenuItem>
        <MenuItem hint="fora do PATH" disabled onSelect={onSelect}>
          codex
        </MenuItem>
      </Menu>,
    );

    const codex = screen.getByRole("menuitem", { name: /codex/ });
    expect(codex).toBeVisible();
    expect(codex).toBeDisabled();

    await userEvent.click(codex);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("exposes its choices as a menu", () => {
    render(
      <Menu label="nova sessão">
        <MenuItem>claude-code</MenuItem>
        <MenuItem>shell de login</MenuItem>
      </Menu>,
    );

    expect(within(screen.getByRole("menu", { name: "nova sessão" })).getAllByRole("menuitem")).toHaveLength(2);
  });
});

describe("Tab", () => {
  it("keeps closing separate from selecting", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Tab label="claude-code" state="running" onSelect={onSelect} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "fechar claude-code" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: /claude-code/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says which tab is the open one", () => {
    render(
      <>
        <Tab label="contexto" active onSelect={vi.fn()} />
        <Tab label="shell" onSelect={vi.fn()} />
      </>,
    );

    expect(screen.getByRole("tab", { name: "contexto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "shell" })).toHaveAttribute("aria-selected", "false");
  });

  it("offers no close on a tab that cannot be dismissed", () => {
    render(<Tab label="contexto" onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /fechar/ })).not.toBeInTheDocument();
  });

  it("tells homonyms apart with an ordinal", () => {
    // A session has no name of its own, so without this three agents from one
    // configuration are three identical tabs.
    render(
      <>
        <Tab label="claude-code" onSelect={vi.fn()} />
        <Tab label="claude-code" ordinal={2} onSelect={vi.fn()} />
      </>,
    );

    expect(screen.getByRole("tab", { name: "claude-code 2" })).toBeInTheDocument();
  });

  it("says when a tab is a record rather than live work", () => {
    // The state dot answers "how did it end". The note answers "what is this",
    // which is what issue #14 found nothing on the tab was saying.
    render(
      <>
        <Tab label="shell" state="running" onSelect={vi.fn()} />
        <Tab label="shell" state="failed" note="registro" onSelect={vi.fn()} />
      </>,
    );

    const [live, record] = screen.getAllByRole("tab");
    expect(live).toHaveAccessibleName("shell");
    expect(record).toHaveAccessibleName("shell registro");
  });
});

describe("TabStrip", () => {
  it("keeps the lead and the action out of the part that scrolls", () => {
    // Both are pinned on purpose: a menu anchored to the action would be
    // clipped by the scroller, and neither may slide off screen.
    const { container } = render(
      <TabStrip
        label="sessões"
        lead={<Tab label="contexto" active onSelect={vi.fn()} />}
        action={<button type="button">nova sessão</button>}
      >
        <Tab label="shell" onSelect={vi.fn()} />
      </TabStrip>,
    );

    const scroller = container.querySelector(".tabs-bar__scroll");
    expect(scroller).not.toContainElement(screen.getByRole("tab", { name: "contexto" }));
    expect(scroller).not.toContainElement(screen.getByRole("button", { name: "nova sessão" }));
    expect(scroller).toContainElement(screen.getByRole("tab", { name: "shell" }));
  });

  it("exposes its tabs as a tab list", () => {
    render(
      <TabStrip label="sessões de teste-prd">
        <Tab label="shell" onSelect={vi.fn()} />
        <Tab label="claude-code" onSelect={vi.fn()} />
      </TabStrip>,
    );

    expect(within(screen.getByRole("tablist", { name: "sessões de teste-prd" })).getAllByRole("tab")).toHaveLength(2);
  });
});

describe("Modal", () => {
  function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
    return (
      <>
        <button type="button">o + que abriu</button>
        <Modal open onClose={onClose} title="Nova worktree" where="em lumem-os">
          <div className="modal__body">
            <input aria-label="Nome da worktree" />
          </div>
          <div className="modal__foot">
            <Button type="submit">criar</Button>
            <Button variant="ghost">cancelar</Button>
          </div>
        </Modal>
      </>
    );
  }

  it("renders nothing at all when closed — not a hidden card", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Nova worktree">
        <p>corpo</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("corpo")).not.toBeInTheDocument();
  });

  it("names itself by its title, so a screen reader says what opened", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Nova worktree" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("puts the focus in the first field, and not on the close button that precedes it", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Nome da worktree")).toHaveFocus();
  });

  it("gives the focus back to whoever opened it", async () => {
    const opener = document.createElement("button");
    opener.textContent = "＋";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Nova worktree">
        <input aria-label="Nome da worktree" />
      </Modal>,
    );
    expect(screen.getByLabelText("Nome da worktree")).toHaveFocus();

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Nova worktree">
        <input aria-label="Nome da worktree" />
      </Modal>,
    );
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("closes on Esc, on the veil and on the ✕ — the same way out three times", async () => {
    const onClose = vi.fn();
    const { container } = render(<Harness onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "fechar" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    const scrim = document.querySelector(".modal__scrim");
    await userEvent.click(scrim as Element);
    expect(onClose).toHaveBeenCalledTimes(3);

    // Um clique dentro do cartão não fecha o formulário que está sendo preenchido.
    await userEvent.click(screen.getByLabelText("Nome da worktree"));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(container).toBeTruthy();
  });

  it("keeps Tab inside: the last focusable wraps to the first", async () => {
    render(<Harness />);
    const field = screen.getByLabelText("Nome da worktree");
    const cancel = screen.getByRole("button", { name: "cancelar" });
    const close = screen.getByRole("button", { name: "fechar" });

    cancel.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();

    // E de volta, na direção contrária — o `+` que abriu fica fora do alcance.
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
    expect(field).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "o + que abriu" })).not.toHaveFocus();
  });
});
