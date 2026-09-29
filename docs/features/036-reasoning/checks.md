# O pensamento volta a chegar — checks

> **Status:** completa

Profile: standard
Plan: `docs/features/036-reasoning/prd.md`

18 checks in 2 slices · 1 one-way door · 0 open

## Checks

Os comandos de prova rodam da raiz. `S` é `pnpm --filter @lumem/server exec vitest run`, `H` é
`pnpm --filter @lumem/shared exec vitest run` e `W` é `pnpm --filter @lumem/web exec vitest run` —
escritos por extenso em cada `Proof:`.

### S1 - o pensamento chega · 7 files · ~40k

**C1** - O `session/new` de uma sessão cujo `adapterId` tem `reasoningMeta` não nulo leva `_meta` igual a ele, por igualdade profunda (AC 1)
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "sends the spec's reasoningMeta on session/new"`

**C2** - O `session/load` de uma sessão retomada com esse `adapterId` leva o mesmo `_meta` (AC 2)
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "sends the spec's reasoningMeta on session/load"`

**C3** - Com `adapterId: "codex"` (spec com `reasoningMeta: null`), nem o `session/new` nem o `session/load` têm a chave `_meta` (AC 3)
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "sends no _meta when the spec declares no reasoningMeta"`

**C4** - Sem `adapterId`, nem o `session/new` nem o `session/load` têm a chave `_meta` (AC 3)
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "sends no _meta without an adapterId"`

**C5** - `CLAUDE_ADAPTER.reasoningMeta` é `{ claudeCode: { options: { thinking: { type: "adaptive", display: "summarized" } } } }` e `CODEX_ADAPTER.reasoningMeta` é `null` (AC 4)
Proof: `pnpm --filter @lumem/shared exec vitest run src/adapters.test.ts -t "declares the reasoningMeta each adapter needs"`

**C6** - Uma sessão aberta e depois retomada pelo `SessionStore` com uma configuração do catálogo (`claude-agent-acp`) manda o `reasoningMeta` do Claude no `session/new` e no `session/load` (AC 1, AC 2)
Proof: `pnpm --filter @lumem/server exec vitest run src/sessions/SessionStore.test.ts -t "asks the catalogued adapter for its reasoning on open and on resume"`

**C7** - Um turno real contra a cópia do `claude-agent-acp@0.75.1` que o daemon de dev instalou, no modelo padrão, pelo `AcpManager`, emite pelo menos 1 evento `thought` com texto não vazio; e o mesmo turno em **cada** modelo que o `session/new` oferece fecha com `turn_end` sem recusa — o script sai 0 só se as duas coisas valem, e imprime os tokens de saída com e sem o pedido (AC 5, AC 6)
Proof: `pnpm measure:thinking`

### S2 - duração, e aberto enquanto pensa · 7 files · ~30k

**C8** - Três eventos `thought` com o mesmo `messageId` em `at` 1 000, 5 000 e 13 300 viram um bloco com `startedAt` 1 000 e `endedAt` 13 300 (AC 7)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-model.test.ts -t "keeps the at of the first and the last chunk of a thought"`

**C9** - Um `Thought` que não está em stream, com `startedAt` 1 000 e `endedAt` 13 300, tem o rótulo `pensou por 12,3 s` (AC 8)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Message.test.tsx -t "says how long it thought"`

**C10** - Um `Thought` que não está em stream, com `startedAt` igual a `endedAt`, tem o rótulo exatamente `pensou` (AC 9)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Message.test.tsx -t "says only that it thought when it has no duration"`

**C11** - No `Transcript`, o pensamento que é o último bloco de uma conversa em stream, sem clique, tem `aria-expanded="true"` e o corpo `.thought__text` à vista (AC 10)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Transcript.test.tsx -t "opens a thought while it streams"`

**C12** - O mesmo pensamento, sem clique, fica `aria-expanded="false"` e sem `.thought__text` quando um bloco de mensagem chega depois dele (AC 11)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Transcript.test.tsx -t "closes a thought when it stops streaming"`

**C13** - Um pensamento fechado por clique durante o stream continua fechado quando ele termina, e um pensamento aberto por clique depois de terminar continua aberto quando outro bloco chega (AC 12)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Transcript.test.tsx -t "keeps the state a click chose"`

**C14** - Num turno com dois pensamentos de mesmo `messageId` separados por uma ferramenta, clicar no primeiro o abre e deixa o segundo `aria-expanded="false"` (AC 13)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Transcript.test.tsx -t "toggles one thought without the other"`

**C15** - O botão do `Thought` tem a classe `thought--live` com `streaming` e não a tem sem ele (AC 14)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Message.test.tsx -t "marks the label live only while streaming"`

**C16** - `conversation.css` tem uma regra `.thought--live` com `animation` e, dentro de `@media (prefers-reduced-motion: reduce)`, `.thought--live` com `animation: none` (AC 15)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-css.test.ts -t "animates the live thought and stops under reduced motion"`

**C17** - Uma conversa terminada, remontada por `replayConversation` a partir das entradas gravadas, desenha todos os pensamentos com `aria-expanded="false"` e com o mesmo rótulo de duração que o redutor ao vivo produziu (AC 16)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Transcript.test.tsx -t "replays thoughts collapsed with their duration"`

