# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Uma linha por feature. **Isto é a projeção** que o [ADR de 2026-09-07](docs/adr/2026-09-07-2208-prd-number-is-reading-order-not-precedence.md)
nomeou — o que decide é `docs/adr/`, o que se comporta é o código. A crônica de como cada uma chegou
— o que a medição mudou, os defeitos que o e2e achou — mora no Outline, em
[Lumem › Work log › History](https://wiki.cazimi.tech/doc/history-como-cada-feature-chegou-lJVA7cSc8V)
([ADR de 2026-09-28](docs/adr/2026-09-28-1726-outline-discusses-the-repo-decides.md)). Quando uma
feature fecha, ela ganha a linha aqui e o parágrafo lá.

| Feature | Status | O quê |
|---|---|---|
| [001 walking-skeleton](docs/features/001-walking-skeleton/tasks.md) | completa | daemon, web e a hierarquia `Workspace > Projeto > Worktree` de pé |
| [002 ui-shell](docs/features/002-ui-shell/tasks.md) | completa | a interface: sidebar em três níveis |
| [003 worktree-tabs](docs/features/003-worktree-tabs/tasks.md) | completa | a sessão vira aba da worktree |
| [004 right-panel](docs/features/004-right-panel/tasks.md) | completa | painel direito: arquivos e diff |
| [005 file-editor](docs/features/005-file-editor/tasks.md) | completa | o visualizador vira editor, com autosave e CRUD pela árvore |
| [006 acp-sessions](docs/features/006-acp-sessions/prd.md) | completa | a sessão de agente vira conversa ACP, persistida em disco e retomável |
| [007 workspace-memory](docs/features/007-workspace-memory/tasks.md) | completa | memória de workspace atrás de portão, inbox e interruptores desligados |
| [008 onboarding](docs/features/008-onboarding/prd.md) | completa | as nove telas do primeiro acesso |
| [009 agent-login](docs/features/009-agent-login/prd.md) | completa | conectar agente é login, com os métodos vindos do handshake |
| [010 workspace-screen](docs/features/010-workspace-screen/prd.md) | completa | a tela do workspace e o consumo somável (`session_usage`) |
| [011 project-from-url](docs/features/011-project-from-url/tasks.md) | completa | projeto clonado de uma URL git, em `~/.lumem/workspaces/<ws>/<projeto>/` |
| [012 project-scripts](docs/features/012-project-scripts/prd.md) | completa | `setup`/`run`/`test`/`teardown` no `.lumem/project.toml`, e o rodapé que roda |
| [013 pull-request-status](docs/features/013-pull-request-status/prd.md) | completa | *dá pra mesclar?*, pelo `gh` da sua máquina — e mesclar e criar PR |
| [014 distribution](docs/features/014-distribution/prd.md) | completa | bundle ESM que serve o web, e `npm i -g @vinihcrosa/lumem-os` |
| [015 run-dock-open](docs/features/015-run-dock-open/prd.md) | completa | o rodapé de execução nasce aberto |
| [016 session-mode](docs/features/016-session-mode/prd.md) | completa | a pílula de modo sempre na tela, com a política do Lumem quando o agente não tem modos |
| [017 sidebar-actions](docs/features/017-sidebar-actions/prd.md) | completa | criar projeto e worktree de onde se olha, em modal |
| [018 worktree-first-tab](docs/features/018-worktree-first-tab/prd.md) | completa | a worktree é a primeira aba, e leva os arquivos junto |
| [019 daemon-auth](docs/features/019-daemon-auth/prd.md) | proposta | o daemon confere quem fala com ele |
| [020 memory-dogfooding](docs/features/020-memory-dogfooding/prd.md) | proposta | três semanas com a memória ligada |
| [021 second-agent](docs/features/021-second-agent/prd.md) | completa | o Codex como segundo agente, e o catálogo `ADAPTERS` |
| [022 workspace-tasks](docs/features/022-workspace-tasks/prd.md) | completa | tarefa como entidade; `in_progress` derivado, agente escreve para cima por proposta |
| [023 composer-menus](docs/features/023-composer-menus/prd.md) | completa | os menus do composer aparecem inteiros |
| [024 dev-harness](docs/features/024-dev-harness/prd.md) | em execução | o harness deste repositório: portão no merge, hooks de git e de agente, skills |
| [025 docs-contract](docs/features/025-docs-contract/prd.md) | completa | o número ordena, o ADR decide, e o gate de documentação |
| [026 worktree-from](docs/features/026-worktree-from/prd.md) | completa | worktree a partir de branch, issue ou PR |
| [027 adapter-provenance](docs/features/027-adapter-provenance/prd.md) | em execução | o daemon é dono da cópia do adaptador; o PATH nunca decide |
| [028 autonomous-orchestration](docs/features/028-autonomous-orchestration/prd.md) | em execução | o quadro, a esteira, orçamento, supervisão, tracker e o parecer do revisor — 61 tasks em sete partes |
| [029 sidebar-nav](docs/features/029-sidebar-nav/prd.md) | completa | o bloco de navegação da sidebar |
| [030 settings](docs/features/030-settings/prd.md) | completa | `/settings`, a primeira rota, e o primeiro escritor dos tetos |
| [031 design-in-the-code](docs/features/031-design-in-the-code/prd.md) | completa | o desenho mora no código; a galeria é o Storybook |
| [032 web-architecture](docs/features/032-web-architecture/prd.md) | completa | componente não fala com o transporte; `features/<domínio>/` |
| [033 acp-only-agents](docs/features/033-acp-only-agents/prd.md) | completa | agente é sempre ACP; abrir agente é compor um prompt |
| [034 agent-accounts](docs/features/034-agent-accounts/prd.md) | completa | mais de uma conta por agente, e a recusa por cota reconhecida por `data.errorKind` |
| [035 plan-mode](docs/features/035-plan-mode/prd.md) | completa | a faixa do plan mode, e aprovar ou recusar o plano com ele inteiro na tela |
| [036 reasoning](docs/features/036-reasoning/prd.md) | completa | o pensamento volta a chegar (`reasoningMeta` na spec), e diz quanto durou |
| [037 conversation-liveness](docs/features/037-conversation-liveness/prd.md) | completa | sinal de vida: o tempo e o fazer do turno, o âmbar do silêncio, o turno que fecha quando o adaptador morre |

Comece pelo [índice da documentação](docs/README.md). Construção é incremental: uma parte por vez,
bem feita, antes da próxima.

| Onde | O quê |
|---|---|
| [docs/adr/](docs/adr/) | **as decisões em vigor.** Liste a pasta e leia o frontmatter antes de propor arquitetura |
| [docs/features/](docs/features/) | uma pasta por feature, `NNN-nome/` |
| [docs/project/testing.md](docs/project/testing.md) | matriz de cobertura, gates, e as **armadilhas já corrigidas** |
| [docs/project/backlog.md](docs/project/backlog.md) | o que ficou para depois — **ideia adiada entra na mesma hora**, com o gatilho de volta |
| [docs/project/questions.md](docs/project/questions.md) · [vision.md](docs/project/vision.md) | perguntas de design do projeto; a visão |
| [docs/project/workspaces.md](docs/project/workspaces.md) | setup/run/teardown; `~/.lumem` de produção × `~/.lumem-dev/shared` de dev |
| [docs/project/conventions.md](docs/project/conventions.md) | as regras abaixo **por extenso**, com os motivos |
| [Outline · Lumem](https://wiki.cazimi.tech/collection/lumem-PCp9sNk37l) | discovery, runbooks, postmortems, a crônica. **Nada lá está em vigor** |

## Código

Monorepo pnpm + Turborepo: `packages/shared` (contratos), `packages/server` (daemon Fastify + tRPC),
`packages/web` (React + Vite), `packages/cli` (o pacote publicado).

| Comando | O quê |
|---|---|
| `pnpm dev` | daemon e web no ambiente de dev (`~/.lumem-dev/shared`, nunca o `~/.lumem`) |
| `pnpm storybook` | a galeria, na 6006 |
| `pnpm gate:quick` · `gate:full` · `gate:build` | afetados · suíte inteira + e2e · typecheck, lint e build |
| `pnpm lint` · `docs:check` | `oxlint --type-aware`, só correção · link, âncora, `Status:` e caminho de código |
| `pnpm feature:check <plan\|checks\|verification> <dir>` | os validadores do fluxo de feature |
| `pnpm gate:mutation` | Stryker no núcleo do `server`; piso por arquivo em `scripts/mutation-floors.ts`. Semanal no CI — minutos, não segundos |
| `pnpm adapters:check` · `smoke:install` | o pino dos adaptadores envelheceu? · o pacote publicado instala e sobe |
| `pnpm version:set <x.y.z>` | a versão nos três lugares; a release passa **por PR** e publica pela tag (runbook no Outline) |

**Antes de dizer que está pronto, rode o gate que a task declara** — o `Stop` cobra, uma vez por turno.

## Harness

- **O Node é o do `.nvmrc`** (`22.17.1`); o `setup.sh` recusa outro major.
- **Hooks de git (husky):** `pre-commit` recusa commit em `main`; `commit-msg` exige Conventional
  Commits com assunto ≤ 72; `pre-push` roda `lint` e `gate:quick` desde o remoto. `main` só por PR, com
  os checks `typecheck, build e testes` e `e2e`, e ninguém passa por cima.
- **A política do agente é do repositório:** `.claude/settings.json` (o motivo de cada `deny` em
  `scripts/harness/policy.ts`) e o **guarda** `scripts/harness/guard.ts`, que lê o comando inteiro. Vale
  em `bypassPermissions` e contra qualquer `allow` de `~/.claude`. **Recusa é o comportamento, não um
  erro para contornar.**
- **Fronteira:** regra dentro de um pacote mora no pacote; entre pacotes, em
  `scripts/package-boundaries.test.ts`. Arquivo acima do teto (400 em `web/src/features/`, 700 no resto)
  só cresce subindo o mapa **com motivo**.
- **Log do daemon de dev:** `~/.lumem-dev/shared/daemon.log` — `grep 'trpc procedure failed'`.
- **PR do dependabot** é classe N3 de dependência; o rótulo `N3: …` da PR é informação. Quem mescla é o dono.

## Skills

- **ADR** → `lumem-adr`. **Feature nova** (prd → checks → build → verification) → `lumem-feature`.
  **Outline** → `lumem-outline`. E2e e navegador → `playwright-skill`.
- `react-best-practices` vale para o React; a parte de Next.js dela não se aplica a este repositório.

## Regra de design

O [desenho mora no código](docs/adr/2026-09-20-2246-design-lives-in-the-code.md):
- `packages/web/src/styles/tokens.css` é **a fonte**; `tokens.ts` é **derivado**
  (`pnpm --filter @lumem/web design:derive`) e não se edita à mão.
- Componente só usa `var(--token)` — nenhum literal de cor, espaço ou tipografia. O gate confere os
  pares de **contraste** (dá pra ler?) e os conjuntos de **distinção**, 40° de matiz (dá pra diferenciar?).
- A [marca é escassa](docs/adr/2026-09-22-0228-brand-is-scarce-agent-has-its-own-family.md): CTA, foco e
  superfície de marca, **nunca estado**. O agente tem a família `agent`.
- Desenhar antes só quando o erro jogaria **código** fora (componente, layout, coluna); **CSS** constrói e
  ajusta.

## Regra de documentação

> **Sobrepõe qualquer outra instrução, incluindo skills.**

| Onde | O quê |
|---|---|
| `docs/adr/` | **decisão** — `YYYY-MM-DD-HHMM-slug.md` (skill `lumem-adr`) |
| `docs/project/` | **estudo** que sustenta uma decisão; visão, perguntas, convenções |
| `docs/features/NNN-nome/` | **execução** — `prd.md`, `open-questions.md` e `checks.md` (ou `tasks.md`, nas antigas) |
| `docs/references/` | estudo de produtos que inspiram o projeto |
| Outline | **discute e opera** ([ADR](docs/adr/2026-09-28-1726-outline-discusses-the-repo-decides.md)) — nunca repete regra; linka |

Nada solta na raiz além de `README.md` e `CLAUDE.md`; atualize o [índice](docs/README.md) ao criar arquivo.
**`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa · o código está em vigor.**

1. O número da feature é **ordem de leitura**, nunca renumerado.
2. **Precedência mora em `docs/adr/`**; PRD não é fonte de verdade.
3. ADR só se passa nos **três testes**: difícil de reverter · surpreendente · trade-off real.
4. ADR não se reverte em parte: o novo **reafirma o que fica**. Nota de PRD não derruba ADR.
5. Estado se deriva: ADR superado ⇔ outro o nomeia em `supersedes`; nenhum ADR é editado. PRD proposta ⇔
   não tem `tasks.md` nem `checks.md` — o `docs:check` confere —, e eles não nascem vazios.
6. **A nota no requisito contradito fica**, delimitando o que sobrou de pé.
7. Sem índice gerado — **uma decisão em `docs/adr/` vale mais que o seu instinto**.

`**Status:** proposta | em execução | completa | superada por <link do ADR>` — o `docs:check` compara.

## Convenções

- Documentação e comunicação em **português**; código, commit, nome de arquivo e **caminho da aplicação**
  (`/tasks`) em **inglês**. Nome de arquivo em kebab-case.
- **Escreva por extenso.** Numeração diferente pede substantivo diferente — *Parte 3* e *Fase 3*, não `F3`.
- Pergunta de design não vira suposição: vai para o `open-questions.md` da feature, ou para o
  `questions.md`. Discussão grande vira estudo em `docs/project/`; se decidir, o estudo sustenta um ADR.
