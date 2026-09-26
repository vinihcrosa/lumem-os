# Mais de uma conta por agente — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) ·
**Decisão:** [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)

**Status:** em execução
**Histórico:** escrito em **2026-09-26**, depois da fase 0. A fase 0 está entregue. As outras
quatro fases não começaram. As 13 perguntas estão respondidas.

A ordem tem uma regra: **o que isola vem antes do que mostra.** Primeiro a conta existe no banco e
chega ao processo certo, em todo caminho que spawna um adaptador. Só depois ela aparece na tela. A
tela vem por último porque é a mais barata de refazer, e a única represada pelo Open Design.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `lumem-agent-accounts.html/.css` (Open Design) | a folha nova. Não existe |
| `packages/shared/src/adapters.ts` | a `AdapterSpec` ganha a variável de conta, os itens herdados por link e a forma de conferir identidade |
| `packages/server/src/db/schema.ts` | nasce `agent_account`. `session` e `session_usage` passam a apontar para ela |
| `packages/server/src/acp/AcpManager.ts` | `probe` deixa de derivar login do `session/new` |
| `packages/server/src/routers/setup.ts`, `setup/login.ts`, `setup/agent-auth.ts` | probe, login e `authenticate` passam a receber o env da conta. **Hoje nenhum dos três passa env** |
| `packages/server/src/routers/session.ts`, `sessions/SessionStore.ts` | `createAgent` e `resume` resolvem o env pela conta, e não pela coluna `agent_config.env` |
| `packages/server/src/memory/capture.ts`, `memory/auto-learn.ts` | spawnam **por fora do resolver** hoje, com `config.command` cru. Passam pela mesma resolução |
| `packages/server/src/agents/catalog.ts`, `tasks/conveyor-*.ts`, `bootstrap.ts` | o `named_agent` ganha conta e effort, e a cascata termina na conta padrão |
| `packages/server/src/usage/query.ts` | o consumo abre por conta |
| `packages/web/src/components/AgentLogin.tsx`, `NewSessionMenu.tsx`, `Conversation.tsx`, `SpendList.tsx` | a tela |
| `e2e/support/fake-acp-agent.mjs` | aprende a variável de conta e o `auth status` |

**O que não muda**, cada item com o motivo:

| Não muda | Por quê |
|---|---|
| o mecanismo | o [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md): variável do CLI, e nada de reescrever `HOME` |
| a primeira conta | sobe **sem** a variável. Ninguém reloga ([PRD §5](prd.md)) |
| o PATH | continua sem decidir nada: o [ADR de 2026-09-08](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md) |
| os tetos do workspace | [Q4](open-questions.md): nenhum limite por conta |
| a conta de uma conversa aberta | [Q3](open-questions.md): *continuar em outra conta* abre outra sessão |
| o login por assinatura | é do CLI. O Lumem é dono do diretório e não lê o conteúdo |

---

## Fase 0 — medir e decidir · **entregue**

#### T1: A medição do mecanismo

**What**: os dois adaptadores do pino, com `env -i` e a variável de conta. Medir o Keychain, o
`session/new`, o turno sem credencial, a escrita no `CODEX_HOME` e a conferência de identidade.
**Where**: bancada descartável em `/tmp`, nenhum arquivo do produto
**Done when**: o [estudo](../../project/agent-accounts-measurements.md) responde as quatro perguntas
do §4 da PRD.
**Gate**: nenhum, não toca código
**Status**: ✅ entregue. Respondeu a Q6, respondeu a Q7 com um ADR e abriu a Q10. Achou o defeito
do `conectado` falso ([backlog](../../project/backlog.md))

#### T2: ADR, PRD, perguntas e tasks

**What**: o ADR, as notas na PRD e nas perguntas, a Q10 respondida, o índice, o backlog e este
arquivo.
**Where**: `docs/adr/`, `docs/features/030-agent-accounts/*`, `docs/project/*`, `docs/README.md`
**Done when**: `pnpm docs:check` diz `docs ok`.
**Gate**: `pnpm docs:check`
**Status**: ✅ entregue

---

## Fase 1 — o desenho (Open Design) · paralela às fases 2 e 3

#### T3: A folha `lumem-agent-accounts`

**What**: uma folha com os quadros da tela, desenhada no Open Design, trazida por `design:sync`.
**Quadros**:
- rodapé com uma sub-linha por conta;
- conectar conta: nome digitado, e a linha do que foi ligado por link, com os MCPs de fora
  ([Q10](open-questions.md));
