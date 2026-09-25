import { z } from "zod";

import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { asc, eq } from "drizzle-orm";

import { session } from "../db/schema.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository, type PendingReason } from "../repositories/session.js";
import { resolveScope } from "../scope.js";
import { deliverPending, sendPendingNow } from "../sessions/pending-prompt.js";
import { startAgentSession } from "../sessions/start-agent-session.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * Sessions over the wire, PRD F5.1–F5.10.
 *
 * Shell and agent are the same primitive with a different label, exactly as §3
 * says. The only differences are what gets launched and where the label comes
 * from — everything after the spawn is identical, which is what keeps this
 * version small.
 */

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(5_000).optional(),
  rows: z.number().int().min(1).max(5_000).optional(),
});

export interface SessionView extends Omit<SessionRow, "pendingReason"> {
  /** Null for a shell, and for an agent whose configuration was removed. */
  agentName: string | null;
  /**
   * Por que o primeiro prompt (`pendingPrompt`, que vem da linha como está) não
   * saiu sozinho — `null` enquanto ele ainda pode sair (`033` §3.3).
   *
   * Estreitado aqui porque a coluna é `text` e quem conhece a lista é o CHECK:
   * a tela precisa de uma união para escrever um `switch` que o `tsc` cobra.
   */
  pendingReason: PendingReason | null;
}

async function toView(ctx: Context, row: SessionRow): Promise<SessionView> {
  const pendingReason = row.pendingReason as PendingReason | null;
  if (row.agentConfigId === null) return { ...row, pendingReason, agentName: null };
  const config = await createAgentConfigRepository(ctx.db).findById(row.agentConfigId);
  return { ...row, pendingReason, agentName: config?.name ?? null };
}

/** A sessão, com o prompt esperando — ou a recusa que diz que não há nenhum. */
async function requirePending(ctx: Context, id: string): Promise<SessionRow> {
  const row = await ctx.sessionStore.findById(id);
  if (!row) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);
  if (row.pendingPrompt === null) {
    throw new DomainError("BLOCKED", `não há prompt pendente na sessão ${id}`);
  }
  return row;
}

