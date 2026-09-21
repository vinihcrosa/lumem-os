import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Message, Thought, TurnFrame } from "./Message.js";

/**
 * The two text blocks of the conversation.
 *
 * The assertions are about the three decisions the design made and a component
 * can get wrong: who the gutter says is speaking, whether the caret says the
 * turn is still open, and that reasoning starts closed.
 */

describe("TurnFrame", () => {
  it("marks whose turn it is", () => {
    const { container } = render(
      <TurnFrame role="user">
        <Message text="arruma o frontmatter" />
      </TurnFrame>,
    );

    expect(container.querySelector(".turn--user")).not.toBeNull();
    expect(screen.getByText("arruma o frontmatter")).toBeInTheDocument();
  });

  it("uses the agent's own glyph and tone", () => {
    // The same glyph the sidebar uses for an agent session: one thing must not
    // have two appearances in two screens.
    const { container } = render(
      <TurnFrame role="agent">
        <Message text="ok" />
      </TurnFrame>,
    );

    expect(container.querySelector(".turn__g .glyph--agent")?.textContent).toBe("◆");
  });

  it("hides the glyph from the accessibility tree", () => {
    // It sits beside the text it decorates. Announcing it reads the turn twice.
    const { container } = render(
      <TurnFrame role="agent">
        <Message text="ok" />
      </TurnFrame>,
    );

    expect(container.querySelector(".glyph")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Message", () => {
  it("shows the text", () => {
    render(<Message text="O parser saiu para frontmatter.ts" />);

    expect(screen.getByText("O parser saiu para frontmatter.ts")).toBeInTheDocument();
  });

  it("draws the caret only while the turn is open", () => {
    const open = render(<Message text="Rodando a suíte" streaming />);
    expect(open.container.querySelector(".mcaret")).not.toBeNull();

    const done = render(<Message text="Pronto." />);
    expect(done.container.querySelector(".mcaret")).toBeNull();
  });

  it("renders an empty message without a stray paragraph of nothing", () => {
    // A chunk can arrive empty. Rendering a visible gap for it would make the
    // conversation look like it lost something.
    const { container } = render(<Message text="" />);

    expect(container.querySelector(".msg")?.textContent).toBe("");
  });
});

describe("Thought", () => {
  /** The real thing has a parent holding the open state; this is that parent. */
  function Collapsible({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    return <Thought text={text} open={open} onToggle={() => setOpen(!open)} />;
  }

  it("starts collapsed, with a peek at what it says", () => {
    render(<Collapsible text="o parser está embutido no loader" />);

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.getByText(/o parser está embutido no loader/)).toBeInTheDocument();
    // Collapsed means the peek is the only copy — no expanded body beside it.
    expect(document.querySelector(".thought__text")).toBeNull();
  });

  it("opens on click and closes again", async () => {
    const user = userEvent.setup();
    render(<Collapsible text="dois caminhos, escolhi o segundo" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(document.querySelector(".thought__text")).not.toBeNull();

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("says it is thinking while it still is", () => {
    // A3 asked for a live line: without it, a long silence and a finished thought
    // look the same.
    render(<Thought text="ainda decidindo" open={false} onToggle={vi.fn()} streaming />);

    expect(screen.getByRole("button")).toHaveTextContent("pensando…");
  });

  it("says it thought, once it has", () => {
    render(<Thought text="decidido" open={false} onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveTextContent("pensou");
  });

  it("shows no peek when there is nothing yet to peek at", () => {
    const { container } = render(<Thought text="" open={false} onToggle={vi.fn()} streaming />);

    expect(container.querySelector(".thought__peek")).toBeNull();
  });

  it("is reachable and operable from the keyboard", () => {
    // A collapsed block that only a mouse can open hides the reasoning from
    // anyone navigating by keyboard.
    render(<Thought text="algo" open={false} onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveClass("focus-ring");
  });
});

describe("a mensagem é markdown", () => {
  /*
   * O defeito que gerou este bloco: a mensagem inteira ia dentro de um `<p>` só,
   * e o que o agente escreveu como título, lista e cerca de código aparecia como
   * `##`, `-` e ``` numa parede de texto sem quebra nenhuma.
   *
   * O protótipo do Open Design nunca supôs outra coisa — `.msg` sempre teve `<p>`
   * e `<code>` dentro. O que faltava era o resto do que um agente escreve.
   */
  it("título vira título, e não `##` no meio do texto", () => {
    const { container } = render(<Message text={"## O que entrou\n\ntexto"} />);

    expect(container.querySelector("h2")?.textContent).toBe("O que entrou");
    expect(container.textContent).not.toContain("##");
  });

  it("lista vira lista", () => {
    const { container } = render(<Message text={"O que fica:\n- um\n- dois"} />);

    expect(container.querySelectorAll("ul li")).toHaveLength(2);
  });

  it("cerca de código vira bloco, com o texto cru dentro", () => {
    const { container } = render(<Message text={"assim:\n```ts\nconst a = **1**;\n```"} />);

    const code = container.querySelector("pre code");
    expect(code?.textContent).toBe("const a = **1**;");
    // Dentro da cerca não há marcação: os asteriscos são do código.
    expect(container.querySelector("pre strong")).toBeNull();
  });

  it("tabela vira tabela, e rola dentro do próprio contêiner", () => {
    const { container } = render(<Message text={"| a | b |\n|---|---|\n| 1 | 2 |"} />);

    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("tbody td")).toHaveLength(2);
    // Uma tabela larga não pode empurrar a coluna da conversa.
    expect(container.querySelector(".table-scroll table")).not.toBeNull();
  });

  it("forte, código inline e citação", () => {
    const { container } = render(
      <Message text={"isto é **forte** e `código`\n\n> e uma citação"} />,
    );

    expect(container.querySelector("strong")?.textContent).toBe("forte");
    expect(container.querySelector("code")?.textContent).toBe("código");
    expect(container.querySelector("blockquote")?.textContent).toBe("e uma citação");
  });

  it("a quebra de linha que o agente mandou aparece", () => {
    // No markdown de documento ela é espaço; num chat, quem apertou Enter quis a
    // linha nova.
    const { container } = render(<Message text={"uma\noutra"} />);

    expect(container.querySelectorAll("br")).toHaveLength(1);
  });

  it("link abre fora e fecha o `opener`", () => {
    // O `href` vem de um modelo: pode ser qualquer coisa, e abrir na própria aba
    // trocaria o app por uma página.
    const { container } = render(<Message text="veja [o PRD](https://exemplo.dev/prd)" />);

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://exemplo.dev/prd");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("o caret fica dentro do último parágrafo enquanto escreve", () => {
    const { container } = render(<Message text={"## título\n\nescrevendo"} streaming />);

    expect(container.querySelector("p .mcaret")).not.toBeNull();
    expect(container.querySelectorAll(".mcaret")).toHaveLength(1);
  });

  it("mensagem vazia em streaming é só o caret", () => {
    // É o primeiro sinal de que o turno começou.
    const { container } = render(<Message text="" streaming />);

    expect(container.querySelector(".mcaret")).not.toBeNull();
  });

  it("raciocínio aberto também é markdown", () => {
    const { container } = render(
      <Thought text={"1. ler o loader\n2. extrair o parser"} open onToggle={() => {}} />,
    );

    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });
});
