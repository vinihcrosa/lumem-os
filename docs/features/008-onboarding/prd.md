# PRD — Primeiro acesso

**Protótipo:** `packages/web/prototype/lumem-onboarding-flow.html` — **nove telas**, da máquina vazia
ao primeiro turno com o Claude por ACP
**Sistema de design:** `packages/web/prototype/lumem-design-system.html` + `lumem-ds.css` — a camada
compartilhada que o fluxo consome
**Sucede:** [acp-sessions](../acp-sessions/prd.md) — é ela que faz o passo 3 ter para onde ir
**Perguntas:** [open-questions.md](open-questions.md) · **Tasks:** [tasks.md](tasks.md)
**Status:** **implementado.** 21 tasks entregues, gate cheio verde — 1.671 unit/integration + 26 e2e.
O que a execução achou está no fim das [tasks](tasks.md), inclusive as duas premissas deste PRD que ela
derrubou.

---

## 1. Objetivo

Fazer o Lumem ser instalável por alguém que não escreveu o Lumem.

Hoje a máquina vazia chega até **criar workspace** — o `FirstRun`,
um campo e um botão — e para. Da tela dá para adicionar projeto, criar worktree e abrir sessão. O que
não dá é chegar numa **conversa**, que é a razão de o produto existir, porque no meio do caminho há
seis fatos que nenhuma tela conta:

1. Existe um adaptador ACP, ele é um pacote de terceiro, e ele não vem com nada.
2. O nome do pacote e o nome do binário são diferentes entre si.
3. A configuração do agente exige uma **versão pinada** do adaptador, e ela é digitada à mão.
4. Essa configuração mora no **rodapé da sidebar**, ao lado de "adicionar projeto".
5. Projeto entra por **caminho absoluto digitado** — não existe seletor de diretório.
6. `git` abaixo de 2.30 faz `git worktree` se comportar de outro jeito, e o produto inteiro é worktree.

Nada disso é bug. Tudo isso é conhecimento que hoje só existe em PRD e em código. O primeiro acesso é
**a maior distância entre desenho e produto neste projeto** — e é o próprio `FEATURES.md` do Open
Design que diz isso.

O `Done when` da feature é uma frase: **numa máquina que nunca rodou o Lumem, alguém que não conhece o
projeto chega até o primeiro turno de conversa sem abrir documentação e sem usar o terminal para nada
além de instalar o adaptador.**

---

## 2. O que existe hoje, tela por tela

Medido no código, não estimado. É o que impede a implementação de recriar o que está de pé.

| # | Tela | O que já existe | O que falta |
|---|---|---|---|
| 1 | **Boas-vindas** | nada | a tela inteira |
| 2 | **Máquina** (pré-voo) | `health` devolve a versão do daemon | versão do `git` e suporte a `worktree`, versão e caminho do `node`, existência e escrita em `~/.lumem`, espaço em disco |
| 3 | **Agente (ACP)** | [`isCommandAvailable`](../../../packages/server/src/agents/availability.ts) responde "está no PATH?"; `agentConfig.create` aceita `transport` e `adapterVersion` | achar `claude` **e** o adaptador com **versão e caminho**, o comando de instalação, e o que dizer sobre autenticação |
| 4 | **Handshake** | `AcpManager.handshake` troca `initialize` + `session/new` e guarda `modes`/`configOptions` | uma **sonda** que faz isso sem criar sessão, e devolve `protocolVersion`, `agentInfo`, `authMethods`, capacidades, tempos — e a troca literal |
| 5 | **Workspace** | `workspace.create` | a tela do passo, e dizer **o que foi escrito no disco** |
| 6 | **Projeto** | `project.add` valida repo e resolve a branch default antes de gravar | um `inspect` que lê **antes** de gravar: commits, remoto, árvore limpa, worktrees pré-existentes |
| 7 | **Primeira tarefa** | `worktree.create` + `session.createAgent` | a **prévia**: caminho, branch, sha de origem e o comando `git` que vai rodar |
| 8 | **A conversa** | **está inteira de pé** — [acp-sessions](../acp-sessions/prd.md) fases 1–6 | o balão de ensino da primeira permissão |
| 9 | **Pronto** | nada | a tela inteira, com o recibo do que passou a existir |

