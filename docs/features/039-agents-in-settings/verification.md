# Os agentes saem da sidebar e moram em /settings — verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 6b7add63..4c297ecc
**Round**: 2 - full (verified at 4c297ecc; a rodada 1, verificada em bb5aaf33, reprovou)
**Verifier**: independent sub-agent (author != verifier)

Os dez checks estão provados no `HEAD` (`4c297ecc`), cada um com a asserção localizada. Rodei de novo
todas as provas, inclusive as três novas do C9, e não só as que a correção tocou.

A rodada 1 reprovou por dois defeitos, e os dois estão corrigidos. Conferi cada um num navegador:

- **O foco do hash** agora vai para a primeira linha do grupo (`AccountsSection.tsx:115-116`). Essa
  linha tem caixa, ao contrário do grupo `display: contents`. Um e2e novo verifica o foco no Chromium
  (`e2e/settings.spec.ts:77`). Para saber se ele pega o defeito antigo, uma sonda fora da árvore repetiu
  o alvo da rodada 1 no app real (focar o grupo): o foco voltou ao `BODY` e a linha ficou sem foco. A
  asserção nova, portanto, reprovaria o código antigo.
- **O e2e do Codex** agora usa um nome com âncora (`/^conta /`). Antes de conectar, a sonda contou
  `ANCHORED = 0` e `UNANCHORED = 1`: o nome com âncora não casa com o grupo `nenhuma conta do Codex`,
  como acontecia na rodada 1.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma — `Plan: nenhum`; o passo 1 é do perfil `ui`, e este é `light` | n/a | none | - |

## Checks

Verified at `4c297ecc`. As provas vitest rodaram numa invocação só, com `--reporter=verbose` e `-t` com
alternação dos onze nomes:

`pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx src/agent-config.test.tsx -t "<C1|C2|C4|C5a|C5b|C6|C7|C8|C9a|C9b|C9c>"`
→ `Test Files 2 passed (2)`, `Tests 11 passed | 10 skipped (21)`, exit 0. Cada nome aparece com `✓`.

Os três e2e rodaram numa invocação só:

`pnpm exec playwright test e2e/settings.spec.ts e2e/second-agent.spec.ts e2e/acp-agent-config.spec.ts -g "põe o foco na linha daquele agente|conecta o segundo agente em /settings|creates the ACP agent from the screen, then talks to it"`
→ `3 passed (13.0s)`, exit 0. O spec do `second-agent` começou num estado limpo, clicou de fato em
`conectar Codex` e levou 902 ms (418 ms na rodada 1, quando não clicava).

O C3 rodou como está escrito: `git grep` saiu 1 (nenhuma ocorrência), então `!` dá 0.

Os nomes foram localizados com `rg -n`:
- `agents-in-settings.test.tsx`: `:61`, `:76`, `:93`, `:106`, `:116`, `:130`, `:145`, `:164`, `:190`;
- `agent-config.test.tsx`: `:75`, `:107`;
- e2e: `settings.spec.ts:63`, `second-agent.spec.ts:126`, `acp-agent-config.spec.ts:50`.

