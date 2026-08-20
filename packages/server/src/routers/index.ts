import { LUMEM_VERSION } from "@lumem/shared";

import { publicProcedure, router } from "../trpc.js";
import { agentConfigRouter } from "./agentConfig.js";
import { changesRouter } from "./changes.js";
import { eventsRouter } from "./events.js";
import { filesRouter } from "./files.js";
import { projectRouter } from "./project.js";
import { sessionRouter } from "./session.js";
import { setupRouter } from "./setup.js";
import { workspaceRouter } from "./workspace.js";
import { worktreeRouter } from "./worktree.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true as const,
    version: LUMEM_VERSION,
  })),
  agentConfig: agentConfigRouter,
  changes: changesRouter,
  events: eventsRouter,
  files: filesRouter,
  project: projectRouter,
  session: sessionRouter,
  setup: setupRouter,
  workspace: workspaceRouter,
  worktree: worktreeRouter,
});

export type AppRouter = typeof appRouter;
