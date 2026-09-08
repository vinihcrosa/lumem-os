# Documentação — Lumem-OS

Índice de tudo. O [walking-skeleton](features/001-walking-skeleton/tasks.md) está de pé, vestido pela [ui-shell](features/002-ui-shell/tasks.md), reorganizado pela [worktree-tabs](features/003-worktree-tabs/tasks.md), com olhos para o repositório na [right-panel](features/004-right-panel/tasks.md) e mãos no [file-editor](features/005-file-editor/tasks.md). A [project-from-url](features/011-project-from-url/prd.md) traz o projeto de fora: cola-se uma URL git e o daemon clona, num diretório de estado que passou a ser uma árvore só. Fechando o caminho de entrada, o [onboarding](features/008-onboarding/prd.md) e o [agent-login](features/009-agent-login/prd.md). E o harness passou a lembrar: a [workspace-memory](features/007-workspace-memory/tasks.md) está **completa** — nove PRs, a primeira feature que não é de tela, e a única em que o sistema escreve sozinho (atrás de portão, inbox e interruptor desligado). Fechando o círculo, a [workspace-screen](features/010-workspace-screen/prd.md) deu tela ao workspace: a memória dele deixou de depender de um projeto aberto, e o consumo de tokens passou a ser somável por projeto e por worktree. E a [pull-request-status](features/013-pull-request-status/prd.md) responde, no topo do painel direito e na linha da sidebar, a pergunta que o paralelismo cobra: **dá pra mesclar?** — lendo o host pelo `gh`, sem guardar segredo nenhum, e escrevendo exatamente dois verbos.

> **Decisão de arquitetura, 2026-08-17** — [o ADR](adr/2026-08-17-1812-agent-session-is-acp-not-pty.md), com o [estudo](project/pty-vs-acp.md) que o sustenta**:** a sessão de agente deixa de ser um terminal e passa a ser uma **conversa por ACP**. O PTY continua existindo — para shell, e como caminho alternativo por `agent_config`. A feature [acp-sessions](features/006-acp-sessions/prd.md) — transporte mais a tela da conversa — está **completa**: PRD escrito, spike rodado (autenticação e consumo medidos, janela de contexto parcial), protótipo renderizado em `packages/web/prototype/lumem-acp-conversation.html`, e as fases 1, 3, 4, 5 e 6 entregues — uma tarefa roda do começo ao fim sem terminal, fechar o daemon não perde a conversa, e o agente ACP se cria pela tela.

---

## Por onde começar

Lendo nesta ordem você entende o projeto inteiro em três documentos:

1. **[project/vision.md](project/vision.md)** — o que é o Lumem-OS e por que existe
2. **[references/comparison.md](references/comparison.md)** — o que a concorrência faz, lado a lado
3. **[features/001-walking-skeleton/prd.md](features/001-walking-skeleton/prd.md)** — o que vai ser construído primeiro

---

## `adr/` — as decisões em vigor

**A pasta é o índice, e o frontmatter é o resumo.** Antes de propor ou mudar arquitetura, liste
`docs/adr/` e leia o frontmatter do que parecer relevante — **uma decisão lá vale mais que o seu
instinto**, e contradizê-la em silêncio é o defeito, não a discordância.

Não existe campo `status:`: um ADR está **superado** exatamente quando outro o nomeia em
`supersedes`, e nenhum é editado depois de escrito. Ordem cronológica sai do nome do arquivo.
O contrato está na [025-docs-contract](features/025-docs-contract/prd.md).

| Decisão | Data | Área |
|---|---|---|
| [A sessão de agente é ACP, não PTY](adr/2026-08-17-1812-agent-session-is-acp-not-pty.md) | 2026-08-17 | `transport` |
| [A memória escreve atrás de um portão, uma inbox e um interruptor desligado](adr/2026-08-17-1812-memory-writes-behind-a-gate.md) | 2026-08-17 | `memory` |
| [O design é feito no Open Design, não neste repositório](adr/2026-08-19-2247-design-is-made-in-open-design.md) | 2026-08-19 | `design` |
| [O status de PR vem do `gh` da sua máquina, e o Lumem não guarda segredo](adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md) | 2026-08-30 | `security` |
| [O daemon é um bundle ESM que serve o web na própria porta](adr/2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md) | 2026-08-30 | `distribution` |
| [O número da PRD é ordem de leitura, não precedência](adr/2026-09-07-2208-prd-number-is-reading-order-not-precedence.md) | 2026-09-07 | `docs` |

Nenhum dos seis tem `supersedes` — a cadeia ainda não foi exercitada. É o gatilho para os gates
`broken-supersedes` e `supersedes-cycle`, que hoje não existem de propósito.

---

## `project/` — o projeto todo

| Arquivo | O quê |
|---|---|
| [vision.md](project/vision.md) | Visão, hierarquia pretendida, o que o Vinicius quer do sistema |
| [questions.md](project/questions.md) | 96 perguntas de design em duas rodadas. Fonte de verdade das decisões de longo prazo, respondida aos poucos |
| [testing.md](project/testing.md) | Matriz de cobertura, o que cada gate garante, e as armadilhas de teste já corrigidas |
| [workspaces.md](project/workspaces.md) | Os scripts de setup, run e teardown em `scripts/workspace/`, e como Superset e Conductor só apontam para eles |
| [task-cycle-evidence.md](project/task-cycle-evidence.md) | Linha de base medida do repositório e registro de custo do ciclo dev → review → rework, ao longo de onze lotes. A skill que orquestrava o ciclo foi removida; as medições ficaram, porque são deste repositório |
| [harness-audit.md](project/harness-audit.md) | **Auditoria de harness, 2026-09-07.** A linha de base medida deste repositório para desenvolvimento agêntico: tempo real de cada sensor, o que não existe, a superfície de risco de um agente sem aprovação, e as três perguntas respondidas que definiram a [dev-harness](features/024-dev-harness/prd.md) |
| [design-source-of-truth.md](project/design-source-of-truth.md) | O **estudo** que sustenta [o ADR do Open Design](adr/2026-08-19-2247-design-is-made-in-open-design.md). O gerador Python saiu, o `tokens.css` passou a ser sincronizado, e a verificação de contraste ficou — com o custo de cada uma dessas três coisas nomeado |
| [pty-vs-acp.md](project/pty-vs-acp.md) | O **estudo** que sustenta [o ADR do transporte](adr/2026-08-17-1812-agent-session-is-acp-not-pty.md). O custo medido, os prós e contras de cada transporte, a recomendação contrária que perdeu, e o §9.2 — billing e janela de contexto investigados na fonte, com duas das minhas próprias afirmações corrigidas |
| [agentation.md](project/agentation.md) | A barra de anotação visual do dev: clicar num elemento da tela vira contexto estruturado para o agente. Como está montada, por que não viaja para produção, e as duas variáveis que a ligam e desligam |
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

