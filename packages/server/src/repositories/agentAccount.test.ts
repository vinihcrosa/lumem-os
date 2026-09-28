import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { agentAccount, agentConfig } from "../db/schema.js";
import { withTestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { createAgentAccountRepository } from "./agentAccount.js";
import { configForAdapter, createAgentConfigRepository } from "./agentConfig.js";

/** Uma configuração crua, sem passar pelo repositório — que já cria a conta padrão. */
async function bareConfig(db: Db, name = "claude"): Promise<string> {
  const id = `cfg-${name}`;
  await db.insert(agentConfig).values({ id, name, command: "claude-agent-acp", adapterVersion: "0.75.1" });
  return id;
}

describe("ensureDefault", () => {
  it("cria a conta que sobe sem a variável, chamada principal, e a marca padrão", async () => {
    // ADR de 2026-09-26: a primeira conta é a variável **ausente** — o login
    // que já existe vira a primeira conta sem ninguém relogar.
    await withTestDb(async (db) => {
      const configId = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);

      const account = await accounts.ensureDefault(configId);

      expect(account).toMatchObject({
        agentConfigId: configId,
        // Não o nome do agente: `claude · claude` no cabeçalho é o produto
        // dando nome no lugar de quem é dono dele (Q2).
        label: "principal",
        kind: "subscription",
        configDir: null,
        state: "connected",
      });
      const config = await db.query.agentConfig.findFirst({ where: eq(agentConfig.id, configId) });
      expect(config?.defaultAccountId).toBe(account.id);
      expect((await accounts.defaultFor(configId))?.id).toBe(account.id);
    });
  });

  it("é idempotente: chamar de novo devolve a mesma conta, e não cria outra", async () => {
    await withTestDb(async (db) => {
      const configId = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);

      const first = await accounts.ensureDefault(configId);
      const second = await accounts.ensureDefault(configId);

      expect(second.id).toBe(first.id);
      expect(await accounts.listByConfig(configId)).toHaveLength(1);
    });
  });

  it("adota a conta sem diretório que já existe quando o ponteiro está vazio", async () => {
    await withTestDb(async (db) => {
      const configId = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);
      const bare = await accounts.create({ agentConfigId: configId, label: "pessoal" });

      const adopted = await accounts.ensureDefault(configId);

      expect(adopted.id).toBe(bare.id);
      expect(await accounts.listByConfig(configId)).toHaveLength(1);
    });
  });

  it("recusa uma configuração que não existe, em vez de lançar erro cru", async () => {
    await withTestDb(async (db) => {
      await expect(createAgentAccountRepository(db).ensureDefault("nope")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("defaultFor", () => {
  it("não aceita um ponteiro para a conta de outro agente", async () => {
    // O `default_account_id` não tem estrangeiro (ele fecharia um ciclo com a
    // `agent_account`), então quem confere que a conta é deste agente é aqui.
    await withTestDb(async (db) => {
      const claude = await bareConfig(db, "claude");
      const codex = await bareConfig(db, "codex");
      const accounts = createAgentAccountRepository(db);
      const other = await accounts.ensureDefault(codex);
      await db.update(agentConfig).set({ defaultAccountId: other.id }).where(eq(agentConfig.id, claude));

      expect(await accounts.defaultFor(claude)).toBeUndefined();
    });
  });
});

describe("create", () => {
  it("recusa dois rótulos iguais no mesmo agente, e aceita em agentes diferentes", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db, "claude");
      const codex = await bareConfig(db, "codex");
      const accounts = createAgentAccountRepository(db);
      await accounts.create({ agentConfigId: claude, label: "trabalho", configDir: "/a" });

      await expect(
        accounts.create({ agentConfigId: claude, label: "trabalho", configDir: "/b" }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(
        accounts.create({ agentConfigId: codex, label: "trabalho", configDir: "/c" }),
      ).resolves.toMatchObject({ label: "trabalho" });
    });
  });

  it("recusa uma segunda conta sem diretório no mesmo agente — seria o mesmo login", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);
      await accounts.create({ agentConfigId: claude, label: "um" });

      await expect(accounts.create({ agentConfigId: claude, label: "dois" })).rejects.toMatchObject({
        code: "DUPLICATE",
      });
    });
  });

  it("recusa duas contas no mesmo diretório — seriam a mesma credencial", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);
      await accounts.create({ agentConfigId: claude, label: "um", configDir: "/x" });

      await expect(
        accounts.create({ agentConfigId: claude, label: "dois", configDir: "/x" }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
    });
  });

  it("recusa tipo e estado fora do vocabulário", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db);

      await expect(
        db.insert(agentAccount).values({ id: "a1", agentConfigId: claude, label: "x", kind: "oauth" }),
      ).rejects.toThrow(/agent_account_kind/);
      await expect(
        db.insert(agentAccount).values({ id: "a2", agentConfigId: claude, label: "y", state: "gone" }),
      ).rejects.toThrow(/agent_account_state/);
    });
  });

  it("guarda a identidade lida como JSON estruturado", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);
      const identity = { email: "a@b.c", plan: "max", checkedAt: 1_790_000_000_000 };

      const created = await accounts.create({
        agentConfigId: claude,
        label: "com-id",
        configDir: "/d",
        identity,
      });

      expect((await accounts.get(created.id))?.identity).toEqual(identity);
    });
  });
});

