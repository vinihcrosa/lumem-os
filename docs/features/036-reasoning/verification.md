# O pensamento volta a chegar — verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: e3894e4..917cfb5
**Round**: 3 - full (verified at 917cfb5; o que vem de rodada anterior diz de onde)
**Verifier**: independent sub-agent (author != verifier)

Os dezoito checks estão provados no `HEAD` (`917cfb5`), cada um com a asserção localizada. O defeito que
reprovou a segunda rodada está corrigido:

- o script do C7 agora exige pelo menos um modelo (`scripts/measure-thinking.ts:160`). Contra um agente
  falso local que não anuncia a opção `model`, ele sai 1. Sem a guarda nova, a mesma corrida sai 0;
- a guarda da primeira rodada continua viva: `refusal` e `max_tokens` fazem sair 1.

A corrida paga desta rodada saiu 0: 177 caracteres de pensamento no modelo padrão, `end_turn` nos cinco
modelos, e tokens de saída com e sem o pedido. As cinco falhas injetadas morreram, e a árvore real
terminou só com este arquivo não rastreado.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma — o plano não marca fonte binding; o passo 1 é do perfil `ui`, e este é `standard` | n/a | none | - |

## Checks

Verified at `917cfb5`. As provas rodaram no `HEAD`, uma invocação por pacote, com `--reporter=verbose`
e `-t` com alternação. Cada teste nomeado aparece na saída individualmente, com `✓`:

