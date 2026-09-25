# Agente é sempre ACP — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Decisão:** [ADR de 2026-09-24](../../adr/2026-09-24-1620-agent-is-always-acp.md)
**Status:** em execução

**24 tasks em 7 fases.** Uma task por vez, na ordem: RED → GREEN → gate → commit atômico
(Conventional Commits, em inglês). Cada task diz o gate que declara; **rode-o antes de marcar
pronta**. Referências `§` apontam para o plano técnico da discovery, e `arquivo:linha` para o mapa
de código dela — os dois ficaram fora do repositório, no pacote de implementação não versionado.
As decisões que o plano tomou e que valem estão na PRD e no `open-questions.md`.

---

## Antes de começar

- As decisões de produto (Q0–Q11 do [open-questions.md](open-questions.md)) **não se reabrem**.
- `pnpm install` e `pnpm gate:quick` verdes na branch antes da T1.
- Confira que `docs/features/033-*` não existe (`ls docs/features/`). Se existir, use o próximo
  número livre e troque em todos os arquivos.
- Confira que `packages/server/drizzle/0033_*` não existe. Se existir, a migração é a próxima.

---

## Fase 0 — Decisão e medição

#### T1: ADR e pasta da feature

**What**: Escrever o [ADR](../../adr/2026-09-24-1620-agent-is-always-acp.md) a partir do rascunho
da discovery e criar `docs/features/033-acp-only-agents/` com [prd.md](prd.md),
[open-questions.md](open-questions.md) e este `tasks.md`. Adicionar as três entradas no
`docs/README.md` (ADR na tabela de ADRs; o de 2026-08-17 riscado como **superado**, no padrão da
tabela; a seção da feature).
**Where**: `docs/adr/`, `docs/features/033-acp-only-agents/`, `docs/README.md`
**Atenção — o pacote da discovery não é versionado.** Nada em `docs/` pode linkar para fora do
repositório (o `docs:check` reprova link morto). Por isso este `tasks.md` cita o plano e o mapa de
código como texto, e as notas que a T24 aplica estão **coladas nela**, para a task ser executável
só com o repositório.
**Done when**: o ADR tem `supersedes: 2026-08-17-1812-agent-session-is-acp-not-pty`; a PRD tem
`**Status:** em execução`; nenhum arquivo em `docs/` aponta para `tmp/`; todo link relativo resolve.
**Gate**: `pnpm docs:check` (o gate do contrato de docs da `025` — links, `Status:`, `supersedes`)
**Commit**: `docs(033): agent is always ACP — ADR, PRD and tasks`

#### T2: Medir três coisas contra os adaptadores do daemon

**What**: Sem gastar turno (nada de `session/prompt`), com o `AcpManager` deste repositório como
cliente, contra `claude-agent-acp@0.75.1` e `codex-acp@1.10.0` instalados em `<stateDir>/adapters/`:
1. o `configOptions` do `session/new` — o Claude expõe opção de *effort* (categoria
   `thought_level`/`effort`)? Quais ids e choices?
2. `session/load` restaura o modelo trocado por `set_config_option` antes de a sessão morrer?
3. os tempos de `spawn` / `initialize` / `session/new` (o `probe` já devolve `timings`), três
   rodadas cada.
Escrever os números na PRD (§ Medições) e responder no `open-questions.md` as perguntas M1–M3.
**Where**: script descartável fora do repositório (ou em `.context/`); resultado em
`docs/features/033-acp-only-agents/prd.md` e `open-questions.md`
**Done when**: M1–M3 respondidas com número. Se M1 = *não expõe*, a pílula de effort some para o
Claude (Q10) e nada muda no plano. Se M2 = *restaura*, a T11 continua (a reaplicação vira no-op).
**Gate**: revisão manual
**Commit**: `docs(033): measure effort option, model restore and spawn timings`

---

## Fase 1 — Servidor: o banco e o fim do agente-PTY

#### T3: Migração `0033`

