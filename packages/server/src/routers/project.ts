import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, isAbsolute, normalize } from "node:path";

import { z } from "zod";

import type { ProjectRow } from "../db/schema.js";
import { DomainError, isDomainError } from "../errors.js";
import { cloneRepository, type CloneFailure } from "../git/clone.js";
import { planClone, rawUrlOf, tempCloneDir } from "../git/clone-plan.js";
import type { CloneJob } from "../git/CloneJobStore.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { domainSafe, domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";
import { prepareCloneTarget, projectHome, repoDir } from "../workspace-layout.js";

/**
 * Projects over the wire, PRD F2.1–F2.5.
 *
 * The order of operations in `add` is the whole point: validate against the
 * disk first, register only after. PRD §8 — a refused path leaves nothing
 * behind.
 */

const nameSchema = z.string().trim().min(1, "o nome não pode ficar vazio").max(80);

/**
 * What the sidebar needs beyond the row itself.
 *
 * `available` is computed per request rather than stored: a repository can be
 * moved or unmounted between two calls, and a cached flag would be a lie that
 * outlives the fact.
 */
export interface ProjectView extends ProjectRow {
  available: boolean;
}

function withAvailability(row: ProjectRow): ProjectView {
  return { ...row, available: existsSync(row.path) };
}

export interface RegisterProjectInput {
  workspaceId: string;
  /** Absolute path to the repository root. Already final. */
  path: string;
  name: string;
  /** Sanitized, or null when registered by path. */
  remoteUrl?: string | null;
  managed?: boolean;
}

/**
 * The one way a project gets registered, A5.
 *
 * Cloning is a step **before** registering, not a second way of registering.
 * Two routines would be two definitions of "a valid project", and the second
 * would fall behind the first time the first one changed. With one, a clone
 * that ends up somewhere that is not a repository root is refused exactly like
 * a typed path — the clone gets no discount for having taken four minutes.
 */
export async function registerProject(
  ctx: Context,
  { workspaceId, path, name, remoteUrl = null, managed = false }: RegisterProjectInput,
): Promise<ProjectView> {
  const check = await ctx.git.isGitRepo(path);
  if (!check.ok) {
    // The message names which of the four checks failed — F2.2 is explicit
    // that "invalid path" is not an answer.
    throw new DomainError("INVALID_ARGUMENT", check.message);
  }

  // Before the insert, deliberately: a repository whose branch cannot be
  // resolved is a repository the daemon cannot cut worktrees from, and
  // registering it would only defer the failure to a worse moment.
  const defaultBranch = await ctx.git.resolveDefaultBranch(path);

  const created = await createProjectRepository(ctx.db).create({
    workspaceId,
    name,
    path,
    defaultBranch,
    remoteUrl,
    managed,
  });
  ctx.events.emit({ type: "project.changed", workspaceId });
  return withAvailability(created);
}

/**
 * The desired name, or the first free variation of it, F6.4.
 *
 * Called by the clone just before the final `rename`, so the directory is
 * created with the name that will actually be registered and the bytes never
 * move twice. Failing instead would mean throwing away a four-minute download
 * over a string: renaming is undone with one click, the download is not.
 */