- server: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts src/sessions/SessionStore.test.ts -t "<C1|C2|C3|C4|C6>"` → `Test Files 2 passed (2)`, `Tests 5 passed | 190 skipped (195)`, exit 0
- shared: `pnpm --filter @lumem/shared exec vitest run src/adapters.test.ts -t "declares the reasoningMeta each adapter needs"` → `Tests 1 passed | 24 skipped (25)`, exit 0
- web: `pnpm --filter @lumem/web exec vitest run src/features/conversation/{conversation-model.test.ts,Message.test.tsx,Transcript.test.tsx,conversation-css.test.ts} -t "<C8…C18|empty state>"` → `Test Files 4 passed (4)`, `Tests 12 passed | 85 skipped (97)`, exit 0 (os 11 de C8–C18 mais o *empty state* do `Observable`)
- C7: `pnpm measure:thinking` → exit 0. Rodei **uma vez**, como autorizado.

Os nomes foram localizados com `rg -n` antes de rodar: `AcpManager.test.ts:2695/2703/2710/2718`,
`SessionStore.test.ts:1643`, `adapters.test.ts:244`, `conversation-model.test.ts:89`,
`Message.test.tsx:104/117/124/131/146`, `Transcript.test.tsx:36/44/55/76/90` e
`conversation-css.test.ts:189`. Todos nascem ou mudam no diff `e3894e4..HEAD`, e o `Transcript.test.tsx`
é arquivo novo.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `session/new` leva `_meta` = `reasoningMeta`, igualdade profunda | server, `✓ sends the spec's reasoningMeta on session/new` | `packages/server/src/acp/AcpManager.test.ts:2700` — `expect((created[0] as { _meta: unknown })._meta).toEqual(SUMMARIZED)` | PASS |
| C2 | `session/load` leva o mesmo `_meta` | server, `✓ sends the spec's reasoningMeta on session/load` | `packages/server/src/acp/AcpManager.test.ts:2707` — `expect((loaded[0] as { _meta?: unknown })._meta).toEqual(SUMMARIZED)` | PASS |
| C3 | `codex` (meta `null`): sem chave `_meta` no new e no load | server, `✓ sends no _meta when the spec declares no reasoningMeta` | `packages/server/src/acp/AcpManager.test.ts:2714-2715` — `expect(created).not.toHaveProperty("_meta")`; `expect(loaded).not.toHaveProperty("_meta")` | PASS |
| C4 | sem `adapterId`: sem chave `_meta` no new e no load | server, `✓ sends no _meta without an adapterId` | `packages/server/src/acp/AcpManager.test.ts:2722-2723` — as mesmas duas asserções, com `opened(undefined)` e `resumed(undefined)` | PASS |
| C5 | literal do Claude, e `null` no Codex | shared, `✓ declares the reasoningMeta each adapter needs` | `packages/shared/src/adapters.test.ts:247-249` — `toEqual({ claudeCode: { options: { thinking: { type: "adaptive", display: "summarized" } } } })`; `:250` — `expect(CODEX_ADAPTER.reasoningMeta).toBeNull()` | PASS |
| C6 | `SessionStore` com config do catálogo manda o meta ao abrir e ao retomar | server, `✓ asks the catalogued adapter for its reasoning on open and on resume` | `packages/server/src/sessions/SessionStore.test.ts:1658` — `expect((created[0] as { _meta?: unknown })._meta).toEqual(summarized)`; `:1660` — o mesmo sobre `loaded[0]` | PASS |
| C7 | turno real: `thought` com texto no padrão; `end_turn` em cada modelo; sai 0 só se as duas valem; imprime tokens de saída com e sem pedido | `pnpm measure:thinking` exit 0 — `C7 · pensamento no modelo padrão: sim (177 caracteres)`, `C7 · end_turn em todos os 5 modelos: sim` | `scripts/measure-thinking.ts:152` — `const thinks = withMeta!.thoughtChars > 0`; `:154` — `run.stopReason !== "end_turn"` ou `run.error !== null`, só nos turnos com `run.asked`; `:160` — `return thinks && models.length > 0 && refused.length === 0 ? 0 : 1`; `:64` e `:124` — `usage` lido da resposta do `session/prompt` | PASS |
| C8 | três `thought` em `at` 1 000 / 5 000 / 13 300 → `startedAt` 1 000, `endedAt` 13 300 | web, `✓ keeps the at of the first and the last chunk of a thought` | `packages/web/src/features/conversation/conversation-model.test.ts:98-100` — `toEqual([{ kind: "thought", messageId: "t-1", text: "primeiro meio fim", startedAt: 1_000, endedAt: 13_300 }])` | PASS |
| C9 | rótulo `pensou por 12,3 s` | web, `✓ says how long it thought` | `packages/web/src/features/conversation/Message.test.tsx:121` — `toHaveTextContent("pensou por 12,3 s")` | PASS |
| C10 | rótulo exatamente `pensou` com `startedAt = endedAt` | web, `✓ says only that it thought when it has no duration` | `packages/web/src/features/conversation/Message.test.tsx:128` — `expect(screen.getByRole("button").textContent?.replace(/[▸▾]/, "")).toBe("pensou")` | PASS |
| C11 | em stream, sem clique: `aria-expanded="true"` e `.thought__text` à vista | web, `✓ opens a thought while it streams` | `packages/web/src/features/conversation/Transcript.test.tsx:40` — `toHaveAttribute("aria-expanded", "true")`; `:41` — `querySelector(".thought__text")).not.toBeNull()` | PASS |
| C12 | um bloco chega depois, sem clique: `aria-expanded="false"`, sem `.thought__text` | web, `✓ closes a thought when it stops streaming` | `packages/web/src/features/conversation/Transcript.test.tsx:51` — `toHaveAttribute("aria-expanded", "false")`; `:52` — `querySelector(".thought__text")).toBeNull()` | PASS |
| C13 | fechado por clique durante o stream fica fechado; aberto por clique depois de acabar fica aberto | web, `✓ keeps the state a click chose` | `packages/web/src/features/conversation/Transcript.test.tsx:64` — `"aria-expanded", "false"` depois do rerender com a resposta; `:73` — `"aria-expanded", "true"` depois do rerender com a ferramenta | PASS |
| C14 | dois pensamentos com o mesmo `messageId`, separados por ferramenta: clicar no primeiro deixa o segundo fechado | web, `✓ toggles one thought without the other` | `packages/web/src/features/conversation/Transcript.test.tsx:86` — `thoughts()[0]` `"true"`; `:87` — `thoughts()[1]` `"false"` | PASS |
| C15 | `thought--live` só com `streaming` | web, `✓ marks the label live only while streaming` | `packages/web/src/features/conversation/Message.test.tsx:134` — `toHaveClass("thought--live")`; `:137` — `not.toHaveClass("thought--live")` | PASS |
| C16 | `.thought--live` com `animation`; `animation: none` sob `prefers-reduced-motion: reduce` | web, `✓ animates the live thought and stops under reduced motion` | `packages/web/src/features/conversation/conversation-css.test.ts:195` — `/\banimation\s*:\s*(?!none\b)[^;]+/`; `:200` — `toMatch(/\.thought--live\s*\{[^}]*\banimation\s*:\s*none\b/)` | PASS |
| C17 | replay: todos com `aria-expanded="false"` e o rótulo que o redutor ao vivo produziu | web, `✓ replays thoughts collapsed with their duration` | `packages/web/src/features/conversation/Transcript.test.tsx:113` — `toEqual(["false", "false"])`; `:114` — `toEqual(liveLabels)`; `:115-116` — `"pensou por 2,4 s"` e `"pensou por 12,2 s"` | PASS |
| C18 | em stream, `pensando…` com ou sem duração | web, `✓ says it is thinking while it still is` | `packages/web/src/features/conversation/Message.test.tsx:109` — `toHaveTextContent("pensando…")`; `:113-114` — o mesmo, e `not.toHaveTextContent("pensou")`, com `elapsedMs={12_300}` | PASS |

