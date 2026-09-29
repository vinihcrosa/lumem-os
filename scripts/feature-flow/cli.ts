/**
 * The command line of the feature-flow validators. Pure and importable — it
 * reads files and returns what to print and the exit code; `run.ts` is the entry
 * point, and `cli.test.ts` runs this against the fixtures.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0, which ships one `main()` per validator with the same contract kept
 * here: exit 0 pass, 1 errors (or warnings under `--strict`), 2 usage error.
 *
 *     npx tsx scripts/feature-flow/run.ts <plan|checks|verification> <docs/features/NNN-name> [--strict]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Finding } from "./markdown.js";
import { validateChecks } from "./validate-checks.js";
import { validatePlan } from "./validate-plan.js";
import { validateVerification } from "./validate-verification.js";

export const KINDS = ["plan", "checks", "verification"] as const;
export type Kind = (typeof KINDS)[number];

/** The artifact each kind validates, inside the feature directory. */
export const ARTIFACT: Record<Kind, string> = {
  plan: "prd.md",
  checks: "checks.md",
  verification: "verification.md",
};

export interface CliResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

const USAGE = "uso: run.ts <plan|checks|verification> <docs/features/NNN-nome> [--strict]";

function usage(message: string): CliResult {
  return { exitCode: 2, stdout: "", stderr: `feature-flow: ${message}\n${USAGE}` };
}

function readIfPresent(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function formatFinding(path: string, finding: Finding): string {
  return `${path}:${finding.line}  ${finding.level === "error" ? "ERROR" : "WARN"} ${finding.message}`;
}

export function runFeatureFlow(argv: readonly string[], cwd: string): CliResult {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.find((flag) => flag !== "--strict");
  if (unknown !== undefined) return usage(`opção desconhecida: ${unknown}`);
  const [kind, target, extra] = positional;
  if (kind === undefined || !(KINDS as readonly string[]).includes(kind)) {
    return usage(`o primeiro argumento é um de ${KINDS.join(", ")}`);
  }
  if (target === undefined || extra !== undefined) return usage("passe exatamente um diretório de feature");
  const dir = resolve(cwd, target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return usage(`feature não encontrada: ${target}`);

  const prd = readIfPresent(join(dir, "prd.md"));
  const checks = readIfPresent(join(dir, "checks.md"));
  const artifactPath = join(dir, ARTIFACT[kind as Kind]);

  let findings: Finding[];
  if (kind === "plan") {
    if (prd === null) return usage(`não há prd.md em ${target}`);
    findings = validatePlan(prd, checks);
  } else if (kind === "checks") {
    if (checks === null) return usage(`não há checks.md em ${target}`);
    findings = validateChecks(checks, prd);
  } else {
    // A missing report is a finding and not a usage error: "not done" is the answer.
    findings = validateVerification(readIfPresent(artifactPath), checks);
  }

  const shown = relative(cwd, artifactPath) || artifactPath;
  const ordered = [...findings].sort((a, b) => a.line - b.line);
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.length - errors;
  const strict = flags.includes("--strict");
  const lines = ordered.map((finding) => formatFinding(shown, finding));
  lines.push(`validate-${kind}: ${errors} erro(s), ${warnings} aviso(s) em ${shown}`);
  const failed = errors > 0 || (strict && warnings > 0);
  return { exitCode: failed ? 1 : 0, stdout: lines.join("\n"), stderr: "" };
}
