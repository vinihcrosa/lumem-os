# Sinal de vida da conversa — verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: e3894e4..54cab53 (`origin/main..HEAD`); a correção é `de6e6e3..54cab53` (`7730087`, `82f3f74`, `f3bdeb0`, `54cab53`)
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

As rodadas 1 (FAIL em `36fee0e`, relatório em `b38117c`) e 2 (FAIL em `de6e6e3`, relatório em
`7730087`) estão no histórico do git. Esta rodada cobre duas coisas: o diff da correção e todo
veredito da rodada 2 que não foi PASS. Isso dá a lacuna 1 (o segundo `prompt` pendurava o primeiro) e
a lacuna 2 (precisão do C28, a memória). As provas dos **31** checks rodaram **inteiras** no `HEAD`
novo. Cada seção diz se foi `verified at 54cab53` ou `carried from de6e6e3`.

**O que a correção fechou.** O defeito da rodada 2 está fechado no comportamento. O `prompt` agora
guarda um `TurnInFlight` por turno (`packages/server/src/acp/AcpManager.ts:1328-1333`). As quatro
guardas leem o `failure` do próprio turno (`:1351`, `:1384`, `:1428`, `:1450`), e esse campo tem um
escritor só, o `closeTurnOnExit` (`:2615`). O primeiro `prompt` termina, e o C31 prova isso. Pondo
de volta a guarda de dois escritores, as duas provas do C31 morrem (ME).

**Por que continua FAIL.** A correção criou três comportamentos que nenhuma asserção alcança, e cada
um tem um mutante que sobrevive:

- **MA** — o ramo novo do `markExited` (`:2553`, *"também com `promptInFlight` desligado"*);
- **MB** — o *"fecha uma vez"* da door 4;
- **MC** — *"grava a pergunta de cada um"*, do `Handoff`.

O código no `HEAD` faz o certo nos três, e sondei isso numa cópia descartável (ver *Gaps*). O que
falta é prova. O MA é o mais grave: com ele, o primeiro de dois `prompt` atravessa a saída do
processo como se o agente tivesse respondido. Com um adaptador de stdout aberto, esse `prompt` volta
a ficar pendurado.

Todas as provas rodaram com o Node do `.nvmrc` (`v22.17.1`), numa invocação por pacote:

- `S` = `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts src/acp/websocket.test.ts --reporter=verbose -t "<os 15 nomes das provas do server>"` — `Tests 18 passed | 138 skipped`. Cada um dos 18 casos aparece individualmente com `✓` (C2 e C4 expandem a tabela). Os dois do C31 aparecem assim: `✓ … lets a second prompt run without stranding the first 1ms` e `✓ … releases both prompts when the adapter exits with two in flight 6ms`;
- `W` = `pnpm exec vitest run <os 8 arquivos> --reporter=verbose -t "<os 24 nomes das provas do web, mais o do F4>"`, rodado em `packages/web` — `Tests 26 passed | 178 skipped`, cada um com `✓`.

## Binding sources

Verified at 54cab53 para o que a correção tocou; o resto é carried from de6e6e3.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| LUM-67, Parte 1 — o turno fecha quando o adaptador morre | yes - `.context/attachments/linear-36a73b0b-64ca-4333-b406-9893249f789a/[LINEAR]-LUM-67.md`, relido em 54cab53 (linhas 26-41) | none | - |
| LUM-67, Parte 2 — a queda da conexão aparece | yes - carried from de6e6e3 | none | - |
| LUM-67, Parte 3 — a linha de estado do turno | yes - carried from 36fee0e | none | - |
| LUM-67, Parte 4 — o aviso de silêncio | yes - carried from 36fee0e | none | - |

