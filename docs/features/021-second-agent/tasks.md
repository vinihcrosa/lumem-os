# O segundo agente — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** completa
**Histórico:** **16 tasks em 3 fases, todas entregues** (2026-09-06). A fase 0 mediu, a fase 1 fez o catálogo, a fase 3 fez o consumo por agente, e a fase 2 — desenhada no Open Design, com a [C7](open-questions.md) e a [C8](open-questions.md) respondidas lá — entregou o `authenticate`, o `elicitation/*`, o rodapé por agente e o `＋` que conecta o próximo.

O que ficou **fora**, com o motivo escrito: o `logout`, que o Codex declara e o Lumem não chama
([backlog](../../project/backlog.md)).

A fase 3 saiu de ordem de propósito: ela não toca tela nenhuma (a coluna do workspace é a única parte
que toca, e ficou de fora com o motivo escrito na T15), então ela não esperava desenho. A **T16
reprovou**, que é o que uma conferência serve para fazer: o cabeçalho da conversa dizia `claude`,
escrito à mão, e com dois agentes as duas conversas diziam a mesma coisa.

As tasks nasceram **depois** da medição, e ela mudou duas: a F2 cresceu (o login do Codex é uma
chamada, não um comando) e a F3 encolheu (a tradução já passa — o que falta é teste).

---

## Antes de começar

**A fase 1 não toca tela.** Ela é o catálogo, o instalador, o pré-voo e os testes que fixam o que a
fase 0 mediu. A **fase 2 tem desenho** — `lumem-second-agent.html` no Open Design, feito e verificado
renderizando em 2026-09-06 — e é por isso que ela pode começar: a regra de design do repositório não
admite o contrário.

**As três armadilhas conhecidas**, cada uma com a task que paga:

| Armadilha | Onde | Task |
|---|---|---|
| o Claude de hoje está instalado em `<stateDir>/adapters/node_modules/.bin/claude-agent-acp`; o catálogo quer `<stateDir>/adapters/<id>/…` | `install-adapter.ts` | **T2** — o caminho antigo continua sendo encontrado, ou toda instalação existente reinstala 255 MB no primeiro boot |
| `agentInfo.name` do Codex é `@agentclientprotocol/codex-acp`, não `codex` | qualquer tela que rotule agente | **T1** — o rótulo vem do catálogo |
| `session_usage` **não tem** `agent_config_id` (o PRD dizia que tinha; a linha da **sessão** tem) | `usage/record.ts`, `db/schema.ts` | **T14** — agrupar por agente custa uma migração |

**O que a fase 0 já provou e não precisa de código:** `translate.ts`, `UsageFooter`, `ConfigPills`,
`conversation-model.ts` e o `resume` atravessaram um turno inteiro do Codex sem uma linha de mudança
e sem um `warn`. As tasks que os tocam são **testes** (T6, T8).

---

## Fase 1 — o catálogo

#### T1: As cinco constantes de Claude viram `ADAPTERS`

**What**: `AdapterSpec` e `ADAPTERS: readonly AdapterSpec[]` no `shared`, com duas entradas — Claude
e Codex. Campos: `id`, `label`, `package` (opcional), `command`, `pinnedVersion`, `cli` (opcional,
com `command` e `install`), `apiKeyEnv` (lista, porque o Codex aceita duas). As cinco constantes de
hoje ou saem, ou passam a ser derivadas da spec do Claude num lugar só.
**Where**: `packages/shared/src/constants.ts`, `packages/shared/src/adapters.ts` (novo),
`packages/shared/src/index.ts`, `packages/shared/src/adapters.test.ts`

**Done when**:
- [x] `ADAPTERS` tem `claude` e `codex`, com `pinnedVersion` **literal** — `0.40.0` e `1.10.0`, as
      versões que a fase 0 mediu, e nunca `latest`
- [x] A spec do Codex tem `cli: null` e a do Claude tem `cli: { command: "claude", … }` — a diferença
      medida em §4.8, e um teste que falha se alguém der um CLI ao Codex "por simetria"
- [x] `apiKeyEnv` do Claude é `["ANTHROPIC_API_KEY"]` e do Codex é `["CODEX_API_KEY","OPENAI_API_KEY"]`
- [x] `adapterById(id)` recusa id desconhecido com frase, e não devolve `undefined` para o chamador
      conferir
