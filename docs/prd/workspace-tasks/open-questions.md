# Tarefa como entidade — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** ainda não

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo. As respostas daqui **alimentam** as Q011–Q015 do
[questions.md](../../project/questions.md), que só mudam quando você confirmar.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 10 perguntas · **0 respondidas**. A **T2** e a **T4** mudam o desenho; a **T10** herda
uma decisão já tomada; as outras mudam detalhe.

---

### [ ] T1 — Tarefa é obrigatória para abrir uma sessão de agente? *(Q011)*

Obrigar dá rastreabilidade total: toda sessão tem um "para quê". Custa cerimônia em cada "abre um
agente aqui rapidinho", que é o uso mais frequente.

**Proposta pra reagir:** não. Tarefa é para trabalho que você quer acompanhar; conversa é conversa. O
PRD mede a proporção e **espera** que não seja 100% — se for, o lugar da tarefa está errado.

**R:**

---

### [ ] T2 — Existe tarefa sem projeto?

Há tarefas de workspace de verdade: *"decidir se migramos a autenticação para o gateway"* não é de
um repositório. Mas tarefa sem projeto não tem onde virar worktree, e "escolha o projeto depois" é
um estado a mais em toda tela.

**Proposta pra reagir:** **não, na v1.** `project_id` obrigatório. Se doer, tornar nulo é uma
migração de uma linha e um estado de tela; o caminho contrário — preencher o que nasceu nulo — não
volta. O caso "decidir" cabe hoje como memória `domain` de workspace, que é onde uma decisão mora.

**R:**

---

### [ ] T3 — Prioridade, prazo, estimativa?

**Proposta pra reagir:** nenhum dos três. Nenhum agente precisa deles para trabalhar, e você já tem
um gerenciador para isso — o campo `links` aponta para lá. O que entra é **ordem**: a lista mostra
`review` e `in_progress` antes de `open`, e dentro de cada um, o mais recente primeiro.

**R:**

---

### [ ] T4 — Triagem de tarefa proposta: na inbox da memória, ou numa superfície própria?

O backlog dizia que *"a inbox de propostas da memória e a fila de tarefas são quase a mesma tela"*.
Quase. Uma proposta de memória vira **texto no acervo**; uma tarefa proposta vira **trabalho** num
projeto que não é o de quem propôs.

**Proposta pra reagir:** **mesma superfície, dois tipos.** A aba de inbox da `MemoryPanel` passa a se
chamar "Propostas" e lista os dois, com o tipo visível e a ação de cada um. Um lugar para "o que o
sistema quer que eu decida" é melhor que dois — e a alternativa, seção própria na tela do workspace,
é mais simples de implementar e pior de usar, porque você teria dois lugares para conferir de manhã.

**R:**

---

### [ ] T5 — "Trabalhar nesta tarefa" cria worktree sempre, ou pode usar uma existente?

O primeiro acesso ensina "toda tarefa vira uma worktree". Mas há tarefas de cinco minutos, e há a
worktree onde você já está.

**Proposta pra reagir:** cria por default, com a opção de escolher um checkout existente — inclusive
o `local`. A frase do onboarding é a proposta de trabalho, não uma trava. O que **não** pode é a tarefa
ficar sem `worktree_id` depois de alguém trabalhar nela.

**R:**

---

### [ ] T6 — O corpo da tarefa é enviado como primeiro prompt, ou pré-preenche o composer?

Enviar automaticamente é um clique a menos. Pré-preencher é você **ver** o que vai, editar, e só então
pagar.

**Proposta pra reagir:** pré-preenche. É a mesma regra do núcleo da memória: injeção invisível é
proibida, e um prompt disparado sem você ler é uma injeção que custa dinheiro.

**R:**

---

### [ ] T7 — Como o agente diz "terminei"? *(Q069)*

`turn_end` é fim de turno, não de trabalho — a armadilha nomeada na Q069. Hook de `Stop` idem. O
agente pode: (a) não dizer nada, e você marca; (b) marcar `review` por `POST /tasks/:id/review`,
ensinado pela skill.

**Proposta pra reagir:** (b), e a Q069 **continua aberta** para o sinal canônico. `review` é uma
sugestão com proveniência; `done` é você. Se na prática o agente nunca chamar, o dado diz isso e (a)
é o que sobra sem custo.

**R:**

---

### [ ] T8 — Orçamento de tarefas criadas por sessão?

**Proposta pra reagir:** cinco, por `LUMEM_TASKS_BUDGET`, como o orçamento do auto-learn. Acima disso o
`POST` recusa com a frase que diz que o orçamento acabou — e a recusa fica na transcrição, porque o
agente vai dizer que tentou.

**R:**

---

### [ ] T9 — Quem pode marcar `done`?

**Proposta pra reagir:** só humano. `done` fecha custo, fecha worktree como candidata a remoção, e
alimenta "o que este workspace fez". Um agente que se declara pronto está em `review`, que é a palavra
certa para o que ele sabe.

**R:**

---

### [ ] T10 — Remover projeto leva as tarefas junto?

A [WS-Q22](../walking-skeleton/open-questions.md) decidiu, em 2026-09-01, que remover projeto **por
caminho** cascateia o registro das worktrees numa transação, sem tocar no disco, e com uma confirmação
que nomeia o número. Tarefa é registro puro — não tem diretório para preservar.

**Proposta pra reagir:** vai junto, na mesma transação, e a confirmação passa a nomear as duas contas
(*"e o registro de 3 worktrees e 5 tarefas?"*). `RESTRICT` aqui repetiria o bug que a WS-Q22
consertou: todo projeto real teria tarefa, e o botão voltaria a não funcionar. `session.task_id` fica
nulo, como a sessão já sobrevive à worktree. No projeto clonado a worktree bloqueia antes, então a
pergunta nem chega às tarefas.

**R:**