A saída do C7 nesta rodada (2026-09-29, `claude-agent-acp@0.75.1` em
`~/.lumem-dev/shared/adapters/claude/`; o `package.json` instalado diz `"version": "0.75.1"`, igual a
`CLAUDE_ADAPTER.pinnedVersion`, `packages/shared/src/adapters.ts:208`):

| model | asked | thoughtChars | stopReason | outputTokens | cachedWriteTokens | error |
| --- | --- | --- | --- | --- | --- | --- |
| `opus[1m] (padrão)` | true | 177 | `end_turn` | 156 | 26 340 | null |
| `opus[1m] (padrão)` | false | 0 | `end_turn` | 115 | 24 303 | null |
| `default` | true | 206 | `end_turn` | 172 | 24 303 | null |
| `opus[1m]` | true | 269 | `end_turn` | 174 | 24 303 | null |
| `claude-fable-5-1[1m]` | true | 277 | `end_turn` | 176 | 27 696 | null |
| `sonnet` | true | 248 | `end_turn` | 229 | 29 268 | null |
| `haiku` | true | 1 312 | `end_turn` | 861 | 16 905 | null |

A leitura do script, contra o que o C7 afirma:

- **Sai 0 só com pensamento no padrão e `end_turn` em cada modelo.** Para sair 0, o script agora exige
  três coisas: pensamento no padrão, pelo menos um modelo (`:160`) e nenhum `stopReason` diferente de
  `end_turn` nem erro nos turnos com pedido (`:154`). As duas guardas foram exercidas pelas falhas 1 e 2.
- **Tokens de saída com e sem o pedido.** As linhas `asked: true` e `asked: false` da corrida têm
  `outputTokens` preenchido.
  - O valor vem do `usage` da resposta do `session/prompt` (`:64`).
  - O `917cfb5` passou a esperar até 1 s pelo leitor paralelo antes de ler (`:119-121`). Isso fecha o nit
    de corrida que a segunda rodada registrou.
- **O turno sem pedido reproduz a LUM-66.** Ele sobe sem `adapterId` (`:95`), e o C4 prova que isso
  manda o `session/new` sem `_meta`. O turno teve 0 caracteres de pensamento.

Nível e amostragem:

- C1–C4 ficam na camada do `AcpManager`, com o agente falso em processo.
- O C6 atravessa o `SessionStore`: a configuração do catálogo, o banco e as duas rotas (`start` e
  `resume`).
- C8–C18 ficam em jsdom. O C16 lê o CSS como texto, e o teste diz por quê
  (`conversation-css.test.ts:190-192`).
- O C17 compara o rótulo do replay com o rótulo **renderizado ao vivo**, e crava os dois valores. A
  comparação não é tautológica.
- O C7 é a única prova que atravessa o adaptador de verdade, e percorre todos os modelos que ele
  oferece. A amostragem cobre a afirmação.

## Coverage

