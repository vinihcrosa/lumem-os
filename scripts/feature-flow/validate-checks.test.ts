/**
 * `validate-checks.ts` against the ported fixture and one mutant per rule. The
 * cases under `From selftest.py` are its edits, verbatim; the rest cover the
 * rules the original never proved red.
 */
import { describe, expect, it } from "vitest";
import { type Mutant, mutationSuite, replace } from "./mutation-suite.js";
import { CHECKS_RULES, countMembers, validateChecks } from "./validate-checks.js";

const checks = (edit: Mutant["edits"]["checks.md"]) => ({ "checks.md": edit });

const mutants: Mutant[] = [
  // From selftest.py.
  {
    name: "drop one member from a size-5 set",
    edits: checks(replace(" · `trial_will_end` C10 | - |", " | - |")),
    fires: { "coverage-short": "error" },
  },
  {
    name: "remove a check's Proof line",
    edits: checks(replace(/\nProof: `bin\/rails test test\/billing\/access_test\.rb[^\n]*\n/, "\n")),
    fires: { "no-proof": "error" },
  },
  {
    name: "delete the concurrency sweep line",
    edits: checks(replace("- concurrency: C7\n", "")),
    fires: { "swept-missing": "error" },
  },
  {
    name: "bare n/a with no reason",
    edits: checks(replace(/- data lifecycle: n\/a[^\n]*/, "- data lifecycle: n/a")),
    fires: { "swept-no-reason": "error" },
  },
  {
    // The Test policy warning goes quiet with it: no profile reads as `light`.
    name: "remove the Profile line",
    edits: checks(replace("Profile: standard\n", "")),
    fires: { "no-profile": "error" },
  },
  {
    name: "reference an undefined check",
    edits: checks(replace("into it C1 ·", "into it C99 ·")),
    fires: { "dangling-reference": "error" },
  },
  {
    // Two rules, both right: C5 is repeated, and C6 — which Coverage and Swept
    // still cite — no longer exists.
    name: "duplicate check id",
    edits: checks(replace("**C6** - A `Suspended` subscription returns", "**C5** - A `Suspended` subscription returns")),
    fires: { "duplicate-id": "error", "dangling-reference": "error" },
  },
  {
    name: "non-empty Unproven cell",
    edits: checks(replace("| C2, table-driven over all 9 | - |", "| C2, table-driven over all 9 | `paused` |")),
    fires: { "coverage-unproven": "error" },
  },
  {
    name: "proof with no test selector",
    edits: checks(
      replace('Proof: `bin/rails test test/billing/access_test.rb -n "/suspended_denies_paid_groups/"`', "Proof: `bin/rails test`"),
    ),
    fires: { "proof-no-selector": "warn" },
  },
  {
    name: "vague claim",
    edits: checks(replace("denies access to paid access groups", "handles access gracefully")),
    fires: { "claim-vague": "warn" },
  },
  {
    name: "a route reviewed in the prd that no check mentions",
    edits: { "prd.md": replace("`POST /webhooks/provider`", "`POST /webhooks/provider/v2`") },
    fires: { "surface-route-unmentioned": "warn" },
  },

  // Rules selftest.py never proved red.
  {
    name: "an unknown profile",
    edits: checks(replace("Profile: standard", "Profile: heavy")),
    fires: { "unknown-profile": "error" },
  },
  {
    name: "a required section missing",
    edits: checks(replace("## Swept", "## Sweep")),
    fires: { "missing-section": "error" },
  },
  {
    name: "profile standard with no Test policy section",
    edits: checks(replace("## Test policy", "## Levels")),
    fires: { "no-test-policy": "warn" },
  },
  {
    name: "no check parses at all",
    edits: checks(replace(/^\*\*C(\d+)\*\* - /gm, "Check $1: ")),
    fires: { "no-checks": "error" },
  },
  {
    // Two rules, both right: the join is gone, and it was the only place that
    // mentioned the prd's route.
    name: "a Coverage section with no rows",
    edits: checks(replace(/## Coverage\n.*?\n## Test policy/s, "## Coverage\n\nno set rows\n\n## Test policy")),
    fires: { "coverage-no-rows": "warn", "surface-route-unmentioned": "warn" },
  },
  {
    name: "a Coverage row with an empty member cell",
    edits: checks(replace("| C2, table-driven over all 9 | - |", "| - | - |")),
    fires: { "coverage-empty-member": "error" },
  },
  {
    name: "a Coverage row that declares no set size",
    edits: checks(replace("| provider status -> local (9) |", "| provider status -> local |")),
    fires: { "coverage-no-size": "warn" },
  },
  {
    name: "a swept landing left blank",
    edits: checks(replace("- concurrency: C7\n", "- concurrency:\n")),
    fires: { "swept-blank": "error" },
  },
  {
    name: "`existing` with no named guard",
    edits: checks(replace(/- authorization: existing[^\n]*/, "- authorization: existing")),
    fires: { "swept-existing-no-guard": "error" },
  },
  {
    name: "a swept dimension still Unresolved",
    edits: checks(replace(/- data lifecycle: n\/a[^\n]*/, "- data lifecycle: Unresolved - the retention policy is pending")),
    fires: { "swept-unresolved": "warn" },
  },
  {
    name: "a swept landing that is none of the four answers",
    edits: checks(replace(/- data lifecycle: n\/a[^\n]*/, "- data lifecycle: pruned by a job")),
    fires: { "swept-unknown-landing": "warn" },
  },
  {
    name: "an unresolved question marked `blocks`",
    edits: checks(
      replace(
        "## Handoff",
        "## Unresolved\n\n| Question | Blocks? |\n| --- | --- |\n| how long is a delivery kept? | blocks |\n\n## Handoff",
      ),
    ),
    fires: { "blocking-question": "warn" },
  },
];

const controls: Mutant[] = [
  {
    name: "under profile light, a missing Test policy section is not demanded",
    edits: checks((text) => text.replace("Profile: standard", "Profile: light").replace("## Test policy", "## Levels")),
    fires: {},
  },
  {
    name: "a table-driven proof that names the set size covers the whole set",
    edits: checks(replace("| webhook event types (5) | `charge_failed` C1 · `charge_succeeded` C6 · `updated` C10 · `deleted` C10 · `trial_will_end` C10 |", "| webhook event types (5) | C10, table-driven over all 5 |")),
    fires: {},
  },
  {
    name: "with no prd.md, the Surface derivation has nothing to compare",
    edits: { "prd.md": () => null },
    fires: {},
  },
];

mutationSuite({
  name: "validateChecks",
  rules: CHECKS_RULES,
  validate: (files) => validateChecks(files["checks.md"] ?? "", files["prd.md"]),
  mutants,
  controls,
});

describe("countMembers", () => {
  it("counts only members that carry a check id", () => {
    expect(countMembers("200 C8 · 409 C7 · 422")).toBe(2);
    expect(countMembers("a C1; b C2; c C3")).toBe(3);
  });
});

describe("line numbers", () => {
  it("a check without proof points at the check's own line", () => {
    const text = "Profile: light\n\n## Checks\n\n**C1** - x returns `1`\n\n## Coverage\n\nno set rows\n\n## Swept\n";
    const finding = validateChecks(text).find((f) => f.rule === "no-proof");
    expect(finding?.line).toBe(5);
  });
});
