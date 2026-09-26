import { existsSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS, ADAPTERS_DIR_NAME, adapterById, type AdapterSpec } from "@lumem/shared";

import { DomainError } from "../errors.js";
import { adapterBinaryPath } from "./install-adapter.js";

/**
 * Which copy of an adapter this daemon launches — the one it installed, or none.
 *
 * One function, because there used to be two answers to one question and they
 * disagreed. `setup.ts` preferred the managed copy and fell back to the PATH;
 * `session.ts` read an absolute path frozen into `agent_config.command` on the day
 * the row was written. Neither consulted the pin at launch time, and the result was
 * nine days of sessions on `claude-agent-acp@0.40.0` while `pinnedVersion` said
 * `0.75.1` — no Opus 5 offered, `Custom model` where Fable 5.1 belongs, and one
 * session reporting a 200K window under a label that read *"1M context"*.
 *
 * The decision, with the measurements: [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 * The rule it states is that the PATH never participates in *which adapter*, and
 * this module is where that is true or not true.
 *
 * What still comes from the PATH, and is a different question: `npm`, which
 * installs, and the child process's own environment — measured, with only `node`
 * on the PATH a turn dies with `Authentication required`, and adding
 * `/usr/bin/security` (the macOS keychain) makes the same turn close in `end_turn`.
 * An adapter needs a usable PATH. It does not need the PATH to say who it is.
 */

/** `<stateDir>/adapters` — the directory that holds one per spec. */
export function adaptersDir(stateDir: string): string {
  return join(stateDir, ADAPTERS_DIR_NAME);
}

/**
 * The managed binary of a spec, or a refusal naming where it should be.
 *
 * A refusal and never `spec.command`: a bare name is resolved by the PATH, which is
 * exactly the provenance that is no longer allowed to decide. The sentence names the
 * pin because "install it" without a version is the mistake the A12 already refused
 * once, on the screen that offered a copyable `npm i -g` with no `@version`.
 */
export function adapterCommandFor(spec: AdapterSpec, stateDir: string): string {
  const managed = adapterBinaryPath(adaptersDir(stateDir), spec);
  if (!existsSync(managed)) {
    throw new DomainError(
      "NOT_FOUND",
      `o adaptador de ${spec.label} não está instalado neste daemon: esperado em ${managed}. ` +
        `Uma cópia no PATH não serve — o Lumem lança a que ele mesmo instalou, no ${spec.pinnedVersion}`,
    );
  }
  return managed;
}

/** The fields of an `agent_config` row this resolution actually reads. */
export interface AdapterConfigRef {
  name: string;
  command: string;
}

/**
 * What to launch for a configuration row.
 *
 * Two cases, and separating them is the whole content of this function. The first
 * version collapsed them and it was wrong: it refused any row whose name is not in
 * the catalogue, which is not what the decision forbids and which broke 25 e2e specs
 * that drive a deliberately-named fake adapter.
 *
 * There used to be a third, first: a PTY row came back untouched, because a shell
 * is not an adapter. Since the [ADR de
 * 2026-09-24](../../../../docs/adr/2026-09-24-1620-agent-is-always-acp.md) every
 * configuration is one, and the rows that were PTY are retired — refused before
 * anyone asks what they would launch.
 *
 * **A catalogued id** always resolves to the managed copy, and the stored `command`
 * is *ignored*. This is the case that broke: the row on this machine said
 * `name: "claude"` with `command: "/…/nvm/…/bin/claude-agent-acp"`, resolved on
 * 2026-08-30 and never revisited, because `agentConfig` has no `update`. Matching on
 * `command` instead of `name` would find nothing — the column holds an absolute path
 * on every machine that ran the product before this — which is why the match is by
 * id. Both creation paths write it that way (`AgentLogin` passes `spec.id`, and the
 * onboarding's `SETUP_AGENT_NAME` is the literal `"claude"`).
 *
 * **An uncatalogued name** keeps its own command, and only if that command is an
 * absolute path. Someone pointing the daemon at a specific binary — a locally built
 * adapter, an agent not yet catalogued, the e2e's fake — is naming exactly one file,
 * and that is not the thing being forbidden: what the [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
 * forbids is *the PATH choosing*. A **bare name** is the PATH choosing, so it is
 * refused here rather than handed to the OS to resolve however it likes today.
 */
export function adapterCommandForConfig(config: AdapterConfigRef, stateDir: string): string {
  const spec = adapterById(config.name);
  if (spec !== null) return adapterCommandFor(spec, stateDir);

  if (!config.command.startsWith("/")) {
    throw new DomainError(
      "NOT_FOUND",
      `a configuração "${config.name}" tem o comando "${config.command}", que é ` +
        `um nome e não um caminho — quem escolheria o binário é o PATH, e adaptador não vem do PATH. ` +
        `Use um id do catálogo, ou o caminho absoluto do adaptador`,
    );
  }
  return config.command;
}

/**
 * Which catalogued adapter a configuration row **is**, or `null` for one the
 * catalogue does not own.
 *
 * The inverse of `adapterCommandForConfig`, and asked by whoever writes the
 * adapter catalogue: its entries are keyed by `adapterId`, and a row's name is
 * only that id when someone chose it to be. A row named `my-claude` pointing at
 * the managed `claude-agent-acp` is Claude; a row named anything pointing at a
 * binary the daemon did not install is nobody's, and writing it into the
 * catalogue would draw a `my-claude · não instalado` group that can never be
 * chosen.
 */
