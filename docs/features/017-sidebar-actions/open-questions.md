# As ações da árvore — perguntas

**PRD:** [prd.md](prd.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **6 respondidas** (2026-09-05), mais duas derivadas (Q1b, Q5a).

> **Duas foram respondidas contra a proposta, e contra o desenho.** O desenho no Open Design foi
> feito em 2026-09-01 e já decidia as seis; a **Q1** e a **Q5** foram revistas em **2026-09-05**,
> depois dele. O desenho foi **reescrito lá** e sincronizado — nenhuma das duas virou divergência
> entre a tela desenhada e a tela implementada. Ver
> [design-source-of-truth.md](../../project/design-source-of-truth.md).

---

### [x] Q1 — O `+` da linha do projeto está sempre visível, ou só no hover?

Sempre visível põe um botão em toda linha de projeto — ruído numa coluna de 260px, e concorre com o
`count` de sessões rodando, que ocupa o mesmo canto direito. Só no hover esconde a ação de quem
navega por teclado, a não ser que apareça também no foco.

**Proposta pra reagir:** aparece no **hover e no foco**, e o `count` tem precedência: uma linha com
sessões rodando mostra o número, e o `+` entra no lugar dele enquanto o ponteiro está em cima. Quem
usa teclado chega pelo `Tab`, que é foco.

**Custo de esperar:** trava o desenho da linha, que é a peça nova do design system.

**R:** **Sempre visível** — contra a proposta, e contra o desenho de 2026-09-01, que pintava o slot
só no hover e no foco.

O argumento que ganhou: criar worktree é a ação mais repetida do produto, e **ação que só existe
debaixo do ponteiro é ação que só se acha por acidente**. Um `+` terciário em repouso é mais barato
de ignorar do que um caminho invisível é de descobrir.

O que a proposta acertou e **fica**: o slot de 24px é **reservado sempre**, inclusive nas linhas que
não oferecem ação. Reservar é o que impede a linha de se reorganizar debaixo de uma mão que já está a
caminho do clique — sem isso o label encolhe e o contador anda 24px para a esquerda no instante exato
da mira. O hover deixou de **revelar** e passou a **confirmar**: ele escurece o glifo, não o
materializa.

**Decisão:** o `+` da linha de projeto está sempre na tela, em `--color-text-tertiary`, num slot de
`--size-target-min` reservado em toda linha de projeto. Hover e foco escurecem; não movem nada. O
custo — um botão por projeto o tempo todo — é pago com a cor: ele espera, não chama.

---

### [x] Q1b — Derivada da Q1: como o `+` convive com o `count` de sessões?

Os dois querem o mesmo canto direito.

**R:** **Lado a lado — `● 2  [+]`.** Nenhum dos dois cede.

Isto é consequência direta de o slot ser reservado: com o espaço já garantido, não há o que disputar.
Uma linha com três sessões rodando continua dizendo três enquanto você mira o `+`. O que paga a conta
é o **label**, que trunca antes — e a linha de projeto é a menos indentada da árvore, que é a que mais
tem sobra.

**Decisão:** ordem na linha é `seta · glifo · label · meta · count · slot`. O label é o único elástico.

---

### [x] Q2 — Modal centrado, ou popover ancorado no `+`?

O modal centrado é o que a anotação pede — *"o pop up de adicionar projeto deve ser aberto no centro
da tela"*. Mas o de worktree é um formulário de um campo, e um véu de tela cheia para isso é pesado.

**Proposta pra reagir:** **os dois no centro, com véu.** Um é modal e o outro popover é duas
gramáticas para a mesma gramática de ação, e o de worktree cresce (aviso de repo sem commit, erro de
branch existente, e a [project-scripts](../012-project-scripts/prd.md) já quer rodar `setup` ao criar).

**Custo de esperar:** trava o desenho dos dois diálogos.

**R:** **A proposta.** Os dois no centro, com véu.

**Decisão:** nasce um `Modal` no design system — invólucro centrado com véu, `role="dialog"`,
`aria-modal`, rótulo no título, foco preso enquanto aberto e devolvido a quem abriu. Os dois diálogos
existentes passam a ser **corpo** dele, e param de carregar o próprio gatilho.

---

### [x] Q3 — Com zero projetos, quem oferece a ação?

Hoje o `EmptyState` da árvore não tem ação porque o rodapé tinha. Tirando o rodapé, ou o cabeçalho
`Projetos` passa a existir mesmo vazio (com o `+`), ou o vazio ganha um botão próprio — e aí voltam a
ser dois.

**Proposta pra reagir:** o cabeçalho `Projetos` **sempre existe**, com o `+`, e o `EmptyState` fica
só com o texto. Um lugar, em todos os estados.

**Custo de esperar:** o primeiro acesso é a tela que menos pode ficar sem saída; ela é coberta pelo
e2e da [onboarding](../008-onboarding/prd.md).

**R:** **A proposta.** O cabeçalho existe em todos os estados — carregando, vazio, com erro e com
lista.

Dar uma ação ao vazio traria de volta exatamente o que esta feature veio remover: dois botões para um
trabalho, a uma mão de distância um do outro.

**Decisão:** `SidebarTree` desenha o cabeçalho **antes** de decidir o que vai abaixo dele. O `+` do
cabeçalho é o único caminho para o primeiro projeto, e é por isso que ele — diferente do da linha —
nunca dependeu de hover para nada: com zero projetos não há linha onde passar o ponteiro.

---

### [x] Q4 — O `CreateWorktreeDialog` continua no `LocalPanel`?

Manter é dois caminhos para a mesma ação — o que a regra 2 do PRD recusa para o projeto. Tirar deixa
a aba de contexto do `local` sem a única ação que ela oferecia.

**Proposta pra reagir:** **sai do `LocalPanel`.** A ação passa a ser da árvore, e a aba de contexto
do `local` é para ler o checkout, não para criar irmãos dele.

**Custo de esperar:** baixo — dá para tirar depois. Mas atrasar deixa a inconsistência na tela.

**R:** **A proposta.** Sai.

**Decisão:** o bloco `.actions` do `LocalPanel` some junto — ele existia só para hospedar esse botão.
A lista `Worktrees deste projeto`, que fica logo abaixo, continua sendo o lugar de **ler** as irmãs.

---

### [x] Q5 — Onde mora um clone em andamento, se o diálogo é modal?

Um clone leva minutos. Hoje o progresso vive dentro do cartão do rodapé, que fica aberto. Um modal
que se fecha some com o progresso.

**Proposta pra reagir:** o modal **fecha ao começar o clone**, e o `CloneStatus` aparece **na árvore**,
como uma linha de projeto em estado `clonando`, com a barra dentro. É onde o projeto vai nascer, e é
onde já se olha para saber se ele chegou.

**Custo de esperar:** trava o desenho do estado transitório da linha.

**R:** **O modal fica aberto até o clone terminar** — contra a proposta, e contra o desenho de
2026-09-01, que já tinha o `.crow` (a linha `clonando… 47%` com barra e `✕`) desenhado e argumentado.

O que ganhou: **um hospedeiro só**. O progresso, o cancelamento e as duas maneiras de acabar ficam no
mesmo lugar onde a pessoa apertou `clonar`. A alternativa tinha um segundo componente na sidebar
dizendo a mesma coisa com outra geometria, um segundo lugar para o mesmo `✕`, e um estado transitório
a mais na árvore.

**O que isso custa, sem eufemismo:** a tela fica presa por minutos. Não dá para abrir outra worktree,
ler um arquivo ou mandar um turno enquanto um clone grande roda. **Isso é escolha, não descuido** — e
o caminho de volta já está desenhado: é o quadro que a seção 5 do protótipo substituiu.

**Decisão:** o `AddProjectDialog` hospeda o `CloneStatus`. Só o **sucesso** fecha o diálogo; a falha
devolve o formulário com a URL onde estava, e o `tentar por ssh` fica a um clique de onde a pessoa já
está olhando.

---

### [x] Q5a — Derivada da Q5: `Esc`, `✕` e véu fecham durante o clone?

A [F1.7](prd.md) diz que os três fecham. A Q5 diz que o modal fica aberto até o fim. As duas não
podem valer ao mesmo tempo, e a F1.7 foi escrita antes da resposta.

**R:** **Enquanto clona, os três não fecham.** Ficam **desabilitados**, não ausentes — botão que some
é botão que se procura.

Fechar seria a única maneira de perder o progresso de vista, porque com a Q5 não existe segundo
hospedeiro. E a saída **existe e é uma**: `cancelar o clone`, que chama a mesma `project.cloneCancel`
que o `✕` da árvore chamaria. Nenhum caminho fica sem saída.

O rodapé do diálogo troca a promessa: `Esc fecha` vira `Esc não fecha enquanto clona`. Contrato que
muda em silêncio é pior que contrato ruim — quem aperta `Esc` e não vê nada acontecer aperta de novo,
mais forte.

**E ao recarregar a página com um clone vivo:** o diálogo **reabre sozinho**. O rodapé não hospeda
mais nada, então sem isso o progresso não teria onde aparecer. Vale também para um clone que **já
acabou** e ainda tem recado — uma falha, ou o sufixo de nome da F6.4 —, porque é justamente o F5 que
faria a mensagem sumir sem ninguém ler.

**Quando o clone acaba, as três saídas voltam a valer** — e fechar por elas **dispensa o desfecho**.
Sem isso o `✕` fica habilitado e não fecha: ele zera o `open`, o pedido de reabrir vê um desfecho não
lido e traz o diálogo de volta no mesmo ciclo. **Fechar à mão é ler**, e quem apertou `✕` em cima da
mensagem viu a mensagem. Achado na revisão da PR, e registrado como P8 no [tasks.md](tasks.md).

**Decisão:** a F1.7 passa a valer *"fecham, exceto enquanto um clone que este diálogo começou está em
andamento"*. Registrado no §3 do PRD.

---

### [x] Q6 — Vale um atalho de teclado para criar worktree?

É a ação mais repetida do produto, e a única com candidato óbvio (`⌘N` no projeto selecionado).

**Proposta pra reagir:** **fora do v1**, e para o [backlog](../../project/backlog.md). Atalho global
precisa saber o que está em foco — e a mesma tecla dentro de um terminal ou de um editor pertence a
eles.

**Custo de esperar:** nenhum.

**R:** **A proposta.** Fora do v1.

**Decisão:** vai para o [backlog](../../project/backlog.md), com o gatilho de volta escrito.