export async function resolveAvailableName(
  ctx: Context,
  workspaceId: string,
  desired: string,
): Promise<string> {
  const taken = new Set(await createProjectRepository(ctx.db).namesIn(workspaceId));
  if (!taken.has(desired)) return desired;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${desired}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const pathSchema = z
  .string()
  .trim()
  .min(1, "informe o caminho do repositório")
  // Absolute, because the daemon's own working directory is meaningless to the
  // person typing — it is wherever they happened to start it from.
  .refine((value) => isAbsolute(value), "o caminho precisa ser absoluto")
  .transform((value) => normalize(value));

export const projectRouter = router({
  listByWorkspace: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await createProjectRepository(ctx.db).listByWorkspace(input.workspaceId);
      // PRD §8: a repository removed from disk stays registered and is shown
      // as unavailable, with its actions blocked.
      return rows.map(withAvailability);
    }),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await createProjectRepository(ctx.db).findById(input.id);
      return row ? withAvailability(row) : null;
    }),

  add: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        path: pathSchema,
        /** Defaults to the directory's own name, F2.3. */
        name: nameSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() =>
        // `managed` stays false here, always: there is no path by which a
        // project registered from disk becomes one the daemon may delete (A12).
        registerProject(ctx, {
          workspaceId: input.workspaceId,
          path: input.path,
          name: input.name ?? basename(input.path),
        }),
      ),
    ),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const renamed = await createProjectRepository(ctx.db).rename(input.id, input.name);
        ctx.events.emit({ type: "project.changed", workspaceId: renamed.workspaceId });
        return withAvailability(renamed);
      }),
    ),

  remove: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      // Same rule as a worktree, for the same reason: §6 forbids a session
      // whose scope no longer exists, and the user would have no way to reach
      // one pointing at a project that is gone from the sidebar.
      const running = await ctx.sessionStore.listRunningInScope("project", input.id);
      if (running.length > 0) {
        throw new DomainError(
          "BLOCKED",
          `o projeto tem ${running.length} sessão(ões) rodando; encerre-as antes de remover`,
        );
      }

      const projects = createProjectRepository(ctx.db);
      const row = await projects.findById(input.id);

      // F2.5: the registration goes, the disk is never touched. Not even when
      // the worktrees the daemon created live under ~/.lumem.
      await projects.remove(input.id);
      if (row) ctx.events.emit({ type: "project.changed", workspaceId: row.workspaceId });
      return { ok: true as const };
    }),
  ),

  /** What the `↳` line under the field says, F6.1. */
  parseSource: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), source: z.string(), name: nameSchema.optional() }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const workspace = await requireWorkspace(ctx, input.workspaceId);
        return planClone({
          source: input.source,
          workspacesDir: ctx.config.workspacesDir,
          workspaceName: workspace.name,
          ...(input.name === undefined ? {} : { name: input.name }),
        });
      }),
    ),

  clone: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        source: z.string().min(1),
        name: nameSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const workspace = await requireWorkspace(ctx, input.workspaceId);
        const plan = planClone({
          source: input.source,
          workspacesDir: ctx.config.workspacesDir,
          workspaceName: workspace.name,
          ...(input.name === undefined ? {} : { name: input.name }),
        });

        // Every refusal before a process exists, F6.2 — and each one names the
        // rule that refused rather than answering "invalid".
        if (plan.kind === "refused") throw new DomainError("INVALID_ARGUMENT", plan.message);
        if (plan.kind === "path") {
          throw new DomainError(
            "INVALID_ARGUMENT",
            `${plan.path} é um caminho local; para registrá-lo use adicionar projeto, não clonar`,
          );
        }

        // The common case of F6.4, settled at zero cost: the race that is left
        // is somebody registering this name during the clone, and that one is
        // suffixed instead of thrown away.
        const taken = await createProjectRepository(ctx.db).namesIn(input.workspaceId);
        if (taken.includes(plan.name)) {
          throw new DomainError("DUPLICATE", `já existe um projeto chamado "${plan.name}" neste workspace`);
        }

        const rawUrl = rawUrlOf(input.source);
        if (rawUrl === null) throw new DomainError("INVALID_ARGUMENT", "URL inválida");

        // Refuses while another clone is running, naming it (A11).
        const job = ctx.clones.start({
          workspaceId: input.workspaceId,
          url: plan.url,
          targetPath: plan.targetPath,
          name: plan.name,
        });

        // Deliberately not awaited: the HTTP connection is not the place to
        // wait four minutes, and an F5 must not lose track of something that
        // goes on running. `runClone` reports through the job store.
        void runCloneJob(ctx, job, { rawUrl, url: plan.url, name: plan.name });
        return job;
      }),
    ),

  /** Live jobs of a workspace. This is what survives a page reload. */
  cloneJobs: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.clones.listByWorkspace(input.workspaceId)),

  cloneProgress: publicProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .subscription(async function* ({ ctx, input, signal }) {
      // A stream of its own, and never `events.onChange`: that channel carries
      // "which list is stale", and progress is data — ten updates a second,
      // with no list to invalidate.
      for await (const job of ctx.clones.subscribe(input.jobId, signal!)) yield job;
    }),

  cloneCancel: publicProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafe(() => {
        ctx.clones.cancel(input.jobId);
        return { ok: true as const };
      }),
    ),
});

async function requireWorkspace(ctx: Context, workspaceId: string) {
  const workspace = await createWorkspaceRepository(ctx.db).findById(workspaceId);
  if (!workspace) throw new DomainError("NOT_FOUND", `workspace ${workspaceId} não existe`);
  return workspace;
}

