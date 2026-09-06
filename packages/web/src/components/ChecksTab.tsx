import type { PrCheckGroup, PrCheckView, PullRequestView } from "@lumem/shared";

import { EmptyState } from "../ui/index.js";
import { durationOf, freshnessOf } from "./pr-words.js";

import "./pr-bar.css";

/**
 * A aba `PR` — as verificações, agrupadas, com o que precisa de você primeiro.
 *
 * Ela **só existe quando existe PR** (F2.1): aba permanente que passa a vida
 * vazia ensina o olho a pular a faixa inteira.
 *
 * A barra diz o veredito; esta aba diz de quantas coisas ele saiu. E cada linha
 * tem o seu `↗`, que abre **aquela** execução e não a PR — é a diferença entre
 * "vi que quebrou" e "vi o log".
 */

export interface ChecksTabProps {
  pull: PullRequestView;
  readAt: string | null;
  now?: number;
}

/** A ordem da atenção, e os títulos que a nomeiam. */
const GROUPS: Array<{ group: PrCheckGroup; title: string }> = [
  { group: "failed", title: "precisa de você" },
  { group: "running", title: "em andamento" },
  { group: "passed", title: "passaram" },
  { group: "skipped", title: "ignoradas" },
];

/**
 * O glifo é a categoria, e o olho lê primeiro; a palavra mora no `sr-only`.
 *
 * Mesma regra do resto do sistema: cor e forma para quem vê, palavra para quem
 * ouve, e nunca só a cor.
 */
const GLYPH: Record<PrCheckGroup, { char: string; word: string; suffix: string }> = {
  failed: { char: "✕", word: "falhou", suffix: "bad" },
  running: { char: "●", word: "rodando", suffix: "run" },
  passed: { char: "✓", word: "passou", suffix: "ok" },
  skipped: { char: "–", word: "pulada", suffix: "skip" },
};

export function ChecksTab({ pull, readAt, now }: ChecksTabProps) {
  const fresh = freshnessOf(readAt, now);

  if (pull.checks.length === 0) {
    return (
      <div className="checks">
        <EmptyState title="Nenhuma verificação">
          Esta pull request não tem verificação configurada, ou o host ainda não relatou nenhuma.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="checks">
      {GROUPS.map(({ group, title }) => {
        const rows = pull.checks.filter((check) => check.group === group);
        if (rows.length === 0) return null;

        return (
          <div key={group}>
            <div className="checks__group">{title}</div>
            {rows.map((check) => (
              <CheckRow key={`${group}:${check.name}`} check={check} />
            ))}
          </div>
        );
      })}

      {/* De quando é a leitura, e o que a aba não faz. Reexecutar é escrita no
          host, e ficou de fora do v1 mesmo depois de mesclar e criar entrarem. */}
      <div className="checks__foot">
        {fresh === null ? "lido do gh" : `lido do gh ${fresh.label}`} · reexecutar se faz no
        navegador
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: PrCheckView }) {
  const glyph = GLYPH[check.group];

  const inside = (
    <>
      <span className="checks__glyph" aria-hidden="true">
        {glyph.char}
      </span>
      <span className="sr-only">{glyph.word}</span>
      <span className="checks__body">
        {/* Nome de check é texto de gente desconhecida (§4.5): entra como
            texto, e o CSS o trunca. Nunca como HTML. */}
        <span className="checks__name">{check.name}</span>
        {check.app !== "" && <span className="checks__app">{check.app}</span>}
      </span>
      <span className="checks__time">{durationOf(check.durationMs)}</span>
    </>
  );

  if (check.url === null) {
    // §4.6: o endereço não é do host do projeto, ou não é `https`. A linha
    // aparece **sem link**, e o `title` diz por quê em vez de sumir com ela.
    return (
      <div className="checks__row" title="o endereço desta execução não é do host do projeto">
        {inside}
        <span className="checks__go" aria-hidden="true" />
      </div>
    );
  }

  return (
    <a
      className={`checks__row checks__row--${glyph.suffix} focus-ring`}
      href={check.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {inside}
      <span className="checks__go" aria-hidden="true">
        ↗
      </span>
      <span className="sr-only">abrir a execução de {check.name}</span>
    </a>
  );
}

/**
 * O distintivo da aba: a contagem, colorida pelo **pior** estado.
 *
 * `✕` > `●` > `✓`, porque é essa a ordem em que a informação importa. A
 * contagem vive na aba porque é ela que decide se vale abrir — dentro, só seria
 * legível para quem já abriu.
 */
export function checksBadge(pull: PullRequestView): { text: string; tone: string } {
  const { failed, running, passed } = pull.counts;
  if (failed > 0) return { text: `✕${String(failed)}`, tone: "bad" };
  if (running > 0) return { text: `●${String(running)}`, tone: "run" };
  return { text: `✓${String(passed)}`, tone: "ok" };
}
