import { isAbsolute, relative as relativeTo, resolve, sep } from "node:path";

import { DomainError } from "../errors.js";
import type { FileService } from "../files/FileService.js";

/**
 * The agent reading and writing inside its own checkout (F4.1).
 *
 * Everything here goes through the `file-editor`'s `FileService`, and therefore
 * through its path guard, **without a new exception**. With `auto` as the default
 * permission mode (A9) there is less human confirmation in this path than
 * anywhere else in the feature, so the guard stops being a safety net and becomes
 * the floor — which is why this module adds nothing to it and only feeds it.
 *
 * What it does add is the step before it, and that step is security code: ACP
 * sends **absolute** paths, and `path-guard` refuses absolute paths on principle
 * (reinterpreting one as relative silently answers a different question). So
 * something has to convert, and the conversion is where a naive check goes wrong
 * — `/repo-malicioso` starts with `/repo`.
 */

export interface FsBridgeOptions {
  files: FileService;
  /** The session's checkout. Every path is answered relative to this. */
  root: string;
}

export interface ReadWindow {
  /** 1-based, as ACP counts. */
  line?: number | null;
  limit?: number | null;
}

export interface FsBridge {
  read(path: string, window?: ReadWindow): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

export function createFsBridge({ files, root }: FsBridgeOptions): FsBridge {
  const absoluteRoot = resolve(root);

  /**
   * The ACP path, as something the guard will accept.
   *
   * Two layers, on purpose. This one rejects a path that is not lexically under
   * the checkout; `resolveInsideRoot`, inside the `FileService`, then rejects a
   * path that *resolves* outside it. Only the second catches a symlink, and only
   * the first can look at an absolute path at all.
   */
  function toRelative(path: string): string {
    if (path.includes("\0")) {
      throw new DomainError("INVALID_ARGUMENT", "o caminho tem um byte nulo");
    }

    // A relative path is taken as relative to the checkout. ACP documents these
    // as absolute, and every adapter seen so far sends absolute — but answering
    // a relative one by guessing some other base would be worse than answering
    // it against the one root this session has.
    if (!isAbsolute(path)) return path;

    // `relative` rather than a prefix comparison: `/repo-malicioso` passes
    // `startsWith("/repo")`, and `path.relative` answers `../repo-malicioso`,
    // which the guard then refuses for the right reason.
    const candidate = relativeTo(absoluteRoot, resolve(path));
    if (candidate === ".." || candidate.startsWith(`..${sep}`) || isAbsolute(candidate)) {
      throw new DomainError("BLOCKED", `${path} está fora do checkout`);
    }
    return candidate;
  }

  /**
   * Creates the directories a new file needs, one level at a time.
   *
   * One level at a time because `createDir` refuses `recursive` on purpose: the
   * guard resolves exactly one parent, and `mkdir -p` would create directories it
   * never looked at. Walking honours that reason instead of working around it —
   * every level goes through the same guard the file itself will.
   *
   * It has to exist because ACP gives the agent no way to create a directory: a
   * bridge that refused would make "new file in a new folder" impossible, which
   * is an ordinary thing to ask for.
   */
  async function ensureParents(relative: string): Promise<void> {
    const parts = relative.split(sep).slice(0, -1);
    let walked = "";

    for (const part of parts) {
      walked = walked === "" ? part : `${walked}${sep}${part}`;
      try {
        await files.createDir(absoluteRoot, walked);
      } catch (error) {
        // Already there is the common case, not a failure: the agent writes
        // several files into one new folder.
        if (error instanceof DomainError && error.code === "DUPLICATE") continue;
        throw error;
      }
    }
  }

  return {
    async read(path, window) {
      const content = await files.readFile(absoluteRoot, toRelative(path));

      if (content.kind === "binary") {
        throw new DomainError(
          "INVALID_ARGUMENT",
          `${path} é binário, e fs/read_text_file é sobre texto`,
        );
      }
      if (content.kind === "too-large") {
        throw new DomainError(
          "INVALID_ARGUMENT",
          `${path} tem ${content.bytes} bytes e o limite é ${content.limit}`,
        );
      }

      return sliceWindow(content.text, window);
    },

    async write(path, content) {
      const relative = toRelative(path);

      /*
       * Create-or-replace, which ACP's write means and the `FileService`'s does
       * not: it refuses a missing file, because for the editor that would let
       * autosave resurrect something just deleted. Reconciling the two intents is
       * this bridge's job, not a flag on the service.
       *
       * The revision is read here, immediately before writing, rather than asked
       * of the agent. `baseRevision` exists because a *human's* buffer can be
       * stale by the time it saves; an agent's write is not a buffer being
       * flushed, it is a statement of what the file should now contain, so there
       * is no revision it could honestly supply.
       *
       * The cost is named rather than hidden: two writers in the same instant, and
       * the second wins. What it does not touch is the editor's own check — a
       * person with unsaved text still gets `stale` on their next autosave, which
       * is the conflict the `file-editor` already handles.
       */
      const existing = await files.readFile(absoluteRoot, relative).catch((error: unknown) => {
        if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
        throw error;
      });

      let before = existing;
      if (before === null) {
        await ensureParents(relative);
        await files.createFile(absoluteRoot, relative);
        // Read back rather than assumed empty: the revision has to be the one
        // the service will compare against, and only the service decides what an
        // empty file's revision is.
        before = await files.readFile(absoluteRoot, relative);
      }

      if (before.kind !== "text") {
        // Replacing bytes we cannot read is a way to destroy them silently. The
        // service refuses it on its own; saying so here is what makes the agent's
        // error legible instead of arriving as a revision mismatch.
        throw new DomainError(
          "BLOCKED",
          `escrita recusada em ${path}: o conteúdo atual não é texto`,
        );
      }

      const result = await files.writeFile(absoluteRoot, relative, {
        text: content,
        baseRevision: before.revision,
      });

      if (!result.ok) {
        // Only reachable if something wrote between the read above and this
        // line. Reported rather than retried: a silent retry would make the
        // agent's write win a race it did not know it was in.
        throw new DomainError(
          "BLOCKED",
          `escrita recusada em ${path}: o arquivo mudou no disco durante a gravação`,
        );
      }
    },
  };
}

/**
 * The slice the agent asked for.
 *
 * `line` is 1-based and `limit` counts lines, as ACP defines them. A window past
 * the end is an empty answer rather than an error: asking about a range that is
 * not there is a legitimate question with a boring answer, and an error would
 * make the agent retry something that cannot succeed.
 */
function sliceWindow(text: string, window: ReadWindow | undefined): string {
  const from = window?.line ?? null;
  const limit = window?.limit ?? null;
  if (from === null && limit === null) return text;

  const lines = text.split("\n");
  // A file ending in a newline has an empty last element that is not a line.
  if (lines.at(-1) === "") lines.pop();

  const start = Math.max(0, (from ?? 1) - 1);
  const end = limit === null ? lines.length : start + Math.max(0, limit);
  const window_ = lines.slice(start, end);

  return window_.length === 0 ? "" : `${window_.join("\n")}\n`;
}
