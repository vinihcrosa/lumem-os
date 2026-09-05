import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createGhHost } from "./GhHost.js";
import { classify, type GhExec, type GhResult } from "./exec.js";

/**
 * O adaptador, sem tocar no `gh`.
 *
 * A política de [testing.md](../../../../docs/project/testing.md) diz que git
 * nunca é dublado, porque `git worktree` tem comportamento que nenhum dublê
 * reproduz. Aqui o argumento vira do avesso: o `gh` fala com a **rede** e com a
 * **sua conta**, então chamá-lo em teste é teste que falha no avião e polui uma
 * conta real.
 *
 * Nenhum teste deste arquivo executa um processo. O que ele exercita é o que a
 * costura deixa exercitar: quais argumentos saem, o que se faz com a resposta, e
 * as cinco falhas classificadas.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const OPEN = readFileSync(join(FIXTURES, "gh-pr-list-open.json"), "utf8");

const REPO_VIEW = JSON.stringify({
  nameWithOwner: "exemplo/repo",
  mergeCommitAllowed: true,
  squashMergeAllowed: true,
  rebaseMergeAllowed: false,
  deleteBranchOnMerge: true,
});

const OK: GhResult = { stdout: "", stderr: "", code: 0, spawnError: null, timedOut: false };

/**
 * Um `gh` de mentira que **guarda o que lhe pediram**.
 *
 * O `argv` é a superfície de segurança inteira desta feature (§4 do PRD), então
 * ele é a coisa sob teste — e não um detalhe do caminho até a asserção.
 */
function fakeGh(reply: (args: readonly string[]) => Partial<GhResult>) {
  const calls: string[][] = [];
  const exec: GhExec = (args) => {
    calls.push([...args]);
    return Promise.resolve({ ...OK, ...reply(args) });
  };
  return { exec, calls };
}

/** O caminho feliz: lista e configuração do repositório, os dois em JSON. */
function readingGh() {
  return fakeGh((args) =>
    args[1] === "list" ? { stdout: OPEN } : { stdout: REPO_VIEW },
  );
}

const GITHUB = "https://github.com/exemplo/repo.git";

describe("de qual host é este repositório", () => {
  const host = createGhHost({ exec: readingGh().exec });

  it.each([
    "https://github.com/exemplo/repo.git",
    "git@github.com:exemplo/repo.git",
    "ssh://git@github.com/exemplo/repo.git",
    "https://github.empresa.com/exemplo/repo.git",
  ])("fala com %s", (remote) => {
    expect(host.supports(remote)).toBe(true);
  });

  it.each([
    "https://gitlab.com/exemplo/repo.git",
    "https://bitbucket.org/exemplo/repo.git",
    "file:///tmp/repo",
    null,
  ])("não fala com %s", (remote) => {
    expect(host.supports(remote)).toBe(false);
  });

  it("recusa o que o git-url.ts já recusa, sem reimplementar a lista", () => {
    // `ext::` é execução de comando arbitrário disfarçada de transporte. Quem
    // sabe disso é o `git-url.ts`, e este adaptador só herda a recusa.
    expect(host.supports("ext::sh -c id")).toBe(false);
  });

  it("host que não é GitHub responde `sem integração`, com o host nomeado", async () => {
    const read = await host.read({ repoPath: "/tmp/x", remoteUrl: "https://gitlab.com/a/b.git" });

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.failure.kind).toBe("unsupported-host");
    expect(read.failure.message).toContain("gitlab.com");
  });
});

