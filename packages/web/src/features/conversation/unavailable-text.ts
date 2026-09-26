import type { AcpEvent } from "@lumem/shared";

/**
 * As frases do modelo que o daemon não conseguiu aplicar.
 *
 * Fora do `conversation-model.ts` porque ele está no teto de linhas do mapa da
 * regra 8, e o mapa só encolhe: a segunda frase (`034` T9) só coube tirando a
 * primeira de lá.
 */
export function unavailableText(
  event: Extract<AcpEvent, { type: "model_unavailable" | "account_default_unavailable" }>,
): string {
  if (event.type === "account_default_unavailable") {
    return `o modelo padrão da conta — ${event.requested} — não está mais na lista; abriu em ${event.got}`;
  }
  // Qual modelo sumiu e em qual a conversa seguiu — as duas metades da F6.2. Um
  // agente que não relata modelo deixaria "continuou em " sem nada depois.
  const where = event.current === "" ? "no modelo padrão dele" : `em ${event.current}`;
  return `o modelo ${event.model} não existe mais neste agente — a conversa continuou ${where}`;
}
