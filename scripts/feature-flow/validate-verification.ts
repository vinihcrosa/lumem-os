/**
 * The completion gate for a feature: its `verification.md`.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0: `scripts/validate_verification.py`, rule for rule. The only
 * semantic change is the path: the report and the `checks.md` it answers to live
 * in `docs/features/NNN-name/`, not `.specs/features/<feature>/`.
 *
 * The skill's strongest invariant is *"a feature is done when an independent
 * verifier's report accounts for every check."* That is prose the model has to
 * remember, and prose is what a long trajectory quietly drops — so it becomes a
 * pass/fail run. It does NOT merely check that the report exists: one holding
 * the template placeholder, citing no evidence, or recording a surviving mutant
 * next to a PASS would sail through an existence check while proving nothing.
 * The gate reads the report's own tables and refuses a verdict its rows
 * contradict.
 *
 * The profile the report is held to is the one `checks.md` was approved under,
 * from that file's `Profile:` line; with none declared, anything but
 * `standard`/`ui` reads as `light`, where the profile-scoped rules stay quiet.
 *
 * Differences from the original, each on purpose:
 * - fenced blocks are **blanked**, not dropped, so reported lines stay true. The
 *   one behavioural consequence is that a table split by a fence reads as two
 *   tables, where the original glued the halves together;
 * - not ported: the directory sweep (`_resolve`, `_appears_complete`,
 *   `--allow-empty`, `--root`). The caller names the feature, so "gated
 *   nothing" cannot happen here; a missing directory is a usage error of the
 *   entry point, which exits 2 like the original.
 */
import {
  type Finding,
  type Level,
  type Table,
  findTables,
  hasHeading,
  re,
  splitLines,
  stripFences,
} from "./markdown.js";

export const VERIFICATION_RULES = [
  "no-report",
  "no-verdict",
  "verdict-unfilled",
  "verdict-fail",
  "no-profile",
  "profile-mismatch",
  "no-round",
  "self-verified",
  "no-evidence",
  "no-coverage-section",
  "no-binding-sources",
  "no-test-policy-verdict",
  "mutant-survived",
  "coverage-unproven",
  "binding-uncovered",
  "check-not-pass",
  "test-policy-unmet",
  "no-fault-rows",
] as const;

export type VerificationRule = (typeof VERIFICATION_RULES)[number];

const EVIDENCE = /[\p{L}\p{N}_./-]+\.[A-Za-z0-9]+:\d+/u;
const PROFILE_ANYWHERE = re(String.raw`^\**Profile\**\s*:\s*` + "`?" + String.raw`(\w+)` + "`?", "im");
const EMPTY_CELL = new Set(["", "-", "—", "–", "none", "n/a", "na", "nothing"]);
/** Anchored at the start of the cell, like Python's `re.match`. */
const SURVIVED = re(String.raw`^\b(no|survived|alive|not killed)\b`, "i");
const UNMET = re(String.raw`\b(no|not met|unmet|fail|failed|gap)\b`, "i");

type Push = (level: Level, rule: VerificationRule, line: number, message: string) => void;

function profileOf(text: string): string | null {
  return PROFILE_ANYWHERE.exec(text)?.[1]?.toLowerCase() ?? null;
}

function lineOf(lines: readonly string[], pattern: RegExp): number {
  const at = lines.findIndex((line) => pattern.test(line));
  return at === -1 ? 1 : at + 1;
}

/** Index of the first header cell containing any of `names`. */
function column(header: readonly string[], ...names: string[]): number | null {
  const at = header.findIndex((cell) => names.some((name) => cell.includes(name)));
  return at === -1 ? null : at;
}

/** What checks.md was approved under: its profile, and whether it has a Test policy section. */
function checksContext(checks: string | null): { approved: string | null; policyRows: boolean } {
  if (checks === null) return { approved: null, policyRows: false };
  const lines = stripFences(splitLines(checks));
  return { approved: profileOf(lines.join("\n")), policyRows: hasHeading(lines, "Test policy") };
}

const VERDICT_LINE = /^\**verdict\**\s*:/i;
const VERIFICATION_HEADING = re(String.raw`^#{1,4}\s*verification\b`, "i");

