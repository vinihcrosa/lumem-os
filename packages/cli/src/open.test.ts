import { describe, expect, it, vi } from "vitest";

import { openInBrowser } from "./open.js";

describe("openInBrowser", () => {
  it("usa o comando da plataforma", () => {
    const launch = vi.fn();

    openInBrowser({ url: "http://127.0.0.1:4317", platform: "darwin", launch });
    openInBrowser({ url: "http://127.0.0.1:4317", platform: "linux", launch });

    expect(launch).toHaveBeenNthCalledWith(1, "open", ["http://127.0.0.1:4317"]);
    expect(launch).toHaveBeenNthCalledWith(2, "xdg-open", ["http://127.0.0.1:4317"]);
  });

  it("falhar em abrir não é falhar", () => {
    // O daemon já está de pé quando isto roda, e a URL já foi impressa. Deixar
    // de rodar porque não achou navegador seria trocar o produto pelo enfeite.
    const launch = vi.fn(() => {
      throw new Error("sem navegador");
    });

    expect(openInBrowser({ url: "http://x", launch })).toBe(false);
  });
});
