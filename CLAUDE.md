# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Onze features de pé — [walking-skeleton](docs/prd/walking-skeleton/tasks.md), [ui-shell](docs/prd/ui-shell/tasks.md), [worktree-tabs](docs/prd/worktree-tabs/tasks.md), [right-panel](docs/prd/right-panel/tasks.md), [file-editor](docs/prd/file-editor/tasks.md) e [project-from-url](docs/prd/project-from-url/tasks.md) — a quinta faz o daemon **escrever** no repositório, com autosave e CRUD pela árvore, e a sexta o faz **clonar** de uma URL git qualquer, reorganizando o diretório de estado numa árvore só (`~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`) e tornando a remoção de um projeto gerenciado uma remoção **do disco**. **Decidido em 2026-08-17:** a sessão de agente migra de PTY para [ACP](docs/project/pty-vs-acp.md) — a feature [acp-sessions](docs/prd/acp-sessions/prd.md) (transporte + tela da conversa) está **completa**: plano, uso e custo, seletores, comandos de barra, terminal embutido, `fs/*`, e a conversa **em disco** — fechar o Lumem e voltar não perde conversa, e retomar continua de onde parou. [35 tasks](docs/prd/acp-sessions/tasks.md) fechadas nas fases 1, 3, 4, 5 e 6. O PTY fica para shell e como caminho alternativo. O [onboarding](docs/prd/onboarding/prd.md) são as **nove telas do primeiro acesso**, **21 tasks fechadas**: um e2e sai de `~/.lumem` vazio e chega a um turno respondido sem tocar a API. O [agent-login](docs/prd/agent-login/prd.md) troca os cinco campos do rodapé por **login**, com os botões vindos do `authMethods` do handshake e o adaptador instalado pelo daemon numa versão fixa. E a [workspace-memory](docs/prd/workspace-memory/tasks.md) — a primeira que não é de tela — está **completa**: nove PRs mais o S1, o S2 e as duas telas que faltavam. O `~/.lumem` versionado pelo daemon, os sinais de ação, o portão de escrita, as superfícies, o recall explicável e a inbox de propostas vieram nas 01–05. As 06–09 são o que faz a memória **mudar comportamento**: o núcleo comportamental injetado no primeiro turno com marca d'água e sem teto, a `GET /memory/ask` que o agente consulta por `curl`, a destilação de fim de sessão que virou proposta na inbox, o **auto-learn** — pergunta sem resposta sobe agente, e evidência verificável decide entre memória e proposta — e os **playbooks**, com ciclo de vida derivado do uso e nada arquivado sozinho. Os três interruptores que gastam token vêm **desligados** e aparecem na tela. E a
[workspace-screen](docs/prd/workspace-screen/prd.md) fecha o círculo: o workspace ganhou **tela** — no
lugar de "selecione uma worktree" —, a memória dele deixou de depender de um projeto aberto, e o
consumo de tokens virou dado somável (`session_usage`), por projeto e por worktree, com janela de
tempo resolvida no daemon. A [project-scripts](docs/prd/project-scripts/prd.md) — **completa, 14
tasks** — conserta o que faltava depois de tudo isso: o Lumem criava worktrees que **não rodavam**.
Agora `setup`, `run`, `test` e `teardown` moram no `<repo>/.lumem/project.toml` (o arquivo que já tinha o
`id`), a worktree nova nasce preparada, e o rodapé abaixo da árvore de arquivos sobe a aplicação com
um clique — com um bloco de portas reservado por checkout, e um portão de confiança para o
`[scripts]` que veio de um repositório clonado. E a [distribution](docs/prd/distribution/prd.md) — **completa, 16 tasks** — tira o produto do
checkout: o daemon virou **um bundle ESM** com só o par nativo por fora, ele **serve o web na própria
porta**, o binário `lumem` sobe tudo, e `npm i -g @vinihcrosa/lumem-os` instala — com uma pipeline de release cujo
passo central é **instalar o tarball num runner limpo**, porque é o único que pega `require`
dinâmico, prebuild ausente e arquivo fora do pacote. A raiz ganhou `README.md` (em inglês, com
tradução ao lado) e `LICENSE` (MIT).

Em **2026-09-01**, nove anotações feitas na tela `/` viraram **quatro PRDs novas**. Duas já estão
fechadas; duas seguem **sem tasks** — [sidebar-actions](docs/prd/sidebar-actions/prd.md) (criar projeto
e worktree de onde se olha) e [run-dock-open](docs/prd/run-dock-open/prd.md) (o rodapé de execução
nasce aberto). A nona anotação era sobre uma PR aberta que não aparece: a
[pull-request-status](docs/prd/pull-request-status/prd.md) está desenhada e **não implementada**,
travada na Q1.

A [worktree-first-tab](docs/prd/worktree-first-tab/prd.md) está **completa** — 9 tasks, 5 perguntas
respondidas. A coluna do meio é **caminho → abas → conteúdo**: o cabeçalho fixo do checkout virou a
**primeira aba** (fixa, sem `✕`, com o ponto de sujeira que sobrevive a outra aba estar na frente), e o
`▤ arquivos` saiu da topbar para a faixa de abas do checkout. Ela reverte, com o motivo escrito, a W4
da [worktree-tabs](docs/prd/worktree-tabs/tasks.md) — e o e2e provou de graça o que a mudança cobra:
com a conversa na frente, o nome da worktree só existe na aba.

