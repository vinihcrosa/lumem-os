/**
 * The three git hooks' decisions, and the wiring that makes husky call them
 * (T17 of docs/features/024-dev-harness/tasks.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SUBJECT_LIMIT,
  checkCommitMessage,
  parsePushedRefs,
  planPreCommit,
  planPrePush,
  subjectOf,
} from "./git-hook.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const ZERO = "0000000000000000000000000000000000000000";

describe("pre-commit", () => {
  it("recusa commit em main e em master", () => {
    expect(planPreCommit("main", []).refuse).toMatch(/main/);
    expect(planPreCommit("master", []).refuse).toMatch(/master/);
  });

  it("commit só de código não roda nada", () => {
    expect(planPreCommit("feature-x", ["packages/server/src/x.ts"])).toEqual({ refuse: null, run: [] });
  });

  it("`.md` em stage roda o docs:check", () => {
    const plan = planPreCommit("feature-x", ["docs/x.md", "packages/server/src/x.ts"]);
    expect(plan.run.map((step) => step.argv.join(" "))).toEqual(["pnpm -s docs:check"]);
  });

  it("o tokens.css em stage roda o design:derive --check", () => {
    const plan = planPreCommit("feature-x", ["packages/web/src/styles/tokens.css"]);
    expect(plan.run.map((step) => step.argv.join(" "))).toEqual([
      "pnpm -s --filter @lumem/web design:derive --check",
    ]);
  });

  it("HEAD destacado (rebase) não é main", () => {
    expect(planPreCommit(null, []).refuse).toBeNull();
  });
});

describe("commit-msg", () => {
  it.each([
    "feat: a thing",
    "fix(server): close the turn",
    "docs(024): answer Q8",
    "refactor(web)!: drop the old router",
    "Merge branch 'main' into feature-x",
    'Revert "feat: a thing"',
    "fixup! fix(server): close the turn",
    "# a comment line first\nfix: the subject is the first non-comment line",
  ])("aceita %j", (message) => {
    expect(checkCommitMessage(message)).toBeNull();
  });

  it.each(["wip", "Fix the thing", "feat:no space", "feature: not a type", "fix(): empty scope"])(
    "recusa %j, mostrando a mensagem e um exemplo",
    (message) => {
      const problem = checkCommitMessage(message);
      expect(problem).toContain(subjectOf(message));
      expect(problem).toContain("fix(server):");
    },
  );

  it(`recusa assunto acima de ${SUBJECT_LIMIT} caracteres, e aceita no limite`, () => {
    const at = `fix: ${"x".repeat(SUBJECT_LIMIT - 5)}`;
    expect(at).toHaveLength(SUBJECT_LIMIT);
    expect(checkCommitMessage(at)).toBeNull();
    expect(checkCommitMessage(`${at}y`)).toContain(`${SUBJECT_LIMIT + 1} caracteres`);
  });

  it("o corpo não conta para o limite", () => {
    expect(checkCommitMessage(`fix: short\n\n${"long body ".repeat(40)}`)).toBeNull();
  });
});

describe("pre-push", () => {
  const head = "a".repeat(40);
  const push = (localSha: string, remoteSha: string, localRef = "refs/heads/feature-x") =>
    parsePushedRefs(`${localRef} ${localSha} refs/heads/feature-x ${remoteSha}\n`);

  it("roda o gate desde a ponta do remoto, e não desde HEAD^", () => {
    expect(planPrePush(push(head, "b".repeat(40)), head, false, "fallback")).toEqual({
      kind: "gate",
      base: "b".repeat(40),
      why: "commits novos desde o remoto",
    });
  });

  it("branch nova no remoto usa a base de fora (o merge-base com a main)", () => {
    expect(planPrePush(push(head, ZERO), head, false, "c".repeat(40))).toMatchObject({ kind: "gate", base: "c".repeat(40) });
  });

  it("árvore carimbada não roda o gate de novo", () => {
    expect(planPrePush(push(head, "b".repeat(40)), head, true, "x").kind).toBe("skip");
  });

  it("push de tag, ou de remoção, não roda o gate", () => {
    expect(planPrePush(push(head, ZERO, "refs/tags/v0.7.0"), head, false, "x").kind).toBe("skip");
    expect(planPrePush(push(ZERO, "b".repeat(40)), head, false, "x").kind).toBe("skip");
  });

  it("push de outra ref que não o HEAD não roda o gate, porque ele testa a árvore de trabalho", () => {
    expect(planPrePush(push("d".repeat(40), "b".repeat(40)), head, false, "x").kind).toBe("skip");
  });
});

describe("o husky chama estes hooks", () => {
  it.each(["pre-commit", "commit-msg", "pre-push"])(".husky/%s chama git-hook.ts pelo node, em uma linha", (hook) => {
    const body = readFileSync(join(repoRoot, ".husky", hook), "utf8").trim();
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toMatch(new RegExp(`^node .*--experimental-strip-types scripts/harness/git-hook\\.ts ${hook}\\b`));
  });

  it("o `prepare` liga o husky no `pnpm install`", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["prepare"]).toBe("husky");
  });

  it("o CI desliga o husky, que não tem o que fazer num runner", () => {
    const ci = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/HUSKY:\s*0/);
  });
});
