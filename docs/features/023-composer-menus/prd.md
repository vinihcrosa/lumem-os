# PRD — Os menus do composer aparecem inteiros

> **Status:** completa
> **Histórico:** v1.0 — **5 perguntas respondidas**, escopo fechado e **entregue**. Nasceu da [issue #50](https://github.com/vinihcrosa/lumem-os/issues/50), que veio de uma anotação visual na tela `/` (pontos 1, 4 e 5 — os três seletores, o mesmo defeito)
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Sucede:** [session-mode](../016-session-mode/prd.md), que foi quem descobriu o recorte — e escapou
> dele em vez de removê-lo
> **Desenho:** `lumem-composer-menus.html` no Open Design, e o `lumem-ds.css` que perde uma
> declaração

---

## 1. O problema, em uma frase

**O menu do seletor aparecia cortado, e a parte cortada não existia nem para o olho nem para o
mouse.**

A causa estava escrita no próprio arquivo, no comentário do `.mmenu`: `.composer__box` tem
`overflow: hidden` para recortar os cantos arredondados, e isso corta todo popover que abre para
cima e passa da borda da caixa. Com dois modelos passa despercebido; com vinte, não dá para
escolher.

**Critério de sucesso em uma frase:** abrir qualquer menu do composer e conseguir **clicar na
primeira opção da lista** — mesmo que a lista tenha vinte itens, e mesmo que ela seja mais alta que a
janela.

## 2. O que se descobriu antes de escrever código

O recorte produzia **três** defeitos, e a issue tinha visto um. Os outros dois apareceram ao desenhar
o estado de hoje lado a lado com o conserto:

| # | O quê | Estado |
|---|---|---|
| 1 | o seletor (`modelo`, `modo`, `esforço`) perde toda opção acima da borda da caixa | o defeito relatado |
| 2 | **o menu de `/comandos` sumia INTEIRO** | ninguém tinha notado |
| 3 | o menu de modo do Lumem aparece — mas só porque **fugiu**, ancorando no `.composer` | dívida da `session-mode` |

O **2** é o achado. O `.slash` dos comandos ancora na *própria caixa que recorta*, em
`bottom: calc(100% + var(--space-6))` — ou seja, cem por cento fora dela. Medido no navegador:
`menu.bottom = 373px`, `caixa.top = 378px`. Ele nunca foi desenhado na tela do produto. Atravessou
três features assim porque o único teste que o abre é jsdom, que **não faz layout**: um `getByRole`
acha, clica e passa num elemento que no navegador não existe.

O **3** é a pergunta que a issue mandou responder — se `.slash` e `.mmenu` continuam sendo dois
jeitos de resolver o mesmo problema. A resposta é que não há mais problema a resolver
([Q3](open-questions.md)).

## 3. Escopo

**F1.1 A caixa deixa de recortar.** `.composer__box` perde o `overflow: hidden`. Ele arredondava
cantos que **nada pinta**: o campo é transparente, a barra só tem `border-top`, e o único fundo é o
da própria caixa, que o `border-radius` já arredonda. Medido lado a lado no navegador — os dois
cantos são o mesmo canto ([Q1](open-questions.md)).
**F1.2 Todo menu ganha teto e rolagem própria.** `--size-menu-max-h: 280px` mais
`overflow: hidden auto`, no `.slash` **e** no `.mmenu`. São nove linhas inteiras e a décima pela
metade — a meia-linha é o que diz que a lista continua ([Q2](open-questions.md)).
**F1.3 A âncora vira uma frase: um popover ancora no que o abre.** O `.mmenu` volta para a pílula,
que é quem o abre; o `.slash` do seletor já estava na pílula; o `.slash` dos comandos fica na caixa,
porque quem o abre é o campo de texto — e o campo *é* a caixa ([Q3](open-questions.md)).
**F1.4 O portão do `liberado` é a exceção, e ela é nomeada.** Ele continua ancorado no `.composer`,
e o motivo deixa de ser o recorte: é um cartão de 420px, e a pílula que o originou já saiu de cena
quando ele aparece, porque o menu que o abriu fechou.
**F1.5 O que prova é o navegador.** Um e2e com um adaptador falso de **vinte modelos**, e a pergunta
que ele faz não é "está visível" — é `document.elementFromPoint`, que é o que o mouse responde.

### Fora de escopo

- **O estouro do texto dentro da pílula** — a issue já o tira de escopo, e é outro conserto.
- Teclado no menu (setas, `Home`/`End`, foco preso). O `.slash` dos comandos já tem navegação por
  setas; o do seletor não tem, e nunca teve — dar teclado a ele é uma feature de acessibilidade com
  escopo próprio, não um efeito colateral de remover um `overflow`. Foi para o
  [backlog](../../project/backlog.md).
- Menu que decide abrir **para baixo** quando não há espaço acima. Com o teto de 280px o caso não
  aparece nas janelas que o produto suporta ([Q4](open-questions.md)).

## 4. Como se prova

- com vinte modelos, a **primeira** opção da lista responde a `elementFromPoint` — hoje quem responde
  é a conversa atrás dela;
- o menu tem altura **280px** e conteúdo maior que isso: teto com rolagem, e não um menu que por
  acaso mede 280;
- rolando o **menu** (não a página) chega-se ao último modelo, e clicar nele troca a pílula;
- o menu de `/comandos` **aparece**, e escolher um insere o comando no campo;
- o canto arredondado do composer é o mesmo com e sem o recorte.