Duas leituras importantes desta tabela:

- **A tela 8 não é uma tela desta feature.** É o produto. O fluxo termina entrando nele, e o único
  acréscimo é o balão de ensino. Um segundo desenho de conversa aqui seria um segundo produto.
- **O trabalho de servidor é pequeno e o de cliente é grande.** Quatro leituras novas (`preflight`,
  `agents`, `probe`, `inspect`) e uma prévia (`worktree.plan`). Nenhuma escrita nova: as cinco
  mutations que o fluxo dispara — `workspace.create`, `agentConfig.create`, `project.add`,
  `worktree.create`, `session.createAgent` — **já existem e já são testadas**.

---

## 3. Escopo

### F1 — A casca do fluxo

- **F1.1** O fluxo é uma casca sem sidebar: não há workspace para mostrar nela. A sidebar aparece pela
  primeira vez no passo 8, e isso é o desenho contando que agora existe algo dentro.
- **F1.2** Cinco passos numerados (`máquina`, `agente`, `workspace`, `projeto`, `tarefa`) com a régua
  de progresso. As telas 1, 4 e 9 não são passos: são a abertura, a prova do passo 2 e o recibo.
- **F1.3** O fluxo aparece quando **não há workspace** — a mesma condição do `FirstRun` de hoje, que
  ele substitui — e é alcançável de novo pelo botão **revisar a configuração** da tela 9.
- **F1.4** Cada passo é **saltável**, menos o workspace: sem workspace não há app (BEHAVIOUR §6). Pular
  o agente é legítimo — o Lumem roda com sessão de shell.
- **F1.5** Nenhum estado novo em disco. "Onboarding concluído" é **derivado** do que existe (D2).
- **F1.6** `⏎` avança, `esc` volta. Toda tela declara isso no rodapé, como o protótipo faz.

### F2 — Pré-voo da máquina

- **F2.1** `setup.preflight` devolve uma lista de checagens tipadas, cada uma com estado
  (`ok` | `warn` | `fail`), o valor lido, e — quando existe conserto — **o comando que conserta**.
- **F2.2** As cinco do desenho: `daemon` (versão e endereço), `git` (versão, e se `worktree` existe),
  `node` (versão e caminho), `~/.lumem` (existe? dá para escrever?), `disco` (bytes livres).
- **F2.3** `git` abaixo de **2.30** é `fail`, e a razão vai na frase — não "versão inválida".
- **F2.4** A checagem **nunca instala nada** (D5). Ela lê, e no máximo cria `~/.lumem`, que é a única
  escrita que o fluxo faz sem ser pedida — e ela é anunciada no passo 3 antes de acontecer.
- **F2.5** Uma checagem que estoura não derruba a query: ela vira `fail` com a mensagem do erro. O
  pré-voo é a tela que a pessoa vê quando a máquina está errada; ele não pode ser a primeira coisa a
  quebrar.

### F3 — O agente e o handshake

- **F3.1** `setup.agents` devolve, para `claude` e para o adaptador: encontrado ou não, o caminho
  absoluto, e a **versão** — obtida do próprio binário, com timeout.
- **F3.2** Adaptador ausente traz o comando de instalação **selecionável**, com o nome de pacote
  medido: `@agentclientprotocol/claude-agent-acp` (§4, divergência 1).
- **F3.3** `setup.probe` sobe o adaptador, troca `initialize` e `session/new`, e devolve o que veio:
  `protocolVersion`, `agentInfo` (nome e **versão**), `authMethods`, capacidades declaradas, o id da
  sessão de teste e o tempo de cada etapa. Depois **mata o processo**.
- **F3.4** A sonda **não cria linha em `session`** e **não gasta token**: não há `session/prompt` no
  caminho (D4). O spike já mediu que `session/new` custa zero.
- **F3.5** A versão pinada da configuração vem de `agentInfo.version` — **detectada, não digitada**.
  É a correção que a feature traz para o formulário de hoje.
- **F3.6** Autenticação é **relatada, não escolhida** (§4, divergência 2): `authMethods: []` mais um
  `session/new` bem-sucedido significa credencial local válida, e é isso que a tela diz. Se o
  adaptador pedir autenticação, a tela mostra o método que ele declarou e o comando que resolve.
