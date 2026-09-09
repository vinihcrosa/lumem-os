import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Por caminho relativo, como o `scripts/check-adapters.ts` já faz: o tsconfig da
// raiz — que cobre `e2e/` — não resolve `@lumem/shared`.
import { CLAUDE_ADAPTER, CODEX_ADAPTER } from "../../packages/shared/src/adapters.js";
import { ADAPTERS_DIR_NAME } from "../../packages/shared/src/constants.js";

import { E2E_PRODUCTION_STATE_DIR, E2E_STATE_DIR } from "../../ports.js";

/**
 * A throwaway git repository for the e2e suite.
 *
 * Deliberately *not* the Lumem repository itself: the suite creates worktrees
 * and branches, and doing that in the developer's own checkout would leave
 * their `git branch` output full of test debris.
 */
export const E2E_FIXTURE_DIR = fileURLToPath(new URL("../../.lumem-e2e-fixtures/", import.meta.url));
export const E2E_FIXTURE_REPO = join(E2E_FIXTURE_DIR, "repo");

/** A second repository, so specs sharing a daemon cannot collide on branches. */
export const E2E_FIXTURE_REPO_ALT = join(E2E_FIXTURE_DIR, "repo-alt");

/** A third, for the right panel: it needs a tree to walk and a file to read. */
export const E2E_FIXTURE_REPO_FILES = join(E2E_FIXTURE_DIR, "repo-files");

/**
 * A fourth, for the editor, and it is not sharing the third.
 *
 * This is the first spec whose gestures *change* the checkout: it corrects a
 * line, renames a file and deletes one, and it does so in a repository the
 * right panel is asserting the contents of. Sharing one would make the order
 * the specs happen to run in part of what each of them proves.
 */
export const E2E_FIXTURE_REPO_EDITOR = join(E2E_FIXTURE_DIR, "repo-editor");

/** Where the ACP conversation spec makes its worktree. */
export const E2E_FIXTURE_REPO_ACP = join(E2E_FIXTURE_DIR, "repo-acp");

/**
 * A fifth, and this one is never registered — it is cloned *from*.
 *
 * `file://` is the transport, because D11 says no test of this feature touches
 * the network, and it is the same code path the product runs for any other
 * address.
 */
export const E2E_FIXTURE_REPO_ORIGIN = join(E2E_FIXTURE_DIR, "repo-origin");

/** A sixth, cloned from and holding no commit at all — Q19. */
export const E2E_FIXTURE_REPO_EMPTY = join(E2E_FIXTURE_DIR, "repo-empty");

/** An "agent CLI" that echoes what it is given. Never the real `claude`. */
export const E2E_FIXTURE_AGENT = join(E2E_FIXTURE_DIR, "bin", "fake-agent");

/**
 * Um sétimo, e este já vem com `[scripts]` commitado.
 *
 * Commitado, e não escrito na árvore de trabalho, porque é isso que a feature
 * promete: worktree nova é checkout do que está versionado, e um `project.toml`
 * fora do commit não chega nela.
 */
export const E2E_FIXTURE_REPO_SCRIPTS = join(E2E_FIXTURE_DIR, "repo-scripts");

/**
 * O contrário do de cima: um repositório que **não** diz como rodar.
 *
 * Ele existe em vez de reaproveitar o `repo` genérico porque os specs dividem um
 * daemon só, e o daemon recusa o mesmo caminho duas vezes — um repositório já
 * adicionado por outro spec não pode ser adicionado de novo com outro nome. É o
 * estado **normal** de todo projeto que entra no Lumem, e o único lugar do produto
 * que diz que este repositório não sabe se levantar.
 */
export const E2E_FIXTURE_REPO_NOSCRIPTS = join(E2E_FIXTURE_DIR, "repo-noscripts");

/**
 * Um oitavo, e este tem `origin` apontando para o GitHub — sem nunca ir lá.
 *
 * O remote existe porque é dele que o adaptador descobre o host (F4.2). Nada
 * nesta suíte faz fetch, push ou clone a partir dele: o `gh` é falso e o git
 * nunca é chamado com rede.
 */
export const E2E_FIXTURE_REPO_PR = join(E2E_FIXTURE_DIR, "repo-pr");

/**
 * O estado que o `gh` de mentira responde, reescrito entre um passo e outro.
 *
 * É o que faz o e2e andar de âmbar a vermelho a verde sem um CI existir.
 */
export const E2E_GH_STATE = join(E2E_FIXTURE_DIR, "gh-state.json");

/** O `gh` de mentira, no mesmo diretório de bin que o adaptador. */
export const E2E_FIXTURE_GH = join(E2E_FIXTURE_DIR, "bin", "gh");
export const E2E_FAKE_GH = fileURLToPath(new URL("./fake-gh.mjs", import.meta.url));

