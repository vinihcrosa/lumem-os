/**
 * The mutation floor, per file (T14 of docs/features/024-dev-harness/tasks.md).
 *
 * Stryker's own `thresholds.break` is one number for the whole run, and with
 * ~5 900 mutants a weakened assertion moves it by tenths — it never crosses
 * `baseline - 2`, so the global floor could not do what the task asked of it:
 * turn red when one test loses its teeth. A floor per file can, because a file
 * has tens of mutants and one lost assertion is a visible fraction of them.
 *
 * `MUTATION_FLOORS` is the score each file had when it was measured, minus two
 * points, and it **only goes up**: a file that scores higher raises its floor
 * in the same commit, and the test next to this file refuses a lowered one.
 *
 * Reads Stryker's JSON report (mutation-testing-report-schema).
 */
import { readFileSync } from "node:fs";

export interface MutantResult {
  status: string;
}

export interface MutationReport {
  files: Record<string, { mutants: MutantResult[] }>;
}

/** Killed and timed-out mutants count as detected, as Stryker's own score does. */
const DETECTED = new Set(["Killed", "Timeout"]);
/** Mutants no test can reach, or that did not compile, do not count either way. */
const IGNORED = new Set(["Ignored", "CompileError", "RuntimeError"]);

export function scoreOf(mutants: readonly MutantResult[]): number | null {
  const counted = mutants.filter((m) => !IGNORED.has(m.status));
  if (counted.length === 0) return null;
  const detected = counted.filter((m) => DETECTED.has(m.status)).length;
  return Math.round((detected / counted.length) * 10_000) / 100;
}

export function scoresOf(report: MutationReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [file, { mutants }] of Object.entries(report.files)) {
    const score = scoreOf(mutants);
    if (score !== null) out[file] = score;
  }
  return out;
}

export function belowFloor(scores: Record<string, number>, floors: Record<string, number>): string[] {
  return Object.entries(floors)
    .filter(([file, floor]) => (scores[file] ?? 0) < floor)
    .map(
      ([file, floor]) =>
        `${file}: ${scores[file] ?? "sem score"} < piso ${floor} — um teste deste arquivo perdeu dente, ` +
        "ou o código ganhou um ramo que nenhum teste mata",
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { MUTATION_FLOORS } = await import("./mutation-floors.js");
  const report = JSON.parse(readFileSync(process.argv[2] ?? "reports/mutation/mutation.json", "utf8")) as MutationReport;
  const problems = belowFloor(scoresOf(report), MUTATION_FLOORS);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`mutação: ${Object.keys(MUTATION_FLOORS).length} arquivo(s) no piso ou acima\n`);
}
