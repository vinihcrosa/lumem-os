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
  /**
   * A porta de tarefas, e o teto dela (`022-workspace-tasks` F3, T14).
   *
   * Ausente enquanto a feature não está de pé — e é assim que o parágrafo custa
   * **zero** caractere para quem não a tem.
   */
  tasks?: { url: string; budget: number };
  /**
   * A porta do parecer, e ela só existe para o **revisor** (`028` Parte 7 — T53).
   *
   * Ausente em toda conversa que não é um turno de revisão — e é assim que o
   * parágrafo custa **zero** caractere para as outras, que são a maioria.
   *
   * Ela mora aqui, e não no `promptFor` da esteira, porque exige o id da sessão:
   * aquele arquivo é função pura sobre fato e é montado **antes** de a sessão
   * existir. Este é injetado quando ela já existe.
   */
  review?: { url: string };
  /**
   * O acervo tem alguma coisa.
   *
   * `false` só acontece num caso: um turno de revisão num workspace que ainda
   * não aprendeu nada (`028` Parte 7). Aí o bloco de memória sai inteiro — ele
   * ensina a consultar um acervo vazio —, e o que fica é a porta do parecer.
   */
  hasMemory?: boolean;
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
export function memorySkill({
  askUrl,
  sessionId,
  projects,
  tasks,
  review,
  hasMemory = true,
}: MemorySkillContext): string {
  const lines = hasMemory
    ? [
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
      ]
    : [];

  // Mapa, não lista: sem isto o agente não pergunta sobre o que não imagina que
  // exista, e é o buraco que o §5.1 nomeia. Cresce com o workspace — um número
  // que não muda por sessão —, nunca com o acervo.
  if (projects.length > 0) {
    lines.push("", `Projetos deste workspace: ${projects.join(", ")}.`);
  }

  /*
   * A porta de tarefas — **um** parágrafo, como o §F3 pede.
   *
   * Ele diz o teto junto, e isso não é enfeite: um agente que não sabe do
   * orçamento gasta um turno descobrindo que ele existe, e a recusa chega como
   * surpresa no meio de um trabalho.
   *
   * E diz a regra do §3.2 em uma frase — **escrever para cima é proposta** —,
   * porque um agente que acha que criou trabalho no outro projeto vai agir como
   * se tivesse criado.
   */
  if (tasks !== undefined) {
    lines.push(
      "",
      "## Como registrar uma tarefa",
      "",
      "Achou trabalho que não é o seu — outro projeto precisa mudar, ou algo que",
      "não cabe neste turno:",
      "",
      "```sh",
      `curl -sX POST '${tasks.url}?session=${sessionId}' \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '{"title":"<uma frase>","project":"<nome do projeto>","body":"<contexto>"}'`,
      "```",
      "",
      "No projeto em que você está, ela entra aberta; em **outro**, entra como",
      "proposta e espera uma pessoa — escrever para cima é proposta.",
      `Teto: ${String(tasks.budget)} por tarefa. Estourou, diga na conversa o que falta.`,
      "",
      `Terminou? \`POST ${tasks.url}/<id>/review\` — \`review\` é o que você sabe`,
      "dizer; `done` é de uma pessoa.",
    );
  }

  /*
   * O parecer do revisor, em **dois baldes** (Parte 7 — Q67).
   *
   * O texto diz o motivo da divisão, e não só a sintaxe: o que separa os dois
   * não é a importância do achado, é **quem consegue resolver a discussão**. Um
   * agente que entende isso escolhe o balde melhor que um que decorou o formato.
   *
   * E diz **"mesmo que seja nada"** logo na primeira linha, porque o relato que
   * originou esta parte é literal: *"toda vez que você pede um review para um
   * agente, ele vai achar alguma coisa"*. Um parecer vazio precisa ser uma
   * resposta óbvia, senão ele nunca acontece.
   */
  if (review !== undefined) {
    lines.push(
      "",
      "## Como entregar o parecer da revisão",
      "",
      "Poste o que você achou — **mesmo que seja nada**:",
      "",
      "```sh",
      `curl -sX POST '${review.url}?session=${sessionId}' \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '{"findings":[]}'`,
      "```",
      "",
      "Cada achado vai num de **dois baldes**, e o que os separa não é a",
      "importância — é **quem consegue resolver a discussão**:",
      "",
      "- **`blocks`** — o daemon **vai rodar** o `command` que você mandar. Reproduziu o que você",
      "  disse, a tarefa volta para o implementador; não reproduziu, o achado cai e fica",
      "  registrado que você afirmou o que não se sustenta. Leva `command` e, quando ajudar,",
      "  `expected` (um trecho da saída). **Sem comando, não use este balde.**",
      "- **`notes`** — julgamento: princípio de arquitetura, convenção do repositório, nome ruim.",
      "  **Não segura a tarefa**, não leva comando, e vai para a pull request — onde uma pessoa lê",
      "  antes de mesclar.",
      "",
      "```json",
      '{"findings":[',
      '  {"bucket":"blocks","title":"o teste da linha 194 sobrevive à mutação",',
      '   "command":"pnpm vitest run scripts","expected":"19 passed"},',
      '  {"bucket":"notes","title":"o runner ficou 3x maior que os irmãos"}',
      "]}",
      "```",
      "",
      "**Ache quanto quiser** — o que não for reproduzível vai para a pull request em vez de",
      "travar a esteira. O que não vale é pôr em `blocks` o que você não consegue demonstrar.",
    );
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
