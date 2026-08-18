# Backlog — o que ficou para depois

> **O que este arquivo é:** o lugar único de olhar para lembrar do que já foi discutido e adiado.
> Cada item tem **uma frase de contexto**, de onde veio, e o que precisa acontecer para ele voltar
> à mesa. Nada aqui está prometido nem estimado.
>
> **O que este arquivo não é:** roadmap, nem lista de tarefa. Tarefa vive em
> `docs/prd/<feature>/tasks.md`; ideia sem PRD vive aqui.
>
> **Regra:** toda vez que uma discussão terminar em *"isso fica para depois"*, o item entra aqui na
> mesma hora, com o link de onde a conversa aconteceu. Item que ganhar PRD sai daqui e vira uma pasta
> em `docs/prd/`.

---

## Como ler a tabela

| Coluna | O quê |
|---|---|
| **Peso** | `P` pequeno (cabe numa fase) · `M` médio (feature própria) · `G` grande (muda arquitetura ou tela inteira) |
| **Volta quando** | o gatilho concreto que devolve o item à discussão — sem isso, item adiado vira item esquecido |

---

## A. Conhecimento e memória

### Contrato entre projetos como entidade de primeira classe — `G`

Hoje o desenho trata "o `api` expõe `POST /v2/checkout` e o `web` consome" como **memória de
workspace** com dois campos (`owner_project`, `consumer_projects`). A versão cara é uma entidade de
verdade: dono, consumidores, versão, e **verificação contra o código** — que responderia "o que
quebra se eu mudar isto?" com dado, não com memória.

**De onde veio:** [workspace-memory Q2](../prd/workspace-memory/open-questions.md) · **Volta quando:**
a memória `contract` estiver em uso e você notar que ela mente com frequência, ou quando quiser
bloquear merge por quebra de contrato.

### Eixo de operação no funil de acesso cross-projeto — `P`

O `AccessRequest` do funil (`packages/server/src/memory/access.ts`) tem *quem*, *de onde*, *para onde*
e *o quê* — mas não tem **qual operação**. O PRD é explícito que o `lumem-memory` "sempre lê, nunca
escreve" (§11), e hoje isso é garantido pela ausência de chamador de escrita, não pelo tipo. Nomear o
eixo (`operation: "read"`, recusando o resto) custa uma coluna em `memory_access` e uma migração.

**De onde veio:** review do rework da [PR 03 de workspace-memory](../prd/workspace-memory/tasks.md) ·
**Volta quando:** a capacidade `readNeighbourRepository` for ligada para valer, ou quando aparecer o
primeiro chamador que não seja leitura.

### Recall semântico (embeddings) — `M`

O v1 é lexical (FTS5/BM25): determinístico, explicável, de graça. Não acha "deploy" buscando
"release". Com o redesenho da entrega de contexto isso ficou **barato de trocar depois**: a memória
virou um serviço com uma pergunta como interface, então mudar o motor por dentro não toca no que o
agente vê.

**De onde veio:** [workspace-memory Q22](../prd/workspace-memory/open-questions.md) e
[context-delivery §4.2](../prd/workspace-memory/context-delivery.md) · **Volta quando:** a busca
lexical falhar em caso real que você consiga nomear.

### Consolidação automática ("dreaming") — `M`

Promoção e mesclagem de memória sem você pedir. O Compozy usa portões (24h, 3 sessões, score 0.75)
que, em uso pessoal, podem nunca disparar; o Hermes roda por inatividade e deixa a passada cara
desligada por padrão. O v1 do Lumem tem gatilho explícito.

**De onde veio:** [workspace-memory Q30](../prd/workspace-memory/open-questions.md) · **Volta quando:**
existir sinal medido de uso (`recall_count`) suficiente para promover por critério objetivo em vez de
palpite de LLM.

### Aprender de ações, não só do que foi dito — `M`

Você editou por cima do agente, reverteu o commit dele, matou a sessão em 30 segundos, descartou a
worktree. É o sinal mais barato que existe e **nenhuma das quatro referências usa**. Pode entrar cedo
(é só registrar evento) e a interpretação vem depois.

**De onde veio:** [workspace-memory Q17/Q18](../prd/workspace-memory/open-questions.md) ·
**Volta quando:** o registro cru estiver de pé e houver volume para olhar.

---

## B. Como o daemon fala com o agente

> **Saiu daqui em 2026-08-17:** *transporte ACP*. Deixou de ser ideia adiada e virou **decisão**
> ([pty-vs-acp.md §9](pty-vs-acp.md)) — a próxima feature a desenhar é `acp-sessions`: transporte
> mais a tela da conversa. O que ficou no backlog é o que a decisão empurrou para depois **dela**.

