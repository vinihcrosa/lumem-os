# O adaptador do Claude, de `0.75.1` para `0.89.1` — medido

> **Feito em 2026-10-10**, macOS arm64, contra os **dois** adaptadores de verdade, cada um num prefixo
> descartável: `@agentclientprotocol/claude-agent-acp@0.75.1` (o pino de então) e `0.89.1` (a última
> estável publicada, do mesmo dia). O cliente é o **`AcpManager` deste repositório**, mais um cliente
> ndjson cru para ler o `initialize` com o `_meta` que a normalização descarta.
>
> Motivo: o `adapters:check` (§5.1 da [medição anterior](claude-agent-acp-0.75.md)) reprovou o pino —
> *"`0.75.1` embute `@anthropic-ai/claude-agent-sdk@0.3.257`, 36 release(s) atrás do 0.3.296 — acima
> do limite de 30"*. O detector fez o que foi escrito para fazer: avisou **antes** de um turno quebrar.
>
> Procedimento: o do §6 da medição anterior — instalar a candidata, subir o `AcpManager` contra ela,
> rodar turnos de verdade, contar `warn` e `unknown`, e só então mexer na constante.

## 1. O runtime embutido

```
@agentclientprotocol/claude-agent-acp@0.75.1
  └── @anthropic-ai/claude-agent-sdk@0.3.257    ← 36 releases atrás do 0.3.296
@agentclientprotocol/claude-agent-acp@0.89.1
  └── @anthropic-ai/claude-agent-sdk@0.3.293    ← 3 releases atrás
```

Nenhum turno do `0.75.1` falhou nesta máquina — o pino velho ainda respondia. A troca é **preventiva**,
que é o ponto do limite de 30: o defeito da LUM-54 apareceu quando um modelo novo chegou e o runtime
embutido não o conhecia, e a distância em releases é o que antecipa isso.

Instalar: 100 pacotes, ~3 s, 289 MB (o `0.75.1`: 99 pacotes, 253 MB).

## 2. `initialize` — o que cada versão declara

O diff cru das duas respostas tem **uma** diferença além do `agentInfo.version`: o `_meta` do topo
perdeu `jetbrains.air` e `goal` (`controlMethod: "_session/goal"`). Nenhum dos dois é lido por este
repositório — conferido por `grep` em `packages/*/src`.

O resto é igual, campo a campo: `protocolVersion: 1`, `promptCapabilities`, `mcpCapabilities`,
`loadSession`, `sessionCapabilities`, `agentCapabilities` (com `auth.logout` e `_meta.authStatus`) e os
**mesmos** `authMethods` — ainda sem `_meta["terminal-auth"]`, então o defeito do §2 da medição
anterior (`command: null` no `toAuthMethod`) continua igual nas duas, e continua fora desta troca.

A notificação `_auth/status_update` chega duas vezes no handshake, com a mesma forma nas duas versões.
O `--cli auth status` (`identity: "cli-auth-status"` no catálogo) responde JSON com `loggedIn`, e-mail
e `subscriptionType` nas duas; o `0.89.1` acrescenta `configDirectory`.

## 3. `session/new` — modos, modelos e seletores

| O quê | `0.75.1` | `0.89.1` |
|---|---|---|
| `modes` | `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions` | igual, com as mesmas descrições |
| `configOptions[model]` | `default`, **`opus[1m]`**, `claude-fable-5-1[1m]`, `sonnet`, `haiku` | `default`, **`opus`**, `claude-fable-5-1[1m]`, `sonnet`, `haiku` |
| modelo corrente nesta conta | `opus[1m]` | `opus` |
| `effort` (`thought_level`), `fast` (`model_config`), `agent` (`category` ausente) | — | iguais |
| `session/new` | ~4,3 s | ~4,7 s |

**A única mudança é o id do Opus: `opus[1m]` virou `opus`.** No código de produção ninguém cita o id —
o seletor é dado do agente. Quem pode senti-lo é **dado gravado**: o modelo default de uma conta salvo como
`opus[1m]`, ou o modelo de uma conversa retomada que estava nele, deixa de estar na lista. Os dois
casos o produto já trata — `reportAccountDefaultUnavailable` (`034` T9, chamado em
`start-agent-session.ts`) e `reportModelUnavailable` (`033` F6.2, chamado no `SessionStore`): a sessão
segue no modelo que o agente tem, e a conversa ganha uma linha dizendo o que foi pedido e o que veio. Não é silencioso, e não
pede código. Os `opus[1m]` em `session.test.ts` são dado de fake e continuam válidos como dado de fake.

## 4. Turnos inteiros contra `0.89.1`

Quatro turnos com o modelo default da conta (`opus`), mais um `session/load` num processo novo.

