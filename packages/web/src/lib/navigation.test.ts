import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { routeOf } from "./route.js";
import {
  arrive,
  arriveDraft,
  clear,
  consumeArrival,
  consumePendingDraft,
  select,
  useNavigation,
} from "./navigation.js";

/**
 * O store da navegação, e a regra que ele existe para não deixar discordar de
 * si mesma: `selection !== null` implica `route === "home"`.
 *
 * O `afterEach` global (`test/setup.ts`) já zera o store entre testes — o que
 * falta aqui é só a rota, que é do `window.history` e não do módulo.
 */

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("select", () => {
  it("passa a responder pela seleção", () => {
    const { result } = renderHook(() => useNavigation());
    expect(result.current.selection).toBeNull();

    act(() => select({ projectId: "p-1", scope: { scopeType: "worktree", scopeId: "w-1" } }));

    expect(result.current.selection).toEqual({
      projectId: "p-1",
      scope: { scopeType: "worktree", scopeId: "w-1" },
    });
  });

  it("leva a rota para home, com replace — a regra que a própria seleção carrega", () => {
    window.history.replaceState(null, "", "/tasks");
    const before = window.history.length;

    act(() => select({ projectId: "p-1", scope: { scopeType: "project", scopeId: "p-1" } }));

    expect(routeOf(window.location.pathname)).toBe("home");
    // replace, não push: nenhuma entrada nova no histórico.
    expect(window.history.length).toBe(before);
  });
});

describe("clear", () => {
  it("tira a seleção", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => select({ projectId: "p-1", scope: { scopeType: "project", scopeId: "p-1" } }));

    act(() => clear());

    expect(result.current.selection).toBeNull();
  });

  it("não toca a rota — quem chama decide para onde", () => {
    window.history.replaceState(null, "", "/tasks");
    act(() => select({ projectId: "p-1", scope: { scopeType: "project", scopeId: "p-1" } }));
    window.history.replaceState(null, "", "/settings");

    act(() => clear());

    expect(routeOf(window.location.pathname)).toBe("settings");
  });

  it("não notifica quando já não há seleção nem chegada", () => {
    const { result } = renderHook(() => useNavigation());
    const before = result.current;

    act(() => clear());

    // Mesma referência: nada mudou, então o `useSyncExternalStore` não devolve
    // um snapshot novo.
    expect(result.current).toBe(before);
  });

  /**
   * Achado 10 da revisão independente: `clear()` só zerava `selection`, e uma
   * chegada pendente sobrevivia apontando para uma sessão de fora do
   * workspace novo — viva até outra chegada a substituir.
   */
  it("zera a chegada pendente junto com a seleção", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => select({ projectId: "p-1", scope: { scopeType: "project", scopeId: "p-1" } }));
    act(() => arrive({ sessionId: "s-1", text: "não deixa vazar", send: false }));

    act(() => clear());

    expect(result.current.selection).toBeNull();
    expect(result.current.arrival).toBeNull();
  });

  it("zera o rascunho pendente junto — mesma regra do achado 10", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => select({ projectId: "p-1", scope: { scopeType: "project", scopeId: "p-1" } }));
    act(() => arriveDraft({ scopeType: "worktree", scopeId: "w-9" }, "não deixa vazar"));

    act(() => clear());

    expect(result.current.pendingDraft).toBeNull();
  });
});

describe("arriveDraft e consumePendingDraft", () => {
  it("guarda o rascunho pendente, lido pelo store", () => {
    const { result } = renderHook(() => useNavigation());

    act(() => arriveDraft({ scopeType: "worktree", scopeId: "w-9" }, "continuar dali"));

    expect(result.current.pendingDraft).toEqual({
      scope: { scopeType: "worktree", scopeId: "w-9" },
      text: "continuar dali",
    });
  });

  it("consome e devolve o texto, uma vez", () => {
    act(() => arriveDraft({ scopeType: "worktree", scopeId: "w-9" }, "olha isso"));

    const first = consumePendingDraft({ scopeType: "worktree", scopeId: "w-9" });
    expect(first).toBe("olha isso");

    // A segunda chamada, para o mesmo escopo, não vê mais nada.
    expect(consumePendingDraft({ scopeType: "worktree", scopeId: "w-9" })).toBeNull();
  });

  it("devolve null para um escopo sem rascunho pendente", () => {
    act(() => arriveDraft({ scopeType: "worktree", scopeId: "w-9" }, "olha isso"));

    expect(consumePendingDraft({ scopeType: "worktree", scopeId: "w-10" })).toBeNull();
    // E o de `w-9` continua lá — o de outro escopo não o consome por engano.
    expect(consumePendingDraft({ scopeType: "worktree", scopeId: "w-9" })).toBe("olha isso");
  });

  it("limpa o store depois de consumido, para quem está inscrito", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => arriveDraft({ scopeType: "worktree", scopeId: "w-9" }, "olha isso"));

    act(() => {
      consumePendingDraft({ scopeType: "worktree", scopeId: "w-9" });
    });

    expect(result.current.pendingDraft).toBeNull();
  });
});

describe("arrive e consumeArrival", () => {
  it("guarda a chegada, lida pelo store", () => {
    const { result } = renderHook(() => useNavigation());

    act(() => arrive({ sessionId: "s-1", text: "arruma isso", send: true }));

    expect(result.current.arrival).toEqual({ sessionId: "s-1", text: "arruma isso", send: true });
  });

  it("consome e devolve a chegada, uma vez", () => {
    act(() => arrive({ sessionId: "s-1", text: "olha isso", send: false }));

    const first = consumeArrival("s-1");
    expect(first).toEqual({ sessionId: "s-1", text: "olha isso", send: false });

    // A segunda chamada, para a mesma sessão, não vê mais nada.
    expect(consumeArrival("s-1")).toBeNull();
  });

  it("devolve null para uma sessão sem chegada pendente", () => {
    act(() => arrive({ sessionId: "s-1", send: false }));

    expect(consumeArrival("s-2")).toBeNull();
    // E a de `s-1` continua lá — a de outra sessão não a consome por engano.
    expect(consumeArrival("s-1")).toEqual({ sessionId: "s-1", send: false });
  });

  it("limpa o store depois de consumida, para quem está inscrito", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => arrive({ sessionId: "s-1", send: false }));

    act(() => {
      consumeArrival("s-1");
    });

    expect(result.current.arrival).toBeNull();
  });
});
