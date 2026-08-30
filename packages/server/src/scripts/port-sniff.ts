/**
 * De onde sai o número do botão `Abrir :PORTA` (S6).
 *
 * Duas fontes, e a diferença entre elas é o motivo de a proveniência viajar até a
 * tela:
 *
 * - **`env`** — o script leu `LUMEM_RUN_PORT` e subiu ali. Determinístico, e só
 *   existe para o projeto que decidiu usar a variável;
 * - **`output`** — a porta foi lida da saída. Acerta o Vite, o Next, o `serve` e uns
 *   dez formatos comuns; erra calado no resto.
 *
 * Um botão que abre a porta errada é pior que não ter botão. Como a segunda fonte
 * pode errar, ela **não** finge ser a primeira: quem lê a tela vê de onde o número
 * saiu e decide se acredita.
 */

export type PortSource = "env" | "output";

export interface DiscoveredPort {
  port: number;
  source: PortSource;
}

/**
 * Quanto da saída a busca olha, a partir do start.
 *
 * O teto existe porque o alvo é a linha que um servidor imprime ao subir, e ela sai
 * nos primeiros instantes. Sem ele, um `run` de dois dias faria o daemon rodar regex
 * sobre megabytes de log — e, pior, um número solto na saída de amanhã mudaria a
 * porta do botão sem nada ter mudado no processo.
 */
export const SNIFF_LIMIT_BYTES = 64 * 1024;

/**
 * Os formatos que valem.
 *
 * Todos exigem contexto — `http://`, `localhost`, a palavra `port` — e é isso que
 * separa "a porta é 5173" de "o log tem um 5173 dentro". A regra que ficou de fora
 * de propósito: número solto. Log estruturado é cheio deles.
 */
const PATTERNS: readonly RegExp[] = [
  // http://localhost:5173/ · https://127.0.0.1:8080 · http://0.0.0.0:3000
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])\s*:\s*(\d{2,5})\b/i,
  // Listening on port 8080 · listening at port 3000 · running on port 4000
  /\b(?:listening|running|started|serving|available)\b[^\n\d]{0,40}?\bport\s*[:=]?\s*(\d{2,5})\b/i,
  // port: 3000 · "port":3000 — o formato que um log JSON usa para dizer a porta
  /"?\bport"?\s*[:=]\s*"?(\d{2,5})\b/i,
];

/** Sequências de escape ANSI — cor e posição de cursor no meio do que se quer ler. */
const ANSI = /\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * A primeira porta plausível de um pedaço de saída.
 *
 * Devolve `null` quando não há nenhuma, e isso é o caso comum: a maioria dos scripts
 * de `run` não é servidor.
 */
export function sniffPort(output: string): number | null {
  const clean = output.replace(ANSI, "");

  for (const pattern of PATTERNS) {
    const match = pattern.exec(clean);
    if (!match) continue;

    const port = Number.parseInt(match[1] as string, 10);
    // Abaixo de 1024 é porta privilegiada: um `run` de desenvolvimento não sobe
    // ali, e o que casou foi outra coisa — um horário, um código de saída.
    if (port >= 1024 && port <= 65_535) return port;
  }
  return null;
}

/**
 * Acompanha a saída de um run até achar a porta ou gastar o teto.
 *
 * Guarda um resto entre pedaços porque a linha do Vite chega partida com frequência —
 * o PTY entrega o que couber no buffer, não o que faz sentido para quem lê.
 */
export class PortWatcher {
  private seen = 0;
  private tail = "";
  private found: DiscoveredPort | null;

  constructor(reservedPort: number | null, usesReservedPort: boolean) {
    // Quando o script usa a variável, não há o que farejar: a resposta é a
    // reserva, e ela é melhor que qualquer regex porque não pode estar errada.
    this.found =
      usesReservedPort && reservedPort !== null ? { port: reservedPort, source: "env" } : null;
  }

  /** Verdadeiro enquanto ainda vale olhar o que chega. */
  get watching(): boolean {
    return this.found === null && this.seen < SNIFF_LIMIT_BYTES;
  }

  get result(): DiscoveredPort | null {
    return this.found;
  }

  push(chunk: string): void {
    if (!this.watching) return;

    this.seen += chunk.length;
    const text = this.tail + chunk;
    const port = sniffPort(text);
    if (port !== null) {
      this.found = { port, source: "output" };
      this.tail = "";
      return;
    }

    // O resto guardado é do tamanho da maior linha que interessa. Guardar tudo
    // seria refazer a busca sobre a saída inteira a cada pedaço.
    this.tail = text.slice(-500);
  }
}

/**
 * O script leu a porta que o Lumem reservou.
 *
 * Verificado no **texto do comando**, e não no processo: é a diferença entre "este
 * projeto decidiu usar a variável" e "algum processo por acaso escutou nela".
 */
export function usesReservedPort(command: string): boolean {
  return /LUMEM_RUN_PORT\b/.test(command);
}
