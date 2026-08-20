# Memória de workspace — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Entrega de contexto:** [context-delivery.md](context-delivery.md)
**Roadmap:** [roadmap.md](roadmap.md) — este arquivo é a execução da pilha descrita lá
**Status:** **01 a 04, S1 e S2 mergeadas**; a **05** é o topo da pilha e está em revisão. Portão verde
no topo: `gate:full` com **1.318 unit/integration + 16 e2e**

---

## Como este arquivo é organizado

Uma seção por PR da pilha. A PR corrente é a única detalhada em tasks; as seguintes ficam com
escopo e `Done when`, e ganham tasks quando chegar a vez — porque task escrita cedo demais é task
escrita contra premissa que a implementação ainda vai derrubar.

| PR | Branch | Base | Estado |
|---|---|---|---|
| **01** | `wm/01-armazenamento` | guarda-chuva | **mergeada** — tasks e o que a execução achou, abaixo |
| **02** | `wm/02-portao` | 01 | **mergeada** — tasks e o que a execução achou, abaixo |
| **03** | `wm/03-superficies` | 02 | **mergeada** — escopo e o que a execução achou, abaixo |
| **04** | `wm/04-recall` | 03 | **mergeada** — FTS5 explicável, sinal de uso, instrumentação |
| **05** | `wm/05-inbox-ui` | 04 | **em PR** — propostas e a memória na tela |
| **S1** | `wm/s1-sinais-de-acao` | 01 | **mergeada** — tasks abaixo |
| **S2** | `wm/s2-prototipo` | 04 | **mergeada** — protótipo verificado por renderização |

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
| **A10** | Toda memória carrega **proveniência**: origem, sessão (que **acumula**, nunca troca), projeto/worktree, confiança, `superseded_by` — mais `proposed_by`/`proposal_id` quando veio de proposta aprovada | §7 do PRD |

---

## Pendências

| # | O quê | Estado |
|---|---|---|
| **P1** | O `~/.lumem` versionado significa que memória apagada continua no histórico do git. É o comportamento desejado ([Q29](open-questions.md)), mas **segredo que passe pelo scan e seja commitado não sai mais** | aberta — o scan é da PR 02; até lá, a 01 não expõe escrita a agente |
| **P2** | Dois checkouts do mesmo repo em máquinas diferentes com o mesmo `project.toml` produzem o mesmo ID — é o que se quer, e é também o que permitiria memória compartilhada um dia | anotada, sem ação ([backlog](../../project/backlog.md)) |
| **P3** | `git init` em `~/.lumem` numa máquina onde o usuário já tem outro git ali (por sincronia manual) | a T1 detecta repositório existente e **adota** em vez de reinicializar |
| **P4** | Commit por mudança gera histórico verboso. Se incomodar, o passo seguinte é agrupar por transação, não parar de commitar | aberta, sem bloqueio |
| **P5** | **O `scope` do frontmatter e o diretório podem discordar, e ninguém reclama.** `rowFor` tira o escopo do frontmatter e os ids do caminho: um arquivo em `memory/` declarando `scope: workspace` é indexado como `workspace` com `workspace_id` vazio, e o `read` naquele escopo procura noutro diretório e não acha. Só acontece com arquivo editado à mão — que a A2 declara caso de primeira classe | aberta → [Q39](open-questions.md). Não bloqueia: o caminho de escrita sempre produz arquivo coerente |
| **P6** | Um `git commit` que falha **depois** do `git add` deixa a mudança no índice, e o commit seguinte — de outra memória qualquer — a varre junto. O commit passa a conter o que ninguém pediu | anotada na PR 02, com teste que a contorna. Agrupar commit por transação (P4) resolve as duas |
| **P7** | **A janela real de contexto no ACP não foi medida sob carga.** O spike provou que a sessão *nasce* em 1M, mas não encheu contexto, então a [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786) segue aberta ([§9.5 do estudo](../../project/pty-vs-acp.md)). O orçamento do [context-delivery](context-delivery.md) e a marca d'água da [D5](context-delivery.md) foram calibrados supondo 1M | **aberta** — não bloqueia a PR 01, que não injeta nada. Bloqueia calibrar a marca d'água. Barato de medir junto com a primeira tela da ACP-1 |
| **P8** | **A `acp-sessions` não tem `tasks.md`.** É a frente B recomendada agora ([roadmap §5–§7](roadmap.md)), e sem ela a ACP-1 não é executável pelo critério deste repositório | aberta, sem bloqueio para as PRs 01–05 |

---

## PR 01 — `wm/01-armazenamento`

**O que entrega:** o lugar onde a memória mora, versionado, com identidade de projeto resolvida.
Nenhum agente ainda escreve nada — o portão é a PR 02.

**Done when (da PR inteira):** o daemon escreve uma memória por comando, ela aparece como arquivo
Markdown legível em `~/.lumem`, o `git log` mostra o commit correspondente, e `reindex` reconstrói o
índice a partir do disco sem perder nada.

**Gate:** `full` antes de abrir PR; `quick` durante.

### O que a execução achou

O que o PRD não previa, e que vale mais registrado do que corrigido em silêncio. As cinco primeiras
saíram da implementação; da **E6** à **E15**, da primeira rodada de revisão; da **E16** em diante, da
segunda — as três que a mutação e o teste de propriedade acharam depois que a suíte já estava verde.

