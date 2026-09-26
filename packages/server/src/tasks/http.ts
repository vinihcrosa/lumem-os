import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Db } from "../db/index.js";
import { project, session, task } from "../db/schema.js";
import type { EventBus } from "../events.js";
import { isDomainError } from "../errors.js";
import { createTaskRepository } from "../repositories/task.js";
import { createTaskFindingRepository } from "../repositories/task-finding.js";
import { createTaskReviewRepository } from "../repositories/task-review.js";
import { DUE_STAGES } from "./queue.js";

/**
 * A porta do agente para criar tarefa (`022-workspace-tasks` F3).
 *
 * **A mesma porta da memória**, e pelo mesmo motivo: HTTP e texto puro, porque o
 * agente já tem shell e `curl` funciona de qualquer `cwd` sem instalar nada. Uma
 * chamada tRPC pediria o envelope `?input={...}` codificado, e ensinar isso a um
 * agente é ensinar a errar.
 *
 * **Fora do `/trpc`, e por isso o `DAEMON_PREFIXES` precisa conhecer `/tasks`.**
 * O daemon serve o web na própria porta desde a `014`: sem o prefixo, esta rota
 * é engolida pelo servidor de arquivos — e o sintoma só aparece **no pacote
 * instalado**, nunca em `pnpm dev`, onde o vite serve o web em outra porta.
 */

/**
 * Quantas tarefas uma **tarefa** pode criar (T8).
 *
 * Por tarefa e não por sessão: a esteira da `028` dá três sessões a cada tarefa
 * — implementador, revisor, testador —, e "cinco por sessão" viraria quinze sem
 * ninguém ter decidido isso. As três dividem o mesmo bolso, igual ao teto de
 * custo.
 *
 * O que ele protege não é o banco — tarefa é registro puro, e quinhentas linhas
 * no SQLite não custam nada. É **a sua atenção**, e sobretudo o caminho que não
 * passa por você: tarefa para o próprio projeto entra direto como `open`.
 */
export const DEFAULT_TASK_BUDGET = 5;

const createBody = z.object({
  title: z.string().trim().min(1),
  body: z.string().optional(),
  /** O **nome** do projeto, resolvido dentro do workspace da sessão. */
  project: z.string().trim().min(1),
});

/**
 * O parecer do revisor, em dois baldes (`028` Parte 7 — T53).
 *
 * **`blocks` exige `command`; `notes` recusa.** É a regra da
 * [Q67](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * escrita onde o agente a encontra: um achado que segura o cartão tem que trazer
 * como demonstrá-lo, porque quem o arbitra é a máquina — ela vai rerodar.
 *
 * Um parecer **vazio é uma resposta legítima**, e é por isso que `findings` pode
 * ser `[]`: *"não achei nada que segure"* é o que o revisor diz quando não achou,
 * e obrigá-lo a achar é o defeito que a Parte 7 existe para não criar.
 */
const reviewBody = z.object({
  findings: z
    .array(
      z.object({
        bucket: z.enum(["blocks", "notes"]),
        title: z.string().trim().min(1),
        detail: z.string().optional(),
        /** O comando que demonstra. O daemon **vai rodá-lo**. */
        command: z.string().trim().min(1).optional(),
        /** O que ele deve mostrar. É contra isto que a saída é lida. */
        expected: z.string().optional(),
      }),
    )
    .max(50),
});

export interface RegisterTaskHttpOptions {
  app: FastifyInstance;
  db: Db;
  events: EventBus;
  /** Quantas tarefas cada tarefa pode gerar. `0` desliga a porta inteira. */
  budget?: number;
}

/**
 * De qual sessão veio o pedido, e o que ela alcança.
 *
 * A dívida do `?session=` é a mesma da memória, e está nomeada aqui: a F4 do
 * [daemon-auth](../../../../docs/features/019-daemon-auth/prd.md) é quem dá um
 * token de sessão de verdade. Até ela existir, o id da sessão **é** a
 * credencial — quem já está dentro da máquina pode forjar um, e o modelo de
 * ameaça do 019 é justamente sobre quem não está.
 */
async function scopeOfSession(db: Db, sessionId: string) {
  const row = await db.query.session.findFirst({ where: eq(session.id, sessionId) });
  if (!row) return null;

  const scopeProjectId =
    row.scopeType === "project"
      ? row.scopeId
      : ((await db.query.worktree.findFirst({ where: (w, { eq: is }) => is(w.id, row.scopeId) }))
          ?.projectId ?? null);
  if (scopeProjectId === null) return null;

  const own = await db.query.project.findFirst({ where: eq(project.id, scopeProjectId) });
  if (!own) return null;

  return { session: row, workspaceId: own.workspaceId, projectId: own.id, projectName: own.name };
}

