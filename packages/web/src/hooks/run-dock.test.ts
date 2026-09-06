import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clampHeight,
  defaultHeight,
  maxHeight,
  RUN_DOCK_MIN_HEIGHT,
  RUN_DOCK_PANEL_WIDTH,
  useRunDock,
  widenColumnOnOpen,
} from "./useRunDock.js";

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
 * De onde o rodapé cai quando ninguém escolheu nada.
 *
 * Foi **fechado** até 2026-09-06, pelo mesmo argumento da coluna de arquivos: quem
 * nunca pediu não perde um terço da tela. O que virou o argumento foi medir o que
 * ele custa em vez de supor — numa coluna de 576px a árvore mostra 11 das 16
 * linhas com o rodapé na metade, e não a metade inútil que a prosa supunha. Contra
 * isso, "minha aplicação está de pé, e em que porta?" é a primeira pergunta de quem
 * chega numa worktree, não a décima.
 *
 * O padrão é o **primeiro contato**, e não uma regra que sobrepõe a pessoa: por isso
 * os dois testes seguintes andam juntos, e o segundo é o que impede o primeiro de
 * virar imposição.
 */
describe("o rodapé aberto por padrão", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("nasce aberto quando não há preferência gravada", () => {
    const { result } = renderHook(() => useRunDock());
    expect(result.current.open).toBe(true);
  });

  it("nasce fechado para quem fechou", () => {
    // F1.2: a preferência ganha do padrão, em qualquer direção.
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: false, height: 300 }));

    const { result } = renderHook(() => useRunDock());

    expect(result.current.open).toBe(false);
    expect(result.current.height).toBe(300);
  });

  it("fechar grava, e a próxima montagem encontra fechado", () => {
    const first = renderHook(() => useRunDock());
    act(() => {
      first.result.current.toggle();
    });
    expect(first.result.current.open).toBe(false);

    const second = renderHook(() => useRunDock());
    expect(second.result.current.open).toBe(false);
  });

  it("preferência ilegível cai no padrão novo, e não numa tela que não abre", () => {
    window.localStorage.setItem("lumem.runDock", "{ isto não é JSON");
    expect(renderHook(() => useRunDock()).result.current.open).toBe(true);

    // `open` de outro tipo é meia preferência: o que sobra vale, o resto cai no padrão.
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: "sim", height: 240 }));
    const half = renderHook(() => useRunDock());
    expect(half.result.current.open).toBe(true);
    expect(half.result.current.height).toBe(240);
  });

  it("mudar o padrão de `open` não mexeu na altura", () => {
    // A [Q1] recusou um segundo número de altura no produto: nascer aberto usa a
    // altura que já existia para quem abria.
    expect(renderHook(() => useRunDock()).result.current.height).toBe(defaultHeight());
  });
});

/**
 * O que alarga a coluna, e a lista — mais longa — do que não alarga.
 *
 * O piso de 640px existe porque um terminal de 80 colunas não cabe em 360. A [Q2]
 * decidiu que ele continua sendo do **chevron** e da alça, e de mais nada: aberto
 * por padrão, a chegada fica nos 360px de sempre, com ~45 colunas — e os 280px de
 * painel central que o piso cobraria de todo mundo valem mais que 80 colunas que
 * ninguém pediu.
 */
describe("o piso de largura da coluna", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function column(width: number) {
    return { width, setWidth: vi.fn() };
  }

  it("não alarga na chegada — só envolver o rodapé não mexe na coluna", () => {
    const { result } = renderHook(() => useRunDock());
    const wide = column(360);

    widenColumnOnOpen(result.current, wide);

    expect(result.current.open).toBe(true);
    expect(wide.setWidth).not.toHaveBeenCalled();
  });

  it("alarga quando o chevron abre um rodapé fechado numa coluna estreita", () => {
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: false, height: 300 }));
    const { result } = renderHook(() => useRunDock());
    const narrow = column(360);

    act(() => {
      widenColumnOnOpen(result.current, narrow).toggle();
    });

    expect(narrow.setWidth).toHaveBeenCalledWith(RUN_DOCK_PANEL_WIDTH);
    expect(result.current.open).toBe(true);
  });

  it("fechar não estreita de volta: coluna alargada é preferência lembrada", () => {
    const { result } = renderHook(() => useRunDock());
    const wide = column(640);

    act(() => {
      widenColumnOnOpen(result.current, wide).toggle();
    });

    expect(result.current.open).toBe(false);
    expect(wide.setWidth).not.toHaveBeenCalled();
  });

  it("não corrige quem já arrastou para mais que o piso", () => {
    window.localStorage.setItem("lumem.runDock", JSON.stringify({ open: false, height: 300 }));
    const { result } = renderHook(() => useRunDock());
    const wider = column(700);

    act(() => {
      widenColumnOnOpen(result.current, wider).toggle();
    });

    expect(wider.setWidth).not.toHaveBeenCalled();
  });
});
