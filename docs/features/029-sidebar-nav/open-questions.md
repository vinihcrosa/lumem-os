# O bloco de navegação da sidebar — perguntas

**PRD:** [prd.md](prd.md) · **Desenho:** `lumem-sidebar-nav` no Open Design

**Estado:** 7 perguntas · **7 respondidas** (2026-09-14) · **nenhuma aberta**.

Cinco nasceram no desenho, a [Q3a](#x-q3a--a-tela-ainda-se-chama-quadro-quando-se-chega-por-tarefas)
veio da resposta da Q3, e a [Q6](#x-q6--em-que-idioma-ficam-os-caminhos) veio de fora dela. **Três
foram respondidas contra a proposta**, e nos três casos a proposta fica escrita dentro da resposta
que a derrubou — decisão revertida sem registro é decisão que volta sozinha.

---

### [x] Q1 — A tela de Home continua tendo a seção `TAREFAS`?

Hoje a tela do workspace tem a seção com a lista e um botão `quadro`, que abre a outra visão. Com
`Tarefas` ganhando endereço, dois botões saindo da mesma seção para duas telas diferentes parecem a
regra *uma ação, um lugar* ao contrário.

**Proposta pra reagir:** manter a seção como **resumo** e trocar o botão por `ver todas`, apontando
para o mesmo lugar que a linha da sidebar. A alternativa é tirar a seção do Home — mais limpa, e
custa o Home deixar de dizer quantas tarefas o workspace tem.

**R (2026-09-14): sim, e sem mexer em nada dela** — o botão `quadro` incluído.

~~A proposta era trocar esse botão por `ver todas`.~~ **A resposta derruba a premissa:** com a
[Q3](#x-q3--o-quadro-é-uma-linha-própria), o botão `quadro` e a linha `Tarefas` vão para o **mesmo**
lugar. Não são duas saídas para duas telas — são duas entradas para uma, e a regra nunca proibiu
isso. O que ela proíbe é o mesmo verbo ter dois donos, e aqui o dono é um só.

---

### [x] Q2 — `Início` é o nome certo?

A tela se chama *a tela do workspace* em todo documento do produto, e o cabeçalho dela escreve
`dev · workspace`. Chamar a linha de `Workspace` repetiria a palavra que está 40px acima no seletor;
`Início` é o que todo mundo entende, e é genérico. A terceira saída é `Visão geral`, que descreve o
conteúdo e custa duas palavras numa coluna de 264px.

**R (2026-09-14): `Home`, em inglês.** *"É universal, todo mundo sabe o que significa."*

~~A proposta era `Início`.~~ **E o inglês não abre exceção nenhuma**, que era a única objeção real: a
comunicação do produto é em português, mas a interface já tem inglês onde a palavra é o termo — as
**sete colunas do quadro** são `Backlog`, `To-Do`, `In Progress`, `In Review`, `Testing`,
`Ready to Merge` e `Done`. `Home` entra numa regra que já estava escrita.

---

### [x] Q3 — O quadro é uma linha própria?

`Tarefas` abriria a lista, e a lista já tem o botão `quadro` ao lado do título — lista e quadro são
duas visões do mesmo assunto, e uma terceira linha na sidebar afirmaria que são dois assuntos.

**Proposta pra reagir:** não. Uma linha só, e ela abre a lista.

**R (2026-09-14): sim — e ela se chama `Tarefas`.**

~~A proposta era que `Tarefas` abrisse a lista, com o quadro atrás do botão que ela já tem.~~ **A
resposta inverte, e a inversão é melhor:** a lista **já tem endereço** — é uma seção do Home, que a
[Q1](#x-q1--a-tela-de-home-continua-tendo-a-seção-tarefas) acabou de manter. Quem não tinha endereço
era o quadro. Dar a linha à lista teria criado um segundo caminho para o que já se alcança chegando,
e deixado de fora justamente a tela que some.

**E o nome é o assunto, não a forma.** Da sidebar você quer *ver as tarefas*; *quadro* é como elas
aparecem. Chamar a linha de `Quadro` obrigaria a saber o formato antes de querer o conteúdo.

---

### [x] Q3a — A tela ainda se chama `Quadro` quando se chega por `Tarefas`?

Nasceu da resposta da Q3. O título da tela é `Quadro` e o caminho é `dev / Quadro`: clicar em
`Tarefas` e cair numa tela chamada `Quadro` é o clique e o pouso discordando.

**Proposta pra reagir:** o título vira `Tarefas` — o subtítulo já diz *"todas as tarefas deste
workspace, em uma tela"*, então só o rótulo passa a ser o assunto.

**R (2026-09-14): `Quadro de tarefas`** — e a linha da sidebar continua `Tarefas`.

~~A recomendação era o título virar `Tarefas`.~~ **A resposta concorda melhor, e por um motivo que a
recomendação não tinha:** *"tarefas podem ser visualizadas como lista, quadro, gantt, ou qualquer
outra forma"*. O título `Tarefas` teria apagado **qual** visão você está olhando — e apagado
justamente no dia em que existir uma segunda.

O nome inteiro diz as duas coisas: `quadro` é a forma, `de tarefas` é o assunto. A sidebar fica com o
assunto porque é de lá que se escolhe *o quê*; a tela fica com os dois porque é nela que se está.

**Dois lugares mudam** — o título (`.bd__t`) e o último segmento do caminho (`.crumb__here`). O botão
`quadro` da seção do Home **fica**: ali você escolhe uma visão, e o nome da visão é o certo naquele
lugar.

---

### [x] Q4 — E `Criar` e `Buscar`, que o Conductor tem?

A referência que originou o pedido tem quatro linhas: `Dashboard`, `Home`, `Create`, `Search`.

**R (2026-09-14): fora — e a referência é inspiração, não especificação.** A captura mostrou **onde**
o bloco fica; o que entra nele é decisão deste produto.

`Criar` já tem lugar: a [`017-sidebar-actions`](../017-sidebar-actions/prd.md) decidiu que *a ação
mora no cabeçalho da lista que ela alimenta* — o `＋` de `Projetos` e o da linha de cada projeto. Um
terceiro caminho para o mesmo verbo é a regra ao contrário.

`Buscar` não existe no produto, e uma linha que abre uma tela que ninguém escreveu é pior que não ter
a linha. Está no [backlog](../../project/backlog.md) como paleta `⌘K`, desde a `008`.

---

### [x] Q5 — O bloco muda quando o workspace muda?

**R (2026-09-14): não muda de forma; muda de dado.** As duas linhas são do **workspace selecionado**
— é o escopo do seletor logo acima —, então trocar de workspace troca o número e para onde as linhas
vão, e não quantas linhas existem.

É o mesmo escopo que o quadro já tem: ele é do workspace, e a lista dentro de um projeto nem oferece
o botão.

---

### [x] Q6 — Em que idioma ficam os caminhos?

Veio de fora do desenho, respondendo ao nome da tela: se a interface é em português, o caminho
também é?

**R (2026-09-14): inglês, todos.** *"Em algum momento a gente vai internacionalizar esse app, então é
bom manter os caminhos em inglês."* Estas duas telas seriam `home` e `tasks`.

**E ela não contradiz o produto ser em português:** um caminho não é texto de interface, é
**identificador** — do mesmo lado da linha que o nome de arquivo e o nome de variável, que a
convenção do repositório já manda escrever em inglês. O que se traduz é o rótulo `Tarefas`; o que não
se traduz é para onde ele aponta.

**A alternativa real é caminho localizado** — `/tarefas` em pt, `/tasks` em en —, e ela custa o que
parece ganhar: o mesmo lugar passa a ter dois endereços, um link colado no chat abre errado para quem
está no outro idioma, e cada rota vira uma tabela de tradução para manter sincronizada com o
roteador.

**O custo de adotar agora é zero, e isso é o achado:** o aplicativo **não tem rota nenhuma** hoje. Só
o `/styleguide` é lido, e apenas em DEV — todo o resto é estado React, e o daemon devolve o mesmo
shell para qualquer caminho. Não há nada para migrar. O dia em que houver, cada rota já publicada é
um link que alguém guardou.

**Por que não virou ADR:** ele **extende** a linha *"código, commit e nome de arquivo em inglês"* em
vez de contradizê-la, e hoje falha o primeiro dos três testes — *difícil de reverter* —, justamente
porque não há rota. Ficou como convenção no [`CLAUDE.md`](../../../CLAUDE.md), com a data e com este
motivo escrito. **Quando o produto ganhar URL de verdade, ela passa nos três** — e aí vale abrir.

**O desenho do esquema de rotas continua fechado.** Esta resposta diz o idioma, não a forma:
`/tasks`, `/w/:id/tasks` ou outra coisa é pergunta que ninguém abriu, e ela só precisa ser aberta
quando o produto passar a ter URL. Está no [backlog](../../project/backlog.md).
