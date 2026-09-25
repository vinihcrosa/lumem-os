/**
 * O nome de uma worktree, tirado do prompt que a cria (`033` F4.2, §3.3).
 *
 * Aqui, e não no daemon, porque a tela mostra a prévia antes do `Create` — e a
 * prévia calculada por outra função seria um nome que mente na primeira vez que
 * as duas divergirem. Local e sem IA: o nome é editável, e o que ele precisa é
 * ser reconhecível, não bonito.
 *
 * **Pura**, e por isso sem o sufixo de colisão: saber que `corrigir-login` já
 * existe é pergunta ao banco e ao git, e quem pode perguntar é o daemon.
 */

/** O nome quando o prompt não tem uma letra aproveitável — só emoji, só pontuação. */
export const WORKTREE_NAME_FALLBACK = "worktree";

const MAX_WORDS = 6;
const MAX_LENGTH = 48;

export function worktreeNameFromPrompt(prompt: string): string {
  const words = prompt
    // `ç` → `c` + cedilha, e a cedilha sai: tirar o acento, e não a letra.
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");

  const name = words
    .slice(0, MAX_WORDS)
    .join("-")
    .slice(0, MAX_LENGTH)
    // O corte pode cair logo depois de um hífen, e `corrigir-o-` é um nome que
    // parece ter perdido um pedaço.
    .replace(/-+$/, "");

  return name === "" ? WORKTREE_NAME_FALLBACK : name;
}