O passo 1 só roda onde a correção tocou a interface. A correção não mexeu em tela: tocou o contrato do
daemon com dois `prompt` em voo. Comparei esse contrato com a Parte 1, linha 39 da issue: *"o daemon
**emite um fecho** … antes de limpar os listeners — gravado no transcript"*. A issue não fala de
turnos concorrentes, e o fecho único que a correção grava para os dois (`[message:primeira,
message:segunda, turn_failed]`) é um fecho, gravado, antes de limpar os listeners. **Nenhuma
contradição.**

O ponto 2 do pedido, *"um fecho por evento de saída"* contra *"um por turno"*, foi julgado contra três
fontes:

- **O critério 29** decide só que *"os dois SHALL rejeitar com `AcpTurnFailedError`"* e não conta
  fechos.
- **A door 2** diz *"um fecho **só** por turno"*. Isso é um teto contra duplicata, e não a promessa de
  um fecho para cada turno: a alternativa que ela recusa é *"dedup no redutor — dois fechos
  continuariam gravados"*.
- **A door 4** decide por extenso: *"`markExited` fecha uma vez e liberta todos"*.
- **A Q5 = B** põe fora do escopo *"o que o estado de turno único mostra com dois turnos
  simultâneos"*. A transcrição com dois `prompt` já era intercalada em `origin/main`, e o C31 mesmo
  grava `segunda` antes de `primeira`.

A leitura do construtor é coerente com o plano, e não é achado. O achado é outro: a door 4 decide
*"fecha uma vez"* e nenhuma prova afirma isso (*Gaps*, 2).

## Checks

