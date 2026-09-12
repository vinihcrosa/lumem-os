# PRD — O orquestrador autônomo: o quadro, a esteira e os três agentes

> **Status:** em execução
> **Histórico:** v0.1 — rascunho em 2026-09-11. **v0.2, no mesmo dia:** as 20 perguntas respondidas e o
> documento reescrito em cima delas, mais o §3 com **oito casos de uso**, que é por onde se lê.
> **v0.3 e v0.4, ainda no mesmo dia:** mais duas rodadas de respostas, com duas mudanças estruturais —
> **a coluna deixou de ser quem move a seta** (§4.1, resposta a uma pergunta sua que achou um buraco em
> três das seis colunas) e **o papel deixou de ser uma constante para virar um encaixe que aponta para
> um agente nomeado** (§5, no espírito do Compozy)
> **Perguntas:** [open-questions.md](open-questions.md) — eram **33, todas respondidas** na v0.4, em
> quatro rodadas no mesmo dia. Seis foram respondidas contra a proposta. O total atual está no fim
> deste bloco
> **Tasks:** [tasks.md](tasks.md), aberto em **2026-09-12** e **só com a F1** — o quadro lendo a
> `022`, com a autonomia desligada. O §0 de lá registra o corte: seis das nove conversas do §11
> continuam guardadas, e duas delas não têm resposta — uma exige ADR novo. A F1 não depende de
> nenhuma. As fases **0 e 1 estão entregues**: o desenho sincronizado, o
> [estudo](../../project/orchestration-measurements.md) escrito, e o modelo já comportando as sete
> colunas com a ordem dentro de cada uma
> **Medições:** [orchestration-measurements.md](../../project/orchestration-measurements.md),
> 2026-09-12 — e ele mudou duas coisas antes de existir código. **`end_turn` não distingue
> *"terminei"* de *"te perguntei"***: dos 13 turnos gravados neste repositório, **4** significaram
> terminei, e três eram o turno morrendo no meio do trabalho. E **o modelo da `022` não comporta o
> quadro**: sete colunas contra quatro estados úteis, com `Backlog`/`To-Do` colapsando na fronteira
> de autorização
> **Depende de:** [workspace-tasks](../022-workspace-tasks/prd.md), que vinha antes
> ([Q1](open-questions.md#q1--esta-prd-absorve-a-022-workspace-tasks): empilha, não absorve) e está
> **entregue desde 2026-09-12**. A entidade existe, com custo por tarefa, `in_progress` derivado do
> primeiro prompt e a porta `POST /tasks` — **o chão desta PRD está no lugar**. Também usa, já entregues: a tela do
> [workspace](../010-workspace-screen/prd.md), os [scripts do projeto](../012-project-scripts/prd.md), o
> [estado da PR](../013-pull-request-status/prd.md), o [modo da sessão](../016-session-mode/prd.md), o
> [segundo agente](../021-second-agent/prd.md) e a [origem da worktree](../026-worktree-from/prd.md)
> **Desenho:** **feito** em 2026-09-11, no projeto `lumem-os` do Open Design — `lumem-board.html`
> e `lumem-agents.html`, com as folhas ao lado e dois tokens novos no `tokens.css`. O §10 diz o que
> ele mediu e o que ele mudou. **Quatro perguntas nasceram da tela**
> ([Q34](open-questions.md#q34--o-encaixe-se-chama-executor-ou-implementador) a
> [Q37](open-questions.md#q37--abaixo-de-1418px-o-que-o-quadro-faz)) e as quatro foram **respondidas
> em 2026-09-12**, todas na proposta: o encaixe se chama **`implementador`**, o rodapé da sidebar vira
> **`Adaptadores`**, o bloqueio de orçamento **nomeia qual teto segurou**, e abaixo de 1418px o quadro
> **rola na horizontal e diz que está rolando**
> **Perguntas:** **40, e 38 respondidas** — as três da sexta rodada vieram de **ler o código
> entregue**. A [Q38](open-questions.md#q38--arrastar-para-in-progress-se-ele-é-derivado) é a única do
> documento que nunca precisou existir: a Q3 já a respondia, e a premissa dela estava errada também —
> o arrasto para `In Progress` **já funcionava**, sem teste nenhum cobrindo. O que sobrou dela é a
> [Q40](open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão).
> A Q40 e a [Q39](open-questions.md#q39--quem-diz-que-o-agente-está-esperando-você) são as duas
> abertas, **as duas represadas até a F2 ter `tasks.md`**, e nenhuma bloqueia a F1

---

## 1. O problema, em uma frase

**O Lumem só trabalha enquanto você olha.**

Todo gesto do produto parte de uma pessoa clicando: criar a worktree, abrir a sessão, escrever o
prompt, ler a resposta, apertar de novo. O harness é bom nisso — e é **exatamente** isso que ele é.
Um orquestrador é outra coisa: **ele pega trabalho.**

O que a [vision.md](../../project/vision.md) pede há o projeto inteiro, contra o que existe:

| A visão pede | O que existe hoje |
|---|---|
| *"um agente pegar essa tarefa e fazer"* | nada pega. A sessão nasce vazia e espera você digitar |
| tarefas por workspace, linkando projetos | nada. O nome da worktree é o único rastro da intenção |
| *"um agente percebe que outro projeto precisa mudar e cria a tarefa lá"* | nada |
| ver o trabalho do lado de fora | você vê **uma** conversa por vez, na aba em que está |

E o pedido que abriu esta PRD é o caso limite: **atribuir uma tarefa ao Lumem no Linear e ele
seguir** — implementação, revisão, teste — sem que ninguém abra o Lumem para começar.

## 2. A mudança que isto é

> De **harness** (você dirige, ele executa) para **orquestrador** (ele executa, você supervisiona).

Isso **troca o que a tela é para**. Hoje a tela é onde você *faz*. Num orquestrador, a tela é onde
você *confere* — e as duas coisas pedem superfícies diferentes. Por isso o quadro não é enfeite
desta feature: **ele é a feature**. Sem um lugar que responda *"o que está acontecendo, onde travou,
quanto custou"* de uma olhada, autonomia é só uma forma de descobrir o problema tarde.

Quatro princípios, e o resto do documento é consequência deles:

1. **Autonomia sem orçamento é um vazamento.** Um agente que começa sozinho gasta sozinho;
2. **Autonomia sem interrupção é uma aposta.** Você tem que poder assumir o volante a qualquer
   momento, e a conversa tem que estar lá inteira quando assumir;
3. **Autonomia sem uma noção honesta de "pronto" é pior que nada.** Um produto que declara pronto o
   que não está custa mais caro que um produto que não faz nada;
4. **Um agente que pergunta tudo não é autônomo, é uma criança.** Sua palavra:
   *"se o agente pede permissão para tudo, o objetivo se perde completamente — o usuário vira babá
   de agente de IA."* A permissão de **executar** é larga por default; o que para o agente é
   **decisão de produto e de domínio**, nunca `chmod`.

## 3. Os casos de uso

São oito, e eles são o coração deste documento. Cada um tem **contexto**, **o que acontece**, **o que
você vê** e **o que o caso prova** — porque um caso de uso que não prova nada é enfeite.

O cenário é sempre o mesmo, para você poder comparar: o workspace **Acme**, com dois projetos —
`acme-api` (o backend) e `acme-web` (o front). Você é o único dev. O workspace está em `autônomo`,
com teto de **1** tarefa por vez, e três papéis configurados: **implementador**, **revisor** e
**testador**.

---

### UC1 — Uma issue do Linear vira uma PR enquanto você almoça

**Contexto.** No Linear existe a issue `ACME-142`: *"o endpoint `/orders` devolve 500 quando o
carrinho está vazio"*. Você está saindo para almoçar e não quer abrir o computador para isso. No
Linear, o Lumem existe como uma identidade a quem se atribui uma issue.

**O que acontece.**

| Hora | O quê |
|---|---|
| 12:04 | você atribui `ACME-142` ao Lumem, no Linear, e fecha o notebook |
| 12:04 | o cartão aparece **direto na To-Do** do quadro do Acme, no projeto `acme-api`, com o link da issue. To-Do é a fila, então isso é a autorização — não há segundo gesto |
| 12:05 | o teto de 1 está livre. O daemon pega: cria a worktree `142-orders-500-empty-cart` a partir da branch default, roda o `setup` do `project.toml`, abre a sessão do **implementador** com o corpo da issue como primeiro prompt. O cartão vai para **In Progress**, e o Linear recebe um comentário: *"peguei — worktree `142-orders-500-empty-cart`"* |
| 12:31 | o implementador commita, empurra a branch e abre a **PR #87**. O CI do repositório roda |
| 12:35 | os checks ficam verdes. **Só então** o cartão vai para **In Review**, e o Linear recebe *"PR #87 aberta"* |
| 12:36 | o **revisor** — outro agente, outra sessão, outro histórico — recebe o diff e o corpo da tarefa. Aprova, com o parecer registrado na tarefa. Cartão → **Testing** |
| 12:44 | o **testador** sobe a worktree com o `run` do projeto e **usa o endpoint como um cliente usaria**: carrinho vazio (espera 400 com mensagem), carrinho nulo, item removido no meio do checkout. Passa. Cartão → **Ready to Merge** |
| 12:45 | notificação do sistema: *"ACME-142 está pronta para mesclar"* |
| 13:10 | você volta, abre o quadro, lê o diff em dois minutos e mescla. Cartão → **Done**, a worktree é removida, o Linear fecha com o link da PR |

**O que você vê.** Um cartão, uma coluna à direita de onde ele estava de manhã, com `US$ 0,74`, `●
#87` verde, e três pareceres anexados: o que foi implementado, o que o revisor achou, o que o
testador exercitou.

**O que este caso prova.** Que o pedido original cabe: uma atribuição no tracker inicia, atravessa e
termina o processo sem você. E prova o limite escolhido: **o Lumem não mesclou.** Os últimos dois
minutos são seus, de propósito.

---

### UC2 — O revisor reprova, e o dinheiro não vira loop

**Contexto.** Mesma tarefa, outro dia. O implementador consertou o 500 devolvendo `200` com uma lista
vazia — funciona, e contraria o contrato da API que o resto do sistema espera.

**O que acontece.** O revisor reprova, e o parecer é específico: *"o contrato de `/orders` diz 400
para carrinho vazio; isto devolve 200"*. O cartão **volta para In Progress**, com o parecer como
próximo prompt do implementador — não um prompt seu, o texto do revisor. O implementador corrige,
abre o push de novo, o CI roda, volta para In Review. O revisor aprova. Segue.

Se reprovasse de novo, e de novo, a tarefa **bloqueia na segunda volta** e chama você — porque dois
agentes discordando em loop é a forma mais cara de não produzir nada.

**O que você vê.** Se der certo, nada — você nem soube que houve uma volta, e o cartão mostra "2
ciclos" no detalhe. Se bloquear, um cartão com o selo **precisa de mim** e as duas rodadas de
parecer lado a lado.

**O que este caso prova.** Que revisão por agente só vale se ela puder **reprovar** e se o
ping-pong tiver teto. O número de voltas é a [Q22](open-questions.md#q22--reprovou-para-onde-volta-e-quantas-vezes).

---

### UC3 — A pergunta que para tudo (e as cem que não param)

**Contexto.** A tarefa é *"adicionar cupom de desconto no checkout"*. No meio do trabalho, o
implementador descobre que ninguém definiu se o cupom acumula com a promoção de frete grátis.

**O que acontece.** Durante os 20 minutos anteriores, o agente instalou dependência, rodou a suíte
quatro vezes, criou seis arquivos, apagou dois e rodou `git` umas quinze. **Nada disso te
perguntou** — dentro da worktree e dos scripts do projeto, ele é largo por default, senão você vira
babá.

Quando chega no cupom, é outra categoria: não é permissão, é **decisão de produto**. O agente para,
a tarefa fica **bloqueada — aguardando decisão**, com a pergunta escrita no cartão. Você recebe a
notificação, responde uma frase na conversa, e ele continua de onde parou.

**O que você vê.** Um cartão em In Progress com o selo, e a pergunta em texto: *"cupom acumula com
frete grátis? Não achei regra no código nem na memória do workspace."*

**O que este caso prova.** A fronteira que a [Q10](open-questions.md#q10--o-agente-travou-no-meio-o-que-acontece)
respondeu: **permissão de execução é larga, decisão de domínio para a esteira.** O que ainda não está
respondido é *onde* exatamente termina o largo ([Q25](open-questions.md#q25--qual-é-a-borda-da-permissividade))
e *como* o Lumem percebe que a frase do agente era uma pergunta
([Q26](open-questions.md#q26--como-o-lumem-sabe-que-o-agente-fez-uma-pergunta)).

---

### UC4 — O teste que precisa dos dois projetos

**Contexto.** É por isto que a coluna `Testing` existe, e é o caso que mais separa o Lumem de um
runner de CI. A tarefa mudou o `acme-api`: o endpoint de login passou a devolver um campo novo. O
CI do `acme-api` está verde — os testes dele passam. Ninguém abriu o `acme-web`.

**O que acontece.** O testador é um agente **do workspace**, não do projeto. Ele sobe a worktree do
`acme-api` (a da tarefa) e o `acme-web` (o checkout principal), com o bloco de portas que a
project-scripts reserva, e **usa o produto como um usuário usaria**: abre a tela de login no
navegador, digita, entra, confere se a sessão persiste, tenta com senha errada, tenta com o campo
vazio. Se fosse só API, ele exercitaria o endpoint e os casos de borda.

Nesse caso ele acha: o `acme-web` quebra na tela seguinte, porque lê um campo que mudou de nome. O
cartão **não** vai para Ready to Merge — vai para bloqueada, com o print e o passo a passo de como
reproduzir.

**O que você vê.** O parecer do testador com o que ele clicou, em ordem, e onde parou.

**O que este caso prova.** Sua resposta à [Q2](open-questions.md#q2--o-que-é-testing-e-quem-move-para-lá),
inteira: *"um agente atuando como um usuário — se for UI, abrir a UI e clicar; se for endpoint,
testar os casos de borda"*, e **num workspace com vários projetos**. Nenhum CI de repositório único
pega esse defeito, porque ele não mora em nenhum dos dois repositórios: mora entre eles. **É o
argumento mais forte que o conceito de workspace já teve.**

---

### UC5 — Sem tracker nenhum: três tarefas antes de dormir

**Contexto.** Não é todo trabalho que nasce no Linear. É 23h, você teve três ideias, e não quer
implementar nenhuma agora.

**O que acontece.** Você escreve três cartões direto no quadro, na To-Do, e vai dormir com o
computador ligado. O teto é 1, então elas rodam **em fila**, uma depois da outra. De manhã: duas em
Ready to Merge, uma bloqueada com uma pergunta.

**Variante que importa:** você fecha o notebook. Aí **nada acontece** — o trabalho mora no seu disco,
e sem daemon não há agente. De manhã, o quadro diz isso na cara: *"3 tarefas paradas na To-Do há
9 h"*. Silêncio é o único resultado inaceitável.

**O que este caso prova.** Que o quadro é um produto sozinho, sem integração nenhuma — e que a
máquina desligada ([Q17](open-questions.md#q17--a-máquina-desligada)) é aceitável desde que visível.

---

### UC6 — O orçamento estoura de madrugada

**Contexto.** Uma tarefa mal escrita: *"melhorar a performance do carregamento"*. Sem critério,
sem alvo. O agente refatora, mede, não gosta, refatora de novo.

**O que acontece.** No 15º turno, ou em US$ 2 — o que vier primeiro — a tarefa **para**. Não reduz o
escopo sozinha, não pede mais orçamento, não continua. Fica bloqueada com o número: *"parou em US$
2,04 e 15 turnos"*. **A worktree fica**, com tudo o que já foi feito: é o valor que sobra, e às
vezes é a maior parte dele.

**O que você vê.** De manhã, um cartão bloqueado e o total do dia no topo do quadro. Nenhuma
surpresa de fatura.

**A variante que não é orçamento, e que você levantou:** o gasto está dentro do teto, e o **limite de
taxa do agente** estoura — as 4 h do Claude. Isso **não é bloqueio**: o cartão fica `pausada até
~04:20`, **não consome orçamento nem turno**, **libera a vaga do teto** (senão teto 1 vira quatro horas
de máquina parada), **retoma sozinha** — sejam 10 minutos ou 3h50 — e **não te notifica**, porque não
precisa de você. E como os papéis apontam para agentes nomeados (§5), o limite do Claude não para a
esteira: um revisor que aponta para o Codex continua trabalhando. Os detalhes, e o sinal que precisa
ser consertado antes, estão na [Q32](open-questions.md#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio).

**O que este caso prova.** O princípio 1 — e que *parar por falta de dinheiro* e *parar por falta de
cota* são duas coisas com respostas opostas: uma chama você, a outra espera. E deixa registrado o que
você disse ao aceitar a proposta da [Q6](open-questions.md#q6--orçamento-teto-de-quê-e-o-que-acontece-ao-estourar):
*"isso vai ser um teste, e pode mudar depois"* — os números nascem para serem ajustados com uso.

observação: existe um outro caso sobre orçamento, se o orçamento não tiver estourado no calculo
do lumem, mas o limite de 4h do claude for atingido ele para, o lumem deve poder esperar e continuar quando o limite voltar, se demorar 3h50m ou se demorar apenas 10m.

---

### UC7 — Você assume o volante

**Contexto.** Você está olhando o quadro e vê o implementador indo para o lugar errado — ele está
mexendo no arquivo que você sabe que não é o certo.

**O que acontece.** Um clique no cartão abre **a conversa**, no estado em que está. Você interrompe,
escreve *"não é aí, o parse acontece no `orders/serializer.ts`"*, e continua na mão. A autonomia
**daquela tarefa** desliga — e não volta sozinha. Quando você terminar, você move o cartão.

**O que você vê.** A mesma tela de conversa de hoje. Nada aqui é novo, e é esse o ponto: a sessão
autônoma e a sessão que você conduz são **a mesma sessão**.

**O que este caso prova.** O princípio 2. Se assumir o volante custasse perder o histórico, você
nunca ligaria o modo autônomo.

---

### UC8 — O agente descobre que o outro projeto precisa mudar

**Contexto.** É o pedido literal da vision, e o único caminho cross-projeto que o produto teria.
Trabalhando no `acme-api`, o implementador percebe que o `acme-web` chama um campo que esta tarefa
está renomeando.

**O que acontece.** Ele **não** vai mexer no `acme-web` — a tarefa dele é outra, e o checkout é
outro. Ele cria uma tarefa **para o `acme-web`**, que nasce como **proposta**, não como tarefa: vai
para a sua triagem, com quem propôs, de qual sessão e por quê. Você aprova (vira Backlog ou To-Do,
sua escolha) ou rejeita com motivo.

**O que este caso prova.** A regra de *escrever para cima é proposta*, a mesma que a memória já usa —
reaproveitada em vez de reinventada. E que um workspace é mais que uma pasta de repositórios: é o
escopo em que um agente **pode olhar para o lado**.

---

## 4. O quadro

Todas as tarefas do workspace, de todos os projetos dele, no mesmo quadro. As colunas, e **quem move
cada seta**:

| Etapa | O que significa | Quem move para cá |
|---|---|---|
| **Backlog** | existe, ainda não é para fazer | você, um agente (como proposta), o tracker |
| **To-Do** | **é para fazer.** A fila de onde se pega trabalho | **você** — e é aqui que mora a autorização |
| **In Progress** | um implementador pegou | **a máquina** |
| **In Review** | existe PR, o CI passou, e um revisor está lendo | **a máquina** |
| **Testing** | um testador está usando o produto | **a máquina** |
| **Ready to Merge** | a esteira acabou. Falta você | **a máquina** ([Q21](open-questions.md#q21--ready-to-merge-a-sétima-coluna)) |
| **Done** | mesclada | **você** |

Duas regras que explicam a tabela inteira:

1. **A máquina só move quando o fato é verificável de fora do agente.** Existe sessão rodando, o CI
   ficou verde, existe PR, o parecer foi registrado. **Nunca** porque o agente disse que terminou;
2. **As duas pontas são suas.** Entrar na fila é consentimento; sair para `Done` é julgamento.
   Nenhum dos dois é derivável.

**Você pode arrastar para qualquer coluna, sempre** — inclusive para as da máquina, que é como se diz
*"estou fazendo isto na mão"*. A restrição é só de mão única: a máquina nunca move para as suas.

> **Nota — o "sempre" fica, e já funcionava.** A [`022`](../022-workspace-tasks/prd.md) fez
> `in_progress` ser **derivado** do primeiro prompt de uma sessão ligada à tarefa, e isso parece
> proibir o arrasto. Não proíbe: só o **agente** tem allowlist, você não — arrastar para `In
> Progress` já era possível antes desta feature, e a coluna é a etapa enquanto o selo é quem está
> nela (§4.1), então um cartão posto à mão desenha `In Progress` com `manual — ninguém pega`. A
> [Q38](open-questions.md#q38--arrastar-para-in-progress-se-ele-é-derivado) registra o caminho
> errado que eu percorri até aqui, porque a propriedade era verdadeira **por acidente**: não havia um
> único teste sobre ela. A [T4](tasks.md#t4-quem-escreve-cada-estado-do-quadro) escreveu cinco.
>
> **O que a Q38 abriu é da esteira, não desta seção:** com a autonomia ligada, a regra da fila do
> §4.1 — *todo cartão cuja etapa é devida e que não tem trabalhador* — descreve **também** o cartão
> que você arrastou para trabalhar na mão, e o daemon o pegaria. É a
> [Q40](open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), **aberta e
> represada até a F2**, e anotada no §4.1 junto da regra que a produz.

**Bloqueada não é coluna, é selo.** Uma tarefa travada no meio da revisão *está* na revisão — uma
sétima coluna de bloqueio faria o quadro mentir sobre o progresso. O selo mora no cartão, e existe o
filtro **"precisa de mim"**, que é provavelmente a visão mais usada do produto.

### 4.1 Quem move a seta, e o que a coluna garante

A tabela acima diz *"a máquina"* três vezes, e isso escondia um buraco que a
[Q21](open-questions.md#q21--ready-to-merge-a-sétima-coluna) achou: **quem move `In Progress` para `In
Review`?** O implementador que terminou, ou o revisor que vai revisar? E um cartão em `In Review` garante
que alguém já está revisando?

Três frases resolvem, e nenhuma delas custa uma coluna nova:

1. **Quem move é o daemon — nunca um agente.** Ele observa um fato verificável (a PR existe, o CI
   ficou verde, o parecer foi registrado) e move. Nem o implementador "entrega", nem o revisor "pega e
   move". Agente não escreve no quadro;
2. **A coluna é a etapa; o cartão diz quem está nela.** `aguardando revisor` por 40 segundos, depois
   `revisando há 2 min`. É a mesma decisão que o §4 já tomou para `bloqueada` — situação é selo,
   etapa é coluna — e o selo é **derivado** de existir uma sessão viva com a tarefa reivindicada, o
   que significa que ele **não pode** divergir da realidade, como uma coluna guardada pode;
3. **A fila não é a coluna To-Do.** A fila é *todo cartão cuja etapa é devida e que não tem
   trabalhador*: o novo na To-Do, o que espera revisor, o que espera testador e o que o revisor
   devolveu. Uma regra, nenhum caso especial — e ela **puxa da direita para a esquerda**, porque
   terminar vale mais que começar.

> **Nota — esta regra descreve também o cartão que você está fazendo na mão.** Um cartão arrastado
> para uma coluna da máquina (§4, e a Q3 que o permite) tem etapa devida e nenhum trabalhador: pela
> frase acima, **a fila o pegaria**, e o daemon começaria a gastar em cima do trabalho que é seu. O
> selo não avisa — `manual — ninguém pega` é o mesmo texto nos dois casos. Isto é a
> [Q40](open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), **aberta e
> represada até a F2**, e ela não é alcançável enquanto a autonomia estiver desligada, que é o
> default e é o que a F1 entrega. **O resto da regra fica de pé** — inclusive *"uma regra, nenhum
> caso especial"*, que é exatamente o que a resposta da Q40 vai ter que pagar ou preservar.

**Não existe garantia de que alguém já pegou — existe visibilidade de que ninguém pegou**, que é o
que você consegue agir sobre. O selo tem quatro estados: `aguardando <papel>` · `<papel> trabalhando
há Xm` · `bloqueada: <motivo>` · `pausada até ~HH:MM`.

> **Nota — o desenho contradiz este parágrafo em duas coisas, e as duas estão em
> `lumem-board.html` (quadro 2).** **(a) São cinco estados, não quatro:** falta
> `manual — ninguém pega`, e ele é o mais importante porque é o **default** do produto — sem ele, um
> quadro com a autonomia desligada desenha o mesmo pixel de uma esteira travada. **(b) O texto do
> segundo estado não cabe:** `executor trabalhando há 12 min` pede **168px** e a caixa do cartão tem
> **151px medidos**. O selo passa a guardar **o verbo** e devolver o substantivo —
> `implementando há 12 min` (137px), `revisando há 2 min` (101), `testando há 8 min` (96) —, porque
> **o papel já está escrito no cabeçalho da coluna**. Esperando, o substantivo volta, aí ele não é
> redundante: é o que falta — e o mais longo dos três, `aguardando implementador`, mede **148px**,
> com **3px de folga**. Esse número é o que impede alguém de engordar o ponto ou o espaçamento do
> selo sem perceber que quebrou a linha. **O resto do parágrafo fica de pé**, inclusive a frase que
> abre — a ausência de garantia é o ponto, e nenhum dos dois ajustes mexe nela. O verbo abriu a
> [Q34](open-questions.md#q34--o-encaixe-se-chama-executor-ou-implementador), **respondida em
> 2026-09-12: o encaixe passa a se chamar `implementador`.**

**E é esta regra que sustenta a sétima coluna**, que é o motivo de ela existir. Se a fila é *todo cartão sem trabalhador*, então um
cartão em `Testing` sem trabalhador significaria **duas coisas opostas**: *"esperando um testador"* —
vez da máquina — e *"aprovado, esperando você"* — sua vez. O daemon precisaria de um sinalizador extra
para não pegar o segundo de volta, e `Ready to Merge` **é** esse sinalizador, com a vantagem de ser
visível.

Isto é a [Q30](open-questions.md#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo), **respondida**:
as sub-colunas `ready to review` e `ready to test` não entram. O custo que fica de pé — um selo se vê
menos que uma coluna — está no §8, e a defesa dele é o relógio de encalhe do §6/F4.

### 4.2 O cartão

O que se lê sem abrir: projeto e worktree · **o selo do §4.1** (quem está com ela, ou que ninguém
está) · **o que ele está fazendo neste momento** (a linha viva — é o que substitui ficar olhando a
conversa) · custo até aqui
· `● #87` com a cor do CI · há quanto tempo está nesta coluna (o sinal de encalhe) · de onde veio
(você, um agente, ou o link do Linear) · o selo de bloqueio, com o motivo.

### 4.3 A ordem da fila

Ordem de chegada. Se você quiser outra, **arrasta** — a posição na coluna é a prioridade, e não
existe campo de prioridade. É um gesto que o quadro já tem, e não inventa vocabulário.

Isso é a ordem **dentro** de uma coluna. **Entre** colunas, quem decide é a regra do §4.1: a esteira
puxa da direita para a esquerda, então revisar e testar vem antes de começar tarefa nova.

### 4.4 O que o quadro não é

Não é gerenciador de projeto. Sem sprint, sem burndown, sem estimativa, sem dependência entre
tarefas. O quadro existe para **um** propósito: você olhar por cinco segundos e saber se precisa
entrar.

## 5. A esteira: três encaixes, e os agentes que você põe neles

A parte mais estruturante das suas respostas, e a que não estava na v0.1:

> *"o agente que faz o review é diferente do agente que implementa, que devem ser diferentes do
> agente que testa."*

| Encaixe | O que faz | O que recebe | O que produz |
|---|---|---|---|
| **implementador** | escreve o código, commita, empurra, abre a PR | o corpo da tarefa | commits, PR, e um resumo do que fez |
| **revisor** | lê o diff contra a intenção, as regras do repositório e a memória do workspace | o diff + o corpo da tarefa | aprova ou reprova, **com parecer** |
| **testador** | **usa o produto como usuário** — clica a UI, chama o endpoint, procura borda | acesso ao workspace inteiro, e se vira | passa ou reprova, com o passo a passo |

### 5.1 Encaixe não é agente

Um papel aqui **não é uma constante do código**: é um encaixe que aponta para um **agente nomeado**, e
você configura qual, **com granularidade de projeto** — sua resposta à
[Q23](open-questions.md#q23--papel-é-outro-agente-ou-o-mesmo-agente-com-outra-instrução):

> *"o adaptador é irrelevante nesse contexto, o usuário pode configurar como quiser. (…) o usuário
> deve poder customizar esses papéis com granularidade de projeto, então ele pode ter um revisor
> diferente para cada projeto."*

Então existe um **catálogo de agentes nomeados** — nome, adaptador, modelo, instrução, faixa de
permissão e orçamento — e a resolução é em cascata: **tarefa → projeto → workspace → default**. Um
`revisor-severo` no `acme-api` e um `revisor-rapido` no `acme-web` são configuração, não código.

> **Nota do desenho — duas coisas se chamam "agente".** A
> [second-agent](../021-second-agent/prd.md) pôs no rodapé da sidebar um cabeçalho **Agentes** com uma
> linha por `claude` e `codex`, que são **adaptadores**: transporte, versão fixada, login. O catálogo
> desta feature traz `revisor-severo`, `testador`, `revisor-so-leitura` — que também se chamam
> agentes, e que *apontam* para um adaptador. A cascata desta seção é impossível de escrever em
> português com as duas pontas usando a mesma palavra. A proposta do desenho custa uma palavra — o
> rodapé passa a dizer **Adaptadores** — **aceita em 2026-09-12**
> ([Q35](open-questions.md#q35--o-rodapé-da-sidebar-passa-a-dizer-adaptadores)). A partir daqui, neste
> documento e na tela, **adaptador** é por onde o agente fala (`claude`, `codex`) e **agente** é o que
> você nomeia, instrui e dá orçamento (`revisor-severo`). A nota entra no requisito do rodapé da
> [`021`](../021-second-agent/prd.md) quando esta PRD sair de proposta — ver §7.

> **Nota — o encaixe se chama `implementador`, não `executor`**
> ([Q34](open-questions.md#q34--o-encaixe-se-chama-executor-ou-implementador), respondida em
> 2026-09-12). Quem cobrou o nome foi o selo do cartão: de `revisor` e `testador` saem `revisando` e
> `testando` sem atrito, mas de `executor` sai `executando`, que num produto de agente quer dizer
> *rodar comando* — e não é isso que ele está fazendo. A PRD já usava os dois nomes; agora usa um.

**O catálogo mora no Lumem na v1**, com tela. Definir agente em **arquivo do repositório**
(`<repo>/.lumem/agents/*.md`, como o Compozy) vem depois, e entra pelo **mesmo portão de confiança**
que a [project-scripts](../012-project-scripts/prd.md) criou para o `[scripts]` clonado — é conteúdo
executável vindo de um repositório, e esse portão já existe.

É a forma do [Compozy](../../references/compozy.md), que você citou como a melhor referência de
extensibilidade: lá o agente é um arquivo com prompt, e o papel é um **input tipado com default**
(`implementer: { type: agent, default: code_implementer }`).

**O que fica fixo, e por quê:** são **três** encaixes na v1. Cada encaixe é uma seta no quadro, então
um quarto papel é uma coluna nova — e aí o quadro deixa de ter forma. A extensibilidade é de *quais
agentes*, e essa cabe inteira; a de *quantas etapas* é o grafo declarativo do Compozy, e é outra
feature. Os detalhes estão na [Q33](open-questions.md#q33--agentes-nomeados-e-papel-por-projeto), toda
respondida.

### 5.2 O que a esteira exige para funcionar

- **contexto independente é o ponto.** Um revisor que herdou a conversa do implementador herdou os enganos
  dele. Sessões separadas, históricos separados. Dois agentes nomeados diferentes são mais
  independentes que duas sessões do mesmo — mas isso é escolha sua, não regra;
- **permissão e orçamento moram no agente, não no encaixe.** Assim um `revisor-so-leitura` existe de
  verdade: ele **não consegue** escrever, em vez de ter sido instruído a não escrever. Instrução não é
  limite;
- **reprovar tem que ser barato e possível.** Um revisor que só aprova é um carimbo. O caminho de
  volta é o UC2, com teto de duas voltas;
- **o testador é do workspace, não do projeto** — é ele que pode subir `acme-api` e `acme-web` juntos
  (UC4). Na v1, a régua dele é baixa de propósito: *"ele se vira, não precisa estar perfeito"*
  ([Q29](open-questions.md#q29--quem-sobe-os-outros-projetos-para-o-teste)). O que a v1 garante é o
  **acesso**, não a esperteza — e o parecer dele é informação, não portão.

**O CI é portão, não papel.** Para sair de In Progress, os checks têm que estar verdes; para avançar
depois, rodam de novo. Ele não opina — só deixa passar ou não.

## 6. Escopo

### F1 — O quadro

As colunas do §4 na tela do workspace, com o cartão do §4.2 e o selo do §4.1, arrastar, filtro por
projeto, por agente e por "precisa de mim", a ordem como prioridade, e os dois limiares de encalhe — **30 min / 2 h** nas etapas da máquina,
**4 h / 1 dia** no fim da esteira, e a To-Do não cobra. Tarefa `dropped` sai do quadro e vira arquivo.

**A largura tem piso, e o quadro diz quando não cabe.** Medido: a coluna tem piso de **200px** e a
sidebar são 264 fixos, então **5 colunas + 2 trilhos** (`Backlog` e `Done` recolhidos, o default)
pedem **1418px de janela**; abrir uma ponta pede 1582 e as sete abertas pedem 1746. Abaixo disso o
quadro **rola na horizontal e avisa** — uma faixa dizendo *"2 colunas fora da tela"*, em vez de
fingir que cabe ([Q37](open-questions.md#q37--abaixo-de-1418px-o-que-o-quadro-faz)). Encolher a
coluna abaixo de 200 não é saída: o título vira três linhas e a linha viva perde o nome do arquivo.
**Este é o primeiro requisito de largura mínima do produto**, e ele existe porque o quadro é a
primeira tela que precisa mostrar sete coisas ao mesmo tempo.

### F2 — A esteira

O daemon **puxa da fila sem ninguém pedir** — e a fila é *todo cartão cuja etapa é devida e que não
tem trabalhador* (§4.1), da direita para a esquerda, respeitando o teto e o orçamento. Para um cartão
na To-Do isso significa: criar a worktree (a [worktree-from](../026-worktree-from/prd.md) já sabe cortar
de issue, branch ou PR), rodar o `setup`, e abrir a sessão do **implementador** com o corpo da tarefa. Para
um cartão em In Review, significa abrir a sessão do **revisor** com o diff. Mesma regra, encaixe
diferente — e cada parecer fica registrado na tarefa.

O daemon é também **quem move a seta**, sempre por fato verificável, e nunca por um agente pedindo.

**O interruptor da autonomia é do workspace e nasce desligado:**

| Nível | O quê |
|---|---|
| `manual` | nada anda sozinho. É o Lumem de hoje, e é o default |
| `assistido` | ele prepara tudo — worktree, sessão, prompt pronto — e **para antes de enviar** |
| `autônomo` | ele pega e vai, até Ready to Merge |

O `assistido` é o degrau que torna a feature adotável: você vê o que ele *ia* fazer, dez vezes, antes
de deixar ir sozinho.

### F3 — Orçamento e limites

Teto de custo **por tarefa**, teto de custo **por dia** no workspace, e teto de **turnos** por
sessão. Ao estourar: para, bloqueia, mostra o número, **não** reduz nem continua, e a worktree fica.
Mais o teto de tarefas em paralelo — **conta tarefas, não sessões** (default 1) — e o teto de duas
voltas da esteira.

**Estourar cota não é estourar orçamento.** Limite de taxa do agente produz `pausada`: não consome
orçamento nem turno, **libera a vaga**, retoma sozinha e não te notifica. Sem sinal de quando reabre:
**3 tentativas** com espera crescente e depois bloqueia. Espera maior que **4 h**: deixa de ser pausa e
vira bloqueio, porque aí você quer decidir
([Q32](open-questions.md#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio)).

**O bloqueio nomeia qual teto segurou.** O orçamento mora em dois lugares — no agente
([Q33](open-questions.md#q33--agentes-nomeados-e-papel-por-projeto)) e no workspace —, então *"parou
em US$ 0,50"* tem duas respostas possíveis, e mexer no teto errado não destrava nada. O cartão
bloqueado diz qual: *"parou no teto do agente `revisor-severo` — US$ 0,50 · 6 turnos"* contra *"parou
no teto do workspace — US$ 2,00 por tarefa"*, com um verbo só, que leva à tela onde aquele número
mora ([Q36](open-questions.md#q36--qual-dos-dois-tetos-segurou)).

> Estes números nascem como experimento, e a sua resposta à Q6 registra isso: eles vão mudar com uso.

### F4 — Supervisão, bloqueio e o volante

Os quatro estados do selo (§4.1) com o motivo em uma frase · notificação no Lumem e no sistema
operacional, **uma vez, sem repetir** · **assumir** (abre a conversa e desliga a autonomia daquela
tarefa) · **parar** (a worktree fica) · e, ao abrir o Lumem, o que aconteceu enquanto você não estava,
com o que ficou parado e há quanto tempo.

**O relógio do encalhe só conta o tempo em que o cartão podia ter andado:** esperar vaga não cobra —
isso é desenho, não problema —, esperar **você** cobra.

**E `Done` limpa:** checkout limpo com a PR mesclada → a worktree é removida sem perguntar; checkout
**sujo** → pergunta, dizendo o que se perde (*"3 arquivos não commitados"*), com o diff a um clique. O
interruptor *"PR mesclada sempre remove a worktree"* liga o primeiro caso para o segundo também, e o
texto dele diz o que você está autorizando ([Q27](open-questions.md#q27--done-remove-a-worktree-e-se-estiver-suja)).

### F5 — De onde as tarefas vêm

Quatro entradas, **um** quadro: você · um agente (para outro projeto, como proposta — UC8) · **um
tracker externo** · agendada (fora da v1, e anotada no backlog: *"é bem importante"*).

Do tracker: atribuir a uma **identidade Lumem** onde a ferramenta permitir, **rótulo `lumem`** onde
não permitir, e a tarefa cai **direto na To-Do** — o default é executar, e quem quiser triagem
configura. Linear é o primeiro; ClickUp, Jira e o resto entram pela mesma porta, sem um campo, uma
coluna ou uma tela que a entrada manual não tenha.

### F6 — O que o tracker vê acontecer

Comentário nos marcos: *"peguei"*, *"PR #87 aberta"*, *"travei em X"*, *"pronta para mesclar"*. E,
atrás de um mapa de colunas explícito por projeto, **mover o estado lá** conforme a coluna aqui.
Editar lá não edita aqui: espelho de mão dupla é onde mora a dor de duas fontes de verdade, e nada
no caso de uso pede por ele.

Tarefa externa que **muda no meio** — reatribuída, fechada, descrição editada — **bloqueia**, com o
motivo dizendo qual das três foi. Você decide. Nada é injetado no meio de um turno.

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| **Mesclar sozinho** | v1 não. É a única ação sem desfazer barato, e é o momento em que você aprende o que o agente fez. **O objetivo declarado é chegar lá** — com checks verdes, revisão aprovada e um interruptor por projeto |
| Tarefa recorrente / agendada | fora da v1, **anotada como importante**. Mesmo motor, outro gatilho |
| Sprint, estimativa, dependência, campo de prioridade | o quadro é para conferir, não para planejar |
| Roteamento esperto de agente por tipo de tarefa | encaixe é configuração sua, não adivinhação do Lumem |
| **Um quarto encaixe** (documentador, arquiteto), e etapa configurável | cada encaixe é uma seta no quadro. Etapas arbitrárias é o grafo declarativo do Compozy, e é outra feature |
| Vários usuários no mesmo quadro · várias máquinas | há um usuário, e o trabalho mora no seu disco |
| Espelho de mão dupla com o tracker | duas fontes de verdade |

## 7. O que isto contradiz, e o que fazer com isso

| Onde | O que está escrito lá | O que esta PRD faz |
|---|---|---|
| [`022`](../022-workspace-tasks/prd.md) §6 | *"**Não** virar gerenciador de projeto. Sem quadro, sem sprint"* | põe um quadro — e mantém o resto: sem sprint, sem estimativa, sem dependência. **Quando esta PRD sair de proposta, a nota entra no §6 da `022`**, com âncora para cá, delimitando o que sobrou de pé |
| [`022`](../022-workspace-tasks/prd.md) §4 | sincronizar com tracker está fora; *"referência por link, e só"* | escreve de volta, no nível 2 (comentário) e 3 (estado, atrás de mapa). Mesma nota, mesmo requisito |
| [`022`](../022-workspace-tasks/prd.md) §3.2 | *"`done` é humano"* | **reafirma**. O caminho até lá muda; o último passo não |
| [`021`](../021-second-agent/prd.md) — o rodapé da sidebar | o cabeçalho diz **Agentes**, com uma linha por `claude` e `codex` | renomeia para **Adaptadores** ([Q35](open-questions.md#q35--o-rodapé-da-sidebar-passa-a-dizer-adaptadores)). Aquilo sempre foi adaptador — a linha diz `conectado`, que é estado de login. **Mesma regra da `022`: a nota entra na `021` quando esta PRD sair de proposta.** O resto da `021` fica de pé inteiro: uma linha por adaptador, o `＋` no cabeçalho, os três estados |
| [backlog](../../project/backlog.md), seção C | *"Fila com lease"* é `G`, volta *"quando existir mais de um agente rodando sem você olhar"* | **é isto.** O gatilho foi atingido por este pedido |

A `022` **não** é superada: ela vem antes, entrega o modelo, e esta empilha em cima
([Q1](open-questions.md#q1--esta-prd-absorve-a-022-workspace-tasks)).

## 8. Riscos

| Risco | Como o produto se defende |
|---|---|
| **agente autônomo gastando em loop** | teto por tarefa, por dia e por turnos; teto de paralelismo; o `assistido` como degrau. É o risco nº 1, e é dinheiro real |
| **ping-pong entre revisor e implementador** | risco novo, criado pela esteira: dois agentes discordando queimam orçamento sem produzir nada. Teto de voltas, e bloqueia |
| **permissividade larga sem ninguém olhando** | é uma escolha deliberada (princípio 4) e ela tem preço. A defesa é a **borda**: larga dentro da worktree e dos scripts do projeto; fora dela, para. A [Q25](open-questions.md#q25--qual-é-a-borda-da-permissividade) é onde essa linha se escreve, e ela precisa ser escrita antes da primeira task |
| **`Done` remove a worktree** | e worktree removida com trabalho não commitado é trabalho perdido. A regra tem que ser: remove **se** estiver limpa e a branch tiver sido mesclada; senão recusa e diz por quê ([Q27](open-questions.md#q27--done-remove-a-worktree-e-se-estiver-suja)) |
| **o quadro mente** | coluna derivada de fato verificável, nunca de "o agente disse que terminou" — e o selo de quem está trabalhando é **derivado a cada leitura**, não guardado, então não pode divergir |
| **o selo se vê menos que uma coluna** | é o custo real de não ter as sub-colunas ([Q30](open-questions.md#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo)). A defesa é o encalhe: um cartão sem trabalhador por 30 min fica âmbar, e o filtro *"precisa de mim"* ordena pelo pior |
| **cota do agente parando a esteira** | `pausada` libera a vaga e retoma sozinha; e encaixes apontando para agentes diferentes fazem o limite de um não parar os outros |
| **aviso que se aprende a ignorar** | o relógio não conta espera por capacidade. Cobrar o que é desenho é a forma mais rápida de tornar o aviso invisível |
| **carimbo de revisão** | um revisor que nunca reprova é pior que nenhum. Medir a taxa de reprovação e **esperar** que não seja zero |
| **você para de ler o que o agente faz** | é o objetivo e o perigo ao mesmo tempo. `Done` é você, e a coluna Ready to Merge existe para que a leitura tenha um lugar |
| **duas fontes de verdade** com o tracker | escrita de volta é *o mínimo*: comentário, e estado só com mapa explícito |
| **cerimônia** — criar tarefa para agradar o daemon | medir sessões com tarefa ÷ sessões, e **esperar** que não seja 100% |
| **a máquina desligada** | aceitável, desde que o quadro diga o que ficou parado e há quanto tempo |

## 9. Como eu saberia que deu certo

Não é métrica de dashboard — é a frase que você vai dizer, ou não, depois de duas semanas:

1. **pelo menos uma tarefa por semana chega em Ready to Merge sem você ter aberto o Lumem para
   começá-la;**
2. você abre o quadro de manhã e ele responde *"precisa de mim?"* em menos de dez segundos;
3. o testador achou pelo menos um defeito que o CI não acharia — de preferência entre dois projetos
   (UC4). Se em um mês isso não acontecer, a coluna `Testing` está errada;
4. nenhuma surpresa de custo;
5. você **não** criou uma planilha paralela para saber o que os agentes estão fazendo.

## 10. O desenho, e o que ele mediu

> **Feito em 2026-09-11**, no projeto `lumem-os` do Open Design
> ([ADR](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)). O que entrou na sessão está no
> [design-brief.md](design-brief.md); o que saiu está nos arquivos.

| Arquivo | O quê |
|---|---|
| `lumem-board.html` + `lumem-board.css` | **novo**, 11 quadros. O quadro, o cartão, os cinco estados do selo, o encalhe, as quatro razões de bloqueio, o detalhe da tarefa, a triagem, o quadro desligado, a volta e a conexão caída |
| `lumem-agents.html` + `lumem-agents.css` | **novo**, 8 quadros. O catálogo, as três faixas de permissão, o `revisor-so-leitura`, a cascata, a autonomia com o orçamento ao lado, e o adaptador que sai debaixo do agente |
| `tokens.css` | **editado.** `--size-board-col: 200px` e `--size-board-rail: 36px` |

O repositório **ainda não foi sincronizado** (`pnpm --filter @lumem/web design:sync`): nada deste
lado lê os dois tokens novos, e trazer protótipo de desenho não aprovado só cria ruído no diff. O
sync é o primeiro passo de quem abrir o `tasks.md`.

Os sete itens que o §10 pedia estão cobertos. **`lumem-worktree-from.html` não foi editado**: a
primeira aba da worktree dizer para qual tarefa ela existe depende da `022` estar de pé — é a `022`
que cria a entidade —, e desenhar contra um modelo que não existe é desenhar duas vezes.

### 10.1 As três medidas

Busca binária no navegador, estreitando a janela até o primeiro pixel de rolagem — não aritmética,
que erra por borda e por arredondamento de `flex`.

| Medida | O que o briefing supôs | O que o navegador deu |
|---|---|---|
| **3.1 — sete colunas cabem?** | coluna de 240px, `1680px` de faixa | **200px é o piso** (abaixo disso o título vira três linhas e a linha viva perde o nome do arquivo). Então sete colunas pedem **1746px de janela**, 6+1 pedem **1582**, e **5+2 pedem 1418** |
| **3.2 — quantos cartões por coluna?** | *"menos de quatro = item demais no cartão"* | **cinco** sem rolar numa coluna de 682px, **quatro** quando todos têm linha viva. Passou, e sem cortar nada |
| **3.3 — o selo grita?** | talvez o âmbar precise entrar antes dos 30 min | **grita — e não pela cor.** Pela **altura**: as mesmas três tarefas medem 114px sem trabalhador e 144px com, porque a linha viva só existe quando alguém está lá. O limiar de 30 min fica onde estava |

### 10.2 O que o desenho mudou

Seis coisas, e as quatro primeiras contradiziam esta PRD. **As quatro viraram pergunta e as quatro
foram respondidas em 2026-09-12, todas na proposta** — cada uma com nota no requisito contradito:

1. **as duas pontas recolhem, e o motivo não é espaço.** `Backlog` e `Done` são as duas únicas
   colunas **sem linha viva e sem relógio**: não são a esteira. Recolher a esteira seria mutilar o
   quadro; recolher as pontas é dizer o que elas já são. O default em 1440 é **cinco colunas e dois
   trilhos** (§4.1 continua valendo inteiro);
2. **o selo tem cinco estados** — falta `manual — ninguém pega` na lista do §4.1, e ele é o default do
   produto;
3. **o selo diz o verbo, e a coluna diz o papel** — `revisando há 2 min`, não
   `revisor trabalhando há 2 min`, que não cabe em 151px. O verbo cobrou o nome do encaixe, e ele
   virou **`implementador`** ([Q34](open-questions.md#q34--o-encaixe-se-chama-executor-ou-implementador));
4. **o rodapé da sidebar deixa de se chamar "Agentes"** e vira **Adaptadores** (§5.1 e §7), senão a
   cascata não é escrevível em português;
5. **a barra de 2px do cartão carrega um eixo só** — o selo. O encalhe mora no relógio do rodapé e a
   agregação no ponto do cabeçalho da coluna: três lugares, três perguntas;
6. **`aguardando você` é luminância, não matiz.** Vermelho é *"algo deu errado e a decisão é sua"*;
   branco é *"nada deu errado e a vez é sua"*. Dois estados que precisam de você e que você precisa
   distinguir de longe, sem gastar um matiz novo.

E **quatro defeitos apareceram de graça**, nenhum deles visível lendo o código: o corte de três
linhas numa caixa acolchoada pinta uma fatia da quarta (o cartão bloqueado *parecia quebrado* justo no
estado em que mais precisa ser lido); a peça de caminho do sistema comeu `diff` e deixou
`lendo o di…6 arquivos` porque ela assume que a primeira metade é diretório descartável; a lista de
*"não pode"* do `revisor-so-leitura` estava em `text/disabled`, que dá **2,84:1** — texto que a pessoa
precisa **ler** para acreditar que o limite é real; e a triagem dizia *"duas origens, duas cores de
contorno"* usando `session-agent` e `text-link`, que **são o mesmo `brand-400`** — duas cores
idênticas afirmando serem diferentes. Esse último só apareceu quando um terceiro tipo chegou e pediu
uma terceira cor, e o conserto é a regra nº 1 da casa: **origem é categoria, então é glifo** —
`◆` agente, `↗` tracker, `◈` memória —, e a barra única diz o estado que as três compartilham.

### 10.4 A triagem deixou de ser desta feature

A [T4 da `022`](../022-workspace-tasks/open-questions.md), respondida em 2026-09-12, decidiu que
existe **uma fila só de propostas**, chamada **Propostas**, no topo da tela do workspace — e que a
inbox de propostas da **memória** sai de dentro do `MemoryPanel` e sobe para ela. O quadro 7 do
`lumem-board.html` já tinha escolhido esse lugar, antes da resposta, pelo motivo certo (*"uma
proposta que exige navegar é uma proposta que apodrece"*), e foi **atualizado para mostrar os três
tipos**.

Consequência para esta PRD: **a superfície é da `022`, não desta.** O que a `028` acrescenta a ela é
volume — com a esteira ligada, três agentes por tarefa propõem muito mais —, e o volume é o argumento
que fez a T4 sair da aba para o topo da tela.

**E em 2026-09-12 isso virou código de folha:** a fila canônica nasceu em `lumem-tasks.css` como
`.pq`, a cópia `.tri` do `lumem-board.css` foi **apagada**, e o `lumem-board.html` passou a linkar a
folha da `022`. A cópia já havia divergido — o defeito das "duas cores de origem" registrado no §10.2
morava só nela.


### 10.3 O que o desenho **não** decidiu

`.tcard`, `.seal` e `.col` nasceram em `lumem-board.css` e **não** em `lumem-ds.css`, contra o §1 do
briefing. O motivo é de ordem: promover ao sistema antes de o sistema saber que está certo é como um
design system apodrece — e a medida 3.1 quase derrubou a forma do cartão. Eles sobem quando o desenho
for aprovado.

## 11. A conversa técnica, guardada

Fora deste documento **de propósito**, e nada aqui é pequeno:

- **como o evento externo chega**: polling × webhook × relé hospedado — latência, infra, e o que
  acontece com a máquina desligada;
- **segredo**: um relé multiusuário guardaria credencial de escrita no tracker de terceiros, o que
  contraria de frente o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)
  (*"o Lumem não guarda segredo"*). Reverter aquilo, se for o caso, é um ADR novo;
- **as quatro autenticações distintas**: autenticidade do webhook, identidade da máquina, credencial
  para escrever no tracker, e o [daemon-auth](../019-daemon-auth/prd.md) local — o único já escrito, e
  cuja fase 1 não depende de nada disto;
- **entrega no mínimo uma vez**: webhook chega duplicado e fora de ordem. Idempotência e guarda de
  estado não são opcionais;
- **lease, heartbeat e recuperação** de tarefa cuja sessão morreu — o item `G` do backlog, agora
  disparado, e a peça técnica que sustenta o selo do §4.1. O [estudo do Compozy](../../references/compozy.md)
  tem os invariantes já projetados (um dono por run, fencing por sessão, devolução por expiração,
  contador de recuperação durável) e vale ler antes de desenhar os nossos;
- **o limite de taxa como sinal**: hoje o `rateLimitOf` está quebrado para o adaptador `0.75.1`, e a
  [adapter-provenance](../027-adapter-provenance/prd.md) é quem conserta. Sem ele, a `pausada` da
  [Q32](open-questions.md#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio) não sabe até quando esperar;
- **três sessões por tarefa**: como orquestrar, o que passa de uma para outra, e o que **não** passa;
- **detectar que o agente fez uma pergunta** em vez de ter terminado;
- **camada gerenciada** (Composio, Nango, Pipedream) como alternativa a construir o relé.

## 12. Custo nos testes

A escrever depois das nove perguntas. O que já dá para dizer: o e2e desta feature roda **a esteira
inteira com agentes falsos e zero token** — a tarefa entra na To-Do, o daemon pega sozinha, a
worktree nasce, o implementador falso abre PR, o CI falso fica verde, o revisor falso aprova, o
testador falso passa, e o cartão para em **Ready to Merge** e **não** é mesclado. Mais o caminho
vermelho do UC2: revisor falso reprova, volta para In Progress, segunda reprovação bloqueia.

E dois que a v0.3 acrescenta, e que são os que provam o §4.1: **(a)** com o teto ocupado, um cartão
que chega em In Review fica `aguardando revisor` e o quadro **não** mostra ninguém trabalhando nele;
quando a vaga abre, o mesmo cartão passa a `revisando`. **(b)** matar a sessão do revisor no meio faz
o selo voltar para `aguardando` **na próxima leitura**, sem nenhuma escrita — que é o teste de que ele
é derivado e não guardado.

Se esses testes não forem escrevíveis, o modelo de estado está errado.

Portão: `gate:full`.
