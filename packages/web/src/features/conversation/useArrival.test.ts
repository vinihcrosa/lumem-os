import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { arrive, consumeArrival } from "../../lib/navigation.js";
import { useArrival } from "./useArrival.js";

/**
 * O one-shot que hoje vivia espalhado em três refs (`opened` do `ScopePanel`,
 * `asked` e o inicializador do rascunho da `Conversation`) — `032` T22.
 */

describe("useArrival", () => {
  it("devolve null sem chegada nenhuma pendente", () => {
    const { result } = renderHook(() => useArrival("s-1"));

    expect(result.current).toBeNull();
  });

  it("devolve a chegada desta sessão, no primeiro render", () => {
    arrive({ sessionId: "s-1", text: "arruma isso", send: true });

    const { result } = renderHook(() => useArrival("s-1"));

    expect(result.current).toEqual({ sessionId: "s-1", text: "arruma isso", send: true });
  });

  it("ignora a chegada de outra sessão", () => {
    arrive({ sessionId: "s-2", text: "não é para mim", send: true });

    const { result } = renderHook(() => useArrival("s-1"));

    expect(result.current).toBeNull();
    // E a de `s-2` continua no store — este hook não a tocou.
    expect(consumeArrival("s-2")).toEqual({
      sessionId: "s-2",
      text: "não é para mim",
      send: true,
    });
  });

  it("consome do store, para não vazar para outro leitor", () => {
    arrive({ sessionId: "s-1", text: "roda o gate", send: false });

    renderHook(() => useArrival("s-1"));

    // Quem chamar `consumeArrival` depois — outra aba, outro hook — não vê nada.
    expect(consumeArrival("s-1")).toBeNull();
  });

  it("mantém o mesmo valor entre repinturas, sem chegada nova", () => {
    arrive({ sessionId: "s-1", text: "primeira", send: false });
    const { result, rerender } = renderHook(() => useArrival("s-1"));
    const first = result.current;

    rerender();

    // Mesma referência: nada de novo chegou, então não há por que trocar.
    expect(result.current).toBe(first);
  });

  /**
   * Achado 7 da revisão independente: o hook só lia o store no primeiro
   * render da sessão, então uma chegada registrada **depois** que o
   * componente já montou era descartada para sempre — não havia efeito que
   * reagisse a uma `arrival` nova. Prova do revisor: montar a conversa,
   * entregar `attached()`, e só então `arrive(...)` — o socket não recebia
   * nada.
   */
  it("pega uma chegada nova registrada depois que a sessão já montou", () => {
    arrive({ sessionId: "s-1", text: "primeira", send: false });
    const { result, rerender } = renderHook(() => useArrival("s-1"));
    expect(result.current).toEqual({ sessionId: "s-1", text: "primeira", send: false });

    // A primeira já foi consumida (efeito da montagem). Esta é uma segunda
    // chegada de verdade, não a mesma sobrando no store.
    arrive({ sessionId: "s-1", text: "segunda", send: true });
    rerender();

    expect(result.current).toEqual({ sessionId: "s-1", text: "segunda", send: true });
  });
});
