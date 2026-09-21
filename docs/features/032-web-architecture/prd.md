# PRD — A arquitetura do web: componente não fala com o transporte

> **Status:** completa
> **Histórico:** v0.1 — proposta em **2026-09-21**, a partir de uma análise de arquitetura do
> `packages/web` pedida no chat, com os números do §2 medidos contra o `HEAD` deste checkout
> (`d9b0d71`). **As fases 0, 1 e 2 (T1–T9) foram entregues no mesmo dia** — o §2 mediu **32**
> arquivos importando `lib/trpc.js` fora de `hooks/` e o sensor da T2 achou **33** no disco
> (esqueceu `App.tsx`); o que as três fases acharam está no `Histórico` de
> [tasks.md](tasks.md)
> **Perguntas:** [open-questions.md](open-questions.md) — **8 perguntas, 8 respondidas** em
> **2026-09-21**, todas como a proposta. A Q5 é a única que **mudou a PRD**: a fase 3 passa a
> reescrever os testes de tela do recurso que migra, e a nota está no requisito
> **Tasks:** [tasks.md](tasks.md) — **34 tasks em 9 fases** (0 a 8), todas entregues em 2026-09-21
> **Depende de:** a [`024-dev-harness`](../024-dev-harness/prd.md), que é **proposta** e cuja
> [T10](../024-dev-harness/tasks.md) instala o sensor de direção **entre pacotes** e diz, no item 4,
> que *"reduzir o arquivo grande é trabalho com PRD próprio"* — este é esse PRD, para o `web`. A
> [T9](../024-dev-harness/tasks.md) (lint) é irmã da fase 0 daqui e não pré-requisito: a fase 0 é um
> teste vitest, e não depende da resposta da Q2 de lá
> **Não é ADR, de propósito:** nenhuma regra do §3 é difícil de reverter — a exceção possível é a
> Q2, e ela está anotada lá. O que este documento decide é **direção de dependência dentro de um
> pacote**, e isso se desfaz apagando um teste

---

## 1. O problema, em uma frase

**O `web` não tem camada de dados.** Trinta e dois componentes importam `lib/trpc.js` e falam com o
daemon direto; a invalidação de cache está em 26 arquivos; e `queryKeys.ts` — cujo cabeçalho diz
*"toda chave num lugar só"* — convive com **21 chaves inline em 16 arquivos**, depois de o
[testing.md](../../project/testing.md) já ter registrado *"chave de cache escrita à mão é chave que
ninguém invalida"* como armadilha corrigida.

Tudo o mais deriva disso. O `test/trpc-mock.ts` virou "parte do contrato" (o próprio arquivo o
diz), o que faz **tela nova derrubar teste velho**. Tipos que atravessam a rede são espelhados à mão
em três arquivos porque o componente conhece a resposta cru do router. E nada trava a deriva: **o
repositório não tem lint**, então `lib/board.ts` importando um componente e uma story importando
uma tela são violações que existem há semanas sem falhar nada.

**Critério de sucesso em uma frase:** um componente do `web` recebe dado e devolve evento, e o único
lugar que sabe o que é `trpc`, `queryKey` e `invalidateQueries` é a pasta de hooks do recurso — com
um teste que reprova quando isso deixar de ser verdade.

## 2. O que se mediu antes de escrever

Onze medições, em **2026-09-21**, contra `packages/web/src` (229 arquivos, ~25 100 linhas de TS/TSX,
6 732 de CSS). **Quatro mudam a ordem do trabalho**, e estão marcadas.

**Componente fala com o transporte.** `grep -l 'from "../lib/trpc.js"' components/*.tsx setup/*.tsx`
devolve **32** arquivos. `useQuery(`/`useMutation(` aparecem em **25** componentes —
`AgentLogin.tsx` com 8, `TaskDetail.tsx`, `SettingsPanel.tsx` e `Board.tsx` com 6 cada.
`invalidateQueries` está em **26** arquivos, `Board.tsx` com 5. E metade do código **já segue o
padrão certo**: `useMemory`, `usePullRequest`, `useScripts`, `useFileTree`, `useUsage`,
`useSessionsByScope`, `useCheckoutChanges` são hooks por recurso e o componente que os usa não
importa `trpc`. Não é um padrão novo; é o padrão de metade do código estendido à outra metade.
**[muda a ordem: a fase 3 é migração, não desenho]**

**As chaves vazaram, e a regra já existia.** 21 `queryKey: [...]` literais fora de `queryKeys.ts`,
em 16 arquivos. `["agentConfig", "list"]` está declarada em **8 lugares** — `AgentLogin.tsx:13`,
`AgentConfigDialog.tsx:9`, `WorkspacePanel.tsx:421`, `setup/HandshakeStep.tsx:18`,
`setup/Done.tsx:10`, `NewSessionMenu.tsx:22`, `RunDock.tsx:401`, `TaskDetail.tsx:248`.
`["setup","agents"]` e `["setup","probe"]` existem em `setup/` **e** em `components/`.
`["secrets"]` três vezes, `["project","get"]` três vezes. O `invalidateFor` de `useLiveState.ts`
**não conhece** `agentConfig`, `secrets`, `setup`, `usage` nem `memory`: um login de agente ou uma
credencial nova só chegam às outras telas pela invalidação manual de quem escreveu, quando ela
existe. **[muda a ordem: é a fase mais barata e a de maior efeito, então vem primeiro]**

**Três estratégias para o mesmo contrato.** `packages/shared` tem `AcpEvent`, `PrStatus` e os
adaptadores. `useMemory.ts:27-33` e `useUsage.ts:24` **inferem** com
`Awaited<ReturnType<typeof trpc.x.query>>`. E três arquivos **espelham à mão** o que o servidor
devolve: `hooks/useLiveState.ts:20` redeclara `LumemEvent` (o servidor o tem em
`packages/server/src/events.ts:3`) e faz `event as LumemEvent`; `lib/board.ts` diz *"espelha o que
`server/tasks/board.ts` devolve"*; `TaskSeal.tsx` e `useCloneJob.ts` idem. Uma variante nova de
`LumemEvent` no daemon **não quebra o typecheck do web** — o oposto do que o
[testing.md](../../project/testing.md) celebra para `AcpEvent`, e a diferença é só onde o tipo mora.

