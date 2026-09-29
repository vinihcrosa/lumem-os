# 035 plan-mode — relatório do verificador

**Verdict**: FAIL
**Profile**: standard
**Diff range**: e3894e4..6ab6a4b
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Os 27 checks passam como escritos, e os 5 defeitos injetados morreram. O veredito é FAIL por
**três membros de cobertura sem prova**. O mais sério é o desfecho `cancelled`: o daemon **nunca**
emite o evento que o C19 prova, então o AC 16 não tem caminho real. No caminho real (turno
cancelado ou sessão encerrada com o plano pendente), o cartão continua com os quatro botões vivos,
e um clique grava *"plano aprovado — …"* sobre um pedido que o agente já abandonou.

## Binding sources

O perfil é `standard`, então o passo 1 não roda: o checks.md declara que não há desenho vinculante,
com base no ADR de 2026-09-20. Abri mesmo assim a fonte que a PRD cita em `Sources`: a cópia do
adaptador em `~/.lumem/adapters/claude/node_modules/@agentclientprotocol/claude-agent-acp`
(`package.json`: `"version": "0.75.1"`). O que ela decide bate com o agente falso e com o C25:
`buildExitPlanModePermissionOptions` em `dist/permissions/options/tools.js:42-102` e os
`optionId` em `dist/permissions/options/shared.js:7-13` são os quatro `optionId`/`kind`/`name` de
`e2e/support/fake-acp-agent.mjs:526-531`, com o `usage` instanciado em *"(32% used)"*. Não encontrei
contradição.

## Checks