Recomputado agora, no `917cfb5`. Quando a autoridade do conjunto é o adaptador, recomputado a partir
dele; nos outros casos, a partir do código.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| pedidos que levam o `_meta` (2) | `packages/server/src/acp/AcpManager.ts:2189` (`session/new`) e `:2238` (`session/load`). O `probe` não faz turno e fica sem `_meta`, como o Impact declara | new C1 · load C2 | - |
| o que a sessão sabe do adaptador (3) | `AcpManager.ts:1229` (`spec?.reasoningMeta ?? null`) e `:2825` (`metaOf`): spec com meta, spec com `null`, spec ausente | meta C1/C2 · `null` C3 · ausente C4 | - |
| specs em `ADAPTERS` (2) | `packages/shared/src/adapters.ts:323` — `[CLAUDE_ADAPTER, CODEX_ADAPTER]` | `claude` C5 (`:271`) · `codex` C5 (`:320`) | - |
| lugares da conversa que dão o `adapterId` ao `AcpManager` (2) | `packages/server/src/sessions/SessionStore.ts:279-283` (`launchIdentity`, usado por `start` e `resume`). `memory/capture.ts` e `memory/auto-learn.ts` estão no `Out of scope` | abrir C6 · retomar C6 | - |
| modelos que o `session/new` do Claude oferece (5) | o adaptador, lido pelo script em tempo de execução nesta corrida: `default`, `opus[1m]`, `claude-fable-5-1[1m]`, `sonnet`, `haiku`. É o mesmo conjunto que o `checks.md` lista | cada um com `end_turn` observado (C7) | - |
| rótulo do pensamento (3) | `packages/web/src/features/conversation/Message.tsx:83`, três ramos | `pensando…` C18 · com duração C9 · sem duração C10 | - |
| aberto ou fechado (4) | `packages/web/src/features/conversation/Transcript.tsx:105` (`thoughtChoices.get(position) ?? streaming`), com a posição `turno:bloco` em `:104` | stream sem clique C11 · terminado sem clique C12 · clique fecha C13 · clique abre C13 | - |
| classe `thought--live` (2) | `Message.tsx:90` | com `streaming` C15 · sem C15 | - |
| regra de movimento (2) | `packages/web/src/features/conversation/conversation.css:231` e `:245-246` | animada C16 · `prefers-reduced-motion` C16 | - |

Conjuntos que os artefatos nomeiam e a tabela não tem linha:

- **`Surface` e `Relations` estão vazios.** O `git diff --stat e3894e4..HEAD` não toca router,
  procedure nem WebSocket, então não há status a juntar.
- **`Observable`, *empty state: existing*.** O teste existe e rodou nesta rodada:
  `packages/web/src/features/conversation/Message.test.tsx:146-149`, *"shows no peek when there is
  nothing yet to peek at"*, com `expect(container.querySelector(".thought__peek")).toBeNull()`.
- **Os dois ramos da decisão de saída do C7.** Pensamento no padrão e `end_turn` por modelo: os dois
  estão provados pela corrida real, e as duas guardas de falha pelas falhas 1 e 2.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado por uma fronteira | `packages/server/src/acp/AcpManager.ts` (`handshake`/`load`/`metaOf`, 3 estados) | fronteira C6 (`SessionStore`, abrir e retomar) · camada C1–C4, um por estado | yes |
| Decide, sem fronteira | `conversation-model.ts` (juntar ou abrir bloco), `Message.tsx` (`Thought`: 3 rótulos, 2 classes), `Transcript.tsx` (4 linhas de aberto/fechado) | C8, mais C14 abrindo um bloco novo depois da ferramenta · C9, C10, C18, C15 · C11–C14 | yes |
| Instrumentação, repasse | `AcpManager.ts:1229` (o campo na `Session`), `scripts/measure-thinking.ts`, `Thought.stories.tsx` | nenhuma própria; coberto por C1–C4 e pelo próprio C7 | yes |

`adapters.ts` é dado, sem decisão, e o C5 afirma o literal.

## Faults injected

Verified at `917cfb5`. As falhas rodaram numa cópia descartável da árvore:

- a cópia foi feita com `rsync` para `/tmp/verify-035-r3`, com `node_modules` por symlink, sem `git stash`
  nem `worktree`;
- foi uma falha por vez, e cada uma foi restaurada do original antes da próxima;
- no fim, `diff -rq` contra a árvore real só mostrou o agente falso a mais, e a cópia foi apagada.

A linha de base da árvore real era `?? docs/features/036-reasoning/verification.md`. Depois das falhas e
do e2e, ela continuou idêntica (`git status --porcelain | diff - baseline` vazio).