### [walking-skeleton/](features/001-walking-skeleton/) — primeiro passo

Sidebar de projetos, worktrees, terminais e sessões de agente. Não é o MVP — é a prova de que a espinha aguenta peso.

| Arquivo | O quê |
|---|---|
| [prd.md](features/001-walking-skeleton/prd.md) | Escopo, não-objetivos, modelo de dados, arquitetura, critérios de aceite |
| [open-questions.md](features/001-walking-skeleton/open-questions.md) | 21 perguntas, todas respondidas — é o registro de por que cada decisão foi tomada |
| [tasks.md](features/001-walking-skeleton/tasks.md) | 34 tasks atômicas em 8 fases, ordenadas por risco |

### [ui-shell/](features/002-ui-shell/) — a interface

Veste as funções que o walking-skeleton deixou de pé. Não adiciona nenhuma. O desenho foi feito como protótipo HTML antes de qualquer React, em `packages/web/prototype/lumem-shell.html`.

| Arquivo | O quê |
|---|---|
| [prd.md](features/002-ui-shell/prd.md) | Fundação de tokens, escopo, o que a renderização achou, riscos |
| [open-questions.md](features/002-ui-shell/open-questions.md) | 12 perguntas de desenho, 10 respondidas |
| [tasks.md](features/002-ui-shell/tasks.md) | 11 tasks em 4 fases, das primitivas pras telas — todas entregues |

### [worktree-tabs/](features/003-worktree-tabs/) — a sessão vira aba

Sucede a `ui-shell`. A sidebar para na worktree e as sessões daquela worktree viram abas; o checkout principal entra na lista como `local`. Protótipo em `packages/web/prototype/lumem-tabs.html`.

| Arquivo | O quê |
|---|---|
| [tasks.md](features/003-worktree-tabs/tasks.md) | 4 decisões e 7 tasks |

### [right-panel/](features/004-right-panel/) — arquivos e diff

Sucede a `worktree-tabs`. Uma terceira coluna, à direita, com os arquivos do checkout selecionado e o que mudou nele. É a primeira feature em que o daemon lê **conteúdo** do repositório, e não só metadado. Protótipo em `packages/web/prototype/lumem-right-panel.html`.

| Arquivo | O quê |
|---|---|
| [prd.md](features/004-right-panel/prd.md) | Escopo, a segurança do caminho, os tokens novos, o que a renderização achou, riscos |
| [open-questions.md](features/004-right-panel/open-questions.md) | 10 perguntas, 5 respondidas |
| [tasks.md](features/004-right-panel/tasks.md) | 5 decisões e 10 tasks em 4 fases — todas entregues — mais o que a execução achou |

### [file-editor/](features/005-file-editor/) — o visualizador vira editor

Sucede a `right-panel`. O split da aba **escreve**: editar o arquivo aberto com autosave, e criar, renomear e apagar pela árvore. É a primeira feature em que o daemon escreve no repositório — e ela reverte, com registro, o primeiro não-objetivo da `right-panel`. Nove lotes, onze rounds de review, e dezenove premissas do PRD derrubadas pela implementação.

| Arquivo | O quê |
|---|---|
| [prd.md](features/005-file-editor/prd.md) | Por que o não-objetivo foi revertido, a segurança da escrita, a concorrência com o agente, riscos |
| [open-questions.md](features/005-file-editor/open-questions.md) | 24 perguntas, 21 respondidas |
| [tasks.md](features/005-file-editor/tasks.md) | 6 decisões e 13 tasks em 5 fases, mais as premissas travadas e as 20 pendências numeradas — **todas entregues**, mais o que o portão não prova |

### [project-from-url/](features/011-project-from-url/) — o projeto vem de uma URL

Sucede a `file-editor`. Antes dela só se registrava repositório que já estava no disco; esta feature clona de qualquer URL git — GitHub, GitLab, Gitea, servidor da empresa. É a primeira em que o daemon **executa rede a partir de uma string colada** e a primeira em que ele **apaga** um diretório, o que faz da segurança a maior seção do PRD. Reverte o F2.5 do walking-skeleton para projeto gerenciado, e reorganiza o diretório de estado numa árvore só — `~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`.

| Arquivo | O quê |
|---|---|
| [prd.md](features/011-project-from-url/prd.md) | Escopo, a lista de permissão de transporte, o segredo que morre na fronteira, o clone como job, e por que remover um projeto clonado agora **apaga** o clone |
| [open-questions.md](features/011-project-from-url/open-questions.md) | 22 perguntas, **todas respondidas**. Quatro respostas derrubaram desenho |
| [tasks.md](features/011-project-from-url/tasks.md) | 11 decisões e 17 tasks em 5 fases — **todas entregues** — mais as 10 pendências numeradas e a regra que a suíte e2e matou |

### [workspace-screen/](features/010-workspace-screen/) — o workspace ganha uma tela

**Entregue.** Nasceu de uma pergunta de uso: *"tem uma memória do workspace? como eu acesso?"* — e a
resposta era que só através de um projeto, porque o botão que abre o painel direito só aparece com um
checkout selecionado. Workspace sem projeto não tinha porta nenhuma. Agora o painel central **é** a
tela do workspace, no lugar onde estava escrito "selecione uma worktree".

A resposta da **W4** mudou o tamanho da feature: consumo de tokens por projeto e por worktree, com
janela de tempo. E ele não era uma query nova — era um dado que o daemon **não gravava**: o
`usage_update` chegava, aparecia na aba que o gastou e sumia com ela.

