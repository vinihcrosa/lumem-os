import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER, CODEX_ADAPTER, type AdapterSpec } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager, type AcpCliRunner } from "../acp/AcpManager.js";
import { agentAccount, agentConfig, session } from "../db/schema.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { agentAccountSecretId } from "../setup/adapter-command.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * Conectar, desconectar, apagar de vez, e a conta padrão (`034` T8).
 *
 * Com `HOME` e `stateDir` descartáveis: o `connect` lê o diretório padrão do CLI
 * para herdar (Q10) e escreve em `<stateDir>/_system/agents/`, e nenhum dos dois
 * pode ser o de quem roda a suíte.
 */

let context: TestCaller | undefined;

afterEach(async () => {
  await context?.cleanup();
  context = undefined;
  cleanupGitFixtures();
});

function stageManagedAdapter(stateDir: string, spec: AdapterSpec = CLAUDE_ADAPTER): void {
  const bin = join(stateDir, ADAPTERS_DIR_NAME, spec.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, spec.command), "");
}

function cli(loggedIn: boolean): AcpCliRunner {
  return vi.fn(async () => ({
    stdout: JSON.stringify(
      loggedIn ? { loggedIn: true, email: "conta@exemplo.com", subscriptionType: "max" } : { loggedIn: false },
    ),
    exitCode: loggedIn ? 0 : 1,
  }));
}

function harness({ loggedIn = true, now }: { loggedIn?: boolean; now?: () => number } = {}) {
  const stateDir = tempDir("lumem-state-");
  const home = tempDir("lumem-home-");
  stageManagedAdapter(stateDir);
  stageManagedAdapter(stateDir, CODEX_ADAPTER);
  const acpManager = new AcpManager({
    spawner: () => fakeAgentProcess().process,
    isAvailable: () => true,
    runCli: cli(loggedIn),
    ...(now === undefined ? {} : { now }),
  });
  context = createTestCaller({ LUMEM_STATE_DIR: stateDir, HOME: home }, { acpManager });
  return { ctx: context, stateDir, home };
}

describe("agentAccount.connect", () => {
  it("assinatura: cria o diretório, liga a herança, e nasce desconectada até o login conferir", async () => {
    const { ctx, stateDir, home } = harness();
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{}");

    const result = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });

    const dir = join(stateDir, "_system", "agents", "claude", result.account.id);
    expect(existsSync(dir)).toBe(true);
    expect(lstatSync(join(dir, "settings.json")).isSymbolicLink()).toBe(true);
    expect(result).toMatchObject({
      account: { label: "trabalho", kind: "subscription", state: "disconnected", configDir: dir },
      linked: ["settings.json", "skills"],
      notInherited: CLAUDE_ADAPTER.notInherited,
    });
  });

  it("o login conferido pelo probe a torna conectada", async () => {
    const { ctx } = harness();
    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });

    await ctx.api.setup.probe({ accountId: account.id });

    const [listed] = (await ctx.api.agentAccount.list({ adapterId: "claude" })).filter(
      (row) => row.id === account.id,
    );
    expect(listed).toMatchObject({ state: "connected", identity: { email: "conta@exemplo.com" } });
  });

  it("o probe que não confere login a deixa desconectada", async () => {
    const { ctx } = harness({ loggedIn: false });
    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });

    await ctx.api.setup.probe({ accountId: account.id });

    expect((await createAgentAccountRepository(ctx.db).get(account.id))?.state).toBe("disconnected");
  });

  it("chave: guarda no cofre, e nasce conectada — não há leitura que confira a chave", async () => {
    // §3.3 do estudo: o `session/new` do Codex aceita uma chave falsa.
    const { ctx } = harness();

    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "codex",
      label: "api",
      kind: "api_key",
      apiKey: "sk-conta",
    });

    expect(account.state).toBe("connected");
    expect(ctx.ctx.secrets.read(agentAccountSecretId(account.id))).toBe("sk-conta");
  });

  it("chave sem chave é recusada", async () => {
    const { ctx } = harness();

    await expect(
      ctx.api.agentAccount.connect({ adapterId: "codex", label: "api", kind: "api_key" }),
    ).rejects.toThrow();
  });
});

