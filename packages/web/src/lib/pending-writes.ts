/**
 * The writes autosave has in the air, kept where the component that started
 * them cannot keep them.
 *
 * `useFileBuffer` flushes from `attach(null)`, which runs while the editor is
 * being unmounted — the promise it produces has nowhere to live and no one left
 * to await it. The one caller that has to await it is `useFileTree`, on the
 * other side of the shell: the column and the split share a tab and nothing
 * else, so there is no component above both to hang this on that would not be
 * the app's root.
 *
 * Module state and not a context, deliberately. A provider would put the whole
 * chain — root, `ScopePanel`, `FileViewer` — in the way of a fact that has one
 * writer and one reader, and the browser has exactly one of these anyway.
 */
const inFlight = new Set<Promise<unknown>>();

/** Hands over a write, and forgets it as soon as the daemon has answered. */
export function trackWrite(write: Promise<unknown>): void {
  inFlight.add(write);
  // Two handlers rather than `finally`: the promise handed over may reject, and
  // `finally` returns a derived one that would reject with nobody reading it —
  // an unhandled rejection in the console of an app that did nothing wrong.
  const forget = (): boolean => inFlight.delete(write);
  void write.then(forget, forget);
}

/**
 * Resolves once every write started so far has landed — or failed.
 *
 * `allSettled` because the caller is not deciding anything about the result: it
 * is waiting for the daemon to be *done with that path*, and a refused write
 * has finished with it just as much as a successful one. Rejecting here would
 * turn "the save failed" into "the rename never happened".
 *
 * One snapshot is enough. What is tracked is the flush's own promise, and that
 * one already resolves only when the buffer's queue has drained — a write that
 * starts after this call belongs to typing that happened after the gesture.
 */
export async function whenWritesSettle(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}