| Arquivo | O quê |
|---|---|
| [prd.md](features/010-workspace-screen/prd.md) | O que o workspace não tem, o que a tela é, o que fica fora e por quê, e as três telas que precisam nascer no Open Design |
| [open-questions.md](features/010-workspace-screen/open-questions.md) | 6 perguntas, **todas respondidas**. A W4 é a que mudou o escopo, e a decisão dela explica por que o consumo exige tabela nova |
| [tasks.md](features/010-workspace-screen/tasks.md) | 9 tasks em 4 fases, **todas fechadas com prova**, mais as duas tabelas do que a execução achou — inclusive um teste que passava por acidente (pego por mutação) e três caixas que ficaram marcadas por inferência até uma auditoria devolvê-las para aberto |

### [workspace-memory/](features/007-workspace-memory/) — o harness lembra

**Completa — nove PRs, mais o S1, o S2 e as duas telas que faltavam.** A primeira feature que não é
de tela: memória compartilhada do workspace e aprendizado contínuo por projeto. É o pilar que dá sentido ao conceito de workspace — dois
projetos que se conhecem. Foi ela que forçou a decisão do ACP: o daemon precisava entender a sessão,
e por PTY ele só via bytes.

| Arquivo | O quê |
|---|---|
| [prd.md](features/007-workspace-memory/prd.md) | As três naturezas do conhecimento, o que a decisão por ACP mudou, onde cada coisa vive, o portão de escrita, a fronteira cross-projeto, riscos |
| [open-questions.md](features/007-workspace-memory/open-questions.md) | 47 perguntas, **44 respondidas** — o registro de por que cada decisão foi tomada. A Q38 fechou na PR 08, quando o custo de esperar mudou: agente passou a escrever. As três abertas (Q39, Q44, Q46) são de curadoria e de identidade de ator — a Q46 é a [autenticação do daemon](project/backlog.md), que é do projeto e não desta feature |
| [tasks.md](features/007-workspace-memory/tasks.md) | Uma seção por PR. Cada uma termina com a tabela do que ela **decidiu enquanto executava** — as decisões que o desenho não previu e que a implementação cobrou. É onde ler quando algo no código parecer arbitrário |
| [roadmap.md](features/007-workspace-memory/roadmap.md) | **A feature em pilha de PRs**: topologia de branches, as sete regras da pilha, as cinco partes da espinha, o que anda em paralelo e onde o ACP entra |
| `packages/web/prototype/lumem-memory.html` | O protótipo, agora com **sete telas** e vindo do Open Design como todos os outros: o que existe no escopo ativo (com busca), a inbox, o conflito no mesmo escopo, a linha do tempo, os números, os estados degradados e os playbooks. Era o único protótipo que vivia só neste repositório — anterior à regra de 2026-08-19 |
| [context-delivery.md](features/007-workspace-memory/context-delivery.md) | Como a memória chega no agente: **núcleo comportamental + skill + serviço `lumem-memory` com auto-learn**. O que o desenho compra, o que ele cobra, o que medir, e as **8 decisões (D1–D8)** |

Quatro decisões já fechadas mudaram o desenho: **nenhuma memória vive dentro do repositório** (menos o
`id` do projeto), o **transporte passa a ser ACP**, o **`~/.lumem` é versionado por git pelo próprio
Lumem**, e a memória chega ao agente como **serviço, não como texto injetado**.

### [acp-sessions/](features/006-acp-sessions/) — a sessão vira conversa

**Fases 1, 3 e 4 entregues — 26 de 26 tasks, gate cheio verde.** Paridade funcional com o uso diário: a conversa roda uma tarefa inteira sem terminal, com plano, uso e custo, seletores, comandos de barra, o terminal que o agente pede e `fs/*` pelo `FileService`. Falta a fase 5. As 14 perguntas de desenho estão respondidas e o
spike mediu autenticação e consumo (a janela ficou parcial). A sessão de agente deixou de ser um terminal
e passou a ser uma conversa estruturada por [ACP](project/pty-vs-acp.md). Destrava as partes 06–09 da memória, o custo por projeto e
a política de permissão.

| Arquivo | O quê |
|---|---|
| [prd.md](features/006-acp-sessions/prd.md) | O que o spike mediu — **autenticação e consumo nesta máquina**, e a janela só até "nasce em 1M" —, escopo do transporte e da tela, riscos, fases |
| [open-questions.md](features/006-acp-sessions/open-questions.md) | 16 perguntas, **14 respondidas** — inclusive o volume da transcrição medido em 675 sessões reais. **A13** e **A14** nasceram no protótipo; a **A15** nasceu na fase 4 e a **A16** na fase 6, as duas abertas |
| [tasks.md](features/006-acp-sessions/tasks.md) | **35 tasks, todas fechadas**, nas fases 1, 3, 4, 5 e 6 do PRD. Diz também por que a fase 3 não começa antes da 1, por que a escrita em disco vem antes de tudo na 4, e por que a gravação da transcrição vem antes de tudo na 5 |
| `packages/web/prototype/lumem-acp-conversation.html` | O protótipo da fase 2: seis telas — conversa, ferramenta, permissão, plano, uso, limites. Não é documentação, é o desenho executável; fica junto dos outros protótipos |

### [onboarding/](features/008-onboarding/) — a máquina vazia chega até a primeira conversa

**Completa — 21 de 21 tasks.** Nove telas, do pré-voo da máquina ao primeiro turno com o Claude por
ACP. Era a maior distância entre desenho e produto do projeto: a máquina vazia chegava ao `FirstRun`
— um campo e um botão — e parava, e o caminho até uma conversa exigia seis fatos que só existiam em PRD
e em código. Agora um e2e sai de `~/.lumem` vazio e chega a um turno respondido **sem tocar a API**. O
`FirstRun` foi apagado: o fluxo é a única porta de entrada.

| Arquivo | O quê |
|---|---|
| [prd.md](features/008-onboarding/prd.md) | O que existe hoje **tela por tela**, medido no código; as quatro leituras novas do daemon; e o §4 — as **cinco divergências** entre o desenho e o produto, com quem ganha em cada uma (a mais séria: o desenho manda instalar um pacote que não é o que o daemon executa) |
| [open-questions.md](features/008-onboarding/open-questions.md) | 17 perguntas, **todas implementadas como propostas e todas ainda abertas** — proposta seguida não é pergunta respondida, e cada uma traz embaixo o que a implementação fez e o que custou |
| [tasks.md](features/008-onboarding/tasks.md) | 21 tasks em 4 fases, **todas fechadas**, começando pela **T0**: corrigir o desenho antes de portar. No fim, **o que a execução achou** — nove coisas que o plano não previa — e o que o portão não prova |

