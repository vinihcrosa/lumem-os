/**
 * O selo do cartão (`028` §4.1, T10).
 *
 * **Ele guarda o verbo e devolve o substantivo.** `revisando há 2 min`, não
 * `revisor trabalhando há 2 min` — que pede 168px numa caixa de **151 medidos**,
 * e o papel já está escrito no cabeçalho da coluna. Esperando, o substantivo
 * volta: aí ele não é redundante, é o que falta, e `aguardando implementador`
 * mede **148px** com 3px de folga.
 *
 * Anel é *ninguém está trabalhando*, disco é *alguém está* — um eixo só, e ele
 * sobrevive a captura em escala de cinza.
 */

/** O que o daemon deriva. Espelha `packages/server/src/tasks/seal.ts`. */
export type SealRole = "implementador" | "revisor" | "testador";

export type Seal =
  | { kind: "manual" }
  | { kind: "waiting"; role: SealRole }
  | { kind: "working"; role: SealRole | null; since: string }
  | { kind: "blocked"; reason: string }
  | { kind: "paused"; until: string };

/** O verbo de cada papel, e o genérico de quem está numa coluna sem papel. */
const VERB: Record<SealRole, string> = {
  implementador: "implementando",
  revisor: "revisando",
  testador: "testando",
};

/**
 * `Xm`/`Xh`/`Xd`, e nunca segundos.
 *
 * O selo é lido de relance e o número existe para comparar cartões, não para
 * cronometrar um: `implementando há 47 s` muda a cada segundo e não diz nada
 * que `agora` não diga.
 */
export function elapsed(fromIso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(fromIso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h`;
  return `${String(Math.floor(hours / 24))} d`;
}

/** A classe do cartão, que é quem carrega a cor da barra de 2px. */
export function sealModifier(seal: Seal): string {
  return seal.kind === "working" ? "work" : seal.kind === "waiting" ? "wait" : seal.kind;
}

export function sealText(seal: Seal, now = Date.now()): string {
  switch (seal.kind) {
    case "manual":
      return "manual — ninguém pega";
    case "waiting":
      return `aguardando ${seal.role}`;
    case "working":
      // Sem papel é você tendo assumido o volante numa coluna que não tem um.
      // `trabalhando` é o genérico dos três verbos, não um quarto papel.
      return `${seal.role === null ? "trabalhando" : VERB[seal.role]} há ${elapsed(seal.since, now)}`;
    case "blocked":
      return `bloqueada: ${seal.reason}`;
    case "paused":
      return `pausada até ~${new Date(seal.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

export function TaskSeal({ seal, now }: { seal: Seal; now?: number }) {
  return (
    <div className="seal">
      <span className="seal__dot" />
      <span className="seal__t">{sealText(seal, now)}</span>
    </div>
  );
}
