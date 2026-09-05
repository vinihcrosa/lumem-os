import { afterEach, describe, expect, it } from "vitest";

import type { PrHost, PrRead, PrSnapshot, PrWrite } from "../pr/PrHost.js";
import type { GhCheck, GhPullRequest } from "../pr/verdict.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";

/**
 * O estado da PR sobre a rede, com um host de mentira.
 *
 * O `gh` **não** é chamado aqui, e a razão está em `docs/project/testing.md`:
 * ele fala com a rede e com a conta de alguém. O que este arquivo exercita é o
 * que o router acrescenta ao adaptador — o casamento worktree ↔ branch, o
 * portão do merge, a validação de URL na saída, e o fato de a barra e a sidebar
 * saírem do mesmo cache.
 */

let context: TestCaller | null = null;

const HOST = "github.com";

function check(over: Partial<GhCheck> = {}): GhCheck {
  return {
    name: "lint",
    app: "CI",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    url: "https://github.com/exemplo/repo/actions/runs/1/job/1",
    startedAt: "2026-09-05T11:58:00Z",
    completedAt: "2026-09-05T11:58:38Z",
    ...over,
  };
}

function pull(over: Partial<GhPullRequest> = {}): GhPullRequest {
  return {
    number: 19,
    url: "https://github.com/exemplo/repo/pull/19",
    title: "a barra da PR",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefName: "teste",
    baseRefName: "main",
    updatedAt: "2026-09-05T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "pessoa-1",
    reviews: [],
    checks: [check()],
    ...over,
  };
}

function snapshotOf(pulls: GhPullRequest[]): PrSnapshot {
  return {
    host: HOST,
    repo: "exemplo/repo",
    pulls,
    merge: { merge: true, squash: true, rebase: false, deleteBranchOnMerge: false },
    readAt: "2026-09-05T12:00:05Z",
  };
}

interface FakeHost {
  host: PrHost;
  writes: Array<{ verb: "merge" | "create"; input: unknown }>;
  reads: number;
}

function fakeHost(read: () => PrRead, write: PrWrite = { ok: true, url: "" }): FakeHost {
  const state: FakeHost = {
    reads: 0,
    writes: [],
    host: {
      name: "GitHub",
      supports: () => true,
      read: () => {
        state.reads += 1;
        return Promise.resolve(read());
      },
      create: (input) => {
        state.writes.push({ verb: "create", input });
        return Promise.resolve(write);
      },
      merge: (input) => {
        state.writes.push({ verb: "merge", input });
        return Promise.resolve(write);
      },
    },
  };
  return state;
}

interface Fixture {
  ctx: TestCaller;
  projectId: string;
  worktreeId: string;
  repo: string;
  host: FakeHost;
}

async function setup(
  pulls: GhPullRequest[] | PrRead = [pull()],
  write?: PrWrite,
): Promise<Fixture> {
  const read: PrRead = Array.isArray(pulls)
    ? { ok: true, snapshot: snapshotOf(pulls) }
    : pulls;
  const host = fakeHost(() => read, write);

  context = createTestCaller(
    { LUMEM_STATE_DIR: tempDir("lumem-state-") },
    { prHost: host.host },
  );
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lumem-os",
  });
  const worktree = await context.api.worktree.create({ projectId: project.id, name: "teste" });

  return { ctx: context, projectId: project.id, worktreeId: worktree.id, repo, host };
}

/**
 * Faz o remoto conhecer a branch, sem rede.
 *
 * A referência de rastreamento é um arquivo dentro do `.git`, e é exatamente o
 * que o daemon lê para separar "sem pull request" de "branch não publicada".
 */
async function publish(repo: string, branch: string): Promise<void> {
  await runGit(repo, "update-ref", `refs/remotes/origin/${branch}`, "HEAD");
}

afterEach(async () => {
  await context?.cleanup();
  context = null;
  cleanupGitFixtures();
});

