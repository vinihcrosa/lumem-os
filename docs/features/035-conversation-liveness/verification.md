# Sinal de vida da conversa — verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: e3894e4..36fee0e (`origin/main..HEAD`; primeiro commit da feature `9bd0352`)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Os 27 checks estão provados no `HEAD`, com asserção localizada, e os 5 mutantes injetados morreram. O
veredito é FAIL por um motivo só: recalculada a partir do código, a Coverage de *turno em voo na
saída* tem dois membros que o `AcpManager` trata num ramo próprio — e nenhum teste prova esses ramos.
Um deles é a guarda que impede o defeito que a S1 existe para consertar: um `prompt` pendurado para
sempre. Além disso, há duas lacunas de precisão nos checks (C1/C4 e C25), que não reprovam sozinhas.

Todas as provas rodaram com o Node do `.nvmrc` (`v22.17.1`). As provas de cada pacote rodaram numa
invocação só:

- `S` = `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts src/acp/websocket.test.ts -t "<os 7 nomes das provas do server, mais os 2 testes do caminho em que o cano fecha primeiro>"` — exit 0, 12 passed, cada nome aparece individualmente na saída;
- `W` = `pnpm --filter @lumem/web exec vitest run <os 8 arquivos> -t "<os 24 nomes das provas do web>"` — exit 0, 25 passed. `diz o que o agente está fazendo` casa com dois testes, o do C20 e o `… ao lado do tempo`.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| LUM-67, Parte 1 — o turno fecha quando o adaptador morre | yes - `.context/attachments/linear-36a73b0b-64ca-4333-b406-9893249f789a/[LINEAR]-LUM-67.md` | none | - |
| LUM-67, Parte 2 — a queda da conexão aparece | yes - mesmo arquivo | none | - |
| LUM-67, Parte 3 — a linha de estado do turno | yes - mesmo arquivo | none | - |
| LUM-67, Parte 4 — o aviso de silêncio | yes - mesmo arquivo | none | - |

O que a issue decide, elemento por elemento, e onde está a prova. A medição do §Problem do plano foi
levada em conta: com processo real, o fecho **já** acontecia, com o vocabulário do SDK. Julgado contra a
issue, o que sobra de pé na Parte 1 é a frase no vocabulário do Lumem e o fecho quando o stdout não fecha.

| A issue decide | Check | Nota |
| --- | --- | --- |
| o daemon emite um fecho, no vocabulário do Lumem, **antes** de limpar os listeners, gravado para o replay concordar | C1, C6 | `turn_failed` em vez de `turn_end`: a issue diz *"ex.:"*, e o door 1 registra a alternativa rejeitada. Não é contradição. |
| o caret só com `streaming && !readOnly` | C7 | a issue pede teste "no redutor (replay sem fecho)"; o plano prova na tela somente leitura. É escolha de nível, não um elemento. |
| aviso `conexão com o daemon caiu — reconectando`, reconecta e relê pelo `attached` | C8, C10 | texto idêntico ao da issue |
| `onSendRejected` avisa o composer, que não limpa o rascunho | C13 | - |
| **arranjo:** uma linha **acima do composer** | C18 | o texto do C18 diz *acima do composer*, mas a prova dele desenha o `TurnStatus` sozinho. O arranjo está provado por um teste que nenhum check nomeia: `conversation.test.tsx:667` — `expect(line.closest(".turn-status")?.nextElementSibling).toHaveClass("composer")`. Rodado, verde. |
| `trabalhando · 1 min 12 s`, com indicador animado que respeita `prefers-reduced-motion` | C18, C23 | - |
| o que o agente está fazendo, **na mesma linha** | C20 | o C20 prova a função pura. Na linha, a prova é `TurnStatus.test.tsx:63-72` (`pensando` ao lado de `trabalhando · 5 s`), que nenhum check nomeia. |
| o caret pisca | C22 | - |
| âmbar sem ferramenta em voo, `sem sinal do agente há …`, com o atalho de interromper | C24 | a issue escreve *"há 2 min"*; o formatador daria `2 min 0 s`. Não é contradição: o único exemplo da issue com precisão explícita (`1 min 12 s`) é o que o formatador reproduz. |
| com ferramenta rodando, `rodando <comando> há 4 min`, e nunca âmbar | C25 | o código escreve o **título** da ferramenta, não o comando. É uma premissa do plano (*Assumptions*, `Confirmed? n`); a issue não decide ferramenta que não é comando. |

