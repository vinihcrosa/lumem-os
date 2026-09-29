/**
 * The gate for a feature's plan — here, its `prd.md` — run before any check is
 * written.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0: `scripts/validate_plan.py`, rule for rule. The only semantic change
 * is the path. The original reads `.specs/features/<feature>/plan.md`; here a
 * feature lives in `docs/features/NNN-name/` and the plan **is** the `prd.md`
 * (ADR 2026-09-28-1952). The section headings stay in English, as a schema —
 * `## Problem`, `## Flow`, `## Landing` — while the prose under them may be
 * Portuguese.
 *
 * The plan carries both halves a person confirms — what must be true (problem,
 * criteria, assumptions) and what is being built (flow, relations, surface,
 * landing, impact) — so the closure gate becomes a pass/fail run instead of
 * something the model is trusted to remember. The failures it exists to catch
 * are the ones that make a plan lie rather than inform:
 *
 * - a criterion with no SHALL, which reads like a requirement and cannot be tested;
 * - an assumption with no chosen default — an open question in a decision's clothes;
 * - a section quietly absent, indistinguishable from "nothing to say here" unless
 *   the file is required to say it out loud;
 * - a `Landing` row with no literal shape (the next person re-decides it) or no
 *   rejected alternative (a description of what happened, not a decision);
 * - columns and types inside `Relations`, the detail that goes stale and then
 *   misleads with the authority of a written diagram;
 * - a `Surface` row with no statuses — they become a Coverage set in `checks.md`.
 *
 * Not ported, on purpose: the file resolution (`resolve_plan`, `_autodetect`,
 * `--root`), because the caller names the feature directory; and `HEADER_CELL_RE`,
 * which the original defines and never uses.
 */
import {
  type Bounds,
  type Finding,
  type Level,
  PLACEHOLDER,
  PROFILE_LINE,
  excerpt,
  firstTable,
  headingLine,
  re,
  sectionBody,
  sectionBounds,
  splitLines,
  stripChars,
  stripFences,
} from "./markdown.js";

export const PLAN_RULES = [
  "missing-section",
  "no-sources",
  "binding-below-ui",
  "criterion-no-shall",
  "criterion-no-ears",
  "criterion-vague",
  "no-criteria",
  "assumption-no-default",
  "assumption-no-rationale",
  "assumptions-template",
  "no-open-questions-line",
  "open-questions-unresolved",
  "observable-empty",
  "observable-no-rows",
  "observable-landing-blank",
  "observable-no-reason",
  "shape-empty",
  "shape-placeholder",
  "relations-attributes",
  "surface-no-status",
  "surface-check-id",
  "surface-no-rows",
  "landing-empty",
  "landing-no-rows",
  "landing-no-shape",
  "landing-no-alternative",
  "impact-no-rows",
  "flow-hop-unresolved",
  "flow-node-unresolved",
] as const;

export type PlanRule = (typeof PLAN_RULES)[number];

/** Each entry is a list of accepted heading names; the first is canonical. */
const REQUIRED_SECTIONS: readonly (readonly string[])[] = [
  ["Problem", "Problem Statement"],
  ["Flow"],
  ["Impact"],
  ["Relations"],
  ["Surface"],
  ["Landing"],
  ["Criteria", "User Stories"],
  ["Out of scope", "Out of Scope"],
  ["Assumptions", "Assumptions & Open Questions"],
  ["Observable"],
];
const ADVISORY_SECTIONS = ["Sources"];

/** The shape half: each has a one-line answer when it does not apply. */
const SHAPE_HINTS: readonly (readonly [string, string])[] = [
  ["Flow", "diga os passos em ordem, ou `single module - <nome>`"],
  ["Relations", "diga as entidades e a cardinalidade, ou `None - no stored-data shape change`"],
  ["Surface", "diga a assinatura da rota, ou `None - nothing consumed outside`"],
  ["Impact", "diga o que muda por baixo, ou `nothing` — linha ausente não é resposta"],
];

const CHECK_ID = re(String.raw`\bC\d+\b`);
const STATUS_CODE = re(String.raw`\b[1-5]\d\d\b`);
const NONE = re(String.raw`\b(none|nothing|n/?a|single module)\b`, "i");
const VAGUE = re(
  String.raw`\b(gracefully|properly|correctly|quickly|fast|slow|efficiently|reasonably|appropriately|as expected|user-friendly|robust)\b`,
  "i",
);

