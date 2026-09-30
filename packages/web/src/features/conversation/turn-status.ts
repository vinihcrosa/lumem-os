import type { ConversationState, ToolCallView } from "./conversation-model.js";

/**
 * O que a linha de estado do turno escreve (`037` S3), puro.
 *
 * Fora do componente pelo mesmo motivo do `turn-close-text.ts`: a frase é o que
 * se testa, e um componente só a desenha. O relógio entra como número — quem lê
 * `Date.now` é o `useNow`, e só ele.
 */

/** O que o agente está fazendo, lido do último bloco dele no turno em voo. */
export type TurnActivity =
  | { kind: "starting" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "waiting" }
  /** A chamada inteira, e não só o título: `startedAt` é de onde o tempo dela se mede. */
  | { kind: "tool"; call: ToolCallView };

/**
 * Só os blocos do agente **deste** turno — os que vêm depois da última mensagem
 * do usuário. A resposta do turno passado é do agente também, e lê-la aqui
 * diria `escrevendo` num turno que ainda não mandou nada.
 */
export function turnActivity(conversation: Pick<ConversationState, "turns" | "pendingPermission">): TurnActivity {
  if (conversation.pendingPermission !== null) return { kind: "waiting" };

  for (let index = conversation.turns.length - 1; index >= 0; index -= 1) {
    const turn = conversation.turns[index]!;
    if (turn.role === "user") break;
    if (turn.role !== "agent") continue;
    for (let blockIndex = turn.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const activity = activityOf(turn.blocks[blockIndex]!);
      if (activity !== null) return activity;
    }
  }
  return { kind: "starting" };
}

/** Null para o que não é o agente trabalhando — a linha do daemon, o evento sem nome. */
function activityOf(block: ConversationState["turns"][number]["blocks"][number]): TurnActivity | null {
  switch (block.kind) {
    case "thought":
      return { kind: "thinking" };
    case "message":
      return { kind: "writing" };
    case "permission":
      return { kind: "waiting" };
    case "tool":
      // Terminada, a ferramenta devolveu a vez ao agente, e o que ele faz com o
      // resultado é pensar — até o próximo bloco dizer outra coisa.
      return block.call.status === "pending" || block.call.status === "running"
        ? { kind: "tool", call: block.call }
        : { kind: "thinking" };
    default:
      return null;
  }
}

export function activityText(activity: TurnActivity): string {
  switch (activity.kind) {
    case "starting":
      return "começando";
    case "thinking":
      return "pensando";
    case "writing":
      return "escrevendo";
    case "waiting":
      return "esperando sua resposta";
    case "tool":
      // Um verbo para toda ferramenta: o título já diz o que ela é (Assumptions).
      return `rodando ${activity.call.title}`;
  }
}

/**
 * Quanto tempo sem evento, com turno em voo, até a linha ficar âmbar (`037` Q1).
 *
 * Uma constante só, e no `web`: o silêncio é leitura da tela, nunca gravado, e
 * o número se reavalia depois de uma semana de uso — não em `/settings`.
 */
export const SILENCE_THRESHOLD_MS = 90_000;

/** O que a linha diz ao lado do tempo do turno, e em que tom. */
export interface TurnLine {
  tone: "normal" | "warning";
  doing: string;
}

/**
 * A linha do turno em `now` (`037` S4).
 *
 * Ferramenta aberta e permissão pendente nunca são silêncio: a primeira tem o
 * próprio relógio — medido do início dela, porque um comando longo que não
 * manda nada é o agente trabalhando —, e a segunda está esperando quem olha.
 */
export function turnLine(
  conversation: Pick<ConversationState, "turns" | "pendingPermission" | "lastEventAt">,
  now: number,
): TurnLine {
  const activity = turnActivity(conversation);
  if (activity.kind === "tool") {
    return { tone: "normal", doing: `${activityText(activity)} há ${formatElapsed(now - activity.call.startedAt)}` };
  }

  const quiet = conversation.lastEventAt === null ? 0 : now - conversation.lastEventAt;
  if (activity.kind !== "waiting" && quiet >= SILENCE_THRESHOLD_MS) {
    return { tone: "warning", doing: `sem sinal do agente há ${formatElapsed(quiet)}` };
  }
  return { tone: "normal", doing: activityText(activity) };
}

/**
 * `12 s`, `1 min 12 s`, `3 h 05 min`.
 *
 * Negativo vira `0 s`: o `at` é do daemon e o `now` é do navegador, e um relógio
 * local um pouco atrás não pode escrever tempo ao contrário.
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${String(seconds)} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ${String(seconds % 60)} s`;

  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, "0")} min`;
}
