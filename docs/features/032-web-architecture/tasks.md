# A arquitetura do web — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** em execução
**Histórico:** escritas em **2026-09-21**, no mesmo dia da PRD e das oito respostas. **As fases 0, 1,
2 e 3 (T1–T16) foram entregues no mesmo dia**, em dezesseis commits.

**34 tasks em 9 fases**, e a regra é a do repositório: uma fase por vez, a próxima só começa com a
anterior verde. O que prova cada fase é uma **lista de exceções do sensor em zero** — o número está
no diff de `architecture.test.ts`, e não precisa de leitura de componente para ser auditado. **A
fase 3 é a primeira em que essa frase não se sustenta** — ver o T16 abaixo: a lista sai de **33** para
**6**, e os seis que sobram são de recursos que as sete tasks nunca prometeram (`files`, `changes`,
`memory`, `usage`) ou de uma leitura combinada que os cobre por baixo (`setup/Done.tsx`). A regra
falha o próprio teste que ela impõe a si mesma — *"difícil de reverter, surpreendente sem contexto"*
não se aplica a uma frase de cabeçalho — então ela vira nota aqui, e não ADR.

**O que as fases 0–3 acharam, e nada disso estava previsto:**

| Onde | O quê |
|---|---|
| T2 | a PRD e a T2 estimavam **32** arquivos importando `lib/trpc.js` fora de `hooks/`; o disco tinha **33** — a estimativa contou `components/` e `setup/` e esqueceu `App.tsx`, que importa o `trpc` para o ping de saúde. O sensor mede o disco, não repete o número da PRD |
| T4 (achado consertado em commit próprio, `cd9549d`) | `useLiveState.ts` invalidava `["project", "get"]`, mas `LocalPanel`, `WorktreePanel` e `setup/Done` liam `["project", "get", id]` inline enquanto `useScopeIds.ts` já lia por `projectDetailKey()` — `["project", "detail", id]`. **Duas chaves para o mesmo dado**, e `project.changed` nunca alcançava o detalhe. Unificado nas três telas antigas |
| T6 | o primeiro `queryKeys.test.ts` comparava só o `[0]` de cada chave — a mesma classe de bug do item acima passaria como teste **verde**. Reescrito em review para comparar o prefixo inteiro, por texto e sem mapa de exportações à mão |
| T7/T8 (achado em review, consertado) | o `default` exaustivo de `invalidateFor` dava `throw` — dentro do `onData` de uma assinatura tRPC, isso fecha o iterador e mata a assinatura sem reconectar. Trocado por invalidar tudo e avisar |
| T8 | `events.test.ts` do servidor nasceu com uma segunda lista de variantes escrita à mão (`KNOWN_TYPES`) — o mesmo espelho que a T7 tinha apagado, só que num teste. Fechado com `LUMEM_EVENT_TYPES`, exportado do `shared` |
| T4 (em review) | `setupProbeKey(command, args)` — o nome que a PRD propunha — nasceu com argumento opcional no fim mudando a forma da chave; virou `SETUP_PROBE_KEY` (a constante, e o prefixo de invalidação) e `agentProbeKey(command, args)` (a chave por configuração), a armadilha que o `testing.md` já registra |
| T11 | `useAgentConfigMutations` — a PRD listava `setDefault`; a procedure não existe no router (`list`, `create`, `remove`, só). Construído com o que o disco tem |
| T12 | `setup/TaskStep.tsx` e `TaskCard.tsx` — listados como leitores de `task`; o primeiro só toca `worktree`/`session` apesar do nome, o segundo nunca importou `lib/trpc.js` (é apresentação pura, recebe tudo por prop do `Board`). Nenhum dos dois entra na T12 |
| T12 | `task.create` e `task.remove` — a PRD listava as duas em `useTaskMutations`; nenhuma tem chamador na web hoje. Não construídas — hook sem uso é hook sem teste real |
| T13 | `WorkspaceSelector.tsx` e `setup/WorkspaceStep.tsx` — listados como leitores de `project`/`worktree`; os dois só tocam `workspace.create`. Migrados na T15, não na T13 |
| T13 | `project.rename` — sem chamador na web. Não construída |
| T14 | `pr.comment` — sem chamador na web; é o lado do daemon (esteira, `028` Parte 7), não a tela. Não construída |
| T16 | **A lista não chega a zero.** Das 33 exceções do início da fase, sobram **6**: `Conversation.tsx` (por desenho — `connect`/`load` são socket), `FileTree.tsx` (`files`), `PatchViewer.tsx` (`changes`), `ProposalQueue.tsx` (`memory.proposals` — a parte de `task` dela migrou), `TaskList.tsx` (`usage.byTask` — a parte de `project` dela migrou) e `setup/Done.tsx` (`useQueries` batendo quatro recursos de uma vez, sem uma versão "`queryOptions`" de cada hook para alimentar o batch). Os quatro primeiros são recursos que as sete tasks desta fase nunca prometeram cobrir — a frase "sete recursos" no cabeçalho da fase está certa, e "lista em zero" no T16 está errada. `test/trpc-mock.ts` **continua existindo**: ainda é o único mock que os seis arquivos acima e boa parte da suíte de tela usam |
| T16 (achado de bônus) | `session.resume` já morava em `useWorktreeTabs.ts`, um hook — nunca apareceu na lista do sensor porque a regra 3 só audita `.tsx`. "Forget" da PRD é `session.close` no router; não existe procedure `forget` |

As duas primeiras armadilhas de teste (a do `[0]` e a do `throw`) estão no
[testing.md](../../project/testing.md).

