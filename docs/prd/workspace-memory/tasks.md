# Memória de workspace — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Entrega de contexto:** [context-delivery.md](context-delivery.md)
**Roadmap:** [roadmap.md](roadmap.md) — este arquivo é a execução da pilha descrita lá
**Status:** **pilha completa** — 01 a 05, mais S1 e S2. Portão verde no topo: `gate:full` com
**1.123 unit/integration + 16 e2e**

---

## Como este arquivo é organizado

Uma seção por PR da pilha. A PR corrente é a única detalhada em tasks; as seguintes ficam com
escopo e `Done when`, e ganham tasks quando chegar a vez — porque task escrita cedo demais é task
escrita contra premissa que a implementação ainda vai derrubar.

| PR | Branch | Base | Estado |
|---|---|---|---|
| **01** | `wm/01-armazenamento` | guarda-chuva | **entregue** — 7 tasks, e o que a execução achou abaixo |
| **02** | `wm/02-portao` | 01 | **entregue** — scan, WAL magro, `revert` |
| **03** | `wm/03-superficies` | 02 | **entregue** — shadow, funil de acesso, router tRPC |
| **04** | `wm/04-recall` | 03 | **entregue** — FTS5 explicável, sinal de uso, instrumentação |
| **05** | `wm/05-inbox-ui` | 04 | **entregue** — propostas e a memória na tela |
| **S1** | `wm/s1-sinais-de-acao` | 01 | **entregue** — os quatro sinais de ação |
| **S2** | `wm/s2-prototipo` | 04 | **entregue** — protótipo verificado por renderização |

### O que cada PR deixou pronto

| PR | Módulos | Testes |
|---|---|---|
| 01 | `home.ts`, `entry.ts`, `paths.ts`, `repo.ts`, `project-identity.ts`, `catalog.ts`, `MemoryService`, `cli.ts` | 72 |
| 02 | `scan.ts`, `gate.ts` | +36 |
| 03 | `shadow.ts`, `access.ts`, `routers/memory.ts` | +22 |
| 04 | `recall.ts` (FTS5, sinal, instrumentação) | +16 |
| 05 | `proposals.ts`, `MemoryPanel.tsx`, `useMemory.ts`, `useScopeIds.ts` | +18 |
| S1 | `signals.ts` | +9 |

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
| **P1** | O `~/.lumem` versionado significa que memória apagada continua no histórico do git. É o comportamento desejado ([Q29](open-questions.md)), mas **segredo que passe pelo scan e seja commitado não sai mais** | aberta — o scan é da PR 02; até lá, a 01 não expõe escrita a agente |
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

## PR 02 — `wm/02-portao` (escopo, sem tasks)

O portão único de escrita: scan determinístico (segredo, injeção, Unicode invisível; anotação de tempo
relativo), identidade `(tipo, slug)`, duplicata por hash, **WAL magro** (decisão + SHA; rejeição e
no-op só ali), `revert`.

**Done when:** uma escrita com segredo é rejeitada, não chega ao disco, e a rejeição está no WAL com o
motivo — sem o conteúdo escaneado. Um `revert` volta o conteúdo e grava uma decisão nova.

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
