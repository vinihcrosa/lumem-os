# As ações da árvore — perguntas

**PRD:** [prd.md](prd.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **0 respondidas**.

---

### [ ] Q1 — O `+` da linha do projeto está sempre visível, ou só no hover?

Sempre visível põe um botão em toda linha de projeto — ruído numa coluna de 260px, e concorre com o
`count` de sessões rodando, que ocupa o mesmo canto direito. Só no hover esconde a ação de quem
navega por teclado, a não ser que apareça também no foco.

**Proposta pra reagir:** aparece no **hover e no foco**, e o `count` tem precedência: uma linha com
sessões rodando mostra o número, e o `+` entra no lugar dele enquanto o ponteiro está em cima. Quem
usa teclado chega pelo `Tab`, que é foco.

**Custo de esperar:** trava o desenho da linha, que é a peça nova do design system.

**R:**

---

### [ ] Q2 — Modal centrado, ou popover ancorado no `+`?

O modal centrado é o que a anotação pede — *"o pop up de adicionar projeto deve ser aberto no centro
da tela"*. Mas o de worktree é um formulário de um campo, e um véu de tela cheia para isso é pesado.

**Proposta pra reagir:** **os dois no centro, com véu.** Um é modal e o outro popover é duas
gramáticas para a mesma gramática de ação, e o de worktree cresce (aviso de repo sem commit, erro de
branch existente, e a [project-scripts](../project-scripts/prd.md) já quer rodar `setup` ao criar).

**Custo de esperar:** trava o desenho dos dois diálogos.

**R:**

---

### [ ] Q3 — Com zero projetos, quem oferece a ação?

Hoje o `EmptyState` da árvore não tem ação porque o rodapé tinha. Tirando o rodapé, ou o cabeçalho
`Projetos` passa a existir mesmo vazio (com o `+`), ou o vazio ganha um botão próprio — e aí voltam a
ser dois.

**Proposta pra reagir:** o cabeçalho `Projetos` **sempre existe**, com o `+`, e o `EmptyState` fica
só com o texto. Um lugar, em todos os estados.

**Custo de esperar:** o primeiro acesso é a tela que menos pode ficar sem saída; ela é coberta pelo
e2e da [onboarding](../onboarding/prd.md).

**R:**

---

### [ ] Q4 — O `CreateWorktreeDialog` continua no `LocalPanel`?

Manter é dois caminhos para a mesma ação — o que a regra 2 do PRD recusa para o projeto. Tirar deixa
a aba de contexto do `local` sem a única ação que ela oferecia.

**Proposta pra reagir:** **sai do `LocalPanel`.** A ação passa a ser da árvore, e a aba de contexto
do `local` é para ler o checkout, não para criar irmãos dele.

**Custo de esperar:** baixo — dá para tirar depois. Mas atrasar deixa a inconsistência na tela.

**R:**

---

### [ ] Q5 — Onde mora um clone em andamento, se o diálogo é modal?

Um clone leva minutos. Hoje o progresso vive dentro do cartão do rodapé, que fica aberto. Um modal
que se fecha some com o progresso.

**Proposta pra reagir:** o modal **fecha ao começar o clone**, e o `CloneStatus` aparece **na árvore**,
como uma linha de projeto em estado `clonando`, com a barra dentro. É onde o projeto vai nascer, e é
onde já se olha para saber se ele chegou.

**Custo de esperar:** trava o desenho do estado transitório da linha.

**R:**

---

### [ ] Q6 — Vale um atalho de teclado para criar worktree?

É a ação mais repetida do produto, e a única com candidato óbvio (`⌘N` no projeto selecionado).

**Proposta pra reagir:** **fora do v1**, e para o [backlog](../../project/backlog.md). Atalho global
precisa saber o que está em foco — e a mesma tecla dentro de um terminal ou de um editor pertence a
eles.

**Custo de esperar:** nenhum.

**R:**
