# A arquitetura do web — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** completa
**Histórico:** escritas em **2026-09-21**, no mesmo dia da PRD e das oito respostas. **As fases 0, 1,
2 e 3 (T1–T16) foram entregues no mesmo dia**, em dezesseis commits. **A fase 5 — a navegação
(T21–T24) — também fechou no mesmo dia**, em quatro commits: o store (`lib/navigation.ts`), o
one-shot da chegada (`useArrival`), a coluna de arquivos virando contexto e o `App` encolhendo para
`setupOpen`/`addProjectOpen`/`worktreeFor`, com `MainColumn`/`RightColumn`/`WorkspaceShell` a seu
lado em `src/`. É a fase 0 da LUM-63.

**34 tasks em 9 fases**, e a regra é a do repositório: uma fase por vez, a próxima só começa com a
anterior verde. O que prova cada fase é uma **lista de exceções do sensor em zero** — o número está
no diff de `architecture.test.ts`, e não precisa de leitura de componente para ser auditado. **A
fase 3 é a primeira em que essa frase não se sustenta** — ver o T16 abaixo: a lista sai de **33** para
**6** (a T26 tira `Conversation.tsx` depois, sobrando **5** — achado 4 da revisão independente,
2026-09-21, pós-fecho, corrigindo uma contagem que ficou parada no dia em que a T16 fechou), e os
que sobram são de recursos que as sete tasks nunca prometeram (`files`, `changes`, `memory`,
`usage`) ou de uma leitura combinada que os cobre por baixo (`setup/Done.tsx`). A regra falha o
próprio teste que ela impõe a si mesma — *"difícil de reverter, surpreendente sem contexto"* não se
aplica a uma frase de cabeçalho — então ela vira nota aqui, e não ADR.

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
| T16 | **A lista não chega a zero.** Das 33 exceções do início da fase, sobravam **6** no fecho desta task: `Conversation.tsx` (por desenho — `connect`/`load` são socket), `FileTree.tsx` (`files`), `PatchViewer.tsx` (`changes`), `ProposalQueue.tsx` (`memory.proposals` — a parte de `task` dela migrou), `TaskList.tsx` (`usage.byTask` — a parte de `project` dela migrou) e `setup/Done.tsx` (`useQueries` batendo quatro recursos de uma vez, sem uma versão "`queryOptions`" de cada hook para alimentar o batch). **A T26 tira `Conversation.tsx` da lista** (o transporte foi para `useConversationSession.ts`, fora do alcance da regra 3), sobrando **5** — a contagem aqui ficou parada no dia do fecho da T16, achado 4 da revisão independente (2026-09-21, pós-fecho). Os quatro primeiros são recursos que as sete tasks desta fase nunca prometeram cobrir — a frase "sete recursos" no cabeçalho da fase está certa, e "lista em zero" no T16 está errada. `test/trpc-mock.ts` **continua existindo**: ainda é o único mock que boa parte da suíte de tela usa |
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

#### T18: um `index.css` por feature · **entregue em 2026-09-21**

Os 29 `import "*.css"` (o disco tinha 29, não 32 — a T2 já tinha achado essa mesma diferença uma
vez, contando `components/` e `setup/` antes do `App.tsx`/`main.tsx`) saem dos componentes. Cada
feature ganhou `index.css` com o `@import` dos arquivos dela, importado **uma vez** pelo
`index.ts` — o próprio arquivo que a T17 criou. `main.tsx` ficou com `tokens`, `fonts`, `base`,
`ui.css`, `modal.css`; `App.tsx` com `layout.css`. `main.tsx` também perdeu `features/tasks/board.css`,
que só estava lá porque a T17 tinha movido o arquivo sem mover o import — vai para o `index.css` de
`tasks/`, e `App.tsx` perdeu `sidebar.css`/`clone.css` do mesmo jeito, para o de `workspace/`. As
importações **cruzadas** de feature (`checkout/detail.css` lido por `settings/` e `workspace/`,
`tasks/tasks.css` por `memory/` e `checkout/`, `pull-request/pr-bar.css` e `checkout/run-dock.css`
por `workspace/`) não foram *movidas* — foram **apagadas**: a cascata do CSS é global, e como toda
feature carrega o `index.ts` dela assim que alguém a importa (e o grafo a partir de `App.tsx`
alcança as nove), a folha já está presente quando a classe é pedida, sem precisar de um segundo
import dizendo a mesma coisa.

O sensor ganhou a regra 7: nenhum `import "…css"` fora de `main.tsx`, `App.tsx` e
`features/*/index.ts` — exceto teste, porque `styles/tokens.test.ts` importa `tokens.css` pelo
efeito colateral **de propósito** (é o que declara a aresta que o `vitest --changed` percorre), e
isso é sobre grafo de teste, não sobre a cascata do app. `@xterm/xterm/css/xterm.css`, importado
por `Terminal.tsx`, também não cai na regra — é pacote, não arquivo próprio.

**Done when:** a regra passa; `pnpm gate:build` embala um `index-*.css` só (135 kB, um bundle);
`pnpm gate:full` verde, 1197 testes — os onze `*-css.test.ts` (não dez: o disco tinha um mais) leem
por caminho, e o caminho mudou sem mudar a asserção.

#### T19: teste tem o nome do que testa · **entregue em 2026-09-21**

**Achado:** o plano estava errado sobre `session-ui`, `project-ui`, `workspace-ui`, `worktree-ui` e
`clone-ui` — nenhum dos cinco renomeia. Os cinco montam `<App>` e testam a integração entre
features, não um componente só; a regra 5 (teste tem o nome do que testa) não se aplica a arquivo
fora de `features/`, e por isso os cinco moram no `src/` raiz desde a T17, ao lado dos outros dois
já corretos (`checkout-tab.test.tsx`, `settings-route.test.tsx`, `agent-config.test.tsx`). A T17
tinha, na verdade, movido `session-ui.test.tsx` para dentro de `features/conversation/` por engano
— corrigido aqui: `git mv` de volta para `src/session-ui.test.tsx`, com os `../` de importação e o
`vi.mock` de `Terminal.js` ajustados para a profundidade nova.

O que renomeou de fato: `agent-login.test.tsx` → `AgentLogin.test.tsx`, `credentials.test.tsx` →
`Credentials.test.tsx`, `changes-tab.test.tsx` → `ChangesTab.test.tsx`, `file-tree.test.tsx` →
`FileTree.test.tsx`, `right-panel.test.tsx` → `RightPanel.test.tsx`, `run-dock.test.tsx` →
`RunDock.test.tsx`, `memory-ui.test.tsx` → `MemoryPanel.test.tsx`, `settings-ui.test.tsx` →
`SettingsPanel.test.tsx`, `task-card.test.tsx` → `TaskCard.test.tsx`, `setup-flow.test.tsx` →
`SetupFlow.test.tsx`, `workspace-panel.test.tsx` → `WorkspacePanel.test.tsx`, `worktree-from.test.tsx`
→ `CreateWorktreeDialog.test.tsx`, `board.test.tsx` → `Board.test.tsx`, `pr-bar.test.tsx` →
`PrBar.test.tsx`. `board-drag.test.tsx` e `board-notice.test.tsx` ficaram com o nome descritivo —
mesmo precedente de `terminal-refit.test.tsx`/`session-tab-transport.test.tsx`: um teste de facet
secundária, não o teste principal do componente, não pede o nome exato.

Três arquivos cobriam mais de um componente e foram divididos: `file-viewer.test.tsx` (314 linhas, 3
describes) virou `checkout/FileViewer.test.tsx` (16 casos), `checkout/TabSplit.test.tsx` (2 casos) e
um `describe` novo em `lib/shiki.test.ts` (2 casos, sobre `languageOf`/`splitLines` — função pura,
sem componente). `setup-steps.test.tsx` (361 linhas, 3 describes) virou `ProjectStep.test.tsx` (7),
`TaskStep.test.tsx` (7) e `Done.test.tsx` (5). `tasks/tasks-ui.test.tsx` (4 describes, cruzando duas
features) virou `tasks/TaskList.test.tsx` (8), `tasks/TaskDetail.test.tsx` (7, incluindo o
`describe` de `suggestName` — a mesma função, exportada por `TaskDetail.tsx`) e
`memory/ProposalQueue.test.tsx` (4) — o primeiro teste próprio que `ProposalQueue.tsx` ganha, porque
antes ele só vivia dentro do arquivo de outra feature.