describe("a conta padrão", () => {
  it("a primeira conta conectada vira a padrão quando o agente não tem uma conectada", async () => {
    const { ctx } = harness();
    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });
    // A conta que já existia sai de cena: sem padrão conectada, a próxima que
    // conectar assume.
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;
    await ctx.api.agentAccount.disconnect({ accountId: bare.id });

    await ctx.api.setup.probe({ accountId: account.id });

    const accounts = await ctx.api.agentAccount.list({ adapterId: "claude" });
    expect(accounts.find((row) => row.id === account.id)?.isDefault).toBe(true);
  });

  it("desconectar a padrão passa a padrão para a conectada mais antiga (nota da Q8)", async () => {
    const { ctx } = harness();
    const first = await ctx.api.agentAccount.connect({ adapterId: "claude", label: "um", kind: "subscription" });
    await ctx.api.setup.probe({ accountId: first.account.id });
    const second = await ctx.api.agentAccount.connect({ adapterId: "claude", label: "dois", kind: "subscription" });
    await ctx.api.setup.probe({ accountId: second.account.id });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;
    expect(bare.isDefault).toBe(true);

    await ctx.api.agentAccount.disconnect({ accountId: bare.id });

    const accounts = await ctx.api.agentAccount.list({ adapterId: "claude" });
    expect(accounts.find((row) => row.id === first.account.id)?.isDefault).toBe(true);
    expect(accounts.find((row) => row.id === bare.id)).toMatchObject({ state: "disconnected", isDefault: false });
  });

  it("sem nenhuma conectada, o agente fica sem padrão e a conversa nova pede para conectar", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "um", kind: "subscription" });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;

    await ctx.api.agentAccount.disconnect({ accountId: bare.id });

    const accounts = await ctx.api.agentAccount.list({ adapterId: "claude" });
    expect(accounts.every((row) => !row.isDefault)).toBe(true);
    const config = await ctx.db.query.agentConfig.findFirst({ where: eq(agentConfig.name, "claude") });
    await expect(createAgentAccountRepository(ctx.db).ensureDefault(config!.id)).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("`setDefault` troca a padrão, e recusa uma desconectada", async () => {
    const { ctx } = harness();
    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });

    await expect(ctx.api.agentAccount.setDefault({ accountId: account.id })).rejects.toThrow(/conect/);
    await ctx.api.setup.probe({ accountId: account.id });
    await ctx.api.agentAccount.setDefault({ accountId: account.id });

    const accounts = await ctx.api.agentAccount.list({ adapterId: "claude" });
    expect(accounts.find((row) => row.id === account.id)?.isDefault).toBe(true);
    expect(accounts.filter((row) => row.isDefault)).toHaveLength(1);
  });

  it("`setDefaults` guarda o modelo e o effort da conta — o trio da emenda da Q1", async () => {
    const { ctx } = harness();
    const bare = (
      await (async () => {
        await ctx.api.agentAccount.connect({ adapterId: "claude", label: "um", kind: "subscription" });
        return ctx.api.agentAccount.list({ adapterId: "claude" });
      })()
    ).find((row) => row.bare)!;

    await ctx.api.agentAccount.setDefaults({ accountId: bare.id, model: "sonnet", effort: "high" });

    const again = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare);
    expect(again).toMatchObject({ defaultModel: "sonnet", defaultEffort: "high" });
  });
});

describe("agentAccount.purge", () => {
  async function accountWithSession(ctx: TestCaller) {
    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });
    await ctx.db.insert(session).values({
      id: "se-conta",
      kind: "agent",
      agentConfigId: account.agentConfigId,
      agentAccountId: account.id,
      scopeType: "project",
      scopeId: "p1",
      cwd: "/r",
      command: "claude-agent-acp",
      transport: "acp",
      acpSessionId: "acp-1",
      state: "exited",
      exitCode: 0,
    });
    return account;
  }

  it("a contagem de conversas errada é recusada", async () => {
    const { ctx } = harness();
    const account = await accountWithSession(ctx);

    await expect(ctx.api.agentAccount.purge({ accountId: account.id, sessionCount: 0 })).rejects.toThrow(
      /1 conversa/,
    );
    expect(await createAgentAccountRepository(ctx.db).get(account.id)).toBeDefined();
  });

  it("apaga a conta, as conversas dela, o diretório e o segredo", async () => {
    const { ctx } = harness();
    const account = await accountWithSession(ctx);
    ctx.ctx.secrets.write(agentAccountSecretId(account.id), "sk-velha");

    await ctx.api.agentAccount.purge({ accountId: account.id, sessionCount: 1 });

    expect(await createAgentAccountRepository(ctx.db).get(account.id)).toBeUndefined();
    expect(await ctx.db.select().from(session).where(eq(session.id, "se-conta"))).toEqual([]);
    expect(existsSync(account.configDir!)).toBe(false);
    expect(ctx.ctx.secrets.has(agentAccountSecretId(account.id))).toBe(false);
  });

  it("recusa apagar a conta sem diretório — é o login desta máquina, e não do Lumem", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "um", kind: "subscription" });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;

    await expect(
      ctx.api.agentAccount.purge({ accountId: bare.id, sessionCount: bare.sessionCount }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("recusa apagar um diretório fora de `_system/agents/`", async () => {
    const { ctx, home } = harness();
    const account = await accountWithSession(ctx);
    await ctx.db.update(agentAccount).set({ configDir: home }).where(eq(agentAccount.id, account.id));

    await expect(ctx.api.agentAccount.purge({ accountId: account.id, sessionCount: 1 })).rejects.toThrow();
    expect(existsSync(home)).toBe(true);
  });

  it("recusa com uma conversa viva", async () => {
    const { ctx } = harness();
    const account = await accountWithSession(ctx);
    await ctx.db.update(session).set({ state: "running", exitCode: null }).where(eq(session.id, "se-conta"));

    await expect(ctx.api.agentAccount.purge({ accountId: account.id, sessionCount: 1 })).rejects.toThrow(
      /aberta|viva/,
    );
  });
});

