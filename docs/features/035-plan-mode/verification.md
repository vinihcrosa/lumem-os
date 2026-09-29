# 035 plan-mode — relatório do verificador

**Verdict**: PASS
**Profile**: standard
**Diff range**: e3894e4..ede982c
**Round**: 3 - full
**Verifier**: independent sub-agent (author != verifier)

Rodada 3, feita por inteiro, por um verificador que não viu as rodadas anteriores. Tudo foi
verificado em `ede982c`. Nada foi carregado de relatório anterior: as 30 provas rodaram de novo, as
citações foram relidas no arquivo, a Coverage foi recalculada a partir da autoridade de cada conjunto,
e as falhas foram injetadas de novo.

**Os 30 checks passam, e os dois bloqueadores da rodada 2 fecharam.** A suíte e2e inteira rodou verde
(129 de 129, as 39 specs). O par de contraste da faixa agora não pode ser apagado sem nada falhar.
As cinco falhas injetadas morreram.

## Os achados da rodada 2

| Achado | Estado em `ede982c` | Evidência |
| --- | --- | --- |
| 1 — suíte e2e vermelha (5 testes) pela worktree `plano-recarregar` | **fechado** | `e2e/plan-mode.spec.ts:37` agora diz `reload: "plano-reler"`. `e2e/pull-request.spec.ts:90`, `e2e/right-panel.spec.ts:103` e `:125` usam `{ name: "⟳ recarregar", exact: true }`. `pnpm exec playwright test`: **129 passed, exit 0**. Os quatro testes de `pull-request` e os três de `right-panel` estão entre eles |
| 2 — o piso de contraste não protegia o par novo | **fechado** | `packages/web/src/styles/tokens.test.ts:68` - `expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(126)`. Medi o tamanho do array por `tsx`: **126**. Apagar o par `modo plano / faixa do composer` (`contrast.ts:171`) agora falha: `expected 125 to be greater than or equal to 126` (falha 1) |
| 3 — o índice `docs/README.md` estava desatualizado | **fechado** | A seção `plan-mode/` do índice agora diz *"25 critérios em quatro fatias e duas portas de mão única"* e *"30 checks em 4 fatias"*, e tem uma linha para o `verification.md`. Conferi contra a PRD (critérios 1–25, as duas linhas do `Landing`) e contra o `checks.md` (C1–C30) |
| nit — critério 25 dizia *"antes de marcar a sessão como encerrada"* | fechado | `prd.md` critério 25 agora diz *"antes do evento de saída da sessão"*. É o que o C29 afirma (`AcpManager.fake-adapter.test.ts:231`) |
| nit — citação do `Swept` em `checks.md` | fechado | `checks.md` diz `conversation-model.ts:298-323`. O `case "permission_request"` e o `mapTurns` que descarta o bloco anterior estão exatamente nessas linhas |
| nit — `by: "user"` no cancelamento pela saída do agente | aberto, não trava | `AcpManager.ts:1549`. Ninguém decidiu nada, mas o reducer não lê o `by` num `cancelled`. O construtor registrou a escolha no `Handoff` |

**Regressões que a correção poderia ter trazido.** Procurei cada uma e não achei nenhuma.

- **Outro localizador casando com um nome da spec nova.** Varri os localizadores `getByRole("button", { name: "…" })` sem `exact` em `e2e/`. Nenhum é substring de `plano-faixa`, `plano-aprovar`, `plano-reler`, `plano-recusar` ou `plano-cancelar`. Depois varri as strings `plano`, `faixa`, `aprovar`, `reler`, `recusar` e `cancelar` nas outras specs. O único resultado é um `messageId` do agente falso (`fake-acp-agent.mjs:596`), que não é localizador.
- **O `exact` sem achar botão.** Se o nome exato estivesse errado, os testes ficariam vermelhos por *element not found*. Os sete testes de `pull-request` e `right-panel` passaram na suíte inteira.
- **A correção dependendo só do nome novo.** Sonda na worktree descartável: voltei a worktree para `plano-recarregar` e mantive os localizadores exatos. `plan-mode` + `pull-request` + `right-panel` deram **12 passed**. As duas proteções valem cada uma sozinha. A sonda não conta como falha: o que o C27 afirma continuou verdadeiro, então ela não tinha como matar nada.
- **Teste removido ou enfraquecido.** No diff `e3894e4..HEAD` não há `.skip`, `.only` nem `.todo` novo. As únicas linhas removidas de testes são: o título e o valor do piso (`122` → `126`, mais forte), os três localizadores (agora exatos, mais fortes) e dois imports reescritos em `AcpManager.fake-adapter.test.ts`.
- **O turno padrão do agente falso.** `git diff e3894e4..HEAD -- e2e/support/fake-acp-agent.mjs` não remove nenhuma linha. O roteiro entra pelo ramo `text.includes(PLAN_FIRST)`.

