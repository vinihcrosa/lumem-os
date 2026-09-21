/**
 * Strips `/* ... *\/` comments before a CSS audit counts selectors.
 *
 * Shared by the three `*-css.test.ts` files that parse a stylesheet with a
 * regex instead of a real CSS parser (`modal-css`, `board-css`, `pr-bar-css`):
 * a commented-out rule still has the class name inside it, and without this
 * step the audit would count a selector that paints nothing.
 *
 * Unlike `textFile` in `useFileBuffer.test.tsx`/`FileViewer.test.tsx` — kept
 * as two separate fixtures on purpose, each with its own suite-specific
 * defaults — this one has no per-suite state to diverge: the three copies
 * were byte-identical, so keeping them apart bought nothing (`032` T20).
 */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
