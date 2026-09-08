import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseGitUrl } from "../git/git-url.js";
import { classify, execGh, type GhExec, type PrFailure } from "./exec.js";
import { safeUrl } from "./url.js";
import type {
  MergeOptions,
  PrCreateInput,
  PrHost,
  PrHostInput,
  PrMergeInput,
  PrRead,
  PrWrite,
} from "./PrHost.js";
import type { GhPullRequest } from "./verdict.js";

/**
 * GitHub, pelo `gh`.
 *
 * A [Q1](../../../../docs/features/013-pull-request-status/open-questions.md) escolheu o
 * CLI em vez da API com token nosso, e o motivo não é performance: **o Lumem
 * não guarda token, não pede token e não lê token**, e essa ausência é a maior
 * parte da resposta de segurança da feature. O `gh` já resolveu autenticação,
 * na keychain da sua máquina.
 *
 * O que ele custa está medido em `docs/features/013-pull-request-status/spike.md`.
 */

/** Quantas PRs pedir. O spike mediu que o custo cresce com este número. */
const DEFAULT_LIMIT = 50;

/**
 * Os campos que a tabela de veredito precisa, e nenhum a mais.
 *
 * Todos existem em `pr list`, o que é o achado que faz a **consulta por
 * projeto** (F4.3) ser possível: oito worktrees custam um processo, não oito.
 */
const FIELDS = [
  "number",
  "url",
  "title",
  "state",
  "isDraft",
  "mergeable",
  "mergeStateStatus",
  "reviewDecision",
  "latestReviews",
  "headRefName",
  "baseRefName",
  "updatedAt",
  "mergedAt",
  "closedAt",
  "author",
  "statusCheckRollup",
].join(",");

/**
 * A projeção, e por que ela é constante.
 *
 * `latestReviews` traz o **corpo inteiro** de cada revisão — num repositório com
 * revisor automático, 300 KB para 50 PRs, e nada disso chega à tela. A projeção
 * corta antes de virar string no daemon.
 *
 * Ela é escrita aqui, no código, e nada de UI entra nela: continua valendo o
 * §4.1 do PRD. E ela tem um efeito de projeto que vale mais que os bytes — a
 * **forma da resposta passa a ser nossa**, e a fixture congela um formato que
 * não depende de o `gh` reorganizar o dele.
 *
 * `.name // .context` normaliza o `StatusContext`, que é o status de commit
 * antigo e não tem `name` nem `workflowName`.
 */
const PROJECTION = [
  "map({number, url, title, state, isDraft, mergeable, mergeStateStatus, reviewDecision,",
  "headRefName, baseRefName, updatedAt, mergedAt, closedAt,",
  'author: (.author.login // ""),',
  'reviews: [.latestReviews[]? | {author: (.author.login // ""), state: .state}],',
  "checks: [.statusCheckRollup[]? | {",
  'name: (.name // .context // ""), app: (.workflowName // .context // ""),',
  'status: (.status // "COMPLETED"), conclusion: (.conclusion // .state // ""),',
  'url: (.detailsUrl // .targetUrl // ""),',
  "startedAt: (.startedAt // null), completedAt: (.completedAt // null)}]})",
].join(" ");

const REPO_FIELDS = [
  "nameWithOwner",
  "mergeCommitAllowed",
  "squashMergeAllowed",
  "rebaseMergeAllowed",
  "deleteBranchOnMerge",
].join(",");

/**
 * O que a UI **não** pode mandar para dentro de um `argv`.
 *
 * NUL até US, mais DEL. Escrita em escapes para ninguém ter de confiar em bytes
 * — a mesma forma do `git-url.ts`, e pelo mesmo motivo: uma quebra de linha num
 * título de PR parte um argumento em dois para qualquer coisa que um dia
 * escreva isto num arquivo ou num log. Recusado antes de virar argumento, e não
 * depois (§4.2.11 do PRD).
 */
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface GhHostOptions {
  exec?: GhExec;
  limit?: number;
}

