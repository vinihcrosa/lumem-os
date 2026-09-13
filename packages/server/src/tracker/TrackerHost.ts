/**
 * O tracker é uma porta, e o Linear é a primeira implementação dela
 * (`028` Partes 5 e 6 — T42).
 *
 * **A credencial vem do ambiente do daemon**, e o
 * [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1531-tracker-credentials-come-from-the-environment.md)
 * é quem diz por quê: o Lumem não guarda segredo, e a quarta saída — a que nem o
 * §11 nem a medição tinham visto — já estava implementada duas vezes neste
 * produto, no `apiKeyEnv` da `021` e no `redact` da `009`.
 *
 * As quatro regras que este arquivo sustenta, e **nenhuma delas é nova**:
 *
 * 1. a chave vem do ambiente, e nada aqui a escreve;
 * 2. o que sai daqui carrega o **nome** da variável, nunca o valor;
 * 3. mensagem de erro do host é **redigida** antes de subir;
 * 4. sem a variável, o host reporta **ausência** — e ausência não é erro.
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
  /** O nome da variável de ambiente. **Nome**, nunca valor. */
  readonly keyEnv: string;
  /** A chave está presente no ambiente do daemon. */
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
