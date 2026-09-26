import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Todo `spawn` de adaptador passa pelo resolvedor por conta (`034` T5).
 *
 * O `memory/capture.ts` spawnava `config.command` cru desde a PR 07, **por fora**
 * do resolvedor que o ADR de 2026-09-08 fez valer em todo o resto — e ninguém
 * notou por três features, porque nada falha: a destilação sobe, só que na cópia
 * errada e, com contas, na conta errada. Um caminho novo que spawnasse direto
 * repetiria isso em silêncio; este teste é o que o faz ficar vermelho.
 *
 * Estático de propósito: a pergunta é *"quem chama"*, e nenhum teste de
 * comportamento de um caminho enxerga o caminho que ainda não existe.
 */

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Um arquivo que chama `spawn`/`resume` e o que ele tem que conter para passar. */
const RESOLVED_SITES: Readonly<Record<string, string>> = {
  // O store recebe a invocação pronta no `start` (quem resolve é o
  // `startAgentSession`) e resolve a da linha no `resume`.
  "sessions/SessionStore.ts": "resolveInvocation",
  "memory/capture.ts": "adapterInvocationFor",
  "memory/auto-learn.ts": "adapterInvocationFor",
};

/*
 * `probe` e `authenticate` passam a receber a conta na T6 (`034`): até lá eles
 * sobem a conta que já existia, sem variável, e é isso que a lista diz.
 */
const PROBE_AND_LOGIN_SITES = new Set(["bootstrap.ts", "routers/setup.ts", "setup/agent-auth.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) return [];
    // O dublê do adaptador é quem **responde** o protocolo, não quem lança.
    if (path.includes(`${join("src", "testing")}`)) return [];
    return [path];
  });
}

function callSites(pattern: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of sourceFiles(SRC)) {
    const text = readFileSync(path, "utf8");
    if (pattern.test(text)) found.set(relative(SRC, path), text);
  }
  return found;
}

describe("quem lança um adaptador", () => {
  it("todo `spawn`/`resume` de sessão ACP resolve a invocação pela conta", () => {
    const sites = callSites(/\bacpManager\.(spawn|resume)\(/);

    expect([...sites.keys()].sort()).toEqual(Object.keys(RESOLVED_SITES).sort());
    for (const [file, text] of sites) {
      expect(text, `${file} lança adaptador sem passar pelo resolvedor`).toContain(
        RESOLVED_SITES[file],
      );
    }
  });

  it("`probe` e `authenticate` só nos lugares que a T6 vai apontar para a conta", () => {
    const sites = callSites(/\bacpManager\s*\.(probe|authenticate)\(|\.acpManager\.probe\(|\n\s*\.authenticate\(/);

    expect([...sites.keys()].sort()).toEqual([...PROBE_AND_LOGIN_SITES].sort());
  });
});
