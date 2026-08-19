import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { createAgentConfig, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query, startDaemon } from "./support/daemon.js";
import {
  E2E_FAKE_ACP_AGENT,
  E2E_FIXTURE_REPO_ACP,
  E2E_FIXTURE_REPO_ALT,
} from "./support/fixtures.js";
import { E2E_RESTART_PORT, E2E_SERVER_PORT } from "../ports.js";

/**
 * The sentence phase 5 exists to make true: kill the daemon, bring it back, reopen the
 * tab, and continue the conversation from yesterday.
 *
 * Two specs, because the claim has two halves that cannot be checked in one place.
 * The **restart** can only be done against a daemon the suite owns — playwright will
 * not restart the one it manages — and that daemon has no browser pointed at it, so
 * that half is driven through the API, which §7 of the PRD requires to be able to do
 * everything the client can. The **screen** — a finished conversation opening in read
 * mode, and the button that continues it — is the browser's half, against the shared
 * daemon and without a restart.
 *
 * Both run against the fake ACP agent and spend nothing.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-falso";
const WORKTREE = "conversa-retomada";

interface SessionRow {
  id: string;
  state: string;
  acpSessionId: string | null;
  resumedFromId: string | null;
}

interface AttachedFrame {
  transcript: { at: number; event: { type: string; text?: string } }[];
}

const types = (frame: AttachedFrame): string[] =>
  frame.transcript.map((entry) => entry.event.type);
const texts = (frame: AttachedFrame): string[] =>
  frame.transcript.flatMap((entry) => (entry.event.text === undefined ? [] : [entry.event.text]));

/**
 * One turn over the conversation socket, answered.
 *
 * Node has a global `WebSocket`, so this needs no dependency the suite does not
 * already have. The permission answer is not decoration: the fake blocks the turn on
 * it exactly as a real agent does, and a prompt left unanswered would record half a
 * conversation.
 */
async function converse(daemonUrl: string, sessionId: string, text: string): Promise<void> {
  const socket = new WebSocket(
    `${daemonUrl.replace("http://", "ws://")}/acp?session=${sessionId}`,
  );

  await new Promise<void>((resolve, reject) => {
    const fail = (why: string) => reject(new Error(why));
    const timer = setTimeout(() => fail("o turno não terminou em 30 s"), 30_000);

    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "prompt", text })));
    socket.addEventListener("error", () => fail("o socket da conversa falhou"));
    socket.addEventListener("message", (frame) => {
      const message = JSON.parse(String(frame.data)) as {
        type: string;
        event?: { type: string; requestId?: string; options?: { optionId: string }[] };
      };
      if (message.type !== "event" || !message.event) return;

      if (message.event.type === "permission_request") {
        socket.send(
          JSON.stringify({
            type: "permission_response",
            requestId: message.event.requestId,
            optionId: message.event.options?.[0]?.optionId ?? "allow",
          }),
        );
      }
      if (message.event.type === "turn_end") {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
  });
}