---

## Antes de começar

**Nada trava.** As oito perguntas foram respondidas como propostas em 2026-09-21. Duas respostas
criam dependência de calendário, e não de código:

| Fase | Precisa de |
|---|---|
| 4 | **uma janela** sem outra worktree tocando `packages/web/src/components/` — é um `git mv` de 113 arquivos numa PR só, e o custo é conflito |
| 5 | **a LUM-63 nascer**: a fase 5 é a fase 0 dela ([Q4](open-questions.md)), então o `tasks.md` daquela aponta para as T22–T24 daqui |

**O que muda, se tudo passar como escrito:**

| Onde | O quê |
|---|---|
| `packages/web/src/architecture.test.ts` | novo — o sensor; cinco regras na fase 0, **seis** no fim da fase 4 (T17 achou que a sétima prometida duplicava a 1 e a 2) |
| `packages/web/src/lib/queryKeys.ts` | ganha 13 chaves e 7 prefixos; passa a ser a lista inteira |
| `packages/shared/src/{events,board}.ts` | novos — `LumemEvent`, `BoardCard`, `Seal` |
| `packages/web/src/hooks/use*.ts` | 16 hooks de recurso novos (movem para `features/*/queries.ts` na fase 4) |
| `packages/web/src/test/trpc-mock.ts` | previsto para sair no fecho da fase 3; **continua** — a T16 achou 6 exceções fora dos sete recursos, ver a linha do T16 acima. `trpc-proxy.ts` (~30 linhas) já existe ao lado |
| `packages/web/src/components/`, `setup/` | **deixam de existir** — `features/<domínio>/` |
| `packages/web/src/lib/navigation.ts` | novo — o store de `selection` e `arrival` |
| `packages/web/src/App.tsx` | de 497 para menos de 250 linhas, 3 `useState` |
| `Conversation`, `MemoryPanel`, `AgentLogin` | em 3, 5 e 4 arquivos |
| `**/*.css` | um `index.css` por feature; dez blocos renomeados; zero bloco duplicado |
| `docs/project/testing.md` | a linha *"arquitetura do web"* na matriz, e o que o sensor não garante |

---

## Fase 0 — o sensor · gate `pnpm gate:quick`

#### T1: `architecture.test.ts` — as regras 1, 2 e 5 · **entregue em 2026-09-21**

Um teste vitest em `packages/web/src/` que percorre `src/**` com `readdirSync` e lê os `import` de
cada arquivo com uma regex (não precisa de parser: os imports do repositório são todos
`import ... from "..."` de uma linha, com `verbatimModuleSyntax`). Três asserções:

- **`ui/` não conhece dado:** nenhum arquivo em `ui/` importa `../components`, `../hooks`,
  `../lib/trpc` nem `@tanstack/react-query`. Sem lista de exceções — a única violação de hoje é a
  story, e a T3 a conserta.
- **`lib/` não conhece tela:** nenhum arquivo em `lib/` importa `../components` nem `../hooks`.
  Exceção: `lib/board.ts` (cai na T9).
- **hook tem nome de hook:** todo arquivo em `hooks/` que exporta `function use*` chama-se
  `use*.ts(x)`. Exceção: `notice.ts` (cai na T19).

A mensagem de falha é **remediação**, não regra: *"`lib/board.ts` importa `components/TaskSeal.js`
— biblioteca não depende de tela; mova o tipo para `shared/` ou para `lib/`"*. O critério é o da
T10 da [`024`](../024-dev-harness/tasks.md): um agente sabe o que fazer sem abrir o teste.

**Done when:** o teste passa no `HEAD` com as duas exceções; adicionar `import { trpc }` a
`ui/Button.tsx` reprova nomeando o arquivo; a mensagem diz o que fazer.

#### T2: as regras 3 e 4 — transporte e chave, com lista que só encolhe · **entregue em 2026-09-21**

Duas asserções a mais no mesmo arquivo, e o mecanismo da lista:

- **componente não conhece transporte:** nenhum `.tsx` fora de `hooks/` importa `lib/trpc.js`.
  Lista de exceções com os **32** de hoje, por caminho.
- **toda chave nasce em `queryKeys.ts`:** nenhum `queryKey: [` e nenhuma `const *_KEY = [` fora
  de `lib/queryKeys.ts`. Listas com os **16** e os **7** arquivos de hoje.
- **exceção que sobrou reprova também:** se um arquivo da lista **não** viola mais, o teste falha
  dizendo *"`X` não precisa mais de exceção — remova-o da lista"*. É o que impede a lista de virar
  o lugar onde a regra morre.

**Done when:** passa no `HEAD` com 32/16/7; adicionar `import { trpc }` a `ChangesTab.tsx` (fora da
lista) reprova; tirar `Board.tsx` da lista sem consertá-lo reprova; consertar `Board.tsx` sem tirá-lo
reprova; `gate:quick` não passa de +2 s sobre o de hoje.

#### T3: a story de `RightPanel` sai de `Primitives`, e o `testing.md` ganha a linha · **entregue em 2026-09-21**

`ui/Primitives.stories.tsx:4` importa uma tela. A story `ColunaDeArquivos` sai daí com um
comentário dizendo que volta em `features/checkout/RightPanel.stories.tsx` na T33. E a matriz de
cobertura do [testing.md](../../project/testing.md) ganha *"arquitetura do web"*: o que o sensor
garante (direção de dependência, chave, transporte) e o que **não** garante (comportamento — isso
é dos testes de componente e dos e2e).

**Done when:** a regra 1 da T1 passa **sem** exceção; `build-storybook` verde; `testing.md` com a
linha.