Todos nascem ou mudam no diff.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | rodapé sem `conectar um agente`, sem `Agentes`, sem `nenhum agente conectado`, com `agent_config` listada | vitest, `✓ the sidebar footer has no agent in it` | `packages/web/src/agents-in-settings.test.tsx:70-72` — `queryByRole("button", { name: /conectar um agente/ })).toBeNull()`, `queryByText("Agentes")).toBeNull()`, `queryByText(/nenhum agente conectado/)).toBeNull()`; `:65` — espera o `agentConfig.list` ter sido chamado | PASS |
| C2 | o cabeçalho `Credenciais` segue no rodapé | vitest, `✓ the sidebar footer keeps the credentials` | `packages/web/src/agents-in-settings.test.tsx:88` — `expect(await within(foot).findByText("Credenciais")).toBeInTheDocument()` | PASS |
| C3 | `AgentRow`, `ConnectPanel`, `AgentPanel`, `AgentLogin` não existem em `packages/web/src` | `! git grep -nE ...` → git grep exit 1, prova exit 0 | o próprio comando; os quatro arquivos aparecem como apagados em `git diff --stat 6b7add63..HEAD` | PASS |
| C4 | `/settings` tem `outro agente ACP…`; a gaveta tem Nome, Comando, Argumentos e Versão do adaptador | vitest, `✓ settings offers the other-ACP drawer` | `packages/web/src/agents-in-settings.test.tsx:101-102` — `for (const field of ["Nome", "Comando", "Argumentos (opcional)", "Versão do adaptador"]) expect(within(drawer).getByLabelText(field)).toBeInTheDocument()` | PASS |
| C5 | `agentConfig.create` com `{ name, command, args, adapterVersion }`; `adicionar` desabilitado sem versão | vitest, `✓ sends the pinned version…` e `✓ will not submit an ACP agent without a version` | `packages/web/src/agent-config.test.tsx:89-94` — `toHaveBeenCalledWith({ name: "claude-acp", command: "claude-agent-acp", args: [], adapterVersion: "0.40.0" })`; `:117` — `getByRole("button", { name: "adicionar" })).toBeDisabled()` | PASS |
| C6 | a seção diz que é da máquina e não fala de *rodapé* | vitest, `✓ settings says the agent configuration is the machine's` | `packages/web/src/agents-in-settings.test.tsx:112` — `toHaveTextContent(/da máquina: vale para todo workspace, não para este/)`; `:113` — `not.toHaveTextContent(/rodapé/)` | PASS |
| C7 | `entrar ↓` do rascunho leva a `/settings#agent-<id>` e tira a seleção | vitest, `✓ entrar from the draft pill opens settings at that agent` | `packages/web/src/agents-in-settings.test.tsx:185-187` — `window.location.pathname).toBe("/settings")`, `window.location.hash).toBe("#agent-codex")`, `getByTestId("selection")).toHaveTextContent("none")`, depois de `:180` ler `wt1` | PASS |
| C8 | o mesmo no modal de nova worktree, e o modal fecha | vitest, `✓ entrar from the new-worktree composer opens settings and closes it` | `packages/web/src/agents-in-settings.test.tsx:223-225` — `pathname).toBe("/settings")`, `hash).toBe("#agent-codex")`, `onClose).toHaveBeenCalledTimes(1)` | PASS |
| C9 | hash rola até a primeira linha do grupo e põe o foco nela, também com `/settings` já aberta; sem hash, nada é rolado nem focado | vitest, `✓ the hash scrolls to that agent's section`, `✓ the hash scrolls when settings is already open`, `✓ without a hash nothing is scrolled or focused`; playwright, `✓ /settings#agent-<adaptador> põe o foco na linha daquele agente` | `e2e/settings.spec.ts:77` — `await expect(linha).toBeFocused()`, com `linha = page.locator("#agent-codex > .set__row").first()` (`:75`), no Chromium; `packages/web/src/agents-in-settings.test.tsx:125-126` — `expect(codex.firstElementChild).toHaveFocus()`, `scrollIntoView).toHaveBeenCalledTimes(1)`; `:136` → `:138` `act(() => openAgentSettings("codex"))` → `:141-142` o mesmo par, com a tela já montada; `:153-154` — `scrollIntoView).not.toHaveBeenCalled()`, `firstElementChild).not.toHaveFocus()` | PASS |
| C10 | ACP de fora do catálogo cadastrado em `/settings` e conversando; Codex conectado em `/settings` ganha uma linha `conta …` ao lado do Claude Code | playwright, `✓ creates the ACP agent from the screen, then talks to it` e `✓ conecta o segundo agente em /settings, ao lado do primeiro` | `e2e/acp-agent-config.spec.ts:73` — `await expect(row).toContainText("0.0.0-fake")`; `:86` — `toContainText("Vou separar", …)`; `e2e/second-agent.spec.ts:149` — `account = codex.getByRole("group", { name: /^conta / })`, `:150` — `expect(connect.or(account.first())).toBeVisible(…)` antes de decidir pelo clique, `:153` — `expect(account.first()).toBeVisible(…)`, `:154` — `getByRole("group", { name: "agente Claude Code" })).toBeVisible()` | PASS |

