# Tarefa como entidade — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)

**Status:** em execução
**Histórico:** escrito em 2026-09-12, com as **10 perguntas respondidas** no mesmo dia. Duas delas —
a [T4](open-questions.md) e a [T8](open-questions.md) — mudaram de forma depois de uma rodada de
explicação, e as duas mudaram pelo mesmo motivo: a
[`028`](../028-autonomous-orchestration/prd.md) não existia quando foram escritas. **17 tasks em 5
fases**. As **fases 0, 1 e 2 estão entregues** (2026-09-12): o desenho terminou **apagando** uma peça em
vez de escrever duas, e o modelo achou uma migração que o `drizzle-kit` gerou errada — sem a linha
escrita à mão, apagar uma tarefa seria recusado em vez de anular o ponteiro da sessão.

A ordem tem duas regras, e as duas são do repositório:

1. **o que decide vem antes do que escreve.** A `022` tem **seis telas** no §8 e **nenhuma
   desenhada** — e o desenho aqui não é acabamento: a fila de Propostas mexe numa feature entregue.
   Por isso a fase 0 é o Open Design, e não a última;
2. **o daemon antes da tela.** Modelo e router com prova, sem nada na tela — e só então a tela, que é
   a parte mais barata de refazer.

> **Esta PRD saiu de proposta ao ganhar este arquivo** (regra 5 do `CLAUDE.md`: *PRD proposta ⇔ não
> tem `tasks.md`*). É o que dispara a **T1**: a nota da [T4](open-questions.md) cai na
> [`007`](../007-workspace-memory/prd.md), porque decisão contradita sem registro é decisão que volta
> sozinha.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `lumem-tasks.html/.css` (Open Design) | **novo.** A lista, o detalhe, *trabalhar nesta tarefa*, a proveniência, e a linha na primeira aba da worktree |
| `lumem-board.html` (Open Design) | **edição.** O quadro 7 já tem os três tipos da fila de Propostas — falta reconciliar com o `MemoryPanel` que existe hoje |
| `packages/server/src/db/schema.ts` | a tabela `task`, e `session.task_id` |
| `packages/server/src/routers/task.ts` | **novo.** `task.*`, com as transições por ator |
| `packages/server/src/routers/project.ts` | remover projeto leva as tarefas na **mesma transação** da WS-Q22 |
| `packages/server/src/routers/worktree.ts`, `session.ts` | um `taskId` opcional em `create` e `createAgent` |
| `packages/server/src/task/http.ts` | **novo.** `POST /tasks` e `POST /tasks/:id/review`, no molde do `memory/http.ts` |
| `packages/server/src/web/static.ts` | `DAEMON_PREFIXES` aprende `/tasks` |
| `packages/server/src/memory/skill.ts` | um parágrafo, com o custo em caracteres medido |
| `packages/web/src/components/WorkspacePanel.tsx` | a fila de Propostas no topo, e a seção de tarefas |
| `packages/web/src/components/MemoryPanel.tsx` | a aba `inbox` **sai** — a lista sobe para a fila |

**O que não muda** — cada um com uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| tarefa não é obrigatória para abrir sessão | [T1](open-questions.md). Conversa é conversa, e o PRD mede a proporção esperando que não seja 100% |
| `project_id` é obrigatório | [T2](open-questions.md): tornar nulo depois é uma migração de uma linha; o contrário não volta |
| sem prioridade, prazo ou estimativa | [T3](open-questions.md). O que existe é **ordem**, e `links` aponta para o gerenciador que tem esses campos |
| `done` é humano | [T9](open-questions.md), e a [`028`](../028-autonomous-orchestration/prd.md) **reafirma**: o caminho até lá muda, o último passo não |
| a linguagem da proposta | a da [`007`](../007-workspace-memory/prd.md), palavra por palavra — é por isso que os dois tipos cabem na mesma lista |
| "fila com lease" | fica no backlog. Esta PRD é atribuição manual, de propósito; a fila é a [`028`](../028-autonomous-orchestration/prd.md) |
| a Q068 e a Q069 | abertas de propósito (§5 do PRD). `review` é sugestão do agente, nunca `turn_end` |

