import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execGit, type GitExec } from "../git/exec.js";

/**
 * O `~/.lumem` como repositório git, criado e mantido pelo daemon.
 *
 * A decisão está na Q36 de `docs/prd/workspace-memory/open-questions.md`: o
 * Lumem versiona a própria memória. Isso dá `git log` por arquivo, `git revert`
 * como desfazer, e backup resolvido por `git remote` — sem que nada disso viva
 * dentro do repositório do usuário, que é a decisão da Q3.
 *
 * A regra que separa o que entra no git: **versiona-se a fonte da verdade,
 * ignora-se o derivado**. Markdown é fonte; banco, contexto montado e a inbox
 * bruta são derivados ou efêmeros, e o banco é reconstruível por `reindex`.
 */

/** Criados no boot. Vazios até alguém escrever — git não versiona diretório vazio, e tudo bem. */
export const MEMORY_HOME_DIRS = ["memory", "workspaces", "context", "_system"] as const;

/**
 * O que fica de fora do histórico.
 *
 * `worktrees/` está aqui por um motivo que não é sobre memória: desde o
 * walking-skeleton é onde vivem as worktrees gerenciadas, que são checkouts git
 * inteiros. Versioná-las seria aninhar repositório dentro de repositório.
 */
export const MEMORY_HOME_GITIGNORE = `# Gerado pelo Lumem. Editar aqui é editar o que o daemon reescreve.
#
# A regra: versiona-se a fonte da verdade (Markdown), ignora-se o derivado.
# O banco é reconstruível por reindex; o contexto é montado por sessão; o
# _system é staging e artefato interno. Nada disso pertence ao histórico.

lumem.db
lumem.db-*
context/
_system/

# Checkouts git gerenciados — repositório dentro de repositório não.
worktrees/
`;

/**
 * Identidade dos commits do daemon, passada por `-c` em vez de gravada no
 * repositório.
 *
 * Duas razões: numa máquina sem `user.name` configurado — CI é exatamente essa
 * máquina — um commit sem isto falha; e num repositório **adotado** (o usuário
 * já tinha um git ali) o Lumem não tem por que mexer na configuração dele.
 */
const COMMIT_IDENTITY = [
  "-c",
  "user.name=Lumem",
  "-c",
  "user.email=lumem@localhost",
  // Assinatura pendurada num daemon sem TTY trava o boot em vez de falhar.
  "-c",
  "commit.gpgsign=false",
] as const;

export interface EnsureMemoryHomeOptions {
  /** Raiz do estado do Lumem — `config.stateDir`. */
  stateDir: string;
  /** Injetável só para o teste que precisa observar as chamadas; o padrão é git de verdade. */
  exec?: GitExec;
}

export interface MemoryHomeResult {
  /** `created` quando o daemon inicializou o repositório; `adopted` quando ele já existia. */
  repository: "created" | "adopted";
  /** Se este boot produziu commit. Boot idempotente devolve `false`. */
  committed: boolean;
}

/**
 * Garante que o `~/.lumem` existe, é um repositório git, e tem o `.gitignore`
 * do daemon commitado.
 *
 * Idempotente por construção: rodar duas vezes seguidas não produz commit no
 * segundo boot. É o `Done when` da T1, e o motivo de o resultado dizer
 * explicitamente se commitou.
 */
export async function ensureMemoryHome({
  stateDir,
  exec = execGit,
}: EnsureMemoryHomeOptions): Promise<MemoryHomeResult> {
  // `mode` no mkdir sofre umask; o chmod depois é o que garante 0700 de fato.
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await chmod(stateDir, 0o700);
  for (const dir of MEMORY_HOME_DIRS) {
    await mkdir(join(stateDir, dir), { recursive: true, mode: 0o700 });
  }

  const existed = await isRepositoryRoot(stateDir, exec);
  if (!existed) {
    // `-b main` porque o nome do branch inicial varia com a versão e com a
    // configuração do usuário, e um daemon que depende disso é um daemon que
    // funciona de um jeito em cada máquina.
    await exec(["init", "-b", "main"], { cwd: stateDir });
  }

  const wrote = await writeGitignoreIfDifferent(stateDir);
  const committed = wrote ? await commitGitignore(stateDir, exec) : false;

  return { repository: existed ? "adopted" : "created", committed };
}

/**
 * O state dir é a raiz de um repositório git — **dele mesmo**?
 *
 * A pergunta tem essa forma por causa de um caso que o e2e encontrou: quando o
 * state dir fica **dentro** de outro repositório (o e2e usa `.lumem-e2e/` na
 * árvore do próprio Lumem), um `rev-parse --git-dir` sobe a hierarquia e
 * responde pelo repositório de fora. O daemon então achava que já havia repo,
 * não inicializava nada, e o primeiro `git add` morria — porque aquele caminho
 * está no `.gitignore` do repositório de cima.
 *
 * Comparar o `--show-toplevel` com o próprio state dir é o que distingue "sou um
 * repositório" de "estou dentro de um". Pelo `realpath` nos dois lados, porque
 * no macOS `/tmp` é `/private/tmp` e a comparação textual falharia sozinha.
 */
async function isRepositoryRoot(stateDir: string, exec: GitExec): Promise<boolean> {
  try {
    const { stdout } = await exec(["rev-parse", "--show-toplevel"], { cwd: stateDir });
    const toplevel = await realpath(stdout.trim());
    return toplevel === (await realpath(stateDir));
  } catch {
    return false;
  }
}

async function writeGitignoreIfDifferent(stateDir: string): Promise<boolean> {
  const path = join(stateDir, ".gitignore");
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === MEMORY_HOME_GITIGNORE) return false;

  await writeFile(path, MEMORY_HOME_GITIGNORE, "utf8");
  return true;
}

async function commitGitignore(stateDir: string, exec: GitExec): Promise<boolean> {
  // `add .gitignore`, nunca `add -A`: o que não é desta operação não entra no
  // commit dela. O usuário pode ter rascunho pendente no diretório, e ele é dele.
  await exec(["add", "--", ".gitignore"], { cwd: stateDir });

  // Sem isto, um segundo boot sobre um repositório já em dia tentaria commitar
  // nada e o git sairia com erro — que aqui seria falha de boot, não aviso.
  const { stdout } = await exec(["status", "--porcelain", "--", ".gitignore"], { cwd: stateDir });
  if (stdout.trim() === "") return false;

  await exec([...COMMIT_IDENTITY, "commit", "-m", "chore(lumem): .gitignore do daemon"], {
    cwd: stateDir,
  });
  return true;
}