**Direção de dependência dentro do pacote não é verificada, e já foi violada.** `lib/board.ts:1`
importa `type Seal` de `components/TaskSeal.js` — a biblioteca depende da tela.
`ui/Primitives.stories.tsx:4` importa `components/RightPanel.js` — a galeria de primitivas depende de
uma tela. O `index.ts` de `ui/` escreve a regra (*"nada aqui sabe do daemon, do tRPC ou de uma
query"*) e nada a confere. Não há `eslint`, `biome` nem `oxlint` na raiz.

**Pasta plana e cinco arquivos acima de 600 linhas.** `components/` tem **113 arquivos** no mesmo
nível: 50 componentes, 45 testes, 17 CSS, 1 `.ts` sem JSX (`pr-words.ts`, 325 linhas). `setup/` é a
única pasta por domínio, e funciona. Tamanhos: `MemoryPanel.tsx` **1 023** (17 funções internas),
`AgentLogin.tsx` **955** (`LoginOptions` sozinha tem ~300), `Conversation.tsx` **857** — a função
principal vai da linha 185 à 692, com 6 `useEffect` e reducer, ciclo do socket, sincronização de
permissão, envio único do prompt inicial, rascunho, menu de modo, portão e balão de ajuda no mesmo
corpo —, `SettingsPanel.tsx` 679, `FileTree.tsx` 640, `useFileBuffer.ts` 605, `RunDock.tsx` 601.

**O estado de navegação desce quatro níveis, duas vezes.** `openSessionId`, `initialPrompt`,
`initialDraft` e `filesPanel` vão de `App.tsx` → `WorktreePanel`/`LocalPanel` → `ScopePanel` →
`SessionTab` → `Conversation`. `WorktreePanelProps` e `LocalPanelProps` repetem as mesmas quatro
props **com o mesmo comentário copiado**. `App.tsx` tem 497 linhas, 8 `useState`, e é o arquivo do
`web` com **mais commits desde agosto** (31): ele é o store de navegação que o produto não nomeou.
`ask` e `draft` são o mesmo conceito — *abrir uma conversa com uma intenção* — com um booleano de
diferença (envia ou não). Já existem dois precedentes de solução: `AwaitingPermissionProvider` e
`OpenFilesProvider` nasceram pelo motivo escrito no próprio comentário, *"neither is an ancestor of
the other"*. **[muda a ordem: a LUM-63 vai mexer aqui de qualquer jeito, então a fase 5 é
alinhada com ela e não antes]**

**CSS: 32 imports em componentes, três convenções e blocos duplicados.** `board.css` entra no
`main.tsx`; `sidebar.css`, `clone.css` e `layout.css` no `App.tsx`; os outros 32 imports estão nos
componentes. `detail.css` é importado por **5** componentes, `tasks.css` por 4, `pr-bar.css` por 3.
O Vite deduplica, mas **a ordem da cascata depende de quem monta primeiro**. `ui.css` tem 1 081
linhas e ~60 blocos; `conversation.css`, 823 e ~50. `.btn--brand` e `.btn--warn` — variantes de uma
primitiva — estão em `conversation.css`; `.empty` e `.meta` estão definidos em `ui.css` **e** em
`conversation.css`. Dez blocos abreviados contra a convenção *"escreva por extenso"* do `CLAUDE.md`:
`.tc`, `.u`, `.mopt`, `.mmenu`, `.stab`, `.tdet`, `.tprov`, `.tsess`, `.tstat`, `.pq-item`.

**Nome de teste não bate com o testado.** 45 testes em kebab-case e um `Terminal.test.tsx`.
`session-ui.test.tsx`, `project-ui.test.tsx`, `workspace-ui.test.tsx` cobrem componentes que não têm
esse nome — achar o teste de `SessionTab` é um `grep`. Dez `*-css.test.ts` leem o CSS **como texto**
e afirmam sobre valores: é regressão de medida, e qualquer renome de classe os reescreve.

**A galeria cobre primitiva e não tela.** 20 stories, **todas em `ui/Primitives.stories.tsx`**. O
[ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md) diz que a galeria é
*"onde mora o estado caro de alcançar no app de verdade: workspace sem acervo, orçamento bloqueado,
vinte modelos no seletor"* — e nenhum desses três tem story.

**Utilitários repetidos.** Formatação de tempo relativo em cinco lugares (`Conversation.tsx:701`,
`MemoryPanel.tsx:822`, `:826`, `:932`, `pr-words.ts:307`) com `lib/relative-time.ts` existindo.
`stripComments` três vezes, `splitLines` e `textFile` duas. `hooks/notice.ts` exporta
`useBoardNotices` sem seguir o nome `useX` do arquivo.

**O que está bom, e a feature preserva.** `ui/` puro, com barrel e regra escrita.
`lib/conversation-model.ts` é um fold puro sobre o stream e o comentário explica por quê. `route.ts`
com `useSyncExternalStore`, medido antes de escolher. `tokens.css` fonte única, 119 pares de
contraste no gate. `strict` + `noUncheckedIndexedAccess`. Contextos usados com parcimônia e
justificados. `connect`/`load` injetáveis na `Conversation`. E os comentários dizem **por quê**, com
âncora para a PRD que decidiu — isso não muda.

## 3. As regras de camada, que são a decisão inteira

Cinco frases. O sensor da fase 0 é a tradução delas em teste, e cada fase seguinte zera uma lista de
exceções.

1. **`ui/` não conhece dado.** Importa `react` e `ui/`. Nunca `components`, `hooks`, `lib/trpc`,
   `@tanstack/react-query`. É a regra que o `ui/index.ts` já escreve.
2. **`lib/` não conhece tela.** Nunca importa `components/`, `hooks/` nem `features/`. É biblioteca:
   quem depende dela é a tela, e não o contrário.
3. **Componente não conhece transporte.** Nenhum arquivo `.tsx` fora de `hooks/`
   (ou do `queries.ts` da feature, depois da fase 4) importa `lib/trpc.js`, chama `useQueryClient`
   para invalidar, ou escreve `queryKey: [`. Ele chama um hook do recurso e recebe `{ data, ... }`.
4. **Toda chave de cache nasce em `queryKeys.ts`.** Chave inline é *"a versão da chave que o
   `invalidateFor` não conhece"*, e a regra deixa de ser texto e vira teste.