`notice.ts` já tinha virado `useBoardNotices.ts` na T17 (a exceção 5 da T1 já tinha caído lá).

**Done when:** todo `<Nome>.test.tsx` em `features/` tem um `<Nome>.tsx` irmão, ou é uma facet
secundária com precedente nomeado; a regra 5 passa sem exceção; `tsc --noEmit` limpo; `vitest run`
verde com **1197** testes — o mesmo número de antes da T19, confirmado arquivo a arquivo em cada
split (19 em `setup/`, antes em um arquivo só e agora em três; 19 em `tasks/`+`memory/`, idem; 22
entre `checkout/FileViewer.test.tsx`+`TabSplit.test.tsx`+`lib/shiki.test.ts`).

**Achado 2 da revisão independente (2026-09-21, pós-fecho):** nove arquivos de
`features/conversation/` ficaram de fora desta lista sem entrar nem como renomeados nem como
exceção nomeada — `tool-card.test.tsx`, `message.test.tsx`, `plan-card.test.tsx`,
`slash-menu.test.tsx`, `usage-footer.test.tsx`, `permission-request.test.tsx`,
`lumem-mode-pill.test.tsx`, `free-mode-gate.test.tsx`, `config-pills.test.tsx`. Todos os nove são o
teste **principal** do componente irmão (`ToolCard.tsx`, `Message.tsx`, …), não uma facet
secundária como `board-drag`/`terminal-refit` — o `Done when` acima não estava atendido para eles, e
não estava anotado. Renomeados em commit próprio, fora desta task.

#### T20: os utilitários repetidos, com o arquivo já aberto · **entregue em 2026-09-21**

As quatro linhas apontavam para quatro funções, não cinco cópias da mesma: `Conversation.tsx:701`
e `MemoryPanel.tsx:822`/`826` formatam um instante **absoluto** ("21 ago 09:02" / "21/09 09:02"),
`MemoryPanel.tsx:932` e `pr-words.ts:307` formatam uma **duração** ("há 2 dias" / "há 3 s") — duas
famílias, não uma, e as duas foram para `lib/relative-time.ts`. `formatWhen` (Conversation) e
`formatStamp`+o wrapper `formatWhen` (MemoryPanel) colapsaram numa função só, `absoluteStamp(when,
month?)`, porque a única diferença real entre as duas era o formato do mês — o resto dos quatro
campos e o `toLocaleString("pt-BR", …)` eram a mesma linha copiada. `lastUse` (MemoryPanel) e
`agoOf` (pr-words) **não** colapsaram um no outro nem em `relativeAge`: as três respondem "quanto
tempo" em granularidades diferentes por motivo de tela (sessão viva não precisa de segundo,
freshness de PR precisa, "último uso" de um playbook não precisa de hora) — mudam por razões
diferentes, ficam separadas (o mesmo raciocínio que `PrBar.test.tsx`/`ChecksTab.test.tsx` já
provam sem saber, com "há 3 s" e "há 10 min"). `lastUse` virou `daysAgo`, sem o prefixo "último uso"
— que é texto da tela, não da medição —, movido para o call site.

`stripComments` (3×, byte-idêntica em `modal-css.test.ts`, `board-css.test.ts`,
`pr-bar-css.test.ts`) foi para `test/css.ts`, **não** `lib/`: é auditoria de CSS de teste, sem
chamador em produção, e `lib/` é código que o bundle carrega — um util só de teste ali seria morto
no pacote publicado.