test("a conversation survives the daemon that held it, and picks up where it stopped", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-retomada-"));
  let daemon = await startDaemon({ port: E2E_RESTART_PORT, stateDir });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "retomada" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      // The alternative repository, not the conversation spec's: this daemon has a
      // state directory of its own but shares the checkout on disk, and two daemons
      // creating branches in one repository would collide.
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };
    const worktree = (await call(daemon.url, "worktree.create", {
      projectId: project.id,
      name: "retomada-api",
    })) as { id: string };
    const configs = (await query(daemon.url, "agentConfig.list", {})) as { id: string; name: string }[];
    const config = configs.find((candidate) => candidate.name === AGENT)!;

    const session = (await call(daemon.url, "session.createAgent", {
      scopeType: "worktree",
      scopeId: worktree.id,
      agentConfigId: config.id,
    })) as SessionRow;

    await converse(daemon.url, session.id, "arruma o frontmatter vazio");
    await call(daemon.url, "session.close", { id: session.id });
    await expect
      .poll(async () => ((await query(daemon.url, "session.getDetail", { id: session.id })) as SessionRow).state)
      .toBe("exited");

    // The restart. Everything after this line is a daemon that has never seen the
    // conversation being talked about.
    await daemon.stop();
    daemon = await startDaemon({ port: E2E_RESTART_PORT, stateDir });

    const stored = (await query(daemon.url, "session.transcript", { id: session.id })) as AttachedFrame;
    // What the phase promises: the record outlived the process *and* the daemon.
    expect(texts(stored)).toContain("arruma o frontmatter vazio");
    expect(types(stored)).toContain("turn_end");

    const resumed = (await call(daemon.url, "session.resume", { id: session.id })) as SessionRow;
    // A new session pointing at the old one, carrying the agent's id for the
    // conversation — not the old row brought back to life (D12).
    expect(resumed.id).not.toBe(session.id);
    expect(resumed.resumedFromId).toBe(session.id);
    expect(resumed.acpSessionId).toBe(session.acpSessionId);
    expect(resumed.state).toBe("running");
    expect(
      ((await query(daemon.url, "session.getDetail", { id: session.id })) as SessionRow).state,
    ).toBe("exited");

    const continued = (await query(daemon.url, "session.transcript", {
      id: resumed.id,
    })) as AttachedFrame;
    // The history in front, the separator after it: the order on disk is the order on
    // screen (D15).
    expect(texts(continued)).toContain("arruma o frontmatter vazio");
    expect(types(continued).at(-1)).toBe("resumed");
    // And the copy the adapter replayed at us is not in it (D14). Ours is the better
    // one, and recording both would show the conversation twice.
    expect(texts(continued)).not.toContain("replay-do-adaptador");

    // Still a live conversation, not a recording.
    await converse(daemon.url, resumed.id, "e agora apaga o legado");
    const after = (await query(daemon.url, "session.transcript", { id: resumed.id })) as AttachedFrame;
    expect(texts(after)).toContain("e agora apaga o legado");

    await call(daemon.url, "session.close", { id: resumed.id });
  } finally {
    await daemon.stop();
    rmSync(stateDir, { recursive: true, force: true });
  }
});

/**
 * The conversation of the tab that is open.
 *
 * Everything in the browser spec is scoped through this, and not out of tidiness:
 * reopening a finished session leaves *two* conversations mounted — the one being read
 * and the one that resumed it — and an unscoped `getByLabel` matches both composers.
 */
function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

/** The composer of the tab that is open. */
function composer(page: Page) {
  return conversation(page).getByLabel("mensagem para o agente");
}

test("reopening a finished conversation reads it, and the button continues it", async ({
  page,
  request,
}) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });

  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });

  // Something worth reading later.
  await composer(page).fill("arruma o frontmatter vazio");
  await conversation(page).getByRole("button", { name: /enviar/ }).click();
  await expect(conversation(page)).toContainText("Vou separar", { timeout: 20_000 });
  await conversation(page).getByRole("button", { name: /permitir uma vez/ }).click();

  // Ending the session takes its tab with it — that is how the strip says the
  // process actually stopped.
  await page.getByRole("button", { name: /^fechar / }).first().click();
  await expect(page.getByRole("tab", { name: new RegExp(`^${AGENT}`) })).toHaveCount(0, {
    timeout: 20_000,
  });

  // Reopening reads it. No adapter is launched for this (D13); what proves it here is
  // that the composer is closed and says so — a live session's is not.
  await page.getByRole("button", { name: "reabrir" }).first().click();
  await expect(conversation(page)).toBeVisible();
  await expect(conversation(page)).toContainText("arruma o frontmatter vazio");
  await expect(conversation(page)).toContainText("conversa encerrada");
  await expect(composer(page)).toBeDisabled();

  await conversation(page).getByRole("button", { name: /retomar/ }).click();

  // A new session, in front, with yesterday's conversation above the separator.
  await expect(conversation(page).locator(".daysep", { hasText: "retomada" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(conversation(page)).toContainText("arruma o frontmatter vazio");
  // The adapter's own replay is discarded (D14): the conversation appears once.
  await expect(conversation(page)).not.toContainText("replay-do-adaptador");
  await expect(composer(page)).toBeEnabled();

  // And it talks.
  await composer(page).fill("e agora apaga o legado");
  await conversation(page).getByRole("button", { name: /enviar/ }).click();
  await expect(conversation(page)).toContainText("e agora apaga o legado");
  await expect(conversation(page)).toContainText("Vou separar", { timeout: 20_000 });
});
