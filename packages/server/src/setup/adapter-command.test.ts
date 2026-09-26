import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adapterCommandFor,
  adapterCommandForConfig,
  adapterInvocationFor,
  adaptersDir,
  agentAccountSecretId,
  type AccountRef,
} from "./adapter-command.js";

/**
 * Qual cópia o daemon lança — e o `else` que não existe mais.
 *
 * Cada caso aqui ficou vermelho de propósito contra o código anterior, que devolvia
 * `spec.command` quando não achava a cópia gerenciada. [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-state-"));
  dirs.push(dir);
  return dir;
}

function stageManaged(state: string, spec = CLAUDE_ADAPTER): string {
  const bin = join(adaptersDir(state), spec.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, spec.command), "");
  return join(bin, spec.command);
}

it("devolve a cópia gerenciada quando ela está lá", () => {
  const state = stateDir();
  const managed = stageManaged(state);

  expect(adapterCommandFor(CLAUDE_ADAPTER, state)).toBe(managed);
});

it("recusa nomeando o adaptador, o caminho esperado e o pino", () => {
  /*
   * A frase carrega o pino porque *"instale"* sem versão é o erro que a A12 já
   * recusou uma vez — na tela que oferecia copiar um `npm i -g` sem `@versão`.
   */
  const state = stateDir();

  expect(() => adapterCommandFor(CLAUDE_ADAPTER, state)).toThrow(
    new RegExp(`${CLAUDE_ADAPTER.label}.*${CLAUDE_ADAPTER.pinnedVersion}`, "s"),
  );
  expect(() => adapterCommandFor(CLAUDE_ADAPTER, state)).toThrow(/não serve/);
});

it("nunca devolve o nome nu, mesmo que ele exista no PATH", () => {
  // Este é o `else`. Ele não falhava — servia a versão errada em silêncio, que é
  // como esta máquina passou nove dias no `0.40.0`.
  const state = stateDir();

  expect(() => adapterCommandFor(CLAUDE_ADAPTER, state)).toThrow();
  expect(() => adapterCommandFor(CLAUDE_ADAPTER, state)).not.toThrow(
    new RegExp(`^${CLAUDE_ADAPTER.command}$`),
  );
});

it("resolve por spec e não pelo caminho gravado na linha", () => {
  /*
   * A linha desta máquina, em 2026-08-30: `command` apontando para o
   * `claude-agent-acp` global. Nenhuma instalação gerenciada correta a desalojaria,
   * porque o router de `agentConfig` não tem `update`.
   */
  const state = stateDir();
  const managed = stageManaged(state);

  const resolved = adapterCommandForConfig(
    {
      name: "claude",
      command: "/Users/eu/.nvm/versions/node/v22.17.1/bin/claude-agent-acp",
    },
    state,
  );

  expect(resolved).toBe(managed);
});

it("não devolve mais o comando cru da linha que era PTY", () => {
  /*
   * O ramo que devolvia o comando intocado era o do PTY: um shell não era
   * adaptador. Desde o ADR de 2026-09-24 toda configuração é, e a linha
   * `claude-code` que a semente antiga gravou (`command: "claude"`) é um nome nu —
   * lançá-la seria o PATH escolhendo, que é exatamente o proibido.
   */
  const state = stateDir();

  expect(() =>
    adapterCommandForConfig({ name: "claude-code", command: "claude" }, state),
  ).toThrow(/adaptador não vem do PATH/);
});

it("recusa um nome nu numa linha ACP, porque quem escolheria é o PATH", () => {
  const state = stateDir();
  stageManaged(state);

  expect(() =>
    adapterCommandForConfig({ name: "gemini", command: "gemini-acp" }, state),
  ).toThrow(/adaptador não vem do PATH/);
});

it("deixa passar um caminho absoluto de um agente que o catálogo não tem", () => {
  /*
   * A distinção que a primeira versão desta função colapsou — e que 25 specs de e2e
   * cobraram. Apontar o daemon para **um arquivo** não é o que o ADR proíbe; o que
   * ele proíbe é o **PATH escolher**. Um adaptador compilado à mão, um agente ainda
   * não catalogado e o falso do e2e são todos o primeiro caso.
   */
  const state = stateDir();

  expect(
    adapterCommandForConfig(
      { name: "acp-falso", command: "/usr/local/bin/node" },
      state,
    ),
  ).toBe("/usr/local/bin/node");
});

it("ignora o comando gravado quando o nome é um id do catálogo", () => {
  // Ignora, e não "prefere": um id catalogado não tem outra resposta possível, e é
  // por isso que a linha obsoleta desta máquina não desalojava nada.
  const state = stateDir();
  const managed = stageManaged(state);

  expect(
    adapterCommandForConfig(
      { name: CLAUDE_ADAPTER.id, command: "/opt/outro/claude-agent-acp" },
      state,
    ),
  ).toBe(managed);
});

it("cada spec tem seu próprio diretório", () => {
  // Duas specs num `node_modules` só teriam a segunda instalação decidindo a
  // árvore de dependências da primeira (`second-agent`).
  const state = stateDir();
  stageManaged(state, CODEX_ADAPTER);

  expect(adapterCommandFor(CODEX_ADAPTER, state)).toContain(
    join(ADAPTERS_DIR_NAME, CODEX_ADAPTER.id),
  );
  expect(() => adapterCommandFor(CLAUDE_ADAPTER, state)).toThrow();
});

