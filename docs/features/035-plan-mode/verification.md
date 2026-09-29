# 035 plan-mode — relatório do verificador

**Verdict**: FAIL
**Profile**: standard
**Diff range**: e3894e4..bd47aa2
**Round**: 2 - full
**Verifier**: independent sub-agent (author != verifier)

Esta é a rodada 2, feita por inteiro, por outro verificador. As 30 provas rodaram de novo no
`HEAD` (`bd47aa2`), as citações foram relidas e a Coverage foi recalculada desde a autoridade de
cada conjunto. Os quatro achados da rodada 1 foram julgados contra o código, sem partir do relato do
construtor. **F1, F2 e F3 fecharam de verdade. F4 fechou só pela metade.**

Os 30 checks passam como escritos. O FAIL vem de duas lacunas que ficam fora das linhas de check:

1. **A suíte e2e inteira fica vermelha por causa da spec nova.** A worktree `plano-recarregar`
   (`e2e/plan-mode.spec.ts:37`) aparece na sidebar como o botão *"plano-recarregar 1 sessão"*. O
   `getByRole("button", { name: "recarregar" })` de outras duas specs casa por substring, e passa a
   achar dois elementos: `e2e/pull-request.spec.ts:90` e `e2e/right-panel.spec.ts:103`. Resultado:
   **5 testes falham** na suíte completa. Cada spec rodada sozinha passa. O defeito existe desde
   `8d6a7b7`. A rodada 1 rodou só as specs do agente falso e não o `gate:full`, por isso não o viu.
2. **O piso de contraste subiu, mas não protege o par novo.** O piso foi para `123`
   (`packages/web/src/styles/tokens.test.ts:67`), só que o array tem **126** pares (a base tinha 125).
   Apagar o par `mode/plan` sobre `bg/info-subtle` deixa tudo verde: o mutante sobreviveu. O commit
   `45c5b7d` diz *"so the new pair cannot vanish silently"*, e isso não é verdade.

## Os achados da rodada 1

| Achado | Estado em `bd47aa2` | Evidência |
| --- | --- | --- |
| F1 — nenhum produtor de `permission_resolved` `cancelled` | **fechado** | `cancelPending` fica em `packages/server/src/acp/AcpManager.ts:1546-1552`. Ele é chamado em `cancel()`, na linha `:1536`, depois do `session/cancel`, e em `markExited`, na linha `:2477`, antes do `listeners.clear()` (`:2478`) e dos `exitWatchers`. C28, C29 e C30 passam. As falhas 1, 2 e 3 morreram |
| F2 — C23 não afirmava o plano relido do disco | **fechado** | `e2e/plan-mode.spec.ts:136-139`. A falha 4 (o `decode` do `TranscriptStore` descarta o `content` do `tool_call`) morreu **só** no C23: o C22, que roda ao vivo, passou com o mesmo mutante. A linha nova sustenta a prova |
| F3 — `acceptEdits` fora do C3 | **fechado** | `packages/web/src/features/conversation/PlanModeBanner.test.tsx:64`. O `it.each` agora cobre os cinco valores, e a instância `("acceptEdits")` rodou |
| F4 — par de contraste novo e piso | **parcial** | A linha `Observable` da `prd.md:224` foi corrigida. O piso foi para 123, mas o array tem 126 pares (falha 5, mutante vivo) |
| nit — `within(card)` | fechado | `packages/web/src/features/conversation/PlanApproval.test.tsx:82`. C15 e C16 buscam as opções dentro do cartão, e o C16 afirma o foco (`:125`) |

**Regressões que a correção poderia ter trazido.** Procurei cada uma e não achei nenhuma. As
sondas rodaram numa worktree descartável e foram descartadas junto com ela.

- **Evento emitido depois do `listeners.clear`.** Não acontece: `cancelPending` roda em `:2477`,
  antes do `:2478`. Invertendo a ordem (falha 2), o C29 falha.
- **Evento duplicado com o caminho de saída.** Sonda: `cancel()`, depois `kill()`, depois esperar a
  saída. A transcrição gravou **um** só `permission_resolved`. O `cancelPending` limpa o mapa, e o
  `markExited` seguinte não acha mais nada.
- **Cancel com a sessão já encerrada.** Sonda: `cancel()` depois da saída não lança. O retorno
  antecipado está em `AcpManager.ts:1531`, e o mapa já está vazio.
