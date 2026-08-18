# Memória de workspace — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Entrega de contexto:** [context-delivery.md](context-delivery.md)
**Roadmap:** [roadmap.md](roadmap.md) — este arquivo é a execução da pilha descrita lá
**Status:** **PR 02 entregue** — 5 de 5, portão verde (`gate:full`: 1.108 unit/integration + 16 e2e).
As demais entram quando a anterior abrir PR

---

## Como este arquivo é organizado

Uma seção por PR da pilha. A PR corrente é a única detalhada em tasks; as seguintes ficam com
escopo e `Done when`, e ganham tasks quando chegar a vez — porque task escrita cedo demais é task
escrita contra premissa que a implementação ainda vai derrubar.

| PR | Branch | Base | Estado |
|---|---|---|---|
| **01** | `wm/01-armazenamento` | guarda-chuva | **entregue** — tasks e o que a execução achou, abaixo |
| **02** | `wm/02-portao` | 01 | **entregue** — tasks e o que a execução achou, abaixo |
| 03 | `wm/03-superficies` | 02 | idem |
| 04 | `wm/04-recall` | 03 | idem |
| 05 | `wm/05-inbox-ui` | 04 | idem |
| S1 | `wm/s1-sinais-de-acao` | 01 | idem |
| S2 | `wm/s2-prototipo` | guarda-chuva | idem |

---

## Premissas travadas

Cada uma vem de uma pergunta **respondida**. Implementar contra qualquer outra coisa é apostar.

| # | Premissa | Origem |
|---|---|---|
| **A1** | **Nenhuma memória dentro do repositório.** Tudo sob `~/.lumem` | [Q3, Q7, Q8](open-questions.md) |
| **A2** | **Markdown é a fonte da verdade; o banco é derivado** e reconstruível por `reindex` | [Q50 do projeto](../../project/questions.md), Q3 |
| **A3** | **O Lumem versiona o `~/.lumem` com git**: `git init` no bootstrap, um commit por mudança aplicada, remoto opcional e nunca automático | [Q36](open-questions.md) |
| **A4** | **Versiona-se a fonte, ignora-se o derivado**: `memory/` e `playbooks/` no git; `lumem.db`, `context/` e `_system/` fora | [Q36](open-questions.md) |
| **A5** | **A identidade do projeto vive em `<repo>/.lumem/project.toml`**, commitada — e só ela e config universal de time entram ali | [Q3.1](open-questions.md) |
| **A6** | O arquivo de identidade é **lido se existir**; se não existir, o ULID é gerado e escrito **só com permissão sua**, e nunca commitado pelo Lumem | [Q3.1](open-questions.md) |
| **A7** | ID reivindicado por dois caminhos com remotes diferentes = **fork**: o Lumem pergunta, e rotaciona o ID se for | [Q3.1](open-questions.md) |
| **A8** | **Worktree não tem memória**, mas é **origem**: a proveniência guarda de qual worktree veio o aprendizado | [Q5](open-questions.md) |
| **A9** | Taxonomia fechada: `user`, `feedback`, `project`, `domain`, `process`, `contract`, `reference` — validada na fronteira | [Q4](open-questions.md) |
| **A10** | Toda memória carrega **proveniência**: origem, sessão, projeto/worktree, confiança, `superseded_by` | §7 do PRD |

---

## Pendências

