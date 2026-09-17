import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "./git-fixtures.js";

/**
 * A writer that keeps refilling the tree while the removal walks it.
 *
 * It has to be another *process*: `rmSync` is synchronous and holds the event
 * loop, so nothing scheduled in this one could interleave with it — and the
 * interleaving is the whole point.
 */
function writerFor(directory: string, milliseconds: number): ReturnType<typeof spawn> {
  const script = `
    const { mkdirSync, writeFileSync } = require("node:fs");
    const directory = process.env.DIRECTORY;
    const until = Date.now() + ${milliseconds};
    let index = 0;
    while (Date.now() < until) {
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(directory + "/tmp_object_" + index++, "x");
      } catch {}
    }
  `;
  return spawn(process.execPath, ["-e", script], {
    env: { ...process.env, DIRECTORY: directory },
    stdio: "ignore",
  });
}

function waitForFirstWrite(directory: string): void {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (existsSync(directory) && readdirSync(directory).length > 0) return;
  }
  throw new Error("o escritor não chegou a escrever nada");
}

describe("cleanupGitFixtures", () => {
  const strays: ReturnType<typeof spawn>[] = [];

  afterEach(() => {
    for (const child of strays.splice(0)) child.kill("SIGKILL");
    cleanupGitFixtures();
  });

  it("apaga a árvore mesmo com outro processo escrevendo dentro dela", () => {
    const directory = tempDir("lumem-cleanup-");
    const objects = join(directory, ".git", "objects");
    mkdirSync(objects, { recursive: true });

    const writer = writerFor(objects, 400);
    strays.push(writer);
    waitForFirstWrite(objects);

    expect(() => cleanupGitFixtures()).not.toThrow();
    expect(existsSync(directory)).toBe(false);
  });

  it("esvazia a lista: uma segunda chamada não tem o que apagar", () => {
    const directory = tempDir("lumem-cleanup-");
    cleanupGitFixtures();

    expect(existsSync(directory)).toBe(false);
    expect(() => cleanupGitFixtures()).not.toThrow();
  });
});
