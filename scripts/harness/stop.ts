/**
 * The `Stop` hook: the gate before *"pronto"* (T19 of
 * docs/features/024-dev-harness/tasks.md).
 *
 * The rule *"before saying a task is done, run the gate it declares"* stops
 * depending on the agent remembering it. What makes it bearable is knowing that
 * **`Stop` does not know why Claude stopped** — finished, asked a question, is
 * in the RED of a TDD cycle, or just answered —, the same finding the `028`
 * measured on `end_turn`. So it is a warning that insists **once**
 * ([Q12](../../docs/features/024-dev-harness/open-questions.md)): the second stop
 * comes with `stop_hook_active: true` and passes, and the agent either fixes the
 * red or says why it is expected.
 *
 * Three limits:
 * - it runs only when the working tree differs from the last green tree — the
 *   stamp `pre-push` writes too, so the two never pay for the same gate twice;
 * - it never runs in a conveyor session: there the `028`'s gate already judges.
 *   A conveyor session is recognised by its checkout, which the daemon cuts under
 *   `<state dir>/workspaces/<workspace>/<project>/worktrees/`;
 * - it answers in JSON on stdout (`{"decision":"block","reason":…}`) and exits
 *   0: an exit code 2 would be read as an error of the hook, not as the gate.
 *
 * Run by `node --experimental-strip-types`, so it imports only `node:` and a
 * sibling by its `.ts` name.
 */
import { spawnSync } from "node:child_process";
import { sep } from "node:path";

import { isStamped, stampHead, withoutRepositoryVariables, workingTreeHash, writeStamp } from "./git-hook.ts";

export interface StopInput {
  stop_hook_active?: boolean;
  cwd?: string;
}

export type StopPlan = { kind: "skip"; why: string } | { kind: "gate" };

/** `<…>/.lumem<anything>/[…/]workspaces/<workspace>/<project>/worktrees/<checkout>` — the daemon's own tree. */
const CONVEYOR_CHECKOUT = /\/\.lumem[^/]*\/(?:.*\/)?workspaces\/[^/]+\/[^/]+\/worktrees\/[^/]+/;

export function isConveyorCheckout(cwd: string): boolean {
  return CONVEYOR_CHECKOUT.test(cwd.split(sep).join("/"));
}

export function planStop(input: StopInput, stamped: boolean): StopPlan {
  if (input.stop_hook_active === true) return { kind: "skip", why: "já cobrou uma vez neste turno" };
  if (input.cwd !== undefined && isConveyorCheckout(input.cwd)) {
    return { kind: "skip", why: "sessão da esteira: o portão da 028 julga" };
  }
  if (stamped) return { kind: "skip", why: "a árvore não mudou desde o último gate verde" };
  return { kind: "gate" };
}

export function blockReason(tail: string): string {
  return (
    "O `gate:quick` reprovou nesta árvore — o `Stop` do repositório (T19 da 024-dev-harness) cobra antes do " +
    "*pronto*:\n\n" +
    tail.trim() +
    "\n\nConserte, **ou** diga por que o vermelho é esperado (o RED de um ciclo de TDD, uma pergunta " +
    "pendente) e pare de novo — a segunda parada deste turno passa."
  );
}

function lastLines(text: string, count: number): string {
  // oxlint-disable-next-line no-control-regex -- tira os escapes ANSI do vitest antes de citar a saída
  return text.replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(-count).join("\n");
}

async function main(): Promise<void> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input: StopInput = {};
  try {
    input = JSON.parse(raw) as StopInput;
  } catch {
    return; // a Stop input we cannot read is not a reason to hold the turn
  }
  const tree = workingTreeHash();
  const plan = planStop(input, isStamped(tree));
  if (plan.kind === "skip") return;

  const base = stampHead() ?? "HEAD";
  const result = spawnSync("pnpm", ["-s", "gate:quick"], {
    encoding: "utf8",
    env: { ...withoutRepositoryVariables(process.env), LUMEM_GATE_BASE: base },
  });
  if (result.status === 0) {
    writeStamp(tree);
    return;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  process.stdout.write(JSON.stringify({ decision: "block", reason: blockReason(lastLines(output, 25)) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