| # | O quê | Estado |
|---|---|---|
| **P1** | O `~/.lumem` versionado significa que memória apagada continua no histórico do git. É o comportamento desejado ([Q29](open-questions.md)), mas **segredo que passe pelo scan e seja commitado não sai mais** | **mitigada** pela PR 02: o scan roda antes de toda escrita, inclusive na restauração do `revert`. Continua sendo filtro contra acidente, não contra atacante |
| **P5** | Um `git commit` que falha **depois** do `git add` deixa a mudança no índice, e o commit seguinte — de outra memória qualquer — a varre junto. O commit passa a conter o que ninguém pediu | anotada na PR 02, com teste que a contorna. Agrupar por transação (P4) resolve as duas |
| **P2** | Dois checkouts do mesmo repo em máquinas diferentes com o mesmo `project.toml` produzem o mesmo ID — é o que se quer, e é também o que permitiria memória compartilhada um dia | anotada, sem ação ([backlog](../../project/backlog.md)) |
| **P3** | `git init` em `~/.lumem` numa máquina onde o usuário já tem outro git ali (por sincronia manual) | a T1 detecta repositório existente e **adota** em vez de reinicializar |
| **P4** | Commit por mudança gera histórico verboso. Se incomodar, o passo seguinte é agrupar por transação, não parar de commitar | aberta, sem bloqueio |

---

## PR 01 — `wm/01-armazenamento`

**O que entrega:** o lugar onde a memória mora, versionado, com identidade de projeto resolvida.
Nenhum agente ainda escreve nada — o portão é a PR 02.

**Done when (da PR inteira):** o daemon escreve uma memória por comando, ela aparece como arquivo
Markdown legível em `~/.lumem`, o `git log` mostra o commit correspondente, e `reindex` reconstrói o
índice a partir do disco sem perder nada.

**Gate:** `full` antes de abrir PR; `quick` durante.

### O que a execução achou

Cinco coisas que o PRD não previa, e que valem mais registradas do que corrigidas em silêncio.

| # | O quê | Onde ficou |
|---|---|---|
| **E1** | **`worktrees/` tinha que entrar no `.gitignore`.** Desde o walking-skeleton as worktrees gerenciadas vivem em `~/.lumem/worktrees` — checkouts git inteiros. Sem essa linha, o primeiro `git add` aninharia repositório dentro de repositório | `home.ts`, com teste |
| **E2** | **`rev-parse --git-dir` sobe a hierarquia.** Com o state dir dentro de outro repositório (o e2e usa `.lumem-e2e/`), o daemon achava que já havia repo, não inicializava, e o `git add` morria com *"paths are ignored"* — **o daemon não subia**. A pergunta certa é `--show-toplevel` comparado ao próprio state dir, por realpath. **Foi o e2e que achou** | `home.ts`, com teste |
| **E3** | **`bootstrap.test.ts` usava o `~/.lumem` de verdade.** Inofensivo enquanto o boot só abria um banco injetado; com o boot criando diretório e `git init`, a suíte passaria a escrever no estado do desenvolvedor | state dir temporário por boot |
| **E4** | **Identidade do commit por `-c`, nunca gravada.** CI não tem `user.name` e o commit falharia; e num repositório **adotado** o Lumem não tem por que mexer na config de quem estava lá. O teste roda com `GIT_CONFIG_GLOBAL=/dev/null` para provar | `home.ts`, `repo.ts` |
| **E5** | **Reindexar tem que ser determinístico.** As datas da linha do catálogo eram o instante da indexação, então reindexar produzia linhas equivalentes, não iguais. Espelhar `created_at`/`updated_at` da proveniência resolve — e faz "ordenar por mais recente" significar a memória mais recente, não a reindexação | `catalog.ts` |

Mais uma de vocabulário: usei `INVALID_INPUT` e o repositório já tinha `INVALID_ARGUMENT`. Corrigido —
taxonomia com sinônimo é taxonomia que apodrece.

E uma dependência nova: **`yaml`** no `@lumem/server`. O frontmatter é editado à mão pelo usuário
(é a premissa A2), e um parser caseiro quebraria na primeira aspa fora do lugar.

---

### T1 — O diretório e o repositório

Cria e adota `~/.lumem` no bootstrap do daemon.

- Estrutura da [§5 do PRD](prd.md): `memory/`, `workspaces/<id>/`, `context/`, `_system/`
- `git init` se não houver repositório; **adotar** se houver (P3)
- `.gitignore` escrito na criação, cobrindo `lumem.db*`, `context/`, `_system/`
- Diretório com permissão `0700` — é conhecimento seu, não do mundo

