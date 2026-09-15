/**
 * O tracker é uma porta, e o Linear é a primeira implementação dela
 * (`028` Partes 5 e 6 — T42).
 *
 * **A credencial vem do cofre do Lumem**, e o
 * [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)
 * é quem diz por quê: *o Lumem guarda as chaves dos serviços de que depende*. O
 * `gh` foi solução **daquele** caso e ler do ambiente foi **simplicidade** —
 * nenhuma das duas era política, e o ADR anterior errou ao generalizá-las.
 *
 * As quatro regras que este arquivo sustenta:
 *
 * 1. a chave vem do cofre, e nada aqui a copia para um campo;
 * 2. o que sai daqui carrega o **id do serviço**, nunca o valor;
 * 3. mensagem de erro do host é **redigida** antes de subir;
 * 4. sem credencial, o host reporta **ausência** — e ausência não é erro.
 */

/** Uma issue como o Lumem a enxerga. O vocabulário é nosso; o host se adapta. */
export interface TrackerIssue {
  /** O id do host — opaco, e é ele que vira `external_id`. */
  id: string;
  /** `ACME-142`. É o que o cartão mostra. */
  key: string;
  title: string;
  body: string;
  /** A URL para abrir no navegador. */
  url: string;
  /** `open` | `closed`, no nosso vocabulário e não no do host. */
  state: "open" | "closed";
  /** Quem está com ela lá, ou `null`. Muda de valor → foi reatribuída. */
  assignee: string | null;
}

export interface TrackerHost {
  /** `linear`. Vira `external_source`, e é o que escolhe a implementação. */
  readonly id: string;
  /** O id do serviço no cofre. **Id**, nunca valor. */
  readonly secretId: string;
  /** Há credencial guardada para este host. */
  available(): boolean;
  /** As issues com o rótulo, ou `[]`. Nunca lança por ausência de chave. */
  labelled(label: string): Promise<TrackerIssue[]>;
  /** Um comentário na issue. Cortesia, e não portão (Q64). */
  comment(issueId: string, body: string): Promise<void>;
  /** Move o estado lá, e só com mapa (Q65). `stateId` é vocabulário do host. */
  moveState(issueId: string, stateId: string): Promise<void>;
}

/**
 * A frase de um erro de terceiro, sem a chave dentro.
 *
 * Cópia deliberada do `redact` do `agent-auth.ts`, e não um import: aquele é
 * sobre a mensagem que o **adaptador** ecoa, e este sobre a que o **host** ecoa.
 * Compartilhar a função amarraria dois módulos que não têm nada em comum além de
 * uma linha — e é uma linha que precisa existir dos dois lados de qualquer jeito.
 */
export function redactKey(message: string, key: string | undefined): string {
  if (key === undefined || key === "") return message;
  return message.split(key).join("•••");
}
