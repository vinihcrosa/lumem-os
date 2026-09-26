# Tarefa como entidade — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** ainda não

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo. As respostas daqui **alimentam** as Q011–Q015 do
[questions.md](../../project/questions.md), que só mudam quando você confirmar.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 10 perguntas · **10 respondidas**, em 2026-09-12. Oito foram aceitas como propostas; a
**T4** e a **T8** foram respondidas depois de uma rodada de explicação, e **as duas mudaram** — a T4
para uma terceira forma que a pergunta não previa, e a T8 de unidade. As duas mudaram por causa da
[`028`](../028-autonomous-orchestration/prd.md), que não existia quando elas foram escritas.

---

### [x] T1 — Tarefa é obrigatória para abrir uma sessão de agente? *(Q011)*

Obrigar dá rastreabilidade total: toda sessão tem um "para quê". Custa cerimônia em cada "abre um
agente aqui rapidinho", que é o uso mais frequente.

**Proposta pra reagir:** não. Tarefa é para trabalho que você quer acompanhar; conversa é conversa. O
PRD mede a proporção e **espera** que não seja 100% — se for, o lugar da tarefa está errado.

**R:** não.

**Decisão:** tarefa **não** é obrigatória para abrir sessão de agente. Conversa é conversa. O
PRD mede `sessões com tarefa ÷ sessões` e **espera** que não seja 100% — se for, o lugar da tarefa
está errado.

---

### [x] T2 — Existe tarefa sem projeto?

Há tarefas de workspace de verdade: *"decidir se migramos a autenticação para o gateway"* não é de
um repositório. Mas tarefa sem projeto não tem onde virar worktree, e "escolha o projeto depois" é
um estado a mais em toda tela.

**Proposta pra reagir:** **não, na v1.** `project_id` obrigatório. Se doer, tornar nulo é uma
migração de uma linha e um estado de tela; o caminho contrário — preencher o que nasceu nulo — não
volta. O caso "decidir" cabe hoje como memória `domain` de workspace, que é onde uma decisão mora.

**R:** não, toda a tarefa tem um projeto

**Decisão:** `project_id` **obrigatório** na v1. Tornar nulo depois é uma migração de uma linha; o
caminho contrário — preencher o que nasceu nulo — não volta. Tarefa de decisão continua cabendo como
memória `domain` de workspace.

---

### [x] T3 — Prioridade, prazo, estimativa?

**Proposta pra reagir:** nenhum dos três. Nenhum agente precisa deles para trabalhar, e você já tem
um gerenciador para isso — o campo `links` aponta para lá. O que entra é **ordem**: a lista mostra
`review` e `in_progress` antes de `open`, e dentro de cada um, o mais recente primeiro.

**R:** nenhum dos tres.

**Decisão:** sem prioridade, sem prazo, sem estimativa. O que entra é **ordem**: `review` e
`in_progress` antes de `open`, e dentro de cada um o mais recente primeiro. O campo `links` aponta
para o gerenciador que tem esses campos.

---

### [x] T4 — Triagem de tarefa proposta: na inbox da memória, ou numa superfície própria?

O backlog dizia que *"a inbox de propostas da memória e a fila de tarefas são quase a mesma tela"*.
Quase. Uma proposta de memória vira **texto no acervo**; uma tarefa proposta vira **trabalho** num
projeto que não é o de quem propôs.

**Proposta pra reagir:** **mesma superfície, dois tipos.** A aba de inbox da `MemoryPanel` passa a se
chamar "Propostas" e lista os dois, com o tipo visível e a ação de cada um. Um lugar para "o que o
sistema quer que eu decida" é melhor que dois — e a alternativa, seção própria na tela do workspace,
é mais simples de implementar e pior de usar, porque você teria dois lugares para conferir de manhã.

**R:** uma fila só, "Propostas", no topo da tela do workspace, com os dois tipos.

**Decisão: uma fila só — e ela não fica em nenhum dos dois lugares que a pergunta ofereceu.**

