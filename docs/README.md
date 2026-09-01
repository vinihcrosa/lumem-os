# Documentação — Lumem-OS

Índice de tudo. O [walking-skeleton](prd/walking-skeleton/tasks.md) está de pé, vestido pela [ui-shell](prd/ui-shell/tasks.md), reorganizado pela [worktree-tabs](prd/worktree-tabs/tasks.md), com olhos para o repositório na [right-panel](prd/right-panel/tasks.md) e mãos no [file-editor](prd/file-editor/tasks.md). A [project-from-url](prd/project-from-url/prd.md) traz o projeto de fora: cola-se uma URL git e o daemon clona, num diretório de estado que passou a ser uma árvore só. Fechando o caminho de entrada, o [onboarding](prd/onboarding/prd.md) e o [agent-login](prd/agent-login/prd.md). E o harness passou a lembrar: a [workspace-memory](prd/workspace-memory/tasks.md) está **completa** — nove PRs, a primeira feature que não é de tela, e a única em que o sistema escreve sozinho (atrás de portão, inbox e interruptor desligado). Fechando o círculo, a [workspace-screen](prd/workspace-screen/prd.md) deu tela ao workspace: a memória dele deixou de depender de um projeto aberto, e o consumo de tokens passou a ser somável por projeto e por worktree.

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
| [workspaces.md](project/workspaces.md) | Os scripts de setup, run e teardown em `scripts/workspace/`, e como Superset e Conductor só apontam para eles |
| [task-cycle-evidence.md](project/task-cycle-evidence.md) | Linha de base medida do repositório e registro de custo do ciclo dev → review → rework. Lastro dos números que a skill `lumem-task-cycle` cita |
| [task-cycle-evidence.md](project/task-cycle-evidence.md) | Linha de base medida do repositório e registro de custo do ciclo dev → review → rework, ao longo de onze lotes. A skill que orquestrava o ciclo foi removida; as medições ficaram, porque são deste repositório |
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

### [project-from-url/](prd/project-from-url/) — o projeto vem de uma URL