Duas coisas que este PRD achou e valem fora dele, as duas agora **medidas** e não supostas: o
`initialize` do ACP devolve `agentInfo.version`, então a versão pinada do adaptador **é detectada** em
vez de digitada — provado por um integration marcado contra o `claude-agent-acp` de verdade; e a
"escolha" de autenticação do desenho não escolhia nada, então virou relato do que a sonda achou.

### [agent-login/](features/009-agent-login/) — conectar agente é login, e só

**Completa — 8 de 8 tasks.** O rodapé da sidebar pedia cinco campos — nome, transporte, comando,
argumentos, versão do adaptador. Nenhum era escolha de quem usa. Agora é uma linha com o estado da
conexão e um painel que **pergunta uma coisa**: com qual conta você entra. Os botões vêm do
`authMethods` do handshake; o adaptador o daemon instala sozinho, numa versão fixa.

| Arquivo | O quê |
|---|---|
| [prd.md](features/009-agent-login/prd.md) | O **§2 é o coração**: quatro medições contra o adaptador real, duas delas derrubando premissas já publicadas neste repositório. Mais a reversão nomeada da decisão de ontem sobre instalar, e a tabela de onde o desenho e o protocolo discordaram |
| [open-questions.md](features/009-agent-login/open-questions.md) | 8 perguntas, **todas fechadas** — seis pela medição, duas por decisão do Vinicius (o escopo, e onde a chave de API moraria quando voltar) |
| [tasks.md](features/009-agent-login/tasks.md) | 8 tasks em 3 fases, começando por **medir**. No fim, cinco coisas que a execução achou — inclusive um bug de 15 segundos por carga de página que o e2e pegou |

O achado que vale fora da feature: **o `claude-agent-acp` não oferece login a quem não pede.**
`authMethods` vinha vazio porque o Lumem nunca declarou `clientCapabilities.auth.terminal` — não porque
o adaptador não tivesse o que oferecer. Com a capacidade declarada, ele oferece dois métodos, os dois
`type: "terminal"`: o login é um comando dele rodando num terminal, e não uma chamada de `authenticate`.

### [project-scripts/](features/012-project-scripts/) — os scripts do projeto, e o rodapé que os mostra

**Completa — 14 tasks, gate cheio verde.** O Lumem criava worktrees que não rodavam: nasciam sem
dependência, sem build e sem nenhum lugar no produto onde subir a aplicação. Agora `setup`, `run` e
`teardown` moram no `<repo>/.lumem/project.toml` — o arquivo que já existia, com o `id` dentro — e
ganharam uma faixa abaixo da árvore de arquivos, com `Setup`, `Run` e `Terminal`. Worktree nova nasce
preparada, o `run` sobe com um clique e o botão `Abrir :PORTA` diz de onde tirou o número. Fecha o
item **F** do [backlog](project/backlog.md).

| Arquivo | O quê |
|---|---|
| [prd.md](features/012-project-scripts/prd.md) | A ironia medida neste repositório (o `scripts/workspace/` que o Superset e o Conductor leem e o Lumem não), o formato do `[scripts]`, o contrato de variáveis de ambiente, e o §8 — executar string vinda de repositório de terceiro |
| [open-questions.md](features/012-project-scripts/open-questions.md) | 11 perguntas, **todas fechadas** — quatro pelo desenho aprovado, sete como proposta seguida, e a diferença entre as duas coisas está escrita. A S1 (onde o rodapé cabe) e a S5 (o Lumem virar alocador de portas) são as que mudaram o tamanho da feature |
| [tasks.md](features/012-project-scripts/tasks.md) | 14 tasks em 4 fases, **todas entregues**, mais as sete coisas que a execução achou — inclusive um CHECK que não recusava nada porque `NULL IN (…)` avalia para NULL |
| `lumem-run-dock.html` (Open Design) | **Sete quadros, aprovados em 2026-08-30** e já no repositório. As duas leituras da S1 lado a lado, mais Setup (passou e falhou), Terminal, o vazio que ensina o arquivo, o rodapé recolhido com o run visto de fora, e a primeira execução de um projeto clonado |
### [pull-request-status/](features/013-pull-request-status/) — a worktree diz se dá pra mesclar

**Completa.** Quando a worktree tem pull request, o topo do painel direito responde uma pergunta só —
**dá pra mesclar?** — em verde, vermelho ou âmbar, com o motivo escrito ao lado e um `↗` que abre a PR
no navegador. A linha da worktree na sidebar ganha `● #19` com a mesma cor, e ele é o único sinal que
sobrevive ao painel fechado — que é como o painel nasce. O que ela resolve não é "ver PR dentro do
editor": é que descobrir qual das oito worktrees está pronta e qual quebrou custava uma ida ao
navegador **por worktree** — um custo que crescia com a única coisa que o produto promete deixar
crescer.

O corte mudou durante a implementação. O item de backlog pedia *"ler, não agir"*, e o PRD concordava;
a **Q3** e a **Q4** foram respondidas **contra** essa proposta, e o Lumem passa a **mesclar** e a
**criar PR** — dois verbos, e só eles, cada um atrás de um portão que o daemon relê antes de escrever.
Reexecutar, aprovar e comentar continuam fora.

Nada disso guarda segredo: quem autentica é o `gh` da sua máquina, e o Lumem não vê, não pede e não
grava token. A consulta é **por projeto** — oito worktrees custam um processo, não oito.

Ela trouxe junto uma **mudança de estrutura** (v0.2) que **saiu daqui em 2026-09-01** e virou a
[worktree-first-tab](features/018-worktree-first-tab/): a coluna do meio passa a começar nas abas, e a
**primeira aba é a da worktree** — título, branch, sujeira, caminho em disco e ações saem do cabeçalho
fixo e viram conteúdo. O que isso cobra está escrito onde dói: com uma aba de sessão na frente, branch
e sujeira somem da vista, e quem paga são o ponto na aba e o marcador na sidebar.

