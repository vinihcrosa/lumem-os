import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { accountDirFor, inheritInto, isInsideAgentsDir } from "./account-connect.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("accountDirFor", () => {
  it("mora em `_system/agents/<agente>/<conta>`, fora do git (ADR de 2026-09-26)", () => {
    expect(accountDirFor("/estado", "claude", "acct-1")).toBe("/estado/_system/agents/claude/acct-1");
  });

  it("só reconhece como apagável o que está dentro de `_system/agents/`", () => {
    // O `purge` faz `rm -rf`: um `config_dir` adulterado para `~` não pode passar.
    expect(isInsideAgentsDir("/estado", "/estado/_system/agents/claude/acct-1")).toBe(true);
    expect(isInsideAgentsDir("/estado", "/estado/_system/agents")).toBe(false);
    expect(isInsideAgentsDir("/estado", "/estado/_system/agents/../../..")).toBe(false);
    expect(isInsideAgentsDir("/estado", "/Users/alguem")).toBe(false);
  });
});

describe("inheritInto (Q10)", () => {
  it("liga por link o que existe no diretório padrão, e pula o que não existe", () => {
    const home = scratch("lumem-home-");
    const source = join(home, ".claude");
    mkdirSync(join(source, "plugins"), { recursive: true });
    writeFileSync(join(source, "settings.json"), "{}");
    const account = scratch("lumem-conta-");

    const result = inheritInto({ spec: CLAUDE_ADAPTER, home, accountDir: account });

    expect(result.linked).toEqual(["settings.json", "plugins"]);
    expect(result.copied).toEqual([]);
    expect(readlinkSync(join(account, "settings.json"))).toBe(join(source, "settings.json"));
    expect(lstatSync(join(account, "plugins")).isSymbolicLink()).toBe(true);
    // A identidade nunca: nenhum `.claude.json` foi parar na conta.
    expect(() => lstatSync(join(account, ".claude.json"))).toThrow();
  });

  it("diz em voz alta o que não é herdado", () => {
    const result = inheritInto({ spec: CLAUDE_ADAPTER, home: scratch("h-"), accountDir: scratch("c-") });

    expect(result.notInherited).toEqual(CLAUDE_ADAPTER.notInherited);
    expect(result.notInherited.length).toBeGreaterThan(0);
  });

  it("um `config.toml` que pede outro armazenamento de credencial é copiado sem a chave", () => {
    /*
     * O ponto não medido da Q10: o `config.toml` do Codex pode trazer um
     * `cli_auth_credentials_store`, e ligá-lo arrastaria a credencial da conta
     * nova para o chaveiro da de hoje. Com a chave, cópia filtrada; sem ela, link.
     */
    const home = scratch("lumem-home-");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      'model = "gpt-5.5"\ncli_auth_credentials_store = "keyring"\n[mcp_servers.x]\ncommand = "y"\n',
    );
    const account = scratch("lumem-conta-");

    const result = inheritInto({ spec: CODEX_ADAPTER, home, accountDir: account });

    expect(result.copied).toEqual(["config.toml"]);
    expect(result.linked).not.toContain("config.toml");
    expect(lstatSync(join(account, "config.toml")).isSymbolicLink()).toBe(false);
    const copy = readFileSync(join(account, "config.toml"), "utf8");
    expect(copy).not.toContain("cli_auth_credentials_store");
    expect(copy).toContain('model = "gpt-5.5"');
    expect(copy).toContain("[mcp_servers.x]");
  });

  it("um `config.toml` sem a chave é ligado, como o resto", () => {
    const home = scratch("lumem-home-");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), 'model = "gpt-5.5"\n');
    const account = scratch("lumem-conta-");

    const result = inheritInto({ spec: CODEX_ADAPTER, home, accountDir: account });

    expect(result.linked).toEqual(["config.toml"]);
    expect(lstatSync(join(account, "config.toml")).isSymbolicLink()).toBe(true);
  });
});
