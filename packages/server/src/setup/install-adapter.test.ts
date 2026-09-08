import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_ADAPTER, CODEX_ADAPTER, type AdapterSpec } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adapterBinaryPath,
  adapterDir,
  installAdapter,
  legacyAdapterBinaryPath,
} from "./install-adapter.js";
import type { CommandRunner } from "./run-command.js";

/**
 * The install, without downloading anything.
 *
 * `npm` is a seam here for the obvious reason — a test that hits the registry is a
 * test that fails on a plane — but also because the cases worth checking are the
 * ones a working network cannot produce: npm missing, npm succeeding while writing
 * nothing, npm failing with something the user needs to read.
 */

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-adapters-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * An npm that "installs" by writing what the real one writes: the binary, and
 * the package manifest that says which version it is.
 *
 * The manifest is not decoration — it is what `installAdapter` reads to tell an
 * install at the pinned version from a stale one (LUM-54). A fake that skipped it
 * would only ever exercise the "version unknown" branch.
 */
function fakeNpm(
  dir: string,
  spec: AdapterSpec = CLAUDE_ADAPTER,
  version: string = spec.pinnedVersion,
): CommandRunner {
  return vi.fn(async () => {
    writeInstall(adapterDir(dir, spec), spec, version);
    return { ok: true, output: "added 1 package", failure: null };
  });
}

/** The two files an install leaves behind, at a version of the test's choosing. */
function writeInstall(root: string, spec: AdapterSpec, version: string | null): void {
  const bin = join(root, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, spec.command), "");
  if (version === null) return;
  const pkg = join(root, "node_modules", ...(spec.package ?? "").split("/"));
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: spec.package, version }));
}

function argsOf(run: CommandRunner): [string, string[]] {
  return (run as unknown as { mock: { calls: [string, string[]][] } }).mock.calls[0]!;
}

