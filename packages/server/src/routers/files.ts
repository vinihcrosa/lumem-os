import { z } from "zod";

import { createFileService, MAX_FILE_BYTES } from "../files/FileService.js";
import { recordSignal } from "../memory/signals.js";
import { resolveScope } from "../scope.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * The checkout's files over the wire — right-panel F5.1–F5.2, file-editor
 * F5.1–F5.7.
 *
 * This header used to end with "read-only by construction: there is no write
 * procedure here to review later", which was right-panel decision D5. Five of
 * the procedures below now change the disk, and that reversal is deliberate and
 * argued in §2 of the file-editor PRD — a non-objective reverted without record
 * is a documentation debt, and a comment left describing the previous feature
 * is the same debt at the place someone reads before writing code.
 *
 * What did *not* change is the order every one of them runs in: `resolveScope`
 * first, then the path guard — the scope decides which directory is the root,
 * and the guard decides whether the path is inside it. A procedure here that
 * reaches the disk any other way is the one question this file is reviewed for.
 */

/** Stateless, so it is built once instead of injected through the context. */
const files = createFileService();

/**
 * Há sessão de agente viva neste checkout?
 *
 * É o que distingue "editei um arquivo" de "editei por cima do agente" — e o
 * segundo é o sinal que a Q17 quer. Pergunta ao `PtyManager`, que é quem sabe o
 * que está vivo; o banco sabe o que existiu.
 */
async function hasLiveAgent(
  ctx: Context,
  scopeType: "project" | "worktree",
  scopeId: string,
): Promise<boolean> {
  const running = await ctx.sessionStore.listRunningInScope(scopeType, scopeId);
  return running.some((session) => session.kind === "agent");
}

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
  /** Root-relative. Empty is the checkout itself; the guard refuses the rest. */
  path: z.string().max(4_096).default(""),
});

const listSchema = scopeSchema.extend({
  /**
   * Raises the ceiling for one call, which is what "listar assim mesmo" asks
   * for after a truncated listing. Bounded so the answer stays a listing.
   */
  limit: z.number().int().min(1).max(20_000).optional(),
});

/**
 * A path a write names, required where the read side's is optional.
 *
 * `.default("")` means "the checkout itself", which is the listing every client
 * opens with; on this side the same default would let a forgotten field name
 * the root of the repository. The rule that the root is untouchable stays in
 * the guard — `.` and a blank string get past this floor and die there, with a
 * sentence — so this is a floor against a missing field, not a second copy of
 * §5 living in a schema.
 */
const targetPath = z.string().min(1).max(4_096);

const targetSchema = scopeSchema.extend({ path: targetPath });

/**
 * The absurd filter in front of `writeFile`, and deliberately not the ceiling.
 *
 * `z.string().max()` counts UTF-16 code units and the service counts UTF-8
 * bytes, and the two never agree above ASCII: a text of a million multibyte
 * characters is a million units and up to three megabytes, so it passes here
 * and is refused there, by byte count, with the number in the message. That
 * order is the right one — the product rule is bytes (F5.2, §5), and this only
 * keeps an unbounded string from being parsed before anyone can refuse it.
 *
 * Nothing the service would accept dies here, because a string never has more
 * units than bytes. Do not "fix" either number to match the other: making this
 * one authoritative moves the ceiling to the wrong unit, and removing it lets a
 * request allocate whatever the body limit allows.
 */
const textSchema = z.string().max(MAX_FILE_BYTES);

/**
 * Bounded like everything else on this input, and not `.length(64)`.
 *
 * How wide a revision is belongs to `revisionOf`, which is the only place that
 * decides the hash. A second copy of that width here would have to be changed
 * in step with it, and being wrong costs nothing that matters: a revision the
 * disk does not have is `stale`, which is an answer the client already handles.
 */
const revisionSchema = z.string().min(1).max(128);

export const filesRouter = router({
  listDir: publicProcedure.input(listSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
      return files.listDir(cwd, input.path, { maxEntries: input.limit });
    }),
  ),

  read: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
      return files.readFile(cwd, input.path);
    }),
  ),

  write: publicProcedure
    .input(targetSchema.extend({ text: textSchema, baseRevision: revisionSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
        // Handed back exactly as it comes, refusal included: a conflict is an
        // answer and not an exception (D3.1, F3.3), so it must not pass through
        // `TRPCError` on the way out. Turning it into one would reach the
        // client as a failure to retry rather than as the choice E10 draws —
        // and would throw away the `revision` and the `changedAt` that the two
        // options are written with.
        const result = await files.writeFile(cwd, input.path, {
          text: input.text,
          baseRevision: input.baseRevision,
        });

        // Sinal de ação (Q17): você editar um arquivo pelo Lumem, com uma
        // sessão de agente viva no mesmo checkout, é "eu mexi no que ele
        // escreveu". Registrar o evento é barato; interpretar fica para quando
        // houver volume. Só evento estrutural, nunca o texto (Q18).
        if (result.ok === true && (await hasLiveAgent(ctx, input.scopeType, input.scopeId))) {
          recordSignal(ctx.db, {
            kind: "user_edited_after_agent",
            target: input.path,
            ...(input.scopeType === "worktree"
              ? { worktreeId: input.scopeId }
              : { projectId: input.scopeId }),
          });
        }

        return result;
      }),
    ),

  create: publicProcedure
    .input(targetSchema.extend({ kind: z.enum(["file", "dir"]) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
        // No default on `kind`: creating a directory because a field was left
        // out is not a mistake the tree should be able to make.
        return input.kind === "dir"
          ? files.createDir(cwd, input.path)
          : files.createFile(cwd, input.path);
      }),
    ),

  rename: publicProcedure
    .input(scopeSchema.omit({ path: true }).extend({ from: targetPath, to: targetPath }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
        // One scope for both ends, so renaming can never move a file between
        // checkouts: F4.2 is "renomear é mover", inside one root.
        return files.rename(cwd, input.from, input.to);
      }),
    ),

  remove: publicProcedure
    .input(
      targetSchema.extend({
        /** Explicit, always: §5 refuses to let an `rmdir` become an `rm -rf`. */
        recursive: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
        await files.remove(cwd, input.path, { recursive: input.recursive });
        return { ok: true as const };
      }),
    ),

  /**
   * A query and not a mutation, which is the difference the dialog is made of.
   *
   * It only reads, and it runs *before* anyone agreed to anything (F5.7) — so
   * it is cacheable, prefetchable and safe to fire from a hover, none of which
   * a mutation is. The four above are mutations for the mirror reason: over the
   * wire a query answers GET, and a GET that deletes files is the shape a
   * browser, a proxy or a link preview fires on its own.
   *
   * Its `git ls-files` keeps the default 30 s timeout of `execGit`. Shorter
   * would read as kindness to a modal dialog and is the opposite of it: a
   * timed-out `execGit` throws GIT_FAILED, and both readers of it swallow that
   * into their empty answer — `tracked: false` for a file, no tracked names at
   * all for a directory. So a lower ceiling would not turn the rare
   * slow-but-correct answer into a failure the dialog could word. It would turn
   * it into a wrong one, silently: "nada traz esse arquivo de volta", about a
   * file git has.
   */
  deletePreview: publicProcedure.input(targetSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
      return files.deletePreview(cwd, input.path);
    }),
  ),
});
