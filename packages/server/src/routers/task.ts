import { z } from "zod";

import { and, eq } from "drizzle-orm";

import type { BoardColumn } from "@lumem/shared";

import { project, session, worktree } from "../db/schema.js";
import { createTaskRepository, TASK_STATUSES } from "../repositories/task.js";
import { createTaskCommentRepository } from "../repositories/task-comment.js";
import { beyondSlots, boardOf, toWireCard } from "../tasks/board.js";
import { queueOf } from "../tasks/queue.js";
import { noticeFor } from "../tasks/notify.js";
import { cleanupFactsOf, decideCleanup, type CleanupDecision } from "../tasks/cleanup.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { liveTurnsByTask, pausesByTask, sealOf } from "../tasks/seal.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";
import { DomainError } from "../errors.js";

/**
 * Tarefas sobre o fio (`022-workspace-tasks` F1).
 *
 * **Este router é a superfície humana.** Todo caminho daqui escreve com
 * `actor: "human"`, e é o que faz `done` ser seu: o agente fala por outra porta
 * — HTTP, em `task/http.ts` —, e é lá que `actor: "agent"` aparece. Uma
 * procedure que aceitasse o ator como entrada devolveria a decisão a quem
 * chama.
 */

const titleSchema = z.string().trim().min(1, "a tarefa precisa de um título").max(200);
const idSchema = z.object({ id: z.string().min(1) });
const statusSchema = z.enum(TASK_STATUSES);

/**
 * As colunas em que **alguém está trabalhando**, para o gesto do arrasto (Q40).
 *
 * São as três com papel — as mesmas que o selo chama de `implementador`,
 * `revisor` e `testador` —, e a lista é essa porque o gesto que ela traduz é
 * *"assumi o volante"*: um cartão parado numa delas quer dizer que alguém está
 * nele, e se esse alguém é você a esteira não pode pegar por cima.
 *
 * **`open` não está aqui, e isso foi um erro meu que um teste pegou.** A `open`
 * é a To-Do: arrastar um cartão para lá é **entregá-lo** à máquina, não tirá-lo
 * dela. Com ela na lista, o gesto mais comum do quadro — pôr uma tarefa na fila
 * — desligava a autonomia da tarefa que acabou de ser enfileirada, e a esteira
 * ficava permanentemente vazia sem nada falhar. Quem derrubou foi o caso da
 * `queue.test.ts` que arrasta dentro da própria coluna para provar a prioridade.
 *
 * `ready_to_merge` também não está, e por outro motivo: o §4.1 a criou para
 * marcar *"é a sua vez"*, e arrastar um cartão para lá não é assumir o volante —
 * é devolvê-lo.
 */
const HANDS_ON_COLUMNS = new Set(["in_progress", "review", "testing"]);

