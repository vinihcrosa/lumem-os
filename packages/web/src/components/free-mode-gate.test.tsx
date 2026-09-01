import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FreeModeGate } from "./FreeModeGate.js";

/**
 * O portão do `liberado` (`session-mode`, T10).
 *
 * Cada teste aqui guarda uma forma diferente de o portão deixar de ser portão.
 */

const CWD = "/Users/alguem/.lumem/workspaces/pessoal/lumem-os/worktrees/session-mode";

function gate() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<FreeModeGate cwd={CWD} onCancel={onCancel} onConfirm={onConfirm} />);
  return { onCancel, onConfirm };
}

describe("o portão do modo liberado", () => {
  it("diz o escopo como caminho em disco", () => {
    // "a worktree" não diz tamanho de estrago nenhum. O caminho diz (Q4).
    gate();

    expect(screen.getByText(CWD)).toBeInTheDocument();
  });

  it("diz o que passa a poder acontecer, por extenso", () => {
    gate();

    expect(screen.getByText(/escrever e apagar arquivos/)).toBeInTheDocument();
    expect(screen.getByText(/rodar qualquer comando de shell/)).toBeInTheDocument();
  });

  it("nasce com o foco na saída, não na confirmação", () => {
    gate();

    expect(screen.getByRole("button", { name: /cancelar/ })).toHaveFocus();
  });

  it("põe o botão perigoso no tom de perigo, e não no de ação principal", () => {
    // Um confirmar primário aqui seria o desenho dizendo "é isto que se espera
    // de você". Não é.
    gate();

    expect(screen.getByRole("button", { name: /liberar esta sessão/ })).toHaveClass("btn--danger");
  });

  it("cancela com esc", async () => {
    const { onCancel, onConfirm } = gate();
    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("não oferece lembrar a decisão", () => {
    // O teste que falha se alguém adicionar a caixinha. No dia em que o portão
    // guardar a decisão, ele deixa de ser portão — e essa mudança tem que doer
    // aqui antes de chegar na tela.
    gate();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/não perguntar de novo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/uma sessão nova volta a perguntar tudo/i)).toBeInTheDocument();
  });

  it("só libera quando alguém confirma", async () => {
    const { onConfirm } = gate();
    await userEvent.click(screen.getByRole("button", { name: /liberar esta sessão/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
