# Worktree a partir de branch, PR ou issue — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 23, **todas respondidas**
**Protótipo:** `packages/web/prototype/lumem-worktree-source.html` — entregue pela S1
**Sucede:** [project-from-url](../project-from-url/tasks.md)
**Status:** **em curso** — 2 de 19
**Total:** 19 tasks em 6 fases

---

## Notas de contexto

Fonte de verdade das premissas e das pendências desta feature. Quem retoma o trabalho a frio lê esta seção antes de qualquer task.

### Premissas travadas

Cada uma vem de uma pergunta **respondida** em [open-questions.md](open-questions.md). Implementar contra qualquer outra coisa é apostar.

| # | Premissa | Origem |
|---|---|---|
| **A1** | Quatro origens na v1: `blank`, `branch`, `pr`, `issue` | Q1 |
| **A2** | O forge é **CLI** — `gh` e `glab`. Nenhum token no SQLite, nenhum OAuth | Q2 |
| **A3** | Prompt **abre agente** na worktree nova e entrega o texto **com Enter** | Q3 |
| **A4** | Nome vazio **sorteia**, e o sorteado aparece antes de criar | Q4 |
| **A5** | A aba de branches lê o **disco**. Rede só no `atualizar` e no fetch alvejado | Q6, F4.3 do walking-skeleton |
| **A6** | PR é checado pelo **`gh pr checkout` dentro da worktree**, que nasce `--detach` | Q7 |
| **A7** | Branch já aberta **recusa nomeando a worktree** que a tem | Q8 |
| **A8** | O corpo de issue/PR **nunca** entra no prompt. Só número, título e URL | Q10 |
| **A9** | Origem é **coluna** (`source_kind`, `source_ref`, `source_url`, `source_title`), nunca dedução | Q11 |
| **A10** | Provedor é **quem responde por aquele host**: `gh`/`glab auth status --hostname`. Sem tabela de hostname, sem override, sem campo no projeto | Q20, Q23 |
| **A11** | Transporte do prompt é **declarado** em `agent_config.prompt_transport` — `arg` ou `type` | Q13 |
| **A12** | Falha de agente **não desfaz** a worktree | Q14 |
| **A13** | Um `worktree.create` só, com **união discriminada** de origem | Q18 |
| **A14** | Nenhuma chamada desta feature pergunta nada ao terminal — `cloneEnv` no fetch | F7.15 |
| **A15** | O prompt é **texto**, sempre. O Lumem não olha dentro dele, e ele **só abre agente** — nunca shell | Q21 |
| **A17** | Branch local que divergiu da remota **recusa dizendo o atraso**. Reset nunca | Q22 |
| **A16** | A lista de nomes tem **150+**, é ascii **transliterada** (`schrodinger`, `roentgen`), e nome difícil é escolha — o que ele obriga é o gesto de copiar | Q19 |

### Pendências

Numeradas, e nenhuma delas vive só numa mensagem ou num comentário de código.

| # | O quê | Estado |
|---|---|---|
| **P1** | Daemon sem autenticação, agora **lendo o GitHub privado do usuário** com o token dele | **herdada da file-editor, amplificada pela terceira feature seguida.** Não é paga aqui. §9.4 do PRD |
| **P2** | Prompt injection **por desenho**: texto de estranho vira instrução de um processo que executa comandos | **mitigada, não resolvida** ([Q10](open-questions.md)): corpo fora, campo visível e editável. Título ainda é texto de terceiro. Chega cedo da [Q089 do questions.md](../../project/questions.md) — *"conteúdo externo é tratado como dado, nunca instrução?"* — e a [Q088](../../project/questions.md), que pergunta em voz alta se o agente lendo PR e issue de terceiro importa |
| **P3** | A prontidão do TUI (primeiro byte + 300 ms de silêncio, teto de 10 s) é **heurística, não medição** | aberta desde o desenho. O precedente é a P6 da project-from-url: número escolhido é número dito. Fecha quando houver medição contra os agentes reais |
| ~~**P4**~~ | ~~Self-hosted fica sem abas de forge, e a coluna de override é prevista~~ | **morta pela [Q20](open-questions.md) e pela [Q23](open-questions.md)**: não há coluna, não há override, e self-hosted **funciona** quando o CLI da máquina responde pelo host. O que não funciona é máquina não configurada — e a frase diz o comando |
| **P5** | `gh pr checkout` escreve em `.git/config`, **compartilhado por todas as worktrees** | aceita. Cumulativa e inofensiva — e nomeada aqui em vez de descoberta depois |
| **P6** | Sem cache das listas do forge; rate limit é do provedor | aceita na v1. O que existe é debounce e `--limit 30` |
| **P7** | Branch já aberta **recusa** em vez de navegar até a worktree que a tem | aberta, e é boa. É navegação, não criação ([Q8](open-questions.md)) |
| **P8** | Nenhum teste desta feature toca a rede — o forge é um `gh` de mentira no PATH | **é técnica, não dívida**, e está aqui porque quem retomar o trabalho precisa saber que existe |

