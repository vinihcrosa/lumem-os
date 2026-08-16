import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { MAX_FILE_BYTES } from "../files/FileService.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createServer, MAX_BODY_BYTES } from "../server.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

/**
 * What HTTP does to `files`, which the tRPC caller cannot see.
 *
 * Behaviour belongs in `files.test.ts`, over the caller, for the reason
 * `testing/caller.ts` states — tests about behaviour instead of about
 * transport. Two of E6's rules only exist on this side, though, and a caller
 * would report both green while the browser got neither:
 *
 * 1. the body limit. Fastify's default is 1 MiB, exactly `MAX_FILE_BYTES`, so a
 *    write of a file at the ceiling came back as a transport 413 with no domain
 *    message in it — nothing for the editor's footer to show;
 * 2. `query` against `mutation`. The caller runs both the same way; the wire
 *    does not, and `files.deletePreview` being a query is what lets the delete
 *    dialog ask without changing anything.
 */

let app: FastifyInstance;
let ptyManager: PtyManager;
let database: TestDb;

beforeEach(async () => {
  ptyManager = new PtyManager();
  database = openTestDb();
  app = await createServer({
    config: loadConfig({ LUMEM_STATE_DIR: tempDir("lumem-state-") }),
    db: database.db,
    ptyManager,
  });
});

afterEach(async () => {
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
  cleanupGitFixtures();
});

/** The shape `httpBatchLink` really sends: one call, wrapped in its index. */
async function postBatched(path: string, input: unknown): Promise<LightMyRequestResponse> {
  return app.inject({ method: "POST", url: `/trpc/${path}?batch=1`, payload: { "0": input } });
}

function queryUrl(path: string, input: unknown): string {
  return `/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

/** A project on a real repository, registered the way the client registers it. */
async function setupProject(): Promise<{ projectId: string; repo: string }> {
  const repo = await createRepo({ branch: "main" });
  const workspace = await app.inject({
    method: "POST",
    url: "/trpc/workspace.create",
    payload: { name: "pessoal" },
  });
  const project = await app.inject({
    method: "POST",
    url: "/trpc/project.add",
    payload: {
      workspaceId: workspace.json<{ result: { data: { id: string } } }>().result.data.id,
      path: repo,
      name: "lorebase",
    },
  });
  return { projectId: project.json<{ result: { data: { id: string } } }>().result.data.id, repo };
}

describe("files over http", () => {
  it("carries a write at the byte ceiling instead of answering 413", async () => {
    const { projectId, repo } = await setupProject();
    writeFileSync(join(repo, "grande.txt"), "x\n");
    const read = await app.inject({
      method: "GET",
      url: queryUrl("files.read", { scopeType: "project", scopeId: projectId, path: "grande.txt" }),
    });
    const input = {
      scopeType: "project",
      scopeId: projectId,
      path: "grande.txt",
      text: "y".repeat(MAX_FILE_BYTES),
      baseRevision: read.json<{ result: { data: { revision: string } } }>().result.data.revision,
    };
    // Or the case is not being exercised at all: what has to fit through is the
    // text plus everything JSON and tRPC put around it.
    expect(JSON.stringify({ "0": input }).length).toBeGreaterThan(1024 * 1024);

    const response = await postBatched("files.write", input);

    expect(response.statusCode).toBe(200);
    expect(response.json<[{ result: { data: unknown } }]>()[0].result.data).toEqual({
      ok: true,
      revision: expect.any(String),
    });
    expect(statSync(join(repo, "grande.txt")).size).toBe(MAX_FILE_BYTES);
  });

  it("refuses a text past the ceiling with the daemon's sentence, not with a 413", async () => {
    const { projectId, repo } = await setupProject();
    writeFileSync(join(repo, "grande.txt"), "x\n");
    // Multibyte and past the *byte* ceiling while under the schema's ceiling in
    // UTF-16 units, so the refusal that has to arrive is the service's. In
    // ASCII this text would die at the schema and the sentence below would
    // never be the one under test.
    const text = "€".repeat(400_000);
    const bytes = Buffer.byteLength(text, "utf8");

    const response = await postBatched("files.write", {
      scopeType: "project",
      scopeId: projectId,
      path: "grande.txt",
      text,
      baseRevision: "0".repeat(64),
    });

    // A raised body limit is not a raised file limit: over the ceiling the
    // answer is still a refusal, and it is one with words the footer can show.
    expect(response.statusCode).toBe(400);
    expect(response.json<[{ error: { message: string } }]>()[0].error.message).toContain(
      `${bytes} bytes`,
    );
    expect(statSync(join(repo, "grande.txt")).size).toBe(2);
  });

  it("still has a ceiling, so raising it is not the same as removing it", async () => {
    const { projectId } = await setupProject();

    const response = await postBatched("files.write", {
      // An otherwise perfectly good call: the only thing wrong with it is its
      // size, so a 413 can only have come from the transport.
      scopeType: "project",
      scopeId: projectId,
      path: "README.md",
      text: "y".repeat(MAX_BODY_BYTES),
      baseRevision: "0".repeat(64),
    });

    // Past the body limit the transport does answer 413, and that is right: a
    // daemon with no ceiling buffers whatever it is sent before anyone can
    // refuse it. The point of E6 is where the line is, not that there is none.
    expect(response.statusCode).toBe(413);
  });

  it("answers deletePreview over GET, and answers no write over GET at all", async () => {
    const { projectId } = await setupProject();
    const input = { scopeType: "project", scopeId: projectId, path: "README.md" };

    const preview = await app.inject({
      method: "GET",
      url: queryUrl("files.deletePreview", input),
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json<{ result: { data: unknown } }>().result.data).toEqual({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    // 405, because a GET that changes the disk is one a browser, a proxy or a
    // link preview can fire on its own.
    for (const path of ["files.write", "files.create", "files.rename", "files.remove"]) {
      const response = await app.inject({ method: "GET", url: queryUrl(path, input) });
      expect(response.statusCode, path).toBe(405);
    }
  });
});