- conversa nova com e sem escolha de conta. A escolha só aparece com duas contas ou mais;
- a configuração do trio, por conta e por encaixe da esteira, com o estado *indisponível*;
- *continuar em outra conta*, e o que foi levado;
- cabeçalho `agente · conta`;
- consumo por conta;
- conta desconectada;
- *apagar de vez*, com a contagem de conversas.

**Decide** o que as respostas deixaram para o desenho:
- o limiar de saída *"longa"* ([Q3a](open-questions.md));
- as linhas de vínculo entre origem e destino ([Q3b](open-questions.md));
- quem assume quando a conta padrão é desconectada ([Q5](open-questions.md), [Q8](open-questions.md));
- se o e-mail vira segunda linha ([Q2](open-questions.md));
- onde a tela diz que somar limite pode ferir os termos do provedor ([PRD §8](prd.md)).

**Where**: projeto `lumem-os` do Open Design → `packages/web/prototype/lumem-agent-accounts.*`
**Depends on**: nada
**Done when**: `pnpm --filter @lumem/web design:sync --check` passa com a folha nova. Cada decisão da
lista acima está escrita na pergunta de origem, como emenda ou nota.
**Gate**: `pnpm gate:quick` (contraste)
**Status**: represada. O MCP do Open Design não conectou na sessão que escreveu isto

---

## Fase 2 — a conta existe e chega ao processo certo (server, sem tela)

#### T4: A `AdapterSpec` aprende conta

**What**: três campos novos na spec.
- `accountEnv`: `CLAUDE_CONFIG_DIR` ou `CODEX_HOME`. Com `null`, o adaptador tem só uma conta.
- `inheritLinks`: os itens de comportamento da [Q10](open-questions.md), relativos ao diretório
  padrão do CLI (`~/.claude`, `~/.codex`).
- `identity`: como conferir. `cli-auth-status` para o Claude, `auth-status-notification` para o
  Codex.

**Where**: `packages/shared/src/adapters.ts`, `adapters.test.ts`
**Depends on**: T1
**Done when**: os dois adaptadores declaram os três campos. Um teste diz que `accountEnv` nunca é
`HOME` nem `XDG_*`, porque esse é o ADR.
**Gate**: `pnpm gate:quick`

#### T5: `agent_account`, e a migração que não pede relogin

**What**: a tabela nova.
- **Colunas**: `id`, `agent_config_id` (FK, `restrict`), `label` (única por agente), `kind`
  (`subscription | api_key`), `config_dir` (**nulo = a primeira conta, que sobe sem a variável**),
  `default_model`, `default_effort`, `models_snapshot` (JSON) com `models_seen_at`, `state`
  (`connected | disconnected`), timestamps.
- **Conta padrão**: `agent_config.default_account_id`.
- **Sessão**: `session.agent_account_id`, com a CHECK de `kind='agent'` estendida.
- **Consumo**: `session_usage.agent_account_id` (nulo, sem FK, resolvido na escrita como o
  `agent_config_id` já é).
- **Migração**: cria uma conta por `agent_config` de transporte `acp`, com `config_dir` nulo e rótulo
  igual ao nome do agente, e a marca como padrão. Amarra toda sessão e todo consumo antigos a ela.

**Where**: `packages/server/src/db/schema.ts`, `packages/server/drizzle/00NN_*.sql`
**Depends on**: T4
**Done when**: um banco com sessões de antes migra e toda sessão `agent` tem conta. Duas armadilhas
conferidas **à mão no SQL gerado**, porque o `drizzle-kit` já errou as duas neste repositório:
- a ação do estrangeiro existe (a `022`);
- nenhum `SELECT` lê coluna que ainda não existe na origem (a Parte 3 da `028`).

**Gate**: `pnpm gate:quick`

#### T6: Um resolvedor de invocação por conta, e todo spawn passando por ele

**What**: `adapterInvocationFor(account, stateDir, secrets)` → `{ command, args, env }`.
- **Conta de assinatura**: `env = { [spec.accountEnv]: config_dir }`, ou `{}` quando `config_dir` é
  nulo.
- **Conta de chave**: o valor sai do cofre para o primeiro nome do `apiKeyEnv`, que **hoje nunca é
  injetado**, só conferido.

Os caminhos que passam a chamar o resolvedor, todos:
- `session.createAgent`;
- `SessionStore.resume`, que hoje lê `agent_config.env` da coluna;
- `memory/capture.ts` e `memory/auto-learn.ts`, que hoje spawnam com `config.command` cru. Usam a
  conta padrão do agente.

