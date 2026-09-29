# Sinal de vida da conversa — verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: e3894e4..de6e6e3 (`origin/main..HEAD`); a correção é `36fee0e..de6e6e3` (`b38117c`..`de6e6e3`)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

A rodada 1 (FAIL em `36fee0e`, relatório em `b38117c`) está no histórico do git. Esta rodada se
limita ao diff da correção e a todo veredito da rodada 1 que não foi PASS: F1 (dois ramos do S1 sem
prova), F2 (precisão, C1/C4), F3 (precisão, C25) e F4 (`sendRefusal`). As provas dos 30 checks
rodaram **inteiras** no `HEAD` novo. Cada seção diz se foi `verified at de6e6e3` ou
`carried from 36fee0e`.

Os quatro achados da rodada 1 estão fechados, com prova nomeada e mutante morto em cada superfície
nova. O veredito continua FAIL por um motivo só, e ele está na superfície que a correção mexeu: as
guardas `session.turnId !== turnId` (`AcpManager.ts:1333` e `:1367`) tratam **qualquer** troca de
`turnId` como a saída do processo, e a saída não é a única coisa que troca o `turnId`. Um segundo
`prompt` na mesma sessão troca também (`:1303`). Com a correção, o primeiro `prompt` passou a esperar
um `exited` que ninguém vai rejeitar, porque o `releaseTurn` dele foi sobrescrito (`:1313`). Esse
`prompt` fica pendurado para sempre, que é o defeito que a S1 existe para consertar, e a pergunta dele
some. Reproduzido numa cópia descartável (ver *Gaps*, 1).

Todas as provas rodaram com o Node do `.nvmrc` (`v22.17.1`), numa invocação por pacote:

- `S` = `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts src/acp/websocket.test.ts -t "<os 12 nomes das provas do server, mais o teste da memória>"` — exit 0. Cada um dos 16 casos aparece individualmente com `✓` na saída (C2 e C4 expandem a tabela);
- `W` = `pnpm --filter @lumem/web exec vitest run <os 8 arquivos> -t "<os 24 nomes das provas do web>"` — exit 0, 25 `✓` (o `diz o que o agente está fazendo` casa também o teste `… ao lado do tempo`). O teste do F4, `o attached da reabertura tira o motivo de um envio recusado na queda`, rodou à parte: 1 passed.

## Binding sources

Verified at de6e6e3 para o que a correção tocou; o resto é carried from 36fee0e.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| LUM-67, Parte 1 — o turno fecha quando o adaptador morre | yes - `.context/attachments/linear-36a73b0b-64ca-4333-b406-9893249f789a/[LINEAR]-LUM-67.md`, relido em de6e6e3 (linhas 26-41) | none | - |
| LUM-67, Parte 2 — a queda da conexão aparece | yes - mesmo arquivo, relido em de6e6e3 (linhas 45-54) | none | - |
| LUM-67, Parte 3 — a linha de estado do turno | yes - carried from 36fee0e | none | - |
| LUM-67, Parte 4 — o aviso de silêncio | yes - carried from 36fee0e | none | - |

O passo 1 só roda onde a correção tocou a interface. A correção não mudou nenhum arranjo nem texto de
tela. Ela tocou três contratos, e cada um foi comparado com a issue:

- **C28** (a pergunta gravada, depois o `turn_failed`, sem frame `error`) bate com a Parte 1, linha 39: *"emite um fecho … antes de limpar os listeners — gravado no transcript"*. A Q4 = A acrescenta a pergunta **antes** do fecho, e a issue não decide sobre ela. O `memory_core` descartado não contradiz a issue, nem o critério 27, nem a Q4: o critério pede *"a mensagem do usuário seguida de um único `turn_failed`"* e não fala do núcleo. A regra que decide é a do próprio `prompt` (`AcpManager.ts:1360-1362`): *"a conversa gravada tem que estar na ordem em que o agente leu"*, e o agente nunca leu esse núcleo. O `coreInjected` também fica falso, então nada diz que o núcleo foi injetado.
- **C29**, um fecho só: é o *door 2* do plano, e a issue não o decide.
- **F4**, o `sendRefusal` limpo no `attached`: a Parte 2 (linha 54) decide só que *"`onSendRejected` diz ao composer que a mensagem não saiu, em vez de limpar o rascunho"*. Limpar o motivo quando a conexão volta não contradiz isso.