Cada prova foi rodada no `HEAD` (`6ab6a4b`). No vitest, uma invocação sobre os sete arquivos com um
`-t` de alternância (saída verbose, cada nome aparece como `✓`): 35 instâncias passaram e nenhuma
falhou. No Playwright, uma invocação sobre `plan-mode`, `acp-conversation`, `session-mode` e
`happy-path`: 16 passaram.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | faixa `role=status`, texto exato, acima da caixa | vitest `-t "em plan mode a faixa aparece com o texto exato"` ✓ | `packages/web/src/features/conversation/PlanModeBanner.test.tsx:48` - `expect(banner).toHaveTextContent(new RegExp(`^${TEXT}$`))`; `:51` - `banner.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING` | PASS |
| C2 | `config` plan → auto some a faixa | vitest `-t "a faixa some quando o modo sai de plan"` ✓ | `PlanModeBanner.test.tsx:61` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` após `rerender(... reduceConversation(planning, config("auto")))` | PASS |
| C3 | auto/default/bypassPermissions/"" sem faixa | vitest `-t "fora de plan mode não há faixa"` ✓ ×4 | `PlanModeBanner.test.tsx:69` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` (it.each de 4) | PASS |
| C4 | `readOnly` + plan sem faixa | vitest `-t "conversa em leitura não mostra a faixa"` ✓ | `PlanModeBanner.test.tsx:76` - `expect(screen.queryByText(TEXT)).not.toBeInTheDocument()` | PASS |
| C5 | `PlanCard` diz Passos, não Plano | vitest `-t "o rótulo da lista é Passos"` ✓ | `packages/web/src/features/conversation/PlanCard.test.tsx:126` - `getByText("Passos")`; `:127` - `expect(head).not.toHaveTextContent(/Plano/)` | PASS |
| C6 | navegador: faixa aparece e some ao aprovar | playwright `-g "a faixa aparece em plan mode e some ao aprovar"` ✓ | `e2e/plan-mode.spec.ts:84` - `expect(conv.getByText(BANNER, { exact: true })).toBeVisible()`; `:89` - `.toHaveCount(0)` | PASS |
| C7 | `tool_call` leva `content` traduzido | vitest `-t "tool_call leva o content traduzido"` ✓ | `packages/server/src/acp/translate.test.ts:264` - `expect(event).toEqual({ ..., content: [{ type: "content", text: PLAN }] })` | PASS |
| C8 | diff e terminal como no update | vitest `-t "tool_call traduz diff e terminal como o update"` ✓ | `translate.test.ts:297` - `expect(call).toMatchObject({ type: "tool_call", content: expected })` | PASS |
| C9 | sem `content`, sem a chave | vitest `-t "tool_call sem content não inventa a chave"` ✓ | `translate.test.ts:308` - `expect("content" in (event as object)).toBe(false)` | PASS |
| C10 | reducer guarda e update substitui | vitest `-t "o content do tool_call fica, e o update o substitui"` ✓ | `packages/web/src/features/conversation/conversation-model.test.ts:256` - `toMatchObject({ kind: "tool", call: { content: [plan] } })`; `:260` - `call: { content: [replaced] }` | PASS |
| C11 | `switch_mode` nunca aprovado em ask/auto/free | vitest `-t "nenhum modo do Lumem aprova um plano"` ✓ ×3 | `packages/server/src/acp/permission-policy.test.ts:208` - `expect(decision).toEqual({ approve: false, reason: "aprovar um plano é decisão sua" })` | PASS |
| C12 | agente sem modos em free: pedido pendente, nenhum resolved | vitest `-t "liberado não aprova o plano"` ✓ | `packages/server/src/acp/AcpManager.fake-adapter.test.ts:173` - `expect(request.policyReason).toBe("aprovar um plano é decisão sua")`; `:174` - `events.some(... "permission_resolved")).toBe(false)`; `:168` - `toMatchObject({ mode: "", lumemMode: "free" })` | PASS |
| C13 | plano de 30 linhas inteiro, heading, sem `.perm` | vitest `-t "o plano pendente aparece inteiro e renderizado"` ✓ | `packages/web/src/features/conversation/PlanApproval.test.tsx:89` - `getByRole("heading", { name: "Separar o parser do loader" })`; `:91` - `getByText("passo 30")`; `:92` - `querySelector(".perm")).toBeNull()` | PASS |
| C14 | quatro opções verbatim, allow na ordem, reject depois de "ou continuar planejando" | vitest `-t "as opções aparecem verbatim e a recusa vem separada"` ✓ | `PlanApproval.test.tsx:103-104` - `button.compareDocumentPosition(next/keep) & DOCUMENT_POSITION_FOLLOWING`; `:106` - `keep.compareDocumentPosition(buttons[3]!)` | PASS |
| C15 | cada clique manda o seu `optionId` | vitest `-t "cada opção responde com o seu optionId"` ✓ ×4 | `PlanApproval.test.tsx:116` - `expect(answer).toHaveBeenCalledExactlyOnceWith("rq-plan", optionId)` | PASS |
| C16 | Enter → `exit-plan-default`, Esc → `reject` | vitest `-t "Enter aprova a allow_once e Esc recusa"` ✓ | `PlanApproval.test.tsx:123` - `toHaveBeenCalledExactlyOnceWith("rq-plan", "exit-plan-default")`; `:128` - `(..., "reject")` | PASS |
| C17 | aprovado vira registro com o `name` (3 opções) | vitest `-t "aprovar vira registro com o nome da opção"` ✓ ×3 | `PlanApproval.test.tsx:147` - `getByText(`plano aprovado — ${name}`)`; `:148` - `expect(button).toBeNull()` | PASS |
| C18 | reject vira "você pediu para continuar planejando" | vitest `-t "recusar vira registro de continuar planejando"` ✓ | `PlanApproval.test.tsx:154` - `getByText("você pediu para continuar planejando")`; `:155` - botões `toBeNull()` | PASS |
| C19 | `outcome: "cancelled"` vira "pedido cancelado" | vitest `-t "pedido cancelado vira registro"` ✓ | `PlanApproval.test.tsx:161` - `getByText("pedido cancelado")`; `:162` - botões `toBeNull()`. A afirmação, como está escrita, vale. O evento que ela supõe não tem produtor (ver Coverage) | PASS |
| C20 | registro recolhido, "ver o plano" expande | vitest `-t "o registro recolhe o plano e ver o plano o abre"` ✓ | `PlanApproval.test.tsx:168` - `queryByText("passo 30")).not.toBeInTheDocument()`; `:174` - `getByText("passo 30")` após o clique | PASS |
| C21 | sem texto: a frase, e as quatro opções | vitest `-t "sem texto do plano o cartão diz e mantém as opções"` ✓ | `PlanApproval.test.tsx:134` - `getByText("o agente não mandou o texto do plano")`; `:135` - `expect(button).toBeInTheDocument()` ×4 | PASS |
| C22 | navegador: plano inteiro e registro ao aprovar | playwright `-g "o plano inteiro aparece e aprovar deixa o registro"` ✓ | `e2e/plan-mode.spec.ts:97` - heading `FIRST_LINE` `toBeVisible()`; `:98` - `LAST_LINE` `toBeVisible()`; `:100` - group `"pedido de permissão"` `toHaveCount(0)` (o rótulo existe, `PermissionRequest.tsx:75`); `:104` - `"plano aprovado — Yes, and use auto mode"` | PASS |
| C23 | navegador: o registro sobrevive a recarregar | playwright `-g "o registro sobrevive a recarregar"` ✓ | `e2e/plan-mode.spec.ts:130` - `after.getByText("plano aprovado — Yes, and use auto mode")).toBeVisible()`; `:132` - botão `toHaveCount(0)` | PASS |
| C24 | navegador: No, keep planning, e a faixa fica | playwright `-g "recusar mantém o plan mode"` ✓ | `e2e/plan-mode.spec.ts:142` - `"você pediu para continuar planejando"`; `:144` - composer `not.toBeDisabled()`; `:145` - `BANNER` `toBeVisible()` | PASS |
| C25 | roteiro: ordem, título, >12 linhas no `tool_call`, quatro opções | vitest `-t "o roteiro de plan mode emite o pedido do adaptador"` ✓ | `AcpManager.fake-adapter.test.ts:133-134` - `expect(call).toBeGreaterThan(planMode)`, `expect(ask).toBeGreaterThan(call)`; `:139` - `.split("\n").length).toBeGreaterThan(12)`; `:142` - `expect(request.options).toEqual(PLAN_OPTIONS)` | PASS |
| C26 | resposta → modo e `stopReason` (4 linhas) | vitest `-t "cada resposta do roteiro leva ao modo do adaptador"` ✓ ×4 | `AcpManager.fake-adapter.test.ts:160` - `expect(await turn).toBe(stopReason)`; `:161` - `expect(modes(events).at(-1)).toBe(mode)` | PASS |
| C27 | specs que já usam o agente falso continuam verdes | a prova nomeia 3 specs (8+1+3 ✓). **O verificador rodou as 17** que importam `E2E_FAKE_ACP_AGENT` além da nova: 51 passaram, 0 falharam | `e2e/support/fake-acp-agent.mjs:1098` - o ramo `text.includes(PLAN_FIRST)` é o único acréscimo no despacho; `runTurn` não mudou (`git diff e3894e4..HEAD` só adiciona linhas) | PASS |

