import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_ADAPTER, CODEX_ADAPTER, type AdapterSpec } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { adapterReport, detectAgents, parseVersion, type AdapterReport } from "./agents.js";
import type { CommandRunner } from "./run-command.js";

/**
 * Detection over a fabricated PATH.
 *
 * The directory is real and the executables in it are empty files with the
 * execute bit — which is exactly what `resolveCommandPath` looks for, and what
 * makes "found at this path" testable without installing anything.
 */

const dirs: string[] = [];

/*
 * Uma spec sintética, porque o catálogo deixou de ter uma com `cli`.
 *
 * O `CLAUDE_ADAPTER.cli` caiu para `null` em 2026-09-08 — medido, o `0.75.1`
 * fecha o handshake com o `claude` fora do PATH e spawna o binário de dentro do
 * pacote. O relatório de **dois** binários continua tendo que funcionar: ele
 * descreve a assimetria que o campo existe para dizer, e o terceiro adaptador
 * pode voltar a precisar dela.
 */
const DRIVES_A_CLI: AdapterSpec = {
  ...CLAUDE_ADAPTER,
  cli: { command: "some-agent-cli", install: null },
};
const CLAUDE_CLI = DRIVES_A_CLI.cli!.command;

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
    output: command.endsWith(CLAUDE_ADAPTER.command)
      ? "0.69.0"
      : command.endsWith(CODEX_ADAPTER.command)
        ? "1.10.0"
        : "2.0.14 (Claude Code)",
    failure: null,
  });

