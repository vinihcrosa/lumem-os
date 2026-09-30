import { describe, expect, it } from "vitest";

import { HELP, parseCommand } from "./args.js";

describe("parseCommand", () => {
  it("sem argumento nenhum, sobe", () => {
    expect(parseCommand([])).toEqual({
      kind: "start",
      port: null,
      host: null,
      stateDir: null,
      open: false,
    });
  });

  it("aceita `start` explícito, que é a forma que sobrevive ao `stop`", () => {
    // D2: hoje só existe um verbo. A forma existe para que o dia em que existir
    // `lumem stop` não seja o dia em que todo mundo reaprende o comando.
    expect(parseCommand(["start"])).toMatchObject({ kind: "start" });
  });

  it("no verb is start, and run takes the foreground options", () => {
    const start = { kind: "start", port: null, host: null, stateDir: null, open: false };
    expect(parseCommand([])).toEqual(start);
    expect(parseCommand(["start"])).toEqual(start);

    expect(parseCommand(["run"])).toEqual({ ...start, kind: "run" });
    expect(
      parseCommand(["run", "--port", "5000", "--host", "0.0.0.0", "--state-dir", "/tmp/x", "--open"]),
    ).toEqual({ kind: "run", port: 5_000, host: "0.0.0.0", stateDir: "/tmp/x", open: true });
    // `start` escreve estas mesmas opções no arquivo de serviço.
    expect(parseCommand(["start", "-p", "5000", "--open"])).toEqual({
      ...start,
      port: 5_000,
      open: true,
    });
  });

  it("lê stop, status e logs, com as opções que dizem onde o Lumem está", () => {
    const where = { port: null, host: null, stateDir: null };
    expect(parseCommand(["stop"])).toEqual({ kind: "stop", ...where });
    expect(parseCommand(["status", "--port", "5000"])).toEqual({ kind: "status", ...where, port: 5_000 });
    expect(parseCommand(["logs"])).toEqual({ kind: "logs", ...where, follow: false });
    expect(parseCommand(["logs", "-f", "--state-dir", "/tmp/x"])).toEqual({
      kind: "logs",
      ...where,
      stateDir: "/tmp/x",
      follow: true,
    });
  });

  it("recusa -f fora do logs", () => {
    expect(parseCommand(["status", "-f"]).kind).toBe("invalid");
  });

  it("lê porta, host e state dir", () => {
    expect(parseCommand(["--port", "5000", "--host", "0.0.0.0", "--state-dir", "/tmp/x"])).toEqual({
      kind: "start",
      port: 5_000,
      host: "0.0.0.0",
      stateDir: "/tmp/x",
      open: false,
    });
    expect(parseCommand(["-p", "5000"])).toMatchObject({ port: 5_000 });
  });

  it("recusa porta que não é porta", () => {
    for (const raw of ["abc", "4317a", "70000", "-1"]) {
      const command = parseCommand(["--port", raw]);

      expect(command.kind, raw).toBe("invalid");
    }
  });

  it("recusa argumento desconhecido, nomeando ele", () => {
    const command = parseCommand(["--porta", "5000"]);

    expect(command.kind).toBe("invalid");
    expect(command.kind === "invalid" && command.message).toContain("--porta");
  });

  it("recusa comando desconhecido", () => {
    expect(parseCommand(["parar"])).toEqual({ kind: "invalid", message: "comando desconhecido: parar" });
  });

  it("responde help e version pelas duas formas", () => {
    expect(parseCommand(["help"])).toEqual({ kind: "help" });
    expect(parseCommand(["--help"])).toEqual({ kind: "help" });
    expect(parseCommand(["-h"])).toEqual({ kind: "help" });
    expect(parseCommand(["version"])).toEqual({ kind: "version" });
    expect(parseCommand(["--version"])).toEqual({ kind: "version" });
    expect(parseCommand(["-v"])).toEqual({ kind: "version" });
  });

  it("lê upgrade, com e sem --check", () => {
    expect(parseCommand(["upgrade"])).toEqual({ kind: "upgrade", check: false });
    expect(parseCommand(["upgrade", "--check"])).toEqual({ kind: "upgrade", check: true });
  });

  it("lê menubar install, open e uninstall, com as opções que dizem onde o Lumem está", () => {
    const where = { port: null, host: null, stateDir: null };
    for (const action of ["install", "open", "uninstall"] as const) {
      expect(parseCommand(["menubar", action])).toEqual({ kind: "menubar", action, ...where });
    }
    expect(parseCommand(["menubar", "install", "--port", "5000"])).toEqual({
      kind: "menubar",
      action: "install",
      ...where,
      port: 5_000,
    });
  });

  it("recusa menubar sem ação ou com uma que não existe", () => {
    expect(parseCommand(["menubar"])).toMatchObject({ kind: "invalid" });
    expect(parseCommand(["menubar", "abrir"])).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("abrir"),
    });
    expect(parseCommand(["menubar", "install", "outra"]).kind).toBe("invalid");
  });

  it("o help cita todo verbo, e o run como o primeiro plano", () => {
    // Comando que não está no help é comando que ninguém descobre.
    for (const verb of ["upgrade", "start", "run", "stop", "status", "logs", "menubar install", "menubar open", "menubar uninstall"]) {
      expect(HELP, verb).toContain(`lumem ${verb}`);
    }
    expect(HELP).toMatch(/lumem run .*primeiro plano/);
  });
});
