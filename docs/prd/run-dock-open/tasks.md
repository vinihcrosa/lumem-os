# O rodapé nasce aberto — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **4 de 4 entregues.** Gates: `pnpm gate:quick` (2672 testes), `pnpm gate:build` e `pnpm gate:full` (55 e2e). Desenho feito e decidido em 2026-09-01
(`lumem-run-dock-open.html`, seis quadros), com as **seis perguntas respondidas**. Nada aberto.

A feature encolheu ao ser desenhada, e as tasks refletem isso: a **T1 é a feature**, e ela tem
poucas linhas. A T2 e a T3 existem porque a coluna ficar em 360px tem duas consequências visíveis, e
a T4 é a prova de que a chegada é o que o desenho diz.

---

## Antes de começar

**O que não trava:** o rodapé inteiro (`RunDock.tsx`), o `useRunDock` com altura, clamp e
preferência, o piso de largura no `toggle` (`App.tsx:283`), o `FoldedDock`, as quatro abas, o
`noscripts` e o e2e `run-dock.spec.ts` — cujo `openDock()` já tolera encontrar o rodapé aberto.

**O que a execução precisa decidir e o PRD não decide:** nada de escopo. As seis perguntas estão
fechadas em [open-questions.md](open-questions.md); divergir de qualquer uma é mudar a resposta lá,
não aqui.

**Premissas travadas:**

- **A1** — a **altura não muda**. `defaultHeight` continua metade da janela, e `clampHeight`,
  `maxHeight` e `RUN_DOCK_MIN_HEIGHT` ficam como estão (Q1).
- **A2** — **nenhum gatilho novo de largura**. O piso de 640 só no `toggle`, onde já está (Q2, Q5).
- **A3** — a preferência gravada **sempre** ganha do padrão. O padrão é o primeiro contato.
- **A4** — a dobra da saída **não é nossa**: `xterm` + `FitAddon` refluem, e o daemon redimensiona o
  PTY. Ninguém escreve CSS de dobra (Q4).
- **A5** — **um layout só** para a linha de estado, em qualquer largura. Nenhuma `@container`, nenhum
  ponto de quebra (Q6).

---

## Fase 1 — a feature

#### T1: O padrão passa a ser aberto

**What**: O fallback de `useRunDock`, quando não há nada em `localStorage`, vira `open: true`. A
altura do fallback não muda.
**Where**: `packages/web/src/hooks/useRunDock.ts` + `packages/web/src/hooks/run-dock.test.ts`

**Done when**:
- [x] `localStorage` vazio → `open: true`, `height: defaultHeight()` (F1.1)
- [x] `{"open":false}` gravado → **fechado**. A preferência ganha do padrão, e o teste diz isso
      explicitamente (F1.2)
- [x] JSON ilegível ou `open` de tipo errado → cai no padrão **novo**, sem crash — o `catch` que já
      existe continua valendo
- [x] O comentário de `read()` passa a dizer **por que** aberto: a pergunta que o rodapé responde é a
      primeira da chegada. O motivo antigo (nascer fechado) fica registrado como o que mudou, e não
      apagado
- [x] Nenhuma linha de `defaultHeight`, `clampHeight` ou `maxHeight` muda (A1) — e o teste
      `"é metade da janela"` continua passando **sem edição**, que é a prova de que a altura ficou
      fora
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé de execução nasce aberto`

---

## Fase 2 — as duas consequências de ficar em 360px

#### T2: `Abrir :porta` e `parar` na linha de estado

**What**: Os dois botões de ação saem da faixa de abas e vão para a linha de estado. Medido: a faixa
completa quer **494px** e a coluna tem 360 — e são esses dois que estouram (F1.6).
**Where**: `packages/web/src/components/RunDock.tsx`, `packages/web/src/components/run-dock.css` +
`run-dock.test.tsx`, `run-dock-css.test.ts`

**Done when**:
- [x] Numa coluna de 360px, nenhum controle do rodapé sai da tela: a faixa não tem `scrollWidth >
      clientWidth`
- [x] `Abrir :porta`, `parar` e `rodar` ficam na linha de estado, com o estado à esquerda e eles à
      direita — a ordem do desenho
- [x] O `＋` e as quatro abas **ficam** na faixa: eles cabem, e mover o que cabe é mexer no que não
      pediu
- [x] A linha de estado cresce para a altura de um botão pequeno mais respiro
      (`--size-control-lg`), e continua truncando o comando antes de truncar o estado
- [x] **Em qualquer largura** (A5): a mesma linha em 360 e em 640, sem `@container`. Em 640, o espaço
      que sobra é preenchido pelo comando e pela proveniência da porta — e é isso que os dois quadros
      da largura desenham
- [x] Os testes que hoje procuram `Abrir`/`parar` dentro da faixa passam a procurá-los onde eles
      estão — mesmo papel (`role`), lugar novo
- [x] Só `var(--token)`: nenhum literal de cor, espaço ou tipografia
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a ação do rodapé desce para a linha de estado`

