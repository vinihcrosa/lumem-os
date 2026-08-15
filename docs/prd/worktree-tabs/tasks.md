# Worktree com abas — Tasks

**Protótipo:** `packages/web/prototype/lumem-tabs.html`
**Sucede:** [ui-shell](../ui-shell/tasks.md), que vestiu a árvore de três níveis
**Status:** direção validada — pronto pra execução
**Total:** 7 tasks

---

## O que muda, em uma frase

A sidebar para na worktree; as sessões daquela worktree viram abas.

Hoje a árvore tem três níveis e cada sessão é uma linha. Com dois ou três agentes por worktree a sidebar vira uma lista de processos, e a pergunta que ela deveria responder — *onde eu estou trabalhando* — fica soterrada pela pergunta *o que está rodando*.

O checkout principal do projeto entra na lista como `local`, o que dá à sidebar uma resposta de formato único: sempre uma worktree.

---

## Decisões que sustentam o resto

### D1 — Aba é trabalho vivo. Sessão encerrada não tem aba.

Decidido pelo Vinicius: *"não devem ter abas mortas, só vai poluir a UI"*.

O custo: o F5.9 do walking-skeleton diz que o buffer de uma sessão morta continua legível até você fechar — e é ali que mora o motivo de um agente ter caído, que o exit code sozinho não conta.

A conciliação não custa nada no servidor. Fechar a aba de uma sessão encerrada é **só descartar a visão**: o `sessionStore.close` já é no-op para sessão que saiu, o registro permanece e o ring buffer continua na memória do daemon. Então a aba some, a sessão continua listada na aba de contexto com seu exit code, e o botão `reabrir` traz o buffer de volta como aba enquanto ele existir.

### D2 — `local` é a worktree do próprio checkout.

Absorve o que era o detalhe do projeto: caminho, branch base, lista de worktrees, renomear e remover. Clicar na linha do projeto seleciona `local` — nenhuma linha da árvore fica sem destino.

**Assimetria declarada:** o servidor não expõe status nem ahead/behind do checkout principal, só `path` e `defaultBranch`. Então `local` mostra branch e não mostra suja/limpa. Campo novo no servidor é feature própria.

### D3 — O ponto verde vira contagem.

Com as sessões fora da árvore, a linha precisa dizer *quanto* está vivo ali dentro, não só que algo está. A contagem é de **sessões rodando**, não do total.

### D4 — Homônimo ganha índice.

Sessão não tem nome — só o da configuração de agente. Três `claude-code` na mesma worktree são três abas iguais, então a segunda em diante recebe um ordinal. Renomear sessão é campo novo no contrato e fica fora.

---

## Tasks

#### W1: Primitivas de aba

**What**: `Tab` e `TabStrip`, mais os estados na `/styleguide`.
**Where**: `packages/web/src/ui/Tab.tsx`, `ui.css`, `Styleguide.tsx`, `ui.test.tsx`
**Depends on**: nada

**Done when**:
- [ ] `Tab` com glifo, rótulo, ordinal opcional, ponto de estado e ✕
- [ ] `TabStrip` em duas camadas: a parte que rola e a ação fixa. O botão de nova sessão **não** fica dentro do `overflow` — menu ancorado nele seria recortado, e ele não pode sair da tela por excesso de abas
- [ ] ✕ não dispara a seleção da aba
- [ ] Styleguide cobre: uma aba, muitas com rolagem, nenhuma
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): tab strip primitives`

---

#### W2: Sidebar de dois níveis

**What**: A árvore para na worktree, `local` entra na lista, o pip vira contagem.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `sidebar.css`, `App.tsx`
**Depends on**: W1

**Done when**:
- [ ] Nível de sessão sai da árvore
- [ ] `local` é a primeira worktree de todo projeto disponível, com glifo próprio (D2)
- [ ] Clicar na linha do projeto seleciona `local` (D2)
- [ ] Contagem de sessões rodando na linha, verde quando > 0 e neutra quando só há encerradas (D3)
- [ ] `useSessionsByScope` segue alimentando a contagem pelo mesmo cache
- [ ] Testes de árvore atualizados
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): stop the sidebar at the worktree`