Proofs verified at 54cab53, as 31. Refiz as citações do arquivo que a correção tocou
(`AcpManager.test.ts`). A correção só acrescentou linhas depois da `:2965`, então as citações até ali
não se mexeram, e as do C5 e do C6 desceram 70 linhas. As citações dos outros arquivos são carried from
de6e6e3, porque eles não mudaram em `de6e6e3..54cab53`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | a saída com turno em voo emite um `turn_failed` com `(saída 137)`, gravado e recebido pelo listener | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:2705` - `expect(turnFailedIn(manager.transcript(id))).toEqual([closing])`; `:2707` - o mesmo sobre `events` | PASS |
| C2 | `(saída 137)` · `(sinal SIGKILL)` · `(saída desconhecida)` | `S` exit 0, 3 casos | `packages/server/src/acp/AcpManager.test.ts:2711-2713` (tabela) e `:2720` - `expect(turnFailedIn(manager.transcript(id))).toEqual([{ type: "turn_failed", message: … }])` | PASS |
| C3 | stdout aberto: `prompt` rejeita com `AcpTurnFailedError` em < 1 s; `liveTurns()` vazio | `S` exit 0 (6 ms) | `packages/server/src/acp/AcpManager.test.ts:2737` - `settled).not.toBe("pendurado")`; `:2738` - `toBeInstanceOf(AcpTurnFailedError)`; `:2739` - `expect(manager.liveTurns()).toEqual([])` | PASS |
| C4 | nas duas ordens, exatamente um `turn_failed` | `S` exit 0, 2 casos | `packages/server/src/acp/AcpManager.test.ts:2765` - `expect(turnFailedIn(manager.transcript(id))).toHaveLength(1)` | PASS |
| C5 | a saída entre turnos não acrescenta `turn_failed` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3053` - `expect(types.at(-1)).toBe("turn_end")`; `:3054` - `expect(types).not.toContain("turn_failed")` | PASS |
| C6 | retrato `turn-failed` com `code: "exited"` e o `sessionId` | `S` exit 0 | `packages/server/src/acp/AcpManager.test.ts:3064-3066` - `toHaveBeenCalledTimes(1)` e `toHaveBeenCalledWith(expect.objectContaining({ tag: "turn-failed", code: "exited", sessionId: id }))` | PASS |
| C7 | somente leitura sem fecho: sem `.mcaret`, linha de estado ou `■ interromper` | `W` exit 0 | `packages/web/src/features/conversation/conversation.test.tsx:1312` - `querySelector(".mcaret")).toBeNull()`; `:1314-1315` (carried) | PASS |
| C28 | saída 137 durante a leitura do teto **ou da memória**: a pergunta, depois um `turn_failed` só; `AcpTurnFailedError`; sem `session/prompt`; o `/acp` sem frame `error` | `S` exit 0, as três provas | teto: `packages/server/src/acp/AcpManager.test.ts:2860-2862` - `expect(turnOf(manager.transcript(info.id))).toEqual([{ …, role: "user", text: "faz a coisa" }, { type: "turn_failed", message: "o agente encerrou no meio do turno (saída 137)" }])`, `:2864` - `toBeInstanceOf(AcpTurnFailedError)`, `:2866` - `expect(fake.promptBlocks).toEqual([])`; memória (prova nova do check): `:2897` - `events.some((event) => event.type === "memory_core")).toBe(false)`, `:2898-2901` - a pergunta e o `turn_failed`, `:2902` - `toBeInstanceOf(AcpTurnFailedError)`, `:2903` - `promptBlocks).toEqual([])`; `/acp`: `packages/server/src/acp/websocket.test.ts:585` - `expect(errors).toEqual([expect.objectContaining({ code: "INVALID_MESSAGE" })])` | PASS |
| C29 | resposta e saída no mesmo tique: um fecho só, o `turn_failed`, nenhum `turn_end`, `AcpTurnFailedError` | `S` exit 0 (396 ms, 25 voltas) | `packages/server/src/acp/AcpManager.test.ts:2957-2960` - `expect({ hops, closes }).toEqual({ hops, closes: [{ type: "turn_failed", … }] })`; `:2961` - `toBeInstanceOf(AcpTurnFailedError)`; `:2964-2965` | PASS |
| C30 | cano fecha primeiro: `(saída 137)` no prazo, `(saída desconhecida)` sem ela, nunca `ACP connection closed` | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2783` - `toEqual([closing])`; `:2787` - `(error as Error).message).toBe(closing.message)`; `:2789-2790` - `not.toContain("ACP connection closed")`; `:2802`, `:2807-2808`, `:2814` | PASS |
| C31 | dois `prompt`, o primeiro segurado no teto: os dois resolvem com o seu `stopReason`, as duas mensagens, nenhum `turn_failed`; com a saída e os dois em voo, os dois rejeitam com `AcpTurnFailedError` em < 1 s | `S` exit 0, as duas provas | `packages/server/src/acp/AcpManager.test.ts:2996` - `expect(await unlessHung(second)).toEqual({ stopReason: "max_tokens" })`; `:2999` - `expect(await unlessHung(first)).toEqual({ stopReason: "end_turn" })`; `:3001-3004` - as mensagens `segunda` e `primeira`; `:3005` - `events.some((event) => event.type === "turn_failed")).toBe(false)`; `:3032` - `expect(both).not.toBe("pendurado")`; `:3034-3035` - `firstOutcome?.error` e `secondOutcome?.error` `toBeInstanceOf(AcpTurnFailedError)` | PASS (o claim, como escrito; a door 4 pede mais do que ele afirma — ver *Gaps*, 2) |
| C8 | `1006` mostra `conexão com o daemon caiu — reconectando` e reabre para a mesma sessão | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:330` - `failure).toMatchObject({ message: "conexão com o daemon caiu — reconectando", fatal: false })`; `:339-340` (carried) | PASS |
| C9 | 500 · 1 000 · 2 000 · 4 000 · 8 000 · 10 000 · 10 000 ms, e a oitava acontece | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:356`, `:361`, `:370` - `toHaveLength(9)` (carried) | PASS |
| C10 | o `attached` da reabertura deixa 3 turnos e tira o aviso | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:399` - `turns).toHaveLength(3)`; `:400` - `failure).toBeNull()` (carried) | PASS |
| C11 | `4404` mostra `esta sessão não existe mais no daemon` e não reabre em 30 s | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:411`, `:417` - `sockets).toHaveLength(1)` (carried) | PASS |
| C12 | desmontar, ou trocar de sessão, com reabertura agendada: nada para a antiga | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:432`, `:446` (carried) | PASS |
| C13 | `send` devolve `false` fechado e por schema; o composer mantém o rascunho e mostra o motivo | `W` exit 0, as duas provas | `packages/web/src/features/conversation/acp-socket.test.ts:310`, `:316` - `toBe(false)`; `packages/web/src/features/conversation/conversation.test.tsx:233-234` (carried) | PASS |
| C14 | no limite sai; um byte acima é recusado com a frase; o servidor fecha acima do limite compartilhado | `W` e `S` exit 0 | `packages/web/src/features/conversation/acp-socket.test.ts:332`, `:334`, `:340`, `:343`; `packages/server/src/acp/websocket.test.ts:475`, `:480` - `toBe(1009)` (carried) | PASS |
| C15 | frame ilegível: aviso não fatal, socket aberto | `W` exit 0 | `packages/web/src/features/conversation/useConversationSession.test.tsx:458`, `:463` - `closed).toBe(false)` (carried) | PASS |
| C16 | usuário em 1000 põe os dois em 1000; chunk em 4000 move só `lastEventAt` | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:904-905`, `:912-913` (carried) | PASS |
| C17 | replay e dobra concordam | `W` exit 0 | `packages/web/src/features/conversation/conversation-model.test.ts:942-943`, `:950` (carried) | PASS |
| C18 | 72 s: `trabalhando · 1 min 12 s` com indicador animado; sem `streaming`, nada | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:32` - `getByText("trabalhando · 1 min 12 s")`; `:36`, `:40`, `:50` (carried) | PASS |
| C19 | os oito casos do decorrido | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:36-43` e `:47` - `expect(formatElapsed(seconds * 1000)).toBe(text)` (carried) | PASS |
| C20 | os sete casos do fazer | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:55-86` e `:92` - `expect(activityText(turnActivity(state))).toBe(text)` (carried) | PASS |
| C21 | `useNow(true)` a cada 1 000 ms; `useNow(false)` sem intervalo | `W` exit 0 | `packages/web/src/features/conversation/useNow.test.ts:41`, `:49` - `getTimerCount()).toBe(0)` (carried) | PASS |
| C22 | `.mcaret` anima por `@keyframes`; nenhum caret na mensagem do usuário | `W` exit 0, as duas provas | `packages/web/src/features/conversation/conversation-css.test.ts:259-260`; `packages/web/src/features/conversation/conversation.test.tsx:642`, `:653-654` (carried) | PASS |
| C23 | `animation: none` sob movimento reduzido | `W` exit 0 | `packages/web/src/features/conversation/conversation-css.test.ts:266-268` (carried) | PASS |
| C24 | 89 s sem `warning`; 90 s com a frase e o `esc` | `W` exit 0, as duas provas | `packages/web/src/features/conversation/turn-status.test.ts:130`, `:134-135`; `packages/web/src/features/conversation/TurnStatus.test.tsx:87`, `:94`, `:96` (carried) | PASS |
| C25 | `pending` há 240 s sem evento, e a mesma passando a `running` há 100 s: `rodando <título> há 4 min 0 s`, sem `warning`, só estados do redutor | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:165-168`, `:171` - `toEqual({ tone: "normal", doing: "rodando Bash pnpm gate:quick há 4 min 0 s" })` (carried) | PASS |
| C26 | permissão pendente com 300 s sem evento: `esperando sua resposta`, normal | `W` exit 0 | `packages/web/src/features/conversation/turn-status.test.ts:198-199` (carried) | PASS |
| C27 | no âmbar, um evento move `lastEventAt` e o render sai do âmbar | `W` exit 0 | `packages/web/src/features/conversation/TurnStatus.test.tsx:107`, `:111` (carried) | PASS |

## Coverage

Verified at 54cab53 nas linhas cuja autoridade a correção tocou, refeitas do código e do `Landing`. As
outras são carried from de6e6e3 e não se repetem aqui: a forma da saída, a frase com o cano primeiro,
o prazo, o `/acp`, as esperas, a recusa, o limite, o decorrido, o fazer, o limiar, o movimento e o
motivo da recusa.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| o que liga o fecho no `markExited` (2) | `packages/server/src/acp/AcpManager.ts:2553` - `if (session.promptInFlight \|\| session.turnsInFlight.size > 0)` | `promptInFlight` ligado: C1, C3, C4, C6, C28 · `promptInFlight` já desligado pelo primeiro de dois `prompt`, com o segundo em voo: **nenhuma prova** — o MA volta a condição a `session.promptInFlight` e as 17 provas do S1 continuam verdes | `promptInFlight` desligado com turno em voo |
| dois `prompt` na mesma sessão (4) | critério 29, door 4 e os caminhos do `prompt` (`:1351`, `:1384`, `:1428`, `:1450`) × o `closeTurnOnExit` (`:2603-2618`) | nenhuma saída: C31 (`:2996-3005`) · saída com os dois depois da pergunta: C31 (`:3032-3035`) · saída com os dois ainda no teto ou na memória, a pergunta de cada um gravada: **nenhuma prova** (MC) · saída depois de um dos dois terminar: **nenhuma prova** (MA) | a pergunta de cada turno na saída · a saída depois de um dos dois terminar |
| door 4 — um gatilho por `prompt` em voo (2 cláusulas do `Landing`) | `prd.md`, `## Landing`, door 4: *"`markExited` fecha uma vez e liberta todos"* | liberta todos: C31 (`:3034-3035`), e o MF morre · fecha uma vez: **nenhuma prova** — o C31 não olha a transcrição da saída com dois em voo, e o MB grava um `turn_failed` por turno sem nada ficar vermelho | fecha uma vez |
| guardas que leem o fecho da saída no `prompt` (4) | `AcpManager.ts:1351` (teto), `:1384` (memória), `:1428` (`catch`), `:1450` (resposta junto) | teto: C28 e C31, e o ME morre nas duas provas do C31 · memória: C28, 3ª prova (`:2869`); o M4 da rodada 2 a matava, e a guarda só trocou o campo lido (carried from de6e6e3) · `catch`: C1, C2, C4, C6, C29, e o MD morre em 7 testes · resposta junto: C29; o M2 da rodada 2 a matava, e a remoção é a mesma mutação (carried from de6e6e3) | - |
| campos que as guardas leem, e quem os escreve | `grep` no `AcpManager.ts` | `turn.failure`: um escritor, `:2615` · `session.connection.signal.aborted`: um escritor, o cano, e é um fato da sessão que os dois turnos têm de ver igual · `session.promptInFlight` (lido em `:2553`): cinco escritores (`:1321`, `:1368`, `:1439`, `:1464`, `:2609`), compensados pelo `turnsInFlight.size`, e essa compensação é a linha 1 desta tabela | a mesma da linha 1 |
| turno em voo na saída (5) | como na rodada 2, com a memória agora no C28 | depois do `session/prompt`: C1 · teto: C28 · memória: C28 (`:2869`) · junto com a resposta: C29 · não: C5 | - |

