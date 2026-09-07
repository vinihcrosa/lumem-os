import { newId } from "@lumem/shared";

import type { AcpElicitation, AcpManager } from "../acp/AcpManager.js";
import { DomainError } from "../errors.js";

/**
 * O login que não cabe numa requisição (`second-agent`, T10 e T11).
 *
 * O `authenticate` de um método de navegador fica pendurado enquanto uma pessoa
 * autoriza em outro lugar — minutos, às vezes. Uma mutação de tRPC que esperasse
 * por isso seria uma conexão HTTP aberta por minutos, e a tela não teria como
 * mostrar o que apareceu **durante** a espera: o `elicitation/create` com a URL e
 * o código chega no meio da chamada, não no fim dela.
 *
 * Então o desenho é o mesmo que o login por comando já usava: **começa e devolve
 * um id**. Quem clicou pergunta o estado, e cancela quando quiser. Três verbos,
 * nenhum deles bloqueante.
 *
 * O que ele guarda em memória é o estado de tentativas vivas, e nada mais —
 * nenhuma chave, nenhum token, nada que sobreviva ao processo. É de propósito: o
 * segredo atravessa o daemon a caminho do adaptador (que o escreve na casa dele)
 * e não tem por que existir aqui depois disso.
 */

export type AgentAuthState = "running" | "ok" | "failed" | "cancelled";

export interface AgentAuthAttempt {
  id: string;
  state: AgentAuthState;
  /** O que mostrar enquanto espera, quando o agente pediu uma URL. */
  elicitation: AcpElicitation | null;
  /** A frase do agente quando ele recusou. Null enquanto nada deu errado. */
  message: string | null;
}

export interface StartAgentAuthOptions {
  command: string;
  args?: readonly string[];
  cwd: string;
  methodId: string;
  apiKey?: string;
  adapterVersion?: string;
}

export interface AgentAuthService {
  start(options: StartAgentAuthOptions): AgentAuthAttempt;
  /** O estado de uma tentativa. Erro de domínio para um id que não existe. */
  status(id: string): AgentAuthAttempt;
  /** Mata o adaptador. Idempotente: cancelar duas vezes não é erro. */
  cancel(id: string): AgentAuthAttempt;
  /** Quantas tentativas vivas existem, para o desligamento saber o que matar. */
  cancelAll(): void;
}

interface Attempt extends AgentAuthAttempt {
  controller: AbortController;
}

/**
 * A frase do agente, sem a chave dentro.
 *
 * Um adaptador que ecoa a credencial na mensagem de erro é plausível — *"chave
 * inválida: sk-proj-…"* — e a frase dele vai para a tela. O daemon é o único que
 * sabe qual era o segredo, então é o único que pode se recusar a repeti-lo. Ele
 * não reescreve a mensagem: troca **o valor** por pontos e deixa o resto.
 */
function redact(message: string, secret: string | undefined): string {
  if (secret === undefined || secret === "") return message;
  return message.split(secret).join("•••");
}

export function createAgentAuthService({
  acpManager,
}: {
  acpManager: Pick<AcpManager, "authenticate">;
}): AgentAuthService {
  const attempts = new Map<string, Attempt>();

  function require_(id: string): Attempt {
    const attempt = attempts.get(id);
    if (attempt === undefined) {
      throw new DomainError("NOT_FOUND", `não existe login em andamento com o id ${id}`);
    }
    return attempt;
  }

  /** A cópia que sai daqui nunca carrega o `AbortController`. */
  function view({ id, state, elicitation, message }: Attempt): AgentAuthAttempt {
    return { id, state, elicitation, message };
  }

  return {
    start(options) {
      const attempt: Attempt = {
        id: newId(),
        state: "running",
        elicitation: null,
        message: null,
        controller: new AbortController(),
      };
      attempts.set(attempt.id, attempt);

      void acpManager
        .authenticate({
          command: options.command,
          ...(options.args ? { args: options.args } : {}),
          cwd: options.cwd,
          methodId: options.methodId,
          ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
          ...(options.adapterVersion === undefined
            ? {}
            : { adapterVersion: options.adapterVersion }),
          onElicitation: (elicitation) => {
            attempt.elicitation = elicitation;
          },
          onElicitationDone: (elicitationId) => {
            // Só apaga a URL que ele mandou apagar: um `complete` de outro id é
            // de um pedido que não é o que está na tela.
            if (attempt.elicitation?.elicitationId === elicitationId) {
              attempt.elicitation = null;
            }
          },
          signal: attempt.controller.signal,
        })
        .then(() => {
          // `cancelled` ganha de `ok`: matar o processo faz o `authenticate`
          // falhar *ou* resolver, dependendo de onde ele estava, e quem cancelou
          // não pode ler "entrou" por causa dessa corrida.
          if (attempt.state === "running") attempt.state = "ok";
          attempt.elicitation = null;
        })
        .catch((error: unknown) => {
          if (attempt.state === "cancelled") return;
          attempt.state = "failed";
          attempt.elicitation = null;
          /*
           * A frase do agente, e nunca a chave.
           *
           * `DomainError` e `Error` trazem mensagem; qualquer outra coisa vira
           * uma frase nossa. O que **não** entra aqui é o pedido que falhou — ele
           * é o único lugar onde a chave existe, e um erro que ecoasse o pedido
           * inteiro colocaria o segredo num lugar de leitura.
           */
          attempt.message = redact(
            error instanceof Error ? error.message : "o adaptador recusou o login",
            options.apiKey,
          );
        });

      return view(attempt);
    },

    status(id) {
      return view(require_(id));
    },

    cancel(id) {
      const attempt = require_(id);
      if (attempt.state === "running") {
        attempt.state = "cancelled";
        attempt.elicitation = null;
        attempt.controller.abort();
      }
      return view(attempt);
    },

    cancelAll() {
      for (const attempt of attempts.values()) {
        if (attempt.state === "running") {
          attempt.state = "cancelled";
          attempt.controller.abort();
        }
      }
    },
  };
}
