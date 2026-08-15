import { newId } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { withTestDb } from "../db/testing.js";
import { agentConfig, project, session, workspace } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { constraintKey, required, withConstraints } from "./base.js";

/** Runs `write` and returns whatever it threw. */
async function failureOf(write: () => Promise<unknown>): Promise<unknown> {
  try {
    await write();
  } catch (error) {
    return error;
  }
  throw new Error("expected the write to fail");
}

describe("constraintKey", () => {
  it("names a unique index by its columns", async () => {
    await withTestDb(async (db) => {
      await db.insert(workspace).values({ id: newId(), name: "pessoal" });

      const error = await failureOf(() =>
        db.insert(workspace).values({ id: newId(), name: "pessoal" }),
      );

      expect(constraintKey(error)).toBe("unique:workspace.name");
    });
  });

  it("names a composite unique index in schema order", async () => {
    await withTestDb(async (db) => {
      const workspaceId = newId();
      await db.insert(workspace).values({ id: workspaceId, name: "pessoal" });
      const values = { workspaceId, name: "lorebase", defaultBranch: "main" };
      await db.insert(project).values({ id: newId(), ...values, path: "/a" });

      const error = await failureOf(() =>
        db.insert(project).values({ id: newId(), ...values, path: "/b" }),
      );

      expect(constraintKey(error)).toBe("unique:project.workspace_id,project.name");
    });
  });

  it("reports a foreign key failure without pretending to know which one", async () => {
    // SQLite genuinely does not say. Inventing a column here would be a lie
    // that some future mapping would then depend on.
    await withTestDb(async (db) => {
      const error = await failureOf(() =>
        db
          .insert(project)
          .values({ id: newId(), workspaceId: "ghost", name: "x", path: "/x", defaultBranch: "main" }),
      );

      expect(constraintKey(error)).toBe("foreignKey");
    });
  });

  it("names a check by its constraint name", async () => {
    await withTestDb(async (db) => {
      const error = await failureOf(() =>
        db.insert(session).values({
          id: newId(),
          kind: "agent",
          scopeType: "worktree",
          scopeId: "w1",
          cwd: "/w",
          command: "claude",
        }),
      );

      expect(constraintKey(error)).toBe("check:session_agent_config");
    });
  });

  it("returns null for something that is not a constraint failure", () => {
    expect(constraintKey(new Error("disk on fire"))).toBeNull();
    expect(constraintKey({ code: "SQLITE_IOERR", message: "disk I/O error" })).toBeNull();
    expect(constraintKey(null)).toBeNull();
    expect(constraintKey("SQLITE_CONSTRAINT_UNIQUE")).toBeNull();
  });
});

describe("withConstraints", () => {
  it("returns the result when nothing fails", async () => {
    await expect(withConstraints(async () => "ok", {})).resolves.toBe("ok");
  });

  it("translates a declared constraint into a domain error", async () => {
    await withTestDb(async (db) => {
      await db.insert(workspace).values({ id: newId(), name: "pessoal" });

      const failure = withConstraints(
        () => db.insert(workspace).values({ id: newId(), name: "pessoal" }),
        { "unique:workspace.name": { code: "DUPLICATE", message: 'já existe um workspace "pessoal"' } },
      );

      await expect(failure).rejects.toThrow(DomainError);
      await expect(failure).rejects.toMatchObject({
        code: "DUPLICATE",
        message: 'já existe um workspace "pessoal"',
      });
    });
  });

  it("keeps the original failure as the cause", async () => {
    await withTestDb(async (db) => {
      await db.insert(agentConfig).values({ id: newId(), name: "claude-code", command: "claude" });

      const error = (await failureOf(() =>
        withConstraints(
          () => db.insert(agentConfig).values({ id: newId(), name: "claude-code", command: "x" }),
          { "unique:agent_config.name": { code: "DUPLICATE", message: "nome em uso" } },
        ),
      )) as DomainError;

      // The daemon's log needs the real text even though the user must not see it.
      expect(String((error.cause as Error).message)).toMatch(/UNIQUE constraint failed/);
    });
  });

  it("does not leak SQLite's wording for a constraint nobody declared", async () => {
    await withTestDb(async (db) => {
      await db.insert(workspace).values({ id: newId(), name: "pessoal" });

      const error = (await failureOf(() =>
        withConstraints(() => db.insert(workspace).values({ id: newId(), name: "pessoal" }), {}),
      )) as DomainError;

      expect(error.code).toBe("CONSTRAINT_VIOLATION");
      expect(error.message).not.toMatch(/UNIQUE|workspace\.name|SQLITE/);
    });
  });

  it("rethrows anything that is not a constraint failure", async () => {
    const boom = new Error("the disk went away");

    await expect(
      withConstraints(() => Promise.reject(boom), {
        "unique:workspace.name": { code: "DUPLICATE", message: "x" },
      }),
    ).rejects.toBe(boom);
  });
});

describe("required", () => {
  it("passes a row through", () => {
    expect(required({ id: "a" }, "missing")).toEqual({ id: "a" });
  });

  it("fails with NOT_FOUND when there is no row", () => {
    expect(() => required(undefined, "no workspace with that id")).toThrow(DomainError);
    expect(() => required(undefined, "no workspace with that id")).toThrow(
      /no workspace with that id/,
    );
  });

  it("treats null as a value, not an absence", () => {
    // A nullable column that came back null is data, and swallowing it as
    // NOT_FOUND would hide the difference.
    expect(required(null, "missing")).toBeNull();
  });
});
