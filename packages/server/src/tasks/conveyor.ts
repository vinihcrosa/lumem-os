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

/**
 * Quanto tempo um turno pode levar antes de a esteira desistir dele.
 *
 * **Existe porque um turno pode não acabar nunca**, e o e2e provou: quando o
 * agente é dono do seletor de modos, o daemon **não consulta** a política do
 * Lumem — ele manda o pedido de permissão para uma pessoa (a A1 da
 * [`016`](../../../../docs/features/016-session-mode/prd.md)). Numa sessão de
 * esteira não há pessoa, e o `session/prompt` fica pendurado até o processo
 * morrer, com o cartão dizendo `implementando` a manhã inteira.
 *
 * O caminho normal não passa por aqui: com `bypassPermissions` o agente não
 * pede nada. Este teto é o que sobra quando **não deu para escolher o modo** —
 * um adaptador cujo `autonomousMode` é `null`, uma versão que renomeou a opção,
 * um `set_mode` que falhou. Sem ele, isso é uma esteira travada sem diagnóstico;
 * com ele, é uma tentativa gasta com o motivo escrito.
 *
 * **30 minutos**, e é o mesmo número do limiar âmbar de encalhe do §6 — um
 * turno que passou disso já está pintado de âmbar no quadro, então desistir aí
 * não surpreende ninguém que esteja olhando.
 */
export const TURN_TIMEOUT_MS = 30 * 60_000;

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
  /** Interrompe um turno que passou do teto de tempo. */
  cancel(sessionId: string): Promise<void>;
  /**
   * O portão do §4.1: `test` local, e o check da PR quando há PR (T28).
   *
   * Recebe **o checkout que o turno usou**, e não o ponteiro da tarefa.
   * `entry.task` é a linha como ela estava no início da passada, e uma tarefa
   * que entrou sem worktree ganhou a dela no `prepareCheckout` — o ponteiro na
   * linha em memória continua nulo, e julgar por ele reprovaria como
   * *"sem checkout"* um turno inteiro que commitou e passou no teste.
   */
  gate(entry: QueueEntry, checkout: PreparedCheckout): Promise<GateVerdict>;
  /** Mais uma tentativa **nesta etapa**, e devolve o total. */
  countAttempt(taskId: string): Promise<number>;
  /** O daemon movendo a seta. Nenhum agente chama isto. */
  advance(input: { task: TaskRow; role: Role }): Promise<void>;
  /** Tentativa esgotada: o cartão para, com o motivo. */
  block(input: { taskId: string; reason: string }): Promise<void>;
  /** O que este turno deixou registrado na tarefa (T21). */
  comment(input: { taskId: string; body: string; sessionId: string }): Promise<void>;
  /**
   * O marco que o tracker vê (`028` Parte 6, T46).
   *
   * **Cortesia, não portão**: nada aqui espera o resultado nem muda de rumo por
   * causa dele, e a porta é **opcional** — uma esteira montada sem tracker é a
   * esteira que existia antes da Parte 5, byte por byte.
   */
  mark?(input: {
    taskId: string;
    mark: "taken" | "pr" | "blocked" | "ready";
    context?: string;
  }): Promise<void>;
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

export interface ConveyorOptions {
  /** Injetável para o teste não esperar meia hora. */
  turnTimeoutMs?: number;
  /** Injetável pelo mesmo motivo — e o default é o relógio de verdade. */
  sleep?: (ms: number) => Promise<void>;
}

