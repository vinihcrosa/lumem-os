import { Button } from "../../ui/index.js";
import { useUpdateNow, useUpdateStatus } from "../update/index.js";
import { rememberActiveWorkspace } from "../workspace/index.js";
import { Block } from "./Block.js";
import { useLiveSessions, useRecentWorkspaces } from "./queries.js";
import { terminalsClose } from "./words.js";

/**
 * As ações do painel (`038`, AC 48 e 51): abrir o Lumem, atualizar, e os três
 * workspaces mais recentes.
 *
 * **Atualizar diz o que fecha antes de fechar**: com versão nova e shells abertos, a
 * frase está ao lado do botão, e não depois do clique. O que o botão recusa — turno em
 * voo, script rodando — volta do daemon com os números, e aparece aqui.
 */
export function Actions() {
  const status = useUpdateStatus();
  const live = useLiveSessions();
  const recent = useRecentWorkspaces();
  const update = useUpdateNow();

  const available = status.data?.updateAvailable === true;
  const supervised = status.data?.supervised === true;
  const openTerminals = live.data?.openTerminals ?? 0;
  const updating = update.isPending || (update.isSuccess && status.data?.lastError === null);
  const failure =
    update.error?.message ??
    (status.data?.lastError == null ? null : `a atualização falhou: ${status.data.lastError}`);

  return (
    <Block label="Ações">
      {available && openTerminals > 0 && <p className="menubar__warn">{terminalsClose(openTerminals)}</p>}
      <div className="menubar__row">
        <a className="btn btn--sm" href="/" target="_blank" rel="noreferrer">
          Abrir o Lumem
        </a>
        <Button
          size="sm"
          variant="primary"
          disabled={!available || !supervised || updating}
          title={available && !supervised ? "precisa do Lumem rodando como serviço" : undefined}
          onClick={() => {
            update.mutate();
          }}
        >
          {updating ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {failure !== null && (
        <p className="menubar__err" role="alert">
          {failure}
        </p>
      )}
      {recent.data !== undefined && recent.data.length > 0 && (
        <div className="menubar__row">
          {recent.data.map((workspace) => (
            <Button
              key={workspace.id}
              size="sm"
              variant="ghost"
              onClick={() => {
                rememberActiveWorkspace(workspace.id);
                window.open("/", "_blank");
              }}
            >
              {workspace.name}
            </Button>
          ))}
        </div>
      )}
    </Block>
  );
}
