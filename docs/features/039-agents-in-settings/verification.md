# Os agentes saem da sidebar e moram em /settings — verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: 6b7add63..bb5aaf33
**Round**: 1 - full (verified at bb5aaf33)
**Verifier**: independent sub-agent (author != verifier)

Nove dos dez checks estão provados no `HEAD`. O **C9 reprova**: a afirmação *"põe o foco nele"* é falsa
num navegador de verdade. O grupo `agente <label>` tem `display: contents` (`settings.css:261`), e o
Chromium ignora `focus()` num elemento sem caixa. O teste passa porque o jsdom não tem layout. Confirmei
isso no próprio app: abri `/settings#agent-codex` num navegador e o `document.activeElement` continuou
sendo o `BODY`.

O C10 passa pela prova do `acp-agent-config`. A outra prova dele, o e2e `second-agent`, **passa sem
testar nada**: a asserção dela já é satisfeita antes de qualquer clique, pelo grupo `nenhuma conta do
Codex`. Confirmei isso com o mesmo tipo de sonda, fora da árvore.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma — `Plan: nenhum`; o passo 1 é do perfil `ui`, e este é `light` | n/a | none | - |

## Checks

Verified at `bb5aaf33`. As provas vitest rodaram numa invocação só, com `--reporter=verbose` e `-t`
com alternação dos nove nomes:

`pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx src/agent-config.test.tsx -t "<C1|C2|C4|C5a|C5b|C6|C7|C8|C9>"`
→ `Test Files 2 passed (2)`, `Tests 9 passed | 11 skipped (20)`, exit 0. Cada nome aparece com `✓`.

Os dois e2e rodaram numa invocação só:

`pnpm exec playwright test e2e/second-agent.spec.ts e2e/acp-agent-config.spec.ts -g "conecta o segundo agente em /settings|creates the ACP agent from the screen, then talks to it"`
→ `2 passed (11.6s)`, exit 0. O `second-agent` levou 418 ms.

O C3 rodou como está escrito: `git grep` saiu 1 (nenhuma ocorrência), então `!` dá 0.

Os nomes foram localizados com `rg -n`. Em `agents-in-settings.test.tsx` (arquivo novo no diff):
`:61`, `:76`, `:93`, `:106`, `:116`, `:129`, `:148`, `:174`. Em `agent-config.test.tsx` (mudou no
diff, e a gaveta agora abre por `/settings`): `:75`, `:107`. Nos e2e (mudaram no diff):
`acp-agent-config.spec.ts:50` e `second-agent.spec.ts:126`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | rodapé sem `conectar um agente`, sem `Agentes`, sem `nenhum agente conectado`, com `agent_config` listada | vitest, `✓ the sidebar footer has no agent in it` | `packages/web/src/agents-in-settings.test.tsx:70-72` — `queryByRole("button", { name: /conectar um agente/ })).toBeNull()`, `queryByText("Agentes")).toBeNull()`, `queryByText(/nenhum agente conectado/)).toBeNull()`; `:65` — espera o `agentConfig.list` ter sido chamado | PASS |
| C2 | o cabeçalho `Credenciais` segue no rodapé | vitest, `✓ the sidebar footer keeps the credentials` | `packages/web/src/agents-in-settings.test.tsx:88` — `expect(await within(foot).findByText("Credenciais")).toBeInTheDocument()` | PASS |
| C3 | `AgentRow`, `ConnectPanel`, `AgentPanel`, `AgentLogin` não existem em `packages/web/src` | `! git grep -nE ...` → git grep exit 1, prova exit 0 | o próprio comando; os quatro arquivos aparecem como apagados em `git diff --stat 6b7add63..HEAD` | PASS |
| C4 | `/settings` tem `outro agente ACP…`, e a gaveta tem Nome, Comando, Argumentos e Versão do adaptador | vitest, `✓ settings offers the other-ACP drawer` | `packages/web/src/agents-in-settings.test.tsx:101-102` — `for (const field of ["Nome", "Comando", "Argumentos (opcional)", "Versão do adaptador"]) expect(within(drawer).getByLabelText(field)).toBeInTheDocument()` | PASS |
| C5 | `agentConfig.create` com `{ name, command, args, adapterVersion }`; `adicionar` desabilitado sem versão | vitest, `✓ sends the pinned version…` e `✓ will not submit an ACP agent without a version` | `packages/web/src/agent-config.test.tsx:89-94` — `toHaveBeenCalledWith({ name: "claude-acp", command: "claude-agent-acp", args: [], adapterVersion: "0.40.0" })`; `:117` — `getByRole("button", { name: "adicionar" })).toBeDisabled()` | PASS |
| C6 | a seção diz que é da máquina e não fala de *rodapé* | vitest, `✓ settings says the agent configuration is the machine's` | `packages/web/src/agents-in-settings.test.tsx:112` — `toHaveTextContent(/da máquina: vale para todo workspace, não para este/)`; `:113` — `not.toHaveTextContent(/rodapé/)` | PASS |
| C7 | `entrar ↓` do rascunho leva a `/settings#agent-<id>` e tira a seleção | vitest, `✓ entrar from the draft pill opens settings at that agent` | `packages/web/src/agents-in-settings.test.tsx:169-171` — `window.location.pathname).toBe("/settings")`, `window.location.hash).toBe("#agent-codex")`, `getByTestId("selection")).toHaveTextContent("none")`, depois de `:164` ler `wt1` | PASS |
| C8 | o mesmo no modal de nova worktree, e o modal fecha | vitest, `✓ entrar from the new-worktree composer opens settings and closes it` | `packages/web/src/agents-in-settings.test.tsx:207-209` — `pathname).toBe("/settings")`, `hash).toBe("#agent-codex")`, `onClose).toHaveBeenCalledTimes(1)` | PASS |
| C9 | `/settings#agent-<id>` rola até o grupo e **põe o foco nele**; sem hash, nada é rolado | vitest, `✓ the hash scrolls to that agent's section` (jsdom) | `packages/web/src/agents-in-settings.test.tsx:124` — `await waitFor(() => expect(codex).toHaveFocus())`. É verde no jsdom e falso no Chromium: `packages/web/src/features/settings/settings.css:261` — `.set__agent { display: contents; }`, e `AccountsSection.tsx:110` — `node.focus({ preventScroll: true })` não faz nada. Uma sonda no app real, fora da árvore, abriu `/settings#agent-codex` e leu `{"active":"BODY","display":"contents","hash":"#agent-codex"}`. Além disso, a `Proof:` não roda a metade *sem hash*: `-t "the hash scrolls…"` não casa com `without a hash nothing is scrolled or focused` (`:129`, que eu rodei à parte: `1 passed`) | FAIL |
| C10 | cadastrar um ACP de fora do catálogo em `/settings` e conversar com ele | playwright, `✓ creates the ACP agent from the screen, then talks to it` e `✓ conecta o segundo agente em /settings` | `e2e/acp-agent-config.spec.ts:73` — `await expect(row).toContainText("0.0.0-fake")`; `:86` — `await expect(conversation(page)).toContainText("Vou separar", …)`. A segunda prova, `e2e/second-agent.spec.ts:149`, não testa nada (achado 2): a afirmação fica provada só pela primeira | PASS |