---

## Ordem, e por quê ela é essa

**Desenho primeiro**, como nas cinco features anteriores.

**Git antes de forge.** As duas origens que não precisam de rede — branch nova e branch existente — cobrem sozinhas as três armadilhas de `git worktree add` do §4 do PRD. Fazê-las primeiro entrega valor antes de qualquer dependência externa existir, e deixa o adapter de forge nascer num terreno onde criar worktree de branch qualquer já funciona.

**O forge como leitura pura antes de virar origem.** Listar PR e issue não escreve nada; o `gh pr checkout` escreve. As duas coisas nascem separadas para que a segunda tenha onde falhar sem levar a primeira junto.

**O prompt por último entre as coisas de servidor**, porque é a única parte cuja correção depende de timing, e diagnosticar timing com UI no meio é pior.

**A tela no fim**, maior superfície e menor risco — com uma exceção: a S17 (os estados de falha) é onde as três frases do F7.12 realmente existem, e sem ela a feature quebra na máquina de quem não tem `gh`.

---

## Decisões que sustentam o resto

### D1 — Um `worktree.create`, união discriminada de origem
Dois caminhos de criação seriam duas definições de worktree válida. O que muda por origem é como a branch aparece; caminho, registro, rollback e evento são comuns. Eco do D5 da project-from-url.

### D2 — O `gh` faz o checkout do PR; o Lumem não reimplementa fork
Buscar a ref é fácil, e é a parte errada do problema. Remote, refspec e upstream por provedor são manutenção de outra pessoa.

### D3 — Branches vêm do disco; rede só quando pedida
`fetch` automático põe latência em abrir um diálogo, todo dia, para atualizar uma lista que quase nunca mudou desde o último.

### D4 — Origem é coluna, nunca dedução
Dedução a partir do nome erra em silêncio no primeiro `git branch -m`.

### D4.1 — Provedor é quem responde pelo host, não quem o hostname sugere
`gh auth status --hostname <host>`. Uma checagem em vez de duas (provedor e autenticação), e self-hosted entra de graça.

### D5 — Transporte de prompt é declarado, não adivinhado
Não há o que inspecionar num binário para saber se ele aceita prompt no argv.

### D6 — Worktree criada não é desfeita por falha de agente
O checkout é o trabalho; a sessão é conveniência. O rollback só existe para a falha que acontece **antes** de o checkout ficar de pé.

### D7 — Nome sorteado é único, visível e estável
Único contra branch **e** contra worktree; visível no placeholder; sorteado uma vez por diálogo, não a cada tecla.

### D8 — Texto de terceiro é dado hostil
ANSI e controle removidos, truncado, renderizado como texto, e nunca vira prompt em silêncio.

### D9 — Nenhum teste desta feature toca a rede
Repositório fixture local para o git; um script `gh` de mentira no `PATH` para o forge, que imprime JSON fixo e registra o argv com que foi chamado — o que também é como se prova que a busca vai como **um** item de argv.

---

## Fase 0 — Desenho

#### S1: Protótipo dos estados do diálogo

