import { newId } from "@lumem/shared";

import { DomainError } from "../errors.js";
import type { CloneFailure, ClonePhase, CloneProgress } from "./clone.js";

/**
 * The state of the clone that is running, in memory.
 *
 * **In memory, and not in SQLite** (Q4). A job describes a child process, and
 * the process does not survive a restart of the daemon either — a persisted row
 * would assert "cloning" about nothing, which is the same class of lie that
 * `project.ts` avoids by recomputing `available` on every request instead of
 * storing it. What has to survive a restart is the rubbish on disk, and the
 * boot sweep handles that without needing the job at all: it recognises the
 * temporary directory by its name.
 *
 * **One at a time** (Q17). A second request is refused, naming the first. No
 * queue: a queue is more state, one more screen ("waiting") and one more order
 * to explain, all for a case that does not happen — a person adds one project.
 */

export type CloneState = "cloning" | "registering" | "done" | "failed" | "cancelled";

export interface CloneJob {
  id: string;
  workspaceId: string;
  /** Sanitized. Never the address as typed, if it carried a credential. */
  url: string;
  targetPath: string;
  name: string;
  state: CloneState;
  phase: ClonePhase | null;
  percent: number | null;
  /** git's last line, cleaned. What the UI shows in full. */
  message: string | null;
  /** Set when `state` is `failed`. Only `auth` has a flow of its own, F6.10. */
  failure: CloneFailure | null;
  /** Set on `done`. */
  projectId: string | null;
  startedAt: number;
  updatedAt: number;
}

const TERMINAL: readonly CloneState[] = ["done", "failed", "cancelled"];

export function isTerminal(state: CloneState): boolean {
  return TERMINAL.includes(state);
}

/** Four frames a second is enough for a progress bar. */
export const THROTTLE_MS = 250;

/** How long a finished job stays readable before it is collected. */
export const KEEP_TERMINAL_MS = 10 * 60_000;

export interface StartCloneInput {
  workspaceId: string;
  /** Sanitized before it gets here. */
  url: string;
  targetPath: string;
  name: string;
}

export interface CloneJobStore {
  /** Refuses with BLOCKED, naming the running one, while there is one (A11). */
  start(input: StartCloneInput): CloneJob;
  get(id: string): CloneJob | undefined;
  /** The one running, if any. */
  active(): CloneJob | undefined;
  listByWorkspace(workspaceId: string): CloneJob[];
  progress(id: string, progress: CloneProgress): void;
  registering(id: string): void;
  done(id: string, projectId: string, message?: string): void;
  fail(id: string, failure: CloneFailure, message: string): void;
  /** Aborts the process's signal and marks the job. Only while `cloning`. */
  cancel(id: string): void;
  /** What `cloneRepository` should be handed for this job. */
  signalOf(id: string): AbortSignal;
  /**
   * Snapshots, throttled — and the terminal one always, even when it lands
   * inside the throttle window. Ends when the job ends or `signal` aborts.
   */
  subscribe(id: string, signal: AbortSignal): AsyncIterable<CloneJob>;
  /** Attached listeners. Exists so a test can prove they are released. */
  readonly listenerCount: number;
}