| Arquivo | O quê |
|---|---|
| [prd.md](features/013-pull-request-status/prd.md) | A regra de cor como decisão de produto, o adaptador de host, a consulta **por projeto**, o §4 inteiro — executar binário de terceiro, renderizar texto que veio da internet e, desde a Q3, **escrever no repositório de outra gente** —, e o §10, que é a dívida de desenho que a mudança de corte criou |
| [open-questions.md](features/013-pull-request-status/open-questions.md) | 11 perguntas, **11 respondidas**. Duas delas contra a proposta escrita: a Q3 põe o `Merge` no v1 e a Q4 faz o Lumem criar a PR |
| [spike.md](features/013-pull-request-status/spike.md) | A saída real do `gh`, medida antes de o adaptador existir. O achado que mudou código: `mergeable` volta `UNKNOWN` para PR mesclada ou fechada, então a tabela lê `state` primeiro — senão toda PR mesclada ficaria âmbar |
| [tasks.md](features/013-pull-request-status/tasks.md) | **18 tasks em 7 fases** — as 16 do plano mais a P14, que a Q3 e a Q4 abriram. A fase 1 (E1–E3) saiu para a `worktree-first-tab`; a 2 é o spike |
| `packages/web/prototype/lumem-pr-bar.html` | O protótipo, vindo do Open Design: nove telas — a tela inteira, a aba da worktree, os cinco estados na largura do painel, as causas de bloqueio, a aba `PR`, os seis estados degradados, o painel fechado, as duas larguras extremas, e o que a barra não faz. **Zero token novo**; **doze** pares de contraste novos entraram no `contrast.ts`, que passou de 107 para 119. A tela 9 ficou desatualizada quando a Q3 e a Q4 mudaram o corte — está no §10 do PRD como dívida |

### [distribution/](features/014-distribution/) — o Lumem sai do checkout

**Completa: 16 tasks, seis fases, tudo entregue em 2026-08-30.** Onze features de pé e nenhuma forma
de *ter* o produto que não fosse clonar o monorepo: `@lumem/server` não tinha build, o daemon rodava
por `tsx`, o web só existia no vite, e o repositório público não tinha `README.md` — nunca teve — nem
`LICENSE`, o que significava todos os direitos reservados. Agora o daemon é **um bundle ESM** com só
o par nativo por fora, ele **serve o web na própria porta**, o binário `lumem` sobe tudo, e `npm i -g
@vinihcrosa/lumem-os` instala — medido: 55 arquivos, 1,3 MB empacotados, e sobe num prefixo limpo.

| Arquivo | O quê |
|---|---|
| [prd.md](features/014-distribution/prd.md) | O que falta hoje, item por item e medido; o bundle que **subiu de verdade** (3,0 MB, 123 ms) e a armadilha do `MIGRATIONS_DIR` que ele achou; a pipeline de release, cujo passo central é **instalar o tarball num runner limpo** — o único que pega dependência com `require` dinâmico, prebuild ausente e arquivo fora do pacote |
| [open-questions.md](features/014-distribution/open-questions.md) | 11 perguntas, **todas fechadas** numa resposta só — e a D1 **corrigida pelo registry no mesmo dia**: `npm view lumem` respondendo 404 provava que o nome estava livre, não que era publicável, e o `PUT` recusou por similaridade com `mem`. Oito foram proposta aceita; a D2 foi aceita **com prazo** (foreground agora, background depois) e a D11 veio com uma correção de rumo maior que a pergunta — o projeto todo vai para inglês. As duas viraram backlog na hora |
| [tasks.md](features/014-distribution/tasks.md) | 16 tasks em 6 fases, **todas entregues**, na ordem do risco: a prova de que o artefato sobe veio na T2, antes de existir CLI, e o smoke de instalação vem antes de qualquer publicação |
| [../README.md](../README.md) | a porta do repositório, em inglês, com [tradução](../README.pt-BR.md) ao lado — o primeiro arquivo do outro lado da D11 |

---

## As quatro que a tela pediu — desenhadas a partir dela, em 2026-09-01

Nove anotações feitas clicando na tela `/` viraram quatro features independentes, e **as quatro
fecharam**. A nona anotação — *"abri a PR e não aparece"* — não virou feature: é a
[pull-request-status](features/013-pull-request-status/) acima, que saiu do desenho e **está implementada**.

### [sidebar-actions/](features/017-sidebar-actions/) — criar de onde se olha

**Completa.** As duas coisas que o Lumem cria não se criavam de onde elas moram: o
`＋adicionar projeto` estava no rodapé da sidebar (e se afastava do título `Projetos` conforme a lista
crescia), e criar worktree custava **três cliques e uma troca de tela** — para a ação mais repetida do
produto. Agora é um `+` no cabeçalho `Projetos` e um `+` na linha de cada projeto, e os dois diálogos
viraram **modal centrado**, sobre um véu, com o foco preso dentro e devolvido ao `+` que o abriu.

Nasceu com o desenho já pronto no Open Design — e **duas perguntas foram respondidas contra ele**. A
[Q1](features/017-sidebar-actions/open-questions.md) pinta o `+` em repouso em vez de só no hover; a **Q5** faz
o modal do clone **ficar aberto até o fim**, em vez de fechar e mandar o progresso para a árvore. O
desenho foi **reescrito lá** antes de virar código, porque a regra não permite o contrário — e as duas
reversões estão argumentadas nos quadros que elas substituíram, com o custo escrito: a tela fica presa
por minutos enquanto um clone grande roda.

| Arquivo | O quê |
|---|---|
| [prd.md](features/017-sidebar-actions/prd.md) | As três regras (o botão fica no cabeçalho da coisa que ele acrescenta; uma ação, um lugar; o diálogo abre no centro), o que a mudança cobra, e as F1.9/F1.10 que as duas reversões acrescentaram |
| [open-questions.md](features/017-sidebar-actions/open-questions.md) | 6 perguntas, **6 respondidas**, mais duas derivadas. A Q1 e a Q5 vieram contra a proposta **e contra o desenho**; a Q5a é a que a Q5 abriu: `Esc`, `✕` e véu não fecham enquanto clona, e a saída é cancelar |
| [tasks.md](features/017-sidebar-actions/tasks.md) | 11 tasks em 5 fases, na ordem do risco: o `Modal` primeiro (é a peça que os dois diálogos herdam), o `+` da linha por último |