/**
 * `Entity {` in an erDiagram is the columns-and-types syntax, which is precisely
 * the reversible detail this artifact keeps out.
 */
const ER_ATTRIBUTE = re(String.raw`^\s*\w+\s*\{\s*$`);

/**
 * A hop is answered when it says the module exists, or names the door that
 * creates it. `out:` keeps no trailing `\b`: the colon is not a word character,
 * so the boundary would never fire and an `out:` hop naming a slug in backticks
 * would be misread as an unresolved module.
 */
const HOP_RESOLVED = re(String.raw`\b(exists|existing|new\b|door\s*\d+)|out\s*:`, "i");
const MODULE = /`([^`]+)`/g;
/** A mermaid flowchart node — `A[Label]`, `A["Label"]`, `A(Label)` — whose label must carry the marker. */
const NODE_LABEL = re(String.raw`[\[(]\s*"?([^"\]()|]+?)"?\s*[\])]`, "g");
const EDGE_LINE = /--+>|--+\s/;
const LIST_ITEM = /^\s*(\d+\.|[-*])\s/;

interface Collector {
  findings: Finding[];
  push(level: Level, rule: PlanRule, line: number, message: string): void;
}

function collector(): Collector {
  const findings: Finding[] = [];
  return { findings, push: (level, rule, line, message) => findings.push({ level, rule, line, message }) };
}

/** Whether a criterion carries a SHALL, and which EARS pattern it reads as. */
export function classifyEars(text: string): { ok: boolean; note: string } {
  const low = text.trim().toLowerCase();
  if (!re(String.raw`\bshall\b`).test(low)) return { ok: false, note: "no SHALL" };
  const keywords: string[] = [];
  if (re(String.raw`\bwhile\b`).test(low)) keywords.push("WHILE");
  if (re(String.raw`\bwhen\b`).test(low)) keywords.push("WHEN");
  if (re(String.raw`^\s*if\b`).test(low) || re(String.raw`\bif\b.*\bthen\b`).test(low)) keywords.push("IF/THEN");
  if (re(String.raw`\bwhere\b`).test(low)) keywords.push("WHERE");
  const names: Record<string, string> = {
    WHILE: "state-driven",
    WHEN: "event-driven",
    "IF/THEN": "unwanted-behavior",
    WHERE: "optional-feature",
  };
  if (keywords.length >= 2) return { ok: true, note: `complex (${keywords.join("+")})` };
  const [only] = keywords;
  if (only) return { ok: true, note: names[only] ?? only };
  if (re(String.raw`^\s*the\b`).test(low)) return { ok: true, note: "ubiquitous" };
  return { ok: true, note: "warn: SHALL present but no EARS lead keyword" };
}

/**
 * The profile `checks.md` declares, when it exists yet.
 *
 * No default here, unlike the other two gates: the plan is written *before*
 * `checks.md`, so defaulting to `light` would warn on every binding source of
 * every plan in its normal state. The original fires only on a declared profile.
 */
function siblingProfile(checks: string | null): string | null {
  if (checks === null) return null;
  for (const line of splitLines(checks)) {
    const match = PROFILE_LINE.exec(line.trim());
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}

function checkCriteria(lines: readonly string[], out: Collector, fallbackLine: number): void {
  let inCriteria = false;
  let count = 0;
  let blanks = 0;
  // A blank line does NOT close the block — well-formed markdown puts one between
  // the label and the list, and treating it as a terminator skips every criterion.
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const stripped = line.trim();
    if (/^\*{0,2}Acceptance Criteria\*{0,2}\s*:?\s*$/i.test(stripped)) {
      inCriteria = true;
      blanks = 0;
      return;
    }
    if (!inCriteria) return;
    if (stripped === "") {
      blanks += 1;
      if (blanks >= 2) inCriteria = false;
      return;
    }
    blanks = 0;
    const item = /^\s*\d+\.\s+(.*)$/.exec(line)?.[1]?.trim();
    if (item === undefined) {
      if (/^#{1,4}\s/.test(line) || stripped.startsWith("**") || /^\s*[-*+]\s/.test(line)) inCriteria = false;
      return;
    }
    if (PLACEHOLDER.test(item)) return;
    count += 1;
    const { ok, note } = classifyEars(item);
    if (!ok) {
      out.push("error", "criterion-no-shall", lineNo, `critério de aceite sem SHALL (não é testável): ${excerpt(item, 70)}`);
    } else if (note.startsWith("warn")) {
      out.push(
        "warn",
        "criterion-no-ears",
        lineNo,
        `critério tem SHALL mas nenhuma palavra EARS (WHEN/WHILE/WHERE/IF, ou o ubíquo 'The … shall'): ${excerpt(item, 60)}`,
      );
    }
    const vague = VAGUE.exec(item);
    if (vague) {
      out.push("warn", "criterion-vague", lineNo, `critério usa '${vague[0]}' em vez de um valor concreto: ${excerpt(item, 60)}`);
    }
  });
  if (count === 0) {
    out.push("warn", "no-criteria", fallbackLine, "nenhum critério de aceite numerado — o plano está preenchido?");
  }
}