/** `pass`, `fail`, `unfilled` (both words — the template's `[PASS | FAIL]`), or null. */
function verdictOf(lines: readonly string[]): { verdict: "pass" | "fail" | "unfilled" | null; line: number } {
  const candidates = lines
    .map((line, index) => ({ text: line.trim(), line: index + 1 }))
    .filter(({ text }) => VERDICT_LINE.test(text) || VERIFICATION_HEADING.test(text));
  const haystack = candidates.length > 0 ? candidates.map((c) => c.text).join(" ") : lines.join("\n");
  const line = candidates[0]?.line ?? 1;
  const hasPass = re(String.raw`\bPASS\b`).test(haystack);
  const hasFail = re(String.raw`\bFAIL\b`).test(haystack);
  if (hasPass && hasFail) return { verdict: "unfilled", line };
  if (hasPass) return { verdict: "pass", line };
  if (hasFail) return { verdict: "fail", line };
  return { verdict: null, line };
}

/** The rules that read the report's own rows against a PASS. Returns whether any fault rows exist. */
function checkTables(tables: readonly Table[], push: Push): boolean {
  let sawFaults = false;
  for (const { header, rows } of tables) {
    const killed = column(header, "killed");
    if (killed !== null) {
      sawFaults = true;
      for (const { cells, line } of rows) {
        const cell = cells[killed];
        if (cell === undefined) continue;
        const low = cell.toLowerCase();
        if (EMPTY_CELL.has(low) && low !== "no") continue;
        if (SURVIVED.test(cell) || low.includes("survived")) {
          push(
            "error",
            "mutant-survived",
            line,
            `PASS, mas um mutante sobreviveu (${(cells[0] ?? "").slice(0, 50)}) — a asserção passaria sob uma implementação errada plausível`,
          );
        }
      }
    }

    const unproven = column(header, "unproven");
    if (unproven !== null) {
      for (const { cells, line } of rows) {
        const cell = cells[unproven];
        if (cell !== undefined && !EMPTY_CELL.has(cell.toLowerCase())) {
          push(
            "error",
            "coverage-unproven",
            line,
            `PASS, mas a Coverage deixa '${cell.slice(0, 50)}' sem prova (${(cells[0] ?? "").slice(0, 40)})`,
          );
        }
      }
    }

    const uncovered = column(header, "uncovered");
    if (uncovered !== null) {
      for (const { cells, line } of rows) {
        const cell = cells[uncovered];
        if (cell !== undefined && !EMPTY_CELL.has(cell.toLowerCase())) {
          push(
            "error",
            "binding-uncovered",
            line,
            `PASS, mas uma fonte binding deixa '${cell.slice(0, 50)}' descoberto (${(cells[0] ?? "").slice(0, 40)})`,
          );
        }
      }
    }

    const result = column(header, "result");
    if (result !== null && column(header, "check", "claim") !== null) {
      for (const { cells, line } of rows) {
        const cell = cells[result];
        if (cell && !cell.toLowerCase().includes("pass")) {
          push("error", "check-not-pass", line, `PASS, mas o check ${(cells[0] ?? "").slice(0, 20)} relata '${cell.slice(0, 30)}'`);
        }
      }
    }

    const met = column(header, "expectation met", "met");
    if (met !== null) {
      for (const { cells, line } of rows) {
        const cell = cells[met];
        if (cell && UNMET.test(cell)) {
          push(
            "error",
            "test-policy-unmet",
            line,
            `PASS, mas uma linha de Test policy não foi atendida (${(cells[0] ?? "").slice(0, 40)}: '${cell.slice(0, 40)}') — as linhas precificaram trabalho que os checks não nomeiam`,
          );
        }
      }
    }
  }
  return sawFaults;
}

/**
 * Validates a verification report. `report` is null when the feature has no
 * `verification.md`; `checks` is its `checks.md`, when there is one.
 */
