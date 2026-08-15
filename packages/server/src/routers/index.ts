import { LUMEM_VERSION } from "@lumem/shared";

import { publicProcedure, router } from "../trpc.js";
import { projectRouter } from "./project.js";
import { ptyRouter } from "./pty.js";
import { workspaceRouter } from "./workspace.js";
import { worktreeRouter } from "./worktree.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true as const,
    version: LUMEM_VERSION,
  })),
  project: projectRouter,
  pty: ptyRouter,
  workspace: workspaceRouter,
  worktree: worktreeRouter,
});

export type AppRouter = typeof appRouter;
