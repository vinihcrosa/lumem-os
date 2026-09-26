# Mais de uma conta por agente — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) ·
**Decisão:** [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)

**Status:** em execução
**Histórico:** escrito em **2026-09-26**, depois da fase 0, e **reescrito no mesmo dia** depois do
rebase no `main`. Quatro coisas tinham mudado por baixo:
- a feature colidiu com a `030-settings` e virou `034`;
- o desenho saiu do Open Design ([ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md));
- o login de agentes tem casa marcada em `/settings`, e não no rodapé (Q6 da `030-settings`);
- agente passou a ser sempre ACP ([ADR de 2026-09-24](../../adr/2026-09-24-1620-agent-is-always-acp.md)),
  e o rascunho escolhe agente por `adapterId`, não por linha de `agent_config`.

A ordem tem uma regra: **o que isola vem antes do que mostra.** Primeiro a conta existe no banco e
chega ao processo certo, em todo caminho que spawna um adaptador. Só depois ela aparece na tela.

---

## Antes de começar

**O que muda:**

| Onde (a partir de `packages/`) | O quê |
|---|---|
| `shared/src/adapters.ts` | a `AdapterSpec` aprende conta |
| `server/src/db/schema.ts`, `server/drizzle/` | nasce `agent_account`. `session` e `session_usage` apontam para ela |
| `server/src/acp/AcpManager.ts` (`probe`) | o login deixa de ser derivado do `session/new` |
| `server/src/routers/setup.ts`, `setup/login.ts`, `setup/agent-auth.ts` | probe, login e `authenticate` recebem o env da conta. **Hoje nenhum dos três passa env** |
| `server/src/sessions/start-agent-session.ts`, `sessions/SessionStore.ts` | o spawn e o `resume` resolvem o env pela conta. Hoje os dois leem `agent_config.env` |
| `server/src/memory/capture.ts` | **ainda spawna por fora do resolver**, com `config.command` cru |
| `server/src/acp/adapter-catalog.ts` | o catálogo que a pílula lê passa de *por adaptador* para *por conta* |
| `server/src/agents/catalog.ts`, `tasks/conveyor-ports.ts`, `repositories/agentConfig.ts`, `bootstrap.ts` | a esteira escolhe conta |
| `server/src/usage/query.ts`, `routers/usage.ts` | o consumo abre por conta |
| `web/src/features/settings/SettingsPanel.tsx` | a seção Agentes deixa de ser só leitura e passa a ter as contas |
| `web/src/features/conversation/AgentModelPill.tsx`, `DraftTab.tsx` | a pílula escolhe conta |
| `web/src/features/conversation/Conversation.tsx` | cabeçalho com conta, e o gesto de continuar |
| `web/src/features/workspace/SpendList.tsx`, `WorkspacePanel.tsx` | consumo por conta |
| `e2e/support/fake-acp-agent.mjs` | aprende a variável de conta e o `--cli auth status` |

**O que não muda**, cada item com o motivo:

| Não muda | Por quê |
|---|---|
| o mecanismo | o [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md): variável do CLI, e nada de reescrever `HOME` |
| a primeira conta | sobe **sem** a variável. Ninguém reloga ([PRD §5](prd.md)) |
| o PATH | continua sem decidir nada: o [ADR de 2026-09-08](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md) |
| os tetos do workspace | [Q4](open-questions.md): nenhum limite por conta |
| a conta de uma conversa aberta | [Q3](open-questions.md): *continuar em outra conta* abre outra sessão |
| o rodapé da sidebar | quem o remove é a LUM-57. Aqui ele só passa a falar da conta padrão |
| o login por assinatura | é do CLI. O Lumem é dono do diretório e não lê o conteúdo |

---

## Fase 0 — medir e decidir · **entregue**

#### T1: A medição do mecanismo