5. **Tipo que os dois lados nomeiam mora em `shared`.** Se o servidor declara um tipo com nome e o
   web precisa do mesmo nome, ele vai para `packages/shared`. Se só o web lê e nunca nomeia, infere
   com `Awaited<ReturnType<...>>`. **Espelho à mão não existe.**

## 4. Escopo — as fases, cada uma com a sua spec

Oito fases. A ordem é dependência, não prioridade: a 0 instala o sensor que mede as outras; a 1 e a 2
são baratas e independentes; a 3 é a que muda a arquitetura; a 4 é mecânica e só faz sentido depois
da 3 (mover antes seria mover o acoplamento junto); a 5 e a 6 mexem nos mesmos arquivos e se
encadeiam; a 7 e a 8 fecham o que sobrou. Cada fase é **uma sequência de PRs pequenas com um gate**,
e nenhuma fase começa antes de a anterior estar verde — que é a regra do `CLAUDE.md`.

| Fase | Nome | Tamanho | Trava em |
|---|---|---|---|
| 0 | O sensor | P | Q1 — respondida: arquivo próprio no `web` |
| 1 | As chaves | P | — |
| 2 | Os contratos | P | — |
| 3 | A camada de dados | G | Q5, Q6 — respondidas: mock por hook na tela, hooks vão para a feature na fase 4 |
| 4 | As pastas | M | Q3 — respondida: o mapa fica |
| 5 | A navegação | M | Q4 — respondida: é a fase 0 da LUM-63 |
| 6 | Os três grandes | M | Q8 — respondida: 400 linhas em `features/` |
| 7 | O CSS | **M** | Q2 — respondida: caminho A, sem ADR |
| 8 | Testes e galeria | P | — |

### Fase 0 — O sensor: a regra do §3 vira teste antes de qualquer refactor

**Por quê primeiro.** Sem sensor, as fases 1 a 7 são intenção; com ele, cada uma é *"a lista de
exceções encolheu para N"*, e o número aparece no diff. É o mesmo desenho da
[T10 da `024`](../024-dev-harness/tasks.md): mapa de exceções com o estado atual, que **só pode
diminuir**. A diferença é a fronteira — lá é entre pacotes, aqui é entre pastas do `web`.

**O que muda.**

- Um teste vitest, `packages/web/src/architecture.test.ts` (ou a extensão do teste da T10 da `024`,
  conforme a [Q1](open-questions.md)), que lê `src/**` com `readdirSync` e afirma **cinco
  propriedades**, uma por regra do §3:
  1. nenhum arquivo em `ui/` importa `../components`, `../hooks`, `../lib/trpc` nem
     `@tanstack/react-query` — **sem exceção**, porque hoje só a story viola, e ela é consertada na
     própria fase;
  2. nenhum arquivo em `lib/` importa `../components` nem `../hooks` — exceção: `lib/board.ts`, que a
     fase 2 apaga;
  3. nenhum `.tsx` fora de `hooks/` importa `lib/trpc.js` — **lista de exceções com os 32 de hoje**;
  4. nenhum `queryKey: [` fora de `lib/queryKeys.ts` — **lista com os 16 arquivos de hoje**; e
     nenhuma `const *_KEY = [` fora dele — lista com os 7 de hoje;
  5. nenhum arquivo de `hooks/` cujo nome não comece por `use` exporta um hook — exceção:
     `notice.ts`, que a fase 4 renomeia.
- A mensagem de falha diz **o que fazer**, não qual regra quebrou — o critério é o da T10:
  *"este componente importa o transporte: crie ou use um hook em `hooks/use<Recurso>.ts` e receba
  o dado por ele"*; *"esta chave nasceu fora de `queryKeys.ts` — declare-a lá, e o `invalidateFor`
  passa a alcançá-la"*.
- Uma exceção que **deixa de ser necessária e continua na lista reprova também**: senão a lista
  vira o lugar onde a regra morre em silêncio.
- `ui/Primitives.stories.tsx` para de importar `RightPanel`: a story dela vai para a feature, na
  fase 8, e até lá é removida da galeria de primitivas com um comentário dizendo para onde foi.

**Onde.** `packages/web/src/architecture.test.ts` (novo), `packages/web/src/ui/Primitives.stories.tsx`,
`docs/project/testing.md` (o que o sensor garante e o que não).

**Pronto quando.**
- o teste passa no `HEAD` com as listas **exatamente** iguais ao medido (32, 16, 7, 1, 1) — **nota da
  T2:** o disco tinha **33**, não 32; esta contagem esqueceu `App.tsx`, que importa `trpc` para o
  ping de saúde. O sensor mede o disco a cada execução, então a lista real está no diff de
  `architecture.test.ts`, não neste número;
- adicionar `import { trpc } from "../lib/trpc.js"` a um componente fora da lista **reprova**,
  nomeando o arquivo e a linha, e a mensagem diz para criar o hook;
- remover um arquivo da lista **sem** consertá-lo **reprova**; consertar sem remover da lista
  **reprova** também;
- o `gate:quick` continua abaixo do tempo de hoje mais 2 s.

**Gate.** `pnpm gate:quick`.

### Fase 1 — As chaves: `queryKeys.ts` volta a ser a lista do que o daemon alcança

**Por quê.** É a fase mais barata e a de maior efeito no produto: hoje um login de agente não
invalida `["agentConfig", "list"]` em 7 dos 8 lugares que a leem, e nenhum evento do daemon a
alcança. Uma tarde.

**O que muda.**

- Cada chave inline vira função ou constante em `queryKeys.ts`, com o comentário curto de
  **prefixo** que as outras já têm: `agentConfigsKey()`, `secretsKey()`, `setupAgentsKey()`,
  `setupProbeKey(command, args)`, `preflightKey()`, `authStateKey(loginId)`,
  `projectInspectKey(path)`, `worktreePlanKey(projectId, name)`, `parseSourceKey(workspaceId, source, name)`,
  `taskByWorktreeKey(worktreeId)`, `sessionsByTaskKey(taskId)`, `usageByTaskKey(workspaceId)`,
  `HEALTH_KEY`. `["project", "get", id]` vira o `projectDetailKey` que **já existe** e ninguém
  usava nesses três lugares.