**Done when:** subir o daemon num `HOME` vazio produz a estrutura, com repositório git e `.gitignore`
já commitado; subir de novo não muda nada (idempotente); e subir sobre um `~/.lumem` que já é um
repositório git não reinicializa nem perde histórico.

**RED primeiro:** teste que sobe o bootstrap duas vezes contra um diretório temporário e assere que o
segundo boot não cria commit novo.

---

### T2 — O arquivo de memória

O formato em disco: Markdown com frontmatter estrito.

- Campos: `name`, `description`, `type`, `scope`, e o bloco `provenance` (A10)
- `type` validado contra a taxonomia fechada (A9); valor fora da lista é **erro**, não campo livre
- Escrita atômica (tmp + rename), como o `FileService` já faz
- Nome de arquivo derivado de `(tipo, slug)` — a identidade da [Q12](open-questions.md)

**Done when:** escrever e ler de volta preserva conteúdo byte a byte; `type` inválido é recusado com
erro de domínio; e um arquivo com frontmatter corrompido é lido como **erro nomeado**, nunca como
memória vazia.

---

### T3 — Commit por mudança

Cada escrita aplicada vira um commit no `~/.lumem`.

- Mensagem derivada da operação: tipo, escopo, slug, origem
- `git add` do caminho tocado, nunca `-A` — o que não é da operação não entra
- Falha de git **não** desfaz a escrita, mas é registrada e visível: disco é a fonte da verdade
- Nunca `push`

**Done when:** três escritas produzem três commits com mensagens distintas e diff mínimo; e com o
`~/.lumem` num estado que impede commit (índice travado, por exemplo) a escrita ainda acontece e o
erro aparece.

---

### T4 — Identidade do projeto

Resolver o ID ao adicionar um projeto (A5, A6, A7).

- Ler `<repo>/.lumem/project.toml`; havendo `id`, adotar
- Não havendo, gerar ULID e **pedir permissão** antes de escrever; recusa mantém o ID só no banco
- Escrever o arquivo **não commitado**, com a mensagem dizendo que commitar é ato seu
- Detectar fork: mesmo `id` em caminho diferente com remote diferente → perguntar, e rotacionar se for
  fork
- Worktree resolve para o projeto por `git rev-parse --git-common-dir`

**Done when:** adicionar um repo sem arquivo, aceitando a escrita, produz `project.toml` com ID e
árvore suja (não commitada); adicionar o mesmo repo clonado em outro caminho **reusa** o ID; e com
remote diferente o fluxo de fork é acionado. Uma worktree do projeto resolve para o mesmo ID sem ler
arquivo nenhum.

---

### T5 — O catálogo derivado

A tabela que espelha o disco, e o comando que a reconstrói.

- Esquema mínimo: memória (id, tipo, escopo, slug, caminho, hashes, timestamps) e proveniência
- `reindex`: varre o Markdown e reconstrói **tudo**, sem depender do estado anterior
- Nada de domínio nasce só no banco — o banco é projeção

**Done when:** apagar o `lumem.db` e rodar `reindex` devolve exatamente o mesmo catálogo; e uma
memória editada à mão no disco aparece com o conteúdo novo depois do `reindex`.

---

### T6 — Escopos

Resolver em qual escopo uma memória vive, e onde ela cai no disco.

- `user` → `~/.lumem/memory/`
- `workspace` → `~/.lumem/workspaces/<id>/memory/`
- `project` → `~/.lumem/workspaces/<id>/projects/<id>/memory/`
- Escopo default por tipo (A9), com escopo explícito vencendo

**Done when:** os três escopos escrevem no lugar certo; escopo default é derivado do tipo sem o
chamador informar; e escopo inválido para o tipo é recusado.

---

### T7 — A superfície mínima

Um comando para escrever, um para ler, um para listar, um para `reindex`. **Sem MCP ainda** — a
paridade CLI/MCP é a PR 03.