### [worktree-first-tab/](features/018-worktree-first-tab/) — o que é da worktree mora na worktree

**Completa.** A coluna do meio é **caminho → abas → conteúdo**, e a worktree é a primeira aba: fixa,
sem `✕`, com o ponto de sujeira que é o único sinal a sobreviver a outra aba estar na frente. O
`▤ arquivos` saiu da `Topbar` — era o único controle daquela faixa que não valia para a tela toda — e
foi para a ponta direita da faixa de abas do checkout, o único lugar que existe em todas as abas de um
checkout e em nenhum lugar fora dele. Extraída da Fase 1 da
[pull-request-status](features/013-pull-request-status/), que na época continuava travada, e entregue sem ela.

O que a mudança cobra está escrito onde dói, e o e2e do onboarding provou de graça: com a conversa na
frente, o nome da worktree só existe na aba.

| Arquivo | O quê |
|---|---|
| [prd.md](features/018-worktree-first-tab/prd.md) | O §4 — com uma aba de sessão na frente, branch e sujeira somem da vista, e quem paga são o ponto na aba e o caminho acima dela |
| [open-questions.md](features/018-worktree-first-tab/open-questions.md) | 5 perguntas, **5 respondidas** — e o registro de **como**: cada uma pela proposta já desenhada. A Q1, herdada da barra da PR, mudou de forma antes de virar linha, porque o código desmentiu o argumento dela |
| [tasks.md](features/018-worktree-first-tab/tasks.md) | 9 tasks em 4 fases, **todas entregues**. Sem daemon: o risco era de **regressão**. Termina com o que a execução achou — inclusive o bug que 826 testes de componente não pegam e o e2e pega |
| `packages/web/prototype/lumem-worktree-tab.html` | O protótipo, vindo do Open Design: dez telas — antes × depois da moldura, a tela inteira, a barra de abas de perto com os estados do `▤`, a aba da worktree sozinha, o `▭ local`, as quatro leituras da Q1, os dois lugares do `▤` na Q2, os dois estados degradados que a aba herda, e o que o desenho não faz. **Zero token novo**; um componente novo só, o `.tabs__files` |

### [run-dock-open/](features/015-run-dock-open/) — o rodapé nasce aberto · **completa**

*"Minha aplicação está de pé, e em que porta?"* é a primeira pergunta ao chegar numa worktree, e a
resposta chegava recolhida. A PRD dizia que mudar o padrão **não** era uma linha — a conta de espaço
travava: coluna em 640px, altura de metade da janela. O desenho **mediu** as duas parcelas e as duas
já estavam pagas: chegar não é um `toggle`, então a coluna não sobe; e metade da coluna deixa 11 das
16 linhas de árvore, contra 14 da alternativa — três linhas que não pagam um segundo número de altura
no produto. **Era uma linha.**

| Arquivo | O quê |
|---|---|
| [prd.md](features/015-run-dock-open/prd.md) | As três parcelas da conta — largura, altura e processo — e por que as três saíram de graça |
| [open-questions.md](features/015-run-dock-open/open-questions.md) | 7 perguntas, todas respondidas. Seis no Open Design em 2026-09-01; a **Q6 revertida em 2026-09-06**, antes do código, com a folha reescrita para registrar |
| [tasks.md](features/015-run-dock-open/tasks.md) | 3 tasks numa fase, todas entregues. A armadilha era a prova, não o código: o padrão fechado nunca teve teste, então não havia o que reescrever — havia o que escrever |
| `packages/web/prototype/lumem-run-dock-open.html` | O protótipo: seis quadros que fazem a conta de espaço **aparecer** em vez de ser argumentada, cada decisão ao lado da alternativa recusada — e, desde 2026-09-06, a proposta de faixa que a Q6 derrubou, marcada e mantida |

### [session-mode/](features/016-session-mode/) — o modo sempre na tela · **completa**

O seletor de modo existia, mas era inteiramente derivado do que o agente relata: `configOptions` vazio
produzia **um composer mudo**, igualzinho a um bug de transporte. Agora a pílula existe sempre, e
quando o agente não oferece modos ela é a **política do Lumem** — o que o daemon responde a
`session/request_permission`. A autoria vai em glifo e idioma, não em cor; o que passa sozinho aparece
na conversa assinado; e nenhum caminho da feature nega sozinho.

| Arquivo | O quê |
|---|---|
| [prd.md](features/016-session-mode/prd.md) | Os dois donos de um modo (o do agente muda o que ele *tenta*; o do Lumem muda o que *passa*), e os três valores da política, com `liberado` atrás de portão |
| [open-questions.md](features/016-session-mode/open-questions.md) | 6 perguntas, 6 fechadas. A Q1 decidiu o tamanho — tela **e** política — e a Q6 nasceu no código: sem opção de permitir, o `automático` negaria em silêncio |
| [tasks.md](features/016-session-mode/tasks.md) | 12 tasks em 4 fases, as duas fusões que a execução cobrou, e os cinco achados — inclusive o `overflow: hidden` que só o e2e podia ver e o menu que ficava clicável, achado em revisão |

### [composer-menus/](features/023-composer-menus/) — o menu do composer aparece inteiro · **completa**

O menu do seletor aparecia cortado, e a parte cortada não existia nem para o olho nem para o mouse:
`.composer__box` tinha `overflow: hidden`. O recorte saiu — os cantos são idênticos sem ele, e isso
foi **medido** no navegador —, todo menu ganhou teto de 280px com rolagem própria, e a âncora virou
uma frase: um popover ancora no que o abre. Desenhar o estado de hoje achou dois defeitos que ninguém
tinha visto, um deles grave: o menu de `/comandos` era **invisível por inteiro**, há três features.