describe("a leitura", () => {
  it("pede tudo de uma vez, por projeto — e não por worktree", async () => {
    // F4.3: um `gh pr list` traz todas as PRs do repositório. É a diferença
    // entre uma feature que escala com o paralelismo e uma que o pune.
    const gh = readingGh();
    const read = await createGhHost({ exec: gh.exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.snapshot.pulls).toHaveLength(6);
    expect(read.snapshot.repo).toBe("exemplo/repo");

    const list = gh.calls.find((call) => call[1] === "list")!;
    expect(list.slice(0, 5)).toEqual(["pr", "list", "--state", "all", "--limit"]);
  });

  it("traz as estratégias que o repositório permite, e não as que a gente gosta", async () => {
    const read = await createGhHost({ exec: readingGh().exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.snapshot.merge).toEqual({
      merge: true,
      squash: true,
      rebase: false,
      deleteBranchOnMerge: true,
    });
  });

  it("repositório sem PR nenhuma é resposta, e não erro", async () => {
    const gh = fakeGh((args) => (args[1] === "list" ? { stdout: "[]" } : { stdout: REPO_VIEW }));
    const read = await createGhHost({ exec: gh.exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.snapshot.pulls).toEqual([]);
  });

  it("resposta que não é JSON não derruba nada", async () => {
    const gh = fakeGh(() => ({ stdout: "isto não é json" }));
    const read = await createGhHost({ exec: gh.exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.failure.kind).toBe("failed");
  });

  it("carimba quando leu — a idade é dado, não enfeite (F1.5)", async () => {
    const read = await createGhHost({ exec: readingGh().exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Number.isNaN(Date.parse(read.snapshot.readAt))).toBe(false);
  });
});

describe("as falhas, classificadas e distinguíveis", () => {
  const cases: Array<[string, Partial<GhResult>, string]> = [
    ["sem binário", { spawnError: "ENOENT", code: null }, "no-binary"],
    [
      "sem autenticação",
      {
        code: 4,
        stderr: "To get started with GitHub CLI, please run:  gh auth login",
      },
      "no-auth",
    ],
    [
      "host desconhecido",
      {
        code: 1,
        stderr:
          "none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`",
      },
      "unsupported-host",
    ],
    [
      "sem rede",
      {
        code: 1,
        stderr:
          'Post "https://api.github.com/graphql": proxyconnect tcp: dial tcp 127.0.0.1:9: connect: connection refused',
      },
      "offline",
    ],
    ["limite de API", { code: 1, stderr: "API rate limit exceeded for user ID 1" }, "rate-limit"],
    [
      "não é repositório git",
      { code: 1, stderr: "failed to run git: fatal: not a git repository" },
      "not-a-repo",
    ],
    ["tempo esgotado", { code: null, timedOut: true }, "timeout"],
    ["o resto", { code: 1, stderr: "algo que ninguém previu" }, "failed"],
  ];

  it.each(cases)("%s", (_name, result, kind) => {
    expect(classify({ ...OK, ...result })?.kind).toBe(kind);
  });

  it("`gh auth login` numa mensagem de host desconhecido não vira `sem autenticação`", () => {
    // As duas mensagens do `gh` citam o mesmo comando. Se a ordem da
    // classificação invertesse, a barra mandaria a pessoa rodar um login que
    // não resolve nada — e ela rodaria.
    const failure = classify({
      ...OK,
      code: 1,
      stderr: "none of the git remotes ... known GitHub host ... please use `gh auth login`",
    });

    expect(failure?.kind).toBe("unsupported-host");
  });

  it("o stderr cru não sai daqui", async () => {
    // §4.1.4 do PRD: `stderr` pode conter a URL do remote, e remote mal
    // configurado carrega credencial nela.
    const leaky = "fatal: could not read Username for 'https://joao:s3nh4@github.com'";
    const gh = fakeGh(() => ({ code: 1, stderr: leaky }));
    const read = await createGhHost({ exec: gh.exec }).read({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
    });

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.failure.message).not.toContain("s3nh4");
    expect(read.failure.message).not.toContain(leaky);
  });

  it("lê o horário de volta quando o host informa, e devolve null quando não", () => {
    expect(
      classify({ ...OK, code: 1, stderr: "API rate limit exceeded. Reset at 2026-09-05T03:10:00Z" })
        ?.retryAt,
    ).toBe("2026-09-05T03:10:00Z");
    expect(classify({ ...OK, code: 1, stderr: "API rate limit exceeded" })?.retryAt).toBeNull();
  });
});

describe("a escrita, e a fronteira que ela move (F7)", () => {
  it("cria a PR com cada valor colado à sua flag", async () => {
    // §4.2.9: um valor solto pode ser lido como flag quando começa com `-`.
    // Colado, ele é um token só e não pode virar outra coisa.
    const gh = fakeGh(() => ({ stdout: "https://github.com/exemplo/repo/pull/42\n" }));
    const write = await createGhHost({ exec: gh.exec }).create({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      base: "main",
      head: "pr-bar",
      title: "feat: a barra da PR",
      body: "corpo\ncom\nlinhas",
      draft: false,
    });

    expect(write).toEqual({ ok: true, url: "https://github.com/exemplo/repo/pull/42" });

    const [args] = gh.calls;
    expect(args!.slice(0, 2)).toEqual(["pr", "create"]);
    expect(args).toContain("--base=main");
    expect(args).toContain("--head=pr-bar");
    expect(args).toContain("--title=feat: a barra da PR");
    expect(args!.some((arg) => arg.startsWith("--body-file="))).toBe(true);
    // O corpo NÃO viaja como argumento: markdown longo esbarra em ARG_MAX numa
    // máquina e não na outra, que é o defeito que só aparece na de outra pessoa.
    expect(args!.some((arg) => arg.includes("com\nlinhas"))).toBe(false);
  });

  it("um título hostil não vira flag", async () => {
    const gh = fakeGh(() => ({ stdout: "https://github.com/exemplo/repo/pull/43" }));
    await createGhHost({ exec: gh.exec }).create({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      base: "main",
      head: "pr-bar",
      title: "--repo=outro/repo",
      body: "",
      draft: false,
    });

    const [args] = gh.calls;
    // Ele está lá, mas dentro de `--title=`, que é um token só. Nenhum argumento
    // do vetor **é** `--repo=outro/repo`.
    expect(args).toContain("--title=--repo=outro/repo");
    expect(args).not.toContain("--repo=outro/repo");
  });

  it("caractere de controle é recusado antes de virar argv", async () => {
    const gh = fakeGh(() => ({}));
    const write = await createGhHost({ exec: gh.exec }).create({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      base: "main",
      head: "pr-bar",
      title: "titulo\ncom quebra",
      body: "",
      draft: false,
    });

    expect(write.ok).toBe(false);
    // E o processo nem chegou a existir: recusar depois de executar não é recusar.
    expect(gh.calls).toEqual([]);
  });

  it("PR sem título não é criada", async () => {
    const gh = fakeGh(() => ({}));
    const write = await createGhHost({ exec: gh.exec }).create({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      base: "main",
      head: "pr-bar",
      title: "   ",
      body: "",
      draft: false,
    });

    expect(write.ok).toBe(false);
    expect(gh.calls).toEqual([]);
  });

  it("`--draft` só aparece quando foi pedido", async () => {
    const gh = fakeGh(() => ({ stdout: "https://github.com/exemplo/repo/pull/44" }));
    const host = createGhHost({ exec: gh.exec });
    const input = {
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      base: "main",
      head: "pr-bar",
      title: "t",
      body: "",
    };

    await host.create({ ...input, draft: false });
    await host.create({ ...input, draft: true });

    expect(gh.calls[0]).not.toContain("--draft");
    expect(gh.calls[1]).toContain("--draft");
  });

  it("mescla com a estratégia pedida, e o número vira argumento posicional", async () => {
    const gh = fakeGh(() => ({}));
    const write = await createGhHost({ exec: gh.exec }).merge({
      repoPath: "/tmp/repo",
      remoteUrl: GITHUB,
      number: 19,
      strategy: "squash",
      deleteBranch: true,
    });

    expect(write.ok).toBe(true);
    expect(gh.calls[0]).toEqual(["pr", "merge", "19", "--squash", "--delete-branch"]);
  });

  it("número que não é inteiro positivo não vira processo", async () => {
    const gh = fakeGh(() => ({}));
    const host = createGhHost({ exec: gh.exec });
    const base = { repoPath: "/tmp/repo", remoteUrl: GITHUB, strategy: "merge" as const, deleteBranch: false };

    for (const number of [0, -1, 1.5, Number.NaN]) {
      expect((await host.merge({ ...base, number })).ok).toBe(false);
    }
    expect(gh.calls).toEqual([]);
  });

  it("host sem integração recusa a escrita também", async () => {
    const gh = fakeGh(() => ({}));
    const host = createGhHost({ exec: gh.exec });

    const merged = await host.merge({
      repoPath: "/tmp/repo",
      remoteUrl: "https://gitlab.com/a/b.git",
      number: 19,
      strategy: "merge",
      deleteBranch: false,
    });

    expect(merged.ok).toBe(false);
    expect(gh.calls).toEqual([]);
  });
});
