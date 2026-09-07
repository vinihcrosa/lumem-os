import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CODEX_ADAPTER } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { isCommandAvailable } from "../agents/availability.js";
import { AcpManager } from "./AcpManager.js";

/**
 * O segundo adaptador de verdade, pelo mesmo preço do primeiro: zero.
 *
 * O irmão deste arquivo (`AcpManager.integration.test.ts`) faz isto para o
 * `claude-agent-acp`, e a razão é a mesma: o perfil codex-like do agente falso
 * fixa o que a fase 0 mediu, mas não pode responder se o **adaptador** ainda
 * responde assim. Ele publica quase todo dia, a versão é pinada justamente
 * porque se move, e é aqui que um `1.11.0` que mudou de forma aparece antes de
 * um usuário encontrar.
 *
 * **Para no `session/new`.** Handshake e criação de sessão não geram inferência —
 * medido na fase 0 —, e um `session/prompt` custaria tokens de verdade. Uma suíte
 * que cobra do usuário é uma suíte que ninguém roda.
 *
 * Pulado quando o `codex-acp` não está no PATH, e o `describe` invertido embaixo
 * diz que foi pulado: uma suíte que abandona em silêncio a única prova de mundo
 * real fica idêntica a uma que tem essa prova.
 */

const ADAPTER = CODEX_ADAPTER.command;
const installed = isCommandAvailable(ADAPTER);

const dirs: string[] = [];
const managers: AcpManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function cwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-codex-real-"));
  dirs.push(dir);
  return dir;
}

describe.skipIf(!installed)(`${ADAPTER} handshake`, () => {
  it("answers initialize and session/new in the shape this daemon expects", async () => {
    const manager = new AcpManager({ handshakeTimeoutMs: 60_000 });
    managers.push(manager);

    const info = await manager.spawn({ command: ADAPTER, cwd: cwd() });

    expect(info.acpSessionId).not.toBe("");
    expect(info.state).toBe("running");

    // §4.3: o modo é dele, e vem nas duas listas — o que faz deste o primeiro
    // agente em que a opção de modo e o modo são a mesma coisa.
    const modeOption = info.configOptions.find((option) => option.id === "mode");
    expect(modeOption).not.toBeUndefined();
    expect((modeOption?.choices ?? []).map((choice) => choice.value)).toContain(info.mode);

    // O modelo continua morando dentro de `configOptions`, como no outro
    // adaptador. Se um dia sair de lá, todo seletor de modelo desenha vazio.
    const modelOption = info.configOptions.find((option) => option.id === "model");
    expect(info.model).not.toBe("");
    expect((modelOption?.choices ?? []).map((choice) => choice.value)).toContain(info.model);
  });

  it("produced no conversation, which is what makes this test free", async () => {
    const manager = new AcpManager({ handshakeTimeoutMs: 60_000 });
    managers.push(manager);

    const info = await manager.spawn({ command: ADAPTER, cwd: cwd() });

    expect(manager.transcript(info.id)).toEqual([]);
  });
});

describe.skipIf(installed)(`${ADAPTER} handshake`, () => {
  it("is skipped because the adapter is not installed", () => {
    expect(installed).toBe(false);
  });
});

describe.skipIf(!installed)(`${ADAPTER} probe`, () => {
  it("reports the version the catalogue pins, and offers no terminal login", async () => {
    /*
     * As duas medições que decidiram perguntas, viradas em teste:
     *
     * - a versão é **detectada** (§4.1), e é o que a `agent_config` grava;
     * - **nenhum** método de login é `type: "terminal"` (§4.2) — é o que tirou a
     *   escolha de agente do primeiro acesso (C3) e o que faz a F2 existir. O dia
     *   em que o adaptador passar a oferecer um comando, esta linha vermelha é a
     *   notícia de que a C3 pode ser reaberta.
     */
    const manager = new AcpManager({ handshakeTimeoutMs: 60_000 });
    managers.push(manager);

    const report = await manager.probe({ command: ADAPTER, cwd: cwd() });

    expect(report.protocolVersion).toBe(1);
    expect(report.agentInfo?.version).toMatch(/^\d+\.\d+/);
    expect(report.capabilities).toContain("loadSession");
    expect(report.authMethods.length).toBeGreaterThan(0);
    expect(report.authMethods.some((method) => method.type === "terminal")).toBe(false);

    // D4: o probe não é sessão, e o processo já morreu.
    expect(manager.list()).toHaveLength(0);
  });
});
