import { beforeEach, describe, expect, it, vi } from "vitest";

import { run, type RunDeps } from "./run.js";

let out: string[];
let err: string[];

function deps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
    version: "0.1.0",
    startDaemon: vi.fn(async () => {}),
    probe: async () => ({ kind: "free" }),
    open: vi.fn(() => true),
    ...overrides,
  };
}

beforeEach(() => {
  out = [];
  err = [];
});

describe("lumem", () => {
  it("sobe o daemon e imprime o endereço antes de qualquer log", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run([], deps({ startDaemon }))).toBe(0);

    expect(startDaemon).toHaveBeenCalledOnce();
    expect(out[0]).toBe("Lumem v0.1.0 — http://127.0.0.1:4317");
  });

  it("passa porta, host e state dir para o daemon pelo ambiente", async () => {
    // É assim que o daemon lê configuração — no load do módulo, uma vez. Escrever
    // depois do import não teria efeito nenhum.
    const env: NodeJS.ProcessEnv = {};
    const startDaemon = vi.fn(async () => {
      expect(env["LUMEM_PORT"]).toBe("5000");
      expect(env["LUMEM_HOST"]).toBe("127.0.0.1");
      expect(env["LUMEM_STATE_DIR"]).toBe("/tmp/lumem");
    });

    await run(["--port", "5000", "--state-dir", "/tmp/lumem"], deps({ env, startDaemon }));

    expect(startDaemon).toHaveBeenCalledOnce();
  });

  it("com um Lumem já na porta, aponta para ele e não sobe um segundo", async () => {
    // Dois daemons no mesmo ~/.lumem são dois escritores no mesmo SQLite.
    const startDaemon = vi.fn(async () => {});
    const probe = async () => ({ kind: "lumem" as const, version: "0.1.0" });

    expect(await run([], deps({ startDaemon, probe }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(out[0]).toContain("já tem um Lumem em http://127.0.0.1:4317");
  });

  it("com outra coisa na porta, falha dizendo o que fazer", async () => {
    const startDaemon = vi.fn(async () => {});
    const probe = async () => ({ kind: "other" as const });

    expect(await run([], deps({ startDaemon, probe }))).toBe(1);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--port");
  });

  it("nunca escolhe outra porta sozinho", async () => {
    // URL que muda é URL que ninguém guarda (D3).
    const probe = async () => ({ kind: "other" as const });

    await run([], deps({ probe }));

    expect(out.join("\n")).not.toContain("4318");
  });

  it("--open abre o navegador, e só com ele", async () => {
    const open = vi.fn(() => true);

    await run([], deps({ open }));
    expect(open).not.toHaveBeenCalled();

    await run(["--open"], deps({ open }));
    expect(open).toHaveBeenCalledWith({ url: "http://127.0.0.1:4317" });
  });

  it("--open com um Lumem já de pé abre o que já existe", async () => {
    const open = vi.fn(() => true);
    const probe = async () => ({ kind: "lumem" as const, version: "0.1.0" });

    await run(["--open"], deps({ open, probe }));

    expect(open).toHaveBeenCalledWith({ url: "http://127.0.0.1:4317" });
  });

  it("argumento desconhecido sai com 2, sem subir nada", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run(["--porta", "1"], deps({ startDaemon }))).toBe(2);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(err[0]).toContain("--porta");
  });

  it("help e version não sobem daemon", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run(["help"], deps({ startDaemon }))).toBe(0);
    expect(await run(["version"], deps({ startDaemon }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(out[1]).toBe("0.1.0");
  });
});