| # | O quê | Onde ficou |
|---|---|---|
| **E1** | **`worktrees/` tinha que entrar no `.gitignore`.** Desde o walking-skeleton as worktrees gerenciadas vivem em `~/.lumem/worktrees` — checkouts git inteiros. Sem essa linha, o primeiro `git add` aninharia repositório dentro de repositório | `home.ts`, com teste |
| **E2** | **`rev-parse --git-dir` sobe a hierarquia.** Com o state dir dentro de outro repositório (o e2e usa `.lumem-e2e/`), o daemon achava que já havia repo, não inicializava, e o `git add` morria com *"paths are ignored"* — **o daemon não subia**. A pergunta certa é `--show-toplevel` comparado ao próprio state dir, por realpath. **Foi o e2e que achou** | `home.ts`, com teste |
| **E3** | **`bootstrap.test.ts` usava o `~/.lumem` de verdade.** Inofensivo enquanto o boot só abria um banco injetado; com o boot criando diretório e `git init`, a suíte passaria a escrever no estado do desenvolvedor | state dir temporário por boot |
| **E4** | **Identidade do commit por `-c`, nunca gravada.** CI não tem `user.name` e o commit falharia; e num repositório **adotado** o Lumem não tem por que mexer na config de quem estava lá. O teste roda com `GIT_CONFIG_GLOBAL=/dev/null` para provar | `home.ts`, `repo.ts` |
| **E5** | **Reindexar tem que ser determinístico.** As datas da linha do catálogo eram o instante da indexação, então reindexar produzia linhas equivalentes, não iguais. Espelhar `created_at`/`updated_at` da proveniência resolve — e faz "ordenar por mais recente" significar a memória mais recente, não a reindexação | `catalog.ts` |
| **E6** | **O comando que reconstrói o índice era o que o destruía.** `reindex` apagava a tabela e reinseria **fora de transação**: um insert que estourasse — dois arquivos reduzindo ao mesmo `(escopo, tipo, slug)` — deixava o catálogo apagado e meio preenchido, com o erro cru subindo como stack. Hoje a reconstrução é uma transação, identidade duplicada é item de `failures[]`, e a varredura é **ordenada por caminho** para que "quem ganha" não dependa da ordem do `readdir` | `catalog.ts`, com teste |
| **E7** | **No SQLite, NULL não colide com NULL.** O índice único de identidade incluía `workspace_id` e `project_id` nuláveis, então a unicidade de `(tipo, slug)` só valia no escopo `project` — duas memórias globais com a mesma identidade conviviam. As colunas passaram a ser `NOT NULL DEFAULT ''`: o vazio é o sentinela que faz o índice valer nos três escopos | `db/schema.ts`, migração `0002` |
| **E8** | **Pathspec no `add` não basta; o `commit` também precisa.** `git commit -m <msg>` commita o **índice inteiro** — num `~/.lumem` adotado, um `git add` que o usuário deixou pendente entrava de carona no commit da memória. Hoje é `commit -m <msg> -- <paths>`, nos dois lugares que commitam | `repo.ts`, `home.ts`, com teste |
| **E9** | **A fronteira da A9 era só de leitura.** As flags da CLI entravam por `as` e nada validava: `--actor hacker` gravava **e commitava** um arquivo que o próprio `parseEntry` recusa depois. Agora `serializeEntry` roda o schema zod antes de escrever, e a CLI valida tipo, escopo e ator contra as listas fechadas. De quebra, `parseFlags` parou de comer valor começado por `--` (`--body "--- regra"` virava o literal `"true"`) e passou a aceitar `--flag=valor` | `entry.ts`, `cli.ts`, com teste |
| **E10** | **`id` anexado no fim de um TOML cai dentro da última tabela.** Com `[scripts]` no arquivo — que é o caso do time —, o `id` virava `scripts.id`, e só funcionava porque a leitura era um regex que ignora tabela: o mesmo regex adotava como identidade do projeto qualquer `id` de outra ferramenta. O arquivo é commitado e compartilhado (A5), então ele passou a ser lido por **parser TOML** (`smol-toml`) e escrito **antes da primeira tabela** | `project-identity.ts`, com teste |
| **E11** | **`resolveRepoRoot` adivinhava pelo nome.** "Termina em `.git`" mandava o `project.toml` de um **submódulo** para dentro do `.git` do pai, e o de um bare `projeto.git` para **fora** do repositório. A pergunta certa é `--git-dir` × `--git-common-dir`: iguais é repositório comum, e vale o `--show-toplevel`; diferentes é worktree vinculada, e vale o pai do common dir | `project-identity.ts`, com teste |
| **E12** | **Adotar é adotar o que estava lá.** O boot reescrevia o `.gitignore` do usuário por inteiro e commitava por cima — o oposto da [P3](#pendências). Hoje o daemon é dono de um **bloco delimitado** e de mais nada | `home.ts`, com teste |
| **E13** | **Arquivo corrompido não pode bloquear a escrita.** `write` lia o `created_at` anterior para preservá-lo, e um arquivo ilegível fazia a escrita inteira falhar: a memória só era consertável apagando o arquivo por fora. Hoje a data de nascimento recomeça, com aviso no log | `MemoryService.ts`, com teste |
| **E14** | **Dois testes fracos, confirmados por mutação.** Trocar `hashContent` por uma constante e tirar o `continue` do `MEMORY.md` deixavam a suíte verde. Agora não deixam — e o `contentHash` é o que a PR 02 vai usar para reconhecer duplicata exata | `catalog.test.ts` |
| **E15** | **O `Done when` da T6 pedia o que não existe.** "Escopo **inválido para o tipo** é recusado" pressupõe uma matriz de escopo proibido por tipo que o PRD nunca definiu. Virou a [Q38](open-questions.md); a T6 entrega a recusa de escopo fora da taxonomia | `paths.ts`, `cli.ts`, com teste |
| **E16** | **A guarda contra identidade duplicada existia só no `reindex`.** O `write` decidia inserir ou atualizar **pelo caminho**, mas o índice único é por **identidade** — e `slugFromPath` tira o prefixo `<tipo>_`, então `memory/alfa.md` e `memory/user_alfa.md` reivindicam a mesma. O `SqliteError` estourava **depois** do `writeAtomically` e antes do commit: arquivo novo no disco, sem commit, catálogo apontando para o antigo. Hoje o `write` pergunta ao catálogo antes de tocar em qualquer coisa e recusa com `DomainError` dizendo qual arquivo é o dono | `MemoryService.ts`, `catalog.ts`, com teste |
| **E17** | **Editar arquivo do usuário exige idempotência sobre a própria saída.** Com marcador de abertura sem fechamento, o boot anexava um bloco novo e deixava o órfão no topo; no boot seguinte o `begin` achava o órfão, o `end` achava o fechamento do bloco novo, e o `slice` apagava tudo no meio — regra do usuário incluída, com a remoção commitada. É a P3 dois boots adiante. Hoje órfão some como **linha**, nunca como intervalo, e o teste é a propriedade: `f(f(x)) === f(x)` nos quatro ramos | `home.ts`, com teste |
| **E18** | **A E10 corrigiu a leitura do TOML e deixou a escrita no regex.** "Onde a raiz termina" continuava sendo `/^\s*\[/` linha a linha, e valor multilinha cuja continuação começa com `[` é indistinguível de cabeçalho de tabela: um array de arrays fazia o Lumem gravar **TOML inválido** no repositório do time, e uma string multilinha engolia o `id` — `readProjectId` devolvia `null` e o boot seguinte gerava outro id, que é a rotação de identidade da Q3.1. Hoje a inserção **verifica a própria saída** com o mesmo parser da leitura, tem o topo do arquivo como plano B, e recusa com `DomainError` em vez de corromper | `project-identity.ts`, com teste |
| **E19** | **A ordenação da varredura passou dois reviews sem teste que a discriminasse.** A E6 diz que o `reindex` ordena por caminho para "quem ganha" não depender do `readdir` — e apagar o `.sort()` inteiro deixava **108 de 108** verdes, porque neste APFS o `readdir` já devolve numa ordem que coincide com a ordenada. Achado pelo passe a frio, depois de a bateria de 32 mutações do review não o pegar. O teste novo **inverte o `readdir`** e assere a mesma resposta nas duas ordens — é a única forma de a asserção falar da propriedade em vez do filesystem | `catalog.test.ts` |

Mais uma de vocabulário: usei `INVALID_INPUT` e o repositório já tinha `INVALID_ARGUMENT`. Corrigido —
taxonomia com sinônimo é taxonomia que apodrece.

E duas dependências novas no `@lumem/server`, pelo mesmo motivo uma da outra: **`yaml`** para o
frontmatter e **`smol-toml`** para o `project.toml`. Os dois arquivos são editados à mão — o
frontmatter pelo usuário (é a premissa A2), o `project.toml` pelo time (A5) —, e regex de linha em
formato com estrutura foi exatamente o defeito da E10.

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
chamador informar; e escopo fora da taxonomia é recusado com erro de domínio.

> **Desvio, registrado na [E15](#o-que-a-execução-achou):** o `Done when` original dizia "escopo
> **inválido para o tipo** é recusado", e isso não foi implementado — não existe matriz de escopo
> proibido por tipo em lugar nenhum do PRD. Virou a [Q38](open-questions.md). O que a T6 entrega é a
> recusa de escopo fora da taxonomia (`worktree`, por exemplo), que antes saía como `TypeError`.

---

### T7 — A superfície mínima

Um comando para escrever, um para ler, um para listar, um para `reindex`. **Só a CLI ainda** — a
paridade entre superfícies é a PR 03 (que entregou CLI + router tRPC; ver E1 lá).

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

Oito coisas, quase todas achadas pela **primeira rodada de review** — o que diz algo sobre a régua
que a implementação usou primeiro.

| # | O quê | Onde ficou |
|---|---|---|
| **E20** | **Duplicata nunca disparava.** A comparação era de bytes, e o arquivo carrega `updated_at`, que muda a cada escrita. Virou comparação de **assinatura semântica** — e o mesmo defeito estava na chave de idempotência, que também saía do texto com carimbo | `entry.ts`, `gate.ts` · [Q40](open-questions.md) |
| **E21** | **Reverter duas vezes alterna.** É a semântica do git, não um bug — e ficou **escrita no teste** em vez de "corrigida" no código. O que a chave garante é que o mesmo ponto, do mesmo `HEAD`, nunca vira duas decisões | `MemoryService.ts` · [Q41](open-questions.md) |
| **E22** | **O `revert` gravava antes de decidir.** Um commit anterior com segredo — editado à mão, ou escrito antes de o portão existir — ia para o disco e para o `HEAD` com a decisão registrada como `rejected`. O portão passou para antes da escrita, como no `write` | `MemoryService.ts` |
| **E23** | **Apagar não virava decisão.** `forget` e o ramo de deleção do `revert` mexiam no disco e no git sem passar pelo WAL — e a [Q29](open-questions.md) promete que apagar é reversível por ele. O git sabe *que* sumiu, nunca *quem pediu* | `MemoryService.ts` |
| **E24** | **A régua do scan não cobria o que hoje se cola.** Nenhuma chave que a OpenAI emite hoje, nenhum PAT fine-grained do GitHub, nenhuma linha de `.env` com `export`, indentação, aspas ou comentário, e nenhuma credencial embutida em URL. E a faixa de invisível deixava brecha de evasão | `scan.ts` · [Q43](open-questions.md) |
| **E25** | **O scan recusava memória sobre esta própria feature.** "System prompt" é vocabulário do domínio; bloquear a expressão sozinha era o erro que a [Q10](open-questions.md) mandou não copiar. Regras ganharam severidade: bloqueia com verbo imperativo junto, anota a menção isolada | `scan.ts` · [Q42](open-questions.md) |
| **E26** | **`--path` do `decisions` não filtrava nada.** O `where` vinha depois do `orderBy`/`limit`, então sobrava o topo global recortado. Uma superfície de CLI inteira sem teste | `gate.ts` |
| **E27** | **Um `commit` que falha depois do `add` deixa o índice sujo**, e o commit seguinte varre a mudança junto. Apareceu ao escrever o teste da chave de idempotência, que precisava de um `commit: null` sem mover o histórico do arquivo | anotado em **P6** |

---

### T1 — O scan determinístico

Três categorias bloqueiam — **segredo**, **prompt injection**, **Unicode invisível** (este **limpa**,
não rejeita) — e uma anota: **tempo relativo**.

- As regras do Compozy que matam memória legítima ficam **de fora**, com teste provando que passam:
  bloco de código, caminho de repositório, a palavra "cron"
- O motivo **nunca repete o conteúdo escaneado** — senão o log vira o vazamento que o scan existe
  para evitar
- Severidade por regra: o que mata memória legítima entra como anotação, nunca como bloqueio
  ([Q42](open-questions.md))

**Done when:** as formas de credencial que se cola hoje são recusadas; prosa legítima sobre este
próprio projeto passa; e segredo escondido atrás de invisível ainda é pego.

---

### T2 — O portão único

Toda escrita passa por um lugar só, na ordem do [§7 do PRD](prd.md).

- `decide` é **puro**: decidir sem banco, persistir em transação
- Duplicata por **assinatura semântica**, não por bytes ([Q40](open-questions.md))
- Identidade `(tipo, slug)` decide entre `add` e `update`
- Decisão persistida **antes** de tocar o arquivo

**Done when:** escrever duas vezes o mesmo conteúdo é `noop` e não produz commit vazio; e a decisão
existe no WAL antes de o disco mudar.

---

### T3 — O WAL magro (Q37)

Com o `~/.lumem` versionado, o conteúdo anterior é o commit anterior. O WAL guarda a **decisão**.

- Origem, sessão, regra que bateu, confiança, idempotência, e o SHA que a decisão produziu
- **Rejeição e no-op vivem só aqui** — não viram arquivo, não viram commit
- Nada de `prior_content`: manter os dois seria manter dois históricos do mesmo texto

**Done when:** uma escrita rejeitada não existe no disco nem no git, e existe no WAL com o motivo —
sem o conteúdo escaneado.

---

### T4 — `revert`

Volta pelo git e grava uma **decisão nova**, sem reescrever histórico.

- O conteúdo restaurado **também passa pelo portão**: ele pode ter sido editado à mão, ou escrito
  antes de o portão existir
- Desfazer a criação é apagar — era ela que não existia antes
- Apagar é decisão: `forget` e o ramo de deleção registram `delete` no WAL antes de mexer no disco

**Done when:** um `revert` volta o conteúdo, grava decisão nova e deixa o catálogo com o restaurado;
e reverter para um commit que contém segredo é recusado sem tocar o disco.

---

### T5 — A superfície: `forget`, `revert`, `decisions`

Os três comandos na CLI, sobre o mesmo núcleo — a paridade com MCP continua sendo a PR 03.

**Done when:** `decisions --path` mostra só o caminho pedido, e uma rejeição aparece ali com a regra
que bateu e sem o conteúdo.

## PR 03 — `wm/03-superficies` (entregue)

`lumem-memory` como núcleo com superfícies: CLI e **router tRPC** sobre as mesmas funções, o mesmo
contrato de erro e o **mesmo schema de entrada**. Shadow por identidade entre escopos. O **funil
cross-projeto nasce aqui, desligado**, com registro de acesso.

**Done when:** o mesmo pedido responde igual nas duas superfícies; memória de projeto sombreia a de
workspace e o sombreamento vira evento.

### O que a execução achou

| # | O quê | Onde ficou |
|---|---|---|
| **E1** | **A segunda superfície virou router tRPC, e não MCP.** O escopo escrito era "CLI e MCP"; o daemon já fala tRPC para toda a UI, e o cliente que precisa da memória agora é a tela da PR 05 — não um agente externo. O MCP continua no plano como **terceira** superfície, e o teste de paridade que existe agora é o que impede ela de virar uma terceira semântica | `routers/memory.ts`; o MCP volta como escopo da PR 05 ou depois dela |
| **E2** | **`list` não queria dizer a mesma coisa nas duas superfícies.** O router respondia o resolvido por shadow, a CLI respondia o catálogo cru — o que quebra o próprio `Done when` desta PR. As duas agora respondem o resolvido; a lista crua é `--all`, porque inspecionar o disco é outra pergunta | `cli.ts`, com teste nas duas superfícies |
| **E3** | **Os limites de escrita moravam só no zod do router.** A CLI passava `--scope`/`--actor` com cast e o núcleo aceitava o que a API recusava. O schema mudou para dentro do `MemoryService`: o router o usa como `input`, e a CLI valida os dois enums pelas mesmas listas antes de montar o pedido — ela precisa do valor **tipado** para chamar `read`/`forget` — e o núcleo revalida tudo de qualquer jeito | `MemoryService.writeMemorySchema`, `cli.asScope`/`asActor` |
| **E4** | **A Q27 não tinha nada que a aplicasse.** `contract`/`domain`/`process` de agente em escopo de workspace gravavam direto, quando a decisão manda virar proposta. Enquanto a inbox da PR 05 não existe, é **recusa com motivo** — fail-closed, o mesmo princípio da D8 —, e a recusa passa pelo portão, então fica no WAL | `entry.proposalRefusal`, `gate.refusal` |
| **E5** | **`revert` aceitava qualquer caminho do `~/.lumem`.** O git barra `../`; ele não barra `.gitignore`, e `revert` é `rm` + commit. A contenção é por **forma** de caminho de memória, e não por presença no catálogo — desfazer um `forget` é justamente pedir um caminho que o catálogo já não tem | `paths.assertEntryPath` |
| **E6** | **A capacidade da D8, ligada, não era funil.** Ela liberava qualquer projeto e qualquer caminho. As outras duas exigências da decisão entraram junto: o alvo tem que ser projeto **do mesmo workspace** (a lista sai do banco, não de uma allowlist paralela) e o caminho passa pelo `resolveInsideRoot` da `file-editor`, reusado | `access.evaluate` |
| **E7** | **"Livre" (Q26) não é "sem registro".** O funil existia sem nenhum chamador de produção, então a tabela nascia e ficava vazia. Toda leitura do router — `read` e `list` — atravessa o funil e fica registrada | `routers/memory.ts` |

Uma coisa **em aberto**, e é de escopo de sessão: `workspaceId`, `projectId` **e `actor`** vêm do
**cliente**, porque a sessão ainda não carrega escopo nem identidade — isso é da `acp-sessions`.
Enquanto vêm, três consequências, ditas em voz alta:

- o filtro do shadow não é fronteira; o que existe é o **registro** de cada leitura, com quem pediu e
  de onde;
- o `actor` é o discriminador do fail-closed da Q27 e tem default `human`, então na fronteira a regra
  é honor-system — ela vale contra agente que se declara, não contra cliente que mente. Os dois
  clientes de hoje são você;
- por isso os ids passaram a ter **charset fechado** (`paths.ts`): eles viram segmento de caminho, e
  caminho vira pathspec de git.

Quando a sessão passar a carregar workspace, projeto e identidade, esses três campos saem do input.

### O que o review do rework achou

O primeiro rework fechou os onze achados do review humano; o `lumem-reviewer` achou mais seis em cima
dele, dois deles bloqueantes.

| # | O quê | Onde ficou |
|---|---|---|
| **E8** | **A guarda de forma do `revert` aceitava glob, e o git da memória não era literal.** Com `[^/]+` no slot do id, `workspaces/<asterisco>/memory/user_a.md` passava — e pathspec com glob casa memória de **outro** workspace: o ramo de deleção respondia `deleted` sem apagar nada e o `git add --all` levava a edição pendente do vizinho. É a armadilha de [testing.md](../../project/testing.md) reaberta num caminho que agora recebe string do cliente. Charset fechado nos ids **e** `--literal-pathspecs` em todo comando git da memória | `paths.ts`, `repo.ts`, `MemoryService.git` |
| **E9** | **A Q27 estava pinada por uma célula da matriz.** `PROPOSAL_TYPES = ["contract"]` ou `actor !== "agent"` mantinham a suíte verde — e a segunda abriria escrita direta de workspace para `distiller`, `auto_research` e `import`, que são justamente os atores que o §7 do context-delivery cobre com "proposta sempre". Teste table-driven sobre tipo × ator × escopo | `entry.test.ts` |
| **E10** | **A Q27 valia só por escopo, e a decisão escrita é por tipo.** Um agente contornava pedindo `scope: "project"` explícito para um `contract`. Agora vale a **união dos dois eixos**, e a precisão ficou registrada na própria Q27 | `entry.proposalRefusal`, [Q27](open-questions.md) |
| **E11** | **O funil descartava o `insideGit` da guarda de caminho.** Ligada a capacidade, `.git/config` do vizinho — que costuma carregar URL de remote com token — era leitura permitida. A `file-editor` deixa `.git` legível porque ali é o seu projeto na sua tela (right-panel Q2); aqui é outro projeto, lido por um agente | `access.evaluate` |
| **E12** | **A escrita de agente fechou e a deleção ficou aberta.** `forget` passou a aceitar `actor` e o ignorava: o commit saía no `git log` do `~/.lumem` com a sua assinatura. A [Q29](open-questions.md) diz que apagar é sempre ação sua, então quem não é humano é recusado no núcleo | `MemoryService.forget` |
| **E13** | **O `revert` que apaga não gravava decisão.** O `Done when` da PR 02 é "volta o conteúdo e grava uma decisão nova", e o único `revert` fora do WAL era o que mais muda o acervo (pré-existente da PR 02) | `MemoryService.revert` |

E o registro do funil virou pergunta em vez de suposição: `list` grava uma linha por chamada, a tela da
PR 05 é um chamador de `list` com refetch, e ninguém decidiu poda nem índice — é a
[Q44](open-questions.md), aberta. O eixo de operação do funil ("sempre leitura, nunca escrita" como
tipo, e não como ausência de chamador) foi para o [backlog](../../project/backlog.md).

## PR 04 — `wm/04-recall` (escopo, sem tasks)

FTS5 reconstruível, busca lexical explicável, sinal de uso (`recall_count`, `last_recalled_at`,
score), e a instrumentação do [§6 do context-delivery](context-delivery.md).

**Done when:** buscar acha, diz por que achou, o contador sobe, e os números de custo são
consultáveis.

Duas portas, de propósito: `search` é leitura e **não** registra (refetch do cliente não pode inflar
o contador), e `recall` — a mutation, e a CLI com `--session` — é o caminho do agente, que registra.
Os números do ranking e o lugar do índice FTS5 ficaram na
[Q45](open-questions.md#x-q45--como-o-recall-combina-os-sinais-e-onde-vive-o-índice-lm).

## PR 05 — `wm/05-inbox-ui` (escopo, sem tasks)

Inbox de propostas (incluindo o núcleo destilado da D1), vista por escopo com o que sombreia o quê,
linha do tempo com desfazer, e os números na tela.

**Done when:** uma proposta é aprovada, editada ou rejeitada pela UI, e o `git log` mostra o
resultado.

## PR 06 — Injeção: o núcleo chega no agente

**Depende de:** ACP (existe) + PR 01 (existe). **Branch:** direto em `main`, porque a pilha acabou.

**Por que ela é a próxima.** Tudo que as PRs 01–05 construíram é uma biblioteca que ninguém chama: o
agente não sabe que a memória existe. Esta é a PR em que ela passa a mudar comportamento — e é o
único ponto da feature em que o custo é **recorrente**, cobrado em todo turno de toda sessão.

**As decisões que a governam**, todas já fechadas em [context-delivery](context-delivery.md):
o núcleo é **comportamental e só** (§4.1: *"isto muda o que o agente faz"* entra, *"isto explica como
algo funciona"* não), vai **só no primeiro `session/prompt`** (D2), **sem teto** — marca d'água e
alarme (D5) —, e a superfície que o agente usa é a **CLI** (D4), que já existe e funciona também no
caminho degradado do PTY.

---

#### N1: `pinned` é frontmatter, não coluna inventada

**What**: Marcar uma memória como parte do núcleo, no Markdown.
**Where**: `memory/entry.ts`, `db/schema.ts`, migração, `memory/catalog.ts`, `MemoryService`

**Done when**:
- [x] `pinned: boolean` no frontmatter, default `false` — Markdown é a fonte, a coluna é projeção
- [x] `reindex` reconstrói o campo a partir do arquivo, como faz com o resto
- [x] Uma memória editada à mão com `pinned: true` entra no núcleo sem passar por API nenhuma
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): marcar uma memória como parte do núcleo`

---

#### N2: O núcleo montado, com a marca d'água

**What**: `MemoryService.core()` — as memórias fixadas da cadeia de escopo, e o que elas custam.
**Where**: `memory/core.ts` + teste, `MemoryService`

**Done when**:
- [x] Ordem geral → específico: global, workspace, projeto. Diretriz específica refina a genérica, e
      quem lê por último decide
- [x] Só `pinned`. Uma memória não fixada **não** entra, por mais curta que seja
- [x] Precedência respeitada: memória sombreada não entra no núcleo — ela perdeu
- [x] A marca d'água vem junto: caracteres, contagem de entradas, e o custo de cada uma
- [x] **Sem teto** (D5): estourar não corta nada, e a medida é o que existe
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): montar o núcleo, e medir o que ele custa`

---

#### N3: A skill que ensina a perguntar — e a porta que ela ensina

**What**: O texto fixo que ensina a estrutura da memória e como chamar o serviço.
**Where**: `memory/skill.ts`, `memory/http.ts`, `memory/scope-of-session.ts`, `server.ts` + testes

**A superfície mudou de CLI para HTTP, e o motivo importa.** A D4 diz *"não me importa o formato"*,
e a CLI existe — mas ela depende de saber **onde o daemon foi instalado**, e a sessão não sabe: o
binário é TypeScript rodado por `tsx` dentro do monorepo. `curl` funciona de qualquer `cwd`, sem
instalar nada, e o agente já tem shell. Fora do `/trpc` porque uma chamada tRPC pede o envelope
`?input={...}` codificado, e o que entra no prompt tem que ser copiável sem raciocínio.

**Done when**:
- [x] Fixo: **não** cresce com o acervo. É a diferença central do redesenho (§4)
- [x] Ensina a **perguntar**, não diz o que existe (§5.1) — a lista de memórias nunca entra no prompt
- [x] Carrega um **mapa**: os projetos do workspace. Cresce com o workspace, nunca com o acervo
- [x] Cita os sete tipos e os três escopos, porque é o vocabulário das respostas
- [x] `MEMORY_DIRECTIVE`: as três linhas de comportamento que vão no **núcleo** — o item 2 do §5.1,
      o único não-opcional, porque descoberta que depende de a skill ser lida é recursiva
- [x] `GET /memory/ask?q=&session=` responde em texto puro, **citando a fonte** (§5.5)
- [x] A sessão dá o escopo e registra o uso — é o número que o §6 chama de mais importante
- [x] "não sei" é resposta, e diz que o acervo tem buraco ali
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): a skill que ensina o agente a perguntar`

---

#### N4: A injeção, no primeiro turno e só nele

**What**: O núcleo e a skill entram no primeiro `session/prompt` da sessão.
**Where**: `acp/AcpManager.ts`, `sessions/SessionStore.ts` + testes

**Done when**:
- [x] Só no **primeiro** prompt (D2): cache preservado, prompt estável
- [x] Bloco separado, antes da mensagem da pessoa — o texto dela vai verbatim, como sempre foi
- [x] **Visível**: um evento na conversa diz que o núcleo entrou e quanto custou. Injeção invisível é
      a coisa que o §12 do PRD proíbe por nome
- [x] Sessão sem memória nenhuma não injeta bloco vazio
- [x] O escopo da sessão decide a cadeia: worktree herda o projeto dela
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(acp): o núcleo da memória entra no primeiro turno`

---

#### N5: Fixar pela tela, e ver o que custa

**What**: Pin/unpin no painel, e a marca d'água na aba de números.
**Where**: `components/MemoryPanel.tsx`, `memory.css`, `routers/memory.ts`, `hooks/useMemory.ts` + testes

**O desenho foi feito no Open Design, como manda a regra.** O `lumem-memory.html` do S2 era o único
protótipo que vivia **só** neste repositório — anterior à regra de 2026-08-19. Ele foi levado para o
projeto do Open Design (com `lumem-memory.css` separado, como todas as outras telas), o "fixar no
núcleo" e a marca d'água foram desenhados lá, e o `design:sync` trouxe de volta. O `--check` agora
diz "21 arquivos, nada mudou".

**Done when**:
- [x] Fixar e desfixar da própria entrada, com o custo dela ao lado (D1: *"deve ter UI para tudo isso"*)
- [x] A aba de números mostra o tamanho do núcleo e quantas entradas ele tem
- [x] Fixar é gesto **seu**: ator não-humano não fixa
- [x] A auditoria de porte do CSS, nas duas direções — e ela achou dois defeitos reais que o jsdom
      não vê: o `<ol>` da linha do tempo sem regra (marcador do navegador à vista) e `.mem-group`
      pedida sem pintura nenhuma
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): fixar memória no núcleo, e ver a marca d'água`

---

#### N6: O e2e que prova que o agente recebeu

**What**: Uma sessão real, e o núcleo no primeiro turno.
**Where**: `e2e/memory-injection.spec.ts`, `e2e/support/fake-acp-agent.mjs`

**Done when**:
- [x] O agente falso **repete o que recebeu**, e o spec lê o núcleo lá — é a única prova de que a
      injeção atravessou o protocolo
- [x] O segundo turno **não** leva o núcleo de novo
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): o agente recebe o núcleo, e só uma vez`

---

### O que a 06 decidiu enquanto executava

| # | O quê | Onde |
|---|---|---|
| **N1** | **A superfície do agente virou HTTP, não a CLI.** A D4 diz "não me importa o formato", e a CLI existe — mas ela é TypeScript rodado por `tsx` dentro do monorepo, e a sessão não sabe onde o daemon foi instalado. `curl` funciona de qualquer `cwd`, sem instalar nada. Fora do `/trpc` porque o envelope `?input={...}` codificado não é copiável sem raciocínio, e o que entra no prompt tem que ser | `memory/http.ts` |
| **N2** | **O aviso de frescor do §8 mudou de lugar.** Ele foi desenhado quando a injeção carregava **fatos**; o núcleo carrega diretriz, e *"escreva commit em inglês (verifique antes de afirmar como fato)"* é ruído. Fato é o que o `/memory/ask` serve, e é lá que o aviso significa algo | `memory/http.ts` |
| **N3** | **O "snapshot congelado" do §8 saiu de graça, e o congelamento é no primeiro turno, não no `session/new`.** É melhor assim: fixar uma memória vale para a próxima coisa que você pedir, e não só para a próxima sessão | `AcpManager.prompt` |
| **N4** | **`pinned` não entra na `entrySignature`.** Fixar é curadoria, não conteúdo — e sem isso a próxima reescrita do texto gravaria o default `false` e desfixaria em silêncio uma memória escolhida à mão | `MemoryService.write` |
| **N5** | **A variação da marca d'água é a data de nascimento, não uma série.** A D5 pede `+38% em 30 dias`; ninguém registrou série histórica, então o que existe é "quanto do núcleo nasceu nos últimos 30 dias". Responde a pergunta que importa sem inventar curva | `memory/core.ts` |
| **N6** | **O desenho da memória entrou no Open Design.** O `lumem-memory.html` do S2 era o único protótipo que vivia **só** neste repositório, anterior à regra de 2026-08-19. Foi levado para lá com `lumem-memory.css` separado, o "fixar no núcleo" e a marca d'água foram desenhados no Open Design, e o `design:sync --check` volta a dizer que nada divergiu | `prototype/lumem-memory.*` |
| **N7** | **A auditoria de porte do CSS nasceu nesta PR e achou dois defeitos.** O `<ol>` da linha do tempo sem regra nenhuma (marcador do navegador à vista) e `.mem-group` pedida sem pintura. Os dois são invisíveis para o jsdom, que mede tudo como zero | `memory-css.test.ts` |
| **N8** | **O alarme da marca d'água ficou em 4.000 caracteres**, e ele **avisa** — não corta, não recusa. A referência é o teto do Hermes (2.200) mais a folga que o §6 autoriza depois de o spike mostrar que o piso de uma sessão é ~39k tokens, e não nosso | `MemoryPanel` |

---

## PR 07 — Captura: o sistema aprende sozinho, e passa por você

**Depende de:** PR 06 (existe) + o portão da 02 (existe). **Branch:** direto em `main`.

**Por que ela vem agora.** A 06 fez a memória **chegar**. Esta faz ela **crescer** sem você digitar —
e é a primeira parte da feature em que o sistema escreve por conta própria. Ela só é segura porque o
portão (02), a proveniência (01) e a inbox (05) já existem: destilação de agente em escopo de
workspace **já** vira proposta pela Q27, sem uma linha nova.

**O que o §10 do PRD manda, e que decide o desenho:** *"uma chamada por sessão, não por turno"*,
*"sobre uma projeção limitada"*, *"desligado por padrão até o portão provar que segura"*, *"só a
sessão raiz alimenta a memória automaticamente"* (Q21), e *"instrumentado desde o primeiro dia"*
(Q20). E a lista do **que nunca é capturado**: segredo, estado efêmero, histórico do git, estrutura
derivável do repositório, e **dump de transcript**.

---

#### C1: A projeção — o que a sessão fez, sem o que ela disse

**What**: Da transcrição para uma estrutura pequena: arquivos tocados, comandos, custo, fim de turno.
**Where**: `memory/projection.ts` + teste

**Done when**:
- [x] Nada de prosa: mensagem da pessoa e texto do agente **não** entram. Dump de transcript é o item
      nomeado no §10 como coisa que nunca é capturada
- [x] Vem dos três eventos que o roadmap nomeia: `tool_call` (o que tocou), `usage_update` (o que
      custou), `turn_end` (quantos turnos, e como terminaram)
- [x] Teto duro: N arquivos e N comandos, os mais frequentes. Projeção que cresce com a sessão é a
      destilação ficando cara sem ninguém decidir
- [x] Caminho fica **relativo ao checkout** — caminho absoluto carrega o nome da máquina e da pessoa
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): a projeção de uma sessão, sem uma linha de prosa`

