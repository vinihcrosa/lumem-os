import { z } from "zod";

import { MemoryService } from "../memory/MemoryService.js";
import { MEMORY_ACTORS, MEMORY_SCOPES, MEMORY_TYPES } from "../memory/entry.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * A segunda superfície da memória — a mesma função, o mesmo contrato de erro.
 *
 * A PR 03 é sobre isto: um **núcleo com superfícies**. A CLI e este router não
 * têm lógica própria; os dois chamam `MemoryService` e deixam o `domainSafe`
 * traduzir `DomainError` do mesmo jeito que os outros routers já fazem. É o
 * princípio de paridade que o estudo do Compozy recomendou (§11.33) — e o que
 * garante que a terceira superfície, o MCP, não vire uma terceira semântica.
 *
 * O que **não** está aqui, de propósito: nada que escreva sem o portão. Toda
 * escrita passa por `MemoryService.write`, que decide, registra e só então grava.
 */

const scopeIds = z.object({
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

const identity = scopeIds.extend({
  type: z.enum(MEMORY_TYPES),
  name: z.string().min(1).max(200),
  scope: z.enum(MEMORY_SCOPES).optional(),
});

const writeSchema = identity.extend({
  description: z.string().min(1).max(500),
  body: z.string().max(100_000).default(""),
  actor: z.enum(MEMORY_ACTORS).default("human"),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  evidence: z.string().max(4_000).optional(),
  sourceSessions: z.array(z.string()).optional(),
  worktreeId: z.string().optional(),
});

export const memoryRouter = router({
  /** O que o escopo ativo enxerga, e o que ficou sombreado ao lado. */
  list: publicProcedure.input(scopeIds.optional()).query(({ ctx, input }) => {
    const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
    const { visible, shadowed } = memory.visible({
      workspaceId: input?.workspaceId ?? null,
      projectId: input?.projectId ?? null,
    });
    return {
      entries: visible,
      // Duas listas, e não uma: esconder sem dizer o que foi escondido é como o
      // shadow vira mistério.
      shadowed: shadowed.map((pair) => ({
        winner: pair.winner.path,
        loser: pair.loser.path,
        identity: `${pair.loser.type}/${pair.loser.slug}`,
      })),
    };
  }),

  read: publicProcedure.input(identity).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.read(input.type, input.name, input.scope, {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
    }),
  ),

  write: publicProcedure.input(writeSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.write(input);
    }),
  ),

  forget: publicProcedure.input(identity).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.forget(input.type, input.name, input.scope, {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
    }),
  ),

  revert: publicProcedure.input(z.object({ path: z.string().min(1).max(4_096) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.revert(input.path);
    }),
  ),

  /** Busca lexical, explicável — e que respeita escopo e shadow. */
  search: publicProcedure
    .input(scopeIds.extend({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(50).optional() }))
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.search(input.query, {
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        ...(input.limit ? { limit: input.limit } : {}),
      });
    }),

  /** A inbox: o que os agentes querem ensinar ao workspace. */
  proposals: publicProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "rejected"]).optional(),
          workspaceId: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.proposals({
        ...(input?.status ? { status: input.status } : {}),
        ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input?.limit ? { limit: input.limit } : {}),
      });
    }),

  approveProposal: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        description: z.string().min(1).max(500).optional(),
        body: z.string().max(100_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
        const { id, ...edits } = input;
        return memory.approveProposal(id, edits);
      }),
    ),

  rejectProposal: publicProcedure
    .input(z.object({ id: z.string().min(1), note: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () =>
        new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir }).rejectProposal(
          input.id,
          input.note,
        ),
      ),
    ),

  /** Os números do §6 do context-delivery. */
  usage: publicProcedure.query(({ ctx }) => {
    const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
    return memory.usageSummary();
  }),

  /** As decisões — inclusive as que não viraram arquivo. */
  decisions: publicProcedure
    .input(z.object({ path: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(({ ctx, input }) => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.decisions({
        ...(input?.path ? { path: input.path } : {}),
        ...(input?.limit ? { limit: input.limit } : {}),
      });
    }),

  reindex: publicProcedure.mutation(({ ctx }) =>
    domainSafeAsync(async () => {
      const memory = new MemoryService({ db: ctx.db, stateDir: ctx.config.stateDir });
      return memory.reindex();
    }),
  ),
});
