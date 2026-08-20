import type { AcpEvent } from "@lumem/shared";

import type { PlaybookRow } from "../db/schema.js";

/**
 * O carregamento de um playbook, lido do que o protocolo diz (Q16).
 *
 * O adaptador ACP expõe chamada de Skill como `tool_call`, então carregar um
 * playbook chega aqui como um evento com nome e título. É o que tornou a
 * telemetria de uso viável — antes dela, o §9 dependia de controlar o agente.
 *
 * **É subcontagem, e isso é aceito por escrito.** Um agente que lê o playbook
 * pela CLI sem passar por Skill não aparece; um que decora o procedimento e não
 * carrega nada, também não. A consequência está no PRD: *"nada é arquivado
 * automaticamente"* — a contagem sugere, nunca decide.
 *
 * O reconhecimento é **conservador** de propósito. Superconter faria a sugestão
 * de arquivar mentir na direção que ninguém percebe: um playbook que ninguém usa
 * pareceria vivo, e continuaria custando revisão sua para sempre.
 */

/** O que faz um `tool_call` ser carregamento de Skill, e não outra coisa. */
const SKILL_NAME = /^(skill|playbook)/i;
/**
 * O prefixo que sobra no texto depois do nome da ferramenta.
 *
 * Repetido de propósito: o nome e o título costumam **os dois** começar por
 * `Skill`, e juntá-los produz `skill-skill-...`.
 */
const SKILL_PREFIX = /^(?:(?:skill|playbook)-)+/;

export interface PlaybookLoad {
  path: string;
}

/**
 * Qual playbook este evento carregou, se algum.
 *
 * A comparação é **exata**, e as duas tentativas de fazer por substring foram
 * derrubadas por teste. A primeira contava um `Read` do próprio arquivo do
 * playbook — o caminho contém a palavra "playbook", e isso bastava. A segunda
 * fazia um slug curto engolir o vizinho: `revisar` casava dentro de
 * `revisar-pr-grande`, e o playbook errado parecia vivo.
 *
 * Então: o **nome da ferramenta** tem que ser Skill (não o título, que é texto
 * livre), e o que sobra depois dele tem que ser **igual** ao slug ou à classe de
 * tarefa normalizada. Subcontar é o preço aceito; superconter faria a sugestão de
 * arquivar mentir na direção que ninguém percebe.
 */
export function playbookLoadedBy(
  event: AcpEvent,
  known: readonly Pick<PlaybookRow, "path" | "slug" | "taskClass">[],
): PlaybookLoad | null {
  if (event.type !== "tool_call") return null;

  // O nome programático quando existe; só então o título, e aí exigindo que ele
  // **comece** por Skill — um título que menciona a palavra no meio é prosa.
  const named = event.name ?? event.title;
  if (!SKILL_NAME.test(named.trim())) return null;

  const target = normalize(`${event.name ?? ""} ${event.title}`).replace(SKILL_PREFIX, "");
  if (target === "") return null;

  for (const playbook of known) {
    if (target === playbook.slug || target === normalize(playbook.taskClass)) {
      return { path: playbook.path };
    }
  }
  return null;
}

/** Minúsculas, sem acento, e todo separador virando hífen — como o slug é escrito. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