describe("installAdapter", () => {
  it("installs into the daemon's own directory, at the pinned version", async () => {
    const dir = tempDir();
    const run = fakeNpm(dir);

    const result = await installAdapter({ dir, run });

    expect(result).toEqual({
      path: adapterBinaryPath(dir),
      version: CLAUDE_ADAPTER.pinnedVersion,
      alreadyInstalled: false,
    });

    // The arguments are the point of this assertion: `--prefix`, never `-g`, and
    // an exact version rather than a range. An overnight release of a
    // third-party adapter must not change how the agent behaves.
    const [command, args] = argsOf(run);
    expect(command).toBe("npm");
    expect(args).toContain("--prefix");
    expect(args).toContain(adapterDir(dir, CLAUDE_ADAPTER));
    expect(args).toContain(`${CLAUDE_ADAPTER.package}@${CLAUDE_ADAPTER.pinnedVersion}`);
    expect(args).not.toContain("-g");
    expect(args.join(" ")).not.toContain("@latest");
  });

  it("gives each spec a directory of its own", async () => {
    // Two adapters in one `node_modules` would have the second install resolve
    // the first one's dependency tree — and the second agent's whole point is
    // that neither of them is special.
    const dir = tempDir();
    const run = fakeNpm(dir, CODEX_ADAPTER);

    const result = await installAdapter({ spec: CODEX_ADAPTER, dir, run });

    expect(result.path).toBe(join(dir, "codex", "node_modules", ".bin", "codex-acp"));
    expect(result.version).toBe(CODEX_ADAPTER.pinnedVersion);
    expect(argsOf(run)[1]).toContain(
      `${CODEX_ADAPTER.package}@${CODEX_ADAPTER.pinnedVersion}`,
    );
  });

  it("does not install one spec when the other is already there", async () => {
    const dir = tempDir();
    await installAdapter({ dir, run: fakeNpm(dir) });

    const run = fakeNpm(dir, CODEX_ADAPTER);
    const codex = await installAdapter({ spec: CODEX_ADAPTER, dir, run });

    expect(codex.alreadyInstalled).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });

  it("does nothing when it is already there", async () => {
    // Idempotent, because the flow can be walked twice and a second install of
    // the same version is two minutes of nothing.
    const dir = tempDir();
    await installAdapter({ dir, run: fakeNpm(dir) });

    const run = vi.fn();
    const again = await installAdapter({ dir, run: run as unknown as CommandRunner });

    expect(again.alreadyInstalled).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("still finds the adapter installed before the catalogue existed", async () => {
    // The flat `<adaptersDir>/node_modules/.bin/claude-agent-acp` of every
    // machine that ran the product before the second agent. Without this, an
    // upgrade redownloads 255 MB on the first boot to reach the same binary.
    const dir = tempDir();
    const legacy = legacyAdapterBinaryPath(dir, CLAUDE_ADAPTER);
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(legacy, "");

    const run = vi.fn();
    const result = await installAdapter({ dir, run: run as unknown as CommandRunner });

    expect(result).toEqual({
      path: legacy,
      version: CLAUDE_ADAPTER.pinnedVersion,
      alreadyInstalled: true,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("reinstalls when what is there is not the version that is pinned", async () => {
    /*
     * LUM-54, in the place that hid it.
     *
     * Any existing binary used to be accepted, and reported as the pinned
     * version. So the day the pin moved, every machine that had already run the
     * product kept launching the old adapter — and the screen said the new
     * number. The version on disk is what decides, and 0.40.0 is exactly the
     * case: an embedded runtime the API refuses.
     */
    const dir = tempDir();
    writeInstall(adapterDir(dir, CLAUDE_ADAPTER), CLAUDE_ADAPTER, "0.40.0");

    const run = fakeNpm(dir);
    const result = await installAdapter({ dir, run });

    expect(run).toHaveBeenCalledOnce();
    expect(argsOf(run)[1]).toContain(
      `${CLAUDE_ADAPTER.package}@${CLAUDE_ADAPTER.pinnedVersion}`,
    );
    expect(result).toEqual({
      path: adapterBinaryPath(dir),
      version: CLAUDE_ADAPTER.pinnedVersion,
      alreadyInstalled: false,
    });
  });

  it("reports the version it found, not the version it wanted", async () => {
    // The field is a report, not a restatement of the constant. When they differ
    // and nothing can be done about it — an unreadable layout aside — saying the
    // pin is how a stale adapter goes unnoticed.
    const dir = tempDir();
    const run = fakeNpm(dir, CLAUDE_ADAPTER, "0.76.0");

    const result = await installAdapter({ dir, run });

    expect(result.version).toBe("0.76.0");
  });

  it("leaves an install it cannot read the version of alone", async () => {
    // No manifest: a layout this daemon did not write. Redownloading 255 MB on a
    // guess is worse than reporting the pin and letting the probe answer.
    const dir = tempDir();
    writeInstall(adapterDir(dir, CLAUDE_ADAPTER), CLAUDE_ADAPTER, null);

    const run = vi.fn();
    const result = await installAdapter({ dir, run: run as unknown as CommandRunner });

    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: adapterBinaryPath(dir),
      version: CLAUDE_ADAPTER.pinnedVersion,
      alreadyInstalled: true,
    });
  });

  it("installs into its own directory when the legacy copy is stale", async () => {
    // The pre-catalogue flat directory is not upgraded in place: the install
    // writes to the spec's directory, which is also the one the daemon looks in
    // first.
    const dir = tempDir();
    writeInstall(dir, CLAUDE_ADAPTER, "0.40.0");

    const run = fakeNpm(dir);
    const result = await installAdapter({ dir, run });

    expect(run).toHaveBeenCalledOnce();
    expect(result.path).toBe(adapterBinaryPath(dir));
    expect(result.alreadyInstalled).toBe(false);
  });

  it("prefers the directory of the spec over the legacy one", async () => {
    // Both present: the per-spec install is the one this version wrote, and the
    // legacy copy is whatever an older daemon left behind.
    const dir = tempDir();
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(legacyAdapterBinaryPath(dir, CLAUDE_ADAPTER), "");
    mkdirSync(join(adapterDir(dir, CLAUDE_ADAPTER), "node_modules", ".bin"), { recursive: true });
    writeFileSync(adapterBinaryPath(dir, CLAUDE_ADAPTER), "");

    const result = await installAdapter({ dir, run: vi.fn() as unknown as CommandRunner });

    expect(result.path).toBe(adapterBinaryPath(dir));
  });

  /*
   * As duas asserções que estavam aqui — "acha no PATH" e "diz qual binário falta"
   * — descreviam o comportamento que o [ADR de
   * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
   * reverteu. Elas não foram consertadas: o que elas provavam deixou de ser
   * verdade, e a costura `resolve` que ambas usavam existia só para esse ramo.
   */
  it("refuses a package-less spec instead of resolving it on the PATH", async () => {
    const dir = tempDir();
    const run = vi.fn();
    const native: AdapterSpec = { ...CODEX_ADAPTER, package: null, command: "gemini" };

    await expect(
      installAdapter({ spec: native, dir, run: run as unknown as CommandRunner }),
    ).rejects.toThrow(/não lança adaptador vindo do PATH/);
    // E nem tenta o npm: uma spec sem pacote não tem o que baixar, e a recusa é
    // sobre proveniência, não sobre rede.
    expect(run).not.toHaveBeenCalled();
  });

  it("passes npm's own words on, because they are better than a translation", async () => {
    const dir = tempDir();

    await expect(
      installAdapter({
        dir,
        run: () =>
          Promise.resolve({
            ok: false,
            output: "npm error code ENOTFOUND\nnpm error network request to registry failed",
            failure: "exit 1",
          }),
      }),
    ).rejects.toThrow(/ENOTFOUND/);
  });

  it("refuses when npm is not on the machine at all", async () => {
    const dir = tempDir();

    await expect(
      installAdapter({
        dir,
        run: () => Promise.resolve({ ok: false, output: "", failure: "spawn npm ENOENT" }),
      }),
    ).rejects.toThrow(/ENOENT/);
  });

  it("refuses when npm claims success and wrote nothing", async () => {
    // The failure mode of a package that changed its layout: exit 0, no binary.
    // Reporting success here would produce an `agent_config` pointing at a path
    // that does not exist, and the error would surface at the first conversation.
    const dir = tempDir();

    await expect(
      installAdapter({
        dir,
        run: () => Promise.resolve({ ok: true, output: "up to date", failure: null }),
      }),
    ).rejects.toThrow(/não existe/);
  });

  it("names the package of the spec it was asked for when the layout changed", async () => {
    const dir = tempDir();

    await expect(
      installAdapter({
        spec: CODEX_ADAPTER,
        dir,
        run: () => Promise.resolve({ ok: true, output: "up to date", failure: null }),
      }),
    ).rejects.toThrow(/codex-acp/);
  });
});