---

#### C2: A destilação, desligada por padrão

**What**: Da projeção para candidatos de memória, com um agente barato — uma chamada por sessão.
**Where**: `memory/distiller.ts` + teste, `config.ts`

**Done when**:
- [x] **Desligada por padrão** (§10). Ligar é `LUMEM_MEMORY_DISTILL=1`, e o estado aparece na tela
- [x] Uma chamada por **sessão**, nunca por turno
- [x] O candidato sai estruturado — tipo, nome, descrição, corpo, evidência — ou é descartado. Texto
      livre viraria memória que ninguém consegue indexar
- [x] Ator `distiller`: a Q27 então manda `domain`/`process`/`contract` em workspace para a inbox, e é
      exatamente o que se quer. Nada de caminho novo de escrita
- [x] Projeção vazia não chama agente nenhum: sessão que não fez nada não tem o que ensinar
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): destilar uma sessão em candidatos, sob revisão`

---

#### C3: Ligada no fim da sessão, e só na raiz

**What**: O gatilho, no mesmo lugar em que os sinais de saída já são gravados.
**Where**: `sessions/SessionStore.ts`, `bootstrap.ts` + testes

**Done when**:
- [x] Roda quando a sessão de **agente** morre, junto dos sinais de saída da S1
- [x] Falha da destilação **não** quebra a saída da sessão: exit é fato, destilação é opinião
- [x] Só sessão raiz (Q21): sessão retomada não redestila a conversa que já foi destilada
- [x] ~~Sessão morta cedo (`session_killed_early`) não destila~~ — **saiu.** Quem sabe se a sessão fez
      algo é a **projeção**, não o relógio: sessão que edita um arquivo e é fechada em vinte segundos
      fez trabalho, e sessão aberta a tarde toda conversando não fez nenhum. O sinal continua
      existindo (S1) como insumo para ponderar depois, não como motivo para não olhar
- [x] Instrumentada (Q20): quantos candidatos, quantos passaram o portão, e o que custou
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(sessions): destilar no fim da sessão, sem atrapalhar a saída`

