import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface NewSessionMenuProps {
  scopeType: "project" | "worktree";
  scopeId: string;
  onCreated: (sessionId: string) => void;
}

/** Opening a shell or an agent in one scope, F5.1 and F5.2. */
export function NewSessionMenu({ scopeType, scopeId, onCreated }: NewSessionMenuProps) {
  const queryClient = useQueryClient();

  const configs = useQuery({
    queryKey: ["agentConfig", "list"],
    queryFn: () => trpc.agentConfig.list.query(),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sessionsKey(scopeType, scopeId) });

  const openShell = useMutation({
    mutationFn: () => trpc.session.createShell.mutate({ scopeType, scopeId }),
    onSuccess: async (created) => {
      await refresh();
      onCreated(created.id);
    },
  });

  const openAgent = useMutation({
    mutationFn: (agentConfigId: string) =>
      trpc.session.createAgent.mutate({ scopeType, scopeId, agentConfigId }),
    onSuccess: async (created) => {
      await refresh();
      onCreated(created.id);
    },
  });

  const failure = openShell.error ?? openAgent.error;

  return (
    <div className="new-session">
      <button type="button" onClick={() => openShell.mutate()} disabled={openShell.isPending}>
        novo shell
      </button>

      {(configs.data ?? []).map((config) => (
        <button
          key={config.id}
          type="button"
          // F6.5: shown, but not launchable. Hiding it would leave the user
          // wondering where their agent went; enabling it would let them watch
          // a terminal open and close with no explanation.
          disabled={!config.available || openAgent.isPending}
          title={config.available ? undefined : `${config.command} não está no PATH do servidor`}
          onClick={() => openAgent.mutate(config.id)}
        >
          novo {config.name}
          {!config.available && " (indisponível)"}
        </button>
      ))}

      {failure && <p role="alert">{failure.message}</p>}
    </div>
  );
}
