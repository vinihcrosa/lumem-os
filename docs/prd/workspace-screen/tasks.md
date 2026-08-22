# A tela do workspace — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **escritas, nenhuma executada.** A W1 decide a forma da feature inteira e está aberta —
executar antes dela é escolher por omissão.

---

## Antes de começar

**Duas coisas travam a primeira task, e nenhuma delas é código:**

1. **a W1** — painel central ou só liberar o painel direito. As duas respostas produzem features de
   tamanhos diferentes: uma é uma tela, a outra são duas linhas;
2. **o desenho** — nada disto existe no Open Design, e é lá que nasce
   ([regra](../../project/design-source-of-truth.md)). O §7 do PRD lista as três telas.

O que **não** trava: o daemon. `workspace.rename`, `workspace.remove`, `workspace.get`,
`project.listByWorkspace` e `memory.list` por workspace já existem e já têm teste.

---

## Fase 1 — a porta

#### T1: O painel do workspace existe

**What**: O painel central quando nenhuma worktree está selecionada.
**Where**: `packages/web/src/App.tsx`, `components/WorkspacePanel.tsx`, CSS do Open Design + testes

**Done when**:
- [ ] `selecione uma worktree` deixa de ser a resposta a "onde eu estou"
- [ ] Cabeçalho com o nome do workspace, e os projetos como **estado** — não como navegação
      duplicada da sidebar
- [ ] Workspace **sem projeto nenhum** tem estado próprio: é o caso em que hoje nada é alcançável
- [ ] Só `var(--token)`, e a auditoria de porte do CSS cobre as classes novas
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o workspace ganha uma tela`

---

#### T2: A memória do workspace, pelo componente que já existe

**What**: A `MemoryPanel` no escopo do workspace.
**Where**: `components/WorkspacePanel.tsx` + testes

**Done when**:
- [ ] **O mesmo componente**, com `projectId: null` — nenhuma segunda tela de memória, nenhuma segunda
      semântica de precedência (§5 do PRD)
- [ ] Mostra `workspace` e `você`, e **não** mostra `projeto`: a ausência do grupo é a diferença
      visível entre os dois lugares
- [ ] A inbox de propostas funciona daqui: aprovar e rejeitar sem projeto aberto
- [ ] Um teste que prova o caminho que originou a feature: workspace **sem projeto**, memória de
      workspace visível e revisável
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a memória do workspace, sem precisar de um projeto aberto`

---

## Fase 2 — os gestos

#### T3: Renomear em linha

**Where**: `components/WorkspacePanel.tsx`, `hooks/useWorkspaces.ts` + testes

**Done when**:
- [ ] Em linha, sem modal — o produto não usa modal
- [ ] O seletor do topo e a tela concordam na hora: um nome novo em dois lugares diferentes é o
      começo de uma tela discordando de si mesma
- [ ] Renomear **não** mexe em disco, e um teste prova: a memória continua sendo achada depois (W6)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): renomear o workspace pela tela`

---

#### T4: Remover, com a guarda que o banco já impõe

**Where**: `components/WorkspacePanel.tsx` + testes

**Done when**:
- [ ] Desabilitado enquanto houver projeto, **com o motivo ao lado** — o mesmo padrão do `remover
      projeto` (W2)
- [ ] A recusa do daemon, se chegar, aparece como recusa e não como tela quebrada
- [ ] Remover leva a algum lugar: o seletor não pode ficar apontando para o que não existe mais
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): remover o workspace, só quando ele está vazio`

---

## Fase 3 — a prova

#### T5: O e2e do caminho que originou a feature

**Where**: `e2e/workspace-screen.spec.ts`

**Done when**:
- [ ] Um workspace **sem projeto**, memória de workspace escrita pela API, e revisada **pela tela**
- [ ] Renomear e ver o nome trocar nos dois lugares
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a memória do workspace sem um projeto aberto`

---

## O que fica fora, e onde foi anotado

| O quê | Onde |
|---|---|
| Tela de preferências (configuração de agente é **global**, não do workspace) | [backlog](../../project/backlog.md), buraco 1 do Open Design |
| Consumo por projeto e por worktree | [backlog](../../project/backlog.md), buraco 5 |
| Mover projeto entre workspaces | fora: é a operação mais destrutiva que o modelo permite, e ninguém pediu |
