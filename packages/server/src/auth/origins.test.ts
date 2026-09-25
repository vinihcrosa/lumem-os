import { describe, expect, it } from "vitest";

import {
  allowedHostnames,
  isAllowedAuthority,
  isAllowedFetchSite,
  isAllowedOrigin,
  isLoopbackHost,
  normalizeOrigin,
  originOf,
  parseAuthority,
  parseWebOrigins,
} from "./origins.js";

/**
 * As regras da fase 1, longe de qualquer socket.
 *
 * O caso que dá nome à feature — um `Host` de outro domínio apontando para
 * 127.0.0.1 — não se produz numa suíte: pede um DNS de TTL zero. O que dá para
 * provar é a decisão, e é aqui.
 */

describe("parseAuthority", () => {
  it("lê nome e porta", () => {
    expect(parseAuthority("127.0.0.1:4317")).toEqual({ hostname: "127.0.0.1", port: 4317 });
  });

  it("assume a porta 80 quando o Host não traz porta", () => {
    expect(parseAuthority("localhost")).toEqual({ hostname: "localhost", port: 80 });
  });

  it("lê IPv6 entre colchetes, e devolve o nome sem eles", () => {
    expect(parseAuthority("[::1]:4317")).toEqual({ hostname: "::1", port: 4317 });
  });

  it("normaliza caixa e o ponto final de FQDN", () => {
    // `LOCALHOST.` é o mesmo host, escrito de um jeito que o browser aceita —
    // e comparar sem normalizar seria deixá-lo fora da lista.
    expect(parseAuthority("LOCALHOST.:4317")).toEqual({ hostname: "localhost", port: 4317 });
  });

  it.each([
    ["ausente", undefined],
    ["vazio", "   "],
    ["IPv6 sem colchetes", "::1:4317"],
    ["porta que não é número", "localhost:abc"],
    ["porta fora da faixa", "localhost:99999"],
    ["só a porta", ":4317"],
  ])("recusa o que não dá para interpretar: %s", (_name, raw) => {
    expect(parseAuthority(raw)).toBeNull();
  });
});

describe("isAllowedAuthority", () => {
  const allowed = { hostnames: [...allowedHostnames("127.0.0.1")], port: 4317 };

  it.each(["127.0.0.1:4317", "localhost:4317", "[::1]:4317"])("aceita %s", (host) => {
    expect(isAllowedAuthority(host, allowed)).toBe(true);
  });

  it("recusa outro domínio, mesmo na porta certa", () => {
    // DNS rebinding em uma linha: o browser manda o nome que a página usou.
    expect(isAllowedAuthority("evil.example:4317", allowed)).toBe(false);
  });

  it("recusa a porta errada no nome certo", () => {
    expect(isAllowedAuthority("127.0.0.1:4318", allowed)).toBe(false);
  });

  it("recusa Host ausente", () => {
    expect(isAllowedAuthority(undefined, allowed)).toBe(false);
  });

  it("aceita o host configurado quando ele não é um dos três", () => {
    // `127.0.0.2` é loopback, sobe (S5), e não está no conjunto padrão.
    const withConfigured = { hostnames: allowedHostnames("127.0.0.2"), port: 4317 };
    expect(isAllowedAuthority("127.0.0.2:4317", withConfigured)).toBe(true);
    expect(isAllowedAuthority("127.0.0.2:4317", allowed)).toBe(false);
  });
});

describe("allowedHostnames", () => {
  it("não repete o host configurado quando ele já está na lista", () => {
    expect(allowedHostnames("127.0.0.1")).toEqual(["127.0.0.1", "localhost", "::1"]);
  });
});

describe("originOf", () => {
  it("põe o IPv6 entre colchetes, que é como uma origem se escreve", () => {
    expect(originOf("::1", 4317)).toBe("http://[::1]:4317");
    expect(originOf("localhost", 4317)).toBe("http://localhost:4317");
  });
});

describe("normalizeOrigin", () => {
  it("compara por origem, não por string", () => {
    expect(normalizeOrigin("http://LOCALHOST:4318/")).toBe("http://localhost:4318");
  });

  it("recusa a origem `null`", () => {
    // Iframe em sandbox, página de `file://`: é a origem que qualquer um
    // consegue apresentar, então aceitá-la seria não ter lista nenhuma.
    expect(normalizeOrigin("null")).toBeNull();
  });

  it("recusa o que não é uma URL", () => {
    expect(normalizeOrigin("não é origem")).toBeNull();
  });
});

describe("parseWebOrigins", () => {
  it("lê a lista por vírgula, normalizada e sem repetição", () => {
    expect(
      parseWebOrigins("http://127.0.0.1:4318, http://localhost:4318/, http://localhost:4318"),
    ).toEqual(["http://127.0.0.1:4318", "http://localhost:4318"]);
  });

  it("ignora o item torto em vez de derrubar o daemon", () => {
    // A variável é escrita por script de workspace. Uma vírgula sobrando não
    // pode ser motivo para ninguém conseguir trabalhar.
    expect(parseWebOrigins("http://127.0.0.1:4318,,lixo")).toEqual(["http://127.0.0.1:4318"]);
  });

  it("sem variável, sem origens extras", () => {
    expect(parseWebOrigins(undefined)).toEqual([]);
  });
});

describe("isAllowedOrigin", () => {
  const allowed = ["http://127.0.0.1:4317", "http://localhost:4318"];

  it("aceita o que está na lista, tolerando a barra final", () => {
    expect(isAllowedOrigin("http://localhost:4318/", allowed)).toBe(true);
  });

  it("recusa o que não está", () => {
    expect(isAllowedOrigin("http://evil.example", allowed)).toBe(false);
  });
});

describe("isAllowedFetchSite", () => {
  it("passa quando o cabeçalho não veio — é a porta do agente", () => {
    expect(isAllowedFetchSite(undefined)).toBe(true);
  });

  it.each(["same-origin", "none", "None"])("passa com %s", (value) => {
    expect(isAllowedFetchSite(value)).toBe(true);
  });

  it.each(["cross-site", "same-site"])("recusa %s", (value) => {
    expect(isAllowedFetchSite(value)).toBe(false);
  });
});

describe("isLoopbackHost", () => {
  it.each(["127.0.0.1", "127.0.0.2", "127.255.255.255", "::1", "localhost", "LocalHost"])(
    "aceita %s",
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each(["0.0.0.0", "::", "192.168.1.10", "example.com", "", "127.0.0.300"])(
    "recusa %s",
    (host) => {
      // `0.0.0.0` é o caso que a S5 trata: "todas as interfaces" não é local.
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});
