import type { PrFailure } from "./exec.js";
import type { GhIssue, PrHost } from "./PrHost.js";

/**
 * As issues do projeto, guardadas — e **irmão** do `PrCache`, não parte dele.
 *
 * A [Q4](../../../../docs/features/026-worktree-from/open-questions.md) deixou a
 * escolha para o código, e o código respondeu: os dois guardam leitura do mesmo
 * `gh`, do mesmo projeto, e ainda assim não são a mesma coisa.
 *
 * O `PrCache` alimenta uma **barra que se pergunta sozinha**, de 15 em 15
 * segundos, para uma linha que está na tela o tempo todo. Por isso ele tem TTL
 * curto quando há verificação rodando, revalidação por trás para a tela não
 * piscar, e backoff quando falha.
 *
 * Isto aqui alimenta um **diálogo que alguém abriu**. As três coisas viram
 * defeito:
 *
 * - pôr issue no ciclo do `PrCache` seria um `gh issue list` por projeto a cada
 *   15 s — ~730 ms medidos — para um diálogo que ninguém abriu;
 * - revalidar por trás mostraria a lista velha e a nova chegaria depois de o
 *   diálogo fechar;
 * - backoff não tem o que segurar: sem poll, o próximo pedido é uma pessoa
 *   abrindo o diálogo de novo, e fazê-la esperar mais que da primeira vez não
 *   protege ninguém.
 *
 * O que **é** igual, e é igual de propósito: single-flight, e falha que não
 * apaga a última lista conhecida.
 */

/** Um minuto. Issue não muda em segundos, e o diálogo vive menos que isso. */
export const ISSUE_TTL_MS = 60_000;

export interface IssueProject {
  id: string;
  /** O checkout principal. É de lá que o `gh` pergunta, como na barra. */
  path: string;
  remoteUrl: string | null;
}

export interface IssueEntry {
  /** A última lista conhecida. `null` enquanto nunca houve uma. */
  issues: GhIssue[] | null;
  /** O que deu errado na leitura mais recente, se deu. Coexiste com a lista. */
  failure: PrFailure | null;
  /** ISO da última leitura **bem-sucedida**. */
  readAt: string | null;
}

interface Slot extends IssueEntry {
  /** Do relógio injetado, monotônico. Não é `readAt`: aquele é para a tela. */
  freshUntil: number;
  inFlight: Promise<IssueEntry> | null;
}

export interface IssueCacheOptions {
  host: PrHost;
  /** Injetado para o teste envelhecer o cache sem esperar um minuto. */
  now?: () => number;
}

export interface GetOptions {
  /** Vai ao host mesmo com valor fresco. É o `⟳` do diálogo. */
  force?: boolean;
}

export interface IssueCache {
  get(project: IssueProject, options?: GetOptions): Promise<IssueEntry>;
  /** O projeto saiu. Cache que sobrevive ao dono é vazamento. */
  forget(projectId: string): void;
  /** Quantas execuções houve. Existe para o teste contar. */
  readonly reads: number;
}

const NO_HOST: PrFailure = {
  kind: "unsupported-host",
  message: "este repositório não tem um remote conhecido",
};

export function createIssueCache({ host, now = () => Date.now() }: IssueCacheOptions): IssueCache {
  const slots = new Map<string, Slot>();
  let reads = 0;

  function slotOf(projectId: string): Slot {
    const existing = slots.get(projectId);
    if (existing !== undefined) return existing;
    const created: Slot = { issues: null, failure: null, readAt: null, freshUntil: 0, inFlight: null };
    slots.set(projectId, created);
    return created;
  }

  function viewOf(slot: Slot): IssueEntry {
    // Cópia: quem recebe não pode mexer no que o cache guarda, e a lista viaja
    // para o cliente inteira.
    return { issues: slot.issues, failure: slot.failure, readAt: slot.readAt };
  }

  async function fetch(project: IssueProject, slot: Slot): Promise<IssueEntry> {
    reads += 1;
    const read = await host.issues({ repoPath: project.path, remoteUrl: project.remoteUrl });

    if (read.ok) {
      slot.issues = read.issues;
      slot.failure = null;
      slot.readAt = new Date().toISOString();
    } else {
      // A lista fica. Uma leitura que falhou em cima de uma lista conhecida é
      // "sem rede, com o que se sabia" — e apagar seria trocar informação
      // verdadeira e velha por nenhuma.
      slot.failure = read.failure;
    }

    slot.freshUntil = now() + ISSUE_TTL_MS;
    return viewOf(slot);
  }

  return {
    get reads() {
      return reads;
    },

    get(project, { force = false } = {}) {
      // Sem remoto não há host. Respondido aqui, sem processo: o diálogo já não
      // oferece a aba, e perguntar seria um `gh` por abertura para receber
      // sempre a mesma recusa.
      if (project.remoteUrl === null || project.remoteUrl.trim() === "") {
        return Promise.resolve({ issues: null, failure: NO_HOST, readAt: null });
      }

      const slot = slotOf(project.id);

      // Single-flight, inclusive para `force`: dois pedidos concorrentes são um
      // diálogo aberto duas vezes, não duas perguntas diferentes.
      if (slot.inFlight !== null) return slot.inFlight;
      if (!force && slot.readAt !== null && now() < slot.freshUntil) {
        return Promise.resolve(viewOf(slot));
      }

      /*
       * A limpeza vai num `finally`, e não no fim do `fetch`.
       *
       * `PrHost` é injetável, e uma implementação que **rejeite** em vez de
       * responder `{ok:false}` faria o `fetch` lançar antes de limpar — e o slot
       * ficaria guardando a promise rejeitada para sempre: todo `get` seguinte
       * devolveria a mesma rejeição, sem retry e sem nunca atualizar a lista
       * guardada, até o daemon reiniciar. O `PrCache` se protege exatamente
       * disso, e a proteção é esta linha.
       *
       * `if (slot.inFlight === promise)` porque uma leitura mais nova pode já ter
       * tomado o lugar.
       */
      const promise = fetch(project, slot).finally(() => {
        if (slot.inFlight === promise) slot.inFlight = null;
      });
      slot.inFlight = promise;
      return promise;
    },

    forget(projectId) {
      slots.delete(projectId);
    },
  };
}