---

## Fase 1 — as chaves · gate `pnpm gate:quick`

#### T4: as 21 chaves de leitura vão para `queryKeys.ts` · **entregue em 2026-09-21**

Uma função ou constante por chave, com o comentário de **prefixo** que as outras já têm:
`HEALTH_KEY`, `agentConfigsKey()`, `secretsKey()`, `setupAgentsKey()`, `setupProbeKey(command,
args)`, `PREFLIGHT_KEY`, `authStateKey(loginId)`, `projectInspectKey(path)`,
`worktreePlanKey(projectId, name)`, `parseSourceKey(workspaceId, source, name)`,
`taskByWorktreeKey(worktreeId)`, `sessionsByTaskKey(taskId)`, `usageByTaskKey(workspaceId)`. E
`["project", "get", id]` em `LocalPanel`, `WorktreePanel` e `Done` vira o `projectDetailKey` que
**já existe**.

Os 16 arquivos passam a importar; as 7 constantes locais (`AGENT_CONFIGS_KEY` em cinco arquivos,
`AGENTS_KEY`, `PROBE_KEY`, `PREFLIGHT_KEY`) são apagadas.

**Done when:** as listas 4 da T2 estão em **zero** e o teste as exige em zero;
`grep -rn '"agentConfig"' packages/web/src --include='*.tsx'` devolve nada; `gate:quick` verde sem
mudar asserção nenhuma.

#### T5: os prefixos de invalidação viram constantes, e o `invalidateFor` os usa · **entregue em 2026-09-21**

`["memory"]`, `["pr"]`, `["files"]`, `["changes"]`, `["worktree"]`, `["session"]`,
`["secrets"]`, `["task", "get"]`, `["task", "board"]`, `["task", "settings"]`, `["project",
"get"]` viram `MEMORY_PREFIX`, `PR_PREFIX`… em `queryKeys.ts`. `useLiveState.ts`, `useMemory.ts`,
`usePullRequest.ts`, `useFileTree.ts`, `useFileBuffer.ts`, `useScripts.ts`, `CheckoutFiles.tsx`,
`PrWriteDialog.tsx`, `CredentialDialog.tsx` passam a usar.

Isso deixa o sensor exigir que **todo literal de chave** viva em `queryKeys.ts`, sem distinguir
leitura de invalidação — a T2 ganha essa regra aqui.

E o que **não** entra: `agent_config.changed` e `secret.changed` como eventos do daemon. É
servidor. Vai para o [backlog](../../project/backlog.md) com o gatilho *"a primeira tela que
precisar ver um login feito em outra aba"*, e o `useLiveState.ts` ganha a nota.

**Done when:** `grep -rn 'invalidateQueries({ queryKey: \[' packages/web/src` devolve nada fora de
`queryKeys.ts`; `useLiveState.test.tsx` verde **sem alteração**; backlog com a entrada.

#### T6: `queryKeys.test.ts` — a lista fechada de prefixos, e a prova de que o login alcança · **entregue em 2026-09-21**

Dois testes:

- toda chave exportada de `queryKeys.ts` começa por um prefixo de uma lista fechada (`workspace`,
  `project`, `worktree`, `task`, `session`, `scripts`, `files`, `changes`, `memory`, `usage`, `pr`,
  `agentConfig`, `secrets`, `setup`, `health`, `pty`), e **nenhum prefixo existe só em invalidação**
  — um prefixo que ninguém lê é a lista mentindo para o outro lado.
- um teste de componente que renderiza `AgentLogin` **e** `NewSessionMenu`, dispara a mutação de
  login e conta **duas** chamadas de `agentConfig.list.query` — a da chegada e a da invalidação.
  É o molde do teste da armadilha *"chave escrita à mão"* do `testing.md`: contar a leitura, e não a
  classe, porque a classe estaria certa com o dado errado no cache.

**Done when:** os dois passam; apagar a invalidação de dentro de `AgentLogin` faz o segundo
reprovar com *"expected 2, received 1"*.

---

## Fase 2 — os contratos · gate `pnpm gate:build` e `pnpm gate:quick`

#### T7: `LumemEvent` mora em `shared` · **entregue em 2026-09-21**

`packages/shared/src/events.ts` novo, exportado pelo `index.ts`. `packages/server/src/events.ts`
importa e reexporta. `hooks/useLiveState.ts` apaga a redeclaração **e o `event as LumemEvent`** — se
o tipo do `onData` da assinatura tRPC já for o do `shared`, nem o import é preciso.

**Done when:** `grep -rn 'as LumemEvent' packages/web/src` vazio; **mutação:** adicionar
`| { type: "secret.changed" }` ao tipo no `shared` **derruba o typecheck** do `switch` em
`invalidateFor` — o comportamento que `AcpEvent` já tem.

#### T8: `LumemEvent` tem teste de exaustividade dos dois lados · **entregue em 2026-09-21**

`useLiveState.test.tsx` ganha o caso que hoje só existe para `AcpEvent`: um `satisfies never` no
`default` do `switch`, para a mutação da T7 ser falha de **teste**, e não só de `tsc`. E o
`events.test.ts` do servidor afirma que todo `emit` do repositório usa uma variante do `shared`.

**Done when:** a mutação da T7 faz **um teste** ficar vermelho em cada pacote.

#### T9: `BoardCard`, `BoardColumn` e `Seal` moram em `shared`; `lib/board.ts` para de importar tela · **entregue em 2026-09-21**