## Achados da rodada 1, reabertos

| # | Achado (rodada 1) | Estado em `4c297ecc` | Evidência |
| --- | --- | --- | --- |
| 1 | foco num grupo `display: contents` não acontece no Chromium | resolvido | `AccountsSection.tsx:113-117` — `row = node.firstElementChild`, `row.tabIndex = -1`, `row.focus(…)`, `row.scrollIntoView(…)`; o `tabIndex` saiu do grupo; e2e `settings.spec.ts:77` verde. A sonda mostrou que focar o grupo (o alvo antigo) deixa `BODY` ativo e a linha sem foco |
| 2 | e2e `second-agent` passava sem testar nada | resolvido | nome com âncora `/^conta /` (`:149`) e espera por `connect.or(account)` (`:150`) em vez de `isVisible()` sem espera. Sonda antes do clique: `ANCHORED = 0`, `UNANCHORED = 1` |
| 3 | hash não agia com `/settings` já aberta | resolvido | `useRouteHash` (`lib/route.ts:134`) entra nas dependências do efeito (`AccountsSection.tsx:110`, `:118`); vitest `:130` e uma sonda no Chromium (`pushState` + `popstate` com a tela aberta) deixaram a linha do Claude com foco |
| 4 | variante `{ command, args }` de `LoginTarget` sem chamador | resolvido | `queries.ts:240` — `export type LoginTarget = { adapterId: string; accountId: string }`; `LoginOptions.test.tsx:47` passa a usar o alvo de conta; `entryOf` e `AdapterEntry` deixaram de ser exportados |
| 5 | CSS morto mantido vivo pelo `INTERPOLATED` | parcial (nit) | saíram `foot-row--err`, `foot-row--warn` e `.foot-row.is-open`. Continua `prep__r--wait`, em `agent-login.css:159-160` e `agent-login-css.test.ts:62`, sem markup que o gere (o `LoginOptions` só usa `done` e `now`) |
| 6 | comentários que ainda falavam do rodapé | resolvido nos três citados (nit residual) | `LoginOptions.tsx:31`, `queries.ts:233-235` e `AccountLogin.tsx:5` corrigidos. Sobraram dois comentários que a feature tornou falsos: `Credentials.tsx:13-16` ("é lá que os adaptadores moram"; "a diferença para o bloco de cima") e `queries-accounts.ts:127` ("O caminho do rodapé") |

Na correção, conferi também se ela não tinha criado o defeito inverso do que consertou:
- o efeito só age no grupo cujo `id` é o hash, e não em todos;
- `useRouteHash` assina o mesmo `subscribe` da rota (`popstate` + `ROUTE_EVENT`, `route.ts:106-113`), sem listener novo para remover;
- `connect.or(account.first())` não esbarra no modo estrito: o botão só existe sem conta, e a linha
  `conta …` só existe com conta.

## Gate

- `pnpm exec turbo typecheck --force`: `5 successful`, `0 cached`. `pnpm lint`: exit 0.
- `LUMEM_GATE_BASE=6b7add63 pnpm gate:quick`: `Test Files 326 passed (326)`,
  `Tests 5240 passed | 6 skipped (5246)`, exit 0. A intermitência de uma das corridas da rodada 1 não
  voltou.
- `pnpm -s docs:check`: `docs ok`.

As sondas rodaram com um `playwright.config` e um spec em `/tmp/lumem-verify-039/`, contra os
servidores do e2e. Antes e depois, o `git status --porcelain` da árvore real foi o mesmo.

## Documentação

- `docs/project/testing.md` ganhou as duas armadilhas que a rodada 1 pediu: foco em `display: contents`
  e locator sem âncora.
- Ficam para depois, sem bloquear:
  - a linha deste `verification.md` no índice (`docs/README.md`, seção da `039`);
  - a linha da `039` no `CLAUDE.md`, quando a feature fechar;
  - o resíduo dos achados 5 e 6.