- As invalidações por prefixo literal (`["memory"]`, `["pr"]`, `["files"]`, `["changes"]`,
  `["worktree"]`, `["session"]`, `["secrets"]`) viram constantes nomeadas `*_PREFIX` no mesmo
  arquivo, e o `invalidateFor` as usa — assim o teste da fase 0 pode exigir que **todo** literal de
  chave viva lá, sem distinguir leitura de invalidação.
- `invalidateFor` ganha as famílias que faltam **quando o daemon emitir o evento** — e ele não
  emite `agent_config.changed` nem `secret.changed` hoje. Isso é mudança de servidor e **fica fora
  desta fase**; entra como nota no `useLiveState.ts` e no [backlog](../../project/backlog.md), com
  o gatilho: *"a primeira tela que precisar ver um login feito em outra aba"*.
- Um teste novo em `queryKeys.test.ts`: toda chave exportada começa por um prefixo de uma lista
  fechada (`workspace`, `project`, `worktree`, `task`, `session`, `scripts`, `files`, `changes`,
  `memory`, `usage`, `pr`, `agentConfig`, `secrets`, `setup`, `health`, `pty`), e nenhum prefixo
  aparece **só** em invalidação sem ter chave de leitura — que é a forma de a lista mentir para o
  outro lado.

**Onde.** `packages/web/src/lib/queryKeys.ts`, os 16 arquivos com chave inline, os 7 com
constante local, `hooks/useLiveState.ts`, `docs/project/backlog.md`.

**Pronto quando.**
- as listas 4 da fase 0 estão em **zero**, e o teste as exige em zero;
- `grep -rn '\["agentConfig"' packages/web/src --include='*.tsx'` devolve nada;
- `useLiveState.test.tsx` continua verde **sem alteração**;
- fazer login de agente em `AgentLogin` invalida a chave que `NewSessionMenu`, `RunDock` e
  `TaskDetail` leem — provado por um teste de componente que renderiza `AgentLogin` e um leitor,
  dispara a mutação e conta **duas** chamadas do `agentConfig.list.query` (a leitura da chegada e a
  da invalidação), no molde do teste da armadilha do `testing.md`.

**Gate.** `pnpm gate:quick`.

### Fase 2 — Os contratos: espelho à mão vira tipo em `shared`

**Por quê.** Um tipo espelhado é um tipo que envelhece calado. O repositório já provou o valor do
contrário — *"uma variante nova de `AcpEvent` derruba o typecheck da tela, e isso é o contrato
funcionando"* — e a diferença entre esse caso e `LumemEvent` é **só o arquivo onde o tipo mora**.

**O que muda.**

- `packages/shared/src/events.ts` (novo): `LumemEvent`. `packages/server/src/events.ts` passa a
  importar e reexportar; `hooks/useLiveState.ts` apaga a redeclaração e o `event as LumemEvent`.
  Se o tipo inferido do `onData` da assinatura tRPC bastar, o import nem é preciso — o que se
  apaga é o cast, e o teste de mutação abaixo é quem decide.
- `packages/shared/src/board.ts` (novo): `BoardCard`, `BoardColumn`, `Seal`, `SealRole` e o que
  `lib/board.ts` e `TaskSeal.tsx` espelham de `packages/server/src/tasks/board.ts`. O servidor
  passa a **produzir** o tipo do `shared` (datas já como `string`, que é o que o tRPC entrega —
  então a fronteira é a serializada, e é isso que o `shared` descreve). `lib/board.ts` fica com o
  que é do web — as funções puras de coluna — e **deixa de importar `components/TaskSeal`**, que é
  a exceção 2 da fase 0 caindo.
- `useCloneJob.ts`: o mesmo, para o progresso do clone.
- Regra 5 do §3 vira parágrafo no `docs/project/testing.md`, ao lado da armadilha do `AcpEvent`:
  *"nomeado nos dois lados → `shared`; lido só pelo web → inferido; espelhado → não existe"*.

**Onde.** `packages/shared/src/{events,board}.ts` e `index.ts`, `packages/server/src/events.ts`,
`packages/server/src/tasks/board.ts`, `packages/web/src/hooks/{useLiveState,useCloneJob}.ts`,
`packages/web/src/lib/board.ts`, `packages/web/src/components/TaskSeal.tsx`.

**Pronto quando.**
- `grep -rni 'espelha\|mirrors' packages/web/src --include='*.ts' --include='*.tsx'` devolve nada;
- `grep -rn 'as LumemEvent' packages/web/src` devolve nada;
- **prova por mutação:** adicionar `| { type: "secret.changed" }` a `LumemEvent` no `shared`
  **derruba o typecheck** de `useLiveState.ts` no `switch` sem `default` — que é o comportamento
  que o `AcpEvent` já tem;
- adicionar um campo a `BoardCard` no servidor sem adicioná-lo no `shared` **derruba o typecheck do
  servidor**, e não o do web em silêncio;
- a lista 2 da fase 0 está em zero.

**Gate.** `pnpm gate:build` (é typecheck de três pacotes) e `pnpm gate:quick`.

### Fase 3 — A camada de dados: um hook por recurso, e o componente para de importar `trpc`

**Por quê.** É a fase que muda a arquitetura. Tudo o que o §1 descreve — mock como contrato, tela
nova quebrando teste velho, invalidação em 26 arquivos — é sintoma de componente que sabe o que é
transporte. E não é desenho novo: é o padrão de `useMemory` e `usePullRequest` estendido aos 32
arquivos da lista 3.

**O que muda.**

- Um hook por **recurso** (não por tela), em `hooks/` até a fase 4 e em
  `features/<x>/queries.ts` depois — a [Q6](open-questions.md) decidiu que a fase 4 os move:
  `useAgentConfigs`, `useSecrets`, `useProjectDetail`, `useProjectMutations`, `useWorktreeDetail`,
  `useWorktreeMutations`, `useWorktreeOrigins`, `useTaskDetail`, `useTaskMutations`, `useBoard`,
  `useTaskSettings`, `useWorkspaceMutations`, `useCloneMutations`, `useSetupPreflight`,
  `useSetupProbe`, `useAuthState`. Cada um: chama `trpc`, usa a chave de `queryKeys.ts`, e as
  mutações **invalidam dentro do hook** — o componente nunca vê `useQueryClient`.