function warnUnresolved(out: Collector, index: number, names: string[], landingText: string, kind: "hop" | "node"): void {
  const [first] = names;
  if (first === undefined) return;
  if (names.some((name) => landingText.includes(name.toLowerCase()))) return;
  const what = kind === "hop" ? "um passo do Flow" : "um nó do diagrama do Flow";
  out.push(
    "warn",
    kind === "hop" ? "flow-hop-unresolved" : "flow-node-unresolved",
    index + 1,
    `${what} nomeia \`${first}\` sem marcá-lo como existente (exists) nem como porta do Landing — se não é nenhum dos dois, é posicionamento e pertence ao diff`,
  );
}

function checkAssumptions(lines: readonly string[], bounds: Bounds, out: Collector): void {
  let templateSeen = false;
  for (const { cells, line } of firstTable(lines, bounds)) {
    if (cells.length < 3) continue;
    const [assumption = "", chosen = "", rationale = ""] = cells;
    if (PLACEHOLDER.test(assumption) && PLACEHOLDER.test(chosen)) {
      templateSeen = true;
      continue;
    }
    if (!assumption) continue;
    if (!chosen || PLACEHOLDER.test(chosen)) {
      out.push("error", "assumption-no-default", line, `a premissa '${excerpt(assumption, 40)}' está sem 'Chosen default'`);
    }
    if (!rationale || PLACEHOLDER.test(rationale)) {
      out.push("error", "assumption-no-rationale", line, `a premissa '${excerpt(assumption, 40)}' está sem 'Rationale'`);
    }
  }
  if (templateSeen) {
    out.push("warn", "assumptions-template", headingLine(bounds), "a tabela de Assumptions ainda tem linhas do template");
  }
  const questionLines: number[] = [];
  for (let i = bounds.start; i < bounds.end; i += 1) {
    if ((lines[i] ?? "").toLowerCase().includes("open questions")) questionLines.push(i);
  }
  const [firstQuestion] = questionLines;
  if (firstQuestion === undefined) {
    out.push("warn", "no-open-questions-line", headingLine(bounds), "a seção Assumptions não tem a linha 'Open questions:'");
    return;
  }
  const clean = questionLines
    .map((i) => lines[i] ?? "")
    .join(" ")
    .replace(/[*_]/g, "")
    .toLowerCase();
  if (!/open questions.*:\s*none/.test(clean)) {
    out.push(
      "warn",
      "open-questions-unresolved",
      firstQuestion + 1,
      "as perguntas em aberto não se leem como resolvidas ('Open questions: none')",
    );
  }
}

/**
 * Observable: every item of every surface present. A blank here is an item
 * nobody decided — not one that does not apply, which is what the mandatory
 * `n/a - <reason>` escape is for.
 */
function checkObservable(lines: readonly string[], bounds: Bounds, out: Collector): void {
  const body = sectionBody(lines, bounds);
  const rows = firstTable(lines, bounds);
  const declaresNone = body.some((line) => NONE.test(line));
  if (body.length === 0) {
    out.push(
      "error",
      "observable-empty",
      headingLine(bounds),
      "a seção Observable está vazia — percorra as decisões de cada superfície, ou diga `None - no user-facing surface`",
    );
  } else if (rows.length === 0 && !declaresNone) {
    out.push(
      "error",
      "observable-no-rows",
      headingLine(bounds),
      "Observable não tem linhas e não diz `None - no user-facing surface`",
    );
  }
  for (const { cells, line } of rows) {
    const [surface = "", decision = "", landing = ""] = cells;
    if (cells.length < 3 || !surface || PLACEHOLDER.test(surface)) continue;
    const label = `${excerpt(surface, 28)} / ${excerpt(decision, 28)}`;
    if (!landing || PLACEHOLDER.test(landing) || landing === "-" || landing === "—") {
      out.push(
        "error",
        "observable-landing-blank",
        line,
        `Observable '${label}': o landing está em branco — um critério, \`existing - <o quê>\`, ou \`n/a - <motivo>\``,
      );
      continue;
    }
    const low = landing.toLowerCase();
    const keyword = ["n/a", "na -", "existing"].find((kw) => low.startsWith(kw));
    if (keyword === undefined) continue;
    const rest = stripChars(landing.slice(keyword.length), " -–—:");
    if (rest.length < 3) {
      out.push(
        "error",
        "observable-no-reason",
        line,
        `Observable '${label}': \`${keyword}\` sem motivo — diga por que não se aplica, ou nomeie o que já se comporta assim`,
      );
    }
  }
}