- [x] Um teste afirma que **nenhuma** das duas specs tem o rótulo saindo de `package` — o rótulo do
      Codex é `Codex`, não `@agentclientprotocol/codex-acp` (§4.1)
- [x] `pnpm gate:quick` verde

---

#### T2: O instalador recebe a spec, e continua achando o que já estava instalado

**What**: `installAdapter({ spec, dir })` instala `<package>@<pinnedVersion>` em
`<stateDir>/adapters/<id>` e devolve o binário de lá. Spec **sem** `package` não instala nada: ela
resolve no PATH e diz o que falta. E o caminho antigo (`<stateDir>/adapters/node_modules/.bin/…`)
continua sendo aceito para o Claude, porque ele existe em toda máquina que já rodou o produto.
**Where**: `packages/server/src/setup/install-adapter.ts`, `install-adapter.test.ts`

**Done when**:
- [x] RED primeiro: um teste instala a spec do Codex e espera o binário em
      `<dir>/codex/node_modules/.bin/codex-acp`
- [x] `npm install --prefix <dir>/<id> … <package>@<pinnedVersion>` — o comando dublado, como hoje
- [x] Instalação **já existente no caminho novo** → `alreadyInstalled: true`, nada baixado
- [x] Instalação existente no **caminho legado** do Claude → `alreadyInstalled: true` e o `path` é o
      legado. É a task da armadilha: sem isto, todo mundo reinstala no primeiro boot
- [x] Spec sem `package` → não chama `npm`, e devolve o que achou no PATH ou um erro que diz o nome do
      binário que falta
- [x] O `npm` que termina sem erro e sem binário continua falhando com a frase de hoje, agora citando
      o pacote da spec
- [x] `pnpm gate:quick` verde

---

#### T3: O pré-voo relata por spec — e uma spec sem CLI relata um binário

**What**: `agents.ts` deixa de devolver `{ claude, adapter, apiKeyInEnv }` e passa a devolver um
relatório **por spec**: o adaptador, o CLI quando a spec tem um, e a presença (nunca o valor) de
cada `apiKeyEnv`.
**Where**: `packages/server/src/setup/agents.ts`, `agents.test.ts`

**Done when**:
- [x] RED primeiro: um teste pede o relatório da spec do Codex e espera **um** binário e nenhum CLI
- [x] A spec do Claude relata os dois, com os mesmos campos de hoje — `path`, `version`,
      `versionNote`, `install`, `managed`
- [x] `apiKeyInEnv` vira por spec: `true` se **qualquer** um dos `apiKeyEnv` está no ambiente, e o
      nome da variável encontrada aparece; o valor, nunca
- [x] O binário que o daemon instalou continua ganhando do PATH, com `managed: true`, para as duas
      specs
- [x] Um teste afirma que o relatório do Codex **não** diz "instale o codex" — porque o adaptador traz
      o CLI (§4.8)
- [x] `pnpm gate:quick` verde

---

#### T4: `setup.install` e `setup.probe` recebem qual adaptador

**What**: os dois procedimentos do router passam a aceitar `adapterId`, com `claude` como default —
o onboarding não muda de comportamento (C3), e o rodapé de login da fase 2 vai precisar do parâmetro.
Id fora do catálogo é `INVALID_ARGUMENT`.
**Where**: `packages/server/src/routers/setup.ts`, `packages/server/src/routers/setup.test.ts`

**Done when**:
- [x] `setup.install({ adapterId: "codex" })` instala a spec do Codex, no diretório dela
- [x] Sem `adapterId` → Claude, e os testes de hoje passam sem mudança de chamada
- [x] `adapterId` desconhecido → erro de argumento com o id citado, antes de qualquer `npm`
- [x] `setup.probe` usa o `command` da spec quando não recebe um explícito
- [x] `pnpm gate:quick` verde

---

#### T5: O `remedy` de falha de lançamento sai do catálogo

**What**: o `AcpManager` monta o `npm i -g …` da spec, em vez de citar o pacote do Claude.
**Where**: `packages/server/src/acp/AcpManager.ts`, `AcpManager.test.ts`

**Done when**:
- [x] Uma falha de spawn de uma sessão de Codex sugere `@agentclientprotocol/codex-acp@1.10.0`
- [x] Uma falha de spawn de comando **fora** do catálogo não inventa pacote: ela diz o comando que
      não subiu, e nada mais