## Checks

Proofs verified at de6e6e3. As citações dos arquivos que a correção tocou foram refeitas
(`AcpManager.test.ts` a partir da `:2745`, `websocket.test.ts`, `useConversationSession.test.tsx`,
`turn-status.test.ts` a partir da `:121`). As outras são carried from 36fee0e, porque esses arquivos
não mudaram no diff da correção.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | a saída com turno em voo emite um `turn_failed` com `(saída 137)`, gravado e recebido pelo listener | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2705` - `expect(turnFailedIn(manager.transcript(id))).toEqual([closing])`; `:2707` - o mesmo sobre `events` (carried from 36fee0e, arquivo inalterado até a `:2744`) | PASS |
| C2 | `(saída 137)` · `(sinal SIGKILL)` · `(saída desconhecida)` | `S` exit 0, 3 casos | `packages/server/src/acp/AcpManager.test.ts:2711-2713` (tabela) e `:2721` - `toEqual([{ type: "turn_failed", message: ... ${says} }])` (carried) | PASS |
| C3 | stdout aberto: `prompt` rejeita com `AcpTurnFailedError` em < 1 s; `liveTurns()` vazio | `S` exit 0 (12 ms) | `packages/server/src/acp/AcpManager.test.ts:2738` - `toBeInstanceOf(AcpTurnFailedError)`; `:2739` - `expect(manager.liveTurns()).toEqual([])` (carried) | PASS |
| C4 | nas duas ordens, exatamente um `turn_failed` | `S` exit 0, 2 casos (63 ms e 165 ms, o prazo agora é 100 ms) | `packages/server/src/acp/AcpManager.test.ts:2765` - `expect(turnFailedIn(manager.transcript(id))).toHaveLength(1)` | PASS |
| C5 | a saída entre turnos não acrescenta `turn_failed` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2983` - `expect(types.at(-1)).toBe("turn_end")`; `:2984` - `expect(types).not.toContain("turn_failed")` | PASS |
| C6 | retrato `turn-failed` com `code: "exited"` e o `sessionId` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2994-2996` - `toHaveBeenCalledTimes(1)` e `toHaveBeenCalledWith(expect.objectContaining({ tag: "turn-failed", code: "exited", sessionId: id }))` | PASS |
| C7 | somente leitura sem fecho: sem `.mcaret`, linha de estado ou `■ interromper` | `W` exit 0 | `packages/web/src/features/conversation/conversation.test.tsx:1312` - `querySelector(".mcaret")).toBeNull()`; `:1314-1315` (carried) | PASS |
| C28 | saída 137 durante a leitura do teto: a pergunta, depois um `turn_failed` só; `AcpTurnFailedError`; sem `session/prompt`; o `/acp` sem frame `error` | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2860-2862` - `expect(turnOf(manager.transcript(info.id))).toEqual([{ type: "message", …, role: "user", text: "faz a coisa" }, { type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" }])`; `:2864` - `toBeInstanceOf(AcpTurnFailedError)`; `:2866` - `expect(fake.promptBlocks).toEqual([])`; `packages/server/src/acp/websocket.test.ts:585` - `expect(errors).toEqual([expect.objectContaining({ code: "INVALID_MESSAGE" })])` (só o erro do frame-sonda); `:587-589` - a pergunta e o `turn_failed` chegam pelo socket | PASS |
| C29 | resposta e saída no mesmo tique: um fecho só, o `turn_failed`, nenhum `turn_end`, `AcpTurnFailedError` | `S` exit 0 (397 ms, 25 voltas) | `packages/server/src/acp/AcpManager.test.ts:2957-2960` - `expect({ hops, closes }).toEqual({ hops, closes: [{ type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" }] })`; `:2961` - `toBeInstanceOf(AcpTurnFailedError)`; `:2964-2965` - a varredura teve as duas saídas | PASS (ver *Gaps*, 3: a varredura é determinística e a guarda é mesmo atravessada) |
| C30 | cano fecha primeiro: `(saída 137)` com a saída no prazo, `(saída desconhecida)` sem ela, nunca `ACP connection closed` | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2783` - `toEqual([closing])` com `(saída 137)`; `:2787` - `(error as Error).message).toBe(closing.message)`; `:2789-2790` - `not.toContain("ACP connection closed")` gravado e ao vivo; `:2802` - `toEqual([closing])` com `(saída desconhecida)`; `:2807-2808` - o mesmo `not.toContain`; `:2814` - a saída tardia não fecha de novo | PASS |
| C8 | `1006` mostra `conexão com o daemon caiu — reconectando` e reabre para a mesma sessão | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:330` - `failure).toMatchObject({ message: "conexão com o daemon caiu — reconectando", fatal: false })`; `:339-340` - 2 sockets, o segundo com `sessionId` `s-1` | PASS |
| C9 | 500 · 1 000 · 2 000 · 4 000 · 8 000 · 10 000 · 10 000 ms, e a oitava acontece | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:356` - `toHaveLength(before)` em `delay - 1`; `:361` - `toHaveLength(before + 1)`; `:370` - `toHaveLength(9)` | PASS |
| C10 | o `attached` da reabertura deixa 3 turnos e tira o aviso | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:399` - `turns).toHaveLength(3)`; `:400` - `failure).toBeNull()` | PASS |
| C11 | `4404` mostra `esta sessão não existe mais no daemon` e não reabre em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:411` - `failure?.message).toBe("esta sessão não existe mais no daemon")`; `:417` - `sockets).toHaveLength(1)` | PASS |
| C12 | desmontar, ou trocar de sessão, com reabertura agendada: nada para a antiga | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:432` - `unmounted.sockets).toHaveLength(1)`; `:446` - sockets de `s-1` com tamanho 1 | PASS |
| C13 | `send` devolve `false` fechado e por schema; o composer mantém o rascunho e mostra o motivo | `W` exit 0, as duas provas | `packages/web/src/features/conversation/acp-socket.test.ts:310` e `:316` - `toBe(false)`; `packages/web/src/features/conversation/conversation.test.tsx:233` - `toHaveValue("não perca isto")`, `:234` - `getByText("o socket não está aberto")` (carried) | PASS |
| C14 | no limite sai; um byte acima é recusado com a frase; o servidor fecha acima do limite compartilhado | `W` e `S` exit 0 | `packages/web/src/features/conversation/acp-socket.test.ts:332`, `:334`, `:340`, `:343` (carried); `packages/server/src/acp/websocket.test.ts:475` - `closeCode).toBeUndefined()` no limite, `:480` - `toBe(1009)` um acima | PASS |
| C15 | frame ilegível: aviso não fatal, socket aberto | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:458` - `failure).toEqual({ message: "o daemon mandou algo que esta tela não entende — recarregue a página", remedy: null, fatal: false })`; `:463` - `closed).toBe(false)` | PASS |
| C16 | usuário em 1000 põe os dois em 1000; chunk em 4000 move só `lastEventAt` | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:904-905`, `:912-913` (carried) | PASS |
| C17 | replay e dobra concordam | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:942-943`, `:950` (carried) | PASS |
| C18 | 72 s: `trabalhando · 1 min 12 s` com indicador animado; sem `streaming`, nada | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:32` - `getByText("trabalhando · 1 min 12 s")`; `:36`, `:40`, `:50` (carried) | PASS |
| C19 | os oito casos do decorrido | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:36-43` e `:47` - `expect(formatElapsed(seconds * 1000)).toBe(text)` (inalterado pela correção) | PASS |
| C20 | os sete casos do fazer | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:55-86` e `:92` - `expect(activityText(turnActivity(state))).toBe(text)` (inalterado) | PASS |
| C21 | `useNow(true)` a cada 1 000 ms; `useNow(false)` sem intervalo | `W` exit 0 | `packages/web/src/features/conversation/useNow.test.ts:41` - `seen).toEqual([1_000_000, 1_001_000, 1_002_000, 1_003_000])`; `:49` - `getTimerCount()).toBe(0)` (carried) | PASS |
| C22 | `.mcaret` anima por `@keyframes`; nenhum caret na mensagem do usuário | `W` exit 0, as duas provas | `packages/web/src/features/conversation/conversation-css.test.ts:259-260`; `packages/web/src/features/conversation/conversation.test.tsx:642`, `:653-654` (carried) | PASS |
| C23 | `animation: none` sob movimento reduzido | `W` exit 0 | `packages/web/src/features/conversation/conversation-css.test.ts:266-268` (carried) | PASS |
| C24 | 89 s sem `warning`; 90 s com a frase e o `esc` | `W` exit 0, as duas provas | `packages/web/src/features/conversation/turn-status.test.ts:130` - `tone).toBe("normal")`; `:134-135` - `warning` e `"sem sinal do agente há 1 min 30 s"`; `packages/web/src/features/conversation/TurnStatus.test.tsx:87`, `:94`, `:96` (carried) | PASS |
| C25 | `pending` há 240 s sem evento, e a mesma passando a `running` há 100 s: `rodando <título> há 4 min 0 s`, sem `warning`, só estados do redutor | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:165` - `replayConversation(entries)`, nada escrito à mão; `:167` - `expect(state.lastEventAt, how).toBe(quietSince)`; `:168` - `toBeGreaterThanOrEqual(90_000)`; `:171` - `expect(turnLine(state, now), how).toEqual({ tone: "normal", doing: "rodando Bash pnpm gate:quick há 4 min 0 s" })` | PASS |
| C26 | permissão pendente com 300 s sem evento: `esperando sua resposta`, normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:198` - `tone).toBe("normal")`; `:199` - `doing).toBe("esperando sua resposta")` | PASS |
| C27 | no âmbar, um evento move `lastEventAt` e o render sai do âmbar | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:107`, `:111` (carried) | PASS |

## Coverage

Refeita a partir do código, verified at de6e6e3, nas linhas cuja autoridade a correção tocou. As
outras são carried from 36fee0e e não aparecem de novo aqui: a forma de saída, o `/acp`, as esperas,
a recusa, o limite, o decorrido, o fazer, o limiar e o movimento.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| em que ponto do turno a saída chega (5) | `prompt`, `packages/server/src/acp/AcpManager.ts:1303-1450`: guardas em `:1333` (teto), `:1367` (memória), `:1411` (durante o pedido), `:1433` (resposta junto) | teto: C28 (`AcpManager.test.ts:2833`) · memória: `AcpManager.test.ts:2869`, **sem check** (ver *Gaps*, 2) · durante o pedido: C1, C3, C6 · junto com a resposta: C29 · entre turnos: C5 | - |
| o que troca o `turnId` de um turno em voo (2) | as duas escritas de `session.turnId`: `AcpManager.ts:1303` (um `prompt` novo) e `:2591` (`closeTurnOnExit`); as guardas `:1333`, `:1367`, `:1411`, `:1433` leem as duas como *"a saída fechou"* | a saída: C28, C29, C1 · um segundo `prompt` com o primeiro ainda lendo teto ou memória: **nenhuma prova**, e o comportamento é um `prompt` que nunca se resolve (*Gaps*, 1) | segundo `prompt` na mesma sessão, com o primeiro em `:1331`/`:1364` |
| a frase quando o cano fecha antes da saída (2) | `AcpManager.ts:1414` e `awaitExitAfterClose`, `:2605-2618` | saída no prazo: C30 (`:2768`) · prazo vencido: C30 (`:2793`) | - |
| o prazo depois do cano fechado (2 montagens) | lido direto: `AcpManager.ts:84` `EXIT_AFTER_CLOSE_GRACE_MS = 2_000`, default em `:699`; `packages/server/src/bootstrap.ts:171` e `packages/server/src/server.ts:145` não passam `exitAfterCloseGraceMs` | produção: 2 s, sem prova de teste (nenhum check afirma o valor; é uma constante legível) · teste: 50, 100 e 1 000 ms, injetados | - |
| door 2 — um fecho por turno | `:1411`, `:1433`, `:2591` | saída primeiro: C4 · cano primeiro: C4, C30 · resposta junto: C29 · saída tardia depois do prazo: C30 (`:2814`) | - |
| o que não é silêncio (3) | `turnLine`, `packages/web/src/features/conversation/turn-status.ts:102-110` | ferramenta `pending`: C25, 1º caso · ferramenta `running` (por `tool_call_update`): C25, 2º caso · permissão pendente: C26 | - |
| onde o motivo da recusa se limpa (3) | `setSendRefusal(null)` em `packages/web/src/features/conversation/useConversationSession.ts:187` (troca de sessão), `:240` (o `attached`, novo), `:314` (o próximo envio) | `attached`: `useConversationSession.test.tsx:495`, sem check (o F4 é follow-up da rodada 1, sem check a pedido) · próximo envio e troca de sessão: carried from 36fee0e, fora dos checks | - |

## Test policy rows

Carried from 36fee0e: o `checks.md` não tem `## Test policy`, e quem decide o nível é a matriz do
`docs/project/testing.md`. Os testes novos batem com ela (verified at de6e6e3). C28, C29 e C30 são
integração do transporte ACP com o agente falso. O C28 também passa pelo `/acp` de verdade
(`websocket.test.ts`). O C25 e o F4 são unit do `web`. Nenhum teste mexe em `process.env`, o git
não é mockado, e nenhum `.skip`, `.todo` ou `.only` entrou no diff da correção.