**Where**: `packages/server/src/setup/adapter-command.ts`, `routers/session.ts`,
`sessions/SessionStore.ts`, `memory/capture.ts`, `memory/auto-learn.ts`, `bootstrap.ts`
**Depends on**: T5
**Done when**:
- um teste por caminho prova que o env da conta chega ao spawner;
- o `resume` de uma sessão antiga sobe **sem** a variável;
- o `resume` de uma sessão da conta 2 sobe com o diretório da conta 2, mesmo depois de o padrão
  mudar;
- um grep na suíte garante que nenhum `acpManager.spawn` fica fora do resolvedor.

**Gate**: `pnpm gate:quick`

#### T7: Conferir por identidade, e não pelo `session/new`

**What**: `probe` passa a devolver `{ loggedIn, identity: { email, plan } | null }`.
- **Claude**: `claude-agent-acp --cli auth status` com o env da conta. O JSON tem `loggedIn`,
  `email` e `subscriptionType`.
- **Codex**: `session/new` para presença, e `_auth/status_update` para identidade.

O `authRequired` derivado do `-32000` do `session/new` sai.

**Where**: `packages/server/src/acp/AcpManager.ts` (`probe`), `routers/setup.ts`,
`e2e/support/fake-acp-agent.mjs`
**Depends on**: T6
**Done when**:
- o fake do e2e reproduz o `0.75.1`: `session/new` fecha sem credencial e `--cli auth status` diz
  `loggedIn: false`;
- com ele, o rodapé mostra `entrar`, e não `conectado`;
- o item *"O rodapé diz `conectado` para um Claude sem login"* sai do
  [backlog](../../project/backlog.md) com o link desta task.

**Gate**: `pnpm gate:quick` e o e2e do login

#### T8: O contrato com o pino vira teste

**What**: o que o ADR chama de contrato implícito, conferido contra o binário do pino. Com um
diretório temporário: `auth status` diz `loggedIn: false` e `projectsDirectory` dentro dele, e
`codex login status` diz `Not logged in`. Sem a variável, os dois leem a conta de hoje sem escrever
nada nela.
**Where**: `scripts/check-adapters.ts`, ou um teste marcado que roda quando o adaptador está
instalado
**Depends on**: T4
**Done when**: o teste passa contra o pino atual. Trocar `accountEnv` para um nome errado o deixa
**vermelho**, e isso é provado de propósito, pela regra da [`025`](../025-docs-contract/prd.md) sobre
gate que nasce verde. Sem adaptador instalado, ele é pulado dizendo por quê.
**Gate**: `pnpm adapters:check`

#### T9: Conectar uma conta

**What**: `agentAccount.connect({ adapter, label, kind })`.
1. Cria `~/.lumem/_system/agents/<agente>/<conta>/`. O `_system/` já está fora do git.
2. Liga por link os `inheritLinks` que existirem no diretório padrão do CLI.
3. Roda o login com o env da conta: terminal para o Claude, chamada para o Codex. **Hoje o
   `startLogin` e o `agentAuth.start` não recebem env**, e passam a receber.
4. Confere pela T7.
5. Grava o `models_snapshot` do `session/new` ([Q9](open-questions.md)).

A primeira conta conectada de um agente vira a padrão.
**Where**: `routers/agentAccount.ts` (novo), `setup/login.ts`, `setup/agent-auth.ts`,
`routers/setup.ts`
**Depends on**: T6, T7
**Done when**:
- o teste com o fake mostra o login rodando com a variável da conta;
- a conta só vira `connected` depois da conferência;
- a resposta diz o que foi ligado e o que ficou de fora.

A medição que a Q10 deixou como critério roda aqui, contra os binários de verdade: um plugin lido
por link, e o `config.toml` do Codex ligado sem arrastar um `cli_auth_credentials_store`. **Se ela
falhar, a herança vira cópia** e a Q10 recebe a nota.
**Gate**: `pnpm gate:quick`

#### T10: Desconectar, apagar de vez, e a conta padrão

**What**:
- `disconnect` põe `state = disconnected` e **não apaga o diretório**, porque o `session/load` do
  Claude lê o transcript de dentro dele (o ADR). O `resume` de uma conversa dela é recusado com
  *"reconecte a conta"*.
- `purge` conta as conversas, apaga o diretório e o segredo do cofre, e exige a contagem na chamada,
  para a frase da tela e o servidor dizerem o mesmo número.
- `setDefault` troca a padrão.
- Desconectar a padrão segue a regra que a T3 decidir.

