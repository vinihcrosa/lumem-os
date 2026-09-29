# O pensamento volta a chegar, e diz quanto durou

> **Status:** completa
> **Histórico:** v0.1 — proposta em **2026-09-29**, a partir da
> [LUM-66](https://linear.app/lumem-os/issue/LUM-66/reasoning-o-pensamento-parou-de-chegar-desde-2026-09-08-trazer-de),
> do projeto *Conversa — imagem, plano, reasoning e sinal de vida*. A issue pedia a pasta
> `033-conversation-essentials/`; o `033` já era da [acp-only-agents](../033-acp-only-agents/prd.md), e a
> forma da pasta é a [Q1](open-questions.md): **uma por issue**, respondida em 2026-09-29.

## Problem

O raciocínio do agente não chega mais ao Lumem. A tela que o desenha existe desde a
[`006`](../006-acp-sessions/prd.md) (F2.2, A3), mas não recebe nada para desenhar: quem acompanha uma
conversa do Claude vê a resposta sem o caminho até ela, e não tem como saber, durante um silêncio
longo, se o agente está pensando ou parado.

A evidência vem da issue, e foi recontada em 2026-09-29 contra os 38 transcripts em disco
(`~/.lumem/transcripts` e `~/.lumem-dev/shared/transcripts`): **4 sessões têm evento `thought`**
(435, 435, 1 171 e 33 eventos), e todas são de antes de 2026-09-08. As 20 sessões com resposta depois
dessa data têm **zero**. 2026-09-08 é o dia do
[ADR do adaptador](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md): o daemon passou do
`claude-agent-acp@0.40.0` do PATH para o `0.75.1` que ele instala.

A causa foi conferida na cópia instalada (`claude-agent-acp@0.75.1`, SDK `0.3.257`):

- `dist/acp-agent.js:7742` só emite `agent_thought_chunk` quando o bloco tem texto, e o comentário do
  próprio adaptador diz por que ele vem vazio — *"Recent models default `thinking.display` to
  "omitted", which streams signature-only thinking blocks whose text is empty"*;
- o SDK aceita `thinking: { type: "adaptive", display: "summarized" }` (`sdk.d.ts:8448`) e o traduz em
  `--thinking adaptive --thinking-display summarized` para o CLI de dentro;
- o adaptador espalha `_meta.claudeCode.options` direto nas opções do SDK (`acp-agent.js:5860` e
  `:5963`), e o `session/load` passa pelo mesmo caminho (`getOrCreateSession` repassa `params._meta`);
- o `AcpManager` manda `session/new` e `session/load` **sem** `_meta`.

Quando o pensamento voltar, a tela ainda tem três faltas: ela não diz **quanto** o agente pensou, ela
nasce fechada mesmo enquanto o pensamento está sendo escrito — o único momento em que ele é notícia —,
e abrir um pensamento abre **todos** os do turno, porque o estado aberto é guardado pelo `messageId`, e
o transcript de 2026-09-01 mostra o mesmo `messageId` em todos os pensamentos de um turno.

Quando isto sair, uma conversa do Claude mostra *"pensando…"* aberto e brilhando enquanto ele pensa, e
*"pensou por 12,3 s"* fechado quando ele termina.

## Flow

Reusa o catálogo `ADAPTERS` da [`021`](../021-second-agent/prd.md) para declarar o pedido, o caminho
`launch` → `Session` que a `quotaRefusalKind` já faz, o redutor puro `reduceConversation`, o
`formatElapsed` do `ToolCard` para a duração, e o `Thought` que já existe.

1. `CLAUDE_ADAPTER` em `shared/src/adapters.ts` (exists) — declara `reasoningMeta` (door 1)
2. `AcpManager.launch` (exists) — resolve a spec pelo `adapterId` e guarda `reasoningMeta` na `Session`,
   como já faz com `quotaRefusalKind`
3. `AcpManager.handshake` e `AcpManager.load` (exist) — mandam `_meta: reasoningMeta` em `session/new` e
   `session/load` quando ele não é nulo
4. o adaptador emite `agent_thought_chunk` → `translate.ts` (exists) — vira o evento `thought`, sem
   mudança → `TranscriptStore` (exists) grava com o `at`
5. `reduceConversation` em `web/.../conversation-model.ts` (exists) — o bloco `thought` passa a guardar
   `startedAt` e `endedAt`, os `at` do primeiro e do último chunk
6. `Transcript` (exists) — decide aberto/fechado por bloco: a escolha de quem clicou, senão *está sendo
   escrito*
7. out: `Thought` em `Message.tsx` (exists) — o rótulo com a duração, e a classe `thought--live` que
   `conversation.css` (exists) anima

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: `AdapterSpec.reasoningMeta` — o `_meta` que faz um adaptador mandar o raciocínio, mora em `shared/src/adapters.ts`; só o `AcpManager` o lê |
| domain | termo existente: o bloco `thought` do `conversation-model` era `{ messageId, text }` e ganha `startedAt` e `endedAt` — quem ramifica nele hoje é só o `BlockView` do `Transcript` |
| domain | termo existente: `openThoughts` era um conjunto de `messageId`; passa a ser a escolha de quem clicou, por bloco — ninguém fora do `Transcript` o lê |
| adaptador | o Claude passa a pensar com `--thinking adaptive --thinking-display summarized`. A cobrança, pela [documentação da Anthropic](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking), é a mesma para `summarized` e `omitted`; a medição do AC 5 a confere |
| adaptador | o `session/new` do probe (`AcpManager.probe`) **não** muda: ele não faz turno, e o pedido não altera `configOptions` |
| stored data | nada a migrar: o `at` já está em todo evento gravado, então as 4 sessões antigas com pensamento ganham duração no replay |

## Relations

None - no stored-data shape change

## Surface

None - nothing consumed outside

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. a spec declara um `_meta` opaco do adaptador | `reasoningMeta: Readonly<Record<string, unknown>> \| null` em `AdapterSpec`; Claude `{ claudeCode: { options: { thinking: { type: "adaptive", display: "summarized" } } } }`, Codex `null` | `if (adapterId === "claude")` no `AcpManager` — o [ADR de 2026-09-13](../../adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md) proíbe; um campo tipado `thinking: { type, display }` — escreve o vocabulário do Claude (`adaptive`, `summarized`) no modelo do Lumem, e o Codex não tem essas palavras; a variável `MAX_THINKING_TOKENS` — o adaptador a traduz em `enabled` com orçamento e **sem** `display`, e o texto continua vazio |

- Nothing else in this change is hard to reverse

## Criteria

### S1: o pensamento chega (P1)

O daemon pede o pensamento resumido, e um turno real do Claude grava `thought` com texto.

**Acceptance Criteria**

1. WHEN the daemon opens a session for an adapter whose spec declares a non-null `reasoningMeta` THEN the `session/new` request SHALL carry `_meta` deep-equal to that `reasoningMeta`
2. WHEN the daemon resumes such a session THEN the `session/load` request SHALL carry `_meta` deep-equal to that `reasoningMeta`
3. IF the spec declares `reasoningMeta: null`, or the session was spawned without an `adapterId` THEN `session/new` and `session/load` SHALL carry no `_meta` key
4. The `CLAUDE_ADAPTER` spec SHALL declare `reasoningMeta` equal to `{ claudeCode: { options: { thinking: { type: "adaptive", display: "summarized" } } } }` and the `CODEX_ADAPTER` spec SHALL declare `null`
5. WHEN one real turn runs against `claude-agent-acp@0.75.1` through the `AcpManager` on the adapter's default model THEN the session SHALL emit at least 1 `thought` event whose text is non-empty
6. WHEN the same real turn runs on each model the adapter's `session/new` offers THEN every turn SHALL close with `turn_end` and none SHALL be refused

**Independent test:** `pnpm measure:thinking` contra a cópia do adaptador que o daemon de dev instalou.

### S2: duração, e aberto enquanto pensa (P2)

O bloco de pensamento diz quanto durou, abre sozinho enquanto é escrito e fecha sozinho quando acaba.

**Acceptance Criteria**

7. WHEN consecutive `thought` events with the same `messageId` are reduced into one block THEN the block SHALL hold `startedAt` equal to the `at` of the first event and `endedAt` equal to the `at` of the last
8. WHEN a thought block is not streaming and its `endedAt` is greater than its `startedAt` THEN its label SHALL read `pensou por ` followed by `formatElapsed(endedAt - startedAt)` — `pensou por 12,3 s` for 12 300 ms
9. IF a thought block is not streaming and its `endedAt` equals its `startedAt` THEN its label SHALL read `pensou`
10. WHILE a thought block is streaming and nobody has clicked it the system SHALL render its text expanded
11. WHEN a thought block stops streaming and nobody has clicked it THEN the system SHALL render it collapsed
12. IF someone clicked a thought block THEN the system SHALL keep it in the state that click chose, streaming or not
13. WHEN someone clicks one thought block THEN the other thought blocks of the same turn SHALL keep their state, even when they share its `messageId`
14. WHILE a thought block is streaming its label SHALL carry the class `thought--live`, and SHALL NOT carry it otherwise
15. The stylesheet SHALL animate `.thought--live` and SHALL set `animation: none` on it under `prefers-reduced-motion: reduce`
16. WHEN a finished conversation is replayed THEN every thought block SHALL render collapsed, with the same label the live reducer produced

**Independent test:** `pnpm dev`, uma conversa com o Claude — o pensamento abre brilhando, fecha em `pensou por …` quando a resposta começa.

## Out of scope

| Excluded | Why |
| --- | --- |
| um contador vivo em *"pensando…"* | pede um relógio na tela; o que a issue pede é a duração de um pensamento que acabou |
| o raciocínio do Codex com conta de API key | o `codex-acp@1.10.0` desliga o resumo sozinho nesse caso (`disableSummary` quando `account.type === "apiKey"`); ligá-lo é configuração do adaptador, não do Lumem |
| o pensamento nas sessões internas da memória (`memory/capture.ts`, `memory/auto-learn.ts`) | nenhuma tela as lê; elas passam o `adapterId` pelo `launchIdentity` da `028` T17 e recebem o pedido do mesmo jeito, sem prova própria |
| as outras três issues do projeto (LUM-64 imagem, LUM-65 plano, LUM-67 sinal de vida) | cada uma é a sua feature, com a sua pasta ([Q1](open-questions.md)) |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| o pedido de pensamento resumido é um interruptor na tela de configurações? | não — ligado sempre, sem interruptor | a documentação da Anthropic diz que a cobrança é idêntica para `summarized` e `omitted`; [Q2](open-questions.md), aceita | y |
| o Codex precisa de pedido? | não — `reasoningMeta: null` | o `codex-acp@1.10.0` já pede `summary: "auto"` em todo turno (`dist/index.js`, `sendPrompt`), exceto conta de API key e modelo sem raciocínio | n |
| a chave do estado aberto de um bloco | a posição do bloco na conversa, `turno:bloco` | o `messageId` é compartilhado pelos pensamentos de um turno; blocos só são acrescentados ao fim do turno, então a posição não muda | n |
| o brilho | a animação de `.thought--live`, com `var(--token)` como qualquer regra da conversa | a regra de design do repositório; o desenho fica para o CSS, que *constrói e ajusta* | n |

**Open questions:** none - all resolved or logged above. A [Q1](open-questions.md) e a [Q2](open-questions.md) foram respondidas em 2026-09-29, as duas pela recomendação.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen conversa · bloco de pensamento | empty state | existing - `Thought` sem texto não desenha a linha de espiada (`Message.test.tsx`) |
| screen conversa · bloco de pensamento | loading state | AC 10, AC 14 |
| screen conversa · bloco de pensamento | error state | n/a - um pensamento não falha sozinho; a falha é do turno, e o turno já tem a linha de fecho |
| screen conversa · bloco de pensamento | unauthorised state | n/a - a conversa já exige a sessão aberta; o bloco não tem permissão própria |
| screen conversa · bloco de pensamento | density and ordering | AC 13 - cada bloco é independente, na ordem em que chegou |
| screen conversa · bloco de pensamento | destructive action confirms | n/a - abrir e fechar não destrói nada |
| screen conversa · bloco de pensamento | motion | AC 15 |

## Sources

- [LUM-66](https://linear.app/lumem-os/issue/LUM-66/reasoning-o-pensamento-parou-de-chegar-desde-2026-09-08-trazer-de) — o defeito, a causa e as duas partes
- [Adaptive thinking · Billing](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking) — `summarized` e `omitted` cobram o mesmo
