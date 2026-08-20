import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { DomainError } from "../errors.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { ensureMemoryHome } from "./home.js";
import {
  createPlaybookService,
  lifecycleOf,
  STALE_AFTER_DAYS,
  type PlaybookService,
} from "./playbook.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

const WS = "ws1";

async function service(): Promise<{ playbooks: PlaybookService; stateDir: string }> {
  const stateDir = join(tempDir("lumem-playbook-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const database = openTestDb();
  databases.push(database);
  return {
    playbooks: createPlaybookService({ db: database.db, stateDir }),
    stateDir,
  };
}

const FLAKY = {
  taskClass: "Investigar teste flaky",
  description: "o caminho que já funcionou duas vezes",
  body: "1. rode o teste isolado\n2. rode a suíte inteira\n3. compare o estado compartilhado",
  scope: "workspace" as const,
  workspaceId: WS,
  actor: "human",
};

describe("createPlaybookService.write", () => {
  it("grava um diretório por playbook, com o PLAYBOOK.md dentro", async () => {
    const { playbooks, stateDir } = await service();

    const { path, slug, created } = await playbooks.write(FLAKY);

    expect(slug).toBe("investigar-teste-flaky");
    expect(created).toBe(true);
    // Diretório desde já, porque o `references/` do §9 vai morar ao lado.
    expect(path).toBe("workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md");
    expect(readFileSync(join(stateDir, path), "utf8")).toContain("rode o teste isolado");
  });

  it("recusa nome que é artefato de sessão", async () => {
    const { playbooks } = await service();

    // O §9 fecha isso na primeira linha: playbook nomeado por artefato nunca é
    // carregado de novo, porque o artefato acabou.
    await expect(playbooks.write({ ...FLAKY, taskClass: "Consertar o PR 412" })).rejects.toThrow(
      DomainError,
    );
    await expect(playbooks.write({ ...FLAKY, taskClass: "Resolver #123" })).rejects.toThrow(
      DomainError,
    );
  });

  it("passa pelo mesmo portão: segredo não vira playbook", async () => {
    const { playbooks } = await service();

    await expect(
      playbooks.write({
        ...FLAKY,
        body: "export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("não tem escopo global: procedimento é de um repo ou de um time", async () => {
    const { playbooks } = await service();

    await expect(
      // @ts-expect-error -- é justamente o valor que o tipo não permite, e que
      // chega de fora por flag de CLI ou corpo de requisição.
      playbooks.write({ ...FLAKY, scope: "global" }),
    ).rejects.toThrow(DomainError);
  });

  it("reescrever o corpo não desarquiva nem desfixa", async () => {
    const { playbooks, stateDir } = await service();
    const { path } = await playbooks.write(FLAKY);
    playbooks.setPinned(path, true);
    // A curadoria mora no arquivo também, então é lá que ela tem que sobreviver.
    const file = join(stateDir, path);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, readFileSync(file, "utf8").replace("pinned: false", "pinned: true"));

    await playbooks.write({ ...FLAKY, body: "outro corpo" });

    expect(readFileSync(file, "utf8")).toContain("pinned: true");
  });
});

describe("o ciclo de vida", () => {
  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      archived: false,
      pinned: false,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      lastLoadedAt: null,
      ...overrides,
    }) as never;

  const NOW = new Date("2026-08-20T00:00:00Z");

  it("recém-criado é ativo", () => {
    expect(lifecycleOf(row(), NOW)).toBe("active");
  });

  it("parado há muito tempo é parado — e derivado, nunca gravado", () => {
    const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 1) * 86_400_000);

    expect(lifecycleOf(row({ lastLoadedAt: old }), NOW)).toBe("stale");
  });

  it("fixado não envelhece: envelhecer é o que acontece com o que ninguém escolheu", () => {
    const old = new Date(NOW.getTime() - 365 * 86_400_000);

    expect(lifecycleOf(row({ pinned: true, lastLoadedAt: old }), NOW)).toBe("active");
  });

  it("arquivado é arquivado, e é o único estado persistido", () => {
    expect(lifecycleOf(row({ archived: true }), NOW)).toBe("archived");
  });
});

describe("uso e arquivo", () => {
  it("carregar conta, e é o que alimenta o ciclo", async () => {
    const { playbooks } = await service();
    const { path } = await playbooks.write(FLAKY);

    expect(playbooks.recordLoad(path, new Date("2026-08-19T00:00:00Z"))).toBe(true);
    playbooks.recordLoad(path);

    const [row] = playbooks.list();
    expect(row?.loads).toBe(2);
    expect(row?.lastLoadedAt).not.toBeNull();
  });

  it("carregamento de caminho desconhecido não inventa linha", async () => {
    const { playbooks } = await service();

    expect(playbooks.recordLoad("workspaces/ws1/playbooks/nao-existe/PLAYBOOK.md")).toBe(false);
    expect(playbooks.list()).toHaveLength(0);
  });

  it("arquivar não apaga, e desarquivar volta", async () => {
    const { playbooks, stateDir } = await service();
    const { path } = await playbooks.write(FLAKY);

    playbooks.setArchived(path, true);

    expect(playbooks.list({ archived: false })).toHaveLength(0);
    expect(playbooks.list({ archived: true })).toHaveLength(1);
    // O arquivo continua no disco e no git: arquivar é sumir da vista, não do
    // histórico.
    expect(readFileSync(join(stateDir, path), "utf8")).toContain("rode o teste isolado");

    playbooks.setArchived(path, false);
    expect(playbooks.list({ archived: false })).toHaveLength(1);
  });
});
