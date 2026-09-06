# PRD — As ações da árvore: criar projeto e criar worktree de onde se olha

> **Status:** v1.0 — **desenho feito e sincronizado**, seis perguntas respondidas, implementada.
> Nasceu de três anotações do
> agentation na tela `/`, todas dizendo a mesma coisa por ângulos
> diferentes: *"deveria ter um botão na direita para poder adicionar um projeto direto por aqui"*,
> *"no canto direito deveria ter um botão + para criar uma worktree direto por ali"*, *"esse botão
> não deveria estar aqui"*
> **Perguntas:** [open-questions.md](open-questions.md) — **6 respondidas**, duas
> ([Q1](open-questions.md), [Q5](open-questions.md)) **contra a proposta e contra o desenho**
> **Tasks:** [tasks.md](tasks.md)
> **Depende de:** `project.create`/`project.parseSource` e `worktree.create` — as duas mutations já
> existem e não mudam. Esta feature é de **onde se clica**, não de o que acontece depois
> **Desenho:** `packages/web/prototype/lumem-sidebar-actions.html` — oito quadros, feito no Open
> Design e sincronizado ([regra](../../project/design-source-of-truth.md)). A Q1 e a Q5 foram
> revistas **depois** dele, e o desenho foi **reescrito lá** antes de virar código: a tela desenhada
> e a tela implementada não divergem

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
O `CloneStatus` continua existindo; o que muda é quem o hospeda. Ver [Q5](open-questions.md) — que foi
respondida **contra a proposta**: o hospedeiro passou a ser o próprio diálogo, que **fica aberto**. O
preço está escrito lá e é real: a tela fica presa por minutos.

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
campo e não escapa do modal enquanto ele está aberto — **exceto** enquanto um clone que o próprio
diálogo começou está em andamento, quando os três ficam desabilitados e a saída é `cancelar o clone`
([Q5a](open-questions.md)).
**F1.9** O clone **não** fecha o diálogo: o `AddProjectDialog` hospeda o progresso, o cancelamento e
as duas maneiras de acabar. Só o sucesso fecha; a falha devolve o formulário com a URL onde estava. E
um clone vivo encontrado ao carregar a página **reabre** o diálogo, porque não existe segundo
hospedeiro ([Q5](open-questions.md)).
**F1.10** O slot de ação de 24px é **reservado em toda linha de projeto**, inclusive nas que não
oferecem ação, e o `+` é **pintado em repouso** — o hover confirma a mira, não revela a ação
([Q1](open-questions.md)). O `count` de sessões não cede o lugar: os dois convivem
([Q1b](open-questions.md)).
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

## 5. Como se prova

- criar worktree a partir do `+` da linha do projeto, com o projeto **fechado**, e cair dentro dela;
- clicar no `+` de um projeto fechado **não** o expande sozinho antes de o diálogo abrir, e **não**
  muda a seleção atual se o diálogo for cancelado;
- `Esc` no modal devolve o foco ao `+` que o abriu;
- com zero projetos, existe **exatamente um** caminho visível para acrescentar o primeiro;
- o e2e de primeiro acesso ([onboarding](../onboarding/prd.md)) continua chegando ao mesmo lugar — ele
  atravessa o caminho de adicionar projeto, e este PRD move esse caminho.