export function createConveyor(
  ports: ConveyorPorts,
  { turnTimeoutMs = TURN_TIMEOUT_MS, sleep = defaultSleep }: ConveyorOptions = {},
): Conveyor {
  /**
   * O turno, com teto.
   *
   * Devolve `true` quando acabou sozinho e `false` quando o teto chegou antes.
   * Cancelar **não** é opcional no caminho do teto: um turno abandonado sem
   * cancelamento continua gastando token do outro lado, e o processo fica de pé
   * ocupando vaga do teto de paralelismo.
   */
  async function promptWithCeiling(sessionId: string, text: string): Promise<boolean> {
    let finished = false;
    const turn = ports.prompt({ sessionId, text }).then(() => {
      finished = true;
    });
    await Promise.race([turn, sleep(turnTimeoutMs)]);
    if (finished) return true;

    await ports.cancel(sessionId).catch(() => undefined);
    return false;
  }

  /**
   * O cartão para, com o motivo — e o tracker fica sabendo.
   *
   * Extraído porque são **dois** os caminhos que chegam aqui: o veredito que não
   * passou, e o preparo que nem chegou a abrir turno. Duas cópias disto é uma
   * cópia que esquece o marco na próxima.
   */
  async function blockWith(taskId: string, reason: string): Promise<void> {
    await ports.block({ taskId, reason });
    void ports.mark?.({ taskId, mark: "blocked", context: reason }).catch(() => undefined);
  }

  async function runOne(entry: QueueEntry, autonomy: Autonomy): Promise<void> {
    /*
     * Preparar pode falhar, e falhar preparando **gasta tentativa**.
     *
     * É a exceção à regra do `assistido` logo abaixo, e ela se paga: preparar
     * com sucesso não gasta porque esperar o clique não é trabalho, mas uma
     * falha é custo que **se repete** — a worktree registrada sumiu do disco, o
     * repositório foi movido, o `git` não responde. Sem contar aqui, a exceção
     * subia antes de qualquer escrita e a passada seguinte repescava o mesmo
     * cartão a cada 15 s **para sempre**: sem tentativa, sem bloqueio, e o único
     * rastro um `conveyor-tick-failed` no log de um daemon que ninguém está
     * olhando — que é o estado que esta feature inteira existe para não ter.
     */
    let checkout: PreparedCheckout;
    let agent: { adapter: string; model: string | null; instructions: string };
    try {
      checkout = await ports.prepareCheckout(entry);
      agent = await ports.agentFor({ taskId: entry.task.id, role: entry.role });
    } catch (error) {
      const failed = await ports.countAttempt(entry.task.id);
      if (failed >= MAX_ATTEMPTS) {
        await blockWith(entry.task.id, error instanceof Error ? error.message : String(error));
      }
      return;
    }
    const promptWith = (attempt: number): string =>
      promptFor({
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
       *
       * E ele **não gasta tentativa**, o que não é detalhe: preparar não é
       * rodar, e um cartão preparado continua candidato da fila — `park` não
       * muda nem a autonomia nem o turno em voo, que são as duas condições que a
       * `queueOf` lê. Contando aqui, cada passada de 15 s reincrementaria
       * `attempts` num cartão que espera o clique de uma pessoa, e em meio minuto
       * ele seria bloqueado por *"parou depois de 2 tentativas"* sem nenhum turno
       * ter aberto — a Q51 ao contrário. A tentativa é contada logo abaixo, no
       * único caminho em que um turno de fato abre por conta da esteira.
       */
      await ports.park({
        taskId: entry.task.id,
        role: entry.role,
        prompt: promptWith(entry.task.attempts + 1),
        worktreeId: checkout.worktreeId,
      });
      return;
    }

    /*
     * A tentativa conta **antes** do prompt, e é o item 2 do cabeçalho.
     *
     * Contar depois parece mais justo — *"só conta o que realmente rodou"* — e é
     * exatamente o que quebra: um daemon que morre no meio do turno não conta, a
     * tarefa volta à fila com o orçamento intacto, e o laço não tem fim. Contar
     * antes erra para o lado seguro: no pior caso uma tentativa é gasta sem ter
     * rodado, e o cartão para uma vez cedo demais — o que é visível e
     * consertável, ao contrário do outro.
     *
     * *Antes do prompt*, e não *antes do preparo*: o que ela conta é **turno que
     * vai abrir**.
     */
    const attempt = await ports.countAttempt(entry.task.id);
    if (attempt > MAX_ATTEMPTS) {
      await ports.block({
        taskId: entry.task.id,
        reason: `parou depois de ${String(MAX_ATTEMPTS)} tentativas`,
      });
      return;
    }

    const text = promptWith(attempt);

    /*
     * *"Peguei"*, e é o primeiro dos quatro marcos do §6.
     *
     * Antes de abrir a sessão, e não depois: quem está olhando a issue no
     * tracker quer saber que alguém pegou **quando pegou**, e não quando
     * terminou. O `void` é a Q64 em uma linha — falhar aqui não muda nada do
     * lado de cá.
     */
    void ports.mark?.({ taskId: entry.task.id, mark: "taken" }).catch(() => undefined);

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
    const ended = await promptWithCeiling(sessionId, text);

    /*
     * O teto chegou antes: não há o que julgar, e chamar o portão seria julgar
     * um trabalho interrompido — o `test` rodaria contra um checkout que o
     * agente estava no meio de escrever.
     */
    const verdict: GateVerdict = ended
      ? await ports.gate(entry, checkout)
      : { kind: "unfinished", reason: "o turno passou do tempo e foi interrompido" };
    await ports.comment({
      taskId: entry.task.id,
      sessionId,
      body: commentFor(entry.role, attempt, verdict),
    });

    if (verdict.kind === "pass") {
      await ports.advance({ task: entry.task, role: entry.role });
      /*
       * *"Pronta para mesclar"* sai quando a etapa que anda é a **última** da
       * máquina. O §4.1 é quem define isso: `testing` é a última em que um
       * encaixe trabalha, e o que vem depois é sua vez.
       */
      if (entry.task.status === "testing") {
        void ports.mark?.({ taskId: entry.task.id, mark: "ready" }).catch(() => undefined);
      }
      return;
    }

    /*
     * Não passou. A tarefa **fica onde está** e a fila a relê na passada
     * seguinte — que é a segunda tentativa, e é assim que ela é implementada:
     * sem agenda, sem `setTimeout`, sem estado. Quando a tentativa acabar, é a
     * chamada de cima que bloqueia.
     */
    if (attempt >= MAX_ATTEMPTS) await blockWith(entry.task.id, verdict.reason);
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
      /*
       * **Com o mesmo teto do caminho autônomo**, e não `ports.prompt` seco.
       *
       * O clique é seu, mas o turno não é: ele roda sozinho a partir daqui, e a
       * sessão nasce liberada exatamente porque não há ninguém para responder
       * permissão. Se o modo do agente não pôde ser trocado — `autonomousMode`
       * nulo na spec, um `set_mode` que falhou —, ele pergunta, o daemon manda o
       * pedido para uma pessoa que não está lá, e o turno pendura para sempre
       * com o cartão dizendo `implementando`. É o defeito que o e2e da Parte 2
       * achou, e ele não tem nada de exclusivo do caminho autônomo.
       */
      await promptWithCeiling(sessionId, prepared.prompt);
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

/** O relógio de verdade, e o único lugar do arquivo que o toca. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // `unref` para um turno em voo não segurar o desligamento do daemon: o
    // `shutdown` mata as sessões, e o relógio não pode ser o que sobra de pé.
    timer.unref?.();
  });
}
