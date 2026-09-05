import { describe, expect, it } from "vitest";

import { parseCommand } from "./args.js";

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
});
