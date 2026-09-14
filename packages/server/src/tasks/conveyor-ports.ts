import { adapterById } from "@lumem/shared";
import { and, desc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";

import { createAgentCatalog, type Role } from "../agents/catalog.js";
import type { Db } from "../db/index.js";
import { project, session as sessionTable, worktree } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { GitService } from "../git/GitService.js";
import { createTaskRepository, type TaskStatus } from "../repositories/task.js";
import { createTaskCommentRepository } from "../repositories/task-comment.js";
import { createTaskFindingRepository } from "../repositories/task-finding.js";
import { readProjectScripts } from "../scripts/project-scripts.js";
import type { ScriptRunner } from "../scripts/ScriptRunner.js";

import type { ConveyorPorts, GateVerdict, PreparedCheckout } from "./conveyor.js";
import { decideGate } from "./gate.js";
import { matches, type Reproducer } from "./reproduce.js";
import { queueOf, type QueueEntry } from "./queue.js";

/**
 * As pontas da esteira, ligadas ao que o daemon já tem (`028` Parte 2, T26).
 *
 * Este arquivo é **só tradução**: a política mora no `conveyor.ts`, e aqui cada
 * porta vira git, script, ACP ou SQLite. A separação é a mesma que o `budget.ts`
 * e o `budget-source.ts` fizeram na Parte 3 — *"aqui mora o SQL e lá mora a
 * frase com que alguém pode discordar"* —, e o que ela compra é o conjunto de
 * testes do `conveyor.test.ts` rodar sem um adaptador de pé.
 */

/** O que a esteira precisa saber abrir, e o daemon já sabe. */
export interface ConveyorDeps {
  db: Db;
  git: GitService;
  scripts: ScriptRunner;
  /** Como a `026` já corta worktree: nome, origem e o registro, numa chamada. */
  createWorktree(input: {
    projectId: string;
    name: string;
    taskId: string;
  }): Promise<{ id: string; path: string }>;
  /**
   * Abre a sessão do encaixe pelo `AcpManager`, já presa à tarefa.
   *
   * `agentMode` é o modo **do agente** — vocabulário do provider, vindo da
   * `spec` —, e é diferente do `lumemMode`, que é a política do daemon. A Q41
   * mediu que os dois não se substituem: com o `lumemMode` em `ask` **e** em
   * `free`, o turno pendura no primeiro `Edit`, porque a política do Lumem é
   * **inerte** para um agente que tem modos próprios.
   */
  openAgentSession(input: {
    taskId: string;
    adapter: string;
    model: string | null;
    cwd: string;
    worktreeId: string;
    /** `null` quando o adaptador não declara um modo que não pergunta. */
    agentMode: string | null;
    /** Qual encaixe ela serve. É o que a deixa ser reencontrada (T57). */
    role: Role;
  }): Promise<{ sessionId: string }>;
  /**
   * Retoma a conversa de um encaixe que já trabalhou nesta tarefa (T57).
   *
   * `null` quando não deu — e aí a esteira abre uma nova em vez de parar.
   */
  resumeSession(sessionId: string): Promise<{ sessionId: string } | null>;
  prompt(input: { sessionId: string; text: string }): Promise<void>;
  /** Interrompe um turno que passou do teto. Falhar aqui não é fatal. */
  cancel(sessionId: string): Promise<void>;
  /** Encerra a sessão do encaixe quando o turno acabou (Parte 7 — T52). */
  closeSession(sessionId: string): Promise<void>;
  /** Roda o comando que um achado do balde `blocks` afirma demonstrar (T54). */
  reproduce: Reproducer;
  /** O turno em voo, como o `AcpManager` os relata. */
  liveTurns(): readonly { sessionId: string; startedAt: Date }[];
  /** O veredito da PR daquela worktree, ou `null`. Do `PrCache` da `013`. */
  prVerdictOf(worktreeId: string): Promise<PrLike>;
  /**
   * O marco no tracker, quando há tracker (`028` Parte 6, T46).
   *
   * Opcional na esteira inteira: uma instalação sem `LINEAR_API_KEY` é a
   * esteira que existia antes da Parte 5, e nada nela muda.
   */
  mark?(input: { taskId: string; mark: string; context?: string }): Promise<void>;
}

/** O pedaço do `PrCache` que o portão usa, e nada além dele. */
export type PrLike = "ready" | "blocked" | "pending" | "draft" | "merged" | "closed" | null;

/**
 * A etapa seguinte de cada uma, e é **aqui** que a seta anda.
 *
 * Escrita como tabela porque é política: `in_progress → review → testing →
 * ready_to_merge` é o §4 do PRD, e a `open` entra na esteira virando
 * `in_progress`, que é o que já acontece hoje quando você manda o primeiro
 * prompt à mão.
 */
const NEXT_STAGE: Record<string, TaskStatus> = {
  open: "in_progress",
  in_progress: "review",
  review: "testing",
  testing: "ready_to_merge",
};

/** Um nome de worktree que se lê: o título encurtado, e o id para não colidir. */
export function checkoutNameFor(title: string, taskId: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  // O sufixo não é enfeite: dois cartões com o mesmo título produziriam o mesmo
  // nome, e `git worktree add` recusaria o segundo — parando a esteira por causa
  // de um nome.
  return `${slug === "" ? "tarefa" : slug}-${taskId.slice(0, 6)}`;
}

export function createConveyorPorts(deps: ConveyorDeps): ConveyorPorts {
  const tasks = createTaskRepository(deps.db);
  const findings = createTaskFindingRepository(deps.db);
  const comments = createTaskCommentRepository(deps.db);
  const catalog = createAgentCatalog(deps.db);

  async function checkoutOf(entry: QueueEntry): Promise<{ id: string; path: string }> {
    if (entry.task.worktreeId !== null) {
      const found = await deps.db.query.worktree.findFirst({
        where: eq(worktree.id, entry.task.worktreeId),
      });
      /*
       * A worktree registrada some do disco — alguém apagou o diretório, um
       * `git worktree prune` passou. Cortar outra aqui mascararia isso; o
       * honesto é deixar a falha subir e virar tentativa gasta, com o motivo.
       *
       * **Com o motivo**, e é isso que a frase acrescenta: sem ela, quem
       * descobria o sumiço era o `git status` logo abaixo, e o que chegava ao
       * cartão era `ENOENT: no such file or directory` — uma frase que não fala
       * de worktree nenhuma para quem está lendo um quadro de tarefas.
       */
      if (found && !existsSync(found.path)) {
        throw new DomainError(
          "BLOCKED",
          `o checkout desta tarefa não está mais em ${found.path}`,
        );
      }
      if (found) return { id: found.id, path: found.path };
    }
    return deps.createWorktree({
      projectId: entry.task.projectId,
      name: checkoutNameFor(entry.task.title, entry.task.id),
      taskId: entry.task.id,
    });
  }

  /**
   * O parecer desta volta, **rerodado** (Parte 7 — T54).
   *
   * Lê o que **esta sessão** postou — e não o que está na tabela desde ontem —,
   * roda a reprodução de cada `blocks` e devolve o resumo que o portão lê. O
   * `notes` não é verificado por construção: não há o que rodar, e quem o
   * arbitra é uma pessoa na PR.
   */
  async function reviewVerdict(taskId: string, sessionId: string, cwd: string) {
    const posted = await findings.bySession(sessionId);
    /*
     * Nenhum registro é **diferente** de uma lista vazia.
     *
     * Vazia é *"olhei e não achei nada que segure"* — uma aprovação. Nenhum
     * registro é um turno que acabou sem entregar parecer, e o portão o trata
     * como `unfinished`: a próxima passada recomeça, em vez de o cartão andar
     * porque o revisor calou.
     */
    if (posted.length === 0) {
      return decideGate({
        role: "revisor",
        findings: null,
        committed: false,
        testExitCode: null,
        hasTest: false,
        pr: null,
      });
    }

    const reproduced: { title: string; command: string }[] = [];
    let refuted = 0;
    let notes = 0;

    for (const one of posted) {
      if (one.bucket === "notes") {
        notes += 1;
        continue;
      }
      const result = await deps.reproduce({ command: one.command!, cwd });
      const hit = matches(result, one.expected);
      /*
       * `pending` quando não deu para verificar — o teto chegou, o shell
       * sumiu. Um achado não verificado **continua segurando**, e a frase diz
       * isso: transformar *"não consegui rodar"* em aprovação seria o portão
       * falhando aberto exatamente onde ele existe para não falhar.
       */
      const verdict = result.exitCode === null ? "pending" : hit ? "reproduced" : "refuted";
      await findings.verify(one.id, verdict, result.output);
      if (verdict === "refuted") refuted += 1;
      else reproduced.push({ title: one.title, command: one.command! });
    }

    return decideGate({
      role: "revisor",
      findings: { reproduced, refuted, notes },
      committed: false,
      testExitCode: null,
      hasTest: false,
      pr: null,
    });
  }

  return {
    queue: (workspaceId) => queueOf(deps.db, { workspaceId, liveTurns: deps.liveTurns() }),

    agentFor: async ({ taskId, role }) => {
      const resolved = await catalog.resolve({ taskId, role });
      return {
        adapter: resolved.adapter,
        model: resolved.model,
        instructions: resolved.instructions,
      };
    },

    async prepareCheckout(entry): Promise<PreparedCheckout> {
      const checkout = await checkoutOf(entry);

      /*
       * O `setup` roda **e espera**, ao contrário da criação de worktree pela
       * tela, que o dispara em segundo plano de propósito. Aqui ninguém está
       * olhando: mandar o prompt antes de o `pnpm install` terminar produz um
       * turno que falha por falta de dependência e gasta uma tentativa
       * explicando isso.
       */
      await deps.scripts
        .runToCompletion({ scopeType: "worktree", scopeId: checkout.id }, "setup")
        .catch(() => {
          // Sem `setup` declarado, ou projeto ainda não confiado: os dois são
          // estados legítimos da `012`, e nenhum deles é falha da esteira.
          return null;
        });

      const status = await deps.git.getStatus(checkout.path);
      /*
       * O `HEAD` de **antes** do turno (T51). É contra ele que `committed` é
       * lido depois — o que mudou nesta passada, e não o que o implementador
       * deixou há duas etapas.
       */
      const head = await deps.git.headOf(checkout.path).catch(() => "");
      return { worktreeId: checkout.id, path: checkout.path, dirty: !status.clean, head };
    },

    openSession: async ({ taskId, role, adapter, model, cwd, worktreeId }) => {
      /*
       * A postura de permissão vem da **spec do adaptador**, nunca escrita aqui
       * (Q41 e Q43). A Q43 mediu que dos cinco modos do Claude só
       * `bypassPermissions` fecha o laço — é o único que **nunca** pergunta —, e
       * a Q41 tirou daí a regra que virou ADR: o vocabulário é do provider, e
       * quem o nomeia é o catálogo dele, não esta linha.
       *
       * `null` é um adaptador que não declara um modo assim, e a esteira abre do
       * mesmo jeito: inventar a palavra mais provável é exatamente o que o ADR
       * proíbe, e o jeito de preencher é medir.
       */
      const agentMode = adapterById(adapter)?.autonomousMode ?? null;

      /*
       * A conversa deste encaixe, se ela já existe (Parte 7 — T57).
       *
       * **Um implementador, um revisor, um testador por tarefa.** A `LUM-51`
       * produziu **seis** sessões, e cada uma pagou o contexto do zero: 453 884
       * tokens ao todo. A segunda tentativa do implementador tem que continuar a
       * conversa dele, não começar outra.
       *
       * `resume` e não "reabrir a mesma linha": `session/load` **não ressuscita**
       * o processo de ontem — ele sobe um adaptador novo e manda a conversa de
       * volta. A linha nova carrega o `acp_session_id` da velha, que é como o
       * produto já faz *"retomar"*. Por isso a mais recente é a que vale.
       */
      const previous = await deps.db
        .select({ id: sessionTable.id, state: sessionTable.state })
        .from(sessionTable)
        .where(and(eq(sessionTable.taskId, taskId), eq(sessionTable.taskRole, role)))
        .orderBy(desc(sessionTable.createdAt))
        .limit(1);

      const found = previous[0];
      if (found !== undefined) {
        /*
         * Viva é o caso comum: a esteira só fecha a conversa quando a tarefa
         * **sai** da etapa, então a segunda tentativa do mesmo encaixe cai aqui
         * e continua no **mesmo processo** — sem `session/load`, sem custo.
         */
        if (found.state === "running") return { sessionId: found.id };

        /*
         * Morta é o daemon que reiniciou: a conversa está em disco, e retomar a
         * traz de volta. Falhar ao retomar **não** para o turno — o transcript
         * sumiu, o adaptador mudou de versão —, e abrir uma nova custa contexto
         * mas entrega o trabalho.
         */
        const resumed = await deps.resumeSession(found.id).catch(() => null);
        if (resumed !== null) return resumed;
      }

      return deps.openAgentSession({ taskId, adapter, model, cwd, worktreeId, agentMode, role });
    },

    prompt: (input) => deps.prompt(input),

    ...(deps.mark === undefined
      ? {}
      : {
          mark: async (input: { taskId: string; mark: string; context?: string }) => {
            await deps.mark?.(input);
          },
        }),

    cancel: (sessionId) => deps.cancel(sessionId),

    closeSession: (sessionId) => deps.closeSession(sessionId),

    async gate(entry, checkout, sessionId) {
      /*
       * O revisor entrega **parecer**, e é a única coisa que o portão dele lê
       * (Parte 7 — T51 e T54). Nada de `test` nem de commit: o que ele produz
       * não é código.
       */
      if (entry.role === "revisor") {
        return { ...(await reviewVerdict(entry.task.id, sessionId, checkout.path)) };
      }

      const owner = await deps.db.query.project.findFirst({
        where: eq(project.id, entry.task.projectId),
      });
      const declared = owner ? await readProjectScripts(owner.path) : null;
      const hasTest = declared?.test != null;

      const testExitCode = hasTest
        ? await deps.scripts
            .runToCompletion({ scopeType: "worktree", scopeId: checkout.worktreeId }, "test")
            .catch(() => null)
        : null;

      /*
       * O commit é lido do **git**, e não do que o agente disse ter feito.
       *
       * E não basta o checkout estar limpo: um turno que não escreveu **nada**
       * também deixa o checkout limpo, e as duas situações são opostas. O que
       * separa é a branch estar à frente da base — `ahead > 0` quer dizer que
       * existe commit nesta worktree que a base não tem.
       *
       * Limpo **e** à frente: trabalho escrito e commitado. Sujo quer dizer
       * trabalho pela metade, e é o caso que a Q49 manda a tentativa seguinte
       * encontrar.
       *
       * Isto é o §4.1 aplicado ao caso mais barato — *"nem todo fato verificável
       * serve"* —, e ele serve só para a **ausência**: um commit não separa
       * *terminou* de *desistiu inventando*, e é o `test` abaixo que separa.
       */
      /*
       * `committed` é **desta passada**, e não herdado (T51).
       *
       * Antes era *árvore limpa **e** à frente da base* — e `à frente` fica
       * verdadeiro para sempre depois do primeiro commit. O `HEAD` mudou desde
       * o começo do turno é o fato que responde *"este encaixe escreveu alguma
       * coisa?"*, que é o que a frase sempre quis dizer.
       */
      const [status, head] = await Promise.all([
        deps.git.getStatus(checkout.path),
        deps.git.headOf(checkout.path).catch(() => checkout.head),
      ]);
      const committed = status.clean && head !== checkout.head;

      return decideGate({
        role: entry.role,
        findings: null,
        committed,
        testExitCode,
        hasTest,
        pr: await deps.prVerdictOf(checkout.worktreeId),
      });
    },

    returned: async (taskId) => {
      const open = await findings.blocking(taskId);
      return open
        .filter((one) => one.verification === "reproduced")
        .map((one) => ({ title: one.title, command: one.command! }));
    },

    countAttempt: (taskId) => tasks.countAttempt(taskId),

    bounce: async ({ taskId, reason }) => {
      const voltas = await tasks.countBounce(taskId);
      /*
       * O motivo fica escrito **na tarefa**, e não só no cartão: é o que o
       * implementador vai ler no prompt da volta seguinte, e é o que sobra na
       * conversa quando alguém for entender por que o cartão voltou.
       */
      await comments.create({ taskId, body: `o revisor devolveu: ${reason}`, actor: "human" });
      return voltas;
    },

    advance: async ({ task: row }) => {
      const next = NEXT_STAGE[row.status];
      // Sem etapa seguinte a seta não anda, e isso não é erro: `ready_to_merge`
      // é sua vez, e a esteira acabou de chegar nela.
      if (next === undefined) return;
      /*
       * `conveyor`, e **não** `agent` (Parte 7, T49).
       *
       * Quem move a seta aqui é o daemon, por fato verificável — o §4.1 inteiro.
       * Declarar-se agente fazia o `AGENT_MAY_SET` recusar três das quatro
       * setas, e o `throw` sumia no `catch` do laço: o cartão parava em
       * `In Review` com o revisor rodando contra ele até esgotar as tentativas.
       *
       * O `as TaskStatus` some junto: `NEXT_STAGE` passou a ser tipado, e o
       * `as "review"` de antes era o tipo mentindo exatamente onde o runtime
       * recusava.
       */
      await tasks.setStatus(row.id, next, { actor: "conveyor" });
    },

    block: async ({ taskId, reason }) => {
      /*
       * Bloquear **não** é mudar de coluna.
       *
       * O selo `bloqueada` é do §4, e situação é selo, etapa é coluna — mover a
       * tarefa para outro lugar por causa de um bloqueio apagaria onde ela
       * parou, que é a informação que faz alguém conseguir retomá-la.
       *
       * O que para a esteira é a autonomia, e o `reason` é o que a tela mostra.
       */
      await tasks.setAutonomy(taskId, "off");
      await tasks.setBlocked(taskId, reason);
    },

    comment: async ({ taskId, body, sessionId }) => {
      await comments.create({ taskId, body, actor: "agent", sessionId });
    },

    park: async (input, clearing) => {
      if (input === null) {
        if (clearing !== undefined) await tasks.prepare(clearing, null);
        return;
      }
      await tasks.prepare(input.taskId, { prompt: input.prompt, role: input.role });
    },

    async prepared(taskId) {
      const row = await tasks.get(taskId);
      if (!row || row.preparedPrompt === null || row.preparedRole === null) return null;

      const checkout =
        row.worktreeId === null
          ? null
          : await deps.db.query.worktree.findFirst({ where: eq(worktree.id, row.worktreeId) });
      /*
       * Preparado sem checkout é estado impossível pelo caminho normal — o
       * `prepareCheckout` corta a worktree antes de montar o prompt —, e mesmo
       * assim ele é tratado: alguém pode ter apagado a worktree entre preparar e
       * clicar, e enviar sem diretório abriria a sessão na raiz do repositório.
       */
      if (!checkout) return null;

      const role = row.preparedRole as Role;
      const agent = await catalog.resolve({ taskId, role });
      return {
        role,
        prompt: row.preparedPrompt,
        worktreeId: checkout.id,
        checkoutPath: checkout.path,
        adapter: agent.adapter,
        model: agent.model,
      };
    },
  };
}

export type { Role };
