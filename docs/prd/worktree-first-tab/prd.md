# PRD — A worktree vira a primeira aba, e leva os arquivos junto

> **Status:** v0.1 — a estrutura vem do desenho já aprovado da
> [pull-request-status](../pull-request-status/prd.md) §2.1; o que este PRD acrescenta é o botão
> `▤ arquivos`. Nada implementado
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md) — 9 tasks em 4 fases, nenhuma iniciada
> **Extraída de:** a **Fase 1** da [pull-request-status](../pull-request-status/tasks.md) (E1, E2,
> E3). Ela deixa de ser pré-requisito enterrado numa feature de PR e passa a ser feature própria —
> ver [§7](#7-a-relação-com-a-barra-da-pr)
> **Nasce de:** duas anotações do agentation: *"essa parte de cima não
> deveria estar aqui… o que deveria ter é uma barra de abas"* e *"esse botão está no lugar errado,
> arquivos pertence à worktree"*
> **Desenho:** `packages/web/prototype/lumem-worktree-tab.html` — abra no navegador. Dez telas,
> vindas do Open Design. **Zero token novo**, e um componente novo só (`.tabs__files`): a barra de
> abas, a aba, o `✕` e o `＋` já são do design system. Ele sucede o desenho da
> `pull-request-status` (`lumem-pr-bar.html`), que cobria a coluna do meio mas não o
> `▤ arquivos` — e aqui a coluna aparece **sem** a barra da PR, que é a feature travada

---

## 1. O problema, em uma frase

**Coisas que pertencem a uma worktree estão desenhadas como se pertencessem ao aplicativo.**

Duas, e as duas na moldura:

| O quê | Onde está | Por que está errado |
|---|---|---|
| o cabeçalho do checkout — título, branch, sujeira, caminho em disco, ações | faixa **fixa acima** da barra de abas, no `ScopePanel` | ele não é a moldura das abas: é **o conteúdo de uma delas**. Ocupa altura em todas as abas para dizer algo que só interessa a uma |
| o botão `▤ arquivos` | **`Topbar`**, ao lado do estado do daemon | a coluna de arquivos é de um checkout. Um interruptor global para uma coisa que só existe dentro de um escopo diz que ele é do produto — e ele nem aparece quando não há checkout selecionado, o que já denuncia o lugar errado |

O `ScopePanel` de hoje carrega uma justificativa escrita para o cabeçalho fixo: *"uma sessão nova não
muda a branch, o caminho, nem se a árvore está suja; trocar de aba não pode fazer essa informação se
mexer"*. É verdade, e é o preço da mudança — [§4](#4-o-que-a-mudança-cobra) diz quem paga.

**Critério de sucesso em uma frase:** a coluna do meio é **caminho → abas → conteúdo**, a primeira
aba é a worktree, e o interruptor da coluna de arquivos mora dentro do escopo a que a coluna
pertence — sem que branch e sujeira virem informação que só se encontra clicando.

## 2. Forma

```
┌──────────────┬─────────────────────────────────────┬──────────────┐
│ sidebar      │ pessoal / lumem-os / pr-bar         │ painel de    │
│              ├─────────────────────────────────────┤ arquivos     │
│              │ [◇ pr-bar ●][◆ claude][● sh]  [+][▤]│              │
│              ├─────────────────────────────────────┤              │
│              │  ◇ pr-bar              worktree     │              │
│              │  branch  ● pr-bar                   │              │
│              │  base    main ↑7 ↓0                 │              │
│              │  estado  ● suja · 3 arquivos        │              │
│              │  caminho ~/.lumem/…/worktrees/pr-bar│              │
└──────────────┴─────────────────────────────────────┴──────────────┘
     de longe        a worktree é a 1ª aba, fixa, sem ✕
```

**Acima das abas fica só o caminho** (`workspace / projeto / worktree`), com os dois primeiros
segmentos navegando como já navegam.

**A primeira aba é a da worktree**: primeira, fixa, **sem `✕`** — fechar a worktree dentro da
worktree não quer dizer nada. Ela se chama pelo nome do checkout, com o losango do escopo, e é a aba
padrão ao entrar. Hoje ela se chama `contexto`.

**O `▤ arquivos` vai para a barra de abas**, na ponta direita, ao lado do `+` de nova sessão — o
único lugar que existe em todas as abas de um checkout e em nenhum lugar fora dele. Só o glifo, sem
rótulo: o `+` cria algo que ainda não existe e por isso precisa de um verbo; o `▤` é um interruptor
cujo estado ligado já está desenhado ao lado dele, na tela. Alvo de 24×24, o mesmo do `✕` da aba.

O protótipo desenha os dois lugares possíveis lado a lado (§7) e a razão de um deles perder: com a
coluna fechada, o `✕` que a coluna tem por dentro **não existe mais**, e um interruptor que só existe
quando está ligado não é interruptor, é botão de desligar.

## 3. Escopo

**F1.1** O `ScopePanel` deixa de receber um `header` com título e chips; recebe **só o caminho**.
**F1.2** A primeira aba é a do checkout: fixa, primeira, sem fechar. Rotulada com o nome e o glifo do
escopo (`◇` worktree, `▭` local).
**F1.3** Ela é a aba padrão ao entrar num checkout, e é para onde a seleção volta quando a última
aba de sessão fecha.
**F1.4** O conteúdo dela é o que estava no cabeçalho **mais o que não cabia nele**: branch, base e
distância (`↑7 ↓0`), estado da árvore, caminho em disco **inteiro e copiável**, e as ações do escopo
— inclusive a destrutiva.
**F1.5** A aba mostra um **ponto** quando a árvore está suja. É o sinal que sobrevive a qualquer aba
em foco.
**F1.6** O `▤ arquivos` **sai da `Topbar`** e entra na barra de abas do checkout.
**F1.7** O estado aberto/fechado da coluna de arquivos continua sendo o mesmo `useRightPanel` — o
botão muda de lugar, não de dono. Ver [Q4](open-questions.md).
**F1.8** A mudança de altura da coluna **remede o terminal**: o `FitAddon` mede uma caixa que mudou de
tamanho, e uma sessão de PTY aberta durante a transição precisa refitar.
**F1.9** A aba herda os **dois estados degradados** que o cabeçalho já desenha: a worktree ausente
(glifo `⚠`, sem ponto de sujeira — não há árvore para estar suja) e o `getDetail` em voo (título
escrito, resto em esqueleto, e **sem ponto**: ponto ausente já quer dizer "limpa"). Nos dois, a aba
continua existindo — a única que não fecha não pode sumir. Desenhados no §8 do protótipo.
**F1.10** O que o cabeçalho ganhou a mais **não** entra junto: consumo, memória e diff continuam onde
estão.

### Fora de escopo

- A barra da PR e o marcador na sidebar — são da
  [pull-request-status](../pull-request-status/prd.md).
- O rodapé de execução e sua altura padrão — é da [run-dock-open](../run-dock-open/prd.md).

## 4. O que a mudança cobra

Com uma aba de sessão na frente, **branch e sujeira somem da vista.** Hoje elas estão sempre lá.

Quem paga a conta:

| Sinal | Onde | O que carrega |
|---|---|---|
| **o ponto na aba do checkout** | barra de abas do meio | a árvore está suja |
| **o caminho acima das abas** | topo da coluna | onde você está |
| **o marcador na linha da sidebar** | árvore | o que está rodando ali |

O que se ganha em troca: no cabeçalho fixo tudo aquilo tinha de caber em duas linhas e virava fila de
chips truncados. A informação que mais sofria — **o caminho em disco** — passa a caber inteira e a
dar para copiar.

Esta é a [Q11 da pull-request-status](../pull-request-status/open-questions.md), ainda aberta, e ela
passa a ser desta feature: **com uma aba de sessão na frente, o que a worktree ainda diz?**

## 5. Como se prova

- os testes que provavam branch, caminho e sujeira **no cabeçalho** continuam existindo e passam a
  apontar para a aba — não se apagam;
- entrar num checkout cai na aba dele; fechar a última sessão volta para ela;
- a aba do checkout **não** tem `✕`, e nenhum atalho a fecha;
- abrir e fechar a coluna de arquivos pelo botão novo, com uma sessão de PTY viva, e o terminal
  refita — o `terminal-refit.test.tsx` já é o molde;
- com a coluna fechada, o botão continua alcançável (é o único jeito de reabri-la);
- os dois testes da worktree ausente (`worktree-ui.test.tsx`) continuam passando com a aba no lugar do
  cabeçalho, e a aba ausente **não** mostra ponto;
- o comentário do `ScopePanel` que justifica o cabeçalho acima da faixa é **reescrito**, não apagado:
  passa a dizer o que mudou e o que a mudança cobra — e o mesmo vale para o do Banner de remoção no
  `WorktreePanel`.

## 6. Os três contratos que faltam

O desenho pede três coisas que o código ainda não sabe fazer, e nenhuma delas é grande. Estão aqui
porque uma task que descobre isso no meio do caminho vira duas.

| Onde | O que existe | O que falta |
|---|---|---|
| `ui/Tab.tsx` — `TabStrip` | um slot fixo à direita (`action`), onde mora o `＋ nova sessão` | **dois** slots, com separador entre eles: o `＋` e o `▤` são ações da mesma faixa e não são a mesma coisa |
| `ui/Tab.tsx` — `TabState` | vocabulário de sessão: `running \| exited \| failed \| asking` | a sujeira é uma quinta coisa, e de outra rampa — `--color-worktree-dirty`, não o verde de `running`. O ponto da aba do checkout não é o ponto da aba de sessão |
| `WorktreePanel.tsx` | o Banner de recusa da remoção mora no cabeçalho, **com justificativa escrita**: *"uma recusa que renderiza dentro de uma aba que a pessoa não tem aberta se lê como o clique não ter feito nada"* | com a ação dentro da aba, o argumento passa a valer a favor — quem clicou está olhando para ela. O comentário é **reescrito**, não apagado, como o do `ScopePanel` |

O que **não** falta, e é mais do que parece: o `Tab` já aceita não ter `onClose`, já tem glifo,
ordinal e ponto; o `TabStrip` já tem um `lead` fixo com separador, que é onde a aba `contexto` mora
hoje (`ScopePanel.tsx:128`). A peça nova do desenho é uma só.

## 7. A relação com a barra da PR

A [pull-request-status](../pull-request-status/prd.md) escreveu esta estrutura como **F0** e como
Fase 1 das tasks, com um motivo declarado: *"ela move informação de uma tela que já é testada; fazer
isso junto com a feature nova produziria um diff em que ninguém consegue dizer o que quebrou o quê"*.

O motivo continua valendo — e leva um passo adiante. A barra da PR está **travada** na
[Q1](../pull-request-status/open-questions.md) (`gh` instalado × API com token nosso), e a estrutura
não está travada em nada. Separar libera a que pode andar.

**Contrato entre as duas:** esta feature entrega a coluna `caminho → abas → conteúdo`. A barra da PR
passa a **depender** dela, e a Fase 1 de lá some — nada nesta feature depende de saber ler PR.
