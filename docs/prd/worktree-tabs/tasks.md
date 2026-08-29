# Worktree com abas — Tasks

**Protótipo:** `packages/web/prototype/lumem-tabs.html`
**Sucede:** [ui-shell](../ui-shell/tasks.md), que vestiu a árvore de três níveis
**Status:** concluída — 8 de 8 entregues, gate cheio verde
**Total:** 8 tasks (a oitava veio depois, da [issue #14](https://github.com/vinihcrosa/lumem-os/issues/14))

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

A conciliação não custa nada no servidor. Fechar a aba de uma sessão encerrada é **só descartar a visão**: o `sessionStore.close` já é no-op para sessão que saiu, o registro permanece e o ring buffer continua na memória do daemon. Então a aba some, a sessão continua listada na aba de contexto com seu exit code, e o botão `ver registro` traz o buffer de volta como aba enquanto ele existir — como registro, não como terminal (D5).

### D2 — `local` é a worktree do próprio checkout.

Absorve o que era o detalhe do projeto: caminho, branch base, lista de worktrees, renomear e remover. Clicar na linha do projeto seleciona `local` — nenhuma linha da árvore fica sem destino.

**Assimetria declarada:** o servidor não expõe status nem ahead/behind do checkout principal, só `path` e `defaultBranch`. Então `local` mostra branch e não mostra suja/limpa. Campo novo no servidor é feature própria.

### D3 — O ponto verde vira contagem.

Com as sessões fora da árvore, a linha precisa dizer *quanto* está vivo ali dentro, não só que algo está. A contagem é de **sessões rodando**, não do total.

### D4 — Homônimo ganha índice.

Sessão não tem nome — só o da configuração de agente. Três `claude-code` na mesma worktree são três abas iguais, então a segunda em diante recebe um ordinal. Renomear sessão é campo novo no contrato e fica fora.

### D5 — Aba de sessão encerrada é registro, e se apresenta como tal.

A D1 diz que aba é trabalho vivo e o F5.9 diz que o buffer de uma sessão morta continua legível. As duas juntas produziram o que a [issue #14](https://github.com/vinihcrosa/lumem-os/issues/14) achou: `reabrir` devolvia uma aba idêntica à de uma sessão viva — mesmo cabeçalho, mesmo cursor piscando — onde digitar não fazia nada e não dizia nada.

O comportamento estava certo; a **afordância** estava mentindo. O que muda é só o que a tela promete:

| Antes | Agora |
|---|---|
| botão `reabrir` | botão `ver registro` — só sessão encerrada chega aqui, porque viva não perde aba |
| aba igual à de sessão viva, com o ponto de estado como único sinal | aba com a nota `registro` ao lado do rótulo |
| cursor piscando, foco roubado, digitar falha calado | terminal em somente leitura: `disableStdin`, sem cursor, sem foco, e nada sai do navegador |
| nenhuma saída dali | frase dizendo o que é aquilo, e `nova sessão igual` ao lado |

**O que continua fora:** retomar o processo morto. O daemon não tem isso — o PTY acabou —, então a tela não insinua que tem. `nova sessão igual` abre uma sessão nova, com o mesmo comando e no mesmo escopo, e é a coisa mais próxima que existe de verdade. Retomar contexto de agente (o `/resume` do Claude CLI) é feature própria, não afordância de aba.

A troca de somente leitura acontece **no lugar**, sem remontar: sessão que morre com a aba aberta viraria repintura e perderia a rolagem de quem estava lendo.

---

## Tasks

#### W1: Primitivas de aba

**What**: `Tab` e `TabStrip`, mais os estados na `/styleguide`.
**Where**: `packages/web/src/ui/Tab.tsx`, `ui.css`, `Styleguide.tsx`, `ui.test.tsx`
**Depends on**: nada

**Done when**:
- [x] `Tab` com glifo, rótulo, ordinal opcional, ponto de estado e ✕
- [x] `TabStrip` em duas camadas: a parte que rola e a ação fixa. O botão de nova sessão **não** fica dentro do `overflow` — menu ancorado nele seria recortado, e ele não pode sair da tela por excesso de abas
- [x] ✕ não dispara a seleção da aba
- [x] Styleguide cobre: uma aba, muitas com rolagem, nenhuma
- [x] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): tab strip primitives`

---

#### W2: Sidebar de dois níveis

**What**: A árvore para na worktree, `local` entra na lista, o pip vira contagem.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `sidebar.css`, `App.tsx`
**Depends on**: W1

**Done when**:
- [x] Nível de sessão sai da árvore
- [x] `local` é a primeira worktree de todo projeto disponível, com glifo próprio (D2)
- [x] Clicar na linha do projeto seleciona `local` (D2)
- [x] Contagem de sessões rodando na linha, verde quando > 0 e neutra quando só há encerradas (D3)
- [x] `useSessionsByScope` segue alimentando a contagem pelo mesmo cache
- [x] Testes de árvore atualizados
- [x] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): stop the sidebar at the worktree`

---

#### W3: `useWorktreeTabs`

**What**: Quais sessões são abas, qual está ativa, e o que acontece quando uma sai.
**Where**: `packages/web/src/hooks/useWorktreeTabs.ts` + teste
**Depends on**: W2

**Done when**:
- [x] Deriva as abas das sessões **rodando** do escopo, mais as encerradas que o usuário reabriu (D1)
- [x] Sessão que sai sozinha perde a aba; se era a ativa, a seleção cai na aba de contexto
- [x] Ordinal por homônimo, estável na ordem de criação (D4)
- [x] Reabrir uma encerrada devolve a aba até ser fechada de novo
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 3 casos — sai e some, sai sendo a ativa, reabre

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): derive worktree tabs from live sessions`

---

#### W4: Painel da worktree

**What**: Cabeçalho fixo, faixa de abas, aba de contexto.
**Where**: `packages/web/src/components/WorktreePanel.tsx`, `detail.css`, `App.tsx`
**Depends on**: W3

**Done when**:
- [x] Cabeçalho — crumb, título, chips, remover — **acima** da faixa: é contexto de todas as abas e não se move ao trocar de aba
- [x] Aba de contexto: metadados, ações, lista de sessões com estado, idade e `reabrir` nas encerradas
- [x] Bloqueios de remoção (suja, sessão viva) preservados
- [x] `worktree-ui.test.tsx` atualizado
- [x] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the worktree panel and its context tab`

---

#### W5: Painel `local`

**What**: O checkout principal como worktree.
**Where**: `packages/web/src/components/LocalPanel.tsx` (ou o mesmo painel com variante)
**Depends on**: W4

**Done when**:
- [x] Caminho, branch base, worktrees do projeto, nova worktree, renomear e remover projeto
- [x] Sem chip de suja/limpa, com o motivo dito na tela (D2)
- [x] Projeto fora do disco continua bloqueando ação e mantendo o registro
- [x] `project-ui.test.tsx` atualizado
- [x] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the project checkout as a local worktree`

---

#### W6: Aba de sessão

**What**: O terminal dentro da aba, sem sair do painel da worktree.
**Where**: `packages/web/src/components/SessionTab.tsx`, `terminal.css`
**Depends on**: W4

**Done when**:
- [x] Terminal preenche o que sobra abaixo da faixa; o `FitAddon` continua medindo uma caixa com altura
- [x] Trocar de aba **não** desmonta o terminal das outras — F5.6 e F5.7 valem entre abas como valiam entre telas
- [x] ✕ numa sessão rodando encerra, com a confirmação que o gesto destrutivo pede
- [x] `Terminal.test.tsx` e `session-ui.test.tsx` atualizados
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 1 caso novo — o buffer da aba inativa sobrevive

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the session as a tab`

---

#### W7: Varredura e2e

**What**: Os specs navegam pela árvore de três níveis que deixou de existir.
**Where**: `e2e/*.spec.ts`
**Depends on**: W6

**Done when**:
- [x] Todos os e2e passam, sem asserção enfraquecida
- [x] O critério central segue coberto: fecho o navegador com o agente trabalhando, reabro, ele continua
- [x] Gate: `pnpm gate:full`

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): follow sessions into tabs`

---

#### W8: O registro de uma sessão encerrada

**What**: A aba de sessão morta para de se passar por terminal (D5, issue #14).
**Where**: `packages/web/src/components/{Terminal,SessionTab,ScopePanel}.tsx`, `hooks/useWorktreeTabs.ts`, `ui/{Tab,Styleguide}.tsx`, `ui.css`, `terminal.css`, os testes de `Terminal`, `session-ui` e `ui`, e `e2e/session-record.spec.ts`
**Depends on**: W6

**Done when**:
- [x] `Terminal` aceita `readOnly`: `disableStdin`, sem cursor, sem roubar foco, e nada enviado ao daemon — nem tecla, nem colagem, nem relatório de mouse
- [x] Sessão que morre com a aba aberta vira registro **sem remontar**, preservando o scrollback
- [x] Aba de encerrada leva a nota `registro`; o painel leva chip, frase de somente leitura e `nova sessão igual`
- [x] `ver registro` no lugar de `reabrir` na lista da aba de contexto
- [x] `nova sessão igual` abre shell ou agente conforme a sessão de origem, e a recusa do daemon aparece na tela
- [x] Gate: `pnpm gate:full`
- [x] Test count: 2 unit no `Terminal`, 4 unit de fluxo, 1 na primitiva de aba, 1 e2e com PTY de verdade saindo por `exit`

**Tests**: unit + e2e · **Gate**: full
**Commit**: `fix(web): the tab of a dead session is a record, and says so`

---

## Risco

| O quê | Por quê | Mitigação |
|---|---|---|
| Trocar de aba desmontando o terminal | Seria a regressão mais cara da mudança: mata o buffer e força repintura a cada troca | W6 tem teste dedicado; abas inativas ficam montadas e escondidas |
| Aba somindo sozinha assusta | A sessão sai e a aba desaparece sem o usuário ter pedido | A linha continua na aba de contexto com exit code e `ver registro` (D1, D5) |
| `local` confundido com worktree de verdade | Remover `local` seria remover o projeto | Glifo próprio e aviso na tela (D2) |

## O que a execução achou

**A recusa da remoção renderizava dentro da aba de contexto.** O botão vive no cabeçalho, que está sempre visível, mas o aviso caía num painel que podia estar fechado — clicar e não ver nada. Foi pro cabeçalho, junto da ação.

**A confirmação de forçar escondia o botão normal.** Depois de encerrar as sessões que o daemon nomeou, não havia como tentar de novo pelo caminho seguro: só forçar. O botão ficou.

**A aba de uma sessão morta mentia por omissão.** Foi a [issue #14](https://github.com/vinihcrosa/lumem-os/issues/14), depois da entrega: o comportamento decidido na D1 estava implementado corretamente e ainda assim errado na tela, porque nada distinguia ler de trabalhar. O custo de conciliar D1 e F5.9 não era zero como a decisão dizia — era um rótulo, uma frase e um `disableStdin`. Está na D5 e na W8.

**Aba montada é aba que responde por si.** Com todas as sessões montadas ao mesmo tempo, `.xterm-rows` passou a casar uma por aba, e os e2e tiveram de mirar `[role=tabpanel]:not([hidden])`. É o preço de não desmontar — e valeu: teste ao vivo confirma que trocar de aba preserva o buffer.
