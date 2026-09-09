import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import { afterEach, expect, it } from "vitest";

import { adapterCommandFor, adapterCommandForConfig, adaptersDir } from "./adapter-command.js";

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
      transport: "acp",
    },
    state,
  );

  expect(resolved).toBe(managed);
});

it("deixa uma configuração PTY exatamente como ela é", () => {
  // Um shell não é adaptador, e o `~/.lumem` não tem opinião sobre onde mora o
  // `bash`. A regra de proveniência é sobre adaptador.
  const state = stateDir();

  expect(
    adapterCommandForConfig({ name: "meu shell", command: "/bin/zsh", transport: "pty" }, state),
  ).toBe("/bin/zsh");
});

it("recusa um nome nu numa linha ACP, porque quem escolheria é o PATH", () => {
  const state = stateDir();
  stageManaged(state);

  expect(() =>
    adapterCommandForConfig({ name: "gemini", command: "gemini-acp", transport: "acp" }, state),
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
      { name: "acp-falso", command: "/usr/local/bin/node", transport: "acp" },
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
      { name: CLAUDE_ADAPTER.id, command: "/opt/outro/claude-agent-acp", transport: "acp" },
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
