# Sinal de vida da conversa — verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: 0f06d85..a537f58 (`origin/main..HEAD`); a correção desta rodada é `910165d..a537f58` (`c2d2e6b`, `4667677`, `5ae5c11`, `a537f58`)
**Round**: 5 - scoped
**Verifier**: independent sub-agent (author != verifier)

As rodadas 1 (FAIL, relatório em `b38117c`), 2 (FAIL, `7730087`), 3 (FAIL, `6f5b3c0`) e 4 (FAIL,
`910165d`) estão no histórico do git. O dono autorizou esta quinta rodada além do limite de três.

O escopo desta rodada é o diff da correção e o único veredito da rodada 4 que não foi PASS: o achado
F1 no C7, com o mutante MH sobrevivente (tirar o `!readOnly &&` da expressão `streaming` em
`Transcript.tsx:119`). A correção só mexe em teste e documentação, e nenhum código de produção mudou
(`git diff 910165d..HEAD --stat`: `checks.md`, `testing.md`, `Transcript.test.tsx`,
`conversation.test.tsx`). As provas dos **31** checks rodaram **inteiras** no `HEAD` novo (`a537f58`).
Cada seção diz se foi `verified at a537f58` ou `carried from 6fe1136`.

**O que a correção fechou.**

- **O MH agora morre na prova nomeada do C7.** A 2ª prova (`conversa encerrada com resposta do agente
  sem fecho não desenha caret`) cai com `expected <span class="mcaret" …(1)></span> to be null`.
- **A 1ª prova do C7 continua verde sob o MH.** Ela termina na pergunta, e ali a guarda de papel já
  decide. É o que a rodada 4 previu, e é por isso que a 2ª prova existe.
- **Cada guarda tem agora um cenário em que só ela decide:**
  - o `!readOnly` (MH) cai só na 2ª prova do C7, com o último bloco do agente, e no teste do
    pensamento;
  - o `turn.role === "agent"` (MI) cai só na 2ª prova do C22, ao vivo com o último bloco do usuário.
    As duas provas do C7 continuam verdes sob o MI, porque ali o `!readOnly` decide sozinho.
- **O teste a mais do pensamento afirma o que diz.** Ele cai sob o MH e também sob o MJ, uma mutação
  só do `thoughtOpen` que volta à expressão sem `readOnly`. Sob o MJ, nenhuma das provas de caret cai.
  A superfície dele é própria, portanto.

Todas as provas rodaram com o Node do `.nvmrc` (`v22.17.1`), numa invocação por pacote:

- `S` = `pnpm exec vitest run src/acp/AcpManager.test.ts src/acp/websocket.test.ts --reporter=verbose -t "<os 17 nomes das provas do server, mais o teste do F5>"`, rodado em `packages/server`. Resultado: `Tests 21 passed | 142 skipped`. Cada um dos 21 casos aparece individualmente com `✓`, porque o C2 e o C4 expandem a tabela;
- `W` = `pnpm exec vitest run <os 8 arquivos das provas> src/features/conversation/Transcript.test.tsx --reporter=verbose -t "<os 25 nomes das provas do web, mais o teste do pensamento>"`, rodado em `packages/web`. Resultado: `Tests 27 passed | 187 skipped`, cada um com `✓`. Aparecem as duas provas do C7: `✓ … a conversation that has ended > conversa encerrada sem fecho não desenha turno vivo 8ms` e `✓ … a conversation that has ended > conversa encerrada com resposta do agente sem fecho não desenha caret 5ms`. O teste do pensamento aparece como `✓ … o pensamento na conversa > does not open a thought by itself in a record that never closed 41ms`. O 27º caso é `diz o que o agente está fazendo ao lado do tempo`, que o padrão do C20 também casa.

## Binding sources