export function createGhHost({ exec = execGh, limit = DEFAULT_LIMIT }: GhHostOptions = {}): PrHost {
  /**
   * De qual host é este repositório.
   *
   * Pelo `git-url.ts`, que a `project-from-url` já escreveu e já testou — e que
   * já recusa `ext::` e companhia. Host que não é GitHub responde "sem
   * integração", **com o host nomeado**: silenciar seria o produto fingindo que
   * a worktree não tem PR.
   */
  function hostOf(remoteUrl: string | null): string | null {
    if (remoteUrl === null || remoteUrl.trim() === "") return null;
    const parsed = parseGitUrl(remoteUrl);
    if (!parsed.ok) return null;
    // Sem a porta: `github.com:443` e `github.com` são o mesmo host, e a URL de
    // comparação que sai daqui não pode carregar uma porta que não existe.
    const host = parsed.url.host.split(":")[0] ?? "";
    return host === "" ? null : host.toLowerCase();
  }

  function isGitHub(host: string | null): boolean {
    if (host === null) return false;
    // `github.com` e as instalações Enterprise, que costumam ser `github.<empresa>`.
    return host === "github.com" || host.endsWith(".github.com") || host.startsWith("github.");
  }

  async function run(
    args: readonly string[],
    cwd: string,
  ): Promise<{ ok: true; stdout: string } | { ok: false; failure: PrFailure }> {
    const result = await exec(args, { cwd });
    const failure = classify(result);
    return failure === null ? { ok: true, stdout: result.stdout } : { ok: false, failure };
  }

  function unsupported(host: string | null): PrFailure {
    return {
      kind: "unsupported-host",
      message:
        host === null
          ? "este repositório não tem um remote conhecido"
          : `o Lumem ainda não fala com ${host}`,
    };
  }

  /**
   * Um valor de UI, colado à flag.
   *
   * Não há shell em lugar nenhum deste caminho — `execFile` recebe um vetor —,
   * então injeção de comando não é o risco. O que sobra é **injeção de flag**:
   * um título que começa com `-` seria lido como opção se viajasse solto. Colado
   * à flag, ele é um token só e não pode virar outra coisa (§4.2.9).
   */
  function flag(name: string, value: string): string {
    return `--${name}=${value}`;
  }

  function refuseControl(value: string, what: string): PrFailure | null {
    return CONTROL.test(value)
      ? { kind: "failed", message: `o ${what} tem caracteres de controle` }
      : null;
  }

  return {
    name: "GitHub",

    supports(remoteUrl) {
      return isGitHub(hostOf(remoteUrl));
    },

    async read({ repoPath, remoteUrl }: PrHostInput): Promise<PrRead> {
      const host = hostOf(remoteUrl);
      if (!isGitHub(host)) return { ok: false, failure: unsupported(host) };

      /*
       * Duas consultas, em paralelo, e não uma.
       *
       * `gh repo view` custou 0,44 s no spike e responde o que a F7.3 precisa —
       * quais estratégias de merge o repositório permite. Em paralelo com a
       * lista ele não acrescenta tempo de parede; em série, acrescentaria meio
       * segundo a cada ciclo de 15 s.
       */
      const [pulls, repo] = await Promise.all([
        run(
          [
            "pr",
            "list",
            "--state",
            "all",
            "--limit",
            String(limit),
            "--json",
            FIELDS,
            "--jq",
            PROJECTION,
          ],
          repoPath,
        ),
        run(["repo", "view", "--json", REPO_FIELDS], repoPath),
      ]);

      if (!pulls.ok) return pulls;
      if (!repo.ok) return repo;

      const parsed = parseJson<GhPullRequest[]>(pulls.stdout, []);
      const settings = parseJson<Record<string, unknown>>(repo.stdout, {});

      if (parsed === null || settings === null) {
        return {
          ok: false,
          failure: { kind: "failed", message: "o gh respondeu algo que não é JSON" },
        };
      }

      return {
        ok: true,
        snapshot: {
          host: host ?? "",
          repo: typeof settings.nameWithOwner === "string" ? settings.nameWithOwner : "",
          pulls: parsed,
          merge: mergeOptionsOf(settings),
          readAt: new Date().toISOString(),
        },
      };
    },

    async create(input: PrCreateInput): Promise<PrWrite> {
      const host = hostOf(input.remoteUrl);
      if (!isGitHub(host)) return { ok: false, failure: unsupported(host) };

      const bad =
        refuseControl(input.title, "título") ??
        refuseControl(input.base, "nome da base") ??
        refuseControl(input.head, "nome da branch");
      if (bad !== null) return { ok: false, failure: bad };
      if (input.title.trim() === "") {
        return { ok: false, failure: { kind: "failed", message: "a PR precisa de um título" } };
      }

      /*
       * O corpo vai por **arquivo**, e não por argumento (§4.2.10).
       *
       * Um corpo de PR tem quebras de linha, tem markdown e tem tamanho — e
       * argumento longo esbarra em `ARG_MAX` numa máquina e não na outra, que é
       * o defeito que só aparece na de outra pessoa.
       */
      const dir = await mkdtemp(join(tmpdir(), "lumem-pr-"));
      const bodyFile = join(dir, "body.md");
      try {
        await writeFile(bodyFile, input.body, "utf8");

        const args = [
          "pr",
          "create",
          flag("base", input.base),
          flag("head", input.head),
          flag("title", input.title),
          flag("body-file", bodyFile),
        ];
        if (input.draft) args.push("--draft");

        const result = await run(args, input.repoPath);
        if (!result.ok) return { ok: false, failure: createFailure(result.failure) };

        // O `gh pr create` imprime a URL da PR criada na última linha — e ela
        // passa pela **mesma porta** que todas as outras (§4.6). Ninguém a usa
        // hoje, o que é justamente o motivo de ela poder sair errada em
        // silêncio: campo de URL não validado é campo que uma tela futura vai
        // tratar como validado.
        const printed = result.stdout.trim().split("\n").at(-1)?.trim() ?? "";
        return { ok: true, url: safeUrl(printed, host) ?? "" };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    async merge(input: PrMergeInput): Promise<PrWrite> {
      const host = hostOf(input.remoteUrl);
      if (!isGitHub(host)) return { ok: false, failure: unsupported(host) };

      // O número vem do cache do daemon, mas atravessa uma fronteira de processo
      // até aqui — e um número que não é inteiro positivo é defeito de quem
      // chamou, não pedido de quem clicou.
      if (!Number.isInteger(input.number) || input.number <= 0) {
        return { ok: false, failure: { kind: "failed", message: "número de PR inválido" } };
      }

      const args = ["pr", "merge", String(input.number), `--${input.strategy}`];
      if (input.deleteBranch) args.push("--delete-branch");

      const result = await run(args, input.repoPath);
      if (!result.ok) return { ok: false, failure: mergeFailure(result.failure) };
      return { ok: true, url: "" };
    },
  };
}

/**
 * O que uma escrita recusada quer dizer.
 *
 * O `classify` conhece as falhas de **transporte**; estas são de **domínio**, e
 * só existem no caminho da escrita. Continua valendo a regra do §4.1.4: sai a
 * classificação, nunca o `stderr` cru.
 */
function createFailure(failure: PrFailure): PrFailure {
  if (failure.kind !== "failed") return failure;
  return { kind: "failed", message: "o GitHub recusou criar a pull request" };
}

function mergeFailure(failure: PrFailure): PrFailure {
  if (failure.kind !== "failed") return failure;
  return { kind: "failed", message: "o GitHub recusou o merge" };
}

function mergeOptionsOf(settings: Record<string, unknown>): MergeOptions {
  const flagOf = (key: string): boolean => settings[key] === true;
  const options = {
    merge: flagOf("mergeCommitAllowed"),
    squash: flagOf("squashMergeAllowed"),
    rebase: flagOf("rebaseMergeAllowed"),
    deleteBranchOnMerge: flagOf("deleteBranchOnMerge"),
  };
  // Um repositório sem nenhuma estratégia não existe: se as três vieram falsas,
  // o que a resposta diz é que o campo não veio — e oferecer zero botão seria
  // pior que oferecer o padrão do host.
  if (!options.merge && !options.squash && !options.rebase) {
    return { ...options, merge: true };
  }
  return options;
}

/** `null` quando não é JSON. Vazio vira o padrão, porque `gh` cala em repo sem PR. */
function parseJson<T>(stdout: string, whenEmpty: T): T | null {
  const text = stdout.trim();
  if (text === "") return whenEmpty;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
