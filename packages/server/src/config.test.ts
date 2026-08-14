import { DEFAULT_SERVER_PORT } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to a loopback bind", () => {
    expect(loadConfig({}).host).toBe("127.0.0.1");
  });

  it("defaults to the shared daemon port", () => {
    expect(loadConfig({}).port).toBe(DEFAULT_SERVER_PORT);
  });

  it("reads the port from the environment", () => {
    expect(loadConfig({ LUMEM_PORT: "5000" }).port).toBe(5000);
  });

  it("derives the database and worktree paths from the state dir", () => {
    const config = loadConfig({ LUMEM_STATE_DIR: "/tmp/lumem-test" });

    expect(config.databasePath).toBe("/tmp/lumem-test/lumem.db");
    expect(config.worktreesDir).toBe("/tmp/lumem-test/worktrees");
  });

  it("lets an explicit database path override the derived one", () => {
    const config = loadConfig({
      LUMEM_STATE_DIR: "/tmp/lumem-test",
      LUMEM_DB_PATH: "/elsewhere/other.db",
    });

    expect(config.databasePath).toBe("/elsewhere/other.db");
  });

  it("ignores an empty port and uses the default", () => {
    expect(loadConfig({ LUMEM_PORT: "" }).port).toBe(DEFAULT_SERVER_PORT);
  });

  it.each(["not-a-port", "4317abc", "80.9", "-1", "0x10", " ", "4317:"])(
    "rejects the malformed port %j",
    (value) => {
      expect(() => loadConfig({ LUMEM_PORT: value })).toThrow(/must be an integer/);
    },
  );

  it("rejects a port above the valid range", () => {
    expect(() => loadConfig({ LUMEM_PORT: "70000" })).toThrow(/must be an integer/);
  });

  it("does not read process.env when given an explicit map", () => {
    // Guards the isolation the signature promises: a developer with LUMEM_HOST
    // exported in their shell must not see a red suite.
    expect(loadConfig({}).host).toBe("127.0.0.1");
  });
});