- A forma de retorno é a do `useQuery` (`{ data, isPending, isError, error }`) e do `useMutation`
  (`{ mutate, mutateAsync, isPending }`), sem embrulho: o que muda é **quem chama**, não a API.
  Inventar um tipo de resultado próprio seria trocar o TanStack por um TanStack pior.
- **Ordem de migração, por lista da fase 0 e por recurso** — cada PR é um recurso, com os
  componentes que o leem:
  1. `agentConfig` — os 8 leitores da fase 1 (`AgentLogin`, `AgentConfigDialog`, `NewSessionMenu`,
     `RunDock`, `TaskDetail`, `WorkspacePanel`, `HandshakeStep`, `Done`);
  2. `task` — `Board`, `TaskList`, `TaskDetail`, `WorktreePanel`, `LocalPanel`;
  3. `project` e `worktree` — `SidebarTree`, `LocalPanel`, `WorktreePanel`, `CreateWorktreeDialog`,
     `AddProjectDialog`, `WorkspaceSelector`, `WorkspacePanel`;
  4. `pr` — `PrWriteDialog` (o `usePullRequest` já existe; falta a escrita);
  5. `secrets` e `workspace` — `SettingsPanel`, `Credentials`, `CredentialDialog`;
  6. `setup` — os sete passos;
  7. `session` e `scripts` — `SessionTab`, `ScopePanel`, `Conversation` (o `connect`/`load`
     injetáveis **ficam**: são transporte de socket, não query, e o teste depende deles).
- ~~**Os testes de componente não são reescritos nesta fase.**~~ **Contradito pela resposta da
  [Q5](open-questions.md) em 2026-09-21**, no mesmo dia em que foi escrito. O que sobrou de pé: a
  fase continua incremental, **um recurso por PR** — o que caiu é que o teste de tela fica igual.
  Ele muda de alvo: a tela passa a mockar **o hook** (`vi.mock("../hooks/useAgentConfigs.js")`),
  porque é o hook que ela consome; e o hook ganha teste próprio, que mocka o `trpc` por um
  **`Proxy` recursivo tipado por `AppRouter`** devolvendo `vi.fn()` sob demanda. Cada PR da lista
  acima reescreve os testes das telas **daquele** recurso, e só deles.
- `trpc-mock.ts` **deixa de existir no fecho da fase**: quando o último componente da lista 3
  migrar, nenhum teste de tela importa `lib/trpc.js`, e o `Proxy` (`test/trpc-proxy.ts`, ~30
  linhas) é o único mock de transporte que resta — usado só por teste de hook. A classe *"tela nova
  derruba teste antigo"* morre por construção: uma tela nova traz o hook novo e o mock dele, e quem
  não a renderiza não a conhece.

**Onde.** `packages/web/src/hooks/use*.ts` (novos e existentes), os 32 componentes da lista,
`packages/web/src/test/trpc-mock.ts`.

**Pronto quando.**
- a lista 3 da fase 0 está em **zero**: nenhum `.tsx` fora de `hooks/` importa `lib/trpc.js`;
- `grep -rn 'useQueryClient' packages/web/src/components packages/web/src/setup` devolve nada;
- cada hook novo tem teste próprio que prova **a invalidação** da mutação (a chave certa, uma vez),
  no molde de `pull-request.test.ts`;
- `trpc-mock.ts` **não existe** (Q5), e `test/trpc-proxy.ts` tem menos de 60 linhas;
- **prova por mutação:** apagar a invalidação de dentro de `useAgentConfigMutations` derruba um
  teste, e o teste que cai é o do hook — não um de tela três pastas ao lado.

**Gate.** `pnpm gate:quick` por PR; `pnpm gate:full` no fecho da fase (os 35 e2e são a prova de que
o comportamento não mudou).

### Fase 4 — As pastas: `components/` vira `features/<domínio>/`

**Por quê.** 113 arquivos planos são um custo de leitura, e `setup/` já prova que pasta por domínio
funciona aqui. Vem **depois** da fase 3 porque mover componentes que importam `trpc` é mover o
acoplamento — e o `index.ts` de cada feature é onde a regra *"feature só fala com feature pela
porta"* pode existir.

**O que muda.**

- `packages/web/src/features/<nome>/`, com componentes, `queries.ts` (se a Q6 disser que os hooks
  vão junto), `index.css`, testes e stories da feature no mesmo lugar. O mapa proposto, a partir do
  que cada componente importa hoje — a [Q3](open-questions.md) o valida:

  | Feature | O que vai | CSS |
  |---|---|---|
  | `conversation/` | `Conversation`, `Message`, `ToolCard`, `PlanCard`, `PermissionRequest`, `ConfigPills`, `LumemModePill`, `FreeModeGate`, `SlashMenu`, `UsageFooter`, `Markdown`, `SessionTab`, `NewSessionMenu`, `Terminal`, `lib/conversation-model`, `lib/acp-socket`, `lib/pty-socket` | `conversation.css`, `new-session.css`, `terminal.css` |
  | `memory/` | `MemoryPanel`, `ProposalQueue`, `useMemory` | `memory.css` |
  | `tasks/` | `Board`, `TaskCard`, `TaskSeal`, `TaskList`, `TaskDetail`, `lib/board`, `notice` → `useBoardNotices` | `tasks.css`, `board.css` |
  | `checkout/` | `ScopePanel`, `WorktreePanel`, `LocalPanel`, `CheckoutFiles`, `RightPanel`, `FileTree`, `FileViewer`, `PatchViewer`, `DiffLines`, `ChangesTab`, `TabSplit`, `ViewerFrame`, `RunDock`, `useFileBuffer`, `useFileTree`, `useCheckoutChanges`, `useScripts`, `useRunDock`, `useRightPanel`, `useOpenFiles`, `useWorktreeTabs`, `useSessionsByScope` | `detail.css`, `right-panel.css`, `viewer.css`, `run-dock.css` |
  | `pull-request/` | `PrBar`, `PrWriteDialog`, `ChecksTab`, `pr-words`, `usePullRequest` | `pr-bar.css` |
  | `workspace/` | `WorkspacePanel`, `WorkspaceSelector`, `SpendList`, `SidebarNav`, `SidebarTree`, `AddProjectDialog`, `CloneStatus`, `CreateWorktreeDialog`, `useUsage`, `useCloneJob`, `useTreeExpansion`, `useActiveWorkspace` | `workspace.css`, `sidebar.css`, `clone.css`, `create-worktree.css` |
  | `agent/` | `AgentLogin`, `AgentConfigDialog`, `Credentials`, `CredentialDialog` | `agent-login.css` |
  | `settings/` | `SettingsPanel` | `settings.css` |
  | `setup/` | o que já está em `setup/` | `setup.css` |

  Ficam onde estão: `ui/`, `layout/`, `styles/`, `test/`, e em `lib/` o que é biblioteca de verdade
  — `trpc`, `queryClient`, `queryKeys`, `route`, `markdown`, `shiki`, `shiki-codemirror`,
  `codemirror-setup`, `xterm-theme`, `relative-time`, `pending-writes`, `agentation`.
  `useAwaitingPermission` e `useLiveState` são do app inteiro e ficam em `hooks/` — que passa a ter
  só o que é **transversal**.
