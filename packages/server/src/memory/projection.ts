import { relative, isAbsolute } from "node:path";

import type { AcpTranscriptEntry } from "@lumem/shared";

/**
 * O que uma sessão **fez**, sem o que ela **disse**.
 *
 * A projeção é o que a destilação lê, e o §10 do PRD é quem desenha o formato
 * pela negativa: *"dump de transcript"* está na lista do que **nunca** é
 * capturado, junto de segredo, estado efêmero e histórico do git. Então prosa
 * não entra — nem a mensagem da pessoa, nem o texto do agente, nem o raciocínio.
 *
 * Fica o que é estrutura: quais arquivos foram tocados, quais comandos rodaram,
 * quantos turnos houve, como terminaram e o que custou. É pouco, e é de propósito
 * — uma projeção que crescesse com a sessão faria a destilação ficar caríssima
 * sem ninguém ter decidido isso.
 */

/** Teto duro. Os mais frequentes, e o resto vira uma contagem. */
const MAX_FILES = 12;
const MAX_COMMANDS = 8;

export interface SessionProjection {
  /** Arquivos tocados, relativos ao checkout, do mais tocado para o menos. */
  files: readonly { path: string; touches: number }[];
  /** Quantos arquivos ficaram fora do teto. Zero quando cabe tudo. */
  filesOmitted: number;
  /** Comandos executados, pelo título da chamada — nunca a saída deles. */
  commands: readonly string[];
  commandsOmitted: number;
  turns: number;
  /** Como os turnos terminaram, contados por motivo. */
  stopReasons: Readonly<Record<string, number>>;
  /** O último `usage` da sessão: é ele que diz o custo acumulado. */
  tokens: number | null;
}

export const EMPTY_PROJECTION: SessionProjection = {
  files: [],
  filesOmitted: 0,
  commands: [],
  commandsOmitted: 0,
  turns: 0,
  stopReasons: {},
  tokens: null,
};

/** Uma projeção sem nada dentro não tem o que ensinar. */
export function isEmpty(projection: SessionProjection): boolean {
  return projection.files.length === 0 && projection.commands.length === 0;
}

export interface ProjectOptions {
  /** O checkout da sessão, para o caminho sair relativo. */
  cwd: string;
}

export function projectSession(
  entries: readonly AcpTranscriptEntry[],
  { cwd }: ProjectOptions,
): SessionProjection {
  const touches = new Map<string, number>();
  const commands = new Set<string>();
  const stopReasons: Record<string, number> = {};
  let turns = 0;
  let tokens: number | null = null;

  for (const { event } of entries) {
    switch (event.type) {
      case "tool_call":
      case "tool_call_update": {
        for (const location of event.locations ?? []) {
          const path = toRelative(location.path, cwd);
          if (path === null) continue;
          touches.set(path, (touches.get(path) ?? 0) + 1);
        }
        // O título de uma execução é o comando, e é o que o desenho já mostra na
        // tela. A **saída** dele não entra: é lá que segredo aparece.
        if (event.type === "tool_call" && event.kind === "execute") commands.add(event.title);
        break;
      }

      case "turn_end":
        turns += 1;
        stopReasons[event.stopReason] = (stopReasons[event.stopReason] ?? 0) + 1;
        break;

      case "usage":
        // O último, e não a soma: o `usage` do ACP é acumulado por sessão, então
        // somar contaria cada turno de novo.
        tokens = event.used;
        break;

      default:
        // Todo o resto é prosa, ou é estado de tela. Nenhum dos dois ensina nada
        // que sobreviva à sessão, e o `message` é justamente o que o §10 proíbe.
        break;
    }
  }

  const ranked = [...touches.entries()]
    .map(([path, count]) => ({ path, touches: count }))
    // Empate pelo nome, para a projeção da mesma sessão ser sempre a mesma — uma
    // destilação que muda de ordem entre execuções é impossível de conferir.
    .sort((a, b) => b.touches - a.touches || a.path.localeCompare(b.path));
  const listed = [...commands].sort();

  return {
    files: ranked.slice(0, MAX_FILES),
    filesOmitted: Math.max(0, ranked.length - MAX_FILES),
    commands: listed.slice(0, MAX_COMMANDS),
    commandsOmitted: Math.max(0, listed.length - MAX_COMMANDS),
    turns,
    stopReasons,
    tokens,
  };
}

/**
 * O caminho relativo ao checkout, ou `null` quando ele está fora.
 *
 * Absoluto carrega o nome da máquina e da pessoa — `/Users/alguem/...` —, e isso
 * ia parar num arquivo Markdown versionado. Fora do checkout é descartado, e não
 * consertado: o agente lendo `/etc/hosts` não é conhecimento sobre o projeto.
 */
function toRelative(path: string, cwd: string): string | null {
  if (!isAbsolute(path)) return path;
  const rel = relative(cwd, path);
  if (rel === "" || rel.startsWith("..")) return null;
  return rel;
}