---

#### T3: O corpo do `Run` quando nunca rodou

**What**: No lugar de um terminal vazio, o que o daemon já sabe antes de existir processo: que nunca
rodou nesta worktree, as portas reservadas para o checkout, e quando o setup passou (F1.8).
**Where**: `packages/web/src/components/RunDock.tsx` + `run-dock.test.tsx`

**Done when**:
- [x] Sem sessão de `run` **e** sem sessão anterior registrada → o placeholder, não o `Terminal`
- [x] Com sessão viva ou histórico → o `Terminal` de sempre, na mesma área. O placeholder **não**
      empilha acima dele
- [x] O texto sai de dado que o daemon já expõe. Nada de número inventado: linha que não tem fonte
      não aparece
- [x] O placeholder não é um erro: nenhuma cor de perigo, nenhum ícone de aviso
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o Run vazio diz o que vai rodar, em vez de um terminal preto`

---

## Fase 3 — a prova

#### T4: A chegada, de ponta a ponta

**What**: Um e2e que entra numa worktree com `localStorage` limpo e afirma as três coisas da decisão:
rodapé aberto, coluna em 360, e nada tendo alargado.
**Where**: `e2e/run-dock.spec.ts`

**Done when**:
- [x] `localStorage` limpo → o `tablist` de execução está visível **sem nenhum clique**, e o botão
      `abrir o rodapé` não existe
- [x] A coluna da direita continua na largura de sempre depois de entrar na worktree — nem entrar,
      nem reconciliar um `run` de pé, nem mandar rodar a alargam (A2, Q5)
- [x] Fechar pelo chevron, recarregar → continua fechado (F1.2)
- [x] Reabrir pelo chevron → a coluna **sobe** para 640, como já é hoje. A T1 não regride isso
- [x] O `openDock()` do spec continua funcionando para os outros casos, sem virar dois caminhos —
      ele já tolerava encontrar o rodapé aberto, e não mudou uma linha
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a chegada numa worktree mostra o run sem clique`

---

## O que a execução achou

**O `▶ rodar` desabilitado desapareceu, e é uma melhora.** Enquanto os botões moravam na faixa, um
projeto sem `[scripts]` mostrava `▶ rodar` **desabilitado** ali em cima, ao lado do bloco que explica
que este projeto não diz como rodar. A linha de estado não existe nesse caminho — ela é do caminho
"tem comando e é confiado" —, então o botão morto saiu junto. O desenho já concordava: o quadro 5 não
tem botão de ação nenhum.

**`PORT_BLOCK_SIZE` teve que virar contrato.** A T3 promete dizer a faixa (`:55060–55069`), e o
número do bloco morava em `packages/server/src/scripts/ports.ts`. As alternativas eram um segundo
`10` do lado do web — número para divergir — ou dizer "e as nove seguintes", que é a vagueza que para
de ser verdade quando o bloco mudar. Ele subiu para `@lumem/shared`, e o servidor o reexporta.

**O e2e não mediu 640 nem 360.** Escrever o número no spec seria uma terceira cópia dele. O que ele
mede é o **comportamento**: guarda a largura da chegada, prova que rodar não a muda, e prova que
abrir o rodapé de propósito a aumenta. Nenhum literal, e o teste sobrevive a mudar o piso.

**Recarregar perde a seleção, e o e2e não sabia.** A prova de "quem fecha encontra fechado" precisa de
um `reload`, e depois dele o `▤ arquivos` não existe: a tela volta para o workspace, porque a seleção de
checkout não é lembrada. O teste reabre o projeto antes de continuar. Não é bug desta feature — é uma
resposta que o produto ainda não deu, e agora está escrita num lugar que falha se mudar.

**A porta de e2e é global entre worktrees do Conductor.** O `E2E_STATE_DIR` é por worktree, mas
`e2eServer` vem do `ports.json` e é o mesmo para todas — duas sessões rodando `playwright` ao mesmo
tempo colidem com *"port is already used"*. Não é desta feature, e está no
[backlog](../../project/backlog.md).