**What**: Desenhar em HTML+CSS, sobre o mesmo `tokens.css` do app, os estados do §3 do PRD — e verificar por renderização.
**Where**: `packages/web/prototype/lumem-worktree-source.html`
**Depends on**: nada

**Done when**:
- [x] As quatro abas existem, e `branch nova` mostra que o corpo do formulário **muda** de forma entre elas
- [x] Lista de PR e de issue com número, título, autor e idade; estado de carregando (esqueleto), vazio e erro com `tentar de novo`
- [x] Lista de branches com marca de **já aberta em `<worktree>`** (A7) e o botão `atualizar`
- [x] O campo de nome mostra o sorteado no **placeholder** (A4, D7)
- [x] O campo de prompt com a referência pré-preenchida e o seletor de agente
- [x] Os três estados de forge indisponível, com as **três frases diferentes** do F7.12 — e a terceira com o `gh auth login --hostname` dentro
- [x] As duas recusas do git: branch já aberta (desabilitada, com o nome de quem a tem) e a divergência da [Q22](open-questions.md)
- [x] A worktree já nascida, com origem, link e o que aconteceu com o prompt — inclusive a que nasceu sem origem nenhuma
- [x] Nenhuma cor literal: tudo por token existente. **Nenhum token novo foi preciso**
- [x] Verificado por renderização, não por leitura do HTML — e ela achou **seis** coisas, três delas de significado
- [x] O que a renderização achou foi para o §3 do PRD, como nas cinco features anteriores

**Tests**: renderização · **Gate**: nenhum (não há código de app)
**Commit**: `docs(prototype): draw the worktree source dialog`

---

## Fase 1 — O git das origens

#### S2: `listBranches` — locais, remotas, e quais já estão abertas

**What**: Uma leitura só que devolve o que a aba `branch` precisa, sem tocar a rede.
**Where**: `packages/server/src/git/GitService.ts` + teste
**Depends on**: nada

**Done when**:
- [x] `for-each-ref` com formato explícito sobre `refs/heads` e `refs/remotes`, ordenado por `committerdate` decrescente
- [x] `origin/HEAD` é filtrado — é ponteiro, não branch
- [x] Cada item traz `name`, `remote` (nulo para local) e `lastCommitAt`
- [x] Uma branch que existe local **e** em `origin` aparece **uma vez**, como local
- [x] ~~`usedBy` é o **nome** da worktree~~ — **a implementação derrubou isto.** O git só sabe caminho; o nome mora no banco. O campo virou `usedByPath`, e quem o transforma na frase do F7.4 é o router (S9/S11)
- [x] Repositório sem commit devolve lista vazia, não erro
- [x] Nome com acento e com barra voltam íntegros — separador `%00`, o único byte que não pode aparecer dentro de um nome de ref
- [x] Gate: `pnpm gate:quick` — 1157 testes
- [x] Test count: 11

**O que a execução achou**

- **Empate de segundo é o caso comum, não a exceção.** O git grava data de commit com granularidade de segundo, e duas branches tocadas no mesmo segundo — um rebase, um script — empatavam. Sem segunda chave a lista se reordenava sozinha entre duas chamadas idênticas. Ordena por data e, no empate, por nome. O teste que pegou isso só existe porque o primeiro teste de ordenação estava, sem saber, asserindo sobre um empate: os dois commits caíam no mesmo segundo. A fixture ganhou data explícita.
- **O `/private` do macOS de novo.** `git worktree list` responde com o caminho **resolvido**, e a fixture entrega o `/var` que é symlink. É a mesma armadilha que o `isGitRepo` já documenta, e agora ela é um requisito de quem for comparar `usedByPath` com uma linha do banco: resolver os dois lados.

**Tests**: unit, com git de verdade (`testing.md`: git nunca é dublado) · **Gate**: quick
**Commit**: `feat(server): list branches with the worktree that already holds them`

---

#### S3: `addWorktree` ganha três modos

**What**: O que hoje é um `worktree add -b` vira três caminhos explícitos — branch nova, branch local existente, branch remota rastreada — mais o modo `--detach` que o PR vai usar.
**Where**: `packages/server/src/git/GitService.ts` + teste
**Depends on**: S2