**Where**: `routers/agentAccount.ts`, `sessions/SessionStore.ts`
**Depends on**: T9, e a regra da T3 para a padrão
**Done when**: o `resume` de uma conta desconectada falha com a frase, sem spawnar nada. O `purge` com
a contagem errada é recusado.
**Gate**: `pnpm gate:quick`

#### T11: O trio padrão, e o modelo que sumiu

**What**:
- **Padrões**: `setDefaults({ accountId, model, effort })`. Cada handshake da conta atualiza o
  `models_snapshot`.
- **Sessão nova**: aplica modelo e effort pelo `setConfig` que a esteira já usa.
- **Modelo que sumiu**: se o modelo padrão não está na lista, a sessão abre no que o adaptador
  escolheu, emite um evento que a conversa desenha como linha, e o trio fica marcado
  *indisponível* ([Q9](open-questions.md)).
- **Effort**: só é aplicado se o modelo o oferece.

**Where**: `routers/agentAccount.ts`, `routers/session.ts`, `packages/shared/src/acp-protocol.ts` (o
evento)
**Depends on**: T9
**Done when**: um teste abre sessão com um modelo guardado que o fake não lista. A sessão abre, o
evento está no transcript e a conta aparece indisponível. Um teste com effort num modelo que não o
oferece não chama `setConfig`.
**Gate**: `pnpm gate:quick`. Uma variante nova de `AcpEvent` derruba o typecheck da tela e o mock
compartilhado (Parte 3 da `028`), então vale também `pnpm gate:build`

#### T12: A esteira escolhe conta

**What**: o `named_agent` ganha `account_id` e `effort`, os dois nulos. A cascata resolve assim:
- o adaptador vem do encaixe;
- a conta é a do encaixe **ou a padrão do agente**;
- modelo e effort são os do encaixe **ou os padrão da conta**.

O `configForAdapter` da esteira passa a devolver conta, e o `openAgentSession` e o `resumeSession`
passam a conta adiante.
**Where**: `schema.ts`, `agents/catalog.ts` (`resolveFromBindings`, que continua pura),
`tasks/conveyor-wiring.ts`, `tasks/conveyor-ports.ts`, `bootstrap.ts`
**Depends on**: T6, T11
**Done when**: a cascata pura tem o caso *"encaixe diz só o adaptador → herda conta, modelo e effort"*
([Q5](open-questions.md)). O `conveyor-ports.test.ts`, que a Parte 7 da `028` fez existir, prova que a
sessão do revisor sobe no diretório da conta do revisor.
**Gate**: `pnpm gate:quick`

#### T13: Continuar em outra conta

**What**: `session.continueIn({ sessionId, accountId })`.
1. Lê o transcript do Lumem da origem.
2. Corta pela regra da [Q3a](open-questions.md): tudo o que foi dito e o registro de cada
   ferramenta; a saída acima do limiar da T3 vira uma linha.
3. Abre uma sessão nova na conta escolhida, que pode ser de outro agente, com o corte como contexto
   do primeiro turno.
4. Grava `continued_from_id`.

A origem **não é tocada** ([Q3b](open-questions.md)). O `TranscriptStore.copy` que existe copia tudo
e não serve: o corte é função nova e pura.
**Where**: `routers/session.ts`, um módulo novo de corte ao lado do `TranscriptStore`, `schema.ts`
**Depends on**: T6, e o limiar da T3
**Done when**:
- a função de corte tem testes com saída longa, saída curta e conversa Claude → Codex;
- a sessão nova nasce na conta pedida;
- a origem continua aceitando prompt.

**Gate**: `pnpm gate:quick`

#### T14: O consumo abre por conta

**What**: `usageByProjectAndAccount` e `usageByWorktreeAndAccount`, no molde das consultas por agente
que já existem, e um procedimento no router para cada.
**Where**: `packages/server/src/usage/query.ts`, `usage/record.ts`, `routers/usage.ts`,
`packages/web/src/test/trpc-mock.ts`
**Depends on**: T5
**Done when**: um teste com duas contas do mesmo agente soma cada uma separada, e a soma das duas bate
com a consulta por agente.
**Gate**: `pnpm gate:quick`

---

## Fase 3 — a tela · depois da T3

#### T15: Rodapé com sub-linha por conta, e conectar conta

**What**: cada agente abre em uma sub-linha por conta: rótulo, estado vindo da T7 e `＋` para
conectar outra. O painel de conectar pede o nome e mostra a linha do que foi ligado.
**Where**: `packages/web/src/components/AgentLogin.tsx`
**Depends on**: T3, T9
**Done when**: com uma conta só, a tela fica **pixel a pixel** como hoje, conferido contra a folha. O
teste de componente cobre as duas contas e o estado `entrar`.
**Gate**: `pnpm gate:quick`

