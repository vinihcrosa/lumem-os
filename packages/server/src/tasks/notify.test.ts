import { describe, expect, it } from "vitest";

import { noticeFor } from "./notify.js";

/**
 * O que merece aviso (`028` Parte 4, T35 · Q55).
 *
 * Função pura, então o que está sob teste é **a política** — quais estados
 * justificam interromper alguém —, e nenhum deles precisa de navegador.
 */

const facts = (patch: Partial<Parameters<typeof noticeFor>[1]> = {}) => ({
  status: "review" as const,
  seal: { kind: "manual" as const },
  notifiedAt: null,
  ...patch,
});

describe("o que avisa", () => {
  it("pronta para mesclar — o fim da esteira é você", () => {
    expect(noticeFor("o /orders devolve 500", facts({ status: "ready_to_merge" }))).toBe(
      "o /orders devolve 500 está pronta para mesclar",
    );
  });

  it("bloqueada — e a frase carrega o motivo", () => {
    // Um aviso que diz *"parou"* e não diz do quê é um alarme, não um aviso.
    expect(
      noticeFor("exportar CSV", facts({ seal: { kind: "blocked", reason: "o teste falhou" } })),
    ).toBe("exportar CSV parou: o teste falhou");
  });
});

describe("o que **não** avisa, e diz tanto quanto o que avisa", () => {
  it("pausada não avisa — ela retoma sozinha", () => {
    /*
     * O UC6 é explícito: cota *"retoma sozinha e **não te notifica**, porque não
     * precisa de você"*. Avisar aqui seria chamar alguém para uma espera que a
     * própria feature desenhou.
     */
    expect(
      noticeFor("t", facts({ seal: { kind: "paused", until: new Date().toISOString() } })),
    ).toBeNull();
  });

  it("aguardando não avisa — a máquina está vindo", () => {
    expect(noticeFor("t", facts({ seal: { kind: "waiting", role: "revisor" } }))).toBeNull();
  });

  it("trabalhando não avisa — avisar que começou ensina a ignorar avisos", () => {
    expect(
      noticeFor("t", facts({ seal: { kind: "working", role: "revisor", since: new Date().toISOString() } })),
    ).toBeNull();
  });

  it("nada avisa duas vezes", () => {
    // A condição que faz *"uma vez, sem repetir"* valer. Sem ela, um `F5`
    // renotificaria tudo que está parado.
    expect(
      noticeFor("t", facts({ status: "ready_to_merge", notifiedAt: new Date() })),
    ).toBeNull();
  });
});