### Política de permissão do lado do Lumem — `G`

Quem pergunta "posso escrever neste arquivo?" hoje é o CLI. Com ACP quem pergunta é o Lumem — e aí
dá para ter regra por projeto, negar escrita fora do checkout e auditar cada concessão.

**De onde veio:** [pty-vs-acp.md A3](pty-vs-acp.md), onde a resposta foi *"não agora, mas é uma
feature pro futuro"* · **Volta quando:** a tela de conversa do `acp-sessions` estiver de pé — o
diálogo de permissão já vai existir lá, e virar política é o passo seguinte.

### Consumo de token por projeto, worktree e classe de tarefa — `M`

O `usage_update` do ACP dá custo por turno. Agregado por projeto e por worktree, responde "quanto
custou esta feature" — que é um dos motivos declarados da migração.

**De onde veio:** as observações do Vinicius em [pty-vs-acp.md](pty-vs-acp.md) · **Volta quando:**
o transporte ACP estiver entregando `usage_update`.

### Notificação de sistema para pedido de permissão — `P`

Um agente em aba não visível pode estar parado esperando você. O v1 marca a aba e conta na sidebar;
notificação de sistema fica para depois — e ficou **mais** relevante com o default `auto`, em que o
que sobe para o humano é justamente o caso raro.

**De onde veio:** [acp-sessions A10](../prd/acp-sessions/open-questions.md) · **Volta quando:** você
perder tempo com agente parado sem perceber.

### Forkar uma conversa — `M`

O protocolo expõe `fork` junto de `resume` e `list`. Duplicar uma conversa a partir de um ponto é
feature de produto que nenhuma das quatro referências tem — "tenta de novo daqui, com outra
abordagem", sem perder o que veio antes.

**De onde veio:** [acp-sessions A7](../prd/acp-sessions/open-questions.md) · **Volta quando:** o
`resume` estiver de pé e você se pegar querendo bifurcar em vez de recomeçar.

### Múltiplas contas para o mesmo agente — `M`

Duas contas do Claude — pessoal e trabalho — selecionáveis por sessão, e o mesmo para os outros
agentes. O mecanismo já está identificado no [estudo do Compozy](../references/compozy.md): *provider
home isolation* — reescrever `HOME` e `XDG_*` do subprocesso dá credenciais separadas sem container.

Afeta o desenho de `agent_config` desde já: a credencial deixa de ser propriedade do **agente** e vira
propriedade de **(agente, conta)**.

**De onde veio:** [pty-vs-acp A2](pty-vs-acp.md) · **Volta quando:** você precisar rodar trabalho e
pessoal na mesma máquina sem trocar login na mão.

### Segundo e terceiro CLI de agente (Codex, opencode) — `M`

A v1 roda **só Claude**. Cada CLI novo é um adaptador ACP de terceiro a mais na conta de risco — por
isso entram um por vez, cada um pagando o próprio spike.

**De onde veio:** [pty-vs-acp A2](pty-vs-acp.md) · **Volta quando:** o primeiro estiver estável e você
sentir falta do segundo.

### Índice de regras com carregamento sob demanda — `M`

O núcleo não tem teto (D5), e cresce por acréscimo. A saída elegante, quando o alarme de tamanho
começar a tocar: em vez de injetar as regras, injetar um **índice** delas — *"vou commitar → busco a
regra de commit"*. Lazy loading de diretriz, o mesmo princípio da camada 3 aplicado à camada 1.

**De onde veio:** [context-delivery D5](../prd/workspace-memory/context-delivery.md) · **Volta
quando:** a marca d'água do núcleo passar do valor que você definir.

### Hooks por CLI — `P`, provavelmente morto

`SessionEnd`, `PostToolUse` e afins do Claude Code eram o plano B para enxergar dentro da sessão sem
trocar de transporte. **O ACP entrega os mesmos eventos, padronizados.**

**De onde veio:** [pty-vs-acp.md §6.2](pty-vs-acp.md) · **Volta quando:** sobrar agente rodando em
PTY que você queira que alimente memória — e só nesse caso.

---

## C. Tarefas e orquestração

### Tarefas de workspace atravessando projetos — `G`

O fluxo da [vision.md](vision.md): o agente do `api` percebe que o `web` precisa mudar e **cria a
tarefa lá**. É o irmão da memória — a proposta vira trabalho. A inbox de propostas da memória e a
fila de tarefas são quase a mesma tela.

**De onde veio:** [vision.md](vision.md) e [workspace-memory Q34](../prd/workspace-memory/open-questions.md) ·
**Volta quando:** a memória de workspace estiver de pé (ela é o insumo que faz a tarefa fazer
sentido).