**Done when:** o ciclo inteiro roda pela linha de comando contra um `HOME` de teste, e o `git log`
conta a história.

---

## PR 02 — `wm/02-portao`

**O que entrega:** o portão único de escrita. Nada é gravado sem passar por ele, e **toda decisão fica
registrada — inclusive a que não virou arquivo**.

**Done when (da PR inteira):** uma escrita com segredo é rejeitada, não chega ao disco, e a rejeição
está no WAL com o motivo — sem o conteúdo escaneado. Um `revert` volta o conteúdo e grava uma decisão
nova.

**Gate:** `full` antes de abrir PR; `quick` durante.

### O que a execução achou

| # | O quê | Onde ficou |
|---|---|---|
| **E6** | **Duplicata nunca disparava.** A comparação era de bytes, e o arquivo carrega `updated_at`, que muda a cada escrita. Virou comparação de **assinatura semântica** — e o mesmo defeito estava na chave de idempotência, que também saía do texto com carimbo | `entry.ts`, `gate.ts` · [Q38](open-questions.md) |
| **E7** | **Reverter duas vezes alterna.** É a semântica do git, não um bug — e ficou **escrita no teste** em vez de "corrigida" no código. O que a chave garante é que o mesmo ponto, do mesmo `HEAD`, nunca vira duas decisões | `MemoryService.ts` · [Q39](open-questions.md) |
| **E8** | **O `revert` gravava antes de decidir.** Um commit anterior com segredo — editado à mão, ou escrito antes de o portão existir — ia para o disco e para o `HEAD` com a decisão registrada como `rejected`. O portão passou para antes da escrita, como no `write` | `MemoryService.ts` |
| **E9** | **Apagar não virava decisão.** `forget` e o ramo de deleção do `revert` mexiam no disco e no git sem passar pelo WAL — e a [Q29](open-questions.md) promete que apagar é reversível por ele. O git sabe *que* sumiu, nunca *quem pediu* | `MemoryService.ts` |
| **E10** | **A régua do scan não cobria o que hoje se cola.** Nenhuma chave que a OpenAI emite hoje, nenhum PAT fine-grained do GitHub, nenhuma linha de `.env` com `export`, indentação, aspas ou comentário, e nenhuma credencial embutida em URL. E a faixa de invisível deixava brecha de evasão | `scan.ts` · [Q41](open-questions.md) |
| **E11** | **O scan recusava memória sobre esta própria feature.** "System prompt" é vocabulário do domínio; bloquear a expressão sozinha era o erro que a [Q10](open-questions.md) mandou não copiar. Regras ganharam severidade: bloqueia com verbo imperativo junto, anota a menção isolada | `scan.ts` · [Q40](open-questions.md) |
| **E12** | **`--path` do `decisions` não filtrava nada.** O `where` vinha depois do `orderBy`/`limit`, então sobrava o topo global recortado. Uma superfície de CLI inteira sem teste | `gate.ts` |
| **E13** | **Um `commit` que falha depois do `add` deixa o índice sujo**, e o commit seguinte varre a mudança junto. Apareceu ao escrever o teste da chave de idempotência, que precisava de um `commit: null` sem mover o histórico do arquivo | anotado em **P5** |

---

### T8 — O scan determinístico

Três categorias bloqueiam — **segredo**, **prompt injection**, **Unicode invisível** (este **limpa**,
não rejeita) — e uma anota: **tempo relativo**.

- As regras do Compozy que matam memória legítima ficam **de fora**, com teste provando que passam:
  bloco de código, caminho de repositório, a palavra "cron"
- O motivo **nunca repete o conteúdo escaneado** — senão o log vira o vazamento que o scan existe
  para evitar
- Severidade por regra: o que mata memória legítima entra como anotação, nunca como bloqueio ([Q40](open-questions.md))

**Done when:** as formas de credencial que se cola hoje são recusadas; prosa legítima sobre este
próprio projeto passa; e segredo escondido atrás de invisível ainda é pego.