## Test policy rows

Carried from de6e6e3: o `checks.md` não tem `## Test policy`, e quem decide o nível é a matriz do
`docs/project/testing.md`. Os dois testes novos do C31 (verified at 54cab53) são integração do
transporte ACP com o agente falso, que é o nível que a matriz pede. Nenhum mexe em `process.env`, o git
não é mockado, e nenhum `.skip`, `.todo` ou `.only` entrou em `de6e6e3..54cab53`.

## Faults injected

Verified at 54cab53.

**Onde.** As mutações rodaram numa cópia descartável de `HEAD`: `git archive HEAD` em
`/private/tmp/lum035-v3`, com os `node_modules` ligados por symlink. A árvore real não foi tocada: o
`git status --porcelain` estava vazio antes e continuou vazio depois de a cópia ser apagada. Cada
mutante rodou contra as 17 provas do S1 (`-t "o adaptador que sai|sends no error frame"`).

**Por que seis, um acima do teto.** Os pontos 3 e 4 do pedido nomeiam cada um uma superfície própria
(MD, MA). A correção criou mais três superfícies: MB, MC e MF, e o ME cobre a guarda de dois
escritores.

| Mutation | Location | Killed |
| --- | --- | --- |
| MA — o `markExited` volta a fechar só com `session.promptInFlight` (o código da rodada 2) | `packages/server/src/acp/AcpManager.ts:2553` | no — 17 passed. Nenhuma prova tem um dos dois `prompt` terminando antes da saída |
| MB — o `closeTurnOnExit` grava um `turn_failed` a mais por turno em voo além do primeiro | `packages/server/src/acp/AcpManager.ts:2614` | no — 17 passed. A 2ª prova do C31 só afirma a classe da rejeição (`:3034-3035`), e as outras têm um turno só |
| MC — o laço da pergunta para depois do primeiro turno (`break`) | `packages/server/src/acp/AcpManager.ts:2603-2607` | no — 17 passed. Nenhuma prova tem dois turnos com a pergunta ainda não gravada na hora da saída |
| MD — tirar a guarda do `catch`, `if (turn.failure !== undefined) throw turn.failure` (ponto 3 do pedido) | `packages/server/src/acp/AcpManager.ts:1428` | yes — 7 falham: C1, as três do C2, C4 (*a saída antes de o stdout fechar*), C6 e C29. Sem a guarda, o erro da saída cai no `turnFailed` e grava um segundo `turn_failed` e um segundo retrato |
| ME — a guarda do teto volta a ler o campo de dois escritores, `if (session.turnId !== turn.id) throw turn.failure` | `packages/server/src/acp/AcpManager.ts:1351` | yes — as duas provas do C31 (`:2999`, `:3034`) |
| MF — a saída marca e liberta só o último turno em voo (o formato do defeito da rodada 2) | `packages/server/src/acp/AcpManager.ts:2614-2617` | yes — C31, 2ª prova (`:3032`, `pendurado`) |

