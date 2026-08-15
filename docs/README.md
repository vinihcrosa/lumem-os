# Documentação — Lumem-OS

Índice de tudo. O [walking-skeleton](prd/walking-skeleton/tasks.md) está de pé, vestido pela [ui-shell](prd/ui-shell/tasks.md), e sendo reorganizado pela [worktree-tabs](prd/worktree-tabs/tasks.md).

---

## Por onde começar

Lendo nesta ordem você entende o projeto inteiro em três documentos:

1. **[project/vision.md](project/vision.md)** — o que é o Lumem-OS e por que existe
2. **[references/comparison.md](references/comparison.md)** — o que a concorrência faz, lado a lado
3. **[prd/walking-skeleton/prd.md](prd/walking-skeleton/prd.md)** — o que vai ser construído primeiro

---

## `project/` — o projeto todo

| Arquivo | O quê |
|---|---|
| [vision.md](project/vision.md) | Visão, hierarquia pretendida, o que o Vinicius quer do sistema |
| [questions.md](project/questions.md) | 96 perguntas de design em duas rodadas. Fonte de verdade das decisões de longo prazo, respondida aos poucos |
| [testing.md](project/testing.md) | Matriz de cobertura, o que cada gate garante, e as armadilhas de teste já corrigidas |
| [task-cycle-evidence.md](project/task-cycle-evidence.md) | Custo e achados medidos do ciclo dev → review → rework. Lastro dos números que a skill `lumem-task-cycle` cita |

---

## `references/` — estudo da concorrência

Três produtos dissecados a fundo, com o mesmo template, pra dar pra comparar.

| Arquivo | O quê | Foco |
|---|---|---|
| [comparison.md](references/comparison.md) | **Comece aqui.** Matriz factual dos três lado a lado, mais um mapa de "qual decisão → onde ler" | navegação |
| [compozy.md](references/compozy.md) | Daemon local que dirige CLIs via ACP | memória e self-learning |
| [superset.md](references/superset.md) | Orquestrador de agentes de terminal | multi-agente, multi-host, PTY |
| [conductor.md](references/conductor.md) | App Mac de worktrees paralelas | UX de paralelismo |

**O achado que orienta o projeto:** nenhuma das três tem agrupamento multi-repo, memória funcionando, ou isolamento de runtime. Os três pilares do Lumem-OS são o ponto cego da categoria inteira.

---

## `prd/` — features

Uma pasta por feature. Cada uma tem PRD, perguntas respondidas e tasks.

### [walking-skeleton/](prd/walking-skeleton/) — primeiro passo

Sidebar de projetos, worktrees, terminais e sessões de agente. Não é o MVP — é a prova de que a espinha aguenta peso.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/walking-skeleton/prd.md) | Escopo, não-objetivos, modelo de dados, arquitetura, critérios de aceite |
| [open-questions.md](prd/walking-skeleton/open-questions.md) | 21 perguntas, todas respondidas — é o registro de por que cada decisão foi tomada |
| [tasks.md](prd/walking-skeleton/tasks.md) | 34 tasks atômicas em 8 fases, ordenadas por risco |

### [ui-shell/](prd/ui-shell/) — a interface

Veste as funções que o walking-skeleton deixou de pé. Não adiciona nenhuma. O desenho foi feito como protótipo HTML antes de qualquer React, em `packages/web/prototype/lumem-shell.html`.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/ui-shell/prd.md) | Fundação de tokens, escopo, o que a renderização achou, riscos |
| [open-questions.md](prd/ui-shell/open-questions.md) | 12 perguntas de desenho, 10 respondidas |
| [tasks.md](prd/ui-shell/tasks.md) | 11 tasks em 4 fases, das primitivas pras telas — todas entregues |

### [worktree-tabs/](prd/worktree-tabs/) — a sessão vira aba

Sucede a `ui-shell`. A sidebar para na worktree e as sessões daquela worktree viram abas; o checkout principal entra na lista como `local`. Protótipo em `packages/web/prototype/lumem-tabs.html`.

| Arquivo | O quê |
|---|---|
| [tasks.md](prd/worktree-tabs/tasks.md) | 4 decisões e 7 tasks |

---

## Convenções

- Documentação em português, nome de arquivo em inglês e kebab-case
- Documentação **só** vive aqui — a regra está no [CLAUDE.md](../CLAUDE.md) e sobrepõe qualquer skill
- Arquivo novo entra neste índice na mesma hora
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](project/questions.md) se for do projeto todo
