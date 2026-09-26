import type { AcpEvent } from "@lumem/shared";

/**
 * As duas linhas de vínculo de *continuar em outra conta* (`034` T11, nota da
 * Q3b de 2026-09-26).
 *
 * Fora do `conversation-model.ts` pelo mesmo motivo do `unavailable-text.ts`:
 * ele está no teto de linhas da regra 8, e o mapa só encolhe.
 */
export function continuationText(
  event: Extract<AcpEvent, { type: "continued_in" | "continued_from" }>,
): string {
  if (event.type === "continued_in") return `continuada em ${event.label} →`;
  return (
    `continuação de ${event.label} — levou ${String(event.messages)} mensagens, ` +
    `~${String(event.approxTokens)} tokens`
  );
}