- **Um `index.css` por feature**, importado uma vez pelo `index.ts` dela. Os 32 imports espalhados
  saem dos componentes. Isso não é a fase 7: é o mínimo que a mudança de pasta já exige, e resolve
  a cascata dependente de ordem de montagem sem decidir Modules.
- **Um `index.ts` por feature**, e a regra do sensor: feature importa outra feature **só** pelo
  `index.ts` dela (`../tasks/index.js`, nunca `../tasks/TaskCard.js`). `lib/` e `ui/` continuam não
  importando `features/`.
- Testes **renomeados para o componente que testam** (`SessionTab.test.tsx`, e não
  `session-ui.test.tsx`), porque agora moram ao lado dele e o nome é o único índice. Onde um teste
  cobre dois componentes, ele é dividido.
- Tudo com `git mv` numa **PR só**, numa janela sem outra worktree tocando `components/`: o custo
  desta fase é conflito, e ele se paga uma vez.
- Junto, os pequenos que só valem a pena com o arquivo já aberto: as cinco formatações de tempo
  viram `lib/relative-time.ts`; `stripComments`, `splitLines`, `textFile` viram uma função cada.

**Onde.** `packages/web/src/**`, `packages/web/src/architecture.test.ts` (as regras novas),
`.storybook/` (o glob de stories), `docs/project/testing.md`.

**Pronto quando.**
- `packages/web/src/components` e `packages/web/src/setup` **não existem**;
- `git log --follow packages/web/src/features/conversation/Conversation.tsx` mostra o histórico de
  antes do move;
- o sensor tem as duas regras novas (porta da feature; `lib`/`ui` não importam `features`) e passa;
- todo `*.test.tsx` em `features/` tem um `<Nome>.tsx` irmão com o mesmo nome;
- nenhum `import "*.css"` fora de `main.tsx`, `App.tsx` e dos `index.ts` de feature;
- `pnpm gate:full` verde **sem mudança de asserção** — só de caminho de import.

**Gate.** `pnpm gate:full` e `pnpm build-storybook`.

### Fase 5 — A navegação: o App deixa de ser o store que ninguém nomeou

**Por quê.** `App.tsx` é o arquivo com mais commits do `web` porque toda feature que precisa de
*"abrir isto ali"* passa por ele — e o que ela precisa desce quatro níveis por prop. A
[Q4](open-questions.md) decidiu **quando**: esta fase é a **fase 0 da LUM-63** (workspace,
projeto e checkout na URL), que vai serializar exatamente este estado — fazer o store antes dela é
dar à LUM-63 um lugar para escrever em vez de outro `useState` no App. As tasks moram no
[tasks.md](tasks.md) daqui; o da LUM-63 nasce apontando para elas.

**O que muda.**

- `lib/navigation.ts` (novo), no molde exato de `route.ts` — `useSyncExternalStore`, sem
  biblioteca —, com o estado que hoje é `useState` do App e é **lido longe de onde nasce**:

  ```ts
  interface Navigation {
    selection: { projectId: string; scope: Scope } | null;
    /** Uma conversa a trazer para a frente, uma vez, e com que intenção. */
    arrival: { sessionId: string; text?: string; send: boolean } | null;
  }
  ```

  `ask` e `draft` viram **um** campo, `arrival`, com `send: true` para o pedido do rodapé de
  execução e `send: false` para *"trabalhar nesta tarefa"*. O `openSessionId` sozinho é um
  `arrival` sem texto.
- `selectScope`, `navigate("home", { replace: true })` e a regra *"`selection !== null` implica
  `route === "home"`"* vão para o store, que passa a ser a **única** resposta a *"onde eu estou"* —
  o que a `029` quis e o App só conseguiu pela metade.
- `useArrival(sessionId)`: o hook que a `Conversation` chama e que **consome** a chegada uma vez —
  o one-shot que hoje está espalhado entre `ScopePanel`, `SessionTab` e o `useEffect` da
  `Conversation`. `ScopePanel`, `SessionTab`, `WorktreePanel` e `LocalPanel` **perdem** as props
  `openSessionId`, `initialPrompt` e `initialDraft`.
- `useRightPanel` vira contexto (ou store) e `filesPanel` sai das props de `ScopePanel`,
  `WorktreePanel` e `LocalPanel`: é o mesmo desenho que `OpenFilesProvider` já tem, pelo mesmo
  motivo escrito lá.
- Ficam como `useState` do App só o que é **do App**: `setupOpen` (o único estado que não pode ser
  derivado, e o comentário dele explica), `addProjectOpen` e `worktreeFor` (os dois modais). Alvo:
  `App.tsx` abaixo de 250 linhas.
- **A URL não entra aqui.** O store é o que a LUM-63 vai serializar; serializar é dela.

**Onde.** `packages/web/src/lib/navigation.ts` (novo), `App.tsx`, `features/checkout/{ScopePanel,
WorktreePanel,LocalPanel}.tsx`, `features/conversation/{SessionTab,Conversation}.tsx`,
`features/checkout/useRightPanel.ts`.

