# PRD — Duas telas sem endereço: o bloco de navegação da sidebar

> **Status:** completa
> **Histórico:** v0.1 — proposta em **2026-09-14**, a partir de um relato de uso durante o teste da
> [`028`](../028-autonomous-orchestration/prd.md): *"não tenho como voltar para ele depois que eu
> cliquei em alguma coisa"*. O desenho veio **antes** da PRD e mudou duas vezes respondendo às
> perguntas
> **Perguntas:** [open-questions.md](open-questions.md) — 5 do desenho, 1 que uma resposta abriu e 1
> que veio de fora dele. **7 respondidas, nenhuma aberta**, e **3 contra a proposta**
> **Tasks:** [tasks.md](tasks.md) — **6 tasks em 3 fases, todas entregues**
> **Depende de:** a [`017-sidebar-actions`](../017-sidebar-actions/prd.md), que estabeleceu que *a
> ação mora no cabeçalho da lista que ela alimenta* — é ela que mantém `Criar` fora deste bloco —, e
> a [`028`](../028-autonomous-orchestration/prd.md), de onde sai o quadro e o número de
> *precisa de mim*
> **Desenho:** `lumem-sidebar-nav` no Open Design, e ele vem **antes** do React —
> [regra de 2026-08-19](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)

---

## 1. O problema, em uma frase

**Duas telas do produto só existem enquanto nada está selecionado**, e clicar em qualquer linha da
sidebar as substitui sem deixar caminho de volta que alguém procure.

A tela do workspace aparece quando `selection === null`. O quadro aparece atrás de um botão **dentro
dela**. Selecionar uma worktree troca a coluna do meio pelo painel do checkout, e as duas somem — o
único caminho de volta é o primeiro segmento do caminho (`dev / lumem-os / teste`), que existe em
alguns painéis, tem 30px de largura e ninguém lê como navegação.

**Critério de sucesso em uma frase:** com um checkout aberto, chegar ao quadro **em um clique**, sem
ter descoberto nada.

## 2. O que se descobriu antes de escrever código

**O aplicativo não tem rota nenhuma.** `/styleguide` é o único caminho lido, e só em DEV; todo o
resto é estado React, e o daemon devolve o mesmo shell para qualquer caminho — o e2e de produção
testa a **volta** para `/qualquer/rota/da/aplicacao`, não uma rota que exista. Isso é o que permitiu
a [Q6](open-questions.md) ser respondida agora: adotar caminho em inglês custa **zero**, porque não
há o que migrar.

**A lista nunca precisou de endereço; o quadro precisava.** A proposta original dava a linha à lista
de tarefas. A [Q3](open-questions.md) inverteu: a lista **já** tem endereço — é uma seção da tela do
workspace, que a [Q1](open-questions.md) acabou de manter intacta. Quem some é o quadro.

**Os glifos de escopo estão todos tomados, e isso é uma regra e não um acidente.** `◈ ■ ◇ ◆ ●` são
categorias e são coloridos; `▤` arquivos, `☰` plano e `▣` escrita são telas e ferramentas, e herdam
a cor do texto. O bloco entra no segundo grupo, o que evita dois matizes numa coluna que o
`lumem-shell.css` já avisa que vira arco-íris — com o custo nomeado lá: *"o ponto verde de rodando
deixa de saltar"*.

**A interface já tem inglês onde a palavra é o termo.** As sete colunas do quadro são `Backlog`,
`To-Do`, `In Progress`, `In Review`, `Testing`, `Ready to Merge` e `Done`. `Home` não abre exceção
nenhuma ([Q2](open-questions.md)), o que era a única objeção real ao nome.

## 3. Escopo

**F1.1 Um bloco de duas linhas entre o seletor de workspace e a árvore.** `Home` abre a tela do
workspace; `Tarefas` abre o quadro. Ele fica **fora** da `.tree`, que é `flex: 1; overflow: auto` —
um bloco que rola com a lista de projetos é um bloco que some quando ela cresce, e *acessar a
qualquer hora* é o pedido inteiro.

**F1.2 As linhas são `.row`, a classe da árvore, inteira.** Mesma altura, mesmo hover, mesmo
`is-selected` com a barra de 2px. **Não é economia de CSS:** a coluna só pode ter uma resposta para
*onde eu estou*, e compartilhar a classe é o que faz clicar em `Home` **desmarcar a worktree**. Uma
`.nav__row` própria seria uma segunda definição da mesma coisa, livre para divergir.

**F1.3 `Tarefas` carrega o número de *precisa de mim*, e é o mesmo do quadro.** Não um total — *"há
14 tarefas"* não muda o que você faz. **Some no zero**, pela regra que o quadro já escreveu: um zero
vermelho ensina a ignorar o vermelho. É a parte que serve ao §8 da `028`: a frase do topo do quadro
só existe com o quadro aberto; este número existe com qualquer tela na frente.

**F1.4 O quadro passa a se chamar `Quadro de tarefas`,** no título e no último segmento do caminho.
Tarefas podem ser vistas como lista, quadro, gantt ou outra coisa — titular pela forma **e** pelo
assunto é o que não apaga qual visão está na frente no dia em que existir a segunda
([Q3a](open-questions.md)). A sidebar fica só com o assunto, porque é de lá que se escolhe *o quê*.

**F1.5 O que prova é o navegador.** O bloco é geometria e seleção: um teste de componente diz que o
botão existe, e não diz que ele continua no mesmo pixel com a árvore rolada, nem que a barra de
seleção aparece **uma vez só** na coluna.

### Fora de escopo

- **`Criar` e `Buscar`**, que a referência do Conductor tem. `Criar` já tem lugar pela
  [`017`](../017-sidebar-actions/prd.md); `Buscar` não existe no produto, e uma linha que abre uma
  tela que ninguém escreveu é pior que não ter a linha ([Q4](open-questions.md)).
- **Mudar a tela do workspace.** A [Q1](open-questions.md) a mantém como está, o botão `quadro` da
  seção incluído.
- **Rotas de verdade.** A [Q6](open-questions.md) decide o **idioma**, não a forma. O produto não tem
  URL, e desenhar o esquema é outra coisa — está no [backlog](../../project/backlog.md).
- **Internacionalizar a interface.** É o que motiva a Q6 e não é esta feature; foi para o
  [backlog](../../project/backlog.md) com o gatilho.

## 4. Como se prova

- com um checkout selecionado, o bloco está na tela e **um clique** chega ao quadro;
- rolar a árvore até o fim **não move** o bloco — ele está fora da parte que rola;
- a barra de seleção de 2px aparece **exatamente uma vez** na coluna, nos três estados (Home, quadro,
  checkout), e clicar numa worktree desmarca o `Home`;
- o glifo do bloco cai no **mesmo `x`** do `■` de projeto — é o que diz que as linhas são a mesma
  linha;
- com zero tarefas esperando, a linha `Tarefas` **não tem número**;
- o título da tela e o caminho dizem `Quadro de tarefas`, e o botão da seção do Home continua
  dizendo `quadro`.

## 5. Riscos

**O bloco come 65px do topo da coluna**, e eles saem da árvore. Com muitos projetos abertos é uma
linha e meia a menos de lista visível. Aceito: a árvore rola e o bloco não, e o que se compra é que
duas telas param de depender de o que quer que esteja selecionado.

**Duas entradas para o quadro** — a linha da sidebar e o botão `quadro` da seção do Home. A
[Q1](open-questions.md) as aceita explicitamente: a regra *uma ação, um lugar* proíbe **um verbo com
dois donos**, e aqui o dono é um só; duas entradas para uma tela nunca foram o defeito.
