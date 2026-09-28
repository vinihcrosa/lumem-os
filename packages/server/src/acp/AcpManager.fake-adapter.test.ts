import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { AcpManager } from "./AcpManager.js";

/**
 * O probe contra o fake do e2e, por processo de verdade (`034` T6).
 *
 * O fake é o adaptador que toda a suíte de e2e sobe, e ele precisa reproduzir o
 * `0.75.1` no que a T6 muda: o `session/new` **fecha sem credencial**, e quem diz
 * se há login é o `--cli auth status`. Sem este teste, o fake poderia continuar
 * respondendo "logado" sempre e o e2e nunca exercitaria a conferência.
 *
 * O caminho é lido por arquivo — invisível ao `--changed` do `gate:quick` quando
 * só o fake muda. A suíte inteira do server o roda.
 */

const FAKE = fileURLToPath(new URL("../../../../e2e/support/fake-acp-agent.mjs", import.meta.url));
const dirs: string[] = [];
const managers: AcpManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** O mesmo shim do `e2e/support/fixtures.ts`: o binário com o nome do adaptador. */
function shim(): string {
  const bin = scratch("lumem-fake-bin-");
  const file = join(bin, "claude-agent-acp");
  writeFileSync(file, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} "$@"\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("o fake do e2e reproduz o 0.75.1", () => {
  it("numa conta sem login, o `session/new` fecha e o probe diz `loggedIn: false`", async () => {
    const manager = new AcpManager({ isAvailable: () => true });
    managers.push(manager);
    const account = scratch("lumem-conta-");

    const report = await manager.probe(
      { command: shim(), cwd: scratch("lumem-probe-"), env: { CLAUDE_CONFIG_DIR: account } },
      { identity: "cli-auth-status" },
    );

    expect(report.acpSessionId).not.toBe("");
    expect(report).toMatchObject({ loggedIn: false, authRequired: true, identity: null });
  });

  it("depois do login naquele diretório, a mesma conta confere com e-mail e plano", async () => {
    const manager = new AcpManager({ isAvailable: () => true });
    managers.push(manager);
    const account = scratch("lumem-conta-");
    mkdirSync(account, { recursive: true });
    writeFileSync(join(account, ".fake-logged-in"), "");

    const report = await manager.probe(
      { command: shim(), cwd: scratch("lumem-probe-"), env: { CLAUDE_CONFIG_DIR: account } },
      { identity: "cli-auth-status" },
    );

    expect(report.loggedIn).toBe(true);
    expect(report.identity?.email).toEqual(expect.any(String));
  });
});