**O que este arquivo não resolve, e é bom dizer antes:** a [`028`](../028-autonomous-orchestration/prd.md)
empilha em cima desta e **não** entra aqui. Nenhuma task abaixo cria coluna, esteira, agente nomeado
ou orçamento de execução. O que a `022` entrega é a **entidade** — sem ela a `028` não tem onde
aterrissar.

---

## Fase 0 — o que decide antes do que escreve

#### T1: A PRD sai de proposta, e a nota cai na `007`

**What**: `Status:` de `prd.md` e deste arquivo em `em execução`. A nota da [T4](open-questions.md) entra
no requisito da `007` que descreve a inbox de propostas — no requisito, com âncora para cá, e
**delimitando o que sobrou de pé**: a linguagem da proposta, a proveniência, a evidência e o portão de
escrita continuam inteiros; o que muda é **onde a lista mora**. Mais o índice, com as contagens
certas.
**Where**: `docs/features/022-workspace-tasks/prd.md`, `tasks.md`,
`docs/features/007-workspace-memory/prd.md`, `docs/README.md`
**Done when**: `pnpm docs:check` verde, e a `007` diz, no requisito, que a lista se mudou e para onde.
**Gate**: `pnpm docs:check`
**Status**: ✅ entregue em 2026-09-12, no mesmo commit que criou este arquivo — é o que *fez* a PRD
sair de proposta. A nota na `007` delimita o que sobrou de pé: origem, evidência, diff, os três verbos
e o portão de escrita continuam inteiros; só o endereço mudou

#### T2: `lumem-tasks.html` — as cinco telas que faltam

**What**: no Open Design, projeto `lumem-os`: a **lista** (seção no workspace e tela cheia, com a
ordem do §F1 e os filtros), o **detalhe** (corpo, sessões com estado, worktree, custo, memória
aprendida), **trabalhar nesta tarefa** (worktree nova **ou** checkout existente — [T5](open-questions.md) —
e o composer **pré-preenchido**, nunca enviado), a **proveniência** (quem criou, de qual sessão, o
selo de *proposta por agente*), e a **linha da tarefa na primeira aba da worktree**, ao lado de branch
e sujeira. Mais os dois estados que a casa cobra de toda tela: *o daemon não responde* e *isso morreu
enquanto você não olhava*.
**Where**: `lumem-tasks.html` + `lumem-tasks.css` (Open Design)
**Done when**: as cinco telas existem, medidas no navegador, sem literal de cor, espaço ou
tipografia; e o §8 do PRD vira o resumo do que foi desenhado, como o §10 da `028` fez.
**Gate**: nenhum — não toca código deste lado
**Status**: ✅ entregue em 2026-09-12 — **8 quadros**, e o §8 do PRD virou o resumo. Dois achados que
só apareceram renderizando: as quatro células de meta **precisavam de largura própria** (elásticas,
a metadata começava num x diferente a cada linha, e a coluna dançava justo onde se compara projeto
com projeto), e **examinar a linha na coluna de 880px do documento truncava um título que o produto
não trunca** — a bancada passou a ser os 1120px reais

#### T3: A fila de Propostas, reconciliada