/** Where the first-access spec makes its project. */
export const E2E_FIXTURE_REPO_ONBOARDING = join(E2E_FIXTURE_DIR, "repo-onboarding");

/**
 * O repositório de onde se corta worktree por origem (`026-worktree-from`).
 *
 * Ele tem as três coisas que a feature precisa e que nenhum outro fixture tem:
 * uma branch **local** que já existe, uma branch **publicada** — um
 * `refs/remotes/origin/*` escrito com `update-ref`, que é exatamente o que um
 * fetch deixaria em disco — e um `origin` do GitHub para o adaptador reconhecer
 * o host.
 *
 * `update-ref` e não `fetch`: nada nesta suíte vai à rede, e a ref publicada é o
 * dado que separa "PR que dá para cortar" de "PR que precisa de fetch" (F3.3).
 */
export const E2E_FIXTURE_REPO_ORIGINS = join(E2E_FIXTURE_DIR, "repo-origins");

/** O outro lado do `fetch`: um repositório em disco no papel do host. */
export const E2E_FIXTURE_REPO_ORIGINS_UPSTREAM = join(E2E_FIXTURE_DIR, "repo-origins-upstream");

/**
 * The adapter, under the name the onboarding looks for.
 *
 * The flow detects `claude-agent-acp` and then spawns it — that detection *is*
 * what the first-access spec is about, so it cannot be side-stepped by configuring
 * a command by hand the way the other specs do. This is a shim with the right
 * name; what it execs is the same fake agent everything else here uses.
 *
 * **It is written into the daemon's own adapters directory since 2026-09-08**, and
 * no longer only onto its PATH. A shim on the PATH stopped being launchable at all
 * — [ADR de
 * 2026-09-08](../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
 * —, which is the decision working: the copy the daemon launches is the copy the
 * daemon owns. It stays on the PATH too, because `setup.agents` still *reports*
 * what is there (Q2) and the flow reads that report.
 *
 * Deliberately with **no `package.json` beside it**: that is the "layout this
 * daemon did not write" case, so both `installAdapter` and the boot reconcile leave
 * it alone instead of downloading 243 MB per e2e run.
 */
export const E2E_FIXTURE_BIN = join(E2E_FIXTURE_DIR, "bin");
export const E2E_FIXTURE_ADAPTER = join(E2E_FIXTURE_BIN, "claude-agent-acp");
/**
 * O adaptador do **segundo** agente, com o nome que o catálogo procura.
 *
 * Ele existe para o caminho do `＋` (`second-agent`, T13): o painel só instala
 * quando o pré-voo **não** acha o binário, então um shim com o nome catalogado é o
 * que faz a tela conectar um segundo agente sem o daemon rodar `npm install` — que
 * numa suíte de e2e seriam 300 MB de rede por execução.
 *
 * O perfil do fake vai por ambiente na configuração, e não aqui: este arquivo é o
 * binário, e o perfil é de quem o lança.
 */
export const E2E_FIXTURE_CODEX_ADAPTER = join(E2E_FIXTURE_BIN, "codex-acp");

/**
 * An ACP agent that speaks the protocol over stdio and never calls a model.
 *
 * Lives beside the specs rather than in the generated fixture directory: it is
 * source, not a fixture, and it is the only thing here that has to be readable
 * when a test about it fails.
 */
export const E2E_FAKE_ACP_AGENT = fileURLToPath(new URL("./fake-acp-agent.mjs", import.meta.url));

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Lumem E2E",
      GIT_AUTHOR_EMAIL: "e2e@lumem.local",
      GIT_COMMITTER_NAME: "Lumem E2E",
      GIT_COMMITTER_EMAIL: "e2e@lumem.local",
    },
  });
}

/**
 * Rebuilt from nothing on every run, not reused.
 *
 * The state directory is wiped each run but a git repository is not: branches
 * created by the last run survive, and the second run then fails on "a branch
 * already exists" for a worktree the daemon has no record of. That failure
 * looks like a product bug and is not one.
 */