| Medida | Leitura | Escrita | Plan mode | Pensamento |
|---|---|---|---|---|
| `stopReason` | `end_turn` | `end_turn` | `cancelled` | `end_turn` |
| `warn` no `AcpManager` | **0** | **0** | **0** | **0** |
| `unknown` | **0** | **0** | **0** | **0** |
| `tool_call` (`kind`) | 1 (`read`) | 1 (`edit`) | 4 (`edit`, `other`, `execute`, `switch_mode`) | 0 |
| `permission_request` / `permission_resolved` | 0 / 0 | 1 / 1 | 1 / 1 | 0 / 0 |
| `usage` | 4 | 5 | 7 | 3 |
| `thought` | 0 | 0 | 0 | **28** (381 caracteres) |

- **Leitura** dentro do cwd não pede permissão, como no `0.75.1`.
- **Escrita** pede, com as mesmas três opções e os mesmos ids: `allow-once` (`allow_once`),
  `allow-with-updates` (`allow_always`), `reject` (`reject_once`). O arquivo foi escrito.
- **`usage`** tem a mesma forma: `{ used, size, cost, rateLimit }`, `rateLimit: null`, `size: 1000000`
  no `opus`, `cost` em USD no último evento do turno.
- **Pensamento** chega, mas **só com o `reasoningMeta` do catálogo** — o manager só o aplica quando o
  spawn diz `adapterId`. O mesmo prompt sem ele não produz `thought`, que é exatamente o que o comentário
  do `reasoningMeta` em `adapters.ts` (medido no `0.75.1`, `036`) diz. Estaticamente, o `0.89.1` ainda
  lê `_meta.claudeCode.options` no `session/new` e ainda só emite `agent_thought_chunk` com texto.
- **`session/load`** num processo novo, contra a sessão com três turnos: `state: running`, `mode: plan`
  (o modo em que a sessão estava) e `model: opus` de volta, zero `warn`, e **nenhum replay** — como no
  `0.75.1`. O transcript continua sendo do `TranscriptStore`.

### Plan mode — uma opção nova

O pedido de aprovação do plano (`switch_mode`, título *"Approve Plan"*) chegou com **cinco** opções, não
as quatro que a [`035-plan-mode`](../features/035-plan-mode/checks.md) mediu no `0.75.1`, e em outra ordem:

| `optionId` | `name` | `kind` |
|---|---|---|
| `exit-plan-default` | Yes, manually approve edits | `allow_once` |
| `exit-plan-clear-auto` | Yes, clear context (4% used) and use auto mode | `allow_always` |
| `exit-plan-auto` | Yes, and use auto mode | `allow_always` |
| **`exit-plan-bypass`** | **Yes, and bypass permissions** | `allow_always` |
| `reject` | No, keep planning | `reject_once` |

Recusar (`reject`) manteve o modo em `plan`, terminou com `cancelled` e não renomeou nada — o C26 da
`035`, igual.

**Nada no código muda**, e é a decisão da Q1 da `035` pagando: o `PlanApproval.tsx` agrupa por `kind`
(`allow*` e `reject*`) e mostra o `name` verbatim, então a quinta opção vira um botão a mais; Enter
continua escolhendo a `allow_once`; e a política do Lumem (`permission-policy.ts`) nunca aprova um
`switch_mode` sozinha, em modo nenhum. **O que muda é o que a pessoa vê:** um clique no cartão agora
pode sair do plan mode direto para `bypassPermissions`. É escolha explícita, com o texto do adaptador
na tela — mas é o botão de maior alcance que o cartão já teve, e a pessoa deve saber que ele está lá.

O `e2e/support/fake-acp-agent.mjs` continua com as quatro opções do `0.75.1` — o C25 da `035` as
descreve assim, e o fake é desenho, não espelho.

### Recusa por cota

Não medida: nenhuma cota esgotou. Estaticamente, o caminho que produz o `data.errorKind` do
`quotaRefusalKind: "rate_limit"` (`034`) é o mesmo nas duas versões —
`internalErrorForClient(errorKindData(lastAssistantError), …)` em `acp-agent.js`. Fica como
**conferido no código, não no turno**.

## 5. O que mudou no repositório

| Onde | O quê |
|---|---|
| `packages/shared/src/adapters.ts` | `CLAUDE_ADAPTER.pinnedVersion`: `0.75.1` → **`0.89.1`**, e o runtime de cada versão no comentário do `runtime` |
| `packages/shared/src/adapters.test.ts` | a versão medida |
| `packages/server/src/setup/reconcile-adapters.test.ts` | o upgrade compara com o pino do catálogo, em vez de um literal que envelhece a cada troca |

Quem usa o instalador do primeiro acesso não faz nada: o `reconcileAdapters` vê o `0.75.1` no disco,
diferente do pino, e reinstala. Numa máquina com o adaptador global:

```bash
npm i -g @agentclientprotocol/claude-agent-acp@0.89.1
```

## 6. Custo

Seis turnos com crédito de assinatura: os quatro da tabela, mais um ou dois de uma primeira execução
do roteiro de medição que caiu por defeito **do roteiro** (um listener de permissão por turno, nunca
removido, respondia o mesmo pedido duas vezes — `NOT_FOUND` no segundo). Handshake, `session/new`,
`session/load` e `--cli auth status` custam zero.
