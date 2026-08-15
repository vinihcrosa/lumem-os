import { EventEmitter, on } from "node:events";

/**
 * What the daemon tells the client changed, PRD F3.7.
 *
 * Coarse on purpose: the event says *which list* is stale, not what the new
 * contents are. Sending the data would mean two sources of truth for the same
 * rows, and the client already knows how to fetch — it just does not know when.
 */
export type LumemEvent =
  | { type: "workspace.changed" }
  | { type: "project.changed"; workspaceId: string }
  | { type: "worktree.changed"; projectId: string }
  | { type: "session.changed"; scopeType: "project" | "worktree"; scopeId: string };

const CHANNEL = "lumem";

export interface EventBus {
  emit(event: LumemEvent): void;
  /** Ends when `signal` aborts. That is the only way it ends. */
  subscribe(signal: AbortSignal): AsyncIterable<LumemEvent>;
  /** Listeners currently attached. Exists so a test can prove they are released. */
  readonly listenerCount: number;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  // One listener per connected client, and the daemon has no fixed idea how
  // many there will be. Node's default of 10 would start printing leak
  // warnings at the eleventh tab.
  emitter.setMaxListeners(0);

  return {
    emit(event) {
      emitter.emit(CHANNEL, event);
    },

    async *subscribe(signal) {
      // `on(..., { signal })` removes the listener when the signal aborts, which
      // is what keeps a closed connection from leaking one per reconnect.
      for await (const [event] of on(emitter, CHANNEL, { signal })) {
        yield event as LumemEvent;
      }
    },

    get listenerCount() {
      return emitter.listenerCount(CHANNEL);
    },
  };
}