## Faults injected

Verified at de6e6e3. As mutações rodaram numa cópia descartável de `HEAD`: `git archive HEAD` em
`/private/tmp/lum035-v2`, com os `node_modules` ligados por symlink. A árvore real não foi tocada: o
`git status --porcelain` estava vazio antes e continuou vazio depois de a cópia ser apagada. Foram
seis mutações, uma acima do teto de cinco. A sexta foi feita porque a guarda da memória (M4) é o
ponto 1 do pedido desta rodada e tem uma superfície de asserção própria.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 — a guarda depois do teto volta a ser `throw new DomainError("SESSION_EXITED", …)` (o código da rodada 1) | `packages/server/src/acp/AcpManager.ts:1333` | yes — as duas provas do C28: `AcpManager.test.ts:2864` (não é `AcpTurnFailedError`) e `websocket.test.ts:585` (chega um `error` com `SESSION_EXITED` e `session … has exited`) |
| M2 — tirar a guarda depois da resposta | `packages/server/src/acp/AcpManager.ts:1433` | yes — C29, `AcpManager.test.ts:2957` (as voltas 1 e 2 gravam `turn_failed` e depois `turn_end`) |
| M3 — tirar `if (session.connection.signal.aborted) throw await this.awaitExitAfterClose(…)` (o M1 da rodada 1, que sobrevivera aos checks) | `packages/server/src/acp/AcpManager.ts:1414` | yes — as duas provas do C30. C1, C2 e as duas ordens do C4 continuam verdes, como na rodada 1: é o C30 que fecha a lacuna 2 da rodada 1 |
| M4 — tirar a guarda depois da memória | `packages/server/src/acp/AcpManager.ts:1367` | yes — mas **só** pelo teste sem check `AcpManager.test.ts:2869`. As duas provas do C28 continuaram verdes (ver *Gaps*, 2) |
| M5 — a ferramenta só deixa de ser silêncio quando está `pending` (`activity.kind === "tool" && activity.call.status === "pending"`) | `packages/web/src/features/conversation/turn-status.ts:102` | yes — C25, `turn-status.test.ts:171` (o 2º caso fica `warning`) |
| M6 — tirar `setSendRefusal(null)` do `attached` | `packages/web/src/features/conversation/useConversationSession.ts:240` | yes — F4, `useConversationSession.test.tsx:513` |