describe("listByConfig", () => {
  it("devolve só as contas daquele agente, na ordem em que foram conectadas", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db, "claude");
      const codex = await bareConfig(db, "codex");
      const accounts = createAgentAccountRepository(db);
      const first = await accounts.ensureDefault(claude);
      const second = await accounts.create({ agentConfigId: claude, label: "dois", configDir: "/2" });
      await accounts.ensureDefault(codex);

      expect((await accounts.listByConfig(claude)).map((row) => row.id)).toEqual([
        first.id,
        second.id,
      ]);
    });
  });
});

describe("a configuração nasce com a conta padrão", () => {
  it("pelo repositório de configuração", async () => {
    await withTestDb(async (db) => {
      const config = await createAgentConfigRepository(db).create({
        name: "claude",
        command: "claude-agent-acp",
        adapterVersion: "0.75.1",
      });

      const account = await createAgentAccountRepository(db).defaultFor(config.id);
      expect(account).toMatchObject({ label: "principal", configDir: null });
    });
  });

  it("pelo `configForAdapter`, que a esteira usa para criar configuração na hora", async () => {
    await withTestDb(async (db) => {
      const configId = await configForAdapter(db, "codex");

      const account = await createAgentAccountRepository(db).defaultFor(configId);
      expect(account).toMatchObject({ label: "principal", configDir: null });
    });
  });

  it("e apagar a configuração leva a conta padrão junto, se nenhuma sessão a usa", async () => {
    await withTestDb(async (db) => {
      const configs = createAgentConfigRepository(db);
      const config = await configs.create({
        name: "claude",
        command: "claude-agent-acp",
        adapterVersion: "0.75.1",
      });

      await configs.remove(config.id);

      expect(await db.select().from(agentAccount)).toEqual([]);
    });
  });
});

describe("rename", () => {
  it("troca o rótulo da conta", async () => {
    await withTestDb(async (db) => {
      const accounts = createAgentAccountRepository(db);
      const account = await accounts.ensureDefault(await bareConfig(db));

      await accounts.rename(account.id, "pessoal");

      expect((await accounts.get(account.id))?.label).toBe("pessoal");
    });
  });

  it("recusa um rótulo que outra conta do mesmo agente já tem", async () => {
    await withTestDb(async (db) => {
      const claude = await bareConfig(db);
      const accounts = createAgentAccountRepository(db);
      const bare = await accounts.ensureDefault(claude);
      await accounts.create({ agentConfigId: claude, label: "trabalho", configDir: "/t" });

      await expect(accounts.rename(bare.id, "trabalho")).rejects.toMatchObject({ code: "DUPLICATE" });
      expect((await accounts.get(bare.id))?.label).toBe("principal");
    });
  });

  it("recusa uma conta que não existe", async () => {
    await withTestDb(async (db) => {
      await expect(createAgentAccountRepository(db).rename("acct-nada", "x")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
