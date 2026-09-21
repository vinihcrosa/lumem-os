import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { secretsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface SecretSlotView {
  id: string;
  label: string;
  hint: string;
  present: boolean;
}

/** O catálogo fechado de credenciais da máquina (`032` T15). */
export function useSecrets() {
  return useQuery({
    queryKey: secretsKey(),
    queryFn: (): Promise<SecretSlotView[]> => trpc.secrets.list.query(),
  });
}

/** `set` — guardar ou apagar (valor vazio), com a invalidação dentro. */
export function useSecretMutations() {
  const queryClient = useQueryClient();

  const set = useMutation({
    // O `id` vem do catálogo do daemon, que é fechado — o `as` diz isso, e o
    // daemon recusa qualquer outro de qualquer jeito.
    mutationFn: (input: { id: string; value: string }) =>
      trpc.secrets.set.mutate({ id: input.id as "linear", value: input.value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: secretsKey() });
    },
  });

  return { set };
}