**What**: a fila que a [T4](open-questions.md) decidiu já está desenhada no quadro 7 do
`lumem-board.html` da `028`, **com os três tipos**. Falta reconciliar com o que existe: a aba
`inbox` do `MemoryPanel` — rotulada **Propostas** — tem segmentado por estado (`pending`, resolvidas),
evidência e confiança. Esta task decide, com a tela na frente, **o que sobe junto com a lista** e o
que fica para trás, e desenha o resultado.
**Where**: `lumem-board.html` (Open Design), e o que sair dele
**Done when**: a fila tem os dois tipos, os verbos de cada um (tarefa escolhe **onde**; memória
escolhe **se o texto está certo**), o filtro de estado, e uma resposta escrita para *"onde vejo as
que já decidi"* — porque hoje isso é uma aba e amanhã não pode sumir.
**Gate**: nenhum
**Status**: ✅ entregue em 2026-09-12, e **o resultado foi apagar código em vez de escrever**: a `.tri`
do `lumem-board.css` deixou de existir, o quadro passou a linkar `lumem-tasks.css`, e a peça é a
`.pq`. O que a mudança de endereço quase perdeu está no §8.2 do PRD — **a distinção entre fato e
conclusão** —, e ela atravessou. O segmentado `pendentes · resolvidas` veio junto; sem ele, rejeitar
apagaria a proposta da tela inteira

---

## Fase 1 — modelo e router, sem tela

#### T4: A tabela `task` e `session.task_id`

**What**: `task` com o §3.1 do PRD — `title`, `body`, `status` com `CHECK`, `project_id` **não nulo**
([T2](open-questions.md)), `worktree_id` `ON DELETE SET NULL`, `links`, `reason`, `created_by`,
`source_session_id`, carimbos. `session.task_id` FK nula, `ON DELETE SET NULL`. Migração pelo
`drizzle-kit`, com o cuidado que o `db/index.ts` já documenta para `CHECK` em tabela existente.
**Where**: `packages/server/src/db/schema.ts`, migração gerada
**Done when**: `migrations.test.ts` passa do vazio ao atual e do anterior ao atual; uma sessão
sobrevive à tarefa removida com `task_id` nulo; `status` fora do enum é recusado **pelo banco**.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12. A migração `0014_tarefa_como_entidade` teve **uma linha escrita à mão**: o `drizzle-kit` perde a ação do FK no caminho de `ALTER TABLE` e escreveu `REFERENCES task(id)` sem `ON DELETE` — com isso, apagar uma tarefa seria **recusado** em vez de anular o ponteiro da sessão. O teste da mutação prova: com a linha gerada, ele falha com `FOREIGN KEY constraint failed`

#### T5: O router `task.*`

**What**: `listByWorkspace` (filtro por status e projeto, ordem do §F1), `get`, `create`, `update`,
`setStatus`, `remove`. As regras de ator: `done` só humano ([T9](open-questions.md)); `remove` só
humano e só em tarefa **sem sessão** — o resto é `dropped` com motivo. Evento `task.changed` no
barramento, como os outros routers.
**Where**: `packages/server/src/routers/task.ts`, `routers/index.ts`,
`packages/shared` (contratos)
**Done when**: integration cobre projeto de outro workspace → `INVALID_ARGUMENT`; `remove` de tarefa
com sessão → `BLOCKED`; cada transição proibida por ator falha com a mensagem dela; a ordem da lista é
asserida com `review`, `in_progress` e `open` misturados.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12 — 12 casos. `created_by_session` ficou **sem estrangeiro**, contra o que o §3.1 escreveu: com RESTRICT, todo `session.remove` de uma sessão que já propôs alguma coisa falharia; o precedente é o `session.resumed_from_id`, e a nota está no schema

#### T6: `in_progress` é derivado, não declarado

**What**: o daemon marca `in_progress` quando a **primeira sessão ligada à tarefa manda o primeiro
prompt** — pelo mesmo observador de eventos que já grava consumo. Nenhuma chamada de agente, nenhum
botão.
**Where**: o observador de eventos do `session_usage`,
`packages/server/src/routers/task.ts`
**Done when**: integration com agente falso: primeiro prompt de sessão ligada → `in_progress`; sessão
**sem** tarefa → nada muda; segundo prompt não re-escreve. **Mutação:** desligar o observador tem que
derrubar um teste.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12 — 6 casos, agente falso, zero token. A costura é o evento `message` de `role: user`, que o `prompt` põe na transcrição antes de o agente ouvir. **Só de `open`**: `review` o agente pôs de propósito e `proposed` ainda não foi aprovada. O caso da mutação existe e é o último do arquivo

