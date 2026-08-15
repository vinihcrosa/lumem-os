import { LUMEM_VERSION } from "@lumem/shared";

import { publicProcedure, router } from "../trpc.js";
import { ptyRouter } from "./pty.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true as const,
    version: LUMEM_VERSION,
  })),
  pty: ptyRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