## Binding sources

O perfil é `standard`, então o passo 1 não é devido. O `checks.md` não tem desenho vinculante, pelo
[ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md). Mesmo assim reabri a
fonte que a PRD cita em `Sources`, porque C3, C14 e C25 dependem dela: a cópia do adaptador em
`~/.lumem/adapters/claude/node_modules/@agentclientprotocol/claude-agent-acp`, com `"version": "0.75.1"`.

- `dist/permissions/options/shared.js:1-14` define os ids `exit-plan-clear-auto`, `exit-plan-auto`, `exit-plan-default` e `reject`.
- `dist/permissions/options/tools.js` dá os nomes e os `kind`:
  - *"Yes, clear context${usage} and use auto mode"*, `allow_always`;
  - *"Yes, and use auto mode"*, `allow_always`;
  - *"Yes, manually approve edits"*, `allow_once`;
  - `reject("No, keep planning")`, na linha `:100`.
- `dist/permissions/effects.js:115` tem *"User chose to keep planning"* com interrupção. É o `cancelled` do C26.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `claude-agent-acp@0.75.1` (a PRD, `Sources`) | yes — `~/.lumem/adapters/claude/…/dist/` | none | - |

## Checks

Tudo verificado em `ede982c`.

- **Vitest:** **uma** invocação sobre os oito arquivos (os sete das provas mais `tokens.test.ts`), com um `-t` que alterna os 24 nomes e o do piso. Resultado: 39 passaram, cada instância listada pelo nome com `✓`, 0 falhas, exit 0. Os `it.each` aparecem instância por instância: C3 ×5, C11 ×3, C15 ×4, C17 ×3, C26 ×4.
- **Playwright:** a suíte inteira, `pnpm exec playwright test`. Os cinco testes de `e2e/plan-mode.spec.ts` aparecem pelo nome: `:79` (C6), `:93` (C22), `:109` (C23), `:142` (C24) e `:155` (C30).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | faixa `role=status`, texto exato, acima da caixa | vitest `-t "em plan mode a faixa aparece com o texto exato"` ✓ | `packages/web/src/features/conversation/PlanModeBanner.test.tsx:48` - `expect(banner).toHaveTextContent(new RegExp(`^${TEXT}$`))`, com `banner = screen.getByRole("status")` (`:47`); `:51` - `banner.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING` | PASS |
| C2 | `config` plan → auto faz a faixa sumir | vitest `-t "a faixa some quando o modo sai de plan"` ✓ | `PlanModeBanner.test.tsx:61` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` depois do `rerender(… reduceConversation(planning, config("auto")))` (`:59`) | PASS |
| C3 | sem faixa em auto, default, acceptEdits, bypassPermissions e `""` | vitest `-t "fora de plan mode não há faixa"` ✓ ×5 | `PlanModeBanner.test.tsx:64` - `it.each([["auto"], ["default"], ["acceptEdits"], ["bypassPermissions"], [""]])`; `:69` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` | PASS |
| C4 | `readOnly` com plan: sem faixa | vitest `-t "conversa em leitura não mostra a faixa"` ✓ | `PlanModeBanner.test.tsx:76` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` com `readOnly` `true` (`:74`) | PASS |
| C5 | `PlanCard` diz Passos, não Plano | vitest `-t "o rótulo da lista é Passos"` ✓ | `packages/web/src/features/conversation/PlanCard.test.tsx:126` - `getByText("Passos")`; `:127` - `expect(head).not.toHaveTextContent(/Plano/)` | PASS |
| C6 | navegador: a faixa aparece e some ao aprovar | playwright `plan-mode.spec.ts:79` ✓ | `e2e/plan-mode.spec.ts:85` - `expect(conv.getByText(BANNER, { exact: true })).toBeVisible()`; `:90` - `.toHaveCount(0)` depois de aprovar | PASS |
| C7 | `tool_call` leva o `content` traduzido | vitest `-t "tool_call leva o content traduzido"` ✓ | `packages/server/src/acp/translate.test.ts:264` - `expect(event).toEqual({ type: "tool_call", …, content: [{ type: "content", text: PLAN }] })` | PASS |
| C8 | diff e terminal, como no update | vitest `-t "tool_call traduz diff e terminal como o update"` ✓ | `translate.test.ts:297` - `expect(call).toMatchObject({ type: "tool_call", content: expected })`; `:298` - o mesmo `expected` no `tool_call_update` | PASS |
| C9 | sem `content`, sem a chave | vitest `-t "tool_call sem content não inventa a chave"` ✓ | `translate.test.ts:308` - `expect("content" in (event as object)).toBe(false)` | PASS |
| C10 | o reducer guarda o `content`, e o update o substitui | vitest `-t "o content do tool_call fica, e o update o substitui"` ✓ | `packages/web/src/features/conversation/conversation-model.test.ts:256` - `toMatchObject({ kind: "tool", call: { content: [plan] } })`; `:260` - `call: { content: [replaced] }` | PASS |
| C11 | `switch_mode` nunca aprovado em ask, auto e free | vitest `-t "nenhum modo do Lumem aprova um plano"` ✓ ×3 | `packages/server/src/acp/permission-policy.test.ts:205` - `it.each([["ask"], ["auto"], ["free"]])`; `:208` - `expect(decision).toEqual({ approve: false, reason: "aprovar um plano é decisão sua" })` | PASS |
| C12 | agente sem modos em free: o pedido fica pendente, nenhum `resolved` | vitest `-t "liberado não aprova o plano"` ✓ | `packages/server/src/acp/AcpManager.fake-adapter.test.ts:168` - `toMatchObject({ mode: "", lumemMode: "free" })`; `:173` - `expect(request.policyReason).toBe("aprovar um plano é decisão sua")`; `:174` - `events.some(… "permission_resolved")).toBe(false)` | PASS |
| C13 | plano de 30 linhas inteiro, com heading, sem `.perm` | vitest `-t "o plano pendente aparece inteiro e renderizado"` ✓ | `packages/web/src/features/conversation/PlanApproval.test.tsx:92` - `getByRole("heading", { name: "Separar o parser do loader" })).toBeVisible()`; `:94` - `getByText("passo 30")).toBeVisible()`; `:95` - `querySelector(".perm")).toBeNull()` | PASS |
| C14 | quatro opções verbatim, as allow na ordem, a reject depois de "ou continuar planejando" | vitest `-t "as opções aparecem verbatim e a recusa vem separada"` ✓ | `PlanApproval.test.tsx:101` - `getByRole("button", { name: option.name })` para as quatro; `:106-107` - `compareDocumentPosition(next/keep) & DOCUMENT_POSITION_FOLLOWING`; `:109` - `keep.compareDocumentPosition(buttons[3]!)` | PASS |
| C15 | cada clique manda o seu `optionId` | vitest `-t "cada opção responde com o seu optionId"` ✓ ×4 | `PlanApproval.test.tsx:117` - `card().getByRole("button", { name })`; `:119` - `expect(answer).toHaveBeenCalledExactlyOnceWith("rq-plan", optionId)` | PASS |
| C16 | Enter → `exit-plan-default`, Esc → `reject` | vitest `-t "Enter aprova a allow_once e Esc recusa"` ✓ | `PlanApproval.test.tsx:125` - o foco no botão *"Yes, manually approve edits"* do cartão; `:127` - `toHaveBeenCalledExactlyOnceWith("rq-plan", "exit-plan-default")`; `:133` - `(…, "reject")` | PASS |
| C17 | aprovado vira registro com o `name` (3 opções) | vitest `-t "aprovar vira registro com o nome da opção"` ✓ ×3 | `PlanApproval.test.tsx:152` - `getByText(`plano aprovado — ${name}`)`; `:153` - todos os botões `toBeNull()` | PASS |
| C18 | reject vira "você pediu para continuar planejando" | vitest `-t "recusar vira registro de continuar planejando"` ✓ | `PlanApproval.test.tsx:159` - `getByText("você pediu para continuar planejando")`; `:160` - botões `toBeNull()` | PASS |
| C19 | `outcome: "cancelled"` vira "pedido cancelado" | vitest `-t "pedido cancelado vira registro"` ✓ | `PlanApproval.test.tsx:166` - `getByText("pedido cancelado")`; `:167` - botões `toBeNull()`. O evento tem produtor: C28, C29, C30 | PASS |
| C20 | registro recolhido; "ver o plano" expande | vitest `-t "o registro recolhe o plano e ver o plano o abre"` ✓ | `PlanApproval.test.tsx:173` - `queryByText("passo 30")).not.toBeInTheDocument()`; `:179` - `getByText("passo 30")` depois do clique em *"ver o plano"* (`:176`) | PASS |
| C21 | sem texto: a frase, e as quatro opções | vitest `-t "sem texto do plano o cartão diz e mantém as opções"` ✓ | `PlanApproval.test.tsx:139` - `getByText("o agente não mandou o texto do plano")`; `:140` - `expect(button).toBeInTheDocument()` para as quatro | PASS |
| C22 | navegador: plano inteiro, e registro ao aprovar | playwright `plan-mode.spec.ts:93` ✓ | `e2e/plan-mode.spec.ts:98` - heading `FIRST_LINE` `toBeVisible()`; `:99` - `LAST_LINE` `toBeVisible()`; `:101` - group `"pedido de permissão"` `toHaveCount(0)`; `:105` - `"plano aprovado — Yes, and use auto mode"` `toBeVisible()` | PASS |
| C23 | navegador: o registro sobrevive a recarregar, e o plano vem do disco | playwright `plan-mode.spec.ts:109` ✓ | `e2e/plan-mode.spec.ts:131` - `after.getByText("plano aprovado — Yes, and use auto mode")).toBeVisible()`; `:136` - `LAST_LINE` `toHaveCount(0)` (recolhido); `:138` - heading `FIRST_LINE` `toBeVisible()`; `:139` - `LAST_LINE` `toBeVisible()` depois de *"ver o plano"* | PASS |
| C24 | navegador: "No, keep planning", e a faixa continua | playwright `plan-mode.spec.ts:142` ✓ | `e2e/plan-mode.spec.ts:149` - `"você pediu para continuar planejando"` `toBeVisible()`; `:151` - composer `not.toBeDisabled()`; `:152` - `BANNER` `toBeVisible()` | PASS |
| C25 | roteiro: ordem, título, mais de 12 linhas no `tool_call`, quatro opções | vitest `-t "o roteiro de plan mode emite o pedido do adaptador"` ✓ | `AcpManager.fake-adapter.test.ts:133-134` - `expect(call).toBeGreaterThan(planMode)`, `expect(ask).toBeGreaterThan(call)`; `:137` - `title` `"Approve Plan"`; `:139` - `.split("\n").length).toBeGreaterThan(12)`; `:142` - `expect(request.options).toEqual(PLAN_OPTIONS)` | PASS |
| C26 | resposta → modo e `stopReason` (4 linhas) | vitest `-t "cada resposta do roteiro leva ao modo do adaptador"` ✓ ×4 | `AcpManager.fake-adapter.test.ts:160` - `expect(await turn).toBe(stopReason)`; `:161` - `expect(modes(events).at(-1)).toBe(mode)`; `:162` - `turn_end` com o `stopReason` | PASS |
| C27 | a suíte e2e inteira verde no mesmo daemon; nada colide com localizador de outra spec | `pnpm exec playwright test` - **129 passed (7.6m), exit 0**, 39 de 39 specs, os 5 de `production` inclusive | `e2e/pull-request.spec.ts:90` e `e2e/right-panel.spec.ts:103`, `:125` - `getByRole("button", { name: "⟳ recarregar", exact: true })`; `e2e/plan-mode.spec.ts:37` - `reload: "plano-reler"`. O `fake-acp-agent.mjs` só ganhou linhas | PASS |
| C28 | cancelar o turno cancela o pedido; resposta depois → `NOT_FOUND` | vitest `-t "cancelar o turno cancela o pedido pendente"` ✓ | `AcpManager.fake-adapter.test.ts:201` - `expect(events.filter(… "permission_resolved")).toEqual([{ type: "permission_resolved", requestId: request.requestId, outcome: "cancelled", by: "user", reason: null }])`; `:211` - `expect(refused).toMatchObject({ code: "NOT_FOUND" })` | PASS |
| C29 | o agente sair cancela o pedido, antes do evento de saída | vitest `-t "o agente sair cancela o pedido pendente"` ✓ | `AcpManager.fake-adapter.test.ts:229` - `expect(events).toContainEqual(resolved)`; `:231` - `expect(order.indexOf("permission_resolved")).toBeLessThan(order.indexOf("exit"))`; `:233` - `storedTranscript(id)` contém `resolved` | PASS |
| C30 | navegador: cancelar com o plano pendente deixa "pedido cancelado", sem botões | playwright `plan-mode.spec.ts:155` ✓ | `e2e/plan-mode.spec.ts:162` - `card.getByText("pedido cancelado")).toBeVisible()`; `:164` - cada um dos quatro botões `toHaveCount(0)`; `:166` - `"o turno está parado aqui"` `toHaveCount(0)` | PASS |

**Sobre o nível do C27.** O `feature:check checks` avisa que a prova do C27 não nomeia seletor
(`checks.md:118`). Aqui o aviso não vira achado. O C27 afirma exatamente que a suíte inteira está
verde, e a parte *"nada colide"* é decidida pelos testes de `pull-request` e `right-panel`: eles só
passam se o localizador achar um botão só. Foi a suíte inteira, e não uma lista de specs, que achou o
defeito da rodada 2. A prova certa é esta.

## Coverage

Tudo recalculado em `ede982c`. A autoridade de cada conjunto é: o adaptador `0.75.1` para modos e
opções, o schema compartilhado para `content` e para a política, os pontos de chamada no daemon para
os produtores, e o disco (`e2e/*.spec.ts`) para as specs que dividem o daemon.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| valores de `mode` (6) | adaptador `dist/session-mode.js` (5 ids: `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`) + `""` do agente sem modos | `plan` C1 · `auto`, `default`, `acceptEdits`, `bypassPermissions`, `""` C3 (cinco instâncias `✓`) | - |
| transições da faixa (2) | reducer `case "config"` (`conversation-model.ts:405`) | entra C6 · sai C2, C6 | - |
| tipos de `content` no `tool_call` (4) | `acpToolContentSchema` (`packages/shared/src/acp-protocol.ts`), mais o ausente | `content` C7 · `diff` C8 · `terminal` C8 · ausente C9 | - |
| política do Lumem com `switch_mode` (3) | `lumemModeSchema` (`ask`, `auto`, `free`) | as três em C11 · `free` pelo daemon C12 | - |
| opções do pedido (4) | adaptador `dist/permissions/options/tools.js` (caso `auto` com plano) = `PLAN_OPTIONS` do agente falso | as quatro em C14 e C15 · Enter/Esc C16 · registro C17, C18. As variantes *bypass* e *accept edits* passam pelo mesmo caminho verbatim | - |
| desfechos do pedido (4) | `permission_resolved.outcome` × `kind` | `allow_always`, `allow_once` C17 · `reject_once` C18 · `cancelled` C19, C30 | - |
| produtores de `permission_resolved` `cancelled` (2) | `rg -n cancelPending AcpManager.ts`: definição `:1546`, chamadas `:1536` (`cancel`) e `:2477` (`markExited`), nada mais | turno cancelado C28, C30 · agente saiu C29 | - |
| estados do cartão (5) | `PlanApproval.tsx` (`recordOf`, `showPlan`) + reducer (`askWithdrawn`) | pendente C13 · sem texto C21 · recolhido C20 · expandido C20 · retirado C19, C30 | - |
| respostas do roteiro → modo (4) | `fake-acp-agent.mjs` + adaptador `effects.js:115` | as quatro em C26 | - |
| porta 1: `tool_call` leva `content` (2 lados) | `translate.ts:235-236`, reducer `content: event.content ?? []` | tradutor C7 · reducer C10 · daemon real C25 | - |
| porta 2: o transcript grava o `content` (2 caminhos) | `AcpManager.ts:2434` grava o evento do tradutor; `TranscriptStore.ts:269` o relê pelo `acpTranscriptEntrySchema` | ao vivo C22 · relido do disco C23 (`plan-mode.spec.ts:138-139`) | - |
| specs que dividem o daemon com a spec nova (39) | `ls e2e/*.spec.ts` = 39; specs com teste `✓` no log = 39 | todas em C27 | - |

Releitura do `Swept`:

- `idempotency: existing` confere. `respondToPermission` recusa com `NOT_FOUND` (`AcpManager.ts:1565`), e o `cancelPending` limpa o mapa (`:1551`), então a regra vale também depois do cancelamento.
- `concurrency: existing` confere. `conversation-model.ts:298-323` é o `case "permission_request"`, e o `mapTurns` descarta o bloco `permission` anterior.
- Cada linha que nomeia check (`validation`, `failure modes`, `authorization`, `data lifecycle`, `dependency failure`, `state transitions`) aponta para checks que passaram acima. `observability: n/a` é política aprovada.

O `Flow` e o `Impact` batem com o código. Nós do `Flow`:

- `translate.ts:235-236` leva o `content`;
- `decidePermission` é chamado em `AcpManager.ts:1949` e barra `switch_mode` antes de qualquer modo (`permission-policy.ts:52-57`);
- `Transcript.tsx` troca o `ToolCard` pelo `PlanApproval` e esconde o `PermissionRequest` desse `toolCallId`;
- o nó `CAN` é o `cancelPending` em `:1536` e `:2477`;
- o `Composer.tsx` põe o `PlanModeBanner` antes da `ComposerBox`.

No `Impact`, *"as outras 17 specs"* confere: 17 specs, fora a `plan-mode`, importam
`E2E_FAKE_ACP_AGENT`. As linhas que a PRD cita em `Problem` e `Flow` (`conversation.css:561`,
`conversation-model.ts:399-406`) são da base `e3894e4` e conferem lá. As duas portas do `Landing`
estão no código como a forma literal diz:

- `acp-protocol.ts:281` - `content: z.array(acpToolContentSchema).optional()`;
- o transcript grava o evento sem transformação.

## Test policy rows

O `checks.md` não tem seção `Test policy`. Ele remete à matriz de `docs/project/testing.md`, e o
`feature:check checks` registra isso como aviso (`checks.md:4`). Pela matriz, a camada de cada prova
está certa:

- o tradutor é testado por integração;
- a política, por unit;
- o reducer e o componente, em jsdom pelo `Transcript` de verdade;
- o daemon, com o agente falso por processo real e sem mock;
- a conversa, em e2e contra o daemon.

Não há linha de política para julgar.

## Faults injected

Tudo numa worktree descartável: `git worktree add --detach /tmp/v035/scratch HEAD`, depois
`pnpm install --offline --frozen-lockfile`. Antes de cada mutação seguinte, a anterior foi desfeita com
`git checkout -- .`. O porcelain da árvore real estava vazio antes e continuou vazio depois
(`diff` idêntico). A worktree foi removida com `git worktree remove --force`, e depois `git worktree prune`.

Uma falha por superfície de asserção, no teto de cinco. A primeira é a superfície que a correção desta
rodada tocou. As outras quatro são as superfícies de prova que não dividem asserção com ela: tradutor,
política, teclado do cartão e faixa. As superfícies do `cancelPending` e do `decode` do transcript não
mudaram desde `bd47aa2`, e a rodada 2 já as matou (C28, C29, C23).

| Mutation | Location | Killed |
| --- | --- | --- |
| apagar o par `modo plano / faixa do composer` | `packages/web/src/styles/contrast.ts:171` | yes - `mede pelo menos 126 pares` falhou: `expected 125 to be greater than or equal to 126` |
| o `tool_call` deixa de levar o `content` (`if (content !== undefined) event.content = content` vira `void content`) | `packages/server/src/acp/translate.ts:236` | yes - C7 falhou (`to deeply equal { type: 'tool_call', …(7) }`) e C8 falhou (`translate.test.ts:297`) |
| a guarda de `switch_mode` só vale fora de `ask` (`mode !== "ask" &&`) | `packages/server/src/acp/permission-policy.ts:55` | yes - C11 `(ask)` falhou; `(auto)` e `(free)` passaram, o que mostra que cada linha da tabela é independente |
| o primário do cartão passa a ser `request.options[0]`, e não a `allow_once` | `packages/web/src/features/conversation/PlanApproval.tsx:83` | yes - C16 falhou, e as outras 13 do arquivo passaram |
| a faixa ignora `readOnly` | `packages/web/src/features/conversation/PlanModeBanner.tsx:19` | yes - C4 falhou |

A sonda do C27 (worktree `plano-recarregar` de novo, localizadores exatos mantidos: 12 passed) está
descrita acima, na seção dos achados. Ela não é uma falha injetada: o que o C27 afirma continuou
verdadeiro nela.

## Gate

- `LUMEM_GATE_BASE=e3894e4 pnpm gate:quick`: 292 arquivos, **4869 passaram**, 6 pulados, exit 0. É a mesma contagem da rodada 2. A correção não acrescentou teste: mudou o piso (`122` → `126`) e três localizadores.
- `pnpm gate:build`: veio inteiro do cache (`7 cached, 7 total`), então forcei. `turbo typecheck --force` deu 4/4 com 0 em cache, e `turbo build --force` deu 7/7 com 0 em cache. Os dois saíram com exit 0.
- `pnpm lint` (`oxlint --type-aware --max-warnings 0`): exit 0. `pnpm docs:check`: `docs ok`, exit 0.
- `pnpm exec playwright test`, a suíte inteira: **129 passed (7.6m), 0 failed, exit 0**, com as 39 specs. Antes de rodar, conferi que não havia outro Playwright no ar. Nada rodou em paralelo com a suíte.
- `pnpm -s feature:check checks docs/features/035-plan-mode`: 0 erros e 2 avisos (sem `Test policy`, e a prova do C27 sem seletor). Os dois estão julgados acima.

## Documentação

- `docs/project/testing.md` tem as três armadilhas da feature, e elas conferem com o código:
  - *"um check sobre como a tela reage a um evento que ninguém produz"* (`bd47aa2`);
  - *"o nome de uma fixture casa por substring com o botão de outra spec"* (`730503f`). As linhas que ela cita (`pull-request.spec.ts:90`, `right-panel.spec.ts:103` e `:125`) são exatamente as do diff, e o nome exato `"⟳ recarregar"` (`ede982c`) é o que está no código;
  - *"um piso de contagem subido de um em um não protege o item novo"* (`730503f`). O piso é o tamanho real (126).
  - O `docs:check` confere a âncora da seção irmã.
- `docs/project/backlog.md`:
  - o item *"o `tool_call` que já chega com saída perde a saída"* está riscado, como resolvido pela porta 1;
  - o follow-up da rodada 2, *"pedido de permissão que sobrevive a um turno que o agente encerrou sozinho"*, entrou com o gatilho de volta.
- `docs/README.md` está atualizado (achado 3 da rodada 2). O `CLAUDE.md` tem a linha da `035` como `em execução`.
- **A cargo de quem segura a feature, depois deste PASS, fora do escopo do verificador:**
  - passar o `**Status:**` de `prd.md` e `checks.md` e a linha do `CLAUDE.md` para `completa`;
  - no `docs/README.md`, acrescentar a rodada 3 à descrição do `verification.md`, que hoje fala só das rodadas 1 e 2;
  - escrever o parágrafo da crônica no Outline.
- Passo 7 do verify: esta rodada não produziu mutante vivo, lacuna de precisão, check reprovado nem membro sem prova. Não há armadilha nova a registrar.

## Ranked gaps

Nenhuma lacuna que trave.

Nit, que não trava: o `permission_resolved` cancelado pela **saída** do agente sai assinado `by: "user"`
(`packages/server/src/acp/AcpManager.ts:1549`), quando ninguém decidiu nada. O schema não tem outro
valor para *"ninguém"*, e o reducer não lê o `by` num `cancelled`. Fica como escolha registrada no
`Handoff`.
