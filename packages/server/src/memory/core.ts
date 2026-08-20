import type { MemoryEntryRow } from "../db/schema.js";
import type { MemoryScope } from "./entry.js";
import type { ScopeFilter } from "./shadow.js";
import { resolveVisible } from "./shadow.js";

/**
 * O **núcleo**: as memórias fixadas que entram no prompt de toda sessão.
 *
 * É a camada 1 do [context-delivery](../../../../docs/prd/workspace-memory/context-delivery.md#4-o-desenho--núcleo-skill-e-lumem-memory),
 * e a única parte da memória cujo custo é **recorrente**. Duas escolhas fecham
 * o desenho aqui:
 *
 * - **Só o que foi fixado.** O núcleo é o que alguém escolheu, nunca o que
 *   sobrou: uma memória curta não entra por ser curta, e uma longa não sai por
 *   ser longa. O filtro real é o teste de fronteira do §4.1 — *"isto muda o que
 *   o agente **faz**"* entra, *"isto explica como algo funciona"* fica no
 *   serviço, a uma pergunta de distância.
 * - **Sem teto** (D5). Cortar diretriz no meio não produz uma regra menor,
 *   produz uma regra errada. O que substitui o teto é a **marca d'água**: o
 *   tamanho é medido, mostrado, e atribuído entrada por entrada — sem medida,
 *   "sem teto" viraria crescimento invisível, que é o defeito que este arquivo
 *   inteiro existe para não ter.
 */

/** Geral primeiro, específico depois: quem lê por último decide. */
const ORDER: readonly MemoryScope[] = ["global", "workspace", "project"];

const SCOPE_TITLE: Readonly<Record<MemoryScope, string>> = {
  global: "Suas preferências, em qualquer projeto",
  workspace: "Este workspace",
  project: "Este projeto",
};

/** Trinta dias, em milissegundos — a janela da variação. */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface CoreEntry {
  path: string;
  type: string;
  scope: MemoryScope;
  slug: string;
  name: string;
  /** O que **esta** entrada custa, em caracteres do texto final. */
  chars: number;
  /** Quando ela nasceu — é o que dá a variação da marca d'água. */
  createdAt: Date;
}

export interface MemoryCore {
  /** O texto injetado. `""` quando nada foi fixado — e aí nada é injetado. */
  text: string;
  entries: readonly CoreEntry[];
  /** A marca d'água: o tamanho total, em caracteres. */
  chars: number;
  /**
   * Quantos desses caracteres entraram nos últimos 30 dias.
   *
   * É a variação que a D5 pede, medida do jeito que os dados permitem medir com
   * honestidade: sem série histórica, o que existe é a data de nascimento de
   * cada entrada. Responde a pergunta que importa — *"isto está crescendo?"* —
   * sem inventar uma curva que ninguém registrou.
   */
  recentChars: number;
}

/** O que está no núcleo, na ordem em que o agente vai ler. */
export function pinnedFor(
  rows: readonly MemoryEntryRow[],
  filter: ScopeFilter = {},
): readonly MemoryEntryRow[] {
  // A precedência vem **antes** do filtro de `pinned`, e a ordem importa: uma
  // memória sombreada perdeu, e uma perdedora fixada no núcleo seria a regra
  // vencida entrando em todo turno — exatamente o que o shadow existe para
  // impedir.
  const { visible } = resolveVisible(rows, filter);
  return visible
    .filter((row) => row.pinned)
    .sort(byScopeThenName);
}

function byScopeThenName(a: MemoryEntryRow, b: MemoryEntryRow): number {
  const scope = ORDER.indexOf(a.scope as MemoryScope) - ORDER.indexOf(b.scope as MemoryScope);
  if (scope !== 0) return scope;
  // Empate resolvido pelo nome, e não pela ordem do banco: o núcleo tem que ser
  // **estável** entre sessões, senão cada reordenação invalida o cache do
  // provedor — e o cache é justamente o que a D2 protege.
  return a.name.localeCompare(b.name, "pt-BR");
}

/**
 * O texto do núcleo, e o que ele custa.
 *
 * Recebe os corpos já lidos porque quem lê disco é o serviço: esta função é a
 * regra de montagem, e uma regra de montagem que abre arquivo não se testa sem
 * um `~/.lumem` de verdade.
 */
export function renderCore(
  entries: readonly { row: MemoryEntryRow; body: string }[],
  now: Date = new Date(),
): MemoryCore {
  if (entries.length === 0) return { text: "", entries: [], chars: 0, recentChars: 0 };

  const parts: string[] = [
    "# Memória do workspace",
    "",
    "Diretrizes que valem para este trabalho. Da mais geral para a mais específica —" +
      " quando duas se cruzam, vale a mais específica.",
  ];
  const measured: CoreEntry[] = [];
  let scope: MemoryScope | null = null;

  for (const { row, body } of entries) {
    const rowScope = row.scope as MemoryScope;
    const chunk: string[] = [];
    if (rowScope !== scope) {
      chunk.push("", `## ${SCOPE_TITLE[rowScope]}`);
      scope = rowScope;
    }
    chunk.push("", `### ${row.name}`, "", body.trim());
    const text = `${chunk.join("\n")}\n`;
    parts.push(text.replace(/\n$/, ""));
    measured.push({
      path: row.path,
      type: row.type,
      scope: rowScope,
      slug: row.slug,
      name: row.name,
      // O custo é do texto que a entrada acrescenta ao bloco — cabeçalho de
      // escopo incluído, porque ele só existe por causa dela.
      chars: text.length,
      createdAt: row.createdAt,
    });
  }

  const text = `${parts.join("\n")}\n`;
  const cutoff = now.getTime() - WINDOW_MS;
  return {
    text,
    entries: measured,
    // O total é o texto **inteiro**, cabeçalho incluído: é o que o agente
    // recebe. Somar as entradas daria um número menor e mais bonito, medindo
    // uma coisa que ninguém paga.
    chars: text.length,
    recentChars: measured
      .filter((entry) => entry.createdAt.getTime() >= cutoff)
      .reduce((total, entry) => total + entry.chars, 0),
  };
}