- **F3.7** Ao continuar, o fluxo cria a `agent_config` ACP por `agentConfig.create`, com a versão
  detectada. Nenhum endpoint novo de escrita.
- **F3.8** A troca aparece **literal** na tela, rotulada como reconstruída pela sonda — não é um log de
  fio (D7). É a prova de que conectou, e é onde a pessoa vê o que o agente pode fazer.

### F4 — Workspace e projeto

- **F4.1** O passo do workspace usa `workspace.create` e mostra **o que este passo escreve no disco**:
  `~/.lumem/lumem.db`, `~/.lumem/worktrees/`, `~/.lumem/transcripts/`.
- **F4.2** Onde ficam as worktrees é **exibido em leitura**, com a variável de ambiente que muda
  (`LUMEM_STATE_DIR`). Campo editável exigiria coluna nova e migração — [O11](open-questions.md).
- **F4.3** `project.inspect` lê o repositório **antes** de registrar: é git?, quantos commits, HEAD em
  qual branch, remoto, árvore limpa ou suja, e **quantas worktrees já existem** ali criadas fora do
  Lumem.
- **F4.4** A inspeção é **query, não efeito**: nada é gravado. Um caminho recusado não deixa nada
  atrás — a mesma regra do `project.add` de hoje.
- **F4.5** O caminho é **digitado, absoluto** (BEHAVIOUR §6, §4 divergência 3). O `escolher…` do
  desenho sai.
- **F4.6** Worktrees pré-existentes são `warn`, com a frase que o desenho já escreveu: continuam onde
  estão, o Lumem não mexe. **Listá-las como `externas` na sidebar não é desta feature** (§6).

### F5 — A primeira tarefa e a conversa

- **F5.1** `worktree.plan` devolve a prévia sem escrever nada: o caminho de destino, a branch, a base
  com o **sha curto**, e o comando `git worktree add` que vai rodar.
- **F5.2** Duas saídas, como o desenho: **worktree + sessão do agente** (padrão) ou **só a worktree**.
- **F5.3** Criar dispara `worktree.create` e, no padrão, `session.createAgent` com a `agent_config`
  criada no passo 3 — e o fluxo **termina entrando no produto**, na aba da conversa.
- **F5.4** Na primeira vez que um pedido de permissão aparece, um balão explica o que o modo `Auto`
  aprova sozinho e o que ele para. Some com **entendi** ou **não mostrar de novo**, e a preferência é
  do cliente (`localStorage`), não do daemon — [O16](open-questions.md).
- **F5.5** A tela 9 lista **só os atalhos que existem** (§4, divergência 4).

---

## 4. Onde o desenho e o produto discordam

Cinco casos. O desenho é a fonte de verdade do **visual**; ele não é fonte de verdade sobre **o que a
máquina faz**. Onde os dois discordam, o produto ganha e o desenho é corrigido no Open Design — e a
correção é parte da feature, não um recado.

### Divergência 1 — o comando de instalação instala a coisa errada

O desenho manda `npm i -g @zed-industries/claude-code-acp` e chama o binário de `claude-code-acp`.

O que este repositório **mediu**, em 2026-08-17, é `@agentclientprotocol/claude-agent-acp@0.69.0`, com
binário `claude-agent-acp` — está no [pty-vs-acp §9](../../project/pty-vs-acp.md) e é o nome que o
[integration marcado](../../project/testing.md) usa para decidir se roda ou pula.

**Ganha o produto.** É a divergência mais séria das cinco: seguir o desenho literal produz uma tela
que manda a pessoa instalar um pacote que não é o que o daemon vai executar.

### Divergência 2 — a escolha de autenticação não escolhe nada

> **Corrigida em 2026-08-20, no mesmo dia.** Esta divergência estava meio errada, e o que a
> desmentiu foi medir o adaptador declarando `clientCapabilities.auth.terminal` — ver
> [agent-login §2.1](../agent-login/prd.md). Existe escolha, ela vem do `authMethods`, e ela mora no
> painel de login. O que continua valendo é o passo 3 deste fluxo: ali ainda não houve handshake, então
> o que ele pode fazer é relatar qual credencial está no ambiente.

O desenho oferece **Assinatura Claude** × **Chave de API** como duas opções com marcador de rádio.

