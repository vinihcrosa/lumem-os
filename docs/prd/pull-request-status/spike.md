# O que o `gh` responde, medido

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Task:** P0

Medido em **2026-09-05**, numa máquina macOS (`darwin 25.6.0`), com `gh version 2.92.0`, autenticado
em `github.com` pela keychain. Este arquivo existe porque a feature inteira depende da saída de um
programa de outro projeto, e "a gente supõe que ele responde assim" não é base para escrever um
adaptador.

**Recomendação, em uma linha:** **dá** para fazer a consulta por projeto — um `gh pr list` traz todas
as PRs do repositório, e oito worktrees custam um processo. Com um `--limit`, porque o custo cresce
com o número de PRs abertas e não com o de worktrees.

---

## 1. O que existe na máquina

```
$ gh --version
gh version 2.92.0 (2026-04-28)

$ gh auth status
github.com
  ✓ Logged in to github.com account vinihcrosa (keyring)
  - Token scopes: 'delete_repo', 'gist', 'project', 'read:org', 'repo', 'workflow'
```

**Instalado e não autenticado** foi medido separando a configuração
(`GH_CONFIG_DIR` vazio, `GH_TOKEN=` e `GITHUB_TOKEN=`):

```
$ gh pr list --json number
exit 4
stderr: To get started with GitHub CLI, please run:  gh auth login
        Alternatively, populate the GH_TOKEN environment variable with a GitHub API
        authentication token.
```

**O código de saída `4` é o sinal**, e é o único caso que tem código próprio. Tudo o mais sai `1`, e a
classificação precisa olhar o `stderr`.

---

## 2. Os campos que `pr list` aceita

`gh pr list --json` sem valor imprime a lista inteira. Todos os campos que a
[F4.4](prd.md) precisa **estão em `list`** — nenhum deles é exclusivo de `pr view`, então o
`pr view` por PR (que custaria N processos) **não é necessário**.

A consulta que ficou:

```
gh pr list --state all --limit <N> --json <campos> --jq <projeção>
```

| Campo | Para quê |
|---|---|
| `number`, `url`, `title` | identidade, e o `↗` |
| `state`, `isDraft` | `MERGED` / `CLOSED` / `OPEN`, e rascunho |
| `mergeable` | `MERGEABLE`, `CONFLICTING`, `UNKNOWN` |
| `mergeStateStatus` | `CLEAN`, `BLOCKED`, `DIRTY`, `BEHIND`, `UNSTABLE`, `DRAFT`, `UNKNOWN` |
| `reviewDecision` | `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, `""` |
| `latestReviews` | **quem** pediu mudanças — a F1.4 quer o culpado por nome |
| `headRefName`, `baseRefName` | é o que casa a PR com a worktree |
| `updatedAt`, `mergedAt`, `closedAt` | o desempate da [Q8](open-questions.md) e o teto da [Q7](open-questions.md) |
| `author` | quem abriu |
| `statusCheckRollup` | a lista de verificações inteira |

### Por que existe uma `--jq`

`latestReviews` traz o **corpo inteiro** de cada revisão. Num repositório com revisor automático, um
único comentário passa de 2 KB de markdown — e nada disso aparece na tela. A projeção corta a
resposta antes de ela virar string no daemon:

| Consulta | Bytes | Tempo |
|---|---|---|
| 50 PRs, com `latestReviews` cru | **300 KB** | 8,4 s |
| 50 PRs, com a projeção | **236 KB** | 8,6 s |
| 30 PRs de um repositório pequeno | 40 KB | 2,4 s |
| 5 PRs de um repositório pequeno | 4 KB | **0,7 s** |

A `--jq` é **constante**, escrita no código, e portanto não fere o §4.1 do PRD: nada de UI entra
nela. Ela também tem um efeito de projeto que vale mais que os bytes — a **forma da resposta passa a
ser nossa**, e a fixture congela um formato que não depende de o `gh` reorganizar os dele.

O que sobra dos 236 KB é `statusCheckRollup`: 50 PRs × ~30 verificações. É o argumento para o
`--limit`, e não para outra consulta.

---

## 3. O que ele respondeu de verdade

### `mergeable` **muda de comportamento com o estado da PR**

É o achado que mais mexe no código:

| Estado da PR | `mergeable` | `mergeStateStatus` |
|---|---|---|
| aberta | `MERGEABLE` / `CONFLICTING` | resolvido |
| mesclada ou fechada | **`UNKNOWN`** | **`UNKNOWN`** |

O GitHub calcula mergeabilidade sob demanda, e não a calcula para PR que já acabou. Uma tabela de
veredito que lesse `mergeable` antes de `state` pintaria toda PR mesclada de âmbar. **A ordem da
tabela é `state` primeiro**, e a P1 tem um caso para isso.

`UNKNOWN` também aparece em PR **aberta** logo depois de um push, enquanto o GitHub ainda calcula.
Nesse caso ele é honesto e a resposta é `pending` — nunca `ready`, e nunca `blocked`.

### Os valores observados

Numa amostra de 50 PRs abertas de um repositório grande, mais 30 PRs de um pequeno:

| Enum | Observado |
|---|---|
| `mergeable` | `MERGEABLE`, `CONFLICTING`, `UNKNOWN` |
| `mergeStateStatus` | `CLEAN`, `BLOCKED`, `DIRTY`, `UNKNOWN` |
| `reviewDecision` | `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, `""` |
| revisão (`latestReviews[].state`) | `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED` |
| verificação — `status` | `COMPLETED` |
| verificação — `conclusion` | `SUCCESS`, `FAILURE`, `SKIPPED` |