## Coverage

Recalculado a partir da autoridade de cada conjunto: o adaptador para modos e opções, o schema
compartilhado para `content`, os **produtores no daemon** para os desfechos.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| valores de `mode` fora de `plan` (6) | adaptador `dist/session-mode.js:192-218` (`default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`) + `""` do agente sem modos | `plan` C1 · `auto`, `default`, `bypassPermissions`, `""` C3 | `acceptEdits` — o adaptador o relata e nenhuma prova o passa. Risco baixo (`PlanModeBanner.tsx:19` é igualdade estrita), mas é um membro da autoridade que o checks.md não listou |
| transições da faixa (2) | reducer `config` | entra C6 · sai C2, C6 | - |
| tipos de `content` no `tool_call` (4) | `acpToolContentSchema`, `packages/shared/src/acp-protocol.ts:101-109` | `content` C7 · `diff` C8 · `terminal` C8 · ausente C9 | - |
| política do Lumem com `switch_mode` (3) | `LumemMode` | `ask`, `auto`, `free` C11 · `free` pelo daemon C12 | - |
| opções do pedido (4) | adaptador `tools.js:42-102` (caso `auto` + plano) | as quatro em C14, C15; Enter/Esc C16; registro C17, C18 | - |
| desfechos do pedido, por produtor (4) | produtores de `permission_resolved`: `AcpManager.ts:1553-1559` (`by: "user"`, sempre `{ optionId }`) e `AcpManager.ts:1961-1967` (`by: "lumem"`, sempre `{ optionId }`). **Nenhum emite `"cancelled"`**: `cancel()` em `AcpManager.ts:1529-1535` só notifica, e `markExited` em `AcpManager.ts:2459-2462` só resolve a promessa do agente | `allow_always`, `allow_once` C17 · `reject_once` C18 | `cancelled` — C19 prova a reação do web a um evento sem produtor. No caminho real (turno cancelado, sessão encerrada), o `turn_end` não limpa `pendingPermission` (`conversation-model.ts:438-450`): o cartão fica com os botões e *"o turno está parado aqui"*, e o daemon ainda aceita a resposta e grava `permission_resolved` `by: "user"`. Medido na worktree descartável (ver Observações) |
| estados do cartão (5) | `PlanApproval.tsx` + reducer | pendente C13 · sem texto C21 · recolhido C20 · expandido C20 · retirado C19 (só jsdom) | o estado real depois de um turno cancelado — pendente com o turno morto — não tem check, e é o que a tela mostra (mesmo membro da linha acima) |
| respostas do roteiro → modo (4) | `fake-acp-agent.mjs:534` `MODE_AFTER` + adaptador `effects.js` | as quatro em C26 | - |
| porta 1: `tool_call` leva `content` (2 lados) | `translate.ts:235-236`, `conversation-model.ts:274` | tradutor C7 · reducer C10 · daemon real C25 | - |
| porta 2: o transcript grava o `content` (2 caminhos) | `AcpManager.ts:2415-2417` (grava o evento do tradutor) e `TranscriptStore.ts:269` (`safeParse` no schema, que descarta chave desconhecida) | ao vivo C22 (`plan-mode.spec.ts:97-98`) | relido do disco — C23 (`plan-mode.spec.ts:129-132`) afirma só o texto do registro e a ausência de botão. O plano fica recolhido e ninguém clica em *"ver o plano"*, então o `content` relido do disco não é afirmado por prova nenhuma |