---

#### C4: O e2e que prova que a inbox recebeu

**What**: Uma sessão real que termina, e a proposta na tela.
**Where**: `e2e/memory-distill.spec.ts`, `e2e/support/fake-acp-agent.mjs`

**Done when**:
- [x] O agente falso responde à destilação com um candidato, e o spec o encontra na inbox
- [x] Aprovar transforma em memória — o caminho todo, do turno ao acervo. **Pela API, e não pela
      tela**: a destilação vem desligada, e ligar no daemon compartilhado faria toda sessão de agente
      de todo spec produzir uma proposta, quebrando os specs que asseguram o conteúdo da inbox. A
      aprovação pela tela é o segundo spec do `memory.spec.ts`, que é onde há navegador apontado
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a sessão termina, e o que ela ensinou espera revisão`

---

### O que a 07 decidiu enquanto executava

| # | O quê | Onde |
|---|---|---|
| **D1** | **A guarda por tempo de vida saiu.** Ela pulava a sessão morta em segundos, e estava errada: quem sabe se a sessão fez algo é a **projeção**, não o relógio. O e2e foi quem cobrou — uma sessão de teste vive segundos e faz trabalho de verdade | `memory/capture.ts` |
| **D2** | **A sessão de destilação não tem linha no banco**, e é isso que a mantém invisível: não aparece em aba, não é reconciliada no boot, e **não recebe o núcleo da memória** — o preâmbulo passou a recusar sessão que o daemon não registrou. Injetar diretriz numa destilação seria pedir que ela obedecesse regras sobre um trabalho que não está fazendo | `memory/preamble.ts` |
| **D3** | **A destilação não escolhe escopo.** O escopo vem do tipo e do escopo da sessão; deixar o agente escolher seria deixá-lo escolher se passa pela sua revisão | `memory/capture.ts` |
| **D4** | **A aba de números não some mais quando não há uso.** Ela retornava um estado vazio, e isso passou a esconder a marca d'água e o estado da destilação junto. Zero é um número | `MemoryPanel` |
| **D5** | **`distill` entrou no `memory_usage` como `kind` próprio** — quantos candidatos, quanto tempo, e também quando não achou nada. É a instrumentação que a Q20 pede desde o primeiro dia, e é o número que decide se isto vale o que custa | `recall.usage` |

---

## PR 09 — Playbooks: o procedimento, com ciclo de vida por uso

**Depende de:** PR 03 (existe) + ACP (existe). **Branch:** direto em `main`.

**Playbook não é memória, e o §6 do PRD diz isso por escrito** — *"separado da tabela porque não é
memória"*. Memória é fato ou diretriz; playbook é **procedimento**: tem corpo, é carregado sob
demanda, e envelhece por uso. Então ele tem tabela, diretório e ciclo de vida próprios — e reusa do
resto o que é infraestrutura: o portão (scan + WAL), o commit no `~/.lumem`, e o `~/.lumem` como
fonte única.

**O que o §9 manda:** nomeado por **classe de tarefa** e nunca por artefato de sessão; ordem de
preferência fechada na escrita; telemetria de carregamento; ciclo `active → stale → archived`
derivado do uso, com **nada arquivado automaticamente** — vira sugestão na revisão; `pinned` como
opt-out ortogonal; e (Q14) **fonte única no Lumem, projeção por CLI**.

---

#### P1: O playbook no disco, e no catálogo

**What**: `PLAYBOOK.md` por escopo, com tabela derivada — a mesma divisão de trabalho da memória.
**Where**: `memory/playbook.ts`, `memory/paths.ts`, `db/schema.ts`, migração + testes

**Done when**:
- [x] Arquivo em `<escopo>/playbooks/<slug>/PLAYBOOK.md`. Diretório por playbook desde já, porque o
      `references/` do §9 vai morar ao lado — e mudar o caminho depois é migrar disco de gente
- [x] Nomeado por **classe de tarefa**: o campo existe, e a validação recusa nome que é artefato de
      sessão (`#123`, `PR 412`)
