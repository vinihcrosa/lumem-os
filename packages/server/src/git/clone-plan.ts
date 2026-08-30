import { homedir } from "node:os";
import { dirname, join, normalize } from "node:path";

import { projectHome, repoDir } from "../workspace-layout.js";
import { parseGitUrl, repoNameOf, type GitUrlRule, type GitUrlScheme } from "./git-url.js";

/**
 * What the daemon understood from what was pasted, F6.1 and F6.3.
 *
 * One field accepts both a local path and a URL, because there is no ambiguity
 * to break: `pathSchema` already requires a project path to be absolute, so
 * anything that does not start with `/` or `~` is a URL. What the automatic
 * detection really risks is the person not noticing what is about to happen —
 * and that is what the `↳` line under the field answers, not a mode switch.
 *
 * The client decides this too, to draw the line. The server decides it again,
 * alone, because the client's decision is not trustworthy.
 */

export type ClonePlan =
  | {
      kind: "path";
      /** Absolute, with `~` already expanded — on the daemon's home, Q18. */
      path: string;
    }
  | {
      kind: "url";
      scheme: GitUrlScheme;
      /** Sanitized. What the `↳` shows and what gets stored. */
      url: string;
      /** No TLS. The line has to say so out loud, Q10. */
      insecure: boolean;
      name: string;
      /** `<workspacesDir>/<workspace>/<projeto>`. */
      home: string;
      /** `<home>/repo` — computed, shown, copyable, never typed, Q14. */
      targetPath: string;
    }
  | { kind: "refused"; rule: GitUrlRule; message: string };

export interface ClonePlanInput {
  /** Exactly what is in the field. */
  source: string;
  workspacesDir: string;
  workspaceName: string;
  /** What the person typed in the name field, if they touched it. */
  name?: string;
  /** Injected only so a test does not depend on whose machine it runs on. */
  home?: string;
}

export function planClone({
  source,
  workspacesDir,
  workspaceName,
  name,
  home = homedir(),
}: ClonePlanInput): ClonePlan {
  const raw = source.trim();

  if (raw.startsWith("/") || raw === "~" || raw.startsWith("~/")) {
    // A local path is not this feature's business past here: registering it is
    // `project.add`, unchanged. The only thing owed is the expansion, so the
    // `↳` can show the absolute path the daemon will actually look at.
    return { kind: "path", path: normalize(raw === "~" ? home : raw.replace(/^~\//, `${home}/`)) };
  }

  const parsed = parseGitUrl(raw);
  if (!parsed.ok) return { kind: "refused", rule: parsed.rule, message: parsed.message };

  const proposed = name?.trim() === "" || name === undefined ? repoNameOf(parsed.url) : name.trim();
  const projectDir = projectHome(workspacesDir, workspaceName, proposed);

  return {
    kind: "url",
    scheme: parsed.url.scheme,
    url: parsed.url.href,
    insecure: parsed.url.insecure,
    name: proposed,
    home: projectDir,
    targetPath: repoDir(projectDir),
  };
}

/** The `raw` a clone has to be handed — credentials intact — for a planned URL. */
export function rawUrlOf(source: string): string | null {
  const parsed = parseGitUrl(source.trim());
  return parsed.ok ? parsed.raw : null;
}

/** Kept next to the planner so nothing downstream reinvents the join. */
export function tempCloneDir(target: string, jobId: string): string {
  return join(dirname(target), `.lumem-clone-${jobId}`);
}