Varredura extra: o Swept `failure modes: C19 — o pedido cancelado no meio (turno cancelado, sessão
fechada)` nomeia dois membros, e os dois são exatamente o que a linha `desfechos` mostra sem
produtor. O Swept `idempotency: existing` vale como escrito: `respondToPermission` recusa um
`requestId` desconhecido com `NOT_FOUND` (`AcpManager.ts:1547-1549`). Mas o pedido de um turno
cancelado **não** é desconhecido, porque `cancel()` não o remove. Por isso a resposta depois do
cancelamento é aceita. O Swept `concurrency: existing` confere: `conversation-model.ts:308-313`
descarta o bloco anterior.

## Test policy rows

O checks.md não tem seção `Test policy`: ele remete à matriz de `docs/project/testing.md`. Pela
matriz, a camada de cada prova está certa: tradutor e política em unit/integration, o daemon com o
agente falso, o reducer e o componente em jsdom, e a conversa em e2e.

## Faults injected

Tudo numa worktree descartável, `git worktree add --detach /tmp/lumem-035-scratch HEAD`, com
`pnpm install --offline`. O porcelain da árvore real estava vazio antes e depois; a worktree foi
removida. Um defeito por superfície de asserção, cinco no total.

| Mutation | Location | Killed |
| --- | --- | --- |
| o `tool_call` perde o `content` (`void content` no lugar da atribuição) | `packages/server/src/acp/translate.ts:236` | yes - C7, C8 e C25 falharam |
| a guarda de `switch_mode` pula o `free` (`&& mode !== "free"`) | `packages/server/src/acp/permission-policy.ts:55` | yes - C11 (`free`) e C12 falharam |
| o reducer ignora o `content` do `tool_call` (`content: []`) | `packages/web/src/features/conversation/conversation-model.ts:274` | yes - C10, C13 e C20 falharam |
| Esc responde com a opção primária | `packages/web/src/features/conversation/PlanApproval.tsx:105` | yes - C16 falhou |
| todo botão responde com a opção primária | `packages/web/src/features/conversation/PlanApproval.tsx:119` | yes - C15 falhou (3 de 4 instâncias; a `allow_once` é a própria primária) |

