# O plano do plan mode — checks

**Status:** em execução
Profile: standard
Plan: `docs/features/035-plan-mode/prd.md`

30 checks em 4 fatias · 2 portas de mão única · 0 perguntas abertas

`standard` e não `ui`: não há desenho vinculante — o desenho mora no código
([ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md)) e o gate de tokens e
contraste já roda na suíte. Sem `Test policy`: a
[matriz de cobertura](../../project/testing.md#matriz-de-cobertura) já responde qual camada prova o
tradutor (integration), a política (unit), o reducer e o componente (jsdom) e a conversa ACP (e2e
contra o agente falso).

## Checks

Os comandos rodam da raiz. `vitest` é `pnpm exec vitest run <arquivo> -t "<nome>"`; o e2e é
`pnpm exec playwright test <spec> -g "<nome>"`. Os arquivos de teste que ainda não existem nascem com
estes nomes.

### S1 - a faixa de plan mode · 5 files · 64 KB · ~16k

**C1** - ✓ Com `mode: "plan"` e conversa viva, o composer mostra uma faixa `role="status"` com o texto exato *"modo plano — o agente não altera arquivos até você aprovar o plano"*, acima da caixa de texto (AC 1)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanModeBanner.test.tsx -t "em plan mode a faixa aparece com o texto exato"`

**C2** - ✓ Um evento `config` que troca `mode` de `"plan"` para `"auto"` faz a faixa sumir na renderização seguinte (AC 2)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanModeBanner.test.tsx -t "a faixa some quando o modo sai de plan"`

**C3** - ✓ Com `mode` em `"auto"`, `"default"`, `"acceptEdits"`, `"bypassPermissions"` e `""`, a faixa não aparece — uma asserção por valor (AC 3)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanModeBanner.test.tsx -t "fora de plan mode não há faixa"`

**C4** - ✓ Com `readOnly` e `mode: "plan"`, a faixa não aparece (AC 4)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanModeBanner.test.tsx -t "conversa em leitura não mostra a faixa"`

**C5** - ✓ O `PlanCard` mostra *"Passos"* e não mostra *"Plano"* no cabeçalho (AC 5)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanCard.test.tsx -t "o rótulo da lista é Passos"`

**C6** - ✓ No navegador, o prompt do roteiro faz a faixa aparecer, e aprovar com *"Yes, and use auto mode"* a faz sumir (AC 1, AC 2)
Proof: `pnpm exec playwright test e2e/plan-mode.spec.ts -g "a faixa aparece em plan mode e some ao aprovar"`

### S2 - o plano chega inteiro ao web · 6 files · 110 KB · ~28k

**C7** - ✓ Um `session/update` `tool_call` com `content: [{type:"content", content:{type:"text", text}}]` vira o evento `tool_call` com `content: [{type:"content", text}]` (AC 6)
Proof: `pnpm exec vitest run packages/server/src/acp/translate.test.ts -t "tool_call leva o content traduzido"`

**C8** - ✓ Um `tool_call` com `content` de `diff` e de `terminal` é traduzido item por item, igual ao `tool_call_update` (AC 6)
Proof: `pnpm exec vitest run packages/server/src/acp/translate.test.ts -t "tool_call traduz diff e terminal como o update"`

**C9** - ✓ Um `tool_call` sem `content` vira um evento sem a chave `content` (`"content" in event === false`) (AC 7)
Proof: `pnpm exec vitest run packages/server/src/acp/translate.test.ts -t "tool_call sem content não inventa a chave"`

**C10** - ✓ O reducer guarda o `content` de um `tool_call` no `ToolCallView`, e um `tool_call_update` com `content` depois o substitui (AC 8)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/conversation-model.test.ts -t "o content do tool_call fica, e o update o substitui"`

**C11** - ✓ `decidePermission` devolve `approve: false` para `kind: "switch_mode"` com opção `allow_once`, em `ask`, `auto` e `free` — tabela de 3 linhas —, com `reason` *"aprovar um plano é decisão sua"* (AC 9)
Proof: `pnpm exec vitest run packages/server/src/acp/permission-policy.test.ts -t "nenhum modo do Lumem aprova um plano"`

**C12** - ✓ Num agente sem modos em `free`, um `session/request_permission` de tool call `switch_mode` emite `permission_request` com aquele `policyReason` e **nenhum** `permission_resolved` (AC 9)
Proof: `pnpm exec vitest run packages/server/src/acp/AcpManager.fake-adapter.test.ts -t "liberado não aprova o plano"`

### S3 - aprovar ou recusar com o plano inteiro na tela · 7 files · 120 KB · ~30k

**C13** - ✓ Com permissão pendente para um tool call `switch_mode` cujo `content` tem 30 linhas de markdown, o transcript mostra o cartão de aprovação com a linha 1 e a linha 30 visíveis, o `# título` renderizado como heading, e nenhum bloco genérico de permissão (`.perm`) (AC 10)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "o plano pendente aparece inteiro e renderizado"`

**C14** - ✓ O cartão pendente mostra as quatro opções do adaptador com o `name` verbatim, as três `allow_*` na ordem recebida e a `reject_once` depois delas, sob *"ou continuar planejando"* (AC 11)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "as opções aparecem verbatim e a recusa vem separada"`

**C15** - ✓ Clicar em cada uma das quatro opções chama a resposta com o `optionId` dela — uma asserção por opção (AC 12)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "cada opção responde com o seu optionId"`

**C16** - ✓ No cartão pendente, Enter responde `exit-plan-default` (a `allow_once`) e Esc responde `reject` (AC 13)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "Enter aprova a allow_once e Esc recusa"`

**C17** - ✓ `permission_resolved` com `exit-plan-auto` deixa o cartão sem botões e com *"plano aprovado — Yes, and use auto mode"*; o mesmo com `exit-plan-clear-auto` (`allow_always`) e `exit-plan-default` (`allow_once`) mostra o `name` de cada um (AC 14)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "aprovar vira registro com o nome da opção"`

**C18** - ✓ `permission_resolved` com `reject` deixa o cartão sem botões e com *"você pediu para continuar planejando"* (AC 15)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "recusar vira registro de continuar planejando"`

**C19** - ✓ `permission_resolved` com `outcome: "cancelled"` deixa o cartão sem botões e com *"pedido cancelado"* (AC 16)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "pedido cancelado vira registro"`

**C20** - ✓ No registro, o plano começa recolhido (a linha 30 não está no documento) e o botão *"ver o plano"* o expande inteiro (a linha 30 aparece) (AC 17)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "o registro recolhe o plano e ver o plano o abre"`

**C21** - ✓ Um tool call `switch_mode` sem `content` de texto mostra *"o agente não mandou o texto do plano"*, e as quatro opções continuam lá (AC 18)
Proof: `pnpm exec vitest run packages/web/src/features/conversation/PlanApproval.test.tsx -t "sem texto do plano o cartão diz e mantém as opções"`

**C22** - ✓ No navegador, o plano do roteiro aparece inteiro — a primeira e a última linha visíveis — e aprovar com *"Yes, and use auto mode"* deixa *"plano aprovado — Yes, and use auto mode"* (AC 10, AC 14)
Proof: `pnpm exec playwright test e2e/plan-mode.spec.ts -g "o plano inteiro aparece e aprovar deixa o registro"`

**C23** - ✓ No navegador, recarregar a página depois de aprovar mostra o mesmo registro, lido do transcript em disco, e *"ver o plano"* abre o plano com a primeira e a última linha visíveis (AC 19)
Proof: `pnpm exec playwright test e2e/plan-mode.spec.ts -g "o registro sobrevive a recarregar"`

**C24** - ✓ No navegador, *"No, keep planning"* deixa *"você pediu para continuar planejando"*, e a faixa de plan mode continua (AC 15, AC 22)
Proof: `pnpm exec playwright test e2e/plan-mode.spec.ts -g "recusar mantém o plan mode"`

**C28** - ✓ Cancelar o turno com o pedido do plano pendente emite `permission_resolved` `{outcome: "cancelled"}` para esse `requestId`, e um `respondToPermission` depois é recusado com `NOT_FOUND` (AC 24)
Proof: `pnpm exec vitest run packages/server/src/acp/AcpManager.fake-adapter.test.ts -t "cancelar o turno cancela o pedido pendente"`

**C29** - ✓ O agente sair com um pedido pendente emite `permission_resolved` `{outcome: "cancelled"}` para esse `requestId` antes do evento de saída (AC 25)
Proof: `pnpm exec vitest run packages/server/src/acp/AcpManager.fake-adapter.test.ts -t "o agente sair cancela o pedido pendente"`

**C30** - ✓ No navegador, cancelar o turno com o plano pendente deixa *"pedido cancelado"* no cartão, sem botões (AC 16, AC 24)
Proof: `pnpm exec playwright test e2e/plan-mode.spec.ts -g "cancelar com o plano pendente deixa pedido cancelado"`

### S4 - o roteiro de plan mode no agente falso · 2 files · 45 KB · ~11k

**C25** - ✓ Um prompt com *"planeje antes"* faz o agente falso emitir, nesta ordem: `current_mode_update` `plan`, `tool_call` `kind: "switch_mode"` título *"Approve Plan"* com `content` markdown de mais de 12 linhas no próprio `tool_call`, e `session/request_permission` com as quatro opções `exit-plan-clear-auto`/`allow_always`, `exit-plan-auto`/`allow_always`, `exit-plan-default`/`allow_once`, `reject`/`reject_once`, com os `name` do adaptador `0.75.1` (AC 20)
Proof: `pnpm exec vitest run packages/server/src/acp/AcpManager.fake-adapter.test.ts -t "o roteiro de plan mode emite o pedido do adaptador"`

**C26** - ✓ Responder `exit-plan-auto` e `exit-plan-clear-auto` leva a `current_mode_update` `auto`, `exit-plan-default` a `default`, e os três terminam com `end_turn`; responder `reject` mantém `plan` e termina com `cancelled` — tabela de 4 linhas (AC 21, AC 22)
Proof: `pnpm exec vitest run packages/server/src/acp/AcpManager.fake-adapter.test.ts -t "cada resposta do roteiro leva ao modo do adaptador"`

**C27** - A suíte e2e inteira continua verde com a spec nova no mesmo daemon — o turno padrão não mudou, e nada que a spec nova cria (worktree, sessão) colide com o localizador de outra spec (AC 23)
Proof: `pnpm exec playwright test`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| valores de `mode` na faixa (6) | `plan` C1 · `auto` C3 · `default` C3 · `acceptEdits` C3 · `bypassPermissions` C3 · `""` C3 | - |
| transições da faixa (2) | entra em `plan` C6 · sai de `plan` C2 | - |
| tipos de `content` no `tool_call` (4) | `content` C7 · `diff` C8 · `terminal` C8 · ausente C9 | - |
| valores da política do Lumem com `switch_mode` (3) | `ask` C11 · `auto` C11 · `free` C11, C12 | - |
| opções do pedido de plano (4) | `exit-plan-clear-auto` C14, C15, C17 · `exit-plan-auto` C14, C15, C17 · `exit-plan-default` C14, C15, C16, C17 · `reject` C14, C15, C16, C18 | - |
| desfechos do pedido (4) | `allow_always` C17 · `allow_once` C17 · `reject_once` C18 · `cancelled` C19, C30 | - |
| produtores de `permission_resolved` `cancelled` (2) | turno cancelado C28, C30 · agente saiu C29 | - |
| estados do cartão (4) | pendente C13 · pendente sem texto C21 · registro recolhido C20 · registro expandido C20 | - |
| respostas do roteiro -> modo (4) | `exit-plan-clear-auto` C26 · `exit-plan-auto` C26 · `exit-plan-default` C26 · `reject` C26 | - |
| porta 1: `tool_call` leva `content` (2 lados) | tradutor C7 · reducer C10 | - |
| porta 2: o transcript grava o `content` (2 caminhos) | ao vivo C22 · relido do disco C23 (o plano aberto depois do reload) | - |

- Afirmações sobre o que atravessa o WebSocket: C12, C22, C23, C24, C28, C29, C30 — cada uma tem prova que cruza o daemon real
- Nenhum outro check afirma mais do que o caso que a sua prova exercita

## Swept

- validation: C21 — o `content` sem texto é o único valor fora do esperado que chega ao cartão; o `optionId` desconhecido cai no bloco que existe (`PermissionRequest`)
- failure modes: C28, C29, C30 — o pedido cancelado no meio (turno cancelado, agente saiu) é o único desfecho sem escolha, e o daemon é quem o produz; C19 é o cartão reagindo a ele
- idempotency: existing - um segundo `permission_response` para o mesmo `requestId` é recusado com `NOT_FOUND` em `AcpManager.respondToPermission`, e o cartão perde os botões no primeiro `permission_resolved` (C17–C19)
- authorization: C11, C12 — a única autoridade nova é a de **não** aprovar; o daemon ainda não tem autenticação (`019`, proposta)
- concurrency: existing - um pedido de permissão pendente por sessão; o reducer já descarta o bloco anterior em `permission_request` (`conversation-model.ts:298-323`)
- data lifecycle: C23 — o registro depende do transcript append-only; transcripts antigos sem `content` no `tool_call` continuam legíveis (C9 é o formato deles)
- dependency failure: C21 — o adaptador que não manda o plano; o adaptador que não manda o pedido não chega ao cartão
- state transitions: C2, C6, C26 — `plan` -> `auto`/`default` ao aprovar, `plan` fica ao recusar
- observability: n/a - nenhuma exigência de log; o transcript já registra o pedido e o veredito, e o `daemon.log` já registra falha de procedimento

## Handoff

- S1 = 16k, S2 = 28k (44k), S3 = 30k (74k), S4 = 11k (85k), todos em `conversation/`, `acp/` e `e2e/` — abaixo do orçamento de 150k: um construtor
- Boundary: `8d6a7b7` — S1–S4 inteiras num construtor só, C1–C27 fechados, cada prova rodada pelo nome e verde; `lint` e `gate:quick` verdes nessa árvore
- Settled mid-build: nada foi levado ao dono. Decidido na construção, e visível no diff: a marca de concluído vai depois do traço (`**C7** - ✓`), porque o `feature:check` recusa `**C7** ✓ -`; o roteiro de plan mode não manda `current_mode_update` sob `LUMEM_FAKE_NO_MODES` — um modo relatado daria o seletor ao agente e a política do Lumem (C12) deixaria de valer; o pedido retirado vira `askWithdrawn` no `ToolCallView`; a faixa ganhou o par de contraste `mode/plan` sobre `bg/info-subtle`, que o gate não tinha; os tetos de `acp-protocol.ts` (749 → 751) e `conversation-model.ts` (750 → 762) subiram com motivo
- Abandoned: nada
- Boundary (rodada 2): `45c5b7d` — F1 a F4 e o nit do `within(card)` fechados; C3, C23, C28, C29 e C30 com prova verde pelo nome, os 30 checks marcados; `lint`, `gate:quick`, `plan-mode.spec.ts` (5) e as três specs do C27 (12) verdes nessa árvore
- Settled mid-build (rodada 2): o `permission_resolved` cancelado sai assinado `by: "user"` e `reason: null`, o padrão do schema, nos dois produtores; um só `cancelPending` serve o `cancel()` (depois do `session/cancel`, como o ACP ordena) e o `markExited` (antes do `listeners.clear()` e dos `exitWatchers`); nenhum teste existente dependia do pedido sobreviver ao cancelamento — `packages/server` e `scripts` inteiros verdes; o C16 ganhou a confirmação de que o foco está no botão do cartão; o teto de `AcpManager.ts` subiu de 2818 para 2833, com motivo
- Abandoned (rodada 2): nada
