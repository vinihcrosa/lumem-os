import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACP_ADAPTER_COMMAND, ACP_ADAPTER_PACKAGE, CLAUDE_CLI_COMMAND } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { detectAgents, parseVersion } from "./agents.js";
import type { CommandRunner } from "./run-command.js";

/**
 * Detection over a fabricated PATH.
 *
 * The directory is real and the executables in it are empty files with the
 * execute bit — which is exactly what `resolveCommandPath` looks for, and what
 * makes "found at this path" testable without installing anything.
 */

const dirs: string[] = [];

function pathWith(...commands: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-bin-"));
  dirs.push(dir);
  for (const command of commands) {
    const file = join(dir, command);
    writeFileSync(file, "");
    chmodSync(file, 0o755);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const versions: CommandRunner = (command) =>
  Promise.resolve({
    ok: true,
    output: command.endsWith(ACP_ADAPTER_COMMAND) ? "0.69.0" : "2.0.14 (Claude Code)",
    failure: null,
  });

describe("parseVersion", () => {
  it("pulls the version out of whatever the binary printed", () => {
    expect(parseVersion("2.0.14 (Claude Code)")).toBe("2.0.14");
    expect(parseVersion("claude-agent-acp/0.69.0 darwin-arm64")).toBe("0.69.0");
  });

  it("keeps a shapeless answer rather than dropping it", () => {
    // A binary that answers something unexpected still answered. Showing it
    // beats claiming the version is unknown.
    expect(parseVersion("beta")).toBe("beta");
    expect(parseVersion("   ")).toBeNull();
  });
});

describe("detectAgents", () => {
  it("finds both, with path and version", async () => {
    const path = pathWith(CLAUDE_CLI_COMMAND, ACP_ADAPTER_COMMAND);

    const report = await detectAgents({ path, env: {}, run: versions });

    expect(report.claude.path).toBe(join(path, CLAUDE_CLI_COMMAND));
    expect(report.claude.version).toBe("2.0.14");
    expect(report.adapter.path).toBe(join(path, ACP_ADAPTER_COMMAND));
    expect(report.adapter.version).toBe("0.69.0");
  });

  it("hands over the install command for the adapter, with the measured package", async () => {
    // The design drew `@zed-industries/claude-code-acp`, which is not what this
    // daemon executes. Sending someone to install the wrong package is the worst
    // failure this screen can have.
    const report = await detectAgents({ path: pathWith(), env: {}, run: versions });

    expect(report.adapter.path).toBeNull();
    expect(report.adapter.install).toContain(ACP_ADAPTER_PACKAGE);
    expect(report.adapter.install).not.toContain("zed-industries");
  });

  it("never offers to install the CLI it does not ship", async () => {
    const report = await detectAgents({ path: pathWith(), env: {}, run: versions });
    expect(report.claude.install).toBeNull();
  });

  it("keeps a binary that will not say its version usable", async () => {
    // What decides the step is the probe, not `--version` (O7). A binary that
    // hangs on it is still a binary.
    const path = pathWith(ACP_ADAPTER_COMMAND);
    const report = await detectAgents({
      path,
      env: {},
      run: () => Promise.resolve({ ok: false, output: "", failure: "não respondeu em 3000 ms" }),
    });

    expect(report.adapter.path).toBe(join(path, ACP_ADAPTER_COMMAND));
    expect(report.adapter.version).toBeNull();
    expect(report.adapter.versionNote).toContain("não respondeu");
  });

  it("reads the version off stderr too", async () => {
    const report = await detectAgents({
      path: pathWith(CLAUDE_CLI_COMMAND),
      env: {},
      // `runCommand` already folds stderr into `output`; this asserts the
      // detection does not care which stream it came from.
      run: () => Promise.resolve({ ok: false, output: "2.0.14", failure: "exit 1" }),
    });

    expect(report.claude.version).toBe("2.0.14");
  });

  it("reports the API key as present or absent, and never its value", async () => {
    const secret = "sk-ant-do-not-echo-me";

    const withKey = await detectAgents({
      path: pathWith(),
      env: { ANTHROPIC_API_KEY: secret },
      run: versions,
    });
    const without = await detectAgents({ path: pathWith(), env: {}, run: versions });
    const blank = await detectAgents({
      path: pathWith(),
      env: { ANTHROPIC_API_KEY: "   " },
      run: versions,
    });

    expect(withKey.apiKeyInEnv).toBe(true);
    expect(without.apiKeyInEnv).toBe(false);
    // An empty variable is not a credential, and reporting it as one would send
    // someone looking for a key that cannot work.
    expect(blank.apiKeyInEnv).toBe(false);
    expect(JSON.stringify(withKey)).not.toContain(secret);
  });
});