- [x] Passa pelo **mesmo portão** da memória: scan de segredo, decisão no WAL, commit no `~/.lumem`
- [x] Escopo `project` ou `workspace`, nunca `global`: procedimento é de um repositório ou de um time
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): o playbook, com corpo e ciclo de vida próprios`

---

#### P2: O ciclo de vida, derivado do uso

**What**: `active → stale → archived`, com nada acontecendo sozinho.
**Where**: `memory/playbook.ts` + teste

**Done when**:
- [x] `stale` é **derivado**, não gravado: dias sem carregamento. Estado calculado não desatualiza
- [x] `archived` só por gesto seu. *"Nada é arquivado automaticamente"* (§9) — a subcontagem da
      telemetria (Q16) é a razão, e ela não tem cura
- [x] Arquivar **não apaga**, e carregar reativa: o arquivo continua no disco e no git
- [x] `pinned` é opt-out ortogonal — playbook fixado não envelhece, porque envelhecer é o que
      acontece com o que ninguém escolheu
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): o ciclo de vida do playbook, sem arquivar nada sozinho`

---

#### P3: A telemetria que vem do protocolo

**What**: O carregamento chega como `tool_call` de Skill (Q16), e vira contagem.
**Where**: `memory/playbook-telemetry.ts`, `acp/AcpManager.ts` ou o ouvinte + testes

