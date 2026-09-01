import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LumemModePill } from "./LumemModePill.js";

/**
 * A pílula que nunca falta (`session-mode`, T2 e T3).
 *
 * O buraco que ela tampa: as pílulas do composer são derivadas inteiramente do
 * `configOptions`, e um vazio produz **zero pílula** — um agente que não relata
 * modos desenha o mesmo pixel que um bug de transporte. O que estes testes
 * guardam é que a pílula existe sempre, que ela **diz de quem é a regra**, e que
 * as duas autoridades nunca aparecem juntas.
 */

function pill(props: Partial<Parameters<typeof LumemModePill>[0]> = {}) {
  const onSwitch = vi.fn();
  const onFreeRequested = vi.fn();
  render(
    <LumemModePill
      mode="ask"
      workspaceDefault="ask"
      onSwitch={onSwitch}
      onFreeRequested={onFreeRequested}
      {...props}
    />,
  );
  return { onSwitch, onFreeRequested };
}

describe("a pílula do modo do Lumem", () => {
  it("diz o modo em português, e não a string de um protocolo", () => {
    // É este o segundo sinal de autoria, e ele não custou uma linha de CSS: o
    // agente entrega `bypassPermissions`; o Lumem escreve "Perguntar tudo". Duas
    // pílulas lado a lado nunca vão parecer da mesma origem (Q2).
    pill();

    expect(screen.getByRole("button", { name: /Perguntar tudo/ })).toBeInTheDocument();
  });

  it("marca a regra como do Lumem no rótulo acessível", () => {
    // O glifo `◈` é `aria-hidden` — quem lê com leitor de tela ouviria "losango"
    // e não aprenderia nada. A autoria vai na palavra.
    pill({ mode: "auto" });

    expect(
      screen.getByRole("button", { name: /regra do Lumem: Automático/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ["ask", "pill--ask"],
    ["auto", "pill--auto"],
    ["free", "pill--bypass"],
  ] as const)("pinta %s com o tom da consequência", (mode, tone) => {
    // `auto` e `free` reusam os tons do `auto` e do `bypassPermissions` do agente
    // DE PROPÓSITO: para quem olha, a consequência é a mesma, e o mesmo perigo com
    // duas cores seria pior que a assimetria do glifo (§3 do desenho).
    pill({ mode });

    expect(screen.getByRole("button", { name: /regra do Lumem/i })).toHaveClass(tone);
  });

  it("não oferece troca no meio de um turno", () => {
    pill({ disabled: true });

    expect(screen.getByRole("button", { name: /regra do Lumem/i })).toBeDisabled();
  });

  it("mostra o modo em que a conversa esteve, sem oferecer troca", async () => {
    // Encerrada não é controle desligado: é fato registrado. Sem `▾` e sem
    // `disabled` — ler uma transcrição sem saber sob que política ela rodou é ler
    // metade dela (F1.8).
    pill({ mode: "free", readOnly: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Liberado/)).toBeInTheDocument();
  });

  describe("o menu", () => {
    it("diz de quem é a regra, e por quê", async () => {
      // Sem o cabeçalho o glifo é charada (§2 do desenho).
      pill();
      await userEvent.click(screen.getByRole("button", { name: /regra do Lumem/i }));

      expect(screen.getByText(/Regra do Lumem/)).toBeInTheDocument();
      expect(screen.getByText(/não relatou modos/i)).toBeInTheDocument();
    });

    it("descreve o que cada valor faz, e o automático diz que deixa rastro", async () => {
      pill();
      await userEvent.click(screen.getByRole("button", { name: /regra do Lumem/i }));

      expect(screen.getByRole("menuitemradio", { name: /Perguntar tudo/ })).toBeChecked();
      expect(screen.getByText(/aparece na conversa/i)).toBeInTheDocument();
    });

    it("troca o modo ao escolher", async () => {
      const { onSwitch } = pill();
      await userEvent.click(screen.getByRole("button", { name: /regra do Lumem/i }));
      await userEvent.click(screen.getByRole("menuitemradio", { name: /Automático/ }));

      expect(onSwitch).toHaveBeenCalledWith("auto");
    });

    it("não troca para liberado direto: pede o portão", async () => {
      // O modo perigoso não muda no clique. Ele pede a confirmação da T10, e é o
      // portão que troca — senão o portão seria decoração depois do fato (Q4).
      const { onSwitch, onFreeRequested } = pill();
      await userEvent.click(screen.getByRole("button", { name: /regra do Lumem/i }));
      await userEvent.click(screen.getByRole("menuitemradio", { name: /Liberado/ }));

      expect(onSwitch).not.toHaveBeenCalled();
      expect(onFreeRequested).toHaveBeenCalled();
    });

    it("mostra o padrão do workspace, que é de onde o valor veio", async () => {
      pill({ workspaceDefault: "auto" });
      await userEvent.click(screen.getByRole("button", { name: /regra do Lumem/i }));

      expect(screen.getByText(/padrão do workspace/i)).toHaveTextContent(/automático/i);
    });
  });
});