**C18** - O rótulo de um `Thought` em stream continua sendo `pensando…`, com ou sem duração no bloco (AC 8, AC 9)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/Message.test.tsx -t "says it is thinking while it still is"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| pedidos que levam o `_meta` (2) | `session/new` C1 · `session/load` C2 | - |
| o que a sessão sabe do adaptador (3) | spec com `reasoningMeta` C1 · spec com `null` C3 · sem `adapterId` C4 | - |
| specs em `ADAPTERS` (2) | `claude` C5 · `codex` C5 | - |
| lugares da conversa que dão o `adapterId` ao `AcpManager` (2) | `SessionStore` ao abrir C6 · `SessionStore` ao retomar C6 | - |
| modelos que o `session/new` do Claude oferece (5) | `default` C7 · `opus[1m]` C7 · `claude-fable-5-1[1m]` C7 · `sonnet` C7 · `haiku` C7 | - |
| rótulo do pensamento (3) | em stream `pensando…` C18 · com duração C9 · sem duração C10 | - |
| aberto ou fechado (4 linhas) | em stream, sem clique → aberto C11 · terminado, sem clique → fechado C12 · clicado para fechar → fechado C13 · clicado para abrir → aberto C13 | - |
| classe `thought--live` (2) | em stream C15 · terminado C15 | - |
| regra de movimento (2) | animada C16 · `prefers-reduced-motion: reduce` C16 | - |

- Nenhuma rota: o plano tem `Surface` vazio, então nenhum status a juntar
- C7 é a única prova que atravessa o adaptador de verdade; C1–C6 provam o que o daemon manda, e não o que o adaptador faz com isso

## Test policy

A matriz de `docs/project/testing.md` diz a camada (transporte ACP com agente falso, componente em
jsdom, CSS lido como texto) e não diz quanto do espaço de entrada uma prova tem que cobrir; estas
linhas são a régua desta construção.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por uma fronteira | uma na fronteira **e** uma na própria camada | o contrato na fronteira; um caso por linha da tabela de decisão na própria camada |
| Decide, sem fronteira | uma na própria camada | um caso por linha da tabela de decisão |
| Instrumentação, repasse | nenhuma própria | coberto pela prova de quem consome |

Evidence:

- `AcpManager.handshake`/`load` com o `_meta`: decide sobre 3 estados (spec com meta, spec nula, sem `adapterId`), alcançado pelo `SessionStore` → C1–C4 na camada, C6 na fronteira
- `adapters.ts`: dados, sem decisão → C5 afirma o literal
- `reduceConversation`, caso `thought`: 2 pontos de decisão (junta ou abre bloco) → C8
- `Thought`: 3 rótulos e 2 estados de classe → C9, C10, C15, C18
- `Transcript`, aberto/fechado: 4 linhas → C11–C14
- análogo mais próximo: `quotaRefusalKind`, a mesma forma spec → `launch` → `Session`, provada em `AcpManager.test.ts` pelos dois `adapterId`

Cost: 17 provas na própria camada em 6 arquivos de teste, mais o script de medição. Sem estas linhas,
a sessão sem `adapterId` e o pensamento clicado durante o stream seriam provados só por um caminho que
por acaso passa neles.

## Swept

- validation: n/a - nada de entrada de usuário; o `reasoningMeta` é literal no código, conferido por C5
- failure modes: C7 - um modelo que recusasse o pedido adaptativo falharia o turno, e C7 percorre todos
- idempotency: n/a - `session/new` e `session/load` já são chamados uma vez por abertura; o `_meta` não muda isso
- authorization: existing - a conversa exige a sessão; o pedido não abre porta nova
- concurrency: C13 - o clique e o fim do stream chegam em qualquer ordem, e a escolha do clique vence
- data lifecycle: C17 - transcripts antigos, gravados antes desta feature, ganham duração no replay
- dependency failure: C3 - o Codex, que não declara pedido, segue sem `_meta`; C7 para o adaptador que declara
- state transitions: C11, C12, C13
- observability: n/a - nenhum log novo; a ausência de pensamento continua visível na própria tela

## Handoff

- S1 ≈ 40k (o `AcpManager.ts` tem 2 818 linhas, lido por trechos); S2 entra no web a ≈ 70k no total, abaixo do orçamento de 150k — um construtor

- **Boundary:** C1–C7 fechados no commit da Parte 1. `pnpm measure:thinking` saiu 0 em 2026-09-29: pensamento no padrão (165 caracteres) e `end_turn` em `default`, `opus[1m]`, `claude-fable-5-1[1m]`, `sonnet` e `haiku` — o Haiku 4.5 aceita o `--thinking adaptive` que o pedido liga
- **Settled mid-build:** a Q2 não reabre — a tabela está na [resposta dela](open-questions.md)
- **Abandoned:** nada
- **Boundary:** C8–C18 fechados no commit da Parte 2; C12 e C14 conferidos por mutação (`?? true` no lugar de `?? streaming`, e a chave de volta ao `messageId`)
- **Settled mid-build:** nada
- **Abandoned:** nada
