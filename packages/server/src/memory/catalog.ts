import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { and, eq } from "drizzle-orm";

import { newId } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { memoryEntry, type MemoryEntryRow } from "../db/schema.js";

import { parseEntry, type MemoryEntry, type MemoryScope, type MemoryType } from "./entry.js";

/**
 * O catálogo: a projeção do que está no disco.
 *
 * A regra que este módulo existe para sustentar é a da Q3 — **Markdown é a
 * fonte da verdade, o banco é derivado**. Por isso `reindex` não faz merge nem
 * tenta ser esperto: ele varre o disco e **substitui** o catálogo. Um banco
 * apagado tem que voltar idêntico, e um arquivo editado à mão tem que aparecer
 * com o conteúdo novo.
 */

export interface CatalogLocation {
  scope: MemoryScope;
  /** `null` quando o escopo não tem workspace; vira `''` na linha (veja o schema). */
  workspaceId: string | null;
  projectId: string | null;
}

/**
 * A chave que o índice único do banco impõe — a identidade da Q12, dentro do
 * escopo em que ela vale.
 *
 * Ela é derivada exatamente como a linha do catálogo é montada (`identityFor`),
 * e isso não é detalhe: uma derivação paralela que discordasse do `rowFor`
 * deixaria a guarda passar e o índice recusar, que é o defeito que ela existe
 * para eliminar.
 */
export interface EntryIdentity {
  scope: string;
  workspaceId: string;
  projectId: string;
  type: string;
  slug: string;
}

export interface ReindexResult {
  /** Quantas memórias o disco tinha. */
  indexed: number;
  /** Arquivos que não puderam ser lidos, com o motivo. Nunca silêncio. */
  failures: readonly { path: string; reason: string }[];
}

export function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Reconstrói o catálogo inteiro a partir do disco.
 *
 * Substitui, não concilia: conciliação exigiria confiar no estado anterior, que
 * é justamente o que `reindex` existe para não fazer.
 */
export async function reindex(db: Db, stateDir: string): Promise<ReindexResult> {
  // Ordenado por caminho antes de qualquer coisa: `readdir` não promete ordem, e
  // um `reindex` que decide quem entra primeiro pela sorte do sistema de
  // arquivos não é determinístico — nem no id das linhas, nem em qual arquivo
  // ganha quando dois reivindicam a mesma identidade.
  const found = [...(await scanEntries(stateDir))].sort((a, b) => (a.path < b.path ? -1 : 1));

  const failures: { path: string; reason: string }[] = [];
  const rows: (typeof memoryEntry.$inferInsert)[] = [];
  // Identidade duplicada é **resultado**, não exceção: dois arquivos com nomes
  // diferentes podem reduzir ao mesmo `(escopo, tipo, slug)`, e quem descobre
  // isso é o operador — não um stack trace. Detectado aqui, e não pelo índice
  // único, porque o erro do SQLite não diz qual foi o outro arquivo.
  const claimed = new Map<string, string>();

  for (const item of found) {
    if ("reason" in item) {
      failures.push({ path: item.path, reason: item.reason });
      continue;
    }

    const key = identityKey(identityFor(item.path, item.entry, item.location));
    const owner = claimed.get(key);
    if (owner !== undefined) {
      failures.push({ path: item.path, reason: `identidade já indexada por ${owner}` });
      continue;
    }

    claimed.set(key, item.path);
    rows.push(rowFor(item.path, item.entry, item.location, item.hash));
  }

  // Tudo dentro de uma transação: sem ela, um insert que estourasse deixaria o
  // catálogo apagado e meio preenchido — o comando que existe para reconstruir
  // o índice seria o que o destrói.
  db.transaction((tx) => {
    tx.delete(memoryEntry).run();
    for (const row of rows) tx.insert(memoryEntry).values(row).run();
  });

  return { indexed: rows.length, failures };
}

/** Insere ou atualiza uma memória no catálogo, pelo caminho — que é único. */
export function upsertEntry(
  db: Db,
  path: string,
  entry: MemoryEntry,
  location: CatalogLocation,
  text: string,
): void {
  const existing = db.select().from(memoryEntry).where(eq(memoryEntry.path, path)).get();
  const row = rowFor(path, entry, location, hashContent(text));

  if (existing === undefined) {
    db.insert(memoryEntry).values(row).run();
    return;
  }
  db.update(memoryEntry)
    .set({ ...row, id: existing.id })
    .where(eq(memoryEntry.path, path))
    .run();
}

export function removeEntry(db: Db, path: string): void {
  db.delete(memoryEntry).where(eq(memoryEntry.path, path)).run();
}

/**
 * A identidade de uma memória, do jeito que a linha do catálogo a expressa.
 *
 * Derivada do **caminho** e do frontmatter, e não do nome que o chamador tinha
 * em mãos: é `slugFromPath` que decide o slug, e é ele que faz `memory/alfa.md`
 * e `memory/user_alfa.md` reivindicarem a mesma coisa.
 */
export function identityFor(
  path: string,
  entry: Pick<MemoryEntry, "type" | "scope">,
  location: CatalogLocation,
): EntryIdentity {
  return {
    scope: entry.scope,
    workspaceId: location.workspaceId ?? "",
    projectId: location.projectId ?? "",
    type: entry.type,
    slug: slugFromPath(path, entry.type),
  };
}

