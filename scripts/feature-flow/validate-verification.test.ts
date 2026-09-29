/**
 * `validate-verification.ts` against the ported fixture and one mutant per rule.
 * The cases under `From selftest.py` are its edits, verbatim (plus a variant of
 * the `ui` one that isolates the rule); the rest cover the rules the original
 * never proved red.
 */
import { type Mutant, mutationSuite, replace } from "./mutation-suite.js";
import { VERIFICATION_RULES, validateVerification } from "./validate-verification.js";

const report = (edit: Mutant["edits"]["verification.md"]) => ({ "verification.md": edit });

const mutants: Mutant[] = [
  // From selftest.py.
  {
    name: "surviving mutant next to PASS",
    edits: report(replace("| `app/webhooks/ingest.rb:31` | yes |", "| `app/webhooks/ingest.rb:31` | no |")),
    fires: { "mutant-survived": "error" },
  },
  {
    name: "PASS with an unproven coverage member",
    edits: report(replace("`trial_will_end` C10 | - |", "`trial_will_end` C10 | `paused` |")),
    fires: { "coverage-unproven": "error" },
  },
  {
    name: "profile standard with no fault rows",
    edits: report(replace(/## Faults injected\n.*?\n## Gate/s, "## Gate")),
    fires: { "no-fault-rows": "error" },
  },
  {
    name: "PASS with no file:line evidence",
    edits: report(replace(/`[\w./-]+\.rb:\d+`/g, "`the test file`")),
    fires: { "no-evidence": "error" },
  },
  {
    name: "FAIL verdict",
    edits: report(replace("**Verdict**: PASS", "**Verdict**: FAIL")),
    fires: { "verdict-fail": "error" },
  },
  {
    name: "unfilled template verdict",
    edits: report(replace("**Verdict**: PASS", "**Verdict**: [PASS | FAIL]")),
    fires: { "verdict-unfilled": "error" },
  },
  {
    name: "a check row that is not PASS",
    edits: report(replace("`assert_equal 1, WebhookDelivery.count` | PASS |", "`assert_equal 1, WebhookDelivery.count` | not run |")),
    fires: { "check-not-pass": "error" },
  },
  {
    name: "self-verified report",
    edits: report(replace("independent sub-agent (author != verifier)", "self-verified (degraded - no sub-agent)")),
    fires: { "self-verified": "warn" },
  },
  {
    name: "report downgrades the approved profile",
    edits: report(replace("**Profile**: standard", "**Profile**: light")),
    fires: { "profile-mismatch": "error" },
  },
  {
    // Raising the profile in checks.md makes the report owe a section it never
    // had. Two rules, both right: the report also still says `standard`.
    name: "profile ui but no binding-sources section in the report",
    edits: { "checks.md": replace("Profile: standard", "Profile: ui") },
    fires: { "no-binding-sources": "error", "profile-mismatch": "error" },
  },
  {
    name: "profile ui in both, and still no binding-sources section",
    edits: {
      "checks.md": replace("Profile: standard", "Profile: ui"),
      "verification.md": replace("**Profile**: standard", "**Profile**: ui"),
    },
    fires: { "no-binding-sources": "error" },
  },
  {
    name: "profile standard with no recomputed Coverage",
    edits: report(replace(/## Coverage\n.*?\n## Test policy rows/s, "## Test policy rows")),
    fires: { "no-coverage-section": "error" },
  },
  {
    name: "an unmet Test policy row next to PASS",
    edits: report(replace("| own layer C2 | yes |", "| own layer C2 | no |")),
    fires: { "test-policy-unmet": "error" },
  },

  // Rules selftest.py never proved red.
  {
    name: "no verification.md at all",
    edits: report(() => null),
    fires: { "no-report": "error" },
  },
  {
    name: "a verdict line with neither PASS nor FAIL",
    edits: report(replace("**Verdict**: PASS", "**Verdict**: accepted")),
    fires: { "no-verdict": "error" },
  },
  {
    name: "no Profile line in the report",
    edits: report(replace("**Profile**: standard\n", "")),
    fires: { "no-profile": "warn" },
  },
  {
    name: "no Round line",
    edits: report(replace("**Round**: 1 - full\n", "")),
    fires: { "no-round": "warn" },
  },
  {
    name: "checks.md has Test policy rows and the report gives no verdict on them",
    edits: report(replace("## Test policy rows", "## Policy rows")),
    fires: { "no-test-policy-verdict": "error" },
  },
  {
    name: "a binding source leaving an element uncovered next to PASS",
    edits: report(
      replace(
        "## Checks",
        "## Binding sources\n\n| Source | Element | Uncovered |\n| --- | --- | --- |\n| design 03 | empty state | the retry banner |\n\n## Checks",
      ),
    ),
    fires: { "binding-uncovered": "error" },
  },
];

const controls: Mutant[] = [
  {
    // From selftest.py: under `light` the profile-scoped steps are not demanded.
    name: "a light report with no faults and no coverage is accepted",
    edits: {
      "checks.md": replace("Profile: standard", "Profile: light"),
      "verification.md": (text) =>
        text
          .replace("**Profile**: standard", "**Profile**: light")
          .replace(/## Coverage\n.*?\n## Faults injected\n.*?\n## Gate/s, "## Gate"),
    },
    fires: {},
  },
  {
    name: "a FAIL report is not also held to the PASS-only rules",
    edits: report((text) => text.replace("**Verdict**: PASS", "**Verdict**: FAIL").replace("| yes |", "| no |")),
    fires: { "verdict-fail": "error" },
  },
];

mutationSuite({
  name: "validateVerification",
  rules: VERIFICATION_RULES,
  validate: (files) => validateVerification(files["verification.md"], files["checks.md"]),
  mutants,
  controls,
});