#### T7: Remover projeto leva as tarefas junto

**What**: a cascata da [T10](open-questions.md), **na mesma transação** que a
[WS-Q22](../001-walking-skeleton/open-questions.md) já criou para as worktrees. A confirmação passa a
nomear **as duas contas** — *"e o registro de 3 worktrees e 5 tarefas?"*. `session.task_id` fica nulo.
`RESTRICT` aqui repetiria o bug que a WS-Q22 consertou: todo projeto real teria tarefa, e o botão
voltaria a não funcionar.
**Where**: `packages/server/src/routers/project.ts`, `project.remove.test.ts`, e a tela da
confirmação
**Done when**: remover por caminho leva worktrees **e** tarefas numa transação, sem tocar no disco; a
sessão ligada fica com `task_id` nulo; projeto **clonado** com worktree continua bloqueando **antes**
de chegar às tarefas; a frase da confirmação contém os dois números.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12. As tarefas vão **antes** das worktrees na transação — uma tarefa aponta para uma delas, e a ordem é o que satisfaz os dois estrangeiros sem afrouxar nenhum. A confirmação diz `e o registro de 1 worktree e 2 tarefas?`, e **não diz zero**

---

## Fase 2 — a tela

#### T8: A lista, na tela do workspace e no projeto

**What**: a seção de tarefas no `WorkspacePanel`, com a ordem do §F1 (`review` e `in_progress`
primeiro, `open` depois, `done` recolhido), filtro por status e por projeto, e *"ver todas"* para a
tela cheia. No painel do projeto, a mesma lista filtrada. Sem prioridade, prazo ou estimativa
([T3](open-questions.md)).
**Where**: `packages/web/src/components/WorkspacePanel.tsx` e o componente novo da lista
**Done when**: componente com o fake de tRPC: a ordem é asserida com os quatro estados misturados; o
filtro por projeto não muda a ordem; `done` recolhido abre e fecha; a lista vazia **ensina** em vez de
parecer quebrada.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12. Sem cabeçalho de grupo, como o desenho decidiu. O caso que importa é o que prova que a tela **não reordena** o que o daemon mandou — a ordem é decisão de produto, e decisão de produto sem teste volta a ser opinião

#### T9: O detalhe da tarefa

**What**: corpo, sessões com estado, worktree, `links`, proveniência (quem criou, de qual sessão, o
selo de *proposta por agente*), e os verbos de transição permitidos **para você**.
**Where**: o componente do detalhe, e a rota que o alcança
**Done when**: o detalhe de uma tarefa `proposed` mostra quem propôs e de qual sessão; o de uma
tarefa sem worktree não inventa um checkout; `done` aparece para humano e o teste prova que nenhum
caminho da tela oferece `done` a um agente.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12. `marcar done` só aparece porque quem olha é humano, e o teste prova que a tela troca os verbos quando a tarefa sai do fluxo. As sessões vêm de `session.listByTask`, que é a leitura da coluna — não um índice novo

#### T10: Trabalhar nesta tarefa

**What**: um botão. Cria a worktree com nome derivado do título — **com a opção** de escolher um
checkout existente, inclusive o `local` ([T5](open-questions.md)) —, abre a sessão de agente com
`session.task_id` preenchido, e **pré-preenche o composer** com o corpo da tarefa
([T6](open-questions.md)). **Não envia.** Reusa `worktree.create` e `session.createAgent`; o que muda
neles é um `taskId` opcional.
**Where**: `packages/server/src/routers/worktree.ts`, `session.ts`, e o componente do detalhe
**Done when**: e2e com agente falso: o composer chega **preenchido e não enviado**, e o custo é
**zero** até apertar; escolher um checkout existente não cria worktree nenhuma; a tarefa fica com
`worktree_id` depois — nunca sem, se alguém trabalhou nela.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12. O composer chega **preenchido e não enviado**: `initialDraft` é irmão do `initialPrompt` que já existia, e o contrário dele — aquele manda sozinho, este espera você ler. No inicializador do `useState` e não num efeito, senão ele atropelaria o primeiro caractere de quem começasse a digitar antes