Verified at a537f58 para a Parte 1. A correção não tocou a interface, mas tocou o claim do C7, e é
nele que estava a lacuna da rodada 4. As Partes 2 a 4 são carried from 6fe1136, porque a correção não
mexeu na superfície delas.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| LUM-67, Parte 1 — o turno fecha quando o adaptador morre | yes - `.context/attachments/linear-36a73b0b-64ca-4333-b406-9893249f789a/[LINEAR]-LUM-67.md`, relido em a537f58 (linhas 26-41) | none | - |
| LUM-67, Parte 2 — a queda da conexão aparece | yes - carried from 6fe1136 | none | - |
| LUM-67, Parte 3 — a linha de estado do turno | yes - carried from 6fe1136 | none | - |
| LUM-67, Parte 4 — o aviso de silêncio | yes - carried from 6fe1136 | none | - |

A regra da linha 40 da issue, *"o caret só aparece com `streaming && !readOnly`"*, tem agora um check
que a decide. O C7 ampliado diz *"uma que termina numa `message` do agente sem fecho também não desenha
`.mcaret`"*, e isso é o caso geral do critério 6 do `prd.md` (`prd.md:147`). O caso do *"inclusive"*,
a transcrição que termina em mensagem do usuário, continua na 1ª prova. O claim não contradiz a issue
nem o critério, e só acrescenta o cenário que faltava.

## Checks

Proofs verified at a537f58, as 31. A correção só tocou dois arquivos de teste:

- **`conversation.test.tsx`.** A prova nova entrou depois da `:1315`, então nenhuma citação anterior
  se moveu. As do C13 (`:233-234`), do C22 (`:642`, `:653-654`) e da 1ª prova do C7 (`:1312-1315`)
  foram conferidas no `HEAD`.
- **`Transcript.test.tsx`.** O teste novo foi acrescentado no fim (`:119-135`). Nenhum check cita esse
  arquivo.

