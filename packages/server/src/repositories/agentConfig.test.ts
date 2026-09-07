import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { withTestDb } from "../db/testing.js";
import { session } from "../db/schema.js";
import { isCommandAvailable } from "../agents/availability.js";
import { createAgentConfigRepository } from "./agentConfig.js";
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
      const mine = await repository.create({ name: "claude-code", command: "claude" });

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
      });

      expect(created.args).toEqual(["--model", "opus"]);
      expect(created.env).toEqual({ AGENT_LOG: "debug" });
    });
  });

  it("refuses a duplicate name", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      await repository.create({ name: "claude-code", command: "claude" });

      await expect(
        repository.create({ name: "claude-code", command: "outro" }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
    });
  });

  it("updates the command", async () => {
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const created = await repository.create({ name: "x", command: "old" });

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
      const created = await repository.create({ name: "x", command: "y" });

      await repository.remove(created.id);

      expect(await repository.list()).toEqual([]);
    });
  });

  it("keeps a configuration a session still points at", async () => {
    // The session detail has to say what the process was launched from, even
    // after it exited.
    await withTestDb(async (db) => {
      const repository = createAgentConfigRepository(db);
      const created = await repository.create({ name: "x", command: "y" });
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
      await repository.create({ name: "claude-code", command: "claude" });

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

describe("transport", () => {
  it("creates a PTY configuration when nothing asks otherwise", async () => {
    // A11 again, one layer up: a caller written before transport existed keeps
    // producing exactly the row it used to.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      const row = await repo.create({ name: "zsh-agent", command: "claude" });

      expect(row).toMatchObject({ transport: "pty", adapterVersion: null });
    });
  });

  it("creates an ACP configuration with its adapter pinned", async () => {
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      const row = await repo.create({
        name: "claude-acp",
        command: "claude-agent-acp",
        transport: "acp",
        adapterVersion: "0.69.0",
      });

      expect(row).toMatchObject({ transport: "acp", adapterVersion: "0.69.0" });
    });
  });

  it("refuses an ACP configuration with a floating adapter, as a domain error", async () => {
    // The CHECK is the enforcement; this is about what the caller is told. A raw
    // SQLite message reads as a daemon defect rather than as a fixable mistake.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      await expect(
        repo.create({ name: "claude-acp", command: "claude-agent-acp", transport: "acp" }),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT", message: /versão de adaptador fixa/ });
    });
  });

  it("refuses a PTY configuration that pins an adapter, as a domain error", async () => {
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      await expect(
        repo.create({
          name: "claude-code",
          command: "claude",
          transport: "pty",
          adapterVersion: "0.69.0",
        }),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    });
  });

  it("creates a PTY configuration with no adapter version", async () => {
    // O caminho alternativo que a decisão do ACP preservou: `pty` continua
    // criável, e uma configuração de PTY não tem adaptador para versionar.
    await withTestDb(async (db) => {
      const repo = createAgentConfigRepository(db);

      const created = await repo.create({ name: "claude-code", command: "claude" });

      expect(created).toMatchObject({ transport: "pty", adapterVersion: null });
    });
  });
});