**Dois terços da lista original eram achado, não trabalho:** `splitLines` (2×) não é duplicação —
`DiffLines.tsx` quebra texto puro em `"\n"`; `lib/shiki.ts` quebra HTML do Shiki em
`<span class="line">`. Nomes iguais, entradas e saídas incompatíveis; nada para colapsar. `textFile`
(2×, em `useFileBuffer.test.tsx` e `FileViewer.test.tsx`) segue o precedente que já mora ao lado
dela — o comentário de `asRgb` em `FileViewer.test.tsx:50-52` (*"twin da de
`shiki-codemirror.test.ts`, de propósito: quatro linhas atrás de um módulo amarrariam duas suítes
sem relação"*) — e teria custo real: `useFileBuffer.test.tsx:181` afirma o `revision` default
(`"sha256:um"`) sem sobrescrever, `FileViewer.test.tsx` usa outro (`"sha256:abc"`); unificar exigiria
escolher um dos dois ou parametrizar, e as duas suítes ficariam acopladas por um fixture que nenhuma
delas pede ler da outra.

**Done when (revisado):** `grep -rn 'function formatWhen\|function formatStamp\|function lastUse\|function agoOf'`
devolve **zero** — os quatro nomes não sobreviveram à consolidação, e exigir que sobrevivessem seria
proteger o nome, não a duplicação; `grep -rn 'function stripComments' packages/web/src` devolve **um**
arquivo (`test/css.ts`); os testes que cobriam cada cópia (`PrBar.test.tsx`, `MemoryPanel.test.tsx`,
`Conversation.test.tsx`, os três `*-css.test.ts`) passam sem mudança de asserção; `lib/relative-time.ts`
ganha teste próprio (`relative-time.test.ts`, inexistente até aqui — `relativeAge` nunca tinha um);
`splitLines` e `textFile` continuam do jeito que estavam, com o motivo escrito aqui em vez de um
`grep` que finge medir os dois junto com os outros três.

---

## Fase 5 — a navegação · gate `pnpm gate:full` · **é a fase 0 da LUM-63**

#### T21: `lib/navigation.ts` — o store, no molde de `route.ts` · **entregue em 2026-09-21**

`useSyncExternalStore`, sem biblioteca. Dois campos: `selection` e `arrival` (`{ sessionId,
text?, send }`), que funde `ask` (`send: true`), `draft` (`send: false`) e `openSessionId` (sem
texto). `selectScope` vai para cá e leva a regra *"`selection !== null` implica `route === "home"`"*
junto — o store é a **única** resposta a *onde eu estou*.

**A URL não entra.** Serializar `selection` é a LUM-63; este é o lugar onde ela vai escrever.

**Done when:** teste de unidade cobre `select`, `clear`, `arrive`, `consumeArrival`; `App.tsx` lê
`selection` do store e **não tem mais** `useState` de `selection`, `ask`, `draft` nem
`openSessionId`.

**Achado:** o estado é module-level de propósito — é o que faz `select`/`arrive` chamáveis de
qualquer lugar sem contexto —, e é exatamente isso que vazava seleção e chegada de um `it` para o
próximo dentro do mesmo arquivo de teste (`worktree-ui.test.tsx`, `project-ui.test.tsx`: três testes
que renderizam `<App/>` várias vezes viram a seleção de um caso sobreviver para o seguinte).
`route.ts` não precisa de reset porque lê o `window.history` de verdade, que os próprios testes já
resetam; aqui o estado não mora em lugar nenhum fora do módulo, então ganhou `resetNavigationForTests`
(exportado só para isso) chamado pelo `afterEach` global de `test/setup.ts`, ao lado do `cleanup()`.

**Achado (fora do escopo, não corrigido):** `WorktreePanel.tsx` passa `initialPrompt` para o
`ScopePanel` na sua leitura "pronta" mas **não** passa `initialDraft` nesse mesmo retorno — só no
galho `detail.isPending`. É uma divergência pré-existente (não introduzida por esta task, e a T22
a remove por completo ao tirar as três props do arquivo), então ficou registrada aqui em vez de
corrigida — corrigir agora só para apagar duas tasks depois não é o que a T21 pede.

Entre esta task e a T22, `App.tsx` traduziu `arrival` para `openSessionId`/`initialPrompt`/
`initialDraft` na própria função — a T22 removeu essa tradução junto com as três props.

#### T22: `useArrival(sessionId)` — o one-shot num lugar só · **entregue em 2026-09-21**

O hook que a `Conversation` chama e que **consome** a chegada uma vez. `ScopePanel`, `SessionTab`,
`WorktreePanel` e `LocalPanel` **perdem** `openSessionId`, `initialPrompt` e `initialDraft`; o
`useEffect` do prompt inicial e o inicializador do rascunho na `Conversation` passam a ler o hook.

**Done when:** nenhuma interface `*Props` do `web` declara os três nomes; **mutação:** fazer
`useArrival` não consumir faz reprovar o teste *"o rascunho entra uma vez e não sobrescreve o que
foi digitado"* — que é o comportamento que o comentário de `initialDraft` protege hoje;
`00-onboarding.spec.ts` (*"criar e abrir a conversa"*), `acp-conversation.spec.ts` e o caso do
rodapé sem `[scripts]` em `RunDock.test.tsx` verdes **sem mudança de asserção**.

**Achado:** ler é síncrono (durante a renderização, guardado num `ref` por `sessionId`) e consumir é
em efeito — as duas coisas parecem a mesma tarefa e não são. Consumir **durante** a renderização de
um filho (`Conversation`) notificaria, na hora, quem estiver inscrito no mesmo store (o `ScopePanel`,
que decide qual aba trazer para a frente) — e o React recusa um `setState` disparado enquanto outro
componente ainda renderiza. Separar as duas é o que faz a leitura do `ScopePanel` (fechada sobre o
valor do seu **próprio** render, antes deste hook consumir) correta independente da ordem dos
efeitos.

**Achado:** o `00-onboarding.spec.ts` de hoje não tem um teste chamado literalmente *"criar e abrir a
conversa"* — esse é o **texto do botão** que o fluxo clica (`Criar e abrir a conversa`), dentro do
único `test()` do arquivo (`"an empty machine reaches the first turn, entirely through the screen"`).
O `Done when` citava o botão como se fosse o nome do caso; o teste que passa é o mesmo, só o rótulo
estava errado.

**Achado:** `ScopePanel` também usa o store (T21) para saber qual aba trazer à frente — ele não
recebia isso por `useArrival`, que é só da `Conversation`. O `opened` ref virou `sessionId | null`
(não mais `boolean`): o `arrival` pode trocar de sessão mais de uma vez na vida de um painel, e cada
chegada nova merece a própria tentativa de trazer a aba para a frente.

`pnpm gate:full` verde: `vitest run` (92 arquivos, 1228 testes) e `playwright test` (116 testes,
incluindo os três casos citados no `Done when`) sem nenhuma asserção alterada.

#### T23: `useRightPanel` vira contexto, e `filesPanel` sai das props · **entregue em 2026-09-21**

O mesmo desenho de `OpenFilesProvider`, pelo motivo escrito lá. `ScopePanel`, `WorktreePanel` e
`LocalPanel` leem `useRightPanel()` direto. O comentário copiado três vezes sobre *"vem de fora
porque o estado é do app"* fica **uma** vez, no provider.

**Done when:** `filesPanel` não existe em nenhuma `*Props`; `right-panel.test.tsx` verde.

**Achado:** o `App` também lia `rightPanel` — a largura vai para o `AppShell` como prop, no mesmo
nível do conteúdo, então quem monta esse elemento tem que já ter o número em mãos. E o `App` não
pode consumir um contexto que ele mesmo está montando: `<RightPanelProvider>` é filho do retorno do
`App`, então um `useRightPanel()` chamado no corpo do `App` roda *antes* de o provider existir na
árvore e sempre lê o padrão (`null`), estourando. A saída foi mover o ramo do `renderBody` que
depende de `rightPanel`/`dock` (o `AppShell`, a sidebar e os dois diálogos — tudo que hoje é um
`return` só) para um componente de verdade, `WorkspaceShell`, renderizado dentro do
`RightPanelProvider`. Ele também passou a ler `selection`/`route` direto (`useNavigation`/`useRoute`
são stores de módulo, não `useState` — chamá-los de novo não duplica estado, ao contrário de
`useActiveWorkspace`/`useTreeExpansion`, que continuam vindo por prop). Isso adianta parte do que a
T24 pede (`renderPanel`/`renderRightPanel` virarem componente), mas só a metade que a T23 não podia
evitar: `WorkspaceShell` ainda mora dentro de `App.tsx`, ainda tem `renderPanel`/`renderRightPanel`
como funções aninhadas (não `MainColumn`/`RightColumn`), e o arquivo está em 486 linhas — a T24 é
quem termina a divisão e faz o arquivo encolher.

#### T24: o `App` encolhe para o que é dele · **entregue em 2026-09-21**

Ficam `setupOpen` (o único estado não derivável — o comentário explica), `addProjectOpen` e
`worktreeFor`. `renderPanel` e `renderRightPanel` viram componentes (`MainColumn`,
`RightColumn`) que leem o store.

**Done when:** `App.tsx` tem no máximo **3** `useState` e menos de **250** linhas; `App.test.tsx`
verde; `gate:full` verde.

**Achado:** `renderPanel`/`renderRightPanel` viraram `MainColumn`/`RightColumn` como a task pedia,
mas o que sobrava do `WorkspaceShell` que a T23 abriu (`AppShell`, a sidebar, os dois diálogos) não
tinha para onde ir dentro de `App.tsx` sem furar o teto de 250 linhas — foi para
`WorkspaceShell.tsx`, arquivo próprio, com `MainColumn.tsx` e `RightColumn.tsx` ao lado dele em
`src/`, e não em `features/`: nenhum dos três pertence a um domínio só (leem `checkout`, `workspace`
e `setup` ao mesmo tempo), e é o mesmo lugar que `App.tsx` já ocupa. `App.tsx` ficou em **171**
linhas com **3** `useState`; `MainColumn.tsx` tem 122, `RightColumn.tsx` 36, `WorkspaceShell.tsx`
194 — nenhum decidido por um teto (a regra 8 do sensor, com o mapa dos oito, é da T25, que ainda não
rodou).

`RightColumn` resolve sozinho o problema que motivou o `WorkspaceShell` na T23: `AppShell.right`
tem que ser `undefined` quando a coluna não deve existir (é o que decide a classe CSS de três
colunas e a variável `--right-width`), então quem decide **se** ela existe continua sendo
`WorkspaceShell` (`selection !== null && rightPanel.open ? <RightColumn /> : undefined`); o que
`RightColumn` decide sozinho, lendo `useNavigation()`/`useRightPanel()`/`useRunDock()` direto, é
**o que** desenhar dentro — sem repassar `scope`, `onClose`, `onResize` nem `dock` por prop.

Achado de fora do escopo, consertado porque bloqueava o `gate:full`: o `git mv` de `useRightPanel.ts`
para `.tsx` na T23 deixou um link morto em
[`docs/features/008-onboarding/open-questions.md:291`](../008-onboarding/open-questions.md) — a
extensão errada. `check-docs.test.ts` (`025-docs-contract`) é o que prova; corrigido no mesmo
commit.

---

## Fase 6 — os três grandes · gate `pnpm gate:full`

#### T25: teto de 400 no sensor, com o mapa dos oito · **entregue em 2026-09-21**

Regra 8: arquivo `.ts`/`.tsx` em `features/` acima de **400** linhas reprova, salvo mapa com o
tamanho atual, que só encolhe: `SettingsPanel` 679, `FileTree` 640, `useFileBuffer` 605, `RunDock`
601, `CreateWorktreeDialog` 547, `Board` 461, `FileViewer` 461, `WorkspacePanel` 450 — mais os
três desta fase até as T26–T29 os tirarem. Sem teto em `lib/` ([Q8](open-questions.md)).

**Done when:** passa no `HEAD`; +20 linhas em `RunDock` reprova; −20 passa e o mapa aceita o número
menor; o mapa **não aceita** número maior.

**Achado:** os oito números do texto são de quando a Q8 foi escrita; a fase 5 (T21–T24) mexeu no
`web` inteiro entre aquele dia e este, e medir de novo no disco mudou três coisas:

| Arquivo | Q8 dizia | Disco (T25) |
|---|---|---|
| `SettingsPanel.tsx` | 679 | 632 |
| `FileTree.tsx` | 640 | 640 |
| `useFileBuffer.ts` | 605 | 605 |
| `RunDock.tsx` | 601 | 587 |
| `CreateWorktreeDialog.tsx` | 547 | 531 |
| `Board.tsx` | 461 | **388 — saiu do mapa** |
| `FileViewer.tsx` | 461 | 461 |
| `WorkspacePanel.tsx` | 450 | 423 |

`Board.tsx` já tinha encolhido para 388 na fase 4 (T17), antes de a Q8 medi-lo em 461 — o número da
pergunta já nasceu velho. Abaixo do teto, ele não entra no mapa: é o próprio mecanismo da regra 8
funcionando (uma exceção que deixou de precisar dela é removida, não deixada para trás).

**Achado:** o disco tinha **dois** arquivos que nem o texto da T25 nem a Q8 contavam:

- `conversation-model.ts` (715 linhas) — a Q8 o cita como o exemplo de "fold puro que piora se
  quebrado por tamanho" para justificar **não** ter teto em `lib/`, mas o arquivo mora em
  `features/conversation/`, não em `lib/`. Pela letra da decisão ("400 para `.ts`/`.tsx` em
  `features/`") ele está sujeito ao teto como qualquer outro. Resolvido pelo lado que muda menos:
  entra no mapa como os demais — mover o arquivo para `lib/` (o que faria a isenção da Q8 valer de
  verdade) ou reescrever a Q8 é quem resolve a divergência, e nenhuma das duas é desta task;
- `LocalPanel.tsx` (444 linhas) — não estava em nenhuma lista. A mesma classe de achado que a T2 já
  registrou para `lib/trpc.js`: o texto contou os arquivos que lembrava, o disco tinha mais um.

**Achado:** "os três desta fase" do texto são `Conversation.tsx` (830), `MemoryPanel.tsx` (1006) e
`AgentLogin.tsx` (861) — identificados por correspondência com as tasks que os tiram (T26/T27, T28,
T29). O mapa desta task os inclui nesse tamanho; a T26 já reduz o de `Conversation.tsx` para 646 no
próprio commit dela, provando o "só encolhe" entre tasks e não só dentro de uma.

**Prova por mutação, como o `Done when` pede:** `+20` linhas em `RunDock.tsx` (587 → 607) reprova
com *"o mapa não aceita um número maior que o já registrado"*; desfeito. `-20` linhas (587 → 567)
reprova até o mapa ser atualizado para 567, e passa depois — a mesma mutação prova as duas metades
do mecanismo. Nenhuma das duas mutações ficou no código; o mapa comitado tem os números de hoje.

#### T26: `useConversationSession` — o transporte sai do componente · **entregue em 2026-09-21**

O `useReducer` com `conversation-model`, o ciclo do socket, o caminho `load` do transcript morto e
a sincronização com `useAwaitingPermission` — o par de efeitos com `setWaitingRef`, cujo comentário
explica a oscilação, vai **inteiro**. Devolve `{ state, attached, readOnly, send, cancel, answer,
setMode, setConfig }`. `connect` e `load` injetáveis passam a ser opções do hook.

O `Conversation.test.tsx` muda só o import do que injeta. E ganha o teste que o componente não
conseguia ter: **desmontar fecha o socket e limpa o `awaiting`**, com `renderHook`, sem DOM.

**Done when:** o hook tem teste próprio; `Conversation.tsx` não tem `useReducer` nem `socketRef`;
os seis `useEffect` de hoje estão em no máximo dois arquivos, cada um com o comentário que tinha.

**Achado:** o arquivo de teste do componente **não** se chama `Conversation.test.tsx` — o disco tem
`conversation.test.tsx` (c minúsculo), uma inconsistência de nome pré-existente com a convenção do
próprio `CLAUDE.md` (`PtyManager.ts` → `PtyManager.test.ts`, PascalCase para o alvo cujo export
principal é componente). Fora do escopo desta task: renomear agora tocaria um arquivo que a T26 não
precisa tocar, só para uma convenção que nenhuma das 24 tasks anteriores desta fase corrigiu.

**Achado:** o texto previa "`Conversation.test.tsx` muda só o import do que injeta" — mas
`connect`/`load` **já** eram props injetáveis do componente antes desta task (a T26 herdou isso de
quando o `acp-socket.ts` foi introduzido, bem antes da `032`). A extração preservou a interface
externa do componente byte a byte (mesmos nomes, mesmos defaults resolvidos agora dentro do hook), e
o resultado é que `conversation.test.tsx` **não precisou de nenhuma edição** — os 68 testes passam
sem tocar uma linha dele. É a prova mais forte de que a extração não mudou comportamento.

**Achado:** "o caminho `load` do transcript morto" — confirmado no disco: `live={false}` ainda é o
caminho de uma conversa encerrada (D13), e `loadStored` (via `trpc.session.transcript.query`) segue
existindo, agora dentro do hook. Nada "morto" foi encontrado para remover; a frase da task descreve
o próprio caminho de leitura, não um código morto a apagar.

O novo teste do hook (`useConversationSession.test.tsx`) precisou de uma sonda de dois componentes
(`Watcher` + `SessionProbe`) sob o mesmo `AwaitingPermissionProvider`, no molde de
`hooks/awaiting-permission.test.tsx`: um `renderHook` isolado desmontaria o provider **junto** com o
hook, e não haveria testemunha viva para ler `isWaiting` depois — a prova de "limpa ao desmontar"
exige que algo continue montado por cima. É `renderHook`/`render` sem tela (nenhuma asserção lê
texto nem clica em nada), o espírito do `Done when`, ainda que não literalmente um `renderHook` só.

Achado de fora do escopo, consertado porque a T26 mudou o que a regra 3 do sensor mede:
`Conversation.tsx` deixou de importar `lib/trpc.js` (foi para `useConversationSession.ts`, um `.ts`,
fora do alcance da regra) — `COMPONENT_KNOWS_TRANSPORT` (T2/T16) perdeu essa entrada, e o mapa da
regra 8 (T25) teve `Conversation.tsx` atualizado de 830 para 646 linhas, provando o "só encolhe"
**entre** commits.

#### T27: `Composer` e `Transcript` · **entregue em 2026-09-21**

`Composer`: rascunho, envio, `LumemModePill`, menu de modo, `FreeModeGate`, `SlashMenu`,
`ConfigPills`, `UsageFooter`. Recebe `session`, `readOnly`, `onSend`, `onCancel`. `Transcript`: a
lista de `BlockView`, `ResumeMark`, `EmptyConversation`, `useAutoScroll`. `Conversation` fica a
composição.

**Done when:** `Conversation.tsx` abaixo de **120** linhas; `Composer` e `Transcript` abaixo de 400
cada e **fora do mapa**; `composer-menus.spec.ts` e `acp-conversation.spec.ts` verdes sem mudança.

**Achado:** o texto propunha `session`, `readOnly`, `onSend`, `onCancel` como as props de
`Composer` — mas a T26 já devolve `{ state, attached, readOnly, send, cancel, answer, setMode,
setConfig }`, e o próprio composer precisa também de `conversation` (streaming, `pendingPermission`,
`commands`, `mode`, `configOptions`, `modeOwner`, `lumemMode`, `lumemModeDefault`, `usage`),
`session.cwd` (para o `FreeModeGate`), `attached`, `active` (o atalho `esc`) e `setMode`/`setConfig`.
Quatro nomes bastariam para a frase do cabeçalho, não para o componente: `Composer` recebe
`sessionId`, `conversation`, `session`, `attached`, `readOnly`, `active`, `send`, `cancel`,
`setMode`, `setConfig` — os nomes reais do hook, sem inventar `onSend`/`onCancel` por cima deles.
`Transcript` recebe `conversation`, `session`, `failure`, `readOnly`, `answer`.

**Achado:** o `esc` que interrompe o turno usa `menuOpen` (derivado do rascunho, que é estado do
`Composer`) — por isso o ouvinte de teclado migrou inteiro para dentro de `Composer`, e não ficou em
`Conversation`; o botão `■ interromper` do cabeçalho continua em `Conversation`, chamando `cancel`
direto, sem passar por `Composer`.

**Achado:** `useArrival(sessionId)` passou a ser chamado de dentro de `Composer` (é lá que o
rascunho inicial e o envio automático da chegada moram) e não mais em `Conversation`. Os dois
consumidores da mesma chegada (`ScopePanel`, via seu próprio `useArrival`, e `Composer`) leem o
mesmo valor não consumido durante o próprio render, antes de qualquer efeito confirmar o consumo —
o comentário do hook já cobre esse caso, e não foi preciso mudar nada nele.

`Conversation.tsx` ficou com **119** linhas; `Composer.tsx` com 313; `Transcript.tsx` com 270 — as
duas dentro do teto e fora do `LARGE_FILE_CEILING`. O mapa da T25 perdeu a entrada
`features/conversation/Conversation.tsx` (646 → 119): o mecanismo da regra 8 é o mesmo do
`Board.tsx` — abaixo do teto, o arquivo não precisa mais da exceção.

**Achado consertado em commit próprio (`aee2758`):** `conversation-css.test.ts` lê os componentes
por caminho, com uma lista escrita à mão (`Conversation.tsx`, `Message.tsx`, `ToolCard.tsx`, …) — o
mesmo desenho do `memory-css.test.ts` que a T28 vai reencontrar. Sem `Composer.tsx` e
`Transcript.tsx` na lista, o teste continuava **verde** depois do split, mas cego: `.composer`,
`.composer__box`, `.composer__in`, `.composer__bar`, `.config`, `.conv__scroll`, `.fail*`,
`.daysep`, `.unknown`, `.meta` e `.empty*` saíram de `Conversation.tsx` e pararam de ser auditados —
o teste só reprova quando uma classe pedida falta na folha, e uma classe que **parou de ser pedida**
não aciona nada. Corrigido adicionando os dois arquivos à lista, sem tocar em nenhuma asserção.

#### T28: `MemoryPanel` por aba · **entregue em 2026-09-21**

`MemoryEntries.tsx`, `MemoryProposals.tsx` (com `PendingProposal`, `EditAndApprove`,
`ConfirmReject`, `Conflict`, `Evidence`), `MemoryTimeline.tsx`, `MemoryPlaybooks.tsx`,
`MemoryNumbers.tsx`. `MemoryPanel` fica o `TabStrip` e o roteamento de aba. `MemoryProposals` já
é exportado e usado por `ProposalQueue` — a fronteira só passa a existir no disco.

**Done when:** seis arquivos, nenhum acima de 400; `MemoryPanel.test.tsx` e `ProposalQueue.test.tsx`
verdes sem mudança de asserção.

**Achado:** confirmado no disco — `MemoryPanel.tsx` tinha **1006** linhas (a Q8/T25 já tinha medido
exatamente isso), `PendingProposal`/`EditAndApprove`/`ConfirmReject`/`Conflict`/`Evidence` existiam
com esses nomes exatos dentro dele, e `ProposalQueue.tsx` já importava `MemoryProposals` — tudo como
o texto previa.

**Achado:** o texto pede `MemoryPanel` com o `TabStrip` do design system. O disco discorda: `Tab`/
`TabStrip` (`ui/Tab.tsx`) tem semântica de aba de **sessão** — glifo, ordinal, ponto de estado, `✕`
de fechar — e é usado assim em `ScopePanel`. As outras duas telas com o mesmo problema de
`MemoryPanel` (quatro abas de texto simples, sem fechar, sem estado) — `RightPanel.tsx` e
`RunDock.tsx` — **não** usam `TabStrip`: as duas mantêm seu próprio `role="tablist"` com classes
próprias, pelo mesmo motivo que este arquivo tinha o dele (`.mem-tabs`/`.mem-tab`, ajustadas para
caber quatro abas em 360px — comentário que o próprio arquivo já carregava). Trocar por `TabStrip`
aqui seria design novo, não mover código: markup diferente, CSS novo para substituir `.mem-tabs`/
`.mem-tab` sem deixá-las órfãs, e risco real sobre o "sem mudança de asserção" que o `Done when`
pede. Mantido o `role="tablist"` que já existia, sem tocar; a divergência fica registrada aqui em
vez de arquitetura decidida em silêncio dentro de uma task de split.

**Achado:** `ACTOR`, `CONFIDENCE` e `SCOPE_LABEL` são o mesmo vocabulário nos dois lados de onde
foram usados no arquivo original — `Entries` e `Conflict` (dentro do que virou `MemoryProposals`)
leem a mesma confiança e o mesmo autor da mesma entrada de memória; `Entries`, `SearchResults` e
`Playbooks` leem o mesmo rótulo de escopo. Não é duplicação coincidente (T20) — é a mesma pergunta
lida de dois lugares —, então as três constantes moram em `MemoryEntries.tsx`, exportadas, e
`MemoryProposals.tsx`/`MemoryPlaybooks.tsx` importam de lá. Isso mantém "seis arquivos" em vez de
um sétimo `memory-words.ts` que o `Done when` não previa.

**Achado:** `MemoryPanel.tsx` chamava `useProposals("pending")` sem usar o resultado — nenhuma
variável lida, nenhum componente renderizado com ele. Não é código morto: é *prefetch* silencioso,
aquecendo o cache que `ProposalQueue` lê depois. Preservado exatamente onde estava (no roteador, não
numa aba), porque movê-lo para dentro de `MemoryEntries` tornaria a busca **condicional** à aba
`Memória` estar ativa — mudança de comportamento que nenhum teste cobre e que o `Done when` não
pede.

**Achado consertado no mesmo commit:** `memory-css.test.ts` lê `MemoryPanel.tsx` por caminho, com o
mesmo desenho que `conversation-css.test.ts` (T27) já tinha ensinado a armadilha: sem os cinco
arquivos novos na lista, o audit ficaria cego para toda classe que saiu com eles — `.mem-find`,
`.mem-group__t`, `.mem-conflict`, `.mem-split`, `.mem-form`, `.mem-tl`, `.pb__*`, `.mem-stats`, entre
outras. Corrigido lendo os seis arquivos, sem mudar nenhuma asserção.

`MemoryPanel.tsx` ficou com **90** linhas — abaixo do teto, saiu do `LARGE_FILE_CEILING` (1006 → 90,
mesmo mecanismo do `Board.tsx`/`Conversation.tsx`). `MemoryEntries.tsx` (265), `MemoryProposals.tsx`
(385, depois de compactar seis `onClick`/`onCancel` de uma linha só que não mudam comportamento),
`MemoryTimeline.tsx` (59), `MemoryPlaybooks.tsx` (106) e `MemoryNumbers.tsx` (106) nasceram sem
precisar de exceção.

#### T29: `AgentLogin` em quatro, e `agent-words.ts` · **entregue em 2026-09-21**

`AgentRow.tsx`, `ConnectPanel.tsx`, `AgentPanel.tsx`, `LoginOptions.tsx`. `describeSpec`,
`describeMethod`, `needsKey`, `entryOf` viram `agent-words.ts` — o desenho de `pr-words.ts`.
`useAgentProbe` já saiu na T11.

**Done when:** nenhum acima de 400; `AgentLogin.test.tsx` e `agent-login.spec.ts` verdes; o mapa da
T25 tem exatamente os oito originais.

**Achado:** confirmado no disco — `AgentLogin.tsx` tinha **861** linhas, exatamente o que a Q8/T25
já tinham medido. `describeSpec`, `describeMethod`, `needsKey` existiam com esses nomes exatos;
`useAgentProbe` já morava em `queries.ts` desde a T11, como o texto previa.

**Achado:** o texto pede `entryOf` dentro de `agent-words.ts`, junto dos outros três. O disco
discorda: `entryOf` **já** morava em `queries.ts`, não em `AgentLogin.tsx` — e não é uma tradução
para tela, é uma busca (`report.adapters.find`) que a própria `useConnectAgent` (dentro de
`queries.ts`) chama na `mutationFn`. `describeSpec`/`describeMethod`/`needsKey` são o oposto: puras,
sem awareness de query, chamadas só por componente — o mesmo desenho de `pr-words.ts`, que nenhum
hook de `queries`/`pr` importa. Mover `entryOf` para `agent-words.ts` faria a camada de dados
(`useConnectAgent`) importar de um módulo de apresentação — inversão de dependência que o `CLAUDE.md`
recusa (DIP). Mantido em `queries.ts`, sem tocar; `agent-words.ts` leva só os três que são de fato
tradução.

**Achado:** `AgentConfigView` e `AuthMethodView` não tinham lugar óbvio no texto da task. Pelo mesmo
critério que a T28 usou para `ACTOR`/`CONFIDENCE`/`SCOPE_LABEL` (moram no arquivo onde nascem, os
outros importam de lá, em vez de um sétimo arquivo): `AgentConfigView` — cujo próprio comentário já
dizia "o que uma **linha** do rodapé precisa saber" — foi para `AgentRow.tsx`, exportada;
`AgentPanel.tsx` e `LoginOptions.tsx` importam o tipo de lá. `AuthMethodView` foi para
`agent-words.ts`, ao lado de `describeMethod`/`needsKey`, que são as únicas funções que a
enxergam.

`AgentLogin.tsx` ficou com **140** linhas — abaixo do teto, saiu do `LARGE_FILE_CEILING` (861 → 140,
mesmo mecanismo do `Board.tsx`/`Conversation.tsx`/`MemoryPanel.tsx`). `AgentRow.tsx` (56),
`ConnectPanel.tsx` (162), `AgentPanel.tsx` (163), `LoginOptions.tsx` (311) e `agent-words.ts` (58)
nasceram sem precisar de exceção.

**Achado consertado no mesmo commit:** `agent-login-css.test.ts` lê `AgentLogin.tsx` e
`Credentials.tsx` por caminho — a mesma armadilha que `conversation-css.test.ts` (T27) e
`memory-css.test.ts` (T28) já tinham ensinado. Sem os quatro arquivos novos na lista, o audit
ficaria cego para `setup`, `opt`, `prep`, `dcode`, `key-in`, `acct`, `fail` e o resto do que saiu com
eles. Corrigido lendo os seis arquivos, sem mudar nenhuma asserção.

**Achado:** "o mapa da T25 tem exatamente os oito originais" não fecha ao pé da letra: `Board.tsx`
já tinha saído do mapa **antes** da T25 medi-lo (a fase 4/T17 o encolheu primeiro), então só sete dos
oito da Q8 ainda precisavam de exceção quando esta fase começou. Depois de `AgentLogin.tsx` saltar
do mapa, sobram esses sete mais os dois extras que a T25 já tinha registrado como achado
(`conversation-model.ts`, `LocalPanel.tsx`) — nove entradas no total, não oito. Nenhum item **novo**
ficou no mapa por causa desta task, que é o que o `Done when` protege de verdade; os dois extras
continuam sendo problema de outra decisão (mover `conversation-model.ts` para `lib/`, ou reescrever
a Q8), não desta.

Com a T29, a **fase 6 — os três grandes (T25–T29) — está inteira entregue**: o sensor de 400 linhas
tem o mapa, e `Conversation.tsx`, `MemoryPanel.tsx` e `AgentLogin.tsx` saltaram dele, um por task.

---

## Fase 7 — o CSS · gate `pnpm gate:quick` e `pnpm build-storybook` · **caminho A**

#### T30: variante de primitiva volta para a primitiva; bloco duplicado morre · **entregue em 2026-09-21**

`.btn--brand` e `.btn--warn` saem de `conversation.css` para `ui.css`, ao lado das outras
variantes de `.btn`. `.empty` e `.meta` deixam de existir em `conversation.css` — o que
`conversation` precisava a mais vira modificador (`.empty--conversation`), nunca redefinição.

**Done when:** nenhum bloco de primeiro nível definido em dois arquivos (a T32 o prova por teste);
os 119 pares de `contrast.ts` intactos.

**Achado:** `.btn--brand`/`.btn--warn` estão mortos — nenhum `.tsx` do repositório os pede como
`className` (só um comentário em `PermissionRequest.tsx` os cita, explicando por que o botão de
confirmação usa `primary` em vez deles). Movidos mesmo assim, como o texto pede: o lugar de uma
variante de `.btn` é ao lado das outras, usada ou não.

**Achado:** `.empty` (ui.css) é um quadro tracejado, coluna, com `.empty__title` só; o de
`conversation.css` era grid centralizado com `.empty__glyph`/`.empty__sub` a mais. Virou
`.empty.empty--conversation` — seletor composto, não dois nomes soltos — porque no bundle real
(`pnpm build`, conferido) `ui.css` sai **depois** de `conversation.css`: duas regras `.empty {}` de
mesma especificidade dariam a palavra final para `ui.css`, não para quem pediu a mudança por
último. `.empty__glyph`/`.empty__title`/`.empty__sub` passaram a viver sob `.empty--conversation`
(escopados), para o `.empty__title` diferente de `ui.css` não colidir com o de `conversation.css`.

**Achado:** `.meta` (ui.css) é uma grade `dl`/`dt`/`dd` de metadados (`MetaGrid.tsx`); o de
`conversation.css` é um `div` de texto corrido, mesma forma que `.unknown`. Não é a mesma
primitiva com um ajuste visual — é uma colisão de nome vinda de dois protótipos diferentes.
Forçar `.meta` como base (`grid-template-columns: max-content 1fr`) sobre um único nó de texto
quebraria o layout. Renomeado para `.meta--conversation`, usado sozinho (sem a base `.meta`) — o
mesmo padrão que `.ctx-task--none` já usa em `tasks.css`. Divergência do texto da task, que sugeria
o mesmo tratamento de `.empty` para os dois; registrado aqui em vez de forçar em silêncio.

**Achado:** `defined()` em `conversation-css.test.ts` só enxergava a primeira classe de um seletor
composto (`.empty.empty--conversation` — o segundo `.` não é precedido de espaço/vírgula/`>`).
Sem o ajuste, `empty--conversation` cairia como "pedida e não definida". Corrigido para decompor a
cadeia inteira, sem enfraquecer a checagem de número decimal que a função já fazia (`16.5px`
continua não virando classe).

**Achado (fora do escopo desta task, não corrigido):** `features/checkout/right-panel.css` também
define `.empty {}` — um **terceiro** bloco, com `flex`/`justify-content:center`/padding `24 16`,
diferente dos outros dois. A task só cobria `conversation.css`; fica registrado para a T32 (sensor)
ou uma task futura resolver.

#### T31: os dez blocos por extenso · **entregue em 2026-09-21**

`.tc` → `.tool-card`, `.u` → `.usage`, `.mopt` → `.mode-option`, `.mmenu` → `.mode-menu`,
`.stab` → `.session-tab`, `.tdet` → `.task-detail`, `.tprov` → `.task-provenance`, `.tsess` →
`.task-sessions`, `.tstat` → `.task-status`, `.pq-item` → `.proposal-item`. CSS, `.tsx`, os
`*-css.test.ts` e o `contrast.ts` mudam juntos, num commit por bloco — o `git blame` de cada
renome fica legível.

**Done when:** `grep -rn 'className="\(tc\|u\|mopt\|mmenu\|stab\|tdet\|tprov\|tsess\|tstat\|pq-item\)[ "]'`
vazio; nenhum bloco de uma ou duas letras em `**/*.css`; `gate:quick` verde.

**Achado — nove renomes feitos, um pulado:** medido no disco antes de cada um, como o texto pede.
`.tc`, `.u`, `.mopt`, `.mmenu`, `.tdet`, `.tprov`, `.tsess`, `.tstat` e `.pq-item` existiam e
tinham uso real em `.tsx`; renomeados, um commit por bloco. `.stab` **não existia mais como bloco**
— só sobrava `.stab__dot--asking`, órfã (nenhum `.tsx` do repositório pede `stab` ou `stab__dot`;
provavelmente um resíduo de antes da faixa de abas atual, que hoje usa `.tabs-bar` de `ui/ui.css`).
Pulado, como o texto autoriza ("se não existir mais, pule esse renome e registre o porquê") — a
classe órfã fica no disco, sem dono, e é exatamente o tipo de achado que a T32 (sensor) vai
nomear sozinha depois. **Não nomeou**: o `css-blocks.test.ts` da T32 cobre classe usada sem
definição, não definição sem uso — a direção contrária. `.stab__dot--asking` foi apagada em
commit próprio (achado 5 da revisão independente, 2026-09-21, pós-fecho); a segunda direção do
sensor fica de fora, como a mesma revisão registrou.

**Achado — `.u` não podia virar `.usage`:** a task propunha o mesmo nome do bloco pai
(`.usage`, o rodapé de uso e custo inteiro), mas isso teria recriado a duplicação que a T30 acabou
de fechar em `.empty`/`.meta` — dois blocos de primeiro nível chamados `.usage` no mesmo arquivo.
`.u` é uma ENTRADA do rodapé (janela, turno, assinatura), não o rodapé; renomeado para
`.usage-stat`, que não colide.

**Achado — reuso cruzado de feature, pego por grep e não pela lista de arquivos da task:**
`.tc__twist` também vivia em `PlanCard.tsx` (botão de recolher, mesmo desenho do cartão de
ferramenta); `.tprov__g` e `.tstat__dot` também viviam em `ProposalQueue.tsx` (memory) e
`WorktreePanel.tsx` (checkout) respectivamente, emprestando o glifo/ponto de `tasks.css`. Nenhum
dos três está na lista `Where` desta feature por nome, mas a mudança de CSS os quebraria em
silêncio — corrigidos junto, no mesmo commit do bloco correspondente.

**Achado — e2e também pedia `.tc`:** `e2e/acp-conversation.spec.ts` usa `.tc`, `.tc__name`,
`.tc__st` e o regex `/tc--ok/` como locator do Playwright. Fora do que `gate:quick` roda (a fase
declara caminho A, sem `gate:full`), mas quebrado pela minha própria mudança se eu não tocasse —
corrigido no mesmo commit do bloco `.tc`.

**Achado — `--tc` fica como está:** a custom property `--tc` (o hexadecimal do cartão de
ferramenta, `var(--tc)`) não é bloco de CSS, é variável — fora do escopo do renome de classe.
`conversation-css.test.ts` já a trata como exceção nomeada (junto de `--w`), e continua tratando.

**Achado — duas menções históricas não tocadas:** os comentários em `setup-css.test.ts` e
`conversation-css.test.ts` que narram o incidente onde `.tc--cancelled` sumiu num porte anterior
continuam citando o nome antigo de propósito — descrevem um fato que aconteceu quando a classe se
chamava assim; reescrever a história para usar o nome novo seria revisionismo, não correção.

#### T32: o sensor de CSS — duplicado e órfã · **entregue em 2026-09-21**

Um teste que lê todo `.css` do `web`, extrai os blocos de primeiro nível e reprova **bloco em dois
arquivos** e **classe usada em `.tsx` sem definição** — as 13 órfãs que a `028` Parte 3 pagou,
como teste. Classes montadas dinamicamente (`` `btn--${variant}` ``) entram numa lista de
prefixos conhecidos.

**Done when:** passa no `HEAD` depois da T30 e T31; adicionar `.card {}` a `tasks.css` reprova;
usar `className="tool-cardd"` reprova nomeando arquivo e linha.

**Achado — sensor central, não um décimo segundo `*-css.test.ts`:** os onze arquivos de feature
enumeram por extenso cada variante interpolada (`INTERPOLATED`) e cada classe emprestada
(`BORROWED`) — precisão que só compensa dentro do raio de uma tela. `packages/web/src/css-blocks.test.ts`
é **complementar**, não substituto: cobre o `web` inteiro com uma regra mais barata — o texto
estático ao redor de um `${…}` precisa aparecer em algum nome de classe real, sem exigir o nome
inteiro por extenso. Isso dispensa a "lista de prefixos conhecidos" que o texto da task cogitava: o
sensor lê o próprio template e deriva o fragmento a conferir, em vez de alguém manter a lista
atualizada a cada `className` dinâmico novo.

**Achado — "bloco" é o seletor inteiro, não cada classe do seletor:** `.empty.empty--conversation`
(T30) não é a mesma dona de `.empty` sozinho — são dois blocos, cada um com sua folha. O sensor
compara pela cadeia de classes ordenada (`.a.b` e `.b.a` contam como o mesmo bloco; `.a` e `.a.b`
não), e é essa distinção que deixa o padrão da T30 passar sem exceção nenhuma.

**Achado — três duplicações reais que T30/T31 não cobriam, todas resolvidas no mesmo commit:**
- `right-panel.css` tinha um **terceiro** `.empty {}` — exatamente o que a T30 tinha registrado e
  deixado para esta task. Virou `.empty.empty--right-panel` (mesmo padrão da T30), com
  `ChangesTab.tsx`/`PatchViewer.tsx` ganhando a segunda classe no `className`. `.empty__title`
  colidia com `ui.css` pela mesma razão e ganhou o mesmo escopo (`.empty--right-panel .empty__title`).
- `.act` (a ação sempre visível do cabeçalho) estava copiada **byte a byte** em `sidebar.css` e
  `agent-login.css`, com um comentário em `agent-login.css` já admitindo a cópia ("mesmo alvo e
  mesma forma do `.act` da árvore"). Subiu para `ui/ui.css`, ao lado do `.row__act` que é a mesma
  forma com hover por linha.
- `.rp { container: rightpanel / inline-size; }` existia em duplicidade em `pr-bar.css`, só para
  registrar uma propriedade de container query sobre um bloco que `right-panel.css` já possuía. A
  propriedade migrou para o `.rp` de `right-panel.css` — a dona do bloco —, e `pr-bar.css` ficou só
  com as regras `@container` que a consomem.

**Achado — três telas sem uma linha de CSS sequer**, a classe de defeito que motivou a task ("as 13
órfãs que a `028` Parte 3 pagou"), nenhuma coberta por nenhum `*-css.test.ts` de feature existente:
- `ChangesTab.tsx`/`FileRow` (a aba "mudanças" do checkout): `.seg-wrap`, `.sum`, `.drow`/
  `.drow--open`/`.drow__was`/`.drow__gap`, `.dpath`/`.dpath__dir`/`.dpath__name`, `.dstat` — zero
  regras, em qualquer folha, desde que o componente foi escrito (confirmado por `git log -S`).
  Escritas em `right-panel.css`, ao lado de `.frow` (a lista de arquivos), cujo padrão a lista de
  mudanças segue linha por linha — as duas listam a mesma coisa, um caminho, com um selo diferente.
- `TaskDetail.tsx` / diálogo "Trabalhar nesta tarefa": `.work`, `.work__list`, `.wopt`,
  `.wopt__name` — mesmo zero. Escritas em `tasks.css`, com o par preenchido/borda seguindo
  `.opt`/`.opt--primary` de `agent-login.css` (mesma pergunta — qual das opções está escolhida).
- `AddProjectDialog.tsx`: `className="add-project"` no `<form>` não tinha regra nem consumidor de
  teste, e não precisava de uma — `.modal__body > form` já dá ao formulário o `display: grid` e o
  `gap` que ele usa. Em vez de inventar uma regra para uma classe inerte, a classe saiu do JSX; o
  `id={FORM_ID}` (que liga o botão do rodapé ao formulário) ficou.

**Achado — armadilha nova, registrada aqui e não em `testing.md` por ser específica deste sensor:**
a primeira versão usava ` ` como marcador de `${…}` removido dentro de um template. Funciona
em JavaScript, mas um byte de controle embutido numa string faz o `git` classificar o arquivo
inteiro como binário — `git diff` virou `Bin 0 -> 12498 bytes`, e um sensor que ninguém consegue
revisar em `git diff`/`git blame` não é um sensor, é uma caixa preta. Trocado por um caractere da
área de uso privado do Unicode (``), que o `git` trata como texto.

**Achado (fora do escopo, não corrigido):** `tasks.css` tem um comentário órfão — "O interruptor da
Q27, na linha dos tetos (`028` Parte 4, T40)" — sem regra nenhuma depois dele até o fim do arquivo
original. O sensor de CSS não audita comentário, só seletor; fica registrado para quem passar por
`tasks.css` de novo.

Com a T32, a **fase 7 — o CSS (T30–T32) — está inteira entregue**: a variante de primitiva mora com
a primitiva, o bloco duplicado morreu manualmente uma vez (T30) e por extenso nove vezes (T31), e o
sensor que fecha a fase prova que não sobrou nenhum outro — nem os três que T30/T31 não tinham como
ver.

---

## Fase 8 — testes e galeria · gate `pnpm build-storybook` e `pnpm gate:quick`

#### T33: cinco stories de tela — os estados caros · **entregue em 2026-09-21**

Uma por estado que o [ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md)
promete e a galeria não tem: workspace sem acervo (`MemoryPanel` vazio), orçamento bloqueado
(`Board` com cartão bloqueado), vinte modelos no seletor (`ConfigPills`), conversa com permissão
pendente (`Conversation` com o `connect` falso da T26 — sem daemon), e `RightPanel` (a que saiu na
T3). Em `features/<x>/<Nome>.stories.tsx`, com os hooks mockados pelo mesmo `vi.mock` dos testes —
a story e o teste compartilham o fake.

**Done when:** `build-storybook` renderiza as cinco; cada uma monta sem chamada de rede (o proxy da
T10 reprova qualquer `query` não mockada).

**Achado:** o plano não sobrevive ao mecanismo de build. `storybook build` nunca passa pelo Vitest —
`vi.mock` só existe dentro dele —, então o padrão que os testes de componente usam para calar o
transporte (`vi.mock("../../lib/trpc.js", ...)`, com `trpc-mock.ts` ou o `Proxy` de `trpc-proxy.ts`)
não é alcançável de um `.stories.tsx`. O que dá a mesma garantia sem mock nenhum: três dos cinco
componentes não tocam `trpc` de jeito nenhum — `ConfigPills` e `RightPanel` são presentacionais
(recebem tudo por prop), e `Conversation` já tem o transporte injetável (`connect`, o mesmo tipo de
duplo que `conversation.test.tsx` usa desde a T26). Os outros dois (`MemoryPanel`, `Board`) leem por
`@tanstack/react-query`: um `QueryClient` próprio, criado com `staleTime: Infinity` e o cache
pré-carregado pelas funções de `lib/queryKeys.ts` (`test/query-seed.ts`, novo), faz o `useQuery`
nunca considerar a leitura obsoleta — a `queryFn` que chamaria `trpc.*.query` nunca roda. Provado com
um navegador de verdade contra o `storybook-static` construído: zero erro de console, e zero
`xhr`/`fetch`/`websocket` para `/trpc`, `/acp` ou `/pty` nas cinco stories — só o `index.json` que o
próprio Storybook pede. `Board` ganhou `notice: null` nos quatro cartões de propósito: um `notice`
preenchido dispararia `trpc.task.markNotified.mutate` de verdade dentro do `useEffect` de
`useBoardNotices`, que é exatamente a chamada de rede que a story existe para não fazer. A story de
`RightPanel` é a `Coluna de arquivos` que a T3 tirou de `ui/Primitives.stories.tsx`, restaurada
verbatim no endereço novo. `preview.tsx` ganhou o CSS de `memory`, `conversation` e `checkout` (o
`right-panel.css`), seguindo o precedente que o `board.css` já tinha — importado direto, porque o
preview mora fora de `src/` e a regra 7 do sensor não o audita.

#### T34: `testing.md` fecha a feature · **entregue em 2026-09-21**

A linha *"arquitetura do web"* da matriz ganha os números finais: oito regras no sensor, todas as
listas em zero, o mapa de tamanho com os oito. E as armadilhas que as fases acharem entram na
seção *"Armadilhas já corrigidas"* — a PRD prevê pelo menos uma na fase 3 (*"teste que passava por
acidente do mock"*), e a regra do repositório é registrar cada uma com sintoma, causa e o que passou
a avisar antes.

**Done when:** `pnpm docs:check` verde; o `**Status:**` desta PRD e deste arquivo dizem `completa`
— e o §Estado atual do `CLAUDE.md` tem o parágrafo da `032`.

**Achado:** "todas as listas em zero" não fecha ao pé da letra — a T16 já tinha avisado disso, e o
disco no fim da feature confirma: **sete** das oito listas do sensor estão em zero (`UI_KNOWS_DATA`,
`LIB_KNOWS_SCREEN`, `HOOK_WITHOUT_HOOK_NAME`, as três de `KEY_*`/`INVALIDATION_PREFIX_OUTSIDE`,
`FEATURE_BYPASSES_INDEX`, `CSS_IMPORTED_OUTSIDE_THE_DOOR`). A oitava, `COMPONENT_KNOWS_TRANSPORT`
(regra 3), fica em **cinco** — `Conversation.tsx` saiu dela na T26 (o transporte migrou para um
`.ts`), o que derrubou a lista de seis para cinco entre a T16 e o fim da fase 4, mas os cinco que
sobram (`FileTree.tsx`, `PatchViewer.tsx`, `ProposalQueue.tsx`, `setup/Done.tsx`, `TaskList.tsx`) não
existem para encolher: são os quatro recursos que a fase 3 nunca prometeu cobrir mais o `useQueries`
de `Done.tsx`. E `LARGE_FILE_CEILING` (regra 8) não é lista — é mapa —, com **nove** arquivos, não os
oito da Q8 original: `Board.tsx` já tinha saído antes da T25 medi-lo, e `conversation-model.ts` e
`LocalPanel.tsx` entraram como achado da própria T25, medidos no disco. Os números completos, com a
tabela do mapa, estão na linha atualizada de [testing.md](../../project/testing.md).

**Achado:** a armadilha que a PRD previu para a fase 3 — *"teste que passava por acidente do
mock"* — não aconteceu do jeito que o texto antecipava (um hook que invalida e um componente que não
esperava o refetch). O que a fase realmente pagou, três vezes (T27, T28, T29), é uma prima da mesma
família: um `*-css.test.ts` que audita por uma lista de arquivo escrita à mão fica **verde e cego**
depois de um componente sair de dentro da lista, porque uma classe que parou de ser pedida não
aciona nada. Registrado em `testing.md`, junto com o vazamento de estado de módulo entre testes que
a T21 achou (`lib/navigation.ts`) e o `vi.mock` de módulo de barril que muda de identidade a cada
chamada que a T17 achou (`checkout-tab.test.tsx`).

Com a T34, a **fase 8 — testes e galeria (T33–T34) — está inteira entregue**, e com ela as **34 tasks
das 9 fases da `032-web-architecture`**. O sensor de arquitetura, a camada de dados, o `git mv` para
`features/`, o teto de linhas, o `lib/navigation.ts` e o sensor de CSS ficam como a fronteira que a
próxima feature herda — e a galeria cobre, pela primeira vez, os cinco estados que o ADR do desenho
no código promete e nunca tinha.
