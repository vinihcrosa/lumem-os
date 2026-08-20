import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ACP_ADAPTER_COMMAND, ADAPTERS_DIR_NAME } from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import { detectAgents } from "../setup/agents.js";
import { adapterBinaryPath, installAdapter } from "../setup/install-adapter.js";
import { startLogin } from "../setup/login.js";
import { preflight } from "../setup/preflight.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * What the first-access and login flows read, and the two things they run.
 *
 * The reads — `preflight`, `agents`, `probe` — change nothing. The two mutations
 * do, and both are deliberate widenings of what a local daemon does on a click:
 * `installAdapter` runs a package manager and then executes what it downloaded,
 * and `login` runs a command the *adapter* named, in a terminal. Each one carries
 * its own note about why that is acceptable and what bounds it.
 */
export const setupRouter = router({
  /** The five checks, each one able to fail without the others. */
  preflight: publicProcedure.query(({ ctx }) => preflight({ config: ctx.config })),

  /**
   * `claude` and the adapter: where they are, and what version they claim.
   *
   * The adapter is looked for on the PATH *and* in the directory the daemon
   * installs into — a machine where the daemon installed it has no reason to also
   * have it globally, and the flow must not ask twice for the same thing.
   */
  agents: publicProcedure.query(({ ctx }) =>
    detectAgents({ installedAt: adapterBinaryPath(join(ctx.config.stateDir, ADAPTERS_DIR_NAME)) }),
  ),

  /**
   * Installs the adapter into the daemon's own directory, at the pinned version.
   *
   * A mutation, and the only one this router has: it downloads and writes. What it
   * costs is named in `install-adapter.ts` — the daemon runs a package manager and
   * then executes what it downloaded.
   */
  installAdapter: publicProcedure.mutation(({ ctx }) =>
    domainSafeAsync(() =>
      installAdapter({ dir: join(ctx.config.stateDir, ADAPTERS_DIR_NAME) }),
    ),
  ),

  /**
   * Runs one of the adapter's own login commands in a terminal the daemon owns.
   *
   * The command is not chosen here: it is the one the adapter handed over in
   * `authMethods`, which is why this takes it as input rather than composing it.
   * A client that invented a command would be running arbitrary binaries on the
   * daemon's machine, so the input is checked against what the adapter offered.
   */
  login: publicProcedure
    .input(
      z.object({
        methodId: z.string().trim().min(1),
        /** Which adapter to ask. Defaults to what the flow installed or found. */
        command: z.string().trim().min(1).optional(),
        /**
         * And its arguments, because a command without them is a different program.
         *
         * `node` with the adapter's script is an adapter; `node` alone is a REPL
         * that answers no handshake and hangs until the timeout.
         */
        args: z.array(z.string()).optional(),
        cols: z.number().int().min(1).max(5_000).optional(),
        rows: z.number().int().min(1).max(5_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const command = input.command ?? ACP_ADAPTER_COMMAND;
        const cwd = join(ctx.config.stateDir, "probe");

        /*
         * Asked again rather than trusted from the client.
         *
         * The client sends a `methodId`, not a command line: what actually gets
         * executed is whatever the adapter itself declared for that id. A client
         * that could name the binary would be a client that can run anything on
         * the machine the daemon is on.
         */
        const report = await ctx.acpManager.probe({
          command,
          ...(input.args === undefined ? {} : { args: input.args }),
          cwd,
        });
        const method = report.authMethods.find((candidate) => candidate.id === input.methodId);

        if (method === undefined) {
          throw new DomainError(
            "NOT_FOUND",
            `o adaptador não oferece o método de login "${input.methodId}"`,
          );
        }
        if (method.type !== "terminal" || method.command === null) {
          throw new DomainError(
            "BLOCKED",
            `"${method.name}" não é um login que o Lumem saiba executar: ${
              method.type === "terminal"
                ? "o adaptador não disse qual comando rodar"
                : `o método é do tipo ${method.type}`
            }`,
          );
        }

        return startLogin({
          ptyManager: ctx.ptyManager,
          command: method.command,
          args: method.args,
          cwd,
          cols: input.cols,
          rows: input.rows,
        });
      }),
    ),

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