#### T11: A tarefa na primeira aba da worktree

**What**: a aba fixa do checkout que a [`018`](../018-worktree-first-tab/prd.md) entregou passa a
dizer **para qual tarefa a worktree existe**, ao lado de branch e sujeira. Um clique abre o detalhe.
**Where**: o componente da primeira aba
**Done when**: worktree **sem** tarefa não ganha nenhum pixel novo; com tarefa, o título trunca pela
regra da casa e o ponto de sujeira continua visível.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-12 — na **linha de contexto** do checkout, ao lado de branch e sujeira, e não no rótulo da aba. Consulta própria (`task.getByWorktree`) e não um campo do `getDetail`: aquele é o retrato do disco, e juntar os dois faria uma leitura de git esperar por uma de banco a cada repintura

---

## Fase 3 — a porta do agente e a triagem

#### T12: `POST /tasks` e `POST /tasks/:id/review`

**What**: a porta no molde do `memory/http.ts` — HTTP, texto, `curl` de qualquer `cwd`. `title`,
`body`, `project` (nome, resolvido **dentro do workspace da sessão**). Autenticado pelo token de
sessão da F4 do [daemon-auth](../019-daemon-auth/prd.md); **até ela existir**, o `?session=` da
memória, **com a mesma dívida nomeada em comentário**. A regra do §3.2 decide `open` ou `proposed`.
`review` pelo caminho da [T7](open-questions.md).
**Where**: `packages/server/src/task/http.ts`, `server.ts`, e
`packages/server/src/web/static.ts` — **o `DAEMON_PREFIXES` precisa aprender `/tasks`**, senão o web
servido na mesma porta engole a rota e o sintoma aparece só no pacote instalado.
**Done when**: `app.inject`: mesmo projeto → `open`; outro projeto → `proposed`; projeto que não é do
workspace → recusa; sem sessão → recusa. E um teste que prova que `/tasks` **não** é servido como
arquivo estático.
**Gate**: `pnpm gate:quick`
**Status**: ⬜ a fazer

#### T13: O orçamento de criação — cinco por tarefa, e visível

**What**: teto de **cinco por tarefa** ([T8](open-questions.md)) — as três sessões da esteira dividem
o mesmo bolso. **Não** é variável de ambiente: é um ajuste **visível**, no mesmo painel dos outros
tetos, com o número mostrado como leitura. Ao estourar, o `POST` recusa com a frase que diz que o
orçamento acabou, e **a recusa fica na transcrição**.
**Where**: `packages/server/src/task/http.ts`, o painel de ajustes, e o schema do ajuste
**Done when**: a sexta criação **da mesma tarefa** recusa com a frase; a sexta de **outra** tarefa
passa; o número aparece na tela e muda o comportamento quando editado; a recusa é visível na
transcrição da sessão, não só no log.
**Gate**: `pnpm gate:quick`
**Status**: ⬜ a fazer

#### T14: O parágrafo da skill

**What**: `skill.ts` ganha **um parágrafo** ensinando a porta, com o custo em caracteres medido como
o resto do preâmbulo — e ele diz também o que o orçamento faz, porque um agente que não sabe do teto
gasta turno descobrindo.
**Where**: `packages/server/src/memory/skill.ts`
**Done when**: o parágrafo está no preâmbulo, o custo em caracteres é **asserido** no teste, e o
crescimento total do preâmbulo está escrito no PRD.
**Gate**: `pnpm gate:quick`
**Status**: ⬜ a fazer

