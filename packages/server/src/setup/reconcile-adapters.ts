import { existsSync } from "node:fs";

import { ADAPTERS, type AdapterSpec } from "@lumem/shared";

import {
  adapterBinaryPath,
  adapterDir,
  installAdapter,
  installedAdapterVersion,
} from "./install-adapter.js";

/**
 * The boot-time check that the adapter on disk is the adapter the pin names.
 *
 * This exists because the pin did not decide anything. `pinnedVersion` went from
 * `0.40.0` to `0.75.1` in a commit, and on the machine that wrote that commit
 * nothing reread it: sessions kept launching the `0.40.0` from the PATH for nine
 * days — no Opus 5 in the model list, `Custom model` where Fable 5.1 belongs, and
 * one session with the window reported as 200K under a label that said 1M. The
 * decision is the [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md);
 * this is the third of its three parts, and the one whose absence let the other
 * two go unnoticed.
 *
 * **Only upgrades, never first installs.** A managed directory that is *absent* is
 * left alone: installing 243 MB here would hold the socket closed for the length
 * of an `npm install`, and the screen that exists to show that progress — the
 * onboarding install step of the
 * [008-onboarding](../../../../docs/features/008-onboarding/prd.md) — cannot load
 * until the socket opens. So the rule is narrow on purpose: if the daemon already
 * owns a copy, it owns the *right* copy before the first session. If it owns none,
 * `commandFor` refuses with a sentence and the flow that has a screen takes over.
 *
 * That narrowness is also what makes this race-free. The only case that installs
 * is the one where a directory already exists, and it is awaited, so no session can
 * be handed a tree that npm is halfway through rewriting.
 */
export type AdapterReconcileOutcome =
  /** On the pin already. Nothing ran. */
  | "already-pinned"
  /** Was on another version, and now is on the pin. */
  | "upgraded"
  /** No managed copy at all — deliberately not installed here. */
  | "absent"
  /** A layout this daemon did not write, with no version to read. Left alone. */
  | "unreadable"
  /** npm, or the network, or the registry. The daemon still boots. */
  | "failed";

export interface AdapterReconcile {
  id: string;
  outcome: AdapterReconcileOutcome;
  /** The version on disk after this ran, when it could be read. */
  version: string | null;
  /** npm's own words, for the one outcome that has any. */
  detail: string | null;
}

export interface ReconcileAdaptersOptions {
  /** `<stateDir>/adapters`. */
  dir: string;
  /** The whole catalogue, unless a test narrows it. */
  specs?: readonly AdapterSpec[];
  /** Seam for the install, so a test never reaches the registry. */
  install?: typeof installAdapter;
}

export async function reconcileAdapters({
  dir,
  specs = ADAPTERS,
  install = installAdapter,
}: ReconcileAdaptersOptions): Promise<AdapterReconcile[]> {
  const results: AdapterReconcile[] = [];

  for (const spec of specs) {
    results.push(await reconcileOne(dir, spec, install));
  }

  return results;
}

async function reconcileOne(
  dir: string,
  spec: AdapterSpec,
  install: typeof installAdapter,
): Promise<AdapterReconcile> {
  if (spec.package === null || !existsSync(adapterBinaryPath(dir, spec))) {
    return { id: spec.id, outcome: "absent", version: null, detail: null };
  }

  /*
   * The version comes from the `package.json` npm wrote, never from
   * `<binary> --version`: measured on 2026-09-08, `claude-agent-acp@0.40.0`
   * answers `--version` with an empty string and exit 0. The binary cannot be
   * asked what it is.
   */
  const found = installedAdapterVersion(adapterDir(dir, spec), spec);
  if (found === null) {
    // Same rule `installAdapter` already writes down: a layout with no manifest is
    // one this daemon did not write, and redownloading 243 MB on a guess is worse
    // than saying "I do not know what is there".
    return { id: spec.id, outcome: "unreadable", version: null, detail: null };
  }
  if (found === spec.pinnedVersion) {
    return { id: spec.id, outcome: "already-pinned", version: found, detail: null };
  }

  try {
    const installed = await install({ spec, dir });
    return { id: spec.id, outcome: "upgraded", version: installed.version, detail: null };
  } catch (error) {
    /*
     * A failed upgrade is not a failed boot. The daemon comes up on the old copy
     * and says so — which is strictly better than the nine days, where it came up
     * on the old copy and said nothing.
     */
    return {
      id: spec.id,
      outcome: "failed",
      version: found,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