export const sessionRouter = router({
  listByScope: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const rows = await ctx.sessionStore.listByScope(input.scopeType, input.scopeId);
      return Promise.all(rows.map((row) => toView(ctx, row)));
    }),
  ),

  getDetail: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const row = await ctx.sessionStore.findById(input.id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${input.id} não existe`);
      return toView(ctx, row);
    }),
  ),

  createShell: publicProcedure.input(scopeSchema.merge(sizeSchema)).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);

      // F5.5: the user's login shell, inheriting their environment. A session
      // without their aliases and prompt is a session they will not use.
      const row = await ctx.sessionStore.start({
        kind: "shell",
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        cwd,
        command: ctx.config.shell,
        args: ["-l"],
        ...(input.cols === undefined ? {} : { cols: input.cols }),
        ...(input.rows === undefined ? {} : { rows: input.rows }),
      });
      ctx.events.emit({
        type: "session.changed",
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      });
      return toView(ctx, row);
    }),
  ),

  /**
   * As sessões de uma tarefa (`022` F1).
   *
   * Uma tarefa tem N sessões e uma sessão tem no máximo uma tarefa, então a
   * ligação já existe na coluna: isto é a leitura dela, não um índice novo. E
   * conta os três `kind` — a `shell` que subiu a aplicação para conferir o que o
   * agente fez foi trabalho desta tarefa.
   */
  listByTask: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(session)
        .where(eq(session.taskId, input.taskId))
        .orderBy(asc(session.createdAt));
      return Promise.all(rows.map((row) => toView(ctx, row)));
    }),

  createAgent: publicProcedure
    .input(
      scopeSchema
        .merge(sizeSchema)
        .extend({
          /**
           * Quem sobe: uma configuração que já existe **ou** um adaptador do
           * catálogo (`033` §3.2) — exatamente um dos dois, conferido abaixo.
           *
           * O adaptador é o caminho da tela nova, que escolhe agente e modelo
           * antes de existir sessão; a configuração é o de sempre, e o da
           * esteira.
           */
          agentConfigId: z.string().min(1).optional(),
          adapterId: z.string().min(1).optional(),
          /**
           * `optionId → valor`, aplicado antes de devolver — `mode` primeiro.
           *
           * Um valor que o agente não oferece **recusa a criação** e fecha a
           * sessão: nascer calada no modelo padrão seria gastar no que ninguém
           * escolheu.
           */
          config: z.record(z.string().min(1), z.string()).optional(),
          /**
           * Para qual tarefa esta conversa existe (`022` F2).
           *
           * Opcional: tarefa não é obrigatória para abrir uma sessão (T1), e o
           * caminho `＋ nova sessão` continua sem nenhuma.
           */
          taskId: z.string().min(1).optional(),
          /**
           * A sessão **nasce** sem ninguém para responder permissão (`028` Parte 2).
           *
           * É a esteira, e só ela: uma conversa que você abre tem você do outro
           * lado, e é por isso que ninguém nasce liberado — a
           * [`016`](../../../../docs/features/016-session-mode/prd.md) é explícita.
           * Aqui não há lado de lá, e o daemon parado em `ask` pendura o turno
           * para sempre.
           *
           * **Nascer, e não trocar**: o portão do `016` continua valendo inteiro
           * para mudar o modo de uma sessão viva, que é o que ele protege.
           *
           * **E só o daemon liga**, o que é conferido no `startAgentSession` e
           * não afirmado aqui: escrito como comentário, ele não impedia um
           * `curl` na porta local de abrir uma conversa que auto-aprova toda
           * ferramenta — contornando por fora o portão por sessão que a `016`
           * existe para impor.
           */
          autonomous: z.boolean().default(false),
          /**
           * Qual encaixe da esteira esta sessão serve (`028` Parte 7 — T57).
           *
           * Ausente em tudo que não é a esteira, e é o que a deixa ser
           * **reencontrada**: a segunda tentativa do implementador retoma a
           * conversa dele. Só o daemon o preenche, pelo mesmo portão do
           * `autonomous`.
           */
          taskRole: z.enum(["implementador", "revisor", "testador"]).optional(),
        })
        /*
         * Os dois opcionais no tipo e exclusivos aqui: um `union` do zod
         * descreveria o mesmo, mas responderia com o erro das duas variantes
         * empilhado, e quem mandou os dois quer ouvir uma frase só.
         */
        .refine((input) => (input.agentConfigId === undefined) !== (input.adapterId === undefined), {
          message: "informe exatamente um entre agentConfigId e adapterId",
        }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const row = await startAgentSession(ctx, {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          agent:
            input.agentConfigId === undefined
              ? { adapterId: input.adapterId! }
              : { agentConfigId: input.agentConfigId },
          ...(input.config === undefined ? {} : { config: input.config }),
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
          ...(input.taskRole === undefined ? {} : { taskRole: input.taskRole }),
          autonomous: input.autonomous,
          ...(input.cols === undefined ? {} : { cols: input.cols }),
          ...(input.rows === undefined ? {} : { rows: input.rows }),
        });
        return toView(ctx, row);
      }),
    ),

  /**
   * A finished conversation, without launching anything (D13).
   *
   * Reading is not resuming. Standing up an adapter costs ~39k tokens of system prompt
   * before the first word (§2.3 of the PRD), and nobody should pay that for clicking a
   * tab to reread something.
   */
  transcript: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => domainSafeAsync(() => ctx.sessionStore.transcript(input.id))),

  /**
   * Continues a conversation that has ended (F5.2, D12).
   *
   * Returns the **new** session, which is what the tab has to switch to: the old row
   * stays exactly as it was, with its transcript, and the client's job is to point at
   * the one that can be talked to.
   */
  resume: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const row = await ctx.sessionStore.resume(input.id);
      ctx.events.emit({
        type: "session.changed",
        scopeType: row.scopeType as "project" | "worktree",
        scopeId: row.scopeId,
      });
      /*
       * A sessão cujo primeiro prompt o daemon perdeu no meio do `setup` (`033`
       * M2a) volta para a mesma máquina: prepara o checkout e manda. Um
       * `setup` que já tinha falhado continua esperando a pessoa — quem decide
       * isso é o próprio `deliverPending`, que não roda nada quando há motivo.
       */
      if (row.pendingPrompt !== null) void deliverPending(ctx, row.id);
      return toView(ctx, row);
    }),
  ),

  /**
   * Manda o primeiro prompt que ficou esperando (`033` §3.3, F4.6).
   *
   * É o `mandar assim mesmo` depois de um `setup` que falhou: manda, e não
   * tenta o `setup` de novo — quem quer outra rodada tem a aba Setup do rodapé.
   * Devolve antes de o turno acabar; a pendência zera quando o turno entra na
   * conversa, e o `session.changed` diz quando.
   */
  sendPending: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const row = await requirePending(ctx, input.id);
      sendPendingNow(ctx, row);
      return toView(ctx, row);
    }),
  ),

  /**
   * Descarta o primeiro prompt sem mandar (`033` §3.3).
   *
   * O texto não se perde por isso: é o `editar` da tela, que o devolve ao
   * compositor antes de chamar isto. Vale também durante o `setup` — o exit
   * que chegar depois relê a linha e não manda nada.
   */
  discardPending: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const row = await requirePending(ctx, input.id);
        await createSessionRepository(ctx.db).clearPending(row.id);
        ctx.events.emit({
          type: "session.changed",
          scopeType: row.scopeType as "project" | "worktree",
          scopeId: row.scopeId,
        });
        return toView(ctx, (await ctx.sessionStore.findById(row.id)) ?? row);
      }),
    ),

  close: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const row = await ctx.sessionStore.findById(input.id);
      await ctx.sessionStore.close(input.id);
      if (row) {
        ctx.events.emit({
          type: "session.changed",
          scopeType: row.scopeType as "project" | "worktree",
          scopeId: row.scopeId,
        });
      }
      return { ok: true as const };
    }),
  ),
});
