import { z } from "zod";

import { MEMORY_TYPES } from "./entry.js";
import { isEmpty, type SessionProjection } from "./projection.js";

/**
 * De uma sessão que terminou para candidatos de memória — uma chamada, e só.
 *
 * O §10 do PRD escolheu isto entre quatro formas de capturar: *"um passo de
 * destilação com modelo barato sobre uma projeção limitada"*, *"uma chamada por
 * sessão, não por turno"*, *"desligado por padrão até o portão provar que
 * segura"*. As três restrições estão aqui, e a terceira mora na configuração.
 *
 * O que **não** está aqui, de propósito: nenhum caminho de escrita próprio. O
 * candidato sai daqui e entra no `MemoryService.write` como qualquer outro, com
 * ator `distiller` — e a Q27 então manda `domain`, `process` e `contract` em
 * escopo de workspace para a inbox. Uma destilação que gravasse direto seria a
 * porta dos fundos do portão que esta feature inteira existe para ter.
 */

/**
 * O que o destilador aceita de volta.
 *
 * Estruturado, ou descartado. Texto livre viraria memória sem tipo e sem nome —
 * e o acervo é indexado por `(tipo, slug)`, então "quase uma memória" é uma
 * memória que nenhuma busca acha e nenhuma precedência resolve.
 */
const candidateSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().min(1).max(4_000),
  /** O artefato que sustenta — arquivo, linha, comando. Vazio é aceitável. */
  evidence: z.string().max(500).optional(),
});

export type MemoryCandidate = z.infer<typeof candidateSchema>;

const responseSchema = z.object({ memories: z.array(candidateSchema).max(5) });

/** Quem responde a pergunta. Um agente, na produção; uma função, no teste. */
export type Distiller = (prompt: string) => Promise<string>;

export interface DistillResult {
  candidates: readonly MemoryCandidate[];
  /** Por que não veio nada, quando não veio. Silêncio viraria "não aprendeu". */
  skipped: "disabled" | "nothing_happened" | "no_answer" | "unparseable" | null;
}

export interface DistillOptions {
  enabled: boolean;
  projection: SessionProjection;
  ask: Distiller;
  log?: { warn: (object: object, message: string) => void };
}

export async function distill({
  enabled,
  projection,
  ask,
  log,
}: DistillOptions): Promise<DistillResult> {
  if (!enabled) return { candidates: [], skipped: "disabled" };
  // Sessão que não tocou arquivo nem rodou comando não tem o que ensinar, e
  // subir um agente para descobrir isso custaria os ~39k tokens de prompt de
  // sistema que o spike mediu — para receber uma lista vazia.
  if (isEmpty(projection)) return { candidates: [], skipped: "nothing_happened" };

  let answer: string;
  try {
    answer = await ask(promptFor(projection));
  } catch (error) {
    log?.warn({ err: error }, "a destilação não pôde subir um agente");
    return { candidates: [], skipped: "no_answer" };
  }

  const parsed = parseAnswer(answer);
  if (parsed === null) {
    log?.warn({ answer: answer.slice(0, 200) }, "a destilação respondeu fora do formato");
    return { candidates: [], skipped: "unparseable" };
  }
  return { candidates: parsed, skipped: null };
}

/**
 * O JSON dentro da resposta, ou `null`.
 *
 * Agente costuma embrulhar JSON em cerca de código e escrever uma frase antes.
 * Recusar isso seria recusar a resposta certa por causa da embalagem; aceitar
 * qualquer coisa seria gravar prosa como memória. O meio é procurar o primeiro
 * objeto e **validar** o que ele contém.
 */
function parseAnswer(answer: string): readonly MemoryCandidate[] | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let json: unknown;
  try {
    json = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }

  const result = responseSchema.safeParse(json);
  return result.success ? result.data.memories : null;
}

/**
 * O que o agente é perguntado.
 *
 * O teste de fronteira do §4.1 do context-delivery vai no prompt, porque é onde
 * ele muda o resultado: sem ele o destilador produz documentação — "o loader lê
 * o frontmatter" —, que é exatamente o que **não** deve virar memória.
 */
function promptFor(projection: SessionProjection): string {
  const files = projection.files.map((file) => `- ${file.path} (${file.touches}×)`).join("\n");
  const commands = projection.commands.map((command) => `- ${command}`).join("\n");

  return [
    "Uma sessão de trabalho terminou. Abaixo está o que ela fez — só estrutura,",
    "nenhum texto da conversa.",
    "",
    "Arquivos tocados:",
    files === "" ? "- nenhum" : files,
    projection.filesOmitted > 0 ? `- (e mais ${String(projection.filesOmitted)})` : "",
    "",
    "Comandos:",
    commands === "" ? "- nenhum" : commands,
    "",
    `Turnos: ${String(projection.turns)}.`,
    "",
    "Existe aqui algum conhecimento **durável** sobre este projeto ou este",
    "workspace? O critério é um só: entra o que muda o que alguém **faz** na",
    "próxima vez; não entra o que apenas **explica** como algo funciona, nem o",
    "que o repositório já diz por si (estrutura de diretório, convenção óbvia,",
    "histórico do git).",
    "",
    "Se não houver nada, responda exatamente:",
    '{"memories": []}',
    "",
    "Se houver, responda só com JSON neste formato:",
    '{"memories": [{"type": "process", "name": "...", "description": "...", "body": "...", "evidence": "arquivo:linha"}]}',
    "",
    `Tipos possíveis: ${MEMORY_TYPES.join(", ")}.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
