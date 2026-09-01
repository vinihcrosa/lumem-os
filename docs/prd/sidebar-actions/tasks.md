# As ações da árvore — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Desenho:** `packages/web/prototype/lumem-sidebar-actions.html` — oito quadros, feitos no Open Design
e sincronizados ([regra](../../project/design-source-of-truth.md))
**Status:** **3 de 10.** Escopo fechado — as seis perguntas foram respondidas pelo desenho de
2026-09-01.

---

## Antes de começar

**O que não trava:** as mutations. `project.add`, `project.clone`, `project.parseSource` e
`worktree.create` não mudam **nada** — esta feature é de **onde se clica**, não do que acontece
depois. Também não mudam: o `useCloneJob`/`useCloneStream`, o `useTreeExpansion`, e as primitivas
`Field`, `Input`, `Banner`, `Button`, `Glyph`.

**O que a execução precisa decidir e o desenho não decide:** nada de escopo. As seis perguntas estão
fechadas em [open-questions.md](open-questions.md) — todas pelo desenho. Divergir de qualquer uma
delas é mudar a resposta lá, não aqui.

**Premissas travadas:**

- **A1** — o `Modal` é `div` + `createPortal`, com o trap de foco escrito à mão. **Não** é
  `<dialog>` nativo: o `jsdom` 25 deste repositório não implementa `showModal` (verificado —
  `el.showModal is not a function`), então o caminho nativo obrigaria um polyfill no setup dos
  testes, e um trap que só existe no navegador é um trap que a suíte não confere.
- **A2** — os dois diálogos passam a ser **controlados**: `open` e `onClose` vêm de fora, e nenhum
  dos dois renderiza mais o próprio botão de abrir. Hoje os dois guardam `open` num `useState` e
  devolvem um `<button>` quando fechados; enquanto for assim, o gatilho não pode morar na árvore.
- **A3** — o slot da linha é **reservado sempre** nas linhas de projeto, inclusive nas que não
  oferecem ação (Q1). Reservar é o requisito, não o `+`.
- **A4** — o `+` da linha **não** navega: não seleciona e não expande (F1.4). Isso é `stopPropagation`
  no `onClick` **e** o botão fora do `row__main`, que já é um `button` — `button` dentro de `button`
  é HTML inválido, e a `Row` já resolve isso para o twist.
- **A5** — o `CloneStatus` **muda de hospedeiro**, não de comportamento. Ele já mora fora do diálogo
  (no `sidebar__foot`) e o `AddProjectDialog` já fecha ao disparar o clone; o que a Q5 pede é que ele
  suba para dentro da árvore.
- **A6** — nenhum token novo. O véu é `--color-bg-inset` composto com transparência, do mesmo jeito
  que o `lumem-run-dock.css` compõe altura a partir de `--space-64`. Mexer em `tokens.css` daqui é
  mexer numa cópia, e o próximo `design:sync` desfaz.

**A ordem, e por quê:** primitivas primeiro, tela por último — o inverso da `project-scripts`. Lá a
tela era a única parte já desenhada; aqui **tudo** está desenhado, e o que é incerto são as duas
peças que o design system não tem. E as tasks de teste vêm no fim de propósito: o custo desta feature
está nos testes que quebram, não na tela que muda, e concentrá-los numa fase é o que impede a suíte
de ficar vermelha entre uma task e outra.

---

## Fase 1 — as duas peças que faltam no design system

#### T1: O `Modal`, com o foco preso dentro

**What**: A primitiva de diálogo centrado com véu: portal, cartão de `--size-dialog-width`, trap de
foco, `Esc`, clique no véu, e devolução do foco a quem abriu.
**Where**: `packages/web/src/ui/Modal.tsx`, `ui/index.ts`, `ui/ui.css` + `ui/ui.test.tsx`

**Done when**:
- [x] Renderiza por `createPortal` no `document.body` (A1), com `role="dialog"`, `aria-modal="true"`
      e `aria-labelledby` apontando para o título
- [x] Ao abrir, o foco entra no **primeiro campo focável** de dentro; ao fechar, volta ao elemento que
      tinha o foco antes de abrir — os dois cobertos por teste, porque é o contrato do §8 do desenho
- [x] `Tab` circula dentro e não escapa: do último focável volta ao primeiro, e `Shift+Tab` faz o
      caminho inverso