export function registerTaskHttp({
  app,
  db,
  events,
  budget = DEFAULT_TASK_BUDGET,
}: RegisterTaskHttpOptions): void {
  app.post("/tasks", async (request, reply) => {
    reply.type("text/plain; charset=utf-8");

    const sessionId = (request.query as { session?: string }).session;
    if (sessionId === undefined) {
      return reply.code(400).send("faltou a sessão: use ?session=<id>\n");
    }
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send("o corpo precisa de title e project\n");
    }

    const scope = await scopeOfSession(db, sessionId);
    if (scope === null) return reply.code(404).send(`não conheço a sessão ${sessionId}\n`);

    const target = await db.query.project.findFirst({
      where: (row, { and, eq: is }) =>
        and(is(row.workspaceId, scope.workspaceId), is(row.name, parsed.data.project)),
    });
    if (!target) {
      // O nome, e não o id: é o que o agente sabe dizer, e a recusa nomeia o
      // workspace para ele não ficar adivinhando de que lista ele saiu.
      return reply
        .code(404)
        .send(`não existe projeto "${parsed.data.project}" neste workspace\n`);
    }

    /*
     * O orçamento, contado **pela tarefa da sessão**.
     *
     * Uma sessão que não serve tarefa nenhuma conta contra a própria sessão —
     * senão a porta ficaria sem teto exatamente no caminho mais solto, que é o
     * de uma conversa avulsa.
     */
    const bucket = scope.session.taskId;
    const spent =
      bucket === null
        ? (await db.select().from(task).where(eq(task.createdBySession, sessionId))).length
        : await countForTask(db, bucket);

    if (spent >= budget) {
      return reply
        .code(429)
        .send(
          `orçamento de criação esgotado: ${String(budget)} tarefas por tarefa. ` +
            `Diga o que falta na conversa — eu crio.\n`,
        );
    }

    const repository = createTaskRepository(db);
    try {
      const created = await repository.create({
        workspaceId: scope.workspaceId,
        projectId: target.id,
        title: parsed.data.title,
        ...(parsed.data.body === undefined ? {} : { body: parsed.data.body }),
        actor: "agent",
        sessionId,
        // §3.2, palavra por palavra da memória: para o **próprio** projeto entra
        // `open`; para **outro**, `proposed` e passa pela sua triagem. Escrever
        // para cima é proposta.
        status: target.id === scope.projectId ? "open" : "proposed",
      });
      events.emit({ type: "task.changed", workspaceId: created.workspaceId });

      return reply.send(
        created.status === "proposed"
          ? `proposta criada em "${target.name}" — ela espera a revisão dele antes de virar trabalho\n`
          : `tarefa criada em "${target.name}"\n`,
      );
    } catch (error) {
      if (isDomainError(error)) return reply.code(400).send(`${error.message}\n`);
      throw error;
    }
  });

  /**
   * O parecer do revisor (`028` Parte 7 — T53).
   *
   * **A porta existe porque o texto do turno não é lido por nada**, e não podia
   * ser: ler a conversa para extrair um veredito seria construir a esteira em
   * cima de prosa. O agente **posta** o que achou, com a mesma forma do
   * `POST /tasks` — e o que ele posta é estrutura, não opinião.
   *
   * Quem chama é o encaixe **revisor**, e o `?session=` é o que liga o parecer à
   * volta: o portão lê o que **esta** sessão postou neste turno, e não o que
   * está na tabela desde ontem.
   */
  app.post("/tasks/:id/findings", async (request, reply) => {
    reply.type("text/plain; charset=utf-8");
    const { id } = request.params as { id: string };

    const sessionId = (request.query as { session?: string }).session;
    if (sessionId === undefined) {
      return reply.code(400).send("faltou a sessão: use ?session=<id>\n");
    }
    const parsed = reviewBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(
          "o corpo precisa de `findings`: uma lista de { bucket, title } — " +
            "`blocks` leva `command`, `notes` não leva\n",
        );
    }

    const scope = await scopeOfSession(db, sessionId);
    if (scope === null) return reply.code(404).send(`não conheço a sessão ${sessionId}\n`);
    if (scope.session.taskId !== id) {
      // A sessão serve **uma** tarefa, e postar parecer noutra seria um agente
      // opinando sobre trabalho que ele não viu.
      return reply.code(403).send("esta sessão não serve esta tarefa\n");
    }

    /*
     * O papel vem da **etapa**, e não de uma coluna na sessão.
     *
     * É a mesma tabela que a `queueOf` usa para decidir quem trabalha em cada
     * coluna, e ela é a única fonte disso no produto. Uma coluna nova na sessão
     * seria uma segunda, livre para divergir da primeira.
     */
    const current = await db.query.task.findFirst({ where: eq(task.id, id) });
    if (!current) return reply.code(404).send(`não conheço a tarefa ${id}\n`);
    const role = DUE_STAGES.find((stage) => stage.status === current.status)?.role ?? "revisor";

    const findings = createTaskFindingRepository(db);
    try {
      for (const one of parsed.data.findings) {
        await findings.record({
          taskId: id,
          foundBySession: sessionId,
          role,
          bucket: one.bucket,
          title: one.title,
          ...(one.detail === undefined ? {} : { detail: one.detail }),
          ...(one.command === undefined ? {} : { command: one.command }),
          ...(one.expected === undefined ? {} : { expected: one.expected }),
        });
      }
    } catch (error) {
      if (isDomainError(error)) return reply.code(400).send(`${error.message}\n`);
      throw error;
    }

    const blocks = parsed.data.findings.filter((one) => one.bucket === "blocks").length;
    const notes = parsed.data.findings.length - blocks;

    /*
     * O recibo, e ele é o que faz um parecer **vazio** existir.
     *
     * Sem esta linha, *"olhei e não achei nada"* não grava nada em lugar nenhum
     * — e o portão, que lê achados, conclui que o revisor não entregou. O cartão
     * fica em `In Review` para sempre porque o revisor acertou.
     */
    await createTaskReviewRepository(db).record({
      taskId: id,
      bySession: sessionId,
      role,
      blocks,
      notes,
    });

    events.emit({ type: "task.changed", workspaceId: scope.workspaceId });
    return reply.send(
      parsed.data.findings.length === 0
        ? "parecer sem achados — o cartão segue\n"
        : `${String(blocks)} que seguram, ${String(notes)} anotados. ` +
            "Os que seguram vão ser rerodados pelo daemon.\n",
    );
  });

  /**
   * *"Acho que terminei"* (T7).
   *
   * `review` e nunca `done`: `done` fecha custo, fecha a worktree como candidata
   * a remoção e alimenta "o que este workspace fez" — e um agente não sabe nada
   * disso. A **Q069 continua aberta** para o sinal canônico; se na prática o
   * agente nunca chamar, o dado diz isso e "você marca" é o que sobra sem custo.
   */
  app.post("/tasks/:id/review", async (request, reply) => {
    reply.type("text/plain; charset=utf-8");
    const { id } = request.params as { id: string };

    try {
      const moved = await createTaskRepository(db).setStatus(id, "review", { actor: "agent" });
      events.emit({ type: "task.changed", workspaceId: moved.workspaceId });
      return reply.send(`"${moved.title}" está em review — quem marca done é uma pessoa\n`);
    } catch (error) {
      if (isDomainError(error)) {
        return reply.code(error.code === "NOT_FOUND" ? 404 : 409).send(`${error.message}\n`);
      }
      throw error;
    }
  });
}

/**
 * Quantas tarefas as sessões desta tarefa já criaram, somadas.
 *
 * Contado por **quem serve a tarefa agora**, e não por um contador guardado: o
 * bolso é derivado, como tudo que este produto consegue derivar. A consequência
 * honesta é que mover uma sessão de uma tarefa para outra move o que ela gastou
 * junto — e ninguém faz isso, porque a coluna é escrita quando a sessão nasce.
 */
async function countForTask(db: Db, taskId: string): Promise<number> {
  const sessions = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.taskId, taskId));
  if (sessions.length === 0) return 0;

  // `inArray` e não um `select` da tabela inteira filtrado em memória: a
  // primeira versão lia todas as tarefas do banco para contar as de uma —
  // barato com dez, e o tipo de coisa que ninguém percebe crescer.
  const created = await db
    .select({ id: task.id })
    .from(task)
    .where(
      inArray(
        task.createdBySession,
        sessions.map((row) => row.id),
      ),
    );
  return created.length;
}