export function catalogedAdapterOf(config: AdapterConfigRef, stateDir: string): AdapterSpec | null {
  return adapterById(config.name) ?? catalogedAdapterAt(config.command, stateDir);
}

/** The spec whose managed binary is exactly `command`, or `null`. */
export function catalogedAdapterAt(command: string, stateDir: string): AdapterSpec | null {
  return ADAPTERS.find((spec) => adapterBinaryPath(adaptersDir(stateDir), spec) === command) ?? null;
}

/** Os campos de uma `agent_account` que a invocação lê. */
export interface AccountRef {
  id: string;
  agentConfigId: string;
  kind: string;
  configDir: string | null;
  state: string;
}

/** Os campos de uma `agent_config` que a invocação lê. */
export interface InvocationConfigRef extends AdapterConfigRef {
  id: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
}

/** O que lançar, e com que ambiente — a conta traduzida para um processo. */
export interface AdapterInvocation {
  command: string;
  args: readonly string[];
  env: Record<string, string>;
  /** O que o processo **não** herda do daemon: a variável de conta ausente. */
  unsetEnv: readonly string[];
}

/** Onde o cofre guarda a chave de uma conta `api_key` (ADR de 2026-09-13-1730). */
export function agentAccountSecretId(accountId: string): string {
  return `agent-account:${accountId}`;
}

/**
 * O ambiente de uma conta, sem decidir se ela pode subir.
 *
 * Separado de `adapterInvocationFor` porque o login e a conferência da T6 sobem
 * justamente a conta que ainda está `disconnected` — é conectando que ela deixa
 * de estar.
 *
 * - **Com diretório**: a variável da spec aponta para ele;
 * - **sem diretório**: a variável fica **ausente** — tirada do env da
 *   configuração e do que o daemon herdou. É a primeira conta do ADR de
 *   2026-09-26: escrever o caminho padrão faria o Claude procurar outra entrada
 *   do Keychain, e a conta de hoje apareceria deslogada;
 * - **de chave**: o valor sai do cofre para o **primeiro** nome do `apiKeyEnv`.
 *   O primeiro porque é o que o adaptador documenta; pôr nos dois seria o Lumem
 *   decidindo precedência entre variáveis de um CLI que não é dele. Os outros
 *   nomes não vêm do daemon: a conta é cobrada pela chave **dela** (Q11).
 *
 * E a chave de API do daemon (Q11): uma conta **de assinatura com diretório**
 * não a herda — um `ANTHROPIC_API_KEY` exportado no terminal que subiu o Lumem
 * faria o Claude cobrar por token numa conta conectada por assinatura. A
 * primeira conta continua herdando: é como ela é cobrada hoje, e mudar isso
 * trocaria a forma de cobrança de quem já usa o produto sem ninguém pedir.
 */
export function accountEnvFor(
  spec: AdapterSpec | null,
  account: AccountRef,
  base: Readonly<Record<string, string>>,
  secrets: { read(id: string): string | null },
): { env: Record<string, string>; unsetEnv: readonly string[] } {
  const variable = spec?.accountEnv ?? null;
  if (variable === null && account.configDir !== null) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "este agente não tem mais de uma conta: o Lumem não sabe em que variável dizer o diretório dela",
    );
  }

  const env: Record<string, string> = { ...base };
  const unsetEnv: string[] = [];
  const absent = (name: string) => {
    delete env[name];
    unsetEnv.push(name);
  };
  if (variable !== null) {
    if (account.configDir === null) absent(variable);
    else env[variable] = account.configDir;
  }

  const keyNames = spec?.apiKeyEnv ?? [];
  if (account.kind === "api_key") {
    const key = secrets.read(agentAccountSecretId(account.id));
    const [name, ...others] = keyNames;
    if (key === null || name === undefined) {
      throw new DomainError(
        "NOT_FOUND",
        "a chave desta conta não está no cofre do Lumem — conecte a conta de novo",
      );
    }
    env[name] = key;
    others.forEach(absent);
  } else if (account.configDir !== null) {
    keyNames.forEach(absent);
  }
  return { env, unsetEnv };
}

/**
 * O que lançar para uma conta de um agente (`034` T5): comando, argumentos e
 * ambiente, resolvidos **agora**.
 *
 * Todo caminho que sobe um adaptador para trabalhar passa por aqui — a sessão
 * nova, a retomada, a destilação e a pesquisa —, e o `adapter-invocation-sites`
 * é o teste que cobra isso. O comando continua sendo o da regra do ADR de
 * 2026-09-08; a conta é ambiente do `spawn`, resolvido junto, pela mesma razão.
 */
export function adapterInvocationFor({
  config,
  account,
  stateDir,
  secrets,
}: {
  config: InvocationConfigRef;
  account: AccountRef;
  stateDir: string;
  secrets: { read(id: string): string | null };
}): AdapterInvocation {
  if (account.agentConfigId !== config.id) {
    throw new DomainError("INVALID_ARGUMENT", "esta conta é de outro agente");
  }
  // A conversa mora no diretório da conta, e o login dela foi desfeito: subir
  // ali é subir deslogado. Antes do `spawn`, com o que fazer (Q8).
  if (account.state === "disconnected") {
    throw new DomainError("BLOCKED", "esta conta foi desconectada — reconecte a conta para usá-la");
  }

  const command = adapterCommandForConfig(config, stateDir);
  const spec = catalogedAdapterOf(config, stateDir);
  return { command, args: [...config.args], ...accountEnvFor(spec, account, config.env, secrets) };
}
