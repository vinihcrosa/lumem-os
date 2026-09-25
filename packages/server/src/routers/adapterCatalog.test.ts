import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { ADAPTERS, CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import type { AcpCommand } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { adapterBinaryPath } from "../setup/install-adapter.js";
import { adaptersDir } from "../setup/adapter-command.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * `adapterCatalog.list` (`033` §3.1, T9) — o que a pílula de modelo e o menu `/`
 * do rascunho leem antes de existir sessão.
 *
 * `installed` é proveniência, como no `setup.test.ts`: um arquivo vazio no lugar
 * da cópia gerenciada basta, porque ninguém o executa aqui.
 */

let context: TestCaller | undefined;

afterEach(async () => {
  await context?.cleanup();
  context = undefined;
  cleanupGitFixtures();
});

function stageManagedAdapter(stateDir: string, spec = CLAUDE_ADAPTER): void {
  const binary = adapterBinaryPath(adaptersDir(stateDir), spec);
  mkdirSync(dirname(binary), { recursive: true });
  writeFileSync(binary, "");
}

const REVIEW: AcpCommand = { name: "review", description: "Review the diff", takesInput: false };
const DEPLOY: AcpCommand = { name: "deploy", description: "Ship it", takesInput: true };

describe("adapterCatalog.list", () => {
  it("answers one reading per adapter, in ADAPTERS order, none installed and never probed", async () => {
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });

    const views = await context.api.adapterCatalog.list();

    expect(views.map((view) => view.adapterId)).toEqual(ADAPTERS.map((spec) => spec.id));
    for (const view of views) {
      expect(view.installed).toBe(false);
      expect(view.authRequired).toBeNull();
      expect(view.configOptions).toEqual([]);
      expect(view.commands).toEqual([]);
    }
    expect(views.map((view) => view.label)).toEqual(ADAPTERS.map((spec) => spec.label));
  });

  it("marks installed only the adapter whose managed copy is on disk", async () => {
    const stateDir = tempDir("lumem-state-");
    stageManagedAdapter(stateDir, CLAUDE_ADAPTER);
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir });

    const views = await context.api.adapterCatalog.list();

    expect(views.find((view) => view.adapterId === CLAUDE_ADAPTER.id)?.installed).toBe(true);
    expect(views.find((view) => view.adapterId === CODEX_ADAPTER.id)?.installed).toBe(false);
  });

  it("returns the commands of the project asked for, and only of it", async () => {
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    await context.ctx.adapterCatalog.recordCommands(CLAUDE_ADAPTER.id, "project-a", [REVIEW]);
    await context.ctx.adapterCatalog.recordCommands(CLAUDE_ADAPTER.id, "project-b", [DEPLOY]);

    const claudeOf = async (projectId?: string) =>
      (await context!.api.adapterCatalog.list(projectId === undefined ? undefined : { projectId })).find(
        (view) => view.adapterId === CLAUDE_ADAPTER.id,
      );

    expect((await claudeOf("project-a"))?.commands).toEqual([REVIEW]);
    expect((await claudeOf("project-b"))?.commands).toEqual([DEPLOY]);
    expect((await claudeOf("project-never-seen"))?.commands).toEqual([]);
    expect((await claudeOf())?.commands).toEqual([]);
  });

  it("carries what the catalog recorded about credentials", async () => {
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
    await context.ctx.adapterCatalog.recordOptions(CODEX_ADAPTER.id, [], { authRequired: true });

    const views = await context.api.adapterCatalog.list();

    expect(views.find((view) => view.adapterId === CODEX_ADAPTER.id)?.authRequired).toBe(true);
    expect(views.find((view) => view.adapterId === CLAUDE_ADAPTER.id)?.authRequired).toBeNull();
  });
});