A [session-mode](docs/prd/session-mode/prd.md) está **completa** — 12 tasks, 6 perguntas fechadas. Ela
conserta um composer que ficava **mudo**: as pílulas eram derivadas inteiramente do `configOptions`, e
um vazio produzia zero pílula — então um agente que não relata `modes` desenhava o mesmo pixel que um
bug de transporte. Agora a pílula de modo existe sempre, e quando o agente não tem modos ela é a
**política do Lumem**: `perguntar tudo`, `automático` (leitura de arquivo dentro do checkout passa
sozinha) e `liberado`, atrás de um portão por sessão sem "não perguntar de novo". A autoria não é cor —
é o glifo `◈` mais o idioma do rótulo —, o que passa sozinho **aparece na conversa** assinado (`◈ o
Lumem aprovou`) com a linha de fecho contando o turno, e **nenhum caminho da feature nega sozinho**:
sem opção de permitir, o pedido sobe dizendo por quê.

Comece pelo [índice da documentação](docs/README.md).

| Onde | O quê |
|---|---|
| [docs/project/vision.md](docs/project/vision.md) | visão do projeto, escrita pelo Vinicius |
| [docs/project/questions.md](docs/project/questions.md) | perguntas de design do projeto, respondidas aos poucos |
| [docs/project/testing.md](docs/project/testing.md) | matriz de cobertura, gates, e as armadilhas já corrigidas |
| [docs/project/backlog.md](docs/project/backlog.md) | tudo que ficou para depois. **Ideia adiada entra aqui na mesma hora**, com contexto curto e gatilho de volta |
| [docs/project/workspaces.md](docs/project/workspaces.md) | scripts de setup/run/teardown, isolamento de portas e state dir por worktree |
| [docs/references/](docs/references/) | estudo das quatro referências + comparativo |
| [docs/project/pty-vs-acp.md](docs/project/pty-vs-acp.md) | a decisão de transporte: por que ACP, o que ela custa, e o que faria o PTY voltar |
| [docs/prd/](docs/prd/) | PRD, decisões e tasks por feature |

Construção é incremental: uma parte por vez, bem feita, antes de ir pra próxima.

## Código

Monorepo pnpm + Turborepo. `packages/shared` (contratos), `packages/server` (daemon Fastify + tRPC), `packages/web` (React + Vite).

| Comando | O quê |
|---|---|
| `pnpm dev` | sobe daemon e web juntos |
| `pnpm gate:quick` | testes afetados pelo trabalho atual |
| `pnpm gate:full` | suíte inteira + e2e |
| `pnpm gate:build` | typecheck de tudo + build |
| `pnpm smoke:install` | empacota o `lumem`, instala num prefixo descartável e sobe — a prova de que o pacote publicado presta |
| `pnpm version:set <x.y.z>` | escreve a versão nos três lugares que têm que concordar |

Antes de dizer que uma task está pronta, rode o gate que ela declara. Detalhes em [docs/project/testing.md](docs/project/testing.md).

## Regra de design

> **O design é feito no Open Design, não aqui.** Decisão de 2026-08-19, com o custo nomeado em
> [design-source-of-truth.md](docs/project/design-source-of-truth.md).

O projeto `lumem-os` do Open Design é a fonte. Deste lado, três arquivos são **cópia ou derivado** e
nenhum deles se edita à mão:

| Arquivo | O quê |
|---|---|
| `packages/web/src/styles/tokens.css` | cópia do Open Design |
| `packages/web/src/styles/tokens.ts` | **derivado** do `tokens.css` — o `xterm`, o CodeMirror e o Shiki precisam do hexadecimal em JavaScript |
| `packages/web/prototype/*.html` e `*.css` | cópia do Open Design, uma tela por arquivo |

`pnpm --filter @lumem/web design:sync` traz tudo e re-deriva. O `--check` diz se divergiu, sem
escrever nada.

Componente em React só usa `var(--token)`: nenhum literal de cor, de espaço ou de tipografia. É isso
que faz tela desenhada lá ser implementável aqui sem tradução. Token novo nasce no Open Design — e o
`gate:quick` confere os 99 pares de contraste, então cor escolhida à mão que reprova falha a suíte com
o nome da combinação de tela que quebrou.

## Regra de documentação

> **Esta regra sobrepõe qualquer outra instrução, incluindo skills.** Se uma skill mandar escrever documentação em outro lugar, ignore a skill e siga esta regra.

Toda documentação vive em `/docs`, organizada por categoria e depois por nome:

```
/docs/<categoria>/<nome>/<arquivo>.md
```

Quando a categoria agrupa itens, cada item ganha sua pasta. Quando não agrupa, os arquivos ficam direto nela.

| Categoria | Conteúdo | Formato |
|---|---|---|
| `docs/project/` | visão, perguntas de design — coisas do projeto todo | arquivo direto |
| `docs/references/` | estudo de produtos que inspiram o projeto | um arquivo por referência |
| `docs/prd/` | uma pasta por feature, com `prd.md`, `open-questions.md`, `tasks.md` | pasta por feature |

Categorias novas seguem o mesmo padrão. Sempre atualize o [índice](docs/README.md) ao criar arquivo novo.

Nada de documentação solta na raiz, nem espalhada perto do código. As únicas exceções na raiz são `README.md` e este `CLAUDE.md`.

## Convenções

- Documentação e comunicação em português. Código, commit e nome de arquivo em inglês.
- Nome de arquivo em kebab-case.
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](docs/project/questions.md) se for do projeto todo.
- Ideia que ficou pra depois não vira memória de conversa: vai pro [backlog](docs/project/backlog.md), com uma frase de contexto, de onde veio, e o gatilho que traz de volta.
- Discussão grande demais pra caber numa pergunta vira arquivo próprio em `docs/project/`, e a pergunta linka pra ele — como a [PTY × ACP](docs/project/pty-vs-acp.md) fez.
