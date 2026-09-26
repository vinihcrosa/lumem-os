import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import { CLAUDE_ADAPTER } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { withTestDb } from "../db/testing.js";
import { agentConfig, session } from "../db/schema.js";
import { isCommandAvailable } from "../agents/availability.js";
import { configForAdapter, createAgentConfigRepository } from "./agentConfig.js";
import { tempDir } from "../testing/git-fixtures.js";

/** A directory holding one executable, as a PATH entry. */
function binDir(name: string, executable = true): string {
  const dir = tempDir("lumem-bin-");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, executable ? 0o755 : 0o644);
  return dir;
}

describe("a fresh database", () => {
  it("ships no agent configuration at all", async () => {
    /*
     * C6 da `second-agent`: a semente `pty` + `claude` deixou de existir.
     *
     * Ela vinha de um tempo em que nada criava configuração; hoje o primeiro
     * acesso e o rodapé de login criam a **ACP**, com a versão que o handshake
     * detectou. Semear agora significaria escolher uma spec do catálogo — e
     * `pty` + `claude` não é uma delas.
     */
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);

      expect(await repository.list()).toEqual([]);
    });
  });

  it("keeps a configuration someone already had", async () => {
    // Não há migração que apague configuração de ninguém: quem já tinha a linha
    // continua com ela, e é isso que faz a mudança ser segura de embarcar.
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const mine = await repository.create({
        name: "claude-code",
        command: "claude",
        adapterVersion: "1.0.0",
      });

      expect((await repository.list()).map((row) => row.id)).toEqual([mine.id]);
    });
  });
});

describe("crud", () => {
  it("stores args and env as structured values", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);

      const created = await repository.create({
        name: "com-flags",
        command: "agent",
        args: ["--model", "opus"],
        env: { AGENT_LOG: "debug" },
        adapterVersion: "1.0.0",
      });

      expect(created.args).toEqual(["--model", "opus"]);
      expect(created.env).toEqual({ AGENT_LOG: "debug" });
    });
  });

  it("refuses a duplicate name", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      await repository.create({ name: "claude-code", command: "claude", adapterVersion: "1.0.0" });

      await expect(
        repository.create({ name: "claude-code", command: "outro", adapterVersion: "1.0.0" }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
    });
  });

  it("updates the command", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const created = await repository.create({
        name: "x",
        command: "old",
        adapterVersion: "1.0.0",
      });

      expect(await repository.update(created.id, { command: "new" })).toMatchObject({
        command: "new",
      });
    });
  });

  it("reports a configuration that does not exist", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);

      await expect(repository.update("nope", { command: "x" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(repository.remove("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("removes an unused configuration", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const created = await repository.create({ name: "x", command: "y", adapterVersion: "1.0.0" });

      await repository.remove(created.id);

      expect(await repository.list()).toEqual([]);
    });
  });

  it("keeps a configuration a session still points at", async () => {
    // The session detail has to say what the process was launched from, even
    // after it exited.
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const created = await repository.create({ name: "x", command: "y", adapterVersion: "1.0.0" });
      await db.insert(session).values({
        id: "s1",
        kind: "agent",
        agentConfigId: created.id,
        scopeType: "worktree",
        scopeId: "wt1",
        cwd: "/w",
        command: "y",
      });

      await expect(repository.remove(created.id)).rejects.toMatchObject({ code: "IN_USE" });
    });
  });

  it("finds by name", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      await repository.create({ name: "claude-code", command: "claude", adapterVersion: "1.0.0" });

      expect(await repository.findByName("claude-code")).toBeDefined();
      expect(await repository.findByName("ausente")).toBeUndefined();
    });
  });
});

describe("isCommandAvailable", () => {
  it("finds an executable on the PATH", async () => {
    const dir = binDir("fake-agent");

    expect(isCommandAvailable("fake-agent", { path: dir })).toBe(true);
  });

  it("does not find a command that is not there", () => {
    expect(isCommandAvailable("fake-agent", { path: binDir("outro") })).toBe(false);
  });

  it("ignores a file that is not executable", () => {
    // The bit matters: node-pty would spawn it and exit 1 with no output, which
    // the user reads as a crash.
    expect(isCommandAvailable("fake-agent", { path: binDir("fake-agent", false) })).toBe(false);
  });

  it("searches every PATH entry", () => {
    const first = binDir("outro");
    const second = binDir("fake-agent");

    expect(isCommandAvailable("fake-agent", { path: [first, second].join(delimiter) })).toBe(true);
  });

  it("takes an absolute path at its word", () => {
    const dir = binDir("fake-agent");

    expect(isCommandAvailable(join(dir, "fake-agent"), { path: "" })).toBe(true);
    expect(isCommandAvailable("/nope/fake-agent", { path: dir })).toBe(false);
  });

  it("refuses a relative path, which would depend on the daemon's cwd", () => {
    expect(isCommandAvailable("./fake-agent", { path: binDir("fake-agent") })).toBe(false);
  });

  it.each(["", "   "])("refuses the empty command %j", (command) => {
    expect(isCommandAvailable(command, { path: binDir("fake-agent") })).toBe(false);
  });

  it("answers false when the PATH is empty", () => {
    expect(isCommandAvailable("sh", { path: "" })).toBe(false);
  });

  it("falls back to the daemon's own PATH", () => {
    // What production does: F6.5 asks whether *this* daemon could launch it.
    expect(isCommandAvailable("sh")).toBe(true);
    expect(isCommandAvailable("definitely-not-a-real-binary-xyz")).toBe(false);
  });
});

