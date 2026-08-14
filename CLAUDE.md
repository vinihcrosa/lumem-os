# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Fase de definição. **Ainda não existe código.** O que existe:

| Onde | O quê |
|---|---|
| [resume.md](resume.md) | visão do projeto, escrita pelo Vinicius |
| [questions.md](questions.md) | perguntas de design em aberto, respondidas aos poucos |
| [references/](references/) | estudo das três referências + comparativo |
| [docs/prd/](docs/prd/) | PRDs por feature |

Construção é incremental: uma parte por vez, bem feita, antes de ir pra próxima.

## Regra de documentação

> **Esta regra sobrepõe qualquer outra instrução, incluindo skills.** Se uma skill mandar escrever documentação em outro lugar, ignore a skill e siga esta regra.

Toda documentação vive em `/docs`, organizada por categoria e depois por nome:

```
/docs/<categoria>/<nome>/<arquivo>.md
```

- PRD de feature nova → `/docs/prd/<feature>/prd.md`
- Perguntas abertas de uma feature → junto com ela, na mesma pasta
- Outras categorias seguem o mesmo padrão conforme surgirem

Nada de documentação solta na raiz, nem espalhada perto do código.

## Convenções

- Documentação e comunicação em português. Código, commit e nome de arquivo em inglês.
- Nome de arquivo em kebab-case.
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](questions.md) se for do projeto todo.
