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

  it("mantém o mesmo valor entre repinturas, sem consumir de novo", () => {
    arrive({ sessionId: "s-1", text: "primeira", send: false });
    const { result, rerender } = renderHook(() => useArrival("s-1"));
    const first = result.current;

    // Uma segunda chegada para a mesma sessão, enquanto o hook já está montado:
    // já foi consumida uma vez, e este componente não pega uma segunda.
    arrive({ sessionId: "s-1", text: "segunda", send: false });
    rerender();

    expect(result.current).toBe(first);
    expect(result.current).toEqual({ sessionId: "s-1", text: "primeira", send: false });
  });
});
