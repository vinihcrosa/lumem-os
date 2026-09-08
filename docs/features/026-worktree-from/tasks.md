# De onde cortar — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)

**Status:** completa
**Histórico:** **as 14 tasks das 6 fases estão entregues** (2026-09-07). A fase 0 mudou três decisões
antes de existir código; a fase 1 mudou cinco medidas do desenho e achou um defeito de outra feature;
a fase 3 achou que as três leituras não tinham por onde sair do daemon, e a
[T9](#t9-from-no-worktreecreate-a-leitura-das-origens-e-a-regressão-junto) cresceu; a fase 6 achou que
o `Done when` da [T13](#t13-o-fake-gh-aprende-issue-list) não era alcançável como escrito — e o
motivo virou item de backlog em vez de contorno no teste. As nove perguntas estão respondidas.

A ordem tem uma regra: **o que decide vem antes do que escreve; git puro antes do `gh`; a tela por
último**, porque é a mais barata de refazer e a única represada pelo Open Design.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `lumem-worktree-from.html/.css` (Open Design) | a folha nova: as quatro origens, os estados degradados, e a worktree cujo nome não é a branch |
| `packages/server/src/git/GitService.ts` | `AddWorktreeInput` vira união; dois casos novos; a limpeza fica condicional; nasce `listBranches` |
| `packages/server/src/pr/GhHost.ts`, `PrHost.ts` | `issue list`, com projeção e fixture |
| `packages/server/src/pr/PrCache.ts` | onde as issues moram |
| `packages/server/src/routers/worktree.ts` | `from` no `create`, e a `preview` contando a verdade. Na fase 2 ele só passou a **nomear** a origem de sempre — `{ kind: "new-branch" }`, o mesmo `argv` |
| `packages/web/src/components/CreateWorktreeDialog.tsx` | o seletor de origem |
| `e2e/support/fake-gh.mjs` | `issue list` — hoje ele só responde `repo view` e `pr list` |

**O que não muda** — cada um com uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| *"sem fetch, use o que está no disco"* | [Q2](open-questions.md) — a checagem local custa 10 ms e o caminho sem ela entrega HEAD destacado |
| o Lumem não guarda token | o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). Issues e PRs vêm do `gh` da máquina |
| os dois verbos de escrita no host | [Q1](open-questions.md) — `gh issue develop` seria um terceiro, sem portão |
| o `classify` do `gh` | medido: sem auth já dá `no-auth`. A degradação custa zero |
| o schema do banco | [Q9](open-questions.md) — `name` e `branch` já são colunas separadas |

---

## Fase 0 — medir e decidir · **entregue**

#### T1: A bancada do `git worktree add`

**What**: repositório de laboratório com `origin` local e três branches; os nove casos do §3.1 do
PRD rodados com `argv`, `stdout`, `stderr` e código de saída anotados.
**Where**: bancada descartável, nenhum arquivo do produto
**Done when**: o §3.1 do PRD tem a tabela com a saída real, e as três armadilhas nomeadas.
**Gate**: nenhum — não toca código
**Status**: ✅ entregue — produziu a [Q6](open-questions.md), a [Q7](open-questions.md) e a
[Q8](open-questions.md), e respondeu a [Q2](open-questions.md) e a [Q5](open-questions.md)

#### T2: A medição do `gh`

**What**: `gh issue list` projetado contra um repositório real, três vezes; comparação com `pr list`
e com o `for-each-ref` local; o caminho sem autenticação; e o que `gh issue develop` faz de fato.
**Where**: bancada descartável
**Done when**: o §3.2 e o §3.3 do PRD têm os números e os 23 campos disponíveis.
**Gate**: nenhum
**Status**: ✅ entregue — encolheu a [Q4](open-questions.md) de "três listagens" para uma, e respondeu
a [Q1](open-questions.md) contra o que o pedido propunha

#### T3: PRD, perguntas e tasks

**What**: `docs/features/026-worktree-from/`, com o §3 escrito a partir do que T1 e T2 mediram, as
nove perguntas respondidas, e este arquivo. Mais: o índice, e o [backlog](../../project/backlog.md)
recebendo o que ficou de fora.
**Where**: `docs/features/026-worktree-from/*`, `docs/README.md`, `docs/project/backlog.md`
**Done when**: `pnpm exec tsx scripts/run-check-docs.ts` diz `docs ok`.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue

---

## Fase 1 — o desenho (Open Design) · paralela à fase 2

#### T4: A folha `lumem-worktree-from`

**What**: o modal com o seletor de origem acima do nome, e **os estados desenhados**: carregando (com
o campo já utilizável), sem remoto, sem `gh`, sem autenticação, lista vazia, PR fora do disco
(desabilitada, com o motivo), e branch ocupada por outra worktree. Mais o caso da
[Q9](open-questions.md): a linha de uma worktree cujo nome não é a branch.
**Where**: Open Design → `lumem-worktree-from.html`, `lumem-worktree-from.css`
**Done when**: aberto no navegador, o quadro "carregando" mostra o campo de nome ativo e o seletor
ainda vazio; o quadro degradado mostra o modal de hoje mais a aba `branch`.
**Gate**: renderizado e conferido no navegador
**Status**: ✅ entregue — `lumem-worktree-from.html/.css`, oito quadros. O sync trouxe a folha e o
`--check` fica limpo. **Cinco medições mudaram o desenho**, e nenhuma delas era visível no código:

| Medido no navegador | O que mudou |
|---|---|
| a lista com `4.5 × 32px` deixava um **sliver de 8px** da quinta linha, não meia linha — o padding do trilho come a diferença | `--size-origin-list-h` ganhou `+ var(--space-8)`: quatro linhas inteiras e **19px** da quinta |
| o cartão no quadro do antes/depois media **408px**, e não os 420 do produto — a coluna do documento tem 832px | `.pair` passou a ter colunas do tamanho do cartão, com `bleed` e linha centrada |
| com `bleed` e `1fr`, cada cartão centrava na **sua metade**: 2,5 mil pixels entre os dois a 3440px | `justify-content: center` em vez de `justify-items` |
| `.origin__empty` com `display: grid` quebrou a frase em **quatro linhas empilhadas** — cada nó inline virou item de grade | virou `flex` com um `<p>` só dentro |
| a linha `.orow` solta num quadro largo media **701px**; no produto ela tem 380 | `.origin__list--fit` ganhou largura derivada do cartão menos o padding do corpo |

A prova de recorte é a da [`023-composer-menus`](../023-composer-menus/prd.md), e não `toBeVisible`:
`document.elementFromPoint` no centro de cada linha, de cada botão do trilho **e no sliver da quinta
linha** devolve o próprio elemento — nada é interceptado por ancestral.

**E a task achou um defeito que não é dela:** o primeiro `design:sync` **desfez** quatro protótipos.
A `025-docs-contract` trocou `docs/prd/…` por `docs/features/NNN-…` dentro de
`lumem-acp-conversation.html`, `lumem-run-dock.html`, `lumem-memory.css` e `lumem-workspace.css` —
que são **cópias**, e o sync tem uma direção só. As cinco ocorrências foram corrigidas **na fonte**,
no Open Design, e o registro está em
[design-source-of-truth §5](../../project/design-source-of-truth.md).

---

## Fase 2 — git puro (nenhum `gh`)

Primeiro porque é o único pedaço que falha de jeito interessante, e o único que testa sem dublê —
`git` nunca é dublado neste repositório ([testing.md](../../project/testing.md)).

#### T5: `addWorktree` ganha os dois casos que não tem

**What**: `AddWorktreeInput` vira união discriminada. Branch local: `worktree add <path> <ref>`.
Branch remota: `worktree add --track -b <nome> <path> <remote>/<ref>` — **nunca** a forma DWIM nem
`origin/<x>` solto ([Q6](open-questions.md)). O guard `branchExists` de `:344` deixa de recusar
sempre e passa a valer só quando **nós** criamos a branch. A limpeza de `:356` fica condicional
([Q7](open-questions.md)).
**Where**: `packages/server/src/git/GitService.ts`, `git/worktree.test.ts`
**Done when**: quatro testes com repositório de verdade — branch local existente entra com upstream
preservado; branch remota entra com `branch --show-current` **não-vazio** (é o caso B, e é a asserção
que o pega); alvo ocupado com branch que **não existia** não deixa branch para trás; alvo ocupado com
branch que **já existia** não a apaga.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — `AddWorktreeSource` é a união, e o `argv` de cada origem mora numa função
só (`argvForWorktreeAdd`), que é o que a [T10](#t10-a-preview-para-de-mentir) precisa para mostrar o
comando **que vai rodar** em vez de uma string parecida montada em outro arquivo. Sete testes novos,
todos com repositório e remoto de verdade — o remoto é outro repositório em disco, porque
`refs/remotes/*` de um `fetch` local são iguais aos de um clone e não custam rede.

Três decisões ficaram escritas no código, e nenhuma é estilo:

- **`existedBefore` é lido uma vez, antes de tudo**, e serve a três coisas: a recusa, o `argv` e a
  limpeza. Perguntar depois da falha responderia sempre `true` — a falha é exatamente o instante em
  que o git já criou a branch.
- **a limpeza virou condicional** ([Q7](open-questions.md)): sem ela, uma origem `existing-branch`
  com o alvo ocupado apagaria a branch de outra pessoa por causa de um diretório.
- **`listWorktrees` responde antes do git** ([Q5](open-questions.md)): a mensagem do git tem a mesma
  informação e chega depois do gesto.

#### T6: `listBranches`, com a worktree que ocupa cada uma

**What**: `refs/heads` e `refs/remotes` por `for-each-ref` (sem rede), cruzado com `listWorktrees`
para marcar quem já está ocupada e por qual checkout ([Q5](open-questions.md)). O `hasRemoteBranch`
de `:419` já faz metade disso e passa a compartilhar a leitura.
**Where**: `packages/server/src/git/GitService.ts`, `git/*.test.ts`
**Done when**: num repositório com duas worktrees, a lista marca as duas branches ocupadas com o
caminho certo, e uma branch remota sem par local aparece uma vez só.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — `BranchEntry` traz `local`, `remotes[]` e `worktreePath`. Quatro testes,
inclusive os dois casos que a bancada da fase 0 achou: `refs/remotes/origin/HEAD` **não** vira uma
branch chamada `HEAD`, e o mesmo nome em dois remotos vira **uma** entrada com `["origin", "outro"]`
— que é o dado sem o qual a tela não consegue qualificar a ref, e é por isso que a forma esperta do
git mente ali.

O `hasRemoteBranch` passou a compartilhar o `readRefs`, mas **não** o `worktree list`: ele é
perguntado por worktree na barra de PR, e um processo a mais por linha da sidebar seria pagar a
leitura de todo mundo para responder sobre uma.

---

## Fase 3 — o host

#### T7: `gh issue list`, projetado e congelado

**What**: a leitura nova no `GhHost`, com a projeção `--jq` escrita no código (os 7 campos do §3.2),
`issues()` no `PrHost`, e fixture — não é o `gh` que decide a forma da resposta. Sem autenticação
cai no `classify` que já existe.
**Where**: `packages/server/src/pr/GhHost.ts`, `PrHost.ts`, `__fixtures__/gh-issue-list-*.json`,
`GhHost.test.ts`
**Done when**: a fixture atravessa até o tipo do `shared`; um `gh` que devolve `exit=4` produz
`no-auth` e **não** uma exceção; e apagar um campo da projeção quebra um teste.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — `issues()` no `PrHost`, `ISSUE_PROJECTION` de sete campos, e a fixture
`gh-issue-list-open.json` com cinco issues **reais** do `cli/cli`. Seis testes, nenhum deles
executando processo.

`issues()` ficou **fora** do `read()`, e a razão é a mesma que decidiu a T8: aquele alimenta uma
barra que se pergunta sozinha, este responde a um diálogo que alguém abriu. Somados, um viraria custo
de rede permanente do outro.

O `--state open` está no `argv` e não na projeção: filtrar depois de baixar seria pagar rede por
issue fechada que nunca vira worktree. E a degradação custou **zero**: o `classify` da
[013](../013-pull-request-status/prd.md) já traduz o `exit 4` do `gh` sem autenticação, e o teste
prova que ele chega como `no-auth` em vez de exceção.

#### T8: Onde as issues moram no cache

**What**: executa a [Q4](open-questions.md) — issues entram no `PrCache` (TTL, backoff e chave por
projeto já escritos e testados) ou num irmão dele, decidido com o código na mão. Branches **não**
entram: 10 ms de disco não se guarda.
**Where**: `packages/server/src/pr/PrCache.ts` (ou vizinho), `PrCache.test.ts`
**Done when**: duas aberturas de modal dentro do TTL produzem **uma** execução de `gh`, provado por
contagem no dublê.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — **irmão**, não parte. `IssueCache` com TTL de 60 s, single-flight e falha
que não apaga a última lista. Sete testes, e a contagem de execuções é o teste: um cache que não
guarda nada passa em todas as asserções de conteúdo e falha só ali.

A [Q4](open-questions.md) deixou a escolha para o código, e o código respondeu. Os dois guardam
leitura do mesmo `gh`, do mesmo projeto — e as três coisas que fazem o `PrCache` bom viram defeito
aqui:

| Do `PrCache` | Por que não serve à issue |
|---|---|
| poll de 15/60 s | seria um `gh issue list` por projeto a cada 15 s — **~730 ms medidos** — para um diálogo que ninguém abriu |
| revalidação por trás | mostraria a lista velha, e a nova chegaria **depois** de o diálogo fechar |
| backoff ao falhar | não há o que segurar: sem poll, o próximo pedido é uma pessoa reabrindo o diálogo |

Branch **não** entra em cache nenhum: 10 ms de disco não se guarda.

---

## Fase 4 — o contrato

#### T9: `from` no `worktree.create`, a leitura das origens, e a regressão junto

**What**: a união discriminada no zod e no `shared`; o roteamento para os quatro casos; e o teste que
prova que **sem** `from` nada mudou — mesma base, mesmo comando, mesma recusa. A regressão vem na
mesma task de propósito: é o gesto mais usado do produto.

**E a leitura**: `worktree.origins`, que junta o `listBranches` da [T6](#t6-listbranches-com-a-worktree-que-ocupa-cada-uma)
com o `IssueCache` da [T8](#t8-onde-as-issues-moram-no-cache) e com o `PrCache` que já existe,
filtrando PR cuja head não está no disco. **Isto não estava na lista** — a fase 3 acabou com as três
leituras escritas e nenhuma alcançável de fora, e foi assim que a lacuna apareceu. Ela cabe aqui
porque é o mesmo arquivo e a mesma camada: o contrato.
**Where**: `packages/server/src/routers/worktree.ts`, `packages/shared/src/*`, `routers/*.test.ts`
**Done when**: `create({projectId, name})` sem `from` executa o mesmo `argv` de hoje; `from` com
`kind: "pr"` cuja head não está no disco é **recusado pelo daemon** com o motivo, e não pelo git.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — `fromSchema` é a união no zod, e `resolveSource` a traduz para
`AddWorktreeSource` num lugar só, usado pelo `create` **e** pelo `plan`.

**Duas procedures de leitura, e não uma** — a decisão apareceu escrevendo: `worktree.branches` é
disco (10 ms) e `worktree.hostOrigins` é rede (~730 ms). Numa procedure só, a lista local esperaria
a rede toda vez, e a aba `branch` — a única que existe em projeto sem remoto — ficaria refém de um
`gh` que talvez nem esteja instalado.

O que o daemon **não** aceita do cliente: `pr` e `issue` carregam só o número. O `headRefName` sai do
`PrCache`, que é a mesma regra do merge da [013](../013-pull-request-status/prd.md). PR desconhecida
é recusada; head fora do disco é recusada **aqui**, com o que fazer, porque o git não recusaria —
medido, ele entraria em HEAD destacado com código zero.

`remoteHolding` prefere `origin` quando há mais de um remoto: com um `fork` configurado, escolher
pela ordem alfabética faria a worktree rastrear o repositório errado **sem dizer nada**.

Um defeito de verdade caiu no teste: `worktreeName` vinha `null` para branch ocupada, porque o git
responde caminho **real** e o banco guarda o construído — no macOS `/var` é link para `/private/var`,
e as duas strings descrevem o mesmo diretório sem se comparar.

#### T10: A `preview` para de mentir

**What**: a `preview` de `:95` carimba `baseBranch: project.defaultBranch` e monta a string
`git worktree add -b …` à mão. Com origem, ela passa a mostrar a base e o comando **que vão rodar**.
Não estava no pedido — apareceu na leitura do código (§4 do PRD).
**Where**: `packages/server/src/routers/worktree.ts`, teste do router
**Done when**: para cada `kind`, o comando do preview é, string por string, o `argv` que o
`GitService` executa.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — `worktreeAddArgs` saiu da closure do `GitService` e virou função
exportada; o preview imprime `git ${worktreeAddArgs(...).join(" ")}`. É **o mesmo vetor**, e não uma
string parecida montada noutro arquivo — que é exatamente o que ele era, com `-b` escrito à mão.

O `plan` também parou de mentir nas outras três respostas: `branch` é a branch em que a worktree
termina (que desde a [Q9](open-questions.md) pode não ser o nome), `baseBranch` diz de onde ela sai
em cada caso, e a recusa por branch ocupada aparece **antes**, nomeando o checkout.

---

## Fase 5 — a tela

#### T11: O seletor de origem no `CreateWorktreeDialog`

**What**: as quatro abas, a carga **depois** de o modal abrir, e o pré-preenchimento editável — issue
vira `<numero>-<slug>`, PR vira o `headRefName`. PR fora do disco aparece desabilitada com o motivo;
branch ocupada leva para a worktree que a tem.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx` e o CSS da folha
**Done when**: o React usa só `var(--token)`, e o campo de nome aceita digitação antes de qualquer
listagem chegar.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — o trilho é o `.seg` que a aba de mudanças e a tela do workspace já usam, e
não um controle novo: é o que faz "de onde cortar" parecer o resto do produto. `create-worktree.css`
é cópia da folha do Open Design, token por token.

O teste da F3.5 é o que vale: as **duas queries nunca resolvem** e mesmo assim se digita no campo e o
`criar` fica habilitado. Os 16 testes passaram de primeira, então foram submetidos a **quatro
mutações** — a PR fora do disco deixando de ser `disabled`, o `hostOff` virando `false`, o
pré-preenchimento não escrevendo, e a navegação da branch ocupada sumindo. **As quatro ficaram
vermelhas**, cada uma no teste que fala dela.

E o `gate:quick` achou o que jsdom não acha: a auditoria do `modal-css` só lia `modal.css`, então
toda classe do bloco de origem contava como faltando. Ela passou a **saber onde procurar** — as
folhas de tela que um diálogo traz consigo — em vez de listar catorze classes como emprestadas, que
é o mesmo que parar de conferi-las.

#### T12: A degradação

**What**: sem remoto, sem `gh` ou sem autenticação, as abas `issue` e `PR` não aparecem e o modal é o
de hoje mais a aba `branch`. Nenhuma espera, nenhum erro na tela.
**Where**: `CreateWorktreeDialog.tsx`, teste de componente
**Done when**: com a leitura do host falhando em `no-binary`, o modal renderiza completo e o `criar`
funciona.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue — e a execução separou o que o desenho tratava como uma coisa só. **Nem toda
falha de host apaga as abas:**

| Falha | O que a tela faz | Por quê |
|---|---|---|
| `no-binary`, `no-auth`, `unsupported-host` (e sem remoto) | as abas `issue` e `PR` **somem**, e o motivo aparece uma vez | aqui não há host — e aba desabilitada é a promessa de que existe algo ali para quem se autenticar |
| `offline`, `rate-limit`, `timeout` | a aba **fica**, e a lista explica | sumir faria a tela mudar de forma por causa de um wi-fi ruim, e mudar de volta quando ele melhorasse |

Sem autenticação a frase manda rodar `gh auth login` **no terminal de quem usa**: o Lumem não guarda,
não pede e não lê token, e é o mesmo desenho do
[ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md).

---

## Fase 6 — a prova

#### T13: O `fake-gh` aprende `issue list`

**What**: o dublê de `e2e/support/fake-gh.mjs` responde `issue list` a partir do `gh-state.json`, no
mesmo padrão do `pr list` — processo de verdade, `argv` de verdade, código de saída de verdade.
**Where**: `e2e/support/fake-gh.mjs`, `e2e/support/fixtures.ts`
**Done when**: o spec reescreve o estado entre dois passos e a lista de issues muda na tela.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue — `issue list` responde do mesmo `gh-state.json`, no mesmo contrato do `pr
list`: o estado já está na forma projetada, então a projeção é a identidade e o que o spec exercita é
o transporte e o parse.

**O `Done when` foi cumprido pela metade, e a outra metade virou achado.** Reescrever o estado *entre
dois passos* **não** muda a lista: o `IssueCache` guarda por projeto com TTL de 60 s, e o diálogo não
tem `⟳` — o primeiro que abrir congela a resposta para o resto do arquivo. É limitação do produto, não
do dublê, e está no [backlog](../../project/backlog.md) com o gatilho de volta. O spec passou a
escrever o estado **uma vez**, antes de tudo.

#### T14: O e2e dos três caminhos

**What**: criar worktree a partir de uma issue, de uma branch existente e de uma PR — cada um
conferindo, no disco, **a branch que a worktree ficou** e não só que ela existe. Mais o projeto sem
`gh`, que abre o modal de hoje sem espera.
**Where**: `e2e/worktree-from.spec.ts`
**Done when**: os quatro passam, e o caminho da PR falha se alguém trocar `--track -b` por
`origin/<x>` (é o caso B: a worktree existiria, com HEAD destacado).
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue — **seis testes, todos verdes**, e a mutação foi feita: trocado o
`--track -b` pelo ref remoto solto, o teste da PR fica **vermelho** e os outros continuam verdes. É a
armadilha da fase 0 pega no navegador, com o daemon de verdade no meio.

O fixture `repo-origins` tem as três coisas que nenhum outro tinha: branch local, branch **publicada**
— escrita com `update-ref`, que é o que um fetch deixaria em disco — e um `origin` do GitHub. Nada vai
à rede.

As asserções são de **disco**, e não de tela: `git branch --show-current` e `rev-parse @{u}` dentro da
worktree criada. Uma worktree com HEAD destacado desenha uma linha perfeitamente normal.

Dois achados de graça:

- **`getByRole("button", { name: "PR" })` casava três botões** — `adicionar projeto` e `remover
  projeto` contêm "pr". O nome da aba é curto o bastante para colidir por substring, e é `exact` que
  resolve;
- **a linha da árvore já sabia mostrar a branch** quando ela difere do nome (`worktreeMeta`, escrito
  na `walking-skeleton` para um caso que até agora não podia acontecer). A [Q9](open-questions.md)
  fez a regra disparar pela primeira vez, e o §7 da folha do Open Design pediu exatamente o que o
  código já fazia.

E o `gate:full` cobrou uma coisa que nenhum teste desta feature veria: o
[e2e da `sidebar-actions`](../017-sidebar-actions/tasks.md) ficou **vermelho**. O `Modal` dava o foco
ao **primeiro focável**, e o primeiro focável deixou de ser o campo de nome — passou a ser a aba
`default`. Duas mudanças saíram disso, e as duas estão registradas onde a afirmação antiga mora:

1. o `Modal` prefere `[data-modal-focus]` e cai no primeiro focável só quando ninguém pediu. Abrir o
   diálogo continua pondo o cursor onde se digita — a origem é opcional, o nome não;
2. o **anel do `Tab` cresceu**, e a volta depois do `✕` é o trilho e não o campo. O contrato da seção
   8 do protótipo continua de pé (o `Tab` circula dentro do diálogo, o `✕` é o último); o que mudou é
   quantas paradas ele tem, e a P2 da `sidebar-actions` recebeu a emenda.

---

## O que ficou de fora, e onde está

| Item | Onde |
|---|---|
| `glab` como segundo `PrHost` | [backlog](../../project/backlog.md) — [Q3](open-questions.md) |
| `fetch` sob demanda para head de PR | [backlog](../../project/backlog.md) — [Q2](open-questions.md) |
| `gh issue develop --list` (branch já ligada à issue) | [backlog](../../project/backlog.md) — [Q1](open-questions.md) |
| busca e paginação nas listas | §5 do PRD |
| issue de outro repositório | §5 do PRD |