describe("pr.getByWorktree", () => {
  it("casa a worktree com a PR pela branch", async () => {
    const { ctx, worktreeId } = await setup();

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.pull?.number).toBe(19);
    expect(status.pull?.verdict).toBe("ready");
    expect(status.branch).toBe("teste");
    expect(status.base).toBe("main");
    expect(status.host).toBe(HOST);
  });

  it("worktree cuja branch não tem PR responde `none` — resposta, não erro", async () => {
    const { ctx, worktreeId } = await setup([pull({ headRefName: "outra-coisa" })]);

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.pull).toBeNull();
    expect(status.failure).toBeNull();
  });

  it("separa `sem PR` de `branch não publicada`", async () => {
    const { ctx, worktreeId, repo } = await setup([]);

    expect((await ctx.api.pr.getByWorktree({ worktreeId })).published).toBe(false);

    await publish(repo, "teste");
    expect((await ctx.api.pr.getByWorktree({ worktreeId })).published).toBe(true);
  });

  it("carimba a leitura — a idade é dado, não enfeite", async () => {
    const { ctx, worktreeId } = await setup();

    expect((await ctx.api.pr.getByWorktree({ worktreeId })).readAt).toBe("2026-09-05T12:00:05Z");
  });

  it("monta a URL de comparação no daemon, e não a recebe do payload", async () => {
    const { ctx, worktreeId } = await setup([]);

    expect((await ctx.api.pr.getByWorktree({ worktreeId })).compareUrl).toBe(
      "https://github.com/exemplo/repo/compare/main...teste?expand=1",
    );
  });

  it("recusa a URL de outro host, e a linha aparece sem link", async () => {
    // §4.6: uma PR pode conter link para qualquer lugar. O `↗` do Lumem só leva
    // ao host de onde o dado veio.
    const { ctx, worktreeId } = await setup([
      pull({
        url: "https://evil.example/pull/19",
        checks: [check({ name: "deploy", url: "https://vercel.com/x/1" })],
      }),
    ]);

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.pull?.url).toBeNull();
    expect(status.pull?.checks[0]?.url).toBeNull();
  });

  it("põe as reprovadas primeiro — reprovado abaixo de trinta verdes é invisível", async () => {
    const green = Array.from({ length: 30 }, (_, i) => check({ name: `ok-${String(i)}` }));
    const { ctx, worktreeId } = await setup([
      pull({ checks: [...green, check({ name: "e2e", conclusion: "FAILURE" })] }),
    ]);

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.pull?.checks[0]?.name).toBe("e2e");
    expect(status.pull?.verdict).toBe("blocked");
    expect(status.pull?.counts).toEqual({ failed: 1, running: 0, passed: 30, skipped: 0 });
  });

  it("com duas PRs abertas na mesma branch, mostra a mais recente e diz que há mais", async () => {
    // Q8: nunca somadas num veredito só — isso produziria uma frase que não é
    // verdade sobre nenhuma delas.
    const { ctx, worktreeId } = await setup([
      pull({ number: 19, updatedAt: "2026-09-05T10:00:00Z" }),
      pull({ number: 21, updatedAt: "2026-09-05T12:00:00Z" }),
    ]);

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.pull?.number).toBe(21);
    expect(status.pull?.alsoOpen).toBe(1);
  });

  it("PR aberta ganha de PR fechada, mesmo que a fechada seja mais recente", async () => {
    const { ctx, worktreeId } = await setup([
      pull({ number: 19, state: "OPEN", updatedAt: "2026-09-05T10:00:00Z" }),
      pull({ number: 18, state: "CLOSED", updatedAt: "2026-09-05T12:00:00Z" }),
    ]);

    expect((await ctx.api.pr.getByWorktree({ worktreeId })).pull?.number).toBe(19);
  });

  it("PR fechada velha demais não ressuscita (Q7)", async () => {
    const { ctx, worktreeId } = await setup([
      pull({ number: 18, state: "CLOSED", updatedAt: "2020-01-01T00:00:00Z" }),
    ]);

    expect((await ctx.api.pr.getByWorktree({ worktreeId })).pull).toBeNull();
  });

  it("falha de leitura vira resposta, e não derruba a procedure", async () => {
    const { ctx, worktreeId } = await setup({
      ok: false,
      failure: { kind: "no-binary", message: "o gh não está instalado ou não está no PATH" },
    });

    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(status.failure).toEqual({
      kind: "no-binary",
      message: "o gh não está instalado ou não está no PATH",
      retryAt: null,
    });
    expect(status.pull).toBeNull();
  });

  it("worktree que não existe é o mesmo erro de domínio do resto do app", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.pr.getByWorktree({ worktreeId: "wt_nada" })).rejects.toThrow(/não existe/);
  });
});

