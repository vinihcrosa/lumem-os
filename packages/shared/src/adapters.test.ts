import { describe, expect, it } from "vitest";

import {
  ADAPTERS,
  CLAUDE_ADAPTER,
  CODEX_ADAPTER,
  DEFAULT_ADAPTER_ID,
  adapterByCommand,
  adapterById,
  adapterInstallCommand,
} from "./adapters.js";

describe("ADAPTERS", () => {
  it("has the two agents the product speaks ACP with", () => {
    expect(ADAPTERS.map((spec) => spec.id)).toEqual(["claude", "codex"]);
  });

  it("keeps ids and commands unique, because both are used as keys", () => {
    // The id names a directory under `<stateDir>/adapters`, and the command is
    // how a running session is recognised. A duplicate in either would have two
    // adapters overwrite each other's install.
    expect(new Set(ADAPTERS.map((spec) => spec.id)).size).toBe(ADAPTERS.length);
    expect(new Set(ADAPTERS.map((spec) => spec.command)).size).toBe(ADAPTERS.length);
  });

  it("pins a literal version, never a range and never `latest`", () => {
    // A12. An overnight release of a third-party adapter must not change how the
    // agent behaves without someone having reviewed it — and a caret would do
    // exactly that while still looking pinned.
    for (const spec of ADAPTERS) {
      expect(spec.pinnedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("never takes the label from the package name", () => {
    // Measured (second-agent §4.1): `agentInfo.name` of codex-acp is
    // `@agentclientprotocol/codex-acp`. A screen that shows that string is
    // showing an npm coordinate to a person choosing an agent.
    for (const spec of ADAPTERS) {
      expect(spec.label).not.toBe(spec.package);
      expect(spec.label).not.toContain("@agentclientprotocol");
      expect(spec.label.trim()).not.toBe("");
    }
  });

  it("defaults to the adapter the first run installs", () => {
    expect(adapterById(DEFAULT_ADAPTER_ID)).toBe(CLAUDE_ADAPTER);
  });
});

describe("the claude spec", () => {
  it("carries the five strings that used to be constants", () => {
    // The reason this test is literal: the migration from constants to a
    // catalogue is only safe if the claude values are byte-identical. Anything
    // else silently reinstalls, or probes a binary nobody has.
    expect(CLAUDE_ADAPTER).toMatchObject({
      command: "claude-agent-acp",
      package: "@agentclientprotocol/claude-agent-acp",
      pinnedVersion: "0.75.1",
      cli: null,
      apiKeyEnv: ["ANTHROPIC_API_KEY"],
    });
  });

  it("does not drive a CLI from the PATH any more", () => {
    /*
     * Isto **reverte** `"drives a CLI that has to exist"`, que afirmava
     * `cli.command === "claude"`. A afirmação era verdade no `0.40.0`; três
     * medições em 2026-09-08 a derrubaram para o `0.75.1`, e estão escritas no
     * comentário do campo:
     *
     * - `initialize` + `session/new` fecham com o `claude` fora do PATH;
     * - o daemon spawna `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`,
     *   de dentro do pacote;
     * - os `authMethods` pedem `--cli auth login`, do próprio adaptador.
     *
     * O [ADR de
     * 2026-09-08](../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
     * é quem decide. O campo continua existindo — ver `agents.test.ts`, que o
     * exercita com uma spec sintética.
     */
    expect(CLAUDE_ADAPTER.cli).toBeNull();
  });

  it("is not pinned at the version whose embedded runtime the API refuses", () => {
    /*
     * LUM-54, and the reason this assertion names a number instead of a shape:
     * `0.40.0` embeds `@anthropic-ai/claude-agent-sdk@0.3.160` — Claude Code
     * `2.1.160` — and the API answers `session/prompt` with *"version 2.1.251 or
     * newer is required"*. Every turn died on a clean install, and the `claude`
     * of the PATH cannot help: the runtime that answers is the one inside the
     * adapter.
     *
     * A `not.toBe` rather than a comparison because there is no ordering to
     * check here — this is a known-bad version, and going back to it should cost
     * whoever does it a red test with the reason written down. What the version
     * *is* was measured, and is asserted above.
     */
    expect(CLAUDE_ADAPTER.pinnedVersion).not.toBe("0.40.0");
  });
});

describe("the codex spec", () => {
  it("brings its own CLI, so the spec declares none", () => {
    // Measured (§4.8): `codex-acp` depends on `@openai/codex` through
    // optionalDependencies, and the handshake answers with `PATH=/nonexistent`.
    // Giving it a `cli` "for symmetry" would make the pre-flight demand a binary
    // that nobody needs to install, and refuse a machine that works.
    expect(CODEX_ADAPTER.cli).toBeNull();
  });

  it("accepts either of the two key variables the adapter reads", () => {
    expect(CODEX_ADAPTER.apiKeyEnv).toEqual(["CODEX_API_KEY", "OPENAI_API_KEY"]);
  });

  it("is pinned at the version phase 0 measured", () => {
    expect(CODEX_ADAPTER.pinnedVersion).toBe("1.10.0");
  });
});

describe("adapterById", () => {
  it("answers null for an id nobody catalogued", () => {
    // Null rather than a throw: the caller translates it into the error of its
    // own floor, and the code that builds an error message cannot fail while
    // building an error message.
    expect(adapterById("gemini")).toBeNull();
  });
});

describe("adapterByCommand", () => {
  it("recognises a running adapter by its binary", () => {
    expect(adapterByCommand("codex-acp")).toBe(CODEX_ADAPTER);
  });

  it("does not guess for a command outside the catalogue", () => {
    // The `remedy` of a failed spawn depends on this: suggesting an npm package
    // for a command the product never catalogued would send someone to install
    // the wrong thing.
    expect(adapterByCommand("/opt/homebrew/bin/some-agent")).toBeNull();
  });
});

describe("adapterInstallCommand", () => {
  it("pins the version in the command it suggests", () => {
    expect(adapterInstallCommand(CODEX_ADAPTER)).toBe(
      "npm i -g @agentclientprotocol/codex-acp@1.10.0",
    );
  });

  it("suggests nothing for a spec with no package", () => {
    // A native agent has no adapter to install; the pre-flight says which binary
    // is missing instead of inventing an npm coordinate for it.
    expect(adapterInstallCommand({ ...CODEX_ADAPTER, package: null })).toBeNull();
  });
});
