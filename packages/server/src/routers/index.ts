import { LUMEM_VERSION } from "@lumem/shared";

import { publicProcedure, router } from "../trpc.js";
import { agentConfigRouter } from "./agentConfig.js";
import { changesRouter } from "./changes.js";
import { eventsRouter } from "./events.js";
import { filesRouter } from "./files.js";
import { memoryRouter } from "./memory.js";
import { prRouter } from "./pr.js";
import { projectRouter } from "./project.js";
import { scriptsRouter } from "./scripts.js";
import { sessionRouter } from "./session.js";
import { setupRouter } from "./setup.js";
import { taskRouter } from "./task.js";
import { usageRouter } from "./usage.js";
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
  memory: memoryRouter,
  pr: prRouter,
  project: projectRouter,
  scripts: scriptsRouter,
  session: sessionRouter,
  setup: setupRouter,
  task: taskRouter,
  usage: usageRouter,
  workspace: workspaceRouter,
  worktree: worktreeRouter,
});

export type AppRouter = typeof appRouter;