Sucede a `file-editor`. Antes dela só se registrava repositório que já estava no disco; esta feature clona de qualquer URL git — GitHub, GitLab, Gitea, servidor da empresa. É a primeira em que o daemon **executa rede a partir de uma string colada** e a primeira em que ele **apaga** um diretório, o que faz da segurança a maior seção do PRD. Reverte o F2.5 do walking-skeleton para projeto gerenciado, e reorganiza o diretório de estado numa árvore só — `~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/project-from-url/prd.md) | Escopo, a lista de permissão de transporte, o segredo que morre na fronteira, o clone como job, e por que remover um projeto clonado agora **apaga** o clone |
| [open-questions.md](prd/project-from-url/open-questions.md) | 22 perguntas, **todas respondidas**. Quatro respostas derrubaram desenho |
| [tasks.md](prd/project-from-url/tasks.md) | 11 decisões e 17 tasks em 5 fases — **todas entregues** — mais as 10 pendências numeradas e a regra que a suíte e2e matou |

### [workspace-screen/](prd/workspace-screen/) — o workspace ganha uma tela

**Entregue.** Nasceu de uma pergunta de uso: *"tem uma memória do workspace? como eu acesso?"* — e a
resposta era que só através de um projeto, porque o botão que abre o painel direito só aparece com um
checkout selecionado. Workspace sem projeto não tinha porta nenhuma. Agora o painel central **é** a
tela do workspace, no lugar onde estava escrito "selecione uma worktree".

A resposta da **W4** mudou o tamanho da feature: consumo de tokens por projeto e por worktree, com
janela de tempo. E ele não era uma query nova — era um dado que o daemon **não gravava**: o
`usage_update` chegava, aparecia na aba que o gastou e sumia com ela.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/workspace-screen/prd.md) | O que o workspace não tem, o que a tela é, o que fica fora e por quê, e as três telas que precisam nascer no Open Design |
| [open-questions.md](prd/workspace-screen/open-questions.md) | 6 perguntas, **todas respondidas**. A W4 é a que mudou o escopo, e a decisão dela explica por que o consumo exige tabela nova |
| [tasks.md](prd/workspace-screen/tasks.md) | 9 tasks em 4 fases, **todas fechadas com prova**, mais as duas tabelas do que a execução achou — inclusive um teste que passava por acidente (pego por mutação) e três caixas que ficaram marcadas por inferência até uma auditoria devolvê-las para aberto |

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

### [project-scripts/](prd/project-scripts/) — os scripts do projeto, e o rodapé que os mostra

**Completa — 14 tasks, gate cheio verde.** O Lumem criava worktrees que não rodavam: nasciam sem
dependência, sem build e sem nenhum lugar no produto onde subir a aplicação. Agora `setup`, `run` e
`teardown` moram no `<repo>/.lumem/project.toml` — o arquivo que já existia, com o `id` dentro — e
ganharam uma faixa abaixo da árvore de arquivos, com `Setup`, `Run` e `Terminal`. Worktree nova nasce
preparada, o `run` sobe com um clique e o botão `Abrir :PORTA` diz de onde tirou o número. Fecha o
item **F** do [backlog](project/backlog.md).

| Arquivo | O quê |
|---|---|
| [prd.md](prd/project-scripts/prd.md) | A ironia medida neste repositório (o `scripts/workspace/` que o Superset e o Conductor leem e o Lumem não), o formato do `[scripts]`, o contrato de variáveis de ambiente, e o §8 — executar string vinda de repositório de terceiro |
| [open-questions.md](prd/project-scripts/open-questions.md) | 11 perguntas, **todas fechadas** — quatro pelo desenho aprovado, sete como proposta seguida, e a diferença entre as duas coisas está escrita. A S1 (onde o rodapé cabe) e a S5 (o Lumem virar alocador de portas) são as que mudaram o tamanho da feature |
| [tasks.md](prd/project-scripts/tasks.md) | 14 tasks em 4 fases, **todas entregues**, mais as sete coisas que a execução achou — inclusive um CHECK que não recusava nada porque `NULL IN (…)` avalia para NULL |
| `lumem-run-dock.html` (Open Design) | **Sete quadros, aprovados em 2026-08-30** e já no repositório. As duas leituras da S1 lado a lado, mais Setup (passou e falhou), Terminal, o vazio que ensina o arquivo, o rodapé recolhido com o run visto de fora, e a primeira execução de um projeto clonado |
### [pull-request-status/](prd/pull-request-status/) — a worktree diz se dá pra mesclar

**Desenhada, nada implementado — e travada na Q1.** Uma PR aberta hoje não aparece na tela porque
não existe uma linha de código que a leia: o que está pronto é o desenho. Quando a worktree tem PR aberta, o topo do painel direito responde
uma pergunta só — **dá pra mesclar?** — em verde, vermelho ou âmbar, com o motivo escrito ao lado e um
`↗` que abre a PR no navegador. O que ela resolve não é "ver PR dentro do editor": é que descobrir qual
das oito worktrees está pronta e qual quebrou custa hoje uma ida ao navegador **por worktree** — um
custo que cresce com a única coisa que o produto promete deixar crescer. Sai do backlog o item
*"abstração de git host"*, com o corte que ele mesmo pedia: **ler, não agir**.

Ela trouxe junto uma **mudança de estrutura** (v0.2) que **saiu daqui em 2026-09-01** e virou a
[worktree-first-tab](prd/worktree-first-tab/): a coluna do meio passa a começar nas abas, e a
**primeira aba é a da worktree** — título, branch, sujeira, caminho em disco e ações saem do cabeçalho
fixo e viram conteúdo. O que isso cobra está escrito onde dói: com uma aba de sessão na frente, branch
e sujeira somem da vista, e quem paga são o ponto na aba e o marcador na sidebar.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/pull-request-status/prd.md) | O §2.1 (a mudança de estrutura, com a conta dela), a regra de cor como decisão de produto, o adaptador de host, a consulta **por projeto** (oito worktrees = um processo), e o §4 — executar binário de terceiro e renderizar texto que veio da internet |
| [open-questions.md](prd/pull-request-status/open-questions.md) | 11 perguntas, **1 respondida** (a Q2, que moveu a barra para o painel). A Q1 (`gh` ou token nosso) trava o daemon; a Q3 e a Q4 decidem se a feature termina lendo ou passa a escrever no remoto |
| [tasks.md](prd/pull-request-status/tasks.md) | 16 tasks em 6 fases. A primeira é a **estrutura** — ela mexe em tela que já funciona —, e a segunda é um **spike**: a saída `--json` do `gh` é contrato de outro projeto, e ninguém mediu ainda |
| `packages/web/prototype/lumem-pr-bar.html` | O protótipo, vindo do Open Design: nove telas — a tela inteira, a aba da worktree, os cinco estados na largura do painel, as causas de bloqueio, a aba `PR`, os seis estados degradados, o painel fechado, as duas larguras extremas, e o que a barra não faz. **Zero token novo**; cinco pares de contraste novos, já medidos |

### [distribution/](prd/distribution/) — o Lumem sai do checkout

**Completa: 16 tasks, seis fases, tudo entregue em 2026-08-30.** Onze features de pé e nenhuma forma
de *ter* o produto que não fosse clonar o monorepo: `@lumem/server` não tinha build, o daemon rodava
por `tsx`, o web só existia no vite, e o repositório público não tinha `README.md` — nunca teve — nem
`LICENSE`, o que significava todos os direitos reservados. Agora o daemon é **um bundle ESM** com só
o par nativo por fora, ele **serve o web na própria porta**, o binário `lumem` sobe tudo, e `npm i -g
@vinihcrosa/lumem-os` instala — medido: 55 arquivos, 1,3 MB empacotados, e sobe num prefixo limpo.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/distribution/prd.md) | O que falta hoje, item por item e medido; o bundle que **subiu de verdade** (3,0 MB, 123 ms) e a armadilha do `MIGRATIONS_DIR` que ele achou; a pipeline de release, cujo passo central é **instalar o tarball num runner limpo** — o único que pega dependência com `require` dinâmico, prebuild ausente e arquivo fora do pacote |
| [open-questions.md](prd/distribution/open-questions.md) | 11 perguntas, **todas fechadas** numa resposta só — e a D1 **corrigida pelo registry no mesmo dia**: `npm view lumem` respondendo 404 provava que o nome estava livre, não que era publicável, e o `PUT` recusou por similaridade com `mem`. Oito foram proposta aceita; a D2 foi aceita **com prazo** (foreground agora, background depois) e a D11 veio com uma correção de rumo maior que a pergunta — o projeto todo vai para inglês. As duas viraram backlog na hora |
| [tasks.md](prd/distribution/tasks.md) | 16 tasks em 6 fases, **todas entregues**, na ordem do risco: a prova de que o artefato sobe veio na T2, antes de existir CLI, e o smoke de instalação vem antes de qualquer publicação |
| [../README.md](../README.md) | a porta do repositório, em inglês, com [tradução](../README.pt-BR.md) ao lado — o primeiro arquivo do outro lado da D11 |

---

## As quatro que a tela pediu — desenhadas a partir dela, em 2026-09-01

Nove anotações feitas clicando na tela `/` viraram quatro features independentes. Nenhuma tem tasks
ainda; todas têm PRD e perguntas abertas. A nona anotação — *"abri a PR e não aparece"* — não virou
feature: é a [pull-request-status](prd/pull-request-status/) acima, que nunca saiu do desenho.

### [sidebar-actions/](prd/sidebar-actions/) — criar de onde se olha

As duas coisas que o Lumem cria não se criam de onde elas moram: o `＋adicionar projeto` está no
rodapé da sidebar (e se afasta do título `Projetos` conforme a lista cresce), e criar worktree custa
**três cliques e uma troca de tela** — para a ação mais repetida do produto. Passa a ser um `+` no
cabeçalho `Projetos` e um `+` na linha de cada projeto, com os diálogos virando modal centrado.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/sidebar-actions/prd.md) | As três regras (o botão fica no cabeçalho da coisa que ele acrescenta; uma ação, um lugar; o diálogo abre no centro), e o que a mudança cobra — o estado vazio perde o botão que o cobria |
| [open-questions.md](prd/sidebar-actions/open-questions.md) | 6 perguntas. A Q5 é a que dói: um clone leva minutos, e um modal que se fecha some com o progresso |

### [worktree-first-tab/](prd/worktree-first-tab/) — o que é da worktree mora na worktree

O cabeçalho do checkout ocupa altura em **todas** as abas para dizer o que só interessa a uma, e o
`▤ arquivos` mora na `Topbar` — interruptor global para uma coluna que pertence a um checkout.
A coluna do meio passa a ser **caminho → abas → conteúdo**, com a worktree como primeira aba, fixa e
sem `✕`. Extraída da Fase 1 da [pull-request-status](prd/pull-request-status/): ela não depende de
saber ler PR, e a outra está travada.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/worktree-first-tab/prd.md) | O §4 — com uma aba de sessão na frente, branch e sujeira somem da vista, e quem paga são o ponto na aba e o caminho acima dela |
| [open-questions.md](prd/worktree-first-tab/open-questions.md) | 5 perguntas. A Q1 é a Q11 herdada da barra da PR: o que a worktree ainda diz quando não está em foco |

### [run-dock-open/](prd/run-dock-open/) — o rodapé nasce aberto

*"Minha aplicação está de pé, e em que porta?"* é a primeira pergunta ao chegar numa worktree, e a
resposta chega recolhida. A PRD achava que mudar o padrão não era uma linha — a coluna subiria para
640px, a árvore nasceria pela metade. **Desenhada e decidida em 2026-09-01, é quase uma linha:** a
altura fica em metade da janela (medido: a alternativa comprava três linhas de árvore), e a coluna
fica em 360px, porque o piso de 640 já se aplica só no `toggle` — e chegar não é `toggle`. O preço,
com o nome certo, é **~45 colunas de terminal** na chegada.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/run-dock-open/prd.md) | As três parcelas da conta — largura, altura e processo. Mais o §4, escrito **depois** das decisões: o que o desenho propôs e sobreviveu (os dois botões descendo para a linha de estado, a saída vazia que informa) e o que ele propôs e morreu (a altura de leitura, o vazio compacto, a dobra que não é nossa) |
| [open-questions.md](prd/run-dock-open/open-questions.md) | 6 perguntas, **6 respondidas em 2026-09-01**. Três respostas mataram o que o desenho propunha, e a Q4 se dissolveu quando o código mostrou que a dobra é do `xterm`. A Q6 nasceu ao escrever as tasks e fechou no mesmo dia: um layout só |
| [tasks.md](prd/run-dock-open/tasks.md) | **4 de 4 entregues.** A T1 é a feature inteira e tem poucas linhas; a T2 e a T3 são as duas consequências visíveis de a coluna ficar em 360px; a T4 é o e2e da chegada. O que a execução achou está no fim do arquivo — inclusive o `▶ rodar` desabilitado que desapareceu de graça |
| `packages/web/prototype/lumem-run-dock-open.html` | O protótipo, vindo do Open Design em 2026-09-01 e renderizado: **seis quadros** — a chegada sem nada de pé, a chegada com run vivo contra a tira de hoje, as três alturas com o número de arquivos **medido** em cada uma (16 / 14 / 11 de 16), as duas larguras em colunas de terminal (~45 contra 80), o checkout sem `[scripts]`, e o que a preferência de quem fechou continua mandando. Guarda as duas colunas: o decidido e o recusado. **Zero token novo** |

### [session-mode/](prd/session-mode/) — o modo sempre na tela

O seletor de modo existe, mas é inteiramente derivado do que o agente relata: `configOptions` vazio
produz **um composer mudo**, igualzinho a um bug de transporte. E o que o modo controla — *"se tá
liberado, se tem que perguntar tudo"* — é hoje inteiramente do agente: sem modos relatados, o Lumem
não tem política própria para oferecer.

| Arquivo | O quê |
|---|---|
| [prd.md](prd/session-mode/prd.md) | Os dois donos de um modo (o do agente muda o que ele *tenta*; o do Lumem muda o que *passa*), e os três valores da política, com `liberado` atrás de portão |
| [open-questions.md](prd/session-mode/open-questions.md) | 5 perguntas. A Q1 decide o tamanho da feature: só tela, ou tela + política no daemon |

---

---

## Convenções

- Documentação em português, nome de arquivo em inglês e kebab-case
- Documentação **só** vive aqui — a regra está no [CLAUDE.md](../CLAUDE.md) e sobrepõe qualquer skill
- Arquivo novo entra neste índice na mesma hora
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](project/questions.md) se for do projeto todo
