# Walking Skeleton — Tasks

**PRD:** [prd.md](prd.md) · **Decisões:** [open-questions.md](open-questions.md)
**Status:** Draft — aguardando aprovação
**Total:** 34 tasks em 8 fases

---

## Princípio de ordenação

A ordem **não** segue o PRD. Segue o risco.

O critério de aceite mais valioso do PRD — *fecho o navegador com o agente trabalhando, reabro, e ele continua* — valida daemon, PTY no servidor, ring buffer e reconexão de uma vez só. Se a arquitetura estiver errada, esse teste falha primeiro e barato.

Por isso a **Fase 1 é uma fatia vertical fina** que prova exatamente isso, com `cwd` fixo e zero CRUD. Só depois vem workspace, projeto e worktree, que são trabalho conhecido. Se a Fase 1 der errado, você descobre na semana 1 e não na semana 5, com trinta telas construídas em cima de fundação torta.

---

## Stack

Decidido no PRD, com as escolhas de biblioteca resolvidas aqui:

| Camada | Escolha |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Servidor | Node + TypeScript, Fastify |
| RPC | tRPC (control plane) |
| PTY | `node-pty` + WebSocket cru (`ws`) |
| Banco | SQLite (`better-sqlite3`) + Drizzle ORM |
| Cliente | React + Vite |
| Terminal | `xterm.js` |
| Testes | Vitest (unit + integration), Playwright (e2e) |

Pacotes: `packages/server`, `packages/web`, `packages/shared`.

---

## Matriz de cobertura de testes

> Movida para [docs/project/testing.md](../../project/testing.md), que é a fonte de verdade. A cópia abaixo fica como referência rápida.

| Camada | Teste exigido | Parallel-safe |
|---|---|---|
| `shared/` tipos e schemas | unit | Sim |
| `server/` serviço de git | integration (repo git temporário real) | Sim — cada teste cria seu próprio tmpdir |
| `server/` PTY manager | integration (processo real) | Sim |
| `server/` repositório (Drizzle) | integration (SQLite em arquivo temporário) | Sim |
| `server/` router tRPC | integration | Sim |
| `server/` endpoint WebSocket | integration | Sim |
| `web/` componente | unit (Vitest + Testing Library) | Sim |
| `web/` fluxo de usuário | e2e (Playwright) | **Não** — servidor único, porta única, estado compartilhado |

**Consequência dura:** toda task cujo `Tests` é `e2e` **não pode** receber `[P]`. O gargalo é a execução do teste, não o código.

### Comandos de gate

| Gate | Comando |
|---|---|
| `quick` | `pnpm gate:quick` |
| `full` | `pnpm gate:full` |
| `build` | `pnpm gate:build` |

Os comandos por trás dos scripts mudaram em relação ao plano original — `--changed` sem argumento e `tsc --noEmit` na raiz passavam sem verificar nada. O porquê está em [testing.md](../../project/testing.md).

---

## Plano de execução

### Fase 0 — Fundação (sequencial)

```
T1 → T2 → T3 → T4
```

### Fase 1 — Fatia de risco: PTY ponta a ponta (sequencial)

```
T4 → T5 → T6 → T7 → T8 → T9
```

T9 é o portão. **Não avance sem ele verde.**

### Fase 2 — Persistência (sequencial)

```
T9 → T10 → T11
```

### Fase 3 — Domínio: workspace e projeto

```
              ┌→ T12 → T13 → T14 ─┐
T11 ──────────┤                   ├──→ T18
              └→ T16 ─┐           │
T3 ────→ T15 ─────────┴→ T17 ─────┘
```

`[P]` após T11: T12 e T16. T15 pode começar já depois de T3.

### Fase 4 — Worktree

```
         ┌→ T19 ─┐
T15 ─────┤       ├──→ T22 → T23
         └→ T20 ─┘      │
T11 → T21 ──────────────┘
T17 ────────────────────┘

T22 + T18 → T24 → T25
```

`[P]`: T19 e T20.

### Fase 5 — Sessões e agentes

```
T5, T11 → T26 → T27
T11 ────→ T28 ─┐
T22 ───────────┼→ T29 → T30
T26 ───────────┘   │
T24, T7 ───────────┴→ T31
```

`[P]` após T11: T26 e T28.

### Fase 6 — Fechamento

```
T13, T17, T22, T29 → T32
T25, T30, T31, T32 → T33 → T34
```

T33 e T34 são e2e — sequenciais por obrigação.

---

## Task Breakdown

### Fase 0 — Fundação

#### T1: Scaffold do monorepo