/** The entry of one spec, failing loudly rather than returning undefined. */
function entry(
  report: { adapters: readonly AdapterReport[] },
  id = CLAUDE_ADAPTER.id,
): AdapterReport {
  const found = adapterReport(report, id);
  if (found === null) throw new Error(`no report for ${id}`);
  return found;
}

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
  it("reports one entry per spec of the catalogue, in order", async () => {
    const report = await detectAgents({ path: pathWith(), env: {}, run: versions });

    expect(report.adapters.map((adapter) => adapter.id)).toEqual(["claude", "codex"]);
  });

  it("finds both binaries of a spec that drives a CLI, with path and version", async () => {
    const path = pathWith(CLAUDE_CLI, CLAUDE_ADAPTER.command);

    const claude = entry(
      await detectAgents({ path, env: {}, run: versions, specs: [DRIVES_A_CLI] }),
    );

    expect(claude.cli?.path).toBe(join(path, CLAUDE_CLI));
    expect(claude.cli?.version).toBe("2.0.14");
    expect(claude.adapter.path).toBe(join(path, CLAUDE_ADAPTER.command));
    expect(claude.adapter.version).toBe("0.69.0");
  });

  it("reports one binary for a spec that brings its own agent", async () => {
    // Measured (second-agent §4.8): `codex-acp` carries `@openai/codex` through
    // optionalDependencies and answers the handshake with `PATH=/nonexistent`.
    // A second row here would tell someone to install a CLI nobody needs.
    const path = pathWith(CODEX_ADAPTER.command);

    const codex = entry(await detectAgents({ path, env: {}, run: versions }), "codex");

    expect(codex.cli).toBeNull();
    expect(codex.adapter.path).toBe(join(path, CODEX_ADAPTER.command));
    expect(codex.adapter.version).toBe("1.10.0");
  });

  it("names the label from the catalogue, never the npm coordinate", async () => {
    const codex = entry(await detectAgents({ path: pathWith(), env: {}, run: versions }), "codex");

    expect(codex.label).toBe("Codex");
  });

  it("hands over the install command for the adapter, with the measured package", async () => {
    // The design drew `@zed-industries/claude-code-acp`, which is not what this
    // daemon executes. Sending someone to install the wrong package is the worst
    // failure this screen can have.
    const claude = entry(await detectAgents({ path: pathWith(), env: {}, run: versions }));

    expect(claude.adapter.path).toBeNull();
    expect(claude.adapter.install).toContain(CLAUDE_ADAPTER.package);
    expect(claude.adapter.install).toContain(CLAUDE_ADAPTER.pinnedVersion);
    expect(claude.adapter.install).not.toContain("zed-industries");
  });

  it("never offers to install the CLI it does not ship", async () => {
    // Lido pela spec sintética desde 2026-09-08: o Claude deixou de ter `cli`, e um
    // `?.` num campo que é sempre `null` seria um teste que passa por ausência.
    const claude = entry(
      await detectAgents({ path: pathWith(), env: {}, run: versions, specs: [DRIVES_A_CLI] }),
    );

    expect(claude.cli).not.toBeNull();
    expect(claude.cli?.install).toBeNull();
  });

  it("prefers the copy the daemon installed over one on the PATH", async () => {
    const path = pathWith(CLAUDE_ADAPTER.command);
    const managed = pathWith(CLAUDE_ADAPTER.command);

    const claude = entry(
      await detectAgents({
        path,
        env: {},
        run: versions,
        installedAt: (spec) => join(managed, spec.command),
      }),
    );

    expect(claude.adapter.path).toBe(join(managed, CLAUDE_ADAPTER.command));
    expect(claude.adapter.managed).toBe(true);
  });

  it("asks the installed path per spec, so two adapters do not share one", async () => {
    const managed = pathWith(CLAUDE_ADAPTER.command, CODEX_ADAPTER.command);
    const asked: string[] = [];

    const report = await detectAgents({
      path: pathWith(),
      env: {},
      run: versions,
      installedAt: (spec) => {
        asked.push(spec.id);
        return join(managed, spec.command);
      },
    });

    expect(asked).toEqual(["claude", "codex"]);
    expect(entry(report, "codex").adapter.path).toBe(join(managed, CODEX_ADAPTER.command));
  });

  it("keeps a binary that will not say its version usable", async () => {
    // What decides the step is the probe, not `--version` (O7). A binary that
    // hangs on it is still a binary.
    const path = pathWith(CLAUDE_ADAPTER.command);
    const claude = entry(
      await detectAgents({
        path,
        env: {},
        run: () => Promise.resolve({ ok: false, output: "", failure: "não respondeu em 3000 ms" }),
      }),
    );

    expect(claude.adapter.path).toBe(join(path, CLAUDE_ADAPTER.command));
    expect(claude.adapter.version).toBeNull();
    expect(claude.adapter.versionNote).toContain("não respondeu");
  });

  it("reads the version off the package when the binary says nothing", async () => {
    /*
     * LUM-54: `claude-agent-acp@0.40.0` answers `--version` with an **empty
     * string** and exit 0. The version that most needed reporting was the one
     * version this screen could not report, and the row read "não disse a
     * versão" instead of "0.40.0" — a number that would have named the defect.
     */
    const dir = mkdtempSync(join(tmpdir(), "lumem-pkg-"));
    dirs.push(dir);
    const pkg = join(dir, "node_modules", ...CLAUDE_ADAPTER.package!.split("/"));
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: CLAUDE_ADAPTER.package, version: "0.40.0" }),
    );
    const entryFile = join(pkg, "dist", "index.js");
    mkdirSync(join(pkg, "dist"), { recursive: true });
    writeFileSync(entryFile, "");
    chmodSync(entryFile, 0o755);
    // The link npm writes, and the reason the lookup follows it: a global install
    // puts the launcher in `<prefix>/bin` and the package under
    // `<prefix>/lib/node_modules`, so no relative walk from the launcher works.
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const binary = join(bin, CLAUDE_ADAPTER.command);
    symlinkSync(entryFile, binary);

    const claude = entry(
      await detectAgents({
        path: bin,
        env: {},
        run: () => Promise.resolve({ ok: true, output: "", failure: null }),
      }),
    );

    expect(claude.adapter.version).toBe("0.40.0");
    expect(claude.adapter.versionNote).toBeNull();
  });

  it("still says nothing for a binary that is not a package", async () => {
    // The fallback is a manifest lookup, not a guess: a hand-built binary has no
    // package to read, and inventing a version for it would be worse than
    // reporting that nobody said one.
    const path = pathWith(CLAUDE_ADAPTER.command);
    const claude = entry(
      await detectAgents({
        path,
        env: {},
        run: () => Promise.resolve({ ok: true, output: "", failure: null }),
      }),
    );

    expect(claude.adapter.version).toBeNull();
    expect(claude.adapter.versionNote).toBe("não disse a versão");
  });

  it("reads the version off stderr too", async () => {
    const claude = entry(
      await detectAgents({
        path: pathWith(CLAUDE_ADAPTER.command),
        env: {},
        // `runCommand` already folds stderr into `output`; this asserts the
        // detection does not care which stream it came from.
        run: () => Promise.resolve({ ok: false, output: "2.0.14", failure: "exit 1" }),
      }),
    );

    expect(claude.adapter.version).toBe("2.0.14");
  });

  it("reports one binary for Claude too, since the adapter stopped driving one", async () => {
    // As três medições estão no comentário do `CLAUDE_ADAPTER.cli`. Aqui interessa
    // a consequência de tela: o primeiro acesso parava de pedir a instalação de um
    // CLI que ninguém usa.
    const claude = entry(
      await detectAgents({ path: pathWith(CLAUDE_ADAPTER.command), env: {}, run: versions }),
    );

    expect(claude.cli).toBeNull();
  });

  it("reports the name of the key variable it found, and never its value", async () => {
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

    expect(entry(withKey).apiKeyEnv).toBe("ANTHROPIC_API_KEY");
    expect(entry(without).apiKeyEnv).toBeNull();
    // An empty variable is not a credential, and reporting it as one would send
    // someone looking for a key that cannot work.
    expect(entry(blank).apiKeyEnv).toBeNull();
    expect(JSON.stringify(withKey)).not.toContain(secret);
  });

  it("reads each spec's own variables, and not the other one's", async () => {
    // The trap a single `ANTHROPIC_API_KEY` constant produced: a Codex row that
    // says "billing by token" because a Claude key is in the environment.
    const report = await detectAgents({
      path: pathWith(),
      env: { OPENAI_API_KEY: "sk-openai" },
      run: versions,
    });

    expect(entry(report, "codex").apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(entry(report, "claude").apiKeyEnv).toBeNull();
  });

  it("prefers the first variable the spec lists when both are set", async () => {
    const report = await detectAgents({
      path: pathWith(),
      env: { CODEX_API_KEY: "a", OPENAI_API_KEY: "b" },
      run: versions,
    });

    expect(entry(report, "codex").apiKeyEnv).toBe("CODEX_API_KEY");
  });
});