**What**: os dois adaptadores do pino, com `env -i` e a variável de conta. Medir o Keychain, o
`session/new`, o turno sem credencial, a escrita no `CODEX_HOME` e a conferência de identidade.
**Where**: bancada descartável em `/tmp`
**Done when**: o [estudo](../../project/agent-accounts-measurements.md) responde as quatro perguntas
do §4 da PRD.
**Gate**: nenhum, não toca código
**Status**: ✅ entregue

#### T2: ADR, PRD, perguntas e tasks

**What**: o ADR, as notas, a Q10, a renumeração para `034` e as decisões que o desenho ia tomar —
limiar do corte, linhas de vínculo, a conta padrão desconectada, o e-mail e a frase dos termos de uso,
cada uma na pergunta de origem.
**Where**: `docs/`
**Done when**: `pnpm docs:check` diz `docs ok`.
**Gate**: `pnpm docs:check`
**Status**: ✅ entregue

---

## Fase 1 — a conta existe e chega ao processo certo (server, sem tela)

#### T3: A `AdapterSpec` aprende conta

**What**: três campos novos na spec.
- `accountEnv`: `CLAUDE_CONFIG_DIR` ou `CODEX_HOME`. Com `null`, o adaptador tem só uma conta.
- `inheritLinks`: os itens de comportamento da [Q10](open-questions.md), relativos ao diretório
  padrão do CLI (`~/.claude`, `~/.codex`).
- `identity`: `cli-auth-status` para o Claude, `auth-status-notification` para o Codex.

**Where**: `shared/src/adapters.ts`, `adapters.test.ts`
**Done when**: os dois adaptadores declaram os três campos. Um teste diz que `accountEnv` nunca é
`HOME` nem `XDG_*`.
**Gate**: `pnpm gate:quick`

#### T4: `agent_account`, e a migração que não pede relogin

**What**: a tabela nova.
- **Colunas**: `id`, `agent_config_id` (FK, `restrict`), `label` (única por agente), `kind`
  (`subscription | api_key`), `config_dir` (**nulo = a conta que sobe sem a variável**), `identity`
  (JSON, o que a última conferência leu), `default_model`, `default_effort`, `state`
  (`connected | disconnected`), timestamps.
- **Conta padrão**: `agent_config.default_account_id`.
- **Sessão**: `session.agent_account_id`, com a CHECK de `kind='agent'` estendida.
- **Consumo**: `session_usage.agent_account_id` (nulo, sem FK, resolvido na escrita como o
  `agent_config_id` já é).
- **Migração**: uma conta por `agent_config` não aposentado, com `config_dir` nulo e rótulo igual ao
  nome do agente, marcada como padrão. Toda sessão e todo consumo antigos são amarrados a ela.

**Where**: `server/src/db/schema.ts`, `server/drizzle/0035_*.sql`, um repositório
`server/src/repositories/agentAccount.ts`
**Done when**: um banco com sessões de antes migra, e toda sessão `agent` tem conta. Duas armadilhas
conferidas **à mão no SQL gerado**, porque o `drizzle-kit` já errou as duas neste repositório: a ação
do estrangeiro (a `022`), e `SELECT` lendo coluna que ainda não existe (a Parte 3 da `028`).
**Gate**: `pnpm gate:quick`

#### T5: Um resolvedor de invocação por conta, e todo spawn passando por ele

**What**: `adapterInvocationFor(account, …)` → `{ command, args, env }`.
- **Conta de assinatura**: `env = { [spec.accountEnv]: config_dir }`, ou nada quando `config_dir` é
  nulo.
- **Conta de chave**: o valor sai do cofre para o primeiro nome do `apiKeyEnv`, que hoje nunca é
  injetado.

Os caminhos que passam a chamar o resolvedor, todos:
- `startAgentSession`, que recebe a conta;
- `SessionStore.resume`, que usa a conta **da sessão**, e não a padrão;
- `memory/capture.ts` (hoje por fora do resolver) e `memory/auto-learn.ts`, os dois na conta padrão.

