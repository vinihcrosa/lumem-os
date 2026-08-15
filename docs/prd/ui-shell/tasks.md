# Interface — Tasks

**PRD:** [prd.md](prd.md) · **Decisões:** [open-questions.md](open-questions.md)
**Protótipo:** `packages/web/prototype/lumem-shell.html`
**Status:** aprovado — pronto pra execução
**Total:** 11 tasks em 4 fases

---

## Princípio de ordenação

De baixo pra cima, porque aqui a dependência é real e não negociável: componente não pode ler token que não existe, e tela não pode usar primitiva que não foi escrita.

A **T2 é o portão**. Se as primitivas estiverem erradas, os seis restyles herdam o erro e a correção custa seis vezes. A rota `/styleguide` nasce junto com elas exatamente pra que o erro apareça ali, numa página, e não espalhado por seis telas.

A **T9 é o maior risco** e por isso não vai por último: o xterm pinta o próprio canvas com as próprias cores ANSI, e é o elemento que ocupa mais pixels do app. Se o tema não sair dos tokens, o terminal briga com a tela inteira.

---

## Convenções destas tasks

- **CSS plano**, sem CSS modules e sem CSS-in-JS. As classes do protótipo vão praticamente inalteradas — é esse o ganho de ter prototipado na tecnologia final.
- **Nenhum literal** de cor, espaçamento ou tamanho fora de `tokens.css`. Sempre `var()`.
- **Componente lê só a camada semântica**, nunca primitiva.
- Cada task **atualiza os testes que ela quebra**, na própria task. Não existe "arruma depois".
- Commit atômico por task, Conventional Commits.

---

## Grafo de dependência

```
T1 → T2 → T3 → T4 → T5
          ↓
          ├→ T6 → T8
          ├→ T7
          └→ T9
                ↓
T4, T6, T7 ────→ T10 → T11
```

T6, T7 e T9 são independentes entre si depois da T2 — podem ir em paralelo. T11 é e2e e por isso nunca recebe `[P]`.

---

## Fase 1 — Fundação

#### T1: Tokens e fontes entram no app

**What**: Importar `tokens.css` na raiz, escrever o reset e os estilos de documento, carregar Inter e JetBrains Mono self-hosted.
**Where**: `packages/web/src/main.tsx`, `packages/web/src/styles/base.css`, `packages/web/package.json`
**Depends on**: nada
**Reuses**: `packages/web/src/styles/tokens.css` (já gerado)
**Requirement**: PRD §3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `main.tsx` importa `./styles/tokens.css` e `./styles/base.css`, nessa ordem
- [ ] `base.css` tem reset de `box-sizing`, `body` com `--color-bg-base` e `--text-body-md`, e o `.focus-ring` do gerador aplicado a todo alvo interativo
- [ ] `@fontsource-variable/inter` e `@fontsource/jetbrains-mono` como dependências, importados na raiz — sem CDN, o daemon serve tudo
- [ ] Nenhum valor literal de cor ou espaçamento em `base.css`
- [ ] Gate check passa: `pnpm gate:build`

**Tests**: none · **Gate**: build
**Commit**: `feat(web): load the design tokens and fonts`

---

#### T2: Primitivas de UI e rota `/styleguide`