O adaptador não pergunta ao Lumem: ele usa a credencial que achar. O spike mediu `authMethods: []` e um
`session/new` bem-sucedido — o que significa que **a assinatura local já valia** e nada foi escolhido.

**Ganha o produto**, e a tela fica melhor: em vez de duas opções que não mudam o comportamento, ela
**relata o que a sonda achou** — credencial local válida, ou `ANTHROPIC_API_KEY` no ambiente do daemon,
ou um método que o adaptador exigiu e ainda não foi satisfeito.

### Divergência 3 — `escolher…` promete um seletor de diretório

Três telas (5, 6, 7) têm um sufixo `escolher…` no campo de caminho.

Ele não pode existir: o daemon pode estar em outra máquina, e o `<input type=file>` do navegador
entrega **arquivo**, não caminho de servidor. A regra já está escrita em BEHAVIOUR §6 e o
[`AddProjectDialog`](../../../packages/web/src/components/AddProjectDialog.tsx) já a segue.

**Ganha o produto.** O sufixo sai do desenho.

### Divergência 4 — a tela 9 promete três atalhos que não existem

Ela lista `⌘K`, `⌘⇧N`, `⌘⏎` e `⌥⇧P`. Existe **um**: `⌘⏎` envia o turno
([`Conversation.tsx`](../../../packages/web/src/components/Conversation.tsx)).

**Ganha o produto.** A tela lista o que existe; os outros três vão para o
[backlog](../../project/backlog.md). Tela de boas-vindas que ensina atalho inexistente é a pior lição
possível: a primeira coisa que a pessoa tenta não funciona.

### Divergência 5 — as telas 8 e 9 discordam entre si

O rodapé do composer na tela 8 diz `⏎ enviar · ⇧⏎ nova linha`. A tela 9 diz `⌘⏎ enviar`. O produto e o
BEHAVIOUR §4 dizem **`⌘⏎` envia, `⏎` faz linha nova** — prompt costuma ter várias linhas.

**Ganha o produto**, e a tela 8 não é reimplementada por causa disso: ela já está de pé com o
comportamento certo. O que muda é o desenho.

---

## 5. O que isso destrava

| Destrava | Como |
|---|---|
| **A segunda pessoa** | hoje o número de gente capaz de instalar o Lumem é um, e o gargalo é conhecimento não escrito em tela |
| **A versão do adaptador deixar de ser digitada** | `agentInfo.version` passa a ser lido; o formulário de hoje pede à mão o que o protocolo entrega |
| **A tela de preferências** | o pré-voo e a sonda são os dois blocos que ela vai reusar; é o buraco nº 1 do `FEATURES.md` |
| **Diagnóstico depois do primeiro dia** | `setup.preflight` não é só de onboarding: é o "por que isso parou de funcionar" de qualquer dia |

---

## 6. Não-objetivos

Cada um com a razão, porque não-objetivo sem razão volta como suposição.

- **Instalar pacote pela tela.** O botão "Instalar agora" do desenho não é implementado (D5). O daemon
  roda como a pessoa, `npm i -g` pode exigir `sudo`, e um daemon local que instala software global a
  pedido de um clique de navegador é o exemplo de manual de procurador confuso. A tela entrega o
  comando selecionável; quem roda é a pessoa, num terminal.
- **Clonar de uma URL.** A tela 6 oferece; a v1 não. Rede, credencial, progresso e cancelamento são
  uma feature, não um campo. [Backlog](../../project/backlog.md).
- **Seletor de diretório.** §4, divergência 3.
- **Tela de preferências.** O fluxo cria a `agent_config`; editar depois continua no rodapé da sidebar,
  com a mentira que a [A16](../acp-sessions/open-questions.md) já nomeou.
- **Worktrees `externas` na sidebar.** A tela 8 desenha o grupo; ele é feature de sidebar, e esta
  feature não redesenha a tela 8. [Backlog](../../project/backlog.md).
- **Paleta de comandos (`⌘K`), `⌘⇧N` e `⌥⇧P`.** §4, divergência 4. [Backlog](../../project/backlog.md).
- **Padrão de modelo e modo para as próximas sessões.** A tela 4 oferece; não há onde guardar — nem
  `agent_config` nem `workspace` têm a coluna, e inventá-la para um seletor é a ordem errada. A
  conversa já escolhe por sessão. [O14](open-questions.md).
