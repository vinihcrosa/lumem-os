import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AcpEvent } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager, type AcpSpawnOptions } from "./AcpManager.js";

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

/**
 * O roteiro de plan mode (`035` S4), pelo daemon de verdade.
 *
 * Pelo `AcpManager` e não pelo JSON-RPC cru: o que o e2e vai ler é o que sai
 * do daemon, e o `content` do `tool_call` só chega do outro lado se o tradutor
 * o levar — a porta 1 da feature.
 */
const PLAN_PROMPT = "planeje antes de mexer no loader";

/** As quatro opções do `0.75.1`, verbatim (`buildExitPlanModePermissionOptions`). */
const PLAN_OPTIONS = [
  { optionId: "exit-plan-clear-auto", kind: "allow_always", name: "Yes, clear context (32% used) and use auto mode" },
  { optionId: "exit-plan-auto", kind: "allow_always", name: "Yes, and use auto mode" },
  { optionId: "exit-plan-default", kind: "allow_once", name: "Yes, manually approve edits" },
  { optionId: "reject", kind: "reject_once", name: "No, keep planning" },
];

async function planSession(options: Partial<AcpSpawnOptions> = {}) {
  const manager = new AcpManager({ isAvailable: () => true });
  managers.push(manager);
  const info = await manager.spawn({ command: shim(), cwd: scratch("lumem-plano-"), ...options });
  const events: AcpEvent[] = [];
  manager.onEvent(info.id, (entry) => events.push(entry.event));
  return { manager, id: info.id, events };
}

type PermissionRequest = Extract<AcpEvent, { type: "permission_request" }>;

async function asked(events: readonly AcpEvent[]): Promise<PermissionRequest> {
  return vi.waitFor(
    () => {
      const request = events.find((event): event is PermissionRequest => event.type === "permission_request");
      if (request === undefined) throw new Error("o pedido ainda não chegou");
      return request;
    },
    { timeout: 5_000, interval: 10 },
  );
}

function modes(events: readonly AcpEvent[]): string[] {
  return events.flatMap((event) => (event.type === "config" ? [event.mode] : []));
}

describe("o roteiro de plan mode do fake", () => {
  it("o roteiro de plan mode emite o pedido do adaptador", async () => {
    const { manager, id, events } = await planSession();

    const turn = manager.prompt(id, PLAN_PROMPT);
    const request = await asked(events);

    const planMode = events.findIndex((event) => event.type === "config" && event.mode === "plan");
    const call = events.findIndex((event) => event.type === "tool_call" && event.kind === "switch_mode");
    const ask = events.indexOf(request);
    expect(planMode).toBeGreaterThanOrEqual(0);
    expect(call).toBeGreaterThan(planMode);
    expect(ask).toBeGreaterThan(call);

    const toolCall = events[call] as Extract<AcpEvent, { type: "tool_call" }>;
    expect(toolCall.title).toBe("Approve Plan");
    const text = toolCall.content?.find((item) => item.type === "content");
    expect(text?.type === "content" ? text.text.split("\n").length : 0).toBeGreaterThan(12);

    expect(request.toolCallId).toBe(toolCall.toolCallId);
    expect(request.options).toEqual(PLAN_OPTIONS);

    manager.respondToPermission(id, request.requestId, "reject");
    await turn;
  });

  it.each([
    ["exit-plan-clear-auto", "auto", "end_turn"],
    ["exit-plan-auto", "auto", "end_turn"],
    ["exit-plan-default", "default", "end_turn"],
    ["reject", "plan", "cancelled"],
  ])("cada resposta do roteiro leva ao modo do adaptador (%s)", async (optionId, mode, stopReason) => {
    const { manager, id, events } = await planSession();

    const turn = manager.prompt(id, PLAN_PROMPT);
    const request = await asked(events);
    manager.respondToPermission(id, request.requestId, optionId);

    expect(await turn).toBe(stopReason);
    expect(modes(events).at(-1)).toBe(mode);
    expect(events.at(-1)).toEqual({ type: "turn_end", stopReason });
  });

  it("liberado não aprova o plano", async () => {
    // O adaptador sem modos é o único em que a política do Lumem vale (A1).
    const { manager, id, events } = await planSession({ env: { LUMEM_FAKE_NO_MODES: "1" }, lumemMode: "free" });
    expect(manager.get(id)).toMatchObject({ mode: "", lumemMode: "free" });

    const turn = manager.prompt(id, PLAN_PROMPT);
    const request = await asked(events);

    expect(request.policyReason).toBe("aprovar um plano é decisão sua");
    expect(events.some((event) => event.type === "permission_resolved")).toBe(false);

    // Continua pendente: a resposta de uma pessoa ainda é aceita.
    manager.respondToPermission(id, request.requestId, "reject");
    await turn;
    expect(events.filter((event) => event.type === "permission_resolved")).toEqual([
      { type: "permission_resolved", requestId: request.requestId, outcome: { optionId: "reject" }, by: "user", reason: null },
    ]);
  });
});
