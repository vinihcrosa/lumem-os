import type { PrFailure } from "./exec.js";
import type { PrHost, PrSnapshot } from "./PrHost.js";
import { countChecks } from "./verdict.js";

/**
 * Uma consulta por **projeto**, e não por worktree.
 *
 * É a F4.3 do PRD, e é a diferença entre uma feature que escala com o
 * paralelismo e uma que o pune: oito worktrees do mesmo repositório fazem oito
 * componentes pedirem o estado da PR ao mesmo tempo, e o spike mediu o `gh` em
 * centenas de milissegundos por processo. Sem isto, abrir o Lumem com oito
 * checkouts seria oito processos a cada ciclo.
 *
 * Três coisas, e cada uma resolve um jeito de a tela mentir:
 *
 * - **single-flight** — dez pedidos concorrentes com o cache frio produzem uma
 *   execução;
 * - **valor conhecido devolvido na hora** enquanto revalida por trás — a tela
 *   nunca pisca;
 * - **falha não apaga o último valor** — ele volta com a idade e o motivo da
 *   falha junto, que é o que faz "verde velho continua verde" ser verdade sem
 *   ser mentira.
 */

/** Com verificação rodando, o estado muda em segundos ([Q5](../../../../docs/prd/pull-request-status/open-questions.md)). */
export const TTL_BUSY_MS = 15_000;
/** Sem nada rodando, o que muda é gente — e gente é mais lenta que CI. */
export const TTL_IDLE_MS = 60_000;
/**
 * Depois de falhar, o primeiro intervalo é o **normal** — e daí ele dobra.
 *
 * Igual ao TTL ocioso, e não menor, porque menor seria o absurdo silencioso de
 * um projeto que falha consultar mais que um que responde.
 */
export const BACKOFF_START_MS = TTL_IDLE_MS;
export const BACKOFF_MAX_MS = 600_000;

export interface PrProject {
  id: string;
  /** O checkout principal do projeto. É de lá que o `gh` pergunta. */
  path: string;
  remoteUrl: string | null;
}

/**
 * O que o cache sabe sobre um projeto, agora.
 *
 * `snapshot` e `failure` **coexistem** de propósito: uma leitura que falhou em
 * cima de um valor conhecido é exatamente o estado "offline, com o último dado"
 * do §6 do protótipo — e apagar a cor por causa da rede seria trocar uma
 * informação verdadeira e velha por nenhuma.
 */
export interface PrEntry {
  snapshot: PrSnapshot | null;
  failure: PrFailure | null;
  /** Desde quando a última leitura **bem-sucedida** vale. `null` se nunca houve. */
  readAt: string | null;
}

interface Slot extends PrEntry {
  /** Monotônico, do relógio injetado. Não é `readAt`: ele é para a tela. */
  freshUntil: number;
  failures: number;
  inFlight: Promise<PrEntry> | null;
}

export interface PrCacheOptions {
  host: PrHost;
  /** Injetado para o teste poder envelhecer o cache sem esperar um minuto. */
  now?: () => number;
}

export interface PrCache {
  /**
   * O que se sabe do projeto — sem esperar, quando já se sabe algo.
   *
   * A primeira leitura **espera**: uma tela que abrisse sem nada e depois
   * piscasse é pior que uma que demora meio segundo. As seguintes devolvem o
   * conhecido na hora, e revalidam por trás quando ele envelheceu.
   */
  get(project: PrProject): Promise<PrEntry>;
  /** Força a próxima leitura a ir ao host. Usada pela escrita (F7.8). */
  invalidate(projectId: string): void;
  /** O projeto saiu. Cache que sobrevive ao dono é vazamento. */
  forget(projectId: string): void;
  /** Quantas execuções houve. Existe para o teste contar, e é a prova do single-flight. */
  readonly reads: number;
}

export function createPrCache({ host, now = () => Date.now() }: PrCacheOptions): PrCache {
  const slots = new Map<string, Slot>();
  let reads = 0;

  function slotOf(projectId: string): Slot {
    const existing = slots.get(projectId);
    if (existing) return existing;
    const fresh: Slot = {
      snapshot: null,
      failure: null,
      readAt: null,
      freshUntil: 0,
      failures: 0,
      inFlight: null,
    };
    slots.set(projectId, fresh);
    return fresh;
  }

  function viewOf(slot: Slot): PrEntry {
    return { snapshot: slot.snapshot, failure: slot.failure, readAt: slot.readAt };
  }

  /**
   * Quanto tempo esta resposta vale.
   *
   * O ritmo é adaptativo pelo motivo do §Q5: com verificação rodando o estado
   * muda em segundos, e sem nada rodando o que muda é gente. Depois de falhar,
   * o intervalo cresce — porque a falha mais comum é a rede, e insistir de 15
   * em 15 segundos contra uma rede caída é gastar processo para nada.
   */
  function ttlOf(slot: Slot): number {
    if (slot.failures > 0) {
      return Math.min(BACKOFF_START_MS * 2 ** (slot.failures - 1), BACKOFF_MAX_MS);
    }
    const pulls = slot.snapshot?.pulls ?? [];
    const busy = pulls.some(
      (pull) => pull.state.toUpperCase() === "OPEN" && countChecks(pull.checks).running > 0,
    );
    return busy ? TTL_BUSY_MS : TTL_IDLE_MS;
  }

  async function fetch(project: PrProject, slot: Slot): Promise<PrEntry> {
    reads += 1;
    try {
      const read = await host.read({ repoPath: project.path, remoteUrl: project.remoteUrl });

      if (read.ok) {
        slot.snapshot = read.snapshot;
        slot.failure = null;
        slot.readAt = read.snapshot.readAt;
        slot.failures = 0;
      } else {
        // O último valor **fica**. A tela mostra a cor que ele tinha e a idade
        // dizendo a verdade sobre quando ela foi lida.
        slot.failure = read.failure;
        slot.failures += 1;
      }
    } catch {
      // O adaptador promete não lançar; se lançar, é defeito dele — e um defeito
      // dele não pode derrubar a tela nem apagar o que já se sabia (F4.7).
      slot.failure = { kind: "failed", message: "não deu para consultar o host" };
      slot.failures += 1;
    } finally {
      slot.freshUntil = now() + ttlOf(slot);
      slot.inFlight = null;
    }

    return viewOf(slot);
  }

  /** Uma execução por projeto, por mais gente que peça ao mesmo tempo. */
  function start(project: PrProject, slot: Slot): Promise<PrEntry> {
    slot.inFlight ??= fetch(project, slot);
    return slot.inFlight;
  }

  return {
    get(project) {
      const slot = slotOf(project.id);
      const known = slot.snapshot !== null || slot.failure !== null;

      if (!known) return start(project, slot);
      if (now() < slot.freshUntil) return Promise.resolve(viewOf(slot));

      // Envelheceu: devolve o conhecido **agora** e revalida por trás. O `catch`
      // vazio é deliberado — o `fetch` já guardou a falha no slot, e uma
      // rejeição não observada aqui derrubaria o processo.
      void start(project, slot).catch(() => undefined);
      return Promise.resolve(viewOf(slot));
    },

    invalidate(projectId) {
      const slot = slots.get(projectId);
      if (!slot) return;
      slot.freshUntil = 0;
      // Escrita conserta o mundo: insistir no backoff depois de um merge que deu
      // certo seria deixar a barra verde por dez minutos depois de ela acabar.
      slot.failures = 0;
    },

    forget(projectId) {
      slots.delete(projectId);
    },

    get reads() {
      return reads;
    },
  };
}
