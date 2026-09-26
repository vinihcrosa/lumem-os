# PRD — Tarefa como entidade

> **Status:** completa
> **Histórico:** v0.1 — proposto em 2026-09-05, **perguntas abertas**. Sai do backlog ("Tarefas de workspace atravessando projetos", seção C). **"Fila com lease" fica no backlog:** este PRD é atribuição manual, de propósito.
> **Perguntas:** [open-questions.md](open-questions.md) — **10, todas respondidas em 2026-09-12.**
> Oito saíram como propostas; a **T4** e a **T8** mudaram, e as duas mudaram pelo mesmo motivo: a
> [`028`](../028-autonomous-orchestration/prd.md) não existia quando elas foram escritas. A T4 foi
> para uma **terceira** forma — uma fila só, no topo da tela do workspace — e a T8 **trocou de
> unidade**, de sessão para tarefa, porque a esteira dá três sessões a cada tarefa. Elas **propõem**
> resposta para as **Q011–Q015** do [questions.md](../../project/questions.md); a Q068 e a Q069 ficam
> abertas de propósito (§5)
> **Tasks:** [tasks.md](tasks.md) — **17, em 5 fases, todas entregues** em 2026-09-12
> **Depende de:** [workspace-screen](../010-workspace-screen/prd.md), entregue — é onde a lista mora.
> **Fica melhor com:** a F4 do [daemon-auth](../019-daemon-auth/prd.md) (ator provado, para a F3) e o
> [second-agent](../021-second-agent/prd.md) (com um agente, "quem pega" não é pergunta)
> **Desenho:** seis telas no Open Design (§8). A [worktree-first-tab](../018-worktree-first-tab/prd.md),
> entregue em 2026-09-01, fez a coluna do meio ser caminho → abas → conteúdo, com **a worktree como
> primeira aba** — e essa aba é o segundo lugar natural da tarefa

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
| `task.project_id` | FK, **obrigatório** ([T2](open-questions.md)). Regra de repositório: o projeto pertence ao workspace. Remover projeto por caminho **leva as tarefas junto** — só o registro, na mesma transação das worktrees, como a WS-Q22 decidiu ([T10](open-questions.md)) |
| `task.title`, `task.body` | título; corpo em Markdown |
| `task.status` | `CHECK`: `proposed`, `open`, `in_progress`, `review`, `done`, `dropped` |
| `task.created_by` | `CHECK`: `human`, `agent` |
| `task.created_by_session` | **Sem** foreign key, nula para `human`. > **Nota — isto contradiz o que esta linha dizia.** `FK session` com `RESTRICT` faria todo `session.remove` de uma sessão que já propôs alguma coisa falhar; com `SET NULL`, a pergunta *"quem propôs isto?"* perderia a resposta no dia da limpeza. O precedente é o `session.resumed_from_id`, que resolveu a mesma forma pelo mesmo motivo: **isto é proveniência, não dependência**. O CHECK `task_agent_provenance` continua cobrando os dois sentidos, então a coluna nunca fica vazia numa tarefa de agente |
| `task.worktree_id` | FK `ON DELETE SET NULL`, nula até alguém trabalhar nela. Remover a worktree não remove a tarefa: ela perde o checkout e fica no estado em que estava |
| `task.links` | JSON: URLs — ClickUp, Jira, PR. **Referência por link**, e só (Q013) |
| `task.reason` | por que foi `dropped`, quando foi |
| `session.task_id` | FK nula, `ON DELETE SET NULL` — a sessão sobrevive à tarefa como já sobrevive à worktree. **Uma sessão pertence a no máximo uma tarefa**; uma tarefa tem N sessões. Vale para os três `kind` de hoje — `shell`, `agent` e o `script` da project-scripts |
| carimbos | `created_at`, `updated_at`, `closed_at` |

### 3.2 As regras

- **Escrever para cima é proposta.** A mesma regra da memória (Q27), reusada palavra por palavra:
  agente criando tarefa **para o próprio projeto** → `open`; para **outro projeto** → `proposed`, e
  passa pela sua triagem (Q012). Humano cria `open` sempre;
- **`in_progress` é derivado, não declarado:** o daemon marca quando a primeira sessão ligada à tarefa
  manda o primeiro prompt — pelo mesmo observador de eventos que grava consumo;
- **`review` é o agente dizendo "acho que terminei"** — pela porta HTTP da F3 ([T7](open-questions.md)).
  Nunca por `turn_end`: fim de turno não é fim de trabalho (a armadilha nomeada na Q069);
- **`done` é humano** ([T9](open-questions.md)). Na v1, o sinal canônico de conclusão é você — **e
  reabrir também é seu**: um agente não move uma tarefa que já está `done` ou `dropped`, nem para
  `review`. Fechar e reabrir são a mesma decisão vista dos dois lados, e o guard que olhasse só o
  estado de **destino** deixaria `POST /tasks/:id/review` reabrir o que você fechou;
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
em caracteres medido como o resto do preâmbulo.

