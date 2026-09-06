# O rodapé de execução nasce aberto — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **3 tasks em 1 fase, todas entregues** (2026-09-06). As sete perguntas estão respondidas — seis no Open Design em
2026-09-01, e a **Q6 revertida em 2026-09-06**, antes do código, com a folha
`lumem-run-dock-open.html` reescrita para registrar a reversão.

Esta é a menor feature do repositório, e isso é o **resultado** das perguntas, não a premissa delas.
A PRD chegou dizendo que a conta de espaço travava tudo; o desenho mediu as duas parcelas e
descobriu que **as duas já estavam pagas**: a altura que se queria já é a de hoje, e a largura não
sobe porque chegar não é um `toggle`. Sobrou uma linha.

**Nada aqui toca o daemon.** Sem contrato, sem tRPC, sem disco, sem migração. O risco é de
**regressão** — um `localStorage` que passa a mentir, ou um e2e que só passava porque alguém clicava
no chevron primeiro.

---

## Antes de começar

**O que muda:** o `fallback` de `read()` no `useRunDock`, de `open: false` para `open: true`.

**O que explicitamente não muda** — e cada um destes tem uma pergunta com nome que diz por quê:

| Não muda | Por quê |
|---|---|
| `defaultHeight()`, `clampHeight()`, `maxHeight()`, `RUN_DOCK_MIN_HEIGHT` | [Q1](open-questions.md) — um segundo número de altura no produto foi recusado |
| `RUN_DOCK_PANEL_WIDTH` e o `toggle` alargado do `App.tsx` | [Q2](open-questions.md), [Q5](open-questions.md) — nenhum gatilho novo |
| a faixa: as abas, o `dock__acts`, o `dock__state` | [Q6](open-questions.md) — revertida em 2026-09-06 |
| o `FoldedDock` | F1.5 — ele é o estado de quem fechou, e continua inteiro |
| o `dock__idle` da saída que nunca rodou | fora de escopo, no [backlog](../../project/backlog.md) |

**A armadilha desta feature é a prova**, não o código. O `run-dock.test.ts` de hoje testa a altura e
**não testa o `open`** — o padrão fechado nunca teve teste. Então não há teste para "reescrever": há
um a **escrever**, e é ele que faz a linha ter valor. A T1 é RED de verdade.

**O e2e não quebra, e é por isso que ele precisa de uma task própria.** O `openDock()` do
`run-dock.spec.ts` já é tolerante — ele clica no chevron *se* houver um. Com o padrão novo não há, e
os três testes de lá continuam verdes **sem provar nada sobre a chegada**. A T3 é a que prova.

---

## Fase 1 — o padrão

#### T1: O padrão de `open` passa a ser aberto, e ganha o teste que ele nunca teve

**What**: O `fallback` do `useRunDock` cai em `open: true`, e o comentário que justificava o fechado
passa a justificar o aberto — dizendo o que mudou, e não apagando o motivo antigo.
**Where**: `packages/web/src/hooks/useRunDock.ts`, `packages/web/src/hooks/run-dock.test.ts`

**Done when**:
- [x] RED primeiro: um teste afirma que, com o `localStorage` vazio, o rodapé nasce **aberto** — e
      ele falha antes da mudança
- [x] `localStorage` com `{"open":false}` gravado → **fechado**. A preferência ganha do padrão
      (F1.2), e este é o teste que impede a mudança de virar uma regra que sobrepõe a pessoa
- [x] `localStorage` com JSON quebrado, ou com `open` de outro tipo → cai no padrão **novo**, e não
      numa tela que não abre
- [x] A altura continua vindo do `localStorage` quando gravada, e de `defaultHeight()` quando não —
      um teste falha se a mudança de `open` mexer na altura
- [x] O comentário do `useRunDock` diz o padrão novo **e** por que o antigo era fechado
- [x] Gate: `pnpm gate:quick`

#### T2: A chegada não alarga a coluna

**What**: A prova de que nenhum gatilho novo nasceu — o piso de 640px continua sendo do chevron e da
alça, e chegar numa worktree com o rodapé já aberto deixa a coluna nos 360px.
**Where**: `packages/web/src/components/right-panel.test.tsx` (ou vizinho), `packages/web/src/App.tsx`
(leitura, não edição)

