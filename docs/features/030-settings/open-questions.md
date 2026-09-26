# A tela de configurações — perguntas

**PRD:** [prd.md](prd.md) · **Desenho:** `lumem-settings` no Open Design (ainda não existe)

**Estado:** 10 perguntas · **10 respondidas** (2026-09-17) · **nenhuma aberta**.

Quatro são as que o **desenho** precisava — a [Q1](#x-q1--tela-cheia-ou-modal), a
[Q3](#x-q3--como-o-dono-de-cada-ajuste-fica-legível), a
[Q4](#x-q4--a-tela-só-muda-de-lugar-ou-passa-a-escrever) e a [Q5](#x-q5--por-onde-se-chega) —, e
**duas vieram contra a proposta**: a Q3 e a Q5. A quinta é a
[Q2](#x-q2--como-nasce-o-roteamento-e-quem-mais-ganha-endereço), respondida depois delas, e é a
única cuja resposta **criou uma feature** — a [LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030).

As quatro últimas fecharam no mesmo dia. Três confirmaram a proposta; a
[Q6](#x-q6--o-que-sobra-no-rodapé-da-sidebar) veio **contra** — *não sobra nada* —, e ela é a
terceira resposta desta feature a derrubar o que eu tinha proposto. Ela abriu a
[Q6a](#x-q6a--sem-rodapé-onde-aparece-que-um-agente-caiu), que foi respondida no mesmo dia e é a
**quarta contra a proposta** — e a única que derrubou a *premissa* da pergunta, e não só a resposta
que eu tinha sugerido.

A ordem foi invertida em relação ao que as [tasks](tasks.md) previam — *"ver como fica antes de ter
certeza de tudo"* —, e o repositório já tem o precedente: a [`029`](../029-sidebar-nav/prd.md) teve o
desenho **antes** da PRD, e a [`017`](../017-sidebar-actions/prd.md) chegou com desenho pronto e
**mudou o desenho** respondendo às perguntas. O que a regra não permite é o contrário — código antes
do desenho.

Cada pergunta traz uma **proposta pra reagir**. Proposta é para ser derrubada: nesta feature, quatro
das seis medições do [§2](prd.md#2-o-que-se-mediu-antes-de-escrever) já derrubaram parte do pedido
original antes de existir uma linha de código.

---

### [x] Q1 — Tela cheia ou modal?

A [`017-sidebar-actions`](../017-sidebar-actions/prd.md) decidiu **modal centrado** com véu, foco
preso e devolvido ao `＋` que o abriu — para os **dois diálogos de criação**. Configuração com quatro
seções é outro peso: ela se lê, se compara e se volta, e a Q5 daquela feature já cobrou o preço de um
modal que prende a tela por minutos.

Há um argumento que não é de gosto: **modal não tem endereço**. A [F1](prd.md#4-escopo) pede
`/settings`, e uma janela sobre a tela anterior não sobrevive a `F5` sem inventar o que havia atrás.

**Proposta pra reagir:** **tela cheia**, na coluna do meio, como o quadro e o Home — a mesma faixa,
com a sidebar de pé. O modal fica com o que a `017` lhe deu: criar coisa.

A alternativa real é o modal grande com lista de seções à esquerda (o padrão do VS Code e do Linear),
que ganha *não perder o contexto de onde você estava* e custa o endereço.

**R (2026-09-17): tela cheia**, na coluna do meio, com a sidebar de pé — a proposta, confirmada.

O que ela compra está no critério de sucesso da PRD: `/settings` é **um endereço**, e endereço é o
que sobrevive a `F5` e ao botão voltar. Um modal teria que inventar o que havia atrás, e a
[`017`](../017-sidebar-actions/prd.md) já mediu o custo do modal que prende a tela — a Q5 dela, com o
clone. O modal fica com o que aquela feature lhe deu: **criar** coisa.

R: é isso mesmo, um tela cheia com todas as configs separadas por seção.

---

### [x] Q2 — Como nasce o roteamento, e quem mais ganha endereço?

O [§2](prd.md#2-o-que-se-mediu-antes-de-escrever) mediu as duas pontas: o vite devolve
**200 `text/html`** para `/settings` e o daemon instalado devolve o shell. Falta o cliente ler o
caminho — e ele lê em um lugar só, o `main.tsx`, e só em DEV.

O custo das saídas está medido: `react-router@7.18.4` são **4,79 MB** e duas dependências;
`wouter@3.11.0` são **77 KB** e nenhuma; à mão são `pathname` + `pushState` + `popstate`.

E há a pergunta que vem junto: **`Home` e o quadro ganham endereço também?** A
[`029`](../029-sidebar-nav/prd.md) acabou de mover `workspaceView` para o `App` para que houvesse
**uma** resposta a *onde eu estou* — um router é uma segunda, e conviver com as duas é pior que
qualquer uma sozinha.

**Proposta pra reagir:** **à mão, e três endereços**: `/`, `/tasks` e `/settings`, com o `App`
derivando o que já deriva a partir do caminho em vez de a partir de `useState`. Sem biblioteca, sem
parâmetro de rota, sem workspace na URL — o workspace ativo continua no `localStorage`, que é onde
ele já mora.

A alternativa é `wouter`, que custa 77 KB e entrega `<Link>`, parâmetros e testes de rota prontos;
e a alternativa cara é o `react-router`, que só se paga se um dia houver carregamento por rota.

**R (2026-09-17): o N1, à mão, com três endereços — e o N3 virou feature própria.**

A pergunta tinha **três níveis** dentro dela, e a resposta escolhe o primeiro sabendo que o destino é
o terceiro:

| Nível | O que a URL carrega | Decisão |
|---|---|---|
| **N1** | só a tela — `/`, `/tasks`, `/settings` | **é esta feature** |
| **N2** | tela + workspace — `/w/<id>/tasks` | pulado |
| **N3** | tudo, inclusive projeto e checkout | [LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030) |

**A objeção ao N1, e por que ela cai.** A coluna do meio tem **três** telas — checkout, Home e quadro
— e o N1 endereça duas. Parece histórico com buraco, e seria, se o checkout tivesse endereço a perder:
**ele não tem.** Recarregar a página hoje já joga você em *nenhuma worktree selecionada*, porque
`selection` é `useState`. O N1 não tira nada — ele dá endereço a duas telas que também não tinham.

O que fecha o detalhe é uma linha: **selecionar um checkout usa `replaceState`, não `pushState`**.
Assim `/` quer dizer *o lugar de trabalho* — Home, ou o que estiver selecionado —, e o botão voltar
nunca contradiz a tela. Um `push` faria o voltar virar *desfazer seleção*, e uma sessão normal de
trabalho encheria o histórico.

**À mão, e não `wouter`, e a razão é a assimetria:** trocar 40 linhas por uma biblioteca depois é
uma tarde; tirar `react-router` depois não é. Com três endereços e **zero** parâmetros, o que uma
biblioteca entrega a mais é exatamente o que o N3 vai precisar — e é lá que ela deve ser escolhida,
com os parâmetros na mesa.

**O que esta resposta aceita como custo,** e os dois já são verdade hoje: duas abas continuam presas
ao mesmo workspace (o `lumem.activeWorkspaceId` é do `localStorage`, que elas compartilham), e um
checkout não é linkável.

**E não vira ADR agora.** A escolha é reversível pela própria assimetria acima, e `/settings`
continua válido em qualquer um dos três níveis — é a rota sem escopo. O que fecha porta é o N3:
id opaco na URL, link morto para worktree removida, quem manda quando URL e `localStorage`
discordam. **As ADRs nascem lá.**

R: aceito.

---

### [x] Q3 — Como o dono de cada ajuste fica legível?

São **quatro** donos, e não três ([§3](prd.md#3-os-quatro-donos-que-é-a-decisão-de-leitura-da-tela)):
workspace, máquina, repositório e navegador. A falha que isso produz já tem nome — a **A16** da
[`021`](../021-second-agent/prd.md): o `agent_config` é global e mora na coluna do workspace, e a tela
não diz.

**Proposta pra reagir:** **frase, e não ícone**. Cada seção abre com uma linha que nomeia o dono com
o nome próprio dele — *"vale para o workspace **dev**"*, *"vale para esta máquina"*, *"vale para este
navegador"*, *"vem do repositório, versionado"*. Um glifo de escopo seria mais curto e recairia no
problema que o `lumem-shell.css` já avisa: os glifos de escopo (`◈ ■ ◇ ◆ ●`) **estão todos tomados**,
e são coloridos.

A alternativa é agrupar por **dono** em vez de por assunto — três ou quatro grupos, com as seções
dentro. Ganha a legibilidade do escopo e perde a da issue: ninguém procura *"o teto de custo"* dentro
de *"coisas do workspace"*.

**R (2026-09-17): etiqueta na linha — por controle, e não por seção.**

~~A proposta era uma frase de escopo abrindo cada seção.~~ **A resposta é mais fina que a proposta, e
o motivo está numa das medições:** a seção `integrações` **não tem um dono** — o cofre é da máquina e
o mapa de colunas do tracker é do repositório, pela Q65 da
[`028`](../028-autonomous-orchestration/open-questions.md). Uma frase por seção teria que mentir ali,
ou abrir uma exceção logo na terceira das quatro seções. Etiqueta por controle nunca precisa mentir:
cada linha carrega o dono dela.

**O que a resposta cobra, e o desenho tem que pagar:** quatro seções × todas as linhas é ruído se a
etiqueta for um bloco de cor. Ela é **texto pequeno, sem caixa e sem matiz próprio**, alinhado à
direita da linha — o vocabulário é fechado em quatro palavras (`workspace`, `máquina`, `repositório`,
`navegador`) e é isso que faz a repetição virar coluna em vez de poluição. Cor não entra: os glifos
de escopo coloridos já estão todos tomados, e o `lumem-shell.css` avisa o que acontece com mais um
matiz.

R: eu quero ver como isso fica na interface, entender a usabilidade disso primeiro.

---

### [x] Q4 — A tela só muda de lugar, ou passa a escrever?

A medição que ninguém esperava: **`workspace.setBudget` não tem chamador na web**. Os três tetos e o
`maxParallel` são somente-leitura no produto inteiro — o único jeito de pôr um teto hoje é um teste.

Então "mover a linha de lugar" e "ter uma tela de configurações" são coisas diferentes, e a issue
LUM-56 pede a primeira.

**Proposta pra reagir:** **escreve**, e é a [F3](prd.md#4-escopo). Uma tela de configuração que
mostra quatro números que você não pode mudar é a mesma falha em outro endereço — e o trabalho de
servidor já está pronto: a procedure, o repositório, a validação e o `check` do SQLite existem e são
testados.

O que isso cobra é honesto e é de tela: `null` (*sem teto*), `0` (*bloqueia tudo*) e campo vazio são
**três** coisas, e a `028` defendeu a distinção no banco. A tela precisa distinguir as três com
teclado, sem inventar uma quarta.

**R (2026-09-17): escreve** — a proposta, confirmada, e é a [F3](prd.md#4-escopo).

Então esta feature **não é uma mudança de endereço**: ela é o primeiro escritor de dois controles que
o produto exibe há uma feature inteira sem poder mudar. O trabalho de servidor está pronto e testado
— `setBudget`, o repositório, o `zod` e o `check` do SQLite —, e o que falta é inteiramente de tela,
incluindo os três estados do campo.

R: concordo.

---

### [x] Q5 — Por onde se chega?

As duas casas candidatas já têm regra escrita, e **as duas dizem não**: a `Topbar` declara que *nada
escopado mora ali*, e a `SidebarNav` da [`029`](../029-sidebar-nav/prd.md) tem
`aria-label="Telas do workspace"` — uma terceira linha ali afirma que configuração é do workspace, e
metade dela não é.

**Proposta pra reagir:** **o rodapé da sidebar**, que é onde o que é *da máquina* já mora — é o
argumento que o `Credentials` escreveu: *"o rodapé já é o lugar do que é da máquina"*. Uma linha
`⚙ Configurações` acima de `Agentes`.

A alternativa é a `Topbar`, cuja regra passa a valer **a favor** se a tela for de tudo e não do
workspace; e a terceira é a `SidebarNav` com o `aria-label` reescrito, que é honesto se a tela for
mesmo *telas do produto*.

**Uma, e só uma** — a regra *uma ação, um lugar* da [`017`](../017-sidebar-actions/prd.md).

**R (2026-09-17): a `SidebarNav` — uma terceira linha, e o `aria-label` é reescrito.**

~~A proposta era o rodapé da sidebar, porque é onde o que é *da máquina* já mora.~~ **A resposta
derruba a premissa da pergunta, não só a proposta:** eu tratei `aria-label="Telas do workspace"` como
uma regra, e ele não é — é uma **descrição**, escrita pela [`029`](../029-sidebar-nav/prd.md) quando
as duas telas que existiam eram do workspace. Descrição que envelheceu se reescreve; regra é outra
coisa. O bloco sempre foi *as telas que se alcança a qualquer hora*, e é exatamente isso que
`/settings` é.

E o rodapé perderia a discussão por dois motivos que a pergunta não tinha juntado: a
[Q6](#--q6--o-que-sobra-no-rodapé-da-sidebar) está prestes a **esvaziá-lo** (a LUM-57 tira os agentes,
a LUM-58 tira as credenciais), e pôr a porta da tela de configurações dentro do lugar que ela vai
esvaziar é construir a entrada dentro da sala que está sendo demolida.

**O que a resposta cobra:** o `aria-label` vira algo que descreve as três (`Telas`), o bloco passa de
65px para ~97px — e esses 32px saem da árvore, que é a mesma conta que a `029` aceitou e pagou uma
vez. E ele precisa de um glifo que não seja de escopo: os coloridos (`◈ ■ ◇ ◆ ●`) estão tomados, e
este entra no grupo de tela, herdando a cor do texto — como `◎` e `▥`.

R: aceito.

---

### [x] Q6 — O que sobra no rodapé da sidebar?

A LUM-57 tira os agentes de lá e a LUM-58 tira as credenciais. O que sobra é **nada**, e a
[`017`](../017-sidebar-actions/prd.md) já esvaziou esse rodapé uma vez — o `＋ adicionar projeto`
saiu dali, e o `AgentLogin` ficou porque era o que não pertencia à lista de projetos.

**Proposta pra reagir:** sobra **uma linha de estado, sem verbo** — *"claude · conectado"* como
informação, com o clique levando à seção `agentes` da tela nova. O rodapé deixa de ser onde se
configura e passa a ser onde se **vê** que está configurado.

A alternativa é o rodapé sumir inteiro, e custa o sinal que a
[`021`](../021-second-agent/prd.md) mediu: 263×105px que dizem, sem você pedir, que o agente caiu.

**R (2026-09-17): não sobra nada. O rodapé some inteiro.**

~~A proposta era manter uma linha de estado, sem verbo, clicável para a seção `agentes`.~~ **A
resposta é a alternativa, e ela é mais coerente que a proposta:** *uma ação, um lugar* vale para
informação também. Uma linha que só relata estado e leva para onde se muda esse estado é a tela nova
com um pedaço de si mesma colada na coluna — que é exatamente a forma do defeito que a A16 da
[`021`](../021-second-agent/prd.md) nomeou, sobrevivendo à mudança de endereço.

**O que a coluna ganha, medido:** o rodapé são **73px** nesta folha (cabeçalho `Adaptadores` mais uma
linha, sem credencial nenhuma) e **105px** com dois agentes, que é o número da `021`; o bloco de
credenciais acrescenta o cabeçalho e uma linha por serviço guardado. A árvore recebe tudo isso de
volta.

**E isso muda a conta da [Q5](#x-q5--por-onde-se-chega):** ela cobrou 28px da árvore para a terceira
linha do bloco de navegação, e a Q6 devolve **no mínimo 73**. A entrada da tela nova sai **barata**
— o saldo da coluna é positivo em pelo menos 45px, mais de uma linha e meia de árvore.

**O que isso cobra, e quem paga:** as LUM-57 e LUM-58 deixam de ser *mover conteúdo* e passam a
**remover o rodapé** — o `.sidebar__foot`, o `.foot-head`, o `.foot-row` e o `.pip` saem junto, ou
viram as 13 classes órfãs que a Parte 1 da [`028`](../028-autonomous-orchestration/prd.md) já pagou
uma vez. E abre a [Q6a](#x-q6a--sem-rodapé-onde-aparece-que-um-agente-caiu), que é o que a alternativa
custava e a pergunta original tinha nomeado.

R: rodapé some inteiro, não fica nada lá.

---

### [x] Q7 — Qual é a alavanca do tamanho de fonte?

O `tokens.css` tem **111 valores em `px` e zero `rem`**, e é **cópia do Open Design** — não se edita à
mão. Fora do CSS ainda há `TERMINAL_FONT_SIZE = 13` em `lib/xterm-theme.ts`, porque o xterm mede em
pixel, e o CodeMirror tem o seu.

Três saídas, e nenhuma é barata:

1. **`rem` no sistema de design** — o certo, e nasce no Open Design: os 111 valores viram `rem` e a
   preferência é `html { font-size }`. Muda a folha de todo mundo.
2. **`zoom` no `#root`** — uma linha, escala tudo inclusive layout, e não pede token nenhum. Custa a
   conta de *quantas colunas cabem no terminal*, que a [`015`](../015-run-dock-open/prd.md) já mediu
   em ~45, e mexe com o `fit` do xterm.
3. **Um multiplicador só para os tokens de texto** — 14 variáveis, não 111. Não escala espaçamento,
   então a tela fica com texto grande em caixa pequena.

**Proposta pra reagir:** a **1**, e ela **não cabe nesta feature**: vira issue no Open Design, e a
seção `exibição` entra aqui com o endereço e o desenho, com o controle chegando quando o token chegar.

Responder *"faz o `zoom` e pronto"* é legítimo e é a saída barata — mas ela precisa ser escolhida com
o custo escrito, não por ser a que dá para fazer hoje.

**R (2026-09-17): a 1 — o `rem` nasce no Open Design, e não cabe nesta feature.**

A seção `exibição` entra com **endereço e desenho**, e o controle chega quando o token chegar. A
folha já desenha o segmentado e a frase do que falta, e **não** um botão que não faz nada — a
diferença entre as duas coisas é o que separa uma tela honesta de uma que promete.

O que a resposta recusa é o atalho: `zoom` no `#root` funcionaria hoje e deixaria o produto com
**duas** verdades sobre tamanho — os 111 valores em `px` do sistema de design, e um fator de escala
que ninguém declarou em lugar nenhum. E ele mexe na conta de *quantas colunas cabem no terminal*, que
a [`015`](../015-run-dock-open/prd.md) mediu em ~45 e comprou com um preço nomeado.

R: concordo.

---

### [x] Q8 — O mapa de colunas do tracker aparece na tela?

Ele mora no `<repo>/.lumem/project.toml` pela **Q65** da
[`028`](../028-autonomous-orchestration/open-questions.md) — *o que é do repositório é do time* —, e
viaja com o clone. A seção `integrações` é da **máquina** (o cofre, o `gh`); o mapa é do
**repositório**.

**Proposta pra reagir:** **não**. A tela mostra que existe ou não existe mapa para o projeto aberto,
e diz onde ele mora — leitura, com o caminho do arquivo. Editar `project.toml` por uma tela de
preferência da máquina é escrever no repositório de outra pessoa a partir de um lugar que promete o
contrário.

**R (2026-09-17): não — leitura, com o caminho do arquivo.**

É a proposta, confirmada, e ela é a Q65 da [`028`](../028-autonomous-orchestration/open-questions.md)
sendo respeitada de fora: *o que é do repositório é do time*. A linha existe porque **não** mostrar
seria pior — *"sem mapa, nada é movido lá"* é uma decisão silenciosa que parece defeito quando o
cartão não anda —, e a etiqueta `repositório` com o traço é o que explica por que o controle não
existe ali.

R: concordo.

---

### [x] Q9 — Onde fica a métrica de cerimônia?

`sessões com tarefa ÷ sessões` está hoje dentro do mesmo `<p>` dos tetos, e **não é configuração** —
é medida. A `022` a pôs ali de propósito: *"ninguém procura uma métrica que não incomoda"*.

**Proposta pra reagir:** ela **fica na tela de tarefas**, e é a única coisa das 79 linhas que não se
muda de lugar. Se ela for para `/settings`, ela para de incomodar — que é a função dela.

**R (2026-09-17): fica na tela de tarefas.**

Proposta confirmada. A régua que a decide não é *de quem é o dado* — é *o que a pessoa faz com ele*:
configuração se ajusta, medida se olha. Uma métrica cuja utilidade depende de ser vista sem ser
procurada não pode morar numa tela que só se abre de propósito.

**Consequência para a [F5](prd.md#4-escopo):** o `<p class="tlist__budget">` não é removido inteiro —
**79 linhas saem e a medida fica**, com o `<p>` provavelmente virando outra coisa, porque o que
sobra não é mais um parágrafo de configuração.

R: concordo

---

### [x] Q6a — Sem rodapé, onde aparece que um agente caiu?

Aberta pela [Q6](#x-q6--o-que-sobra-no-rodapé-da-sidebar), e é o custo que a alternativa dela tinha
nomeado. Hoje o rodapé diz `claude · conectado` com o pip, e as credenciais dizem `guardada` ou `sem
chave` — você lê **sem procurar**. Sem rodapé, um agente sem login só aparece quando você tenta usá-lo
(ou quando abre `/settings`, que é o lugar que ninguém abre por acaso).

Isso importa mais do que parece por causa da esteira: em `autônomo`, quem descobre o agente caído não
é uma pessoa tentando usá-lo — é o daemon puxando a fila, e o cartão para com uma frase de erro.

**Proposta pra reagir:** a linha `Configurações` do bloco de navegação carrega o sinal, no mesmo slot
e com o mesmo vocabulário do `3` de `Tarefas` — **e some quando está tudo certo**, pela regra que o
quadro escreveu e a [`029`](../029-sidebar-nav/prd.md) repetiu: *zero que aparece ensina a ignorar o
sinal*.

O que precisa ser decidido junto: **o que conta como *precisa de você* aqui.** Agente sem login conta.
Credencial faltando conta? Se contar, um workspace que nunca usará o Linear vive com um sinal aceso —
e a `021` já mediu um defeito desse tipo, o `pip` que era cinza nos três estados.

A alternativa é **aceitar a perda**: sem sinal passivo, e quem descobre é quem tenta. É defensável se
a resposta for que a esteira precisa de um lugar próprio para falhas de configuração — o que seria
outra feature, não uma linha na sidebar.

**R (2026-09-17): não aparece — e isso deixa de ser problema quando existirem notificações.**

~~A proposta era o sinal na linha `Configurações`, no slot do `3` de `Tarefas`.~~ **A resposta
derruba a premissa da pergunta, não só a proposta.** Eu perguntei *onde* o sinal passivo vai morar,
supondo que ele devia ser preservado; o argumento é que **ele não escala**, e por dois caminhos que
se fecham um contra o outro:

- **vão ser muitos agentes.** O rodapé mostra **uma linha por agente** — 73px com um, 105px com dois
  (o número da [`021`](../021-second-agent/prd.md)), **+28px cada**. Com seis agentes são mais de
  200px: um terço da coluna gasto para dizer que está tudo bem;
- **e dar barra de rolagem ao bloco é pior**, porque um sinal que você precisa **rolar** para ver
  deixa de ser sinal passivo — e ver sem procurar era a única coisa que ele fazia. Ele passaria a
  ocupar espaço **e** a não cumprir a função.

Então o lugar do *"alguma coisa caiu"* não é uma lista que cresce com o número de agentes: é uma
superfície que **agrega**. Isso é a área de **notificações**, que não existe, e que entrou no
[backlog](../../project/backlog.md) com este argumento e com o gatilho.

**O que esta resposta aceita, com nome:** até lá, agente sem login se descobre tentando usá-lo — ou
abrindo `/settings`. O caso que dói é a esteira em `autônomo`, onde quem descobre não é uma pessoa: é
o daemon puxando a fila, e o cartão para com uma frase de erro. **É um custo aceito, e ele é o
gatilho que devolve as notificações à mesa.**

E isso reforça a [Q6](#x-q6--o-que-sobra-no-rodapé-da-sidebar) com um segundo argumento independente
do primeiro: o rodapé não é o lugar do estado dos agentes **em nenhum número acima de poucos** — não
é só que ele não deve ficar depois da tela nova, é que ele já ia quebrar sozinho.
