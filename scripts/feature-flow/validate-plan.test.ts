/**
 * `validate-plan.ts` against the ported fixture and one mutant per rule. The
 * cases under `From selftest.py` — and the first control — are its edits,
 * verbatim; the rest cover the rules the original never proved red.
 */
import { describe, expect, it } from "vitest";
import { type Mutant, fixtures, mutationSuite, replace } from "./mutation-suite.js";
import { PLAN_RULES, classifyEars, validatePlan } from "./validate-plan.js";

const prd = (edit: Mutant["edits"]["prd.md"]) => ({ "prd.md": edit });

const mutants: Mutant[] = [
  // From selftest.py.
  {
    name: "missing Observable section",
    edits: prd(replace("## Observable", "## User-facing notes")),
    fires: { "missing-section": "error" },
  },
  {
    name: "empty Observable section",
    edits: prd(replace(/## Observable\n.*?\n## Sources/s, "## Observable\n\n## Sources")),
    fires: { "observable-empty": "error" },
  },
  {
    name: "an Observable row with a blank landing",
    edits: prd(replace("| error shape and codes | AC 6 |", "| error shape and codes |  |")),
    fires: { "observable-landing-blank": "error" },
  },
  {
    name: "an Observable n/a with no reason",
    edits: prd(
      replace("| versioning | n/a - the provider pins the payload version in the envelope |", "| versioning | n/a |"),
    ),
    fires: { "observable-no-reason": "error" },
  },
  {
    name: "missing Flow section",
    edits: prd(replace("## Flow", "## How it hangs together")),
    fires: { "missing-section": "error" },
  },
  {
    name: "empty Flow section",
    edits: prd(replace(/## Flow\n.*?\n## Impact/s, "## Flow\n\n## Impact")),
    fires: { "shape-empty": "error" },
  },
  {
    name: "missing Relations section",
    edits: prd(replace("## Relations", "## Data model")),
    fires: { "missing-section": "error" },
  },
  {
    // Two rules, both right: the section is empty, and an empty Surface also has
    // no route rows and no `None`.
    name: "empty Surface section",
    edits: prd(replace(/## Surface\n.*?\n## Landing/s, "## Surface\n\n## Landing")),
    fires: { "shape-empty": "error", "surface-no-rows": "error" },
  },
  {
    name: "empty Landing section",
    edits: prd(replace(/## Landing\n.*?\n## Criteria/s, "## Landing\n\n## Criteria")),
    fires: { "landing-empty": "error" },
  },
  {
    name: "Landing door with no rejected alternative",
    edits: prd(replace("| a boolean `is_suspended` - cannot express the next state |", "|  |")),
    fires: { "landing-no-alternative": "error" },
  },
  {
    name: "Landing door with no literal shape",
    edits: prd(replace("| enum value, not null, existing rows backfilled to `active` |", "|  |")),
    fires: { "landing-no-shape": "error" },
  },
  {
    name: "columns and types creep into Relations",
    edits: prd(
      replace(
        '    Subscription ||--o{ WebhookDelivery : "reported by"',
        '    Subscription {\n        string status\n        datetime suspended_at\n    }\n    Subscription ||--o{ WebhookDelivery : "reported by"',
      ),
    ),
    fires: { "relations-attributes": "error" },
  },
  {
    name: "a Surface route with no statuses",
    edits: prd(replace("| `200`, `409`, `422` |", "|  |")),
    fires: { "surface-no-status": "error" },
  },
  {
    name: "check ids written into Surface before checks exist",
    edits: prd(replace("| `200`, `409`, `422` |", "| `200`, `409`, `422` | C7, C8, C9 |")),
    fires: { "surface-check-id": "error" },
  },
  {
    name: "empty Impact section",
    edits: prd(replace(/## Impact\n.*?\n## Relations/s, "## Impact\n\n## Relations")),
    fires: { "shape-empty": "error" },
  },
  {
    name: "a Flow hop naming a module that neither exists nor is a door",
    edits: prd(
      replace(
        "3. `Billing::StatusMap` (new, no door - placement per conventions) - provider status -> local status",
        "3. `Billing::StatusMapFactory` - provider status -> local status",
      ),
    ),
    fires: { "flow-hop-unresolved": "warn" },
  },
  {
    name: "a source marked binding under profile standard",
    edits: prd(
      replace("- provider webhook reference - the 9 statuses", "- design `03` - **binding for the interface** - the 9 statuses"),
    ),
    fires: { "binding-below-ui": "warn" },
  },
  {
    name: "acceptance criterion with no SHALL",
    edits: prd(replace("THEN the system SHALL set the subscription status", "THEN we set the subscription status")),
    fires: { "criterion-no-shall": "error" },
  },
  {
    name: "assumption with no rationale",
    edits: prd(replace("| the provider already retried 3 times before it reports a failure |", "|  |")),
    fires: { "assumption-no-rationale": "error" },
  },
  {
    name: "missing Assumptions section",
    edits: prd(replace("## Assumptions", "## Open Decisions")),
    fires: { "missing-section": "error" },
  },
  {
    name: "flowchart node neither existing nor a door",
    edits: prd(
      replace(
        "3. `Billing::StatusMap` (new, no door - placement per conventions) - provider status -> local status",
        '```mermaid\nflowchart TD\n    A["Billing::StatusMap"] --> B["Billing::Ledger"]\n```',
      ),
    ),
    fires: { "flow-node-unresolved": "warn" },
  },
  {
    name: "open question left unresolved",
    edits: prd(
      replace("**Open questions:** none - all resolved or logged above.", "**Open questions:** what happens on a chargeback?"),
    ),
    fires: { "open-questions-unresolved": "warn" },
  },

  // Rules selftest.py never proved red.
  {
    // The port reads `\b` the way Python does: `á` is a letter, so this heading
    // is not `## Problem`. With JavaScript's ASCII `\b` it would be.
    name: "a heading that only starts with the section name does not count (Unicode \\b)",
    edits: prd(replace("## Problem", "## Problemática")),
    fires: { "missing-section": "error" },
  },
  {
    name: "no Sources section",
    edits: prd(replace("## Sources", "## Fontes")),
    fires: { "no-sources": "warn" },
  },
  {
    name: "a criterion with SHALL and no EARS lead keyword",
    edits: prd(replace("4. The system SHALL never move", "4. Always, the system SHALL never move")),
    fires: { "criterion-no-ears": "warn" },
  },
  {
    name: "a criterion with a vague word instead of a value",
    edits: prd(replace("the system SHALL return `200` and change no records", "the system SHALL gracefully return `200`")),
    fires: { "criterion-vague": "warn" },
  },
  {
    name: "no numbered acceptance criteria at all",
    edits: prd(replace(/\*\*Acceptance Criteria\*\*/g, "**Criteria list**")),
    fires: { "no-criteria": "warn" },
  },
  {
    name: "assumption with no chosen default",
    edits: prd(replace("| none - suspend on the first failed charge |", "|  |")),
    fires: { "assumption-no-default": "error" },
  },
  {
    name: "Assumptions still carrying a template row",
    edits: prd(
      replace(
        "| absence of a charge is not a failure | y |\n",
        "| absence of a charge is not a failure | y |\n| [assumption] | [default] | [rationale] | [y/n] |\n",
      ),
    ),
    fires: { "assumptions-template": "warn" },
  },
  {
    name: "no 'Open questions:' line",
    edits: prd(replace("**Open questions:** none - all resolved or logged above.\n", "")),
    fires: { "no-open-questions-line": "warn" },
  },
  {
    name: "Observable with prose and neither rows nor `None`",
    edits: prd(replace(/## Observable\n.*?\n## Sources/s, "## Observable\n\nThe webhook answers the provider.\n\n## Sources")),
    fires: { "observable-no-rows": "error" },
  },
  {
    name: "a shape section still holding the template placeholder",
    edits: prd(replace(/## Flow\n.*?\n## Impact/s, "## Flow\n\n[the hops, in order]\n\n## Impact")),
    fires: { "shape-placeholder": "error" },
  },
  {
    name: "Surface with prose and neither route rows nor `None`",
    edits: prd(replace(/## Surface\n.*?\n## Landing/s, "## Surface\n\nThe provider posts the webhook.\n\n## Landing")),
    fires: { "surface-no-rows": "error" },
  },
  {
    name: "Landing with prose and neither door rows nor `None`",
    edits: prd(replace(/## Landing\n.*?\n## Criteria/s, "## Landing\n\nThe enum is hard to reverse.\n\n## Criteria")),
    fires: { "landing-no-rows": "error" },
  },
  {
    name: "Impact with prose and neither rows nor bullets",
    edits: prd(replace(/## Impact\n.*?\n## Relations/s, "## Impact\n\nThe status column changes meaning.\n\n## Relations")),
    fires: { "impact-no-rows": "warn" },
  },
  {
    name: "empty Relations section",
    edits: prd(replace(/## Relations\n.*?\n## Surface/s, "## Relations\n\n## Surface")),
    fires: { "shape-empty": "error" },
  },
];

const controls: Mutant[] = [
  {
    // From selftest.py: `out:` resolves a hop even when it names slugs in backticks.
    name: "an `out:` hop naming a slug in backticks is not an unresolved module",
    edits: prd(
      replace(
        "5. out: `200` `{}`, and `AccessPolicy` (exists) reads `status` on the next request - no call from here",
        "5. out: `200` `{}`; `completo` stays",
      ),
    ),
    fires: {},
  },
  {
    name: "a source marked binding under profile ui is opened, so it does not warn",
    edits: {
      "prd.md": replace("- provider webhook reference - the 9 statuses", "- design `03` - **binding for the interface** - the 9 statuses"),
      "checks.md": replace("Profile: standard", "Profile: ui"),
    },
    fires: {},
  },
  {
    // The plan is written before checks.md: with no declared profile there is
    // nothing to contradict yet, and a default here would warn on every plan.
    name: "a source marked binding before checks.md exists does not warn",
    edits: {
      "prd.md": replace("- provider webhook reference - the 9 statuses", "- design `03` - **binding for the interface** - the 9 statuses"),
      "checks.md": () => null,
    },
    fires: {},
  },
  {
    name: "a fenced example of a broken section is not read as content",
    edits: prd(replace("## Sources", "```markdown\n## Landing\n\n| door |  |  |\n```\n\n## Sources")),
    fires: {},
  },
];

mutationSuite({
  name: "validatePlan",
  rules: PLAN_RULES,
  validate: (files) => validatePlan(files["prd.md"] ?? "", files["checks.md"]),
  mutants,
  controls,
});

describe("classifyEars", () => {
  it.each([
    ["WHEN x THEN the system SHALL y", "event-driven"],
    ["WHILE x the system SHALL y", "state-driven"],
    ["IF x THEN the system SHALL y", "unwanted-behavior"],
    ["WHERE x the system SHALL y", "optional-feature"],
    ["WHILE x, WHEN y the system SHALL z", "complex (WHILE+WHEN)"],
    ["The system SHALL y", "ubiquitous"],
    ["The system does y", "no SHALL"],
  ])("%s → %s", (text, note) => {
    expect(classifyEars(text).note).toBe(note);
  });
});

describe("line numbers", () => {
  it("a row-level finding points at the row, so `path:line` lands on it", () => {
    const text = fixtures()["prd.md"] ?? "";
    const mutated = text.replace("| error shape and codes | AC 6 |", "| error shape and codes |  |");
    const [finding] = validatePlan(mutated);
    const row = mutated.split("\n").findIndex((line) => line.includes("| error shape and codes |  |")) + 1;
    expect(finding?.line).toBe(row);
  });
});
