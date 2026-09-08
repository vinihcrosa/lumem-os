# O adaptador do Claude, de `0.40.0` para `0.75.1` — medido

> **Feito em 2026-09-08**, macOS arm64, contra os **dois** adaptadores de verdade:
> `@agentclientprotocol/claude-agent-acp@0.40.0` (o que o produto fixava, instalado globalmente nesta
> máquina) e `0.75.1` (a última publicada, instalada num prefixo descartável). O cliente é o
> **`AcpManager` deste repositório** — SDK `@agentclientprotocol/sdk@1.3.0` —, mais um cliente ndjson
> de 30 linhas para ler o `initialize` cru, com o `_meta` que a normalização descarta.
>
> Motivo: [LUM-54](https://linear.app/lumem-os/issue/LUM-54) / [#76](https://github.com/vinihcrosa/lumem-os/issues/76).
> Procedimento: o da [fase 0 da `second-agent`](../features/021-second-agent/prd.md) — **subir o
> adaptador real contra o `AcpManager` e medir antes de trocar a constante**, porque a suíte fala com
> o `e2e/support/fake-acp-agent.mjs`, que responde o que nós escrevemos que ele responde.
>
> **Cinco turnos** foram gastos, com crédito de assinatura. Handshake, `session/new` e `session/load`
> custam zero.

## 1. O defeito, e o que a medição corrigiu no diagnóstico

Todo turno morria no `session/prompt`:

```
code: -32603,
message: "Internal error: API Error: 400 Claude Code 2.1.160 does not support this model;
          version 2.1.251 or newer is required. Run 'claude update', …"
```

O adaptador **embute o runtime**, e é por isso que `claude update` não resolve:

```
@agentclientprotocol/claude-agent-acp@0.40.0
  └── @anthropic-ai/claude-agent-sdk@0.3.160    ← Claude Code 2.1.160
@agentclientprotocol/claude-agent-acp@0.75.1
  └── @anthropic-ai/claude-agent-sdk@0.3.257    ← Claude Code 2.1.257
```

O `claude` do PATH desta máquina é o `2.1.263` — novo o bastante, e **irrelevante**: quem responde
`session/prompt` é o SDK de dentro do adaptador.

**O que a medição mudou no enunciado da issue:** não é "todo turno morre". É *todo turno com o modelo
que a conta resolve por default*. Medido — `0.40.0` com o modelo trocado para `sonnet` rodou um turno
inteiro, `end_turn`, zero `warn`:

| Adaptador | Modelo | Turno |
|---|---|---|
| `0.40.0` | `claude-fable-5-1[1m]` (o default desta conta) | **400**, "version 2.1.251 or newer is required" |
| `0.40.0` | `sonnet` | `end_turn`, 4 eventos de `usage`, `size: 200000` |
| `0.75.1` | `claude-fable-5-1[1m]` | `end_turn`, `size: 1000000` |

Isso importa por dois motivos. Primeiro, porque explica por que ninguém viu antes: a combinação
quebrada é *adaptador velho × modelo novo*, e o modelo novo chegou depois do pino. Segundo, porque
diz que **um seletor de modelo é um caminho de contorno** — e que a mensagem de erro do adaptador, que
manda rodar `claude update`, aponta para o binário errado.

## 2. `initialize` — o que cada versão declara

| Campo | `0.40.0` | `0.75.1` |
|---|---|---|
| `agentInfo.name` | `@agentclientprotocol/claude-agent-acp` | igual |
| `agentInfo.title` | `Claude Agent` | igual |
| `agentInfo.version` | `0.40.0` | `0.75.1` |
| `protocolVersion` | `1` | `1` |
| `promptCapabilities` | `image`, `embeddedContext` | igual |
| `mcpCapabilities` | `http`, `sse` | igual |
| `loadSession` | `true` | `true` |
| `sessionCapabilities` | `resume`, `list`, `close`, `delete`, `fork`, `additionalDirectories` | **+ `subagents`** |
| `agentCapabilities.auth` | — | **`{ logout: {} }`** |
| `agentCapabilities.providers` | — | **`{}`** |
| `agentCapabilities._meta` | `claudeCode.promptQueueing` | **+ `authStatus: {}`** |
| `_meta` (topo) | **`null`** | `jetbrains.air`, `steering.supported`, `goal` (`controlMethod: "_session/goal"`) |
| `capabilities` que o `probe` reporta | `loadSession`, `prompt.image`, `prompt.embeddedContext` | igual |

**Nada do que o Lumem lê mudou de forma.** O que apareceu é superfície nova que ninguém consulta —
e o `logout`, que o Codex também tem e que continua no [backlog](backlog.md) pelo mesmo motivo.

### `authMethods` — idêntico, incluindo o defeito

As duas versões respondem a **mesma** lista, e só quando o cliente declara
`clientCapabilities.auth.terminal` (a §2.1 da [`009-agent-login`](../features/009-agent-login/prd.md)
continua valendo):

```json
[ { "id": "claude-ai-login", "name": "Claude Subscription", "type": "terminal",
    "args": ["--cli", "auth", "login", "--claudeai"] },
  { "id": "console-login",  "name": "Anthropic Console",  "type": "terminal",
    "args": ["--cli", "auth", "login", "--console"] } ]
```

Nenhuma das duas traz `_meta["terminal-auth"]`, então o `toAuthMethod` deste repositório devolve
`command: null` nas duas — e o `setup.login` recusa nas duas, com *"o adaptador não disse qual comando
rodar"*. **Não é regressão do `0.75.1`**, e é o único lugar onde a medição encontrou o produto pior do
que a documentação sugere. Fica fora desta correção porque o conserto é escolher o que rodar (o
próprio binário do adaptador com aqueles `args`), o que é decisão de desenho, não bump de versão.

## 3. `session/new` — modos, modelos e seletores

| O quê | `0.40.0` | `0.75.1` |
|---|---|---|
| `modes` | 6: `auto`, `default`, `acceptEdits`, `plan`, **`dontAsk`**, `bypassPermissions` | 5: `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions` |
| `configOptions[model]` | 4: `default`, `sonnet`, `haiku`, `claude-fable-5-1[1m]` | 5: **+ `opus[1m]`** |
| `configOptions[effort]` (`thought_level`) | 6: `default`…`max` | igual |
| `configOptions[agent]` | — | **existe**, `category: null`, com os subagents da máquina |
| `currentMode` | `default` | `default` |
| Descrições de modo | presentes | presentes, e reescritas (`default` → "Always ask before making changes") |
| Tempos | — | `spawn` 3 ms, `initialize` 135 ms, `session/new` **~2,4 s** |
| Instalar | 105 pacotes | 105 pacotes, ~3 s |

Três consequências, e nenhuma delas pede código:

- **`dontAsk` saiu do protocolo.** Ninguém neste repositório o cita fora de documentação e do
  protótipo — o seletor é dado do agente e desenha o que vier. A afirmação antiga está anotada no
  §2.4 da [`006-acp-sessions`](../features/006-acp-sessions/prd.md).
- **O `configOption` `agent` chega com `category: null`.** O `acpConfigOptionSchema` já tinha
  `category` como `nullish`, e nenhum componente do web lê o campo — a pílula desenha pelo `id` e
  pelo `name`. É a segunda vez que a genericidade do `ConfigPills` é **verificada** em vez de
  afirmada (a primeira foi a §4.3 da `second-agent`, com três categorias novas do Codex).
- **`opus[1m]` entra na lista sozinho**, o que é o desenho: o seletor de modelo é do agente.

## 4. Um turno inteiro — duas vezes, e o que o cliente fez dele

Dois turnos contra `0.75.1`: um que **lê** um arquivo, um que **escreve** um.

| Medida | Turno de leitura | Turno de escrita |
|---|---|---|
| `stopReason` | `end_turn` | `end_turn` |
| `warn` no `AcpManager` | **0** | **0** |
| `unknown` (`session/update` sem nome nosso) | **0** | **0** |
| `usage` | 7 | 6 |
| `tool_call` / `tool_call_update` | 1 / 3 | 1 / 4 |
| `permission_request` / `permission_resolved` | 0 / 0 | **1 / 1** |
| pedidos `fs/*` ao cliente | **0** | **0** |

- **`usage`**: `{ used, size, cost, rateLimit }`, com `rateLimit: null` sempre e `cost` chegando
  **no último evento do turno** (`{ amount: 0.56353725, currency: "USD" }`). O `size` é a janela do
  modelo — `1000000` no Fable `[1m]`, `200000` no Sonnet. É o que a tela de consumo da
  [`010-workspace-screen`](../features/010-workspace-screen/prd.md) já lê.
- **O pedido de permissão do `0.75.1`**, para um `Write` dentro do cwd, veio com três opções:
  `allow-once` (`allow_once`), `allow-with-updates` (`allow_always`) e `reject` (`reject_once`) — o
  que a [`016-session-mode`](../features/016-session-mode/prd.md) roteia, sem nada novo. Uma
  **leitura** dentro do cwd não pede permissão nenhuma.
- **Zero `fs/*` nos dois turnos, e nas duas versões.** O adaptador lê e escreve por conta própria e
  relata por `tool_call` (`kind: "read"` / `"edit"`, com `content: [{ type: "diff", … }]` na
  escrita). O `fs-bridge` continua declarado — honestamente, nós fazemos as duas coisas —, mas ele
  **não foi exercitado** por nenhum turno medido. A §4.5 da `second-agent` diz que os bridges
  "continuam sendo o que o Claude usa"; medido, não é o caso, e está anotado lá.

### `session/load` — retomar funciona, nas duas

`manager.resume()` contra o `acpSessionId` de uma sessão que **teve um turno**, num processo novo:
`state: running`, `mode` e `model` de volta, zero `warn`, nas duas versões. Duas notas:

- o adaptador **não faz replay** de `user_message_chunk`/`agent_message_chunk` — o transcript do
  Lumem vem do `TranscriptStore`, não do agente. O Codex faz replay; o Claude não, e nunca fez;
- retomar uma sessão **sem turno nenhum** falha com `Resource not found` (o adaptador não tem o que
  carregar). É o comportamento das duas versões, e o produto só oferece retomar para conversa que
  existiu;
- no `0.40.0` o `model` voltava como `default`; no `0.75.1` volta o id concreto
  (`claude-fable-5-1[1m]`). Melhora, não quebra.

## 5. O que mudou no repositório

| Onde | O quê |
|---|---|
| `packages/shared/src/adapters.ts` | `CLAUDE_ADAPTER.pinnedVersion`: `0.40.0` → **`0.75.1`**, com o motivo no comentário |
| `packages/shared/src/adapters.test.ts` | a versão medida, e um teste que fica vermelho se alguém voltar para `0.40.0` |
| `packages/server/src/setup/install-adapter.ts` | **já estar lá não é o mesmo que estar certo**: a versão em disco decide, e uma diferente reinstala |
| `packages/web/src/components/AgentConfigDialog.tsx` | o `placeholder` da versão sai do catálogo, em vez de ser digitado |

O segundo é o que faz o bump valer para quem já usava o produto. Antes, `installAdapter` aceitava
qualquer binário existente e **reportava `spec.pinnedVersion`** — então subir a constante não trocava
nada em nenhuma máquina que já tinha rodado o Lumem, e a tela dizia o número novo enquanto o processo
era o velho. A versão passa a ser lida do `package.json` que o npm escreveu, por dois motivos
medidos:

- `claude-agent-acp@0.40.0` responde `--version` com **string vazia** e exit 0 — o binário não pode
  ser perguntado;
- `0.75.1` responde `0.75.1`. Um produto que confiasse no `--version` teria "não disse a versão"
  exatamente na versão que precisa ser trocada.

Layout sem `package.json` legível fica como está: é diretório que este daemon não escreveu, e
rebaixar 255 MB por um palpite é pior do que reportar o pino.

## 5.1 O que passou a avisar antes do próximo

Medição manual só acontece se alguém souber que está na hora, e nada neste repositório sabia dizer
que o pino tinha parado no tempo. `scripts/check-adapters.ts` — no `vitest`, e por
`pnpm adapters:check` — pergunta ao registro npm duas coisas, e a diferença entre elas é o desenho:

| Pergunta | Por que ela é o que é | O que faz |
|---|---|---|
| o pino está atrás do `latest`? | **sinal fraco.** `0.40.0` era o latest do dia em que foi escrito | avisa. Exigir o latest de um pacote de terceiro é a A12 ao contrário |
| o runtime embutido está atrás do `latest` dele? | **sinal forte** — é a mecânica do §1 | **reprova** acima de 30 releases |
| o runtime vem por faixa? | é o risco nomeado no §7 da `second-agent` (`@openai/codex: ^0.153.3`) | avisa: não há o que consertar deste lado |

O campo `runtime` entrou no catálogo (`AdapterSpec`) para isso: quem quebra um turno é o pacote de
**dentro**, e sem o nome dele numa spec "conferir se envelheceu" seria um `if` por adaptador em quem
confere.

O limite de 30 tem os dois únicos pontos de medição que existem escritos ao lado dele: `0.40.0`
embutia um runtime **87 releases** atrás do publicado e a API recusava; `0.75.1` embute um **6
releases** atrás e roda um turno inteiro. Ele foi conferido **ficando vermelho** contra o pino velho —
com o registro de verdade, a linha é `FALHA claude: … embute @anthropic-ai/claude-agent-sdk@0.3.160,
87 release(s) atrás do 0.3.263`.

Duas coisas que ele **não** é:

- **não é rede obrigatória.** Sem registro ele passa, e o `describe` invertido diz que se pulou. Gate
  que reprova no avião é gate que se aprende a contornar, e este previne um defeito de meses;
- **não substitui o turno.** Ele diz "está na hora de medir", não "funciona". A prova continua sendo
  o §4 deste arquivo, feito à mão.

E o aviso **local**, sem rede e sem heurística nenhuma: a tela do primeiro acesso compara a versão do
adaptador que achou no disco com o pino do catálogo — duas strings — e, quando diferem, diz as duas
mais a frase que a mensagem de erro do adaptador não diz: **ele embute o próprio runtime**, então
`claude update` não resolve. Versão nula não acusa nada: `0.40.0` responde `--version` com string
vazia, e "não deu para ler" não é "está velho".

## 6. O que a suíte continua não vendo

O `gate:full` passa verde com o adaptador em qualquer versão, e isso não é conserto pendente — é o
custo que a [`006-acp-sessions`](../features/006-acp-sessions/prd.md) aceitou de propósito:

- os testes de ACP falam com o `fake-acp-agent.mjs`, que responde o que este repositório escreveu;
- o `AcpManager.integration.test.ts` fala com o adaptador **real**, e **para no `session/new`** —
  porque um `session/prompt` cobraria da pessoa que roda a suíte. Este defeito vivia depois do ponto
  em que ele para, e por isso ele passou verde nas cinco features seguintes. A linha de risco da
  [`009-agent-login`](../features/009-agent-login/prd.md) que dizia que o integration "falha se o
  handshake mudar de forma" está certa e é insuficiente: **o handshake não mudou de forma**;
- o e2e de primeiro acesso da [`008-onboarding`](../features/008-onboarding/prd.md) chega a um turno
  respondido contra o fake, então ele também não veria.

O que substitui isso é **este procedimento**, e ele é manual por decisão de custo: instalar a versão
candidata num prefixo descartável, subir o `AcpManager` deste repositório contra ela, rodar um turno
de leitura e um de escrita, contar `warn` e `unknown`, e só então mexer na constante. Foi assim na
fase 0 da `second-agent` e foi assim aqui. Um turno cobrado numa suíte é uma suíte que ninguém roda;
um bump sem turno é o que produziu a LUM-54.

## 7. Desbloqueio para quem já tem o velho

O daemon não desinstala o que está fora do diretório dele. Numa máquina que instalou o adaptador
globalmente:

```bash
npm i -g @agentclientprotocol/claude-agent-acp@0.75.1
```

Quem usou o instalador do primeiro acesso não precisa fazer nada depois desta mudança: o
`installAdapter` vê `0.40.0` em `~/.lumem/adapters/claude` e reinstala.
