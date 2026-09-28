/**
 * The three git hooks, as decisions with tests (T17 of
 * docs/features/024-dev-harness/tasks.md). `.husky/<hook>` is one line that calls
 * this file; nothing about what a hook does lives in shell.
 *
 * A git hook is **feedback, not a gate**: `--no-verify` and `HUSKY=0` walk past
 * it. What makes it hold for an agent is the guard (T18), which refuses both.
 * What makes it hold for everyone is the ruleset and the CI (T2).
 *
 * The costs that decided what runs where, measured on 2026-09-28
 * ([Q10](../../docs/features/024-dev-harness/open-questions.md)): `docs:check`
 * 0.4 s, `design:derive --check` 0.3 s, `typecheck` 2 s warm and ~23 s cold,
 * `gate:quick` up to 84 s. Hence nothing slow in `pre-commit`.
 *
 * Run by `node --experimental-strip-types`, so it imports nothing but `node:`.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROTECTED_BRANCHES = new Set(["main", "master"]);

// ---------------------------------------------------------------------------
// pre-commit

export interface PreCommitPlan {
  refuse: string | null;
  /** Commands to run, each with the reason it was chosen. */
  run: { argv: string[]; why: string }[];
}

export function planPreCommit(branch: string | null, staged: readonly string[]): PreCommitPlan {
  if (branch !== null && PROTECTED_BRANCHES.has(branch)) {
    return {
      refuse: `commit direto em \`${branch}\`: crie uma branch — a \`main\` só recebe por PR (T2)`,
      run: [],
    };
  }
  const run: PreCommitPlan["run"] = [];
  if (staged.some((path) => path.endsWith(".md"))) {
    run.push({ argv: ["pnpm", "-s", "docs:check"], why: "há `.md` em stage" });
  }
  if (staged.some((path) => path === "packages/web/src/styles/tokens.css")) {
    run.push({
      argv: ["pnpm", "-s", "--filter", "@lumem/web", "design:derive", "--check"],
      why: "o `tokens.css` está em stage",
    });
  }
  return { refuse: null, run };
}

// ---------------------------------------------------------------------------
// commit-msg

const TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "ci", "build", "perf", "style", "revert"];
const CONVENTIONAL = new RegExp(`^(${TYPES.join("|")})(\\([^()\\s]+\\))?!?: \\S`);
export const SUBJECT_LIMIT = 72;

/** The subject line git will keep: comments and leading blank lines removed. */
export function subjectOf(message: string): string {
  const lines = message.split("\n").filter((line) => !line.startsWith("#"));
  return (lines.find((line) => line.trim() !== "") ?? "").trimEnd();
}

