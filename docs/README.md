# Documentação — Lumem-OS

Índice de tudo. O [walking-skeleton](prd/walking-skeleton/tasks.md) está de pé, vestido pela [ui-shell](prd/ui-shell/tasks.md), reorganizado pela [worktree-tabs](prd/worktree-tabs/tasks.md), com olhos para o repositório na [right-panel](prd/right-panel/tasks.md) e mãos no [file-editor](prd/file-editor/tasks.md). Fechando o caminho de entrada, o [onboarding](prd/onboarding/prd.md) e o [agent-login](prd/agent-login/prd.md). E o harness passou a lembrar: a [workspace-memory](prd/workspace-memory/tasks.md) está **completa** — nove PRs, a primeira feature que não é de tela, e a única em que o sistema escreve sozinho (atrás de portão, inbox e interruptor desligado).

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
| [design-source-of-truth.md](project/design-source-of-truth.md) | **Decisão (2026-08-19): o design é feito inteiramente no Open Design.** O gerador Python saiu, o `tokens.css` passou a ser sincronizado, e a verificação de contraste ficou — com o custo de cada uma dessas três coisas nomeado |
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

### [workspace-screen/](prd/workspace-screen/) — o workspace ganha uma tela

**Escopo fechado, execução começando.** Nasceu de uma pergunta de uso: *"tem uma memória do workspace?
como eu acesso?"* — e a resposta é que só através de um projeto, porque o botão que abre o painel
direito só aparece com um checkout selecionado. Workspace sem projeto não tem porta nenhuma.

A resposta da **W4** mudou o tamanho da feature: consumo de tokens por projeto e por worktree, com
janela de tempo, entrou no escopo — e ele não é uma query nova, é um dado que o daemon **não grava**.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/workspace-screen/prd.md) | O que o workspace não tem, o que a tela é, o que fica fora e por quê, e as três telas que precisam nascer no Open Design |
| [open-questions.md](prd/workspace-screen/open-questions.md) | 6 perguntas, **todas respondidas**. A W4 é a que mudou o escopo, e a decisão dela explica por que o consumo exige tabela nova |
| [tasks.md](prd/workspace-screen/tasks.md) | 9 tasks em 4 fases. O consumo vem primeiro, porque é a única parte que pode não caber |

### [workspace-memory/](prd/workspace-memory/) — o harness lembra

**Completa — nove PRs, mais o S1, o S2 e as duas telas que faltavam.** A primeira feature que não é
de tela: memória compartilhada do workspace e aprendizado contínuo por projeto. É o pilar que dá sentido ao conceito de workspace — dois
projetos que se conhecem. Foi ela que forçou a decisão do ACP: o daemon precisava entender a sessão,
e por PTY ele só via bytes.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/workspace-memory/prd.md) | As três naturezas do conhecimento, o que a decisão por ACP mudou, onde cada coisa vive, o portão de escrita, a fronteira cross-projeto, riscos |
| [open-questions.md](prd/workspace-memory/open-questions.md) | 47 perguntas, **44 respondidas** — o registro de por que cada decisão foi tomada. A Q38 fechou na PR 08, quando o custo de esperar mudou: agente passou a escrever. As três abertas (Q39, Q44, Q46) são de curadoria e de identidade de ator — a Q46 é a [autenticação do daemon](project/backlog.md), que é do projeto e não desta feature |
| [tasks.md](prd/workspace-memory/tasks.md) | Uma seção por PR. Cada uma termina com a tabela do que ela **decidiu enquanto executava** — as decisões que o desenho não previu e que a implementação cobrou. É onde ler quando algo no código parecer arbitrário |
| [roadmap.md](prd/workspace-memory/roadmap.md) | **A feature em pilha de PRs**: topologia de branches, as sete regras da pilha, as cinco partes da espinha, o que anda em paralelo e onde o ACP entra |
| `packages/web/prototype/lumem-memory.html` | O protótipo, agora com **sete telas** e vindo do Open Design como todos os outros: o que existe no escopo ativo (com busca), a inbox, o conflito no mesmo escopo, a linha do tempo, os números, os estados degradados e os playbooks. Era o único protótipo que vivia só neste repositório — anterior à regra de 2026-08-19 |
| [context-delivery.md](prd/workspace-memory/context-delivery.md) | Como a memória chega no agente: **núcleo comportamental + skill + serviço `lumem-memory` com auto-learn**. O que o desenho compra, o que ele cobra, o que medir, e as **8 decisões (D1–D8)** |

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