**What**: Os blocos que o protótipo usa, extraídos como componentes, mais uma página que renderiza todos em todos os estados.
**Where**: `packages/web/src/ui/*.tsx`, `packages/web/src/ui/ui.css`, `packages/web/src/ui/Styleguide.tsx`, `packages/web/src/ui/ui.test.tsx`
**Depends on**: T1
**Reuses**: marcação e classes do protótipo
**Requirement**: PRD §4 F2

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `Button` com variantes `primary` / `default` / `ghost` / `danger`, tamanhos `md` / `sm`, estado `disabled` e slot de glifo
- [ ] `Chip` com variantes de domínio (branch, clean, dirty, missing, running, exited, failed) e ponto opcional
- [ ] `Row` — a linha da árvore, com `depth`, `selected`, `muted`, twist, ícone, label truncável, meta e pip
- [ ] `Item` — a linha de lista do detalhe, com ícone, nome, caminho truncável, estado, idade e slot de ação
- [ ] `MetaGrid`, `SectionHead`, `Banner` (`info` / `warning` / `danger`), `EmptyState`, `Card`, `Field` (com estado de erro), `Menu` + `MenuItem` (com item desabilitado e dica)
- [ ] `Styleguide` renderiza cada primitiva em cada estado, montada em `DEV` apenas — Q11
- [ ] Nenhum literal fora de `tokens.css`; nenhuma primitiva de cor usada direto
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: 1 arquivo de teste novo, ao menos 1 caso por primitiva

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): the UI primitives the prototype uses`

---

## Fase 2 — Casca

#### T3: `AppShell` e topbar

**What**: A moldura — topbar com wordmark e estado do daemon, sidebar à esquerda, detalhe à direita, altura de viewport.
**Where**: `packages/web/src/layout/AppShell.tsx`, `packages/web/src/layout/Topbar.tsx`, `packages/web/src/layout/layout.css`, `packages/web/src/App.tsx`
**Depends on**: T2
**Reuses**: `AppShell` existente (hoje só um grid sem estilo)
**Requirement**: PRD §4 F3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] O `<header>` sai do `App.tsx` e vira `Topbar`, com o estado do daemon usando `daemon/online` e `daemon/offline`
- [ ] `AppShell` ocupa a viewport e não deixa o `body` rolar — só as duas colunas rolam
- [ ] `AppShell` continua sem estado próprio, como o comentário dele já promete
- [ ] `App.test.tsx` atualizado
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: casos existentes passam com os seletores novos

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): frame the app in a styled shell`

---

#### T4: Sidebar — árvore unificada com colapso

**What**: Projeto, worktree e sessão como a mesma linha em profundidades diferentes, com expansão persistida e rodapé de ação.
**Where**: `packages/web/src/components/ProjectList.tsx`, `WorktreeTree.tsx`, `SessionList.tsx`, `packages/web/src/hooks/useTreeExpansion.ts`, `packages/web/src/hooks/useSessionsByScope.ts`, `packages/web/src/App.tsx`
**Depends on**: T2, T3
**Reuses**: `Row` da T2, `useActiveWorkspace` como modelo de persistência
**Requirement**: PRD §4 F3 · Q4, Q5, Q6, Q7

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `useTreeExpansion` guarda um `Set` de nós expandidos e persiste, como `useActiveWorkspace` já faz
- [ ] `useSessionsByScope` centraliza a query por escopo; `SessionList` e o pip da linha leem o **mesmo** cache — um fetch só (Q7)
- [ ] Colapsar esconde as linhas filhas e **não** desmonta a query: o pip de "tem sessão rodando aqui dentro" sobrevive ao colapso
- [ ] Sessão de escopo de projeto aparece como filha direta do projeto, acima das worktrees (Q5)
- [ ] Projeto indisponível e worktree `missing` aparecem apagados, com rótulo e ações bloqueadas — não somem (Q6)
- [ ] Nome comprido trunca com reticências e não empurra o layout
- [ ] `AddProjectDialog` sai da lista e vira o rodapé da sidebar
- [ ] `project-ui.test.tsx`, `worktree-ui.test.tsx` e `session-ui.test.tsx` atualizados
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ao menos 2 casos novos — colapso preserva o pip, e nome comprido trunca

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): one tree for projects, worktrees and sessions`

---

#### T5: Seletor de workspace

**What**: O topo da sidebar — qual workspace tudo abaixo pertence.
**Where**: `packages/web/src/components/WorkspaceSelector.tsx`, `packages/web/src/components/workspace.css`
**Depends on**: T4
**Reuses**: `Button`, `Field` da T2
**Requirement**: PRD §4 F3 · Q8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `<select>` nativo mantido, estilizado com `appearance: none` e glifo próprio (Q8)
- [ ] Criar workspace vira o `Card` da T2 em vez do formulário inline
- [ ] `workspace-ui.test.tsx` atualizado — o `<select>` continua acessível por label
- [ ] Gate check passa: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): style the workspace selector`

---

## Fase 3 — Detalhes

#### T6: Detalhe do projeto

