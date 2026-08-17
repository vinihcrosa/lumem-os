import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { DomainError } from "../errors.js";

/**
 * O formato de uma memória em disco: Markdown com frontmatter estrito.
 *
 * Markdown é a fonte da verdade (Q3 e Q50 do projeto) — o banco é projeção, e
 * `reindex` o refaz. Isso só se sustenta se o arquivo for **legível e editável
 * à mão**, e é por isso que o frontmatter é YAML de verdade, com um parser de
 * verdade: o usuário vai abrir isto no editor dele, e um parser caseiro
 * quebraria na primeira aspa fora do lugar.
 *
 * A validação é a fronteira: tipo fora da taxonomia é **erro**, não campo
 * livre. É o que dá ao sistema o direito de decidir escopo sozinho (Q4).
 */

/** A taxonomia fechada da Q4. Acrescentar é barato; virar texto livre não tem volta. */
export const MEMORY_TYPES = [
  "user",
  "feedback",
  "project",
  "domain",
  "process",
  "contract",
  "reference",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * `global` é "você" — o que atravessa workspace.
 *
 * O nome não é `user` de propósito: `user` já é um **tipo** de memória, e um
 * eixo que empresta o nome do outro é o começo de toda confusão de escopo.
 */
export const MEMORY_SCOPES = ["global", "workspace", "project"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/**
 * O escopo que cada tipo assume quando ninguém diz.
 *
 * Existe porque escolher escopo é a decisão que o agente mais erra (§6 do PRD).
 * `contract` é workspace por definição: ele é um fato **entre** dois projetos.
 */
export const DEFAULT_SCOPE_FOR_TYPE: Readonly<Record<MemoryType, MemoryScope>> = {
  user: "global",
  feedback: "global",
  project: "project",
  domain: "workspace",
  process: "workspace",
  contract: "workspace",
  reference: "project",
};

/** Quem escreveu. `auto_research` é o auto-learn, e nasce com confiança baixa. */
export const MEMORY_ACTORS = ["human", "agent", "distiller", "auto_research", "import"] as const;
export type MemoryActor = (typeof MEMORY_ACTORS)[number];

const provenanceSchema = z.object({
  source_actor: z.enum(MEMORY_ACTORS),
  /** Sessões que originaram. Vazio quando a origem é humana e direta. */
  source_sessions: z.array(z.string()).default([]),
  /** De onde veio, quando veio de trabalho: worktree é origem, nunca escopo (Q5). */
  project_id: z.string().optional(),
  worktree_id: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  /** O que o auto-learn leu para concluir. Obrigatório para ele, opcional para o resto (D7). */
  evidence: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Preenchido quando outra memória substituiu esta. */
  superseded_by: z.string().optional(),
});

const frontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(MEMORY_TYPES),
  scope: z.enum(MEMORY_SCOPES),
  provenance: provenanceSchema,
});

export type MemoryProvenance = z.infer<typeof provenanceSchema>;
export type MemoryFrontmatter = z.infer<typeof frontmatterSchema>;

export interface MemoryEntry extends MemoryFrontmatter {
  /** O corpo em Markdown, sem o frontmatter e sem a linha em branco que o segue. */
  body: string;
}

const FENCE = "---";

/**
 * Nome de arquivo a partir da identidade `(tipo, slug)`.
 *
 * A identidade é o par, decidido na Q12 — substituir uma memória é substituir o
 * corpo inteiro de um arquivo com nome estável, não casar substring dentro dele.
 */
export function entryFilename(type: MemoryType, slug: string): string {
  return `${type}_${slug}.md`;
}

/**
 * Slug a partir do nome humano.
 *
 * Sem acento, sem símbolo, sem caminho: este valor vira **nome de arquivo**, e
 * uma barra aqui seria um diretório que ninguém pediu.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (slug === "") {
    throw new DomainError("INVALID_ARGUMENT", `nome não produz slug utilizável: ${JSON.stringify(name)}`);
  }
  return slug;
}

/** O texto exato que vai para o disco. */
export function serializeEntry(entry: MemoryEntry): string {
  const { body, ...frontmatter } = entry;
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const text = body.trimEnd();
  return `${FENCE}\n${yaml}\n${FENCE}\n\n${text === "" ? "" : `${text}\n`}`;
}

/**
 * Lê o que está no disco, ou diz por que não é uma memória.
 *
 * Falha **nomeada**, nunca memória vazia: um frontmatter corrompido que virasse
 * `{}` sumiria do índice sem ninguém saber, e o `reindex` — que é o que promete
 * reconstruir tudo — passaria por cima em silêncio.
 */
export function parseEntry(text: string, source = "memória"): MemoryEntry {
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: falta o frontmatter`);
  }

  const end = text.indexOf(`\n${FENCE}`, FENCE.length);
  if (end === -1) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: frontmatter não foi fechado`);
  }

  const raw = text.slice(FENCE.length + 1, end + 1);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: frontmatter não é YAML válido`, {
      cause: error,
    });
  }

  const result = frontmatterSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "?";
    throw new DomainError("INVALID_ARGUMENT", `${source}: ${path} — ${issue?.message ?? "inválido"}`);
  }

  const body = text.slice(end + FENCE.length + 1).replace(/^\n+/, "");
  return { ...result.data, body: body.trimEnd() };
}

/** O escopo pedido, ou o default do tipo. */
export function resolveScope(type: MemoryType, scope?: MemoryScope): MemoryScope {
  return scope ?? DEFAULT_SCOPE_FOR_TYPE[type];
}