| Arquivo | O quê |
|---|---|
| [prd.md](features/023-composer-menus/prd.md) | os três defeitos que uma declaração produzia, e por que o conserto é remover o recorte em vez de fugir dele |
| [open-questions.md](features/023-composer-menus/open-questions.md) | 5 perguntas, **5 respondidas** — as três primeiras no Open Design, e a Q1 respondida por medição, não por argumento |
| [tasks.md](features/023-composer-menus/tasks.md) | 4 tasks em 2 fases, todas entregues. A armadilha é a prova: jsdom não faz layout, então o e2e pergunta `elementFromPoint` e não `toBeVisible` |
| `packages/web/prototype/lumem-composer-menus.html` | o protótipo: o §1 desenha o produto de hoje com `.clip`, o §2 põe os dois cantos lado a lado, o §3 é a tabela de âncoras |

---

## Propostas de 2026-09-05 — três ainda de pé, uma fechada

Saíram da avaliação de arquitetura do dia: fundação sólida, teste raro, e o núcleo da visão —
tarefas, mais de um agente — inteiro no backlog enquanto a memória, o subsistema mais elaborado, é o
menos usado. A avaliação também pedia "empacotar"; a [distribution](features/014-distribution/prd.md) já tinha
feito isso, e o que sobrou dela (daemon em background, subir com a máquina) está no backlog H. Depois
de escritos, a `main` andou — a [worktree-first-tab](features/018-worktree-first-tab/) e a
[session-mode](features/016-session-mode/) foram entregues, e remover projeto passou a cascatear (WS-Q22) — e
os quatro foram ajustados a isso. Cada um tem `prd.md` e `open-questions.md`; **as tasks nascem depois
das perguntas respondidas.** A ordem abaixo é a recomendada.

### [daemon-auth/](features/019-daemon-auth/) — o daemon confere quem fala com ele

Sai do backlog e da Q46 da memória. Zero autenticação, zero checagem de `Host` e `Origin`: DNS
rebinding e sequestro de WebSocket não esperam o daemon sair do loopback — e `lumem --host 0.0.0.0`
é um flag. Fase 1 é um dia; fase 2 é token em cookie, com a origem única que a distribution já deu;
fase 3 é identidade por sessão, que fecha o ator "declarado, e ainda não provado".

| Arquivo | O quê |
|---|---|
| [prd.md](features/019-daemon-auth/prd.md) | as três ameaças reais em ordem, o que fica de fora, F1–F4 e o que cada fase fecha |
| [open-questions.md](features/019-daemon-auth/open-questions.md) | 6 perguntas: fase 1 sozinha, cookie ou não, `Strict` ou `Lax`, token por sessão, `LUMEM_HOST` fora do loopback, onde o segredo vive |

### [memory-dogfooding/](features/020-memory-dogfooding/) — três semanas com a memória ligada

Não é feature: é uso medido, no `lumem` instalado. Os seis números do `context-delivery.md` §6 nunca
tiveram leitura, e o custo do auto-learn e da destilação não é gravado — o item *"O que o Lumem gasta
sozinho"* do backlog, que sai de lá para a F1 daqui. Instrumenta o que falta,
liga um interruptor por semana, e escreve a decisão antes do primeiro número: a memória ganha mais
código, ou congela.

| Arquivo | O quê |
|---|---|
| [prd.md](features/020-memory-dogfooding/prd.md) | o que existe para medir e o que falta, o protocolo semana a semana, os critérios, o §7 vazio à espera do resultado |
| [open-questions.md](features/020-memory-dogfooding/open-questions.md) | 6 perguntas — as **U2–U4 são os critérios**, e têm que estar respondidas antes da semana 1 |
| [journal.md](features/020-memory-dogfooding/journal.md) | uma entrada por sexta: a saída do `report` e três linhas |

### [second-agent/](features/021-second-agent/) — o segundo agente

O ACP foi escolhido por ser agnóstico e nada provava isso. **Completa** em 2026-09-07: o Codex
conversa, entra e é somado à parte. A ordem foi medir primeiro — a fase 0 subiu o `codex-acp@1.10.0`
de verdade (2026-09-06) e mudou duas decisões antes de existir código: o CLI não precisa estar no
PATH, o adaptador não pede `fs` nem `terminal` ao cliente, o login é uma **chamada** e não um
comando, e a tradução atravessou um turno inteiro com zero `warn`. Isso fez a F2 crescer, a F3
encolher para teste, e tirou a escolha de agente do primeiro acesso.

| Arquivo | O quê |
|---|---|
| [prd.md](features/021-second-agent/prd.md) | o que no código sabe que é Claude e o que já é genérico; o §4 com os números da fase 0; F1–F5 |
| [open-questions.md](features/021-second-agent/open-questions.md) | 8 perguntas, **8 respondidas**: qual agente, instalado ou no PATH, onboarding pergunta ou não, consumo sem número, comparação, a semente PTY — mais as duas que o desenho abriu: qual login é o preenchido, e onde mora o verbo |
| [tasks.md](features/021-second-agent/tasks.md) | 16 tasks em 4 fases, **todas fechadas**: medição, catálogo, login (com desenho feito no Open Design) e consumo |

### [dev-harness/](features/024-dev-harness/) — o harness deste repositório

A primeira feature que não é sobre o produto: é sobre o repositório que o constrói. Sai da
[auditoria de harness](project/harness-audit.md) e do diagnóstico dela em uma frase — **o repositório
verifica muito e não bloqueia nada**. Os sensores são bons e rápidos (3151 testes em 1min05, 78 e2e em
2min29, CI em 4min, `any = 2` em 105.757 linhas) e nenhum deles participa da decisão de mesclar:
`main` sem proteção, sem check obrigatório, sem hook, e a política de permissão do agente fora do git.
No mesmo ambiente, uma credencial de publicação permanente para um pacote público.

| Arquivo | O quê |
|---|---|
| [prd.md](features/024-dev-harness/prd.md) | o problema, as três fases, as três classes de N3, os não-objetivos com motivo, e o que muda arquivo por arquivo |
| [open-questions.md](features/024-dev-harness/open-questions.md) | 3 respondidas antes da PRD existir (o token era só do CD; `main` desprotegida por inércia; as classes de N3 confirmadas) e 8 abertas |
| [tasks.md](features/024-dev-harness/tasks.md) | 16 tasks em 3 fases, nenhuma iniciada — e o aceite de cada uma é comportamento observado, não configuração lida |