---

### T9 — O portão único

Toda escrita passa por um lugar só, na ordem do [§7 do PRD](prd.md).

- `decide` é **puro**: decidir sem banco, persistir em transação
- Duplicata por **assinatura semântica**, não por bytes ([Q38](open-questions.md))
- Identidade `(tipo, slug)` decide entre `add` e `update`
- Decisão persistida **antes** de tocar o arquivo

**Done when:** escrever duas vezes o mesmo conteúdo é `noop` e não produz commit vazio; e a decisão
existe no WAL antes de o disco mudar.

---

### T10 — O WAL magro (Q37)

Com o `~/.lumem` versionado, o conteúdo anterior é o commit anterior. O WAL guarda a **decisão**.

- Origem, sessão, regra que bateu, confiança, idempotência, e o SHA que a decisão produziu
- **Rejeição e no-op vivem só aqui** — não viram arquivo, não viram commit
- Nada de `prior_content`: manter os dois seria manter dois históricos do mesmo texto

**Done when:** uma escrita rejeitada não existe no disco nem no git, e existe no WAL com o motivo —
sem o conteúdo escaneado.

---

### T11 — `revert`

Volta pelo git e grava uma **decisão nova**, sem reescrever histórico.

- O conteúdo restaurado **também passa pelo portão**: ele pode ter sido editado à mão, ou escrito
  antes de o portão existir
- Desfazer a criação é apagar — era ela que não existia antes
- Apagar é decisão: `forget` e o ramo de deleção registram `delete` no WAL antes de mexer no disco

**Done when:** um `revert` volta o conteúdo, grava decisão nova e deixa o catálogo com o restaurado;
e reverter para um commit que contém segredo é recusado sem tocar o disco.

---

### T12 — A superfície: `forget`, `revert`, `decisions`

Os três comandos na CLI, sobre o mesmo núcleo — a paridade com MCP continua sendo a PR 03.

**Done when:** `decisions --path` mostra só o caminho pedido, e uma rejeição aparece ali com a regra
que bateu e sem o conteúdo.

## PR 03 — `wm/03-superficies` (escopo, sem tasks)

`lumem-memory` como núcleo com superfícies: CLI e MCP sobre as mesmas funções e o mesmo contrato de
erro. Shadow por identidade entre escopos. O **funil cross-projeto nasce aqui, desligado**, com
registro de acesso.

**Done when:** o mesmo pedido responde igual nas duas superfícies; memória de projeto sombreia a de
workspace e o sombreamento vira evento.

## PR 04 — `wm/04-recall` (escopo, sem tasks)

FTS5 reconstruível, busca lexical explicável, sinal de uso (`recall_count`, `last_recalled_at`,
score), e a instrumentação do [§6 do context-delivery](context-delivery.md).

**Done when:** buscar acha, diz por que achou, o contador sobe, e os números de custo são
consultáveis.

## PR 05 — `wm/05-inbox-ui` (escopo, sem tasks)

Inbox de propostas (incluindo o núcleo destilado da D1), vista por escopo com o que sombreia o quê,
linha do tempo com desfazer, e os números na tela.

**Done when:** uma proposta é aprovada, editada ou rejeitada pela UI, e o `git log` mostra o
resultado.

## S1 — `wm/s1-sinais-de-acao` (escopo, sem tasks)

Registro cru dos sinais que não dependem de cooperação: edição por cima do agente, revert de commit
dele, worktree descartada, sessão morta cedo. **Só evento estrutural, nunca conteúdo.**

**Done when:** os quatro eventos ficam registrados com alvo e horário, e dá para listá-los.

## S2 — `wm/s2-prototipo` (escopo, sem tasks)

Protótipo HTML+CSS da inbox, da vista de memória e da linha do tempo, sobre os tokens que já existem,
seguindo a skill `ui-design-prototype`.

**Done when:** renderiza, e as decisões de forma estão registradas.