A pergunta oferecia *aba do `MemoryPanel`* ou *seção própria*. A resposta é a substância da primeira
— **uma fila, não duas** — com o lugar de uma terceira: **o topo da tela do workspace**, acima da
lista de tarefas. Os dois tipos moram nela, com o tipo visível, a ação de cada um, e sempre **quem
propôs e de qual sessão**.

**Por que não a aba do `MemoryPanel`.** Duas coisas mudaram depois que esta pergunta foi escrita, e as
duas vêm da [`028`](../028-autonomous-orchestration/prd.md):

1. **o volume.** Quando a T4 nasceu, tarefa proposta era rara — só o caso cross-projeto, com você
   olhando. Com a esteira ligada, três agentes por tarefa rodando de madrugada propõem muito mais. Uma
   fila que enche sozinha tem que estar onde você já olha, não atrás de uma aba;
2. **o desenho já tinha ido para lá.** O quadro 7 do `lumem-board.html` pôs a triagem acima do quadro
   antes desta resposta existir, com o motivo escrito: *"uma proposta que exige navegar é uma proposta
   que apodrece"*. A resposta confirma o lugar e **acrescenta o segundo tipo**.

**O que isso custa, e é a única parte cara:** a inbox de propostas da memória **sai de dentro do
`MemoryPanel`** e sobe para essa fila. É mexer numa feature entregue — a
[`007`](../007-workspace-memory/prd.md) —, e a nota entra no requisito dela quando esta PRD sair de
proposta, pela mesma regra que a `028` aplica à `022` e à `021`.

**O que isso mata:** o não-objetivo *"não duplicar a inbox"* (§6) deixa de ser um cuidado e vira um
fato — não existe segunda inbox para duplicar. E o risco *"duas inboxes que parecem uma"* (§7) sai da
tabela pelo mesmo motivo.

---

### [x] T5 — "Trabalhar nesta tarefa" cria worktree sempre, ou pode usar uma existente?

O primeiro acesso ensina "toda tarefa vira uma worktree". Mas há tarefas de cinco minutos, e há a
worktree onde você já está.

**Proposta pra reagir:** cria por default, com a opção de escolher um checkout existente — inclusive
o `local`. A frase do onboarding é a proposta de trabalho, não uma trava. O que **não** pode é a tarefa
ficar sem `worktree_id` depois de alguém trabalhar nela.

**R:** concordo com a proposta.

**Decisão:** cria worktree por default, **com a opção** de escolher um checkout existente, inclusive o
`local`. A frase do onboarding é proposta de trabalho, não trava. O que não pode é a tarefa ficar sem
`worktree_id` depois de alguém ter trabalhado nela.

---

### [x] T6 — O corpo da tarefa é enviado como primeiro prompt, ou pré-preenche o composer?

Enviar automaticamente é um clique a menos. Pré-preencher é você **ver** o que vai, editar, e só então
pagar.

**Proposta pra reagir:** pré-preenche. É a mesma regra do núcleo da memória: injeção invisível é
proibida, e um prompt disparado sem você ler é uma injeção que custa dinheiro.

**R:** concordo.

**Decisão:** **pré-preenche** o composer. Mesma regra do núcleo da memória: injeção invisível é
proibida, e um prompt disparado sem você ler é uma injeção que custa dinheiro.

---

### [x] T7 — Como o agente diz "terminei"? *(Q069)*

`turn_end` é fim de turno, não de trabalho — a armadilha nomeada na Q069. Hook de `Stop` idem. O
agente pode: (a) não dizer nada, e você marca; (b) marcar `review` por `POST /tasks/:id/review`,
ensinado pela skill.

**Proposta pra reagir:** (b), e a Q069 **continua aberta** para o sinal canônico. `review` é uma
sugestão com proveniência; `done` é você. Se na prática o agente nunca chamar, o dado diz isso e (a)
é o que sobra sem custo.

**R:** b.

