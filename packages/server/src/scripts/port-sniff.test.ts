import { describe, expect, it } from "vitest";

import { PortWatcher, SNIFF_LIMIT_BYTES, sniffPort, usesReservedPort } from "./port-sniff.js";

describe("sniffPort", () => {
  it.each([
    ["  ➜  Local:   http://127.0.0.1:55061/", 55_061],
    ["  - Local:        http://localhost:3000", 3_000],
    ["Serving on http://0.0.0.0:8080", 8_080],
    ["Listening on port 8080", 8_080],
    ["server started, listening at port 4000", 4_000],
    ['{"level":30,"port":55060,"msg":"lumem daemon listening"}', 55_060],
  ])("acha a porta em %j", (line, expected) => {
    expect(sniffPort(line)).toBe(expected);
  });

  it("enxerga através da cor do terminal", () => {
    // A linha do Vite chega cheia de escape ANSI, e ela é o caso mais comum
    // que este módulo existe para ler.
    const painted = "  [32m➜[39m  [1mLocal[22m:   [36mhttp://127.0.0.1:[1m5173[22m/[39m";
    expect(sniffPort(painted)).toBe(5_173);
  });

  /**
   * A regra que ficou de fora de propósito: número solto. Log estruturado é cheio
   * deles, e uma porta lida de um timestamp é um botão que abre a coisa errada —
   * pior que botão nenhum.
   */
  it.each([
    "compiled 1284 modules in 38.2s",
    "+1284 pacotes em 38,2s",
    'ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/@lumem%2Ficons',
    "done in 4213ms",
  ])("não inventa porta em %j", (line) => {
    expect(sniffPort(line)).toBeNull();
  });

  it("ignora porta privilegiada — um run de desenvolvimento não sobe em 80", () => {
    expect(sniffPort("http://localhost:80/")).toBeNull();
  });
});

describe("PortWatcher", () => {
  it("quando o comando usa a variável, a resposta é a reserva e não a regex", () => {
    const watcher = new PortWatcher(45_000, true);

    watcher.push("Local: http://127.0.0.1:9999/");

    // Determinístico ganha de heurística: a saída pode estar mostrando um proxy,
    // um túnel, ou a porta de outra coisa que o script subiu junto.
    expect(watcher.result).toEqual({ port: 45_000, source: "env" });
  });

  it("sem a variável, lê da saída e diz que foi da saída", () => {
    const watcher = new PortWatcher(45_000, false);

    watcher.push("  ➜  Local:   http://127.0.0.1:5173/\n");

    expect(watcher.result).toEqual({ port: 5_173, source: "output" });
  });

  it("junta a linha que chegou partida", () => {
    // O PTY entrega o que couber no buffer, não o que faz sentido para quem lê.
    const watcher = new PortWatcher(null, false);

    watcher.push("  ➜  Local:   http://127.0");
    watcher.push(".0.1:5173/\n");

    expect(watcher.result?.port).toBe(5_173);
  });

  it("para de olhar depois do teto", () => {
    const watcher = new PortWatcher(null, false);

    watcher.push("x".repeat(SNIFF_LIMIT_BYTES + 1));
    watcher.push("Local: http://127.0.0.1:5173/");

    // Um número que aparece na saída de amanhã não pode mudar a porta do botão
    // sem nada ter mudado no processo.
    expect(watcher.result).toBeNull();
    expect(watcher.watching).toBe(false);
  });

  it("para de olhar assim que achou", () => {
    const watcher = new PortWatcher(null, false);

    watcher.push("Local: http://127.0.0.1:5173/");
    watcher.push("Proxy: http://127.0.0.1:9999/");

    expect(watcher.result?.port).toBe(5_173);
  });
});

describe("usesReservedPort", () => {
  it.each([
    ["PORT=$LUMEM_RUN_PORT pnpm dev", true],
    ["./scripts/workspace/run.sh", false],
    ["pnpm dev --port ${LUMEM_RUN_PORT}", true],
  ])("%j → %s", (command, expected) => {
    expect(usesReservedPort(command)).toBe(expected);
  });
});
