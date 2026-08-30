import { homedir } from "node:os";
import { join } from "node:path";

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

  it("derives the database and workspace paths from the state dir", () => {
    const config = loadConfig({ LUMEM_STATE_DIR: "/tmp/lumem-test" });

    expect(config.databasePath).toBe("/tmp/lumem-test/lumem.db");
    expect(config.workspacesDir).toBe("/tmp/lumem-test/workspaces");
    expect(config.transcriptsDir).toBe("/tmp/lumem-test/transcripts");
  });

  it("resolves a state dir written with ~ or relative to the cwd", () => {
    // Every path the daemon computes hangs off this one, including the ones it
    // later deletes from. A literal `~` is a directory named `~`, and a relative
    // one moves with whatever directory the daemon happened to start in.
    expect(loadConfig({ LUMEM_STATE_DIR: "~/estado" }).workspacesDir).toBe(
      join(homedir(), "estado", "workspaces"),
    );
    expect(loadConfig({ LUMEM_STATE_DIR: "estado" }).workspacesDir).toBe(
      join(process.cwd(), "estado", "workspaces"),
    );
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

  it("tolerates surrounding whitespace", () => {
    // Deliberate: a value pasted from a shell often carries padding.
    expect(loadConfig({ LUMEM_PORT: " 4317 " }).port).toBe(4317);
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

  it("uses the login shell", () => {
    expect(loadConfig({ SHELL: "/usr/bin/fish" }).shell).toBe("/usr/bin/fish");
  });

  it.each(["", undefined])("falls back to /bin/sh when SHELL is %j", (value) => {
    // SHELL is unset under launchd and in most containers, and a daemon that
    // cannot open a shell there is a daemon that cannot start a session.
    expect(loadConfig(value === undefined ? {} : { SHELL: value }).shell).toBe("/bin/sh");
  });

  it("defaults the session directory to the user's home", () => {
    expect(loadConfig({}).defaultCwd).toBe(homedir());
  });

  it("takes the session directory from the environment", () => {
    expect(loadConfig({ LUMEM_DEFAULT_CWD: "/srv/work" }).defaultCwd).toBe("/srv/work");
  });
});
