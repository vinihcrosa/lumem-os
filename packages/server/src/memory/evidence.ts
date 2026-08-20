/**
 * O critério que separa **fato** de **conclusão** (D7).
 *
 * A pergunta que a D7 respondeu: auto-learn escreve direto ou propõe? A resposta
 * não é sobre o assunto — *"puramente técnica"* e *"abstrata"* são categorias que
 * o daemon não consegue aplicar sem chutar. É sobre a **evidência**:
 *
 * > Se o agente consegue apontar de onde tirou, é fato; se ele conseguiu apenas
 * > concluir, é proposta.
 *
 * O critério carrega um bônus: uma memória direta errada fica **fácil de
 * contestar depois**, porque o caminho está anexado nela.
 */

/** Um caminho com linha: `src/lore/loader.ts:42`. */
const FILE_WITH_LINE = /(^|\s)[\w./-]+\.[a-z]{1,8}:\d+/i;
/** Um comando com saída, na forma que o agente escreve: `$ pnpm x → y`. */
const COMMAND_WITH_OUTPUT = /(^|\s)(?:\$|>)\s*\S+.*(?:→|->|=>|\n)/;
/**
 * As palavras de quem **concluiu** em vez de ler.
 *
 * Recusar por palavra é grosseiro, e é de propósito: o custo de tratar um fato
 * como proposta é uma revisão sua; o de tratar uma conclusão como fato é uma
 * invenção que N projetos herdam.
 */
const HEDGING = /\b(conclu[íi]|provavelmente|acredito|imagino|deve ser|talvez|parece que|suponho)\b/i;

export type EvidenceVerdict = "verifiable" | "inference";

/**
 * A evidência sustenta a resposta, ou é só o agente falando?
 *
 * Vazio é `inference`: ausência de evidência não é evidência de nada, e o lado
 * seguro de "não sei dizer" é a inbox.
 */
export function classifyEvidence(evidence: string | undefined): EvidenceVerdict {
  const text = (evidence ?? "").trim();
  if (text === "") return "inference";
  if (HEDGING.test(text)) return "inference";
  return FILE_WITH_LINE.test(text) || COMMAND_WITH_OUTPUT.test(text) ? "verifiable" : "inference";
}

export interface RouteInput {
  scope: "global" | "workspace" | "project";
  evidence?: string;
}

export type Route = "direct" | "proposal";

/**
 * Onde a memória auto-criada entra: no acervo, ou na inbox.
 *
 * **Workspace é proposta sempre** (Q27), com evidência ou sem — errar ali
 * contamina N projetos, e ninguém revisou. `global` é você, e nada automático
 * escreve sobre você sem passar por você.
 */
export function routeFor({ scope, evidence }: RouteInput): Route {
  if (scope !== "project") return "proposal";
  return classifyEvidence(evidence) === "verifiable" ? "direct" : "proposal";
}

/**
 * A marca de "ninguém conferiu isto ainda" (§5.2).
 *
 * Vai no **corpo** e não só numa coluna, porque é o corpo que o agente lê: uma
 * memória auto-criada que chegasse no núcleo ou numa resposta sem essa linha
 * seria indistinguível de uma que você escreveu.
 */
export const UNVERIFIED_MARK = "> Criada automaticamente e **não verificada**.";

export function markUnverified(body: string, evidence: string | undefined): string {
  const source = evidence === undefined || evidence.trim() === "" ? "" : ` Evidência: ${evidence.trim()}`;
  return `${UNVERIFIED_MARK}${source}\n\n${body.trim()}\n`;
}