**Done when**:
- [x] Um teste afirma que montar a coluna com o rodapé aberto por padrão **não** chama
      `setWidth` — a coluna nasce e fica em `--size-panel-right`
- [x] Um teste afirma que o `toggle` continua alargando: fechar e reabrir pelo chevron numa coluna
      estreita leva a coluna a `RUN_DOCK_PANEL_WIDTH`, como já levava
- [x] Se a prova mostrar que o `App.tsx` precisa mudar para isso ser verdade, a mudança é a menor
      possível e o motivo vai no comentário — a [Q2](open-questions.md) diz que ela não deveria
      precisar
- [x] Gate: `pnpm gate:quick`

#### T3: O e2e prova a chegada, e não só o clique

**What**: O `run-dock.spec.ts` passa a afirmar o que a feature entrega: entrar num checkout e já ver
o rodapé, sem clique — e continuar sem ele depois de fechar.
**Where**: `e2e/run-dock.spec.ts`

**Done when**:
- [x] Um teste novo: worktree recém-aberta, `localStorage` limpo → a `tablist` "execução do checkout"
      está visível **sem nenhum clique**, e não há botão "abrir o rodapé"
- [x] O mesmo teste fecha pelo chevron, recarrega a página, e encontra a tira recolhida (F1.2)
- [x] Vale para o checkout **sem `[scripts]`** ([Q3](open-questions.md)): o vazio que ensina aparece
      na chegada, com o bloco inteiro
- [x] O `openDock()` continua tolerante — ele é usado pelos outros três testes, e o que ele garante é
      "o rodapé está aberto", não "eu cliquei"
- [x] Gate: `pnpm gate:full`

---

## O que a execução achou

**A linha era mesmo uma linha** — `open: false` → `open: true`, no `fallback` do `read()`. O resto do
diff é prova e prosa, e é assim que devia ser numa feature deste tamanho.

**A T1 era RED de verdade, e por um motivo que a PRD errou.** A §4 da PRD dizia *"o teste que hoje
afirma o padrão fechado é reescrito, não apagado"*. Não existia esse teste: o `run-dock.test.ts`
cobria altura, clamp, teto e piso, e **nenhuma linha** sobre `open`. O padrão de abertura do rodapé
nunca teve prova em três features. Os cinco testes novos rodaram vermelhos antes da mudança — três
deles porque afirmavam o padrão novo, e os outros dois porque **nunca tinham existido**.

**A T2 virou um refactor pequeno, e ele se pagou.** A regra do piso de 640px morava em cinco linhas
dentro do `renderRightPanel` do `App.tsx` — testável só renderizando o `App` inteiro. Virou
`widenColumnOnOpen(dock, column)`, exportada do `useRunDock`: mesmo comportamento, e agora a lista do
que **não** alarga ([Q2](open-questions.md), [Q5](open-questions.md)) é uma lista de testes em vez de
um comentário. O primeiro deles falha se alguém mover o alargamento para fora do `toggle` — que é
exatamente a "correção" que a coluna estreita da chegada vai tentar provocar um dia.

**O e2e achou dois defeitos do próprio e2e**, os dois de recarga e seleção:

- `page.reload()` **perde o checkout selecionado** — a seleção não é persistida, e sem ela não há
  faixa de abas, então não há interruptor de coluna. O teste de "quem fecha encontra fechado" precisa
  reabrir o projeto antes de reabrir a coluna. O que sobrevive à recarga é o `localStorage`, que é o
  que ele afirma;
- o botão do vazio que ensina chama-se **`pedir para o agente criar`**, e não `pedir ao agente` como
  o protótipo escreve. O desenho abrevia; o produto não.

E o `gate:full` achou um terceiro, que rodar o arquivo sozinho **não** acha: os specs dividem um
daemon, e ele recusa o mesmo caminho de repositório duas vezes. O teste da Q3 usava o `repo`
genérico, já adicionado por outro spec com outro nome — verde sozinho, vermelho na suíte. Virou uma
fixture própria, `repo-noscripts`. É o mesmo tipo de armadilha que a
[testing.md](../../project/testing.md) já cataloga: estado compartilhado entre specs que só aparece
quando a suíte roda inteira.

**A prova foi verificada por mutação:** com o `fallback` de volta em `open: false`, o e2e da chegada
falha. O teste não estava passando por acidente de renderização.