- **Importar um `~/.lumem` existente.** O botão da tela 1 sai: se já há workspace no banco, o fluxo não
  aparece — o que o botão prometia é exatamente o que a F1.3 faz sozinha. [O1](open-questions.md).
- **Multi-plataforma no pré-voo.** As checagens são as de macOS, que é onde o projeto roda. Linux
  provavelmente passa; ninguém verificou, e o PRD não finge que sim.

---

## 7. Riscos

| Risco | Por que é real | O que segura |
|---|---|---|
| **A sonda depende de processo de terceiro** | é a única parte da feature que não é testável só com dublê | o [`acp-fake-agent`](../../../packages/server/src/testing/acp-fake-agent.ts) cobre o caminho todo; **um** integration **marcado** cobre o adaptador real, pulado quando ele não está no PATH — o padrão que a `right-panel` já usa com `git` |
| **`--version` de binário de terceiro é contrato frágil** | formato muda, binário trava, saída vai para `stderr` | timeout curto, e **versão desconhecida não é falha**: a linha diz "encontrado, versão não lida". O que decide o passo é a sonda, não o `--version` |
| **O fluxo vira a tela mais complexa e a menos usada** | nove estados que rodam uma vez por máquina | cada passo é saltável (F1.4), e nenhum passo guarda estado próprio: tudo que ele produz é dado do daemon, verificável por outra tela |
| **Implementar o desenho literal criaria um segundo jeito de fazer a mesma coisa** | três telas repetem formulário que já existe | os passos 5, 6 e 7 **reusam** `FirstRun`, `AddProjectDialog` e `CreateWorktreeDialog` no que der, e o que não der é nomeado na task |
| **`statfs` e `git --version` são checagens de plataforma** | quebram calado em ambiente diferente | cada checagem falha **sozinha** (F2.5); o pré-voo nunca é um erro só |
| **O balão de ensino chega quando a pessoa está no meio de um turno** | é a hora em que ela menos quer ler | ele nasce **depois** do pedido de permissão, não sobre ele, e a primeira ação continua sendo permitir |

---

## 8. Fases

| Fase | Entrega | `Done when` |
|---|---|---|
| **1** | a casca, a navegação, e as duas telas que não pedem daemon novo (1 e 9) | dá para atravessar o fluxo do começo ao fim, e ele não aparece para quem já tem workspace |
| **2** | a máquina, o agente e o handshake (2, 3, 4) | numa máquina sem o adaptador, a tela diz o que instalar; com ele, a sonda conecta e a `agent_config` nasce com a versão detectada |
| **3** | workspace e projeto (5, 6) | workspace criado, projeto inspecionado antes de entrar, e a tela diz o que foi escrito no disco |
| **4** | a primeira tarefa, o balão, e o e2e (7, 8) | banco vazio → primeiro turno de conversa, tudo pela tela, num único e2e |

A ordem é a do fluxo, e não é por acaso: cada fase termina numa tela que a pessoa consegue **ver**, e a
fase 4 é a única que precisa de todas as anteriores para significar algo.

---

## 9. Custo nos testes

| O quê | Como | Novo? |
|---|---|---|
| `setup.preflight` | unitário com `PATH` e `execFile` fabricados; sem tocar a máquina | sim |
| `setup.agents` | unitário, mesmo padrão; mais o caso "binário existe e `--version` trava" | sim |
| `setup.probe` | integration com o `acp-fake-agent`; **um** marcado com o adaptador real | reusa |
| `project.inspect` | integration com repositório git real, como a `right-panel` já faz | reusa |
| `worktree.plan` | unitário — é composição de caminho e leitura de sha | sim |
| As nove telas | componente, com o daemon dublado; mais o teste de **classe existe no stylesheet** que a `acp-sessions` criou | reusa |
| O fluxo inteiro | **um** e2e: banco vazio → primeiro turno, com o [fake ACP](../../../e2e/support/fake-acp-agent.mjs) | reusa |

O e2e é o único teste que prova o objetivo do §1, e é o que falha se qualquer passo do fluxo quebrar.
Ele é caro e é um só — os oito passos já têm cobertura própria por cima.
