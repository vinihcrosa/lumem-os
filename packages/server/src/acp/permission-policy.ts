import { isAbsolute, relative, resolve } from "node:path";

import type { AcpPermissionOption, AcpToolKind, AcpToolLocation, LumemMode } from "@lumem/shared";

/**
 * What Lumem answers to `session/request_permission` when the agent offers no
 * modes of its own (`session-mode`, Q3 and Q6).
 *
 * Pure, and separate from `AcpManager`, because the interesting part is a
 * decision and the manager is a pile of I/O. Every branch here is a sentence
 * someone can argue with; none of them needs a process to exercise.
 *
 * **Nothing here ever denies.** Three outcomes: answer with the agent's own
 * allow option, or hand the request to the person with a reason. Denial stays a
 * human act — a policy that said "no" on its own would stop the agent with
 * nothing on screen to say why, which is the failure mode this feature exists to
 * remove, not to introduce.
 */

/** The `read` kind, and only it. See `AUTO_ONLY_READS`. */
const READ: AcpToolKind = "read";

export interface PermissionCall {
  kind: AcpToolKind;
  /** Absolute or relative to `cwd`; either is resolved before judging. */
  locations: readonly AcpToolLocation[];
  /** The options the agent offered. Auto-approval has to pick one of these. */
  options: readonly AcpPermissionOption[];
}

export type PermissionDecision =
  | { approve: true; optionId: string; reason: string }
  | { approve: false; reason: string | null };

/**
 * Why `execute` is out, even when the command only reads.
 *
 * `git log` reads and `git push` does not, and the protocol reports both as
 * `execute` with the same shape. Telling them apart means matching on the
 * command string — which is the list of special-cased names Q3 already rejected,
 * wearing a different hat. So the rule stops at the kind, and the answer to
 * "but `git log` is harmless" is the per-path rules feature, not an exception
 * here.
 */
const AUTO_ONLY_READS = true;

export function decidePermission(
  mode: LumemMode,
  cwd: string,
  call: PermissionCall,
): PermissionDecision {
  if (mode === "ask") {
    // No reason: the person was always going to be asked, and inventing prose
    // for the default would put a justification on every card that has none.
    return { approve: false, reason: null };
  }

  if (mode === "auto" && !isReadInside(cwd, call)) {
    return { approve: false, reason: whyNotAuto(cwd, call) };
  }

  /*
   * Q6, and the reason this check is not folded into the caller.
   *
   * The daemon cannot answer "yes" in the abstract: the request resolves with
   * one of the options the *agent* sent, so approving means finding the
   * `allow_once` one. An agent that offers none — only rejections, say — would
   * otherwise make `auto` deny in silence, which is the worst outcome available
   * to this feature. It goes up instead, saying so.
   */
  const allow = call.options.find((option) => option.kind === "allow_once");
  if (!allow) {
    return {
      approve: false,
      reason:
        "o modo do Lumem aprovaria isto, mas o agente não ofereceu nenhuma opção de permitir uma vez",
    };
  }

  return {
    approve: true,
    optionId: allow.optionId,
    reason:
      mode === "free"
        ? "Modo Liberado: nada é perguntado dentro deste checkout."
        : "Modo Automático: leitura de arquivo, caminho dentro do checkout.",
  };
}

/**
 * The `auto` rule, whole: a file read whose every path is inside the checkout.
 *
 * All three conditions are load-bearing, and the second is the one that looks
 * redundant and is not — a read with no location gives nothing to judge, and
 * treating silence as "inside" would make an unlabelled call the way through.
 */
function isReadInside(cwd: string, call: PermissionCall): boolean {
  if (AUTO_ONLY_READS && call.kind !== READ) return false;
  if (call.locations.length === 0) return false;
  return call.locations.every((location) => inside(cwd, location.path));
}

/** The sentence the card shows when `auto` did not cover a call. */
function whyNotAuto(cwd: string, call: PermissionCall): string {
  if (call.kind !== READ) {
    return `O modo Automático do Lumem aprova sozinho só leitura de arquivo. Esta chamada é "${call.kind}".`;
  }
  if (call.locations.length === 0) {
    return "O modo Automático do Lumem precisa saber qual arquivo: esta leitura não disse nenhum caminho.";
  }
  const outside = call.locations.find((location) => !inside(cwd, location.path));
  return `O modo Automático do Lumem aprova sozinho só dentro do checkout, e "${outside?.path ?? ""}" está fora.`;
}

/**
 * Is `path` inside `root`?
 *
 * Resolved and then compared with `relative`, never with `startsWith`. The
 * string comparison is the bug this function exists to not have: `<cwd>/../..`
 * *is* prefixed by `<cwd>`, and so is a sibling checkout whose name begins with
 * this one's. `relative` answers the question that was actually asked — how do
 * you get there from here — and an answer that climbs (`..`) or jumps to another
 * root (absolute) means "not inside".
 *
 * Not `realpath`: it touches the disk, and a path the agent is *about* to read
 * may not exist yet. What that leaves uncovered is a symlink inside the checkout
 * pointing out of it, which is a real hole and a smaller one than making this
 * function async and I/O-dependent — and the per-path rules feature is where a
 * symlink policy belongs.
 */
function inside(root: string, path: string): boolean {
  if (root === "") return false;
  const from = resolve(root);
  const to = resolve(from, path);
  if (to === from) return true;

  const step = relative(from, to);
  return step !== "" && !step.startsWith("..") && !isAbsolute(step);
}
