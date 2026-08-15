import { existsSync } from "node:fs";

import { newId } from "@lumem/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { workspace } from "./schema.js";
import { withTestDb } from "./testing.js";

describe("withTestDb", () => {
  it("hands over a migrated database", async () => {
    await withTestDb(async (db) => {
      await db.insert(workspace).values({ id: newId(), name: "pessoal" });

      expect(await db.select().from(workspace)).toHaveLength(1);
    });
  });

  it("gives concurrent tests databases of their own", async () => {
    // This is what the coverage matrix means by parallel-safe. If it ever
    // stops holding, the whole server suite starts failing by interference.
    const names = await Promise.all(
      ["a", "b", "c"].map((name) =>
        withTestDb(async (db) => {
          await db.insert(workspace).values({ id: newId(), name });
          const rows = await db.select().from(workspace);
          return rows.map((row) => row.name);
        }),
      ),
    );

    expect(names).toEqual([["a"], ["b"], ["c"]]);
  });

  it("deletes the file afterwards", async () => {
    let path = "";
    await withTestDb(async (db) => {
      const [row] = await db.all<{ file: string }>(sql`PRAGMA database_list`);
      path = (row as unknown as { file: string }).file;
      expect(existsSync(path)).toBe(true);
    });

    expect(existsSync(path)).toBe(false);
  });

  it("cleans up even when the body throws", async () => {
    let path = "";

    await expect(
      withTestDb(async (db) => {
        const [row] = await db.all<{ file: string }>(sql`PRAGMA database_list`);
        path = (row as unknown as { file: string }).file;
        throw new Error("the test failed");
      }),
    ).rejects.toThrow("the test failed");

    // A failing test that leaves a locked -wal behind poisons the next run.
    expect(existsSync(path)).toBe(false);
  });

  it("returns what the body returns", async () => {
    await expect(withTestDb(async () => 42)).resolves.toBe(42);
  });
});