**Não observados**, e por isso construídos como fixture declarada
(`__fixtures__/gh-pr-list-built.json`): `QUEUED` e `IN_PROGRESS` — a captura pegou todo mundo com CI
terminado —, e o `StatusContext`, que é o status de commit antigo e não tem `name` nem
`workflowName`. Os dois vêm dos enums documentados do GraphQL do GitHub, e o adaptador normaliza
`context` para os dois campos que faltam. `BEHIND` e `UNSTABLE` também não apareceram; a tabela os
trata, e o teste diz que são derivados da documentação e não da medição.

### `reviewDecision` vazio não é ausência de revisão

Ele vem `""` quando o repositório **não exige** revisão. Tratar `""` como `REVIEW_REQUIRED` bloquearia
toda PR de repositório pessoal — que é o caso mais comum de quem usa o Lumem.

---

## 4. Os casos degradados, um a um

| Situação | `exit` | `stderr` |
|---|---|---|
| não autenticado | **4** | `To get started with GitHub CLI, please run: gh auth login` |
| `cwd` não é repositório git | 1 | `failed to run git: fatal: not a git repository` |
| remote não é GitHub | 1 | `none of the git remotes configured for this repository point to a known GitHub host` |
| sem rede | 1 | `Post "https://api.github.com/graphql": ... dial tcp ...: connect: connection refused` |
| binário ausente | — | `ENOENT` do `execFile`, antes de haver `stderr` |
| repositório **sem nenhuma PR** | **0** | vazio — a saída é `[]` |
| limite de API | **não observado** | ver abaixo |

**Repositório sem PR responde `[]` e sai zero.** Não é erro, é resposta — e a barra diz "sem pull
request", que é o estado `none` da F1.2.

**O limite de API não foi observado**, e isto está dito em vez de suposto: a conta usada tem 5.000
requisições/hora e a medição inteira não passou de algumas dezenas. O adaptador classifica pela
mensagem (`API rate limit exceeded`) e lê o horário de volta quando o `gh` o informa; o caminho é
exercitado por fixture de `stderr`, e não por medição.

**`stderr` pode conter a URL do remote**, e remote mal configurado carrega credencial nela. Por isso o
§4.1.4 do PRD: o que sai do adaptador é a **classificação**, nunca o `stderr` cru.

---

## 5. O que a escrita precisa ([Q3](open-questions.md), [Q4](open-questions.md))

```
$ gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge
{"deleteBranchOnMerge":false,"mergeCommitAllowed":true,"rebaseMergeAllowed":true,"squashMergeAllowed":true}
0,44 s
```

É daqui que sai a lista de estratégias da F7.3 — o Lumem **oferece as que o repositório permite** e
não inventa nenhuma. A consulta é barata e cabe no mesmo cache da leitura.

Os dois verbos:

```
gh pr merge <número> --squash|--merge|--rebase [--delete-branch]
gh pr create --base=<base> --head=<head> --title=<título> --body-file=<arquivo> [--draft]
```

`--flag=valor` colado, e corpo por arquivo: os dois são o §4.2 do PRD, e a razão está lá.

---

## 6. Como recapturar quando o `gh` mudar

As fixtures em `packages/server/src/pr/__fixtures__/` são **dados reais com os nomes trocados** —
`pessoa-1`, `pessoa-2`, e assim por diante. O que não é real está no arquivo `gh-pr-list-built.json`,
que existe justamente para o que não deu para observar.

Para refazer:

```sh
FIELDS=number,url,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,\
latestReviews,headRefName,baseRefName,updatedAt,mergedAt,closedAt,author,statusCheckRollup

gh pr list --state all --limit 30 --json "$FIELDS" > /tmp/bruto.json
```

Depois, projete cada PR para a forma de `GhPullRequest` (ver `pr/GhHost.ts`, que é a fonte da
projeção), troque os logins e salve. **Nunca commite a saída crua**: ela tem corpo de revisão, e
corpo de revisão é texto de outra pessoa.

Quando um teste da P1 ou da P2 quebrar depois de uma atualização do `gh`, é aqui que a investigação
começa — e a primeira pergunta é se o que mudou foi um campo ou um enum.
