# As ações da árvore — perguntas

**PRD:** [prd.md](prd.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **6 respondidas**, todas no desenho de 2026-09-01.

---

### [x] Q1 — O `+` da linha do projeto está sempre visível, ou só no hover?

Sempre visível põe um botão em toda linha de projeto — ruído numa coluna de 260px, e concorre com o
`count` de sessões rodando, que ocupa o mesmo canto direito. Só no hover esconde a ação de quem
navega por teclado, a não ser que apareça também no foco.

**Proposta pra reagir:** aparece no **hover e no foco**, e o `count` tem precedência: uma linha com
sessões rodando mostra o número, e o `+` entra no lugar dele enquanto o ponteiro está em cima. Quem
usa teclado chega pelo `Tab`, que é foco.

**Custo de esperar:** trava o desenho da linha, que é a peça nova do design system.

**R:** hover e foco, sim — mas o contador **não** cede o lugar. O desenho reservou os 24px
**sempre**, invisíveis em repouso.

**Decisão:** o `+` aparece no **hover e no foco**, num slot de 24px que existe em toda linha de
projeto — inclusive nas que não oferecem ação. Reservar é o que impede a linha de se reorganizar
debaixo de uma mão que já está a caminho do clique: sem o espaço guardado, o label encolhe e o
contador anda 24px para a esquerda no instante exato da mira. Com ele guardado, não há o que
disputar, e por isso a precedência da proposta ficou desnecessária — uma linha com três sessões
rodando continua dizendo três enquanto você mira o `+`. Custa 24px de label na linha **menos**
indentada da árvore, que é a que mais tem sobra. A worktree não ganha slot: ela não acrescenta nada
abaixo de si.

---

### [x] Q2 — Modal centrado, ou popover ancorado no `+`?

O modal centrado é o que a anotação pede — *"o pop up de adicionar projeto deve ser aberto no centro
da tela"*. Mas o de worktree é um formulário de um campo, e um véu de tela cheia para isso é pesado.

**Proposta pra reagir:** **os dois no centro, com véu.** Um é modal e o outro popover é duas
gramáticas para a mesma gramática de ação, e o de worktree cresce (aviso de repo sem commit, erro de
branch existente, e a [project-scripts](../project-scripts/prd.md) já quer rodar `setup` ao criar).

**Custo de esperar:** trava o desenho dos dois diálogos.

**R:** os dois no centro, com véu — como a proposta.

**Decisão:** **modal centrado para os dois**, `420px` (`--size-dialog-width`), véu derivado de
`--color-bg-inset` a 68%, elevação `xl`. Um modal e o outro popover é duas gramáticas para a mesma
ação. E o de worktree cresce: aviso de repo sem commit, erro de branch existente, e a
[project-scripts](../project-scripts/prd.md) já quer rodar `setup` ao criar. O cabeçalho do diálogo
diz **de onde a ação veio** (`em ■ lumem-os`), que é o que dispensa o seletor de projeto lá dentro.

---

### [x] Q3 — Com zero projetos, quem oferece a ação?

Hoje o `EmptyState` da árvore não tem ação porque o rodapé tinha. Tirando o rodapé, ou o cabeçalho
`Projetos` passa a existir mesmo vazio (com o `+`), ou o vazio ganha um botão próprio — e aí voltam a
ser dois.

**Proposta pra reagir:** o cabeçalho `Projetos` **sempre existe**, com o `+`, e o `EmptyState` fica
só com o texto. Um lugar, em todos os estados.

**Custo de esperar:** o primeiro acesso é a tela que menos pode ficar sem saída; ela é coberta pelo
e2e da [onboarding](../onboarding/prd.md).

**R:** o cabeçalho, como a proposta.

**Decisão:** o cabeçalho `Projetos` **existe em todos os estados**, com o `+`, e o `EmptyState` fica
só com o texto. Dar ação ao vazio traria de volta exatamente o que esta feature veio remover — dois
botões para um trabalho. É também por isso que o `+` do **cabeçalho** é o único sempre visível dos
dois: com zero projetos não há linha onde passar o ponteiro, e um botão que só aparece no hover, num
estado em que não existe nada para apontar, é uma saída que não existe.

---

### [x] Q4 — O `CreateWorktreeDialog` continua no `LocalPanel`?

Manter é dois caminhos para a mesma ação — o que a regra 2 do PRD recusa para o projeto. Tirar deixa
a aba de contexto do `local` sem a única ação que ela oferecia.

**Proposta pra reagir:** **sai do `LocalPanel`.** A ação passa a ser da árvore, e a aba de contexto
do `local` é para ler o checkout, não para criar irmãos dele.

**Custo de esperar:** baixo — dá para tirar depois. Mas atrasar deixa a inconsistência na tela.

**R:** sai, como a proposta.

**Decisão:** o `CreateWorktreeDialog` **sai do `LocalPanel`**. A aba de contexto do `local` é para
ler o checkout, não para criar irmãos dele. Sai na mesma entrega que põe o `+` na linha — deixar os
dois caminhos vivos por um tempo é a inconsistência que a regra 2 recusa.

---

### [x] Q5 — Onde mora um clone em andamento, se o diálogo é modal?

Um clone leva minutos. Hoje o progresso vive dentro do cartão do rodapé, que fica aberto. Um modal
que se fecha some com o progresso.

**Proposta pra reagir:** o modal **fecha ao começar o clone**, e o `CloneStatus` aparece **na árvore**,
como uma linha de projeto em estado `clonando`, com a barra dentro. É onde o projeto vai nascer, e é
onde já se olha para saber se ele chegou.

**Custo de esperar:** trava o desenho do estado transitório da linha.

**R:** na árvore, como a proposta — e metade disso o código já faz.

**Decisão:** o modal **fecha quando o clone começa**, e o `CloneStatus` aparece **na árvore**, com a
geometria de uma linha de projeto: mesmo glifo, mesma indentação, mesmo slot de 24px — carregando
`✕` em vez de `+`, porque enquanto clona a ação que a linha oferece é cancelar. A barra de progresso
fica embaixo, na largura da linha. O que muda no código é só o **hospedeiro**: hoje o `CloneStatus`
já mora fora do diálogo (no `sidebar__foot`), e o diálogo já fecha ao disparar o clone. A falha fica
até ser dispensada, num cartão próprio de 264px — o `.fail` do design system foi desenhado para o
painel central e quebra a URL no meio de um token dentro da coluna.

---

### [x] Q6 — Vale um atalho de teclado para criar worktree?

É a ação mais repetida do produto, e a única com candidato óbvio (`⌘N` no projeto selecionado).

**Proposta pra reagir:** **fora do v1**, e para o [backlog](../../project/backlog.md). Atalho global
precisa saber o que está em foco — e a mesma tecla dentro de um terminal ou de um editor pertence a
eles.

**Custo de esperar:** nenhum.

**R:** fora do v1, como a proposta.

**Decisão:** **fora do v1**, e registrado no [backlog](../../project/backlog.md). Atalho global
precisa saber o que está em foco — a mesma tecla dentro de um terminal ou de um editor pertence a
eles. O que o v1 entrega no lugar é o contrato de teclado do §8 do desenho: o `+` é alcançável por
`Tab`, aparece no foco sem depender do ponteiro, e o `Esc` devolve o foco a ele.
