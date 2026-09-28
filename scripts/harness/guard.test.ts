/**
 * The guard's decisions, one row per spelling of each action (T18 of
 * docs/features/024-dev-harness/tasks.md).
 *
 * Every row is the raw `PreToolUse` input Claude sends — `tool_name`,
 * `tool_input`, `cwd` — because the defect this file exists to catch is a
 * spelling the floor lets through and the guard does too.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decide, splitCommands, type GuardContext, type HookInput } from "./guard.js";
import { DENY_FLOOR } from "./policy.js";

const PROJECT = "/work/lumem-os";
const HOME = "/home/dev";

function context(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    projectDir: PROJECT,
    home: HOME,
    writableRoots: ["/tmp", join(HOME, ".claude", "projects")],
    currentBranch: () => "feature-x",
    hasUncommittedChanges: () => false,
    ...overrides,
  };
}

function bash(command: string): HookInput {
  return { tool_name: "Bash", tool_input: { command, description: "probe" }, cwd: PROJECT };
}

function write(file_path: string): HookInput {
  return { tool_name: "Write", tool_input: { file_path, content: "x" }, cwd: PROJECT };
}

const REFUSED: readonly [string, HookInput][] = [
  ["push --force", bash("git push --force origin feature-x")],
  ["push -f", bash("git push -f")],
  ["push com cluster -uf", bash("git push -uf origin feature-x")],
  ["push --force-with-lease", bash("git push --force-with-lease origin feature-x")],
  ["push +refspec", bash("git push origin +feature-x")],
  ["push +main", bash("git push origin +main")],
  ["push HEAD:main", bash("git push origin HEAD:main")],
  ["push main", bash("git push origin main")],
  ["push refs/heads/main", bash("git push origin HEAD:refs/heads/main")],
  ["push sem refspec estando em main", bash("git push")],
  ["push --tags", bash("git push --tags")],
  ["push --mirror", bash("git push --mirror origin")],
  ["push --no-verify", bash("git push --no-verify")],
  ["push --delete main", bash("git push origin --delete main")],
  ["push :main", bash("git push origin :main")],
  ["git -C dir push -f", bash("git -C ../outro push -f")],
  ["commit --no-verify", bash("git commit --no-verify -m 'x'")],
  ["commit -n", bash("git commit -n -m x")],
  ["commit com cluster -nm", bash("git commit -nm x")],
  ["HUSKY=0 na frente", bash("HUSKY=0 git commit -m x")],
  ["export HUSKY=0", bash("export HUSKY=0 && git commit -m x")],
  ["env HUSKY=0", bash("env HUSKY=0 git push")],
  ["core.hooksPath desligado", bash("git config core.hooksPath /dev/null")],
  ["core.hooksPath --unset", bash("git config --unset core.hooksPath")],
  ["reset --hard com mudança", bash("git reset --hard HEAD~1")],
  ["npm publish", bash("npm publish")],
  ["npm publish --dry-run", bash("npm publish --dry-run")],
  ["pnpm publish", bash("pnpm --filter @vinihcrosa/lumem-os publish")],
  ["npm dist-tag", bash("npm dist-tag add @vinihcrosa/lumem-os@0.5.0 latest")],
  ["npm unpublish", bash("npm unpublish @vinihcrosa/lumem-os@0.6.0")],
  ["gh repo delete", bash("gh repo delete vinihcrosa/lumem-os --yes")],
  ["gh pr merge", bash("gh pr merge 92 --squash")],
  ["gh api -X DELETE", bash("gh api -X DELETE repos/vinihcrosa/lumem-os")],
  ["gh api -XDELETE", bash("gh api -XDELETE repos/vinihcrosa/lumem-os")],
  ["gh api --method=delete", bash("gh api --method=delete repos/vinihcrosa/lumem-os")],
  ["gh release delete", bash("gh release delete v0.6.0")],
  ["rm -rf ~/.lumem", bash("rm -rf ~/.lumem")],
  ["rm -rf $HOME/.lumem/x", bash('rm -rf "$HOME/.lumem/workspaces"')],
  ["rm -r ~", bash("rm -r ~")],
  ["a segunda parte de uma cadeia", bash("git status && git push --force")],
  ["depois de um pipe", bash("echo y | npm publish")],
  ["dentro de bash -c", bash("bash -c 'git push -f'")],
  ["sudo na frente", bash("sudo npm publish")],
  ["substituição de comando: recusa por não ler", bash("git push $(echo --force)")],
  ["backtick: recusa por não ler", bash("git push `echo -f`")],
  ["aspas sem fechar: recusa por não ler", bash("git commit -m 'sem fechar")],
  ["heredoc alimentando um shell", bash("bash <<'EOF'\ngit push --force\nEOF")],
  ["heredoc sem aspas com substituição", bash("cat <<EOF\n$(rm -rf ~)\nEOF")],
  ["heredoc sem terminador", bash("cat <<'EOF'\nnunca fecha")],
  ["depois de um heredoc", bash("cat <<'EOF'\ntexto\nEOF\ngit push -f")],
  ["Write fora do checkout", write("/home/dev/.lumem/zz.txt")],
  ["Write em ~/.config/husky", write("~/.config/husky/init.sh")],
  ["Edit fora do checkout, relativo", { tool_name: "Edit", tool_input: { file_path: "../outro-repo/x.ts" }, cwd: PROJECT }],
  ["Bash sem command", { tool_name: "Bash", tool_input: {}, cwd: PROJECT }],
];

const ALLOWED: readonly [string, HookInput][] = [
  ["push de uma branch", bash("git push -u origin feature-x")],
  ["push sem refspec fora de main", bash("git push")],
  ["push de tag pelo nome", bash("git push origin v0.7.0")],
  ["apagar branch remota que não é main", bash("git push origin --delete probe/ruleset-red")],
  ["commit comum", bash("git commit -m 'feat: x'")],
  ["commit com -m e -a", bash("git commit -am 'fix: y'")],
  ["reset --hard com árvore limpa", bash("git reset --hard origin/feature-x")],
  ["git config de outra chave", bash("git config user.name x")],
  ["ler o core.hooksPath", bash("git config core.hooksPath")],
  ["pnpm test", bash("pnpm test")],
  ["npm view", bash("npm view @vinihcrosa/lumem-os version")],
  ["gh api GET", bash("gh api repos/vinihcrosa/lumem-os --jq .name")],
  ["gh api PUT", bash("gh api -X PUT repos/vinihcrosa/lumem-os/rulesets/1 --input x.json")],
  ["gh pr create", bash("gh pr create --base main --title x")],
  ["rm -rf de algo do checkout", bash("rm -rf packages/cli/dist")],
  ["rm -rf de /tmp", bash("rm -rf /tmp/lumem-t0")],
  ["a palavra main num commit", bash("git commit -m 'docs: main branch'")],
  ["HUSKY em outro contexto", bash("echo HUSKY=0")],
  ["heredoc com aspas e crase dentro — o que achou o defeito", bash("python3 - <<'PY'\nprint('`x`' + \"$(y)\")\nPY")],
  ["commit por heredoc", bash("git commit -q -F - <<'EOF'\nfix: `x` e $(y) são texto\nEOF")],
  ["heredoc com <<- e tab", bash("cat <<-'EOF'\n\tlinha\n\tEOF")],
  ["2>&1 não é segundo plano", bash("pnpm test 2>&1 | tail -5")],
  ["&> redireciona", bash("pnpm build &>/tmp/log")],
  ["Write no checkout", write("/work/lumem-os/scripts/x.ts")],
  ["Write relativo no checkout", write("docs/x.md")],
  ["Write em /tmp", write("/tmp/x.txt")],
  ["Write na memória do agente", write("/home/dev/.claude/projects/p/memory/x.md")],
  ["Read, que não é deste guarda", { tool_name: "Read", tool_input: { file_path: "/etc/hosts" }, cwd: PROJECT }],
];

describe("o guarda recusa", () => {
  it.each(REFUSED)("%s", (_name, input) => {
    const ctx = context({
      currentBranch: () => (input.tool_input?.["command"] === "git push" ? "main" : "feature-x"),
      hasUncommittedChanges: () => true,
    });
    const verdict = decide(input, ctx);
    expect(verdict.allow).toBe(false);
    if (!verdict.allow) expect(verdict.reason.length).toBeGreaterThan(10);
  });
});

describe("o guarda deixa passar", () => {
  it.each(ALLOWED)("%s", (_name, input) => {
    expect(decide(input, context())).toEqual({ allow: true });
  });
});

describe("o piso do `deny` é subconjunto do guarda", () => {
  const home = context().home;
  const cases = DENY_FLOOR.filter(({ rule }) => rule.startsWith("Bash(")).map(({ rule }) => {
    const inner = rule.slice("Bash(".length, -1);
    const command = inner.endsWith(" *") ? `${inner.slice(0, -2)} --probe` : inner;
    return [rule, command.replace("~", home)] as const;
  });

  it.each(cases)("%s", (_rule, command) => {
    expect(decide(bash(command), context()).allow).toBe(false);
  });

  it.each(DENY_FLOOR.filter(({ rule }) => rule.startsWith("Edit(")).map(({ rule }) => [rule] as const))(
    "%s",
    (rule) => {
      const path = rule.slice("Edit(".length, -1).replace("/**", "/probe.txt");
      expect(decide(write(path), context()).allow).toBe(false);
    },
  );
});

describe("o parser", () => {
  it("separa comandos por operador e respeita aspas", () => {
    expect(splitCommands("a 'b c' && d \"e;f\" | g; h")).toEqual([["a", "b c"], ["d", "e;f"], ["g"], ["h"]]);
  });
});

describe("o processo do hook", () => {
  const script = join(import.meta.dirname, "guard.ts");
  function run(stdin: string) {
    return spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", script], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: "/tmp" },
    });
  }

  it("sai 2 com a frase no stderr quando recusa", () => {
    const result = run(JSON.stringify(bash("git push --force")));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Recusado pelo guarda");
  });

  it("sai 0 quando deixa passar", () => {
    expect(run(JSON.stringify({ ...bash("ls"), cwd: "/tmp" })).status).toBe(0);
  });

  it("recusa uma entrada que não é JSON, em vez de liberar", () => {
    expect(run("isto não é json").status).toBe(2);
  });
});