---

#### W3: `useWorktreeTabs`

**What**: Quais sessões são abas, qual está ativa, e o que acontece quando uma sai.
**Where**: `packages/web/src/hooks/useWorktreeTabs.ts` + teste
**Depends on**: W2

**Done when**:
- [ ] Deriva as abas das sessões **rodando** do escopo, mais as encerradas que o usuário reabriu (D1)
- [ ] Sessão que sai sozinha perde a aba; se era a ativa, a seleção cai na aba de contexto
- [ ] Ordinal por homônimo, estável na ordem de criação (D4)
- [ ] Reabrir uma encerrada devolve a aba até ser fechada de novo
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 3 casos — sai e some, sai sendo a ativa, reabre

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): derive worktree tabs from live sessions`

---

#### W4: Painel da worktree

**What**: Cabeçalho fixo, faixa de abas, aba de contexto.
**Where**: `packages/web/src/components/WorktreePanel.tsx`, `detail.css`, `App.tsx`
**Depends on**: W3

**Done when**:
- [ ] Cabeçalho — crumb, título, chips, remover — **acima** da faixa: é contexto de todas as abas e não se move ao trocar de aba
- [ ] Aba de contexto: metadados, ações, lista de sessões com estado, idade e `reabrir` nas encerradas
- [ ] Bloqueios de remoção (suja, sessão viva) preservados
- [ ] `worktree-ui.test.tsx` atualizado
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the worktree panel and its context tab`

---

#### W5: Painel `local`

**What**: O checkout principal como worktree.
**Where**: `packages/web/src/components/LocalPanel.tsx` (ou o mesmo painel com variante)
**Depends on**: W4

**Done when**:
- [ ] Caminho, branch base, worktrees do projeto, nova worktree, renomear e remover projeto
- [ ] Sem chip de suja/limpa, com o motivo dito na tela (D2)
- [ ] Projeto fora do disco continua bloqueando ação e mantendo o registro
- [ ] `project-ui.test.tsx` atualizado
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the project checkout as a local worktree`

---

#### W6: Aba de sessão

**What**: O terminal dentro da aba, sem sair do painel da worktree.
**Where**: `packages/web/src/components/SessionTab.tsx`, `terminal.css`
**Depends on**: W4

**Done when**:
- [ ] Terminal preenche o que sobra abaixo da faixa; o `FitAddon` continua medindo uma caixa com altura
- [ ] Trocar de aba **não** desmonta o terminal das outras — F5.6 e F5.7 valem entre abas como valiam entre telas
- [ ] ✕ numa sessão rodando encerra, com a confirmação que o gesto destrutivo pede
- [ ] `Terminal.test.tsx` e `session-ui.test.tsx` atualizados
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 1 caso novo — o buffer da aba inativa sobrevive

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the session as a tab`

---

#### W7: Varredura e2e

**What**: Os specs navegam pela árvore de três níveis que deixou de existir.
**Where**: `e2e/*.spec.ts`
**Depends on**: W6

**Done when**:
- [ ] Todos os e2e passam, sem asserção enfraquecida
- [ ] O critério central segue coberto: fecho o navegador com o agente trabalhando, reabro, ele continua
- [ ] Gate: `pnpm gate:full`

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): follow sessions into tabs`

---

## Risco

| O quê | Por quê | Mitigação |
|---|---|---|
| Trocar de aba desmontando o terminal | Seria a regressão mais cara da mudança: mata o buffer e força repintura a cada troca | W6 tem teste dedicado; abas inativas ficam montadas e escondidas |
| Aba somindo sozinha assusta | A sessão sai e a aba desaparece sem o usuário ter pedido | A linha continua na aba de contexto com exit code e `reabrir` (D1) |
| `local` confundido com worktree de verdade | Remover `local` seria remover o projeto | Glifo próprio e aviso na tela (D2) |