As falhas do script rodaram **sem rede**, contra um agente ACP falso escrito na cópia
(packages/server/fake-acp-agent.mjs, na cópia, sobre o `AgentSideConnection` do SDK, apagado com a cópia) e ligado
por `LUMEM_ADAPTER`. Ele funciona assim:

- anuncia os modelos `opus[1m]`, `sonnet` e `haiku`, ou nenhuma opção `model` com `FAKE_MODELS=none`;
- emite `agent_thought_chunk` só quando o `session/new` traz `_meta`;
- responde com `usage` e com o `stopReason` que `FAKE_STOP_MODEL`/`FAKE_STOP` pedirem.

Sem falha, o script do `HEAD` contra ele sai 0: `end_turn em todos os 3 modelos: sim`, 18 caracteres de
pensamento, e `outputTokens` 42 nas cinco linhas.

| Mutation | Location | Killed |
| --- | --- | --- |
| 1. o adaptador fecha um modelo com `refusal` (`FAKE_STOP_MODEL=haiku FAKE_STOP=refusal`); a mesma corrida com `max_tokens` no `sonnet` | ambiente do C7; guarda em `scripts/measure-thinking.ts:154` | yes — `NÃO — haiku`, exit 1; `NÃO — sonnet`, exit 1. Controle: com a condição da primeira rodada (`run.stopReason === null`) na cópia, o `refusal` sai 0 com `sim`, então é a guarda de `:154` que mata |
| 2. o adaptador não anuncia a opção `model` (`FAKE_MODELS=none`), então `models` fica `[]` | ambiente do C7; guarda em `scripts/measure-thinking.ts:160` | yes — `end_turn em todos os 0 modelos: sim`, e **exit 1**. Controle: sem `models.length > 0` na cópia, a mesma corrida sai 0, então é a guarda nova do `917cfb5` que mata |
| 3. tirar `...metaOf(session)` do `session/load` | `packages/server/src/acp/AcpManager.ts:2238` | yes — `× sends the spec's reasoningMeta on session/load` e `× asks the catalogued adapter for its reasoning on open and on resume` (`2 failed, 3 passed`) |
| 4. spec com `null` passa a mandar `_meta: {}` em vez de nenhuma chave | `packages/server/src/acp/AcpManager.ts:2826` (`metaOf`) | yes — `× sends no _meta when the spec declares no reasoningMeta` e `× sends no _meta without an adapterId` (`2 failed, 3 passed`) |
| 5. `thought--live` sempre presente, com ou sem `streaming` | `packages/web/src/features/conversation/Message.tsx:90` | yes — `× marks the label live only while streaming` (`1 failed, 2 passed`) |

Parei no teto de cinco. Nenhuma superfície foi mutada duas vezes. O que ficou fora da tabela:

- **Carregado da rodada 1 (`ded741b`) e da rodada 2 (`ccc1a88`).** São arquivos que o diff desde então não
  tocou: `git diff --stat ded741b..HEAD` só mostra `docs/README.md`, o `open-questions.md`, o
  `testing.md` e o script. As falhas mortas lá:
  - o `endedAt` congelado no redutor, morta por C8 e C17;
  - `?? false` no `Transcript`, morta por C11 e C13;
  - `elapsedMs >= 0` no rótulo, morta por C10;
  - `...metaOf` fora do `session/new`, morta por C1 e C6;
  - a chave do clique por turno, morta por C14;
  - `animation: none` retirado, morta por C16.
- **Lido, e não injetado.** C5 e C9 cravam o literal inteiro, e C18 tem a asserção negativa
  `not.toHaveTextContent("pensou")`.

## Achados

Nenhum bloqueia. Os três são acompanhamento.

1. **Nit: com zero modelos, o script sai 1 sem dizer por quê** — `scripts/measure-thinking.ts:156-160`.
   - **O mecanismo.** A linha impressa é `C7 · end_turn em todos os ${models.length} modelos: ${refused.length === 0 ? "sim" : …}`.
     Na falha 2 ela disse `end_turn em todos os 0 modelos: sim`, o pensamento também disse `sim`, e o
     código de saída foi 1.
   - **O efeito.** O código de saída está certo. O que falta é a razão: quem rodar depois de uma troca de
     pino vê duas linhas `sim` e um exit 1, e não sabe por quê.
   - **Correção barata:** com `models.length === 0`, imprimir `NÃO — o session/new não ofereceu modelo`.

