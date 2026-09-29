import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { createLogSink } from "./log-file.js";

function dir(): string {
  return mkdtempSync(join(tmpdir(), "lumem-log-"));
}

describe("o log do daemon em arquivo", () => {
  it("escreve cada linha no arquivo e no stdout", () => {
    const file = join(dir(), "logs", "daemon.log");
    const echoed: string[] = [];
    const sink = createLogSink({ file, echo: { write: (line: string) => echoed.push(line) } });
    sink.write('{"msg":"um"}\n');
    sink.write('{"msg":"dois"}\n');
    expect(readFileSync(file, "utf8")).toBe('{"msg":"um"}\n{"msg":"dois"}\n');
    expect(echoed).toEqual(['{"msg":"um"}\n', '{"msg":"dois"}\n']);
  });

  it("passando do teto, rotaciona para `.1` e guarda um", () => {
    const file = join(dir(), "daemon.log");
    const sink = createLogSink({ file, maxBytes: 20, echo: { write: () => undefined } });
    sink.write("0123456789\n"); // 11
    sink.write("abcdefghij\n"); // 22 > 20: rotaciona antes
    sink.write("ABCDEFGHIJ\n"); // 22 > 20: rotaciona de novo, o `.1` anterior some
    expect(readFileSync(`${file}.1`, "utf8")).toBe("abcdefghij\n");
    expect(readFileSync(file, "utf8")).toBe("ABCDEFGHIJ\n");
  });

  it("sem `LUMEM_LOG_FILE`, não há arquivo — o daemon instalado não escreve o que ninguém pediu", () => {
    expect(loadConfig({ LUMEM_STATE_DIR: dir() }).logFile).toBeNull();
  });

  it("com `LUMEM_LOG_FILE`, o caminho vem absoluto", () => {
    const state = dir();
    const config = loadConfig({ LUMEM_STATE_DIR: state, LUMEM_LOG_FILE: join(state, "daemon.log") });
    expect(config.logFile).toBe(join(state, "daemon.log"));
    expect(existsSync(join(state, "daemon.log"))).toBe(false);
  });
});
