import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { cloneJobsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/** Mirrors the server's `CloneJob`, minus the fields the screen never reads. */
export interface CloneJobView {
  id: string;
  workspaceId: string;
  url: string;
  targetPath: string;
  name: string;
  state: "cloning" | "registering" | "done" | "failed" | "cancelled";
  phase: string | null;
  percent: number | null;
  message: string | null;
  failure: string | null;
  projectId: string | null;
  updatedAt: number;
}

/** The six phases, said in Portuguese — F6.5. */
export const PHASE_LABEL: Record<string, string> = {
  connecting: "conectando",
  counting: "contando objetos",
  compressing: "comprimindo",
  receiving: "recebendo objetos",
  resolving: "resolvendo deltas",
  checkout: "preparando arquivos",
};

const TERMINAL = new Set(["done", "failed", "cancelled"]);

export function isTerminal(state: string): boolean {
  return TERMINAL.has(state);
}

/**
 * The clone this workspace is showing, read from one place.
 *
 * The cache is the single source: `cloneJobs` fills it on the first render —
 * which is what lets a page reload keep showing a clone that is still running —
 * and `useCloneStream` writes every update into the same entry. Two components
 * need this (the sidebar shows it, the dialog refuses to start a second one),
 * and an earlier version had each of them hold its own state and open its own
 * subscription: two streams for one job, and updates arriving at only one of
 * them.
 *
 * A finished job is *not* filtered out. Doing that made a failure that had just
 * happened invisible to anyone who reloaded the page, which is precisely when
 * somebody most needs to read it.
 */
export function useCloneJob(workspaceId: string): CloneJobView | null {
  const jobs = useQuery({
    queryKey: cloneJobsKey(workspaceId),
    queryFn: () => trpc.project.cloneJobs.query({ workspaceId }),
  });

  return newest((jobs.data ?? []) as CloneJobView[]);
}

/**
 * The running one, and only if it has not finished — the one still worth showing
 * live. Otherwise the most recent, so an ending is not lost to a reload.
 */
function newest(jobs: readonly CloneJobView[]): CloneJobView | null {
  const running = jobs.find((job) => !isTerminal(job.state));
  if (running !== undefined) return running;
  return jobs.reduce<CloneJobView | null>(
    (latest, job) => (latest === null || job.updatedAt > latest.updatedAt ? job : latest),
    null,
  );
}

/**
 * Keeps the cached job current, through the stream that belongs to it.
 *
 * Exactly one component calls this. Progress is data — ten updates a second
 * with no list to invalidate — which is why it does not travel on the coarse
 * `events.onChange` channel.
 */
export function useCloneStream(workspaceId: string): CloneJobView | null {
  const queryClient = useQueryClient();
  const job = useCloneJob(workspaceId);
  const jobId = job !== null && !isTerminal(job.state) ? job.id : null;

  useEffect(() => {
    if (jobId === null) return;

    const subscription = trpc.project.cloneProgress.subscribe(
      { jobId },
      {
        onData: (next) => {
          const updated = next as CloneJobView;
          queryClient.setQueryData(cloneJobsKey(workspaceId), (old: CloneJobView[] | undefined) => {
            const rest = (old ?? []).filter((entry) => entry.id !== updated.id);
            return [...rest, updated];
          });
        },
      },
    );
    // Without this every job would leave a stream behind on a daemon meant to
    // run for weeks — the same leak `useLiveState` guards against.
    return () => subscription.unsubscribe();
  }, [jobId, workspaceId, queryClient]);

  return job;
}