describe("adapter version", () => {
  it("creates a configuration with its adapter pinned and no transport at all", async () => {
    // `033` F1.1: agente é sempre ACP, e a coluna que escolhia saiu. Uma linha
    // que ainda carregasse `transport` seria o banco afirmando uma escolha que
    // não existe mais.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      const row = await repo.create({
        name: "claude-acp",
        command: "claude-agent-acp",
        adapterVersion: "0.69.0",
      });

      expect(row).toMatchObject({ adapterVersion: "0.69.0", retiredAt: null });
      expect(row).not.toHaveProperty("transport");
    });
  });

  it("refuses a configuration with a floating adapter, as a domain error", async () => {
    // The CHECK is the enforcement; this is about what the caller is told. A raw
    // SQLite message reads as a daemon defect rather than as a fixable mistake.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      await expect(
        // @ts-expect-error — the version is required, and this proves the type says so.
        repo.create({ name: "claude-acp", command: "claude-agent-acp" }),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT", message: /versão de adaptador fixa/ });
    });
  });
});

describe("a retired configuration", () => {
  /** What the `0033` migration leaves behind for a row that used to be PTY. */
  async function retired(db: Parameters<typeof createAgentConfigRepository>[0]) {
    const [row] = await db
      .insert(agentConfig)
      .values({ id: "ac_old", name: "claude-code", command: "claude", retiredAt: new Date() })
      .returning();
    return row!;
  }

  it("is not offered by list", async () => {
    // F1.3: it cannot launch anything, so offering it is offering a dead end.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);
      await retired(db);
      const live = await repo.create({
        name: "claude",
        command: "claude-agent-acp",
        adapterVersion: "0.75.1",
      });

      expect((await repo.list()).map((row) => row.id)).toEqual([live.id]);
    });
  });

  it("is still found by id, because yesterday's session needs its name", async () => {
    // F1.4: the legacy session reads as history, and history has a name.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);
      await retired(db);

      expect(await repo.findById("ac_old")).toMatchObject({ name: "claude-code" });
    });
  });
  it("is not found by name, so nothing reaches it by the catalog id", async () => {
    await withTestDb(async (db) => {
      await db
        .insert(agentConfig)
        .values({ id: "ac_pty", name: "claude", command: "claude", retiredAt: new Date() });

      expect(await createAgentConfigRepository(db).findByName("claude")).toBeUndefined();
    });
  });

  it("gives its name back: creating it again revives the row as ACP", async () => {
    // Without this the UNIQUE name kept the live `claude` from ever existing.
    await withTestDb(async (db) => {
      await db
        .insert(agentConfig)
        .values({ id: "ac_pty", name: "claude", command: "claude", retiredAt: new Date() });

      const id = await configForAdapter(db, CLAUDE_ADAPTER.id);

      expect(id).toBe("ac_pty");
      expect(await createAgentConfigRepository(db).findById(id)).toMatchObject({
        retiredAt: null,
        command: CLAUDE_ADAPTER.command,
        adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
      });
    });
  });
});

describe("configForAdapter", () => {
  it("creates the adapter's configuration pinned to the catalog version, once", async () => {
    await withTestDb(async (db) => {
      const first = await configForAdapter(db, CLAUDE_ADAPTER.id);
      const second = await configForAdapter(db, CLAUDE_ADAPTER.id);

      expect(second).toBe(first);
      expect(await createAgentConfigRepository(db).findById(first)).toMatchObject({
        name: CLAUDE_ADAPTER.id,
        adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
      });
    });
  });

  it("refuses a named configuration that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(configForAdapter(db, CLAUDE_ADAPTER.id, "ausente")).rejects.toThrow(/ausente/);
    });
  });
});