**Where**: `server/src/setup/adapter-command.ts`, `sessions/start-agent-session.ts`,
`sessions/SessionStore.ts`, `memory/capture.ts`, `memory/auto-learn.ts`, `bootstrap.ts`
**Done when**:
- um teste por caminho prova que o env da conta chega ao spawner;
- o `resume` de uma sessão antiga sobe **sem** a variável;
- o `resume` de uma sessão da conta 2 sobe com o diretório da conta 2, mesmo depois de o padrão
  mudar.

**Gate**: `pnpm gate:quick`

#### T6: Conferir por identidade, e não pelo `session/new`

**What**: o `probe` passa a devolver `{ loggedIn, identity: { email, plan } | null }`.
- **Claude**: `claude-agent-acp --cli auth status` com o env da conta.
- **Codex**: `session/new` para presença, e `_auth/status_update` para identidade.

O `authRequired` derivado só do `-32000` sai. O `probe`, o `login` e o `authenticate` do router
passam a receber conta e o env dela, e o aquecimento do boot confere cada conta.
**Where**: `server/src/acp/AcpManager.ts`, `routers/setup.ts`, `setup/login.ts`,
`setup/agent-auth.ts`, `bootstrap.ts`, `e2e/support/fake-acp-agent.mjs`
**Done when**:
- o fake reproduz o `0.75.1`: `session/new` fecha sem credencial, e `--cli auth status` diz
  `loggedIn: false`;
- com ele, o probe diz `loggedIn: false`;
- o item *"O rodapé diz `conectado` para um Claude sem login"* sai do backlog.

**Gate**: `pnpm gate:quick`

#### T7: O contrato com o pino vira teste

**What**: com um diretório temporário, contra o binário do pino: `auth status` diz `loggedIn: false`
e `projectsDirectory` dentro dele, e `codex login status` diz `Not logged in`.
**Where**: um teste do server que roda quando o adaptador está instalado no diretório do daemon, e é
pulado dizendo por quê quando não está
**Done when**: passa contra o pino. Trocar o nome da variável o deixa **vermelho**, e isso é provado
de propósito (a regra da `025` sobre gate que nasce verde).
**Gate**: `pnpm gate:quick`

#### T8: Conectar, desconectar, apagar de vez, e a conta padrão

**What**: o router `agentAccount`.
- **`list`**: contas por agente, com identidade, estado e padrões.
- **`connect({ adapterId, label, kind })`**:
  1. cria `<stateDir>/_system/agents/<agente>/<conta>/`;
  2. liga por link os `inheritLinks` que existirem;
  3. devolve a conta em `disconnected` até o login conferir.
- **`login`/`authenticate`**: são os da T6, apontados para a conta.
- **`disconnect`**: guarda o diretório. A padrão passa à conectada mais antiga
  ([nota da Q8](open-questions.md)).
- **`purge`**: exige a contagem de conversas na chamada e apaga o diretório e o segredo.
- **`setDefault`** e **`setDefaults({ model, effort })`**.

**Where**: `server/src/routers/agentAccount.ts` (novo), `repositories/agentAccount.ts`
**Done when**:
- o `resume` de uma conta desconectada falha com *"reconecte a conta"* sem spawnar nada;
- o `purge` com a contagem errada é recusado;
- a primeira conta conectada vira a padrão;
- o link da Q10 é medido contra os binários reais — plugin por link, e `config.toml` ligado sem
  arrastar `cli_auth_credentials_store`. **Se falhar, a herança vira cópia**, e a Q10 recebe a nota.

**Gate**: `pnpm gate:quick`

#### T9: O catálogo por conta, o trio padrão, e o modelo que sumiu

**What**:
- **O catálogo**: o `AdapterCatalog` (`_system/adapter-catalog.json`) passa a ser chaveado por conta.
  Cada handshake da conta atualiza a entrada dela.
- **Sessão nova**: aplica modelo e effort padrão da conta pelo `setConfig`.
- **Modelo que sumiu**: se o modelo padrão não está na lista, a sessão abre no que o adaptador
  escolheu, emite um evento que a conversa desenha como linha, e a conta fica marcada
  *indisponível*.
