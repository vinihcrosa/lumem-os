import { MEMORY_SCOPES, MEMORY_TYPES } from "./entry.js";

/**
 * A camada 2 do context-delivery: **ensina a perguntar**, não diz o que existe.
 *
 * A diferença é o desenho inteiro. Um índice de memórias custaria uma linha por
 * memória — cem memórias, cem linhas em todo turno de toda sessão. Isto custa o
 * mesmo com um acervo de dez ou de dez mil: o que entra no prompt é **uma porta
 * e a instrução de como usá-la**.
 *
 * Por isso nada aqui enumera acervo. Os projetos do workspace entram (é mapa, e
 * cresce com o workspace, não com o que ele aprendeu); nome de memória, nunca.
 * O §5.1 chama isso de anticorpo contra o efeito colateral bom que o índice
 * tinha — o agente ver que a informação existe. Os outros dois anticorpos são a
 * diretiva do núcleo, que garante que ele saiba que a porta existe, e a medida
 * de chamadas por sessão, que diz se ela está sendo usada.
 */

export interface MemorySkillContext {
  /** O endereço que responde pergunta. Vem do daemon, que sabe a porta dele. */
  askUrl: string;
  /** A sessão que pergunta — é o que dá escopo à resposta e registra o uso. */
  sessionId: string;
  /** Os projetos deste workspace, por nome. Mapa, não lista de memórias. */
  projects: readonly string[];
}

/**
 * A diretiva mínima — o item 2 do §5.1, e o único que **não** é opcional.
 *
 * Em CLI de agente, skill costuma entrar no prompt como nome e descrição curta,
 * com o corpo carregado sob demanda. Se a descoberta dependesse da skill ser
 * lida, ela dependeria de ser descoberta — recursivo. Isto é o que quebra a
 * recursão: comportamento, no núcleo, sempre.
 */
export const MEMORY_DIRECTIVE = `Este workspace tem memória. Consultá-la é obrigatório antes de:
supor contrato, convenção ou decisão de outro projeto; repetir uma decisão de
arquitetura que já pode ter sido tomada; e antes de afirmar "aqui se faz assim".
Não sabe se existe memória sobre algo? Pergunte — custa uma chamada.`;

/** O texto fixo que ensina a estrutura da memória e como chamar o serviço. */
export function memorySkill({ askUrl, sessionId, projects }: MemorySkillContext): string {
  const lines = [
    "## Como consultar a memória",
    "",
    "Uma pergunta em português, e a resposta cita as memórias que a sustentam:",
    "",
    "```sh",
    `curl -sG '${askUrl}' --data-urlencode 'q=<sua pergunta>' -d 'session=${sessionId}'`,
    "```",
    "",
    "O que a memória guarda, por **tipo**:",
    "",
    `- ${MEMORY_TYPES.join(", ")}`,
    "",
    `E por **escopo**, do geral para o específico: ${MEMORY_SCOPES.join(" → ")}.`,
    " Quando dois escopos falam da mesma coisa, vale o mais específico — o outro",
    " continua no disco e não é usado.",
  ];

  // Mapa, não lista: sem isto o agente não pergunta sobre o que não imagina que
  // exista, e é o buraco que o §5.1 nomeia. Cresce com o workspace — um número
  // que não muda por sessão —, nunca com o acervo.
  if (projects.length > 0) {
    lines.push("", `Projetos deste workspace: ${projects.join(", ")}.`);
  }

  lines.push(
    "",
    "Perguntas que vale a pena fazer:",
    "",
    '- "como este workspace faz commit?"',
    '- "o projeto X expõe algum contrato que eu preciso respeitar?"',
    '- "já decidimos algo sobre autenticação?"',
    '- "que preferência de revisão eu devo seguir?"',
    "",
    'Resposta "não sei" é informação: significa que o acervo tem buraco ali, e',
    "vale registrar o que você descobriu.",
  );

  return `${lines.join("\n")}\n`;
}
