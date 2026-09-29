# Sinal de vida da conversa — verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: 0f06d85..6fe1136 (`origin/main..HEAD`, depois do merge `ea76853`); a correção e o merge são `6f5b3c0..6fe1136` (`ea76853`, `bef781b`, `8de0699`, `55100a7`, `113b0bc`, `6fe1136`)
**Round**: 4 - scoped
**Verifier**: independent sub-agent (author != verifier)

As rodadas 1 (FAIL, relatório em `b38117c`), 2 (FAIL, `7730087`) e 3 (FAIL, `6f5b3c0`) estão no
histórico do git. A feature foi renumerada de `035` para `037` no merge `ea76853`, e o relatório da
rodada 3 mora hoje neste caminho. O dono autorizou esta quarta rodada além do limite de três.

Esta rodada cobre três coisas. Primeiro, a correção dos achados da rodada 3. Segundo, o que o merge
com a `origin/main` resolveu à mão: `AcpManager.ts`, `AcpManager.test.ts`, `Transcript.tsx`,
`architecture.test.ts`, `scripts/package-boundaries.test.ts` e `PlanModeBanner.test.tsx`. Terceiro,
todo veredito da rodada 3 que não foi PASS. As provas dos **31** checks rodaram **inteiras** no
`HEAD` novo (`6fe1136`). Cada seção diz se foi `verified at 6fe1136` ou `carried from 54cab53`.

**O que a correção fechou.** Os três mutantes que sobreviviam na rodada 3 agora morrem, cada um
numa prova nomeada do C31:

- o MA morre em `closes the remaining prompt when the adapter exits after the first one ends`;
- o MB e o MC morrem em `records both questions and one closing when the adapter exits with two held`.

A troca do `messageId` (F5) também tem o seu teste, e o mutante que a desfaz morre. A door 4 voltou
para dentro da tabela do `Landing`. A door 2 ganhou a nota que delimita o que dela ficou de pé.

**Por que continua FAIL.** O merge reescreveu a expressão do caret no `Transcript.tsx` (`:118-122`).
Ao pôr falha nessa superfície, apareceu um mutante que sobrevive: **tirar o `!readOnly` do caret não
deixa nenhuma prova vermelha** (MH). O C7 prova somente leitura com uma transcrição que termina em
mensagem do **usuário**. Nesse cenário, a guarda de papel (`turn.role === "agent"`), que veio da S3,
já apaga o caret sozinha. Assim, a regra que a issue fixa na linha 40, *"o caret só aparece com
`streaming && !readOnly`"*, não é decidida por nenhum teste. Sondei o caso numa cópia descartável,
com uma conversa somente leitura que termina numa resposta do agente pela metade e sem fecho:

