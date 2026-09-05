# PRD — Tarefa como entidade

> **Status:** v0.1 — proposto em 2026-09-05, **perguntas abertas**. Sai do backlog ("Tarefas de
> workspace atravessando projetos", seção C). **"Fila com lease" fica no backlog:** este PRD é
> atribuição manual, de propósito.
> **Perguntas:** [open-questions.md](open-questions.md). Elas **propõem** resposta para as
> **Q011–Q015** do [questions.md](../../project/questions.md); a Q068 e a Q069 ficam abertas de
> propósito (§5)
> **Tasks:** ainda não — nascem depois das perguntas respondidas
> **Depende de:** [workspace-screen](../workspace-screen/prd.md), entregue — é onde a lista mora.
> **Fica melhor com:** a F4 do [daemon-auth](../daemon-auth/prd.md) (ator provado, para a F3) e o
> [second-agent](../second-agent/prd.md) (com um agente, "quem pega" não é pergunta)
> **Desenho:** cinco telas no Open Design (§8). A [pull-request-status](../pull-request-status/prd.md)
> v0.2 muda a coluna do meio — **a primeira aba passa a ser a da worktree** —, e essa aba é o segundo
> lugar natural da tarefa

---

## 1. O problema, em uma frase

**O produto chama de tarefa uma coisa que não existe.**

A tela 5 do primeiro acesso diz *"Toda tarefa vira uma worktree"* (`setup/TaskStep.tsx`), e o campo
se chama "Nome da tarefa". Depois disso, o **nome da worktree** é o único rastro da intenção. O que a
[vision.md](../../project/vision.md) pede, contra o que existe:

| A visão pede | O que existe |
|---|---|
| tarefas por workspace, linkando projetos | nada |
| um agente **pega** uma tarefa | a sessão nasce vazia; o que ela é para, você digita no composer, e nada registra |
| um agente percebe que **outro projeto** precisa mudar e cria a tarefa lá | nada. A inbox de propostas da memória é o único caminho cross-projeto, e é só para memória |
| quanto isto custou | por projeto e por worktree (workspace-screen). Por tarefa, nunca — backlog B: "por classe de tarefa" |
| por que o sistema aprendeu isto | `source_sessions` aponta sessões, não trabalho: "enquanto fazia o quê" não tem resposta |

## 2. Por que agora

1. **O gatilho do backlog foi atingido:** "quando a memória de workspace estiver de pé". Está;
2. **O workspace tem tela**, e a lista de tarefas é a coisa mais óbvia que faltava nela;
3. **É o diferencial.** O achado do [comparison.md](../../references/comparison.md): nenhuma das
   referências agrupa multi-repo. Um workspace sem tarefas atravessando projetos é uma pasta de
   repositórios; com elas, é o motivo de o conceito existir.

## 3. O que uma tarefa é

### 3.1 O modelo

| Tabela / coluna | O quê |
|---|---|
| `task.id` | UUID do daemon |
| `task.workspace_id` | FK `RESTRICT` |
| `task.project_id` | FK `RESTRICT`, **obrigatório** ([T2](open-questions.md)). Regra de repositório: o projeto pertence ao workspace |
| `task.title`, `task.body` | título; corpo em Markdown |
| `task.status` | `CHECK`: `proposed`, `open`, `in_progress`, `review`, `done`, `dropped` |
| `task.created_by` | `CHECK`: `human`, `agent` |
| `task.created_by_session` | FK `session`, nula para `human` |
| `task.worktree_id` | FK, nula até alguém trabalhar nela |
| `task.links` | JSON: URLs — ClickUp, Jira, PR. **Referência por link**, e só (Q013) |
| `task.reason` | por que foi `dropped`, quando foi |
| `session.task_id` | FK nula. **Uma sessão pertence a no máximo uma tarefa**; uma tarefa tem N sessões. Vale para os três `kind` de hoje — `shell`, `agent` e o `script` da project-scripts |
| carimbos | `created_at`, `updated_at`, `closed_at` |

### 3.2 As regras

- **Escrever para cima é proposta.** A mesma regra da memória (Q27), reusada palavra por palavra:
  agente criando tarefa **para o próprio projeto** → `open`; para **outro projeto** → `proposed`, e
  passa pela sua triagem (Q012). Humano cria `open` sempre;
- **`in_progress` é derivado, não declarado:** o daemon marca quando a primeira sessão ligada à tarefa
  manda o primeiro prompt — pelo mesmo observador de eventos que grava consumo;
- **`review` é o agente dizendo "acho que terminei"** — pela porta HTTP da F3 ([T7](open-questions.md)).
  Nunca por `turn_end`: fim de turno não é fim de trabalho (a armadilha nomeada na Q069);
- **`done` é humano** ([T9](open-questions.md)). Na v1, o sinal canônico de conclusão é você;
- tarefa **não é obrigatória** (Q011, [T1](open-questions.md)). "Abrir um agente e conversar" continua
  existindo como está.

## 4. Escopo

### F1 — CRUD e lista

Router `task.*`: `listByWorkspace` (filtro por status e projeto), `get`, `create`, `update`,
`setStatus`, `remove` (só humano, e só tarefa sem sessão; o resto é `dropped`). Eventos
`task.changed` no barramento, como os outros. Na tela do workspace, a lista: `review` e `in_progress`
primeiro, `open` depois, `done` recolhido. No painel do projeto, a mesma lista filtrada. O detalhe:
corpo, sessões, worktree, custo, e o que a memória aprendeu enquanto (§F6).

### F2 — Trabalhar nesta tarefa

Um botão. Cria a worktree com nome derivado do título ([T5](open-questions.md) permite escolher uma
existente), abre uma sessão de agente nela com `session.task_id` preenchido, e **pré-preenche o
composer** com o corpo da tarefa ([T6](open-questions.md)) — não envia. Você vê o que vai, e não custa
nada até apertar enviar. Reusa `worktree.create` e `session.createAgent`; o que muda neles é um
`taskId` opcional.

### F3 — O agente cria tarefa

A porta é a mesma da memória: HTTP, texto, `curl` de qualquer `cwd`. `POST /tasks` com `title`,
`body`, `project` (nome, resolvido dentro do workspace da sessão), autenticado pelo token de sessão da
F4 do daemon-auth — até ela existir, o `?session=` da memória, com a mesma dívida. A regra do §3.2
decide `open` ou `proposed`. A skill (`skill.ts`) ganha **um parágrafo** ensinando isto, com o custo
em caracteres medido como o resto do preâmbulo. Orçamento por sessão ([T8](open-questions.md)), como
o auto-learn tem.

### F4 — Triagem

Tarefa `proposed` aparece para você aprovar (vira `open`, com edição), ou rejeitar (`dropped`, com
motivo). Onde: [T4](open-questions.md) — na mesma superfície da inbox de memória, ou numa própria. Em
qualquer caso, com **quem propôs e de qual sessão**, porque a proveniência é o que separa proposta de
lixo.

### F5 — Custo por tarefa

`session_usage` já tem sessão; a sessão passa a ter tarefa. O detalhe mostra tokens e custo com o
mesmo enum de janela da workspace-screen; a lista mostra o custo por tarefa na janela. É a resposta
mais barata e mais útil que o modelo dá de graça.

### F6 — A memória sabe a tarefa

Só leitura: onde a tela mostra `source_sessions` ou uma decisão do WAL, mostra o título da tarefa
daquela sessão quando há. Nenhuma coluna nova em memória — a ligação já existe pela sessão.

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| Fila com lease, agente puxando trabalho sozinho | Q068, backlog `G`. Volta quando existir mais de um agente rodando sem você olhar |
| Dependência entre tarefas | Q014: não na v1. É o campo que mais convida a virar Jira |
| DAG, verificação automática de conclusão | Q069 fica aberta. Na v1, `done` é você |
| Sincronizar com ClickUp, Jira, Linear | Q013: (c), referência por link. Duas fontes de verdade é a dor conhecida |
| Roteamento por tipo de tarefa ou skill do agente | Q015: (a), manual. Você escolhe o agente na hora de trabalhar |
| Tarefa sem projeto | [T2](open-questions.md) |
| Prioridade, prazo, estimativa | [T3](open-questions.md). Nenhum agente precisa deles, e você tem o ClickUp |
| Tarefa obrigatória para abrir sessão | Q011: não |

## 5. Decisões que já dá para tomar

Estas são **propostas** para as perguntas do projeto. Elas só viram resposta no `questions.md` quando
você as confirmar em [open-questions.md](open-questions.md):

| Pergunta do projeto | Proposta deste PRD |
|---|---|
| Q011 — tarefa é central ou acessório? | acessório **opcional**. Quem quer rastro cria tarefa; quem quer conversar, conversa |
| Q012 — tarefa criada por agente para outro projeto entra direto? | **não**: `proposed`, triagem sua. Escrever para cima é proposta |
| Q013 — substitui ou espelha ClickUp? | **referência por link** |
| Q014 — dependência? | **não** |
| Q015 — quem escolhe o agente? | **você**, na hora de trabalhar |
| Q068 — fila com lease? | **aberta.** A v1 é manual e o PRD diz por quê |
| Q069 — sinal de conclusão? | **aberta.** A v1 usa você; `review` é sugestão do agente, e nunca `turn_end` |

## 6. Não-objetivos

- **Não** virar gerenciador de projeto. Sem quadro, sem sprint, sem estimativa;
- **Não** obrigar. O caminho "nova sessão" da worktree continua a um clique;
- **Não** duplicar a inbox. Se a T4 escolher superfície própria, ela tem que caber ao lado da de
  memória sem inventar uma terceira linguagem visual.

## 7. Riscos

| Risco | Defesa |
|---|---|
| a tela do workspace vira "a tela de tudo" (risco §9 da workspace-screen) | a lista é **uma seção**, com "ver todas" para a tela cheia. E tarefa é, de todas as candidatas, a que mais é **do** workspace |
| agente criando tarefa em série | orçamento por sessão; cross-projeto é sempre `proposed`; a proveniência aparece |
| cerimônia: você cria tarefa para agradar o daemon | medir **sessões com tarefa ÷ sessões** e **esperar** que seja menor que 100%. Se chegar a 100%, o modelo errou o lugar da tarefa |
| duas inboxes que parecem uma | [T4](open-questions.md) decide antes de desenhar |
| o corpo pré-preenchido vira prompt ruim | é editável, e é **visível** — o oposto da injeção invisível que o §12 da memória proíbe |
| `project_id` obrigatório e uma tarefa "decidir qual projeto" | [T2](open-questions.md): tornar nula depois é uma migração de uma linha; o contrário não é |

## 8. O que precisa ser desenhado no Open Design

1. a **lista** na tela do workspace: filtros por status e projeto, custo na janela, a seção e a tela
   cheia;
2. o **detalhe**: corpo, sessões (com estado), worktree, custo, memória aprendida enquanto;
3. **trabalhar nesta tarefa**: a escolha de agente e de worktree, e a conversa abrindo com o composer
   pré-preenchido;
4. a **triagem** de tarefa proposta — com a T4 respondida;
5. a **proveniência**: quem criou, de qual sessão, e o selo de "proposta por agente" na lista;
6. a **linha da tarefa na aba da worktree** que a pull-request-status desenhou: a worktree diz para
   qual tarefa existe, ao lado de branch e sujeira.

## 9. Fases

1. **Modelo e router** — `task`, `session.task_id`, `task.*`, o observador de `in_progress`. Daemon,
   sem tela, com prova;
2. **Lista, detalhe e trabalhar** — F1 e F2 na tela;
3. **A porta do agente e a triagem** — F3 e F4. Depois da F4 do daemon-auth, ou com a dívida do
   `?session=` nomeada;
4. **Custo e memória** — F5 e F6, as duas de leitura.

## 10. Custo nos testes

| Camada | Teste |
|---|---|
| repositório e router | integration: projeto de outro workspace → `INVALID_ARGUMENT`; `RESTRICT` ao remover projeto com tarefa; `remove` de tarefa com sessão → `BLOCKED`; transições permitidas por ator |
| observador | integration com agente falso: primeiro prompt de sessão ligada → `in_progress`; sessão sem tarefa → nada muda. **Mutação:** desligar o observador tem que derrubar um teste |
| F3 | `app.inject`: mesmo projeto → `open`; outro projeto → `proposed`; orçamento esgotado → recusa com frase; projeto que não é do workspace → recusa. A skill contém o parágrafo, e o custo dele é asserido em caracteres |
| e2e | (a) criar tarefa, trabalhar, composer pré-preenchido, enviar contra o agente falso, marcar `done`, custo aparece; (b) agente falso faz `POST /tasks` para outro projeto → aparece na triagem → aprovar → `open` no outro projeto. **Zero token** |

Portão: `gate:full`.