describe("o aviso para a tela (`account.changed`)", () => {
  it("cada gesto avisa, com o agente, para outra aba recarregar", async () => {
    const { ctx } = harness();
    const emit = vi.spyOn(ctx.events, "emit");
    const expected = { type: "account.changed", adapterId: "claude" };

    const { account } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });
    expect(emit).toHaveBeenLastCalledWith(expected);

    emit.mockClear();
    await ctx.api.setup.probe({ accountId: account.id });
    expect(emit).toHaveBeenCalledWith(expected);

    for (const gesture of [
      () => ctx.api.agentAccount.setDefault({ accountId: account.id }),
      () => ctx.api.agentAccount.setDefaults({ accountId: account.id, model: "sonnet", effort: null }),
      () => ctx.api.agentAccount.rename({ accountId: account.id, label: "trabalho novo" }),
      () => ctx.api.agentAccount.disconnect({ accountId: account.id }),
      () => ctx.api.agentAccount.purge({ accountId: account.id, sessionCount: 0 }),
    ]) {
      emit.mockClear();
      await gesture();
      expect(emit).toHaveBeenCalledWith(expected);
    }
  });
});

describe("agentAccount.list", () => {
  it("diz, por conta, o estado, a identidade, se é a padrão, se é a sem diretório, e quantas conversas", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "trabalho", kind: "subscription" });

    const accounts = await ctx.api.agentAccount.list({ adapterId: "claude" });

    expect(accounts.map((row) => row.label).sort()).toEqual(["principal", "trabalho"]);
    expect(accounts.find((row) => row.bare)).toMatchObject({
      adapterId: "claude",
      isDefault: true,
      state: "connected",
      sessionCount: 0,
    });
    expect(await ctx.api.agentAccount.list({ adapterId: "codex" })).toEqual([]);
  });
});

describe("agentAccount.rename", () => {
  it("dá o nome que você digitou à conta que já existia — o nome é seu (Q2)", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "trabalho", kind: "subscription" });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;
    expect(bare.label).toBe("principal");

    await ctx.api.agentAccount.rename({ accountId: bare.id, label: "  pessoal  " });

    const again = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare);
    expect(again?.label).toBe("pessoal");
  });

  it("recusa o nome de outra conta do mesmo agente, com a frase do daemon", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "trabalho", kind: "subscription" });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;

    await expect(ctx.api.agentAccount.rename({ accountId: bare.id, label: "trabalho" })).rejects.toThrow(
      /já existe uma conta chamada "trabalho"/,
    );
  });

  it("recusa nome vazio", async () => {
    const { ctx } = harness();
    await ctx.api.agentAccount.connect({ adapterId: "claude", label: "trabalho", kind: "subscription" });
    const bare = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find((row) => row.bare)!;

    await expect(ctx.api.agentAccount.rename({ accountId: bare.id, label: "   " })).rejects.toThrow();
    expect((await createAgentAccountRepository(ctx.db).get(bare.id))?.label).toBe("principal");
  });
});

describe("agentAccount.rateLimits", () => {
  it("rateLimits keeps the latest report per account", async () => {
    let clock = 1_000;
    const { ctx } = harness({ now: () => clock });
    const { account: work } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });
    const { account: silent } = await ctx.api.agentAccount.connect({
      adapterId: "claude",
      label: "pessoal",
      kind: "subscription",
    });

    const open = (account: { id: string; label: string }) =>
      ctx.acpManager.spawn({
        command: "claude-agent-acp",
        cwd: tempDir("lumem-cwd-"),
        adapterId: "claude",
        account: { id: account.id, label: account.label },
      });
    const report = (sessionId: string, utilization: number, resetsAt: number) =>
      ctx.acpManager.recordEvent(sessionId, {
        type: "usage",
        used: 10,
        size: 200_000,
        cost: null,
        rateLimit: { utilization, isUsingOverage: false, resetsAt, kind: "five_hour" },
      });

    const first = await open(work);
    const second = await open(work);
    await open(silent);

    // A primeira relata o número maior, e a segunda o mais recente: "o mais
    // recente" não é "o maior", e é a diferença que a asserção precisa enxergar.
    report(first.id, 0.9, 1_900_000_000);
    clock = 2_000;
    report(second.id, 0.4, 1_900_003_600);

    await expect(ctx.api.agentAccount.rateLimits()).resolves.toEqual([
      {
        accountId: work.id,
        adapterId: "claude",
        kind: "five_hour",
        utilization: 0.4,
        resetsAt: 1_900_003_600,
      },
    ]);

    // A primeira volta a relatar depois da segunda: agora o dela é o mais recente.
    clock = 3_000;
    report(first.id, 0.95, 1_900_007_200);
    await expect(ctx.api.agentAccount.rateLimits()).resolves.toMatchObject([
      { accountId: work.id, utilization: 0.95, resetsAt: 1_900_007_200 },
    ]);
  });
});
