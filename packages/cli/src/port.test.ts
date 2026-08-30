import { describe, expect, it } from "vitest";

import { probePort } from "./port.js";

function respond(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("probePort", () => {
  it("porta que ninguém atende está livre", async () => {
    const refused = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await probePort({ origin: "http://127.0.0.1:1", request: refused })).toEqual({
      kind: "free",
    });
  });

  it("reconhece um Lumem pela resposta dele", async () => {
    const request = respond({ result: { data: { ok: true, version: "0.1.0" } } });

    expect(await probePort({ origin: "http://127.0.0.1:4317", request })).toEqual({
      kind: "lumem",
      version: "0.1.0",
    });
  });

  it("qualquer outra coisa na porta é outra coisa", async () => {
    // O caso que importa: um servidor que responde 200 com HTML na mesma URL.
    // Chamar isso de Lumem faria o CLI mandar a pessoa abrir o produto errado.
    const html = (async () => new Response("<!doctype html>", { status: 200 })) as unknown as typeof fetch;

    expect(await probePort({ origin: "http://127.0.0.1:3000", request: html })).toEqual({ kind: "other" });
    expect(
      await probePort({ origin: "http://127.0.0.1:3000", request: respond({ nope: true }) }),
    ).toEqual({ kind: "other" });
    expect(
      await probePort({ origin: "http://127.0.0.1:3000", request: respond({}, 500) }),
    ).toEqual({ kind: "other" });
  });
});
