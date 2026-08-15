import { publicProcedure, router } from "../trpc.js";

/**
 * The daemon pushing state changes, PRD F3.7.
 *
 * One stream for everything rather than one per list: the client keeps a
 * single connection open, and a per-entity subscription would mean opening and
 * closing one on every selection change.
 */
export const eventsRouter = router({
  onChange: publicProcedure.subscription(async function* ({ ctx, signal }) {
    // `signal` is aborted when the client disconnects, and that is what
    // releases the listener — without it every reconnect would leave one
    // behind on a daemon that is meant to run for weeks.
    for await (const event of ctx.events.subscribe(signal!)) {
      yield event;
    }
  }),
});
