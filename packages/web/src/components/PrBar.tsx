import { useState, type ReactNode } from "react";

import type { PrStatus } from "@lumem/shared";

import { Button } from "../ui/index.js";
import { PrWriteDialog } from "./PrWriteDialog.js";
import {
  freshnessOf,
  toneOf,
  wordsFor,
  wordsForFailure,
  wordsForNoPr,
  type PrTone,
  type PrWords,
} from "./pr-words.js";

import "./pr-bar.css";

/**
 * **Dá pra mesclar?** — no topo do painel direito, em duas linhas.
 *
 * A cor é a resposta; a palavra confirma; o motivo explica. Os três existem
 * porque cor sozinha não é sinal acessível, e porque um vermelho que não diz o
 * que houve manda você para o navegador — que é exatamente a ida que a feature
 * promete evitar.
 *
 * Nada aqui decide o veredito: ele vem derivado do daemon (F4.4), e é o mesmo
 * que pinta o marcador da sidebar. O que este componente faz é **traduzir** e
 * **desenhar**.
 */

export interface PrBarProps {
  status: PrStatus;
  worktreeId: string;
  /** `null` enquanto a idade não precisa ser recalculada por relógio de teste. */
  now?: number;
  /** "Tentar de novo" — invalida o cache do daemon e relê. */
  onRetry(): void;
  /** Some com a barra neste projeto. Só para as falhas permanentes (F1.8). */
  onDismiss(): void;
}

/**
 * Um texto que veio de fora, com pedaços em destaque.
 *
 * Partido em pedaços em vez de HTML porque §4.5: título de PR, nome de check e
 * nome de gente são texto de gente desconhecida. O React escapa; o que esta
 * forma proíbe é a exceção esperta que alguém acrescentaria depois.
 */
function Why({ words }: { words: PrWords["why"] }): ReactNode {
  return (
    <span className="prbar__why">
      {/* A chave é o índice, e aqui isso é correto: são pedaços de uma frase,
          sem identidade própria e sem reordenação possível. A frase inteira é
          substituída quando o motivo muda. */}
      {words.map((part, index) =>
        part.strong === true ? (
          <b key={index}>{part.text}</b>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function PrBar({ status, worktreeId, now, onRetry, onDismiss }: PrBarProps) {
  const [writing, setWriting] = useState<"merge" | "create" | null>(null);

  const pull = status.pull;
  const failure = status.failure;

  /*
   * A cor vem do que se **sabe**, e não do que acabou de falhar.
   *
   * Verde velho continua verde: apagar a cor por causa da rede seria trocar uma
   * informação verdadeira e velha por nenhuma. Quem conta a verdade sobre a
   * idade é o `prbar__fresh`, que fica âmbar.
   */
  const tone: PrTone = pull === null ? "none" : toneOf(pull.verdict);

  const words =
    pull !== null
      ? wordsFor(pull)
      : failure !== null
        ? wordsForFailure(failure, status.host)
        : wordsForNoPr(status);

  // Quando há PR **e** falha, o motivo da PR é o que interessa e a falha vira
  // um adendo: é o estado "offline com o último dado" do §6 do protótipo.
  const aside =
    pull !== null && failure !== null ? wordsForFailure(failure, status.host) : null;

  const fresh = freshnessOf(status.readAt, now);
  const dismissible =
    pull === null && failure !== null && wordsForFailure(failure, status.host).dismissible;

  const canMerge =
    pull !== null &&
    pull.verdict === "ready" &&
    (status.merge.merge || status.merge.squash || status.merge.rebase);
  const canCreate = pull === null && status.published && failure === null && status.host !== null;

  return (
    <>
      <div className={`prbar prbar--${tone}`} role="status" aria-label="estado da pull request">
        <div className="prbar__top">
          {pull !== null && <PrPill pull={pull} />}
          <span className="prbar__state">
            <span className="prbar__dot" aria-hidden="true" />
            <span className="prbar__word">{words.state}</span>
          </span>
        </div>

        <div className="prbar__reason">
          <Why words={aside === null ? words.why : [...words.why, { text: " · " }, ...aside.why]} />
          {fresh !== null && (
            <span className={`prbar__fresh${fresh.stale ? " prbar__fresh--stale" : ""}`}>
              {fresh.label}
            </span>
          )}
        </div>

        {(canMerge || canCreate || status.compareUrl !== null || failure !== null) && (
          <div className="prbar__acts">
            {canMerge && (
              <Button size="sm" variant="primary" onClick={() => setWriting("merge")}>
                mesclar
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setWriting("create")}>
                abrir pull request
              </Button>
            )}
            {pull === null && status.compareUrl !== null && (
              // Não cria nada: leva à tela onde o host já pergunta título, corpo
              // e reviewers — e onde moram template e labels, que o Lumem não faz.
              <a
                className="btn btn--sm focus-ring"
                href={status.compareUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                comparar no GitHub <span aria-hidden="true">↗</span>
              </a>
            )}
            {failure !== null && (
              <Button size="sm" variant="ghost" onClick={onRetry}>
                tentar de novo
              </Button>
            )}
            {dismissible && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                não mostrar mais
              </Button>
            )}
          </div>
        )}
      </div>

      {writing !== null && (
        <PrWriteDialog
          verb={writing}
          status={status}
          worktreeId={worktreeId}
          onClose={() => setWriting(null)}
        />
      )}
    </>
  );
}

/**
 * A pastilha do número, que **é** o link.
 *
 * Um alvo só, e o `↗` separado por uma divisa dizendo para onde leva. Sem
 * `href` quando a URL não passou na validação do §4.6 — e aí ela é só a
 * identidade, sem link, que é o que a regra manda acontecer.
 */
function PrPill({ pull }: { pull: NonNullable<PrStatus["pull"]> }) {
  const label = `abrir a pull request ${String(pull.number)} no navegador`;

  return (
    <>
      {pull.url === null ? (
        <span className="prbar__pr" title="o endereço desta pull request não é do host do projeto">
          <span className="prbar__num">#{pull.number}</span>
        </span>
      ) : (
        <a className="prbar__pr focus-ring" href={pull.url} target="_blank" rel="noopener noreferrer">
          <span className="prbar__num">#{pull.number}</span>
          <span className="prbar__go" aria-hidden="true">
            ↗
          </span>
          <span className="sr-only">{label}</span>
        </a>
      )}
      {pull.alsoOpen > 0 && (
        <span className="prbar__more" title="esta branch tem mais de uma pull request aberta">
          +{pull.alsoOpen}
        </span>
      )}
    </>
  );
}
