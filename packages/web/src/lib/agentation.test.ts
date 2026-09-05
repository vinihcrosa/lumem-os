import { describe, expect, it } from "vitest";

import { agentationEndpoint, wantsAgentation } from "./agentation.js";

describe("wantsAgentation", () => {
  it("liga no dev", () => {
    expect(wantsAgentation({ DEV: true })).toBe(true);
  });

  it("não liga fora do dev, mesmo pedido", () => {
    expect(wantsAgentation({ DEV: false, VITE_AGENTATION: "on" })).toBe(false);
  });

  it("desliga com VITE_AGENTATION=off, que é o que o e2e passa", () => {
    expect(wantsAgentation({ DEV: true, VITE_AGENTATION: "off" })).toBe(false);
  });
});

describe("agentationEndpoint", () => {
  it("aponta para o agentation-mcp local por padrão", () => {
    expect(agentationEndpoint({ DEV: true })).toBe("http://127.0.0.1:4747");
  });

  it("respeita um endpoint configurado", () => {
    expect(agentationEndpoint({ DEV: true, VITE_AGENTATION_ENDPOINT: "http://127.0.0.1:9999" })).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("sem endpoint quando desligado: a barra fica só no localStorage", () => {
    expect(agentationEndpoint({ DEV: true, VITE_AGENTATION_ENDPOINT: "off" })).toBeUndefined();
  });

  it("trata vazio como não configurado — env var vazia é o que um shell entrega", () => {
    expect(agentationEndpoint({ DEV: true, VITE_AGENTATION_ENDPOINT: "" })).toBe(
      "http://127.0.0.1:4747",
    );
  });
});