As outras citações são carried from 6fe1136.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | a saída com turno em voo emite um `turn_failed` com `(saída 137)`, gravado e recebido pelo listener | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2705` - `expect(turnFailedIn(manager.transcript(id))).toEqual([closing])`; `:2707` - o mesmo sobre `events` (carried from 6fe1136) | PASS |
| C2 | `(saída 137)` · `(sinal SIGKILL)` · `(saída desconhecida)` | `S` exit 0, 3 casos | `packages/server/src/acp/AcpManager.test.ts:2710-2714` (tabela) e `:2720` - `expect(turnFailedIn(manager.transcript(id))).toEqual([{ type: "turn_failed", message: … }])` (carried from 6fe1136) | PASS |
| C3 | stdout aberto: `prompt` rejeita com `AcpTurnFailedError` em < 1 s; `liveTurns()` vazio | `S` exit 0 (7 ms) | `packages/server/src/acp/AcpManager.test.ts:2737` - `settled).not.toBe("pendurado")`; `:2738` - `toBeInstanceOf(AcpTurnFailedError)`; `:2739` - `expect(manager.liveTurns()).toEqual([])` (carried from 6fe1136) | PASS |
| C4 | nas duas ordens, exatamente um `turn_failed` | `S` exit 0, 2 casos | `packages/server/src/acp/AcpManager.test.ts:2765` - `expect(turnFailedIn(manager.transcript(id))).toHaveLength(1)` (carried from 6fe1136) | PASS |
| C5 | a saída entre turnos não acrescenta `turn_failed` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3184` - `expect(types.at(-1)).toBe("turn_end")`; `:3185` - `expect(types).not.toContain("turn_failed")` (carried from 6fe1136) | PASS |
| C6 | retrato `turn-failed` com `code: "exited"` e o `sessionId` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3195-3196` - `toHaveBeenCalledTimes(1)` e `toHaveBeenCalledWith(expect.objectContaining({ tag: "turn-failed", code: "exited", sessionId: id }))` (carried from 6fe1136) | PASS |
| C7 | somente leitura sem fecho, terminando na mensagem do usuário: sem `.mcaret`, linha de estado ou `■ interromper`; terminando numa `message` do agente: sem `.mcaret` | `W` exit 0, as duas provas | 1ª prova: `packages/web/src/features/conversation/conversation.test.tsx:1312` - `expect(document.querySelector(".mcaret")).toBeNull()`, `:1314` - `expect(screen.queryByText(/trabalhando/)).not.toBeInTheDocument()`, `:1315` - `interromper` ausente; 2ª prova: `:1323-1324` - a transcrição termina em `{ type: "message", …, role: "agent", text: "a resposta pela metade" }`, `:1327` - `expect(await screen.findByText("a resposta pela metade")).toBeInTheDocument()`, `:1328` - `expect(document.querySelector(".mcaret")).toBeNull()` (verified at a537f58) | PASS |
| C28 | saída 137 durante a leitura do teto **ou da memória**: a pergunta, depois um `turn_failed` só; `AcpTurnFailedError`; sem `session/prompt`; o `/acp` sem frame `error` | `S` exit 0, as três provas | teto: `packages/server/src/acp/AcpManager.test.ts:2860` - `expect(turnOf(manager.transcript(info.id))).toEqual([…"faz a coisa"…, { type: "turn_failed", … }])`, `:2864` - `toBeInstanceOf(AcpTurnFailedError)`, `:2866` - `expect(fake.promptBlocks).toEqual([])`; memória: `:2897` - `memory_core`).toBe(false)`, `:2898`, `:2902`, `:2903`; `/acp`: `packages/server/src/acp/websocket.test.ts:585` - `expect(errors).toEqual([expect.objectContaining({ code: "INVALID_MESSAGE" })])` (carried from 6fe1136) | PASS |
| C29 | resposta e saída no mesmo tique: um fecho só, o `turn_failed`, nenhum `turn_end`, `AcpTurnFailedError` | `S` exit 0 (394 ms) | `packages/server/src/acp/AcpManager.test.ts:2957` - `expect({ hops, closes }).toEqual({ hops, closes: [{ type: "turn_failed", … }] })`; `:2961` - `toBeInstanceOf(AcpTurnFailedError)`; `:2964-2965` (carried from 6fe1136) | PASS |
| C30 | cano fecha primeiro: `(saída 137)` no prazo, `(saída desconhecida)` sem ela, nunca `ACP connection closed` | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2783` - `toEqual([closing])`; `:2787` - `(error as Error).message).toBe(closing.message)`; `:2789-2790` - `not.toContain("ACP connection closed")`; `:2802`, `:2807-2808`, `:2814` (carried from 6fe1136) | PASS |
| C31 | dois `prompt`: os dois resolvem sem saída; com a saída e os dois em voo, os dois rejeitam em < 1 s; com os dois segurados, `[primeira, segunda, turn_failed]` e um retrato só; com o segundo terminado antes, o primeiro rejeita e a transcrição termina em `turn_failed` | `S` exit 0, as quatro provas | `packages/server/src/acp/AcpManager.test.ts:2996`, `:2999`, `:3005`; `:3032`, `:3034-3035`; `:3077-3081` - `expect(manager.transcript(info.id).map((entry) => entry.event)).toEqual([{ …text: "primeira" }, { …text: "segunda" }, { type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" }])`, `:3082` - `expect(turnFailures).toHaveBeenCalledTimes(1)`; `:3127` - `expect(outcome).not.toEqual({ stopReason: "end_turn" })`, `:3128`, `:3130` (carried from 6fe1136) | PASS |
| C8 | `1006` mostra `conexão com o daemon caiu — reconectando` e reabre para a mesma sessão | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:330` - `failure).toMatchObject({ message: "conexão com o daemon caiu — reconectando", fatal: false })`; `:339-340` (carried from 6fe1136) | PASS |
| C9 | 500 · 1 000 · 2 000 · 4 000 · 8 000 · 10 000 · 10 000 ms, e a oitava acontece | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:356`, `:361`, `:370` - `toHaveLength(9)` (carried from 6fe1136) | PASS |
| C10 | o `attached` da reabertura deixa 3 turnos e tira o aviso | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:399` - `turns).toHaveLength(3)`; `:400` - `failure).toBeNull()` (carried from 6fe1136) | PASS |
| C11 | `4404` mostra `esta sessão não existe mais no daemon` e não reabre em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:411`, `:417` - `sockets).toHaveLength(1)` (carried from 6fe1136) | PASS |
| C12 | desmontar, ou trocar de sessão, com reabertura agendada: nada para a antiga | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:432`, `:446` (carried from 6fe1136) | PASS |
| C13 | `send` devolve `false` fechado e por schema; o composer mantém o rascunho e mostra o motivo | `W` exit 0, as duas provas | `packages/web/src/features/conversation/acp-socket.test.ts:310`, `:316` - `toBe(false)`; `packages/web/src/features/conversation/conversation.test.tsx:233-234` (conferido em a537f58) | PASS |
| C14 | no limite sai; um byte acima é recusado com a frase; o servidor fecha acima do limite compartilhado | `W` e `S` exit 0 | `packages/web/src/features/conversation/acp-socket.test.ts:332`, `:334`, `:340`, `:343`; `packages/server/src/acp/websocket.test.ts:475`, `:480` - `toBe(1009)` (carried from 6fe1136) | PASS |
| C15 | frame ilegível: aviso não fatal, socket aberto | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:458`, `:463` - `closed).toBe(false)` (carried from 6fe1136) | PASS |
| C16 | usuário em 1000 põe os dois em 1000; chunk em 4000 move só `lastEventAt` | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:938-939` - `turnStartedAt).toBe(1000)`, `lastEventAt).toBe(1000)`; `:946-947` (carried from 6fe1136) | PASS |
| C17 | replay e dobra concordam | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:976-977` - `folded.turnStartedAt).toBe(replayed.turnStartedAt)`, `folded.lastEventAt).toBe(replayed.lastEventAt)`; `:984` (carried from 6fe1136) | PASS |
| C18 | 72 s: `trabalhando · 1 min 12 s` com indicador animado; sem `streaming`, nada | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:32` - `getByText("trabalhando · 1 min 12 s")`; `:36`, `:40`, `:50` (carried from 6fe1136) | PASS |
| C19 | os oito casos do decorrido | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:36-43` e `:47` - `expect(formatElapsed(seconds * 1000)).toBe(text)` (carried from 6fe1136) | PASS |
| C20 | os sete casos do fazer | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:55-86` e `:92` - `expect(activityText(turnActivity(state))).toBe(text)` (carried from 6fe1136) | PASS |
| C21 | `useNow(true)` a cada 1 000 ms; `useNow(false)` sem intervalo | `W` exit 0 | `packages/web/src/features/conversation/useNow.test.ts:41`, `:49` - `getTimerCount()).toBe(0)` (carried from 6fe1136) | PASS |
| C22 | `.mcaret` anima por `@keyframes`; nenhum caret na mensagem do usuário | `W` exit 0, as duas provas | `packages/web/src/features/conversation/conversation-css.test.ts:277-278` - `expect(name).toBeDefined()`, `expect(body).toMatch(new RegExp(`@keyframes\\s+${name …}\\s*\\{`))`; `packages/web/src/features/conversation/conversation.test.tsx:642` - `expect(document.querySelector(".mcaret")).toBeNull()`, `:653-654` - um caret só, dentro de `.turn--agent` (conferido em a537f58) | PASS |
| C23 | `animation: none` sob movimento reduzido | `W` exit 0 | `packages/web/src/features/conversation/conversation-css.test.ts:284-286` - para `.mcaret` e `.turn-status__pulse`, `expect(declarations, selector).toMatch(/animation:\s*none/)` (carried from 6fe1136) | PASS |
| C24 | 89 s sem `warning`; 90 s com a frase e o `esc` | `W` exit 0, as duas provas | `packages/web/src/features/conversation/turn-status.test.ts:130`, `:134-135`; `packages/web/src/features/conversation/TurnStatus.test.tsx:87`, `:94`, `:96` (carried from 6fe1136) | PASS |
| C25 | `pending` há 240 s sem evento, e a mesma passando a `running` há 100 s: `rodando <título> há 4 min 0 s`, sem `warning` | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:165-168`, `:171` - `toEqual({ tone: "normal", doing: "rodando Bash pnpm gate:quick há 4 min 0 s" })` (carried from 6fe1136) | PASS |
| C26 | permissão pendente com 300 s sem evento: `esperando sua resposta`, normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:198-199` (carried from 6fe1136) | PASS |
| C27 | no âmbar, um evento move `lastEventAt` e o render sai do âmbar | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:107`, `:111` (carried from 6fe1136) | PASS |