Na outra direção, o que o código desenha e a issue não pede: o aviso de frame ilegível (C15) e a recusa
por tamanho (C14). Os dois são do plano, nenhum contradiz a issue, e o arranjo não mudou: a linha nova
fica entre `Transcript` e o composer (`Conversation.tsx:201`). Não existe mock de desenho; a issue é a
única fonte vinculante.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | a saída com turno em voo emite um `turn_failed` com `(saída 137)`, gravado e recebido pelo listener | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2705` - `expect(turnFailedIn(manager.transcript(id))).toEqual([closing])`; `:2707` - o mesmo sobre `events` do listener; frase literal em `:2703` | PASS |
| C2 | `(saída 137)` · `(sinal SIGKILL)` · `(saída desconhecida)` | `S` exit 0, os 3 casos listados | `packages/server/src/acp/AcpManager.test.ts:2711-2713` (a tabela) e `:2721` - `` toEqual([{ type: "turn_failed", message: `o agente encerrou no meio do turno ${says}` }]) `` | PASS |
| C3 | stdout aberto: o `prompt` rejeita com `AcpTurnFailedError` em < 1 s, e `liveTurns()` fica vazio | `S` exit 0 (9 ms) | `packages/server/src/acp/AcpManager.test.ts:2738` - `toBeInstanceOf(AcpTurnFailedError)`; `:2739` - `expect(manager.liveTurns()).toEqual([])`; prazo de 1 s em `:2732` | PASS |
| C4 | nas duas ordens, exatamente um `turn_failed` | `S` exit 0, as duas ordens listadas | `packages/server/src/acp/AcpManager.test.ts:2763` - `expect(turnFailedIn(manager.transcript(id))).toHaveLength(1)` | PASS (ver lacuna 2: na ordem em que o cano fecha primeiro, o teste espera o prazo de 2 s, 2065 ms) |
| C5 | a saída entre turnos não acrescenta `turn_failed` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2814` - `expect(types).not.toContain("turn_failed")` | PASS |
| C6 | retrato `turn-failed` com `code: "exited"` e o `sessionId` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2825-2826` - `toHaveBeenCalledWith(expect.objectContaining({ tag: "turn-failed", code: "exited", sessionId: id }))` | PASS |
| C7 | somente leitura sem fecho: sem `.mcaret`, sem linha de estado, sem `■ interromper` | `W` exit 0 | `packages/web/src/features/conversation/conversation.test.tsx:1312` - `querySelector(".mcaret")).toBeNull()`; `:1314` - `queryByText(/trabalhando/)).not.toBeInTheDocument()`; `:1315` - `interromper` ausente | PASS |
| C8 | `1006` mostra `conexão com o daemon caiu — reconectando` e reabre para a mesma sessão | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:322-324` - `toMatchObject({ message: "conexão com o daemon caiu — reconectando", fatal: false })`; `:331-332` - 2 sockets, o segundo com `sessionId` `s-1` | PASS |
| C9 | 500 · 1 000 · 2 000 · 4 000 · 8 000 · 10 000 · 10 000 ms, e a oitava acontece | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:341` (a lista), `:348` - `toHaveLength(before)` em `delay - 1`, `:353` - `toHaveLength(before + 1)` em `delay`; `:362` - `toHaveLength(9)` | PASS |
| C10 | o `attached` da reabertura deixa 3 turnos e tira o aviso | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:391` - `turns).toHaveLength(3)`; `:392` - `failure).toBeNull()` | PASS |
| C11 | `4404` mostra `esta sessão não existe mais no daemon` e não reabre em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:403` - `failure?.message).toBe("esta sessão não existe mais no daemon")`; `:409` - `sockets).toHaveLength(1)` depois de 30 s | PASS |
| C12 | desmontar, ou trocar de sessão, com reabertura agendada: nada para a antiga em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:424` - `unmounted.sockets).toHaveLength(1)`; `:438` - sockets de `s-1` com tamanho 1 | PASS |
| C13 | `AcpSocket.send` devolve `false` fechado e por schema; o composer mantém o rascunho e mostra o motivo | `W` exit 0, as duas provas | `packages/web/src/features/conversation/acp-socket.test.ts:310` - `toBe(false)` com o socket fechado, `:316` - `toBe(false)` pelo schema; `packages/web/src/features/conversation/conversation.test.tsx:233` - `toHaveValue("não perca isto")`, `:234` - `getByText("o socket não está aberto")` | PASS |
| C14 | no limite sai; um byte acima é recusado com `mensagem grande demais — o limite é 1 MiB`; o servidor fecha acima do limite compartilhado | `W` e `S` exit 0 | `packages/web/src/features/conversation/acp-socket.test.ts:332` - `toBe(true)` no limite, `:334` - `byteLength).toBe(ACP_MAX_FRAME_BYTES)`, `:340` - `toBe(false)` um byte acima, `:343` - a frase; `packages/server/src/acp/websocket.test.ts:466` - `closeCode).toBeUndefined()` no limite, `:471` - `toBe(1009)` um acima | PASS |
| C15 | frame ilegível: aviso não fatal, socket aberto | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:450-454` - `failure).toEqual({ message: "o daemon mandou algo que esta tela não entende — recarregue a página", remedy: null, fatal: false })`; `:455` - `closed).toBe(false)` | PASS |
| C16 | usuário em 1000 põe os dois em 1000; chunk em 4000 move só `lastEventAt` | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:904-905` - `toBe(1000)` nos dois; `:912` - `lastEventAt).toBe(4000)`, `:913` - `turnStartedAt).toBe(1000)` | PASS |
| C17 | replay e dobra concordam | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:942-943` - `folded.* toBe(replayed.*)`; `:950` - igualdade em cada prefixo | PASS |
| C18 | 72 s: `trabalhando · 1 min 12 s` com indicador animado; sem `streaming`, a linha não existe | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:32` - `getByText("trabalhando · 1 min 12 s")`; `:36` + `:40` - o `.turn-status__pulse` existe e a regra dele nomeia um `@keyframes` da folha; `:50` - `querySelector(".turn-status")).toBeNull()` sem `streaming` | PASS (o arranjo *acima do composer* vem de `conversation.test.tsx:667`, fora do nome da prova) |
| C19 | os oito casos do decorrido | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:36-43` (a tabela) e `:47` - `expect(formatElapsed(seconds * 1000)).toBe(text)` | PASS |
| C20 | os sete casos do fazer | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:55-86` (a tabela) e `:92` - `expect(activityText(turnActivity(state))).toBe(text)`, sobre estado dobrado (`:90`) | PASS |
| C21 | `useNow(true)` avança a cada 1 000 ms; `useNow(false)` sem intervalo | `W` exit 0 | `packages/web/src/features/conversation/useNow.test.ts:26` e `:30` - fica em 1 000 000 aos 999 ms e vai a `1_001_000` aos 1 000; `:41` - `seen).toEqual([1_000_000, 1_001_000, 1_002_000, 1_003_000])`; `:49` - `getTimerCount()).toBe(0)` | PASS |
| C22 | `.mcaret` anima por `@keyframes`; depois do envio, nenhum caret na mensagem do usuário | `W` exit 0, as duas provas | `packages/web/src/features/conversation/conversation-css.test.ts:259-260` - nome de `animation` definido e `@keyframes <nome>` na folha; `packages/web/src/features/conversation/conversation.test.tsx:642` - `querySelector(".mcaret")).toBeNull()`, `:653-654` - um caret só, dentro de `.turn--agent` | PASS |
| C23 | `animation: none` para caret e indicador sob movimento reduzido | `W` exit 0 | `packages/web/src/features/conversation/conversation-css.test.ts:266-268` - para `.mcaret` e `.turn-status__pulse`, `toMatch(/animation:\s*none/)` dentro dos blocos `@media (prefers-reduced-motion: reduce)` | PASS |
| C24 | 89 s sem `warning`; 90 s com, `sem sinal do agente há 1 min 30 s`, e o atalho `esc` | `W` exit 0, as duas provas | `packages/web/src/features/conversation/turn-status.test.ts:130` - `tone).toBe("normal")` aos 89 s, `:134-135` - `warning` e a frase aos 90 s; `packages/web/src/features/conversation/TurnStatus.test.tsx:87` - sem `--warning` aos 89 s, `:94` - a frase, `:96` - `key?.textContent).toBe("esc")` | PASS |
| C25 | ferramenta `running`/`pending` iniciada há 240 s, com 300 s sem evento: `rodando <título> há 4 min 0 s`, tom normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:155` - `tone).toBe("normal")`, `:156` - `doing).toBe("rodando Bash pnpm gate:quick há 4 min 0 s")`, nos dois status | PASS (ver lacuna 3: o estado do check não é alcançável pela dobra; `:152` escreve `lastEventAt` à mão) |
| C26 | permissão pendente com 300 s sem evento: `esperando sua resposta`, tom normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:194` - `tone).toBe("normal")`, `:195` - `doing).toBe("esperando sua resposta")` | PASS |
| C27 | no âmbar, um evento move `lastEventAt` e o render seguinte sai do âmbar | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:107` - `woke.lastEventAt).toBe(now - 1000)`; `:111` - `querySelector(".turn-status--warning")).toBeNull()` | PASS |

## Coverage

Recalculada a partir de quem tem autoridade sobre cada conjunto: o código, para os ramos e a ordem do
cano; o plano (AC 8, AC 18, AC 19), para as esperas, o decorrido e o fazer.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| como o processo saiu (3) | `exitText`, `packages/server/src/acp/AcpManager.ts:2866` — três ramos | código C2 · sinal C2 · nenhum C2 | - |
| em que ponto do turno a saída chega (4) | `prompt`, `packages/server/src/acp/AcpManager.ts:1279-1426` — `promptInFlight` fica ligado desde a `:1291`, e a saída fecha o turno em qualquer ponto disso (`:2510`) | antes do `session/prompt`, enquanto teto e memória são lidos (guarda em `:1351`) — **nenhuma prova** · durante o pedido: C1, C3, C6 · a resposta e a saída no mesmo tique (guarda em `:1409`, que impede um `turn_end` depois do `turn_failed`) — **nenhuma prova** · entre turnos: C5 | guarda de `AcpManager.ts:1351` (saída durante `checkBudget`/`coreFor`) · guarda de `AcpManager.ts:1409` (a resposta e a saída juntas) |
| ordem entre a saída e o fim do stdout (4) | o `catch` do `prompt`, `AcpManager.ts:1384-1405`, e `awaitExitAfterClose`, `:2576` | a saída e o stdout nunca fecha: C3 · a saída antes do fechamento: C4 · o fechamento antes da saída, com a saída dentro do prazo: `AcpManager.test.ts:2779` (sem check; ver lacuna 2) · o fechamento, o prazo vence, a saída chega depois: C4 e `AcpManager.test.ts:2793` | - |
| door 2 — um fecho só por turno | `AcpManager.ts:1388`, `:1409`, `:2562` | saída primeiro: C4 · cano primeiro: C4 e `:2779` · resposta junto com a saída: sem prova (contado na linha acima) | - |
| código de fechamento do `/acp` (3) | `acp-socket.ts` `onclose` (`refused` = 4404) e `close()`, que zera `onclose` | `1006` C8 · `4404` C11 · o cliente que fecha: C12 (pelo `clearTimeout`; a guarda `disposed` em `useConversationSession.ts:241` é defesa redundante, porque `close()` já zera o `onclose`) | - |
| espera entre tentativas (7) | `RECONNECT_DELAYS_MS` + teto, `useConversationSession.ts:113` | 500 · 1000 · 2000 · 4000 · 8000 · 10000 · 10000: C9, um por um | - |
| a espera recomeça depois do `attached` (1) | `useConversationSession.ts:237` | `useConversationSession.test.tsx:462-485` (sem check) | - |
| recusa do envio (3) | `acp-socket.ts` `send`: schema → tamanho → aberto | schema C13 · acima do limite C14 · fechado C13 | - |
| limite do frame, bordas (2) | `acp-socket.ts:150` (`>`, em bytes UTF-8) | no limite C14 · um byte acima, com `é` de 2 bytes, C14 | - |
| startup config: limite do frame (2 lugares) | cada montagem lida direto: `packages/server/src/acp/websocket.ts:72` `maxPayload: ACP_MAX_FRAME_BYTES`, com uma única montagem (`packages/server/src/server.ts:242`); `packages/web/src/features/conversation/acp-socket.ts:150` | servidor C14 · web C14 | - |
| decorrido, bordas (8) | AC 18; `formatElapsed` tem 4 ramos | os 8 casos: C19 | - |
| o fazer do agente (7 do plano) | AC 19; `activityOf`/`turnActivity` | raciocínio · mensagem · `running` · `pending` · permissão · nada ainda · terminada: C20. O turno anterior não conta: `turn-status.test.ts:96-107` (sem check) | - |
| quando a linha e o caret aparecem (3) | `TurnStatus.tsx` `live`, `Transcript.tsx:99-101` | `streaming` ao vivo C18 · sem `streaming` C18 · somente leitura C7 · caret só no bloco do agente C22 | - |
| limiar do silêncio, bordas (2) | `turn-status.ts:107` (`>=`) | 89 s C24 · 90 s C24 (também antes do primeiro bloco do agente, `turn-status.test.ts:138-140`) | - |
| o que não é silêncio (3) | `turnLine`, `turn-status.ts:102-108` | ferramenta `running` C25 · ferramenta `pending` C25 · permissão pendente C26 | - |
| movimento (4) | `conversation.css:206`, `:209`, `:517` | caret anima C22 · caret parado C23 · indicador anima C18 · indicador parado C23 | - |

Sem `Relations` e sem `Surface` no plano (`None`), então não há rota nem entidade com membros a
recalcular.

## Test policy rows

O `checks.md` não tem `## Test policy`; a matriz do `docs/project/testing.md` decide o nível. Os níveis
batem com ela: transporte ACP em integração com o agente falso (C1–C6, C14 servidor, este sobre o
`/acp` de verdade); hook, socket, redutor e componente do `web` em unidade; CSS pelo teste que lê a
folha. O `TurnStatus.test.tsx` lê o `conversation.css` com `readFileSync`, mas isso não reintroduz a
armadilha da guarda invisível ao `--changed`: o `gate:quick` trata `.css` como não rastreável e roda a
suíte inteira (*"a dependency, config or asset changed"*, na saída abaixo).