## Gaps, ranqueados

1. **O ramo novo do `markExited` não tem prova, e o mutante dele é o defeito que a S1 conserta
   (reprova, CONFIRMADO).**
   - **O ramo.** A correção mudou `packages/server/src/acp/AcpManager.ts:2553` para fechar também
     quando `promptInFlight` já foi desligado pelo primeiro de dois `prompt`. O `Handoff` do
     `checks.md` o nomeia (*"o `markExited` também fecha quando `promptInFlight` já foi desligado pelo
     primeiro de dois `prompt` e o segundo ainda voa"*). Nenhuma prova o põe em cena, e o MA sobrevive.
   - **A sonda.** Fiz um teste descartável na cópia: A segurado no teto, B termina, o processo sai
     com 137, e só então A é solto.
     - No `HEAD`, A rejeita com `AcpTurnFailedError: o agente encerrou no meio do turno (saída 137)`,
       e a transcrição fica `["message:segunda","turn_end","message:primeira","turn_failed"]`. Isso
       está certo.
     - Com o MA, A resolve `end_turn` com o processo morto, e a transcrição fica
       `["message:segunda","turn_end","message:primeira","turn_end"]`. O agente falso responde depois
       de sair. Com o adaptador real que sai com o stdout aberto (o caso do C3), o `session/prompt`
       nunca responde, e o `prompt` fica pendurado, que é o defeito da S1 e o critério 29 (*"nenhum
       fica pendente"*).
   - **A regra.** É a armadilha que a própria correção registrou no `testing.md`: *"antes de ler um
     campo como sinal, liste quem mais o escreve, e ponha um teste com esse outro escritor em cena"*.
     O `promptInFlight` tem cinco escritores, e o outro escritor, o primeiro `prompt` que termina, não
     está em cena em nenhum teste.
   - **A menor correção.** Uma 3ª prova no C31, com um claim que a nomeie: A segurado no teto, B
     termina, saída, A solto. A rejeita com `AcpTurnFailedError`, e a transcrição termina em
     `message:primeira`, `turn_failed`.
2. **A door 4 decide *"fecha uma vez"*, e nada prova isso (reprova, CONFIRMADO; é também lacuna de
   precisão do C31).**
   - **O problema.** O claim do C31 para a saída com dois em voo diz só *"os dois rejeitam com
     `AcpTurnFailedError`"*, e é isso que a prova afirma (`AcpManager.test.ts:3034-3035`). O MB grava um
     `turn_failed` por turno, e tudo continua verde.
   - **O que a leitura vale.** A leitura *"um fecho por evento de saída"* não contradiz nada (ver
     *Binding sources*). O que falta é que ela seja o que o teste cobra.
   - **A menor correção.** A 2ª prova do C31 também afirma
     `expect(turnFailedIn(manager.transcript(info.id))).toEqual([closing])` e um retrato só, e o claim
     diz *"exatamente um `turn_failed`"*.
3. **A pergunta de cada turno, gravada pela saída, não tem prova (reprova, CONFIRMADO).**
   - **O comportamento.** O `closeTurnOnExit` virou um laço sobre `turnsInFlight` (`:2603-2607`), e o
     `Handoff` diz *"gravando antes a pergunta de cada um"*. A 2ª prova do C31 espera as duas mensagens
     já gravadas antes da saída (`waitFor(() => userMessages() === 2)`), então o laço só roda com
     `question === undefined`. O MC sobrevive.
   - **A sonda.** Na cópia, com os dois segurados no teto e a saída, o `HEAD` grava
     `["message:primeira","message:segunda","turn_failed"]`, e os dois rejeitam com
     `AcpTurnFailedError`. É o critério 27 aplicado a cada um dos dois do critério 29, e está certo.
   - **A menor correção.** Uma prova com os dois segurados no teto e a saída, afirmando essa
     transcrição exata. Ela também mata o MB, e fecha as lacunas 2 e 3 com um teste só.
4. **O ponto 3 do pedido, a guarda do `catch` (sem achado).** Ela não é membro de conjunto sem prova. A
   superfície dela é a saída durante o pedido, que o C1, o C4 e o C6 já afirmam contando fechos e
   retratos. O MD a remove, e 7 testes morrem, porque o erro da saída cairia no `turnFailed` e gravaria
   um segundo `turn_failed`. O que reprovou a rodada 1 foi um ramo sem nenhuma asserção que o
   alcançasse, e aqui três asserções independentes o alcançam.
5. **O ponto 4 do pedido, o C5 intacto (sem achado).**
   - **A prova.** O C5 está verde no `HEAD` (`:3053-3054`).
   - **Por que o ramo novo não fecha entre turnos.** A condição nova só é verdadeira com um turno de
     fato em voo:
     - todo `prompt` que termina tira o seu turno no `finally` (`:1446`), antes do `turn_end`, e sem
       `await` no meio;
     - o bloqueio pelo teto tira o turno em `:1370`;
     - a saída limpa todos em `:2618`;
     - o `checkBudget` e o `coreFor` engolem as próprias falhas (`:1581-1588`, `:1598-1608`), então
       nenhum caminho deixa um turno velho no conjunto.
   - **O único escritor que liga.** O `promptInFlight = true` só é escrito em `:1321`, no mesmo bloco
     síncrono que registra o turno.
6. **O ponto 5 do pedido, a door 4 no `Landing` (nit, não reprova).** Ela tem forma, *"um registro por
   turno — a pergunta, o gatilho … e o `failure` …; `markExited` fecha uma vez e liberta todos"*, e
   alternativa recusada, *"recusar o segundo `prompt` com um `DomainError` (Q5 A)"*. O
   `feature:check plan` sai com 0. Dois defeitos de documento:
   - Uma linha em branco separa a door 4 da tabela (`prd.md`, entre a door 3 e a door 4). Na
     renderização, ela vira um parágrafo com barras, fora da tabela. O validador só a conta porque lê
     linha a linha.
   - A door 2 continua dizendo *"`markExited` fecha e zera o `turnId`"*, e o código não zera mais.
     A nota de substituição ficou na door 4, não no requisito contradito, e a regra 6 do `CLAUDE.md`
     pede que *"a nota no requisito contradito fica"*.
7. **O `messageId` da pergunta ainda lê o campo de dois escritores (follow-up, pré-existente).**
   - **Onde.** O `prompt` grava a pergunta com `messageId: session.turnId` (`:1405`). Com dois `prompt`,
     o segundo sobrescreve o `turnId`, e as duas perguntas saem com o mesmo `messageId`.
   - **É anterior à feature.** `origin/main`, `AcpManager.ts:1340`, já fazia isso. A Q5 = B põe o estado
     de turno único fora do escopo, e por isso não reprova.
   - **O que a correção acrescentou.** O caminho da saída agora usa `turn.id` (`:2606`) e o caminho
     normal não, e a prova do C31 esconde isso com `messageId: expect.any(String)` (`:3002-3003`). Trocar
     `:1405` por `turn.id` alinharia os dois caminhos de graça.
8. **Os achados da rodada 2, um a um.**
   - **Lacuna 1** (o segundo `prompt`): fechada no comportamento. O C31 está verde, e o ME e o MF
     morrem. A prova ficou parcial, e as lacunas 1 a 3 acima são o que sobrou dela.
   - **Lacuna 2** (precisão do C28): fechada. O claim diz *"o teto ou a da memória"*, e o teste da
     memória é a 3ª prova.
   - **Lacuna 3** (C29): era sem achado, e segue sem achado (carried from de6e6e3).
   - **Lacuna 5** (a pendência do `setup`): fechada por decisão, Q6 = A, sem código.
9. **Lição para o `testing.md` (a gravar por quem segura a feature; este verificador só escreve este
   arquivo).** Um conserto que troca uma guarda também troca os escritores de outro campo. A correção
   aplicou a regra nova às guardas do `prompt` e esqueceu o `markExited`, que lê o `promptInFlight`, um
   campo com cinco escritores. A regra que teria pegado isso: **quando uma prova põe dois escritores em
   cena, ela os põe em cena em cada leitor do campo, não só no leitor que o conserto mirou**. E um
   comportamento que o conserto descreve no `Handoff` ou no `Landing` (*"fecha uma vez"*, *"a pergunta
   de cada um"*) ganha asserção, não só linha.

## Gate

Verified at 54cab53:

- `LUMEM_GATE_BASE=origin/main pnpm gate:quick` - `docs ok`; *"a dependency, config or asset changed since origin/main, running the full suite"*; **293 files, 4880 passed, 6 skipped, 0 failed**. Na rodada 2 eram 4878, e os dois a mais são as provas do C31.
- `pnpm exec turbo typecheck --force` - 4 successful, 0 cached. `pnpm -s lint` saiu com 0. `pnpm gate:build` deu 4/4 em cache, e quem sustenta o typecheck é o `--force` acima.
- O `gate:full` (Playwright) não foi executado. Nenhum check declara prova e2e, a correção mexe só no `AcpManager.ts`, e o veredito não depende dele.
