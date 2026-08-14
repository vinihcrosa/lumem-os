# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Fase de definição. **Ainda não existe código.** Tudo vive em [docs/](docs/) — comece pelo [índice](docs/README.md).

| Onde | O quê |
|---|---|
| [docs/project/vision.md](docs/project/vision.md) | visão do projeto, escrita pelo Vinicius |
| [docs/project/questions.md](docs/project/questions.md) | perguntas de design do projeto, respondidas aos poucos |
| [docs/references/](docs/references/) | estudo das três referências + comparativo |
| [docs/prd/](docs/prd/) | PRD, decisões e tasks por feature |

Construção é incremental: uma parte por vez, bem feita, antes de ir pra próxima.

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