function checkSurface(lines: readonly string[], bounds: Bounds, out: Collector): void {
  const body = sectionBody(lines, bounds);
  const declaresNone = body.some((line) => NONE.test(line));
  const rows = firstTable(lines, bounds);
  for (const { cells, line } of rows) {
    const [route = ""] = cells;
    if (!route || PLACEHOLDER.test(route)) continue;
    const status = cells[3] ?? "";
    if (!STATUS_CODE.test(status)) {
      out.push(
        "error",
        "surface-no-status",
        line,
        `Surface '${excerpt(route, 48)}': a coluna Status não nomeia código nenhum — esses códigos são o conjunto que deve uma linha de Coverage no checks.md`,
      );
    }
  }
  for (let i = bounds.start; i < bounds.end; i += 1) {
    if (CHECK_ID.test(lines[i] ?? "")) {
      out.push(
        "error",
        "surface-check-id",
        i + 1,
        "Surface nomeia um id de check, mas o checks.md ainda não existe — os códigos de cada rota viram um conjunto de Coverage lá",
      );
      break;
    }
  }
  if (rows.length === 0 && !declaresNone) {
    out.push(
      "error",
      "surface-no-rows",
      headingLine(bounds),
      "Surface não tem linhas de rota e não diz `None - nothing consumed outside`",
    );
  }
}

function checkLanding(lines: readonly string[], bounds: Bounds, out: Collector): void {
  const body = sectionBody(lines, bounds);
  const rows = firstTable(lines, bounds);
  const declaresNone = body.some((line) => NONE.test(line));
  if (body.length === 0) {
    out.push(
      "error",
      "landing-empty",
      headingLine(bounds),
      "a seção Landing está vazia — diga `None - <por que nada aqui é de mão única>`",
    );
  } else if (rows.length === 0 && !declaresNone) {
    out.push(
      "error",
      "landing-no-rows",
      headingLine(bounds),
      "Landing não tem portas e não diz `None - <por quê>` — a omissão tem que ser contestável",
    );
  }
  for (const { cells, line } of rows) {
    const [door = "", shape = "", alternative = ""] = cells;
    if (cells.length < 3 || !door || PLACEHOLDER.test(door)) continue;
    if (!shape || PLACEHOLDER.test(shape)) {
      out.push("error", "landing-no-shape", line, `Landing '${excerpt(door, 40)}': sem forma literal — é isto que a próxima pessoa copia`);
    }
    if (!alternative || PLACEHOLDER.test(alternative)) {
      out.push("error", "landing-no-alternative", line, `Landing '${excerpt(door, 40)}': nenhuma alternativa recusada nomeada`);
    }
  }
}

/**
 * Flow: a module that neither exists nor is created by a door is placement,
 * which this artifact deliberately leaves to the diff. Naming one here is how
 * the catalogue creeps back.
 */
function checkFlow(lines: readonly string[], flow: Bounds, landing: Bounds | null, out: Collector): void {
  const landingText = landing ? lines.slice(landing.start, landing.end).join("\n").toLowerCase() : "";
  for (let i = flow.start; i < flow.end; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (!LIST_ITEM.test(line) || HOP_RESOLVED.test(line)) continue;
    warnUnresolved(out, i, [...line.matchAll(MODULE)].map((m) => m[1] ?? ""), landingText, "hop");
  }
  // A branching path is drawn instead of listed, and the same rule holds inside
  // the diagram: a node that neither exists nor is created by a door is placement.
  for (let i = flow.start; i < flow.end; i += 1) {
    const line = lines[i] ?? "";
    if (!EDGE_LINE.test(line) || HOP_RESOLVED.test(line)) continue;
    const labels = [...line.matchAll(NODE_LABEL)].map((m) => (m[1] ?? "").trim()).filter((label) => label !== "");
    warnUnresolved(out, i, labels, landingText, "node");
  }
}