export function createFixtures(): void {
  rmSync(E2E_FIXTURE_DIR, { recursive: true, force: true });

  for (const repo of [
    E2E_FIXTURE_REPO,
    E2E_FIXTURE_REPO_ALT,
    E2E_FIXTURE_REPO_FILES,
    E2E_FIXTURE_REPO_EDITOR,
    E2E_FIXTURE_REPO_ACP,
    E2E_FIXTURE_REPO_ONBOARDING,
    E2E_FIXTURE_REPO_ORIGIN,
    E2E_FIXTURE_REPO_SCRIPTS,
    E2E_FIXTURE_REPO_NOSCRIPTS,
    E2E_FIXTURE_REPO_PR,
  ]) {
    mkdirSync(repo, { recursive: true });
    git(repo, "init", "--initial-branch", "main", ".");
    writeFileSync(join(repo, "README.md"), "# fixture\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-m", "initial");
  }

  // Somewhere for the files column to walk into, with a line worth reading at
  // the end of it. Committed, so the checkout starts clean.
  mkdirSync(join(E2E_FIXTURE_REPO_FILES, "src", "lore"), { recursive: true });
  writeFileSync(
    join(E2E_FIXTURE_REPO_FILES, "src", "lore", "loader.ts"),
    'export const CARIMBO = "lido pela coluna";\n',
  );
  git(E2E_FIXTURE_REPO_FILES, "add", "-A");
  git(E2E_FIXTURE_REPO_FILES, "commit", "-m", "arquivos para a coluna");

  // A line that is wrong, one directory down, and committed — so correcting it
  // is a one-line diff the `Mudanças` tab can be asked about, and so the file
  // has to be walked into rather than sitting at the root. The wrong and the
  // right spelling differ by a whole word, which is what lets an assertion say
  // which of the two the disk is holding.
  mkdirSync(join(E2E_FIXTURE_REPO_EDITOR, "src"), { recursive: true });
  writeFileSync(
    join(E2E_FIXTURE_REPO_EDITOR, "src", "notes.ts"),
    ['export const RESPOSTA = "quarenta e um";', 'export const AUTOR = "o agente";', ""].join("\n"),
  );
  git(E2E_FIXTURE_REPO_EDITOR, "add", "-A");
  git(E2E_FIXTURE_REPO_EDITOR, "commit", "-m", "arquivo para o editor");

  // Os scripts do projeto, versionados: um `setup` que deixa marca no disco e um
  // `run` que imprime a linha do Vite e fica de pé. O `run` lê `LUMEM_RUN_PORT`
  // de propósito — é o caminho determinístico da S6, e o que o botão `Abrir`
  // deveria preferir.
  mkdirSync(join(E2E_FIXTURE_REPO_SCRIPTS, ".lumem"), { recursive: true });
  writeFileSync(
    join(E2E_FIXTURE_REPO_SCRIPTS, ".lumem", "project.toml"),
    [
      'id = "prj_e2e_scripts"',
      "",
      "[scripts]",
      "setup = 'echo preparada > preparada.txt'",
      // Aspas simples: em TOML elas fazem string literal, e o comando tem aspas
      // duplas dentro. A primeira versão deste arquivo usou aspas duplas nos dois
      // níveis e gravou TOML inválido — o daemon recusou, como deve, e o e2e
      // travou numa tela que não sabia mostrar o erro. As duas coisas foram
      // consertadas.
      "run = 'echo \"Local: http://127.0.0.1:$LUMEM_RUN_PORT/\"; sleep 120'",
      "test = 'echo 3 testes, tudo verde'",
      "teardown = 'echo tchau > /dev/null'",
      "",
    ].join("\n"),
  );
  git(E2E_FIXTURE_REPO_SCRIPTS, "add", "-A");
  git(E2E_FIXTURE_REPO_SCRIPTS, "commit", "-m", "scripts do projeto");

  // Um repositório sem nenhum commit, para o F6.13: ele clona, o projeto nasce
  // válido, e a tela de criar worktree explica por que ainda não dá.
  mkdirSync(E2E_FIXTURE_REPO_EMPTY, { recursive: true });
  git(E2E_FIXTURE_REPO_EMPTY, "init", "--initial-branch", "main", ".");

  /*
   * O remote de onde o host é descoberto.
   *
   * `https://github.com/...` e não um `file://`: o que o `git-url.ts` responde
   * decide se o adaptador do GitHub aceita o repositório, e um `file://` faria
   * a barra dizer "sem integração" — que é o outro teste, não este.
   *
   * Nada aqui vai à rede: o `gh` é falso, e o git só é chamado para ler
   * referências que já estão no disco.
   */
  git(E2E_FIXTURE_REPO_PR, "remote", "add", "origin", "https://github.com/exemplo/repo.git");

  /*
   * As quatro origens, com o disco preparado para as três que dependem dele.
   *
   * A branch publicada é escrita com `update-ref`: a suíte não vai à rede, e o
   * que interessa é o que sobra em disco depois de um fetch — que é uma ref em
   * `refs/remotes/origin/`. A que **não** existe é a prova da outra metade: uma
   * PR cuja head nunca foi buscada não pode virar worktree sem fetch.
   */
  /*
   * Primeiro o "servidor": um repositório em disco que faz o papel do GitHub.
   *
   * Ele existe porque a reversão da Q2 fez o daemon **buscar** a head de uma PR
   * que não está no clone ([ADR](../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md)),
   * e um `fetch` precisa de alguém do outro lado.
   */
  mkdirSync(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, { recursive: true });
  git(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "init", "--initial-branch", "main", ".");
  writeFileSync(join(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "README.md"), "# origens\n");
  git(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "add", "README.md");
  git(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "commit", "-m", "initial");
  git(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "branch", "feature-publicada");
  // A que o clone **não** vai ter: é dela que o teste da busca corta.
  git(E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "branch", "publicada-depois");

  git(E2E_FIXTURE_DIR, "clone", "--", E2E_FIXTURE_REPO_ORIGINS_UPSTREAM, "repo-origins");
  git(E2E_FIXTURE_REPO_ORIGINS, "branch", "feature-local");
  // O clone trouxe as duas branches publicadas; esta sai para o teste da busca
  // ter o que buscar. É o estado real de quem não roda `fetch` há uma semana.
  git(E2E_FIXTURE_REPO_ORIGINS, "update-ref", "-d", "refs/remotes/origin/publicada-depois");

  /*
   * E o `origin` passa a **parecer** GitHub sem deixar de ser local.
   *
   * `GhHost.supports` decide pelo host da URL do remote, então um `file://` não
   * teria aba de PR nenhuma. `insteadOf` é o mecanismo do próprio git para isto:
   * a URL configurada continua sendo a do GitHub — é o que o daemon lê e o que o
   * adaptador reconhece —, e **na hora de falar com a rede** o git a reescreve
   * para o caminho em disco. Zero rede, e o caminho de código é o de verdade,
   * incluindo o `fetch`.
   */
  git(E2E_FIXTURE_REPO_ORIGINS, "remote", "set-url", "origin", "https://github.com/exemplo/repo.git");
  git(
    E2E_FIXTURE_REPO_ORIGINS,
    "config",
    `url.${E2E_FIXTURE_REPO_ORIGINS_UPSTREAM}.insteadOf`,
    "https://github.com/exemplo/repo.git",
  );

  const binDir = join(E2E_FIXTURE_DIR, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    E2E_FIXTURE_AGENT,
    ['#!/bin/sh', 'echo "fake-agent pronto em $(pwd)"', "cat", ""].join("\n"),
    { mode: 0o755 },
  );

  // `--version` too, because the agent step reads it: a binary that answers
  // nothing is a different case, and it has its own unit test.
  writeFileSync(
    E2E_FIXTURE_ADAPTER,
    [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo "0.0.0"; exit 0; fi',
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(E2E_FAKE_ACP_AGENT)} "$@"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  // O mesmo shim, com o nome do segundo adaptador do catálogo. Ele responde o
  // perfil codex por causa do `LUMEM_FAKE_PROFILE` que o `exec` propaga.
  writeFileSync(
    E2E_FIXTURE_CODEX_ADAPTER,
    [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo "1.10.0"; exit 0; fi',
      "LUMEM_FAKE_PROFILE=codex",
      "export LUMEM_FAKE_PROFILE",
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(E2E_FAKE_ACP_AGENT)} "$@"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  /*
   * E as mesmas duas cópias no diretório que o daemon **possui**, que é de onde ele
   * lança desde 2026-09-08 — [ADR de
   * 2026-09-08](../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
   *
   * Sem isto, `setup.probe` recusa e o primeiro acesso não passa do passo do agente:
   * um shim no PATH deixou de ser lançável, o que é a decisão funcionando. Elas
   * continuam no PATH também, porque `setup.agents` ainda **relata** o que está lá
   * (Q2) e a tela lê esse relatório.
   *
   * Sem `package.json` ao lado, de propósito: é o caso "layout que este daemon não
   * escreveu", então tanto o `installAdapter` quanto a conferência de boot deixam
   * quieto em vez de baixar 243 MB por execução da suíte.
   */
  for (const stateDir of [E2E_STATE_DIR, E2E_PRODUCTION_STATE_DIR]) {
    for (const [spec, shim] of [
      [CLAUDE_ADAPTER, E2E_FIXTURE_ADAPTER],
      [CODEX_ADAPTER, E2E_FIXTURE_CODEX_ADAPTER],
    ] as const) {
      const managed = join(stateDir, ADAPTERS_DIR_NAME, spec.id, "node_modules", ".bin");
      mkdirSync(managed, { recursive: true });
      copyFileSync(shim, join(managed, spec.command));
      chmodSync(join(managed, spec.command), 0o755);
    }
  }

  // O `gh`, com o mesmo shim de sempre: processo de verdade, `argv` de verdade,
  // saída de verdade — e zero rede.
  writeFileSync(
    E2E_FIXTURE_GH,
    [
      "#!/bin/sh",
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(E2E_FAKE_GH)} "$@"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  // Começa sem PR nenhuma. O spec escreve o resto.
  writeFileSync(E2E_GH_STATE, JSON.stringify({ pulls: [] }), "utf8");
}
