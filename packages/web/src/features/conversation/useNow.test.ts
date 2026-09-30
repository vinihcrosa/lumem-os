import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./useNow.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("tique de 1 s só enquanto ativo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const seen: number[] = [];
    const ticking = renderHook(({ active }) => {
      const now = useNow(active);
      if (seen.at(-1) !== now) seen.push(now);
      return now;
    }, { initialProps: { active: true } });

    expect(ticking.result.current).toBe(1_000_000);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(ticking.result.current).toBe(1_000_000);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ticking.result.current).toBe(1_001_000);
    // Um `act` por segundo: dois tiques no mesmo `act` o React junta num render só.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ticking.result.current).toBe(1_002_000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ticking.result.current).toBe(1_003_000);
    // Uma vez por segundo: três segundos, três valores novos depois do primeiro.
    expect(seen).toEqual([1_000_000, 1_001_000, 1_002_000, 1_003_000]);

    // Desligado no meio, o intervalo sai com ele.
    ticking.rerender({ active: false });
    expect(vi.getTimerCount()).toBe(0);
    ticking.unmount();

    const idle = renderHook(() => useNow(false));
    expect(vi.getTimerCount()).toBe(0);
    const before = idle.result.current;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(idle.result.current).toBe(before);
    idle.unmount();
  });
});
