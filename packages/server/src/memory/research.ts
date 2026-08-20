import { z } from "zod";

import { MEMORY_TYPES } from "./entry.js";

/**
 * O auto-learn: a pergunta que a memória não sabe sobe um agente.
 *
 * A capacidade que nenhuma das quatro referências tem, e a mais perigosa desta
 * feature — o §5.2 do context-delivery chama de *"escrita automática vestida de
 * leitura"*. Este arquivo é a metade que **pergunta**; quem decide o que fazer
 * com a resposta é o `evidence.ts`, e quem grava é o `MemoryService`, pelo mesmo
 * portão de sempre.
 *
 * Três contenções do §5.4 vivem aqui:
 *
 * - **profundidade 1**: o agente de pesquisa não recebe a skill de memória e não
 *   pode chamar o `lumem-memory`. Sem isso existe loop — uma pergunta que sobe um
 *   agente que faz a mesma pergunta;
 * - **timeout**: a sessão principal está esperando. Uma pergunta que sobe agente
 *   não pode demorar o que um agente demora;
 * - **degradação que diz que degradou**: estourou, falhou, ou respondeu fora do
 *   formato → cai para o que já existia, e o texto conta.
 */

const candidateSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().min(1).max(4_000),
  /**
   * Separada do corpo de propósito: é ela que decide memória direta × proposta
   * (D7), e evidência embutida na prosa não dá para classificar.
   */
  evidence: z.string().max(500).optional(),
});

export type ResearchCandidate = z.infer<typeof candidateSchema>;

const answerSchema = z.object({
  /** A resposta em texto, para a pessoa — ou para o agente que perguntou. */
  answer: z.string().min(1).max(4_000),
  /** O que vale guardar. Vazio é resposta legítima: nem tudo é durável. */
  memories: z.array(candidateSchema).max(3).default([]),
});

export type ResearchAnswer = z.infer<typeof answerSchema>;

/** Quem responde. Um agente, na produção; uma função, no teste. */
export type Researcher = (prompt: string) => Promise<string>;

export interface ResearchResult {
  answer: ResearchAnswer | null;
  /** Por que não veio nada. `null` quando veio. */
  degraded: "timeout" | "failed" | "unparseable" | null;
}

export interface ResearchOptions {
  question: string;
  ask: Researcher;
  timeoutMs?: number;
  log?: { warn: (object: object, message: string) => void };
}

export const DEFAULT_RESEARCH_TIMEOUT_MS = 45_000;

export async function research({
  question,
  ask,
  timeoutMs = DEFAULT_RESEARCH_TIMEOUT_MS,
  log,
}: ResearchOptions): Promise<ResearchResult> {
  let raw: string;
  try {
    raw = await withTimeout(ask(promptFor(question)), timeoutMs);
  } catch (error) {
    const degraded = error instanceof ResearchTimeout ? "timeout" : "failed";
    log?.warn({ err: error, question }, `auto-learn degradou: ${degraded}`);
    return { answer: null, degraded };
  }

  const parsed = parse(raw);
  if (parsed === null) {
    log?.warn({ question }, "auto-learn respondeu fora do formato");
    return { answer: null, degraded: "unparseable" };
  }
  return { answer: parsed, degraded: null };
}

class ResearchTimeout extends Error {}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ResearchTimeout(`estourou ${String(ms)}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** O JSON dentro da resposta. A mesma tolerância à embalagem do destilador. */
function parse(raw: string): ResearchAnswer | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const result = answerSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * O que o agente de pesquisa é perguntado.
 *
 * A instrução sobre **evidência** é a parte que mais muda o resultado: sem ela o
 * agente responde bem e não diz de onde tirou, e aí tudo vira proposta — o
 * auto-learn continua correto e para de ser útil.
 */
function promptFor(question: string): string {
  return [
    "Você é o serviço de memória de um workspace, respondendo uma pergunta que o",
    "acervo não sabia responder.",
    "",
    `Pergunta: ${question}`,
    "",
    "Investigue no código e nos arquivos do projeto em que você está. Responda em",
    "português, e **cite de onde tirou**: caminho de arquivo com linha, ou comando",
    "com a saída dele. Se você não conseguir apontar a origem, diga isso — uma",
    "conclusão sem fonte é uma conclusão, e vai para revisão em vez de valer.",
    "",
    "Não invente. Se a resposta não está no que você pode ler, responda que não sabe.",
    "",
    "Responda só com JSON:",
    '{"answer": "a resposta em texto", "memories": [{"type": "project", "name": "...",',
    '  "description": "...", "body": "...", "evidence": "arquivo.ts:42"}]}',
    "",
    "Em `memories`, só o que é **durável** — o que vale para a próxima sessão. Uma",
    "resposta útil agora e irrelevante amanhã tem `memories` vazio.",
    "",
    `Tipos possíveis: ${MEMORY_TYPES.join(", ")}.`,
  ].join("\n");
}
