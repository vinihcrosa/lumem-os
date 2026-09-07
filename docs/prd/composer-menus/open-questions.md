# Os menus do composer — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 5 perguntas · **5 respondidas** (2026-09-07), as três primeiras no Open Design, com o
desenho ao lado do estado de hoje — a folha é a `lumem-composer-menus.html`.

---

### [x] Q1 — Cada menu foge do recorte, ou o recorte sai?

O `.mmenu` já fugiu: ele ancora no `.composer`, fora da caixa. Dar a mesma fuga ao `.slash` é a
mudança menor — e deixa o `overflow: hidden` de pé, esperando o próximo popover.

O problema da fuga é que ela **não é de graça** para o seletor: o `.mmenu` fugiu com
`left: var(--space-20)` porque a pílula do Lumem é a primeira da barra. As pílulas do agente estão em
posições que só o navegador sabe — fugir com elas significa medir a pílula em JavaScript e posicionar
à mão, ou aceitar que os três menus abram no mesmo `x`.

**Proposta pra reagir:** tirar o `overflow: hidden`, **se** os cantos aguentarem. A caixa é um cartão
arredondado; alguém a recortou por algum motivo.

**R (2026-09-07):** **o recorte sai**, e o motivo é uma medição, não um argumento. Os dois cantos
foram desenhados lado a lado no navegador, com o mesmo texto no campo e a mesma barra embaixo:
**são o mesmo canto**. E não é acaso — nada dentro da caixa pinta até a borda. O campo é
`background: none`, a barra só tem `border-top`, e o único fundo é o da própria caixa (inclusive no
estado `--blocked`), que o `border-radius` arredonda sozinho.

A prova está no §2 da folha, e ela é o que autoriza a resposta: se houvesse diferença, a resposta
teria sido a outra — cada menu fugindo por conta própria, que é o que o produto vinha fazendo.

---

### [x] Q2 — Qual é o teto, e ele é de quem?

Sem recorte, o menu aparece inteiro; **não** passa a caber na janela. Vinte modelos dão 568px de
conteúdo, e o espaço acima do composer numa janela de trabalho é menor que isso.

Duas perguntas coladas: qual o valor, e em quais menus ele vale.

**Proposta pra reagir:** `--size-menu-max-h`, só no `.slash`, porque é o único que hoje é longo.

**R (2026-09-07, contra a proposta na segunda metade):** **280px, no `.slash` e no `.mmenu`.**

O valor: nove linhas de `--size-row-compact` (28px) inteiras, mais a décima pela metade. A
**meia-linha é o conteúdo da decisão** — um corte exatamente entre duas linhas desenha uma lista que
parece completa, e a pessoa não rola porque não tem por que rolar.

O escopo: o teto é do **menu**, não da lista que ele mostra hoje. O `.mmenu` tem três opções e nunca
vai rolar; um teto que só o menu de modelo tivesse seria um teto que o **próximo** menu longo não
tem — e esta feature existe porque exatamente isso aconteceu com o recorte.

Um detalhe que só apareceu renderizando: `overflow-y: auto` sozinho computa o eixo horizontal para
`auto` também, e o menu ganhava uma barra lateral por um pixel de arredondamento. É
`overflow: hidden auto` — a linha já resolve a largura truncando a descrição.

---

### [x] Q3 — Depois disso, onde o `.mmenu` ancora? (a pergunta que a issue mandou responder)

A issue pede para decidir "de uma vez se `.slash` e `.mmenu` passam a compartilhar a mesma fuga do
recorte, ou se continuam dois jeitos de resolver o mesmo problema".

**R (2026-09-07):** **nenhum dos dois compartilha fuga nenhuma, porque não há mais de que fugir.** A
âncora deixa de ser uma resposta a um recorte e volta a ser uma decisão de leitura, e ela vira uma
frase:

> **Um popover ancora no que o abre.**

| Popover | Âncora | Por quê |
|---|---|---|
| `.slash` do seletor | a pílula | quem abre é a pílula |
| `.slash` dos comandos | a caixa | quem abre é o campo de texto, e o campo **é** a caixa |
| `.mmenu` | a pílula | volta para ela: o `.composer` era fuga, e a fuga acabou |
| `.gate` | o composer | **a exceção, e ela não é sobre recorte** |

O `.gate` é a única exceção e ela é nomeada: o portão do `liberado` não é menu, é um cartão de 420px
— mais largo que a pílula que o originou —, e a pílula já saiu de cena quando ele aparece, porque o
menu que o abriu fechou. Alinhar um cartão desse tamanho com um objeto de 100px que não está mais na
tela seria alinhá-lo com nada.

---

### [x] Q4 — O teto é fixo, ou relativo à janela?

280px é um número. Uma janela baixa pode ter menos de 280px acima do composer — e aí o menu volta a
sair da tela, que é o defeito com outro dono.

As leituras: fixo; `min(280px, Xvh)`; ou medir o espaço em JavaScript e posicionar (com o menu
podendo abrir **para baixo** quando não couber).

**Proposta pra reagir:** fixo, e resolver o resto quando aparecer.

**R (2026-09-07):** **fixo.** A conta: numa janela de 600px de altura — abaixo do que se usa para
trabalhar, e abaixo de qualquer janela em que o Lumem já foi aberto — sobram ~380px acima do
composer, depois da topbar (40), da faixa de abas (~36) e do próprio composer (~120). O teto cabe
com folga, e cabe **porque** existe: sem ele, o problema não é o menu sair por cima, é ele ter 568px.

O `min(280px, Xvh)` foi recusado por um motivo de fonte: o vocabulário do Open Design é token em
`px`, e um `vh` no meio dele é um valor que a folha de design não sabe desenhar. E a terceira leitura
— medir e virar o menu para baixo — é uma feature de posicionamento, com estado, com re-medição no
`resize`, e ela não é esta. Foi para o [backlog](../../project/backlog.md), com o gatilho: **a
primeira janela real em que o menu não couber**.

---

### [x] Q5 — O que prova, se jsdom não faz layout?

O defeito é geometria, e o repositório inteiro de testes de componente é jsdom — onde toda largura é
zero e nada é recortado por nada. É por isso que o menu de comandos ficou invisível por três
features **tendo teste**.

**R (2026-09-07):** um e2e, e ele **não pergunta "está visível"**. `toBeVisible` continua verdadeiro
para um elemento recortado por um ancestral: ele está no DOM, tem caixa, tem tamanho. A pergunta que
distingue é a que o mouse faz — `document.elementFromPoint` no meio do elemento, e quem responde tem
que ser ele mesmo.

O adaptador é o fake com `LUMEM_FAKE_MANY_MODELS=1`: **vinte modelos, zero token**. Dois modelos
cabiam em qualquer menu, e é por caberem que o recorte atravessou três features sem aparecer — o
fake que existia não conseguia produzir o defeito.

Os três testes falham contra o código de antes, e foi conferido um por um: o do topo da lista e o dos
comandos falham com `o clique não chega nele`; o do teto falha com `o menu passou do teto de 280px`.
