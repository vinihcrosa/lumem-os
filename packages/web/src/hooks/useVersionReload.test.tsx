import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RELOADED_FOR_KEY, useVersionReload } from "./useVersionReload.js";

/**
 * A página que sabe que o daemon mudou de versão debaixo dela (`038`, Parte 2).
 *
 * A aba aberta tem o JS da versão velha na memória, e o daemon novo serve assets com
 * outro hash: o que a página deve fazer é recarregar — **uma vez**. O recarregamento é
 * um `reload` injetado, porque o jsdom não recarrega nada; o `sessionStorage` é o de
 * verdade, porque é ele que diz *"esta aba"*.
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("useVersionReload", () => {
  it("reloads once and then says what changed", () => {
    const reload = vi.fn();

    // A aba velha (bundle 0.6.1) vê o daemon novo (0.7.0): recarrega, e ainda não
    // há o que dizer — a página que diria está prestes a ser jogada fora.
    const stale = renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(stale.result.current.updatedTo).toBeNull();
    stale.unmount();

    // A página recarregada já é o bundle 0.7.0: as versões batem, e ela diz a que
    // versão chegou.
    const fresh = renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.7.0", reload }));
    expect(fresh.result.current.updatedTo).toBe("0.7.0");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads twice in one tab", () => {
    const reload = vi.fn();

    renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload })).unmount();
    expect(reload).toHaveBeenCalledTimes(1);

    // Depois do recarregamento as versões **ainda** diferem — um cache que serviu o
    // bundle velho, um proxy no meio. Recarregar de novo seria um laço, e ele não
    // tem saída: a aba fica piscando.
    const after = renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(after.result.current.updatedTo).toBeNull();

    // Nem mesmo se o daemon mudou de novo enquanto isso: quem não resolveu uma vez
    // não resolve com outra tentativa.
    after.rerender();
    renderHook(() => useVersionReload({ served: "0.8.0", bundled: "0.6.1", reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the versions agree, or before the daemon has answered", () => {
    const reload = vi.fn();

    const equal = renderHook(() => useVersionReload({ served: "0.6.1", bundled: "0.6.1", reload }));
    const unanswered = renderHook(() => useVersionReload({ served: undefined, bundled: "0.6.1", reload }));

    expect(reload).not.toHaveBeenCalled();
    expect(equal.result.current.updatedTo).toBeNull();
    expect(unanswered.result.current.updatedTo).toBeNull();
    expect(window.sessionStorage.getItem(RELOADED_FOR_KEY)).toBeNull();
  });

  it("lets a later update reload again once a reload has worked", () => {
    // A guarda é sobre **o mesmo defeito**, e não uma cota por aba: a aba que ficou
    // aberta dias e atualizou duas vezes precisa recarregar nas duas.
    const reload = vi.fn();

    renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload })).unmount();
    renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.7.0", reload })).unmount();
    expect(window.sessionStorage.getItem(RELOADED_FOR_KEY)).toBeNull();

    renderHook(() => useVersionReload({ served: "0.8.0", bundled: "0.7.0", reload }));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when the tab cannot remember that it did", () => {
    // Sem armazenamento a guarda não existe, e sem guarda um bundle que não casa vira
    // laço: melhor uma aba velha do que uma aba que pisca.
    const blocked = () => {
      throw new DOMException("bloqueado", "SecurityError");
    };

    // Nem ler nem gravar.
    const reload = vi.fn();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    const { result } = renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload }));
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.updatedTo).toBeNull();
    vi.restoreAllMocks();

    // Lê, mas não grava: a marca que impediria o segundo recarregamento não existiria.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    renderHook(() => useVersionReload({ served: "0.7.0", bundled: "0.6.1", reload }));
    expect(reload).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("stops saying what changed once it is dismissed", () => {
    const { result, rerender } = renderHook(
      ({ bundled }) => useVersionReload({ served: "0.7.0", bundled, reload: vi.fn() }),
      { initialProps: { bundled: "0.6.1" } },
    );
    rerender({ bundled: "0.7.0" });
    expect(result.current.updatedTo).toBe("0.7.0");

    act(() => result.current.dismiss());

    expect(result.current.updatedTo).toBeNull();
  });
});
