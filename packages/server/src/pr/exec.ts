import { execFile } from "node:child_process";

/**
 * Rodar o `gh`, e traduzir o que dá errado.
 *
 * Esta é a primeira vez que o daemon executa um binário que não é o `git`, e o
 * §4.1 do PRD escreve a regra em quatro linhas: `argv` fixo, timeout e
 * `maxBuffer`, nenhum segredo nosso, e `stderr` nunca cru para a tela.
 *
 * A costura é a mesma do `GitExec`: quem executa é injetado. A diferença é o
 * motivo — o `git` não é dublado porque `git worktree` tem comportamento que
 * nenhum dublê reproduz; o `gh` **tem** que ser, porque ele fala com a rede e
 * com a sua conta. Chamá-lo em teste é teste que falha no avião e polui uma
 * conta real.
 */

/** Curto: a barra é polida a cada 15s, e um `gh` travado não pode segurar o ciclo. */
export const DEFAULT_GH_TIMEOUT_MS = 20_000;

/**
 * Um repositório com 300 PRs devolve megabytes.
 *
 * Menor que o do `execGit` de propósito: aqui o teto não é uma defesa contra
 * repositório grande, é a defesa contra uma resposta que veio da internet.
 */
export const GH_MAX_BUFFER = 8 * 1024 * 1024;

export interface GhExecOptions {
  cwd: string;
  timeoutMs?: number;
}

/** O que aconteceu, sem julgamento: quem julga é o `classify`. */
export interface GhResult {
  stdout: string;
  stderr: string;
  /** `null` quando o processo nem chegou a existir. */
  code: number | null;
  /** `ENOENT` quando o binário não está no PATH; `null` quando o spawn deu certo. */
  spawnError: string | null;
  /** O `gh` estourou o orçamento de tempo. */
  timedOut: boolean;
}

export type GhExec = (args: readonly string[], options: GhExecOptions) => Promise<GhResult>;

/**
 * O executor de verdade.
 *
 * Ele **não lança**: código de saída diferente de zero é resposta, e a
 * classificação é de quem chamou. Um executor que lançasse obrigaria cada
 * chamador a repetir a mesma tradução, e é assim que duas telas passam a dizer
 * coisas diferentes sobre a mesma falha.
 */
export const execGh: GhExec = (args, { cwd, timeoutMs = DEFAULT_GH_TIMEOUT_MS }) =>
  new Promise((resolve) => {
    execFile(
      "gh",
      [...args],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: GH_MAX_BUFFER,
        env: {
          ...process.env,
          // Cor no meio de um JSON é o tipo de coisa que só quebra na máquina de
          // outra pessoa, que tem `GH_FORCE_TTY` no perfil.
          NO_COLOR: "1",
          GH_NO_UPDATE_NOTIFIER: "1",
          // O `gh` chama o `git`, e o `git` pode pedir credencial. Sem isto, um
          // remote mal configurado trava o daemon até o timeout.
          GIT_TERMINAL_PROMPT: "0",
        },
      },
      (error, stdout, stderr) => {
        const failure = error as (Error & { code?: number | string; killed?: boolean }) | null;
        resolve({
          stdout,
          stderr,
          code:
            failure === null ? 0
            : typeof failure.code === "number" ? failure.code
            : null,
          spawnError: typeof failure?.code === "string" ? failure.code : null,
          timedOut: failure?.killed === true,
        });
      },
    );
  });

/**
 * As falhas que a tela sabe desenhar.
 *
 * Cinco delas são estados desenhados no protótipo (§6), e não erros: sem
 * binário, sem autenticação, sem rede, limite de API e host sem integração. A
 * sexta — `failed` — é o resto, e ela existe para que "o resto" tenha nome em
 * vez de virar um `catch` mudo.
 */
export type PrFailureKind =
  | "no-binary"
  | "no-auth"
  | "offline"
  | "rate-limit"
  | "not-a-repo"
  | "unsupported-host"
  | "timeout"
  | "failed";

export interface PrFailure {
  kind: PrFailureKind;
  /**
   * O que dizer. **Nunca o `stderr` cru** (§4.1.4 do PRD): ele pode conter URL
   * de remote, e remote mal configurado carrega credencial nela.
   */
  message: string;
  /** Quando o host informa quando volta. `null` é o caso normal, não um defeito. */
  retryAt?: string | null;
}

/**
 * O único código de saída com significado próprio.
 *
 * O spike mediu: `gh` sai **4** quando não há autenticação, e **1** para tudo o
 * mais. Então a classificação é código para um caso e `stderr` para os outros.
 */
const EXIT_AUTH_REQUIRED = 4;

/** Ditas por extenso, porque a lista é o que separa "sem rede" de "deu errado". */
const OFFLINE = [
  "dial tcp",
  "no such host",
  "connection refused",
  "network is unreachable",
  "i/o timeout",
  "tls: ",
  "proxyconnect",
  "eof",
];

/**
 * O que o `gh` disse, em uma das seis categorias.
 *
 * Pura, e testada com `stderr` capturado no spike — que é o único jeito de
 * exercitar "sem rede" sem desligar a rede.
 */
export function classify(result: GhResult): PrFailure | null {
  if (result.spawnError === "ENOENT") {
    return {
      kind: "no-binary",
      message: "o gh não está instalado ou não está no PATH",
    };
  }
  if (result.timedOut) {
    return { kind: "timeout", message: "o gh não respondeu a tempo" };
  }
  if (result.spawnError !== null) {
    return { kind: "failed", message: "não deu para executar o gh" };
  }
  if (result.code === 0) return null;

  const stderr = result.stderr.toLowerCase();

  if (result.code === EXIT_AUTH_REQUIRED || stderr.includes("gh auth login")) {
    // `gh auth login` aparece em duas mensagens diferentes, e uma delas é a de
    // host desconhecido. A ordem importa: host primeiro, senão ele vira "sem
    // autenticação" e a pessoa roda um login que não resolve nada.
    if (stderr.includes("known github host")) {
      return {
        kind: "unsupported-host",
        message: "nenhum remote deste repositório aponta para um host GitHub conhecido",
      };
    }
    return { kind: "no-auth", message: "o gh não está autenticado" };
  }

  if (stderr.includes("rate limit")) {
    return {
      kind: "rate-limit",
      message: "o limite de consultas do GitHub foi atingido",
      retryAt: parseRetryAt(result.stderr),
    };
  }

  if (stderr.includes("not a git repository")) {
    return { kind: "not-a-repo", message: "este diretório não é um repositório git" };
  }

  if (OFFLINE.some((needle) => stderr.includes(needle))) {
    return { kind: "offline", message: "não deu para falar com o GitHub" };
  }

  return { kind: "failed", message: "o gh recusou a consulta" };
}

/**
 * Quando o limite volta, se o host disser.
 *
 * O spike **não observou** este caso — a conta usada tem 5.000 requisições por
 * hora e a medição não passou de dezenas. Então o que existe aqui é derivado do
 * formato que a API do GitHub documenta, e a ausência é tratada como o caso
 * normal: `null`, e a barra diz que não sabe quando volta.
 */
function parseRetryAt(stderr: string): string | null {
  const iso = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(stderr);
  if (iso) return iso[1]!;

  const seconds = /retry after (\d+) seconds?/i.exec(stderr);
  if (seconds) return new Date(Date.now() + Number(seconds[1]) * 1000).toISOString();

  return null;
}