describe("pr.listByProject", () => {
  it("uma consulta alimenta todas as linhas — N worktrees não fazem N consultas", async () => {
    // F3.3 e F4.3, e é a prova contando na costura.
    const { ctx, projectId, worktreeId, host } = await setup([
      pull({ number: 19, headRefName: "teste" }),
      pull({ number: 20, headRefName: "outra", mergeable: "CONFLICTING" }),
    ]);
    await ctx.api.worktree.create({ projectId, name: "outra" });
    await ctx.api.worktree.create({ projectId, name: "sem-pr" });

    const marks = await ctx.api.pr.listByProject({ projectId });

    // Três worktrees, **uma** execução. É a diferença entre uma feature que
    // escala com o paralelismo e uma que o pune.
    expect(host.reads).toBe(1);
    expect(marks).toHaveLength(2);

    // E a barra de cada uma delas continua não custando execução nova.
    await ctx.api.pr.getByWorktree({ worktreeId });
    await ctx.api.pr.listByProject({ projectId });
    expect(host.reads).toBe(1);
  });

  it("worktree sem PR não ganha marcador (Q9)", async () => {
    const { ctx, projectId } = await setup([pull({ headRefName: "outra-coisa" })]);

    expect(await ctx.api.pr.listByProject({ projectId })).toEqual([]);
  });

  it("a cor do marcador e a da barra saem do mesmo veredito", async () => {
    // O teste que quebra se elas divergirem. Sem ele, a sidebar poderia dizer
    // verde com a barra dizendo vermelho, e ninguém saberia qual acreditar.
    const { ctx, projectId, worktreeId } = await setup([
      pull({ checks: [check({ name: "e2e", conclusion: "FAILURE" })] }),
    ]);

    const [mark] = await ctx.api.pr.listByProject({ projectId });
    const status = await ctx.api.pr.getByWorktree({ worktreeId });

    expect(mark?.verdict).toBe(status.pull?.verdict);
    expect(mark?.number).toBe(status.pull?.number);
  });
});

