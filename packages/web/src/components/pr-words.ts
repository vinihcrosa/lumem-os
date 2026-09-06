import type { PrFailureView, PrStatus, PrVerdict, PullRequestView } from "@lumem/shared";

/**
 * A tradução, que é a metade que o daemon **não** faz.
 *
 * O veredito e o motivo vêm estruturados de propósito (F4.4): o daemon decide
 * *o quê*, e a tela decide *como dizer* — porque quem sabe quanto espaço tem é
 * quem desenha. Uma barra de 260px e uma de 720px não dizem a mesma coisa, e um
 * daemon que devolvesse frase pronta obrigaria as duas a dizerem.
 *
 * Fica em módulo separado do componente porque é a parte pura: uma tabela de
 * `reason` para palavras, testável sem montar nada.
 */

/** A cor, que é a resposta. `none` é o estado da barra sem PR. */
export type PrTone = "ready" | "blocked" | "pending" | "merged" | "none";

/**
 * De seis vereditos para cinco tons.
 *
 * `draft` e `closed` caem em neutro porque **não há o que decidir**: rascunho
 * não está bloqueado, está *não pronto ainda*, e PR fechada sem merge acabou
 * sem acontecer. Ausência é resposta, e resposta não é erro.
 */
export function toneOf(verdict: PrVerdict): PrTone {
  switch (verdict) {
    case "ready":
      return "ready";
    case "blocked":
      return "blocked";
    case "pending":
      return "pending";
    case "merged":
      return "merged";
    default:
      return "none";
  }
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/** Nomes de fora, truncados: §4.5 do PRD. Texto, sempre; e curto, sempre. */
function names(list: readonly string[], limit = 2): string[] {
  return list.slice(0, limit);
}

export interface PrWords {
  /** O estado, em palavra. Confirma a cor, porque cor sozinha não é sinal. */
  state: string;
  /**
   * O motivo, com os nomes destacados.
   *
   * Partido em pedaços em vez de string única para o `<b>` do desenho poder
   * existir sem `dangerouslySetInnerHTML` — o que seria injetar texto que veio
   * da internet no DOM como HTML (§4.5).
   */
  why: Array<{ text: string; strong?: boolean }>;
}

/**
 * O que a barra diz sobre uma PR.
 *
 * Cada caso nomeia **uma** causa: quatro motivos empilhados não cabem em 360px,
 * e você resolve um por vez de qualquer forma (F1.4).
 */
export function wordsFor(pull: PullRequestView): PrWords {
  const reason = pull.reason;

  switch (reason.kind) {
    case "conflict":
      return {
        state: "conflito com a base",
        why: [{ text: "não mescla sozinha em " }, { text: reason.base, strong: true }],
      };

    case "checks-failed": {
      const shown = names(reason.names);
      const rest = reason.names.length - shown.length;
      return {
        state: plural(reason.names.length, "verificação falhou", "verificações falharam"),
        why: [
          ...shown.flatMap((name, index) => [
            ...(index > 0 ? [{ text: ", " }] : []),
            { text: name, strong: true },
          ]),
          ...(rest > 0 ? [{ text: ` e mais ${String(rest)}` }] : []),
        ],
      };
    }

    case "changes-requested": {
      const who = names(reason.by, 1);
      return {
        state: "mudanças pedidas",
        why:
          who.length === 0
            ? [{ text: "alguém pediu mudanças nesta pull request" }]
            : [{ text: "por " }, { text: who[0]!, strong: true }],
      };
    }

    case "review-required":
      // A regra é do host, e a frase repete o que ele disse. O Lumem não
      // reimplementa branch protection: mostra o veredito de quem manda.
      return { state: "falta revisão", why: [{ text: "a regra da base exige aprovação" }] };

    case "behind":
      return {
        state: "atrás da base",
        why: [{ text: "atualize a partir de " }, { text: reason.base, strong: true }],
      };

    case "blocked-by-host":
      return {
        state: "bloqueada pelo GitHub",
        why: [{ text: "uma regra da base impede o merge — o motivo está na pull request" }],
      };

    case "checks-running": {
      const shown = names(reason.names, 1);
      const total = reason.running + reason.queued;
      return {
        state: plural(total, "verificação rodando", "verificações rodando"),
        why: [
          ...(shown.length > 0 ? [{ text: shown[0]!, strong: true }] : []),
          ...(reason.queued > 0
            ? [{ text: `${shown.length > 0 ? " · " : ""}${String(reason.queued)} na fila` }]
            : []),
        ],
      };
    }

    case "mergeability-unknown":
      return {
        state: "verificando",
        why: [{ text: "o GitHub ainda não disse se ela mescla" }],
      };

    case "ready": {
      const who = names(reason.approvedBy, 1);
      return {
        state: "pronta para merge",
        why: [
          {
            text:
              reason.passed === 0
                ? "nada impede"
                : plural(reason.passed, "verificação passou", "verificações passaram"),
          },
          ...(who.length > 0
            ? [{ text: " · aprovada por " }, { text: who[0]!, strong: true }]
            : []),
        ],
      };
    }

    case "draft":
      return {
        state: "rascunho",
        why: [
          {
            text:
              reason.passed === 0
                ? "marque como pronta no GitHub"
                : `${plural(reason.passed, "verificação passou", "verificações passaram")} · marque como pronta no GitHub`,
          },
        ],
      };

    case "merged":
      return {
        state: "mesclada",
        why: [
          { text: "em " },
          { text: reason.base, strong: true },
          { text: " · esta worktree pode ser removida" },
        ],
      };

    case "closed":
      return { state: "fechada sem merge", why: [{ text: "ninguém mesclou esta pull request" }] };
  }
}

/**
 * O que a barra diz **sem** PR.
 *
 * Três frases diferentes para três ausências diferentes. Dizer a errada manda a
 * pessoa procurar uma PR que não podia existir.
 */
export function wordsForNoPr(status: PrStatus): PrWords {
  if (!status.published) {
    return {
      state: "branch não publicada",
      why: [
        { text: "nenhum remoto conhece " },
        { text: status.branch, strong: true },
      ],
    };
  }
  return {
    state: "sem pull request",
    why: [{ text: "publicada · ninguém abriu pull request para " }, { text: status.base, strong: true }],
  };
}

export interface FailureWords {
  state: string;
  why: Array<{ text: string; strong?: boolean }>;
  /** `true` quando a falha é permanente até alguém mexer na máquina (F1.8). */
  dismissible: boolean;
}

/**
 * O que dizer quando não dá para saber.
 *
 * Metade desta feature é dependência de coisa fora do Lumem: um CLI instalado,
 * uma sessão autenticada, uma rede. A regra é a mesma do resto do produto —
 * **dizer o que houve e o que fazer**, e nunca inventar um verde.
 */
export function wordsForFailure(failure: PrFailureView, host: string | null): FailureWords {
  switch (failure.kind) {
    case "no-binary":
      return {
        state: "sem integração com o GitHub",
        why: [{ text: "instale o " }, { text: "gh", strong: true }, { text: " para ver PR e verificações aqui" }],
        dismissible: true,
      };

    case "no-auth":
      return {
        state: "gh não autenticado",
        why: [{ text: "rode " }, { text: "gh auth login", strong: true }, { text: " num shell desta worktree" }],
        dismissible: false,
      };

    case "unsupported-host":
      return {
        state: host === null ? "sem integração" : `sem integração com ${host}`,
        why: [{ text: "o v1 fala só GitHub · o adaptador de host é a porta para os outros" }],
        dismissible: true,
      };

    case "rate-limit":
      return {
        state: "limite do GitHub atingido",
        why:
          failure.retryAt === null
            ? [{ text: "o dado acima é de antes · tente de novo mais tarde" }]
            : [
                { text: "volta a consultar às " },
                { text: hourOf(failure.retryAt), strong: true },
                { text: " · o dado acima é de antes" },
              ],
        dismissible: false,
      };

    case "not-a-repo":
      return {
        state: "sem integração",
        why: [{ text: "este checkout não é um repositório git" }],
        dismissible: true,
      };

    case "offline":
    case "timeout":
      return {
        state: "sem conexão com o GitHub",
        why: [{ text: "o dado acima é o último que deu para ler" }],
        dismissible: false,
      };

    default:
      return {
        state: "não deu para ler a pull request",
        why: [{ text: failure.message }],
        dismissible: false,
      };
  }
}

function hourOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * A idade, e por que ela aparece **sempre**.
 *
 * F1.5: número que só existe no erro é número que ninguém aprende a ler. Ele
 * fica âmbar acima do limite, e o limite é generoso — o ponto não é assustar,
 * é impedir que um verde velho pareça novo.
 */
export const STALE_AFTER_MS = 120_000;

export function freshnessOf(readAt: string | null, now: number = Date.now()) {
  if (readAt === null) return null;
  const at = Date.parse(readAt);
  if (Number.isNaN(at)) return null;

  const ms = Math.max(0, now - at);
  return { label: `há ${agoOf(ms)}`, stale: ms > STALE_AFTER_MS };
}

function agoOf(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h`;
  return `${String(Math.floor(hours / 24))} d`;
}

/** `4m12s`, como a lista de verificações escreve. `—` para o que nem começou. */
export function durationOf(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes)}m${String(rest).padStart(2, "0")}s`;
}
