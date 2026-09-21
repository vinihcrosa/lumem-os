import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A exaustividade de `LumemEvent` do lado do servidor (`032` T8).
 *
 * O `events.emit(...)` já é tipado por `LumemEvent` (de `@lumem/shared`), então
 * um `type` que a união não conhece já é erro de `tsc`. Este teste prova o
 * mesmo em execução — por texto, não por parser, no molde do
 * `architecture.test.ts` do `web` — para que rodar `vitest` sem `tsc` também
 * pegue um `emit` cujo `type` não é (mais) uma variante do `shared`.
 */

const SRC = join(import.meta.dirname);

/** As variantes de `LumemEvent`, hoje. Mesma lista que `events.ts` reexporta. */
const KNOWN_TYPES = [
  "workspace.changed",
  "project.changed",
  "worktree.changed",
  "pr.changed",
  "session.changed",
  "task.changed",
] as const;

function collectEmittedTypes(): readonly { path: string; type: string }[] {
  const found: { path: string; type: string }[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;
      const text = readFileSync(full, "utf8");
      // `events` ou `ctx.events`, nunca `this.emit` (o `AcpManager` emite
      // `AcpEvent`, outra união) nem o `emit` de progresso do clone.
      for (const match of text.matchAll(/\bevents\??\.emit\(\s*\{([\s\S]*?)\}\s*\)/g)) {
        const typeMatch = /type:\s*"([a-zA-Z.]+)"/.exec(match[1]!);
        if (typeMatch) found.push({ path, type: typeMatch[1]! });
      }
    }
  };
  walk(SRC, "");
  return found;
}

describe("todo events.emit usa uma variante de LumemEvent", () => {
  it("nenhum type emitido está fora da lista conhecida", () => {
    const emitted = collectEmittedTypes();
    // A lista não pode ficar vazia — senão o regex parou de achar os
    // call sites de verdade, e o teste passaria por não checar nada.
    expect(emitted.length).toBeGreaterThan(10);

    const problems = emitted
      .filter((e) => !KNOWN_TYPES.includes(e.type as (typeof KNOWN_TYPES)[number]))
      .map((e) => `${e.path} emite "${e.type}", que não é variante de LumemEvent`);
    expect(problems.join("\n")).toBe("");
  });
});
