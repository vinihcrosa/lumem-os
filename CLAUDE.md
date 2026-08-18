# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Cinco features de pé — [walking-skeleton](docs/prd/walking-skeleton/tasks.md), [ui-shell](docs/prd/ui-shell/tasks.md), [worktree-tabs](docs/prd/worktree-tabs/tasks.md), [right-panel](docs/prd/right-panel/tasks.md) e [file-editor](docs/prd/file-editor/tasks.md) — esta última faz o daemon **escrever** no repositório, com autosave e CRUD pela árvore. Entregue em pilha (01 a 05, mais S1 e S2): [workspace-memory](docs/prd/workspace-memory/tasks.md), o self-learning com memória compartilhada de workspace. **Decidido em 2026-08-17:** a sessão de agente migra de PTY para [ACP](docs/project/pty-vs-acp.md) — a próxima feature a desenhar é `acp-sessions` (transporte + tela da conversa); o PTY fica para shell e como caminho alternativo. Comece pelo [índice da documentação](docs/README.md).

| Onde | O quê |
|---|---|
| [docs/project/vision.md](docs/project/vision.md) | visão do projeto, escrita pelo Vinicius |
| [docs/project/questions.md](docs/project/questions.md) | perguntas de design do projeto, respondidas aos poucos |
| [docs/project/testing.md](docs/project/testing.md) | matriz de cobertura, gates, e as armadilhas já corrigidas |
| [docs/project/backlog.md](docs/project/backlog.md) | tudo que ficou para depois. **Ideia adiada entra aqui na mesma hora**, com contexto curto e gatilho de volta |
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

Antes de dizer que uma task está pronta, rode o gate que ela declara. Detalhes em [docs/project/testing.md](docs/project/testing.md).

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