- [x] O texto do Claude não muda — é o mesmo teste de hoje, com a string vindo de outro lugar
- [x] `pnpm gate:quick` verde

---

#### T6: O agente falso ganha um perfil codex-like, e ele fixa o que a fase 0 mediu

**What**: um perfil no `acp-fake-agent.ts` (e no `.mjs` do e2e) que responde como o Codex responde:
`usage_update` com `used`/`size` e sem `_meta`; `availableCommands` só por **notificação**, nunca na
resposta do `session/new`; `mode` presente **as duas vezes** (em `modes` e em `configOptions`);
categorias `collaboration_mode`, `thought_level` e `model_config`; e um interruptor de
`loadSession: false`, que é o que o Codex **não** é e o próximo adaptador pode ser.
**Where**: `packages/server/src/testing/acp-fake-agent.ts`,
`packages/server/src/acp/codex-like.test.ts` (novo — os testes do perfil ficaram num arquivo próprio
em vez de dentro do `AcpManager.integration.test.ts`, que é o do adaptador **real**),
`e2e/support/fake-acp-agent.mjs` (perfil por `LUMEM_FAKE_PROFILE=codex`)

**Done when**:
- [x] RED primeiro onde couber: hoje **não existe** teste de `usage` sem `rateLimit`, e é o que a C4
      cobra
- [x] `usage` sem `rateLimit` → `{ cost: null, rateLimit: null }` no fio, e **nenhum** `warn`
- [x] Perfil que não manda `usage_update` nenhum → nenhum número na conversa, e nunca zero
- [x] `available_commands_update` chegando **depois** do primeiro prompt → o menu de `/` tem os
      comandos; um teste falha se alguém passar a exigi-los na resposta do `session/new`
- [x] `session_info_update` → nenhum evento e nenhum `warn` (a lista `IGNORED`, agora com teste)
- [x] Perfil sem `loadSession` → `resume` recusa com frase, e não tenta
- [x] `pnpm gate:quick` verde

---

#### T7: Trocar de modo deixa a `configOption` de modo coerente

**What**: o defeito de §4.9. `setConfig` no `mode` chama `session/set_mode`, escreve `session.info.mode`
e deixa `configOptions[mode].currentValue` com o valor antigo. Ninguém vê hoje só porque o
`ConfigPills` tem uma linha que prefere `mode` — e o Codex é o primeiro agente em que `mode` é as duas
coisas.
**Where**: `packages/server/src/acp/AcpManager.ts`, `AcpManager.test.ts`

**Done when**:
- [x] RED primeiro: depois de `setConfig(id, "mode", …)`, o evento `config` sai com a opção `mode` em
      `currentValue` **novo**
- [x] O agente que devolve um valor **ajustado** continua ganhando: o que vale é a resposta dele, não
      o pedido
- [x] O agente que não tem `mode` em `configOptions` (o Claude) continua igual — nenhuma opção
      inventada
- [x] `pnpm gate:quick` verde

---

#### T8: O adaptador real, num teste marcado

**What**: integration pulado quando o `codex-acp` não está instalado — o padrão do
`AcpManager.probe.test.ts`. Para em `initialize` + `session/new`: token zero. Ele é o teste que pega o
`1.11.0` mudando de forma.
**Where**: `packages/server/src/acp/AcpManager.codex.integration.test.ts` (novo)

**Done when**:
- [x] Pulado, com motivo legível, quando o binário não existe — e a suíte fica verde numa máquina sem
      Codex
- [x] Presente: afirma `protocolVersion: 1`, `loadSession`, `mode` entre as `configOptions`, três
      modos, e **zero** `warn` no handshake
- [x] Afirma que `authMethods` **não** tem nenhum `type: "terminal"` — é a medição que decidiu a C3, e
      é a que quebra quando o adaptador mudar de opinião
- [x] Não gasta turno: nenhum `session/prompt`
- [x] `pnpm gate:full` verde

---

#### T9: O `DEFAULT_AGENT_CONFIG` deixa de ser semeado

**What**: [C6](open-questions.md). `seedDefaults` para de inserir `pty` + `claude`. Quem já tem a
linha continua com ela.
**Where**: `packages/server/src/repositories/agentConfig.ts`, `agentConfig.test.ts`,
`packages/server/src/boot/reconcile.ts`

