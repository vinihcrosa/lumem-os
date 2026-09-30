import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DAEMON_SETTINGS_KEY, UPDATE_STATUS_KEY } from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/**
 * Há versão nova, e o daemon pode instalá-la? (`038`, Parte 2)
 *
 * Perguntado de tempos em tempos e não uma vez: o daemon só lê o registry uns
 * segundos depois de subir e a cada 6 h, e uma topbar que perguntasse só ao montar
 * nunca mostraria o banner de uma aba deixada aberta. O `retry` desligado é o mesmo
 * do `useHealth` — uma resposta que falhou é a resposta, e durante a reinicialização
 * do próprio daemon ela vai falhar.
 */
export function useUpdateStatus() {
  return useQuery({
    queryKey: UPDATE_STATUS_KEY,
    queryFn: () => trpc.system.updateStatus.query(),
    refetchInterval: 15_000,
    retry: false,
  });
}

/**
 * O gesto de atualizar. Volta quando a instalação **começa** — o daemon vai sair e
 * voltar na versão nova, e é o `useVersionReload` que traz a página junto.
 */
export function useUpdateNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trpc.system.update.mutate(),
    // Recusado ou aceito, o estado do daemon mudou: o `lastError` de uma tentativa
    // anterior some, e o `installing` de agora ainda não aparece — mas a leitura fresca
    // é o que a tela mostra a seguir.
    onSettled: () => queryClient.invalidateQueries({ queryKey: UPDATE_STATUS_KEY }),
  });
}

/** As duas preferências da máquina: verificar versão nova e atualizar sozinho. */
export function useDaemonSettings() {
  return useQuery({
    queryKey: DAEMON_SETTINGS_KEY,
    queryFn: () => trpc.system.settings.query(),
  });
}

export function useSetDaemonSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { updateCheck?: boolean; autoUpdate?: "off" | "idle" }) =>
      trpc.system.setSettings.mutate(patch),
    onSuccess: (stored) => {
      // O daemon devolve o que gravou: é o valor da tela, e não o que se pediu. E o
      // status pode ter mudado com ele (`checkEnabled`).
      queryClient.setQueryData(DAEMON_SETTINGS_KEY, stored);
      return queryClient.invalidateQueries({ queryKey: UPDATE_STATUS_KEY });
    },
  });
}
