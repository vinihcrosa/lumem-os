/**
 * The agent's permission floor for this repository, with the reason for every
 * line. `.claude/settings.json` carries the rules and cannot carry a comment —
 * JSON has none — so the reasons live here and `agent-policy.test.ts` holds the
 * two in lockstep: a rule the settings lose, or a rule the settings gain without
 * a reason here, turns the suite red.
 *
 * This is the **floor** ([Q11 of 024-dev-harness](../../docs/features/024-dev-harness/open-questions.md)):
 * it matches text, so `git push origin +main` forces without matching
 * `Bash(git push --force *)`. The guard in `guard.ts` (T18) reads the whole
 * command; this list is what still holds on the day the guard's script breaks.
 *
 * Measured on 2026-09-28 (T0, `docs/project/harness-audit.md` §11): a `deny` in
 * the project's settings refuses in `bypassPermissions`, on Claude Code and on
 * the `claude-agent-acp` the conveyor starts.
 */

export interface FloorRule {
  /** Exactly as it appears in `permissions.deny`. */
  rule: string;
  reason: string;
}

/**
 * `Bash(x)` and `Bash(x *)` both, because the space-star form is a prefix that
 * needs the space: `Bash(npm publish *)` alone does not match a bare
 * `npm publish`.
 */
function bash(command: string, reason: string): FloorRule[] {
  return [
    { rule: `Bash(${command})`, reason },
    { rule: `Bash(${command} *)`, reason },
  ];
}

export const DENY_FLOOR: readonly FloorRule[] = [
  ...bash("npm publish", "publishing happens by tag, through release.yml and its approval (T3), never from a session"),
  ...bash("npm unpublish", "irreversible on the public registry"),
  ...bash("npm dist-tag", "moves `latest` on the public registry; a rollback is T12's workflow, with approval"),
  ...bash("git push --force", "rewrites history; `main` refuses it server-side (T2), every other branch still loses work"),
  ...bash("git push -f", "the short form of --force"),
  ...bash("git push --tags", "pushes every local tag at once, and a `v*` tag starts a release"),
  ...bash("git push --no-verify", "skips the pre-push gate (T17)"),
  ...bash("git commit --no-verify", "skips pre-commit and commit-msg (T17)"),
  ...bash("git commit -n", "the short form of --no-verify"),
  ...bash("gh repo delete", "deletes the repository"),
  ...bash("gh api -X DELETE", "deletes a resource on the host"),
  ...bash("gh api --method DELETE", "the long form of -X DELETE"),
  ...bash("gh pr merge", "merging is the owner's decision while N3 auto-merge does not exist (Q7)"),
  ...bash("rm -rf ~/.lumem", "the product's production state on this machine"),
  { rule: "Read(~/.npmrc)", reason: "npm credential" },
  { rule: "Read(~/.aws/**)", reason: "cloud credentials" },
  { rule: "Read(~/.ssh/**)", reason: "SSH keys" },
  { rule: "Read(~/.config/gh/**)", reason: "the gh token — the same account every agent pushes with" },
  {
    rule: "Edit(~/.lumem/**)",
    reason:
      "the product's production state; `Edit` and not `Write`, because Claude Code accepts a `Write(...)` path rule and never consults it",
  },
  { rule: "Edit(~/.claude/settings.json)", reason: "the user-level policy does not edit itself" },
  { rule: "Edit(~/.claude/settings.local.json)", reason: "same" },
  { rule: "Edit(~/.claude/hooks/**)", reason: "user-level hooks run in every session" },
  { rule: "Edit(~/.config/husky/**)", reason: "husky sources `init.sh` from here before every hook, and `HUSKY=0` there disables them all (Q9)" },
];
