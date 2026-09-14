import { adapterById } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";

import { createAgentCatalog, type Role } from "../agents/catalog.js";
import type { Db } from "../db/index.js";
import { project, worktree } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { GitService } from "../git/GitService.js";
import { createTaskRepository } from "../repositories/task.js";
import { createTaskCommentRepository } from "../repositories/task-comment.js";
import { readProjectScripts } from "../scripts/project-scripts.js";
import type { ScriptRunner } from "../scripts/ScriptRunner.js";

import type { ConveyorPorts, GateVerdict, PreparedCheckout } from "./conveyor.js";
import { decideGate } from "./gate.js";
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
  }): Promise<{ sessionId: string }>;
  prompt(input: { sessionId: string; text: string }): Promise<void>;
  /** Interrompe um turno que passou do teto. Falhar aqui não é fatal. */
  cancel(sessionId: string): Promise<void>;
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
const NEXT_STAGE: Record<string, string> = {
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
      return { worktreeId: checkout.id, path: checkout.path, dirty: !status.clean };
    },

    openSession: async ({ taskId, adapter, model, cwd, worktreeId }) => {
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
      return deps.openAgentSession({ taskId, adapter, model, cwd, worktreeId, agentMode });
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

    async gate(entry, checkout) {
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
      const [status, ahead] = await Promise.all([
        deps.git.getStatus(checkout.path),
        deps.git
          .getAheadBehind(checkout.path, owner?.defaultBranch ?? "main")
          .catch(() => ({ ahead: 0, behind: 0 })),
      ]);
      const committed = status.clean && ahead.ahead > 0;

      return decideGate({
        committed,
        testExitCode,
        hasTest,
        pr: await deps.prVerdictOf(checkout.worktreeId),
      });
    },

    countAttempt: (taskId) => tasks.countAttempt(taskId),

    advance: async ({ task: row }) => {
      const next = NEXT_STAGE[row.status];
      // Sem etapa seguinte a seta não anda, e isso não é erro: `ready_to_merge`
      // é sua vez, e a esteira acabou de chegar nela.
      if (next === undefined) return;
      await tasks.setStatus(row.id, next as "review", { actor: "agent" });
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