**What**: §3.5. `agent_config` perde `transport` e ganha `retired_at`; linha `pty` vira aposentada
na migração; CHECK de `adapter_version` passa a `retired_at IS NOT NULL OR adapter_version IS NOT
NULL`. `session` ganha `pending_prompt` e `pending_reason` (CHECK `IN ('setup_failed')`).
`pnpm --filter @lumem/server db:generate`, depois **ler o SQL gerado** e corrigir à mão o `INSERT …
SELECT` (a coluna `retired_at` sai de `CASE WHEN transport = 'pty' THEN <epoch ms> END`).
**Where**: `packages/server/src/db/schema.ts`, `packages/server/drizzle/0033_*.sql` +
`meta/`, `packages/server/src/db/migrations.test.ts`, `packages/server/src/db/db.test.ts`
**Done when**: teste RED→GREEN em `migrations.test.ts`: banco parado na `0032` com (a) config
`claude-code` `pty` + uma sessão `agent`/`pty` apontando para ela, (b) config `claude` `acp` +
sessão; migra; asserta `retired_at` não nulo só em (a), a sessão (a) intacta com `transport = 'pty'`,
a FK `restrict` ainda recusando apagar a config (a), e `PRAGMA foreign_key_check` vazio. `db.test.ts`
cobre os CHECKs novos a partir do banco vazio.
**Gate**: `pnpm gate:quick`
**Commit**: `feat(server): retire PTY agent configs and add pending prompt columns`

#### T4: `agent_config` sem transporte

**What**: Repositório e roteador sem `transport`. `create` exige `adapterVersion`. `list` filtra
`retired_at IS NULL`. `findById` continua achando aposentada (a sessão legada precisa do nome).
`AgentTransport` some. `configForAdapter` sai de `tasks/conveyor-wiring.ts` para
`repositories/agentConfig.ts` (o conveyor importa de lá) e cria sem `transport`.
**Where**: `packages/server/src/repositories/agentConfig.ts`, `routers/agentConfig.ts`,
`tasks/conveyor-wiring.ts`, `testing/caller.ts` e os testes que criam config com `transport`
**Done when**: `grep -rn "transport" packages/server/src/repositories/agentConfig.ts
packages/server/src/routers/agentConfig.ts` vazio; teste: config aposentada não aparece em
`agentConfig.list`.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `refactor(server): agent config no longer has a transport`

#### T5: Agente só nasce ACP

**What**: `SessionStore.start`: `kind === "agent"` ⇒ sempre ACP; o *fall-through* para
`ptyManager.spawn` com agente vira erro interno. `StartSessionInput.transport` e
`CreateSessionInput.transport` param de aceitar `pty` para agente. `adapter-command.ts` perde o ramo
`config.transport !== "acp"` e o campo em `AdapterConfigRef`. `session.createAgent` recusa config
aposentada com `BLOCKED` e a frase da §3.5.
**Where**: `packages/server/src/sessions/SessionStore.ts`, `repositories/session.ts`,
`setup/adapter-command.ts`, `routers/session.ts`
**Done when**: RED→GREEN: `createAgent` com config aposentada ⇒ `CONFLICT` com a frase;
`session.resume` de sessão `pty` continua recusado (teste existente); shell e script continuam PTY
(testes existentes verdes).
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): agent sessions are always ACP`

#### T6: `auto-learn` resolve o adaptador pela spec

**What**: `memory/auto-learn.ts:185-188` escolhe a primeira config **não aposentada** e sobe com
`adapterCommandForConfig`, não `config.command` cru.
**Where**: `packages/server/src/memory/auto-learn.ts` + teste
**Done when**: teste prova que o comando usado é o caminho gerenciado.
**Gate**: `pnpm gate:quick`
**Commit**: `fix(server): auto-learn spawns the managed adapter copy`

---

## Fase 2 — Servidor: o catálogo de adaptador

#### T7: `AdapterCatalog` com persistência

**What**: §3.1. Tipos em `packages/shared/src/adapter-catalog.ts` (exportados no `index.ts`).
Módulo `packages/server/src/acp/adapter-catalog.ts`: `load()`, `recordOptions(adapterId,
configOptions, { authRequired })`, `recordCommands(adapterId, projectId, commands)`,
`view(projectId?)`, `onChange(listener)`. Grava com `writeAtomically(…, 0o600)` em
`<stateDir>/_system/adapter-catalog.json`; arquivo corrompido lê vazio; entrada com `adapterVersion
!== spec.pinnedVersion` é descartada; `onChange` só dispara se o conteúdo mudou.
**Where**: `packages/shared/src/adapter-catalog.ts`, `packages/server/src/acp/adapter-catalog.ts`
+ `adapter-catalog.test.ts`
**Done when**: testes RED→GREEN para: persistir e reler; corrompido ⇒ vazio sem lançar; pino
trocado invalida; `recordOptions` com mesmo conteúdo não dispara `onChange`; comandos são por
projeto.
**Gate**: `pnpm gate:quick`
**Commit**: `feat(server): persisted adapter catalog`

#### T8: As três fontes do catálogo, e o aquecimento

**What**: (1) `AcpManager.probe` devolve `configOptions` (normalizado) no `AcpProbeReport`, sem
esperar notificação e sem gravar transcrição nem notificar `configWatchers`. (2) Ramo ACP do
`SessionStore.start` grava `configOptions` do handshake no catálogo. (3) `acpManager.watchEvents`
global: evento `commands` ⇒ `recordCommands(adapterId, projectId, …)` (projeto resolvido do escopo
da sessão). (4) Boot: em segundo plano, probe dos adaptadores instalados com entrada ausente ou
vencida. (5) `catalog.changed` em `LumemEvent` (união + `LUMEM_EVENT_TYPES`), emitido no
`onChange`; `events.test.ts` continua verde.
**Where**: `acp/AcpManager.ts`, `sessions/SessionStore.ts`, `bootstrap.ts`,
`packages/shared/src/events.ts`, `packages/web/src/hooks/useLiveState.ts` (o `case` — o `tsc`
exige) + `useLiveState.test.tsx`
**Done when**: testes com `fakeAgentProcess`: probe devolve as opções do fake; sessão criada grava
catálogo; `commands` emitido grava no projeto certo; boot não espera o probe (o `bootstrap` resolve
antes do probe acabar).
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): feed the adapter catalog from probe, sessions and commands`