- **Effort**: só é aplicado se o modelo o oferece.

**Where**: `server/src/acp/adapter-catalog.ts`, `routers/adapterCatalog.ts`,
`sessions/start-agent-session.ts`, `shared/src/acp-protocol.ts`
**Done when**: um teste com um modelo guardado que o fake não lista mostra a sessão abrindo, o
evento no transcript e a conta indisponível.
**Gate**: `pnpm gate:quick` e `pnpm gate:build`. Uma variante nova de `AcpEvent` derruba o typecheck
da tela e o mock compartilhado (Parte 3 da `028`)

#### T10: A esteira escolhe conta

**What**: o `named_agent` ganha `account_id` e `effort`, os dois nulos. A cascata resolve assim:
- a conta é a do encaixe **ou a padrão do agente**;
- modelo e effort são os do encaixe **ou os padrão da conta**.

O `openAgentSession` e o `resumeSession` passam a conta adiante.
**Where**: `schema.ts`, `agents/catalog.ts` (`resolveFromBindings`, que continua pura),
`tasks/conveyor-ports.ts`, `bootstrap.ts`
**Done when**: a cascata pura tem o caso *"encaixe diz só o adaptador → herda conta, modelo e effort"*.
**Gate**: `pnpm gate:quick`

#### T11: Continuar em outra conta

**What**: `session.continueIn({ sessionId, adapterId, accountId })`.
1. Lê o transcript do Lumem da origem.
2. Corta: tudo o que foi dito e o registro de cada ferramenta; saída acima de 2 000 caracteres vira
   uma linha.
3. Abre a sessão nova na conta escolhida, com o corte como contexto do primeiro turno.
4. Grava `continued_from_id`.

A origem não é tocada, e as duas ganham a linha de vínculo ([Q3b](open-questions.md)).
**Where**: `server/src/routers/session.ts`, `server/src/acp/transcript-cut.ts` (novo, puro),
`schema.ts`
**Done when**:
- o corte tem testes com saída longa, saída curta e conversa Claude → Codex;
- a sessão nova nasce na conta pedida;
- a origem continua aceitando prompt.

**Gate**: `pnpm gate:quick`

#### T12: O consumo abre por conta

**What**: `usageByProjectAndAccount`, no molde de `usageByProjectAndAgent`, e o procedimento no
router.
**Where**: `server/src/usage/query.ts`, `usage/record.ts`, `routers/usage.ts`,
`web/src/test/trpc-mock.ts`
**Done when**: duas contas do mesmo agente somam separadas, e a soma das duas bate com a consulta por
agente.
**Gate**: `pnpm gate:quick`

---

## Fase 2 — a tela · os estados nascem como stories

Pelo [ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md), componente novo é o
caso em que se desenha antes, e desenhar é escrever a story com os dados semeados antes da fiação.

#### T13: `/settings` → Agentes, com as contas

**What**: a seção Agentes deixa de ser só leitura.
- **Por conta**: uma sub-linha com rótulo, identidade (e-mail e plano), estado, as ações `entrar`,
  `padrão` e `desconectar`, e o trio padrão (modelo e effort) com o estado *indisponível*.
- **Por agente**: um `＋ conectar conta`. O painel pede o rótulo, mostra o que vai ser ligado e o que
  fica de fora (os MCPs do usuário) e, quando o agente já tem conta, a linha dos termos de uso.
- **Conta desconectada**: `reconectar` e `apagar de vez`, com a contagem de conversas.

**Where**: `web/src/features/settings/` (um componente `AccountsSection` ao lado do
`SettingsPanel`), stories `Configurações/Contas`, `settings.css`
**Done when**: as stories cobrem uma conta, duas contas, conta sem login, conta desconectada, trio
indisponível e o painel de conectar. O teste de componente cobre as ações.
**Gate**: `pnpm gate:quick`

#### T14: A pílula escolhe conta

