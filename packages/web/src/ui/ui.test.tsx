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