/**
 * The clone, from the first byte to the registered project.
 *
 * Runs detached from the request that started it and reports only through the
 * job store, which is the whole reason the job exists (A2).
 *
 * The order is §5's, and it is the requirement: the temporary is the only thing
 * on disk between the start and the end, the `rename` is the instant the
 * repository begins to exist, and the registration is last. If the registration
 * refuses, the directory goes with it — §8 forbids leaving a checkout nobody
 * knows about.
 */
async function runCloneJob(
  ctx: Context,
  job: CloneJob,
  { rawUrl, url, name }: { rawUrl: string; url: string; name: string },
): Promise<void> {
  let landed: string | null = null;
  let finalName = name;

  try {
    const target = await prepareCloneTarget(job.targetPath, {
      workspacesDir: ctx.config.workspacesDir,
    });

    landed = await cloneRepository({
      rawUrl,
      url,
      targetPath: target,
      tempPath: tempCloneDir(target, job.id),
      signal: ctx.clones.signalOf(job.id),
      onProgress: (progress) => ctx.clones.progress(job.id, progress),
      resolveTarget: async () => {
        // F6.4, and this is why it happens here: the name is settled *before*
        // the rename, so the directory is created with the name that will be
        // registered and the bytes never move twice.
        finalName = await resolveAvailableName(ctx, job.workspaceId, name);
        if (finalName === name) return target;
        const workspace = await requireWorkspace(ctx, job.workspaceId);
        return prepareCloneTarget(
          repoDir(projectHome(ctx.config.workspacesDir, workspace.name, finalName)),
          { workspacesDir: ctx.config.workspacesDir },
        );
      },
    });

    ctx.clones.registering(job.id);
    const registered = await registerCloned(ctx, {
      workspaceId: job.workspaceId,
      path: landed,
      name: finalName,
      url,
    });
    landed = registered.project.path;
    finalName = registered.project.name;

    ctx.clones.done(
      job.id,
      registered.project.id,
      finalName === name
        ? undefined
        : `o nome ${name} já existia; registrado como ${finalName}`,
    );
  } catch (error) {
    // The registration refused what the disk already has. Keeping it would
    // produce a directory the daemon does not know about and cannot clean up.
    if (landed !== null) await rm(landed, { recursive: true, force: true }).catch(() => {});

    // A cancelled job is already in a terminal state, and marking it failed on
    // top would be an illegal transition — the abort is what made this throw.
    if (ctx.clones.get(job.id)?.state === "cancelled") return;
    ctx.clones.fail(job.id, failureOf(error), messageOf(error));
  } finally {
    // Both endings change the sidebar: a project appeared, or one stopped being
    // about to. The coarse channel is where that list already listens (A3).
    ctx.events.emit({ type: "project.changed", workspaceId: job.workspaceId });
  }
}

/**
 * Registering the clone, F6.4 — including the race the pre-check cannot close.
 *
 * The name is checked before the download and resolved again before the rename,
 * and neither is enough: the window that is left runs from the last resolution
 * to the `INSERT`, and somebody registering that name inside it is the case
 * this exists for. Failing there would mean throwing away a finished download
 * over a string, when renaming is undone with one click.
 *
 * Because the name **is** the directory, taking the next free one also moves
 * the bytes — once, and only in the race. The common case never gets here.
 */
async function registerCloned(
  ctx: Context,
  { workspaceId, path, name, url }: { workspaceId: string; path: string; name: string; url: string },
): Promise<{ project: ProjectView }> {
  let current = path;
  let currentName = name;

  // Bounded, because an unbounded retry against a duplicate is a spin: five
  // consecutive losses of a millisecond-wide race is not a case, it is a defect.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const project = await registerProject(ctx, {
        workspaceId,
        path: current,
        name: currentName,
        remoteUrl: url,
        managed: true,
      });
      return { project };
    } catch (error) {
      if (!isDomainError(error) || error.code !== "DUPLICATE") throw error;

      const workspace = await requireWorkspace(ctx, workspaceId);
      currentName = await resolveAvailableName(ctx, workspaceId, name);
      const next = await prepareCloneTarget(
        repoDir(projectHome(ctx.config.workspacesDir, workspace.name, currentName)),
        { workspacesDir: ctx.config.workspacesDir },
      );
      await rename(current, next);
      current = next;
    }
  }

  throw new DomainError(
    "DUPLICATE",
    `não consegui um nome livre para "${name}" neste workspace`,
  );
}

function failureOf(error: unknown): CloneFailure {
  const failure = (error as { failure?: CloneFailure }).failure;
  return failure ?? "internal";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
