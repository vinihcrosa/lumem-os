import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { FastifyBaseLogger } from "fastify";

import { and, eq, sql } from "drizzle-orm";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { newId } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { playbook, type PlaybookRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { writeAtomically } from "../files/FileService.js";
import type { GitExec } from "../git/exec.js";

import { slugify } from "./entry.js";
import { decide, recordDecision, attachCommit } from "./gate.js";
import {
  assertPlaybookPath,
  playbookDirFor,
  playbookPathFor,
  repoRelative,
  type ScopeTarget,
} from "./paths.js";
import { commitChange } from "./repo.js";

/**
 * O playbook: **procedimento**, e não memória.
 *
 * O §6 do PRD separa os dois por escrito, e a diferença é de natureza. Memória é
 * fato ou diretriz: vale por si, e o que muda nela é a precedência entre escopos.
 * Playbook tem corpo, é carregado sob demanda, e **envelhece por uso** — nada na
 * memória envelhece, e nada aqui precisa de shadow.
 *
 * O que ele reusa é infraestrutura, não semântica: o portão (scan de segredo e
 * decisão no WAL), o commit no `~/.lumem`, e o `~/.lumem` como fonte única. É o
 * que faz "toda escrita passa pelo mesmo portão" continuar verdadeiro depois de
 * existir uma segunda coisa que escreve.
 */

const FENCE = "---";

/**
 * Um nome que é **classe de tarefa**, e não artefato de sessão.
 *
 * O §9 fecha isso na primeira linha: *"investigar teste flaky" sim; "consertar o
 * PR 412" não*. A diferença importa porque playbook nomeado por artefato nunca é
 * carregado de novo — o artefato acabou —, então ele nasce morto e depois some
 * pelo ciclo de vida, tendo custado uma revisão sua.
 *
 * A recusa é por **forma**, e conservadora: número de issue, número de PR, SHA. O
 * que ela não pega, pega você na revisão.
 */
const ARTIFACT = /(#\d+|\bPR[- ]?\d+|\bissue[- ]?\d+|\b[0-9a-f]{7,40}\b)/i;

const frontmatterSchema = z.object({
  task_class: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  scope: z.enum(["workspace", "project"]),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type PlaybookFrontmatter = z.infer<typeof frontmatterSchema>;

export interface Playbook extends PlaybookFrontmatter {
  body: string;
}

export function serializePlaybook(entry: Playbook): string {
  const { body, ...frontmatter } = entry;
  const yaml = stringifyYaml(frontmatterSchema.parse(frontmatter), { lineWidth: 0 }).trimEnd();
  const text = body.trimEnd();
  return `${FENCE}\n${yaml}\n${FENCE}\n\n${text === "" ? "" : `${text}\n`}`;
}

export function parsePlaybook(text: string, source = "playbook"): Playbook {
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: falta o frontmatter`);
  }
  const end = text.indexOf(`\n${FENCE}`, FENCE.length);
  if (end === -1) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: frontmatter não foi fechado`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text.slice(FENCE.length + 1, end + 1));
  } catch (error) {
    throw new DomainError("INVALID_ARGUMENT", `${source}: frontmatter não é YAML válido`, {
      cause: error,
    });
  }

  const result = frontmatterSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${source}: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "inválido"}`,
    );
  }
  const body = text.slice(end + FENCE.length + 1).replace(/^\n+/, "");
  return { ...result.data, body: body.trimEnd() };
}

/** Recusa o nome que é artefato de sessão, e diz o que se esperava. */
export function assertTaskClass(taskClass: string): string {
  if (ARTIFACT.test(taskClass)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `"${taskClass}" nomeia um artefato, não uma classe de tarefa — ` +
        `playbook é "investigar teste flaky", nunca "consertar o PR 412"`,
    );
  }
  return taskClass;
}

/** Quantos dias sem carregamento fazem um playbook parecer parado. */
export const STALE_AFTER_DAYS = 60;

export type PlaybookLifecycle = "active" | "stale" | "archived";

/**
 * O estado do ciclo de vida, **derivado** — nunca gravado.
 *
 * Estado calculado não desatualiza: um campo `stale` no banco viraria mentira no
 * dia seguinte, e alguém teria que ter escrito o job que o corrige. O único
 * estado persistido é `archived`, porque ele não é derivado de nada — é um gesto
 * seu.
 *
 * `pinned` sai fora do envelhecimento: envelhecer é o que acontece com o que
 * ninguém escolheu.
 */
export function lifecycleOf(row: PlaybookRow, now = new Date()): PlaybookLifecycle {
  if (row.archived) return "archived";
  if (row.pinned) return "active";
  const since = row.lastLoadedAt ?? row.createdAt;
  const days = (now.getTime() - since.getTime()) / 86_400_000;
  return days > STALE_AFTER_DAYS ? "stale" : "active";
}

export interface WritePlaybookInput {
  taskClass: string;
  description: string;
  body: string;
  scope: "workspace" | "project";
  workspaceId?: string;
  projectId?: string;
  actor: string;
}

export interface PlaybookService {
  write(input: WritePlaybookInput): Promise<{ path: string; slug: string; created: boolean }>;
  read(path: string): Promise<Playbook>;
  list(filter?: { workspaceId?: string; projectId?: string; archived?: boolean }): PlaybookRow[];
  /** Registra um carregamento. É o que alimenta o ciclo de vida. */
  recordLoad(path: string, at?: Date): boolean;
  /** Arquiva ou desarquiva — sempre por gesto seu. */
  setArchived(path: string, archived: boolean): PlaybookRow;
  setPinned(path: string, pinned: boolean): PlaybookRow;
}

export interface PlaybookServiceOptions {
  db: Db;
  stateDir: string;
  exec?: GitExec;
  log?: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
}

export function createPlaybookService({
  db,
  stateDir,
  exec,
  log,
  now = () => new Date(),
}: PlaybookServiceOptions): PlaybookService {
  function targetFor(input: {
    scope: "workspace" | "project";
    workspaceId?: string;
    projectId?: string;
  }): ScopeTarget {
    return {
      scope: input.scope,
      ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    };
  }

  function rowAt(path: string): PlaybookRow {
    const [row] = db.select().from(playbook).where(eq(playbook.path, path)).limit(1).all();
    if (row === undefined) throw new DomainError("NOT_FOUND", `${path} não é um playbook conhecido`);
    return row;
  }

  return {
    async write(input) {
      assertTaskClass(input.taskClass);
      const slug = slugify(input.taskClass);
      const target = targetFor(input);
      const absolute = playbookPathFor(stateDir, target, slug);
      const path = repoRelative(stateDir, absolute);

      const previous = await readFile(absolute, "utf8").catch(() => null);
      const timestamp = now().toISOString();
      const candidate = serializePlaybook({
        task_class: input.taskClass,
        description: input.description,
        scope: input.scope,
        // Reescrever o corpo não desfixa nem desarquiva: as duas coisas são
        // gesto seu, e conteúdo não é curadoria. É a mesma regra do `pinned` da
        // memória, e o mesmo defeito que ela evita.
        pinned: previous === null ? false : parsePlaybook(previous, path).pinned,
        archived: previous === null ? false : parsePlaybook(previous, path).archived,
        created_at: previous === null ? timestamp : parsePlaybook(previous, path).created_at,
        updated_at: timestamp,
        body: input.body,
      });
      const operation = previous === null ? "add" : "update";

      // O mesmo portão da memória: scan determinístico e decisão antes do disco.
      // Playbook é procedimento escrito por agente também, e é por onde segredo
      // entraria se este caminho tivesse escapado da regra.
      const decision = decide({
        path,
        operation,
        actor: input.actor,
        confidence: "medium",
        content: candidate,
        signature: candidate,
        previousSignature: previous,
      });
      const record = recordDecision(db, {
        ...decision,
        path,
        operation,
        actor: input.actor,
        confidence: "medium",
      });
      if (decision.outcome === "rejected") {
        throw new DomainError("BLOCKED", decision.reason ?? "recusado pelo portão");
      }
      if (decision.outcome === "noop") return { path, slug, created: false };

      await mkdir(playbookDirFor(stateDir, target, slug), { recursive: true, mode: 0o700 });
      await writeAtomically(absolute, Buffer.from(decision.content, "utf8"), 0o600);

      const stored = parsePlaybook(decision.content, path);
      db.insert(playbook)
        .values({
          id: newId(),
          path,
          scope: input.scope,
          slug,
          workspaceId: input.workspaceId ?? "",
          projectId: input.projectId ?? "",
          taskClass: stored.task_class,
          description: stored.description,
          pinned: stored.pinned,
          archived: stored.archived,
          contentHash: hash(decision.content),
          createdAt: new Date(stored.created_at),
          updatedAt: new Date(stored.updated_at),
        })
        .onConflictDoUpdate({
          target: playbook.path,
          set: {
            taskClass: stored.task_class,
            description: stored.description,
            contentHash: hash(decision.content),
            updatedAt: new Date(stored.updated_at),
          },
        })
        .run();

      const { commit } = await commitChange({
        stateDir,
        paths: [path],
        operation,
        subject: `playbook/${slug}`,
        actor: input.actor,
        ...(exec ? { exec } : {}),
        ...(log ? { log } : {}),
      });
      attachCommit(db, record.id, commit);
      return { path, slug, created: previous === null };
    },

    async read(path) {
      const safe = assertPlaybookPath(path);
      const text = await readFile(join(stateDir, safe), "utf8").catch(() => null);
      if (text === null) throw new DomainError("NOT_FOUND", `${safe} não existe`);
      return parsePlaybook(text, safe);
    },

    list(filter = {}) {
      const conditions = [
        filter.workspaceId === undefined ? undefined : eq(playbook.workspaceId, filter.workspaceId),
        filter.projectId === undefined ? undefined : eq(playbook.projectId, filter.projectId),
        filter.archived === undefined ? undefined : eq(playbook.archived, filter.archived),
      ].filter((condition) => condition !== undefined);

      const query = db.select().from(playbook);
      return (conditions.length === 0 ? query : query.where(and(...conditions)))
        .orderBy(sql`${playbook.loads} desc`, playbook.taskClass)
        .all();
    },

    recordLoad(path, at = now()) {
      // `UPDATE` direto e sem leitura antes: contar carregamento é a operação
      // mais frequente que existe aqui, e ela não precisa saber o valor anterior.
      const changed = db
        .update(playbook)
        .set({ loads: sql`${playbook.loads} + 1`, lastLoadedAt: at })
        .where(eq(playbook.path, path))
        .run();
      return changed.changes > 0;
    },

    setArchived(path, archived) {
      const row = rowAt(path);
      db.update(playbook).set({ archived }).where(eq(playbook.path, row.path)).run();
      return { ...row, archived };
    },

    setPinned(path, pinned) {
      const row = rowAt(path);
      db.update(playbook).set({ pinned }).where(eq(playbook.path, row.path)).run();
      return { ...row, pinned };
    },
  };
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