**What**: Crumb, título, chips, barra de ações, grade de metadados, lista de worktrees e lista de sessões.
**Where**: `packages/web/src/components/ProjectDetail.tsx`, `CreateWorktreeDialog.tsx`, `packages/web/src/components/detail.css`
**Depends on**: T2
**Reuses**: `MetaGrid`, `Chip`, `Item`, `SectionHead`, `Banner` da T2
**Requirement**: PRD §4 F4 · Q7

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `CreateWorktreeDialog` sai da `WorktreeTree` e vira a ação primária `Nova worktree` daqui
- [ ] Chip de contagem de worktrees derivado da query já montada; contagem de sessões rodando derivada do `useSessionsByScope` (Q7)
- [ ] Repositório fora do disco vira `Banner` de aviso com as ações bloqueadas, mantendo `remover projeto` — que é como o usuário se recupera
- [ ] Caminho longo trunca com reticências sem empurrar a grade
- [ ] `project-ui.test.tsx` e `worktree-ui.test.tsx` atualizados
- [ ] Gate check passa: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): style the project detail`

---

#### T7: Detalhe da worktree

**What**: O mesmo esqueleto do T6, mais os dois bloqueios de remoção que o §8 exige.
**Where**: `packages/web/src/components/WorktreeDetail.tsx`
**Depends on**: T2
**Reuses**: `Chip`, `MetaGrid`, `Banner`, `Button` da T2
**Requirement**: walking-skeleton F4.8, F4.9, F4.10, §8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Branch, sujeira e distância da base como chips: `teste-prd`, `suja · 3 arquivos`, `↑2 de main`
- [ ] `↓0` não renderiza — zero atrás não é informação
- [ ] Worktree suja: `Banner` de aviso com a contagem, saída literal do git, e confirmação explícita pra forçar
- [ ] Sessão viva: `Banner` de erro com a contagem e a lista das sessões, cada uma com ação de encerrar
- [ ] `missing`: título com `⚠`, chip `ausente do disco`, e a ação de remover o registro dizendo que a branch fica
- [ ] O cliente continua sem adivinhar o motivo do bloqueio — quem decide é o daemon, como o código já faz
- [ ] `worktree-ui.test.tsx` atualizado
- [ ] Gate check passa: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): style the worktree detail`

---

#### T8: Menu de nova sessão

**What**: A fileira de botões vira um menu suspenso.
**Where**: `packages/web/src/components/NewSessionMenu.tsx`
**Depends on**: T2, T6
**Reuses**: `Menu`, `MenuItem`, `Button` da T2
**Requirement**: walking-skeleton F5.1, F5.2, F6.5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `Novo agente ▾` abre menu com uma entrada por configuração; `Novo shell` continua botão direto
- [ ] Fecha com clique fora e com `Esc`; o foco volta pro gatilho
- [ ] Configuração indisponível aparece **desabilitada e visível**, com a dica dizendo que o comando não está no `PATH` — F6.5
- [ ] `session-ui.test.tsx` atualizado
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ao menos 2 casos novos — fecha com `Esc`, e item indisponível não dispara

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): turn the session launcher into a menu`

---

#### T9: Sessão e terminal

**What**: A tela que mais ocupa pixels: cabeçalho do terminal, altura cheia, e o xterm tematizado a partir dos tokens.
**Where**: `packages/web/src/components/SessionDetail.tsx`, `Terminal.tsx`, `packages/web/src/components/terminal.css`, `packages/web/src/lib/xterm-theme.ts`
**Depends on**: T2
**Reuses**: `tokens.ts` — é para isto que ele é gerado
**Requirement**: PRD §7 · walking-skeleton F5.3, F5.9, F5.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `xterm-theme.ts` monta o `ITheme` a partir de `tokens.ts` — fundo, texto, cursor e as 16 cores ANSI saem das rampas, nenhuma hardcoded
- [ ] O detalhe da sessão é exceção de layout: sem largura máxima de leitura, terminal preenchendo o que sobra em altura
- [ ] `FitAddon` mede o host depois do layout e o daemon recebe o tamanho real — o comportamento atual não regride
- [ ] Cabeçalho do terminal com ícone, comando e `cwd` truncável
- [ ] Sessão encerrada: chip `exited (N)` e o aviso de que o buffer segue legível — F5.9
- [ ] Idade da sessão a partir de `session.createdAt`, tratando a string ISO na borda: o tRPC não tem transformer e o tipo mente (PRD §7)
- [ ] `Terminal.test.tsx` e `session-ui.test.tsx` atualizados
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ao menos 1 caso novo — o tema aplicado sai dos tokens

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): give the terminal the room and the palette`

---

## Fase 4 — Estados

#### T10: Primeiro uso, vazio, carregando, offline

