import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import type { AdapterSpec } from "@lumem/shared";

/**
 * O diretório de uma conta, e o que ela herda do de hoje (`034` T8).
 *
 * O [ADR de 2026-09-26](../../../../docs/adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md):
 * o Lumem é dono do diretório; o conteúdo é do CLI. Aqui só se cria o lugar e se
 * põe dentro, por link, o que é **comportamento** (Q10) — nunca a identidade.
 */

/** `<stateDir>/_system/agents/<agente>/<conta>` — fora do git pela regra do `_system/`. */
export function accountDirFor(stateDir: string, adapterId: string, accountId: string): string {
  return join(agentsDir(stateDir), adapterId, accountId);
}

function agentsDir(stateDir: string): string {
  return join(stateDir, "_system", "agents");
}

/**
 * `path` é um diretório de conta que o Lumem criou — estritamente **dentro** de
 * `_system/agents/`, depois de resolver `..`. É a guarda do `rm -rf` do `purge`:
 * um `config_dir` adulterado para `~` não passa.
 */
export function isInsideAgentsDir(stateDir: string, path: string): boolean {
  const root = resolve(agentsDir(stateDir));
  return resolve(path).startsWith(`${root}${sep}`);
}

/**
 * A chave que traria um armazenamento de credencial junto com o arquivo.
 *
 * O ponto não medido da Q10: o `config.toml` do Codex pode pedir outro lugar
 * para a credencial (`cli_auth_credentials_store`). Ligado, ele levaria a conta
 * nova para o chaveiro da de hoje — duas contas, uma credencial. Por nome de
 * arquivo, porque é o arquivo que carrega a chave.
 */
const CREDENTIAL_KEYS: Readonly<Record<string, string>> = {
  "config.toml": "cli_auth_credentials_store",
};

/** As linhas que atribuem `key`, fora; o resto do arquivo, intacto. */
function withoutKey(text: string, key: string): string | null {
  const assigns = new RegExp(`^\\s*${key}\\s*=`);
  const lines = text.split("\n");
  const kept = lines.filter((line) => !assigns.test(line));
  return kept.length === lines.length ? null : kept.join("\n");
}

export interface Inheritance {
  /** Ligados por link: mudar lá muda em todas as contas. */
  linked: string[];
  /** Copiados sem a chave de credencial: a conta nasce igual e diverge. */
  copied: string[];
  /** O que não vem, para a tela dizer (`AdapterSpec.notInherited`). */
  notInherited: readonly string[];
}

/**
 * Liga no diretório da conta o que existe em `$HOME/<defaultConfigDir>/`.
 *
 * O que não existe lá não é criado aqui — um link para o nada seria um CLI
 * tropeçando num arquivo que ninguém tem.
 */
export function inheritInto({
  spec,
  home,
  accountDir,
}: {
  spec: AdapterSpec;
  home: string;
  accountDir: string;
}): Inheritance {
  const result: Inheritance = { linked: [], copied: [], notInherited: spec.notInherited };
  if (spec.defaultConfigDir === null) return result;
  const source = join(home, spec.defaultConfigDir);

  for (const item of spec.inheritLinks) {
    const from = join(source, item);
    const to = join(accountDir, item);
    if (!existsSync(from) || existsSync(to)) continue;

    const key = CREDENTIAL_KEYS[item];
    const filtered = key === undefined ? null : withoutKey(readFileSync(from, "utf8"), key);
    if (filtered !== null) {
      writeFileSync(to, filtered, { mode: 0o600 });
      result.copied.push(item);
      continue;
    }

    symlinkSync(from, to);
    result.linked.push(item);
  }
  return result;
}
