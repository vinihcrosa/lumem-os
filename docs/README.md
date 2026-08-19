# Documentação — Lumem-OS

Índice de tudo. O [walking-skeleton](prd/walking-skeleton/tasks.md) está de pé, vestido pela [ui-shell](prd/ui-shell/tasks.md), reorganizado pela [worktree-tabs](prd/worktree-tabs/tasks.md), com olhos para o repositório na [right-panel](prd/right-panel/tasks.md) e mãos no [file-editor](prd/file-editor/tasks.md). Em desenho fechado e decomposta em pilha de PRs, a primeira feature que não é de tela: [workspace-memory](prd/workspace-memory/prd.md) — o harness lembrar.

> **Decisão de arquitetura, 2026-08-17:** a sessão de agente deixa de ser um terminal e passa a ser uma **conversa por [ACP](project/pty-vs-acp.md)**. O PTY continua existindo — para shell, e como caminho alternativo por `agent_config`. A feature [acp-sessions](prd/acp-sessions/prd.md) — transporte mais a tela da conversa — está **completa**: PRD escrito, spike rodado (autenticação e consumo medidos, janela de contexto parcial), protótipo renderizado em `packages/web/prototype/lumem-acp-conversation.html`, e as fases 1, 3, 4, 5 e 6 entregues — uma tarefa roda do começo ao fim sem terminal, fechar o daemon não perde a conversa, e o agente ACP se cria pela tela.

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
| [task-cycle-evidence.md](project/task-cycle-evidence.md) | Linha de base medida do repositório e registro de custo do ciclo dev → review → rework. Lastro dos números que a skill `lumem-task-cycle` cita |
| [pty-vs-acp.md](project/pty-vs-acp.md) | **Decisão de arquitetura (2026-08-17): o Lumem migra para ACP.** O custo medido, os prós e contras de cada transporte, a recomendação contrária que perdeu, e o §9.2 — billing e janela de contexto investigados na fonte, com duas das minhas próprias afirmações corrigidas |
| [backlog.md](project/backlog.md) | **Tudo que ficou para depois**, com uma frase de contexto, de onde veio, e o gatilho que traz de volta. Toda ideia adiada entra aqui na hora |

---

## `references/` — estudo da concorrência

Três produtos dissecados a fundo, com o mesmo template, pra dar pra comparar — mais um quarto, de
recorte estreito, feito sob encomenda para a feature de memória.

| Arquivo | O quê | Foco |
|---|---|---|
| [comparison.md](references/comparison.md) | **Comece aqui.** Matriz factual dos três lado a lado, mais um mapa de "qual decisão → onde ler" | navegação |
| [compozy.md](references/compozy.md) | Daemon local que dirige CLIs via ACP | memória e self-learning |
| [superset.md](references/superset.md) | Orquestrador de agentes de terminal | multi-agente, multi-host, PTY |
| [conductor.md](references/conductor.md) | App Mac de worktrees paralelas | UX de paralelismo |
| [hermes.md](references/hermes.md) | Agente pessoal que é dono do próprio loop | fato × procedimento, ciclo de vida por uso, curadoria |

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

### [right-panel/](prd/right-panel/) — arquivos e diff

Sucede a `worktree-tabs`. Uma terceira coluna, à direita, com os arquivos do checkout selecionado e o que mudou nele. É a primeira feature em que o daemon lê **conteúdo** do repositório, e não só metadado. Protótipo em `packages/web/prototype/lumem-right-panel.html`.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/right-panel/prd.md) | Escopo, a segurança do caminho, os tokens novos, o que a renderização achou, riscos |
| [open-questions.md](prd/right-panel/open-questions.md) | 10 perguntas, 5 respondidas |
| [tasks.md](prd/right-panel/tasks.md) | 5 decisões e 10 tasks em 4 fases — todas entregues — mais o que a execução achou |

### [file-editor/](prd/file-editor/) — o visualizador vira editor

Sucede a `right-panel`. O split da aba **escreve**: editar o arquivo aberto com autosave, e criar, renomear e apagar pela árvore. É a primeira feature em que o daemon escreve no repositório — e ela reverte, com registro, o primeiro não-objetivo da `right-panel`. Nove lotes, onze rounds de review, e dezenove premissas do PRD derrubadas pela implementação.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/file-editor/prd.md) | Por que o não-objetivo foi revertido, a segurança da escrita, a concorrência com o agente, riscos |
| [open-questions.md](prd/file-editor/open-questions.md) | 24 perguntas, 21 respondidas |
| [tasks.md](prd/file-editor/tasks.md) | 6 decisões e 13 tasks em 5 fases, mais as premissas travadas e as 20 pendências numeradas — **todas entregues**, mais o que o portão não prova |