#### T9: `adapterCatalog.list`

**What**: Roteador `adapterCatalog` com `list({ projectId? })` → `AdapterCatalogView[]` na ordem de
`ADAPTERS`, com `installed` (`adapterCommandFor` não lança) e `authRequired` (`null` se nunca
sondado). Catálogo no `Context`: `server.ts`, `bootstrap.ts` (servidor **e** caller interno),
`testing/caller.ts`. Registrar em `routers/index.ts`.
**Where**: `packages/server/src/routers/adapterCatalog.ts`, `routers/index.ts`, `trpc.ts`,
`server.ts`, `bootstrap.ts`, `testing/caller.ts`
**Done when**: teste de roteador: adaptador não instalado ⇒ `installed: false`; `projectId` filtra
os comandos.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): expose the adapter catalog`

---

## Fase 3 — Servidor: criar com config, retomar, e criar worktree com prompt

#### T10: `createAgent` com `adapterId` e `config`

**What**: §3.2. Input com `adapterId?` e `config?`, exatamente um entre `agentConfigId` e
`adapterId`. Aplica `mode` primeiro, depois o resto, antes de devolver. `NOT_FOUND` ⇒ fecha a sessão
e lança `INVALID_ARGUMENT` com a frase. Extrair a lógica para uma função interna reutilizável
(`startAgentSession(ctx, …)`) — a T12 a chama.
**Where**: `packages/server/src/routers/session.ts` (+ onde a função interna morar), testes
**Done when**: RED→GREEN com o fake: sessão nasce com o modelo pedido (linha `session.model` e
`configOptions` batem); modelo inexistente ⇒ erro com frase e **nenhuma** sessão viva sobrando;
`agentConfigId` e `adapterId` juntos ⇒ `BAD_REQUEST`.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): create an agent session with adapter and model`

#### T11: Retomar reaplica o modelo

**What**: §3.6. `SessionStore.resume` reaplica `row.model`. Variante nova `model_unavailable` em
`AcpEvent` (`packages/shared/src/acp-protocol.ts`), emitida quando o `setConfig` falha. Web:
`conversation-model.ts` e o `Transcript` desenham a linha; o mock compartilhado de eventos ganha a
variante.
**Where**: `sessions/SessionStore.ts`, `packages/shared/src/acp-protocol.ts`,
`packages/web/src/features/conversation/conversation-model.ts`, `Transcript.tsx`, mocks de teste
**Done when**: RED→GREEN: fake com `loadSession` que volta ao modelo padrão ⇒ depois do `resume` a
linha nova tem o modelo antigo; fake sem o modelo ⇒ evento `model_unavailable` na transcrição e a
retomada **não** falha.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): resume reapplies the stored model`

#### T12: `worktree.start` e o prompt pendente

**What**: §3.3. `createWorktreeCore(ctx, input, { startSetup })` extraído do `worktree.create`
(comportamento do `create` intacto). `worktree.start({ projectId, name?, from?, prompt, adapterId,
config? })`: cria worktree sem setup → sessão (T10) → `pending_prompt` → devolve `{ worktreeId,
sessionId }`; em segundo plano: sem `setup` ⇒ prompt; senão `runToCompletion(…, { timeoutMs:
SETUP_TIMEOUT_MS })` ⇒ `0` manda e zera, senão `pending_reason = 'setup_failed'`. Falha ao criar a
sessão ⇒ remove a worktree. `worktreeNameFromPrompt` em `packages/shared` + sufixo de colisão no
daemon. `session.sendPending({ id })` e `session.discardPending({ id })`. `SessionView` passa a
carregar `pendingPrompt` e `pendingReason`. Exportar `SETUP_TIMEOUT_MS` de `conveyor-ports.ts`.
**Where**: `routers/worktree.ts`, `routers/session.ts`, `repositories/session.ts`,
`packages/shared/src/worktree-name.ts` (+ teste), testes de roteador
**Done when**: RED→GREEN com `ScriptRunner` falso: sem setup ⇒ prompt enviado e pendência zerada;
setup `0` ⇒ prompt só depois do exit; setup `1` ⇒ `pending_reason = 'setup_failed'` e **nenhum**
prompt; `sendPending` manda; `discardPending` zera; o `setup` roda **uma** vez;
`worktreeNameFromPrompt("Corrigir o bug do login no Safari!")` ⇒ `corrigir-o-bug-do-login-no`
(ou o que a regra da §3.3 der — fixe no teste); colisão ⇒ `-2`.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(server): start a worktree with an agent and a first prompt`