### [workspace-tasks/](features/022-workspace-tasks/) — tarefa como entidade

O produto chama de tarefa uma coisa que não existe. Tarefa por workspace com projeto obrigatório,
"trabalhar nesta tarefa" abre worktree e sessão com o composer pré-preenchido, o agente cria tarefa
por `POST /tasks` e escrever para cima é proposta, `done` é humano, custo por tarefa de graça. Fila
com lease fica no backlog.

| Arquivo | O quê |
|---|---|
| [prd.md](features/022-workspace-tasks/prd.md) | o modelo, as regras, F1–F6, e a tabela de **propostas** para as Q011–Q015 do projeto |
| [open-questions.md](features/022-workspace-tasks/open-questions.md) | 9 perguntas; a **T2** (tarefa sem projeto) e a **T4** (triagem junto com a inbox de memória) mudam o desenho |

---

## O contrato de documentação — 2026-09-07

### [docs-contract/](features/025-docs-contract/) — o número ordena, o ADR decide · **completa**

O `docs/prd/` tinha 24 pastas sem ordem legível, e a ordem só existia no git — que mente: três
commits criaram 2, 4 e 4 pastas de uma vez, então **10 das 24 não têm "antes"**. O pedido era um
índice temporal com a regra *"a PRD mais recente manda"*. A regra mudou antes do código: **PRD não é
fonte de verdade, ADR é** — e ADR não existia aqui.

Com a precedência num ADR, o número para de precisar afirmar prioridade, e três problemas
desaparecem sem regra nova: emenda posterior à criação, colisão de `NNN` entre worktrees, e
"nenhum arquivo descreve o presente". A feature é a primeira que **mede a própria documentação**: 44
declarações informais de supersessão, 4 links mortos para um arquivo que nunca existiu, e **6 campos
`**Status:**` que discordavam do disco** — dois deles publicados nos `README` da raiz.

| Arquivo | O quê |
|---|---|
| [prd.md](features/025-docs-contract/prd.md) | as quatro camadas, as sete regras, e o que a referência estudada ofereceu — com as duas respostas dela que foram recusadas aqui |
| [open-questions.md](features/025-docs-contract/open-questions.md) | 12 perguntas, **12 respondidas**, três contra a proposta original. A Q8 carrega a **emenda** do dia: a derivação por checkbox estava errada, e o registro dela está na própria resposta contradita |
| [tasks.md](features/025-docs-contract/tasks.md) | 12 tasks em 6 fases. A ordem é forçada pela Q6 — o `docs/adr/` tem lastro **antes** de a regra valer, senão o repositório fica sem fonte de precedência nenhuma |
| `scripts/check-docs.ts` | o gate. Nasceu **verde**, que é o sinal de um gate que não checa nada — cada checagem foi provada ficando vermelha de propósito |

---

## Entregue em 2026-09-08 — a partir de uma anotação na tela

### [worktree-from/](features/026-worktree-from/) — de onde cortar · **completa**

A worktree nova nasce **sempre** da branch default, com um campo só. O produto já lê o host — põe
`● #19` na linha da sidebar — e mesmo assim o gesto mais comum ignora tudo isso: para trabalhar na PR
#19 você digita um nome à mão e vai fazer `checkout` no terminal. A feature dá ao modal **quatro
origens**: default, branch existente, issue e PR.

É a segunda do repositório a **medir antes de escrever**, e a medição mudou três decisões: `git
worktree add <path> origin/<branch>` entrega **HEAD destacado com `exit=0`** — o caminho ingênuo não
erra, entrega uma worktree quebrada dizendo que deu certo; a forma esperta do comando **mente** quando
dois remotos têm a mesma branch (`invalid reference` sobre uma ref que existe duas vezes); e *"três
listagens por abertura"* nunca foi verdade — branch é disco (10 ms), PR já está no `PrCache`, e issue
é **uma** leitura de ~0,7 s que começa depois de o modal existir.

| Arquivo | O quê |
|---|---|
| [prd.md](features/026-worktree-from/prd.md) | o §3 é a bancada: nove casos de `git worktree add` com saída e código real, o custo medido de cada leitura, e o que `gh issue develop` faz de fato — **ele escreve no host** |
| [open-questions.md](features/026-worktree-from/open-questions.md) | 9 perguntas, **9 respondidas**: as 5 do pedido mais 4 que a medição abriu. Três contrariam o que o pedido propunha, inclusive a regra de quando apagar a branch órfã |
| [tasks.md](features/026-worktree-from/tasks.md) | **14 tasks em 6 fases, todas entregues.** Zero migração: `name` e `branch` já são colunas separadas, e esta é a primeira feature em que elas divergem — a regra que a `walking-skeleton` escreveu para isso disparou pela primeira vez |
| `packages/web/prototype/lumem-worktree-from.html` | a folha, oito quadros — e cinco medidas do desenho corrigidas **no navegador**, da meia linha que era um sliver de 8px ao cartão que a moldura espremia em 12px. Ela também achou que a `docs-contract` editou **quatro cópias** de protótipo, que o primeiro `design:sync` desfez |

---

## Convenções

> **`adr/` decide · `project/` sustenta · `features/` executa · o código está em vigor.**

- Documentação em português, nome de arquivo em inglês e kebab-case
- Documentação **só** vive aqui — a regra está no [CLAUDE.md](../CLAUDE.md) e sobrepõe qualquer skill
- Arquivo novo entra neste índice na mesma hora
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](project/questions.md) se for do projeto todo
- **Precedência mora em `adr/`.** PRD é registro do que uma feature quis fazer na época dela, não fonte de verdade — o número da pasta é **ordem de leitura**, e não afirma prioridade
- **ADR só existe se passa nos três testes, todos:** difícil de reverter, surpreendente sem contexto, e produto de um trade-off real. Falha um e é uma nota na PRD
- **ADR não se reverte em parte** e não se edita depois de escrito: se só parte mudou, o ADR novo reafirma o que fica
- **Requisito contradito ganha nota no próprio requisito**, com âncora para quem contradiz e o escopo do que sobrou — *decisão revertida sem registro é decisão que volta sozinha*
- **`Status:` de PRD tem gramática fechada** — `proposta | em execução | completa | superada por <ADR>` — e o `gate:full` compara com o disco
