import type { Role } from "../agents/catalog.js";
import type { TaskRow } from "../db/schema.js";
import { DomainError } from "../errors.js";

import type { Autonomy, QueueEntry, QueueFacts } from "./queue.js";
import { promptFor } from "./prompts.js";

/**
 * A esteira (`028` §6, Parte 2 — T27).
 *
 * **Orquestração pura, com as pontas injetadas.** Nenhuma linha daqui sabe o que
 * é `git`, `spawn` ou SQLite — a mesma direção de dependência que o `preamble` e
 * o `budget` seguem no `AcpManager`, e pelo mesmo motivo: quem constrói a esteira
 * sabe as duas coisas, e a esteira sabe **a política**.
 *
 * O que ela decide, e nenhuma das três é óbvia:
 *
 * 1. **turno acabado não é tarefa acabada.** Dos 13 `end_turn` gravados neste
 *    repositório, **4** significaram *terminei*, e três foram o turno morrendo no
 *    meio do trabalho. O `stopReason` não decide nada aqui — quem decide é o
 *    portão, que é fato verificável de fora do agente;
 * 2. **a tentativa é contada antes do prompt.** Um daemon que morre no meio do
 *    turno teria contado zero se contasse depois, e a tarefa voltaria à fila com
 *    o orçamento intacto — para sempre;
 * 3. **nada aqui move a seta por conta do agente.** O §4.1 é explícito: *"quem
 *    move é o daemon, nunca um agente"*.
 */

/**
 * Quantas vezes por etapa.
 *
 * **Dois**, que é o default do `block_recurrence_limit` do
 * [Compozy](../../../../docs/references/compozy.md), e o
 * [estudo](../../../../docs/project/conveyor-durable-state.md) diz por que o
 * número não foi inventado aqui: *"é número, e número sem uso é chute"*. Ele
 * muda quando a esteira rodar contra trabalho de verdade.
 */
export const MAX_ATTEMPTS = 2;

export interface PreparedCheckout {
  worktreeId: string;
  path: string;
  /** `git status` não está limpo — o fato da Q49, e nada além dele. */
  dirty: boolean;
}

/** O que o portão respondeu. `pass` move a seta; o resto não. */
export type GateVerdict =
  | { kind: "pass" }
  | { kind: "fail"; reason: string }
  /** Nem verde nem vermelho: o trabalho não chegou ao ponto de ser julgado. */
  | { kind: "unfinished"; reason: string };

export interface ConveyorPorts {
  /** A fila deste workspace, agora (T24). */
  queue(workspaceId: string): QueueFacts;
  /** Qual agente faz este papel nesta tarefa, pela cascata do §5.1. */
  agentFor(input: {
    taskId: string;
    role: Role;
  }): Promise<{ adapter: string; model: string | null; instructions: string }>;
  /** A worktree, criada ou reusada, com o `setup` já rodado (T26). */
  prepareCheckout(entry: QueueEntry): Promise<PreparedCheckout>;
  /**
   * Abre a sessão do encaixe.
   *
   * Em `bypassPermissions`, e isso **não** é escrito aqui: a
   * [Q43](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
   * mediu que dos cinco modos do Claude só ele fecha o laço, e a
   * [Q41](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
   * decidiu que a postura de permissão é **do adaptador, declarada na `spec`**.
   * Quem traduz é quem implementa esta porta.
   */
  openSession(input: {
    taskId: string;
    role: Role;
    adapter: string;
    model: string | null;
    cwd: string;
    /** O escopo da sessão. Uma conversa da esteira mora **no checkout**. */
    worktreeId: string;
  }): Promise<{ sessionId: string }>;
  /** Manda o prompt e espera o turno. O motivo da parada é ignorado de propósito. */
  prompt(input: { sessionId: string; text: string }): Promise<void>;
  /** O portão do §4.1: `test` local, e o check da PR quando há PR (T28). */
  gate(entry: QueueEntry): Promise<GateVerdict>;
  /** Mais uma tentativa **nesta etapa**, e devolve o total. */
  countAttempt(taskId: string): Promise<number>;
  /** O daemon movendo a seta. Nenhum agente chama isto. */
  advance(input: { task: TaskRow; role: Role }): Promise<void>;
  /** Tentativa esgotada: o cartão para, com o motivo. */
  block(input: { taskId: string; reason: string }): Promise<void>;
  /** O que este turno deixou registrado na tarefa (T21). */
  comment(input: { taskId: string; body: string; sessionId: string }): Promise<void>;
  /**
   * O `assistido`: prepara e **para**, com o prompt visível (Q51).
   *
   * `null` limpa — é o que enviar faz, e o que mudar de etapa já fazia sozinho.
   */
  park(
    input: { taskId: string; role: Role; prompt: string; worktreeId: string } | null,
    taskId?: string,
  ): Promise<void>;
  /** O que está preparado nesta tarefa, com o que falta para enviar. */
  prepared(taskId: string): Promise<{
    role: Role;
    prompt: string;
    worktreeId: string;
    checkoutPath: string;
    adapter: string;
    model: string | null;
  } | null>;
}

export interface Conveyor {
  /** Uma passada. Devolve quantas tarefas saíram da fila nesta. */
  tick(workspaceId: string): Promise<number>;
  /**
   * O clique do `assistido`: manda o que já estava preparado (Q51).
   *
   * **Não remonta o prompt.** O que foi preparado é o que vai — é a promessa do
   * degrau, e remontar aqui abriria a janela em que o corpo da tarefa mudou
   * entre a preparação e o clique, fazendo o que você aprovou não ser o que
   * seguiu.
   */
  send(taskId: string): Promise<void>;
}