`packages/shared/src/board.ts` novo, com o que `lib/board.ts` e `TaskSeal.tsx` espelham de
`packages/server/src/tasks/board.ts` — **datas como `string`**, porque a fronteira que o `shared`
descreve é a serializada. O servidor passa a produzir esse tipo. `lib/board.ts` fica com as
funções puras de coluna e **deixa de importar `components/TaskSeal.js`**: a exceção 2 da T1 cai.
`useCloneJob.ts` faz o mesmo com o progresso do clone.

E a regra 5 do §3 vira parágrafo no `testing.md`, ao lado da armadilha do `AcpEvent`: *"nomeado nos
dois lados → `shared`; lido só pelo web → inferido; espelhado → não existe"*.

**Done when:** `grep -rni 'espelha\|mirrors' packages/web/src` vazio; a regra 2 da T1 passa **sem**
exceção; **mutação:** um campo novo em `BoardCard` no servidor sem o `shared` derruba o typecheck
**do servidor** — e não o do web em silêncio.

---

## Fase 3 — a camada de dados · gate `pnpm gate:quick` por PR, `pnpm gate:full` no fecho

Sete recursos, sete PRs, na ordem da lista 3 do sensor. Cada PR tem a **mesma forma**, decidida na
[Q5](open-questions.md): cria `hooks/use<Recurso>.ts`, com teste próprio que mocka o `trpc` pelo
`Proxy` da T10; migra os componentes daquele recurso; **reescreve os testes dessas telas** para
mockar o hook (`vi.mock("../hooks/use<Recurso>.js")`) em vez do transporte. A forma de retorno é a
do `useQuery`/`useMutation`, sem embrulho — o que muda é quem chama, não a API. Mutação **invalida
dentro do hook**; o componente nunca vê `useQueryClient`.

#### T10: `test/trpc-proxy.ts` — o mock de transporte que não precisa conhecer a tela · **entregue em 2026-09-21**

Um `Proxy` recursivo tipado por `AppRouter`: `trpc.qualquer.coisa.query` devolve um `vi.fn()`
criado sob demanda, guardado por caminho para o teste poder `mockResolvedValue` nele. ~30 linhas.
Só teste de **hook** o usa; teste de tela mocka o hook.

**Done when:** `renderHook(() => useAgentConfigs())` com o proxy e um `mockResolvedValue([])`
devolve `data: []`; um caminho que o router não tem é **erro de tipo**.

#### T11: `agentConfig` — `useAgentConfigs`, e os oito leitores · **entregue em 2026-09-21**

`useAgentConfigs()`, `useAgentConfigMutations()` (`create`, `remove` — sem `setDefault`, que não
existe no router), `useAgentProbe(config)` (sai de `AgentLogin.tsx:165`), mais
`useSetupHandshakeProbe`, `useReprobeAgents`, `useSetupAgentsReport`, `useConnectAgent`,
`useCreateHandshakeAgentConfig`, `useAgentLoginByCommand`/`useAgentLoginByCall`, `useAuthState` e
`useCancelAuth` — o handshake e o login por chamada não couberam nos quatro nomes originais.
Leitores: `AgentLogin`, `AgentConfigDialog`, `NewSessionMenu`, `RunDock`, `TaskDetail`,
`WorkspacePanel`, `setup/HandshakeStep`, `setup/Done` (só a entrada de `agentConfig` do `useQueries`,
pela `agentConfigsQueryOptions()` — o resto do arquivo fica de fora, é `project`/`worktree`/`session`
num só `useQueries`).

**Done when:** os oito saem da lista 3; nenhum deles importa `useQueryClient`; o teste de
`useAgentConfigMutations` prova a invalidação de `agentConfigsKey()` **uma vez**; **mutação:**
apagar a invalidação de dentro do hook derruba o teste **do hook** — e não `agent-login.test.tsx`.

#### T12: `task` — `useBoard`, `useTaskDetail`, `useTaskMutations`, `useTaskSettings` · **entregue em 2026-09-21**

Os 5 `invalidateQueries` de `Board.tsx` entram em `useBoardMutations` (`move`, `stop`, `send`,
`takeOver`, `finish` — `setAutonomy`/`remove`/`create` da lista original não têm chamador). Os 4 de
`TaskDetail.tsx` entram em `useTaskStatusMutation` e `useWorkOnTaskMutation` (a composição
worktree+task+session de "trabalhar nesta tarefa"). Leitores reais: `Board`, `TaskList`,
`TaskDetail`, `WorktreePanel`, `LocalPanel` — `TaskCard.tsx` nunca importou `trpc` (apresentação
pura) e `setup/TaskStep.tsx` só toca `worktree`/`session` apesar do nome; os dois saem da lista T12.

**Done when:** os sete saem da lista; `board-drag.test.tsx` e `tasks-ui.test.tsx` passam mockando o
hook; o teste de *"clicar no degrau conta duas leituras"* do `testing.md` continua existindo — no
teste **do hook**, contando a invalidação de `taskSettingsKey`.

#### T13: `project` e `worktree` — detalhe, listas, origens e mutações · **entregue em 2026-09-21**

`useProjectDetail`, `useProjects(workspaceId)`, `useProjectMutations` (`add`, `clone`,
`cloneCancel`, `remove`, mais `invalidateProjects` para o gatilho manual do F1.9 — sem `rename`, que
não tem chamador), `useParseSource` (só usado em `AddProjectDialog`, não em `setup/`),
`useWorktreeDetail`, `useWorktrees(projectId)`, `useWorktreeOrigins`/`useWorktreeBranches` (as duas
chaves de branch e host), `useWorktreeMutations`. Leitores reais: `SidebarTree`, `LocalPanel`,
`WorktreePanel`, `CreateWorktreeDialog`, `AddProjectDialog`, `WorkspacePanel` — `WorkspaceSelector` e
`setup/WorkspaceStep`, listados aqui, só tocam `workspace.create`; migram na T15.

