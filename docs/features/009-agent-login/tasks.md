# Conectar agente — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 8 fechadas
**Protótipo:** `packages/web/prototype/lumem-agent-login.html`
**Sucede:** [onboarding](../onboarding/tasks.md)
**Status:** **8 de 8 entregues.** Gate cheio verde — 1.705 unit/integration + 27 e2e.

---

## Ordem, e por quê ela é essa

**Medir antes de desenhar código.** O desenho inteiro se apoia em `authMethods` vir preenchido, e
`authMethods` vinha vazio. Se a M1 tivesse sido feita depois das telas, as telas estariam escritas
contra `authenticate` — que este adaptador não implementa — e a descoberta chegaria com tudo pronto.

**A capacidade antes da lista.** Declarar `auth.terminal` é uma linha, e é ela que faz existir o que a
tela desenha. Sem ela não há nada a testar.

**A recusa antes do botão.** `setup.login` valida o `methodId` contra o que o adaptador ofereceu antes
de existir tela que o chame — porque o caminho errado aqui é "o cliente manda uma linha de comando", e
isso tem de ser impossível, não improvável.

---

## Decisões que sustentam o resto

Detalhadas em [open-questions.md](open-questions.md). Aqui o que a implementação precisa ter na mão.

### D1 — O cliente manda `methodId`, nunca um comando

`setup.login` recebe um id, refaz o handshake e executa **o que o adaptador declarou** para aquele id.
Um cliente que pudesse nomear o binário seria um cliente que roda qualquer coisa na máquina do daemon.

### D2 — O terminal de login não é sessão

`PtyManager.spawn` direto, sem `SessionStore`. Nenhuma linha em `session` ([L4](open-questions.md)).

### D3 — Quem confirma é o adaptador

O painel muda de estado quando o processo termina **e** a sonda responde depois. Não existe "já entrei":
uma pessoa afirmando que entrou não é evidência de nada.

### D4 — A instalação é visível

Três linhas, não um spinner e não um comando para copiar. Automático não é escondido.

### D5 — Estado de conexão é derivado

`nenhum` / `verificando` / `entrando` / `conectado` / `expirado` / `falhou` saem de duas leituras que já
existem: há `agent_config` ACP? a sonda respondeu, recusou por `auth_required`, ou estourou? Nenhuma
coluna nova, nenhuma flag.

---

## Fase 1 — Medir

#### M1: O que o adaptador real oferece ✅

**What**: Handshake cru contra `claude-agent-acp`, declarando e não declarando `auth.terminal`.
**Where**: script de sonda, descartado depois; o achado está no [§2 do PRD](prd.md)

**Done when**:
- [x] Sem `auth.terminal`: `authMethods: []` — e a leitura do spike da acp-sessions fica **corrigida**,
      não era "não pediu nada", era não ter sido perguntado
- [x] Com: `claude-ai-login` e `console-login`, os dois `type: "terminal"`
- [x] Com `_meta["terminal-auth"]`: vem `{command, args, label}` — o comando exato
- [x] `agentCapabilities.auth` é `null` → não existe logout
- [x] `authenticate` do adaptador lançaria *Method not implemented* para os dois ids (lido no código
      do pacote instalado)
- [x] `agentInfo.version` é `0.40.0`, e não o `0.69.0` que o `pty-vs-acp` §9 registrou

**Tests**: nenhum — é medição · **Gate**: nenhum

---

## Fase 2 — O daemon

#### S1: Declarar `auth.terminal` ✅

**What**: A capacidade que faz o adaptador oferecer login, e o `_meta` que traz o comando.
**Where**: `packages/server/src/acp/AcpManager.ts`

**Done when**:
- [x] `clientCapabilities.auth = { terminal: true }` e `_meta["terminal-auth"] = true`
- [x] As duas atadas ao `PtyManager`, pela mesma regra que `terminal` já seguia: o que esses métodos
      oferecem são comandos, e um cliente que não pode rodar um não tem por que recebê-los