**What**: Os estados que não são o caminho feliz, que hoje são parágrafos soltos.
**Where**: `packages/web/src/components/FirstRun.tsx`, `AddProjectDialog.tsx`, `packages/web/src/App.tsx`
**Depends on**: T4, T6, T7
**Reuses**: `Card`, `Field`, `EmptyState`, `Banner` da T2
**Requirement**: walking-skeleton §5, §8 · PRD §4 F5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Primeiro uso vira `Card` centrado com campo focado — largura de diálogo, não de coluna de detalhe
- [ ] Caminho recusado mostra a mensagem literal do daemon no `Field` em erro — F2.2, e o daemon é o único que sabe qual validação falhou
- [ ] Workspace sem projeto vira `EmptyState` com a ação, e não uma frase
- [ ] Carregando vira esqueleto, não `carregando…`
- [ ] Daemon inacessível vira `Banner` de erro persistente na topbar
- [ ] `App.test.tsx` e `project-ui.test.tsx` atualizados
- [ ] Gate check passa: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): design the states that are not the happy path`

---

#### T11: Varredura e2e

**What**: Os e2e existentes navegam por texto e papel que mudaram. Consertar, sem afrouxar o que eles provam.
**Where**: `e2e/*.spec.ts`
**Depends on**: T10
**Reuses**: fixtures existentes
**Requirement**: walking-skeleton §9

**Tools**: MCP: NONE · Skill: `playwright-skill`

**Done when**:
- [ ] Todos os e2e passam com os seletores novos
- [ ] Nenhuma asserção foi enfraquecida pra passar — seletor mudou, garantia não
- [ ] O caminho crítico continua coberto: fecho o navegador com o agente trabalhando, reabro, ele continua
- [ ] Gate check passa: `pnpm gate:full`

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): follow the restyled selectors`

---

## Validação pré-aprovação

### Check 1 — Granularidade

| Task | Escopo | Status |
|---|---|---|
| T1 | 1 import + 1 folha base | ✅ |
| T2 | 1 conjunto de primitivas + 1 página | ✅ |
| T3 | 1 moldura | ✅ |
| T4 | 1 árvore + 2 hooks | ✅ |
| T5 | 1 componente | ✅ |
| T6 | 1 tela | ✅ |
| T7 | 1 tela | ✅ |
| T8 | 1 componente | ✅ |
| T9 | 1 tela + 1 tema | ✅ |
| T10 | 4 estados | ✅ |
| T11 | varredura e2e | ✅ |

### Check 2 — Co-locação de testes

| Task | Camada | Matriz exige | Task diz | Status |
|---|---|---|---|---|
| T1 | config/estilo | none | none | ✅ |
| T2 | componente web | unit | unit | ✅ |
| T3–T10 | componente web | unit | unit | ✅ |
| T11 | fluxo | e2e | e2e | ✅ |

**Parallel-safe conferido:** T11 é `e2e`, que a matriz de [testing.md](../../project/testing.md) marca como não-paralelizável. Não tem `[P]`. ✅

### Check 3 — Rastreabilidade

| Origem | Tasks |
|---|---|
| PRD §3 Fundação | T1 |
| PRD §4 F2 Primitivas | T2 |
| PRD §4 F3 Casca | T3, T4, T5 |
| PRD §4 F4 Detalhes | T6, T7, T8, T9 |
| PRD §4 F5 Estados | T10 |
| PRD §7 Riscos | T4 (colapso), T9 (xterm, `Date`) |
| walking-skeleton §8 | T4, T6, T7, T10 |
| walking-skeleton §9 | T11 |
| Q4–Q8 | T4, T5 |

---

## Riscos por task

| Task | Risco | Mitigação |
|---|---|---|
| T2 | Primitiva errada contamina seis telas | É portão de fase; `/styleguide` mostra o erro numa página só |
| T4 | Colapso desmontando a query mata o pip verde, que é o sinal central do produto | Query sobe pro hook; teste dedicado prova que o pip sobrevive ao colapso |
| T9 | xterm pinta canvas próprio e ignora CSS | Tema montado de `tokens.ts`; teste prova que os valores vêm dos tokens |
| T9 | `createdAt` é `Date` no tipo e string em runtime | Tratado na borda; anotado no PRD §7 |
| T11 | Tentação de afrouxar asserção pra passar | Critério explícito: seletor muda, garantia não |
