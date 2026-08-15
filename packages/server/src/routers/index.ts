import { LUMEM_VERSION } from "@lumem/shared";

import { publicProcedure, router } from "../trpc.js";
import { agentConfigRouter } from "./agentConfig.js";
import { projectRouter } from "./project.js";
import { sessionRouter } from "./session.js";
import { workspaceRouter } from "./workspace.js";
import { worktreeRouter } from "./worktree.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true as const,
    version: LUMEM_VERSION,
  })),
  agentConfig: agentConfigRouter,
  project: projectRouter,
  session: sessionRouter,
  workspace: workspaceRouter,
  worktree: worktreeRouter,
});

export type AppRouter = typeof appRouter;
