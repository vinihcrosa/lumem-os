import { LoginOptions, useAccountProbe, useReprobeAgents, type AgentAccountView } from "../agent/index.js";
import { Button } from "../../ui/index.js";

/**
 * Entrar numa conta — o login da `009`, apontado para **esta** conta.
 *
 * Não é um segundo fluxo: é o `LoginOptions` da `009`, com a conta como alvo. O
 * daemon abre o terminal do login com a variável da conta, e é no diretório
 * dela que a credencial cai. Quem diz que entrou é o probe da conta depois — o
 * mesmo que a conecta no banco —, e não a pessoa afirmando (`021`).
 */
export function AccountLogin({ account, onClose }: { account: AgentAccountView; onClose(): void }) {
  const target = { adapterId: account.adapterId, accountId: account.id };
  const probe = useAccountProbe(target, true);
  const reprobe = useReprobeAgents();

  return (
    <div className="setup set__login" role="group" aria-label={`entrar em ${account.label}`}>
      <div className="setup__head">
        <span className="setup__t">Entrar em {account.label}</span>
        <button type="button" className="setup__x" aria-label="fechar" onClick={onClose}>
          ✕
        </button>
      </div>
      {body()}
    </div>
  );

  function body() {
    if (probe.isPending) return <span className="setup__note">perguntando ao adaptador…</span>;
    if (probe.isError) {
      return (
        <>
          <span className="set__err" role="alert">
            {probe.error.message}
          </span>
          <div className="setup__acts">
            <Button size="sm" variant="ghost" onClick={() => void reprobe()}>
              tentar de novo
            </Button>
          </div>
        </>
      );
    }
    if (probe.data.authRequired) {
      return <LoginOptions target={target} methods={probe.data.authMethods} onDone={() => void reprobe()} />;
    }
    return (
      <>
        <span className="setup__note">O adaptador confirmou o login desta conta.</span>
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={onClose}>
            fechar
          </Button>
        </div>
      </>
    );
  }
}
