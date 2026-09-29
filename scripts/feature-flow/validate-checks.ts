/**
 * The gate for a feature's `checks.md`, run before any code.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0: `scripts/validate_checks.py`, rule for rule. The only semantic
 * change is the path: the sibling plan is the feature's `prd.md` in
 * `docs/features/NNN-name/`, not `.specs/features/<feature>/plan.md`.
 *
 * This is the omission catcher. The failure it exists to prevent is not a vague
 * claim — a person notices those — but a set member that was named in prose and
 * never assigned a proof: *"dispatches over paused, updated, deleted and
 * trial_will_end"* reads perfectly with one of the four missing, so nobody sees
 * it, and that branch ships unproven. The Coverage join makes that failure
 * structural — every member is its own token beside the check that proves it —
 * and this gate makes the join checkable: a row declaring a set of 5 with 4
 * members assigned fails before a line of code is written.
 *
 * The requirements and the shape of the solution are not this file's business:
 * both were reviewed in the plan and are gated by `validate-plan.ts`. What this
 * owns is the derivation from them, which is where omissions surface.
 *
 * The profile comes from this file's own `Profile:` line, which the original
 * already requires (the skill's project-wide declaration lives in `AGENTS.md`,
 * and this repository has none). A missing line is still an error; for the
 * profile-scoped rule, anything but `standard`/`ui` reads as `light`.
 *
 * Not ported, on purpose: the file resolution (`resolve_checks`, `_autodetect`,
 * `--root`), because the caller names the feature directory.
 */
import {
  type Finding,
  type Level,
  PLACEHOLDER,
  declaredProfile,
  excerpt,
  firstTable,
  headingLine,
  re,
  sectionBounds,
  splitLines,
  stripChars,
  stripFences,
} from "./markdown.js";

export const CHECKS_RULES = [
  "no-profile",
  "unknown-profile",
  "missing-section",
  "no-test-policy",
  "duplicate-id",
  "no-checks",
  "no-proof",
  "proof-no-selector",
  "claim-vague",
  "coverage-no-rows",
  "coverage-empty-member",
  "coverage-no-size",
  "coverage-short",
  "coverage-unproven",
  "swept-missing",
  "swept-blank",
  "swept-no-reason",
  "swept-existing-no-guard",
  "swept-unresolved",
  "swept-unknown-landing",
  "dangling-reference",
  "surface-route-unmentioned",
  "blocking-question",
] as const;

export type ChecksRule = (typeof CHECKS_RULES)[number];

export const PROFILES = ["light", "standard", "ui"] as const;
const REQUIRED_SECTIONS = ["Checks", "Coverage", "Swept"];

const CHECK_LINE = /^\**\s*(C\d+)\s*\**\s*[-–—:]\s*(.+)$/u;
const PROOF_LINE = /^\**\s*Proof\s*\**\s*:\s*(.+)$/iu;
const CHECK_ID = re(String.raw`\bC\d+\b`, "g");
const SET_SIZE = /\((\d+)\s*(?:[a-z\- ]+)?\)/u;
const ROUTE = /(\/[A-Za-z0-9_\-/:{}.]*)/u;
const TABLE_DRIVEN = /table[- ]driven/i;
const TOP_HEADING = /^#{1,2}\s+\S/;

const SELECTOR_TOKENS = [
  "-n ",
  "-k ",
  "-t ",
  "-e ",
  "--name",
  "--only",
  "--example",
  "--filter",
  "--testnamepattern",
  "--test-name",
  "--run",
  "-dtest=",
  "-run ",
  "::",
  "#",
  "--grep",
  "-g ",
  "--spec",
];

const VAGUE = re(
  String.raw`\b(gracefully|properly|correctly|quickly|fast|slow|efficiently|reasonably|appropriately|as expected|user-friendly|robust|works)\b`,
  "i",
);