/**
 * O caminho que já reivindica esta identidade — ou `undefined`.
 *
 * Pergunta ao **catálogo**, e não ao disco, porque é o índice único que impõe a
 * restrição: quem quer saber se pode escrever tem que enxergar o mesmo estado
 * que vai recusá-lo.
 */
export function pathClaiming(db: Db, identity: EntryIdentity): string | undefined {
  const row = db
    .select({ path: memoryEntry.path })
    .from(memoryEntry)
    .where(
      and(
        eq(memoryEntry.scope, identity.scope),
        eq(memoryEntry.workspaceId, identity.workspaceId),
        eq(memoryEntry.projectId, identity.projectId),
        eq(memoryEntry.type, identity.type),
        eq(memoryEntry.slug, identity.slug),
      ),
    )
    .get();
  return row?.path;
}

export function listEntries(db: Db): MemoryEntryRow[] {
  return db.select().from(memoryEntry).all();
}

function rowFor(
  path: string,
  entry: MemoryEntry,
  location: CatalogLocation,
  contentHash: string,
): typeof memoryEntry.$inferInsert {
  return {
    id: newId(),
    path,
    type: entry.type,
    scope: entry.scope,
    slug: slugFromPath(path, entry.type),
    // `''` e não `null`: é o que faz o índice único de identidade valer fora do
    // escopo `project` — no SQLite NULL não colide com NULL.
    workspaceId: location.workspaceId ?? "",
    projectId: location.projectId ?? "",
    name: entry.name,
    description: entry.description,
    sourceActor: entry.provenance.source_actor,
    confidence: entry.provenance.confidence,
    pinned: entry.pinned,
    contentHash,
    // As datas da linha espelham a proveniência, e não o instante em que o
    // índice foi construído. Isso faz `reindex` ser **determinístico**: apagar o
    // banco e refazer devolve as mesmas linhas, e não linhas equivalentes com
    // carimbo novo. Também é o que faz "ordenar por mais recente" significar a
    // memória mais recente, e não a reindexação mais recente.
    createdAt: new Date(entry.provenance.created_at),
    updatedAt: new Date(entry.provenance.updated_at),
  };
}

/** `memory/user_estilo-de-revisao.md` → `estilo-de-revisao`. */
function slugFromPath(path: string, type: MemoryType): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(new RegExp(`^${type}_`), "").replace(/\.md$/, "");
}

/**
 * A identidade como chave de mapa.
 *
 * Separador NUL, e não `:` ou `/`: id de workspace e de projeto vêm de nome de
 * diretório, e um separador que possa aparecer dentro de um campo faz
 * `("a b", "c")` colidir com `("a", "b c")`.
 */
function identityKey(identity: EntryIdentity): string {
  return [
    identity.scope,
    identity.workspaceId,
    identity.projectId,
    identity.type,
    identity.slug,
  ].join("\u0000");
}

type ScanItem =
  | { path: string; entry: MemoryEntry; location: CatalogLocation; hash: string }
  | { path: string; reason: string };

/**
 * Varre os três escopos e devolve tudo — inclusive o que falhou.
 *
 * `_system/` e `context/` **não** são varridos, e isso é regra e não descuido: o
 * §5 do PRD os define como internos, e o estudo do Compozy registra que
 * artefato de staging vazando para o índice é como memória vira lixo.
 */
async function scanEntries(stateDir: string): Promise<ScanItem[]> {
  const items: ScanItem[] = [];

  await collectFrom(stateDir, join(stateDir, "memory"), { scope: "global", workspaceId: null, projectId: null }, items);

  const workspacesDir = join(stateDir, "workspaces");
  for (const workspaceId of await subdirectories(workspacesDir)) {
    const workspaceRoot = join(workspacesDir, workspaceId);
    await collectFrom(
      stateDir,
      join(workspaceRoot, "memory"),
      { scope: "workspace", workspaceId, projectId: null },
      items,
    );

    const projectsDir = join(workspaceRoot, "projects");
    for (const projectId of await subdirectories(projectsDir)) {
      await collectFrom(
        stateDir,
        join(projectsDir, projectId, "memory"),
        { scope: "project", workspaceId, projectId },
        items,
      );
    }
  }

  return items;
}

async function collectFrom(
  stateDir: string,
  dir: string,
  location: CatalogLocation,
  items: ScanItem[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const dirent of entries) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md")) continue;
    // O índice gerado não é memória; ele é a projeção dela.
    if (dirent.name === "MEMORY.md") continue;

    const absolute = join(dir, dirent.name);
    const path = relative(stateDir, absolute).split(sep).join("/");
    const text = await readFile(absolute, "utf8").catch((error: unknown) => error as Error);

    if (typeof text !== "string") {
      items.push({ path, reason: `não foi possível ler: ${text.message}` });
      continue;
    }

    try {
      items.push({ path, entry: parseEntry(text, path), location, hash: hashContent(text) });
    } catch (error) {
      items.push({ path, reason: (error as Error).message });
    }
  }
}

async function subdirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}
