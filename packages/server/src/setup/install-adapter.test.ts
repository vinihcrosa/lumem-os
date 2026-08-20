import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACP_ADAPTER_PACKAGE, ACP_ADAPTER_PINNED_VERSION } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { adapterBinaryPath, installAdapter } from "./install-adapter.js";
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

/** An npm that "installs" by creating the binary the real one would. */
function fakeNpm(dir: string): CommandRunner {
  return vi.fn(async () => {
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "claude-agent-acp"), "");
    return { ok: true, output: "added 1 package", failure: null };
  });
}

describe("installAdapter", () => {
  it("installs into the daemon's own directory, at the pinned version", async () => {
    const dir = tempDir();
    const run = fakeNpm(dir);

    const result = await installAdapter({ dir, run });

    expect(result).toEqual({
      path: adapterBinaryPath(dir),
      version: ACP_ADAPTER_PINNED_VERSION,
      alreadyInstalled: false,
    });

    // The arguments are the point of this assertion: `--prefix`, never `-g`, and
    // an exact version rather than a range. An overnight release of a
    // third-party adapter must not change how the agent behaves.
    const [command, args] = (run as unknown as { mock: { calls: [string, string[]][] } }).mock
      .calls[0]!;
    expect(command).toBe("npm");
    expect(args).toContain("--prefix");
    expect(args).toContain(dir);
    expect(args).toContain(`${ACP_ADAPTER_PACKAGE}@${ACP_ADAPTER_PINNED_VERSION}`);
    expect(args).not.toContain("-g");
    expect(args.join(" ")).not.toContain("@latest");
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
});