**Done when**:
- [x] Um `tool_call` cujo alvo é um playbook conhecido incrementa carregamento e data
- [x] Reconhecimento por **slug**, e conservador: nome parecido não conta. Subcontar é o preço aceito;
      superconter faria a sugestão de arquivar mentir na direção que não se percebe
- [x] A contagem não atrapalha o turno: falha dela é aviso
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(acp): contar o carregamento de playbook pelo que o protocolo diz`

---

#### P4: A projeção por CLI (Q14)

**What**: O Lumem é a fonte; a CLI é como cada agente lê.
**Where**: `memory/cli.ts` + teste

**Done when**:
- [x] `playbook list` e `playbook show` — a fonte única projetada em texto
- [x] `playbook show` **conta como carregamento**: é o caminho do agente, e é o mesmo princípio do
      `search --session`
- [x] A ordem de preferência da escrita (§9) aparece no `--help`: é regra de comportamento, e o lugar
      dela é onde quem vai escrever está olhando
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): projetar playbook pela CLI, que é como o agente lê`

---

#### P5: Na tela, com a sugestão de arquivar

**What**: Uma aba de playbooks, com uso e ciclo de vida.
**Where**: `routers/memory.ts`, `components/MemoryPanel.tsx`, `memory.css` + testes

**Done when**:
- [x] Lista com classe de tarefa, carregamentos, último uso e estado
- [x] O parado há muito tempo **sugere** arquivar; arquivar é botão seu
- [x] Arquivado continua visível, atrás de um filtro — arquivar não é apagar
- [x] Só `var(--token)`, e a auditoria de porte do CSS cobre as classes novas
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba de playbooks, com a sugestão de arquivar`

---

#### P6: O e2e do ciclo

**What**: Criar, ver o uso, arquivar pela tela, e continuar existindo.
**Where**: `e2e/playbooks.spec.ts`

**Done when**:
- [x] O ciclo inteiro num navegador, contra o daemon compartilhado
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): o ciclo de vida de um playbook, do uso ao arquivo`