## Gaps, ranqueados

1. **Um segundo `prompt` pendura o primeiro para sempre (reprova, CONFIRMADO).**
   - **O mecanismo.** A guarda em `packages/server/src/acp/AcpManager.ts:1333` e `:1367` é `if (session.turnId !== turnId) await exited;`. O `turnId` muda em dois lugares: na saída (`:2591`) e no começo de todo `prompt` (`:1303`).
   - **O que acontece.** Se um segundo `prompt` chega enquanto o primeiro lê o teto ou a memória, o segundo sobrescreve o `session.releaseTurn` (`:1313`). O primeiro, ao voltar, entra na guarda e espera um `exited` que ninguém vai rejeitar.
   - **Reprodução.** Na cópia descartável: dois `prompt` numa sessão com o `budget` segurado. O primeiro liberado depois de o segundo começar.
     - `HEAD` `de6e6e3`: o segundo termina (`ok end_turn`), o primeiro `STILL PENDING after 500 ms`, e a transcrição fica `["message","turn_end"]`. A pergunta do primeiro sumiu.
     - `36fee0e`, rodada 1: o primeiro rejeitava com `DomainError: session … has exited`, falso com a sessão viva, e a pergunta também sumia.
     - `origin/main`: os dois terminavam, com as duas mensagens gravadas.
   - **A atribuição.** O defeito nasceu na S1 (`2d45c99`). A correção trocou o `throw` pelo `await exited` e transformou uma rejeição errada num `prompt` que nunca se resolve.
   - **Quem sofre.**
     - O `bootstrap.ts:385-387`, a esteira, espera o `prompt`.
     - O `sendPendingNow`, em `packages/server/src/sessions/pending-prompt.ts:169-174`, só solta a reivindicação no `finally`.
   - **Por onde entra.** A tela não barra isso por completo. O composer se desliga com `streaming` (`Composer.tsx:278`), mas o `streaming` só liga quando a mensagem do usuário chega, e a mensagem só é gravada **depois** do teto e da memória. Então uma segunda aba, ou a pessoa escrevendo na sessão da esteira nessa janela, entra.
   - **A menor correção** é uma decisão, e ela é do dono.
     - Ou o `prompt` recusa com `DomainError` quando `session.promptInFlight` já é verdadeiro, o que casa com a tela e muda o comportamento de `origin/main`.
     - Ou a guarda passa a olhar a saída de fato (`session.info.state === "exited"`, ou o `turnId` que o `closeTurnOnExit` fechou), com um `releaseTurn` por turno.
     - Nos dois casos, com um check que prove que o primeiro `prompt` termina.
   - Vale uma entrada no `open-questions.md` (Q5), porque *"dois prompts na mesma sessão"* nunca foi decidido.