---

## Fase 4 — O desenho (Storybook, antes do produto)

> Regra do ADR 2026-09-20: layout novo **desenha antes**. Aqui "desenhar" é escrever os componentes
> presentacionais e olhá-los no Storybook, com os estados caros. A Fase 5 só liga dados.

#### T13: `Modal` largo

**What**: §3.7. Token `--size-dialog-wide` em `tokens.css` (proposta: `720px`, medir no navegador
contra a referência — o compositor precisa de ~12 linhas de texto de largura confortável), `pnpm
--filter @lumem/web design:derive`, `.modal__card--wide`, prop `size`, prop `header` opcional.
**Where**: `packages/web/src/styles/tokens.css`, `tokens.ts` (derivado), `ui/Modal.tsx`,
`ui/modal.css`, `ui/modal-css.test.ts`, `ui/Primitives.stories.tsx`
**Done when**: story do modal largo renderiza; `modal-css.test.ts` e `tokens.test.ts` verdes.
**Gate**: `pnpm gate:quick`
**Commit**: `feat(web): wide modal variant`

#### T14: Stories das três telas

**What**: Componentes presentacionais (dados por props) e stories: `AgentModelPill` (Claude + Codex;
Codex sem login; vinte modelos; com e sem *effort*), `DraftTab` vazio (com e sem comandos; *"abrindo
claude…"*; erro), `NewWorktreeComposer` (vazio; origem = issue; branch já em checkout) e a linha de
**prompt pendente** na conversa (*"preparando worktree… (setup)"*; setup falhou com `mandar assim
mesmo` / `editar`). Adicionar ao `.storybook/preview.tsx` os CSS que faltam
(`create-worktree.css`, `new-session.css`). Seeds via `seededQueryClient` quando precisar.
**Where**: `features/conversation/`, `features/workspace/`, `.storybook/preview.tsx`
**Done when**: `pnpm storybook` mostra todos os estados; `storybook build` passa; **mostrar ao
Vinicius antes da Fase 5** (screenshot em `.context/`) — o ciclo de desenho pede olho humano.
**Gate**: `pnpm --filter @lumem/web build-storybook` + conferido no navegador
**Commit**: `feat(web): stories for the composer modal, draft tab and model pill`

---

## Fase 5 — O produto

#### T15: `ComposerBox` extraído

**What**: §3.7. Extrair do `Composer.tsx` a caixa (textarea, teclas, `SlashMenu`, faixa com slot).
O `Composer` da sessão passa a usá-la. **Zero mudança de comportamento.**
**Where**: `features/conversation/ComposerBox.tsx`, `Composer.tsx`, `conversation.css` (sem classe
nova), testes existentes
**Done when**: `conversation.test.tsx` e os testes de composer verdes sem edição de asserção.
**Gate**: `pnpm gate:quick`
**Commit**: `refactor(web): extract the composer box`

#### T16: Catálogo na web e a pílula de verdade

**What**: `adapterCatalogKey(projectId)` em `lib/queryKeys.ts`; `useAdapterCatalog(projectId)` em
`features/agent/queries.ts`; `useLiveState` invalida no `catalog.changed`. `AgentModelPill` ligado:
valor inicial `DEFAULT_ADAPTER_ID` + `currentValue` (Q8); devolve `{ adapterId, config }`.
**Where**: `lib/queryKeys.ts`, `features/agent/queries.ts`, `hooks/useLiveState.ts`,
`features/conversation/AgentModelPill.tsx`
**Done when**: teste de componente com o hook mockado: escolher `gpt-5.5` no grupo Codex devolve
`{ adapterId: "codex", config: { model: "gpt-5.5" } }`; grupo sem login desabilitado com motivo.
**Gate**: `pnpm gate:quick`
**Commit**: `feat(web): adapter catalog and grouped model pill`

#### T17: O agente-PTY sai da web, e o legado vira histórico

**What**: `AgentConfigDialog` perde o `<select>` de transporte; tipos de `features/agent/queries.ts`
sem `transport` na config; `NewSessionMenu` vira `＋ novo agente` + `terminal`; `SessionTab`: agente
`pty` ⇒ registro sem ação; `ScopePanel`: sessão `agent`+`pty` sem botão; `RecordNotice` com `nova
sessão igual` só para shell. `useLiveState`: `session.changed` também invalida o `scriptsKey` do
escopo (defeito 4 da §6).
**Where**: `features/agent/AgentConfigDialog.tsx`, `features/agent/queries.ts`,
`features/conversation/NewSessionMenu.tsx`, `SessionTab.tsx`, `features/checkout/ScopePanel.tsx`,
`hooks/useLiveState.ts`, `session-ui.test.tsx`, `checkout-tab.test.tsx`,
`session-tab-transport.test.tsx`
**Done when**: teste: sessão legada `agent`/`pty` listada com nome e estado e **sem** botão; menu
novo tem exatamente dois itens.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(web): agents are always conversations; legacy PTY agents are history`

#### T18: A aba rascunho

**What**: §3.4. `useWorktreeTabs` com `drafts` (`draft:<uuid>`), o efeito de `activeId` aceitando
rascunho; `＋ novo agente` cria e seleciona; `DraftTab` ligado (`useSessionMutations` ganha
`createAgent({ adapterId, config })`); primeiro envio ⇒ `createAgent` ⇒ `arrive({ send: true })` ⇒
troca rascunho pela sessão, selecionando depois da invalidação.
**Where**: `features/checkout/useWorktreeTabs.ts`, `ScopePanel.tsx`,
`features/checkout/useSessionsByScope.ts`, `features/conversation/DraftTab.tsx`,
`features/conversation/index.ts`
**Done when**: teste: rascunho nasce ativo; enviar chama `createAgent` com adapter+model e depois
`arrive` com `send: true`; erro mantém o texto; fechar o rascunho não chama nada no daemon.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(web): new agent opens a draft tab; the session starts on first send`

#### T19: `OriginPicker` extraído

**What**: Extrair do `CreateWorktreeDialog` o trilho de origem, as três listas, `useOriginChoice`,
`branchNameForIssue`, `fromOf`. O diálogo antigo passa a usá-los e **encolhe** — baixe o teto dele
em `architecture.test.ts` para o número novo.
**Where**: `features/workspace/OriginPicker.tsx`, `useOriginChoice.ts`, `CreateWorktreeDialog.tsx`,
`architecture.test.ts`, `CreateWorktreeDialog.test.tsx`
**Done when**: testes do diálogo verdes sem edição de asserção.
**Gate**: `pnpm gate:quick`
**Commit**: `refactor(web): extract the worktree origin picker`

#### T20: O compositor de nova worktree

**What**: §3.7. `NewWorktreeComposer` substitui o `CreateWorktreeDialog` no `WorkspaceShell`
(mesmo `+` da linha do projeto; o seletor de projeto começa nele). `useWorktreeMutations` ganha
`start`. `Create ↵`: `worktree.start` ⇒ `selectScope` na worktree ⇒ `arrive({ sessionId, send:
false })` só para trazer a aba para a frente (o prompt é mandado pelo daemon). Branch já em checkout
⇒ abre a existente com aba rascunho preenchida (§3.3). Rascunho por projeto em memória de módulo,
com `reset…ForTests()` no `afterEach` global (a armadilha do `navigation.ts`). Remover o
`CreateWorktreeDialog` e o teto dele do `architecture.test.ts` se nada mais o usar.
**Where**: `features/workspace/NewWorktreeComposer.tsx`, `composer-drafts.ts`,
`features/workspace/useWorktrees.ts`, `WorkspaceShell.tsx`, `features/workspace/index.ts`,
`create-worktree.css`, `ui/modal-css.test.ts` (lista de diálogos), setup de testes
**Done when**: teste: `Create` chama `worktree.start` com prompt, adapter e model; fechar e reabrir
o modal traz o texto; outro projeto tem outro rascunho.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(web): creating a worktree is composing the first prompt`

#### T21: O prompt pendente na conversa

**What**: Na `Conversation`, quando a sessão tem `pendingPrompt`: sem `pendingReason` e setup
rodando (`useScripts`) ⇒ linha *"preparando worktree… (setup)"* com o texto do prompt esmaecido e o
compositor travado; `pendingReason = 'setup_failed'` ⇒ erro do setup (atalho para a aba Setup do
rodapé) + `mandar assim mesmo` (`session.sendPending`) + `editar` (`session.discardPending` e o texto
vai para o compositor). Sessão morta com pendência ⇒ o texto para copiar.
**Where**: `features/conversation/Conversation.tsx` (ou componente irmão — teto 400),
`useConversationSession.ts` / queries, `conversation.css`
**Done when**: testes dos três estados.
**Gate**: `pnpm gate:quick` + `pnpm gate:build`
**Commit**: `feat(web): show the pending first prompt while setup runs`

---

## Fase 6 — e2e e fechamento

#### T22: Fake e helpers

**What**: `e2e/support/fake-acp-agent.mjs`: opção de *effort* no `session/new` (categoria
`thought_level`) atrás de `LUMEM_FAKE_EFFORT=1`; `available_commands_update` logo depois do
`session/new` atrás de `LUMEM_FAKE_COMMANDS_ON_NEW=1`. Helpers: `createWorktree` (usa o compositor:
prompt + `Create`), um `openNewAgent` (rascunho), `createAgentConfig` sem `transport`. Consertar as
specs que clicam `nova sessão` / `nova worktree em` / usam o helper (a lista está no §7 do mapa de
código da discovery; refaça-a com `grep -rn "nova sessão\|nova worktree em" e2e/`).
**Where**: `e2e/support/*`, `e2e/*.spec.ts`
**Done when**: `pnpm gate:full` verde.
**Gate**: `pnpm gate:full`
**Commit**: `test(e2e): drive worktrees and agents through the composer`

#### T23: e2e da feature

**What**: `e2e/acp-only-agents.spec.ts`: (1) modal ⇒ projeto com `setup` que dorme 2 s ⇒ a conversa
mostra *preparando* ⇒ o turno do fake responde no modelo escolhido (sonnet, não o padrão); (2)
`setup` que sai com 1 ⇒ *mandar assim mesmo* ⇒ responde; (3) rascunho ⇒ primeiro envio ⇒ responde;
trocar de ACP no rascunho não sobe processo (conte sessões no daemon); (4) sessão `pty` legada
(inserida por SQL no state dir do e2e) aparece no histórico sem botão; (5) menu da pílula:
`document.elementFromPoint` na opção do topo (lição da `023` — `toBeVisible` não pega recorte).
**Where**: `e2e/acp-only-agents.spec.ts`
**Done when**: verde três vezes seguidas localmente.
**Gate**: `pnpm gate:full`
**Commit**: `test(e2e): composer modal, draft tab and legacy PTY history`

#### T24: Notas, índice e projeção

**What**: Aplicar as notas abaixo: as notas da regra 6 em cada requisito contradito,
`docs/README.md:5`, o §Estado atual do `CLAUDE.md`, e as entradas de backlog. PRD e `tasks.md` para
`**Status:** completa`.
**Where**: os arquivos listados nas três tabelas abaixo
**Done when**: `pnpm docs:check` e `pnpm gate:full` verdes.

Regra 6 da [`025`](../025-docs-contract/prd.md): *a nota no requisito contradito fica — no
requisito, com âncora para quem contradiz, e delimitando o que sobrou de pé.* Nada é apagado; a nota
vai **logo abaixo** do requisito, no formato que o documento já usa para notas (procure `> **Nota`
no próprio arquivo e copie o estilo). As linhas foram levantadas em 2026-09-24 — confira antes.
Âncora a usar em todas: o ADR de 2026-09-24 (`docs/adr/2026-09-24-1620-agent-is-always-acp.md`,
com o caminho relativo ao arquivo anotado) e, quando a nota for sobre tela, esta PRD `033`.

**1. Requisitos contraditos**

`docs/features/001-walking-skeleton/prd.md` — a `001` não tem nenhuma nota da ACP ainda (dívida de
antes). Uma nota por requisito:

| Onde | Nota |
|---|---|
| não-objetivo *"Protocolo estruturado com o agente — PTY e só"* (`:35`) | Superado duas vezes: pelo ADR de 2026-08-17 (a sessão de agente é ACP) e pelo de 2026-09-24 (agente é **só** ACP). O que sobra de pé: o shell continua PTY. |
| não-objetivo *"Prompt inicial junto com a criação"* (`:38`) | Revertido pela `033` F4: criar worktree **é** compor o primeiro prompt. O que sobra: criar worktree sem prompt não existe mais pela tela. |
| **F4.1** *"Criar worktree… informando um nome"* (`:98`) | O nome passa a ser derivado do prompt e editável (`033` F4.2). Continua de pé: o nome é da worktree e segue o `nameSchema`. |
| **F5.2** / **F5.3** / **F5.5** (`:112-115`) | Agente não roda mais em terminal (ADR de 2026-09-24). F5.3 (teclado, cor, resize) continua valendo para o **shell**. |
| **F6.1**, **F6.3**, **F6.4**, **F6.5** (`:124-128`) | A config de fábrica `claude` em PTY já tinha saído na `021` C6; agora nenhuma config é PTY. |
| §5 *"Subir um agente numa worktree"* (`:152-160`) e §7 *"Agente é PTY, não protocolo"* (`:243`) | O fluxo atual é o da `033` §6. |

`docs/features/006-acp-sessions/`:

| Onde | Nota |
|---|---|
| `prd.md:27-28` — *"agente em PTY continua possível"* | Superado pelo ADR de 2026-09-24. De pé: o PTY continua para o terminal integrado. |
| `prd.md` **F1.2** (`:135`) — `transport ∈ pty \| acp` | Em `session`, a coluna fica como **histórico** (sessões antigas); em `agent_config`, saiu (`033` F1.1). Sessão de agente nova é sempre `acp`. |
| `prd.md` **F5.6** (`:181`) — a migração escreve `'pty'` | Continua verdade para a `0001`; a `0033` aposenta essas configs. |
| `prd.md` não-objetivo *"Arrancar o PTY"* (`:199`) | Continua não-objetivo para o terminal; para agente, feito pelo ADR de 2026-09-24. |
| `open-questions.md` **A1** (`:38-44`) — *"a mesma aba, dois renderizadores, escolhidos por `transport`"* | Agente tem um renderizador só (a conversa). O ramo de terminal fica para shell e para a sessão legada, que é histórico sem ação (`033` F1.4). |
| `open-questions.md` **A8** (`:189-199`) — o modelo padrão é da config e a sessão troca | O modelo agora é escolhido **antes** da sessão (`033` F3) e aplicado antes do primeiro turno; o padrão é o do ACP (`033` Q8). |
| `open-questions.md` **A11** (`:252-262`) | Mesma nota da A1. |
| `tasks.md` **C9** (`:443`) e **R1/D17** (`:950`) | O formulário não cria mais PTY (`033` F1.1). |

`docs/features/009-agent-login/prd.md`:

| Onde | Nota |
|---|---|
| §1 (`:14-17`) — transporte como um dos cinco campos | O transporte saiu (`033` F1.1). |
| **F5.2** (`:144`) — o formulário *"outro agente ACP…"* com transporte | Continua sem transporte; e o ADR de 2026-09-08 já o limitava ao catálogo. |
| **F4.3** (`:133-135`) | **Não contradito** — o terminal de login continua PTY. Não anotar. |

`docs/features/021-second-agent/`:

| Onde | Nota |
|---|---|
| `prd.md:29` e `:41` — *"rodar Codex como `agent_config` de transporte `pty` — é o caminho alternativo"* | O caminho alternativo acabou (ADR de 2026-09-24). |
| `open-questions.md` **C6** (`:146-149`) — *"o `AgentConfigDialog` continua criando `pty` para quem quiser"* | Não cria mais. |
| `tasks.md` **T9** (`:213`) — *"o caminho alternativo não morre"* | Morreu, por decisão: ADR de 2026-09-24. |

`docs/features/026-worktree-from/prd.md`:

| Onde | Nota |
|---|---|
| **F3.1** (`:175`) — origem acima do nome | A origem virou um seletor no cabeçalho do compositor (`033` F4.1). De pé: as quatro origens e as regras de cada uma. |
| **F3.2** (`:178`) — a origem preenche um nome editável | De pé; o campo mora no `…` e o nome padrão vem do prompt quando a origem é `default`. |
| **F3.5** (`:192`) — *"o campo de nome está utilizável no primeiro quadro"* | O primeiro quadro é o prompt (`033` F4.1); o nome está a um clique, no `…`. |

`docs/features/017-sidebar-actions/prd.md`:

| Onde | Nota |
|---|---|
| **F1.3** (`:89`) — o `+` abre o `CreateWorktreeDialog` | Abre o compositor da `033` (F4.1). De pé: o `+` mora na linha do projeto, e o modal é centrado com véu e foco preso. |

`docs/features/008-onboarding/open-questions.md`:

| Onde | Nota |
|---|---|
| **O14** (`:254-270`) — *"padrão de modelo… fora da v1; a conversa escolhe por sessão"* | Continua fora (`033` Q8): a pílula nasce no padrão do ACP. O que mudou: a escolha acontece **antes** da sessão, não depois. |

`docs/features/016-session-mode/prd.md`:

| Onde | Nota |
|---|---|
| **F1.1** (`:104`) — *"o composer mostra sempre uma pílula de modo, em toda conversa viva"* | **Compatível.** A aba rascunho da `033` não é conversa viva; ela mostra o modo pelo catálogo (modo do agente) ou pela política do Lumem. O requisito continua valendo para sessão aberta. |

**2. Fora de `docs/features/`**

| Arquivo | O quê |
|---|---|
| `docs/README.md:5` | *"O PTY continua existindo — para shell, e como caminho alternativo por `agent_config`."* ⇒ *"O PTY continua existindo para o terminal integrado — shell, scripts e login. Agente é sempre ACP (ADR de 2026-09-24)."*, com o link para `adr/2026-09-24-1620-agent-is-always-acp.md`. A tabela de ADRs já ganhou a linha nova e o de 2026-08-17 riscado na T1. |
| `docs/project/questions.md` Q030 (`:269`) e Q031 (`:281`) | Nota abaixo da resposta: *"Superado pelo ADR de 2026-09-24 — agente é só ACP."* |
| `docs/project/pty-vs-acp.md` §9.3 (`:482-489`) | Nota no topo da seção: *"A regra desta seção foi superada pelo ADR de 2026-09-24; o estudo continua sendo o registro do que se pesou."* (estudo não afirma decisão, mas a frase é a que o ADR supera — a nota evita que ela volte sozinha) |
| `docs/features/007-workspace-memory/prd.md:511` e `open-questions.md:515` | *"voltar uma sessão para PTY é config, não refactor"* ⇒ nota: não é mais config (ADR de 2026-09-24; é o Ruim dele). |
| `docs/references/hermes.md:24` | Ler; se afirma o caminho alternativo como decisão do Lumem, mesma nota. |
| `CLAUDE.md`, §Estado atual | Trocar *"O PTY fica para shell e como caminho alternativo."* por *"O PTY fica para o terminal integrado; agente é sempre ACP desde a `033`."*, com o link para `docs/features/033-acp-only-agents/prd.md`, e acrescentar um parágrafo curto da `033` no fim da seção, no estilo dos outros (o que mudou, o que se mediu, o que custou). |

**3. Backlog — entradas novas (`docs/project/backlog.md`)**

Formato do arquivo: título `### … — \`P|M|G\``, uma frase de contexto, `**De onde veio:** … ·
**Volta quando:** …`.

1. **§C — `### A esteira roda o setup duas vezes numa worktree nova — \`P\``** — `worktree.create`
   dispara em segundo plano e o `prepareCheckout` chama `runToCompletion`, cujo `start` fecha o
   primeiro (regra A4); e o código de saída é descartado (`tasks/conveyor-ports.ts:297-305`). A `033`
   resolveu isso para o compositor com `createWorktreeCore({ startSetup: false })`. **Volta quando:**
   um `setup` com efeito colateral (migração, seed) rodar pela metade numa passada.
2. **§C — `### Sessão da esteira retomada vira \`human\` para o orçamento — \`P\``** —
   `SessionStore.resume` não repassa `driver`. **Volta quando:** uma retomada da esteira passar do
   teto avisando em vez de parar.
3. **§B — `### A esteira abre sessão pelo caminho novo — \`P\``** — `bootstrap.openAgentSession`
   ainda chama `setConfig` depois do `createAgent`, tolerante a erro; a `033` deu ao `createAgent` o
   `config` que faz isso antes de devolver. Unificar exige decidir o que a esteira faz quando o
   modelo do agente nomeado sumiu. **Volta quando:** um modelo de agente nomeado sair do adaptador.
4. **§B — `### Retomar reaplica o effort — \`P\``** — a `033` reaplica só `model` porque `session` não
   grava *effort*. **Volta quando:** a M1 disser que o Claude expõe *effort* e alguém notar a
   retomada voltando ao padrão.
5. **§B — remover** *"Hooks por CLI — \`P\`, provavelmente morto"* (ou riscá-lo, no padrão dos itens
   resolvidos: `### ~~Hooks por CLI~~ — morto em 2026-09-24`), com a frase: o único gatilho era
   sobrar agente em PTY, e o ADR de 2026-09-24 acabou com ele.

As duas entradas **importantes** — anexo no prompt e sugestões de contexto — **já estão** no backlog
§B desde a discovery. Troque o *"vira a PRD `033`"* delas pelo link da PRD.
**Gate**: `pnpm docs:check` + `pnpm gate:full`
**Commit**: `docs(033): notes on contradicted requirements and the status projection`