export const taskRouter = router({
  /**
   * Os tetos desta feature, como leitura (T13).
   *
   * **Mostrado, e não só existente.** Um teto que você não vê é um teto que você
   * não ajusta — e no dia em que ele recusar, você vai achar que é bug. O valor
   * vem de `LUMEM_TASKS_BUDGET`, o mesmo caminho que o orçamento do auto-learn
   * já usa, e a tela diz o nome da variável para haver **um lugar** que responde
   * "onde eu mudo isso?".
   */
  settings: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      /*
       * A medida de cerimônia (§7 do PRD).
       *
       * `sessões com tarefa ÷ sessões`, e o PRD **espera que não seja 100%**: se
       * for, todo mundo está criando tarefa para agradar o daemon, e o lugar da
       * tarefa está errado. É o único número deste produto cujo valor bom é um
       * intervalo aberto, e por isso ele precisa aparecer — ninguém vai procurar
       * uma métrica que não incomoda.
       *
       * **Escopado ao workspace**, e é o que faz o número descrever o lugar onde
       * ele aparece: a linha é renderizada dentro da lista de um workspace só, e
       * contar o banco inteiro misturaria as sessões de todos eles. Um número
       * que não é do lugar onde está escrito é pior que nenhum — ele parece
       * dado.
       *
       * Contado sobre **todas** as sessões daquele workspace, e não sobre uma
       * janela: cerimônia é hábito, e hábito não cabe em sete dias.
       */
      const counted = await sessionsOfWorkspace(ctx.db, input.workspaceId);

      /*
       * Os três tetos do workspace (`028` Parte 3, T18).
       *
       * Na mesma leitura que a cerimônia, e pela mesma razão que ela aparece:
       * *"teto que você não vê é teto que parece bug quando recusa"*. `null` é
       * **sem teto**, e a tela diz isso com palavra em vez de campo vazio.
       */
      const space = await ctx.db.query.workspace.findFirst({
        where: (table, { eq: is }) => is(table.id, input.workspaceId),
      });

      return {
        budget: ctx.config.taskBudget,
        /** O que ajustar, escrito aqui para a tela não ter que saber. */
        budgetEnv: "LUMEM_TASKS_BUDGET" as const,
        sessions: counted.total,
        sessionsWithTask: counted.withTask,
        caps: {
          costPerTask: space?.budgetCostPerTask ?? null,
          costPerDay: space?.budgetCostPerDay ?? null,
          turnsPerSession: space?.budgetTurnsPerSession ?? null,
        },
        /*
         * O interruptor da esteira, na mesma leitura (`028` Parte 2, T29).
         *
         * Junto dos tetos porque é a mesma pergunta — *o que este workspace
         * deixa gastar sozinho* —, e porque a Parte 3 veio antes justamente
         * para que ligar a autonomia e ver o teto fossem a mesma olhada.
         */
        autonomy: space?.autonomy ?? "manual",
        maxParallel: space?.autonomyMaxParallel ?? 0,
        /** O interruptor da Q27, na mesma leitura que a tela já faz. */
        mergedAlwaysRemoves: space?.mergedAlwaysRemoves ?? false,
      };
    }),

  listByWorkspace: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        status: statusSchema.optional(),
        projectId: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      createTaskRepository(ctx.db).listByWorkspace(input.workspaceId, {
        status: input.status,
        projectId: input.projectId,
      }),
    ),

  /**
   * O quadro inteiro, numa leitura (`028` F1, T6 e T7).
   *
   * Sete colunas sempre, mesmo vazias, com o selo de cada cartão **derivado** na
   * resposta — nunca guardado. Uma chamada, e não uma por coluna: nenhuma das
   * sete veria as outras, e um cartão que trocasse de coluna no meio apareceria
   * duas vezes ou nenhuma.
   */
  board: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        projectId: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const live = ctx.acpManager.liveTurns();
      /*
       * A fila entra na leitura do quadro por causa do relógio (Q54).
       *
       * Ela é uma leitura barata sobre o mesmo banco, e ler aqui é o que
       * permite o encalhe **não** cobrar a espera por vaga sem nenhuma coluna
       * nova. É a mesma chamada que a esteira faz de 15 em 15 segundos.
       */
      const queue = queueOf(ctx.db, { workspaceId: input.workspaceId, liveTurns: live });
      const columns = boardOf(ctx.db, {
        ...input,
        /*
         * Esperar vaga só existe onde há vaga para esperar (Q54).
         *
         * Em `manual` — que é o **default do produto** — nada puxa a fila: a
         * `tick` lê e devolve zero. Suprimir o relógio ali marcaria como
         * *"esperando vaga"* um cartão que ninguém nunca vai buscar, e ele
         * jamais ficaria âmbar — a Q54 ao contrário, que é apagar o aviso em vez
         * de apagar o falso positivo. A condição é a mesma que a esteira usa
         * para decidir se roda.
         */
        waiting:
          queue.autonomy === "manual" ? new Set<string>() : beyondSlots(queue.entries, queue.slots),
      });
      const byTask = liveTurnsByTask(ctx.db, live);
      const paused = pausesByTask(ctx.db, ctx.acpManager.rateLimits());
      /*
       * O interruptor do workspace entra na leitura do quadro porque o selo
       * depende dele: `aguardando revisor` e `manual — ninguém pega` são o mesmo
       * cartão, e o que os separa é a esteira estar ligada. Uma leitura, como a
       * T6 decidiu — e é uma linha, não sete.
       */
      const space = ctx.db.query.workspace.findFirst({
        where: (table, { eq: is }) => is(table.id, input.workspaceId),
      });

      return Promise.resolve(space).then((row): BoardColumn[] => {
        const running = row?.autonomy === "assistido" || row?.autonomy === "autonomo";
        return columns.map((column) => ({
          status: column.status,
          cards: column.cards.map((card) => {
            const seal = sealOf({
              status: column.status,
              liveTurns: byTask.get(card.id) ?? [],
              pausedUntil: paused.get(card.id) ?? null,
              blockedReason: card.blockedReason,
              // A tarefa que você assumiu não espera máquina nenhuma, e o selo
              // dela tem que dizer isso — senão o cartão promete uma esteira
              // que a própria fila já recusou.
              autonomyOn: running && card.autonomy !== "off",
            });
            // A frase vem pronta do daemon, porque quem sabe se você já foi
            // avisado é ele (T35).
            const notice = noticeFor(card.title, {
              status: column.status,
              seal,
              notifiedAt: card.notifiedAt,
            });
            return toWireCard(card, seal, notice);
          }),
        }));
      });
    }),

  get: publicProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) => (await createTaskRepository(ctx.db).get(input.id)) ?? null),

  /** A tarefa para a qual este checkout existe, ou `null` — o caso mais comum. */
  getByWorktree: publicProcedure
    .input(z.object({ worktreeId: z.string().min(1) }))
    .query(
      async ({ ctx, input }) =>
        (await createTaskRepository(ctx.db).findByWorktree(input.worktreeId)) ?? null,
    ),

  create: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        title: titleSchema,
        body: z.string().optional(),
        links: z.array(z.string().url()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const created = await createTaskRepository(ctx.db).create({ ...input, actor: "human" });
        ctx.events.emit({ type: "task.changed", workspaceId: created.workspaceId });
        return created;
      }),
    ),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: titleSchema.optional(),
        body: z.string().optional(),
        links: z.array(z.string().url()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...patch } = input;
        const updated = await createTaskRepository(ctx.db).update(id, patch);
        ctx.events.emit({ type: "task.changed", workspaceId: updated.workspaceId });
        return updated;
      }),
    ),

  setStatus: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: statusSchema,
        reason: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const moved = await createTaskRepository(ctx.db).setStatus(input.id, input.status, {
          actor: "human",
          reason: input.reason,
        });
        ctx.events.emit({ type: "task.changed", workspaceId: moved.workspaceId });
        return moved;
      }),
    ),

  /**
   * O arrasto do quadro: a coluna e o lugar nela (`028` §4.3, T5).
   *
   * `index` é para onde o ponteiro apontou, e o daemon renumera a coluna de
   * destino inteira numa transação — a posição **é** a prioridade, então ela
   * tem que sobreviver a recarregar.
   */
  /**
   * As colunas em que a esteira trabalha.
   *
   * As mesmas quatro etapas devidas da `queue.ts`, e a duplicação é deliberada:
   * ali elas são a **fila** e aqui são a fronteira de um gesto. Importar a lista
   * de lá amarraria o router ao módulo da esteira por uma coincidência de
   * conteúdo — e no dia em que a fila deixar de pegar `open`, o arrasto para a
   * To-Do não deveria mudar de significado junto.
   */
  move: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: statusSchema,
        index: z.number().int().min(0),
        reason: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const tasks = createTaskRepository(ctx.db);
        const moved = await tasks.move(input.id, {
          status: input.status,
          index: input.index,
          actor: "human",
          reason: input.reason,
        });

        /*
         * Arrastar para uma coluna em que alguém trabalha **desliga a autonomia
         * daquela tarefa** (`028` Q40).
         *
         * Não é conceito novo: o §6, Parte 4 já define **assumir** como *"abre a
         * conversa e desliga a autonomia daquela tarefa"*, e a Q40 decidiu que o
         * arrasto é um **segundo caminho para o mesmo interruptor**. Sem isto, a
         * regra da fila pegaria exatamente o cartão que você acabou de puxar
         * para fazer na mão — etapa devida, nenhum trabalhador — e começaria a
         * gastar por cima do seu trabalho.
         *
         * **Só desliga, nunca liga de volta.** Tirar o cartão de uma coluna da
         * máquina não é dizer *"pode pegar"*; quem liga é você, e é um gesto com
         * nome.
         */
        const final =
          HANDS_ON_COLUMNS.has(input.status) && moved.autonomy !== "off"
            ? await tasks.setAutonomy(input.id, "off")
            : moved;

        ctx.events.emit({ type: "task.changed", workspaceId: final.workspaceId });
        return final;
      }),
    ),

  /**
   * O clique do `assistido` (`028` Parte 2, T30 · Q51).
   *
   * Abre o adaptador e manda **o que já estava preparado**. O prompt não é
   * remontado: é a promessa do degrau — *"você vê o que ele **ia** fazer"* — e
   * remontar aqui abriria a janela em que a tarefa mudou entre preparar e
   * clicar.
   */
  sendPrepared: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      if (!ctx.conveyor) {
        // Só acontece num daemon montado sem esteira, que hoje é só teste. A
        // frase existe para o dia em que não for.
        throw new DomainError("BLOCKED", "a esteira não está montada neste daemon");
      }
      await ctx.conveyor.send(input.id);
      const sent = await createTaskRepository(ctx.db).get(input.id);
      if (sent) ctx.events.emit({ type: "task.changed", workspaceId: sent.workspaceId });
      return { ok: true as const };
    }),
  ),

  /**
   * O `Done` que limpa (`028` §6, Parte 4 — T40 · Q27 e Q58).
   *
   * Move para `done` e **remove a worktree se puder**. Quando não pode, a
   * tarefa **anda do mesmo jeito** e a worktree fica: `done` é sobre a tarefa, e
   * a limpeza é sobre o disco — recusar a mudança de coluna por causa de um
   * rascunho seria a tarefa ficando refém de um arquivo.
   *
   * A resposta diz o que aconteceu com o checkout, e é a tela que decide o que
   * oferecer com isso — o daemon **não** pergunta. É a mesma forma do portão de
   * confiança da [`012`](../../../../docs/features/012-project-scripts/prd.md).
   */
  finish: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const tasks = createTaskRepository(ctx.db);
      const target = await tasks.get(input.id);
      if (!target) throw new DomainError("NOT_FOUND", `tarefa ${input.id} não existe`);

      const done = await tasks.setStatus(input.id, "done");
      ctx.events.emit({ type: "task.changed", workspaceId: done.workspaceId });

      const checkout =
        target.worktreeId === null
          ? undefined
          : await ctx.db.query.worktree.findFirst({
              where: (table, { eq: is }) => is(table.id, target.worktreeId!),
            });
      // Tarefa sem checkout é o caso comum de quem trabalhou no principal: não
      // há disco para limpar, e dizer isso é melhor que devolver silêncio.
      if (!checkout) return { task: done, cleanup: { kind: "none" as const } };

      const owner = await ctx.db.query.project.findFirst({
        where: (table, { eq: is }) => is(table.id, target.projectId),
      });
      const space = await ctx.db.query.workspace.findFirst({
        where: (table, { eq: is }) => is(table.id, target.workspaceId),
      });

      /*
       * Se o `git` não consegue responder, **não se apaga nada**.
       *
       * O caminho sumiu, o repositório foi movido, o `git` não está instalado:
       * nos três a resposta certa é a mesma, e é a conservadora. Deixar subir
       * derrubaria o `finish` **depois** de a tarefa já ter andado — o quadro
       * mostraria `done` e a tela um erro, sobre coisas diferentes.
       */
      const decision = await cleanupFactsOf(ctx.git, {
        path: checkout.path,
        branch: checkout.branch,
        baseBranch: owner?.defaultBranch ?? "main",
      })
        .then((disk) =>
          decideCleanup({ ...disk, alwaysRemovesWhenMerged: space?.mergedAlwaysRemoves ?? false }),
        )
        .catch(
          (error: unknown): CleanupDecision => ({
            kind: "keep",
            reason: `não deu para ler o checkout: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );

      if (decision.kind === "keep") return { task: done, cleanup: decision };

      await ctx.scripts.stopAll({ scopeType: "worktree", scopeId: checkout.id });
      /*
       * `--force`, e ele é a decisão sendo executada — não um atalho.
       *
       * O segundo caso da Q27 é *"sujo e mesclado, com o interruptor ligado →
       * remove"*, e a frase que o `decideCleanup` devolve diz o que se perde:
       * `mesclada — N arquivos não commitados descartados`. Sem `--force`, o
       * `git worktree remove` **recusa** uma worktree com arquivo modificado ou
       * não rastreado, e a exceção subia depois de a tarefa já estar em `done` e
       * de o `stopAll` ter rodado, mas antes de a linha sair do banco: tarefa
       * concluída, scripts parados, worktree suja intacta e erro na tela — o
       * split que o comentário acima existe para evitar. Na prática o
       * interruptor nunca removia worktree suja, que é o único caso para o qual
       * ele foi escrito.
       */
      await ctx.git.removeWorktree({
        repoPath: owner?.path ?? checkout.path,
        path: checkout.path,
        force: decision.kind === "remove",
      });
      await createWorktreeRepository(ctx.db).remove(checkout.id);
      ctx.events.emit({ type: "worktree.changed", projectId: target.projectId });
      return { task: done, cleanup: decision };
    }),
  ),

  /**
   * **Parar** (`028` §6, Parte 4 — T38 · Q57).
   *
   * Dois verbos, e este é o que custa: existe um turno **em voo**, e ele está
   * gastando agora. `assumir` só desliga o interruptor; `parar` interrompe.
   *
   * **A ordem é `cancel` e depois o interruptor**, e ela é cobrada por teste:
   * desligar primeiro deixa uma janela em que a passada seguinte já não pega o
   * cartão e o turno velho continua gastando — a esteira não o mataria, porque
   * ela não olha mais para ele.
   *
   * **A worktree fica**, sempre. É o §6 e é o mesmo princípio do UC6: *"com tudo
   * o que já foi feito: é o valor que sobra, e às vezes é a maior parte dele"*.
   */
  stop: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const tasks = createTaskRepository(ctx.db);
      const target = await tasks.get(input.id);
      if (!target) throw new DomainError("NOT_FOUND", `tarefa ${input.id} não existe`);

      /*
       * Cancela **todas** as sessões desta tarefa, e não *"a"* sessão.
       *
       * A esteira abre uma por tentativa, e uma tentativa anterior pode ter
       * deixado processo de pé — o teto de tempo cancela, mas um daemon que
       * reiniciou no meio não cancelou nada. Parar tem que parar tudo.
       */
      const live = new Set(ctx.acpManager.liveTurns().map((turn) => turn.sessionId));
      const rows = await ctx.db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.taskId, input.id));
      for (const row of rows) {
        if (!live.has(row.id)) continue;
        try {
          ctx.acpManager.cancel(row.id);
        } catch {
          /*
           * A sessão morreu entre a leitura e o cancelamento — corrida real, e
           * curta. Deixar subir abortaria o `parar` **antes** de desligar o
           * interruptor, e aí o clique não teria feito nada: a fila pegaria o
           * cartão de volta na passada seguinte. Um turno que já acabou é o
           * resultado que o cancelamento queria.
           */
        }
      }

      const stopped = await tasks.setAutonomy(input.id, "off");
      ctx.events.emit({ type: "task.changed", workspaceId: stopped.workspaceId });
      return stopped;
    }),
  ),

  /**
   * Ligar de volta a autonomia desta tarefa, ou desligá-la sem arrastar
   * (`028` Q40).
   *
   * O arrasto para uma coluna de trabalho **só desliga**; ligar é este gesto, e
   * ele tem nome porque *"pode pegar"* é uma decisão sua.
   */
  setAutonomy: publicProcedure
    .input(z.object({ id: z.string().min(1), autonomy: z.enum(["inherit", "off"]) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const saved = await createTaskRepository(ctx.db).setAutonomy(input.id, input.autonomy);
        ctx.events.emit({ type: "task.changed", workspaceId: saved.workspaceId });
        return saved;
      }),
    ),

  /**
   * O que foi dito sobre esta tarefa (`028` Parte 2, T21).
   *
   * Em ordem de escrita, com a proveniência junto: quem lê sabe se aquilo veio
   * de você ou de um agente sem perguntar. A [Q50](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
   * tirou o comentário do portão da inbox, e a proveniência é o que sobrou da
   * regra.
   */
  comments: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(({ ctx, input }) => createTaskCommentRepository(ctx.db).listByTask(input.taskId)),

  comment: publicProcedure
    .input(z.object({ taskId: z.string().min(1), body: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        // Sem `actor`: pela porta da tela quem escreve é **você**. O agente
        // escreve pela esteira, que passa a sessão junto — e é a sessão que
        // torna a proveniência verificável em vez de declarada.
        const saved = await createTaskCommentRepository(ctx.db).create({
          taskId: input.taskId,
          body: input.body,
        });
        return saved;
      }),
    ),

  /**
   * Marca que você já foi avisado sobre o estado atual (`028` Parte 4, T35).
   *
   * Chamada pela aba **depois** de mostrar. Devolve se **esta** chamada foi a
   * que escreveu: com duas abas abertas, a segunda recebe `false` e não
   * notifica, que é *"uma vez, sem repetir"* funcionando contra o daemon e não
   * contra o navegador.
   */
  markNotified: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const first = await createTaskRepository(ctx.db).markNotified(input.id);
      // Sem `task.changed`: o aviso não muda nada que a tela pinte, e um evento
      // aqui faria todo quadro aberto refazer a leitura por causa de uma
      // notificação que só interessa a quem a mostrou.
      return { first };
    }),
  ),

  /** A tarefa passa a apontar para um checkout que já existe ([T5]). */
  attachWorktree: publicProcedure
    .input(z.object({ id: z.string().min(1), worktreeId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const linked = await createTaskRepository(ctx.db).attachWorktree(
          input.id,
          input.worktreeId,
        );
        ctx.events.emit({ type: "task.changed", workspaceId: linked.workspaceId });
        return linked;
      }),
    ),

  remove: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const repository = createTaskRepository(ctx.db);
      // Lido antes de apagar só para saber a quem avisar: depois do delete não
      // há de onde tirar o workspace.
      const found = await repository.get(input.id);
      await repository.remove(input.id);
      if (found) ctx.events.emit({ type: "task.changed", workspaceId: found.workspaceId });
      return { ok: true as const };
    }),
  ),
});

/**
 * Quantas sessões deste workspace existem, e quantas servem tarefa.
 *
 * O escopo de uma sessão é polimórfico — projeto ou worktree —, então são duas
 * junções e não uma: `scope_id` aponta para `project.id` ou para `worktree.id`,
 * e nenhum estrangeiro expressa isso. A soma das duas é o denominador honesto.
 */
async function sessionsOfWorkspace(
  db: Context["db"],
  workspaceId: string,
): Promise<{ total: number; withTask: number }> {
  const direct = await db
    .select({ taskId: session.taskId })
    .from(session)
    .innerJoin(project, eq(project.id, session.scopeId))
    .where(and(eq(session.scopeType, "project"), eq(project.workspaceId, workspaceId)));

  const viaWorktree = await db
    .select({ taskId: session.taskId })
    .from(session)
    .innerJoin(worktree, eq(worktree.id, session.scopeId))
    .innerJoin(project, eq(project.id, worktree.projectId))
    .where(and(eq(session.scopeType, "worktree"), eq(project.workspaceId, workspaceId)));

  const rows = [...direct, ...viaWorktree];
  return {
    total: rows.length,
    withTask: rows.filter((row) => row.taskId !== null).length,
  };
}