## Coverage

Verified at a537f58 nas duas linhas cuja autoridade a correção tocou: quando o caret aparece, e o que a
expressão `streaming` decide numa conversa somente leitura. As outras são carried from 6fe1136, todas
com `Unproven` vazio: o `markExited`, os dois `prompt`, a door 4, a ordem da saída, o `messageId`, a
forma da saída, a frase com o cano primeiro, o prazo, o `/acp`, as esperas, a recusa, o limite, o
decorrido, o fazer, o limiar e o movimento.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| quando o caret aparece (5) | issue linha 40, critérios 6 e 21, `packages/web/src/features/conversation/Transcript.tsx:117-122` | ao vivo, bloco do agente: C22 (`:653-654`) · ao vivo, mensagem do usuário: C22 (`:642`), só o `turn.role === "agent"` decide, e o MI morre · sem `streaming`: C18 · somente leitura, último bloco do usuário: C7, 1ª prova (`:1312`), as duas guardas decidem · somente leitura, último bloco do agente: C7, 2ª prova (`:1328`), só o `!readOnly` decide, e o MH morre | - |
| o que o `streaming` do bloco liga, numa conversa somente leitura sem fecho (2) | `Transcript.tsx:117-124`: o `streaming` vai para o `BlockView` (o caret) e para o `thoughtOpen` | o caret: C7, 2ª prova · o pensamento aberto sozinho (a `036`, sem check desta feature): `Transcript.test.tsx:133` - `expect(button).toHaveAttribute("aria-expanded", "false")`, `:134` - `.thought__text` ausente. Cai sob o MH e sob o MJ, e o par de contraste é `opens a thought while it streams` (`:40-41`), com a mesma dobra e `readOnly={false}` | - |

