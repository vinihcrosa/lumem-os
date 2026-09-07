# PRD — O segundo agente

> **Status:** v0.2 — proposto em 2026-09-05, **fase 0 medida em 2026-09-06** e o §4 reescrito com os
> números. As seis perguntas estão **respondidas**. Sai do backlog ("Segundo e terceiro CLI de
> agente", seção B). **Um de cada vez:** este PRD é sobre **um** agente a mais, e o terceiro volta
> para o backlog até este estar de pé.
> **Perguntas:** [open-questions.md](open-questions.md) · **Tasks:** [tasks.md](tasks.md)
> **Depende de:** nada de código. A fase 0 foi um spike contra o adaptador real, como o §2 da
> [agent-login](../agent-login/prd.md) foi
> **Desenho:** uma tela muda no Open Design (§8) — o rodapé de login. A escolha de agente no primeiro
> acesso **saiu**, por [C3](open-questions.md)

---

## 1. O problema, em uma frase

**O ACP foi escolhido por ser agnóstico de agente, e nada prova isso.**

O [pty-vs-acp](../../project/pty-vs-acp.md) vendeu a migração, entre outras coisas, por *"o Lumem
desenha a interface"* para qualquer agente que fale o protocolo. A v1 roda **só Claude**. O que no
código sabe que é Claude, medido em 2026-09-05:

| Onde | O quê |
|---|---|
| `shared/constants.ts` | `ACP_ADAPTER_COMMAND`, `ACP_ADAPTER_PACKAGE`, `ACP_ADAPTER_PINNED_VERSION = "0.40.0"`, `CLAUDE_CLI_COMMAND`, `ANTHROPIC_API_KEY_ENV` — cinco constantes de **um** adaptador |
| `setup/install-adapter.ts` | instala só esse pacote, em `~/.lumem/adapters` |
| `setup/agents.ts` | o relatório da máquina é `claude` + `adapter`, dois binários fixos |
| `acp/translate.ts` | o consumo lê `_meta._claude/rateLimit` |
| `acp/AcpManager.ts` | o `remedy` de falha de lançamento é `npm i -g @agentclientprotocol/claude-agent-acp@…`; os comentários sobre `authMethods` são medições desse adaptador |
| `web/setup/AgentStep.tsx`, `web/components/AgentLogin.tsx` | um agente, o dele |
| `repositories/agentConfig.ts` | `DEFAULT_AGENT_CONFIG` semeia `pty` + `claude` — anterior ao ACP |

E o que **já é** genérico, e prova que a fronteira estava no lugar certo:

| Onde | O quê |
|---|---|
| `agent_config` | `name`, `command`, `args`, `env`, `transport`, `adapter_version`. "Adicionar agente é adicionar linha" (walking-skeleton §3) |
| `session.createAgent(agentConfigId)`, `NewSessionMenu` | qualquer configuração vira sessão, e o menu lista todas |
| `shared/acp-protocol.ts` | o fio para o browser não tem Claude nele — só o `rateLimit` opcional, "porque outro agente não vai mandar" |
| `conversation-model.ts` | um fold sobre eventos do **nosso** vocabulário |
| [session-mode](../session-mode/prd.md) | agente que **não relata modos** ganha a pílula do Lumem e a política dele — `perguntar tudo` por padrão. Um adaptador sem `configOptions` deixou de produzir um composer mudo, que era o primeiro defeito que um segundo agente ia mostrar |

Hoje já dá para rodar Codex como `agent_config` de transporte `pty` — é o caminho alternativo que a
decisão do ACP preservou. O que falta é a **conversa**.

## 2. Por que agora

1. **Provar a arquitetura antes de construir mais sobre ela.** Se a tradução não segura um segundo
   adaptador, é melhor saber agora do que depois da [workspace-tasks](../workspace-tasks/prd.md);
2. **Dois agentes é o que dá sentido a duas perguntas do projeto:** roteamento de tarefa (Q015) e
   comparação de custo por agente — com um só, as duas são vazias;
3. **O backlog nomeou o gatilho:** "quando o primeiro estiver estável e você sentir falta do segundo".
   O primeiro está: 35 tasks fechadas, onboarding e login completos.

## 3. Qual — Codex primeiro

Decidido na [C1](open-questions.md), e a fase 0 confirmou os três motivos:

- **mesma família de adaptador.** O estudo do Compozy (§7) lista `codex` como
  `npx -y @agentclientprotocol/codex-acp@latest` — o mesmo escopo npm do `claude-agent-acp`. O
  mecanismo de instalar pinado em `~/.lumem/adapters` **foi reusado sem uma linha de mudança**
  (§4.8);
- foi o que o backlog nomeou primeiro;
- é o que as três referências suportam (Conductor `0.18.0` acrescentou Codex; Compozy e Superset
  também), então há com o que comparar comportamento.

E provou mais do que se esperava de "mesma família": o CLI não precisa estar no PATH, o adaptador não
pede `fs` nem `terminal` ao cliente, e o login não é um comando. Três diferenças de comportamento
dentro do mesmo escopo npm.

Alternativas registradas: `gemini --acp` (nativo — não há adaptador para instalar, e é uma família
**diferente**, o que prova mais e custa mais), `opencode` (a verificar como fala ACP).

## 4. Fase 0 — medido

> **Feito em 2026-09-06**, contra `@agentclientprotocol/codex-acp@1.10.0`, macOS arm64. O cliente é o
> **`AcpManager` deste repositório** (SDK `1.3.0`) para tudo que ele já sabe fazer, mais um cliente
> ndjson de 60 linhas para as variações de `clientCapabilities` que o nosso não declara. Handshake e
> `session/new` custam **zero token**; quatro turnos de prompt foram gastos, e o que eles reportaram
> está no item 4. A credencial na máquina é ChatGPT Plus.
>
> Esta seção substitui a lista de perguntas que estava aqui. O que ela mudou no plano está marcado
> **⇒**, e cada mudança tem uma pergunta respondida em [open-questions.md](open-questions.md).

### 4.1 `initialize` — o que o adaptador declara

| Campo | Codex `1.10.0` | Claude `0.40.0` (medido antes) |
|---|---|---|
| `agentInfo.name` | `@agentclientprotocol/codex-acp` — **o nome do pacote** | `claude-agent-acp` |
| `agentInfo.title` | `Codex` | — |
| `agentInfo.version` | `1.10.0` | `0.69.0` |
| `protocolVersion` | `1` | `1` |
| `agentCapabilities.loadSession` | `true` | `true` |
| `promptCapabilities` | `embeddedContext`, `image` | — |
| `sessionCapabilities` | `resume`, `list`, `close`, `delete`, `fork`, `additionalDirectories`, `subagents` | — |
| `mcpCapabilities` | `http: true`, `acp: false`, `sse: false` | — |
| `agentCapabilities.auth` | `{ logout: {} }` | — |

⇒ **a versão pinada é detectável, mas o rótulo não sai do `name`.** `agentInfo.name` é o pacote; o
que uma tela mostra é o `title` (`Codex`). O catálogo carrega o rótulo porque o `name` não serve, e
o `title` só existe depois do handshake.

### 4.2 `authMethods` — nenhum é `type: "terminal"`

Nenhuma das entradas traz `type`. O nosso `toAuthMethod` mapeia isso para `type: "unknown"`, com
`command: null` — medido, não inferido: é o que o `probe` deste repositório devolveu.

E, ao contrário do Claude, a lista **não depende** de `clientCapabilities.auth.terminal`:

| O que o cliente declara | `authMethods` |
|---|---|
| `fs` + `terminal` | `api-key`, `chat-gpt` |
| `+ auth.terminal` (o que o Lumem declara hoje) | `api-key`, `chat-gpt` — **igual** |
| `+ elicitation.url` | `api-key`, `chat-gpt`, **`chat-gpt-device-code`** |
| `+ auth._meta.gateway = true` | `+ gateway` |
| nada | `api-key`, `chat-gpt` |
| com `NO_BROWSER=1` no ambiente | **só** `api-key` |

A regra está no pacote (`getCodexAuthMethods(clientCapabilities, env)`), e o `authenticate` dele faz:

| Método | O que acontece |
|---|---|
| `api-key` | lê a chave de `_meta["api-key"].apiKey` ou do ambiente — `CODEX_API_KEY`, `OPENAI_API_KEY` |
| `chat-gpt` | o **adaptador** chama `open(authUrl)`: o browser abre na máquina do daemon |
| `chat-gpt-device-code` | pede `elicitation/create` ao cliente com URL + código, e `elicitation/complete` no fim |
| `gateway` | configuração, sem navegador |

⇒ **o caminho de login da [agent-login](../agent-login/prd.md) não serve.** Ele roda o comando que o
adaptador entregou, num PTY; o Codex não entrega comando nenhum — entrega uma **chamada**. O
`startLogin` recusaria com a frase que já tem ("o adaptador não disse o que rodar"), e estaria certo.
O que falta no daemon é `authenticate`, e — para um daemon que pode não estar na mesma máquina que o
navegador — `elicitation/create` + `elicitation/complete`, que é o que troca "abre um browser aí"
por "abra esta URL e digite este código". Isso é o que responde a [C3](open-questions.md).

### 4.3 `session/new` — seletores, modos e comandos

Token zero, e é onde o Codex é mais rico que o Claude:

| O quê | Medido |
|---|---|
| `configOptions` | **5**, todas `type: "select"`: `mode` (categoria `mode`), `collaboration_mode` (`collaboration_mode`, `default`/`plan`), `model` (`model`, 6 valores), `reasoning_effort` (`thought_level`, 4 valores), `fast-mode` (`model_config`) |
| `modes` | **3** — `read-only` "Ask for approval", `agent` "Approve for me", `agent-full-access` "Full access"; `currentModeId: agent` |
| `models.availableModels` | **36** (6 modelos × 6 esforços), numa lista **separada** do `configOptions.model` — o nosso cliente ignora, e continua ignorando |
| `availableCommands` | **não vem na resposta.** Chega depois, como notificação `available_commands_update` — no primeiro turno e no `session/load`. Medido: 40+ comandos, incluindo as skills do projeto |
| `_meta` do `initialize` | `steering`, `goal` (com `controlMethod: "_session/goal"`), `jetbrains.air` |

⇒ **três categorias que nenhuma tela do Lumem viu**: `collaboration_mode`, `thought_level`,
`model_config`. O `ConfigPills` é genérico por `category: string`, então elas desenham — como pílula
com rótulo do agente, que é o desenho. Nada a fazer, e é a primeira vez que isso é **verificado** em
vez de afirmado.

⇒ **o modo é do agente.** A pílula de política do Lumem que a [session-mode](../session-mode/prd.md)
criou não aparece para o Codex — o `modeOwner` é `agent`. Confirmado no `spawn` real: `mode: "agent"`,
`lumemMode: "ask"` guardado e não usado.

### 4.4 Um turno — consumo, e o que o nosso cliente faz dele

`usage_update`, na notificação:

```json
{ "sessionUpdate": "usage_update", "used": 21971, "size": 258400 }
```

Sem `_meta`, sem `_claude/rateLimit`, sem `cost`. A **resposta** do `session/prompt`, por outro lado,
traz mais do que a notificação:

```json
{ "stopReason": "end_turn",
  "usage": { "totalTokens": 21971, "inputTokens": 20558, "cachedReadTokens": 1408,
             "outputTokens": 5, "thoughtTokens": 0 },
  "_meta": { "quota": { "token_count": { … }, "model_usage": [ { "model": "gpt-5.5", … } ] } } }
```

O que o **nosso** cliente produziu, num turno que leu um arquivo e rodou um comando — 25 eventos,
**zero `warn`**:

| Evento | Quantos | Observação |
|---|---|---|
| `message` | 15 | um do usuário, o resto `agent_message_chunk` |
| `commands` | 1 | o `available_commands_update` |
| `thought` | 2 | `agent_thought_chunk` |
| `tool_call` / `tool_call_update` | 2 / 2 | ver 4.5 |
| `usage` | 2 | `{ used, size, cost: null, rateLimit: null }` |
| `turn_end` | 1 | `end_turn` |

⇒ **a F3 já está pronta, e isso é a medição mais valiosa da fase 0.** O `translate.ts` devolveu
`rateLimit: null` e `cost: null` sem nenhuma mudança, o `session_info_update` (3 no fio) caiu na lista
`IGNORED` sem virar evento cinza, e o `UsageFooter` simplesmente não desenha o bloco de limite quando
ele é nulo. A fronteira estava no lugar certo. O que sobra da F3 é **teste**, não código — e é isso
que a [C4](open-questions.md) responde.

⇒ **uma notificação fora do protocolo**: `_auth/status_update`, duas vezes por processo, com
`{ kind: "account", label: "ChatGPT Plus", account: { email, plan } }`. O nosso cliente ignorou sem
reclamar nem cair. É exatamente o estado que o rodapé de login gostaria de mostrar, e está no
[backlog](../../project/backlog.md) em vez de nesta feature.

### 4.5 `terminal/*` e `fs/*` — o Codex não pede nada

**Zero requisições ao cliente**, num turno que leu `hello.txt` e rodou `echo oi`. Ele faz as duas
coisas por conta própria e relata:

```json
{ "sessionUpdate": "tool_call", "kind": "read", "title": "Read file '…/hello.txt'",
  "locations": [ { "path": "…/hello.txt" } ] }
{ "sessionUpdate": "tool_call", "kind": "execute", "title": "echo oi",
  "content": [ { "type": "terminal", "terminalId": "call_R4d5…" } ],
  "_meta": { "terminal_info": { "cwd": "…", "terminal_id": "call_R4d5…" } } }
```

⇒ **o `fs-bridge` e o `terminal-bridge` são código morto para o Codex.** Eles continuam declarados
(honestamente: nós fazemos as duas coisas), e continuam sendo o que o Claude usa.

⇒ **o cartão de terminal da conversa não tem terminal.** O `content` aponta para um `terminalId` que
o **agente** criou — o id da própria `tool_call` —, não para um que o cliente abriu. Quem for
desenhar a saída de comando do Codex lê `_meta.terminal_output_delta` e `_meta.terminal_exit`, ou não
lê nada. Fora desta feature, e no backlog.

⇒ **nenhum `session/request_permission`, em nenhum dos quatro turnos** — inclusive com
`mode: "read-only"`, onde o Codex **criou um arquivo dentro do cwd sem perguntar**. A descrição do
modo dele é honesta e é outra coisa: *"Always ask to edit external files and use the internet"*.
Então os cartões de permissão, a política da session-mode e a linha de fecho do turno **não
aparecem** para o Codex nos três modos que foram dirigidos. Isso não é um defeito a corrigir — é o
que "o modo é do agente" significa —, mas é uma frase que a tela vai ter que dizer algum dia.

### 4.6 `session/load` — retomar funciona

`agentCapabilities.loadSession: true`, e o `manager.resume()` deste repositório, contra o id de uma
sessão de um **processo anterior**, respondeu: replay de `user_message_chunk` + `agent_message_chunk`,
`mode` e `model` de volta, zero `warn`. A D12 e a D13 ficam como estão, e o botão de retomar **não**
some para este agente.

### 4.7 Login — a resposta é `authenticate`

Item 4.2. Resumido: **chamada, não comando**. Para o Lumem, `chat-gpt-device-code` é o único método
honesto — `chat-gpt` abre um navegador na máquina do daemon, que é a máquina errada assim que o
daemon não é o desktop de quem clicou.

### 4.8 Instalar — 20 pacotes, 301 MB, e o CLI vem dentro

`npm install --prefix <dir> @agentclientprotocol/codex-acp@1.10.0`, o mesmo comando do
`install-adapter.ts`, sem uma linha de mudança:

| Medida | Codex `1.10.0` | Claude `0.40.0` |
|---|---|---|
| pacotes | 20 | 105 |
| tamanho | **301 MB** — 285 MB são `@openai/codex-darwin-arm64` | 255 MB |
| tempo | ~4 s (cache quente e cache novo, nesta rede) | ~4 s |
| binário | `node_modules/.bin/codex-acp` | `node_modules/.bin/claude-agent-acp` |
| precisa do CLI no PATH? | **não** | **sim** (`claude`) |

⇒ **o `codex` não precisa estar no PATH.** O adaptador depende de `@openai/codex`, que traz o binário
da plataforma por `optionalDependencies`. Medido: com `PATH=/nonexistent`, o handshake respondeu. Para
o catálogo, isso significa que o CLI que a spec dirige é **opcional**, e que o `setup.agents` de uma
spec assim relata **um** binário, não dois. É a [C2](open-questions.md).

⇒ **pinar o adaptador não pina o agente.** `codex-acp@1.10.0` depende de `@openai/codex: ^0.153.3` —
um caret. Hoje resolveu `0.153.4`; amanhã resolve outro. A A12 ("nunca `@latest`") continua valendo e
continua **insuficiente** para esta família: a versão que o produto fixa é a do adaptador, e a do
agente por baixo dele é a que o npm quiser. Registrado no risco do §7.

### 4.9 Dois defeitos que a fase 0 achou de graça

1. **`configOptions[mode].currentValue` fica velho.** O `setConfig` do `AcpManager` trata `mode` à
   parte: chama `session/set_mode`, escreve `session.info.mode` e **não** mexe na opção. Medido: depois
   de trocar para `read-only`, o evento `config` saiu com `mode: "read-only"` e
   `options[0].currentValue: "agent"`. Ninguém vê porque o `ConfigPills` tem a linha
   `option.id === "mode" ? mode : option.currentValue` — e o Codex é o primeiro agente em que o caso
   existe, porque nele `mode` é **as duas coisas**: um modo e uma `configOption`. O adaptador, quando
   chamado por `session/set_config_option`, devolve `currentValue: "read-only"` correto. Vira task.
2. **O Codex sabe fazer logout e nada no Lumem chama.** `agentCapabilities.auth.logout` e um comando
   `/logout`. Fora desta feature; vai para o backlog.

## 5. Escopo

Reescrito depois da fase 0. O que mudou de tamanho está dito.

### F1 — Catálogo de adaptadores em `shared`

As cinco constantes viram **uma lista**: `ADAPTERS: readonly AdapterSpec[]`, com `id`, `label`,
`package`, `command`, `pinnedVersion`, o CLI que ele dirige e a variável de chave quando existe.
`install-adapter.ts` recebe a spec e instala em `~/.lumem/adapters/<id>`; `setup.agents` relata **por
spec**; o `remedy` do `AcpManager` é montado da spec. Nada no daemon sabe o que é "codex" fora da
lista — é a regra do walking-skeleton levada até o instalador.

Dois campos que a medição acrescentou:

- **`label`**, porque `agentInfo.name` do Codex é `@agentclientprotocol/codex-acp` (§4.1). O nome que
  uma tela mostra não sai do protocolo antes do handshake, então ele mora no catálogo;
- **`cli` opcional**, porque o `codex-acp` traz o próprio binário (§4.8). Spec com `cli` relata dois
  binários no pré-voo; spec sem `cli` relata um. É a [C2](open-questions.md).

### F2 — Login por `authenticate`, e o rodapé com uma linha por agente

**Maior do que o PRD supunha, e por um motivo medido:** o Codex não oferece nenhum método
`type: "terminal"` (§4.2). O painel de login de hoje roda um comando num PTY, e não há comando. O que
entra:

1. **`authenticate` no daemon** — a chamada que falta, com o `_meta["api-key"]` quando o método é
   `api-key`. Uma chave que o usuário digita **atravessa** o daemon e vai para o adaptador; ela não é
   gravada em `~/.lumem`, e essa ausência é a resposta de segurança da feature, do mesmo jeito que o
   `gh` foi na [pull-request-status](../pull-request-status/prd.md);
2. **`elicitation/create` + `elicitation/complete` no cliente**, e `elicitation: { url: {} }` no
   `clientCapabilities` — é o que faz aparecer o `chat-gpt-device-code`, o único método que não abre
   um navegador na máquina do daemon (§4.7). A tela mostra URL e código com o `CopyCommand` que já
   existe;
3. **o rodapé `AgentLogin` com uma linha por agente configurado**, com o estado de cada um.

O que **saiu** do escopo: a escolha de agente no `AgentStep` do primeiro acesso. Por
[C3](open-questions.md), respondida com o número da fase 0: o login do Codex não é um comando, é o
caminho novo e menos testado do produto, e o onboarding não ganha uma decisão por causa dele.

### F3 — Tradução sem Claude assumido: **medida, e já verdadeira**

A F3 era código e virou **teste**. Medido em 4.4: um turno inteiro do Codex atravessou o
`translate.ts` com zero `warn`, `rateLimit: null`, `cost: null`, `session_info_update` ignorado por
nome. Então:

- o perfil "codex-like" do agente falso (`testing/acp-fake-agent.ts`,
  `e2e/support/fake-acp-agent.mjs`) **fixa** esse comportamento: sem `rateLimit`, comandos que chegam
  por notificação e não pela resposta, `mode` também como `configOption`, e — como interruptor — sem
  `loadSession`, que é o caso que o Codex **não** é e que o próximo adaptador pode ser;
- os dois defeitos de 4.9 entram como task: o `currentValue` velho do `mode` é do Lumem e se
  conserta; o `logout` vai para o backlog.

### F4 — A sessão já é por agente — conferir

`NewSessionMenu` lista toda `agent_config`; a cabeça da conversa mostra agente, modelo e modo. A task
aqui é **verificar** que a aba diz qual agente está falando quando há dois, e nada mais.

### F5 — Consumo por agente

`usage.byProject` e `usage.byWorktree` ganham agrupamento opcional por `agent_config`. Ter dois
agentes e não poder comparar o que cada um custou seria não ter dois agentes
([C5](open-questions.md)).

**Correção de uma premissa deste PRD:** a v0.1 dizia que "a linha da sessão já tem
`agent_config_id`". A linha da **sessão** tem; a de `session_usage` **não** — e o consumo se resolve
na escrita, nunca por join depois, que é a regra da tabela. Então o agrupamento custa uma coluna e
uma migração, e não uma cláusula. Está na [T14](tasks.md).

Medido: o Codex reporta `used`/`size` por notificação e um `usage` mais rico **na resposta do
prompt** (§4.4), que o daemon hoje não lê. O agrupamento soma o que já é somado — o
`session_usage` da [workspace-screen](../workspace-screen/prd.md) — e não muda a fonte.

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| Terceiro agente | um por vez, cada um pagando o próprio spike. Volta ao backlog |
| Escolha de agente no primeiro acesso | [C3](open-questions.md), respondida pela fase 0 |
| Empacotar o binário do agente (o Conductor faz) | o Lumem **detecta** — e no caso do Codex nem isso: o adaptador traz o CLI (§4.8) |
| Desenhar a saída de comando do Codex (`_meta.terminal_*`) | §4.5. O cartão de terminal aponta para um terminal do agente; backlog |
| `logout` de agente | §4.9. Backlog |
| Mostrar o `_auth/status_update` no rodapé | §4.4. Backlog |
| Política de permissão por agente | backlog B, `G` |
| Roteamento de tarefa por agente | workspace-tasks, e lá é manual (Q015) |
| Mudanças no caminho PTY | ele já aceita qualquer comando |

## 6. Decisões

- **Versão pinada por adaptador, no catálogo.** A A12 continua — e a fase 0 mostrou que ela é
  **insuficiente** para esta família: `codex-acp@1.10.0` traz `@openai/codex: ^0.153.3`, um caret.
  Pinar o adaptador não pina o agente, e o produto vai dizer a versão que mediu, não a que resolveu;
- **O rodapé nunca inventa número.** Sem `usage` do agente, a resposta é "não informado" — e, medido,
  o Codex informa (`used`/`size`), então o que precisa de teste é o caso de quem **não** informa;
- **A fase 0 decidiu a fase 1**, e mudou duas coisas: a F2 cresceu (login é chamada, não comando) e a
  F3 encolheu (a tradução já passa);
- **O modo é do agente quando o agente tem modo.** O Codex tem três, e os três são dele. A pílula de
  política do Lumem não aparece — e o que "Ask for approval" do Codex significa é *arquivo externo e
  internet*, não *tudo* (§4.5).

## 7. Riscos

| Risco | Defesa |
|---|---|
| adaptador imaturo: publica quase todo dia | pinar; a fase 0 mediu antes; o que faltar é **degradado com aviso**, não emulado. Medido: `session/load`, `fs`, `terminal` e modos todos presentes em `1.10.0` |
| **pinar o adaptador não pina o CLI** (`^0.153.3`) | nomeado no §6. O relatório de pré-voo mostra as **duas** versões quando a spec tem CLI; para o Codex, mostra a do adaptador e diz que o CLI vem dentro |
| login sem terminal, e por browser na máquina errada | **materializou** (§4.2). A defesa é o `chat-gpt-device-code` — URL e código na tela, com `elicitation/*` |
| chave de API atravessando o daemon | ela passa e não fica: não vai para o `~/.lumem`, não vai para log, não volta para a tela. O mesmo desenho da presença-sem-valor do `apiKeyInEnv` |
| `tool_call` com `kind` e `title` diferentes deixa os cartões piores | o `kind` é passthrough com glifo genérico por desenho. Medido: `read` e `execute`, os dois já desenhados |
| Codex não pede permissão dentro do checkout | §4.5. Não é defeito nosso e não é emulável — é o modo dele. Vira frase de tela, não código |
| segunda assinatura para pagar | é seu, e é o motivo de a F5 existir: comparar |
| a cabeça da conversa não deixa claro **qual** agente | F4 confere; se não deixar, é task de tela |

## 8. O que muda no Open Design

Uma tela menos do que o PRD propunha, porque a [C3](open-questions.md) tirou o onboarding do escopo:

1. rodapé `AgentLogin` com **uma linha por agente**, dentro dos mesmos 264px;
2. o painel de login no caminho `authenticate`: o campo de chave (`api-key`) e o par URL + código
   (`chat-gpt-device-code`), que é o `CopyCommand` já desenhado num lugar novo;
3. ~~`AgentStep` com escolha de agente~~ — fora, por C3.

## 9. Fases

0. **Medir** — **feito** em 2026-09-06, §4;
1. **Catálogo** — F1 e os testes da F3, incluindo o perfil codex-like do agente falso. É o grosso do
   daemon, e não toca tela;
2. **Login** — F2: `authenticate`, `elicitation/*`, e o rodapé por agente. Depende do Open Design;
3. **Consumo** — F5 e a conferência da F4.

## 10. Custo nos testes

| Camada | Teste |
|---|---|
| F1 | unit: instalar recebe spec e escreve em `<stateDir>/adapters/<id>`; `setup.agents` relata por spec, e uma spec sem `cli` relata um binário; o `remedy` cita o pacote certo. `npm` dublado, como hoje |
| F3 | integration com o perfil codex-like do agente falso: `usage` sem `rateLimit` → `null` no fio; `_meta` estranha → um `warn` por sessão; sem `loadSession` → `session.resume` recusa com frase; trocar `mode` deixa a `configOption` **coerente** (4.9) |
| F2 | unit do `authenticate` com o agente falso pedindo `api-key` e `device-code`; a chave **não** aparece em nenhum arquivo do `stateDir` depois |
| adaptador real | integration **marcado**, pulado quando `codex-acp` não está instalado — o mesmo padrão do `AcpManager.probe.test.ts`. Para em `initialize` + `session/new`: token zero. Ele é o que pega o `1.11.0` mudando de forma |
| e2e | o rodapé de login com duas linhas contra dois shims no PATH do daemon — o mecanismo do `00-onboarding.spec.ts`, com outro nome. Duas sessões, uma por agente, na mesma worktree: cada aba diz o seu |

Portão: `gate:full`.