**What**: Criar o monorepo com pnpm workspaces + Turborepo e os três pacotes vazios compilando.
**Where**: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/{server,web,shared}/`
**Depends on**: None
**Reuses**: —
**Requirement**: PRD §7 (arquitetura)

**Tools**: MCP: `context7` (config de Turborepo) · Skill: NONE

**Done when**:
- [ ] `pnpm install` roda sem erro
- [ ] Os três pacotes existem com `package.json` e `tsconfig.json` próprios
- [ ] `shared` é importável por `server` e `web` via referência de workspace
- [ ] `pnpm gate:build` passa (typecheck de todos os pacotes, `e2e/` e os configs)
- [ ] `.gitignore` cobre `node_modules`, `dist`, `*.db`

**Verify**: `pnpm turbo build` completa sem erro.

**Tests**: none · **Gate**: build
**Commit**: `chore: scaffold pnpm+turborepo monorepo`

---

#### T2: Ferramental de teste

**What**: Configurar Vitest e Playwright com os três comandos de gate funcionando.
**Where**: `vitest.config.ts`, `playwright.config.ts`, `packages/*/vitest.config.ts`, scripts no `package.json` raiz
**Depends on**: T1
**Reuses**: `tsconfig.base.json` do T1
**Requirement**: matriz de cobertura acima

**Tools**: MCP: `context7` (Vitest workspace, Playwright) · Skill: `playwright-skill`

**Done when**:
- [ ] Vitest roda nos três pacotes com um teste trivial em cada
- [ ] Playwright instalado com um teste trivial que sobe e derruba o servidor
- [ ] `pnpm gate:quick` funciona
- [ ] `pnpm gate:full` funciona
- [ ] Testing Library configurada no `web`
- [ ] Test count: 4 testes passam (3 unit triviais + 1 e2e trivial)

**Verify**: os três comandos de gate rodam limpos.

**Tests**: unit · **Gate**: full
**Commit**: `chore: setup vitest + playwright`

---

#### T3: Servidor HTTP + tRPC base

**What**: Servidor Fastify com adapter tRPC montado e uma procedure `health`.
**Where**: `packages/server/src/{server.ts,trpc.ts,routers/index.ts}`, `packages/shared/src/types.ts`
**Depends on**: T2
**Reuses**: —
**Requirement**: PRD §7

**Tools**: MCP: `context7` (tRPC v11 + Fastify adapter) · Skill: NONE

**Done when**:
- [ ] Servidor sobe numa porta configurável por env
- [ ] `appRouter` exportado com `health` retornando `{ ok: true, version }`
- [ ] Tipo `AppRouter` alcançável pelo cliente **sem** dar a ele acesso ao runtime do servidor
  <br>⚠️ *Desvio do plano original, que dizia "exportado por `shared`". Isso criaria ciclo `shared → server → shared`. O tipo sai por `@lumem/server/router-types`, um módulo só de `export type` que compila para vazio — o `web` não consegue importar fastify por acidente.*
- [ ] Desligamento gracioso em `SIGINT`/`SIGTERM`
- [ ] Teste de integração chama `health` e recebe `ok`
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: 1 teste novo passa

**Verify**: `curl` no endpoint de health devolve 200.

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): fastify + trpc base`

---

#### T4: App web base

**What**: App Vite + React com cliente tRPC tipado conectado ao servidor.
**Where**: `packages/web/src/{main.tsx,App.tsx,lib/trpc.ts}`, `packages/web/vite.config.ts`
**Depends on**: T3
**Reuses**: tipo `AppRouter` do T3
**Requirement**: PRD §7

**Tools**: MCP: `context7` (`@trpc/react-query` v11) · Skill: NONE

**Done when**:
- [ ] `pnpm dev` sobe web e servidor juntos via Turborepo
- [ ] Proxy do Vite encaminha `/trpc` pro servidor
- [ ] A tela renderiza o resultado de `health`, provando a ponta a ponta tipada
- [ ] Autocomplete do `AppRouter` funciona no editor (checagem manual)
- [ ] Teste de componente monta o App com cliente tRPC mockado
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: 1 teste novo passa

**Verify**: abrir o navegador e ver a versão do servidor na tela.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): vite + react + trpc client`

---

### Fase 1 — Fatia de risco: PTY ponta a ponta

> Esta fase existe pra falhar cedo se a arquitetura estiver errada. Nada de banco, nada de CRUD, `cwd` fixo.

#### T5: PtyManager

**What**: Serviço em memória que faz spawn, write, resize e kill de PTY, com ring buffer de 10 mil linhas por sessão.
**Where**: `packages/server/src/pty/PtyManager.ts`, `packages/server/src/pty/RingBuffer.ts`
**Depends on**: T4
**Reuses**: —
**Requirement**: PRD F5.3, F5.4, F5.8, F5.9, §7 (ring buffer)

**Tools**: MCP: `context7` (`node-pty`) · Skill: NONE

**Done when**:
- [ ] `spawn({ command, args, env, cwd })` devolve um id de sessão
- [ ] `write(id, data)` entrega no processo
- [ ] `resize(id, cols, rows)` propaga
- [ ] `kill(id)` encerra e marca `exited` com exit code
- [ ] Processo que morre sozinho emite evento e vira `exited`, sem derrubar o servidor
- [ ] Ring buffer trunca em 10 mil linhas descartando as mais antigas
- [ ] `getBuffer(id)` devolve o conteúdo pra repaint
- [ ] Múltiplas sessões simultâneas não vazam nem se misturam
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥8 testes passam

**Verify**: teste de integração faz spawn de `bash -c 'echo hello'`, lê o buffer, confirma `hello` e exit code 0.

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): pty manager with ring buffer`

---

#### T6: Endpoint WebSocket de PTY

**What**: Rota WebSocket que liga um cliente a uma sessão de PTY, com replay do buffer no attach.
**Where**: `packages/server/src/pty/websocket.ts`, `packages/shared/src/pty-protocol.ts`
**Depends on**: T5
**Reuses**: `PtyManager` do T5
**Requirement**: PRD F5.6, F5.7, F7.2

**Tools**: MCP: `context7` (`ws` + Fastify) · Skill: NONE

**Done when**:
- [ ] Protocolo de mensagem definido em `shared` e tipado nos dois lados
- [ ] Attach por id de sessão manda o buffer inteiro antes de qualquer byte novo
- [ ] Input do cliente chega no PTY
- [ ] Resize do cliente chega no PTY
- [ ] Output do PTY é transmitido a quem está anexado
- [ ] Desconectar **não** mata a sessão
- [ ] Reanexar depois de desconectar entrega o buffer atualizado
- [ ] Anexar em id inexistente devolve erro tipado e fecha limpo
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥7 testes passam

**Verify**: teste de integração anexa, escreve, desconecta, espera output, reanexa e confirma que o que passou durante a desconexão está no buffer.

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): pty websocket with buffer replay`

---

#### T7: Componente Terminal

**What**: Componente React que renderiza `xterm.js` ligado ao WebSocket de PTY.
**Where**: `packages/web/src/components/Terminal.tsx`, `packages/web/src/lib/pty-socket.ts`
**Depends on**: T6
**Reuses**: protocolo de `shared` do T6
**Requirement**: PRD F5.3, F5.7

**Tools**: MCP: `context7` (`xterm.js` + `@xterm/addon-fit`) · Skill: NONE

**Done when**:
- [ ] Terminal renderiza e recebe foco
- [ ] Teclado é enviado pelo socket
- [ ] Output é escrito na tela com cores preservadas
- [ ] Resize da janela dispara `fit` e envia as novas dimensões
- [ ] Desmontar o componente fecha o socket **sem** matar a sessão
- [ ] Remontar reanexa e repinta a partir do buffer
- [ ] Teste de componente com socket mockado cobre montar, receber output, mandar tecla e desmontar
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥4 testes passam

**Verify**: teste de componente confirma que bytes recebidos aparecem no buffer do xterm.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): xterm terminal component`

---

#### T8: Tela provisória de terminal

**What**: Tela mínima que cria uma sessão de shell com `cwd` fixo e mostra o terminal.
**Where**: `packages/web/src/pages/TerminalSpike.tsx`, procedure `pty.spawnShell` em `packages/server/src/routers/pty.ts`
**Depends on**: T7
**Reuses**: `Terminal` do T7, `PtyManager` do T5
**Requirement**: prova da fatia vertical — vira a base de F5.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Procedure tRPC cria sessão de shell com `cwd` vindo de configuração e devolve o id
- [ ] A tela lista as sessões vivas e deixa alternar entre elas
- [ ] Alternar de sessão **não** mata a anterior
- [ ] Botão de fechar encerra a sessão
- [ ] Teste de integração cobre a procedure
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥3 testes passam

**Verify**: abrir a tela, rodar `ls`, ver a saída.

**Tests**: integration · **Gate**: quick
**Commit**: `feat: terminal vertical slice`

---

#### T9: 🚩 E2E crítico — sessão sobrevive ao cliente

**What**: Teste Playwright que prova o critério de sucesso do PRD: fechar o navegador não mata a sessão.
**Where**: `e2e/session-survives-client.spec.ts`
**Depends on**: T8
**Reuses**: setup do Playwright do T2
**Requirement**: PRD §1 (critério de sucesso), F5.6, F7.2

**Tools**: MCP: NONE · Skill: `playwright-skill`

**Done when**:
- [ ] O teste abre a tela, cria sessão, roda um comando de longa duração que escreve na saída
- [ ] Fecha o contexto do navegador por completo
- [ ] Espera tempo suficiente pro comando produzir saída nova
- [ ] Abre contexto novo, reanexa na mesma sessão
- [ ] **Confere que a saída produzida durante a ausência está no buffer**
- [ ] Confere que o processo continua vivo e aceita input novo
- [ ] Gate check passa: `pnpm gate:full`
- [ ] Test count: 1 teste e2e novo passa

**Verify**: `pnpm playwright test session-survives-client` verde.

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): session survives client disconnect`

> **Portão de fase.** Vermelho aqui significa que a arquitetura de PTY está errada. Pare e conserte antes da Fase 2 — todo o resto se apoia nisso.

---

### Fase 2 — Persistência

#### T10: Schema e migração inicial

**What**: Schema Drizzle com as cinco tabelas do PRD e a primeira migração.
**Where**: `packages/server/src/db/schema.ts`, `packages/server/src/db/index.ts`, `drizzle/`
**Depends on**: T9
**Reuses**: modelo de dados do PRD §6
**Requirement**: PRD §6

**Tools**: MCP: `context7` (Drizzle + better-sqlite3) · Skill: NONE

**Done when**:
- [ ] Tabelas `workspace`, `project`, `worktree`, `agent_config`, `session` conforme PRD §6
- [ ] `created_at` e `updated_at` em todas
- [ ] Constraints de unicidade: `workspace.name`, `project.path`, `project.name` por workspace, `worktree.name` por projeto, `agent_config.name`
- [ ] Chaves estrangeiras com `ON DELETE RESTRICT` — a proibição de cascata do PRD é do banco, não só da aplicação
- [ ] `session.kind = 'agent'` exige `agent_config_id` (constraint CHECK)
- [ ] Migração roda em banco vazio e é idempotente
- [ ] Caminho do banco configurável, default `~/.lumem/lumem.db`
- [ ] Teste de integração cria banco temporário, roda migração e valida cada constraint
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Verify**: `pnpm drizzle-kit` gera sem drift; inspeção do schema bate com o PRD §6.

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): sqlite schema + initial migration`

---

#### T11: Base de repositório e harness de teste

**What**: Utilitário de acesso a dados e harness que dá a cada teste um banco temporário isolado.
**Where**: `packages/server/src/db/testing.ts`, `packages/server/src/repositories/base.ts`
**Depends on**: T10
**Reuses**: schema do T10
**Requirement**: viabiliza toda a Fase 3+

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `withTestDb()` cria SQLite em arquivo temporário, roda migração, devolve handle e limpa no fim
- [ ] Dois testes em paralelo não compartilham banco (requisito de parallel-safe da matriz)
- [ ] Erro de constraint do SQLite vira erro tipado de domínio, não vaza o erro cru
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥3 testes passam

**Verify**: rodar a suíte com concorrência e confirmar zero interferência.

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): repository base + test harness`

---

### Fase 3 — Workspace e projeto

#### T12: Repositório de workspace `[P]`

**What**: CRUD de workspace na camada de dados.
**Where**: `packages/server/src/repositories/workspace.ts`
**Depends on**: T11
**Reuses**: `base.ts` e `withTestDb` do T11
**Requirement**: PRD F1.1–F1.5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `create`, `list`, `rename`, `remove`, `findById`
- [ ] Nome duplicado devolve erro tipado
- [ ] `remove` com projetos vinculados devolve erro tipado (F1.5)
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): workspace repository`

---

#### T13: Router tRPC de workspace

**What**: Procedures de workspace expostas com validação Zod.
**Where**: `packages/server/src/routers/workspace.ts`
**Depends on**: T12
**Reuses**: repositório do T12, padrão de router do T3
**Requirement**: PRD F1.1–F1.5, §7 (paridade API ↔ cliente)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `list`, `create`, `rename`, `remove` expostas
- [ ] Entrada validada com Zod, nome não vazio e com limite de tamanho
- [ ] Erros de domínio viram `TRPCError` com código adequado
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥5 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): workspace router`

---

#### T14: UI de workspace

**What**: Seletor de workspace no topo da sidebar e tela de primeiro uso.
**Where**: `packages/web/src/components/{WorkspaceSelector.tsx,FirstRun.tsx}`, `packages/web/src/layout/AppShell.tsx`
**Depends on**: T13
**Reuses**: cliente tRPC do T4
**Requirement**: PRD F1.3, F3.5, §5 (primeiro uso)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `AppShell` com sidebar à esquerda e área principal à direita
- [ ] Sem nenhum workspace, aparece a tela de criação e nada mais (§5)
- [ ] Seletor lista os workspaces e troca o ativo
- [ ] Workspace ativo persiste entre reloads
- [ ] Teste de componente cobre estado vazio, criação e troca
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥4 testes passam

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): workspace selector + first run`

---

#### T15: GitService — validação e branch default

**What**: Serviço de git com validação de repositório e resolução da branch default.
**Where**: `packages/server/src/git/GitService.ts`, `packages/server/src/git/exec.ts`
**Depends on**: T3
**Reuses**: —
**Requirement**: PRD F2.2, F4.3, §7 (git via CLI)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `exec` roda `git` com cwd e timeout, capturando stdout/stderr separados
- [ ] `isGitRepo(path)` distingue: não existe, não é diretório, não é repo, é subdiretório e não raiz
- [ ] `resolveDefaultBranch(path)` usa o `HEAD` do remote origin, caindo pra branch atual quando não há remote
- [ ] Erro do git é propagado **literal**, sem tradução (PRD §8)
- [ ] Testes criam repos git temporários de verdade: com remote, sem remote, não-repo, subdiretório
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥8 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): git service — validation + default branch`

---

#### T16: Repositório de projeto `[P]`

**What**: CRUD de projeto na camada de dados.
**Where**: `packages/server/src/repositories/project.ts`
**Depends on**: T11
**Reuses**: `base.ts` do T11
**Requirement**: PRD F2.1–F2.5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `create`, `listByWorkspace`, `rename`, `remove`, `findById`
- [ ] `path` duplicado devolve erro tipado
- [ ] Nome duplicado dentro do mesmo workspace devolve erro tipado
- [ ] `remove` com worktrees vinculadas devolve erro tipado (F2.5)
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): project repository`

---

#### T17: Router tRPC de projeto

**What**: Procedures de projeto, validando o repositório git na adição.
**Where**: `packages/server/src/routers/project.ts`
**Depends on**: T15, T16
**Reuses**: `GitService` do T15, repositório do T16
**Requirement**: PRD F2.1–F2.5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `add` valida com `GitService` **antes** de gravar; falhou, nada é registrado (PRD §8)
- [ ] Mensagem de erro diz **qual** validação falhou (F2.2)
- [ ] Nome default é o basename do diretório (F2.3)
- [ ] `default_branch` é resolvida e gravada na adição
- [ ] `list` marca como indisponível o projeto cujo path sumiu do disco (PRD §8)
- [ ] `remove` não toca no disco (F2.5)
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥8 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): project router`

---

#### T18: UI de projetos na sidebar

**What**: Lista de projetos na sidebar e diálogo de adicionar projeto.
**Where**: `packages/web/src/components/{ProjectList.tsx,AddProjectDialog.tsx,ProjectDetail.tsx}`
**Depends on**: T14, T17
**Reuses**: `AppShell` do T14
**Requirement**: PRD F3.1, F3.5, F3.6, F2.1–F2.3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Sidebar lista os projetos do workspace ativo
- [ ] Diálogo aceita caminho absoluto e mostra o erro de validação vindo do servidor
- [ ] Clicar num projeto mostra o detalhe na área principal
- [ ] Projeto indisponível é sinalizado visualmente e tem as ações bloqueadas
- [ ] Teste de componente cobre lista, adição com sucesso, adição com erro e seleção
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥5 testes passam

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): project sidebar + add dialog`

---

### Fase 4 — Worktree

#### T19: GitService — operações de worktree `[P]`

**What**: `worktree add`, `list` e `remove` no GitService.
**Where**: `packages/server/src/git/GitService.ts` (modificar)
**Depends on**: T15
**Reuses**: `exec` do T15
**Requirement**: PRD F4.1–F4.7

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `addWorktree({ repoPath, branch, targetPath, baseBranch })` cria branch nova a partir da base
- [ ] Branch já existente é detectada **antes** de tentar, com erro tipado (F4.2)
- [ ] Nome com `/` vira diretório aninhado e funciona (F4.5)
- [ ] `listWorktrees(repoPath)` faz o parse de `git worktree list --porcelain`
- [ ] `removeWorktree(path, { force })` roda `git worktree remove`, **sem** apagar a branch (F4.7)
- [ ] Falha do git não deixa estado parcial
- [ ] Testes usam repos temporários reais, incluindo o caso de nome com barra
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥8 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): git service — worktree ops`

---

#### T20: GitService — status da worktree `[P]`

**What**: Status de limpeza e distância em commits em relação à branch base.
**Where**: `packages/server/src/git/GitService.ts` (modificar)
**Depends on**: T15
**Reuses**: `exec` do T15
**Requirement**: PRD F4.8, F4.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `getStatus(path)` devolve limpa ou suja mais a contagem de arquivos modificados
- [ ] Arquivo não rastreado conta como sujo
- [ ] `getAheadBehind(path, baseBranch)` devolve os dois números
- [ ] Testes cobrem: limpa, com modificação, com arquivo novo, à frente, atrás
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): git service — worktree status`

---

#### T21: Repositório de worktree

**What**: CRUD de worktree na camada de dados.
**Where**: `packages/server/src/repositories/worktree.ts`
**Depends on**: T11
**Reuses**: `base.ts` do T11
**Requirement**: PRD F4.6, §6

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `create`, `listByProject`, `remove`, `findById`, `markMissing`
- [ ] Nome duplicado no mesmo projeto devolve erro tipado
- [ ] `state` aceita só `active` e `missing`
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥5 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): worktree repository`

---

#### T22: Router tRPC de worktree

**What**: Procedures de worktree amarrando git e banco, com as regras de bloqueio.
**Where**: `packages/server/src/routers/worktree.ts`
**Depends on**: T17, T19, T20, T21
**Reuses**: `GitService` dos T19/T20, repositório do T21
**Requirement**: PRD F4.1–F4.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `create` monta o caminho como `~/.lumem/worktrees/<projeto>/<nome>` (F4.4)
- [ ] Nasce da `default_branch` gravada no projeto, sem `fetch` (F4.3)
- [ ] Falha no git não grava registro nenhum (PRD §8)
- [ ] `list` devolve nome, branch, caminho e estado
- [ ] `remove` bloqueia quando suja, informando a contagem, e aceita `force` explícito (F4.8)
- [ ] `getDetail` devolve branch, caminho, limpeza e ahead/behind (F4.10)
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥9 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): worktree router`

---

#### T23: Reconciliação de boot

**What**: No start do servidor, alinhar o registro de worktrees com a realidade do disco.
**Where**: `packages/server/src/boot/reconcile.ts`
**Depends on**: T22
**Reuses**: `GitService` do T19, repositório do T21
**Requirement**: PRD F7.4, §8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Worktree registrada com caminho ausente vira `missing` — **não** é deletada
- [ ] Worktree `missing` cujo caminho reapareceu volta pra `active`
- [ ] Reconciliação roda antes de o servidor aceitar conexão
- [ ] Erro em um projeto não aborta a reconciliação dos outros
- [ ] Teste apaga o diretório por fora, roda a reconciliação e confirma o `missing`
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥4 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): boot reconciliation`

---

#### T24: UI de worktrees na sidebar

**What**: Worktrees aninhadas sob o projeto e diálogo de criação.
**Where**: `packages/web/src/components/{WorktreeTree.tsx,CreateWorktreeDialog.tsx}`
**Depends on**: T18, T22
**Reuses**: `ProjectList` do T18
**Requirement**: PRD F3.2, F3.3, F4.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Projeto expande e mostra suas worktrees com nome e branch
- [ ] Diálogo de criação mostra o erro de branch duplicada vindo do servidor
- [ ] Worktree `missing` aparece visualmente distinta
- [ ] Indicador de carregando durante a criação, que não é instantânea
- [ ] Teste de componente cobre expandir, criar com sucesso, criar com erro e estado missing
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥5 testes passam

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): worktree tree + create dialog`

---

#### T25: UI de detalhe da worktree

**What**: Painel de detalhe com branch, caminho, limpeza e ahead/behind.
**Where**: `packages/web/src/components/WorktreeDetail.tsx`
**Depends on**: T20, T24
**Reuses**: `getDetail` do T22
**Requirement**: PRD F4.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Mostra branch, caminho absoluto, limpa ou suja e ahead/behind
- [ ] Ação de remover, exibindo o motivo do bloqueio quando houver
- [ ] Confirmação explícita para o caso de forçar
- [ ] Teste de componente cobre limpa, suja e remoção bloqueada
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥4 testes passam

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): worktree detail panel`

---

### Fase 5 — Sessões e agentes

#### T26: Persistência de sessão `[P]`

**What**: Repositório de sessão e ligação do `PtyManager` com o banco.
**Where**: `packages/server/src/repositories/session.ts`, `packages/server/src/pty/PtyManager.ts` (modificar)
**Depends on**: T11, T22
**Reuses**: `PtyManager` do T5, `base.ts` do T11
**Requirement**: PRD F7.1, §6

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Spawn grava a sessão com `kind`, escopo, `cwd`, `command` e `state = running`
- [ ] Saída do processo atualiza `state = exited` e grava o `exit_code`
- [ ] `listByScope` e `listRunning`
- [ ] O ring buffer continua só em memória — sem persistência (PRD §7)
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): session persistence`

---

#### T27: Reconciliação de sessões órfãs

**What**: No boot, marcar como encerrada toda sessão que ficou `running` do processo anterior.
**Where**: `packages/server/src/boot/reconcile.ts` (modificar)
**Depends on**: T26
**Reuses**: reconciliação do T23
**Requirement**: PRD F7.3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Toda sessão `running` vira `exited` no boot — o PTY não sobrevive ao restart do daemon
- [ ] Roda junto com a reconciliação de worktree, antes de aceitar conexão
- [ ] Teste grava sessão `running`, simula restart e confirma o `exited`
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥2 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): orphan session reconciliation`

---

#### T28: Configurações de agente `[P]`

**What**: Repositório de `agent_config`, seed do Claude Code e checagem de disponibilidade no `PATH`.
**Where**: `packages/server/src/repositories/agentConfig.ts`, `packages/server/src/agents/availability.ts`, seed na migração
**Depends on**: T11
**Reuses**: `base.ts` do T11
**Requirement**: PRD F6.1–F6.5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] CRUD de `agent_config` com `name`, `command`, `args`, `env`
- [ ] Seed cria **uma** config: Claude Code, comando `claude`, `args` vazio, `env` vazio (F6.4)
- [ ] Seed é idempotente entre restarts
- [ ] `isAvailable(config)` resolve o comando no `PATH` do servidor
- [ ] `list` devolve a flag de disponibilidade junto (F6.5)
- [ ] Teste cobre comando existente e comando inexistente
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): agent configs + availability`

---

#### T29: Router tRPC de sessão

**What**: Procedures de sessão para shell e agente, com resolução de escopo.
**Where**: `packages/server/src/routers/session.ts`
**Depends on**: T26, T28
**Reuses**: `PtyManager` do T26, configs do T28
**Requirement**: PRD F5.1, F5.2, F5.4, F5.8, F5.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `createShell({ scopeType, scopeId })` resolve o `cwd` do projeto ou da worktree (F5.1)
- [ ] `createAgent({ scopeType, scopeId, agentConfigId })` aceita escopo de projeto **e** de worktree (F5.2, decisão WS-Q15)
- [ ] Config indisponível é recusada antes de tentar o spawn (F6.5)
- [ ] Shell usa o shell de login do usuário; agente usa o comando da config, herdando o ambiente mais o `env` declarado (F5.5)
- [ ] `list`, `close`, `getDetail` com tipo, escopo, comando e estado (F5.10)
- [ ] Escopo inexistente devolve erro tipado
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥9 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): session router — shell + agent`

---

#### T30: Bloqueio de remoção por sessão viva

**What**: Impedir remoção de worktree e de projeto quando houver sessão rodando.
**Where**: `packages/server/src/routers/{worktree.ts,project.ts}` (modificar)
**Depends on**: T22, T29
**Reuses**: `listRunning` do T26
**Requirement**: PRD F4.9, F2.5, §8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Remover worktree com sessão viva é bloqueado, informando **quantas** (F4.9)
- [ ] O bloqueio por sessão é verificado junto com o de worktree suja, e a mensagem diz qual dos dois é o motivo (PRD §5)
- [ ] Remover projeto com worktree é bloqueado (F2.5)
- [ ] Sessão `exited` **não** bloqueia
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): block removal with live sessions`

---

#### T31: UI de sessões

**What**: Sessões na sidebar, ações de abrir shell e agente, e painel de detalhe.
**Where**: `packages/web/src/components/{SessionList.tsx,NewSessionMenu.tsx,SessionDetail.tsx}`, remover `TerminalSpike.tsx`
**Depends on**: T7, T24, T29
**Reuses**: `Terminal` do T7, `WorktreeTree` do T24
**Requirement**: PRD F3.4, F5.1, F5.2, F5.6–F5.10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Worktree expande e mostra suas sessões, com ícone distinguindo shell de agente (F3.4)
- [ ] Menu de nova sessão lista shell mais as configs de agente disponíveis, com as indisponíveis desabilitadas
- [ ] Selecionar sessão mostra o terminal na área principal
- [ ] Trocar de item **não** mata a sessão e voltar restaura o conteúdo (F5.6, F5.7)
- [ ] Sessão encerrada aparece distinta, com o buffer ainda legível (F5.9)
- [ ] A tela provisória do T8 é removida
- [ ] Teste de componente cobre listar, abrir shell, abrir agente, agente indisponível e sessão encerrada
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥6 testes passam

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): session list + terminal view`

---

### Fase 6 — Fechamento

#### T32: Atualização viva da sidebar

**What**: Servidor empurra mudança de estado; a sidebar reflete sem refresh manual.
**Where**: `packages/server/src/events.ts`, procedure de subscription, `packages/web/src/hooks/useLiveState.ts`
**Depends on**: T13, T17, T22, T29
**Reuses**: routers das fases anteriores
**Requirement**: PRD F3.7

**Tools**: MCP: `context7` (subscriptions do tRPC v11) · Skill: NONE

**Done when**:
- [ ] Emissor de eventos no servidor dispara em criar, remover e mudar estado
- [ ] Subscription tRPC entrega os eventos ao cliente
- [ ] Sidebar reage sem refresh manual (F3.7)
- [ ] Sessão que morre sozinha atualiza a sidebar
- [ ] Cliente reconecta a subscription depois de queda e ressincroniza
- [ ] Gate check passa: `pnpm gate:quick`
- [ ] Test count: ≥5 testes passam

**Tests**: integration · **Gate**: quick
**Commit**: `feat: live state updates`

---

#### T33: E2E — caminho feliz completo

**What**: Teste Playwright cobrindo o fluxo inteiro do PRD, de workspace até agente.
**Where**: `e2e/happy-path.spec.ts`
**Depends on**: T25, T30, T31, T32
**Reuses**: setup do T2, padrões do T9
**Requirement**: PRD §9 (critérios de aceite)

**Tools**: MCP: NONE · Skill: `playwright-skill`

**Done when**:
- [ ] Cria workspace, adiciona um repo git de fixture, confere na sidebar
- [ ] Cria worktree; confere que existe no disco e aparece em `git worktree list` do repo original
- [ ] Abre shell na worktree, roda `git status`, confere a branch correta na saída
- [ ] Abre um segundo shell no projeto; os dois funcionam ao mesmo tempo
- [ ] Sobe uma sessão de agente com config de fixture (não o `claude` de verdade)
- [ ] Sobe agente direto no projeto principal, sem worktree (decisão WS-Q15)
- [ ] Navega pra outro item e volta; a sessão continua viva com o conteúdo anterior
- [ ] Encerra as sessões, remove a worktree, confere que sumiu do disco e da sidebar
- [ ] Gate check passa: `pnpm gate:full`
- [ ] Test count: 1 teste e2e novo passa

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): full happy path`

---

#### T34: E2E — erros e bloqueios

**What**: Teste Playwright cobrindo os estados degradados do PRD §8.
**Where**: `e2e/error-cases.spec.ts`
**Depends on**: T33
**Reuses**: fixtures do T33
**Requirement**: PRD §8, §9

**Tools**: MCP: NONE · Skill: `playwright-skill`

**Done when**:
- [ ] Adicionar diretório que não é repo git é recusado com mensagem clara
- [ ] Criar worktree com branch já existente é recusado
- [ ] Remover worktree com sessão viva é bloqueado com o motivo certo
- [ ] Remover worktree suja é bloqueado e a opção de forçar funciona
- [ ] Config de agente com comando inexistente aparece indisponível e não deixa lançar
- [ ] Worktree apagada por fora vira `missing` depois do restart do servidor, em vez de sumir
- [ ] Gate check passa: `pnpm gate:full`
- [ ] Test count: 1 teste e2e novo passa

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): error and blocking cases`

---

## Validação pré-aprovação

### Check 1 — Granularidade

| Task | Escopo | Status |
|---|---|---|
| T1 | config de monorepo | ✅ |
| T2 | config de teste | ✅ |
| T3 | 1 servidor + 1 procedure | ✅ |
| T4 | 1 app base | ✅ |
| T5 | 1 serviço + 1 estrutura de dados | ✅ |
| T6 | 1 endpoint | ✅ |
| T7 | 1 componente | ✅ |
| T8 | 1 tela + 1 procedure | ✅ |
| T9 | 1 teste e2e | ✅ |
| T10 | 1 schema + 1 migração | ✅ |
| T11 | 1 harness + 1 base | ✅ |
| T12, T16, T21, T26, T28 | 1 repositório cada | ✅ |
| T13, T17, T22, T29 | 1 router cada | ✅ |
| T14, T18, T24, T25, T31 | 1 grupo coeso de componentes cada | ✅ |
| T15, T19, T20 | 1 grupo coeso de métodos no GitService | ✅ |
| T23, T27 | 1 rotina de boot cada | ✅ |
| T30 | 1 regra atravessando 2 routers | ⚠️ coeso — é uma regra só |
| T32 | 1 mecanismo de evento | ✅ |
| T33, T34 | 1 teste e2e cada | ✅ |

Nenhum ❌.

### Check 2 — Cruzamento diagrama × definição

| Task | `Depends on` no corpo | Diagrama mostra | Status |
|---|---|---|---|
| T1 | — | raiz | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T6 | T6→T7 | ✅ |
| T8 | T7 | T7→T8 | ✅ |
| T9 | T8 | T8→T9 | ✅ |
| T10 | T9 | T9→T10 | ✅ |
| T11 | T10 | T10→T11 | ✅ |
| T12 `[P]` | T11 | T11→T12 | ✅ |
| T13 | T12 | T12→T13 | ✅ |
| T14 | T13 | T13→T14 | ✅ |
| T15 | T3 | T3→T15 | ✅ |
| T16 `[P]` | T11 | T11→T16 | ✅ |
| T17 | T15, T16 | T15→T17, T16→T17 | ✅ |
| T18 | T14, T17 | T14→T18, T17→T18 | ✅ |
| T19 `[P]` | T15 | T15→T19 | ✅ |
| T20 `[P]` | T15 | T15→T20 | ✅ |
| T21 | T11 | T11→T21 | ✅ |
| T22 | T17, T19, T20, T21 | as quatro setas | ✅ |
| T23 | T22 | T22→T23 | ✅ |
| T24 | T18, T22 | T22+T18→T24 | ✅ |
| T25 | T20, T24 | T24→T25 | ✅ |
| T26 `[P]` | T11, T22 | T11→T26 | ✅ |
| T27 | T26 | T26→T27 | ✅ |
| T28 `[P]` | T11 | T11→T28 | ✅ |
| T29 | T26, T28 | T26→T29, T28→T29, T22→T29 | ✅ |
| T30 | T22, T29 | T29→T30 | ✅ |
| T31 | T7, T24, T29 | T24,T7→T31 | ✅ |
| T32 | T13, T17, T22, T29 | as quatro | ✅ |
| T33 | T25, T30, T31, T32 | as quatro | ✅ |
| T34 | T33 | T33→T34 | ✅ |

**Pares `[P]` conferidos:** (T12, T16) não dependem um do outro. (T19, T20) idem. (T26, T28) idem. ✅

### Check 3 — Co-locação de testes

| Task | Camada criada | Matriz exige | Task diz | Status |
|---|---|---|---|---|
| T1 | config | none | none | ✅ |
| T2 | config de teste | unit | unit | ✅ |
| T3 | router tRPC | integration | integration | ✅ |
| T4 | componente web | unit | unit | ✅ |
| T5 | PTY manager | integration | integration | ✅ |
| T6 | WebSocket | integration | integration | ✅ |
| T7 | componente web | unit | unit | ✅ |
| T8 | componente + router | unit + integration → maior | integration | ✅ |
| T9 | fluxo | e2e | e2e | ✅ |
| T10 | repositório | integration | integration | ✅ |
| T11 | repositório | integration | integration | ✅ |
| T12 | repositório | integration | integration | ✅ |
| T13 | router | integration | integration | ✅ |
| T14 | componente | unit | unit | ✅ |
| T15 | serviço de git | integration | integration | ✅ |
| T16 | repositório | integration | integration | ✅ |
| T17 | router | integration | integration | ✅ |
| T18 | componente | unit | unit | ✅ |
| T19 | serviço de git | integration | integration | ✅ |
| T20 | serviço de git | integration | integration | ✅ |
| T21 | repositório | integration | integration | ✅ |
| T22 | router | integration | integration | ✅ |
| T23 | serviço de boot | integration | integration | ✅ |
| T24 | componente | unit | unit | ✅ |
| T25 | componente | unit | unit | ✅ |
| T26 | repositório + PTY | integration | integration | ✅ |
| T27 | serviço de boot | integration | integration | ✅ |
| T28 | repositório | integration | integration | ✅ |
| T29 | router | integration | integration | ✅ |
| T30 | router | integration | integration | ✅ |
| T31 | componente | unit | unit | ✅ |
| T32 | router + componente | integration | integration | ✅ |
| T33 | fluxo | e2e | e2e | ✅ |
| T34 | fluxo | e2e | e2e | ✅ |

Nenhuma violação. Nenhum `Tests: none` indevido — o único é o T1, que não cria camada de código.

**Parallel-safe conferido:** T9, T33 e T34 são `e2e`, que a matriz marca como não-paralelizável. Nenhum dos três tem `[P]`. ✅

---

## Rastreabilidade PRD → tasks

| Requisito | Tasks |
|---|---|
| F1 Workspace | T12, T13, T14 |
| F2 Projetos | T15, T16, T17, T18, T30 |
| F3 Sidebar | T14, T18, T24, T31, T32 |
| F4 Worktrees | T19, T20, T21, T22, T24, T25, T30 |
| F5 Sessões | T5, T6, T7, T8, T26, T29, T31 |
| F6 Configs de agente | T28, T29, T31 |
| F7 Persistência | T10, T11, T23, T26, T27 |
| §8 Erros | T15, T17, T22, T23, T27, T30, T34 |
| §9 Aceite | T9, T33, T34 |

Todo requisito do PRD tem pelo menos uma task. Toda task rastreia pelo menos um requisito.

---

## Riscos por task

| Task | Risco | Mitigação |
|---|---|---|
| T5, T6, T7 | O trio de PTY é a maior incerteza do projeto | Isolados na Fase 1, com T9 provando cedo |
| T9 | Se falhar, a arquitetura está errada | É portão de fase — não avance vermelho |
| T19 | `git worktree` tem casos de borda em nome com barra e branch existente | Testes com repos reais, não mock |
| T29 | Agente é PTY cru; o servidor não sabe o que acontece lá dentro | Aceito no PRD; e2e usa fixture, não o `claude` de verdade |
| T32 | Subscription mal feita causa vazamento de listener | Teste de reconexão cobre |