`useCloneJob` já existe e fica — é assinatura, não query.

**Done when:** os nove saem da lista; `worktree-from.test.tsx` (que hoje faz `invalidateQueries`
por conta própria, linha 1 do grep) passa sem tocar em `queryClient`.

#### T14: `pr` — a escrita que `usePullRequest` não tinha · **entregue em 2026-09-21**

`usePullRequestMutations` (`merge`, `create` — sem `comment`, que é o daemon chamando a si mesmo,
não a tela) em `usePullRequest.ts`, com as três invalidações de `PrWriteDialog.tsx:92-94` dentro.
Leitor: `PrWriteDialog`.

**Done when:** sai da lista; `pr-bar.test.tsx` intacto; o hook prova as três invalidações.

#### T15: `secrets` e `workspace` — configurações e credenciais · **entregue em 2026-09-21**

`useSecrets`, `useSecretMutations`, `useWorkspaceMutations` (`setBudget`, `setAutonomy`,
`setCleanup`, `rename`, `remove` — os três primeiros invalidam `taskSettingsKey`/`tasksKey`, onde são
lidos, e não uma chave de detalhe de workspace que não existe) e `useCreateWorkspace` (sem
`workspaceId`, para quem ainda não tem um). `useWorkspaceSettings` da PRD é o `useTaskSettings` que a
T12 já construiu — reusado, não duplicado. Leitores: `SettingsPanel`, `Credentials`,
`CredentialDialog`, `WorkspacePanel`, `WorkspaceSelector`, mais `setup/WorkspaceStep` (o `create` que
a T13 tinha listado errado).

**Done when:** os cinco saem da lista; `settings-ui.test.tsx` mocka `useWorkspaceMutations` e o
caso do teto `null` (a armadilha da `030`) continua afirmando o estado de partida.

#### T16: `setup`, `session` e o que sobrou · **entregue em 2026-09-21, sem chegar em zero**

`useSetupPreflight`, `useProjectInspect`, `useWorktreePlan` (novo arquivo, `hooks/useSetup.ts`) para
os passos do primeiro acesso, mais `useInstallAdapter` (junto de `useAgentConfigs.ts` — é o mesmo
catálogo que `useConnectAgent` já lê) e `useCreateFirstWorktree` (a composição worktree+sessão do
`setup/TaskStep`, que não é `useWorkOnTaskMutation` da T12 porque este fluxo não tem `taskId`).
`useSessionMutations` (`createShell`, `createAgent`, `close` — "resume" já morava em
`useWorktreeTabs.ts`, e "forget" da PRD é `close` no router) e `useSessionsByTask` entram em
`useSessionsByScope.ts`, que já existia. De bônus, dois hooks que a PRD não previu:
`hooks/useHealth.ts` (`useHealth`) e `useWorkspaces`/`useInvalidateWorkspaces` em
`useWorkspace.ts` — os dois únicos chamadores restantes eram o próprio `App.tsx`.

Leitores migrados: `NewSessionMenu`, `RunDock`, `ScopePanel`, `SessionTab`, `TaskDetail` (a leitura
de sessão que faltava), `SidebarNav` (reusa `useBoard` da T12), `ProposalQueue` e `TaskList` (a
metade de cada uma que é `task`/`project` — a outra metade, `memory`/`usage`, fica), `App.tsx` e
`SettingsPanel.tsx` (reusa `useSetupAgentsReport` da T11), e os cinco passos de `setup/` que
sobravam (`AgentStep`, `MachineStep`, `ProjectStep`, `TaskStep`, `WorkspaceStep`).

**A lista não chega a zero, e por isso `test/trpc-mock.ts` não é apagado.** Das 33 exceções do
início da fase, sobram **6**: `Conversation.tsx` (por desenho), `FileTree.tsx` (`files`),
`PatchViewer.tsx` (`changes`), `ProposalQueue.tsx` (`memory.proposals`), `TaskList.tsx`
(`usage.byTask`) e `setup/Done.tsx` (`workspace`+`project`+`worktree`+`session` num `useQueries` só,
sem uma forma "`queryOptions`" de cada hook para alimentar o batch sem duplicar a leitura). Nenhum
dos seis é `setup`, `session` ou `scripts` — são os quatro recursos que as sete tasks desta fase
nunca prometeram (`files`, `changes`, `memory`, `usage`) mais um caso estrutural. O `Done when`
original ("lista em zero", "`trpc-mock.ts` não existe") pressupunha que a fase cobria o disco
inteiro; ela cobre os sete recursos do cabeçalho, e o disco tinha mais que sete.

**Done when (revisado):** os leitores de `setup`/`session` migrados saem da lista; nenhum deles
importa `useQueryClient` (a exceção documentada é `WorktreePanel`-like `getQueryData` sem
assinatura, que já não está mais na lista de qualquer forma); `pnpm gate:quick` verde, 1195 testes;
`pnpm gate:full` roda antes do fecho da fase, e o que ele prova é que os 35 e2e continuam verdes com
a mudança de import — não que a lista chegou a zero.

---

## Fase 4 — as pastas · gate `pnpm gate:full` e `pnpm build-storybook`

Uma PR, numa janela anunciada, tudo com `git mv`. O mapa é o da tabela da fase 4 da PRD, validado
pela [Q3](open-questions.md).