**Done when**:
- [x] Instalação nova → `agent_config` **vazia** depois do boot
- [x] Instalação que já tinha a linha → a linha continua lá, intacta, depois do boot
- [x] O `AgentConfigDialog` continua criando configuração `pty` — o caminho alternativo não morre
- [x] Nenhum teste passa a depender de uma semente que não existe mais (o `agentConfig.test.ts` de
      hoje semeia em seis lugares)
- [x] `pnpm gate:full` verde

---

## Fase 2 — o login

> **O desenho está feito.** `lumem-second-agent.html` + `.css` no Open Design, desenhado e verificado
> renderizando em 2026-09-06, e sincronizado para `packages/web/prototype/`. O §8 do PRD tem a tabela
> de decisões com os números; a [C7](open-questions.md) e a [C8](open-questions.md) são as duas
> perguntas que ele abriu e respondeu. **O que a folha decidiu não se re-decide no React** — se algo
> nela estiver errado, o conserto é lá, e a task espera.

#### T10: `authenticate`, a chamada que falta no daemon

**What**: o método `authenticate` do ACP, com `_meta["api-key"]` quando o método pedir chave. A chave
atravessa o daemon e **não fica**: nem em `~/.lumem`, nem em log, nem de volta na tela.
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/routers/setup.ts`

**Done when**:
- [x] `authenticate(methodId)` contra o agente falso resolve, e um `session/new` depois dele passa
- [x] Método `api-key` leva a chave em `_meta["api-key"].apiKey`
- [x] Um teste **varre o `stateDir`** depois do login e falha se a chave aparecer em qualquer arquivo
- [x] A chave não aparece em nenhuma linha de log — o `log.warn` dublado recebe a falha e não o valor
- [x] Método que o agente recusa → a frase dele, e o painel continua aberto
- [x] O perfil codex-like ganha os dois métodos sem `type` e um `authenticate` que aceita/recusa
- [x] `pnpm gate:quick` verde

#### T11: `elicitation/create` e `elicitation/complete` — URL e código, em vez de um browser na máquina errada

**What**: as duas requisições do cliente, e `elicitation: { url: {} }` no `clientCapabilities` — é o
que faz o `chat-gpt-device-code` aparecer (§4.2, [C7](open-questions.md)).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/shared/src/acp-protocol.ts`,
`packages/web/src/components/AgentLogin.tsx`

**Done when**:
- [x] O agente falso pedindo `elicitation/create` produz um evento com **URL e código** para a tela
- [x] `elicitation/complete` fecha o pedido, e a tela deixa de mostrar o código
- [x] A capacidade só é declarada porque as duas existem — a regra do `terminal` e do `fs`, aplicada
      de novo. Um teste afirma que `elicitation` **não** é declarada quando o handler não existe
- [x] O teste marcado do adaptador real (T8) passa a afirmar que, **com** a capacidade declarada,
      `chat-gpt-device-code` aparece no `authMethods` — é a medição virando regressão
- [x] `pnpm gate:quick` verde

#### T12: O rodapé com uma linha por agente

**What**: `AgentLogin` deixa de ser "o agente" e passa a ser uma linha por `agent_config`, com o
cabeçalho `Agentes` e o `＋` que a [C8](open-questions.md) decidiu. Três classes novas da folha:
`.foot-head`, `.foot-row--warn`, `.dcode` — mais a correção do `.pip`.
**Where**: `packages/web/src/components/AgentLogin.tsx`, `packages/web/src/components/agent-login.css`,
`packages/web/src/styles/contrast.ts`

**Done when**:
- [x] Um agente → o cabeçalho aparece, e a linha dele é a de hoje. O rodapé mede **73px** (28 + 32 +
      padding); com dois, **105px** — os números que a folha mediu
- [x] Dois → duas linhas, cada uma com o próprio estado, e clicar numa abre o painel **dela**
      (`is-open` na linha que abriu)
- [x] O `.pip` tem a cor do estado nos três — verde, âmbar, vermelho. Era cinza nos três
- [x] Os **três pares de contraste** entram no `CONTRAST_PAIRS`: `daemon/online`, `text/warning` e
      `text/danger` sobre `bg/panel`. Nenhum estava lá, nem o verde que já era pintado. Medidos em
      9,85, 9,10 e 8,76:1 — o `gate:quick` confere
- [x] O teste de porte de CSS continua verde nas duas direções: nenhuma classe pedida sem regra, e
      nenhuma regra que ninguém pede