- **Pedidos de outras sessões.** `pendingPermissions` é por sessão (`AcpManager.ts:419`). Sonda: duas
  sessões no mesmo manager, cada uma com um pedido pendente. Cancelar a primeira não emite nada na
  segunda, e o pedido da segunda continua respondível.
- **Ordem de `permission_resolved` e `turn_end` no web.** O `permission_resolved` sai de forma
  síncrona dentro de `cancel()`. O `turn_end` depende da volta do agente. Então no fio a ordem é
  resolvido e depois fim de turno. De qualquer forma, o reducer não depende da ordem: `turn_end`
  (`packages/web/src/features/conversation/conversation-model.ts:438`) não toca `pendingPermission`,
  e `permission_resolved` (`:326-349`) limpa pelo `requestId`. O C30 afirma, no navegador, que
  *"o turno está parado aqui"* sumiu (`e2e/plan-mode.spec.ts:166`).
- **Observadores globais.** Nenhum `watchEvents` reage a `permission_resolved`. Conferi
  `SessionStore.ts:924`, `usage/record.ts:58`, `tasks/progress.ts:42` e `memory/playbook-tracking.ts:28`.
- **Quem chama `cancel()`.** O websocket (`acp/websocket.ts:156`), a tarefa (`routers/task.ts:497`) e
  a esteira (`bootstrap.ts:392`). Todos passam a cancelar também o pedido pendente, como diz o
  `Impact` da `prd.md`. O `gate:quick` ficou verde nos três.

## Binding sources

O perfil é `standard`, então este passo não roda: o checks.md não tem desenho vinculante, pelo ADR
de 2026-09-20. Abri mesmo assim a fonte que a PRD cita em `Sources`, a cópia do adaptador em
`~/.lumem/adapters/claude/node_modules/@agentclientprotocol/claude-agent-acp`
(`"version": "0.75.1"`):

- os modos em `dist/session-mode.js:189-224` são `default`, `acceptEdits`, `plan`, `auto` e
  `bypassPermissions`;
- as opções de saída do plano estão em `dist/permissions/options/tools.js`, e os ids em
  `dist/permissions/options/shared.js:1-14`.

Nenhuma contradição com o C3, o C14 ou o C25.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `claude-agent-acp@0.75.1` (a PRD, `Sources`) | yes — `~/.lumem/adapters/claude/…/dist/` | none | - |

## Checks