#### T16: Conversa nova escolhe conta

**What**: o `NewSessionMenu` mostra a escolha de conta só quando o agente tem mais de uma. Ela vem
pré-selecionada na conta padrão, e trocar de conta troca modelo e effort para os padrão dela
([Q1a](open-questions.md)).
**Where**: `NewSessionMenu.tsx`, e os outros chamadores de `createAgent` (`SessionTab`, `TaskDetail`,
`RunDock`, `setup/TaskStep`), que passam a conta padrão
**Depends on**: T3, T11
**Done when**: o teste de componente cobre uma conta (sem escolha) e duas contas (com a
pré-seleção).
**Gate**: `pnpm gate:quick`

#### T17: A configuração do trio

**What**: a tela que a T3 desenhar para os padrões por agente e por conta, e para o trio de cada
encaixe da esteira. O trio indisponível aparece marcado.
**Where**: componente novo, no lugar que a T3 decidir
**Depends on**: T3, T11, T12
**Done when**: trocar o padrão não mexe em sessão aberta, e isso tem teste. O encaixe que diz só o
adaptador mostra o que herda.
**Gate**: `pnpm gate:quick`

#### T18: O cabeçalho diz a conta, e o gesto de continuar

**What**: `.conv__head` passa a mostrar `agente · conta`, com o rótulo vindo do servidor e nenhuma
string escrita à mão (o defeito que a `021` pagou). O gesto *continuar em outra conta* e as linhas de
vínculo ficam como a T3 desenhar.
**Where**: `Conversation.tsx`, `routers/session.ts` (`toView`), `useWorktreeTabs.ts`
**Depends on**: T3, T13
**Done when**: duas conversas do mesmo agente em contas diferentes têm cabeçalhos diferentes.
**Gate**: `pnpm gate:quick`

#### T19: Consumo por conta, e as telas de desconectar

**What**: o `SpendList` abre por conta embaixo do agente, como sub-linha e não como coluna, na
mesma regra da `021`. Também entram as telas da conta desconectada e do *apagar de vez* com a
contagem.
**Where**: `WorkspacePanel.tsx`, `SpendList.tsx`, `hooks/useUsage.ts`, `AgentLogin.tsx`
**Depends on**: T3, T10, T14
**Done when**: as colunas continuam comparáveis na vertical com a sub-linha nova. A `021` achou 37px
de diferença exatamente aqui, e a conferência é no navegador, não no teste.
**Gate**: `pnpm gate:quick`

---

## Fase 4 — a prova

#### T20: O critério de sucesso, em e2e

**What**: o e2e do §1 da PRD, com o fake e sem token. Duas contas do Claude conectadas, duas
conversas lado a lado, uma em cada conta.
**Where**: `e2e/`, `e2e/support/fake-acp-agent.mjs`
**Depends on**: T15, T16, T18, T19
**Done when**: o e2e prova quatro coisas:
- cada processo sobe com o diretório da própria conta, lido pelo fake do próprio env;
- cada cabeçalho diz a conta certa;
- o consumo de cada uma cai na linha certa;
- *continuar em outra conta* abre a terceira aba com o corte.

Ele pergunta `document.elementFromPoint` onde a visibilidade importa (a regra da `023`).
**Gate**: `pnpm gate:full`

#### T21: Uma segunda conta de verdade

**What**: conectar uma segunda assinatura real pela tela, e conferir o que a fase 0 não pôde medir:
- a entrada `Claude Code-credentials-<hash>` existe no Keychain depois do login;
- a primeira conta continua logada;
- um turno em cada conta aparece no `auth status` de cada uma com o e-mail certo.

**Where**: a máquina de quem tem as duas contas
**Depends on**: T20
**Done when**: o §2.3 do [estudo](../../project/agent-accounts-measurements.md) ganha a linha medida.
**Gate**: nenhum. **Precisa do Vinicius**: navegador e duas assinaturas

#### T22: Fechar a feature

**What**:
- `**Status:** completa` na PRD e aqui;
- a linha da `030` no §Estado atual do `CLAUDE.md`;
- o índice da documentação;
- o item *Múltiplas contas* do backlog, fechado com o link.

**Where**: `docs/`, `CLAUDE.md`
**Depends on**: T21
**Done when**: `pnpm docs:check` e `pnpm gate:full` verdes.
**Gate**: `pnpm gate:full`