describe("pr.merge — o portão é o veredito, e ele é relido aqui", () => {
  it("mescla quando está pronta", async () => {
    const { ctx, worktreeId, host } = await setup();

    const result = await ctx.api.pr.merge({ worktreeId, strategy: "squash", deleteBranch: true });

    expect(result).toEqual({ number: 19 });
    expect(host.writes).toHaveLength(1);
    expect(host.writes[0]).toMatchObject({
      verb: "merge",
      input: { number: 19, strategy: "squash", deleteBranch: true },
    });
  });

  it("recusa uma PR bloqueada, mesmo que o cliente peça", async () => {
    // F7.2: um botão escondido na tela é conforto. A recusa no daemon é a
    // garantia — e a prova chama a procedure direto, sem passar pela tela.
    const { ctx, worktreeId, host } = await setup([
      pull({ checks: [check({ conclusion: "FAILURE" })] }),
    ]);

    await expect(
      ctx.api.pr.merge({ worktreeId, strategy: "merge", deleteBranch: false }),
    ).rejects.toThrow(/não está pronta/);
    expect(host.writes).toEqual([]);
  });

  it.each(["pending", "draft"] as const)("recusa também quando está %s", async (kind) => {
    const { ctx, worktreeId, host } = await setup([
      kind === "draft"
        ? pull({ isDraft: true })
        : pull({ checks: [check({ status: "IN_PROGRESS", conclusion: "" })] }),
    ]);

    await expect(
      ctx.api.pr.merge({ worktreeId, strategy: "merge", deleteBranch: false }),
    ).rejects.toThrow(/não está pronta/);
    expect(host.writes).toEqual([]);
  });

  it("recusa estratégia que o repositório não permite", async () => {
    // F7.3: a estratégia é do host, não nossa.
    const { ctx, worktreeId, host } = await setup();

    await expect(
      ctx.api.pr.merge({ worktreeId, strategy: "rebase", deleteBranch: false }),
    ).rejects.toThrow(/não permite/);
    expect(host.writes).toEqual([]);
  });

  it("worktree sem PR não mescla nada", async () => {
    const { ctx, worktreeId, host } = await setup([]);

    await expect(
      ctx.api.pr.merge({ worktreeId, strategy: "merge", deleteBranch: false }),
    ).rejects.toThrow(/não tem pull request/);
    expect(host.writes).toEqual([]);
  });

  it("`refresh` aceita o escopo, que é o que a tela sabe no instante do clique", async () => {
    // Com o id do projeto, o botão não fazia nada quando o clique vinha cedo —
    // que é exatamente quando alguém clica em recarregar. O e2e achou.
    const { ctx, worktreeId, host } = await setup();

    await ctx.api.pr.getByWorktree({ worktreeId });
    const before = host.reads;

    await ctx.api.pr.refresh({ scopeType: "worktree", scopeId: worktreeId });
    await ctx.api.pr.getByWorktree({ worktreeId });

    expect(host.reads).toBe(before + 1);
  });

  it("depois de mesclar, a próxima leitura vai ao host (F7.8)", async () => {
    const { ctx, worktreeId, host } = await setup();

    await ctx.api.pr.getByWorktree({ worktreeId });
    const before = host.reads;

    await ctx.api.pr.merge({ worktreeId, strategy: "merge", deleteBranch: false });
    await ctx.api.pr.getByWorktree({ worktreeId });

    // A barra não pode continuar verde depois de o merge acontecer.
    expect(host.reads).toBeGreaterThan(before);
  });

  it("host que recusa vira mensagem, e não um 500", async () => {
    const { ctx, worktreeId } = await setup([pull()], {
      ok: false,
      failure: { kind: "failed", message: "o GitHub recusou o merge" },
    });

    await expect(
      ctx.api.pr.merge({ worktreeId, strategy: "merge", deleteBranch: false }),
    ).rejects.toThrow(/recusou o merge/);
  });
});

describe("pr.create", () => {
  it("cria com base e head vindas do daemon, e título vindo da tela", async () => {
    const { ctx, worktreeId, repo, host } = await setup([]);
    await publish(repo, "teste");

    await ctx.api.pr.create({ worktreeId, title: "feat: algo", body: "corpo", draft: false });

    expect(host.writes[0]).toMatchObject({
      verb: "create",
      // A base e a head **não** vêm do cliente: saem do banco e do git local.
      input: { base: "main", head: "teste", title: "feat: algo", draft: false },
    });
  });

  it("branch não publicada não vira PR — e o motivo é dito", async () => {
    const { ctx, worktreeId, host } = await setup([]);

    await expect(
      ctx.api.pr.create({ worktreeId, title: "t", body: "", draft: false }),
    ).rejects.toThrow(/ainda não foi publicada/);
    expect(host.writes).toEqual([]);
  });

  it("título vazio nem chega ao host", async () => {
    const { ctx, worktreeId, repo, host } = await setup([]);
    await publish(repo, "teste");

    await expect(
      ctx.api.pr.create({ worktreeId, title: "", body: "", draft: false }),
    ).rejects.toThrow();
    expect(host.writes).toEqual([]);
  });
});