- [x] `design:sync --check` limpo — a folha e a cópia do repositório concordam
- [x] `pnpm gate:quick` verde

#### T13: Instalar e entrar no Codex de dentro do produto

**What**: o `＋` instala a spec do Codex (T2, T4), faz o handshake, cria a `agent_config` ACP com a
versão que o `probe` **detectou**, e abre os jeitos de entrar que o handshake trouxe.
**Where**: `packages/web/src/components/AgentLogin.tsx`, `packages/server/src/routers/setup.ts`

**Done when**:
- [x] Instalar → `agent_config` nova, transporte `acp`, `adapter_version` vindo do `probe`
- [x] O preparo tem **duas** linhas para uma spec com `cli: null`, e três para uma com `cli`
- [x] Instalar de novo → nada baixado, nenhuma linha duplicada
- [x] Falha de `npm` chega na tela com a frase do `npm`
- [x] O e2e do `second-agent.spec.ts` ganha o caminho de tela: `＋` → instalar (com um shim) → entrar
      → duas linhas no rodapé
- [x] `pnpm gate:full` verde

---

## Fase 3 — consumo, e a conferência

#### T14: `session_usage` passa a saber de qual agente foi o turno

**What**: `agent_config_id` na tabela, resolvido **na escrita** — como `project_id` e `worktree_id` já
são. É a armadilha do PRD: a coluna não existia.
**Where**: `packages/server/src/db/schema.ts`, migração nova, `packages/server/src/usage/record.ts`,
`record.test.ts`

**Done when**:
- [x] Migração acrescenta a coluna, anulável — linha antiga não ganha agente inventado
- [x] O turno gravado depois da migração tem o `agent_config_id` da sessão
- [x] Sessão sem `agent_config_id` (as de shell) continua gravando, com `null`
- [x] `pnpm gate:quick` verde

#### T15: Consumo agrupado por agente

**What**: `usage.byProject` e `usage.byWorktree` ganham agrupamento opcional por agente
([C5](open-questions.md)). Na tela, a divisão é uma **sub-linha** e não uma coluna — desenhada na aba
`Consumo` da folha, com as duas alternativas recusadas por escrito. Ela aparece **só** quando há mais
de um agente configurado.
**Where**: `packages/server/src/usage/query.ts`, `query.test.ts`,
`packages/web/src/components/WorkspacePanel.tsx`

**Done when**:
- [x] Agrupado: dois agentes na mesma worktree → duas linhas, com os tokens de cada um
- [x] Sem agrupar: o número de hoje, idêntico — um teste compara as duas somas
- [x] `cost` continua `null` quando ninguém reportou dinheiro, agrupado ou não
- [x] Um agente no workspace → **nenhuma** coluna nova na tela, e **nenhuma consulta**: a segunda
      pergunta só acontece quando há mais de um agente configurado
- [x] Dois → a linha do projeto abre em uma sub-linha por agente, e ela **nasce fechada**: a divisão
      é uma pergunta, não um relatório
- [x] O turno sem agente aparece como `antes desta versão`, e não somado a alguém
- [x] O projeto sem divisão não perde nenhuma coluna — a grade é da lista, e ela é a mesma para
      todas as linhas
- [x] A folha do Open Design está sincronizada (`design:sync --check` limpo), com a aba **Consumo** e
      as duas recusas escritas: coluna por agente e barra segmentada por cor
- [x] `pnpm gate:quick` verde

#### T16: A aba diz qual agente está falando

**What**: a F4 é conferência. Duas sessões na mesma worktree, uma por agente: cada aba diz a sua.
**Reprovou** — o cabeçalho da conversa tinha a string `claude` escrita à mão. A correção entrou aqui.
**Where**: `e2e/second-agent.spec.ts` (novo), `packages/web/src/components/Conversation.tsx`,
`packages/web/src/components/SessionTab.tsx`

**Done when**:
- [x] e2e com os dois agentes vindos do mesmo fake, o segundo com `LUMEM_FAKE_PROFILE=codex` — a
      token zero, e sem shim no PATH porque a `agent_config` já aponta para o arquivo
- [x] Duas abas, dois agentes, e o nome de cada um visível sem abrir menu
- [x] Se reprovar, a correção é de tela e entra aqui; se passar, a task fecha com o e2e como prova
- [x] `pnpm gate:full` verde
