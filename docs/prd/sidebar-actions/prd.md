# PRD — As ações da árvore: criar projeto e criar worktree de onde se olha

> **Status:** v0.3 — **desenho feito e tasks escritas em 2026-09-01**, nada implementado. Nasceu de três anotações do
> agentation na tela `/`, todas dizendo a mesma coisa por ângulos
> diferentes: *"deveria ter um botão na direita para poder adicionar um projeto direto por aqui"*,
> *"no canto direito deveria ter um botão + para criar uma worktree direto por ali"*, *"esse botão
> não deveria estar aqui"*
> **Perguntas:** [open-questions.md](open-questions.md) — **as 6 respondidas pelo desenho**
> **Tasks:** [tasks.md](tasks.md) — **10 tasks em 4 fases**, nenhuma entregue
> **Depende de:** `project.create`/`project.parseSource` e `worktree.create` — as duas mutations já
> existem e não mudam. Esta feature é de **onde se clica**, não de o que acontece depois
> **Desenho:** `lumem-sidebar-actions.html` — feito no Open Design, projeto `lumem-os`, e sincronizado
> para `packages/web/prototype/` ([regra](../../project/design-source-of-truth.md))

---

## 1. O problema, em uma frase

**As duas coisas que o Lumem cria não se criam de onde elas moram.**

A árvore da sidebar é o mapa do produto: workspace → projeto → worktree. É o lugar onde se vê que
falta um projeto, e é o lugar onde se vê que uma worktree precisa nascer. Mas nenhuma das duas ações
está lá:

| Criar | Onde está hoje | O que custa |
|---|---|---|
| **projeto** | botão `＋adicionar projeto` no **rodapé da sidebar**, colado no pé da janela | está longe do título `Projetos`, e a lista cresce entre os dois — quanto mais projetos, mais longe fica o botão da coisa que ele acrescenta |
| **worktree** | dentro do `LocalPanel`, na aba de contexto do checkout `local` do projeto | **três cliques e uma troca de tela**: abrir o projeto, selecionar `local`, achar o diálogo. Para a ação mais frequente do produto |

A worktree é a unidade de trabalho do Lumem. A [vision](../../project/vision.md) é várias delas em
paralelo, cada uma com um agente. Criar uma nova é a ação que se repete o dia inteiro — e hoje ela
está enterrada no painel de um checkout que não é o que se quer usar.

**Critério de sucesso em uma frase:** com a árvore na tela, criar uma worktree no projeto que você
está olhando é **um clique** — no `+` da linha dele —, e acrescentar um projeto é **um clique** no
`+` ao lado de `Projetos`, sem que nenhum dos dois botões mude de lugar quando a lista cresce.

## 2. Forma

```
┌───────────────────────────┐
│ ● pessoal            ▾    │   ← seletor de workspace (não muda)
├───────────────────────────┤
│ Projetos              [+] │   ← acrescenta projeto. Fixo no cabeçalho da lista
│                           │
│ ▾ ■ lumem-os          [+] │   ← acrescenta worktree neste projeto. Aparece no hover/foco
│     ▭ local               │
│     ◇ pr-bar        ● 2   │
│     ◇ acp-fs              │
│ ▸ ■ outro-repo        [+] │
│                           │
│                           │   ← o rodapé fica vazio: o botão saiu daqui
└───────────────────────────┘
```

### 2.1 As três regras

1. **O botão fica no cabeçalho da coisa que ele acrescenta.** `+` de projeto na linha `Projetos`,
   `+` de worktree na linha do projeto. Nenhum dos dois se move quando a lista abaixo cresce.
2. **Uma ação, um lugar.** O `＋adicionar projeto` do rodapé **sai**. Dois botões para um trabalho, a
   uma mão de distância um do outro, é o que o comentário do `SidebarTree` já recusava para o estado
   vazio — *"a second copy would be two buttons for one job"*. A regra passa a valer para o outro
   lado também.
3. **O diálogo abre no centro da tela.** Hoje os dois são um `Card` que se expande no lugar: o de
   projeto empurra o rodapé, o de worktree empurra o conteúdo do painel. Vindo de um `+` de 24px numa
   linha de árvore, expandir no lugar espremeria o formulário dentro de uma coluna de 260px — e o de
   projeto tem campo de URL, eco do plano de clone e barra de progresso.

### 2.2 O que a mudança cobra

**O estado vazio perde o botão que o cobria.** O `EmptyState` de "Nenhum projeto aqui" hoje não tem
ação própria **porque** o rodapé tinha uma. Tirando o rodapé, ou o `+` do cabeçalho serve os dois
casos — e aí o cabeçalho `Projetos` precisa existir mesmo com zero projetos —, ou o vazio ganha a
ação de volta. Ver [Q3](open-questions.md).

**O `LocalPanel` fica com um diálogo a menos, ou com dois caminhos para o mesmo.** Ver
[Q4](open-questions.md).