2. **Precisão, C28 e a linha de Coverage (não reprova).** O `checks.md` põe *"durante o teto ou a memória C28"* no conjunto *turno em voo na saída*, mas o C28 afirma e prova só o teto. O M4 mostra o custo: sem a guarda da memória, as duas provas do C28 continuam verdes, e só o teste sem check `AcpManager.test.ts:2869` morre. Esse teste existe, rodou e afirma o que deve (`:2897` - `memory_core` ausente; `:2898-2901` - a pergunta e `(sinal SIGKILL)`). A correção é só no `checks.md`: nomear esse teste como segunda prova do C28 e dizer *"o teto ou a memória"* no claim. É a própria regra que a correção registrou no `testing.md` (*"um ramo que o construtor acrescenta além do check … ganha linha no Coverage e prova"*).
3. **C29: a prova afirma o check e é determinística (sem achado).**
   - **Onde a saída cai.** Instrumentei a cópia para ver por onde cada volta passa. Nas cinco execuções, a volta 0 caiu no `catch` (`:1411`, a saída perdeu a corrida para a resposta), as voltas 1 e 2 caíram **na guarda** `:1433`, e da volta 3 à 24 veio `turn_end` (o caso do C5). A largura da janela bate com o que o construtor disse: duas microtarefas.
   - **É determinística.** Entre a resposta e a saída só há microtarefas, sem relógio, e as cinco execuções deram o mesmo mapa.
   - **Afirma o check.** Por volta, o C29 é afirmado inteiro sempre que a saída pega o turno aberto (`:2957-2961`).
   - **A ressalva.** As duas asserções finais (`:2964-2965`) não afirmam que alguma volta *caiu na guarda*: a volta 0 sozinha já satisfaz *"algum `turn_failed"`*. O argumento que fecha isso é de contiguidade: cada volta avança uma microtarefa, então passar de *"a saída antes da resposta"* para *"depois do `turn_end`"* atravessa qualquer janela de largura ≥ 1. Se a janela sumir, a guarda vira código morto, e o mutante equivalente não é defeito da prova. O M2 confirma que hoje ela é atravessada.
4. **Os achados da rodada 1, um a um.**
   - **F1:** fechado. O teto tem o C28, a resposta junto tem o C29, e a memória tem prova, mas sem check (lacuna 2).
   - **F2:** fechado pelo C30, e o M3 agora morre.
   - **F3:** fechado, porque o C25 só usa estado dobrado (`turn-status.test.ts:165-167`).
   - **F4:** fechado em `useConversationSession.ts:240`, e o M6 morre.
   - **O prazo:** é injetável (`AcpManager.ts:537`, `:699`, `:2608`), e a produção fica em 2 s, porque nenhuma montagem passa a opção.
5. **Efeito da Q4 no prompt pendente (follow-up, SUSPEITA, não executado).** O `sendPendingNow` zera a pendência quando vê a mensagem do usuário (`pending-prompt.ts:153-157`). Agora o `closeTurnOnExit` emite essa mensagem antes de limpar os listeners (`AcpManager.ts:2583-2586`). Então um prompt pendente cujo adaptador sai durante a leitura do teto sai da linha da sessão, e antes ficava na linha, como o `pending-prompt.ts:58-59` quer para a sessão que morre antes do envio (*"para a retomada levar adiante"*). O texto não se perde, porque está na transcrição, mas a retomada não o reenvia mais. Ninguém decidiu isso; vale uma linha na Q4.

## Gate

Verified at de6e6e3:

- `LUMEM_GATE_BASE=origin/main pnpm gate:quick` - `docs ok`; *"a dependency, config or asset changed since origin/main, running the full suite"*; **293 files, 4878 passed, 6 skipped, 0 failed**. Na rodada 1 eram 4874. São cinco testes a mais (C28 × 2, C29, o da memória e o do F4) e um a menos, o teste extra do C25 absorvido.
- `pnpm exec turbo typecheck --force` - 4 successful, 0 cached. `pnpm -s lint` saiu com 0. `pnpm gate:build` deu 7/7 em cache, e é o `--force` acima que sustenta o typecheck.
- O `gate:full` (Playwright) não foi executado: nenhum check declara prova e2e, e o veredito não depende dele.
