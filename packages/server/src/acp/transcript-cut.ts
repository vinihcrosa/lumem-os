import type { AcpToolContent, AcpToolKind, AcpToolStatus, AcpTranscriptEntry } from "@lumem/shared";

/**
 * O corte que leva uma conversa para outra conta (`034` T11, Q3a).
 *
 * O adaptador novo não conhece a conversa da origem — é outro processo, com
 * outra credencial, e talvez outro agente —, então o Lumem entrega a dele: o
 * transcript em disco é **do Lumem**, e é por isso que o corte serve nos dois
 * sentidos (Claude → Codex e de volta).
 *
 * O que atravessa, e só isso:
 * - **`message`**, dos dois lados: tudo o que foi dito, com os pedaços de uma
 *   mesma mensagem (`messageId`) juntos;
 * - **`tool_call`** e **`tool_call_update`**: uma linha por ferramenta — título,
 *   tipo e estado da última atualização — e a saída dela, que acima de
 *   {@link TOOL_OUTPUT_LIMIT} caracteres vira `[<título> — N linhas, omitido]`.
 *   Os arquivos estão na worktree, e reler sai mais barato que carregar a cópia.
 *
 * O que fica, e por quê:
 * - `thought`: raciocínio de outro modelo, que o novo não pediu e paga para ler;
 * - `usage`, `config`, `commands`, `budget`, `model_unavailable`,
 *   `account_default_unavailable`: estado do adaptador de origem ou fala do
 *   daemon — nada disso é conversa, e parte disso não existe no outro agente;
 * - `plan` e `plan_removed`: o plano é do agente que o fez, e o novo refaz o dele;
 * - `permission_*` e `terminal`: o estado da ferramenta já diz o desfecho, e a
 *   saída do terminal mora no PTY, não aqui;
 * - `memory_core`: o bloco não está no transcript (só a contagem), e a sessão
 *   nova recebe o próprio núcleo no primeiro turno;
 * - `resumed`, `continued_in`, `continued_from`: linhas de navegação. A conversa
 *   anterior a um `resumed` já foi copiada para a frente do transcript (D15), e
 *   o que uma continuação levou é a primeira mensagem dela — atravessa como
 *   mensagem;
 * - `turn_end`, `unknown`: não têm texto.
 *
 * Nenhum campo específico de adaptador atravessa — nem o `name` programático da
 * ferramenta (`Read`, que o Claude manda e o Codex não), nem o `toolCallId`.
 */

/** A nota de 2026-09-26 da Q3a: por volta de 50 linhas de código. */
export const TOOL_OUTPUT_LIMIT = 2_000;

export interface TranscriptCut {
  text: string;
  /** Quantas mensagens — suas e do agente — atravessaram. */
  messages: number;
  /** Caracteres ÷ 4: a linha de vínculo diz uma ordem de grandeza, não uma conta. */
  approxTokens: number;
}

interface SpokenItem {
  kind: "message";
  role: "user" | "agent";
  text: string;
}

interface ToolItem {
  kind: "tool";
  title: string;
  toolKind: AcpToolKind;
  status: AcpToolStatus;
  content: readonly AcpToolContent[];
}

type Item = SpokenItem | ToolItem;

export function cutTranscript(entries: readonly AcpTranscriptEntry[]): TranscriptCut {
  const items = collect(entries);
  const spoken = items.filter((item): item is SpokenItem => item.kind === "message" && item.text.trim() !== "");
  const text = items
    .map(render)
    .filter((block) => block !== "")
    .join("\n\n");
  return { text, messages: spoken.length, approxTokens: Math.ceil(text.length / 4) };
}

function collect(entries: readonly AcpTranscriptEntry[]): Item[] {
  const items: Item[] = [];
  const messages = new Map<string, SpokenItem>();
  const tools = new Map<string, ToolItem>();

  for (const { event } of entries) {
    if (event.type === "message") {
      const known = messages.get(event.messageId);
      if (known) {
        known.text += event.text;
        continue;
      }
      const item: SpokenItem = { kind: "message", role: event.role, text: event.text };
      messages.set(event.messageId, item);
      items.push(item);
    } else if (event.type === "tool_call") {
      const item: ToolItem = {
        kind: "tool",
        title: event.title,
        toolKind: event.kind,
        status: event.status,
        content: [],
      };
      tools.set(event.toolCallId, item);
      items.push(item);
    } else if (event.type === "tool_call_update") {
      const item = tools.get(event.toolCallId);
      // Atualização de uma chamada que o transcript não anunciou: sem título,
      // não há linha que a registre.
      if (!item) continue;
      if (event.title) item.title = event.title;
      if (event.status) item.status = event.status;
      // Substitui, como o protocolo diz: a atualização traz o conteúdo inteiro.
      if (event.content) item.content = event.content;
    }
  }
  return items;
}

function render(item: Item): string {
  if (item.kind === "message") {
    if (item.text.trim() === "") return "";
    return `${item.role === "user" ? "[você]" : "[agente]"}\n${item.text}`;
  }

  const head = `[ferramenta] ${item.title} · ${item.toolKind} · ${item.status}`;
  const output = outputOf(item.content);
  if (output === "") return head;
  if (output.length > TOOL_OUTPUT_LIMIT) {
    return `${head}\n[${item.title} — ${String(output.split("\n").length)} linhas, omitido]`;
  }
  return `${head}\n${output}`;
}

/** A saída como texto: o que a ferramenta devolveu, e o arquivo novo de um diff. */
function outputOf(content: readonly AcpToolContent[]): string {
  return content
    .map((part) => {
      if (part.type === "content") return part.text;
      if (part.type === "diff") return `${part.path}\n${part.newText}`;
      // `terminal` só aponta para o PTY: a saída não está no transcript.
      return "";
    })
    .filter((text) => text !== "")
    .join("\n");
}