**Orçamento de criação: cinco por _tarefa_** ([T8](open-questions.md)) — as três sessões da esteira
dividem o mesmo bolso, como já acontece com o teto de custo. Não é variável de ambiente: é um **ajuste
visível**, no mesmo painel dos outros tetos, porque um teto que você não vê é um teto que você não
ajusta e que parece bug quando recusa. Ao estourar, o `POST` recusa com a frase que diz que o
orçamento acabou, e **a recusa fica na transcrição** — o agente vai dizer que tentou. O que ele
protege não é o banco: é a sua atenção, e sobretudo o caminho que **não** passa por você — tarefa
para o próprio projeto entra direto como `open`.

### F4 — Triagem

Tarefa `proposed` aparece para você aprovar (vira `open`, com edição), ou rejeitar (`dropped`, com
motivo), sempre com **quem propôs e de qual sessão** — a proveniência é o que separa proposta de lixo.

**Onde: uma fila só, chamada _Propostas_, no topo da tela do workspace** ([T4](open-questions.md)).
Ela lista **os dois tipos** — proposta de memória e tarefa proposta — com o tipo visível e a ação de
cada um. Não é a aba do `MemoryPanel` e não é uma seção separada: é *o* lugar de "o que o sistema quer
que eu decida", e ele fica onde você já olha de manhã. Uma fila que enche sozinha atrás de uma aba é
uma fila que apodrece.

> **Isto contradiz a [`007`](../007-workspace-memory/prd.md):** a inbox de propostas da memória
> **sai de dentro do `MemoryPanel`** e sobe para esta fila. É a única parte cara desta resposta, e é
> mexer numa feature entregue. **A nota entra no requisito da `007` quando esta PRD sair de
> proposta**, com âncora para cá — mesma regra que a `028` aplica à `022` e à `021`. O que fica de pé
> na `007`: a linguagem da proposta (quem propôs, de onde, por quê, dois verbos) é reaproveitada
> palavra por palavra, e é justamente por isso que as duas cabem na mesma lista.

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
- **Não** duplicar a inbox — e com a [T4](open-questions.md) respondida isso deixou de ser um cuidado
  e virou um fato: **não existe segunda inbox para duplicar.** As duas viraram uma, e a linguagem
  visual é a que a memória já tinha.

## 7. Riscos

| Risco | Defesa |
|---|---|
| a tela do workspace vira "a tela de tudo" (risco §9 da workspace-screen) | a lista é **uma seção**, com "ver todas" para a tela cheia. E tarefa é, de todas as candidatas, a que mais é **do** workspace |
| agente criando tarefa em série | orçamento de **cinco por tarefa**, ajustável e visível ([T8](open-questions.md)); cross-projeto é sempre `proposed`; a proveniência aparece |
| cerimônia: você cria tarefa para agradar o daemon | medir **sessões com tarefa ÷ sessões** e **esperar** que seja menor que 100%. Se chegar a 100%, o modelo errou o lugar da tarefa |
| duas inboxes que parecem uma | **não existem duas.** A [T4](open-questions.md) fundiu numa fila só, no topo da tela do workspace. O risco que sobra é o oposto — uma fila com dois tipos que se leem igual —, e a defesa é o tipo visível na linha, com a ação de cada um |
| o corpo pré-preenchido vira prompt ruim | é editável, e é **visível** — o oposto da injeção invisível que o §12 da memória proíbe |
| `project_id` obrigatório e uma tarefa "decidir qual projeto" | [T2](open-questions.md): tornar nula depois é uma migração de uma linha; o contrário não é |

## 8. O desenho, e o que ele decidiu

> **Feito em 2026-09-12**, no projeto `lumem-os` do Open Design
> ([ADR](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)). Os seis itens que esta seção
> pedia estão cobertos.

| Arquivo | O quê |
|---|---|
| `lumem-tasks.html` + `lumem-tasks.css` | **novo**, 8 quadros: a lista, a anatomia da linha com os cinco estados, o detalhe, *trabalhar nesta tarefa* com o composer pré-preenchido, a tarefa na primeira aba do checkout, a **fila de Propostas canônica**, os três vazios e as duas degradações |
| `lumem-board.html` / `.css` (da `028`) | **editado.** A cópia da triagem (`.tri`) foi **apagada**: o quadro passa a linkar `lumem-tasks.css` e usar a `.pq` |

### 8.1 O que o desenho decidiu

1. **A língua de estado é a mesma do quadro da [`028`](../028-autonomous-orchestration/prd.md), e
   nasce aqui.** Anel é ninguém, disco cheio é alguém, o texto mais claro da paleta é a sua vez. A
   `028` empilha em cima desta — duas telas dizendo a mesma coisa com pixels diferentes fariam a
   pessoa aprender duas vezes. Na lista: `open` é anel cinza, `in_progress` é disco roxo, `review` é
   anel **branco**;