#### T17: `features/<domínio>/` — o move, e a porta · **entregue em 2026-09-21**

Nove pastas: `conversation`, `memory`, `tasks`, `checkout`, `pull-request`, `workspace`, `agent`,
`settings`, `setup`. Cada uma com `index.ts` exportando o que outra feature pode usar. Os hooks de
recurso da fase 3 foram para `features/<x>/queries.ts` onde a Q6 previu um só — `agentConfig`,
`task`, `pr` e `setup` couberam num `queries.ts` cada; `project`, `worktree` e `workspace` **não**:
`workspace/` tem três recursos (`useProjects.ts`, `useWorktrees.ts`, `useWorkspace.ts`) e ficaram em
arquivos próprios, porque forçar os três num `queries.ts` só juntaria coisas que a T13 já tinha
separado por motivo. `hooks/` fica com o transversal — `useLiveState`, `useAwaitingPermission`,
`useOpenFiles` (que a T13 tinha posto em `checkout/`; `App.tsx` o usa direto, então voltou),
`usePopover`, `useHealth` (novo, só o `App.tsx` lia `health` e `workspace.list` sem hook — ganhou um
e `useWorkspaces`/`useInvalidateWorkspaces` foram para `workspace/`). `useSettled` **não** subiu:
só `setup/` o usa, e ele já mora lá. `lib/` perdeu `conversation-model`, `acp-socket`, `pty-socket`
(para `conversation/`) e `board` (para `tasks/`, renomeado `board-columns.ts` — `Board.tsx` e
`board.ts` colidem em nome case-insensitive, e o TS1149 travou o build até o achado).

O sensor ganhou **uma** regra nova, não duas: **feature importa feature só pelo `index.ts`**
(regra 6). *"`lib/` e `ui/` não importam `features/`"* já era a regra 1 e a regra 2 — só o regex
precisava trocar `components|setup` por `features`, e um `describe` a mais testaria a mesma coisa
duas vezes. A frase "sete regras" nasceu contando as duas separadamente; o sensor fica com **seis**.
A regra 3 ganhou a exceção `isFeatureQueryFile` — `features/*/(queries|use<Recurso>).tsx?` — porque
um hook de recurso mora dentro de `features/<x>/` de propósito, e o teste dele (`renderHook` pede
JSX, por isso `.tsx`) importa o `trpc` pelo mesmo motivo que sempre importou.

**O que a T17 achou, e nada estava previsto:**

| Onde | O quê |
|---|---|
| `git mv` | `Board.tsx` e `lib/board.ts` (movido para o mesmo diretório) colidem em nome — sistema de arquivo *case-insensitive* mistura os dois, e o `tsc` recusa com `TS1149` antes de qualquer teste rodar. Resolvido renomeando o segundo para `board-columns.ts` |
| import rewrite | reescrever 440 especificadores à mão seria a mesma classe de erro que a `032` existe para consertar do outro lado; um script fez a troca por análise de `git status --short \| grep '^R'`, resolvendo cada import contra a localização **antiga** do arquivo que o contém — a localização nova não basta, porque o import não mudou de texto, só o arquivo que o cerca mudou de lugar |
| a porta | 8 dos 9 `index.ts` usam `export *` — só assim uma tela que faz `import { TaskRow } from "../tasks/index.js"` (um tipo, não o componente) continua funcionando sem eu enumerar cada exportação à mão |
| `checkout-tab.test.tsx` | um `vi.mock` do `index.js` inteiro (`async (importOriginal) => ({...await importOriginal(), Terminal: ...})`) troca a identidade do `Terminal` mockado a cada render, e um teste que compara `toBe(nó anterior)` falha — o único teste dos 1196 que isso quebrou. Resolvido mockando `Terminal.js` direto, que nunca precisou da porta: `vi.mock` não é import estático e o sensor não o audita |
| `docs/features/{006,008}-*` | 8 links para `packages/web/src/components/*` e `hooks/*` quebraram — `pnpm docs:check`, parte do `gate:full`, é quem pega. Corrigidos para o caminho novo |

**Done when:** `components/` e `setup/` não existem — confirmado;
`git log --follow` (depois do commit) mostra o histórico anterior; o sensor passa com as **seis**
regras (não sete — ver achado acima); `.storybook/main.ts` já usava um glob recursivo e achou a
story sem mudar; `gate:full` verde — 1196 testes de `web`, 3954 do monorepo, 116 e2e (`conveyor.spec.ts`
falhou uma vez por um `setTimeout` de 20s da esteira, sem relação com este move, e passou limpo
sozinho).

#### T18: um `index.css` por feature

Os 32 `import "*.css"` saem dos componentes. Cada feature tem `index.css` com os `@import` dos
arquivos dela, importado **uma vez** pelo `index.ts`. `main.tsx` fica com `tokens`, `fonts`,
`base`, `ui.css`, `modal.css`; `App.tsx` com `layout.css`. A cascata deixa de depender de quem
monta primeiro.

O sensor ganha a regra: nenhum `import "…css"` fora de `main.tsx`, `App.tsx` e `features/*/index.ts`.

**Done when:** a regra passa; os dez `*-css.test.ts` continuam lendo o arquivo certo (eles leem por
caminho — o caminho muda, a asserção não).

#### T19: teste tem o nome do que testa

`session-ui.test.tsx` → `SessionTab.test.tsx`; `project-ui`, `workspace-ui`, `worktree-ui`,
`clone-ui`, `memory-ui`, `tasks-ui`, `settings-ui` idem. Onde um arquivo cobre dois componentes, ele
é dividido. `Terminal.test.tsx` já está certo. `notice.ts` → `useBoardNotices.ts` (a exceção 5 da
T1 cai).