**What**: o `AgentModelPill` mostra a escolha de conta só quando o agente tem mais de uma, com a
padrão pré-selecionada. Trocar de conta troca modelo e effort para os padrão dela
([Q1a](open-questions.md)). O `createAgent` do rascunho e o do composer de worktree nova levam a
conta.
**Where**: `web/src/features/conversation/AgentModelPill.tsx`, `agent-model.ts`, `DraftTab.tsx`,
`features/workspace/NewWorktreeComposer.tsx`, stories da pílula
**Done when**: com uma conta, a pílula é a mesma de hoje, conferida pela story. Com duas, a story e o
teste mostram a pré-seleção e a troca.
**Gate**: `pnpm gate:quick`

#### T15: O cabeçalho diz a conta, e o gesto de continuar

**What**:
- `.conv__head` passa a mostrar `agente · conta` quando o agente tem mais de uma, com o rótulo vindo
  do servidor (`toView`).
- O gesto *continuar em outra conta* abre a conversa nova numa aba ao lado.
- As linhas de vínculo aparecem na origem e na nova.

**Where**: `web/src/features/conversation/Conversation.tsx`, `SessionTab.tsx`,
`hooks/useWorktreeTabs.ts`, `server/src/routers/session.ts` (`toView`)
**Done when**: duas conversas do mesmo agente em contas diferentes têm cabeçalhos diferentes, e a
linha de vínculo leva à outra aba.
**Gate**: `pnpm gate:quick`

#### T16: Consumo por conta, e a esteira na configuração

**What**:
- O `SpendList` abre por conta embaixo do agente, como sub-linha.
- A seção Esteira de `/settings` mostra o trio de cada encaixe e deixa trocar a conta.

**Where**: `web/src/features/workspace/SpendList.tsx`, `WorkspacePanel.tsx`, `useUsage.ts`,
`web/src/features/settings/`
**Done when**: as colunas continuam comparáveis na vertical com a sub-linha nova (a `021` achou 37px
de diferença exatamente aqui), conferido no navegador.
**Gate**: `pnpm gate:quick`

---

## Fase 3 — a prova

#### T17: O critério de sucesso, em e2e

**What**: o e2e do §1 da PRD, com o fake e sem token: duas contas do Claude, duas conversas lado a
lado.
**Where**: `e2e/`, `e2e/support/fake-acp-agent.mjs`
**Done when**: o e2e prova quatro coisas:
- cada processo sobe com o diretório da própria conta, lido pelo fake do próprio env;
- cada cabeçalho diz a conta certa;
- o consumo cai na linha certa;
- *continuar em outra conta* abre a terceira aba com o corte.

**Gate**: `pnpm gate:full`

#### T18: O teste de design

**What**: abrir o Lumem de verdade (`pnpm dev`), passar por cada tela da feature, tirar prints,
avaliar contra os tokens e as regras da casa (sub-linha e não coluna, pixel a pixel com uma conta,
contraste e distinção), e consertar o que estiver errado.
**Where**: `.context/` para os prints
**Done when**: cada tela tem print antes e depois, e cada conserto tem commit.
**Gate**: `pnpm gate:quick`

#### T19: Uma segunda conta de verdade

**What**: conectar uma segunda assinatura real, e conferir o que a fase 0 não pôde medir:
- a entrada `Claude Code-credentials-<hash>` existe no Keychain depois do login;
- a primeira conta continua logada;
- cada conta mostra o próprio e-mail.

**Where**: a máquina de quem tem as duas contas
**Done when**: o §2.3 do [estudo](../../project/agent-accounts-measurements.md) ganha a linha medida.
**Gate**: nenhum. **Precisa do Vinicius**: navegador e duas assinaturas

#### T20: Fechar a feature

**What**:
- o `Status`;
- a linha da `034` no §Estado atual do `CLAUDE.md`;
- o índice;
- o item *Múltiplas contas* do backlog, fechado.

**Where**: `docs/`, `CLAUDE.md`
**Done when**: `pnpm docs:check` e `pnpm gate:full` verdes.
**Gate**: `pnpm gate:full`