- [x] `Esc`, clique no véu e clique no `✕` chamam o mesmo `onClose`. Clique **dentro** do cartão não
- [x] Fechado não renderiza nada — nem o véu, nem o cartão, nem um `hidden`
- [x] Só `var(--token)`: nenhum literal de cor, espaço ou tipografia (o véu é o `color-mix` do
      protótipo, A6)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o Modal centrado, com o foco preso dentro`

---

#### T2: A linha da árvore ganha um slot de ação

**What**: `Row` aceita uma ação à direita, num slot de 24px **reservado sempre**, visível no hover e
no foco.
**Where**: `packages/web/src/ui/Row.tsx`, `ui/ui.css` + `ui/ui.test.tsx`

**Done when**:
- [x] `action?: ReactNode` — quando ausente **numa linha que declara ter slot**, o espaço continua
      reservado (A3), e é isso que o teste mede: a largura do label não muda entre ter e não ter `+`
- [x] O slot fica **fora** do `row__main` (A4): clicar nele não dispara `onSelect` nem `onToggle`
- [x] Invisível em repouso (`opacity: 0`), visível em `:hover` da linha e em `:focus-visible` do
      próprio botão — nunca `display: none`, que tiraria o botão da ordem de `Tab`
- [x] O `count` **continua no lugar** com o slot pintado: a linha não se reorganiza no hover (Q1)
- [x] O glifo de linha `muted` passa a ser o desligado, e não o de perigo — `sem disco` não é falha
- [x] Nenhuma outra linha da árvore muda de altura, de indentação ou de ordem de foco
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o slot de ação da linha da árvore`

---

## Fase 2 — os diálogos deixam de ser donos do próprio botão

#### T3: `CreateWorktreeDialog` controlado, e sabendo o projeto

**What**: O diálogo vira controlado, passa a viver dentro do `Modal`, e descobre sozinho o
`hasCommits` do projeto que recebeu.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx` + `worktree-ui.test.tsx`

**Done when**:
- [x] `open` e `onClose` vêm de fora (A2); o componente **não** renderiza mais o botão
      `nova worktree` quando fechado
- [x] Busca `project.get` **enquanto aberto** para saber `hasCommits` — quem abre é a árvore, e a
      árvore não tem esse dado; fechado, não pergunta nada
- [x] Repositório sem commit: o diálogo **abre** e explica no `Banner`, com `criar` desabilitado. O
      `+` da linha não fica cinza (o desenho diz por quê: um `+` de 24px desabilitado é um botão sem
      motivo à vista)
- [x] O cabeçalho diz de onde a ação veio — `em ■ <projeto>` —, e não existe seletor de projeto
- [x] Criar com sucesso: fecha, e chama `onCreated` com a worktree nova
- [x] Erro do daemon continua sendo mostrado com as palavras dele, no `Field`
- [x] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): o diálogo de worktree controlado, dentro do modal`

---

#### T4: `AddProjectDialog` controlado

**What**: O mesmo para o de projeto, que é o que tem campo de URL, eco do plano e destino computado.
**Where**: `packages/web/src/components/AddProjectDialog.tsx` + `project-ui.test.tsx`,
`clone-ui.test.tsx`

**Done when**:
- [ ] `open`/`onClose` de fora (A2); o `<button>adicionar projeto</button>` sai do componente
- [ ] O `prefill` continua funcionando — ele **abre** o diálogo hoje, e passa a pedir a abertura a
      quem controla, em vez de se abrir sozinho
- [ ] Caminho local, URL, e recusado: os três planos ecoam como hoje, dentro do modal
- [ ] Clone disparado → o modal fecha na hora (A5), e o clone segue sozinho
- [ ] O campo de origem continua recebendo o foco ao abrir — agora por conta do `Modal` (T1)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): o diálogo de projeto controlado, dentro do modal`

---

## Fase 3 — a árvore passa a mandar

#### T5: O cabeçalho `Projetos`, com ação, em todos os estados

**What**: A lista ganha cabeçalho com o `+` que acrescenta projeto — e ele existe também quando a
lista está vazia.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `components/sidebar.css` +
`project-ui.test.tsx`

**Done when**:
- [ ] `Projetos` à esquerda, `+` à direita, **sempre visível** (Q3) — não é hover, porque com zero
      projetos não há linha onde passar o ponteiro
- [ ] O cabeçalho existe com zero projetos, carregando e com erro. Com zero, o `EmptyState` fica só
      com o texto e **sem ação própria**
- [ ] Com zero projetos existe **exatamente um** caminho visível para acrescentar o primeiro —
      afirmado por teste, contando os botões
- [ ] O botão tem nome próprio (`adicionar projeto`): `＋` sozinho não é nome de nada
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o + de projeto no cabeçalho da lista`

---

#### T6: O `+` na linha do projeto

**What**: Cada projeto no disco oferece o `+` que corta uma worktree dele.
**Where**: `packages/web/src/components/SidebarTree.tsx` + `worktree-ui.test.tsx`

**Done when**:
- [ ] O `+` abre o diálogo **já sabendo o projeto** (F1.3), com o projeto **fechado** ou aberto
- [ ] Clicar nele **não** expande e **não** muda a seleção (F1.4/A4) — teste com o projeto fechado e
      outra worktree selecionada, afirmando que a seleção continua onde estava
- [ ] Cancelar não muda nada. Criar **expande o projeto** e **seleciona a worktree nova** (F1.5) — o
      mesmo destino que o caminho de hoje entrega