**Decisão:** (b) — o agente marca `review` por `POST /tasks/:id/review`, ensinado pela skill. `review`
é sugestão com proveniência; `done` é você. A **Q069 continua aberta** para o sinal canônico: se na
prática o agente nunca chamar, o dado diz isso e (a) é o que sobra sem custo.

---

### [x] T8 — Orçamento de tarefas criadas por sessão?

**Proposta pra reagir:** cinco, por `LUMEM_TASKS_BUDGET`, como o orçamento do auto-learn. Acima disso o
`POST` recusa com a frase que diz que o orçamento acabou — e a recusa fica na transcrição, porque o
agente vai dizer que tentou.

**R:** cinco, mas por tarefa — e com um lugar para configurar.

**Decisão: cinco por TAREFA, e é um ajuste visível, não uma variável de ambiente.**

**A unidade mudou, e o título da pergunta ficou velho.** *Por sessão* fazia sentido quando uma tarefa
tinha uma sessão. A [`028`](../028-autonomous-orchestration/prd.md) dá **três** a cada tarefa —
implementador, revisor, testador —, e aí *"cinco por sessão"* vira quinze por tarefa sem ninguém ter
decidido isso. As três sessões dividem o mesmo bolso, igual ao teto de custo, que já é por tarefa.

**E ele é configurável, com tela.** A proposta dizia `LUMEM_TASKS_BUDGET`, *"como o auto-learn"* — mas
o auto-learn não é variável de ambiente: é `autoLearnBudget`, um ajuste mostrado na
`memory.settings`. Um teto que você não vê é um teto que você não ajusta, e no dia em que ele recusar
você vai achar que é bug. Fica **no mesmo lugar dos outros tetos** — o painel onde a `028` põe
orçamento e teto de paralelismo —, e o número nasce em 5 para mudar com uso, como os outros.

**O que o teto protege, e é bom nomear:** não é o banco. Tarefa é registro puro; quinhentas linhas no
SQLite não custam nada. O que ele protege é **a sua atenção** — e sobretudo o caminho que **não**
passa por você: tarefa cross-projeto nasce `proposed` e cai na triagem, mas tarefa **para o próprio
projeto entra direto como `open`** (§3.2). É esse que o orçamento segura.

Ao estourar, o `POST` recusa com a frase que diz que o orçamento acabou, e **a recusa fica na
transcrição** — porque o agente vai dizer que tentou.

---

### [x] T9 — Quem pode marcar `done`?

**Proposta pra reagir:** só humano. `done` fecha custo, fecha worktree como candidata a remoção, e
alimenta "o que este workspace fez". Um agente que se declara pronto está em `review`, que é a palavra
certa para o que ele sabe.

**R:** concordo.

**Decisão:** só humano marca `done`. Um agente que se declara pronto está em `review`, que é a
palavra certa para o que ele sabe — e `done` fecha custo, fecha a worktree como candidata a remoção,
e alimenta "o que este workspace fez".

---

### [x] T10 — Remover projeto leva as tarefas junto?

A [WS-Q22](../001-walking-skeleton/open-questions.md) decidiu, em 2026-09-01, que remover projeto **por
caminho** cascateia o registro das worktrees numa transação, sem tocar no disco, e com uma confirmação
que nomeia o número. Tarefa é registro puro — não tem diretório para preservar.

**Proposta pra reagir:** vai junto, na mesma transação, e a confirmação passa a nomear as duas contas
(*"e o registro de 3 worktrees e 5 tarefas?"*). `RESTRICT` aqui repetiria o bug que a WS-Q22
consertou: todo projeto real teria tarefa, e o botão voltaria a não funcionar. `session.task_id` fica
nulo, como a sessão já sobrevive à worktree. No projeto clonado a worktree bloqueia antes, então a
pergunta nem chega às tarefas.

**R:** sim, vai junto.

**Decisão:** as tarefas vão junto, **na mesma transação** da WS-Q22, e a confirmação nomeia as duas
contas (*"e o registro de 3 worktrees e 5 tarefas?"*). `session.task_id` fica nulo. `RESTRICT` aqui
repetiria o bug que a WS-Q22 consertou.