**Done when:** todo `<Nome>.test.tsx` em `features/` tem um `<Nome>.tsx` irmão; a regra 5 passa sem
exceção; o número de casos de teste é **o mesmo** de antes (contado pelo `vitest --reporter=json`).

#### T20: os utilitários repetidos, com o arquivo já aberto

As cinco formatações de tempo (`Conversation.tsx:701`, `MemoryPanel.tsx:822`, `:826`, `:932`,
`pr-words.ts:307`) viram `lib/relative-time.ts`, que já existe. `stripComments` (3×), `splitLines`
(2×), `textFile` (2×) viram uma função cada, em `lib/`.

**Done when:** `grep -rn 'function formatWhen\|function formatStamp\|function lastUse\|function agoOf'`
devolve **um** arquivo; os testes que cobriam cada cópia cobrem a função única.

---

## Fase 5 — a navegação · gate `pnpm gate:full` · **é a fase 0 da LUM-63**

#### T21: `lib/navigation.ts` — o store, no molde de `route.ts`

`useSyncExternalStore`, sem biblioteca. Dois campos: `selection` e `arrival` (`{ sessionId,
text?, send }`), que funde `ask` (`send: true`), `draft` (`send: false`) e `openSessionId` (sem
texto). `selectScope` vai para cá e leva a regra *"`selection !== null` implica `route === "home"`"*
junto — o store é a **única** resposta a *onde eu estou*.

**A URL não entra.** Serializar `selection` é a LUM-63; este é o lugar onde ela vai escrever.

**Done when:** teste de unidade cobre `select`, `clear`, `arrive`, `consumeArrival`; `App.tsx` lê
`selection` do store e **não tem mais** `useState` de `selection`, `ask`, `draft` nem
`openSessionId`.

#### T22: `useArrival(sessionId)` — o one-shot num lugar só

O hook que a `Conversation` chama e que **consome** a chegada uma vez. `ScopePanel`, `SessionTab`,
`WorktreePanel` e `LocalPanel` **perdem** `openSessionId`, `initialPrompt` e `initialDraft`; o
`useEffect` do prompt inicial e o inicializador do rascunho na `Conversation` passam a ler o hook.

**Done when:** nenhuma interface `*Props` do `web` declara os três nomes; **mutação:** fazer
`useArrival` não consumir faz reprovar o teste *"o rascunho entra uma vez e não sobrescreve o que
foi digitado"* — que é o comportamento que o comentário de `initialDraft` protege hoje;
`00-onboarding.spec.ts` (*"criar e abrir a conversa"*), `acp-conversation.spec.ts` e o caso do
rodapé sem `[scripts]` em `RunDock.test.tsx` verdes **sem mudança de asserção**.

#### T23: `useRightPanel` vira contexto, e `filesPanel` sai das props

O mesmo desenho de `OpenFilesProvider`, pelo motivo escrito lá. `ScopePanel`, `WorktreePanel` e
`LocalPanel` leem `useRightPanel()` direto. O comentário copiado três vezes sobre *"vem de fora
porque o estado é do app"* fica **uma** vez, no provider.

**Done when:** `filesPanel` não existe em nenhuma `*Props`; `right-panel.test.tsx` verde.

#### T24: o `App` encolhe para o que é dele

Ficam `setupOpen` (o único estado não derivável — o comentário explica), `addProjectOpen` e
`worktreeFor`. `renderPanel` e `renderRightPanel` viram componentes (`MainColumn`,
`RightColumn`) que leem o store.

**Done when:** `App.tsx` tem no máximo **3** `useState` e menos de **250** linhas; `App.test.tsx`
verde; `gate:full` verde.

---

## Fase 6 — os três grandes · gate `pnpm gate:full`

#### T25: teto de 400 no sensor, com o mapa dos oito

Regra 8: arquivo `.ts`/`.tsx` em `features/` acima de **400** linhas reprova, salvo mapa com o
tamanho atual, que só encolhe: `SettingsPanel` 679, `FileTree` 640, `useFileBuffer` 605, `RunDock`
601, `CreateWorktreeDialog` 547, `Board` 461, `FileViewer` 461, `WorkspacePanel` 450 — mais os
três desta fase até as T26–T29 os tirarem. Sem teto em `lib/` ([Q8](open-questions.md)).

**Done when:** passa no `HEAD`; +20 linhas em `RunDock` reprova; −20 passa e o mapa aceita o número
menor; o mapa **não aceita** número maior.

#### T26: `useConversationSession` — o transporte sai do componente

O `useReducer` com `conversation-model`, o ciclo do socket, o caminho `load` do transcript morto e
a sincronização com `useAwaitingPermission` — o par de efeitos com `setWaitingRef`, cujo comentário
explica a oscilação, vai **inteiro**. Devolve `{ state, attached, readOnly, send, cancel, answer,
setMode, setConfig }`. `connect` e `load` injetáveis passam a ser opções do hook.

O `Conversation.test.tsx` muda só o import do que injeta. E ganha o teste que o componente não
conseguia ter: **desmontar fecha o socket e limpa o `awaiting`**, com `renderHook`, sem DOM.

**Done when:** o hook tem teste próprio; `Conversation.tsx` não tem `useReducer` nem `socketRef`;
os seis `useEffect` de hoje estão em no máximo dois arquivos, cada um com o comentário que tinha.

#### T27: `Composer` e `Transcript`