**Pronto quando.**
- nenhuma interface `*Props` do `web` declara `openSessionId`, `initialPrompt` ou `initialDraft`;
- `App.tsx` tem no máximo **3** `useState` e menos de 250 linhas;
- `00-onboarding.spec.ts` (*"criar e abrir a conversa"* — a promessa que o `openSessionId` existia
  para cumprir), `acp-conversation.spec.ts` e o teste do rodapé sem `[scripts]` em
  `run-dock.test.tsx` (o `ask`) continuam verdes **sem mudança de asserção**;
- **prova por mutação:** fazer `useArrival` não consumir a chegada faz o teste de *"o rascunho
  entra uma vez e não sobrescreve o que foi digitado"* reprovar — o comportamento que o comentário
  de `initialDraft` na `Conversation` protege hoje.

**Gate.** `pnpm gate:full`.

### Fase 6 — Os três grandes: `Conversation`, `MemoryPanel`, `AgentLogin`

**Por quê.** Vem depois da 5 porque a `Conversation` perde três props e um `useEffect` lá, e
quebrar um componente antes de ele encolher é quebrar duas vezes. O teto de linhas é **400**, pela
[Q8](open-questions.md); o desenho de cada quebra é este.

**O que muda.**

- **`Conversation.tsx` (857) em três.**
  - `useConversationSession(sessionId, { live, connect, load })`: o `useReducer` com
    `conversation-model`, o ciclo do socket, o caminho `load` do transcript morto, e a
    sincronização com `useAwaitingPermission` (o par de efeitos com o `setWaitingRef`, cujo
    comentário explica a oscilação — ele vai inteiro). Devolve `{ state, send, cancel, answer,
    setMode, setConfig }`. **É onde `connect` e `load` injetáveis passam a morar**, então o
    `conversation.test.tsx` muda só o import.
  - `Composer`: rascunho, envio, pílula de modo, menu, portão do `liberado`, `SlashMenu`,
    `ConfigPills`, `UsageFooter`. Recebe `session`, `readOnly`, `onSend`.
  - `Transcript`: a lista de `BlockView`, `ResumeMark`, `EmptyConversation`, `useAutoScroll`.
  - `Conversation` fica a composição: ~80 linhas.
- **`MemoryPanel.tsx` (1 023) por aba**, que é como ele já está dividido em funções internas:
  `MemoryEntries.tsx`, `MemoryProposals.tsx` (com `PendingProposal`, `EditAndApprove`,
  `ConfirmReject`, `Conflict`, `Evidence`), `MemoryTimeline.tsx`, `MemoryPlaybooks.tsx`,
  `MemoryNumbers.tsx`. `MemoryPanel` fica o `TabStrip` e o roteamento de aba. `MemoryProposals` já
  é exportado e usado fora — a quebra só torna a fronteira que existe visível no disco.
- **`AgentLogin.tsx` (955) em quatro**: `AgentRow.tsx` (+ `useAgentProbe`), `ConnectPanel.tsx`,
  `AgentPanel.tsx`, `LoginOptions.tsx`. Os `describeSpec`, `describeMethod`, `needsKey`, `entryOf`
  viram `agent-words.ts` — o mesmo desenho de `pr-words.ts`.
- **Regra nova no sensor** (Q8): arquivo de `features/` acima de **400** linhas reprova, com um
  mapa de exceções que só encolhe, nascendo com `SettingsPanel` (679), `FileTree` (640),
  `useFileBuffer` (605), `RunDock` (601), `CreateWorktreeDialog` (547), `Board` (461),
  `FileViewer` (461), `WorkspacePanel` (450). É o desenho da T10 da `024` com o número do `web`
  — lá é 700 para o repositório, e um componente React de 700 linhas é três componentes.

**Onde.** `features/conversation/`, `features/memory/`, `features/agent/`,
`packages/web/src/architecture.test.ts`.

**Pronto quando.**
- nenhum arquivo em `features/` acima de 400 linhas fora do mapa, e o mapa tem exatamente os oito;
- `useConversationSession` tem teste próprio, que é o `conversation.test.tsx` de hoje com o hook
  renderizado por `renderHook` e o mesmo `connect` falso — e um teste **novo** que o componente não
  conseguia ter: *"desmontar a sessão fecha o socket e limpa o `awaiting`"*, sem DOM;
- os seis `useEffect` da `Conversation` de hoje estão em no máximo dois arquivos, e cada um tem
  o comentário que já tinha;
- `gate:full` verde sem mudança de asserção nos e2e.

**Gate.** `pnpm gate:full`.

### Fase 7 — O CSS: uma resposta para a cascata

**Por quê.** A fase 4 já dá um import por feature; o que sobra é o que a cascata global custa —
bloco duplicado entre arquivos, variante de primitiva morando numa feature, classe órfã que ninguém
vê. A [Q2](open-questions.md) decidiu o **caminho A** em 2026-09-21; o B fica escrito porque é a
alternativa que perdeu, e o gatilho de volta está no [backlog](../../project/backlog.md).

**Caminho A — cascata organizada (M).**
- `.btn--brand` e `.btn--warn` vão para `ui.css`, ao lado das outras variantes de `.btn`; `.empty`
  e `.meta` deixam de existir em `conversation.css`.
- Os dez blocos abreviados ganham nome por extenso: `.tc` → `.tool-card`, `.u` → `.usage`,
  `.mopt` → `.mode-option`, `.mmenu` → `.mode-menu`, `.stab` → `.session-tab`, `.tdet` →
  `.task-detail`, `.tprov` → `.task-provenance`, `.tsess` → `.task-sessions`, `.tstat` →
  `.task-status`, `.pq-item` → `.proposal-item`. Os dez `*-css.test.ts` mudam junto.
- Sensor: um teste que lê todo `.css` do `web`, extrai os blocos de primeiro nível e reprova
  **bloco definido em dois arquivos** e **classe usada em `.tsx` sem definição** (as 13 órfãs que a
  `028` Parte 3 pagou, como teste).

**Caminho B — CSS Modules (G).**
- `<Nome>.module.css` por componente, `import styles from`; o Vite já suporta sem dependência; o
  `tokens.css` e o `base.css` continuam globais; `ui/` migra primeiro, porque é onde a colisão
  custa mais.
- Órfã e colisão viram erro de typecheck com `typed-css-modules` ou o plugin do Vite — o sensor do
  caminho A não é necessário.