- [ ] Projeto `available: false` **não** oferece o `+`, e o espaço fica (F1.8/A3)
- [ ] Nome próprio por linha: `nova worktree em <projeto>`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a worktree nasce do + da linha do projeto`

---

#### T7: O rodapé perde o botão, e o clone sobe para a árvore

**What**: `＋adicionar projeto` sai do rodapé (F1.6), e o `CloneStatus` passa a ser uma linha da
árvore.
**Where**: `packages/web/src/App.tsx`, `components/CloneStatus.tsx`, `components/clone.css`,
`components/sidebar.css` + `clone-ui.test.tsx`

**Done when**:
- [ ] O rodapé fica só com o `AgentLogin`. Nenhum segundo caminho para adicionar projeto sobra em
      lugar nenhum da tela
- [ ] O clone em andamento aparece **dentro da árvore**, logo abaixo do cabeçalho, com a geometria de
      uma linha de projeto: mesmo glifo, mesma indentação, mesmo slot — carregando `✕` (A5)
- [ ] A barra de progresso fica embaixo, na largura da linha; sem percentual conhecido, o estado
      indeterminado continua sendo o de hoje
- [ ] O clone que falhou usa o cartão da coluna (`.cfail`), e não o `.fail` do painel central — a URL
      numa linha só, cortada. Fica até ser dispensado
- [ ] `tentar de novo` continua reabrindo o diálogo com a origem preenchida (o `prefill` da T4)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o clone acontece onde o projeto vai nascer`

---

## Fase 4 — o que sai, e o que se prova

#### T8: O `LocalPanel` devolve a ação

**What**: O `CreateWorktreeDialog` sai da aba de contexto do `local` (Q4).
**Where**: `packages/web/src/components/LocalPanel.tsx` + `worktree-ui.test.tsx`

**Done when**:
- [ ] O painel não monta mais o diálogo, e a `div.actions` some se não sobrar ação nenhuma nela
- [ ] Nenhum teste passa a alcançar o formulário por dois caminhos — se um teste ainda o encontra
      daqui, a task não está pronta
- [ ] O resto do painel — caminho, branch base, consumo, lista — não muda
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): a aba do local lê o checkout, e não cria irmãos dele`

---

#### T9: Os caminhos de ponta a ponta que a mudança move

**What**: Os três lugares do e2e que clicam no botão do rodapé, mais um caminho novo pelo `+` da
linha.
**Where**: `e2e/support/app.ts`, `e2e/clone-project.spec.ts`, `e2e/error-cases.spec.ts`,
`e2e/sidebar-actions.spec.ts` (novo)

**Done when**:
- [ ] O helper `ensureProject` (`app.ts:70`) passa pelo `+` do cabeçalho — ele é o caminho de
      **todo** spec que precisa de um projeto, então isto é o que decide se a suíte inteira anda
- [ ] `clone-project.spec.ts` e `error-cases.spec.ts` deixam de procurar o botão do rodapé
- [ ] O e2e de primeiro acesso ([onboarding](../onboarding/prd.md)) continua chegando ao mesmo lugar
- [ ] Spec novo: criar worktree pelo `+` de um projeto **fechado**, e cair dentro dela
- [ ] Spec novo: `Esc` no modal fecha e devolve o foco ao `+` que o abriu
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a árvore é o caminho de criar projeto e worktree`

---

#### T10: O protótipo e o app dizendo a mesma coisa

**What**: A conferência de que as classes portadas são as do protótipo, como os outros `*-css.test.ts`
já fazem.
**Where**: `packages/web/src/components/sidebar-css.test.ts` (novo)

**Done when**:
- [ ] As classes que a tela usa existem no protótipo com o mesmo nome — `row__act`, `row__slot`,
      `tree__head`, `modal`, `modal__scrim`, `modal__card`, `cfail`
- [ ] Nenhum literal de cor, espaço, raio ou tipografia nas folhas novas — só `var(--token)` (A6)
- [ ] `pnpm --filter @lumem/web design:sync --check` roda limpo na máquina de quem entregar (é para a
      pessoa, não para o gate)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `test(web): as classes da sidebar são as do protótipo`

---

## O que a execução achou

**T3 — um `useEffect` com o resultado da mutação nas dependências estourou a memória da suíte.**
A primeira versão do diálogo limpava o campo num efeito com `[open, create]`, e o objeto que o
`useMutation` do react-query devolve é **novo a cada render**: o efeito rodava sempre, chamava
`create.reset()` sempre, e o processo **principal** do vitest morria de `heap out of memory` depois
de uns 47 arquivos — com **zero** testes falhando antes disso. Um teste isolado não pega: só a suíte
inteira acumula o suficiente. O conserto foi apagar o efeito, porque todo caminho de saída já passa
pelo `close()` — é o `Modal` que o chama no `Esc`, no véu e no `✕`.

**Fica valendo:** dependência de efeito tem de ser valor estável. Objeto de resultado de hook não é.