---

### O que a 09 decidiu enquanto executava

| # | O quê | Onde |
|---|---|---|
| **E1** | **Playbook ganhou tabela e diretório próprios, e não um tipo de memória.** O §6 do PRD já dizia *"separado da tabela porque não é memória"*, e a implementação confirmou por que: memória precisa de precedência entre escopos e não envelhece; playbook envelhece e não precisa de precedência. Um tipo só compartilharia o nome | `db/schema.ts` |
| **E2** | **A telemetria ficou no banco, e não em sidecar no disco** como o §9 propunha. Dois arquivos por playbook, um versionado e outro mudando a cada carregamento, produziriam **commit a cada uso** — e o `~/.lumem` é um repositório git | `playbook` |
| **E3** | **O reconhecimento de carregamento é exato, e as duas versões por substring foram derrubadas por teste.** A primeira contava um `Read` do próprio arquivo, porque o caminho contém a palavra "playbook"; a segunda fazia slug curto engolir vizinho (`revisar` dentro de `revisar-pr-grande`) | `playbook-telemetry.ts` |
| **E4** | **`AcpManager.watchEvents` nasceu aqui** — o irmão do `watchExits` e do `watchConfig`. O `onEvent` serve um cliente que abriu uma aba; contar carregamento é o daemon reagindo a qualquer sessão, e não havia como se inscrever nisso | `acp/AcpManager.ts` |
| **E5** | **`--color-border-warning` não existe, e não foi criado à mão.** Token novo nasce no Open Design: o chip de "parado" ficou com fundo e texto de aviso, sem borda própria | `lumem-memory.css` |
| **E6** | **`memory.writePlaybook` entrou por paridade.** A CLI escrevia e o router só lia — uma superfície que só sabe ler é uma superfície onde a mesma pergunta tem duas respostas | `routers/memory.ts` |
| **E7** | **O `references/` do §9 ficou de fora**, e o diretório por playbook está lá esperando por ele. Está no [backlog](../../project/backlog.md) com o gatilho: o primeiro playbook que precisar de anexo | — |

---

## PR 08 — Auto-learn: a pergunta sem resposta vira memória

**Depende de:** PR 03, PR 04 (existem) + a porta HTTP da 06. **Branch:** direto em `main`.

**A parte mais poderosa e a mais perigosa**, e o §5.2 do context-delivery diz por quê: uma pergunta
passa a **criar memória**, sem você pedir e sem ninguém revisar no momento. *"O agente pergunta, o
sistema inventa, a invenção vira memória, e a memória vira verdade permanente que outro projeto
herda."*

Então tudo aqui é contenção, e nada é negociável:

- **mesmo portão** (§7 do PRD): scan, identidade, WAL, git. Sem exceção de origem;
- **proveniência própria**: `source_actor: auto_research`, com **evidência** e confiança baixa;
- **critério de evidência** (D7): artefato verificável → memória direta com a evidência anexada;
  síntese → **proposta**. *"Se o agente consegue apontar de onde tirou, é fato; se ele conseguiu
  apenas concluir, é proposta"*;
- **workspace é proposta sempre** (Q27), com evidência ou sem;
- **orçamento, timeout, cache por sessão, profundidade 1** (§5.4) — e **degradação que diz que
  degradou**, nunca sessão travada.

---

#### A1: O agente que pesquisa, com profundidade 1

**What**: A pergunta sem resposta sobe um agente barato, que devolve candidato com evidência.
**Where**: `memory/research.ts` + teste

**Done when**:
- [x] **Profundidade 1**: o agente de pesquisa **não** tem a skill de memória, e não pode perguntar
      ao `lumem-memory`. Sem isso existe loop, e o §5.4 nomeia
- [x] Timeout por pergunta: a sessão principal está esperando, e uma pergunta que sobe agente não pode
      demorar o que um agente demora
- [x] Devolve estruturado, com **evidência separada** do corpo: é ela que decide direto × proposta
- [x] Falha, timeout e resposta fora do formato **degradam** para o que já existia — a busca lexical —
      e o texto **diz** que degradou
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): a pergunta sem resposta sobe um agente, com profundidade 1`

---

#### A2: O critério de evidência (D7)

**What**: Artefato verificável vira memória; síntese vira proposta.
**Where**: `memory/evidence.ts` + teste

**Done when**:
- [x] Aceita como evidência o que se pode **conferir**: caminho com linha, comando com saída
- [x] Recusa o que é conclusão — *"eu concluí"*, *"provavelmente"*, texto sem referência
- [x] Escopo de workspace é proposta **sempre**, tenha evidência ou não
- [x] Confiança baixa por padrão, e a memória nasce **marcada como não verificada**
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): o critério que separa fato de conclusão`

