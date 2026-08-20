import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ACP_ADAPTER_COMMAND } from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import { detectAgents } from "../setup/agents.js";
import { preflight } from "../setup/preflight.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * What the first-access flow reads, onboarding F2 and F3.
 *
 * Three queries, no mutations — and that is the shape of the whole feature: the
 * five things the flow *writes* are `workspace.create`, `agentConfig.create`,
 * `project.add`, `worktree.create` and `session.createAgent`, all of which
 * already existed. Nothing here changes the machine.
 */
export const setupRouter = router({
  /** The five checks, each one able to fail without the others. */
  preflight: publicProcedure.query(({ ctx }) => preflight({ config: ctx.config })),

  /** `claude` and the adapter: where they are, and what version they claim. */
  agents: publicProcedure.query(() => detectAgents()),

  /**
   * One handshake, then the process dies.
   *
   * A query and not a mutation, deliberately: it changes nothing that outlives
   * the call. That it starts a process is an implementation detail of *reading*
   * whether the adapter works — the same way `project.inspect` runs git.
   */
  probe: publicProcedure
    .input(
      z
        .object({
          /** Defaults to the adapter the flow installs. */
          command: z.string().trim().min(1).optional(),
          args: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const command = input?.command ?? ACP_ADAPTER_COMMAND;

        /*
         * A directory of its own, and an empty one.
         *
         * `cwd` is where the agent would read files from, and pointing a probe at
         * a real checkout would have the adapter index a repository to answer a
         * question about whether it starts.
         */
        const cwd = join(ctx.config.stateDir, "probe");
        try {
          mkdirSync(cwd, { recursive: true });
        } catch (error) {
          throw new DomainError(
            "SPAWN_FAILED",
            `não deu para criar ${cwd}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }

        return ctx.acpManager.probe({
          command,
          ...(input?.args === undefined ? {} : { args: input.args }),
          cwd,
        });
      }),
    ),
});
