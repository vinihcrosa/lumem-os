/**
 * Where the flow can be, and which of the five steps that position belongs to.
 *
 * Nine positions, five steps: the welcome, the handshake and the receipt are not
 * steps. The welcome asks nothing, the handshake is the *proof* of the agent
 * step, and the receipt is what the five of them produced.
 */
export type Position =
  | "welcome"
  | "machine"
  | "agent"
  | "handshake"
  | "workspace"
  | "project"
  | "task"
  | "done";

/** The rail's labels, in order. */
export const STEP_LABELS = ["máquina", "agente", "workspace", "projeto", "tarefa"] as const;

/**
 * The step each position belongs to, or `null` for the three that are not steps.
 *
 * `agent` and `handshake` share step 1 on purpose: the handshake is the same
 * step still happening, and giving it a number of its own would make the rail
 * claim six steps while every screen says five.
 */
const STEP_OF: Record<Position, number | null> = {
  welcome: null,
  machine: 0,
  agent: 1,
  handshake: 1,
  workspace: 2,
  project: 3,
  task: 4,
  done: null,
};

export function stepOf(position: Position): number | null {
  return STEP_OF[position];
}

/** `passo 2 de 5`, for the screen that is one. */
export function eyebrowFor(position: Position): string | null {
  const step = stepOf(position);
  return step === null ? null : `passo ${step + 1} de ${STEP_LABELS.length}`;
}