- no `HEAD`, nenhum `.mcaret` aparece, e isso está certo;
- com o MH, o caret aparece, e é o defeito que a Parte 1 descreve (*"o caret continua desenhado na
  conversa encerrada"*).

O defeito não é do merge. Ele existe desde a S3, e as rodadas 1 a 3 nunca puseram falha nessa guarda.
O merge só tocou a linha, e por isso ela entrou no escopo.

Todas as provas rodaram com o Node do `.nvmrc` (`v22.17.1`), numa invocação por pacote:

- `S` = `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts src/acp/websocket.test.ts --reporter=verbose -t "<os 17 nomes das provas do server, mais o teste do F5>"`. Resultado: `Tests 21 passed | 142 skipped`. Cada um dos 21 casos aparece individualmente com `✓`, porque o C2 e o C4 expandem a tabela. As duas provas novas do C31 aparecem assim: `✓ … records both questions and one closing when the adapter exits with two held 7ms` e `✓ … closes the remaining prompt when the adapter exits after the first one ends 6ms`. O teste do F5 aparece como `✓ … gives each question its own message id with two prompts in flight 1ms`;
- `W` = `pnpm exec vitest run <os 8 arquivos> --reporter=verbose -t "<os 24 nomes das provas do web>"`, rodado em `packages/web`. Resultado: `Tests 25 passed | 182 skipped`, cada um com `✓`. O 25º é `diz o que o agente está fazendo ao lado do tempo`, que o padrão do C20 também casa.

## Binding sources

Verified at 6fe1136 para a Parte 1, porque o merge tocou a tela da conversa (`Transcript.tsx`) e a
correção tocou o contrato do daemon. As Partes 2 a 4 são carried from 54cab53: nem a correção nem o
merge mexeram na superfície delas. O merge só renomeou `035` para `037` nos comentários de
`useConversationSession.ts`, `turn-status.ts`, `TurnStatus.tsx`, `useNow.ts` e `acp-socket.ts`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| LUM-67, Parte 1 — o turno fecha quando o adaptador morre | yes - `.context/attachments/linear-36a73b0b-64ca-4333-b406-9893249f789a/[LINEAR]-LUM-67.md`, relido em 6fe1136 (linhas 26-41) | none | o caret só com `streaming && !readOnly` (linha 40) numa conversa somente leitura cujo último bloco é do agente — nenhum check o decide; o C7 só cobre o caso em que a guarda de papel já decide |
| LUM-67, Parte 2 — a queda da conexão aparece | yes - carried from 54cab53 | none | - |
| LUM-67, Parte 3 — a linha de estado do turno | yes - carried from 54cab53 | none | - |
| LUM-67, Parte 4 — o aviso de silêncio | yes - carried from 54cab53 | none | - |

A lacuna da Parte 1 tem duas pontas, e as duas estão no `prd.md`:

- **A issue.** A linha 35 descreve o caso do C7, uma transcrição que *"termina numa mensagem do
  usuário sem fecho"*. A linha 40 decide a regra geral: *"o caret só aparece com `streaming &&
  !readOnly`"*.
- **O critério 6 do `prd.md`.** Ele diz *"WHILE a conversa é somente leitura the web SHALL não
  desenhar o caret … **inclusive** numa transcrição que termina em mensagem do usuário sem fecho"*.
  O C7 prova só o caso do *"inclusive"*. Depois da S3, esse caso está coberto duas vezes, pelo
  `!readOnly` e pela regra do critério 21, e por isso não distingue uma guarda da outra. O caso geral,
  com o último bloco do agente, não tem prova.
- **O `Surface` do `prd.md`.** A linha 112 conta com isso para os dados gravados: *"a tela as lê
  certo porque `readOnly` desliga o que é de turno vivo"*.

O contrato do daemon com dois `prompt` em voo segue sem contradição contra a Parte 1 (linha 39),
como a rodada 3 julgou. A correção só acrescentou prova, e a door 4 diz agora *"`markExited` fecha
uma vez e liberta todos"*, o que a 3ª prova do C31 afirma.

## Checks

Proofs verified at 6fe1136, as 31. Refiz as citações dos arquivos que o merge ou a correção tocaram:

- **`AcpManager.test.ts`.** As provas novas entraram depois da `:3035`, e as do C5 e do C6
  desceram 131 linhas.
- **`conversation-css.test.ts`.** A `036` acrescentou 18 linhas antes das provas do C22 e do C23.
- **`conversation-model.test.ts`.** A `036` acrescentou 34 linhas antes das provas do C16 e do C17.

Nos outros arquivos de teste, o merge só trocou `035` por `037` linha por linha, sem mudar a
contagem. Conferi as linhas citadas uma a uma, e elas continuam as mesmas.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | a saída com turno em voo emite um `turn_failed` com `(saída 137)`, gravado e recebido pelo listener | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2705` - `expect(turnFailedIn(manager.transcript(id))).toEqual([closing])`; `:2707` - o mesmo sobre `events` | PASS |
| C2 | `(saída 137)` · `(sinal SIGKILL)` · `(saída desconhecida)` | `S` exit 0, 3 casos | `packages/server/src/acp/AcpManager.test.ts:2710-2714` (tabela) e `:2720` - `expect(turnFailedIn(manager.transcript(id))).toEqual([{ type: "turn_failed", message: … }])` | PASS |
| C3 | stdout aberto: `prompt` rejeita com `AcpTurnFailedError` em < 1 s; `liveTurns()` vazio | `S` exit 0 (7 ms) | `packages/server/src/acp/AcpManager.test.ts:2737` - `settled).not.toBe("pendurado")`; `:2738` - `toBeInstanceOf(AcpTurnFailedError)`; `:2739` - `expect(manager.liveTurns()).toEqual([])` | PASS |
| C4 | nas duas ordens, exatamente um `turn_failed` | `S` exit 0, 2 casos | `packages/server/src/acp/AcpManager.test.ts:2765` - `expect(turnFailedIn(manager.transcript(id))).toHaveLength(1)` | PASS |
| C5 | a saída entre turnos não acrescenta `turn_failed` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3184` - `expect(types.at(-1)).toBe("turn_end")`; `:3185` - `expect(types).not.toContain("turn_failed")` | PASS |
| C6 | retrato `turn-failed` com `code: "exited"` e o `sessionId` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3195-3196` - `toHaveBeenCalledTimes(1)` e `toHaveBeenCalledWith(expect.objectContaining({ tag: "turn-failed", code: "exited", sessionId: id }))` | PASS |
| C7 | somente leitura sem fecho, terminando na mensagem do usuário: sem `.mcaret`, linha de estado ou `■ interromper` | `W` exit 0 | `packages/web/src/features/conversation/conversation.test.tsx:1312` - `querySelector(".mcaret")).toBeNull()`; `:1314` - `queryByText(/trabalhando/)).not.toBeInTheDocument()`; `:1315` - `interromper` ausente | PASS (o claim, como escrito; o `!readOnly` do caret não é decidido por ele — ver *Gaps*, 1) |
| C28 | saída 137 durante a leitura do teto **ou da memória**: a pergunta, depois um `turn_failed` só; `AcpTurnFailedError`; sem `session/prompt`; o `/acp` sem frame `error` | `S` exit 0, as três provas | teto: `packages/server/src/acp/AcpManager.test.ts:2860` - `expect(turnOf(manager.transcript(info.id))).toEqual([…"faz a coisa"…, { type: "turn_failed", … }])`, `:2864` - `toBeInstanceOf(AcpTurnFailedError)`, `:2866` - `expect(fake.promptBlocks).toEqual([])`; memória: `:2897` - `memory_core`).toBe(false)`, `:2898` - a pergunta e o `turn_failed`, `:2902`, `:2903`; `/acp`: `packages/server/src/acp/websocket.test.ts:585` - `expect(errors).toEqual([expect.objectContaining({ code: "INVALID_MESSAGE" })])` | PASS |
| C29 | resposta e saída no mesmo tique: um fecho só, o `turn_failed`, nenhum `turn_end`, `AcpTurnFailedError` | `S` exit 0 (397 ms, 25 voltas) | `packages/server/src/acp/AcpManager.test.ts:2957` - `expect({ hops, closes }).toEqual({ hops, closes: [{ type: "turn_failed", … }] })`; `:2961` - `toBeInstanceOf(AcpTurnFailedError)`; `:2964-2965` | PASS |
| C30 | cano fecha primeiro: `(saída 137)` no prazo, `(saída desconhecida)` sem ela, nunca `ACP connection closed` | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2783` - `toEqual([closing])`; `:2787` - `(error as Error).message).toBe(closing.message)`; `:2789-2790` - `not.toContain("ACP connection closed")`; `:2802`, `:2807-2808`, `:2814` | PASS |
| C31 | dois `prompt`, o primeiro segurado no teto: os dois resolvem; com a saída e os dois em voo, os dois rejeitam em < 1 s; com os dois segurados na saída, a transcrição é `[primeira, segunda, turn_failed]` e um retrato só; com o segundo terminado antes da saída, o primeiro rejeita e a transcrição termina em `turn_failed` | `S` exit 0, as quatro provas | `packages/server/src/acp/AcpManager.test.ts:2996`, `:2999` - os dois `stopReason`; `:3005` - nenhum `turn_failed`; `:3032`, `:3034-3035` - `pendurado` não, `toBeInstanceOf(AcpTurnFailedError)`; `:3077-3081` - `expect(manager.transcript(info.id).map((entry) => entry.event)).toEqual([{ …text: "primeira" }, { …text: "segunda" }, { type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" }])`; `:3082` - `expect(turnFailures).toHaveBeenCalledTimes(1)`; `:3127` - `expect(outcome).not.toEqual({ stopReason: "end_turn" })`; `:3128` - `toBeInstanceOf(AcpTurnFailedError)`; `:3130` - `expect(events.at(-1)).toEqual({ type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" })` | PASS |
| C8 | `1006` mostra `conexão com o daemon caiu — reconectando` e reabre para a mesma sessão | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:330` - `failure).toMatchObject({ message: "conexão com o daemon caiu — reconectando", fatal: false })`; `:339-340` (carried from 54cab53) | PASS |
| C9 | 500 · 1 000 · 2 000 · 4 000 · 8 000 · 10 000 · 10 000 ms, e a oitava acontece | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:356`, `:361`, `:370` - `toHaveLength(9)` (carried from 54cab53) | PASS |
| C10 | o `attached` da reabertura deixa 3 turnos e tira o aviso | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:399` - `turns).toHaveLength(3)`; `:400` - `failure).toBeNull()` (carried from 54cab53) | PASS |
| C11 | `4404` mostra `esta sessão não existe mais no daemon` e não reabre em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:411`, `:417` - `sockets).toHaveLength(1)` (carried from 54cab53) | PASS |
| C12 | desmontar, ou trocar de sessão, com reabertura agendada: nada para a antiga | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:432`, `:446` (carried from 54cab53) | PASS |
| C13 | `send` devolve `false` fechado e por schema; o composer mantém o rascunho e mostra o motivo | `W` exit 0, as duas provas | `packages/web/src/features/conversation/acp-socket.test.ts:310`, `:316` - `toBe(false)`; `packages/web/src/features/conversation/conversation.test.tsx:233-234` (carried from 54cab53) | PASS |
| C14 | no limite sai; um byte acima é recusado com a frase; o servidor fecha acima do limite compartilhado | `W` e `S` exit 0 | `packages/web/src/features/conversation/acp-socket.test.ts:332`, `:334`, `:340`, `:343`; `packages/server/src/acp/websocket.test.ts:475`, `:480` - `toBe(1009)` (carried from 54cab53) | PASS |
| C15 | frame ilegível: aviso não fatal, socket aberto | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:458`, `:463` - `closed).toBe(false)` (carried from 54cab53) | PASS |
| C16 | usuário em 1000 põe os dois em 1000; chunk em 4000 move só `lastEventAt` | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:938-939` - `turnStartedAt).toBe(1000)`, `lastEventAt).toBe(1000)`; `:946-947` - `lastEventAt).toBe(4000)`, `turnStartedAt).toBe(1000)` | PASS |
| C17 | replay e dobra concordam | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:976-977` - `folded.turnStartedAt).toBe(replayed.turnStartedAt)`, `folded.lastEventAt).toBe(replayed.lastEventAt)`; `:984` | PASS |
| C18 | 72 s: `trabalhando · 1 min 12 s` com indicador animado; sem `streaming`, nada | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:32` - `getByText("trabalhando · 1 min 12 s")`; `:36`, `:40`, `:50` (carried from 54cab53) | PASS |
| C19 | os oito casos do decorrido | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:36-43` e `:47` - `expect(formatElapsed(seconds * 1000)).toBe(text)` (carried from 54cab53) | PASS |
| C20 | os sete casos do fazer | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:55-86` e `:92` - `expect(activityText(turnActivity(state))).toBe(text)` (carried from 54cab53) | PASS |
| C21 | `useNow(true)` a cada 1 000 ms; `useNow(false)` sem intervalo | `W` exit 0 | `packages/web/src/features/conversation/useNow.test.ts:41`, `:49` - `getTimerCount()).toBe(0)` (carried from 54cab53) | PASS |
| C22 | `.mcaret` anima por `@keyframes`; nenhum caret na mensagem do usuário | `W` exit 0, as duas provas | `packages/web/src/features/conversation/conversation-css.test.ts:277-278` - `expect(name).toBeDefined()`, `expect(body).toMatch(new RegExp(`@keyframes\\s+${name …}\\s*\\{`))`; `packages/web/src/features/conversation/conversation.test.tsx:642` - `querySelector(".mcaret")).toBeNull()`, `:653-654` - um caret só, dentro de `.turn--agent` | PASS |
| C23 | `animation: none` sob movimento reduzido | `W` exit 0 | `packages/web/src/features/conversation/conversation-css.test.ts:284-286` - para `.mcaret` e `.turn-status__pulse`, `expect(declarations, selector).toMatch(/animation:\s*none/)` | PASS |
| C24 | 89 s sem `warning`; 90 s com a frase e o `esc` | `W` exit 0, as duas provas | `packages/web/src/features/conversation/turn-status.test.ts:130`, `:134-135`; `packages/web/src/features/conversation/TurnStatus.test.tsx:87`, `:94`, `:96` (carried from 54cab53) | PASS |
| C25 | `pending` há 240 s sem evento, e a mesma passando a `running` há 100 s: `rodando <título> há 4 min 0 s`, sem `warning` | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:165-168`, `:171` - `toEqual({ tone: "normal", doing: "rodando Bash pnpm gate:quick há 4 min 0 s" })` (carried from 54cab53) | PASS |
| C26 | permissão pendente com 300 s sem evento: `esperando sua resposta`, normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:198-199` (carried from 54cab53) | PASS |
| C27 | no âmbar, um evento move `lastEventAt` e o render sai do âmbar | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:107`, `:111` (carried from 54cab53) | PASS |

## Coverage

Verified at 6fe1136 nas linhas cuja autoridade a correção ou o merge tocaram: o `markExited`, o
`closeTurnOnExit`, os dois `prompt` e a expressão do caret. As outras são carried from 54cab53 e não
se repetem aqui: a forma da saída, a frase com o cano primeiro, o prazo, o `/acp`, as esperas, a
recusa, o limite, o decorrido, o fazer, o limiar e o movimento.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| o que liga o fecho no `markExited` (2) | `packages/server/src/acp/AcpManager.ts:2572` - `if (session.promptInFlight \|\| session.turnsInFlight.size > 0)` | `promptInFlight` ligado: C1, C3, C4, C6, C28 · `promptInFlight` já desligado pelo segundo `prompt`, com o primeiro ainda no teto: C31, 4ª prova (`:3127`), e o MA morre | - |
| dois `prompt` na mesma sessão (4) | critério 29, door 4, as guardas do `prompt` (`:1354`, `:1387`, `:1431`, `:1453`) × o `closeTurnOnExit` (`:2614-2639`) | nenhuma saída: C31 (`:2996-3005`) · saída com os dois depois da pergunta: C31 (`:3032-3035`) · saída com os dois no teto, a pergunta de cada um gravada: C31 (`:3077-3081`), e o MC morre · saída depois de um dos dois terminar: C31 (`:3127-3130`), e o MA morre | - |
| door 4 — um gatilho por `prompt` em voo (2 cláusulas do `Landing`) | `prd.md:130` - *"`markExited` fecha uma vez e liberta todos"* | liberta todos: C31 (`:3034-3035`, `:3086-3087`) · fecha uma vez: C31 (`:3077-3082`), com um `turn_failed` e um retrato; o MB e o MB2 morrem | - |
| o que a saída emite, em ordem, com pedido pendente e turno em voo (2) | o merge: `AcpManager.ts:2567` (`cancelPending`) antes de `:2572` (`closeTurnOnExit`) | `permission_resolved cancelled` antes do evento de saída: `035` C29 (`AcpManager.fake-adapter.test.ts:231`), verde · `turn_failed`: C1 · a ordem entre os dois não é decidida por nenhuma fonte, e o redutor acha o pedido em qualquer turno (`conversation-model.ts:343`), então ela não muda a tela | - |
| quando o caret aparece (4) | issue linha 40, critérios 6 e 21, `packages/web/src/features/conversation/Transcript.tsx:118-122` | ao vivo, bloco do agente: C22 (`:653-654`) · ao vivo, mensagem do usuário: C22 (`:642`), e o MI morre · sem `streaming`: C18 · somente leitura, último bloco do usuário: C7 (`:1312`) · **somente leitura, último bloco do agente: nenhuma prova** — o MH tira o `!readOnly` e as 25 provas do `W` continuam verdes | somente leitura com o último bloco do agente |
| o `messageId` da pergunta (2 caminhos) | `AcpManager.ts:1408` (o `prompt`) e `:2625` (a saída) | o `prompt`: o teste do F5 (`:3165-3166`), e o MG morre · a saída: `turn.id` desde a rodada 2, e as duas perguntas da 3ª prova do C31 saem da mesma troca | - |

## Test policy rows

Carried from 54cab53: o `checks.md` não tem `## Test policy`, e quem decide o nível é a matriz do
`docs/project/testing.md`. As três provas novas (verified at 6fe1136) são integração do transporte
ACP com o agente falso, o nível que a matriz pede. As duas do C31 e a do F5 seguem a mesma regra:
nenhuma mexe em `process.env`, o git não é mockado, e nenhum `.skip`, `.todo` ou `.only` entrou em
`6f5b3c0..6fe1136`.

## Faults injected

Verified at 6fe1136.

**Onde.** As mutações rodaram numa cópia descartável de `HEAD`: `git archive HEAD` em
`/private/tmp/lum037-v4`, com os `node_modules` ligados por symlink. A árvore real não foi tocada: o
`git status --porcelain` estava vazio antes e continuou vazio depois de a cópia ser apagada. Os
mutantes do server rodaram contra o `describe` inteiro (`-t "o adaptador que sai no meio do turno"`,
19 testes). Os do web rodaram contra as duas provas de caret do `conversation.test.tsx`, e o MH
também contra as 25 do `W`.

**Por que sete, acima do teto de cinco.** O pedido nomeia três mutantes (MA, MB, MC). O MB2 é a
segunda superfície de asserção da mesma prova, o retrato que o claim diz *"só"*. A correção do F5
criou uma superfície própria (MG). O merge reescreveu a expressão do caret, que tem duas guardas
sobrepostas, e cada uma pede uma falha própria (MH, MI).

| Mutation | Location | Killed |
| --- | --- | --- |
| MA — o `markExited` volta a fechar só com `session.promptInFlight` (o código da rodada 2) | `packages/server/src/acp/AcpManager.ts:2572` | yes — C31, 4ª prova, em `:3127`: `expected { stopReason: 'end_turn' } to not deeply equal { stopReason: 'end_turn' }` |
| MB — o `closeTurnOnExit` grava um `turn_failed` a mais por turno em voo além do primeiro | `packages/server/src/acp/AcpManager.ts:2632` | yes — C31, 3ª prova (`:3077`, a transcrição exata) |
| MB2 — o `closeTurnOnExit` grava um retrato `turn-failed` a mais por turno em voo além do primeiro | `packages/server/src/acp/AcpManager.ts:2631` | yes — C31, 3ª prova (`:3082`, `toHaveBeenCalledTimes(1)`) |
| MC — o laço da pergunta para depois do primeiro turno (`break`) | `packages/server/src/acp/AcpManager.ts:2622-2627` | yes — C31, 3ª prova (`:3077`) |
| MG — a pergunta volta a sair com `messageId: session.turnId` (desfaz o F5) | `packages/server/src/acp/AcpManager.ts:1408` | yes — `gives each question its own message id with two prompts in flight` (`:3166`) |
| MH — tirar o `!readOnly` da expressão do caret | `packages/web/src/features/conversation/Transcript.tsx:119` | no — 2 passed nas provas de caret, e as 25 do `W` seguem verdes. O C7 termina na mensagem do usuário, e o `turn.role === "agent"` apaga o caret sozinho |
| MI — tirar o `turn.role === "agent"` da expressão do caret | `packages/web/src/features/conversation/Transcript.tsx:120` | yes — C22, 2ª prova (`conversation.test.tsx:642`) |

## Gaps, ranqueados

1. **O `!readOnly` do caret não é decidido por nenhuma prova, e o mutante que o tira sobrevive
   (reprova, CONFIRMADO).**
   - **O mecanismo.** A expressão em `packages/web/src/features/conversation/Transcript.tsx:118-122`
     tem duas guardas que apagam o caret, `!readOnly` (S1) e `turn.role === "agent"` (S3). A prova do
     C7 (`conversation.test.tsx:1302-1316`) monta a conversa somente leitura com uma só entrada, a
     mensagem do usuário. Nesse cenário a segunda guarda já decide, e a primeira nunca é a que decide.
   - **A sonda.** Fiz um teste descartável na cópia, com uma conversa somente leitura de duas
     entradas: a pergunta, e uma resposta do agente pela metade, sem fecho.
     - No `HEAD`, `document.querySelector(".mcaret")` é `null`, e isso está certo.
     - Com o MH, a asserção falha com `expected <span class="mcaret" …(1)></span> to be null`. É uma
       conversa encerrada com o caret piscando, o defeito que a issue descreve na linha 35.
   - **Não é do merge.** A sobreposição existe desde a S3 (`0aa1c00`). As rodadas 1 a 3 nunca puseram
     falha nessa guarda. O merge reescreveu a linha para caber na estrutura da `036`, e só por isso ela
     entrou no escopo desta rodada.
   - **A regra.** Issue, linha 40 (*"o caret só aparece com `streaming && !readOnly`"*). Critério 6
     (*"WHILE a conversa é somente leitura … SHALL não desenhar o caret"*). `prd.md:112`, que conta com
     isso para as transcrições antigas em disco.
   - **Propaga.** O `!readOnly` agora também decide, na estrutura da `036`, se o pensamento abre
     sozinho (`thoughtOpen = … ?? streaming`, `Transcript.tsx:124`) e se leva `thought--live`, numa
     conversa somente leitura sem fecho. Nenhuma prova da `036` põe esse caso em cena.
   - **A menor correção.** Uma 2ª prova no C7, com um claim que a nomeie. A conversa somente leitura
     termina num bloco do agente sem fecho (`message` do usuário e depois `message` do agente), e a
     prova afirma `document.querySelector(".mcaret")).toBeNull()`. O claim do C7 passa a dizer
     *"termine ela na mensagem do usuário ou num bloco do agente"*.
2. **Os achados da rodada 3, um a um (fechados).**
   - **F1 (MA)**, o ramo do `markExited` sem prova: fechado. A 4ª prova do C31 põe o outro escritor
     do `promptInFlight` em cena (o segundo `prompt`, que termina e o desliga), e o MA morre em `:3127`
     com o formato exato do defeito, *"`end_turn` com o processo morto"*.
   - **F2 (MB)**, a door 4 sem o *"fecha uma vez"*: fechado. O claim do C31 diz agora *"com um
     retrato `turn-failed` só"* e a transcrição exata, e o MB e o MB2 morrem na 3ª prova.
   - **F3 (MC)**, a pergunta de cada turno: fechado. A 3ª prova afirma
     `[primeira, segunda, turn_failed]` com as duas perguntas ainda no teto, e o MC morre.
   - **F4**, a door 4 fora da tabela e a door 2 sem nota: fechado.
     - A linha em branco saiu, e a door 4 é a 4ª linha da tabela (`prd.md:130`).
     - A door 2 (`prd.md:128`) guarda o texto antigo e ganhou *"nota (rodada 2): o mecanismo do
       `turnId` foi substituído pela door 4 …; a regra de um fecho só por turno fica de pé"*. É a
       regra 6 do `CLAUDE.md`: a nota no requisito contradito, delimitando o que sobrou.
     - `pnpm -s feature:check plan` sai com 0.
   - **F5**, o `messageId` da pergunta: fechado. `AcpManager.ts:1408` usa `turn.id`, como a saída em
     `:2625`, e o MG morre no teste novo.
3. **O ponto 2 do pedido: o `fallbackMessageId: session.turnId` (`AcpManager.ts:2098`) fica fora do
   escopo (sem achado).**
   - **É anterior à feature.** O `git blame` dá `885f6f85`, de 2026-08-19, e a mesma linha está em
     `origin/main` (`:2015`). O diff não a toca.
   - **Não tem o formato do F5.** A pergunta tem um dono conhecido, o `prompt` que a grava, e por
     isso o id próprio dela estava à mão. O `session/update` do ACP não diz a que `session/prompt`
     pertence. Com dois em voo, não há um id por turno para usar no lugar do `turnId`, e o mais recente
     é a única informação que existe.
   - **Não é membro de conjunto desta feature.** Nenhum claim, `Landing` ou critério fala do id do
     texto do agente. A Q5 = B põe fora do escopo o estado de turno único com dois turnos.
4. **O ponto 3 do pedido: provas que já passaram quando foram escritas, com evidência por mutação
   (aceitável, sem achado).**
   - **O que o `checks.md` pede.** O construtor escreve o teste a partir do check, nunca lendo a
     implementação. Não pede que ele nasça vermelho. Com o código já certo, o teste só poderia nascer
     verde.
   - **O que prova que a asserção morde.** É a injeção de falha, e eu a refiz sem herdar a do autor.
     As três morrem, cada uma na prova do claim que a nomeia.
   - **O MA vale como teste vermelho de verdade.** Ele é o código da rodada 2, uma versão real do
     `markExited`. A 4ª prova, portanto, fica vermelha contra uma implementação que existiu, o que é o
     equivalente de ter nascido vermelha.
5. **O merge com a `origin/main` (sem achado).**
   - **As provas da `035` que o merge tocou.** A `o agente sair cancela o pedido pendente` (C29 da
     `035`) e a `cancelar o turno cancela o pedido pendente` (C28 da `035`) passam. A C29 da `035`
     afirma `permission_resolved` antes do evento do `watchExits` (`AcpManager.fake-adapter.test.ts:231`).
     Isso continua verdade com o `cancelPending` antes do `closeTurnOnExit` (`AcpManager.ts:2567-2572`),
     e o `turn_failed` agora vem entre os dois.
   - **Os outros arquivos que o merge resolveu à mão.** `Transcript.test.tsx`, `Message.test.tsx`,
     `PlanModeBanner.test.tsx` e `architecture.test.ts` dão 48 passed. As provas C11 a C17 da `036`
     estão nesses arquivos. `scripts/package-boundaries.test.ts` dá 6 passed.
   - **O que a regra desta feature mudou na `036`.** Com `!readOnly` dentro do `streaming`, uma
     conversa somente leitura sem fecho não abre o pensamento sozinha. Isso concorda com o critério 16
     da `036` (*"every thought block SHALL render collapsed"* no replay), e nenhuma prova dela depende
     do contrário. O caso não tem prova, e isso é o *Propaga* do gap 1.
6. **Lição para o `testing.md` (a gravar por quem segura a feature; este verificador só escreve este
   arquivo).** Duas guardas que apagam a mesma coisa não se provam com um cenário em que as duas
   decidem. O C7 ficou verde desde a S3, com uma guarda que nenhum teste distinguia da outra, porque o
   cenário dele era exatamente o que a guarda nova também apagava. A regra que teria pegado isso:
   **quando uma guarda nova se sobrepõe a uma antiga, cada uma ganha um cenário em que só ela decide,
   e é nesse cenário que se injeta a falha**.

## Gate

Verified at 6fe1136:

- `LUMEM_GATE_BASE=origin/main pnpm gate:quick`: `docs ok`, depois *"a dependency, config or asset changed since origin/main, running the full suite"*, e **296 files, 4938 passed, 6 skipped, 0 failed**. A base é a `origin/main` do merge (`0f06d85`).
- `pnpm exec turbo typecheck --force`: 4 successful, 0 cached. `pnpm -s lint` saiu com 0. `pnpm gate:build` deu 4/4 em cache, e quem sustenta o typecheck é o `--force` acima.
- `pnpm -s feature:check plan` saiu com 0. `pnpm -s feature:check checks` saiu com 0, com um aviso só, o de não haver `## Test policy`.
- O `gate:full` (Playwright) não foi executado. Nenhum check desta feature declara prova e2e. O e2e da `035` que o merge trouxe (`e2e/plan-mode.spec.ts`) não é prova desta feature, e o veredito não depende dele.
