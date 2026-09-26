import { EventEmitter, on } from "node:events";

import type { LumemEvent } from "@lumem/shared";

/** Reexportado por quem já importa o tipo daqui (`032` T7). A fonte é o `shared`. */
export type { LumemEvent };

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
