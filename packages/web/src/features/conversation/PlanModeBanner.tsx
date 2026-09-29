/**
 * O que o plan mode quer dizer, em palavras (`035` S1).
 *
 * A pílula azul já dizia `plan`, e só para quem sabe o que a cor significa:
 * quem não sabe manda *"pode implementar"* e espera código que não vem. A
 * faixa lê o valor literal `"plan"`, como o `MODE_TONE` da pílula — Claude e
 * Codex usam o mesmo id.
 *
 * Fora de uma conversa em leitura: nada vai ser alterado nela de qualquer
 * jeito, e a faixa ficaria prometendo uma aprovação que não pode acontecer.
 */

export interface PlanModeBannerProps {
  mode: string;
  readOnly: boolean;
}

export function PlanModeBanner({ mode, readOnly }: PlanModeBannerProps) {
  if (mode !== "plan" || readOnly) return null;
  return (
    <div className="plan-mode" role="status">
      modo plano — o agente não altera arquivos até você aprovar o plano
    </div>
  );
}
