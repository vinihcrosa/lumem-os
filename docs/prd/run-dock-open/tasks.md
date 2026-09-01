# O rodapé nasce aberto — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **0 de 4 entregues.** Desenho feito e decidido em 2026-09-01
(`lumem-run-dock-open.html`, seis quadros), com as cinco perguntas respondidas.

A feature encolheu ao ser desenhada, e as tasks refletem isso: a **T1 é a feature**, e ela tem
poucas linhas. A T2 e a T3 existem porque a coluna ficar em 360px tem duas consequências visíveis, e
a T4 é a prova de que a chegada é o que o desenho diz.

---

## Antes de começar

**O que não trava:** o rodapé inteiro (`RunDock.tsx`), o `useRunDock` com altura, clamp e
preferência, o piso de largura no `toggle` (`App.tsx:283`), o `FoldedDock`, as quatro abas, o
`noscripts` e o e2e `run-dock.spec.ts` — cujo `openDock()` já tolera encontrar o rodapé aberto.

**O que a execução precisa decidir e o PRD não decide:** só a [Q6](open-questions.md), e ela é de
CSS. As outras cinco estão fechadas; divergir de qualquer uma é mudar a resposta lá, não aqui.

**Premissas travadas:**

- **A1** — a **altura não muda**. `defaultHeight` continua metade da janela, e `clampHeight`,
  `maxHeight` e `RUN_DOCK_MIN_HEIGHT` ficam como estão (Q1).
- **A2** — **nenhum gatilho novo de largura**. O piso de 640 só no `toggle`, onde já está (Q2, Q5).
- **A3** — a preferência gravada **sempre** ganha do padrão. O padrão é o primeiro contato.
- **A4** — a dobra da saída **não é nossa**: `xterm` + `FitAddon` refluem, e o daemon redimensiona o
  PTY. Ninguém escreve CSS de dobra (Q4).

---

## Fase 1 — a feature

#### T1: O padrão passa a ser aberto

**What**: O fallback de `useRunDock`, quando não há nada em `localStorage`, vira `open: true`. A
altura do fallback não muda.
**Where**: `packages/web/src/hooks/useRunDock.ts` + `packages/web/src/hooks/run-dock.test.ts`

**Done when**:
- [ ] `localStorage` vazio → `open: true`, `height: defaultHeight()` (F1.1)
- [ ] `{"open":false}` gravado → **fechado**. A preferência ganha do padrão, e o teste diz isso
      explicitamente (F1.2)
- [ ] JSON ilegível ou `open` de tipo errado → cai no padrão **novo**, sem crash — o `catch` que já
      existe continua valendo
- [ ] O comentário de `read()` passa a dizer **por que** aberto: a pergunta que o rodapé responde é a
      primeira da chegada. O motivo antigo (nascer fechado) fica registrado como o que mudou, e não
      apagado
- [ ] Nenhuma linha de `defaultHeight`, `clampHeight` ou `maxHeight` muda (A1) — e o teste
      `"é metade da janela"` continua passando **sem edição**, que é a prova de que a altura ficou
      fora
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé de execução nasce aberto`

---

## Fase 2 — as duas consequências de ficar em 360px

#### T2: `Abrir :porta` e `parar` na linha de estado

**What**: Os dois botões de ação saem da faixa de abas e vão para a linha de estado. Medido: a faixa
completa quer **494px** e a coluna tem 360 — e são esses dois que estouram (F1.6).
**Where**: `packages/web/src/components/RunDock.tsx`, `packages/web/src/components/run-dock.css` +
`run-dock.test.tsx`, `run-dock-css.test.ts`

**Done when**:
- [ ] Numa coluna de 360px, nenhum controle do rodapé sai da tela: a faixa não tem `scrollWidth >
      clientWidth`
- [ ] `Abrir :porta`, `parar` e `rodar` ficam na linha de estado, com o estado à esquerda e eles à
      direita — a ordem do desenho
- [ ] O `＋` e as quatro abas **ficam** na faixa: eles cabem, e mover o que cabe é mexer no que não
      pediu
- [ ] A linha de estado cresce para a altura de um botão pequeno mais respiro
      (`--size-control-lg`), e continua truncando o comando antes de truncar o estado
- [ ] Os testes que hoje procuram `Abrir`/`parar` dentro da faixa passam a procurá-los onde eles
      estão — mesmo papel (`role`), lugar novo
- [ ] Só `var(--token)`: nenhum literal de cor, espaço ou tipografia
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a ação do rodapé desce para a linha de estado`

---

#### T3: O corpo do `Run` quando nunca rodou

**What**: No lugar de um terminal vazio, o que o daemon já sabe antes de existir processo: que nunca
rodou nesta worktree, as portas reservadas para o checkout, e quando o setup passou (F1.8).
**Where**: `packages/web/src/components/RunDock.tsx` + `run-dock.test.tsx`

**Done when**:
- [ ] Sem sessão de `run` **e** sem sessão anterior registrada → o placeholder, não o `Terminal`
- [ ] Com sessão viva ou histórico → o `Terminal` de sempre, na mesma área. O placeholder **não**
      empilha acima dele
- [ ] O texto sai de dado que o daemon já expõe. Nada de número inventado: linha que não tem fonte
      não aparece
- [ ] O placeholder não é um erro: nenhuma cor de perigo, nenhum ícone de aviso
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o Run vazio diz o que vai rodar, em vez de um terminal preto`

---

## Fase 3 — a prova

#### T4: A chegada, de ponta a ponta

**What**: Um e2e que entra numa worktree com `localStorage` limpo e afirma as três coisas da decisão:
rodapé aberto, coluna em 360, e nada tendo alargado.
**Where**: `e2e/run-dock.spec.ts`

**Done when**:
- [ ] `localStorage` limpo → o `tablist` de execução está visível **sem nenhum clique**, e o botão
      `abrir o rodapé` não existe
- [ ] A coluna da direita continua na largura de sempre depois de entrar na worktree — nem entrar,
      nem reconciliar um `run` de pé, nem mandar rodar a alargam (A2, Q5)
- [ ] Fechar pelo chevron, recarregar → continua fechado (F1.2)
- [ ] Reabrir pelo chevron → a coluna **sobe** para 640, como já é hoje. A T1 não regride isso
- [ ] O `openDock()` do spec continua funcionando para os outros casos, sem virar dois caminhos
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a chegada numa worktree mostra o run sem clique`

---

## O que a execução deve achar

Espaço reservado. O que aparecer aqui é o que o desenho não previu — e vale mais escrito do que
lembrado.