export function checkCommitMessage(message: string): string | null {
  const subject = subjectOf(message);
  if (subject === "") return null; // git itself aborts an empty message
  // Messages git writes on its own, and the ones `rebase --autosquash` reads.
  if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(subject)) return null;
  if (!CONVENTIONAL.test(subject)) {
    return (
      `o assunto não segue o Conventional Commits:\n\n    ${subject}\n\n` +
      `A forma é \`tipo(escopo): assunto\`, com tipo em ${TYPES.join(", ")}. Exemplo:\n\n` +
      "    fix(server): close the turn when session/prompt fails"
    );
  }
  if (subject.length > SUBJECT_LIMIT) {
    return (
      `o assunto tem ${subject.length} caracteres, e o limite é ${SUBJECT_LIMIT}:\n\n    ${subject}\n\n` +
      "O detalhe vai no corpo, depois de uma linha em branco."
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// pre-push

const ZERO = /^0+$/;

export interface PushedRef {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

/** The lines git hands `pre-push` on stdin. */
export function parsePushedRefs(stdin: string): PushedRef[] {
  return stdin
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [localRef = "", localSha = "", remoteRef = "", remoteSha = ""] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export type PrePushPlan =
  | { kind: "skip"; why: string }
  | { kind: "gate"; base: string; why: string };

/**
 * Whether the gate runs, and against which base. The gate tests the working
 * tree, so it runs only for a push of `HEAD`; the base is the remote's tip of
 * that branch, so a push of five commits tests five commits and not the last
 * one (`gate:quick` defaults to `HEAD^`).
 */
export function planPrePush(refs: readonly PushedRef[], head: string, stamped: boolean, fallbackBase: string): PrePushPlan {
  const branches = refs.filter((ref) => ref.localRef.startsWith("refs/heads/") && !ZERO.test(ref.localSha));
  if (branches.length === 0) return { kind: "skip", why: "o push não leva commit de branch (tag ou remoção)" };
  const ofHead = branches.find((ref) => ref.localSha === head);
  if (ofHead === undefined) {
    return { kind: "skip", why: "o push é de outra ref que não o HEAD, e o gate testa a árvore de trabalho" };
  }
  if (stamped) return { kind: "skip", why: "esta árvore já passou no `gate:quick`" };
  const base = ZERO.test(ofHead.remoteSha) ? fallbackBase : ofHead.remoteSha;
  return { kind: "gate", base, why: ZERO.test(ofHead.remoteSha) ? "branch nova no remoto" : "commits novos desde o remoto" };
}

// ---------------------------------------------------------------------------
// The stamp, shared with the Stop hook (T19).

function git(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync("git", args, { encoding: "utf8", env });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/**
 * The hash of the working tree **as it is on disk**, untracked files included:
 * written through a throwaway index, so the real one is never touched. Clean,
 * it equals `HEAD^{tree}`.
 */
export function workingTreeHash(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-tree-"));
  const index = join(dir, "index");
  try {
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(["read-tree", "HEAD"], env);
    git(["add", "-A"], env);
    return git(["write-tree"], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function stampPath(): string {
  return git(["rev-parse", "--git-path", "lumem-gate-green"]);
}

export function isStamped(tree: string): boolean {
  const path = stampPath();
  return existsSync(path) && readFileSync(path, "utf8").trim() === tree;
}

export function writeStamp(tree: string): void {
  writeFileSync(stampPath(), `${tree}\n`);
}

// ---------------------------------------------------------------------------
// The hook process.

function say(line: string): void {
  process.stderr.write(`${line}\n`);
}

function run(argv: string[]): number {
  const [command, ...args] = argv as [string, ...string[]];
  return spawnSync(command, args, { stdio: "inherit" }).status ?? 1;
}

function currentBranch(): string | null {
  try {
    return git(["symbolic-ref", "--short", "-q", "HEAD"]);
  } catch {
    return null;
  }
}

async function readStdin(): Promise<string> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main(): Promise<number> {
  const hook = process.argv[2];
  if (hook === "pre-commit") {
    const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).split("\n").filter(Boolean);
    const plan = planPreCommit(currentBranch(), staged);
    if (plan.refuse !== null) {
      say(`pre-commit: ${plan.refuse}`);
      return 1;
    }
    for (const step of plan.run) {
      say(`pre-commit: ${step.argv.slice(1).join(" ")} (${step.why})`);
      if (run(step.argv) !== 0) return 1;
    }
    return 0;
  }
  if (hook === "commit-msg") {
    const file = process.argv[3];
    if (file === undefined) return 0;
    const problem = checkCommitMessage(readFileSync(file, "utf8"));
    if (problem !== null) {
      say(`commit-msg: ${problem}`);
      return 1;
    }
    return 0;
  }
  if (hook === "pre-push") {
    const refs = parsePushedRefs(await readStdin());
    const head = git(["rev-parse", "HEAD"]);
    const tree = workingTreeHash();
    let fallback = "HEAD^";
    try {
      fallback = git(["merge-base", "HEAD", "origin/main"]);
    } catch {
      // no origin/main: the gate's own default
    }
    const plan = planPrePush(refs, head, isStamped(tree), fallback);
    if (plan.kind === "skip") {
      say(`pre-push: sem gate — ${plan.why}`);
      return 0;
    }
    say(`pre-push: pnpm gate:quick desde ${plan.base.slice(0, 12)} (${plan.why})`);
    const status = spawnSync("pnpm", ["-s", "gate:quick"], {
      stdio: "inherit",
      env: { ...process.env, LUMEM_GATE_BASE: plan.base },
    }).status;
    if (status !== 0) {
      say("pre-push: o gate:quick reprovou — o push não sai. Conserte, ou diga por que o vermelho é esperado.");
      return 1;
    }
    writeStamp(tree);
    return 0;
  }
  say(`git-hook: hook desconhecido \`${hook ?? ""}\``);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code), (error: unknown) => {
    say(`git-hook: ${(error as Error).message}`);
    process.exit(1);
  });
}