Tudo verificado em `bd47aa2`. No vitest, **uma** invocação sobre os sete arquivos com um `-t` de
alternância dos 24 nomes: 38 instâncias `✓`, cada uma listada pelo nome, e 0 falhas. No Playwright,
**uma** invocação sobre `plan-mode`, `acp-conversation`, `session-mode` e `happy-path`: 17 passaram,
os 5 de `plan-mode.spec.ts` inclusive, cada um listado pelo nome.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | faixa `role=status`, texto exato, acima da caixa | vitest `-t "em plan mode a faixa aparece com o texto exato"` ✓ | `packages/web/src/features/conversation/PlanModeBanner.test.tsx:48` - `expect(banner).toHaveTextContent(new RegExp(`^${TEXT}$`))` (banner = `getByRole("status")`, `:47`); `:51` - `banner.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING` | PASS |
| C2 | `config` plan → auto some a faixa | vitest `-t "a faixa some quando o modo sai de plan"` ✓ | `PlanModeBanner.test.tsx:61` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` depois de `rerender(... reduceConversation(planning, config("auto")))` | PASS |
| C3 | auto/default/acceptEdits/bypassPermissions/"" sem faixa | vitest `-t "fora de plan mode não há faixa"` ✓ ×5 | `PlanModeBanner.test.tsx:64` - `it.each([["auto"], ["default"], ["acceptEdits"], ["bypassPermissions"], [""]])`; `:69` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` | PASS |
| C4 | `readOnly` com plan: sem faixa | vitest `-t "conversa em leitura não mostra a faixa"` ✓ | `PlanModeBanner.test.tsx:76` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` | PASS |
| C5 | `PlanCard` diz Passos, não Plano | vitest `-t "o rótulo da lista é Passos"` ✓ | `packages/web/src/features/conversation/PlanCard.test.tsx:126` - `getByText("Passos")`; `:127` - `expect(head).not.toHaveTextContent(/Plano/)` | PASS |
| C6 | navegador: a faixa aparece e some ao aprovar | playwright `-g "a faixa aparece em plan mode e some ao aprovar"` ✓ | `e2e/plan-mode.spec.ts:85` - `expect(conv.getByText(BANNER, { exact: true })).toBeVisible()`; `:90` - `.toHaveCount(0)` | PASS |
| C7 | `tool_call` leva o `content` traduzido | vitest `-t "tool_call leva o content traduzido"` ✓ | `packages/server/src/acp/translate.test.ts:264` - `expect(event).toEqual({ type: "tool_call", ..., content: [{ type: "content", text: PLAN }] })` | PASS |
| C8 | diff e terminal, como no update | vitest `-t "tool_call traduz diff e terminal como o update"` ✓ | `translate.test.ts:297` - `expect(call).toMatchObject({ type: "tool_call", content: expected })`; `:298` - o mesmo `expected` no `tool_call_update` | PASS |
| C9 | sem `content`, sem a chave | vitest `-t "tool_call sem content não inventa a chave"` ✓ | `translate.test.ts:308` - `expect("content" in (event as object)).toBe(false)` | PASS |
| C10 | o reducer guarda, e o update substitui | vitest `-t "o content do tool_call fica, e o update o substitui"` ✓ | `packages/web/src/features/conversation/conversation-model.test.ts:256` - `toMatchObject({ kind: "tool", call: { content: [plan] } })`; `:260` - `call: { content: [replaced] }` | PASS |
| C11 | `switch_mode` nunca aprovado em ask/auto/free | vitest `-t "nenhum modo do Lumem aprova um plano"` ✓ ×3 | `packages/server/src/acp/permission-policy.test.ts:205` - `it.each([["ask"], ["auto"], ["free"]])`; `:208` - `expect(decision).toEqual({ approve: false, reason: "aprovar um plano é decisão sua" })` | PASS |
| C12 | agente sem modos em free: o pedido fica pendente, nenhum resolved | vitest `-t "liberado não aprova o plano"` ✓ | `packages/server/src/acp/AcpManager.fake-adapter.test.ts:168` - `toMatchObject({ mode: "", lumemMode: "free" })`; `:173` - `expect(request.policyReason).toBe("aprovar um plano é decisão sua")`; `:174` - `events.some(... "permission_resolved")).toBe(false)` | PASS |
| C13 | plano de 30 linhas inteiro, heading, sem `.perm` | vitest `-t "o plano pendente aparece inteiro e renderizado"` ✓ | `packages/web/src/features/conversation/PlanApproval.test.tsx:92` - `getByRole("heading", { name: "Separar o parser do loader" })).toBeVisible()`; `:94` - `getByText("passo 30")).toBeVisible()`; `:95` - `querySelector(".perm")).toBeNull()` | PASS |
| C14 | as quatro opções verbatim; as allow na ordem; a reject depois de "ou continuar planejando" | vitest `-t "as opções aparecem verbatim e a recusa vem separada"` ✓ | `PlanApproval.test.tsx:106-107` - `button.compareDocumentPosition(next/keep) & DOCUMENT_POSITION_FOLLOWING`; `:109` - `keep.compareDocumentPosition(buttons[3]!)` | PASS |
| C15 | cada clique manda o seu `optionId` | vitest `-t "cada opção responde com o seu optionId"` ✓ ×4 | `PlanApproval.test.tsx:117` - `card().getByRole("button", { name })`; `:119` - `expect(answer).toHaveBeenCalledExactlyOnceWith("rq-plan", optionId)` | PASS |
| C16 | Enter → `exit-plan-default`, Esc → `reject` | vitest `-t "Enter aprova a allow_once e Esc recusa"` ✓ | `PlanApproval.test.tsx:125` - o foco no botão *"Yes, manually approve edits"* do cartão; `:127` - `toHaveBeenCalledExactlyOnceWith("rq-plan", "exit-plan-default")`; `:133` - `(..., "reject")` | PASS |
| C17 | aprovado vira registro com o `name` (3 opções) | vitest `-t "aprovar vira registro com o nome da opção"` ✓ ×3 | `PlanApproval.test.tsx:152` - `getByText(`plano aprovado — ${name}`)`; `:153` - todos os botões `toBeNull()` | PASS |
| C18 | reject vira "você pediu para continuar planejando" | vitest `-t "recusar vira registro de continuar planejando"` ✓ | `PlanApproval.test.tsx:159` - `getByText("você pediu para continuar planejando")`; `:160` - botões `toBeNull()` | PASS |
| C19 | `outcome: "cancelled"` vira "pedido cancelado" | vitest `-t "pedido cancelado vira registro"` ✓ | `PlanApproval.test.tsx:166` - `getByText("pedido cancelado")`; `:167` - botões `toBeNull()`. Agora o evento tem produtor: C28, C29 e C30 | PASS |
| C20 | registro recolhido; "ver o plano" expande | vitest `-t "o registro recolhe o plano e ver o plano o abre"` ✓ | `PlanApproval.test.tsx:173` - `queryByText("passo 30")).not.toBeInTheDocument()`; `:179` - `getByText("passo 30")` depois do clique | PASS |
| C21 | sem texto: a frase, e as quatro opções | vitest `-t "sem texto do plano o cartão diz e mantém as opções"` ✓ | `PlanApproval.test.tsx:139` - `getByText("o agente não mandou o texto do plano")`; `:140` - `expect(button).toBeInTheDocument()` para cada uma das quatro | PASS |
| C22 | navegador: o plano inteiro, e o registro ao aprovar | playwright `-g "o plano inteiro aparece e aprovar deixa o registro"` ✓ | `e2e/plan-mode.spec.ts:98` - heading `FIRST_LINE` `toBeVisible()`; `:99` - `LAST_LINE` `toBeVisible()`; `:101` - group `"pedido de permissão"` `toHaveCount(0)`; `:105` - `"plano aprovado — Yes, and use auto mode"` | PASS |
| C23 | navegador: o registro sobrevive a recarregar, e o plano é relido do disco | playwright `-g "o registro sobrevive a recarregar"` ✓ | `e2e/plan-mode.spec.ts:131` - `after.getByText("plano aprovado — Yes, and use auto mode")).toBeVisible()`; `:136` - `LAST_LINE` `toHaveCount(0)` (recolhido); `:138` - heading `FIRST_LINE` `toBeVisible()`; `:139` - `LAST_LINE` `toBeVisible()` depois de *"ver o plano"* | PASS |
| C24 | navegador: "No, keep planning", e a faixa fica | playwright `-g "recusar mantém o plan mode"` ✓ | `e2e/plan-mode.spec.ts:149` - `"você pediu para continuar planejando"`; `:151` - composer `not.toBeDisabled()`; `:152` - `BANNER` `toBeVisible()` | PASS |
| C25 | roteiro: ordem, título, mais de 12 linhas no `tool_call`, quatro opções | vitest `-t "o roteiro de plan mode emite o pedido do adaptador"` ✓ | `AcpManager.fake-adapter.test.ts:133-134` - `expect(call).toBeGreaterThan(planMode)`, `expect(ask).toBeGreaterThan(call)`; `:139` - `.split("\n").length).toBeGreaterThan(12)`; `:142` - `expect(request.options).toEqual(PLAN_OPTIONS)` | PASS |
| C26 | resposta → modo e `stopReason` (4 linhas) | vitest `-t "cada resposta do roteiro leva ao modo do adaptador"` ✓ ×4 | `AcpManager.fake-adapter.test.ts:160` - `expect(await turn).toBe(stopReason)`; `:161` - `expect(modes(events).at(-1)).toBe(mode)` | PASS |
| C27 | as specs que já usam o agente falso continuam verdes | as 3 specs nomeadas: 12 ✓. **Na suíte inteira**, as 18 specs que importam `E2E_FAKE_ACP_AGENT` passaram. As 5 falhas da suíte (ver Gate) estão em `pull-request` e `right-panel`, que não usam o agente falso | `e2e/support/fake-acp-agent.mjs` - o despacho só ganhou o ramo de `PLAN_FIRST`; `git diff e3894e4..HEAD` não tira nenhuma linha do `runTurn` | PASS |
| C28 | cancelar o turno cancela o pedido; resposta depois → `NOT_FOUND` | vitest `-t "cancelar o turno cancela o pedido pendente"` ✓ | `AcpManager.fake-adapter.test.ts:201-203` - `expect(events.filter(... "permission_resolved")).toEqual([{ type: "permission_resolved", requestId: request.requestId, outcome: "cancelled", by: "user", reason: null }])`; `:211` - `expect(refused).toMatchObject({ code: "NOT_FOUND" })` | PASS |
| C29 | o agente sair cancela o pedido, antes do evento de saída | vitest `-t "o agente sair cancela o pedido pendente"` ✓ | `AcpManager.fake-adapter.test.ts:229` - `expect(events).toContainEqual(resolved)`; `:231` - `expect(order.indexOf("permission_resolved")).toBeLessThan(order.indexOf("exit"))`; `:233` - `storedTranscript(id)` contém `resolved` | PASS |
| C30 | navegador: cancelar com o plano pendente deixa "pedido cancelado", sem botões | playwright `-g "cancelar com o plano pendente deixa pedido cancelado"` ✓ | `e2e/plan-mode.spec.ts:162` - `card.getByText("pedido cancelado")).toBeVisible()`; `:164` - cada um dos quatro botões `toHaveCount(0)`; `:166` - `"o turno está parado aqui"` `toHaveCount(0)` | PASS |

## Coverage

Tudo recalculado em `bd47aa2`, a partir da autoridade de cada conjunto: o adaptador para modos e
opções, o schema compartilhado para `content`, e os **pontos de chamada no daemon** para os
produtores.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| valores de `mode` (6) | adaptador `dist/session-mode.js:189-224` (5 ids) + `""` do agente sem modos | `plan` C1 · `auto`, `default`, `acceptEdits`, `bypassPermissions`, `""` C3 | - |
| transições da faixa (2) | reducer `config` (`conversation-model.ts`, `case "config"`) | entra C6 · sai C2, C6 | - |
| tipos de `content` no `tool_call` (4) | `acpToolContentSchema`, `packages/shared/src/acp-protocol.ts:100-110`, mais o ausente | `content` C7 · `diff` C8 · `terminal` C8 · ausente C9 | - |
| política do Lumem com `switch_mode` (3) | `lumemModeSchema`, `acp-protocol.ts:130` | `ask`, `auto`, `free` C11 · `free` pelo daemon C12 | - |
| opções do pedido (4) | adaptador `tools.js` (o caso `auto` com plano) = `fake-acp-agent.mjs` | as quatro em C14 e C15; Enter e Esc C16; registro C17 e C18. As variantes *bypass* e *accept edits* do adaptador passam pelo mesmo caminho verbatim, sem tabela por `optionId` | - |
| desfechos do pedido (4) | `permission_resolved.outcome` × `kind` | `allow_always`, `allow_once` C17 · `reject_once` C18 · `cancelled` C19, C30 | - |
| produtores de `permission_resolved` `cancelled` (2) | chamadas de `cancelPending`: `AcpManager.ts:1536` (`cancel`) e `:2477` (`markExited`) — `rg -n cancelPending` só acha essas duas e a definição | turno cancelado C28, C30 · agente saiu C29 | - |
| estados do cartão (5) | `PlanApproval.tsx` + reducer | pendente C13 · sem texto C21 · recolhido C20 · expandido C20 · retirado C19, C30 (agora com o turno cancelado de verdade) | - |
| respostas do roteiro → modo (4) | `fake-acp-agent.mjs` `MODE_AFTER` + adaptador `effects.js` | as quatro em C26 | - |
| porta 1: `tool_call` leva `content` (2 lados) | `translate.ts:235-236`, reducer | tradutor C7 · reducer C10 · daemon real C25 | - |
| porta 2: o transcript grava o `content` (2 caminhos) | `AcpManager.ts:2434` grava o evento do tradutor; `TranscriptStore.ts:181-197` o relê do SQLite | ao vivo C22 · relido do disco C23 (`plan-mode.spec.ts:138-139`; a falha 4 morreu só aqui) | - |

Varredura extra do Swept:

- `idempotency: existing` confere: `respondToPermission` recusa com `NOT_FOUND`
  (`AcpManager.ts:1563-1566`), e agora vale também depois do cancelamento, porque o mapa é limpo.
- `concurrency: existing` confere: o reducer descarta o bloco anterior em `permission_request`. A
  citação `conversation-model.ts:294-321` do `checks.md:145` andou para `:298-323` (nit).
- `failure modes` nomeia C28, C29 e C30, e cada um tem prova que cruza o daemon real.

## Test policy rows

O checks.md não tem seção `Test policy`: ele remete à matriz de `docs/project/testing.md`. Pela
matriz, a camada de cada prova nova da rodada 2 está certa. C28 e C29 rodam no daemon com o agente
falso real, sem mock. C30 roda no navegador contra o daemon. Não há linha para julgar.

## Faults injected

Tudo numa worktree descartável: `git worktree add --detach /tmp/lumem-035-v2-scratch HEAD`, seguido
de `pnpm install --offline --frozen-lockfile`. Cada mutação foi desfeita com `git checkout -- .`
antes da seguinte. O porcelain da árvore real estava vazio antes e continuou vazio depois
(`diff` idêntico). A worktree foi removida com `git worktree remove --force` e `prune`.

Na rodada 2 as mutações vão nas superfícies que a correção tocou ou criou: o `cancelPending` e seus
dois pontos de chamada, a leitura do transcript (a asserção nova do C23) e o piso de contraste.

| Mutation | Location | Killed |
| --- | --- | --- |
| `cancel()` não chama `cancelPending` | `packages/server/src/acp/AcpManager.ts:1536` | yes - C28 falhou (`expected [] to deeply equal [ { …(5) } ]`) |
| `markExited` chama `cancelPending` **depois** de `listeners.clear()` | `packages/server/src/acp/AcpManager.ts:2477-2478` | yes - C29 falhou (`to deep equally contain { type: 'permission_resolved', … }`) |
| `cancelPending` não limpa o mapa | `packages/server/src/acp/AcpManager.ts:1551` | yes - C28 falhou (`expected null to match object { code: 'NOT_FOUND' }`) |
| o `decode` do `TranscriptStore` descarta o `content` de todo `tool_call` relido | `packages/server/src/acp/TranscriptStore.ts:269` | yes - C23 falhou em `plan-mode.spec.ts:138`; o C22 (ao vivo) passou, o que confirma que foi a linha nova que o pegou |
| o par `modo plano / faixa do composer` apagado | `packages/web/src/styles/contrast.ts:171` | no - `tokens.test.ts` 13/13 verde. O array vai de 126 para 125 e o piso é `>= 123` (`tokens.test.ts:67`). Na base eram 125 pares com piso 122, e a folga de 3 continua igual |

Superfícies julgadas pela leitura, e não mutadas porque a rodada 2 não as tocou e a rodada 1 já as
matou: o tradutor, a guarda da política, o reducer do `content`, e o Enter/Esc e o clique do cartão.
A faixa com `acceptEdits` (C3) é igualdade estrita (`PlanModeBanner.tsx:19`), e uma mutação que
pegasse só esse valor seria artificial.

## Gate

- `LUMEM_GATE_BASE=e3894e4 pnpm gate:quick`: 292 arquivos, **4869 passaram**, 6 pulados, exit 0.
  A rodada 1 tinha 4866; os três a mais são `("acceptEdits")`, C28 e C29. Nenhum `.skip`, `.only` ou
  `.todo` novo no diff, e nenhum teste removido: as duas linhas tiradas de
  `AcpManager.fake-adapter.test.ts` são imports reescritos.
- `pnpm gate:build`: veio inteiro do cache, então forcei. `turbo typecheck --force` deu 4/4, 0 em
  cache; `turbo build --force` deu 7/7, 0 em cache. Os dois saíram 0.
- `pnpm lint`: exit 0. `pnpm docs:check`: `docs ok`, exit 0.
- Playwright das provas: 17 passaram (os 5 de `plan-mode` e as specs do C27).
- **`pnpm exec playwright test`, a suíte inteira, que é a metade e2e do `gate:full` e o check `e2e`
  da PR: 124 passaram e 5 falharam, exit 1.** As cinco falhas são a mesma, `strict mode violation:
  getByRole('button', { name: 'recarregar' }) resolved to 2 elements`, e o primeiro elemento é
  `getByRole('button', { name: 'plano-recarregar 1 sessão' })`:
  - `pull-request.spec.ts:150`, `:197`, `:246` e `:271`, pelo helper em `:90`;
  - `right-panel.spec.ts:92`, em `:103`.

  Isolei a causa em três execuções:
  - `pull-request.spec.ts` sozinha: 4/4 verdes;
  - `right-panel.spec.ts -g "the diff notices…"` sozinha: 1/1 verde;
  - `plan-mode.spec.ts` + `right-panel.spec.ts`: o mesmo teste falha, com o mesmo erro.

  O estado do e2e é um só por execução, então a worktree `plano-recarregar`
  (`e2e/plan-mode.spec.ts:37`), criada por uma spec que roda antes na ordem alfabética, continua na
  sidebar quando as outras duas rodam.

## Documentação

- `docs/project/testing.md`: a armadilha nova de `bd47aa2` (*"um check sobre como a tela reage a um
  evento que ninguém produz"*) descreve com exatidão o F1 e a regra que o impede. Confere.
- `docs/features/035-plan-mode/prd.md`: os critérios 24 e 25 e a nota que os delimita estão lá. O
  `Impact` (linha `permissão`) e o `Flow` (nó `CAN`) batem com `AcpManager.ts:1536` e `:2477`. A linha
  `Observable` *"tom e contraste"* (`:224`) foi corrigida. Nit: o critério 25 diz *"antes de marcar a
  sessão como encerrada"*, mas `session.info.state = "exited"` (`AcpManager.ts:2471`) vem antes do
  `cancelPending` (`:2477`). O que se observa de fora, e o que o C29 afirma, é *"antes do evento de
  saída"*. A redação do critério deveria ser essa.
- `docs/README.md` está desatualizado na `035`:
  - `:760` fala em *"23 critérios"* e *"uma porta de mão única"*, mas a PRD tem 25 critérios e duas
    portas no `Landing`;
  - `:762` fala em *"27 checks"*, mas são 30;
  - o `verification.md`, que existe desde `4a3cb7a`, não está no índice. O `CLAUDE.md` manda indexar
    o arquivo novo na mesma hora, e o `docs:check` não confere isso.
- Passo 7 do verify, que cabe a quem segura a feature: as duas lacunas desta rodada pedem duas
  entradas em *Armadilhas já corrigidas*.
  - *"nome de worktree de uma spec vira nome acessível de um botão da sidebar, e um
    `getByRole({ name })` sem `exact` em outra spec casa por substring. Só a suíte inteira mostra, e
    a prova de *specs existentes verdes* é a suíte inteira, não uma lista de specs"*;
  - *"subir o piso de uma contagem para o valor de antes mais um não protege o item novo quando já
    havia folga: o piso é o tamanho do array"*.

## Ranked gaps

1. **Suíte e2e vermelha** (blocker). A worktree `plano-recarregar` (`e2e/plan-mode.spec.ts:37`) faz
   `e2e/pull-request.spec.ts:90` e `e2e/right-panel.spec.ts:103` acharem dois botões. São 5 testes, e
   o check `e2e` da PR para `main` falha. Menor correção: renomear a worktree para um nome sem
   *"recarregar"* (por exemplo `plano-reler`). Opcionalmente, `exact: true` nos dois localizadores.
   Aponta também uma lacuna de precisão no C27: a prova nomeia três specs, mas o que o critério 23
   protege é a suíte que divide o daemon com a spec nova.
2. **Mutante vivo no piso de contraste** (blocker pela regra de mutação). `CONTRAST_PAIRS` tem 126
   pares e o piso é `>= 123` (`packages/web/src/styles/tokens.test.ts:67`), então o par da faixa pode
   ser apagado sem nada falhar. Menor correção: piso `126`, e o título da linha `:54`
   (*"mede pelo menos 122 pares"*) acompanhando o número.
3. **Índice de documentação desatualizado** (warning). `docs/README.md:760` e `:762` têm os números
   errados, e o `verification.md` está fora do índice.

Nits, que não travam: o critério 25 da PRD e a ordem `state = "exited"` antes do `cancelPending`; a
linha citada em `checks.md:145`; o `by: "user"` no cancelamento feito pela saída do agente, quando
ninguém decidiu nada (o construtor registrou a escolha como o padrão do schema, e o reducer não se
importa).

Fica como follow-up, sem confirmação: um pedido pendente sobrevive a um turno que o **agente**
termine por conta própria, sem `cancel()` e sem sair. Nada limpa `pendingPermissions` quando o
`session/prompt` volta. Um agente ACP bem-comportado não faz isso, e o agente falso não chega nesse
caminho.