export function createConveyor(ports: ConveyorPorts): Conveyor {
  async function runOne(entry: QueueEntry, autonomy: Autonomy): Promise<void> {
    const checkout = await ports.prepareCheckout(entry);

    /*
     * A tentativa conta **antes** do prompt, e é o item 2 do cabeçalho.
     *
     * Contar depois parece mais justo — *"só conta o que realmente rodou"* — e é
     * exatamente o que quebra: um daemon que morre no meio do turno não conta, a
     * tarefa volta à fila com o orçamento intacto, e o laço não tem fim. Contar
     * antes erra para o lado seguro: no pior caso uma tentativa é gasta sem ter
     * rodado, e o cartão para uma vez cedo demais — o que é visível e
     * consertável, ao contrário do outro.
     */
    const attempt = await ports.countAttempt(entry.task.id);
    if (attempt > MAX_ATTEMPTS) {
      await ports.block({
        taskId: entry.task.id,
        reason: `parou depois de ${String(MAX_ATTEMPTS)} tentativas`,
      });
      return;
    }

    const agent = await ports.agentFor({ taskId: entry.task.id, role: entry.role });
    const text = promptFor({
      role: entry.role,
      title: entry.task.title,
      body: entry.task.body,
      checkoutPath: checkout.path,
      attempt,
      dirty: checkout.dirty,
      instructions: agent.instructions,
    });

    if (autonomy === "assistido") {
      /*
       * O degrau do meio, e ele **não abre adaptador** (Q51): um processo de
       * 243 MB por cartão preparado é o que a conta recusou. O que o `assistido`
       * promete — *"você vê o que ele ia fazer"* — é o prompt, e o prompt está
       * pronto aqui.
       */
      await ports.park({
        taskId: entry.task.id,
        role: entry.role,
        prompt: text,
        worktreeId: checkout.worktreeId,
      });
      return;
    }

    const { sessionId } = await ports.openSession({
      taskId: entry.task.id,
      role: entry.role,
      adapter: agent.adapter,
      model: agent.model,
      cwd: checkout.path,
      worktreeId: checkout.worktreeId,
    });

    /*
     * O turno acaba, e o motivo dele acabar **não é lido**.
     *
     * É o item 1, e é o achado que mais restringe esta feature: dos 13
     * `end_turn` gravados, 4 significaram *terminei*. Ler o `stopReason` aqui
     * seria construir a esteira em cima de um sinal com 31% de erro no caso
     * caro. Quem responde *"acabou?"* é o portão, logo abaixo.
     */
    await ports.prompt({ sessionId, text });

    const verdict = await ports.gate(entry);
    await ports.comment({
      taskId: entry.task.id,
      sessionId,
      body: commentFor(entry.role, attempt, verdict),
    });

    if (verdict.kind === "pass") {
      await ports.advance({ task: entry.task, role: entry.role });
      return;
    }

    /*
     * Não passou. A tarefa **fica onde está** e a fila a relê na passada
     * seguinte — que é a segunda tentativa, e é assim que ela é implementada:
     * sem agenda, sem `setTimeout`, sem estado. Quando a tentativa acabar, é a
     * chamada de cima que bloqueia.
     */
    if (attempt >= MAX_ATTEMPTS) {
      await ports.block({ taskId: entry.task.id, reason: verdict.reason });
    }
  }

  return {
    async send(taskId) {
      const prepared = await ports.prepared(taskId);
      if (prepared === null) {
        throw new DomainError("BLOCKED", "não há nada preparado para enviar nesta tarefa");
      }

      const { sessionId } = await ports.openSession({
        taskId,
        role: prepared.role,
        adapter: prepared.adapter,
        model: prepared.model,
        cwd: prepared.checkoutPath,
        worktreeId: prepared.worktreeId,
      });

      /*
       * O preparo é limpo **antes** do turno, e não depois.
       *
       * Depois, um turno que demora deixaria o botão `enviar` clicável durante
       * todo ele — e o segundo clique abriria uma segunda sessão para a mesma
       * tarefa, que é exatamente o que o teto e a fila passam o arquivo inteiro
       * evitando.
       */
      await ports.park(null, taskId);
      await ports.prompt({ sessionId, text: prepared.prompt });
    },

    async tick(workspaceId) {
      const facts = ports.queue(workspaceId);
      // `manual` é o default do produto, e aqui ele é uma linha: a esteira lê a
      // fila e não faz nada com ela.
      if (facts.autonomy === "manual") return 0;

      /*
       * As vagas cortam **aqui**, e não na fila.
       *
       * A `queueOf` devolve tudo que está devido de propósito: a tela precisa
       * saber quantos estão esperando vaga, e uma fila já cortada não sabe
       * dizer a diferença entre *"não há nada"* e *"não cabe mais"*.
       */
      const taking = facts.entries.slice(0, facts.slots);
      for (const entry of taking) {
        await runOne(entry, facts.autonomy);
      }
      return taking.length;
    },
  };
}

/**
 * O que fica escrito na tarefa depois do turno.
 *
 * Curto e **factual**: é comentário de tarefa (T21), não relatório. O que a
 * [Q47](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * permite é a tarefa como **registro** — você lê também —, e o que ela proíbe é
 * a sessão A briefando a sessão B. Uma frase que diz *o que o portão respondeu*
 * é fato; um resumo do raciocínio do agente seria o canal.
 */
export function commentFor(role: Role, attempt: number, verdict: GateVerdict): string {
  const head = `${role} · tentativa ${String(attempt)}`;
  if (verdict.kind === "pass") return `${head} — portão verde`;
  return `${head} — ${verdict.reason}`;
}