2. **Informativo: os números da Q2 nesta corrida.** Com o pedido, 156 tokens de saída; sem, 115. Na
   segunda rodada foi o contrário: 148 com, 182 sem. É uma amostra de cada lado por corrida, e a direção
   inverte de uma para a outra, o que é compatível com a tabela da Q2 registrar oscilação entre sessões.
   - **Não é um check**, e a decisão da Q2 é de quem segura a feature.
   - **O critério de reabertura é impreciso.** A Q2 diz *"uma diferença de tokens na medição do AC 5
     reabre"*, mas toda corrida dá números diferentes. Vale anexar estas duas linhas à tabela e dizer qual
     diferença conta.

3. **Acompanhamento: o fechamento da feature.** A `036` ainda não tem linha no *Estado atual* do
   `CLAUDE.md`, e o cabeçalho em `docs/README.md:753` diz `em execução`. As duas coisas mudam quando a
   feature fecha, junto com o parágrafo no Outline. Não é defeito agora: com `checks.md` presente e sem
   verificação aprovada, `em execução` é o `Status:` coerente.

Regra de documentação:

- **A nota no requisito contradito está certa.** `docs/features/006-acp-sessions/prd.md:155` fica sob a
  F2.2 e delimita as duas partes:
  - o que a `036` muda: aberto enquanto é escrito (AC 10–12);
  - o que continua de pé: colapsado quando acaba, e no replay.

  O comentário do e2e (`e2e/acp-conversation.spec.ts:97`) acompanha.
- **O índice bate.** O `docs/README.md` tem a seção da `036` com `prd.md`, `open-questions.md` e
  `checks.md`, e o cabeçalho diz `em execução`. O `prd.md` e o `checks.md` também dizem `em execução`,
  coerente com a regra 5 do `CLAUDE.md`. `pnpm -s docs:check` → `docs ok`.
- **A lição da segunda rodada está registrada.** `docs/project/testing.md:1668`, *"Todos passaram" sobre
  um conjunto vazio é verde sem prova*, fica dentro de *Armadilhas já corrigidas* (a seção vai da `:341` à
  `:1683`). Ela descreve o sintoma, a causa e a regra, e nomeia a irmã da primeira rodada (`refusal` e
  `max_tokens` também são `turn_end`).
- **Contexto, não é do diff.** O `testing.md` tem um byte NUL no offset 135 584, no parágrafo da sentinela
  da `032`. Ele já estava em `e3894e4`. O efeito é que o `rg` trata o arquivo como binário.

`Swept`, linha `existing` — *authorization: a conversa exige a sessão; o pedido não abre porta nova*.
Conferido: o diff não tem arquivo de router, procedure nem WebSocket. O `_meta` só sai dentro do
`handshake` e do `load` de uma sessão que o `SessionStore` já abriu (`AcpManager.ts:2189`, `:2238`).

Esta rodada é um PASS limpo, e por isso não deixa lição nova para `testing.md`. A lição da falha da rodada
anterior já está lá.

## Gate

- `LUMEM_GATE_BASE=e3894e4 pnpm gate:quick` — `Test Files 291 passed (291)`, `Tests 4847 passed | 6 skipped (4853)`, exit 0
- `pnpm gate:build` — exit 0, mas com `Cached: 7 cached, 7 total`. Por isso rodei também, forçando:
  - `pnpm exec turbo typecheck --force` — `4 successful`, `0 cached`, exit 0;
  - `pnpm exec tsc -p tsconfig.json --noEmit` — cobre `scripts/`, incluindo `measure-thinking.ts`; exit 0;
  - `pnpm -s lint` — exit 0.
- `pnpm exec playwright test e2e/acp-conversation.spec.ts` — `8 passed (20.3s)`, exit 0. Rodei porque o diff muda o aberto/fechado que esse e2e afirma (`:97-99`).
- `pnpm -s docs:check` — `docs ok`.
- `pnpm -s feature:check checks docs/features/036-reasoning` — exit 0, com 1 aviso: o C7 não nomeia seletor de teste. É esperado, porque a prova dele é um script.
- `pnpm measure:thinking` — exit 0, uma corrida, como autorizado.