### [workspace-memory/](prd/workspace-memory/) — o harness lembra

**PR 01 com tasks; 02–05, S1 e S2 com escopo e `Done when`.** A primeira feature que não é de tela: memória compartilhada do
workspace e aprendizado contínuo por projeto. É o pilar que dá sentido ao conceito de workspace — dois
projetos que se conhecem. Foi ela que forçou a decisão do ACP: o daemon precisava entender a sessão,
e por PTY ele só via bytes.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/workspace-memory/prd.md) | As três naturezas do conhecimento, o que a decisão por ACP mudou, onde cada coisa vive, o portão de escrita, a fronteira cross-projeto, riscos |
| [open-questions.md](prd/workspace-memory/open-questions.md) | 38 perguntas, **todas respondidas** — o registro de por que cada decisão foi tomada |
| [tasks.md](prd/workspace-memory/tasks.md) | Uma seção por PR da pilha. A **01 tem tasks**; as demais têm escopo e `Done when` |
| [roadmap.md](prd/workspace-memory/roadmap.md) | **A feature em pilha de PRs**: topologia de branches, as sete regras da pilha, as cinco partes da espinha, o que anda em paralelo e onde o ACP entra |
| [context-delivery.md](prd/workspace-memory/context-delivery.md) | Como a memória chega no agente: **núcleo comportamental + skill + serviço `lumem-memory` com auto-learn**. O que o desenho compra, o que ele cobra, o que medir, e as **8 decisões (D1–D8), todas respondidas** |

Quatro decisões já fechadas mudaram o desenho: **nenhuma memória vive dentro do repositório** (menos o
`id` do projeto), o **transporte passa a ser ACP**, o **`~/.lumem` é versionado por git pelo próprio
Lumem**, e a memória chega ao agente como **serviço, não como texto injetado**.

### [acp-sessions/](prd/acp-sessions/) — a sessão vira conversa

**Fases 1, 3 e 4 entregues — 26 de 26 tasks, gate cheio verde.** Paridade funcional com o uso diário: a conversa roda uma tarefa inteira sem terminal, com plano, uso e custo, seletores, comandos de barra, o terminal que o agente pede e `fs/*` pelo `FileService`. Falta a fase 5. As 14 perguntas de desenho estão respondidas e o
spike mediu autenticação e consumo (a janela ficou parcial). A sessão de agente deixou de ser um terminal
e passou a ser uma conversa estruturada por [ACP](project/pty-vs-acp.md). Destrava as partes 06–09 da memória, o custo por projeto e
a política de permissão.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/acp-sessions/prd.md) | O que o spike mediu — **autenticação e consumo nesta máquina**, e a janela só até "nasce em 1M" —, escopo do transporte e da tela, riscos, fases |
| [open-questions.md](prd/acp-sessions/open-questions.md) | 16 perguntas, **14 respondidas** — inclusive o volume da transcrição medido em 675 sessões reais. **A13** e **A14** nasceram no protótipo; a **A15** nasceu na fase 4 e a **A16** na fase 6, as duas abertas |
| [tasks.md](prd/acp-sessions/tasks.md) | **35 tasks, todas fechadas**, nas fases 1, 3, 4, 5 e 6 do PRD. Diz também por que a fase 3 não começa antes da 1, por que a escrita em disco vem antes de tudo na 4, e por que a gravação da transcrição vem antes de tudo na 5 |
| `packages/web/prototype/lumem-acp-conversation.html` | O protótipo da fase 2: seis telas — conversa, ferramenta, permissão, plano, uso, limites. Não é documentação, é o desenho executável; fica junto dos outros protótipos |

---

## Convenções

- Documentação em português, nome de arquivo em inglês e kebab-case
- Documentação **só** vive aqui — a regra está no [CLAUDE.md](../CLAUDE.md) e sobrepõe qualquer skill
- Arquivo novo entra neste índice na mesma hora
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](project/questions.md) se for do projeto todo