### [onboarding/](prd/onboarding/) — a máquina vazia chega até a primeira conversa

**Completa — 21 de 21 tasks.** Nove telas, do pré-voo da máquina ao primeiro turno com o Claude por
ACP. Era a maior distância entre desenho e produto do projeto: a máquina vazia chegava ao `FirstRun`
— um campo e um botão — e parava, e o caminho até uma conversa exigia seis fatos que só existiam em PRD
e em código. Agora um e2e sai de `~/.lumem` vazio e chega a um turno respondido **sem tocar a API**. O
`FirstRun` foi apagado: o fluxo é a única porta de entrada.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/onboarding/prd.md) | O que existe hoje **tela por tela**, medido no código; as quatro leituras novas do daemon; e o §4 — as **cinco divergências** entre o desenho e o produto, com quem ganha em cada uma (a mais séria: o desenho manda instalar um pacote que não é o que o daemon executa) |
| [open-questions.md](prd/onboarding/open-questions.md) | 17 perguntas, **todas implementadas como propostas e todas ainda abertas** — proposta seguida não é pergunta respondida, e cada uma traz embaixo o que a implementação fez e o que custou |
| [tasks.md](prd/onboarding/tasks.md) | 21 tasks em 4 fases, **todas fechadas**, começando pela **T0**: corrigir o desenho antes de portar. No fim, **o que a execução achou** — nove coisas que o plano não previa — e o que o portão não prova |

Duas coisas que este PRD achou e valem fora dele, as duas agora **medidas** e não supostas: o
`initialize` do ACP devolve `agentInfo.version`, então a versão pinada do adaptador **é detectada** em
vez de digitada — provado por um integration marcado contra o `claude-agent-acp` de verdade; e a
"escolha" de autenticação do desenho não escolhia nada, então virou relato do que a sonda achou.

### [agent-login/](prd/agent-login/) — conectar agente é login, e só

**Completa — 8 de 8 tasks.** O rodapé da sidebar pedia cinco campos — nome, transporte, comando,
argumentos, versão do adaptador. Nenhum era escolha de quem usa. Agora é uma linha com o estado da
conexão e um painel que **pergunta uma coisa**: com qual conta você entra. Os botões vêm do
`authMethods` do handshake; o adaptador o daemon instala sozinho, numa versão fixa.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/agent-login/prd.md) | O **§2 é o coração**: quatro medições contra o adaptador real, duas delas derrubando premissas já publicadas neste repositório. Mais a reversão nomeada da decisão de ontem sobre instalar, e a tabela de onde o desenho e o protocolo discordaram |
| [open-questions.md](prd/agent-login/open-questions.md) | 8 perguntas, **todas fechadas** — seis pela medição, duas por decisão do Vinicius (o escopo, e onde a chave de API moraria quando voltar) |
| [tasks.md](prd/agent-login/tasks.md) | 8 tasks em 3 fases, começando por **medir**. No fim, cinco coisas que a execução achou — inclusive um bug de 15 segundos por carga de página que o e2e pegou |

O achado que vale fora da feature: **o `claude-agent-acp` não oferece login a quem não pede.**
`authMethods` vinha vazio porque o Lumem nunca declarou `clientCapabilities.auth.terminal` — não porque
o adaptador não tivesse o que oferecer. Com a capacidade declarada, ele oferece dois métodos, os dois
`type: "terminal"`: o login é um comando dele rodando num terminal, e não uma chamada de `authenticate`.

---

## Convenções

- Documentação em português, nome de arquivo em inglês e kebab-case
- Documentação **só** vive aqui — a regra está no [CLAUDE.md](../CLAUDE.md) e sobrepõe qualquer skill
- Arquivo novo entra neste índice na mesma hora
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](project/questions.md) se for do projeto todo
