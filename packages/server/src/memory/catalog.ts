import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { eq } from "drizzle-orm";

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
  workspaceId: string | null;
  projectId: string | null;
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
  const found = await scanEntries(stateDir);

  db.delete(memoryEntry).run();
  const failures: { path: string; reason: string }[] = [];

  for (const item of found) {
    if ("reason" in item) {
      failures.push({ path: item.path, reason: item.reason });
      continue;
    }
    db.insert(memoryEntry).values(rowFor(item.path, item.entry, item.location, item.hash)).run();
  }

  return { indexed: found.length - failures.length, failures };
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
    workspaceId: location.workspaceId,
    projectId: location.projectId,
    name: entry.name,
    description: entry.description,
    sourceActor: entry.provenance.source_actor,
    confidence: entry.provenance.confidence,
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