/** Canonical name → spellings accepted in the Swept list. */
const DIMENSIONS: Readonly<Record<string, readonly string[]>> = {
  validation: ["validation", "validation and bounds", "input validation"],
  "failure modes": ["failure modes", "failure", "failure and partial failure", "partial failure"],
  idempotency: ["idempotency", "idempotency and retry", "idempotency, retry, duplicates", "retry"],
  authorization: ["authorization", "authorisation", "auth", "authorization and rate limits"],
  concurrency: ["concurrency", "concurrency and ordering", "ordering"],
  "data lifecycle": ["data lifecycle", "lifecycle", "data retention"],
  "dependency failure": [
    "dependency failure",
    "external-dependency failure",
    "external dependency failure",
    "external dependency",
  ],
  "state transitions": ["state transitions", "transitions", "state-transition integrity"],
  observability: ["observability", "logging and metrics", "telemetry"],
};

interface Check {
  claim: string;
  proofs: { text: string; line: number }[];
  line: number;
}

function idNumber(id: string): number {
  return Number(id.slice(1));
}

function checkIds(text: string): string[] {
  return [...text.matchAll(CHECK_ID)].map((m) => m[0].toUpperCase());
}

/** The checks, in order, and every repeated id with the line that repeated it. */
export function parseChecks(lines: readonly string[]): { checks: Map<string, Check>; duplicates: [string, number][] } {
  const checks = new Map<string, Check>();
  const duplicates: [string, number][] = [];
  let current: Check | null = null;
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const stripped = line.trim();
    const match = CHECK_LINE.exec(stripped);
    if (match && !stripped.startsWith("|")) {
      const id = (match[1] ?? "").toUpperCase();
      if (checks.has(id)) {
        duplicates.push([id, lineNo]);
        current = null;
        return;
      }
      current = { claim: (match[2] ?? "").trim(), proofs: [], line: lineNo };
      checks.set(id, current);
      return;
    }
    if (TOP_HEADING.test(line)) current = null;
    const proof = PROOF_LINE.exec(stripped);
    if (current !== null && proof) current.proofs.push({ text: (proof[1] ?? "").trim(), line: lineNo });
  });
  return { checks, duplicates };
}

/** Members are separated by `·` or `;`; only a member that carries a check id counts. */
export function countMembers(cell: string): number {
  return cell.split(/[·;]/u).filter((part) => checkIds(part).length > 0).length;
}

/** Route paths named in the sibling plan's Surface table. */
function planRoutes(prd: string | null): string[] {
  if (prd === null) return [];
  const lines = stripFences(splitLines(prd));
  const routes: string[] = [];
  for (const { cells } of firstTable(lines, sectionBounds(lines, "Surface"))) {
    const [route = ""] = cells;
    if (PLACEHOLDER.test(route)) continue;
    const match = ROUTE.exec(route);
    if (match?.[1]) routes.push(match[1]);
  }
  return routes;
}

/**
 * Validates a `checks.md`. `prd` is the sibling plan, when there is one: its
 * Surface routes are what this file has to point back at.
 */