#### T15: A fila de Propostas — os dois tipos, e a mudança

**What**: a fila do §F4 no topo do `WorkspacePanel`, com **memória e tarefa** na mesma lista, tipo
visível e a ação de cada um. A aba `inbox` **sai** do `MemoryPanel`, e a lista sobe para a fila com o
que a [T3](#t3-a-fila-de-propostas-reconciliada) decidiu levar junto. Tarefa `proposed` aprovada vira
`open` (com edição) ou `dropped` (com motivo), sempre com quem propôs e de qual sessão.
**Where**: `packages/web/src/components/WorkspacePanel.tsx`, `MemoryPanel.tsx`, e o componente da
fila
**Done when**: componente: os dois tipos na mesma lista com verbos diferentes; aprovar tarefa cruza o
projeto certo; rejeitar exige motivo. E **o teste que importa**: aprovar uma proposta de memória pela
fila grava exatamente o que a aba gravava — se divergir, a mudança perdeu alguma coisa.
**Gate**: `pnpm gate:quick`
**Status**: ⬜ a fazer

---

## Fase 4 — o que o modelo dá de graça

#### T16: Custo por tarefa, e a memória sabendo a tarefa

**What**: `session_usage` já tem sessão, e a sessão passa a ter tarefa — então o custo por tarefa é
uma soma, com o **mesmo enum de janela** da [`010`](../010-workspace-screen/prd.md). O detalhe mostra
tokens e custo; a lista, o custo na janela. E a F6, só leitura: onde a tela mostra `source_sessions`
ou uma decisão do WAL, mostra o **título da tarefa** daquela sessão quando há. **Nenhuma coluna nova
em memória** — a ligação já existe pela sessão.
**Where**: `packages/server/src/routers/usage.ts`, o detalhe, e as telas de memória que mostram
proveniência
**Done when**: a soma por tarefa bate com a soma das sessões dela; tarefa sem sessão mostra
*"sem custo reportado"* e **não** some da lista; memória de sessão sem tarefa não ganha rótulo vazio.
**Gate**: `pnpm gate:quick`
**Status**: ⬜ a fazer

#### T17: O e2e, e a medida de cerimônia

**What**: dois caminhos de ponta a ponta com agente falso e **zero token** — (a) criar tarefa,
trabalhar, composer pré-preenchido, enviar, marcar `done`, o custo aparecer; (b) agente falso faz
`POST /tasks` para **outro** projeto → aparece na fila de Propostas → aprovar → `open` no outro
projeto. Mais a medida que o §7 do PRD pede: **sessões com tarefa ÷ sessões**, exposta em algum lugar
que dê para ler.
**Where**: `e2e/`, e a leitura da proporção
**Done when**: os dois caminhos passam sem rede e sem token; a proporção existe e é lida; e o PRD
registra o valor da primeira semana — porque **100% significa que o lugar da tarefa está errado**, e
esse número só serve se alguém olhar.
**Gate**: `pnpm gate:full`
**Status**: ⬜ a fazer

---

## O que fica de fora, e onde foi parar

| Fora | Onde |
|---|---|
| quadro, esteira, agentes nomeados, orçamento de execução | [`028`](../028-autonomous-orchestration/prd.md), que empilha em cima desta |
| fila com lease, heartbeat, recuperação | [backlog](../../project/backlog.md) seção C, item `G` — o gatilho já foi atingido pela `028`, mas a peça é dela |
| sincronizar estado com o tracker | fora da `022` ([T3](open-questions.md) e §4 do PRD). A `028` §F6 escreve de volta, atrás de mapa explícito |
| o sinal canônico de conclusão | **Q069, aberta de propósito.** A v1 usa você; `review` é sugestão do agente |
| tarefa sem projeto | [T2](open-questions.md) — tornar `project_id` nulo depois é uma migração de uma linha |

Portão final: `pnpm gate:full`.
