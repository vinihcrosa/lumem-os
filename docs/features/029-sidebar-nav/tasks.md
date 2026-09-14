# O bloco de navegação da sidebar — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** completa
**Histórico:** **6 tasks em 3 fases, todas entregues** (2026-09-14). O desenho estava fechado no Open
Design (`lumem-sidebar-nav`) e as **7 perguntas respondidas** — nenhuma task esperou resposta.

**Dois achados que a fase 3 pagou sozinha**, e nenhum deles é sobre o bloco: o e2e da rolagem nasceu
**vazio** (a árvore não rola no fixture, então o caso não podia falhar), e a frase de leitor de tela
`precisa de você` colidiu com o grupo de checks da barra de PR — texto invisível é texto para o
`getByText`. Os dois estão no [testing.md](../../project/testing.md).

O conserto é pequeno de propósito, e a parte que custa não é o CSS: é que o App passa a ter **uma
resposta só** para *onde eu estou*, e hoje ele tem duas — `selection` no App e `board` dentro do
`WorkspacePanel`.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `sidebar.css` | nascem `.nav` (o bloco) e `.row__n` (o número) — cópia do Open Design |
| `SidebarNav.tsx` | novo: duas linhas, e elas são `<Row>`, o componente da árvore |
| `App.tsx` | o bloco entre o `WorkspaceSelector` e a `SidebarTree`; `workspaceView` nasce aqui |
| `WorkspacePanel.tsx` | o `board` deixa de ser estado dele e passa a ser prop |
| `Board.tsx` | o título e o último segmento do caminho dizem `Quadro de tarefas` |
| `sidebar-nav.spec.ts` | o e2e — geometria e seleção não cabem em jsdom |

**O que não muda** — e cada um tem uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| a tela do workspace, inclusive o botão `quadro` da seção | [Q1](open-questions.md) |
| a seção `TAREFAS` do Home continuar sendo a lista | [Q1](open-questions.md) e [Q3](open-questions.md) — a lista já tem endereço |
| `Criar` e `Buscar` entrarem no bloco | [Q4](open-questions.md) |
| o caminho da coluna do meio | ele diz *onde você está*; o bloco diz *para onde dá para ir* |
| existir rota de verdade | [Q6](open-questions.md) decide o idioma, não a forma — está no [backlog](../../project/backlog.md) |

**A armadilha, e ela já mordeu duas vezes neste repositório:** o que esta feature entrega é
**geometria e seleção**, e todo teste de componente do produto é jsdom, que não faz layout. Um
`getByRole` acha o botão `Tarefas` com a árvore rolada, com o bloco fora da tela e com duas barras de
seleção acesas ao mesmo tempo. É a lição da [`023`](../023-composer-menus/prd.md) — um menu invisível
por três features tendo teste — e a da [`028`](../028-autonomous-orchestration/prd.md), cuja Q38
achou um arrasto que funcionava sem um único teste cobrindo.

---

## Fase 1 — o bloco

#### T1: `.nav` e `.row__n`, copiados do Open Design

O bloco é um `border-bottom` e o mesmo padding lateral da árvore; o número é o tratamento do
`.needme__n` do quadro. **Nenhum token novo** — conferido na folha.

O glifo **não precisa de classe**: `<Glyph>` já tem `tone="none"`, que não põe classe de cor e
herda a da linha. É a regra *"glifo de tela é da cor do texto"* saindo de graça.

**Done when:** as duas regras estão no `sidebar.css`, `design:sync --check` continua limpo, e o
`gate:quick` passa nos 119 pares de contraste.

#### T2: `SidebarNav`, e as linhas são `<Row>`

Duas linhas: `◎ Home` e `▥ Tarefas`. `depth={0}`, sem `onToggle` — o slot do chevron fica reservado
e vazio, que é o que alinha o glifo com o `■` de projeto.

**Reusar `<Row>` é o requisito, não um atalho:** é ele que faz `row--selected` ser a mesma barra de
2px da árvore, e é isso que a [F1.2](prd.md) compra.

O número vai no `meta`, e **não** no `count` do `Row`: aquele é *"quantas sessões rodam aqui
dentro"*, é o único verde da sidebar, e pintá-lo de vermelho apagaria a coisa que ele existe para
dizer.

**Done when:** as duas linhas aparecem entre o seletor e a árvore; o glifo de `Home` e o `■` do
primeiro projeto caem no mesmo `x`, medido no navegador.

#### T3: o App passa a ter **uma** resposta para *onde eu estou*

Hoje são duas: `selection` no `App` e `board` dentro do `WorkspacePanel`. Com o bloco, `Tarefas`
precisa abrir o quadro de fora da tela que o guarda — então `board` sobe.

`workspaceView: "home" | "board"` no `App`, passado ao `WorkspacePanel` como prop controlada.
Selecionar um checkout não precisa zerá-la: `selection !== null` já manda, e zerar produziria uma
tela que muda de assunto ao você voltar.

**Done when:** clicar em `Tarefas` com um checkout aberto cai no quadro; clicar em `Home` cai na tela
do workspace; a barra de seleção está acesa em **exatamente uma** linha nos três casos.

#### T4: o número é o mesmo do quadro, e não um segundo

`task.board` com a **mesma chave** do quadro (`boardKey(workspaceId, null)`), então é **uma**
requisição para os dois e a invalidação que já existe vale para os dois — foi o conserto do review da
`028` que a deixou funcionando.

O número é `needsYou` somado, como a barra do quadro faz. **Nada de procedure nova:** duas fontes
para o mesmo número são duas fontes para divergir, e a regra já está escrita no quadro.

**O custo é honesto e está aqui:** a sidebar passa a pagar a leitura do quadro mesmo de quem nunca o
abre. É uma consulta por workspace, sobre a tabela que a tela de tarefas já lê.

**Done when:** com `precisa de mim` em 3, a linha mostra `3`; com 0, **não mostra nada**; e o
DevTools mostra **uma** requisição de `task.board` com o quadro aberto ao lado.

---

## Fase 2 — o nome da tela

#### T5: `Quadro de tarefas`, nos dois lugares que dizem `Quadro`

O título (`.bd__t`) e o último segmento do caminho (`.crumb__here`). O botão `quadro` da seção do
Home **fica** — ali você escolhe uma visão ([Q3a](open-questions.md)).

**Done when:** chegar por `Tarefas` e ler `Quadro de tarefas` no topo e no caminho.

---

## Fase 3 — a prova

#### T6: o e2e, porque jsdom não faz layout

Quatro perguntas, e nenhuma delas é *"o botão existe"*:

1. com um checkout selecionado, **um clique** em `Tarefas` chega ao quadro;
2. com a árvore rolada até o fim, o bloco está **no mesmo `y`** — ele não rola;
3. a barra de seleção aparece **uma vez só** na coluna, nos três estados;
4. `document.elementFromPoint` no centro da linha `Home` devolve a linha `Home` — a mesma pergunta
   que a [`023`](../023-composer-menus/prd.md) precisou fazer, e pelo mesmo motivo.

**Done when:** os quatro passam, e cada um foi visto **vermelho** contra o código de antes.