2. **Não existe cabeçalho de grupo na lista.** O estado é o **primeiro item da linha**, e quando o
   primeiro item é o critério de ordenação a ordem se explica sozinha. Cabeçalhos custariam a altura
   de duas tarefas numa seção que divide a coluna com consumo e memória;
3. **Só o título é elástico.** As quatro células de meta — projeto, proveniência, checkout, PR — têm
   largura própria, medida. Elásticas, cada linha começava a metadata num x diferente, e a coluna
   dançava exatamente onde se compara projeto com projeto;
4. **A proveniência é glifo, e só o que não é default tem marca.** Tarefa criada por você não ganha
   nada — "você" é o normal, e marcar o normal gasta a marca. `◆` é agente, `↗` é tracker;
5. **`proposed` e `dropped` não aparecem na lista por default.** O primeiro mora na fila — repeti-lo
   faria a mesma coisa existir em dois lugares com dois gestos —, e o segundo é arquivo, alcançável
   pelo filtro, **com o motivo junto**: sem motivo, `dropped` é indistinguível de esquecimento. E
   `dropped` **guarda o custo**, senão a soma do workspace deixa de fechar;
6. **A tarefa aparece na linha de contexto do checkout, não no rótulo da aba.** O rótulo já carrega
   nome e ponto de sujeira; enfiar um título lá faria a aba crescer com o texto que alguém digitou.

### 8.2 A fila de Propostas — o que a mudança de endereço quase perdeu

A [T4](open-questions.md) tirou a lista de dentro do `MemoryPanel`. O que corria risco não era o
layout: era **a distinção entre fato e conclusão**. Resposta apoiada em artefato verificável vira
memória direta; **conclusão vira proposta** — a regra que sustenta a memória inteira. Uma fila que
mostrasse só o texto faria a pessoa aprovar conclusão com a mesma facilidade com que aprova fato.

Então a linha da evidência tem **duas leituras opostas no mesmo lugar**: com artefato, os caminhos em
mono e o glifo verde; sem, a frase que diz que foi conclusão, em **âmbar e não vermelho** — não é
erro, é o motivo de você estar sendo perguntado. E vem junto o segmentado **pendentes · resolvidas**,
que a aba já tinha: sem ele, rejeitar apagaria a proposta da tela inteira.

**Evidência só existe onde um agente concluiu alguma coisa.** A proposta vinda do tracker não tem e
**não deve ter**: ali a proveniência é o link, e uma pessoa já autorizou do outro lado.

### 8.3 O que a `028` tinha e devolveu

O quadro 7 do `lumem-board.html` desenhou a fila **antes** desta resposta existir, e tinha uma cópia
chamada `.tri`. Cópia é como duas telas divergem sem ninguém decidir nada — e aquela **já tinha
divergido**: as "duas cores de origem" dela eram `session-agent` e `text-link`, que são o mesmo
`brand-400`. A peça agora é uma só, mora em `lumem-tasks.css`, e o quadro linka esta folha.

## 9. Fases

0. **O desenho** — as seis telas do §8, no Open Design. **Vem primeiro**, e não por capricho: a fila
   de Propostas mexe numa feature entregue, e desenho que decide isso depois do código decide tarde;
1. **Modelo e router** — `task`, `session.task_id`, `task.*`, o observador de `in_progress`, e a
   cascata do remover projeto. Daemon, sem tela, com prova;
2. **Lista, detalhe e trabalhar** — F1 e F2 na tela, mais a linha na primeira aba da worktree;
3. **A porta do agente e a triagem** — F3 e F4. Depois da F4 do daemon-auth, ou com a dívida do
   `?session=` nomeada;
4. **Custo e memória** — F5 e F6, as duas de leitura, mais o e2e e a medida de cerimônia.

O detalhamento, com `Done when` por task, está no [tasks.md](tasks.md).

## 10. Custo nos testes

| Camada | Teste |
|---|---|
| repositório e router | integration: projeto de outro workspace → `INVALID_ARGUMENT`; remover projeto por caminho leva as tarefas **na mesma transação** e a sessão ligada fica com `task_id` nulo; projeto clonado com worktree continua bloqueando antes de chegar às tarefas; `remove` de tarefa com sessão → `BLOCKED`; transições permitidas por ator |
| observador | integration com agente falso: primeiro prompt de sessão ligada → `in_progress`; sessão sem tarefa → nada muda. **Mutação:** desligar o observador tem que derrubar um teste |
| F3 | `app.inject`: mesmo projeto → `open`; outro projeto → `proposed`; orçamento esgotado → recusa com frase; projeto que não é do workspace → recusa. A skill contém o parágrafo, e o custo dele é asserido em caracteres |
| e2e | (a) criar tarefa, trabalhar, composer pré-preenchido, enviar contra o agente falso, marcar `done`, custo aparece; (b) agente falso faz `POST /tasks` para outro projeto → aparece na triagem → aprovar → `open` no outro projeto. **Zero token** |

Portão: `gate:full`.
