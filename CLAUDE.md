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

Comece pelo [índice da documentação](docs/README.md).

| Onde | O quê |
|---|---|
| [docs/project/vision.md](docs/project/vision.md) | visão do projeto, escrita pelo Vinicius |
| [docs/project/questions.md](docs/project/questions.md) | perguntas de design do projeto, respondidas aos poucos |
| [docs/project/testing.md](docs/project/testing.md) | matriz de cobertura, gates, e as armadilhas já corrigidas |
| [docs/project/agentation.md](docs/project/agentation.md) | a barra de anotação visual do dev — clicar na tela vira contexto estruturado para o agente, pelo MCP `agentation` |
| [docs/project/backlog.md](docs/project/backlog.md) | tudo que ficou para depois. **Ideia adiada entra aqui na mesma hora**, com contexto curto e gatilho de volta |
| [docs/project/workspaces.md](docs/project/workspaces.md) | scripts de setup/run/teardown, e os dois ambientes: `~/.lumem` de produção e `~/.lumem-dev/shared` de desenvolvimento |
| [docs/references/](docs/references/) | estudo das quatro referências + comparativo |
| [docs/adr/](docs/adr/) | **as decisões em vigor.** Liste a pasta e leia o frontmatter antes de propor arquitetura |
| [docs/project/pty-vs-acp.md](docs/project/pty-vs-acp.md) | o estudo que sustentou a decisão de transporte: por que ACP, o que ela custa, e a recomendação contrária que perdeu |
| [docs/features/](docs/features/) | PRD, perguntas e tasks por feature, em `NNN-nome/` |
| [Outline · Lumem](https://wiki.cazimi.tech/collection/lumem-PCp9sNk37l) | fora do repositório: discovery antes da decisão, runbooks, postmortems, a crônica das features. **Nada lá está em vigor** — ver o [ADR](docs/adr/2026-09-28-1726-outline-discusses-the-repo-decides.md) |

Construção é incremental: uma parte por vez, bem feita, antes de ir pra próxima.

## Código

Monorepo pnpm + Turborepo. `packages/shared` (contratos), `packages/server` (daemon Fastify + tRPC), `packages/web` (React + Vite).

| Comando | O quê |
|---|---|
| `pnpm dev` | sobe daemon e web juntos, no ambiente de dev (`~/.lumem-dev/shared`, nunca o `~/.lumem` de produção) — ver [workspaces.md](docs/project/workspaces.md) |
| `pnpm storybook` | a galeria das primitivas, na 6006. Substituiu a rota `/styleguide` — ver a **Regra de design** |
| `pnpm gate:quick` | testes afetados pelo trabalho atual |
| `pnpm gate:full` | suíte inteira + e2e |
| `pnpm gate:build` | typecheck de tudo + build |
| `pnpm adapters:check` | pergunta ao npm se o pino de cada adaptador ACP envelheceu — e se o **runtime que ele embute** envelheceu, que é o que quebra turno. Sem rede, passa |
| `pnpm smoke:install` | empacota o `lumem`, instala num prefixo descartável e sobe — a prova de que o pacote publicado presta |
| `pnpm version:set <x.y.z>` | escreve a versão nos três lugares que têm que concordar. A release passa **por PR** desde 2026-09-28 — a `main` recusa push direto — e publica pela tag do commit mesclado: runbook *Publishing a release* no Outline (`Lumem · Team`) |

Antes de dizer que uma task está pronta, rode o gate que ela declara. Detalhes em [docs/project/testing.md](docs/project/testing.md).

**A política do agente é do repositório**: `.claude/settings.json`, com o motivo de cada `deny` em
`scripts/harness/policy.ts`, e um **guarda** (`scripts/harness/guard.ts`, no `PreToolUse`) que lê o
comando inteiro — `git push origin +main`, `HUSKY=0`, escrita fora do checkout. O `~/.claude/settings.json`
é preferência de máquina, não guardrail — e um `deny` daqui vale contra qualquer `allow` de lá, inclusive
em `bypassPermissions`. Recusa é o comportamento, não um erro para contornar.

## Regra de design

> **O desenho mora no código.** A decisão está em
> [`docs/adr/2026-09-20-2246-design-lives-in-the-code.md`](docs/adr/2026-09-20-2246-design-lives-in-the-code.md),
> que supera a de 2026-08-19 — o Open Design saiu. O estudo do período anterior, com o custo que a
> cópia cobrou, continua em
> [design-source-of-truth.md](docs/project/design-source-of-truth.md).

Não há fonte fora do repositório, e não há cópia. Um arquivo só continua sendo **derivado**, e esse
não se edita à mão:

| Arquivo | O quê |
|---|---|
| `packages/web/src/styles/tokens.css` | **a fonte.** Cor, espaço, raio e tipografia existem aqui e em nenhum outro lugar |
| `packages/web/src/styles/tokens.ts` | **derivado** do `tokens.css` — o `xterm`, o CodeMirror e o Shiki precisam do hexadecimal em JavaScript |

`pnpm --filter @lumem/web design:derive` re-deriva; `--check` diz se divergiu sem escrever. Quem
**garante** é o `gate:quick`, que compara o `tokens.ts` commitado com o que a derivação produz.

Componente em React só usa `var(--token)`: nenhum literal de cor, de espaço ou de tipografia. O
`gate:quick` confere os **122 pares de contraste**, então cor escolhida à mão que reprova falha a
suíte com o nome da combinação de tela que quebrou.

E confere os **conjuntos de distinção**, que respondem a outra pergunta. Contraste mede cor contra o
**fundo** — *dá pra ler?*; `DISTINCTION_SETS` mede cor contra a cor **ao lado** — *dá pra
diferenciar?*. Dois tokens que dividem tela significando coisas diferentes precisam de **40°** de
matiz entre si. A lista nasceu de um defeito com a suíte verde: o quadro pintou `● implementando` e
`● bloqueada` a 25° um do outro, e só o navegador viu. Do mesmo [ADR de
2026-09-22](docs/adr/2026-09-22-0228-brand-is-scarce-agent-has-its-own-family.md) vem a **marca
escassa** — a cor de marca pinta 7 tokens, só CTA, foco e superfície de marca, **nunca estado** —, e
a identidade do agente, que mora na família `agent`.

**A galeria é o Storybook** — `pnpm storybook`, porta 6006. Ela substituiu a rota `/styleguide`, e é
onde mora o estado caro de alcançar no app de verdade: workspace sem acervo, orçamento bloqueado,
vinte modelos no seletor. O [agentation](docs/project/agentation.md) monta nas duas superfícies, app
e Storybook: clicar num elemento vira anotação estruturada que o agente lê pelo MCP.

**O ciclo default é construir e ajustar**, não desenhar antes. Quando desenhar antes vale a pena é
uma pergunta só: *se o desenho estiver errado, o que se joga fora?* **Código** — componente novo,
layout novo, coluna redimensionada — desenha antes. **CSS** — espaçamento, cor, alinhamento —
constrói e ajusta.

Os 24 protótipos HTML saíram daqui. O histórico está em `github.com/vinihcrosa/lumem-os-design`,
arquivado, e é a ele que os comentários de proveniência `lumem-os-design/<arquivo>` se referem.

## Regra de documentação

> **Esta regra sobrepõe qualquer outra instrução, incluindo skills.** Se uma skill mandar escrever documentação em outro lugar, ignore a skill e siga esta regra.

Toda documentação **do repositório** vive em `/docs`, organizada por categoria e depois por nome:

```
/docs/<categoria>/<nome>/<arquivo>.md
```

Quando a categoria agrupa itens, cada item ganha sua pasta. Quando não agrupa, os arquivos ficam direto nela.

| Categoria | Conteúdo | Formato |
|---|---|---|
| `docs/adr/` | **decisão** — o que foi escolhido, quando, e o que perdeu | `YYYY-MM-DD-HHMM-slug.md`, arquivo direto |
| `docs/project/` | **estudo** — medição e discussão que sustentam uma decisão; mais visão, perguntas e convenções do projeto | arquivo direto |
| `docs/references/` | estudo de produtos que inspiram o projeto | um arquivo por referência |
| `docs/features/` | **execução** — uma pasta por feature, com `prd.md`, `open-questions.md`, `tasks.md` | `NNN-nome/`, três dígitos |

Categorias novas seguem o mesmo padrão. Sempre atualize o [índice](docs/README.md) ao criar arquivo novo.

Nada de documentação solta na raiz, nem espalhada perto do código. As únicas exceções na raiz são `README.md` e este `CLAUDE.md`.

> **Nota — 2026-09-28.** *"Toda documentação vive em `/docs`"* deixou de valer inteira: o
> [ADR de 2026-09-28](docs/adr/2026-09-28-1726-outline-discusses-the-repo-decides.md) dá à
> documentação um segundo lugar, o **Outline** (`wiki.cazimi.tech`, coleções `Lumem` e `Lumem · Team`).
> **O Outline discute e opera; o repositório decide e executa.** O que continua de pé, inteiro: fica
> aqui tudo de que o código, o gate ou um agente dependem, tudo que muda no mesmo PR que o código, e
> todo estudo que sustenta um ADR — e dentro de `/docs` a tabela acima vale como está. Vai para o
> Outline a discovery antes da decisão (quando decide, vira ADR e PRD aqui), o que não pode ser público
> — runbook, postmortem, custo, endereço de credencial —, a crônica das features e os instantâneos
> (passagem de bastão, diário). **O Outline nunca repete conteúdo normativo escrito à mão**: ele linka
> para cá. E esta regra continua sobrepondo skills — uma skill que mande escrever ADR, PRD ou task no
> Outline está errada.

### O que cada camada pode afirmar

> **`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa · o código está em vigor.**

**ADR não descreve o sistema, descreve escolhas.** A posição atual sobre uma *decisão* é a cadeia de
ADR lida até o fim; a posição atual sobre *comportamento* é o código. É por isso que o §Estado atual
deste arquivo existe: **ele é a projeção**, e nada mais é.

As sete regras — o desenho está na [`docs/features/025-docs-contract/`](docs/features/025-docs-contract/prd.md):

1. **O número da feature é ordem de leitura, não prioridade.** Três dígitos, ordem de merge do git,
   atribuído na criação e **nunca renumerado** depois de ter referência de fora. Lacuna é permitida;
   colisão entre worktrees se resolve renumerando a que mergeou depois.
2. **Precedência mora em `docs/adr/`.** PRD não é fonte de verdade.
3. **ADR existe se passa nos três testes, todos:** difícil de reverter · surpreendente sem contexto ·
   produto de um trade-off real. Falha um e é uma nota na PRD. *Se você não sabe nomear uma
   alternativa real, provavelmente não é ADR.*
4. **ADR não se reverte em parte.** Se só parte mudou, o ADR novo **reafirma o que fica**. Nota de
   PRD nunca derruba ADR sozinha — se ela precisa disso, o que falta é um ADR.
5. **Estado se deriva, não se escreve.** ADR superado ⇔ outro o nomeia em `supersedes`; **não existe
   campo `status:`** e nenhum ADR é editado depois de escrito. PRD proposta ⇔ não tem `tasks.md`, e
   `tasks.md` **não nasce vazio**.
   > **Nota — 2026-09-28.** Em feature nova, o `checks.md` substitui o `tasks.md`
   > ([ADR](docs/adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md)): PRD
   > proposta ⇔ não tem **nem** `tasks.md` **nem** `checks.md`. O resto da regra fica de pé. O
   > `check-docs` só passa a conhecer o `checks.md` com a [T21 da `024`](docs/features/024-dev-harness/tasks.md).
6. **A nota no requisito contradito fica** — no requisito, com âncora para quem contradiz, e
   **delimitando o que sobrou de pé**. *Decisão revertida sem registro é decisão que volta sozinha.*
7. **Sem índice gerado.** A pasta é o índice e o frontmatter é o resumo. Antes de propor ou mudar
   arquitetura, liste `docs/adr/` e leia o frontmatter do que parecer relevante — **uma decisão lá
   vale mais que o seu instinto**, e contradizê-la em silêncio é o defeito, não a discordância.

O `**Status:**` de uma PRD tem gramática fechada, e o `gate:full` compara com o disco:

```
**Status:** proposta | em execução | completa | superada por <link do ADR>
```

## Convenções

- Documentação e comunicação em português. Código, commit e nome de arquivo em inglês.
- **Caminho da aplicação em inglês** — `home`, `tasks` —, e ele está do lado do **código**, não do da
  comunicação: um caminho é identificador, como nome de arquivo e nome de variável. O rótulo
  `Tarefas` se traduz; para onde ele aponta, não. A alternativa é caminho localizado (`/tarefas` em
  pt, `/tasks` em en) e ela custa o que parece ganhar — o mesmo lugar com dois endereços, e um link
  colado no chat que abre errado para quem está no outro idioma. **Custa zero adotar agora:** o
  aplicativo não tem rota nenhuma (só o `/styleguide`, e só em DEV), então não há o que migrar; o
  dia em que houver, cada rota publicada é um link que alguém guardou. Decidido em **2026-09-14**, e
  **não virou ADR de propósito** — ele extende a linha acima em vez de contradizê-la, e hoje falha o
  teste de *"difícil de reverter"*. Quando o produto ganhar URL de verdade, aí passa.
- Nome de arquivo em kebab-case.
- **Escreva por extenso, e não abreviado.** Uma abreviação que economiza cinco letras custa uma
  releitura inteira no dia em que duas coisas diferentes ficam com a mesma cara. A
  [`028`](docs/features/028-autonomous-orchestration/prd.md) produziu o caso: o §6 numerava as partes
  do escopo como `F1..F6` e o `tasks.md` numerava as etapas de construção como `Fase 0..4` — nada em
  lugar nenhum dizia que eram **coisas diferentes**, e `F3` contra `fase 3` é indistinguível em voz
  alta. Escreva **Parte 3 — Orçamento e limites** e **Fase 3 — a tela**; o documento fica mais
  comprido e para de exigir que quem lê adivinhe.
- **Numeração diferente pede nome diferente.** Se um documento numera duas coisas, as duas precisam de
  substantivos distintos — *parte* e *fase*, não `F` e `Fase`. E quem cita de fora cita pelo nome
  inteiro.
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](docs/project/questions.md) se for do projeto todo.
- Ideia que ficou pra depois não vira memória de conversa: vai pro [backlog](docs/project/backlog.md), com uma frase de contexto, de onde veio, e o gatilho que traz de volta.
- Discussão grande demais pra caber numa pergunta vira arquivo próprio em `docs/project/`, e a pergunta linka pra ele — como a [PTY × ACP](docs/project/pty-vs-acp.md) fez. Quando ela **decide** algo difícil de reverter, o arquivo é o estudo e a decisão vira um [ADR](docs/adr/).
