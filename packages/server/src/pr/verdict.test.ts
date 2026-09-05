import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { countChecks, decide, groupOf, type GhCheck, type GhPullRequest } from "./verdict.js";

/**
 * A tabela do veredito.
 *
 * Ela é a parte que a tela inteira depende e a única que é pura, então é o
 * lugar onde vale escrever caso por caso em vez de confiar num caminho feliz.
 */

function check(over: Partial<GhCheck> = {}): GhCheck {
  return {
    name: "lint",
    app: "CI",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    url: "https://github.com/exemplo/repo/actions/runs/1/job/1",
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

function pr(over: Partial<GhPullRequest> = {}): GhPullRequest {
  return {
    number: 19,
    url: "https://github.com/exemplo/repo/pull/19",
    title: "uma pull request",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefName: "pr-bar",
    baseRefName: "main",
    updatedAt: "2026-09-05T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "pessoa-1",
    reviews: [],
    checks: [],
    ...over,
  };
}

describe("o veredito", () => {
  it("responde `ready` quando nada impede", () => {
    const decision = decide(pr({ checks: [check(), check({ name: "unit" })] }));

    expect(decision.verdict).toBe("ready");
    expect(decision.reason).toEqual({ kind: "ready", passed: 2, approvedBy: [] });
  });

  it("nomeia quem aprovou, porque a barra mostra", () => {
    const decision = decide(
      pr({
        reviewDecision: "APPROVED",
        reviews: [
          { author: "pessoa-2", state: "APPROVED" },
          { author: "pessoa-3", state: "COMMENTED" },
        ],
      }),
    );

    expect(decision.reason).toEqual({ kind: "ready", passed: 0, approvedBy: ["pessoa-2"] });
  });

  it("lê `state` antes de `mergeable` — senão toda PR mesclada fica âmbar", () => {
    // O spike achou isto: o GitHub só calcula mergeabilidade sob demanda, e não
    // a calcula para PR que acabou. Uma tabela que lesse `mergeable` primeiro
    // pintaria de âmbar exatamente o estado que já terminou.
    const decision = decide(
      pr({ state: "MERGED", mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    );

    expect(decision).toEqual({ verdict: "merged", reason: { kind: "merged", base: "main" } });
  });

  it("responde `closed` para PR fechada sem merge", () => {
    const decision = decide(pr({ state: "CLOSED", mergeable: "UNKNOWN" }));

    expect(decision).toEqual({ verdict: "closed", reason: { kind: "closed" } });
  });

  it("rascunho não é bloqueio: é `não pronto ainda`", () => {
    // §2.3 do PRD. Rascunho é neutro, e por isso vem ANTES dos bloqueios: um
    // rascunho com conflito continua sendo um rascunho.
    const decision = decide(
      pr({ isDraft: true, mergeable: "CONFLICTING", checks: [check(), check({ name: "unit" })] }),
    );

    expect(decision).toEqual({ verdict: "draft", reason: { kind: "draft", passed: 2 } });
  });
});

describe("a prioridade do bloqueio", () => {
  it("com duas causas ao mesmo tempo, nomeia o conflito", () => {
    // A prova que a F1.4 pede: conflito > verificação reprovada. Quatro motivos
    // empilhados não cabem em 360px, e você resolve um por vez de qualquer forma.
    const decision = decide(
      pr({
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [{ author: "pessoa-3", state: "CHANGES_REQUESTED" }],
        checks: [check({ name: "e2e (macOS)", conclusion: "FAILURE" })],
      }),
    );

    expect(decision).toEqual({ verdict: "blocked", reason: { kind: "conflict", base: "main" } });
  });

  it("verificação reprovada vem antes de mudanças pedidas", () => {
    const decision = decide(
      pr({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [{ author: "pessoa-3", state: "CHANGES_REQUESTED" }],
        checks: [check({ name: "lint", conclusion: "FAILURE" }), check({ name: "unit" })],
      }),
    );

    expect(decision).toEqual({
      verdict: "blocked",
      reason: { kind: "checks-failed", names: ["lint"] },
    });
  });

  it("mudanças pedidas vem antes da regra da base, e traz quem pediu", () => {
    const decision = decide(
      pr({
        mergeStateStatus: "BLOCKED",
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [
          { author: "pessoa-3", state: "CHANGES_REQUESTED" },
          { author: "pessoa-4", state: "COMMENTED" },
        ],
      }),
    );

    expect(decision).toEqual({
      verdict: "blocked",
      reason: { kind: "changes-requested", by: ["pessoa-3"] },
    });
  });

  it("regra da base é o último dos quatro", () => {
    const decision = decide(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" }));

    expect(decision).toEqual({ verdict: "blocked", reason: { kind: "review-required" } });
  });

  it("`reviewDecision` vazio não é falta de revisão", () => {
    // Ele volta vazio quando o repositório NÃO exige revisão. Tratar isso como
    // exigência bloquearia toda PR de repositório pessoal — que é o caso mais
    // comum de quem usa o Lumem.
    expect(decide(pr({ reviewDecision: "" })).verdict).toBe("ready");
  });

  it("`BEHIND` é bloqueio, e diz de qual base está atrás", () => {
    const decision = decide(pr({ mergeStateStatus: "BEHIND", baseRefName: "release/2" }));

    expect(decision).toEqual({
      verdict: "blocked",
      reason: { kind: "behind", base: "release/2" },
    });
  });

  it("host que bloqueia sem dizer o quê vira uma frase que cita a regra dele", () => {
    const decision = decide(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "" }));

    expect(decision).toEqual({ verdict: "blocked", reason: { kind: "blocked-by-host" } });
  });
});

describe("âmbar, que é metade da vida de uma PR", () => {
  it("verificação rodando é `pending`, nunca `blocked`", () => {
    const decision = decide(
      pr({
        mergeStateStatus: "BLOCKED",
        checks: [check({ name: "e2e (macOS)", status: "IN_PROGRESS", conclusion: "" })],
      }),
    );

    expect(decision.verdict).toBe("pending");
  });

  it("verificação na fila também é âmbar, e é contada à parte (Q6)", () => {
    const decision = decide(
      pr({
        checks: [
          check({ name: "build", status: "IN_PROGRESS", conclusion: "" }),
          check({ name: "deploy preview", status: "QUEUED", conclusion: "" }),
          check({ name: "lint" }),
        ],
      }),
    );

    expect(decision).toEqual({
      verdict: "pending",
      reason: {
        kind: "checks-running",
        names: ["build", "deploy preview"],
        running: 1,
        queued: 1,
      },
    });
  });

  it("uma reprovada no meio de três rodando ainda é vermelho", () => {
    // Rodando é âmbar; reprovado é definitivo. A ordem da tabela é o que
    // impede um vermelho de ficar escondido atrás de um âmbar.
    const decision = decide(
      pr({
        checks: [
          check({ name: "build", status: "IN_PROGRESS", conclusion: "" }),
          check({ name: "e2e", conclusion: "FAILURE" }),
          check({ name: "unit", status: "QUEUED", conclusion: "" }),
        ],
      }),
    );

    expect(decision).toEqual({
      verdict: "blocked",
      reason: { kind: "checks-failed", names: ["e2e"] },
    });
  });

  it("`UNKNOWN` numa PR aberta é `não sei dizer`, e não verde", () => {
    const decision = decide(pr({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }));

    expect(decision).toEqual({ verdict: "pending", reason: { kind: "mergeability-unknown" } });
  });

  it("campo que ninguém previu não explode e não vira verde", () => {
    const decision = decide(pr({ mergeable: "ALGO_NOVO", mergeStateStatus: "OUTRA_COISA" }));

    expect(decision).toEqual({ verdict: "pending", reason: { kind: "mergeability-unknown" } });
  });

  it("`UNSTABLE` com tudo verde ainda é `ready`", () => {
    // `UNSTABLE` quer dizer "tem check não obrigatório vermelho" — mas se
    // nenhum check está vermelho, o que sobra não impede.
    expect(decide(pr({ mergeStateStatus: "UNSTABLE" })).verdict).toBe("ready");
  });
});

describe("os grupos da aba PR", () => {
  it("`SKIPPED` não é sucesso nem falha", () => {
    expect(groupOf(check({ conclusion: "SKIPPED" }))).toBe("skipped");
  });

  it("`NEUTRAL` conta como passou", () => {
    // "Rodei e não tenho opinião." Tratar como falha reprovaria PR por causa de
    // um check que decidiu não opinar.
    expect(groupOf(check({ conclusion: "NEUTRAL" }))).toBe("passed");
  });

  it.each(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"])(
    "`%s` é falha",
    (conclusion) => {
      expect(groupOf(check({ conclusion }))).toBe("failed");
    },
  );

  it.each(["QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "PENDING"])(
    "`%s` é andamento, não importa a conclusão vazia",
    (status) => {
      expect(groupOf(check({ status, conclusion: "" }))).toBe("running");
    },
  );

  it("conta os quatro grupos", () => {
    const counts = countChecks([
      check({ conclusion: "FAILURE" }),
      check({ status: "QUEUED", conclusion: "" }),
      check(),
      check(),
      check({ conclusion: "SKIPPED" }),
    ]);

    expect(counts).toEqual({ failed: 1, running: 1, passed: 2, skipped: 1 });
  });
});

describe("a pureza, que é o que faz esta tabela testável", () => {
  it("não importa rede, processo nem banco", () => {
    // A P1 pede isto por escrito. Um `import` de `child_process` aqui não
    // quebraria teste nenhum — quebraria a razão de a tabela existir separada.
    const source = readFileSync(join(import.meta.dirname, "verdict.ts"), "utf8");
    const imports = [...source.matchAll(/^import .*?from "(.+?)";$/gm)].map((m) => m[1]!);

    expect(imports).toEqual([]);
  });
});

describe("contra a saída real do gh", () => {
  const load = (name: string): GhPullRequest[] =>
    JSON.parse(
      readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8"),
    ) as GhPullRequest[];

  it("decide toda PR aberta capturada sem explodir", () => {
    const verdicts = load("gh-pr-list-open.json").map((item) => decide(item).verdict);

    expect(verdicts).toHaveLength(6);
    expect(verdicts.every((verdict) => verdict !== undefined)).toBe(true);
  });

  it("toda PR fechada capturada responde `merged` ou `closed`, apesar do UNKNOWN", () => {
    // As quatro vieram com `mergeable: UNKNOWN` do host. É a regressão que este
    // arquivo existe para segurar.
    const closed = load("gh-pr-list-closed.json");

    expect(closed.every((item) => item.mergeable === "UNKNOWN")).toBe(true);
    expect(closed.map((item) => decide(item).verdict)).toEqual(
      closed.map((item) => (item.state === "MERGED" ? "merged" : "closed")),
    );
  });

  it("a PR construída com CI rodando é âmbar, e a de duas causas nomeia o conflito", () => {
    const [running, twoCauses] = load("gh-pr-list-built.json");

    expect(decide(running!)).toEqual({
      verdict: "pending",
      reason: { kind: "checks-running", names: ["e2e (macOS)", "deploy preview"], running: 1, queued: 1 },
    });
    expect(decide(twoCauses!)).toEqual({
      verdict: "blocked",
      reason: { kind: "conflict", base: "main" },
    });
  });

  it("repositório sem PR é uma lista vazia, e não um erro", () => {
    expect(load("gh-pr-list-empty.json")).toEqual([]);
  });
});