### Fila com lease e múltiplos agentes puxando trabalho — `G`

Lease com deadline, heartbeat, fencing por sessão e recuperação por expiração — a mecânica que o
Compozy tem e que só se paga com múltiplos agentes autônomos.

**De onde veio:** [questions.md Q068](questions.md) · **Volta quando:** existir tarefa como entidade
e mais de um agente rodando sem você olhando.

---

## D. Git e integrações

### Abstração de git host (GitLab, e não só GitHub) — `M`

Ver PR, status de CI e review dentro do Lumem, com adapter por host. A vision pede; o escopo mata
quem tenta fazer completo de primeira.

**De onde veio:** [vision.md](vision.md), [questions.md Q022](questions.md) · **Volta quando:** a aba
de review existir.

### Stage, commit e revert pela UI — a aba `Review` — `M`

Diff é ler; git é agir. Ficou fora da `right-panel` de propósito.

**De onde veio:** [right-panel §5](../prd/right-panel/prd.md) · **Volta quando:** você se pegar
saindo do Lumem para commitar.

---

## E. Editor e painel de arquivos

Todos vindos de [right-panel §8](../prd/right-panel/prd.md) e [file-editor §9](../prd/file-editor/prd.md).

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| Watcher de filesystem | `P` | transforma conflito "descoberto ao salvar" em "avisado na hora" | recarregar na mão doer |
| Busca por conteúdo (grep) | `M` | merece desenho próprio por causa de repositório grande | você procurar coisa e não achar |
| Busca por nome na árvore | `P` | a árvore é lazy; buscar exige varrer o que não foi carregado | árvore grande incomodar |
| Diff lado a lado | `M` | outro componente inteiro, não uma variação do unificado | o unificado não bastar |
| Editar patch hunk a hunk | `M` | metade do caminho para a aba `Review` | a aba `Review` existir |
| Busca e substituição no arquivo | `P` | o CodeMirror já traz metade pronta | — |
| Histórico, blame, log | `M` | outra coluna, outro modelo mental | — |

---

## F. Plataforma

### Configuração de projeto versionada no repo — `M`

O arquivo `<repo>/.lumem/project.toml` **já vai existir** — a [Q3.1](../prd/workspace-memory/open-questions.md)
decidiu que o `id` do projeto mora nele. O que ficou para depois é o **resto** do conteúdo: script de
setup, script de run, comandos do projeto. A regra que delimita o arquivo: **o que é do repositório é
do time; o que é da instância é do Lumem.**

**De onde veio:** [workspace-memory Q3.1](../prd/workspace-memory/open-questions.md) · **Volta
quando:** você quiser que abrir um projeto novo já venha configurado, ou que um colega com Lumem herde
o setup.

### Memória compartilhada entre instâncias do Lumem — `G`

Efeito colateral da Q3.1: com o `id` do projeto commitado, duas instâncias do Lumem passam a ter a
**mesma chave** para o mesmo projeto. Isso não faz nada hoje, e é exatamente a peça que faltaria para
um dia compartilhar memória de projeto, ou de contrato, entre pessoas do time — sem migração de dados.

**De onde veio:** [workspace-memory Q3.1](../prd/workspace-memory/open-questions.md) · **Volta
quando:** existir uma segunda pessoa usando Lumem no mesmo repositório.

### `lumem-memory` lendo os repositórios para responder — `G`

O serviço começa respondendo **só a partir do acervo de memória**. Deixá-lo ler o código dos projetos
do workspace responde muito mais — e o transforma num agente com acesso a disco atravessando a
fronteira do §11 do PRD. Precisaria de capacidade declarada por projeto e registro de acesso.

**De onde veio:** [context-delivery D8](../prd/workspace-memory/context-delivery.md) · **Volta
quando:** a taxa de "não sei" do serviço for alta e o acervo, sozinho, não der conta.

### Autenticação do daemon — `M`

O daemon escreve no disco com as suas permissões e não pede nada a ninguém. A `file-editor` tornou
essa dívida visível.

**De onde veio:** [file-editor Q7](../prd/file-editor/open-questions.md) · **Volta quando:** o daemon
escutar em algo que não seja loopback.

### Multi-host — `G`

Rodar agente em outra máquina, que é o que o Superset faz. Muda modelo de dados, transporte e
segurança.

**De onde veio:** [comparison.md](../references/comparison.md) · **Volta quando:** uma máquina não
bastar.

### Projeto que não é repositório git — `P`

Pasta de docs, notas de produto do workspace. Hoje projeto **é** repo, e a memória de workspace
cobre boa parte desse caso.

**De onde veio:** [questions.md Q008](questions.md) · **Volta quando:** a memória de workspace não
der conta.
