# Sinal de vida da conversa — checks

**Status:** em execução
Profile: ui
Plan: `docs/features/037-conversation-liveness/prd.md`

31 checks em 4 fatias · 4 portas de mão única · 0 abertas. C28–C30 e a reescrita do C25 vieram da
verificação da rodada 1, o C31 da rodada 2 (ampliado na 4) e a segunda prova do C7 da rodada 5 ([Q5](open-questions.md#x-q5--dois-prompt-na-mesma-sessão-ao-mesmo-tempo-são-permitidos)); todos aprovados em 2026-09-29.

As provas nomeiam testes que **ainda não existem**: o nome é a obrigação, e o construtor escreve o
teste com esse nome a partir do check, nunca lendo a implementação. `S` abrevia
`pnpm --filter @lumem/server exec vitest run`, e `W`, `pnpm --filter @lumem/web exec vitest run` —
as linhas de `Proof:` trazem o comando inteiro.

Sem `## Test policy`: a matriz de [testing.md](../../project/testing.md#matriz-de-cobertura) já
responde o nível de cada camada que isto toca — transporte ACP em integração com o agente falso,
componente e redutor do `web` em unit, CSS pelo teste que lê os arquivos nas duas direções.

## Checks

### S1 - o turno fecha quando o adaptador morre · 6 arquivos · ~110 KB lidos em parte · ~40k

**C1** - Com um turno em voo, a saída do processo emite exatamente um `turn_failed` com `o agente encerrou no meio do turno (saída 137)`, gravado na transcrição e recebido por um listener anexado antes da saída (AC 1, door 1) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "closes the turn in flight when the adapter exits"`

**C2** - A frase nomeia como o processo saiu: `(saída 137)` com código, `(sinal SIGKILL)` com sinal e sem código, `(saída desconhecida)` sem nenhum dos dois — tabela com os três casos (AC 1) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "names how the adapter exited"`

**C3** - Um adaptador que sai com o stdout ainda aberto faz o `prompt` daquele turno rejeitar com `AcpTurnFailedError` em menos de 1 s, e `liveTurns()` passa a não ter a sessão (AC 2) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "releases the prompt when the adapter exits with its stdout open"`

**C4** - Nas duas ordens — a saída antes de o stdout fechar, e o stdout fechando antes da saída — a transcrição do turno tem exatamente um `turn_failed` (AC 3, door 2) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "closes the turn once whichever side of the pipe goes first"`

**C5** - A saída entre dois turnos — depois de um `turn_end` — não acrescenta `turn_failed` à transcrição (AC 4) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "says nothing when the adapter exits between turns"`

**C6** - A saída que fecha um turno grava um retrato `turn-failed` no `turnFailures` com `code: "exited"` e o `sessionId` da sessão (AC 5) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "records the exit as a turn-failed portrait"`

**C7** - Uma conversa somente leitura cuja transcrição termina em mensagem do usuário sem fecho não desenha `.mcaret`, nem a linha de estado do turno, nem o botão `■ interromper` — e uma que termina numa `message` do agente sem fecho também não desenha `.mcaret` (AC 6; ampliado na rodada 5) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation.test.tsx -t "conversa encerrada sem fecho não desenha turno vivo"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation.test.tsx -t "conversa encerrada com resposta do agente sem fecho não desenha caret"`

**C28** - Com o processo saindo com código 137 enquanto a leitura do teto ou a da memória está pendente, a transcrição do turno é a mensagem do usuário seguida de exatamente um `turn_failed` com `o agente encerrou no meio do turno (saída 137)`, o `prompt` rejeita com `AcpTurnFailedError`, o agente não recebe `session/prompt`, e o `/acp` não manda frame `error` (AC 27, Q4) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "keeps the question when the adapter exits before it is asked"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/websocket.test.ts -t "sends no error frame for a turn the exit already closed"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "keeps the question, and drops the memory, when the adapter exits while memory is read"`

**C29** - Com a resposta do `session/prompt` e a saída do processo no mesmo tique, a transcrição do turno tem exatamente um fecho, o `turn_failed` da saída, nenhum `turn_end`, e o `prompt` rejeita com `AcpTurnFailedError` (AC 28, door 2) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "closes once when the answer and the exit arrive together"`

**C30** - Com o stdout fechando antes da saída — o caminho do processo real —, o fecho diz `o agente encerrou no meio do turno (saída 137)` quando a saída chega no prazo, e `(saída desconhecida)` quando não chega, nunca `ACP connection closed` (AC 1) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "names the exit even when the pipe closes first"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "names an unknown exit when the process outlives its closed pipe"`

**C31** - Com um `prompt` segurado na leitura do teto e um segundo `prompt` à mesma sessão, os dois resolvem com o seu `stopReason`, a transcrição tem as duas mensagens do usuário e nenhum `turn_failed`; e, com o processo saindo com os dois em voo, os dois rejeitam com `AcpTurnFailedError` em menos de 1 s — e, com os dois segurados na leitura do teto quando o processo sai, a transcrição é exatamente `[message: primeira, message: segunda, turn_failed]`, com um retrato `turn-failed` só; e, com o primeiro segurado, o segundo terminado e então a saída, o primeiro rejeita com `AcpTurnFailedError` e a transcrição termina em `turn_failed` (AC 29, Q5, door 4; ampliado na rodada 4) ✓
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "lets a second prompt run without stranding the first"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "releases both prompts when the adapter exits with two in flight"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "records both questions and one closing when the adapter exits with two held"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "closes the remaining prompt when the adapter exits after the first one ends"`

### S2 - a queda da conexão aparece e se conserta · 8 arquivos · ~60 KB · ~30k

**C8** - O socket fechando com `1006` mostra `conexão com o daemon caiu — reconectando` e chama `connect` de novo para a mesma sessão (AC 7, door 3) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "mostra a queda e reabre o socket"`

**C9** - Com relógio falso e cada tentativa falhando, as reaberturas acontecem a 500, 1 000, 2 000, 4 000, 8 000, 10 000 e 10 000 ms umas das outras, e a oitava tentativa ainda acontece (AC 8, Q2) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "espaça as tentativas até 10 s e não desiste"`

**C10** - O `attached` da reabertura, com a transcrição que já tinha 2 turnos mais 1 novo, deixa `conversation.turns` com 3 turnos e tira o aviso de queda (AC 9) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "o attached da reabertura substitui a conversa sem duplicar turnos"`

**C11** - O socket fechando com `4404` mostra `esta sessão não existe mais no daemon` e `connect` não é chamado de novo em 30 s de relógio falso (AC 10) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "sessão que sumiu do daemon não reabre"`

**C12** - Desmontar o hook, ou trocar o `sessionId`, com uma reabertura agendada faz `connect` não ser chamado para a sessão antiga em 30 s de relógio falso (AC 11) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "não reabre depois de desmontar nem ao trocar de sessão"`

**C13** - `AcpSocket.send` devolve `false` quando o socket não está aberto e quando o schema recusa; com isso o `send` do hook devolve `false`, e o composer mantém o rascunho e mostra o motivo (AC 12) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/acp-socket.test.ts -t "send devolve false quando recusa"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation.test.tsx -t "envio recusado pelo socket mantém o rascunho e mostra o motivo"`

**C14** - Um prompt cujo frame codificado tem exatamente o limite compartilhado sai; um byte acima é recusado antes de `ws.send` com `mensagem grande demais — o limite é 1 MiB`, e o servidor fecha um frame acima do mesmo limite importado de `@lumem/shared` (AC 13) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/acp-socket.test.ts -t "recusa prompt acima de 1 MiB antes do fio"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/websocket.test.ts -t "closes a frame above the shared frame limit"`

**C15** - Um frame que não decodifica mostra `o daemon mandou algo que esta tela não entende — recarregue a página`, não marca a falha como fatal e não fecha o socket (AC 14) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useConversationSession.test.tsx -t "frame que não decodifica vira aviso e não fecha"`

### S3 - a linha de estado do turno · 9 arquivos · ~100 KB · ~40k

**C16** - A mensagem do usuário em `at: 1000` põe `turnStartedAt` e `lastEventAt` em 1000; um `agent_message_chunk` em `at: 4000` move `lastEventAt` para 4000 e deixa `turnStartedAt` em 1000 (AC 15) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-model.test.ts -t "guarda o início do turno e o último evento"`

**C17** - `replayConversation` e a dobra evento a evento da mesma transcrição dão o mesmo `turnStartedAt` e `lastEventAt` (AC 16) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-model.test.ts -t "replay e dobra concordam no relógio do turno"`

**C18** - Com `streaming` e não somente leitura, e o relógio injetado 72 s depois de `turnStartedAt`, a linha acima do composer diz `trabalhando · 1 min 12 s` e tem o indicador animado; sem `streaming`, a linha não existe (AC 17) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/TurnStatus.test.tsx -t "desenha trabalhando com o decorrido"`

**C19** - O decorrido se escreve, tabela com os oito casos: 12 s → `12 s`, 59 s → `59 s`, 60 s → `1 min 0 s`, 72 s → `1 min 12 s`, 3 599 s → `59 min 59 s`, 3 600 s → `1 h 00 min`, 11 100 s → `3 h 05 min`, −5 s → `0 s` (AC 18) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/turn-status.test.ts -t "formata o decorrido"`

**C20** - O fazer vem do último bloco do turno do agente, tabela com os sete casos: raciocínio → `pensando`, mensagem → `escrevendo`, ferramenta `running` → `rodando <título>`, ferramenta `pending` → `rodando <título>`, permissão pendente → `esperando sua resposta`, nenhum bloco do agente → `começando`, ferramenta terminada → `pensando` (AC 19) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/turn-status.test.ts -t "diz o que o agente está fazendo"`

**C21** - `useNow(true)` avança uma vez a cada 1 000 ms de relógio falso; `useNow(false)` não deixa intervalo ligado — `vi.getTimerCount()` é 0 (AC 20) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/useNow.test.ts -t "tique de 1 s só enquanto ativo"`

**C22** - A regra `.mcaret` tem `animation` apontando para um `@keyframes` do `conversation.css`, e depois do envio, com o último bloco sendo a mensagem do usuário, nenhum `.mcaret` é desenhado (AC 21) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-css.test.ts -t "o caret pisca"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation.test.tsx -t "caret nunca na mensagem do usuário"`

**C23** - Dentro de `@media (prefers-reduced-motion: reduce)`, o caret e o indicador da linha têm `animation: none` (AC 22) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/conversation-css.test.ts -t "movimento reduzido para caret e indicador"`

### S4 - o aviso de silêncio · 3 arquivos · ~20 KB · ~15k

**C24** - Sem ferramenta aberta e sem permissão pendente, 89 s depois de `lastEventAt` a linha não tem o tom `warning`; aos 90 s tem, e diz `sem sinal do agente há 1 min 30 s` com o atalho `esc` (AC 23, Q1) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/turn-status.test.ts -t "fica âmbar a partir de 90 s sem sinal"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/TurnStatus.test.tsx -t "o âmbar mostra o atalho de interromper"`

**C25** - Com uma ferramenta `pending` aberta há 240 s e nenhum evento desde então, e com a mesma ferramenta passando a `running` por um `tool_call_update` há 100 s, a linha diz `rodando <título> há 4 min 0 s` e não tem o tom `warning` — só estados que o redutor produz (AC 24; reescrito na rodada 1) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/turn-status.test.ts -t "ferramenta aberta não é silêncio"`

**C26** - Com uma permissão pendente e 300 s sem evento, a linha diz `esperando sua resposta` e não tem o tom `warning` (AC 25) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/turn-status.test.ts -t "permissão pendente não é silêncio"`

**C27** - Com a linha em `warning`, um evento do turno que chega move `lastEventAt`, e o render seguinte está sem o tom `warning` (AC 26) ✓
Proof: `pnpm --filter @lumem/web exec vitest run src/features/conversation/TurnStatus.test.tsx -t "evento novo tira o âmbar"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| como o processo saiu (3) | código C2 · sinal C2 · nenhum C2 | - |
| ordem entre a saída e o fim do stdout (3) | saída e stdout nunca fecha C3 · saída antes do fechamento C4 · fechamento antes da saída C4 | - |
| a frase no fechamento antes da saída (2) | saída no prazo C30 · prazo vencido C30 | - |
| turno em voo na saída (5) | depois do `session/prompt` C1 · durante o teto C28 · durante a memória C28 · junto com a resposta C29 · não C5 | - |
| dois `prompt` na mesma sessão (4) | os dois terminam sem saída C31 · a saída com os dois em voo C31 · a saída com os dois ainda sem pergunta gravada C31 · a saída depois de o primeiro terminar C31 | - |
| door 1 — `turn_failed` na saída (1) | C1 | - |
| door 2 — um fecho por turno (1) | C4 | - |
| door 4 — um gatilho por `prompt` em voo (1) | C31 | - |
| door 3 — reconexão no hook (4) | queda reabre C8 · espera C9 · 4404 não reabre C11 · desmontar não reabre C12 | - |
| código de fechamento do `/acp` (3) | `1006` C8 · `4404` C11 · fechamento pedido pelo cliente C12 | - |
| espera entre tentativas (7) | 500 C9 · 1000 C9 · 2000 C9 · 4000 C9 · 8000 C9 · 10000 C9 · 10000 de novo C9 | - |
| recusa do envio (3) | socket fechado C13 · schema C13 · acima do limite C14 | - |
| limite do frame, bordas (2) | no limite C14 · um byte acima C14 | - |
| startup config: limite do frame (2 lugares) | `websocket.ts` do servidor C14 · `acp-socket.ts` do web C14 | - |
| decorrido, bordas (8) | 12 s C19 · 59 s C19 · 60 s C19 · 72 s C19 · 3599 s C19 · 3600 s C19 · 11100 s C19 · negativo C19 | - |
| o fazer do agente (7) | raciocínio C20 · mensagem C20 · ferramenta `running` C20 · ferramenta `pending` C20 · permissão C20 · nada ainda C20 · ferramenta terminada C20 | - |
| quando a linha e o caret aparecem (3) | `streaming` ao vivo C18 · sem `streaming` C18 · somente leitura C7 | - |
| limiar do silêncio, bordas (2) | 89 s C24 · 90 s C24 | - |
| o que não é silêncio (3) | ferramenta `running` C25 · ferramenta `pending` C25 · permissão pendente C26 | - |
| movimento (4) | caret anima C22 · caret parado com movimento reduzido C23 · indicador anima C18 · indicador parado com movimento reduzido C23 | - |

- Claims que nomeiam frase, código de fechamento ou limite: C1, C2, C8, C11, C14, C15, C19, C24 — cada uma com uma prova que atravessa a borda que ela nomeia
- Nenhum outro check afirma mais que o caso que a sua prova exercita

## Swept

- validation: C14
- failure modes: C1, C3, C28, C30
- idempotency: C4, C29
- authorization: n/a - o daemon não confere quem fala com ele até a `019-daemon-auth`, e nada aqui abre porta nova
- concurrency: C4 (as duas ordens do cano), C28 (a saída durante a leitura do teto), C29 (a resposta e a saída no mesmo tique), C31 (dois `prompt` na mesma sessão), C12 (desmontar com reabertura agendada)
- data lifecycle: n/a - nada novo é gravado além de um `turn_failed` que já existia; as transcrições antigas sem fecho são lidas por C7
- dependency failure: C3 (o adaptador), C8 e C11 (o daemon)
- state transitions: C16, C24, C27
- observability: C6

## Handoff

- S1 = ~40k, quase todo no `server` (`AcpManager` lido em parte — o arquivo tem 113 KB); S2 entra no
  `web` a ~70k; S3 a ~110k; S4 a ~125k — abaixo do orçamento de 150k, **um construtor por fatia**
  (`lumem-dev`), em sequência, porque S4 lê o que S3 cria e S2 e S3 mexem no mesmo hook
- Mechanism: um construtor por fatia, nesta ordem — S1, S2, S3, S4; o verificador (`lumem-reviewer`
  novo) depois do último commit, sobre `origin/main..HEAD`
- **Boundary:** C1–C7 closed at 2ebbc92
- **Settled mid-build:** nada perguntado ao usuário; o fake ganhou `exit({ exitCode, signal })` e
  `closeStdout()`, e o `AcpManager.ts` subiu no `OVER_THE_CEILING` para 2884, com motivo
- **Abandoned:** nada. O caminho em que o stdout fecha primeiro, deixado de fora no primeiro corte, foi
  fechado a pedido: o `prompt` lê `connection.signal.aborted` e espera a saída por
  `EXIT_AFTER_CLOSE_GRACE_MS` (2 s), com `(saída desconhecida)` se o prazo vencer
- **Boundary:** C8–C15 closed at 48f4feb
- **Settled mid-build:** nada perguntado ao usuário. Os avisos de transporte (queda, `4404`, frame
  ilegível) moram no `failure` que já existia — a queda e o frame ilegível não fatais, o `4404` fatal
  —, e o `attached` da volta os limpa como limpa qualquer falha; o motivo da recusa é `sendRefusal`,
  estado do hook ao lado do reducer, limpo no começo de cada envio. O limite é `ACP_MAX_FRAME_BYTES`
  em `acp-protocol.ts`, que subiu no `OVER_THE_CEILING` para 758, com motivo; o `acp-socket` confere
  schema, depois tamanho, depois socket aberto
- **Abandoned:** nada. A reconexão ficou no próprio `useConversationSession` (335 linhas), sem hook
  extraído; o `MAX_PAYLOAD_BYTES` do `pty/websocket.ts` continua próprio — o `/pty` está fora do escopo
- **Boundary:** C16–C23 closed at 0aa1c00
- **Settled mid-build:** nada perguntado ao usuário. `turnStartedAt`/`lastEventAt` são `number | null`,
  carimbados **depois** da dobra por uma regra só sobre o `streaming` resultante (fora de turno, `null`),
  e o `conversation-model.ts` subiu no `LARGE_FILE_CEILING` para 767, com motivo. O `TurnStatus` decide
  sozinho se aparece (`streaming && !readOnly`, o mesmo que liga o `useNow`) e mora na `Conversation`,
  entre `Transcript` e o composer. `turnActivity` só lê os blocos do agente depois da última mensagem do
  usuário, pula `meta`/`note`, põe a permissão pendente na frente, e o caso de ferramenta carrega o
  `ToolCallView` inteiro — o `startedAt` é de onde a S4 mede `rodando <título> há …`
- **Abandoned:** nada. O teste do `useNow` avança um segundo por `act`: dois tiques no mesmo `act` o React
  junta num render, e a contagem de valores enxergava três em vez de quatro
- **Boundary:** C24–C27 closed at 1853e08
- **Settled mid-build:** nada perguntado ao usuário. A regra é `turnLine(conversation, now)` em
  `turn-status.ts`, que devolve `{ tone: "normal" | "warning", doing }`, com `SILENCE_THRESHOLD_MS`
  (90 000) como a única constante; o `activityText` da S3 ficou como estava, e a ferramenta aberta
  ganha o `há <decorrido>` medido do `call.startedAt` sempre, não só em silêncio. Em silêncio a linha
  mantém o `trabalhando · <total>`, o ponto para de pulsar, e o atalho aparece num
  `.turn-status__hint` (`esc` + `interromper`) só no âmbar. O C25 pede *iniciada 240 s atrás e 300 s
  sem evento*, que nenhuma dobra produz — o `tool_call` é ele mesmo um evento —, então a prova
  sobrescreve `lastEventAt` no estado dobrado, e um teste a mais faz o caso realista, com um
  `tool_call_update` no meio
- **Abandoned:** nada
- **Boundary:** C25, C28–C30 closed at 4602fce (rodada 1 da verificação); o F4, sem check, em 1e050c5
- **Settled mid-build:** o dono aprovou a emenda dos checks (C28–C30 novos, C25 reescrito, critérios 27
  e 28 do plano) e respondeu **Q4 = A** em 2026-09-29. O resto foi decidido aqui: o turno guarda a
  pergunta em `pendingQuestion` até gravá-la, e o `closeTurnOnExit` a grava antes do `turn_failed`; a
  corrida contra a saída (`exited`) é armada no começo do `prompt`, e as três guardas — depois do teto,
  depois da memória, depois da resposta — relançam o `AcpTurnFailedError` da saída com `await exited`,
  que o `websocket.ts` já engolia. O núcleo da memória que chega depois da saída **não** é gravado: o
  agente nunca o leu. O prazo virou `exitAfterCloseGraceMs`, injetável, com `EXIT_AFTER_CLOSE_GRACE_MS`
  (2 s) de padrão. A janela da resposta junto com a saída tem uma ou duas microtarefas, e quantas o SDK
  gasta é dele: a prova do C29 varre a saída de 0 a 24 microtarefas depois de a resposta passar pelo
  cano, afirma o C29 em toda volta em que a saída pegou o turno aberto (e o C5 nas outras), e cobra que
  a varredura tenha atravessado a resposta. O `AcpManager.ts` subiu no `OVER_THE_CEILING` para 2952,
  com motivo; o `sendRefusal` agora também se limpa no `attached` da reabertura
- **Abandoned:** o teste a mais `ferramenta aberta mede do início dela, com evento no meio`, absorvido
  pelo segundo caso do C25 reescrito
- **Boundary:** C28, C31 closed at f3bdeb0 (rodada 2 da verificação)
- **Settled mid-build:** o dono respondeu **Q5 = B** (dois `prompt` na mesma sessão continuam
  permitidos, como em `origin/main`) e **Q6 = A** (o prompt pendente do `setup` não é reenviado quando a
  saída já gravou a mensagem; nenhum código). O resto foi decidido aqui: em vez de ler
  `info.state === "exited"`, cada `prompt` registra um `TurnInFlight` (pergunta, gatilho e `failure`) em
  `session.turnsInFlight`, e as guardas leem o `failure` do **próprio** turno e o relançam — não há
  promessa a esperar, então não há o que pendurar; `releaseTurn` e `pendingQuestion` saíram da sessão,
  e o `turnId` deixou de ser sinal (o `closeTurnOnExit` não o troca mais). A saída fecha **uma vez** — um
  `turn_failed` — e liberta todos os turnos em voo com o mesmo erro, gravando antes a pergunta de cada
  um; o `markExited` também fecha quando `promptInFlight` já foi desligado pelo primeiro de dois
  `prompt` e o segundo ainda voa. A guarda do `catch` (o pedido rejeitou) tinha o mesmo formato e foi
  para o `failure` também. A door 4 entrou no `Landing` do plano, com a alternativa rejeitada (recusar o
  segundo `prompt`), e o passo 1 do `Flow` diz *todos* os `prompt` em voo. O `AcpManager.ts` subiu no
  `OVER_THE_CEILING` para 2976, com motivo
- **Abandoned:** nada. O estado de turno único com dois turnos (`promptInFlight`, `turnStartedAt`,
  `openToolCalls`, a linha de estado) fica como em `origin/main`, fora do escopo por decisão da Q5
- **Boundary:** C31 closed at 55100a7 (rodada 3 da verificação, ampliação do C31); o F5, sem check, em 8de0699
- **Settled mid-build:** o dono autorizou a quarta rodada e a feature foi renumerada de `035` para `037`
  no merge com a `origin/main` (colisão com a `035-plan-mode`); o `bef781b` ampliou o C31 e tirou o ✓
  dele até as duas provas novas passarem. O resto foi decidido aqui, sem pergunta: as duas provas saem
  do claim, com os nomes fixos, e a do fecho único compara a transcrição por inteiro
  (`[message primeira, message segunda, turn_failed]`), com um retrato só; a da saída depois de o
  primeiro terminar afirma a rejeição com `AcpTurnFailedError` e o `turn_failed` como último evento, e
  corre contra um prazo de 1 s para que uma regressão apareça como `pendurado`, e não como timeout. As
  três mutações da rodada (MA, MB, MC) foram injetadas de novo e caem; o F5 trocou o `messageId` da
  pergunta de `session.turnId` para `turn.id`, com um teste a mais (*gives each question its own
  message id with two prompts in flight*) que cai sem a troca. O `expect.any(String)` da 1ª prova do
  C31 ficou: o teste novo é quem afirma os dois ids distintos
- **Abandoned:** nada. O `fallbackMessageId: session.turnId` do texto do agente (`AcpManager.ts:2098`)
  tem o mesmo formato e fica fora do escopo, junto com o estado de turno único da Q5
- **Boundary:** C7 closed at 4667677 (rodada 4 da verificação, ampliação do C7); o follow-up do pensamento, sem check, em 5ae5c11
- **Settled mid-build:** o dono autorizou a quinta rodada; o `c2d2e6b` ampliou o C7 e tirou o ✓ dele até a
  segunda prova passar. Nenhum código de produção mudou: a `Transcript.tsx` já estava certa, faltava prova.
  A prova nova termina a conversa somente leitura numa `message` do agente sem fecho, o único cenário em que
  só o `!readOnly` decide, e cai quando ele sai da expressão `streaming` (`Transcript.tsx:119`, o MH da
  rodada 4); a primeira prova do C7, que termina na pergunta, segue verde sob a mesma mutação, como a
  verificação previu. O teste a mais (*does not open a thought by itself in a record that never closed*,
  `Transcript.test.tsx`) cobre o `thoughtOpen` da `036` pela mesma expressão e cai pela mesma mutação
- **Abandoned:** nada
