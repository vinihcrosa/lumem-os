import { Button } from "../../ui/index.js";
import { useUpdateNow, useUpdateStatus } from "./queries.js";

/**
 * *Tem versão nova*, na topbar (`038`, Parte 2; AC 22 e 23).
 *
 * Não mostra nada sem versão nova — nem um espaço reservado. Com versão nova e um
 * supervisor, o botão é o gesto: instalar e reiniciar são um só, e a página volta
 * sozinha (`useVersionReload`). Sem supervisor o botão **não existe**, e no lugar
 * dele vai o comando: sair com 0 só faz o daemon voltar quando alguém o relança, e
 * oferecer o botão seria oferecer um 412.
 *
 * A falha aparece aqui e só aqui: a verificação que não conseguiu falar com o
 * registry não é assunto da topbar (fica no log), mas uma instalação que **o
 * clique pediu** e que falhou é — ou o botão voltaria a ficar clicável com o motivo
 * escondido.
 */
export function UpdateBanner() {
  const status = useUpdateStatus();
  const update = useUpdateNow();

  const data = status.data;
  if (data === undefined || !data.updateAvailable || data.latest === null) return null;

  // O daemon aceitou e está instalando, ou já saiu para voltar na versão nova. Se a
  // instalação falhar, o `lastError` chega na leitura seguinte e devolve o botão.
  const updating = update.isPending || (update.isSuccess && data.lastError === null);
  const failure =
    update.error?.message ??
    (data.lastError === null ? null : `a atualização falhou: ${data.lastError}`);

  return (
    <div className="update">
      <span className="update__jump">{`v${data.current} → v${data.latest}`}</span>
      {data.supervised ? (
        <Button
          size="sm"
          variant="primary"
          disabled={updating}
          onClick={() => {
            update.mutate();
          }}
        >
          {updating ? "Atualizando…" : "Atualizar"}
        </Button>
      ) : (
        <code className="update__cmd">lumem upgrade</code>
      )}
      {failure !== null && (
        <span className="update__err" role="alert">
          {failure}
        </span>
      )}
    </div>
  );
}