## Achados

Classificação: **blocker / warning / nit**. Os achados 1 e 2 foram confirmados num navegador.

1. **Blocker — o foco do hash não acontece no navegador** (C9). `packages/web/src/features/settings/AccountsSection.tsx:106-113`
   dá foco ao grupo `.set__agent`, mas `settings.css:261` tira a caixa dele (`display: contents`), e o
   Chromium 151 recusa `focus()` num elemento assim. Testei de dois jeitos: com uma página mínima, que
   reproduz o mesmo CSS e a mesma chamada, e com o app real em `/settings#agent-codex`. Nos dois casos o
   `activeElement` continuou sendo o `BODY`. O comentário em `AccountsSection.tsx:101-104` ("O foco fica
   no grupo… o leitor de tela lê `agente Claude Code`") diz o contrário do que acontece.

   Para quem usa teclado ou leitor de tela, o `entrar ↓` tira o foco do botão (o modal ou a aba
   desmontam) e o deixa no `body`.

   **Correção mínima:** focar um elemento que tenha caixa — por exemplo, a primeira linha do grupo, com
   `tabIndex={-1}` — ou dar caixa ao grupo. E mudar o nível da prova: só um teste com navegador
   (Playwright) consegue ver isso. Também precisa somar à `Proof:` do C9 o nome
   `without a hash nothing is scrolled or focused`.
2. **Blocker — o e2e `second-agent` foi enfraquecido até passar sem testar nada** (C10, segunda prova).
   - `e2e/second-agent.spec.ts:149` procura `codex.getByRole("group", { name: /conta/ }).first()`. O
     regex não tem âncora, então ele casa com o grupo `nenhuma conta do Codex`
     (`AccountsSection.tsx:222`), que já está na tela **antes** de conectar.
   - `:147` usa `isVisible()`, que não espera nada: se o botão ainda não apareceu, o clique simplesmente
     não acontece.
   - A sonda, sem clicar em nada, leu `MATCHED aria-label = nenhuma conta do Codex`, com a asserção
     verde. Se conectar quebrar, o teste continua verde.
   - O diff também apagou as asserções que existiam: a versão do handshake (`1.10.0`) e as duas linhas
     lado a lado.

   **Correção mínima:** usar um nome com âncora (`/^conta /`, ou `"conta principal"`) e esperar pelo
   `conectar Codex` *ou* por uma conta já existente com `expect(...).toBeVisible()`, em vez de
   `isVisible()`.
3. **Warning — o hash não age quando `/settings` já está montada.** O efeito em
   `AccountsSection.tsx:107-113` só depende de `[node, anchor]` e não escuta o `ROUTE_EVENT` nem o
   `hashchange`. Dá para chegar nesse caso pela interface: o modal de nova worktree é montado pelo
   `WorkspaceShell` (`WorkspaceShell.tsx:165`), então ele abre pela sidebar mesmo com `/settings` na
   tela. Clicando em `entrar ↓` nele, o endereço vira `#agent-codex`, mas nada rola e nada recebe foco.
   Confirmei lendo o código; não rodei esse caminho.
4. **Nit — o alvo de login por comando ficou sem chamador.** A variante `{ command, args }` de
   `LoginTarget` e o ramo dela em `loginInput` (`packages/web/src/features/agent/queries.ts:239-247`) só
   eram usados pelo rodapé. O único chamador que restou é `AccountLogin.tsx:13`, que passa
   `{ adapterId, accountId }`. Mesmo assim, `LoginOptions.test.tsx:47` exercita justamente o ramo morto. O
   ramo vivo continua coberto por `AccountsSection.test.tsx:225`. `entryOf` e `AdapterEntry` também
   perderam o último chamador fora de `queries.ts` (eram do `ConnectPanel`).
5. **Nit — CSS morto que a guarda não acusa.** As regras em
   `packages/web/src/features/agent/agent-login.css:55`, `:160-161`, `:200`, `:215-216` e `:219`
   (`foot-row--err`, `prep__r--wait`, `foot-row--warn`, `.foot-row.is-open`) não têm mais markup: o
   `Credentials` só gera `on`/`off`, e o `LoginOptions` só gera `done`/`now`. Elas continuam no
   `INTERPOLATED` de `agent-login-css.test.ts:57-67`, e é isso que deixa cega a direção "defines nothing
   the panel does not use". Além disso, `setup` entrou em `BORROWED` (`:101`), a lista do que é "pintado
   em outro lugar", embora seja definido nesta mesma folha. É a família de
   `testing.md` § *Um teste de CSS por lista de arquivo escrita à mão fica cego…*.
6. **Nit — comentários que ainda falam do rodapé:** `LoginOptions.tsx:31` ("Uma configuração (o
   rodapé)"), `queries.ts:232-233` e `AccountLogin.tsx:5` ("o login do rodapé").

Verifiquei também, sem achar defeito:
- o *early return* de `navigate` com hash (`route.ts:97`): numa mesma rota com hash velho, ele agora
  empurra uma entrada de histórico e limpa o hash. Hoje isso só acontece pelo item `Configurações` da
  `SidebarNav`, e o resultado é o correto;
- `openAgentSettings` faz `navigate` e depois `clear()`, que não mexe na rota (`navigation.ts:121`);
- a cobertura do `useConnectAgent` (instalar, reinstalar fora do pino, versão ilegível), que saiu junto
  com o `AgentLogin.test.tsx`, continua de pé em `features/agent/queries.test.tsx:115-171`.

## Gate

- `pnpm gate:build`: 9/9, só com cache. `pnpm exec turbo typecheck --force --filter=@lumem/web`: 3/3,
  sem cache. `pnpm lint`: limpo.
- `LUMEM_GATE_BASE=6b7add63 pnpm gate:quick`: a primeira corrida deu `Tests 2 failed | 5237 passed`, com
  a máquina carregada por um e2e completo de outra worktree. A segunda deu
  `Test Files 326 passed (326)`, `Tests 5239 passed | 6 skipped (5245)`. Não consegui identificar as duas
  falhas da primeira corrida; trato como intermitência ainda sem nome, e não como defeito da feature.
- `pnpm -s docs:check`: `docs ok`.

As sondas rodaram com um `playwright.config` e um spec em `/tmp/lumem-verify-039/`, contra os
servidores do e2e. Antes e depois, o `git status --porcelain` da árvore real foi o mesmo.

## Documentação

- `docs/README.md` ainda não lista este `verification.md` na seção da `039` (o índice é obrigatório).
- `docs/project/testing.md` § *Armadilhas já corrigidas* ganha duas entradas quando os achados fecharem:
  - foco em elemento `display: contents` é verde no jsdom e não acontece no navegador;
  - um locator por nome sem âncora (`/conta/`) casa com o estado vazio (`nenhuma conta…`).
- `CLAUDE.md` ganha a linha da `039` quando a feature fechar.