`Composer`: rascunho, envio, `LumemModePill`, menu de modo, `FreeModeGate`, `SlashMenu`,
`ConfigPills`, `UsageFooter`. Recebe `session`, `readOnly`, `onSend`, `onCancel`. `Transcript`: a
lista de `BlockView`, `ResumeMark`, `EmptyConversation`, `useAutoScroll`. `Conversation` fica a
composição.

**Done when:** `Conversation.tsx` abaixo de **120** linhas; `Composer` e `Transcript` abaixo de 400
cada e **fora do mapa**; `composer-menus.spec.ts` e `acp-conversation.spec.ts` verdes sem mudança.

#### T28: `MemoryPanel` por aba

`MemoryEntries.tsx`, `MemoryProposals.tsx` (com `PendingProposal`, `EditAndApprove`,
`ConfirmReject`, `Conflict`, `Evidence`), `MemoryTimeline.tsx`, `MemoryPlaybooks.tsx`,
`MemoryNumbers.tsx`. `MemoryPanel` fica o `TabStrip` e o roteamento de aba. `MemoryProposals` já
é exportado e usado por `ProposalQueue` — a fronteira só passa a existir no disco.

**Done when:** seis arquivos, nenhum acima de 400; `MemoryPanel.test.tsx` e `ProposalQueue.test.tsx`
verdes sem mudança de asserção.

#### T29: `AgentLogin` em quatro, e `agent-words.ts`

`AgentRow.tsx`, `ConnectPanel.tsx`, `AgentPanel.tsx`, `LoginOptions.tsx`. `describeSpec`,
`describeMethod`, `needsKey`, `entryOf` viram `agent-words.ts` — o desenho de `pr-words.ts`.
`useAgentProbe` já saiu na T11.

**Done when:** nenhum acima de 400; `AgentLogin.test.tsx` e `agent-login.spec.ts` verdes; o mapa da
T25 tem exatamente os oito originais.

---

## Fase 7 — o CSS · gate `pnpm gate:quick` e `pnpm build-storybook` · **caminho A**

#### T30: variante de primitiva volta para a primitiva; bloco duplicado morre

`.btn--brand` e `.btn--warn` saem de `conversation.css` para `ui.css`, ao lado das outras
variantes de `.btn`. `.empty` e `.meta` deixam de existir em `conversation.css` — o que
`conversation` precisava a mais vira modificador (`.empty--conversation`), nunca redefinição.

**Done when:** nenhum bloco de primeiro nível definido em dois arquivos (a T32 o prova por teste);
os 119 pares de `contrast.ts` intactos.

#### T31: os dez blocos por extenso

`.tc` → `.tool-card`, `.u` → `.usage`, `.mopt` → `.mode-option`, `.mmenu` → `.mode-menu`,
`.stab` → `.session-tab`, `.tdet` → `.task-detail`, `.tprov` → `.task-provenance`, `.tsess` →
`.task-sessions`, `.tstat` → `.task-status`, `.pq-item` → `.proposal-item`. CSS, `.tsx`, os
`*-css.test.ts` e o `contrast.ts` mudam juntos, num commit por bloco — o `git blame` de cada
renome fica legível.

**Done when:** `grep -rn 'className="\(tc\|u\|mopt\|mmenu\|stab\|tdet\|tprov\|tsess\|tstat\|pq-item\)[ "]'`
vazio; nenhum bloco de uma ou duas letras em `**/*.css`; `gate:quick` verde.

#### T32: o sensor de CSS — duplicado e órfã

Um teste que lê todo `.css` do `web`, extrai os blocos de primeiro nível e reprova **bloco em dois
arquivos** e **classe usada em `.tsx` sem definição** — as 13 órfãs que a `028` Parte 3 pagou,
como teste. Classes montadas dinamicamente (`` `btn--${variant}` ``) entram numa lista de
prefixos conhecidos.

**Done when:** passa no `HEAD` depois da T30 e T31; adicionar `.card {}` a `tasks.css` reprova;
usar `className="tool-cardd"` reprova nomeando arquivo e linha.

---

## Fase 8 — testes e galeria · gate `pnpm build-storybook` e `pnpm gate:quick`

#### T33: cinco stories de tela — os estados caros

Uma por estado que o [ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md)
promete e a galeria não tem: workspace sem acervo (`MemoryPanel` vazio), orçamento bloqueado
(`Board` com cartão bloqueado), vinte modelos no seletor (`ConfigPills`), conversa com permissão
pendente (`Conversation` com o `connect` falso da T26 — sem daemon), e `RightPanel` (a que saiu na
T3). Em `features/<x>/<Nome>.stories.tsx`, com os hooks mockados pelo mesmo `vi.mock` dos testes —
a story e o teste compartilham o fake.

**Done when:** `build-storybook` renderiza as cinco; cada uma monta sem chamada de rede (o proxy da
T10 reprova qualquer `query` não mockada).

#### T34: `testing.md` fecha a feature

A linha *"arquitetura do web"* da matriz ganha os números finais: oito regras no sensor, todas as
listas em zero, o mapa de tamanho com os oito. E as armadilhas que as fases acharem entram na
seção *"Armadilhas já corrigidas"* — a PRD prevê pelo menos uma na fase 3 (*"teste que passava por
acidente do mock"*), e a regra do repositório é registrar cada uma com sintoma, causa e o que passou
a avisar antes.

**Done when:** `pnpm docs:check` verde; o `**Status:**` desta PRD e deste arquivo dizem `completa`
— e o §Estado atual do `CLAUDE.md` tem o parágrafo da `032`.