## Faults injected

Numa cópia descartável de `HEAD` (`git archive HEAD` em `/private/tmp/lum035-verify`, com os
`node_modules` ligados por symlink). A árvore real não foi tocada: o `git status --porcelain` estava
vazio antes e continuou vazio depois de a cópia ser apagada.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 — tirar `if (session.connection.signal.aborted) throw await this.awaitExitAfterClose(...)`: com o cano fechando primeiro, a frase volta a ser a do SDK | `packages/server/src/acp/AcpManager.ts:1391` | yes — mas **só** pelos dois testes sem check (`AcpManager.test.ts:2766` e `:2784`). As provas C1–C7 continuaram verdes, inclusive as duas ordens do C4 (ver lacuna 2) |
| M2 — não zerar o `turnId` em `closeTurnOnExit` (door 2) | `packages/server/src/acp/AcpManager.ts:2562` | yes — C1, os 3 casos do C2, C4 (ordem em que a saída vem primeiro) e C6 |
| M3 — `RECONNECT_DELAYS_MS` sem o 8 000 | `packages/web/src/features/conversation/useConversationSession.ts:113` | yes — C9 |
| M4 — `quiet >= SILENCE_THRESHOLD_MS` virou `>` | `packages/web/src/features/conversation/turn-status.ts:107` | yes — C24, as duas provas |
| M5 — medir o frame por `frame.length`, não em bytes UTF-8 | `packages/web/src/features/conversation/acp-socket.ts:150` | yes — C14 (web) |

