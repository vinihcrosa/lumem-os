import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixSpawnHelpers, main, resolveNodePtyRoot } from "./postinstall.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lumem-pty-"));
  mkdirSync(join(root, "prebuilds", "darwin-arm64"), { recursive: true });
  const helper = join(root, "prebuilds", "darwin-arm64", "spawn-helper");
  writeFileSync(helper, "#!/bin/sh\n");
  chmodSync(helper, 0o644);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("o postinstall do pacote", () => {
  it("devolve o bit de execução ao spawn-helper", () => {
    const fixed = fixSpawnHelpers(root);

    expect(fixed).toHaveLength(1);
    expect(statSync(fixed[0] as string).mode & 0o111).toBe(0o111);
  });

  it("é idempotente", () => {
    fixSpawnHelpers(root);

    expect(fixSpawnHelpers(root)).toHaveLength(0);
  });

  it("sem node-pty, não faz nada e não reclama", () => {
    expect(resolveNodePtyRoot(() => {
      throw new Error("Cannot find module");
    })).toBeNull();
    expect(fixSpawnHelpers(null)).toEqual([]);
  });

  it("nunca lança — abortar a instalação seria pior que o problema", () => {
    // D9: um postinstall que estoura aborta o `npm i -g` inteiro. Quem diagnostica
    // terminal que não abre é o preflight da primeira tela, dentro do produto.
    const log = vi.fn();
    const explode = (): string => {
      throw new Error("disco somiu");
    };

    expect(() => main(log)).not.toThrow();
    expect(() => fixSpawnHelpers(resolveNodePtyRoot(explode))).not.toThrow();
  });
});