export function createCloneJobStore(): CloneJobStore {
  const jobs = new Map<string, CloneJob>();
  const aborts = new Map<string, AbortController>();
  const listeners = new Map<string, Set<(job: CloneJob) => void>>();

  /** The one that has not finished. There is at most one, by construction. */
  function activeJob(): CloneJob | undefined {
    for (const job of jobs.values()) if (!isTerminal(job.state)) return job;
    return undefined;
  }

  function require_(id: string): CloneJob {
    const job = jobs.get(id);
    if (!job) throw new DomainError("NOT_FOUND", `clone ${id} não existe`);
    return job;
  }

  /**
   * Terminal jobs, dropped once nobody could reasonably still be looking.
   *
   * On access rather than on a timer: a timer is one more thing to unref, to
   * clear on shutdown and to leak if either is forgotten, and this map only
   * ever grows when somebody is using it.
   */
  function collect(): void {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (isTerminal(job.state) && now - job.updatedAt > KEEP_TERMINAL_MS) {
        jobs.delete(id);
        aborts.delete(id);
      }
    }
  }

  function transition(id: string, next: CloneState, patch: Partial<CloneJob> = {}): void {
    const job = require_(id);
    if (!ALLOWED[job.state].includes(next)) {
      // Loudly, rather than by writing a state nobody can read back: a job that
      // goes from `done` to `cloning` is a defect in the caller, and silence
      // here would surface as a progress bar that restarts itself.
      throw new DomainError(
        "BLOCKED",
        `um clone em "${job.state}" não pode passar para "${next}"`,
      );
    }
    Object.assign(job, patch, { state: next, updatedAt: Date.now() });
    publish(job, isTerminal(next));
  }

  const ALLOWED: Record<CloneState, CloneState[]> = {
    cloning: ["registering", "failed", "cancelled"],
    registering: ["done", "failed"],
    done: [],
    failed: [],
    cancelled: [],
  };

  /** Last delivery and pending trailing delivery, per job. */
  const pacing = new Map<string, { last: number; timer?: NodeJS.Timeout }>();

  function publish(job: CloneJob, immediate: boolean): void {
    const state = pacing.get(job.id) ?? { last: 0 };
    pacing.set(job.id, state);

    if (immediate) {
      // The terminal snapshot is never paced. Dropping it into a throttle
      // window is how a bar gets stuck at 97% forever.
      if (state.timer) clearTimeout(state.timer);
      state.timer = undefined;
      state.last = Date.now();
      emit(job);
      return;
    }

    const since = Date.now() - state.last;
    if (since >= THROTTLE_MS) {
      state.last = Date.now();
      emit(job);
      return;
    }
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      state.last = Date.now();
      emit(jobs.get(job.id) ?? job);
    }, THROTTLE_MS - since);
    state.timer.unref?.();
  }

  function emit(job: CloneJob): void {
    for (const listener of listeners.get(job.id) ?? []) listener({ ...job });
  }

  return {
    start({ workspaceId, url, targetPath, name }) {
      collect();
      const running = activeJob();
      if (running) {
        throw new DomainError(
          "BLOCKED",
          `já há um clone em andamento: ${running.name}. Espere ele terminar ou cancele-o`,
        );
      }

      const now = Date.now();
      const job: CloneJob = {
        id: newId(),
        workspaceId,
        url,
        targetPath,
        name,
        state: "cloning",
        phase: null,
        percent: null,
        message: null,
        failure: null,
        projectId: null,
        startedAt: now,
        updatedAt: now,
      };
      jobs.set(job.id, job);
      aborts.set(job.id, new AbortController());
      return { ...job };
    },

    get(id) {
      collect();
      const job = jobs.get(id);
      return job ? { ...job } : undefined;
    },

    active() {
      const job = activeJob();
      return job ? { ...job } : undefined;
    },

    listByWorkspace(workspaceId) {
      collect();
      return [...jobs.values()]
        .filter((job) => job.workspaceId === workspaceId)
        .map((job) => ({ ...job }));
    },

    progress(id, { phase, percent, message }) {
      const job = require_(id);
      if (job.state !== "cloning") return;
      Object.assign(job, { phase, percent, message, updatedAt: Date.now() });
      publish(job, false);
    },

    registering(id) {
      transition(id, "registering", { phase: null, percent: null });
    },

    done(id, projectId, message) {
      transition(id, "done", { projectId, percent: 100, ...(message ? { message } : {}) });
    },

    fail(id, failure, message) {
      transition(id, "failed", { failure, message });
    },

    cancel(id) {
      const job = require_(id);
      if (job.state !== "cloning") {
        // F6.6: past `registering` the repository is already on disk and what
        // is left is a row in SQLite. Saying no is better than pretending.
        throw new DomainError(
          "BLOCKED",
          `o clone de ${job.name} já terminou de baixar; não dá mais para cancelar`,
        );
      }
      aborts.get(id)?.abort();
      transition(id, "cancelled", { message: "cancelado" });
    },

    signalOf(id) {
      require_(id);
      return aborts.get(id)!.signal;
    },

    subscribe(id, signal) {
      const job = require_(id);
      return snapshots(id, job, listeners, signal);
    },

    get listenerCount() {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}

/**
 * The subscription itself.
 *
 * A queue rather than a single slot: a terminal snapshot published in the same
 * tick as a progress one must not overwrite it, because the terminal one is the
 * only snapshot whose loss is permanent.
 */
async function* snapshots(
  id: string,
  current: CloneJob,
  listeners: Map<string, Set<(job: CloneJob) => void>>,
  signal: AbortSignal,
): AsyncIterable<CloneJob> {
  const queue: CloneJob[] = [{ ...current }];
  let wake: (() => void) | undefined;

  const listener = (job: CloneJob): void => {
    queue.push(job);
    wake?.();
  };

  const set = listeners.get(id) ?? new Set();
  set.add(listener);
  listeners.set(id, set);

  const onAbort = (): void => wake?.();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal.aborted) {
      while (queue.length > 0) {
        const job = queue.shift()!;
        yield job;
        if (isTerminal(job.state)) return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  } finally {
    // Without this every reconnect would leave one behind on a daemon that is
    // meant to run for weeks — the same leak `events.ts` guards against.
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
    signal.removeEventListener("abort", onAbort);
  }
}