Limite de cinco atingido. As superfícies que não sofreram mutação têm o valor esperado legível na
própria asserção: C16, C19, C21, C22, C23, C27.

## Gaps, ranqueados

1. **Coverage: dois ramos do S1 sem prova (reprova).** `packages/server/src/acp/AcpManager.ts:1351` e
   `:1409`. Os dois testes do `o adaptador que sai no meio do turno` chamam `exit` só depois de a
   mensagem do agente chegar (`AcpManager.test.ts:2689`). Nenhum sai durante o teto ou a memória, e
   nenhum sai no tique da resposta; `SESSION_EXITED` aparece no arquivo só nas guardas de entrada, que
   já existiam (`:752`, `:1092`).
   - Sem a `:1351`, a mensagem do usuário iria para a transcrição depois do `turn_failed`, e o
     `session/prompt` seguiria para um processo morto. Com o stdout aberto, isso pendura o `prompt` para
     sempre — o defeito exato que a S1 conserta.
   - Sem a `:1409`, um `turn_end` seria gravado depois do `turn_failed`, e o door 2 cairia.
   - O que falta: um teste por guarda, com o `budget` injetável segurando uma promessa enquanto o fake
     sai (o `prompt` rejeita e a transcrição tem um `turn_failed` só), e um com a resposta e a saída no
     mesmo tique. Os dois nomeados num check.
   - E um comportamento que ninguém decidiu, a registrar: nesse primeiro caso, o `turn_failed` fica
     gravado **sem** a pergunta. O `websocket.ts` (`reportFailure`) ainda manda um `error` com
     `session <id> has exited`, em inglês, por cima da linha.
