/**
 * The N3 class of a pull request, from the paths it touches (T22 of
 * docs/features/024-dev-harness/tasks.md).
 *
 * The three classes are the owner's answer to A3 — changes that could merge
 * without reading the diff, because a sensor covers them. A PR that **mixes**
 * one of them with anything else belongs to none, and saying so mechanically is
 * the whole point: *"this PR is only docs"* was, until now, what the title
 * claimed. The label is information; nothing merges because of it
 * ([Q7](../docs/features/024-dev-harness/open-questions.md)).
 *
 * Runs under `node --experimental-strip-types` in CI: it imports nothing.
 */
export type PrClass = "css-token" | "dependência" | "docs" | "sem classe";

const CSS_TOKEN = /^packages\/web\/src\/(.+\.css|styles\/tokens\.(css|ts))$/;
const DEPENDENCY = /(^|\/)(package\.json|pnpm-lock\.yaml)$/;
const DOCS = /^docs\/|\.md$/;

function classOf(path: string): PrClass {
  if (CSS_TOKEN.test(path)) return "css-token";
  if (DEPENDENCY.test(path)) return "dependência";
  if (DOCS.test(path)) return "docs";
  return "sem classe";
}

export function classify(paths: readonly string[]): PrClass {
  const files = paths.map((p) => p.trim()).filter((p) => p !== "");
  if (files.length === 0) return "sem classe";
  const classes = new Set(files.map(classOf));
  return classes.size === 1 ? ([...classes][0] as PrClass) : "sem classe";
}

export function labelOf(prClass: PrClass): string {
  return prClass === "sem classe" ? "sem classe" : `N3: ${prClass}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  process.stdout.write(`${labelOf(classify(raw.split("\n")))}\n`);
}