- Custo que a Q2 pesa: os dez `*-css.test.ts` e o `contrast.ts` leem seletor por nome, e o
  agentation anota por classe — os três precisam do nome estável que Modules embaralha em
  produção. Se a resposta for B, **vira ADR**: passa nos três testes (difícil de reverter em 50
  componentes, surpreendente para quem chega de fora vendo `styles.x`, e trade-off real contra a
  cascata que o desenho no código escolheu em 2026-09-20).

**Onde.** `packages/web/src/**/*.css`, `styles/contrast.ts`, os dez `*-css.test.ts`,
`architecture.test.ts` (caminho A) ou `vite.config.ts` + `tsconfig.json` (caminho B).

**Pronto quando (A).** nenhum bloco em dois arquivos; nenhuma classe órfã; nenhum bloco de uma ou
duas letras; `contrast.ts` continua com 119 pares.
**Pronto quando (B).** nenhum `className="..."` literal fora de `ui/` que não venha de `styles`;
`build-storybook` e `gate:full` verdes; ADR escrito antes do primeiro `.module.css`.

**Gate.** `pnpm gate:quick` (contraste e tokens moram lá) e `pnpm build-storybook`.

### Fase 8 — Testes e galeria: o que a fase 4 não fechou

**O que muda.**
- **Stories de tela**, uma por estado caro que o ADR de design promete e não tem: workspace sem
  acervo (`MemoryPanel` vazio), orçamento bloqueado (`Board` com `TaskCard` bloqueado), vinte
  modelos no seletor (`ConfigPills`), conversa com permissão pendente (`Conversation` com
  `connect` falso — que é o que a fase 6 torna possível sem daemon), `RightPanel` (a story que
  saiu de `Primitives` na fase 0). Cada uma em `features/<x>/<Nome>.stories.tsx`.
- O `Proxy` sobre `AppRouter` ou o mock por hook — o que a Q5 decidiu — substitui `trpc-mock.ts`
  se a fase 3 não o fez.
- `docs/project/testing.md`: a matriz de cobertura ganha a linha *"arquitetura do web"* com o
  sensor, as listas em zero, e o que ele **não** garante (comportamento — isso continua sendo dos
  testes de componente e dos e2e).

**Pronto quando.** cinco stories novas renderizam no `build-storybook`; `trpc-mock.ts` não existe
ou tem menos de 60 linhas; `testing.md` atualizado.

**Gate.** `pnpm build-storybook` e `pnpm gate:quick`.

### Fora de escopo

- **Formatador.** O §4 da [`024`](../024-dev-harness/prd.md) já decidiu: reformatar apaga o
  `git blame`. Nada aqui muda estilo — só estrutura.
- **Lint de correção** (`no-floating-promises` e companhia). É a T9 da `024`, e a Q2 de lá decide a
  ferramenta. O sensor daqui é um teste vitest e não compete com ela.
- **A URL do checkout.** É a LUM-63. A fase 5 constrói o store que ela vai serializar, e para aí.
- **Eventos novos do daemon** (`agent_config.changed`, `secret.changed`). É servidor; a fase 1
  anota no backlog com o gatilho.
- **Refatorar o servidor.** `AcpManager.ts` e companhia são a T10 da `024` e o PRD que ela pede —
  outro.
- **Trocar o roteador, o TanStack ou o tRPC.** As três decisões estão medidas e de pé.

## 5. Como se prova

**O sensor é a prova.** Cada fase termina com uma lista de exceções em zero, e o número está no
diff do `architecture.test.ts`. É o que faz o roadmap ser auditável sem ler os componentes: a
tabela do §4 vira uma linha por fase no teste, e a linha diz `[]`.

**Cada fase tem uma prova por mutação**, escrita na spec dela: a fase 0 reprova ao adicionar um
import; a 1 conta duas chamadas de query; a 2 adiciona uma variante e vê o typecheck cair; a 3
apaga uma invalidação e vê o teste do hook cair; a 5 faz o one-shot não consumir; a 6 desmonta a
sessão sem DOM. Uma fase cujo teste não fica vermelho quando o comportamento muda não está pronta —
é a regra do `025` (*"o gate nasceu verde, que é o sinal de um gate que não checa nada"*).

**Os e2e são a prova de que nada mudou para quem usa.** Nenhuma fase muda asserção de e2e; as 35
specs verdes no fecho de cada fase é o critério de *"refactor, e não feature"*.

## 6. Riscos

| Risco | Onde | Como se lida |
|---|---|---|
| **Conflito com worktrees paralelas** na fase 4 — um `git mv` de 113 arquivos contra qualquer branch que toque `components/` | fase 4 | uma PR só, numa janela anunciada; as fases 0–3 não movem nada, então até lá nenhum conflito é desta feature |
| **Teste que passava por acidente do mock** aparece na fase 3 — o hook invalida e o componente não esperava refetch | fase 3 | é o que o testing.md chama de *"tela nova derruba teste antigo"*; cada PR é um recurso, então o teste que cai nomeia o recurso |
| **`conversation.test.tsx` acoplado ao componente** na fase 6 — ele injeta `connect` e lê o DOM | fase 6 | o hook nasce com o mesmo `connect`; o teste do componente muda import, e o do hook é novo — o antigo não é apagado até o novo cobrir os mesmos casos |
| **CSS Modules embaralha nome** e quebra `contrast.ts`, os `*-css.test.ts` e o agentation | fase 7 B | está na Q2 como custo, e é o que faz o caminho A ser a proposta |
| **Lista de exceções que não encolhe** — o sensor passa para sempre com 32 | fase 0 | a fase 3 tem *"lista em zero"* como critério, e o sensor reprova exceção que não é mais necessária — a lista não pode ficar estável com o código melhorando |
| **A LUM-63 chegar antes da fase 5** e pôr mais um `useState` no App | fase 5 | a Q4 é sobre isso: se a LUM-63 entrar primeiro, a fase 5 vira o primeiro passo dela |

## 7. O que este documento não decide

Nada trava. As oito perguntas de [open-questions.md](open-questions.md) foram respondidas em
2026-09-21, todas como a proposta. O que **fica de fora** e está registrado: eventos novos do daemon
(fase 1, backlog), CSS Modules (Q2, backlog) e a URL do checkout (LUM-63, cuja fase 0 é a fase 5
daqui).