2. **Precisão, C1 e C4 (não reprova).** O caminho do processo real — o cano fecha antes da saída, que é
   o que o §Problem mediu — só tem a frase do door 1 provada por testes que nenhum check nomeia. O M1
   mostra o custo: a frase volta a ser `ACP connection closed`, o vocabulário do SDK que o plano cita
   como defeito, e todos os checks continuam verdes. O `Handoff` registra o conserto (*"fechado a
   pedido"*), mas o `checks.md` não ganhou o check.
   - Julgamento do ponto 1 levantado pelos construtores: a espera de até 2 s é limitada e limpa
     (`clearTimeout` no `finally`, `AcpManager.ts:2585-2587`). Durante ela o `promptInFlight` segue
     ligado, e o `liveTurns()` e o `setConfig` ainda veem turno, o que é aceitável.
   - Mas a ordem 2 do C4 cai no prazo (2065 ms): ela prova *o prazo vence e depois a saída chega*, não
     *a saída chega dentro do prazo*. Essa segunda está em `AcpManager.test.ts:2779`.
   - `EXIT_AFTER_CLOSE_GRACE_MS` não é injetável, então cada um desses dois testes gasta 2 s de relógio
     real.
3. **Precisão, C25 (não reprova).** O check descreve um estado que a dobra não produz: 240 s desde o
   início da ferramenta e 300 s sem evento. O `tool_call` é ele mesmo um evento, então o `lastEventAt`
   nunca fica antes do `startedAt`. A prova escreve `lastEventAt` à mão (`turn-status.test.ts:152`).
   - A regra está provada assim mesmo, e num estado alcançável também: `turn-status.test.ts:160-169`
     tem a ferramenta aberta há 240 s e um `tool_call_update` 100 s atrás. São 100 s de silêncio, acima
     do limiar; o tom fica `normal` e a frase `há 4 min 0 s`, medida do início da chamada.
   - O check devia descrever esse caso.
4. **O `sendRefusal` vale para todo envio (ponto 4; follow-up).** O `cancel`, o `answer`, o `setMode`
   e o `setConfig` recusados também escrevem o motivo abaixo do composer, porque
   `onSendRejected: setSendRefusal` fica na `useConversationSession.ts:255`. Isso bate com a premissa do
   plano (*"abaixo do composer, até o próximo envio"*).
   - O efeito que sobra: o motivo só se limpa no próximo **prompt** (`:310`) ou na troca de sessão
     (`:187`), nunca no `attached` da reconexão.
   - Então, depois de a conexão voltar, fica na tela um `o socket não está aberto` vermelho que já não
     é verdade. E um `esc` recusado durante o turno fica até o turno acabar e alguém mandar outro prompt.
5. **O `useNow.test.ts` (ponto 2; sem achado).** O teste avança um `act` por segundo e afirma
   `result.current` em cada passo, mais a sequência `seen`. É mais forte do que um `act` de 3 s com a
   mesma asserção final seria: não há asserção enfraquecida, e o M3/M4 não se aplicam aqui. Um
   intervalo de 500 ms ou de 2 000 ms quebraria a `:26` ou a `:30`.
6. **Nível e amostragem da frase e do silêncio (ponto 5; sem achado).** A frase do servidor é amostrada
   nos três ramos de `exitText` (C2), no nível de integração com o agente falso que a matriz pede. O
   silêncio é amostrado nas duas bordas (89 e 90 s), nos três casos que não são silêncio e no caso
   *antes do primeiro bloco*, sobre estado dobrado pelo redutor — exceto o C25 (lacuna 3).

## Gate

- `LUMEM_GATE_BASE=origin/main pnpm gate:quick` - `docs ok`; *"a dependency, config or asset changed since origin/main, running the full suite"*; **293 files, 4874 passed, 6 skipped, 0 failed**. O diff não acrescenta nenhum `.skip`, `.todo` ou `.only`, e não remove nenhum teste.
- `pnpm gate:build` - verde, mas com 7/7 tarefas em cache. Por isso rodou também `pnpm exec turbo typecheck --force`: 4 tasks successful, 0 cached. `pnpm -s lint` saiu com 0, e `pnpm -s docs:check`, com `docs ok`.
- `gate:full` (Playwright) não executado: nenhum check declara prova e2e, e o veredito não depende dele.