- [x] Gate: `pnpm gate:quick`

**Commit**: incluído em `feat(server): let the agent say how a person logs in`

---

#### S2: `auth_required` é resposta, não falha ✅

**What**: `session/new` recusando com `-32000` vira dado na sonda e frase no spawn real.
**Where**: `AcpManager.ts`, `AcpManager.probe.test.ts`

**Done when**:
- [x] A sonda devolve `authRequired: true` e o resto do handshake — é o que abre o painel
- [x] O spawn de verdade recusa com uma frase que **nomeia onde se resolve**, em vez de vazar um
      código JSON-RPC
- [x] Detectado por **código**, não por mensagem: o texto é do adaptador e pode ser reescrito
- [x] O agente falso recusa com o `RequestError.authRequired()` do SDK — um `Error` cru atravessa o
      fio como erro interno, e o que significa "entre" é o código
- [x] Test count: **4** (auth_required, sessão ok, os dois formatos de `authMethods`)

---

#### S3: `authMethods` numa forma que a tela pode agir ✅

**What**: `AcpAuthMethod` com tipo, comando, args e label.
**Where**: `AcpManager.ts`

**Done when**:
- [x] `command` vem do `_meta["terminal-auth"]`; **null** quando o adaptador não disse
- [x] Método `terminal` sem comando é reportado como inexecutável em vez de adivinhado — adivinhar
      nome de binário é o erro que produziu o comando de instalação errado no desenho do onboarding
- [x] `agent` e `env_var` chegam identificados, para a tela poder dizer por que não são botão

---

#### S4: O daemon instala o adaptador ✅

**What**: `setup.installAdapter` — `npm install --prefix ~/.lumem/adapters`, versão fixa.
**Where**: `packages/server/src/setup/install-adapter.ts` + teste, `routers/setup.ts`, `shared/constants.ts`

**Done when**:
- [x] `--prefix`, nunca `-g`; versão exata, nunca `@latest` — asseverado nos argumentos, não só no
      comentário
- [x] Idempotente: binário já presente não baixa nada
- [x] `npm` ausente, registry inalcançável, saída de erro: **as palavras do npm**, que são melhores
      que uma tradução
- [x] npm sair 0 sem escrever o binário é recusa própria: senão a `agent_config` aponta para um
      caminho que não existe e o erro aparece na primeira conversa
- [x] A detecção procura a cópia instalada **antes** do `PATH`, e marca qual é (`managed`)
- [x] Test count: **5**

**Commit**: `feat(server): install the ACP adapter, pinned, into the daemon's own directory`

---

#### S5: `setup.login` ✅

**What**: Rodar o comando que o adaptador nomeou, num PTY do daemon.
**Where**: `packages/server/src/setup/login.ts`, `routers/setup.ts`, `routers/setup.test.ts`

**Done when**:
- [x] Entrada é `methodId` (D1). O daemon refaz o handshake e procura o método lá
- [x] Recusa: id que o adaptador não ofereceu, método de tipo que não sabe executar, método
      `terminal` sem comando — cada um com sua frase
- [x] Nenhuma linha em `session` (D2), verificado no teste
- [x] Test count: **4** + 1 de forma do router

---

## Fase 3 — A tela

#### C1: O painel ✅

**What**: `AgentLogin` — rodapé com estado, e os seis estados do painel.
**Where**: `packages/web/src/components/AgentLogin.tsx`, `agent-login.css`, `useLoginTerminal.ts`,
`App.tsx`, testes

**Done when**:
- [x] Rodapé: uma linha, um verbo, cinco estados com pip (F1.2)
- [x] Escolher · preparo · entrar · esperando · conectado · falhou, mais a gaveta `avançado`
- [x] Os botões de login vêm de `authMethods`; **um** preenchido
- [x] Sem "já entrei" (D3), e o texto na tela diz por quê
- [x] O terminal de login **não é desenhado**: 264px não cabem um terminal, e o que serve são as
      últimas linhas e o código de saída. `useLoginTerminal` anexa ao socket de PTY sem xterm