O teste do pensamento dobra a transcrição com `reduceConversation`, e não com `replayConversation`. As
duas funções são a mesma coisa: `replayConversation` é `entries.reduce(reduceConversation,
emptyConversation())` (`conversation-model.ts:243-244`). O *"relê com `streaming` ligado"* do
comentário, portanto, vale.

## Test policy rows

Carried from 6fe1136: o `checks.md` não tem `## Test policy`, e quem decide o nível é a matriz do
`docs/project/testing.md`. Os dois testes novos (verified at a537f58) são de componente com jsdom, o
nível das outras provas da tela da conversa. Em `910165d..a537f58`, nenhum `.skip`, `.todo` ou
`.only` entrou, e nenhum `expect` saiu. Nenhum dos dois mexe em `process.env`. A contagem da suíte foi
de 4938 para 4940.

## Faults injected

Verified at a537f58.

**Onde.** As mutações rodaram numa cópia descartável de `HEAD`: `git archive HEAD` em
`/private/tmp/lum037-v5`, com os `node_modules` ligados por symlink. A árvore real não foi tocada: o
`git status --porcelain` estava vazio antes e continuou vazio depois de a cópia ser apagada.

**O que rodou.** Cada mutante rodou contra cinco provas de `conversation.test.tsx` e
`Transcript.test.tsx`: as duas do C7, a 2ª do C22, o teste do pensamento e o par de contraste dele. A
linha de base na cópia deu `5 passed`.

**Por que três.** A correção criou duas superfícies de asserção, a 2ª prova do C7 e o teste do
pensamento. O pedido nomeia as duas guardas da expressão. O MH e o MI provam que cada guarda tem um
cenário em que só ela decide. O MJ prova que o teste do pensamento tem superfície própria, e não é
só uma segunda cópia da prova do caret.