export function validateChecks(checksText: string, prd: string | null = null): Finding[] {
  const lines = stripFences(splitLines(checksText));
  const findings: Finding[] = [];
  const push = (level: Level, rule: ChecksRule, line: number, message: string) =>
    findings.push({ level, rule, line, message });

  const declared = declaredProfile(lines);
  if (declared === null) {
    push("error", "no-profile", 1, "sem linha `Profile:` — o relatório de verificação tem que nomear o perfil em vigor");
  } else if (!(PROFILES as readonly string[]).includes(declared.profile)) {
    push(
      "error",
      "unknown-profile",
      declared.line,
      `perfil desconhecido '${declared.profile}' (esperado um de: ${PROFILES.join(", ")})`,
    );
  }
  const profile = declared?.profile ?? "light";

  for (const name of REQUIRED_SECTIONS) {
    if (sectionBounds(lines, name) === null) push("error", "missing-section", 1, `falta a seção obrigatória: ## ${name}`);
  }
  if ((profile === "standard" || profile === "ui") && sectionBounds(lines, "Test policy") === null) {
    push(
      "warn",
      "no-test-policy",
      declared?.line ?? 1,
      `o perfil é ${profile} mas não há seção ## Test policy — confirme que o repositório já responde que nível prova cada camada, e com que profundidade`,
    );
  }

  const { checks, duplicates } = parseChecks(lines);
  for (const [id, line] of duplicates) {
    push("error", "duplicate-id", line, `id de check duplicado ${id} — ids são referenciados adiante e têm que ser únicos`);
  }
  if (checks.size === 0) {
    const section = sectionBounds(lines, "Checks");
    push(
      "error",
      "no-checks",
      section ? headingLine(section) : 1,
      "nenhum check lido — esperado linhas no formato `**C1** - <afirmação>` seguidas de `Proof: <comando>`",
    );
    return findings;
  }

  const ordered = [...checks.entries()].sort(([a], [b]) => idNumber(a) - idNumber(b));
  for (const [id, check] of ordered) {
    if (check.proofs.length === 0) push("error", "no-proof", check.line, `${id} não tem linha \`Proof:\` — sem prova, não é check`);
    for (const proof of check.proofs) {
      const low = proof.text.toLowerCase();
      if (!SELECTOR_TOKENS.some((token) => low.includes(token))) {
        push(
          "warn",
          "proof-no-selector",
          proof.line,
          `${id}: a prova não nomeia seletor de teste, então pode ser uma suíte inteira — suíte verde não decide afirmação nenhuma: ${excerpt(proof.text, 60)}`,
        );
      }
    }
    const vague = VAGUE.exec(check.claim);
    if (vague) push("warn", "claim-vague", check.line, `${id}: a afirmação usa '${vague[0]}' em vez de um valor concreto`);
  }

  /** Referenced id → first line that referenced it. */
  const referenced = new Map<string, number>();
  const reference = (text: string, line: number) => {
    for (const id of checkIds(text)) if (!referenced.has(id)) referenced.set(id, line);
  };

  // Coverage join.
  const coverage = sectionBounds(lines, "Coverage");
  const rows = firstTable(lines, coverage);
  if (coverage && rows.length === 0) {
    push(
      "warn",
      "coverage-no-rows",
      headingLine(coverage),
      "a seção Coverage não tem linhas — diga 'no set rows' explicitamente se nada enumera",
    );
  }
  for (const { cells, line } of rows) {
    if (cells.length < 2) continue;
    const [set = "", members = "", unproven = ""] = cells;
    if (!set || PLACEHOLDER.test(set)) continue;
    const label = excerpt(set, 48);
    if (!members || PLACEHOLDER.test(members) || members === "-") {
      push(
        "error",
        "coverage-empty-member",
        line,
        `Coverage '${label}': célula de membros vazia — cada membro precisa do próprio token e de um check`,
      );
      continue;
    }
    reference(members, line);
    const size = SET_SIZE.exec(set);
    if (!size) {
      push(
        "warn",
        "coverage-no-size",
        line,
        `Coverage '${label}': não declara o tamanho do conjunto — escreva '(N)' para o join ser verificável`,
      );
    } else {
      const declaredSize = Number(size[1]);
      // A table-driven proof that names the size carries the enumeration in the test.
      const tableDriven = TABLE_DRIVEN.test(members) && members.includes(String(declaredSize));
      const assigned = countMembers(members);
      if (!tableDriven && assigned < declaredSize) {
        push(
          "error",
          "coverage-short",
          line,
          `Coverage '${label}': declara ${declaredSize} membros mas só ${assigned} têm check — o membro sem check é o que vai para produção sem prova`,
        );
      }
    }
    if (unproven && unproven !== "-" && unproven !== "—" && !PLACEHOLDER.test(unproven)) {
      push(
        "error",
        "coverage-unproven",
        line,
        `Coverage '${label}': Unproven é '${excerpt(unproven, 40)}' — membro sem prova é lacuna`,
      );
    }
  }

  // Swept.
  const swept = sectionBounds(lines, "Swept");
  if (swept) {
    const found = new Map<string, { landing: string; line: number }>();
    for (let i = swept.start; i < swept.end; i += 1) {
      const match = /^\s*[-*]\s*\**([^:*]+?)\**\s*:\s*(.*)$/u.exec(lines[i] ?? "");
      if (!match) continue;
      const key = (match[1] ?? "").trim().toLowerCase();
      const canonical = Object.entries(DIMENSIONS).find(([, aliases]) => aliases.includes(key))?.[0];
      if (canonical !== undefined) found.set(canonical, { landing: (match[2] ?? "").trim(), line: i + 1 });
    }
    for (const canonical of Object.keys(DIMENSIONS)) {
      const entry = found.get(canonical);
      if (entry === undefined) {
        push("error", "swept-missing", headingLine(swept), `Swept: a dimensão '${canonical}' não tem linha — as nove, toda vez`);
        continue;
      }
      const { landing, line } = entry;
      if (!landing || PLACEHOLDER.test(landing)) {
        push(
          "error",
          "swept-blank",
          line,
          `Swept '${canonical}': o landing está em branco — um critério, \`existing\`, ou \`n/a - <motivo>\``,
        );
        continue;
      }
      const low = landing.toLowerCase();
      if (checkIds(landing).length > 0) {
        reference(landing, line);
      } else if (low.startsWith("n/a") || low.startsWith("not in scope")) {
        const rest = stripChars(low.replace(re(String.raw`^(n/a|not in scope)\b`), ""), " -–—:");
        if (rest.length < 3) push("error", "swept-no-reason", line, `Swept '${canonical}': \`n/a\` sem motivo — diga por que não se aplica`);
      } else if (low.startsWith("existing")) {
        const rest = stripChars(landing.slice("existing".length), " -–—:");
        if (rest.length < 3) {
          push("error", "swept-existing-no-guard", line, `Swept '${canonical}': \`existing\` sem nomear a guarda ou a restrição`);
        }
      } else if (low.startsWith("unresolved") || low.startsWith("open")) {
        push("warn", "swept-unresolved", line, `Swept '${canonical}': ainda Unresolved — confirme que não trava`);
      } else {
        push(
          "warn",
          "swept-unknown-landing",
          line,
          `Swept '${canonical}': o landing '${excerpt(landing, 40)}' não é um check, \`existing\`, \`n/a\` nem \`Unresolved\``,
        );
      }
    }
  }

  // Dangling references.
  const dangling = [...referenced.entries()].filter(([id]) => !checks.has(id)).sort(([a], [b]) => idNumber(a) - idNumber(b));
  for (const [id, line] of dangling) {
    push("error", "dangling-reference", line, `${id} é referenciado em Coverage ou Swept mas não está definido em ## Checks`);
  }

  // The derivation. checks.md is derived from the plan, so a route reviewed there
  // with nothing pointing back at it here is either dead or unproven — and the
  // plan naming it is what makes it look covered.
  const text = lines.join("\n");
  for (const route of planRoutes(prd)) {
    if (!text.includes(route)) {
      push(
        "warn",
        "surface-route-unmentioned",
        1,
        `a Surface do prd.md nomeia \`${route}\` mas nada aqui a menciona — os códigos dela devem uma linha de Coverage, ou a rota está morta`,
      );
    }
  }

  // Blocking questions.
  lines.forEach((line, index) => {
    if (line.trim().startsWith("|") && /\|\s*blocks\s*\|/i.test(line)) {
      push(
        "warn",
        "blocking-question",
        index + 1,
        "uma pergunta em aberto está marcada `blocks` — ela não se resolve durante a construção",
      );
    }
  });

  return findings;
}