Superfícies não mutadas, julgadas pela leitura da asserção: a faixa (C1–C4, igualdade de string com
`^…$`), o rótulo (C5), a ordem das opções (C14), os três registros (C17–C19, texto literal), o
cartão sem texto (C21) e o roteiro (C26, `toBe` sobre o modo e o `stopReason`).

## Observações sobre os pontos do construtor

1. **`cancelled` nunca é emitido.** É verdade, e o problema é maior do que o relato diz. O AC 16
   fica **sem caminho real**: é vácuo, porque a condição dele (*"IF chega `permission_resolved` com
   `cancelled`"*) nunca acontece. O que o AC 16 existia para cobrir, segundo o Swept, se comporta
   de outro jeito. Medi na worktree descartável, com o daemon real e o agente falso: prompt de plano
   → `cancel()` → o turno terminou com `cancelled` e a sequência
   `tool_call, permission_request, tool_call_update:cancelled, turn_end`, com **0**
   `permission_resolved`. Depois disso, `respondToPermission(id, requestId, "exit-plan-auto")` foi
   **aceito** e emitiu `{"type":"permission_resolved",...,"outcome":{"optionId":"exit-plan-auto"},"by":"user"}`.
   Um teste jsdom com a mesma sequência mostrou os botões *"Yes, and use auto mode"* e *"No, keep
   planning"* presentes, *"o turno está parado aqui"* presente e *"pedido cancelado"* ausente. O
   adaptador real também encerra o turno sozinho (cancelamento forçado,
   `claude-agent-acp/dist/acp-agent.js:733-770`), então o caminho real é o mesmo. O pedido que
   sobrevive ao cancelamento já existia na base e vale para o bloco genérico também. O que a `035`
   acrescenta é um check e uma linha de Swept que dizem que esse caso está coberto, e um cartão que
   passa a gravar *"plano aprovado — …"* nesse caso. **Isso decide o FAIL.** A menor correção
   segue o protocolo ACP: o daemon responde `cancelled` e emite
   `permission_resolved { outcome: "cancelled", by: "user" }` para cada pedido pendente em `cancel()`
   (ou no `turn_end` cancelado) e em `markExited`. A alternativa é reescrever o AC 16 e o Swept dizendo
   que o caso não é alcançável, e registrar o defeito em `docs/project/backlog.md`.
2. **`askWithdrawn` e os tetos.** Os dois tetos batem exatamente com o disco: `acp-protocol.ts` tem 751
   linhas e `conversation-model.ts` tem 762. O motivo está escrito em
   `scripts/package-boundaries.test.ts:213-216` e em `packages/web/src/architecture.test.ts:485-490`.
   Aceito. Duas notas. Primeira: pelo ponto 1, `askWithdrawn` hoje só é alcançável por um
   `permission_resolved` cujo `optionId` não está nas opções. `conversation-model.ts:366-369` trata
   `!chosen`, e isso inclui id desconhecido, que `respondToPermission` não valida. Nesse caso o cartão
   diria *"pedido cancelado"*, e o comentário em `conversation-model.ts:69-70` fala só de `cancelled`.
   Segunda: o campo é lido só pelo cartão do plano, mas é gravado em todo tool call.
3. **Par de contraste.** Confirmado: a base não tinha nenhum par sobre `bg/info-subtle`. O par
   nasceu em `packages/web/src/styles/contrast.ts:171` e passa em `tokens.test.ts:45`
   (*"aprova todo par declarado"*). A linha *"tom e contraste — existing"* do `Observable` na
   `prd.md` ficou falsa em relação ao que existia. O piso `CONTRAST_PAIRS.length >= 122`
   (`tokens.test.ts:66`) não subiu, então o par novo pode ser apagado sem nada falhar. Isso é nota,
   não FAIL.
4. **`LUMEM_FAKE_NO_MODES` sem `current_mode_update`.** Correto e necessário.
   `fake-acp-agent.mjs:546-550` só relata o modo com `reportsModes`. O C12 afirma o pré-requisito
   (`AcpManager.fake-adapter.test.ts:168`, `mode: ""`) e a razão da política (`:173`): se o agente
   fosse o dono do modo, `policyReason` seria `null` e o C12 falharia. A mutação 2 confirmou.
5. **Provas que já passavam antes.** Rodei o `PlanApproval.test.tsx` da HEAD contra o código da base,
   numa segunda worktree descartável. Passaram 3 de 14: o C15 com `exit-plan-clear-auto` e com
   `exit-plan-auto`, e o C16 inteiro. Todas passaram pelo `PermissionRequest` genérico. Na HEAD elas
   **decidem**, mas só junto com o C13: as buscas não estão escopadas ao cartão (`screen.getByRole`,
   não `within(card)`), e é o `.perm` ausente (`PlanApproval.test.tsx:92`) que garante que os botões e
   as teclas são do cartão. As mutações 4 e 5, que só mexem no cartão, foram mortas. Nota: escopar
   com `within(screen.getByRole("group", { name: "aprovar o plano" }))` tornaria cada prova
   autossuficiente.

**Flow, Impact e Landing contra o diff.** O `Flow` é verdadeiro:
`Transcript.tsx:209-212` troca o `ToolCard` pelo `PlanApproval` para `switch_mode`, `:215` some com o
bloco genérico, e `Composer.tsx:200` põe a faixa antes da `ComposerBox`. O `Impact` também, incluindo
as "outras 17 specs": 18 arquivos importam o agente falso, menos o novo. A porta 1 como escrita:
`acp-protocol.ts:281` tem `content: z.array(acpToolContentSchema).optional()`, e `translate.ts:235-236`
usa o mesmo `toolContent()` do update. A porta 2 como escrita: `AcpManager.ts:2415-2417` grava o
evento que saiu do tradutor, sem recomposição.

**Documentação.** `pnpm docs:check` saiu 0, e o índice `docs/README.md` e o `CLAUDE.md` ganharam a
`035`. O que falta:
- a `prd.md`, linha `Observable` *"tom e contraste"* (o par era novo, não `existing`), e o AC 16 ou o
  Swept, conforme a decisão sobre o ponto 1;
- `docs/project/backlog.md`, se o ponto 1 não for corrigido agora: o pedido de permissão sobrevive ao
  turno cancelado e aceita resposta. A busca por "cancel" + "permiss/pedido/pendente" no backlog não
  achou nada;
- `docs/project/testing.md` § *Armadilhas já corrigidas*, pelo passo 7 do verify, que não cabe a mim
  escrever: *"um check que prova a reação do web a um evento, sem prova de que algum produtor o
  emite, fica verde para um caso inalcançável; o check de desfecho nomeia o produtor"*.

O `testing.md` tem um byte NUL, e por isso o `grep` o trata como binário. Isso já estava na base
(`git show e3894e4:docs/project/testing.md`) e o diff não o toca.

## Gate

- `LUMEM_GATE_BASE=e3894e4 pnpm gate:quick`: 292 arquivos, 4866 testes passaram e 6 foram pulados.
  Nenhum `.skip`, `.todo` ou `.only` é novo no diff.
- `pnpm gate:build`: veio inteiro do cache, então forcei `turbo typecheck --force` (4/4, 0 em cache)
  e `turbo build --force` (7/7, 0 em cache). Os dois saíram 0.
- `pnpm lint` e `pnpm docs:check`: os dois saíram 0.
- Playwright: 16 testes de `plan-mode`, `acp-conversation`, `session-mode` e `happy-path`, mais 51
  testes das 17 specs pré-existentes do agente falso. Todos passaram, 0 falharam.