**O clone em andamento hoje mora dentro do diálogo do rodapé.** Um clone leva minutos, e um modal
central que se fecha ao terminar não é o mesmo que um cartão que fica na sidebar dizendo `clonando…`.
O `CloneStatus` continua existindo; o que muda é quem o hospeda. Ver [Q5](open-questions.md).

## 3. Escopo

**F1.1** A lista de projetos ganha um cabeçalho com ação: `Projetos` à esquerda, `+` à direita.
**F1.2** O `+` do cabeçalho abre o diálogo de adicionar projeto, **centrado na tela**, sobre um véu.
**F1.3** A linha de cada projeto ganha um `+` à direita, que abre o diálogo de criar worktree
**já sabendo o projeto** — sem seletor de projeto dentro dele.
**F1.4** O `+` da linha do projeto **não** dispara a seleção nem o toggle de expandir: clicar nele é
uma ação, não uma navegação.
**F1.5** Criar uma worktree pelo `+` **expande** o projeto e **seleciona** a worktree nova — o mesmo
destino que o caminho de hoje entrega.
**F1.6** O botão `＋adicionar projeto` do rodapé da sidebar é **removido**.
**F1.7** Os dois diálogos fecham com `Esc`, com clique no véu e no `✕`; o foco entra no primeiro
campo e não escapa do modal enquanto ele está aberto.
**F1.8** Um projeto **sem disco** (`available: false`) não oferece o `+`: não há de onde cortar
worktree.

### Fora de escopo

- Mudar o que as mutations fazem, ou os campos dos formulários. É a mesma tela, em outro lugar.
- Menu de contexto na linha (remover projeto, renomear). Um `+` não é um `⋯`, e o segundo é feature
  própria — vai para o [backlog](../../project/backlog.md) se alguém pedir.
- Atalho de teclado para criar worktree. Ver [Q6](open-questions.md).

## 4. O que já existe e não muda

| Peça | Onde |
|---|---|
| `AddProjectDialog` — campo único, eco do plano, clone com progresso | `packages/web/src/components/AddProjectDialog.tsx` |
| `CreateWorktreeDialog` — nome que também é branch, aviso de repo sem commit | `packages/web/src/components/CreateWorktreeDialog.tsx` |
| `Row` — a linha da árvore, com `glyph`, `meta`, `count`, `onToggle`, `onSelect` | `packages/web/src/ui/` |
| `useTreeExpansion` — quem sabe se um projeto está aberto | `packages/web/src/hooks/useTreeExpansion.ts` |

O que **falta** no sistema de design: uma linha da árvore não tem hoje um slot de **ação à direita**,
e não existe um invólucro de **modal centrado com véu** — os diálogos de hoje são `Card` no fluxo.
Duas peças novas, e as duas nascem no Open Design.

## 4.1 O desenho

Oito quadros em `packages/web/prototype/lumem-sidebar-actions.html` — a árvore inteira, a linha vista
de perto em 264px (que é onde a decisão se toma), os dois diálogos com seus estados, o clone depois
que o modal fecha, o vazio, o rodapé que encolhe, e o contrato de teclado.

**As duas peças novas do design system**, as duas nascidas aqui:

| Peça | O que é | Por que não dava para reusar |
|---|---|---|
| `.row__act` | slot de ação da linha, 24px, **reservado sempre** e pintado no hover e no foco | a linha da árvore não tinha slot à direita: tinha `meta` e `count`, os dois de leitura |
| `.modal` | invólucro centrado com véu, cartão de `--size-dialog-width` e elevação `xl` | os dois diálogos de hoje são `Card` no fluxo, e um `Card` numa coluna de 264px não hospeda campo de URL, eco de plano e barra de progresso |

Mais duas de tela, que ficam nesta feature: `.tree__head` (o cabeçalho com ação) e `.cfail` (o clone
que falhou, na largura da coluna — o `.fail` do design system quebra a URL no meio de um token dentro
de 264px).

**Zero token novo.** O véu é `--color-bg-inset` composto com transparência, do mesmo jeito que o
`lumem-run-dock.css` compõe altura a partir de `--space-64`: valor derivado, não cor escolhida.

E uma decisão que o desenho tomou e o PRD não tinha: o glifo de um projeto **sem disco** passa a ser
o glifo **desligado**, e não o de perigo. `sem disco` não é falha — é um repositório que saiu de onde
estava, e a linha continua na lista justamente porque as worktrees registradas nela continuam
existindo. Vermelho ali competiria com o vermelho que quer dizer *quebrou*.

## 5. Como se prova

- criar worktree a partir do `+` da linha do projeto, com o projeto **fechado**, e cair dentro dela;
- clicar no `+` de um projeto fechado **não** o expande sozinho antes de o diálogo abrir, e **não**
  muda a seleção atual se o diálogo for cancelado;
- `Esc` no modal devolve o foco ao `+` que o abriu;
- com zero projetos, existe **exatamente um** caminho visível para acrescentar o primeiro;
- o e2e de primeiro acesso ([onboarding](../onboarding/prd.md)) continua chegando ao mesmo lugar — ele
  atravessa o caminho de adicionar projeto, e este PRD move esse caminho.