export function validateVerification(report: string | null, checks: string | null = null): Finding[] {
  const findings: Finding[] = [];
  const push: Push = (level, rule, line, message) => findings.push({ level, rule, line, message });

  if (report === null) {
    push(
      "error",
      "no-report",
      1,
      "sem verification.md — a feature não está pronta até um verificador novo (autor ≠ verificador) escrevê-lo sobre <base da feature>..HEAD, com todos os checks",
    );
    return findings;
  }

  const lines = stripFences(splitLines(report));
  const body = lines.join("\n");

  const { verdict, line: verdictLine } = verdictOf(lines);
  if (verdict === null) {
    push("error", "no-verdict", verdictLine, "sem veredito PASS/FAIL (relatório só em prosa não conta)");
  } else if (verdict === "unfilled") {
    push("error", "verdict-unfilled", verdictLine, "o veredito ainda é o placeholder do template '[PASS | FAIL]'");
  } else if (verdict === "fail") {
    push("error", "verdict-fail", verdictLine, "o veredito é FAIL — devolva as lacunas ranqueadas como correções, e verifique de novo");
  }

  // The profile decides which steps run, so a report that quietly declares a
  // cheaper one than the feature was approved under makes a step vanish.
  const reportProfile = profileOf(body);
  const { approved, policyRows } = checksContext(checks);
  const profileLine = lineOf(lines, PROFILE_ANYWHERE);
  if (reportProfile === null) {
    push("warn", "no-profile", 1, "sem linha `Profile:` — um passo que não rodou fica indistinguível de um esquecido");
  } else if (approved && reportProfile !== approved) {
    push(
      "error",
      "profile-mismatch",
      profileLine,
      `o relatório diz perfil '${reportProfile}' mas o checks.md foi aprovado sob '${approved}' — o perfil decide que passos rodam, e a divergência derruba um em silêncio`,
    );
  }
  const effective = approved ?? reportProfile ?? "light";
  const scoped = effective === "standard" || effective === "ui";

  if (!/^\**round\**\s*:/im.test(body)) {
    push("warn", "no-round", 1, "sem linha `Round:` — uma re-verificação parcial tem que dizer o que foi carregado adiante");
  }
  const selfVerified = /self[- ]verified/i;
  if (selfVerified.test(body)) {
    push(
      "warn",
      "self-verified",
      lineOf(lines, selfVerified),
      "o relatório é self-verified (autor = verificador) — portão degradado, porque a autoverificação reproduz o ponto cego do autor",
    );
  }

  if (verdict !== "pass") return findings;

  if (!EVIDENCE.test(body)) {
    push("error", "no-evidence", verdictLine, "PASS sem nenhuma evidência arquivo:linha — evidência ou zero");
  }

  // A profile-scoped step that produced no section did not run. Requiring the
  // section is what makes "skipped" distinguishable from "forgotten".
  if (scoped && !hasHeading(lines, "Coverage")) {
    push(
      "error",
      "no-coverage-section",
      1,
      `o perfil é ${effective} mas não há seção \`## Coverage\` — o join tem que ser recalculado a partir da autoridade de cada conjunto, e não relido da tabela do autor`,
    );
  }
  if (effective === "ui" && !hasHeading(lines, "Binding sources", "Binding source")) {
    push(
      "error",
      "no-binding-sources",
      1,
      "o perfil é ui mas não há seção `## Binding sources` — o passo 1 é o único que pega um check contradizendo o desenho, e nenhum passo depois pega",
    );
  }
  if (scoped && policyRows && !hasHeading(lines, "Test policy")) {
    push(
      "error",
      "no-test-policy-verdict",
      1,
      "o checks.md tem linhas de Test policy mas o relatório não dá veredito sobre elas — elas são a régua sob a qual o autor construiu, e uma não atendida é achado",
    );
  }

  const sawFaults = checkTables(findTables(lines), push);

  // Fault injection is profile-scoped (standard, ui). Under `light` a report with
  // no fault rows is correct, and the profile line is what says so.
  if (scoped && !sawFaults) {
    push(
      "error",
      "no-fault-rows",
      1,
      `o perfil é ${effective} mas não há linhas de falha injetada — suíte verde prova que os testes rodam; só mutante morto prova que eles podem falhar`,
    );
  }

  return findings;
}