/*
 * A invocação por conta (`034` T5, ADR de 2026-09-26): a conta chega ao
 * processo como uma variável do CLI, e a primeira conta é a variável ausente.
 */
describe("adapterInvocationFor", () => {
  const CONFIG = {
    id: "cfg-claude",
    name: "claude",
    command: "claude-agent-acp",
    args: ["--flag"],
    env: { FROM_CONFIG: "1" } as Record<string, string>,
  };
  const noSecrets = { read: (): string | null => null };

  function account(overrides: Partial<AccountRef> = {}): AccountRef {
    return {
      id: "acct-1",
      agentConfigId: CONFIG.id,
      kind: "subscription",
      configDir: null,
      state: "connected",
      ...overrides,
    };
  }

  it("conta com diretório: a variável do CLI aponta para ele, junto do env da configuração", () => {
    const state = stateDir();
    const managed = stageManaged(state);

    const invocation = adapterInvocationFor({
      config: CONFIG,
      account: account({ configDir: "/contas/trabalho" }),
      stateDir: state,
      secrets: noSecrets,
    });

    expect(invocation).toEqual({
      command: managed,
      args: ["--flag"],
      env: { FROM_CONFIG: "1", CLAUDE_CONFIG_DIR: "/contas/trabalho" },
      unsetEnv: [],
    });
  });

  it("conta sem diretório: a variável fica ausente — nem no env, nem herdada do daemon", () => {
    // Medido: `CLAUDE_CONFIG_DIR=~/.claude` escrito faz a conta de hoje aparecer
    // deslogada. Ausente quer dizer ausente, inclusive se a configuração a trouxer.
    const state = stateDir();
    stageManaged(state);

    const invocation = adapterInvocationFor({
      config: { ...CONFIG, env: { FROM_CONFIG: "1", CLAUDE_CONFIG_DIR: "/vazou" } },
      account: account(),
      stateDir: state,
      secrets: noSecrets,
    });

    expect(invocation.env).toEqual({ FROM_CONFIG: "1" });
    expect(invocation.unsetEnv).toEqual(["CLAUDE_CONFIG_DIR"]);
  });

  it("usa a variável da spec de cada adaptador", () => {
    const state = stateDir();
    stageManaged(state, CODEX_ADAPTER);

    const invocation = adapterInvocationFor({
      config: { ...CONFIG, name: "codex" },
      account: account({ configDir: "/contas/codex-2" }),
      stateDir: state,
      secrets: noSecrets,
    });

    expect(invocation.env.CODEX_HOME).toBe("/contas/codex-2");
    expect(invocation.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("conta de chave: o cofre entrega a chave no primeiro nome do `apiKeyEnv`", () => {
    const state = stateDir();
    stageManaged(state, CODEX_ADAPTER);
    const read = vi.fn((id: string) => (id === "agent-account:acct-key" ? "sk-conta" : null));

    const invocation = adapterInvocationFor({
      config: { ...CONFIG, name: "codex" },
      account: account({ id: "acct-key", kind: "api_key" }),
      stateDir: state,
      secrets: { read },
    });

    expect(read).toHaveBeenCalledWith(agentAccountSecretId("acct-key"));
    expect(invocation.env.CODEX_API_KEY).toBe("sk-conta");
    expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("conta de chave sem chave no cofre é recusada, e não sobe sem credencial", () => {
    const state = stateDir();
    stageManaged(state);

    expect(() =>
      adapterInvocationFor({
        config: CONFIG,
        account: account({ kind: "api_key" }),
        stateDir: state,
        secrets: noSecrets,
      }),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("conta desconectada é recusada com o que fazer", () => {
    const state = stateDir();
    stageManaged(state);

    expect(() =>
      adapterInvocationFor({
        config: CONFIG,
        account: account({ state: "disconnected" }),
        stateDir: state,
        secrets: noSecrets,
      }),
    ).toThrow(expect.objectContaining({ code: "BLOCKED", message: expect.stringMatching(/reconecte a conta/) }));
  });

  it("recusa a conta de outro agente", () => {
    const state = stateDir();
    stageManaged(state);

    expect(() =>
      adapterInvocationFor({
        config: CONFIG,
        account: account({ agentConfigId: "cfg-outro" }),
        stateDir: state,
        secrets: noSecrets,
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
  });

  it("um adaptador fora do catálogo só tem a conta sem diretório", () => {
    // Sem spec, não há variável de conta para traduzir: a conta com diretório
    // seria o daemon fingindo isolar o que não sabe isolar.
    const state = stateDir();
    const fake = { ...CONFIG, name: "fake-agent", command: "/opt/fake-acp" };

    expect(
      adapterInvocationFor({ config: fake, account: account(), stateDir: state, secrets: noSecrets }),
    ).toEqual({ command: "/opt/fake-acp", args: ["--flag"], env: { FROM_CONFIG: "1" }, unsetEnv: [] });
    expect(() =>
      adapterInvocationFor({
        config: fake,
        account: account({ configDir: "/contas/x" }),
        stateDir: state,
        secrets: noSecrets,
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
  });
});