**Done when**:
- [ ] A entrada vira união discriminada; nenhum chamador passa `branch` e `baseBranch` juntos "por via das dúvidas"
- [ ] `create`: `worktree add -b`, inalterado, **inclusive o `branch -D` de limpeza** quando o `add` falha depois de criar a branch
- [ ] `existing`: `worktree add <path> <branch>`, e **recusa antes do git** quando a branch já está em outra worktree, nomeando-a (F7.4)
- [ ] `track`: `worktree add --track -b <local> <path> <remote>/<branch>`, e um teste prova o upstream por `rev-parse --abbrev-ref @{upstream}` — não por inspeção da saída do `add`
- [ ] `detach`: `worktree add --detach <path> <commit-ish>`, para a S10
- [ ] Nenhum modo depende de `checkout.guess` nem de `--guess-remote`: um teste roda com `checkout.guess=false` explícito
- [ ] Branch local que existe e diverge do remoto **recusa**, dizendo quantos commits atrás está ([Q22](open-questions.md)). O número vem do `getAheadBehind`, que já existe — a mensagem diz o atraso, nunca "conflito"
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 12

**Tests**: unit, com git de verdade · **Gate**: quick
**Commit**: `feat(server): cut a worktree from an existing local or remote branch`

---

#### S4: `fetchRef` — busca alvejada, sem perguntar nada

**What**: Buscar **uma** ref do remoto, para cortar de branch remota e para o botão `atualizar`.
**Where**: `packages/server/src/git/GitService.ts` + teste
**Depends on**: nada

**Done when**:
- [ ] `fetchRef(repoPath, { remote, ref })` roda `fetch <remote> <ref>` com `--` antes do que veio de fora
- [ ] `fetchAll(repoPath)` roda `fetch --prune`, para o botão `atualizar`
- [ ] Ambos usam o `cloneEnv` da project-from-url — `GIT_ASKPASS`/`SSH_ASKPASS` vazios, `BatchMode=yes` **composto** sobre o `GIT_SSH_COMMAND` existente (A14)
- [ ] Falha de autenticação é distinguida de falha de rede, com a mesma classificação que o clone já faz
- [ ] Timeout próprio, maior que o `DEFAULT_GIT_TIMEOUT_MS` e menor que o de clone; o número escolhido está num comentário que diz que foi escolhido
- [ ] Teste de recusa contra `ssh://127.0.0.1:1/x`, que falha na hora e não depende de rede (D9)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6

**Tests**: unit, com fixture local por `file://` · **Gate**: quick
**Commit**: `feat(server): fetch a single ref without ever prompting`

---

## Fase 2 — O forge, como leitura pura

#### S5: Quem responde pelo host, e `forge.status`

**What**: Dizer, para um projeto, se PR e issue estão disponíveis — e, quando não, **qual das três** razões é.
**Where**: `packages/server/src/forge/provider.ts`, `packages/server/src/forge/ForgeService.ts` + testes
**Depends on**: nada

