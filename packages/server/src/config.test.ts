import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const TOUCHED = ["LUMEM_PORT", "LUMEM_HOST", "LUMEM_STATE_DIR", "LUMEM_DB_PATH"] as const;

afterEach(() => {
  for (const key of TOUCHED) delete process.env[key];
});

describe("loadConfig", () => {
  it("defaults to a loopback bind", () => {
    expect(loadConfig().host).toBe("127.0.0.1");
  });

  it("reads the port from the environment", () => {
    process.env["LUMEM_PORT"] = "5000";
    expect(loadConfig().port).toBe(5000);
  });

  it("derives the database and worktree paths from the state dir", () => {
    process.env["LUMEM_STATE_DIR"] = "/tmp/lumem-test";
    const config = loadConfig();
    expect(config.databasePath).toBe("/tmp/lumem-test/lumem.db");
    expect(config.worktreesDir).toBe("/tmp/lumem-test/worktrees");
  });

  it("rejects a port that is not a valid number", () => {
    process.env["LUMEM_PORT"] = "not-a-port";
    expect(() => loadConfig()).toThrow(/must be an integer/);
  });

  it("rejects a port outside the valid range", () => {
    process.env["LUMEM_PORT"] = "70000";
    expect(() => loadConfig()).toThrow(/must be an integer/);
  });
});