/**
 * Validates a plan. `checks` is the sibling `checks.md`, when it exists: only
 * its `Profile:` line is read, for the binding-source rule.
 */
export function validatePlan(prd: string, checks: string | null = null): Finding[] {
  const lines = stripFences(splitLines(prd), ["mermaid"]);
  const out = collector();

  // A missing section and a deliberate "None" are different answers, and only
  // the second is contestable — which is the whole reason every one is required.
  const present = new Map<string, Bounds | null>();
  for (const names of REQUIRED_SECTIONS) {
    const canonical = names[0] ?? "";
    const bounds = sectionBounds(lines, names);
    present.set(canonical, bounds);
    if (bounds === null) out.push("error", "missing-section", 1, `falta a seção obrigatória: ## ${canonical}`);
  }
  for (const name of ADVISORY_SECTIONS) {
    const label = new RegExp(String.raw`^\**` + name + String.raw`\**\s*:`, "i");
    if (sectionBounds(lines, name) === null && !lines.some((line) => label.test(line.trim()))) {
      out.push("warn", "no-sources", 1, `sem seção ${name} — 'nada' é resposta válida, seção ausente não é`);
    }
  }

  // A source marked binding is only ever opened by step 1 of Verify, which runs at `ui`.
  const binding = re(String.raw`\bbinding\b`, "i");
  const bindingAt = lines.findIndex((line) => binding.test(line));
  if (bindingAt !== -1) {
    const profile = siblingProfile(checks);
    if (profile && profile !== "ui") {
      out.push(
        "warn",
        "binding-below-ui",
        bindingAt + 1,
        `uma fonte está marcada como binding, mas o checks.md declara o perfil ${profile}, e ninguém a abre — suba o perfil para ui ou tire a marca`,
      );
    }
  }

  // --- what must be true ---
  const criteria = present.get("Criteria");
  checkCriteria(lines, out, criteria ? headingLine(criteria) : 1);
  const assumptions = present.get("Assumptions");
  if (assumptions) checkAssumptions(lines, assumptions, out);
  const observable = present.get("Observable");
  if (observable) checkObservable(lines, observable, out);

  // --- what is being built ---
  for (const [section, hint] of SHAPE_HINTS) {
    const bounds = present.get(section);
    if (!bounds) continue;
    const body = sectionBody(lines, bounds);
    if (body.length === 0) {
      out.push("error", "shape-empty", headingLine(bounds), `a seção ${section} está vazia — ${hint}`);
    } else if (body.every((line) => PLACEHOLDER.test(line))) {
      out.push("error", "shape-placeholder", headingLine(bounds), `a seção ${section} ainda é o placeholder do template`);
    }
  }

  // Relations: no columns, no types. In mermaid that detail is an attribute block.
  const relations = present.get("Relations");
  if (relations) {
    for (let i = relations.start; i < relations.end; i += 1) {
      const line = lines[i] ?? "";
      if (ER_ATTRIBUTE.test(line)) {
        out.push(
          "error",
          "relations-attributes",
          i + 1,
          `Relations carrega um bloco de atributos ('${line.trim()}') — coluna e tipo são reversíveis, vêm das convenções do repositório e envelhecem aqui`,
        );
        break;
      }
    }
  }

  const surface = present.get("Surface");
  if (surface) checkSurface(lines, surface, out);
  const landing = present.get("Landing") ?? null;
  if (landing) checkLanding(lines, landing, out);

  // Impact: a section with no rows is a sweep nobody did.
  const impact = present.get("Impact");
  if (impact) {
    const body = sectionBody(lines, impact);
    const hasRows = firstTable(lines, impact).length > 0;
    if (body.length > 0 && !hasRows && !body.some((line) => line.startsWith("-") || line.startsWith("*"))) {
      out.push(
        "warn",
        "impact-no-rows",
        headingLine(impact),
        "Impact não tem linhas nem itens — nomeie as frentes, mesmo que seja para dizer que nada muda",
      );
    }
  }

  const flow = present.get("Flow");
  if (flow) checkFlow(lines, flow, landing, out);

  return out.findings;
}
