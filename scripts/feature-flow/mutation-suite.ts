/**
 * The discipline of `selftest.py`, as a vitest suite each validator's test file
 * calls.
 *
 * Derived from tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club),
 * CC-BY-4.0. A validator that exits 0 on everything is decoration, and nothing
 * about running it would reveal that — so the same discipline the flow demands
 * of a feature applies to the gates: mutate the passing artifact, run the gate,
 * and require the mutant to be killed.
 *
 * Stricter than the original in two ways, both cheap here and impossible over a
 * subprocess's stdout:
 * - a mutant names the **exact** set of rules it fires, with their levels. The
 *   original matched a message fragment, which stays green when a mutation also
 *   trips an unrelated rule nobody meant to test;
 * - the suite fails when a rule of the validator has **no** mutant. The original
 *   list was hand-kept, and 30 of the 70 rules counted here had no case.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Finding, Level } from "./markdown.js";

export const ARTIFACTS = ["prd.md", "checks.md", "verification.md"] as const;
export type Artifact = (typeof ARTIFACTS)[number];
/** A feature directory in memory; `null` is a file that does not exist. */
export type Files = Record<Artifact, string | null>;
/** Returns the edited text, or `null` to delete the file. */
export type Edit = (text: string) => string | null;

export interface Mutant {
  name: string;
  edits: Partial<Record<Artifact, Edit>>;
  /** Every rule the mutant fires, and nothing else. `{}` is a control that must stay silent. */
  fires: Record<string, Level>;
}

export function fixtures(): Files {
  const read = (name: Artifact) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
  return { "prd.md": read("prd.md"), "checks.md": read("checks.md"), "verification.md": read("verification.md") };
}

/**
 * Replaces **every** match, which is what Python's `str.replace` and `re.sub`
 * do. `selftest.py`'s edits are written against that: `"`POST /webhooks/provider`"`
 * occurs in Flow before it occurs in Surface, and a first-match replace mutates
 * the wrong one and proves nothing.
 */
export function replace(from: string | RegExp, to: string): Edit {
  if (typeof from === "string") return (text) => text.replaceAll(from, to);
  const global = from.flags.includes("g") ? from : new RegExp(from.source, `${from.flags}g`);
  return (text) => text.replace(global, to);
}

function apply(mutant: Mutant): Files {
  const files = fixtures();
  for (const artifact of ARTIFACTS) {
    const edit = mutant.edits[artifact];
    const original = files[artifact];
    if (edit === undefined || original === null) continue;
    const edited = edit(original);
    // A mutation that did not apply proves nothing — the original calls it VACUOUS.
    expect(edited, `${mutant.name}: the edit to ${artifact} did not apply`).not.toBe(original);
    files[artifact] = edited;
  }
  return files;
}

function fired(findings: readonly Finding[]): Record<string, Level> {
  return Object.fromEntries(findings.map((f) => [f.rule, f.level]));
}

export function mutationSuite(options: {
  name: string;
  rules: readonly string[];
  validate: (files: Files) => Finding[];
  mutants: readonly Mutant[];
  controls: readonly Mutant[];
}): void {
  const { name, rules, validate, mutants, controls } = options;

  describe(`${name} — baseline`, () => {
    it("the complete fixture set passes with no finding at all", () => {
      expect(validate(fixtures())).toEqual([]);
    });
  });

  describe(`${name} — fault injection: every mutant is killed`, () => {
    it.each(mutants.map((m) => [m.name, m] as const))("%s", (_, mutant) => {
      const findings = validate(apply(mutant));
      expect(fired(findings)).toEqual(mutant.fires);
      for (const finding of findings) expect(finding.line).toBeGreaterThanOrEqual(1);
    });

    it("every rule the validator declares has a mutant that fires it", () => {
      const proved = new Set(mutants.flatMap((m) => Object.keys(m.fires)));
      expect(rules.filter((rule) => !proved.has(rule))).toEqual([]);
      // And no mutant claims a rule the validator does not declare.
      expect([...proved].filter((rule) => !rules.includes(rule))).toEqual([]);
    });
  });

  // A gate that fires at every profile is the same bug as one that never fires:
  // it fails loudly instead of silently, and it would make `light` unusable.
  describe(`${name} — negative controls: a scoped rule does not fire outside its scope`, () => {
    it.each(controls.map((m) => [m.name, m] as const))("%s", (_, control) => {
      expect(fired(validate(apply(control)))).toEqual(control.fires);
    });
  });
}
