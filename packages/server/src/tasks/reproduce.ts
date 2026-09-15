import { execFile } from "node:child_process";

/**
 * O daemon rerodando o que o revisor afirmou (`028` Parte 7 — T54).
 *
 * **É o que torna o balde `blocks` honesto.** Um achado que segura o cartão
 * traz o comando que o demonstra, e quem arbitra é a máquina: reproduziu, volta
 * ao implementador; não reproduziu, o achado **cai** — e fica registrado, porque
 * um revisor que afirma o que não se sustenta é um sinal sobre o revisor.
 *
 * **O comando vem do agente, e isso não acrescenta capacidade nenhuma.** A
 * sessão dele roda em `bypassPermissions` dentro do mesmo checkout — ele já
 * podia rodar qualquer coisa, e com menos teto. O que esta função acrescenta é o
 * contrário: um lugar único, com prazo, com saída capturada e com o resultado
 * guardado ao lado da afirmação.
 *
 * O que ela **não** faz, e é de propósito: não tenta interpretar a saída. Quem
 * decide se a saída bate com o `expected` é o `matches` abaixo, e ele é
 * deliberadamente burro — a alternativa seria o daemon aprendendo a ler saída de
 * teste de qualquer linguagem.
 */

/** Meio minuto. Reprodução é uma pergunta, não uma suíte. */
export const REPRODUCE_TIMEOUT_MS = 30_000;

/** Quanto da saída fica guardado. O que faz alguém discordar está no começo. */
const KEEP_BYTES = 4000;

export interface ReproduceResult {
  /** `null` quando o processo não chegou a terminar — teto, ou shell ausente. */
  exitCode: number | null;
  output: string;
}

export type Reproducer = (input: {
  command: string;
  cwd: string;
  timeoutMs?: number;
}) => Promise<ReproduceResult>;

export const reproduce: Reproducer = async ({
  command,
  cwd,
  timeoutMs = REPRODUCE_TIMEOUT_MS,
}) => {
  /*
   * Pelo shell de login, como o `ScriptRunner` faz — e pelo mesmo motivo: o
   * comando que o revisor colou é o que ele rodou no terminal dele, com `&&`,
   * pipe e variável de ambiente. Recusar isso faria metade das reproduções
   * falharem por sintaxe em vez de por conteúdo.
   */
  const shell = process.env.SHELL ?? "/bin/sh";

  return new Promise<ReproduceResult>((resolve) => {
    const child = execFile(
      shell,
      ["-lc", command],
      { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.slice(0, KEEP_BYTES);
        /*
         * O teto não é falha do comando, e tratá-lo como tal faria uma
         * reprodução lenta virar *"o revisor mentiu"*. `exitCode: null` é o que
         * o chamador lê como **não deu para verificar** — e um achado não
         * verificado continua segurando, dizendo isso.
         */
        if (error !== null && (error as { killed?: boolean }).killed === true) {
          resolve({ exitCode: null, output: `${output}\n[a reprodução passou do tempo]` });
          return;
        }
        resolve({ exitCode: child.exitCode ?? (error === null ? 0 : 1), output });
      },
    );
  });
};

/**
 * A saída bate com o que o revisor disse que ela mostraria?
 *
 * **Deliberadamente burro:** substring, sem normalizar nada além de espaço em
 * branco nas pontas. A alternativa é o daemon aprendendo a ler saída de teste de
 * qualquer linguagem, e aí ele passa a errar de um jeito que ninguém consegue
 * prever a partir do que está escrito no achado.
 *
 * Sem `expected`, o que conta é o **código de saída**: um comando que falha é a
 * demonstração mais comum, e exigir texto dela seria cerimônia.
 */
export function matches(result: ReproduceResult, expected: string | null): boolean {
  if (result.exitCode === null) return false;
  if (expected === null || expected.trim() === "") return result.exitCode !== 0;
  return result.output.includes(expected.trim());
}
