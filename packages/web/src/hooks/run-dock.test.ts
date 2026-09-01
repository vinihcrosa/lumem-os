import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { clampHeight, defaultHeight, maxHeight, RUN_DOCK_MIN_HEIGHT, useRunDock } from "./useRunDock.js";

/**
 * A altura do rodapé, e por que ela não é uma constante.
 *
 * A primeira versão nascia com 256px fixos: colada no pé da tela, com a saída de um
 * `pnpm dev` mal cabendo, e a primeira coisa que se fazia ao abrir era arrastar.
 */
describe("a altura com que o rodapé nasce", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("é metade da janela", () => {
    expect(defaultHeight(1000)).toBe(500);
    expect(defaultHeight(768)).toBe(384);
  });

  it("acompanha a janela em vez de fixar um número", () => {
    // O mesmo número estaria errado nas duas pontas: apertado no monitor grande,
    // grande demais no notebook.
    expect(defaultHeight(2000)).toBeGreaterThan(defaultHeight(900));
  });

  it("deixa a árvore existir mesmo arrastando até em cima", () => {
    // O rodapé é a segunda metade da coluna, não o lugar dela.
    expect(clampHeight(99_999, 1000)).toBe(maxHeight(1000));
    expect(maxHeight(1000)).toBeLessThan(1000);
  });

  it("tem piso, para não virar uma linha sem conteúdo", () => {
    expect(clampHeight(1, 1000)).toBe(RUN_DOCK_MIN_HEIGHT);
  });

  it("numa janela minúscula, o piso ganha do teto", () => {
    // Janela menor que a margem que a árvore pede: o rodapé fica no mínimo, e a
    // conta não pode devolver altura negativa.
    expect(maxHeight(120)).toBe(RUN_DOCK_MIN_HEIGHT);
    expect(defaultHeight(120)).toBe(RUN_DOCK_MIN_HEIGHT);
  });
});

/**
 * De onde o `open` cai quando ninguém escolheu ainda.
 *
 * Nascia **fechado**, e a primeira coisa que se fazia ao entrar num checkout era
 * abrir o rodapé — para responder *"minha aplicação está de pé, e em que porta?"*,
 * que é a primeira pergunta da chegada e não a décima. Ver a PRD `run-dock-open`.
 */
describe("o padrão do rodapé, quando não há preferência", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("nasce aberto", () => {
    const { result } = renderHook(() => useRunDock());

    expect(result.current.open).toBe(true);
  });

  it("nasce com metade da janela, e não com uma altura própria de chegada", () => {
    // A altura de leitura fixa (192px) foi desenhada e recusada: ela comprava três
    // linhas de árvore e custava um segundo número de altura no produto (Q1).
    const { result } = renderHook(() => useRunDock());

    expect(result.current.height).toBe(defaultHeight());
  });

  it("quem fechou encontra fechado — a preferência ganha do padrão", () => {
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: false, height: 300 }));

    const { result } = renderHook(() => useRunDock());

    expect(result.current.open).toBe(false);
  });

  it("fechar grava, e a próxima leitura respeita", () => {
    const first = renderHook(() => useRunDock());
    act(() => {
      first.result.current.toggle();
    });

    const second = renderHook(() => useRunDock());
    expect(second.result.current.open).toBe(false);
  });

  it("preferência ilegível vale como preferência que nunca foi escrita", () => {
    window.localStorage.setItem("lumem.runDock", "{ não é json");

    const { result } = renderHook(() => useRunDock());

    expect(result.current.open).toBe(true);
  });

  it("`open` de tipo errado cai no padrão novo, e a altura gravada sobrevive", () => {
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: "sim", height: 300 }));

    const { result } = renderHook(() => useRunDock());

    expect(result.current.open).toBe(true);
    expect(result.current.height).toBe(300);
  });
});
