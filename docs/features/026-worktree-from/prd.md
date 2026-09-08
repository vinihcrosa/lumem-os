# PRD — De onde cortar: worktree a partir de uma issue, de uma branch ou de uma PR

> **Status:** proposta
> **Histórico:** v0.1 — proposta em **2026-09-07**, a partir da anotação visual na tela `/`
> (viewport 3440×1321, `<App> <CreateWorktreeDialog> <Modal>`). O §3 foi escrito **depois** de medir,
> e a medição mudou três decisões antes de existir código
> **Perguntas:** [open-questions.md](open-questions.md) — 5 do pedido, **todas respondidas**, mais 4
> que a medição abriu
> **Tasks:** [tasks.md](tasks.md) — 14 tasks em 6 fases, 3 entregues (a fase 0 é este documento)
> **Issue de rastreio:** [LUM-52](https://linear.app/lumem-os/issue/LUM-52/worktree-from-cortar-worktree-de-uma-issue-branch-ou-prmr)
> **Depende de:** a [013-pull-request-status](../013-pull-request-status/prd.md), que deixou o `gh`,
> o `PrHost` e o `PrCache` de pé — e o [ADR do `gh`](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md),
> que continua valendo palavra por palavra
> **Desenho:** uma tela nova no Open Design (`lumem-worktree-from`), e ela vem **antes** do React —
> [regra de 2026-08-19](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)

---

## 1. O problema, em uma frase

**O Lumem sabe que uma PR existe, mas não sabe cortar uma worktree dela.**

A worktree nova nasce **sempre** da branch default, com um campo só. O produto já lê o host — a
[013-pull-request-status](../013-pull-request-status/prd.md) põe `● #19` na linha da sidebar e
responde *"dá pra mesclar?"* no topo do painel direito — e ainda assim o gesto mais comum do produto
ignora tudo isso: para trabalhar na PR #19 você digita um nome à mão e depois faz `git checkout` no
terminal, o que é o mesmo que dizer que o harness não ajudou.

## 2. O que existe hoje, medido

| Onde | O quê |
|---|---|
| `packages/web/src/components/CreateWorktreeDialog.tsx` | um `Input` só — o nome, que também é a branch. Nenhum seletor de origem |
| `packages/server/src/routers/worktree.ts:110` | `create` aceita `{ projectId, name }`. **Só isso** |
| `packages/server/src/routers/worktree.ts:137` | a base é `project.defaultBranch`, **sempre** |
| `packages/server/src/routers/worktree.ts:95` | a `preview` carimba `baseBranch: project.defaultBranch` e monta a string `git worktree add -b …` **à mão** |
| `packages/server/src/git/GitService.ts:341` | `addWorktree` sabe **um** caso: `worktree add -b <nome> <path> <default>` |
| `packages/server/src/git/GitService.ts:344` | o guard `branchExists` **recusa** branch existente — é exatamente o caso novo |
| `packages/server/src/git/GitService.ts:419` | `hasRemoteBranch`, por `for-each-ref refs/remotes/`, **sem rede** |
| `packages/server/src/pr/GhHost.ts` | quatro comandos: `pr list`, `repo view`, `pr create`, `pr merge`. `headRefName` **já** está na projeção (`:50`, `:76`) |
| `packages/server/src/pr/exec.ts:150` | `classify` já traduz sem binário, sem auth, sem rede, limite e host não suportado |
| `packages/server/src/pr/PrCache.ts` | cache por projeto, TTL 15 s ocupado / 60 s ocioso, com backoff |
| `packages/server/src/db/schema.ts:98` | `worktree` tem `name` **e** `branch` como colunas separadas, unique só em `(project_id, name)` |

Duas leituras disso que mudam o tamanho da feature:

1. **Metade do encanamento está de pé.** O que falta no host é *uma* leitura nova (`issue list`) — PRs
   já vêm projetadas, com `headRefName`.
2. **Não há migração.** `name` e `branch` são colunas distintas desde a
   [001-walking-skeleton](../001-walking-skeleton/prd.md), e nada no banco exige que sejam iguais.
   Cortar de uma branch existente — o primeiro caso em que elas divergem — já é representável.

## 3. O que a fase 0 mediu

Duas bancadas, nenhuma linha de produto. É o que a [021-second-agent](../021-second-agent/prd.md)
fez, e pelo mesmo motivo: aqui a diferença entre o que o git *parece* fazer e o que ele *faz* é a
feature toda.

### 3.1 `git worktree add`, os quatro caminhos e as três armadilhas

Repositório de laboratório, um `origin` local, `main` + três branches, medido em 2026-09-07:

| Caso | Comando | Resultado |
|---|---|---|
| **A** branch local existente | `worktree add <path> feature-a` | ✅ `exit=0`, branch `feature-a`, upstream `origin/feature-a` preservado |
| **B** ref remota explícita | `worktree add <path> origin/feature-b` | ⚠️ `exit=0` — e **HEAD destacado**, branch vazia |
| **C** DWIM, nome só no remoto | `worktree add <path> feature-c` | ✅ `exit=0`, cria branch local rastreando `origin/feature-c` |
| **D** explícito com rastreio | `worktree add --track -b feat-d <path> origin/feature-b` | ✅ `exit=0`, branch `feat-d` → `origin/feature-b` |
| **E** branch já usada | `worktree add <path> feature-a` (de novo) | ❌ `exit=128` · `fatal: 'feature-a' is already used by worktree at '<path>'` |
| **F** `-b` com nome existente | `worktree add -b feature-a <path> main` | ❌ `exit=255` · `fatal: a branch named 'feature-a' already exists` |
| **G** DWIM + alvo ocupado | `worktree add <path> feature-b` | ❌ `exit=128` — **e a branch local `feature-b` fica para trás** |
| **H** nome inexistente | `worktree add <path> nao-existe` | ❌ `exit=128` · `fatal: invalid reference: nao-existe` |
| **I** DWIM ambíguo (2 remotos) | `worktree add <path> feature-amb` | ❌ `exit=128` · `fatal: invalid reference: feature-amb` |

**As três armadilhas, e cada uma vira regra:**

- **B é silenciosa.** Passar `origin/<branch>` produz worktree com HEAD destacado e código de saída
  **zero**. Toda a linha da worktree, o `getAheadBehind`, o status de PR e o merge assumem branch —
  `listWorktrees` já documenta `branch: null` no destacado. O caminho ingênuo não erra: ele entrega
  uma worktree quebrada dizendo que deu certo. → **[Q6](open-questions.md)**
- **I mente.** Com o mesmo nome em dois remotos, o git diz `invalid reference` sobre uma referência
  que existe **duas vezes**. Repassar esse `stderr` para a tela seria repassar uma informação falsa.
  → **[Q6](open-questions.md)**
- **G contradiz o pedido.** A issue escreveu que o `git branch -D` de limpeza *"só vale quando **nós**
  criamos a branch"*. No caminho DWIM **quem cria é o git**, e ele a deixa para trás quando o alvo
  falha. O princípio estava certo, a conclusão não: a pergunta certa é *"a branch existia antes do
  nosso comando?"*. → **[Q7](open-questions.md)**

E **E carrega a resposta no próprio texto**: a mensagem nomeia o checkout que já tem a branch. Só que
`listWorktrees` dá o mesmo mapa **antes** de tentar — que é a política que a própria `preview` já
escreve em comentário: *"a recusa é mais barata antes"*.

### 3.2 O `gh`, e quanto custa abrir o modal

`gh version 2.92.0`, autenticado, medido contra `cli/cli` (50 issues abertas) em 2026-09-07:

| Leitura | Custo | Onde |
|---|---|---|
| `gh issue list --json … --jq` | **~730 ms** por chamada (3 chamadas em 2,19 s), **12,8 KB** projetados para 50 itens | rede |
| `gh pr list --json …` | ~600 ms | rede — **e já paga pelo `PrCache`** |
| `git for-each-ref refs/heads refs/remotes` | **10 ms** para 85 refs | disco |
| sem autenticação | `exit=4` · `To get started with GitHub CLI, please run: gh auth login` | o `classify` do repo **já traduz** isto |

Campos que `gh issue list` oferece: 23, dos quais a projeção usa 7 (`number`, `title`, `state`,
`url`, `updatedAt`, `author.login`, `labels[].name`).

**A conclusão que encolhe a feature:** *"três listagens por abertura"* nunca foi verdade. Branch é
disco (10 ms, cabe no primeiro quadro), PR já está em memória na maioria das aberturas (o `PrCache`
faz o ciclo por projeto), e issue é **uma** leitura de ~0,7 s que começa depois do modal existir. →
**[Q4](open-questions.md)**

### 3.3 `gh issue develop` — o que ele é, de fato

`gh issue develop <n>` **escreve no host**: cria uma *linked branch* no repositório remoto, com
`--name`, `--base`, `--branch-repo` e `--checkout`. Não é um gerador de nomes com um efeito colateral
— é um verbo de escrita cujo efeito principal é remoto. → **[Q1](open-questions.md)**

Medido também: `gh issue develop --list <n>` é **leitura pura** (`exit=0`, nada escrito), e responde
*"esta issue já tem branch no host?"*. Fica fora do v1 por custo — uma chamada por issue —, e vai
para o [backlog](../../project/backlog.md).

## 4. Escopo

### F1 — a origem é opcional, e o default não muda

**F1.1** `worktree.create` aceita `from` **opcional**. Ausente ⇒ o comportamento de hoje, sem
desvio: mesma base, mesmo comando, mesma recusa. É o teste de regressão da
[T9](tasks.md), e ele existe porque este é o gesto mais usado do produto.

**F1.2** `from` é uma união discriminada:

| `kind` | Carrega | Corta de |
|---|---|---|
| `default` | — | `project.defaultBranch`, como hoje |
| `branch` | `ref`, e se é local ou remota | a branch que já existe |
| `issue` | `number` | a default, com o nome derivado da issue |
| `pr` | `number` | a head da PR, **se ela já estiver no disco** (F3.3) |

**F1.3** O comando é **sempre explícito**, nunca DWIM ([Q6](open-questions.md)):

```
default | issue   →  git worktree add -b <nome> <path> <base>
branch local      →  git worktree add <path> <ref>
branch remota     →  git worktree add --track -b <nome> <path> <remote>/<ref>
pr                →  git worktree add --track -b <nome> <path> <remote>/<headRefName>
```

**F1.4** A limpeza da branch órfã passa a ser condicional: o daemon consulta `branchExists`
**antes**, e o `branch -D` do `catch` só roda se a branch não existia ([Q7](open-questions.md)).
Apagar uma branch que já existia seria apagar trabalho de outra pessoa por causa de um diretório
ocupado.

**F1.5** O nome da worktree e a branch podem **divergir** — primeira vez no produto. Quando a origem
é uma branch existente, a branch é a que existe e o nome é o do campo (pré-preenchido com ela). O
banco já permite ([§2](#2-o-que-existe-hoje-medido)).

### F2 — o que o daemon lê

**F2.1** **Branches**, de `refs/heads` e `refs/remotes`, por `for-each-ref`, **sem rede** — a mesma
leitura que o `hasRemoteBranch` já faz, devolvendo lista em vez de booleano.

**F2.2** Cada branch vem com **a worktree que a ocupa**, quando há, tirada de `listWorktrees`. É o
dado que responde a [Q5](open-questions.md) sem tentar e falhar.

**F2.3** **Issues**, por `gh issue list`, com a projeção escrita no código e **fixture congelando o
formato** — não é o `gh` que decide a forma da resposta. Mesma regra da
[013](../013-pull-request-status/prd.md).

**F2.4** **PRs** vêm do `PrCache` que já existe. Nenhuma leitura nova.

**F2.5** Tudo **por projeto**, nunca por worktree: oito worktrees custam um processo, não oito.

### F3 — o que a tela faz

**F3.1** Um seletor de origem acima do campo de nome, com quatro abas: `default`, `branch`, `issue`,
`PR`.

**F3.2** Escolher uma issue ou uma PR **pré-preenche** o nome, que continua editável: a origem
sugere, não decide. Issue ⇒ `<numero>-<slug-do-titulo>` ([Q1](open-questions.md)). PR ⇒ o
`headRefName`.

**F3.3** PR cuja head **não** está no disco aparece **desabilitada**, dizendo por quê — *"a branch
`x` não está no disco; rode um fetch neste projeto"*. O Lumem não vai à rede por conta própria
([Q2](open-questions.md)).

**F3.4** Branch **já usada por outra worktree** não é oferecida como origem: ela aparece marcada com
o nome do checkout que a tem, e escolhê-la **leva para lá** — o produto já sabe selecionar worktree.
Não é erro ([Q5](open-questions.md)).

**F3.5** O campo de nome está utilizável **no primeiro quadro**. A origem carrega depois de o modal
abrir, e nenhuma leitura pode segurar o gesto — a [Q5a da 017-sidebar-actions](../017-sidebar-actions/open-questions.md)
já pagou esse preço uma vez.

**F3.6** Sem remoto, sem `gh`, ou sem autenticação: as abas `issue` e `PR` **não aparecem**, e o
modal é o de hoje mais a aba `branch` (que é local e sempre existe). Degradar, nunca travar.

### F4 — a `preview` conta a verdade

A `preview` mostra a base e o comando. Com origem, ela precisa mostrar **a origem escolhida** — hoje
ela carimba a default e monta a string à mão, o que com `from` viraria um preview de um comando que
não é o que vai rodar. Não estava no pedido; apareceu na leitura do código.

## 5. Não-objetivos, cada um com motivo

| Não faz | Por quê |
|---|---|
| **`glab`** | `PrHost` está pronto para a segunda implementação, mas ela tem escopo próprio — autenticação, formato, fixtures — e **não é pré-requisito** de nada aqui ([Q3](open-questions.md)). Feature própria |
| **`fetch` sob demanda** | contraria o *"sem fetch, use o que está no disco"* da 001. A F3.3 diz o que falta em vez de ir buscar. [Backlog](../../project/backlog.md) |
| **`gh issue develop`** | escreve no host. O Lumem escreve **dois** verbos, cada um atrás de portão ([ADR](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)) — e um terceiro como efeito colateral de digitar um nome é a coisa errada ([Q1](open-questions.md)) |
| **`gh issue develop --list`** | é leitura, e é útil, mas custa uma chamada por issue. [Backlog](../../project/backlog.md) |
| **busca / paginação nas listas** | 50 itens por leitura, com teto. Lista longa é problema quando alguém reclamar dela |
| **issue de outro repositório** | `--repo` existe, e a origem cross-repo abre uma pergunta de modelo (que projeto é o dono?) que a feature não precisa responder |

## 6. Segurança

Nada novo, e isso é o ponto: **o Lumem não guarda, não pede e não lê token**. Issues e PRs vêm do
`gh` da máquina de quem usa, com `argv` fixo, timeout, `maxBuffer` e `stderr` nunca cru na tela — o
contorno que o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)
fixou. O único argumento que passa a atravessar a fronteira é um **número** (issue ou PR) e um **nome
de ref**, e os dois são validados antes de virar `argv`.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| worktree com HEAD destacado entregue como sucesso (caso B) | F1.3: nunca `origin/<x>` sem `--track -b`. Teste que assere `branch --show-current` não-vazio |
| branch órfã depois de falha (caso G) | F1.4, com teste que provoca o alvo ocupado e confere que a branch **não** ficou |
| o modal esperando rede | F3.5, e o e2e que digita no campo antes de a listagem chegar |
| lista de issues velha na tela | carimbo de idade, como a barra de PR já faz |
| dois remotos com o mesmo nome de branch (caso I) | a origem `branch` carrega o remoto escolhido, e a ref vai qualificada |

## 8. Fases

| Fase | O quê | Por que nesta ordem |
|---|---|---|
| **0** | medir git e `gh`; escrever PRD, perguntas e tasks | três decisões mudaram aqui, antes de existir código |
| **1** | a tela no Open Design | o React é represado por ela, e a fase 2 não depende dela |
| **2** | `GitService` — os dois casos novos e `listBranches` | é o pedaço puro: falha de jeito interessante e testa sem `gh` |
| **3** | o host — `issue list` e onde ele mora no cache | |
| **4** | o contrato — `from` no `create`, e a `preview` | junta as duas leituras |
| **5** | a tela em React | a mais barata de refazer, e a única com desenho como pré-requisito |
| **6** | a prova — `fake-gh` e o e2e dos três caminhos | |