**Done when**:
- [ ] O host sai de `project.remote_url` (já sanitizada) e a pergunta vai para os CLIs: `gh auth status --hostname <host>` e `glab auth status --hostname <host>` (A10)
- [ ] `github.com` pergunta ao `gh` primeiro e `gitlab.com` ao `glab` — **ordem**, não decisão. Um teste prova que um host arbitrário reivindicado pelo `gh` de mentira é aceito
- [ ] `remote_url` nulo devolve `no-remote` **sem rodar processo nenhum**
- [ ] Nenhum dos dois binários no PATH devolve `no-cli`, por `isCommandAvailable` — o mesmo helper do F6.5, não um `which` novo
- [ ] Binário presente e nenhum reivindicando o host devolve `host-not-configured`, **com o host**, para a frase poder sugerir `gh auth login --hostname <host>`
- [ ] A ordem de checagem é a barata primeiro: remoto, binário, `auth status`. Só a última custa processo
- [ ] Nenhuma das três devolve mensagem pronta — o servidor devolve **causa**, a tela escreve a frase
- [ ] Nenhuma coluna de provedor em lugar nenhum ([P4](#pendências) está morta, e um teste não a substitui)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10

**Tests**: unit, com `PATH` controlado e `gh`/`glab` de mentira (D9) · **Gate**: quick
**Commit**: `feat(server): ask the cli which host it answers for`

---

#### S6: Listar PR e issue, com busca

**What**: Duas leituras, uma por tipo, com o texto da busca indo como **um** item de argv.
**Where**: `packages/server/src/forge/ForgeService.ts` + teste
**Depends on**: S5

**Done when**:
- [ ] `gh pr list --json number,title,headRefName,author,updatedAt,isDraft,state --limit 30` e o equivalente de issue; `glab` com o mapeamento dele
- [ ] A saída passa por **zod**; campo faltando é falha nomeada, não `undefined` na tela
- [ ] `--search <q>` só entra quando há busca, e o teste prova pelo argv registrado que o texto foi **um argumento** — inclusive com espaço, aspas e `--` dentro (D9)
- [ ] Título, autor e estado passam pelo saneamento de texto de terceiro: ANSI e bytes de controle fora, truncado (D8)
- [ ] `cwd` é `project.path`; o Lumem **não** parseia `owner/repo` de lugar nenhum (§5.2 do PRD)
- [ ] Timeout de 15 s, e estouro vira falha legível
- [ ] Saída que não é JSON (o CLI cuspindo aviso de atualização, por exemplo) falha com mensagem própria em vez de `SyntaxError`
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 12

**Tests**: unit, com `gh` de mentira que registra argv · **Gate**: quick
**Commit**: `feat(server): list pull requests and issues through the forge cli`

---

## Fase 3 — O contrato

#### S7: Migração — origem na worktree, transporte no agente

**What**: As colunas novas, e nada além delas.
**Where**: `packages/server/src/db/schema.ts`, `packages/server/drizzle/*` + teste
**Depends on**: nada

**Done when**:
- [ ] `worktree` ganha `source_kind` (CHECK em `blank|branch|pr|issue`, default `blank`), `source_ref`, `source_url`, `source_title`, `initial_prompt` — os quatro últimos anuláveis
- [ ] `agent_config` ganha `prompt_transport` (CHECK em `arg|type`, default `type`) (A11)
- [ ] Toda linha existente migra para `source_kind = 'blank'` sem perder nada
- [ ] A migração roda para frente num banco com dados, e o teste usa um banco com worktree e agente já gravados
- [ ] **Nenhuma coluna de forge no projeto** — a [Q20](open-questions.md) matou o override, e a detecção não guarda estado ([P4](#pendências))
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 5

**Tests**: unit, com SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): record where a worktree came from`

---

#### S8: O sorteio de nome

**What**: Um nome que não colide, é visível antes de criar e não muda debaixo do usuário.
**Where**: `packages/server/src/git/worktree-name.ts` + teste
**Depends on**: nada

**Done when**:
- [ ] A lista tem **150 nomes ou mais** (A16), num módulo só
- [ ] É ascii minúscula e **transliterada** — `schrodinger`, `roentgen`, `poincare` — e cada nome é válido como branch **e** como último segmento de diretório, provado por teste sobre a lista **inteira**, não por amostra
- [ ] Sem nome repetido, provado por teste — 150 entradas escritas à mão repetem
- [ ] Colisão contra branch existente **e** contra nome de worktree do projeto; esgotado, sufixa `-2`, `-3` (D7)
- [ ] Determinístico sob injeção de aleatoriedade: o teste não sorteia de verdade
- [ ] Lista esgotada não trava — cai no sufixo em vez de rodar para sempre
- [ ] O tema é o da [Q19](open-questions.md): física e computação, difíceis inclusive
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8

**Tests**: unit, puro (mais um caso com git de verdade para a colisão) · **Gate**: quick
**Commit**: `feat(server): name an unnamed worktree after someone who studied light`

---

#### S9: `worktree.create` com origem

**What**: A união discriminada no contrato, e as três origens de git ligadas — `blank`, `branch`, `issue`.
**Where**: `packages/server/src/routers/worktree.ts` + teste
**Depends on**: S3, S7, S8

**Done when**:
- [ ] O input é o do §8 do PRD, e `name` é **opcional** (A4, A13)
- [ ] `blank` continua fazendo exatamente o que fazia hoje — teste antigo continua passando sem edição
- [ ] `branch` local usa o modo `existing`; branch remota faz `fetchRef` e usa `track`
- [ ] `issue` corta da default e grava `source_ref`, `source_url`, `source_title`
- [ ] **git primeiro, registro depois**, e o rollback existente cobre os modos novos — inclusive apagando a branch local que o modo `track` criou
- [ ] A recusa de branch já aberta chega ao cliente como `BLOCKED` com o nome da outra worktree (F7.4)
- [ ] O evento `worktree.changed` é emitido uma vez, no mesmo lugar de hoje
- [ ] Projeto sem commit continua recusando com a frase do F6.13
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 14

**Tests**: integration, com git e SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): create a worktree from a branch or an issue`

---

#### S10: A origem `pr`

**What**: A worktree nasce destacada e o `gh` a leva para a branch do PR — inclusive de fork.
**Where**: `packages/server/src/routers/worktree.ts`, `packages/server/src/forge/ForgeService.ts` + teste
**Depends on**: S6, S9

**Done when**:
- [ ] `worktree add --detach <path> <default_branch>`, depois `gh pr checkout <n>` com `cwd` **na worktree nova** (A6)
- [ ] Falha do `gh` **remove a worktree e não registra nada** — a ordem é remover o checkout, depois desistir
- [ ] Sucesso grava `source_kind = 'pr'`, número, URL, título, e a `branch` da linha é a que o `gh` deixou checada — lida do disco, não suposta
- [ ] O nome da worktree deriva da branch do PR, e é sanitizado para virar segmento de diretório
- [ ] Um teste cobre PR **de fork**, com a fixture montando um segundo repositório como fork e o `gh` de mentira imitando o checkout
- [ ] O número do PR é `z.number().int().positive()` — nunca string (§9.1 do PRD)
- [ ] O que o `gh` escreve em `.git/config` é observado num teste e registrado como [P5](#pendências), não corrigido
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8

**Tests**: integration, com git de verdade e `gh` de mentira · **Gate**: quick
**Commit**: `feat(server): create a worktree from a pull request, fork included`

---

#### S11: As procedures de leitura

**What**: Ligar ao contrato o que a Fase 1 e a Fase 2 já sabem fazer.
**Where**: `packages/server/src/routers/project.ts`, `packages/server/src/routers/forge.ts`, `packages/server/src/routers/index.ts` + testes
**Depends on**: S2, S4, S6

**Done when**:
- [ ] `project.listBranches`, `project.fetch`, `forge.status`, `forge.listPullRequests`, `forge.listIssues` existem com o contrato do §8 do PRD
- [ ] Projeto inexistente é `NOT_FOUND` em todas, pela mesma rotina de hoje
- [ ] `forge.*` com forge bloqueado devolve a **causa**, não uma exceção — a tela precisa dela para escolher a frase (F7.12)
- [ ] `project.fetch` não é chamável em rajada: duas chamadas concorrentes no mesmo projeto não viram dois `git fetch`
- [ ] Nenhuma delas emite evento: são leituras
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10

**Tests**: integration, sobre o router · **Gate**: quick
**Commit**: `feat(server): expose branches, pull requests and issues over trpc`

---

## Fase 4 — O prompt

#### S12: Transporte `arg`

**What**: O prompt como item do argv, que é o caminho sem timing.
**Where**: `packages/server/src/sessions/prompt.ts` + teste
**Depends on**: S7

**Done when**:
- [ ] `{prompt}` nos `args` da configuração é substituído; sem placeholder, o prompt é **anexado ao fim**
- [ ] O prompt é **um** item do argv, com espaço, quebra de linha, aspas e `--` dentro — provado pelo argv registrado
- [ ] Prompt vazio não altera argv nenhum
- [ ] Teto de 8 KiB, recusado acima com mensagem (§9.1 do PRD)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6

**Tests**: unit, puro · **Gate**: quick
**Commit**: `feat(server): hand the prompt to an agent through argv`

---

#### S13: Transporte `type`

**What**: Escrever no PTY sem perder o texto, que é a parte frágil da feature.
**Where**: `packages/server/src/sessions/prompt.ts`, `packages/server/src/pty/PtyManager.ts` + teste
**Depends on**: S12

**Done when**:
- [ ] Espera o **primeiro byte** de saída, depois **300 ms de silêncio**, com teto de **10 s** (§6.2 do PRD)
- [ ] Estourado o teto, escreve mesmo assim e registra em log — nunca fica esperando para sempre
- [ ] O texto vai entre `ESC[200~` e `ESC[201~`, e o `\r` vai **separado**; um teste com prompt de três linhas prova que nada foi enviado antes da hora
- [ ] Processo que morre antes da entrega não derruba nada: a falha é registrada e a worktree fica (A12)
- [ ] Os três números estão em constantes nomeadas, com comentário dizendo que foram **escolhidos, não medidos** ([P3](#pendências))
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8

**Tests**: unit, com PTY de verdade rodando um script que imprime e ecoa · **Gate**: quick
**Commit**: `feat(server): type the prompt into a tui that has finished booting`

---

#### S14: A criação amarra sessão e prompt

**What**: `worktree.create` com prompt abre o agente na worktree nova e entrega o texto — sem que uma falha ali custe o checkout.
**Where**: `packages/server/src/routers/worktree.ts` + teste
**Depends on**: S9, S13

**Done when**:
- [ ] Com `prompt` e `agentConfigId`, a criação termina com uma sessão de agente **rodando** na worktree nova
- [ ] Sem `prompt`, nenhuma sessão é aberta — o comportamento de hoje é o default
- [ ] `agentConfigId` ausente com prompt presente é `INVALID_ARGUMENT`, antes de qualquer git
- [ ] Agente indisponível (F6.5) **não** desfaz a worktree; o erro volta junto com a worktree criada (A12, F7.11)
- [ ] `initial_prompt` é gravado **antes** da tentativa de entrega, para sobreviver à falha ([Q15](open-questions.md))
- [ ] A resposta diz o que aconteceu com a sessão: id, ou a causa de não haver uma
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10

**Tests**: integration, com git, SQLite e PTY de verdade · **Gate**: quick
**Commit**: `feat(server): open the agent with the prompt the worktree was born with`

---

## Fase 5 — A tela

#### S15: O diálogo com abas e lista

**What**: O `CreateWorktreeDialog` de hoje vira o do §3 do PRD.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx`, `packages/web/src/hooks/useForgeSearch.ts` + testes
**Depends on**: S11, S1

**Done when**:
- [ ] Quatro abas; trocar de aba **não perde** nome nem prompt digitados ([Q17](open-questions.md))
- [ ] Busca com debounce; a de branch filtra em memória, a de PR e issue vai ao servidor ([Q16](open-questions.md))
- [ ] Esqueleto enquanto carrega, vazio com frase própria, erro com `tentar de novo` (F7.14)
- [ ] Branch já aberta aparece **marcada e desabilitada**, com o nome da worktree que a tem (F7.4) — recusada na tela, e ainda assim recusada no servidor
- [ ] `atualizar` chama `project.fetch` e mostra que está rodando
- [ ] Título e autor renderizados como **texto** (D8)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 12

**Tests**: component, com tRPC dublado · **Gate**: quick
**Commit**: `feat(web): pick where a worktree comes from`

---

#### S16: Nome, prompt e agente

**What**: Os três campos de baixo do diálogo.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx` + teste
**Depends on**: S15

**Done when**:
- [ ] O nome sorteado aparece no **placeholder**, vem do servidor e **não muda** enquanto o diálogo está aberto (D7)
- [ ] Origem que já traz branch preenche o nome e deixa editar
- [ ] O nome tem gesto de **copiar** (`⧉`, o mesmo da project-from-url) — `fraunhofer` digitado à mão num `cd` erra (A16)
- [ ] O prompt vem pré-preenchido com a **referência** (número, título, URL) — nunca com o corpo (A8)
- [ ] O seletor de agente lista as configurações e desabilita as indisponíveis, com a frase do F6.5
- [ ] Prompt preenchido sem agente escolhido impede o envio, na tela
- [ ] `criar` fica ocupado enquanto a criação roda — `worktree add` é segundos, e o segundo clique falharia na branch que o primeiro criou
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10

**Tests**: component · **Gate**: quick
**Commit**: `feat(web): name it, prompt it, choose who works on it`

---

#### S17: As frases de indisponibilidade

**What**: As três razões do F7.12, cada uma com a sua frase e o seu conselho.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx` + teste
**Depends on**: S15

**Done when**:
- [ ] `no-remote`, `no-cli` e `host-not-configured` produzem **três textos diferentes**, e o teste compara os três
- [ ] A terceira **nomeia o comando**: `gh auth login --hostname <host>`, com o host de verdade dentro (A10)
- [ ] As abas `branch nova` e `branch` continuam funcionando nas três (F7.13)
- [ ] Nenhuma das três renderiza stderr cru
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6

**Tests**: component · **Gate**: quick
**Commit**: `feat(web): say which of the three reasons blocks pull requests and issues`

---

#### S18: A origem aparece na worktree

**What**: Depois de criada, a worktree diz de onde veio.
**Where**: `packages/web/src/components/WorktreePanel.tsx`, `packages/web/src/components/SidebarTree.tsx` + testes
**Depends on**: S9

**Done when**:
- [ ] O painel mostra origem, referência e título, com link clicável quando há URL (F7.9)
- [ ] `blank` não mostra linha nenhuma — ausência de origem não é uma origem
- [ ] O prompt inicial aparece, truncado, com o que aconteceu com a entrega
- [ ] Título vindo do provedor renderizado como texto (D8)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6

**Tests**: component · **Gate**: quick
**Commit**: `feat(web): show where a worktree came from`

---

## Fase 6 — A prova de ponta a ponta

#### S19: E2E — issue vira worktree com agente trabalhando

**What**: O critério de sucesso do §1 do PRD, rodando.
**Where**: `e2e/worktree-source.spec.ts`, `e2e/support/*` (o `gh` de mentira)
**Depends on**: todas

**Done when**:
- [ ] O harness põe no `PATH` um `gh` de mentira que responde `pr list`, `issue list`, `auth status` e `pr checkout` (D9, [P8](#pendências))
- [ ] Fluxo 1: branch existente → worktree criada, aberta na branch certa, visível na sidebar
- [ ] Fluxo 2: issue → worktree com nome **sorteado**, origem registrada, sessão de agente aberta e o prompt entregue — verificado pela saída do PTY
- [ ] Fluxo 3: branch já aberta → a recusa aparece na tela **nomeando** a outra worktree
- [ ] Fluxo 4: `gh` fora do `PATH` → as abas de forge explicam, e as de git continuam criando worktree; e `gh` presente que **não reivindica o host** produz a frase com o `auth login` dentro
- [ ] Nenhum teste toca a rede
- [ ] Gate: `pnpm gate:full`

**Tests**: e2e, Playwright · **Gate**: full
**Commit**: `test(e2e): turn an issue into a worktree with an agent already working`

---

## Depois

O que esta feature deixa pronto para a próxima, e não faz:

- **Estado de PR na sidebar** — CI, review, mergeabilidade. O adapter já existe; falta polling e um lugar na tela.
- **Abrir PR a partir da worktree.** Depende da [Q023 do questions.md](../../project/questions.md).
- **Navegar até a worktree que já tem a branch** ([P7](#pendências)).
- **Prompt inicial em shell** ([Q21](open-questions.md)) — recusado na v1, e a conversa que falta é sobre comando destrutivo.