- [x] `staleTime` de 5 min na sonda: ela sobe um processo, e a resposta muda quando uma credencial
      expira — não a cada montagem
- [x] O formulário de cinco campos continua atrás de **outro agente ACP…**
- [x] Test count: **17** de componente + **3** de auditoria de CSS

**Commit**: `feat(web): connect an agent by logging in, not by filling five fields`

---

#### C2: O onboarding passa a instalar também ✅

**What**: O passo 2 do fluxo usa a mesma instalação, em vez do comando copiável.
**Where**: `packages/web/src/setup/AgentStep.tsx`, `setup-flow.test.tsx`

**Done when**:
- [x] Botão que instala, progresso, e a mesma versão fixa
- [x] O comando copiável **fica**, como saída de emergência quando o install não pode funcionar
- [x] Um fato, duas telas, uma implementação: a mesma mutation
- [x] Test count: **2** trocados (o que afirmava "nada que instala" virou o oposto, com o motivo)

---

#### C3: O e2e ✅

**What**: O painel contra um handshake de verdade.
**Where**: `e2e/agent-login.spec.ts`, `e2e/acp-agent-config.spec.ts`, `docs/project/testing.md`

**Done when**:
- [x] Versão lida do handshake, ausência de `sair`, gaveta como fato, e o caminho para um segundo agente
- [x] O e2e do formulário de cinco campos passa pelo novo caminho (`outro agente ACP…`)
- [x] **O que ele não cobre, dito no próprio spec**: o clique `nenhum → conectado`. Chegar nesse
      estado no meio da suíte exige remover a configuração que os specs anteriores deixaram, e
      configuração em uso por sessão viva é recusada — o setup ficaria instável de um jeito que a
      asserção não é. Isso tem 17 testes de componente e o `00-onboarding`
- [x] Gate: `pnpm gate:full` — 27 e2e

---

## O que a execução achou

| O quê | Onde |
|---|---|
| **A sonda sem os argumentos da configuração** — `node` sem script é um REPL que não responde handshake nenhum; toda carga de página pagava 15 s de timeout. Não era bug de e2e: era bug, e o e2e achou | C1 |
| **Clicar antes da detecção chegar instalava o que já existia** — `connect` decide instalar lendo o que a detecção achou, e lendo `undefined` ele instala. O botão passou a esperar | C1 |
| **O desenho não tinha caminho para um segundo agente** — o estado 07 só oferece `trocar conta` e `sair`, e `sair` não pode existir. Sem um link ali, nunca se adiciona o Codex | C1 |
| **`.chips` não serve dentro do fluxo** — a classe existe em `detail.css`, que só carrega quando há escopo selecionado. Usar o nome do protótipo deixaria os botões sem pintura exatamente ali | C2 |
| **Um teste que contava chamadas de query** — o painel virou um terceiro leitor da mesma chave, e o número mudou. Estava medindo a fiação, não a promessa | C1 |

### O que o portão não prova

- **Nenhum login real foi feito.** A máquina onde isto foi escrito já estava autenticada, e derrubar
  essa credencial para exercitar o caminho custaria o login de verdade do usuário. O que rodou de
  ponta a ponta foi o handshake, a recusa `auth_required` (com agente falso) e o spawn do comando.
- **Nenhum `npm install` de verdade rodou.** O `npm` é dublê em todo teste; o caminho de rede nunca foi
  exercitado.
- **O caso do daemon remoto** (`claude-login`, sem navegador) é o mesmo mecanismo e não foi testado.
- **A gaveta `avançado` não edita**, então nada aqui prova que trocar o adaptador funciona pela tela —
  o caminho é remover e criar.