---

#### A3: Ligado no `/memory/ask`, com cache e orçamento

**What**: "não sei" deixa de ser o fim da resposta.
**Where**: `memory/http.ts`, `config.ts` + testes

**Done when**:
- [x] Só quando a busca **não acha nada**: auto-learn é o que cobre o buraco, não o caminho normal
- [x] **Cache por sessão**: a mesma pergunta duas vezes não sobe agente duas vezes (§5.4)
- [x] Orçamento por sessão: passou do limite, responde "não sei" e diz que o orçamento acabou
- [x] **Desligado por padrão**, como a destilação, e visível na tela
- [x] A resposta cita a fonte e diz que ela é nova e não verificada (§5.5)
- [x] Instrumentado: quantas subiram agente, quantas viraram memória, quantas viraram proposta
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(memory): auto-learn atrás de cache, orçamento e um interruptor`

---

#### A4: O e2e do buraco preenchido

**What**: Perguntar o que não existe, e a memória nascer marcada.
**Where**: `e2e/memory-auto-learn.spec.ts`

**Done when**:
- [ ] Um daemon com auto-learn ligado, uma pergunta sem resposta, e a memória com evidência
- [ ] A mesma pergunta de novo não sobe agente de novo
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a pergunta sem resposta preenche o próprio buraco`

---

## S1 — `wm/s1-sinais-de-acao`

**O que entrega:** o registro cru dos quatro sinais que não dependem de cooperação. Nada aqui
interpreta: a [Q17](open-questions.md) fechou em "sinal cru primeiro, leitura depois", e heurística
escrita antes do dado é opinião com cara de medida.

**Done when (da PR inteira):** os quatro eventos ficam registrados com alvo, escopo e horário por
quem já os observa hoje, e dá para listá-los por tipo.

**Gate:** `full` antes de abrir PR; `quick` durante.

### T1 — A tabela e as duas regras que ela cobra

`action_signal`, com os quatro tipos fechados por `CHECK` e a privacidade da
[Q18](open-questions.md) dentro do schema.

- `CHECK` de `kind` fecha a lista dos quatro
- **Não existe coluna de conteúdo** — e não bastava: `CHECK` de `typeof(detail) = 'integer'`, porque
  a afinidade INTEGER do SQLite guarda texto não numérico como TEXT
- `CHECK` de forma em `target`: até 1.024 caracteres, sem quebra de linha — identificador, não prosa

**Done when:** gravar frase em `detail` ou texto de várias linhas em `target` é recusado **pelo
banco**, com o tipo do TypeScript fora do caminho.

---

### T2 — Gravar, listar, e não repetir

`recordSignal`, `recordSignalOnce` e `listSignals`.

- Descarte de repetição por (`kind`, `target`, escopo) dentro de `SIGNAL_WINDOW_MS` (Q17.a)
- `windowMs: null` para o sinal que uma varredura reencontra: grava uma vez e nunca mais
- `tryRecordSignal` engole a falha com log — sinal nunca derruba a ação que o produziu
- `listSignals` corta no limite e devolve do mais recente para o mais antigo

**Done when:** três gravações seguidas do mesmo arquivo no mesmo escopo viram uma linha; o mesmo
arquivo em outro escopo vira duas; e `limit` com N+1 sinais devolve os N mais recentes, nessa ordem.

---

### T3 — `user_edited_after_agent`

O gancho no `files.write`, que é o único caminho de escrita que o daemon vê (Q17.b).

- Só grava quando há sessão de agente **`running` no mesmo escopo** — a tabela de sessões é a única
  fonte que sabe o escopo de cada processo
- Alvo é o caminho relativo; nada do texto entra
- Uma vez por janela, e sem poder virar `TRPCError`: um erro aqui viraria falha de gravação, e a
  retentativa do autosave cairia no diálogo de conflito de um arquivo salvo certo

**Done when:** gravar com agente vivo no escopo produz uma linha; gravar sem agente nenhum produz
zero; e uma rajada de autosave produz uma, não quatro.

---

### T4 — `worktree_discarded`

O gancho no `worktree.remove`, depois de o git ter sucedido.

- Alvo é o **id**, nunca o nome da branch — nome é frase que você digitou
- `detail` separa "terminei" (`0`) de "desisti" (`1`, quando foi preciso forçar)
- Remoção recusada não descartou nada, e não vira sinal

**Done when:** remover limpa grava `detail: 0`, remover com `force` grava `1`, e uma remoção
bloqueada por sujeira não grava nada.

---

### T5 — `session_killed_early`

O gancho na saída da sessão, dentro do `trackExits`.

- Só sessão de **agente**: um shell que viveu quatro segundos é um shell
- `KILLED_EARLY_SECONDS` fixo em 30, sem configuração (Q17.c) — e a fronteira é aberta: exatamente
  30 s **não** é sinal
- `detail` são os segundos de vida
- Roda depois do registro da saída e do evento, engolindo a própria falha

**Done when:** uma sessão de agente que morre no ato grava o sinal com o id da sessão e o escopo
dela; um shell igual não grava nada; e um erro no sinal não impede a linha de virar `exited`.

---

### T6 — `user_reverted_agent_commit`

O que **procura** em vez de instrumentar: `git.readLog` do checkout, no fim de cada sessão de agente
(Q17.d).

- O assunto (`Revert "..."`) é o portão, com âncoras, e **morre dentro da função**
- O alvo é o SHA que o corpo do commit nomeia (`This reverts commit ...`) — só SHA sai dali
- Reencontrar o mesmo revert na varredura seguinte não grava de novo
- Checkout que sumiu, ou que não é repositório, não derruba o registro da saída

**Done when:** um revert feito **na mão pelo git**, sem o Lumem no meio, vira um sinal com o SHA
desfeito; um commit que só fala sobre reverter não vira nada; e a segunda varredura do mesmo
histórico não grava linha nova.

## S2 — `wm/s2-prototipo` (escopo, sem tasks)

Protótipo HTML+CSS da inbox, da vista de memória e da linha do tempo, sobre os tokens que já existem,
seguindo a skill `ui-design-prototype`. Vive em `packages/web/prototype/lumem-memory.html`, com seis
telas: o escopo ativo, a inbox, o conflito no mesmo escopo, a linha do tempo, os números e os vazios.

### O que a renderização achou

| Achado | Correção |
|---|---|
| Nenhum token semântico escrito de memória existia — o prefixo real é `--color-*`. A tela saiu branca | Bloco de tokens colado do `tokens.css` gerado, sem edição |
| Escopo e tipo tinham o mesmo peso visual, e são perguntas diferentes | Escopo virou chip com cor de token; tipo, texto mono, porque é vocabulário fechado |
| Faltava o conflito no mesmo escopo ([Q31](open-questions.md)) — shadow não resolve | Tela 2b: as duas lado a lado, decisão sua, nada de merge |
| A memória sombreada recuava por `opacity`, que produz par de contraste que nenhuma checagem cobre — justo no texto que diz *quem* a sombreou | Recuo por token de texto verificado; `opacity` fora |
| O chip de `projeto` pegava emprestado `--color-scope-worktree`, e "você" não tinha token nenhum | `scope/global` entrou no `CONFIG` do gerador em `info/400` — a memória tem um nível acima do workspace que a árvore de arquivos não tem. Cada escopo usa o seu, e os três chips ganharam par de contraste sobre o fundo que usam de verdade |
| O botão do protótipo era um botão novo, e o terciário sem borda voltou a ler como texto | `.btn`/`.btn--primary`/`.btn--ghost` iguais aos de `src/ui/ui.css` |

**Done when:** renderiza, e as decisões de forma estão registradas. ✅