| Mutation | Location | Killed |
| --- | --- | --- |
| MH — tirar o `!readOnly &&` da expressão `streaming` (o sobrevivente da rodada 4) | `packages/web/src/features/conversation/Transcript.tsx:119` | yes — C7, 2ª prova (`conversation.test.tsx:1328`, `expected <span class="mcaret" …(1)></span> to be null`) e o teste do pensamento (`Transcript.test.tsx:133`). A 1ª prova do C7 e a do C22 seguem verdes, como o desenho pede |
| MI — tirar o `turn.role === "agent" &&` da expressão `streaming` | `packages/web/src/features/conversation/Transcript.tsx:120` | yes — C22, 2ª prova (`conversation.test.tsx:642`). As duas provas do C7 seguem verdes, porque o `!readOnly` decide sozinho nelas |
| MJ — o `thoughtOpen` volta à expressão sem `readOnly` nem papel (`?? (conversation.streaming && turnIndex === last && blockIndex === last)`) | `packages/web/src/features/conversation/Transcript.tsx:124` | yes — só o teste do pensamento (`Transcript.test.tsx:133`). As provas de caret seguem verdes |

Os mutantes do server da rodada 4 (MA, MB, MB2, MC, MG) são carried from 6fe1136, todos `killed`. A
correção não tocou `AcpManager.ts` nem os testes dele.

## Gaps, ranqueados

Nenhum que reprove.

1. **O F1 da rodada 4 (o MH sobrevivente no C7): fechado.**
   - O claim do C7 agora nomeia o cenário: *"uma que termina numa `message` do agente sem fecho
     também não desenha `.mcaret"*.
   - A prova com esse nome existe (`conversation.test.tsx:1318-1329`), rodou no `HEAD` e mata o MH.
   - O cenário é o que a rodada 4 pediu, com a pergunta seguida de uma resposta do agente pela metade.
     O `findByText("a resposta pela metade")` garante que a transcrição carregou antes de a ausência do
     caret ser afirmada, então a asserção negativa não passa por tela vazia.
2. **O *Propaga* do F1, o pensamento da `036` numa conversa somente leitura: fechado, fora dos checks.**
   O teste `does not open a thought by itself in a record that never closed` põe o caso em cena. A
   comparação com `opens a thought while it streams` isola o `readOnly` como a única diferença. Ele
   não é prova de check desta feature, e o `checks.md` o registra como follow-up (`5ae5c11`). Não
   precisa ser: o critério da `036` que ele protege é da `036`. O `thought--live` não é afirmado, mas
   vem do mesmo `streaming` que o MH e o MJ mostram coberto. Não é lacuna desta feature.
3. **A lição da rodada 4 já está no `testing.md`.** O `c2d2e6b` gravou *"Uma guarda nova sobreposta a
   uma antiga esconde a antiga do teste"* (`docs/project/testing.md:1806-1819`). O passo 7 não tem nada
   a acrescentar, porque esta rodada é PASS.
   - Uma observação, sem achado: o link *"rodada 4"* dessa entrada aponta para este arquivo, que agora
     é o relatório da rodada 5.
   - O relatório da rodada 4 está no git, em `910165d`, e este relatório repete o MH na tabela de
     falhas.
   - Isso já vale para as entradas das rodadas anteriores, que têm o mesmo formato.

## Gate

Verified at a537f58:

- `LUMEM_GATE_BASE=origin/main pnpm gate:quick`: **296 files, 4940 passed, 6 skipped, 0 failed**. A base é a `origin/main` (`0f06d85`), que é também a merge-base do `HEAD`.
- `pnpm exec turbo typecheck --force`: 4 successful, 0 cached. `pnpm -s lint` saiu com 0. `pnpm gate:build` deu 4/4 em cache, e quem sustenta o typecheck é o `--force` acima.
- `pnpm -s feature:check plan` saiu com 0. `pnpm -s feature:check checks` saiu com 0, com um aviso só, o de não haver `## Test policy`. `pnpm -s docs:check` imprimiu `docs ok`.
- O `gate:full` (Playwright) não foi executado. Nenhum check desta feature declara prova e2e, e a correção só mexe em testes de componente e em documentação.
