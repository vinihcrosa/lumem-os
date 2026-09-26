import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { CLAUDE_ADAPTER, CODEX_ADAPTER, type AdapterSpec } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { adaptersDir } from "./adapter-command.js";
import { adapterBinaryPath, adapterDir, installedAdapterVersion } from "./install-adapter.js";

/**
 * O contrato da conta com o pino, contra os binários de verdade (`034` T7).
 *
 * O [ADR de 2026-09-26](../../../../docs/adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)
 * faz do nome da variável de conta um contrato com o adaptador: uma versão nova
 * que o mude quebra contas **sem nada falhar alto** — a conta 2 subiria no
 * diretório padrão, logada na conta 1. Este é o teste que fica vermelho antes.
 * Ele refaz as leituras do §2.2 e do §3.1 do estudo, e não gasta token: `auth
 * status` e `login status` não falam com modelo nenhum.
 *
 * **Tudo em diretório temporário, inclusive o `HOME`.** Rodar o Claude com a
 * variável apontando para o `~/.claude` real cria um `~/.claude/.claude.json`, e
 * com um nome de variável errado ele cairia no `HOME` — que aqui é descartável.
 * O ambiente é mínimo (`HOME`, `USER`, `TMPDIR`, e um `PATH` com o `node`): nada
 * do ambiente de quem roda vaza para dentro.
 *
 * Roda quando o adaptador está instalado **no pino** num diretório de estado
 * deste usuário, e pula dizendo onde procurou quando não está.
 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** Onde o daemon deste usuário instala: o do ambiente, o de produção e o de dev. */
const STATE_DIRS = [
  process.env["LUMEM_STATE_DIR"],
  join(homedir(), ".lumem"),
  join(homedir(), ".lumem-dev", "shared"),
].filter((dir): dir is string => dir !== undefined && dir !== "");

/** A cópia gerenciada **no pino**, ou `null` — uma cópia de outra versão não é o contrato. */
function pinnedInstall(spec: AdapterSpec): { binary: string; root: string } | null {
  for (const stateDir of STATE_DIRS) {
    const binary = adapterBinaryPath(adaptersDir(stateDir), spec);
    const root = adapterDir(adaptersDir(stateDir), spec);
    if (existsSync(binary) && installedAdapterVersion(root, spec) === spec.pinnedVersion) {
      return { binary, root };
    }
  }
  return null;
}

/** Roda com o ambiente mínimo, mais o que o caso pede. */
function run(command: string, args: readonly string[], extra: Record<string, string>) {
  const home = scratch("lumem-pin-home-");
  const result = spawnSync(command, [...args], {
    env: {
      HOME: home,
      USER: process.env["USER"] ?? "lumem",
      TMPDIR: tmpdir(),
      PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
      ...extra,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

const claude = pinnedInstall(CLAUDE_ADAPTER);
const codex = pinnedInstall(CODEX_ADAPTER);
const where = STATE_DIRS.map((dir) => join(dir, "adapters")).join(", ");

describe.skipIf(claude === null)(`${CLAUDE_ADAPTER.label} ${CLAUDE_ADAPTER.pinnedVersion}`, () => {
  it(`--cli auth status lê a conta de ${CLAUDE_ADAPTER.accountEnv}, e não do HOME`, () => {
    const account = scratch("lumem-pin-claude-");

    const { output } = run(claude!.binary, ["--cli", "auth", "status"], {
      [CLAUDE_ADAPTER.accountEnv!]: account,
    });
    const status = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)) as {
      loggedIn: boolean;
      projectsDirectory: string;
    };

    // Diretório novo é CLI recém-instalado: sem login.
    expect(status.loggedIn).toBe(false);
    // E é **este** diretório: com a variável ignorada, as conversas iriam
    // para o `HOME` — e o `session/load` de uma conta não as acharia.
    expect(status.projectsDirectory.startsWith(`${account}${sep}`)).toBe(true);
  });
});

describe.skipIf(codex === null)(`${CODEX_ADAPTER.label} ${CODEX_ADAPTER.pinnedVersion}`, () => {
  it(`login status lê a conta de ${CODEX_ADAPTER.accountEnv}, e não do HOME`, () => {
    // O binário do CLI **de dentro** do adaptador, pelo `bin` do pacote do
    // `runtime` — o mesmo que o adaptador executa, e não um `codex` do PATH.
    const runtime = join(codex!.root, "node_modules", ...CODEX_ADAPTER.runtime!.split("/"));
    const bin = (JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    }).bin;
    const binary = join(codex!.root, "node_modules", ".bin", Object.keys(bin)[0]!);
    // O Codex recusa um `CODEX_HOME` que não existe — medido: o `connect` cria
    // o diretório antes de qualquer processo.
    const account = scratch("lumem-pin-codex-");
    mkdirSync(account, { recursive: true });

    const { output } = run(binary, ["login", "status"], { [CODEX_ADAPTER.accountEnv!]: account });

    expect(output).toContain("Not logged in");
    // E o processo escreveu **neste** diretório: com a variável ignorada, ele
    // teria escrito no `~/.codex` do `HOME` e este ficaria vazio.
    expect(readdirSync(account)).not.toEqual([]);
  });
});

/*
 * O `describe` invertido, como o do `AcpManager.codex.integration.test.ts`: uma
 * suíte que abandona em silêncio a única prova de mundo real fica idêntica a
 * uma que tem essa prova.
 */
const missing = [
  ...(claude === null ? [CLAUDE_ADAPTER] : []),
  ...(codex === null ? [CODEX_ADAPTER] : []),
].map((spec) => `${spec.label} ${spec.pinnedVersion}`);

describe.skipIf(missing.length === 0)("o contrato com o pino", () => {
  it.skip(`pulado: ${missing.join(" e ")} não está instalado em ${where}`, () => {});
});
