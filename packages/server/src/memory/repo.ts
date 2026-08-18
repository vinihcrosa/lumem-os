import type { FastifyBaseLogger } from "fastify";

import { execGit, type GitExec } from "../git/exec.js";

/**
 * O commit por mudança da Q36.
 *
 * Uma escrita aplicada vira um commit no `~/.lumem`, com mensagem derivada da
 * operação. Isso é o que dá `git log` por memória — e, com o WAL magro da Q37,
 * é **o** histórico de conteúdo: o WAL guarda a decisão e o SHA, não o texto
 * anterior.
 *
 * A regra que mais importa aqui: **falha de git não desfaz a escrita.** O disco
 * é a fonte da verdade; o histórico é serviço prestado a ela. Um daemon que
 * apagasse a memória recém-escrita porque o `commit` falhou estaria tratando o
 * histórico como se fosse o dado.
 */

/**
 * Todo comando daqui é **literal**, inclusive os que não recebem pathspec.
 *
 * `--` não desliga glob nem assinatura mágica: um caminho com `*` casaria outro
 * arquivo, e `git add --all -- <glob>` commitaria a edição pendente dele. É a
 * armadilha de `docs/project/testing.md` — e ela vale para o `~/.lumem`, onde os
 * caminhos são montados com ids que hoje vêm do cliente.
 *
 * Nos quatro comandos e não só nos dois com pathspec: dois comandos sobre o mesmo
 * arquivo com regras de interpretação diferentes é a divergência que volta.
 */
const LITERAL = ["--literal-pathspecs"] as const;

const COMMIT_IDENTITY = [
  "-c",
  "user.name=Lumem",
  "-c",
  "user.email=lumem@localhost",
  "-c",
  "commit.gpgsign=false",
] as const;

export type MemoryOperation = "add" | "update" | "delete";

export interface CommitChangeOptions {
  stateDir: string;
  /** Caminhos relativos ao state dir, com barra. Só o que a operação tocou. */
  paths: readonly string[];
  operation: MemoryOperation;
  /** O que aparece na mensagem: `feedback/integridade-de-teste`, por exemplo. */
  subject: string;
  /** Quem originou. Vai no corpo da mensagem, porque é o que se pergunta depois. */
  actor: string;
  exec?: GitExec;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export interface CommitChangeResult {
  /** O SHA, quando houve commit. O WAL guarda isto no lugar do conteúdo anterior (Q37). */
  commit: string | null;
  /** Por que não commitou, quando não commitou. Nunca silêncio. */
  skipped?: "nothing-to-commit" | "git-failed";
}

/**
 * Commita exatamente os caminhos de uma operação.
 *
 * `git add <paths>`, nunca `-A`: o `~/.lumem` é um diretório vivo, com rascunho
 * do usuário e arquivo de outra operação em voo. Varrer tudo faria o commit de
 * uma memória carregar o trabalho de outra.
 */
export async function commitChange({
  stateDir,
  paths,
  operation,
  subject,
  actor,
  exec = execGit,
  log,
}: CommitChangeOptions): Promise<CommitChangeResult> {
  if (paths.length === 0) return { commit: null, skipped: "nothing-to-commit" };

  try {
    // `--all` no add para que apagar também entre: sem ele, `git add <path>` de
    // um arquivo que não existe mais falha em vez de registrar a remoção.
    await exec([...LITERAL, "add", "--all", "--", ...paths], { cwd: stateDir });

    const { stdout } = await exec([...LITERAL, "status", "--porcelain", "--", ...paths], {
      cwd: stateDir,
    });
    if (stdout.trim() === "") return { commit: null, skipped: "nothing-to-commit" };

    // Pathspec também no `commit`, e não só no `add`: sem o `-- <paths>` o git
    // commita **o índice inteiro**, e num `~/.lumem` adotado o `git add` que o
    // usuário deixou pendente entraria de carona no commit da memória. E literal
    // como os outros, porque é pathspec de novo.
    await exec(
      [
        ...LITERAL,
        ...COMMIT_IDENTITY,
        "commit",
        "-m",
        messageFor(operation, subject, actor),
        "--",
        ...paths,
      ],
      { cwd: stateDir },
    );

    const { stdout: sha } = await exec([...LITERAL, "rev-parse", "HEAD"], { cwd: stateDir });
    return { commit: sha.trim() };
  } catch (error) {
    // Visível, e não fatal. O `Done when` da T3 é exatamente este caso: com o
    // repositório impedido de commitar, a escrita ainda aconteceu.
    log?.warn({ err: error, paths, operation }, "memória escrita, mas o commit falhou");
    return { commit: null, skipped: "git-failed" };
  }
}

/**
 * A mensagem.
 *
 * Formato deliberado: o assunto diz **o que** mudou, o corpo diz **quem** pediu.
 * Um `git log --oneline` do `~/.lumem` tem que ser lido como a história do que o
 * sistema aprendeu, não como ruído de máquina.
 */
function messageFor(operation: MemoryOperation, subject: string, actor: string): string {
  const verb = { add: "aprende", update: "atualiza", delete: "esquece" }[operation];
  return `${verb}: ${subject}\n\nOrigem: ${actor}\n`;
}
