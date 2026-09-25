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
 * Quantas vezes o revisor devolve a mesma tarefa antes de ela parar.
 *
 * **Separado do `MAX_ATTEMPTS`, e é o que impede o vaivém infinito.** A
 * tentativa zera na mudança de etapa — porque mudar de etapa *é* a conclusão
 * daquela etapa —, e isso sozinho faria o ciclo
 * `implementador → revisor → implementador` nunca acabar: cada volta zera o
 * contador do outro lado, e nenhum teto chega.
 *
 * **Dois**, e o número vem do medo que originou a Parte 7: *"toda vez que você
 * pede um review, o agente acha alguma coisa"*. Se ele achar sempre, o cartão
 * para na terceira ida com o motivo escrito — e não circula até o orçamento
 * acabar. Ele muda quando a esteira rodar contra trabalho de verdade, como o
 * `MAX_ATTEMPTS` mudará.
 */
export const MAX_BOUNCES = 2;

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
  /**
   * O `HEAD` **antes** do turno (`028` Parte 7 — T51).
   *
   * É o que faz `committed` ser um fato **da passada** em vez de herdado: o
   * cálculo antigo era *árvore limpa e à frente da base*, e `à frente` fica
   * verdadeiro para sempre depois do primeiro commit do implementador. Com ele,
   * o portão não distinguia *"trabalhou"* de *"não fez nada"* em nenhuma etapa
   * depois da primeira.
   */
  head: string;
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
   * O que o revisor devolveu e o daemon **reproduziu** (Parte 7 — T58).
   *
   * Vazio quando não houve volta. Só o implementador o recebe: é para ele que a
   * tarefa voltou.
   */
  returned(taskId: string): Promise<readonly { title: string; command: string }[]>;
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
  /**
   * Manda o prompt e espera o turno. O motivo da **parada** é ignorado de
   * propósito — quem responde *"acabou?"* é o portão.
   *
   * O motivo de o turno **não abrir**, ao contrário, é lido: `recusado` é o
   * daemon dizendo não antes de gastar qualquer coisa — hoje é o teto do
   * workspace, e a frase dele já diz o número. Sem este retorno a recusa subia
   * como exceção, virava uma linha de log, gastava uma tentativa por passada e
   * o cartão acabava parando com *"parou depois de 2 tentativas"* — uma frase
   * que não fala do teto e manda procurar no lugar errado.
   */
  prompt(input: {
    sessionId: string;
    text: string;
  }): Promise<{ kind: "ok" } | { kind: "refused"; reason: string }>;
  /** Interrompe um turno que passou do teto de tempo. */
  cancel(sessionId: string): Promise<void>;
  /**
   * Encerra a sessão do encaixe quando o turno acabou (`028` Parte 7 — T52).
   *
   * A esteira nunca fechava o que abria: a `LUM-51` produziu **seis** sessões e
   * **três ficaram vivas** horas depois, cada uma segurando um processo de
   * adaptador. Fechar aqui não perde contexto — retomar carrega a conversa de
   * volta pelo `session/load`, que é como o produto já faz *"retomar"*.
   */
  closeSession(sessionId: string): Promise<void>;
  /**
   * O portão do §4.1: `test` local, e o check da PR quando há PR (T28).
   *
   * Recebe **o checkout que o turno usou**, e não o ponteiro da tarefa.
   * `entry.task` é a linha como ela estava no início da passada, e uma tarefa
   * que entrou sem worktree ganhou a dela no `prepareCheckout` — o ponteiro na
   * linha em memória continua nulo, e julgar por ele reprovaria como
   * *"sem checkout"* um turno inteiro que commitou e passou no teste.
   */
  gate(
    entry: QueueEntry,
    checkout: PreparedCheckout,
    sessionId: string,
    /**
     * Quando este turno começou (`028` Parte 7).
     *
     * O portão do revisor lê o parecer **desta volta**, e desde a T57 a conversa
     * dele é uma só por tarefa — ela atravessa as voltas. Sem o instante, a
     * segunda revisão releria o parecer da primeira, e um revisor que calasse na
     * volta 2 passaria por *"entregou"* com o que disse na volta 1.
     */
    since: Date,
  ): Promise<GateVerdict>;
  /** Mais uma tentativa **nesta etapa**, e devolve o total. */
  countAttempt(taskId: string): Promise<number>;
  /** O daemon movendo a seta. Nenhum agente chama isto. */
  advance(input: { task: TaskRow; role: Role }): Promise<void>;
  /**
   * Publica a branch e abre a PR, na primeira vez que o implementador fecha
   * (`028` Parte 7 — T56).
   *
   * **Cortesia, como o marco do tracker**: devolve `null` quando não deu — sem
   * remoto, sem `gh`, PR já aberta — e nada do lado de cá muda por causa disso.
   * O trabalho já aconteceu; recusar o avanço porque o GitHub não respondeu
   * seria o produto ficando refém de um terceiro.
   *
   * **Rascunho**, e isso não é timidez: a PR nasce antes da revisão, e um
   * rascunho é a frase honesta para *"ainda não estou pedindo merge"*. Sair do
   * rascunho é seu, pela mesma regra do `done`.
   */
  openPullRequest(input: { entry: QueueEntry; checkout: PreparedCheckout }): Promise<string | null>;

  /**
   * As anotações do revisor vão para a PR (`028` Parte 7 — T55).
   *
   * **É o endereço do balde `notes`, e sem ele o balde é uma gaveta.** O que o
   * preâmbulo promete ao revisor é literal — *"o que não for reproduzível vai
   * para a pull request, onde uma pessoa lê antes de mesclar"* —, e uma promessa
   * dessas só vale se alguém de fato ler.
   *
   * **Cortesia, como a PR e como o marco**: devolve quantas foram publicadas, e
   * `0` é o caso comum (não há PR, não há anotação, não há `gh`). Nada do lado
   * de cá muda por causa disso — o cartão anda igual.
   */
  publishNotes(input: {
    entry: QueueEntry;
    checkout: PreparedCheckout;
    sessionId: string;
    /** O começo do turno, pelo mesmo motivo do `gate`: são as desta volta. */
    since: Date;
  }): Promise<number>;
  /**
   * O revisor devolveu: a tarefa volta para quem escreveu (`028` Parte 7 — T58).
   *
   * **A seta anda para trás**, e é a única que anda: sem ela o cartão ficava em
   * `review` e a passada seguinte entregava ao revisor o **mesmo** código que
   * ele acabou de reprovar. Devolve quantas voltas já houve, para quem chama
   * saber quando parar.
   */
  bounce(input: { taskId: string; reason: string }): Promise<number>;
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
  async function promptWithCeiling(
    sessionId: string,
    text: string,
  ): Promise<{ kind: "ended" } | { kind: "timeout" } | { kind: "refused"; reason: string }> {
    const answered: { value: { kind: "ok" } | { kind: "refused"; reason: string } | null } = {
      value: null,
    };
    const turn = ports.prompt({ sessionId, text }).then((answer) => {
      answered.value = answer;
    });
    await Promise.race([turn, sleep(turnTimeoutMs)]);
    const answer = answered.value;
    if (answer !== null) {
      return answer.kind === "ok" ? { kind: "ended" } : { kind: "refused", reason: answer.reason };
    }

    await ports.cancel(sessionId).catch(() => undefined);
    return { kind: "timeout" };
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

    /*
     * Preparo pode levar tempo. Se alguém parou o cartão ou mudou sua etapa
     * enquanto a worktree era criada, a foto da fila que iniciou esta passada
     * ficou velha: não abrir sessão nem gastar tentativa para um cartão que já
     * saiu dela.
     */
    const stillDue = ports
      .queue(entry.task.workspaceId)
      .entries.some((candidate) => candidate.task.id === entry.task.id);
    if (!stillDue) return;

    /*
     * O que o revisor devolveu, e **só o implementador lê** (T58).
     *
     * É para ele que a tarefa voltou. O revisor recebendo os próprios achados de
     * volta seria a conversa dele consigo mesma, e o testador recebendo-os seria
     * o canal que a Q47 fecha.
     */
    const returned =
      entry.role === "implementador" ? await ports.returned(entry.task.id) : [];
    const promptWith = (attempt: number): string =>
      promptFor({
        role: entry.role,
        title: entry.task.title,
        body: entry.task.body,
        checkoutPath: checkout.path,
        attempt,
        dirty: checkout.dirty,
        instructions: agent.instructions,
        returned,
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
     * O relógio do turno, e ele é **o que separa uma volta da outra**.
     *
     * A conversa do revisor é uma só por tarefa (T57), então *"o que esta sessão
     * postou"* já não identifica uma revisão. O que identifica é *"o que foi
     * postado depois que este turno começou"*, e é isso que o portão lê.
     */
    const since = new Date();

    /*
     * O turno acaba, e o motivo dele acabar **não é lido**.
     *
     * É o item 1, e é o achado que mais restringe esta feature: dos 13
     * `end_turn` gravados, 4 significaram *terminei*. Ler o `stopReason` aqui
     * seria construir a esteira em cima de um sinal com 31% de erro no caso
     * caro. Quem responde *"acabou?"* é o portão, logo abaixo.
     */
    const turn = await promptWithCeiling(sessionId, text);

    /*
     * O daemon disse não **antes** do turno: o cartão para com a frase dele.
     *
     * Aqui não há o que julgar — nada rodou —, e insistir é o defeito que isto
     * conserta: cada passada gastava uma tentativa e subia um adaptador para
     * ouvir o mesmo não, até o cartão parar dizendo *"parou depois de 2
     * tentativas"*. O número do teto estava a uma frase de distância e não
     * chegava a lugar nenhum.
     */
    if (turn.kind === "refused") {
      await ports.comment({
        taskId: entry.task.id,
        sessionId,
        body: `${entry.role} · tentativa ${String(attempt)} — ${turn.reason}`,
      });
      await ports.closeSession(sessionId).catch(() => undefined);
      await blockWith(entry.task.id, turn.reason);
      return;
    }

    /*
     * O teto chegou antes: não há o que julgar, e chamar o portão seria julgar
     * um trabalho interrompido — o `test` rodaria contra um checkout que o
     * agente estava no meio de escrever.
     */
    const verdict: GateVerdict =
      turn.kind === "ended"
        ? await ports.gate(entry, checkout, sessionId, since)
        : { kind: "unfinished", reason: "o turno passou do tempo e foi interrompido" };
    await ports.comment({
      taskId: entry.task.id,
      sessionId,
      body: commentFor(entry.role, attempt, verdict),
    });

    /*
     * A conversa fecha quando a tarefa **sai** da etapa deste encaixe (T52).
     *
     * `unfinished` e `fail` sem volta deixam o cartão onde está, e o mesmo
     * encaixe tenta de novo — **na mesma conversa**. Fechar a cada turno
     * obrigaria a tentativa seguinte a retomar, e foi exatamente isso que o e2e
     * da esteira respondeu com `ACP connection closed`.
     */
    const leaving = async () => {
      await ports.closeSession(sessionId).catch(() => undefined);
    };

    /*
     * O revisor reprovou com algo que **reproduziu**: a tarefa volta.
     *
     * Antes da contagem de tentativa, e não depois: o que esgota aqui é a
     * **volta**, e não a tentativa — `attempts` zera na mudança de etapa, então
     * ele nunca chegaria ao teto num ciclo que troca de etapa a cada passo.
     */
    if (verdict.kind === "fail" && entry.role === "revisor") {
      await leaving();
      const voltas = await ports.bounce({ taskId: entry.task.id, reason: verdict.reason });
      if (voltas > MAX_BOUNCES) {
        await blockWith(
          entry.task.id,
          `o revisor devolveu ${String(MAX_BOUNCES)} vezes — a última: ${verdict.reason}`,
        );
      }
      return;
    }

    if (verdict.kind === "pass") {
      /*
       * A PR abre **quando o implementador fecha pela primeira vez** (T56), e
       * antes de a seta andar: é ela que dá endereço ao balde `notes` — parecer
       * de revisão mora numa PR —, e é o que faz o marco `pr` do §6, que existe
       * e nunca disparou, passar a disparar.
       *
       * Só do implementador: o revisor e o testador trabalham **sobre** o que
       * ele publicou.
       */
      if (entry.role === "implementador") {
        const url = await ports.openPullRequest({ entry, checkout }).catch(() => null);
        if (url !== null) {
          void ports
            .mark?.({ taskId: entry.task.id, mark: "pr", context: url })
            .catch(() => undefined);
        }
      }

      /*
       * O revisor passou **com anotações**: elas vão para a PR (T55).
       *
       * Aqui e não no portão, porque não é julgamento: o portão já decidiu que
       * nada segura. Isto é a entrega do que ele achou a quem vai arbitrar — uma
       * pessoa, no momento em que ia mesclar de qualquer jeito.
       */
      if (entry.role === "revisor") {
        await ports.publishNotes({ entry, checkout, sessionId, since }).catch(() => 0);
      }

      await leaving();
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
    if (attempt >= MAX_ATTEMPTS) {
      // Bloquear tira a tarefa da fila, então o encaixe sai de cena junto.
      await leaving();
      await blockWith(entry.task.id, verdict.reason);
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
      const sent = await promptWithCeiling(sessionId, prepared.prompt);
      if (sent.kind === "refused") throw new DomainError("BLOCKED", sent.reason);
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
      /*
       * As vagas rodam **ao mesmo tempo**, e é o que faz o teto existir.
       *
       * Em série, `teto 2` nunca produzia dois turnos em voo: cada `runOne`
       * espera o turno inteiro, então a segunda vaga só começava quando a
       * primeira acabasse — e o `2 em uso` que o Open Design desenha ao lado do
       * quadro era um número que o produto nunca alcançava.
       *
       * Concorrer aqui é seguro do lado do git, e isso foi **medido** e não
       * suposto: 72 `git worktree add` simultâneos no mesmo repositório, seis de
       * cada vez, doze rodadas — zero falhas. O que sobra em série é o que tem
       * que ser em série, e está dentro de `runOne`.
       *
       * `allSettled` e **não** `all`: com `all`, a primeira rejeição descartaria
       * o resultado das outras vagas que já estavam rodando. A falha continua
       * subindo — é ela que vira o `conveyor-tick-failed` —, mas depois de todo
       * mundo ter terminado.
       */
      const settled = await Promise.allSettled(
        taking.map((entry) => runOne(entry, facts.autonomy)),
      );
      const failed = settled.find((one) => one.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason as Error;
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
