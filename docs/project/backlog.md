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
> ([pty-vs-acp.md §9](pty-vs-acp.md)) — e virou feature própria, [acp-sessions](../prd/acp-sessions/prd.md):
> transporte mais a tela da conversa, com PRD escrito e spike rodado. O que ficou no backlog é o que a
> decisão empurrou para depois **dela**.

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

### Variáveis de ambiente na configuração de agente pela UI — `P`

O `agent_config` guarda `env` (objeto JSON) e o router aceita, mas o formulário da fase 6 não escreve:
controle de chave/valor é outro componente, e nenhum agente hoje precisa de variável para subir. Quem
precisar continua tendo a API.

**De onde veio:** [acp-sessions R1](../prd/acp-sessions/tasks.md) · **Volta quando:** algum agente
exigir variável de ambiente para autenticar ou para achar o binário.

### Regra de CSS sem markup no `conversation.css` — `P`

O `conversation-css.test.ts` garante que toda classe pedida por um componente existe no
stylesheet. A verificação **inversa** — toda regra tem markup que a pede — hoje encontra uma dúzia
de regras sem ninguém: estados que o protótipo desenhou e nenhum componente precisou ainda
(`conv__scroll--flow`, `out--short`, `count--asking`, `stab__dot--asking`, `perm__why`, `err`, `ok`,
`path`, `plan__glyph--done`, `btn--warn`, `btn--brand`, `composer__box--focus`). Ligar o teste é
junto com limpar essas regras — separar as duas coisas deixaria a suíte vermelha sem ninguém para
consertar.

**De onde veio:** [acp-sessions Q5](../prd/acp-sessions/tasks.md) — a lista "o que ele
deliberadamente não carrega" esvaziou quando o `.daysep` chegou · **Volta quando:** alguém for
editar o `conversation.css` e não souber qual metade está viva.

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

### ~~Abstração de git host (GitLab, e não só GitHub)~~ — **virou PRD**

Ganhou pasta: [pull-request-status](../prd/pull-request-status/prd.md). O corte foi o que o próprio
item avisava que era preciso — **ler, não agir**: a barra mostra estado de PR e de verificações e
abre no navegador, e o adaptador de host nasce com uma implementação só (GitHub pelo `gh`).

O que **ficou** de fora dela, e portanto continua aqui:

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| Mesclar e criar PR pela barra | `M` | escrita no remoto, irreversível para o time, com estratégia e confirmação próprias | a ida ao navegador para mesclar doer com frequência que você consiga nomear |
| Reexecutar verificação, aprovar, comentar | `M` | idem, cada uma com o seu modo de falha | junto com a de cima |
| O segundo host (GitLab por `glab`) | `M` | é o teste real do adaptador — o primeiro sempre cabe na abstração que ele mesmo gerou | existir um repositório GitLab de verdade em uso |
| Notificação quando a PR fica verde ou quebra | `P` | tentador e barato de errar: exige política de ruído | você se pegar olhando a sidebar de minuto em minuto |
| "O check quebrou, peça ao agente para consertar" | `M` | a ponte entre a barra e a sessão ACP — e a mais perigosa, porque põe texto da internet dentro de um prompt | o §4.7 do PRD ganhar um portão de verdade |

### Worktree de projeto removido não pode ser recriada — `P`

Remover projeto **registrado por caminho** tira o registro das worktrees e **não toca no disco**
([WS-Q22](../prd/walking-skeleton/open-questions.md)). O projeto clonado não entra: lá a worktree
bloqueia a remoção, então nada fica para trás.
O que fica para trás é git, não Lumem: o diretório, a branch e a entrada em `.git/worktrees` do repo.
Como o caminho é determinístico (`<workspace>/<projeto>/worktrees/<nome>`), re-adicionar o mesmo repositório e
criar a worktree `feat-x` de novo falha em `a branch "feat-x" já existe`. Pelo app, é permanente — sai
só com `git worktree remove` na mão. Bate no onboarding, que sempre cria worktree na primeira tarefa.

Os dois caminhos que resolvem são features: **adotar worktree que já existe** (o mesmo mecanismo das
"worktrees externas na sidebar", §G) ou **limpar o disco na cascata**, que contradiz a WS-Q22 e pede a
confirmação de "sujo" para N worktrees de uma vez.

**De onde veio:** a review da PR de remover projeto · **Volta quando:** alguém re-adicionar um projeto
e não conseguir recriar a worktree que tinha antes.

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

### ~~Configuração de projeto versionada no repo~~ — **virou feature**, em [project-scripts](../prd/project-scripts/prd.md)

O arquivo `<repo>/.lumem/project.toml` **já vai existir** — a [Q3.1](../prd/workspace-memory/open-questions.md)
decidiu que o `id` do projeto mora nele. O que ficou para depois é o **resto** do conteúdo: script de
setup, script de run, comandos do projeto. A regra que delimita o arquivo: **o que é do repositório é
do time; o que é da instância é do Lumem.**

**De onde veio:** [workspace-memory Q3.1](../prd/workspace-memory/open-questions.md) · **Voltou em:**
2026-08-30, como a feature [project-scripts](../prd/project-scripts/prd.md) — o gatilho foi a
worktree que nasce sem rodar.

**Ficou aqui, e é filho desta:** **copiar arquivos para a worktree nova** (`.env`, credenciais). É
sobre segredo, não sobre script, e merece decisão própria — `M`. **Volta quando:** alguém copiar `.env`
na mão pela terceira vez.

### Memória compartilhada entre instâncias do Lumem — `G`

Efeito colateral da Q3.1: com o `id` do projeto commitado, duas instâncias do Lumem passam a ter a
**mesma chave** para o mesmo projeto. Isso não faz nada hoje, e é exatamente a peça que faltaria para
um dia compartilhar memória de projeto, ou de contrato, entre pessoas do time — sem migração de dados.

**De onde veio:** [workspace-memory Q3.1](../prd/workspace-memory/open-questions.md) · **Volta
quando:** existir uma segunda pessoa usando Lumem no mesmo repositório.

### `lumem-memory` lendo os repositórios — só a **capacidade ligada** ficou para depois — `M`

A D8 decidiu que ler os repositórios do workspace é **objetivo declarado, não "talvez"**. Por isso o
**funil de acesso cross-projeto e o registro de acesso nascem na PR 03**
([roadmap](../prd/workspace-memory/roadmap.md)) — com a capacidade **desligada**, porque adaptar
depois seria retrabalho no lugar mais sensível do sistema.

O que ficou aqui é só **ligar a capacidade**: declarar por projeto quais repositórios o serviço pode
ler, e o serviço passar a responder a partir do código além do acervo.

**De onde veio:** [context-delivery D8](../prd/workspace-memory/context-delivery.md) · **Volta
quando:** a taxa de "não sei" do serviço for alta e o acervo, sozinho, não der conta.

### `references/` do playbook — o material de apoio carregado sob demanda — `P`

O §9 da `workspace-memory` desenha o playbook como `PLAYBOOK.md` **mais** um `references/` carregado
sob demanda: o corpo é o procedimento curto, e o material longo — saída de comando exemplo, tabela de
códigos de erro, trecho de log — fica ao lado, lido só quando o passo precisa.

A PR 09 entregou o corpo e deixou o lugar pronto: o playbook mora num **diretório próprio** desde o
primeiro dia, justamente para o `references/` poder nascer ali sem migrar o disco de ninguém.

**De onde veio:** [§9 do PRD](../prd/workspace-memory/prd.md) e a PR 09 · **Volta quando:** o primeiro
playbook precisar de anexo — sinal de que o corpo está virando documento em vez de procedimento.

### Índice de regras com carregamento sob demanda — `M`

Hoje o núcleo da memória entra inteiro no primeiro turno, sem teto (D5). A ideia do Vinicius para
quando o alarme da marca d'água começar a tocar: o núcleo injeta um **índice de regras**, e o agente
busca a regra específica quando esbarra nela — "vou commitar, deixa eu ver a regra de commit".

É mais elegante que teto, porque nunca corta diretriz no meio; e é mais barato que o núcleo inteiro,
porque o que entra em todo turno passa a ser uma linha por regra em vez do corpo dela.

**De onde veio:** [context-delivery D5](../prd/workspace-memory/context-delivery.md) · **Volta
quando:** a marca d'água do núcleo passar do alarme e consolidar não resolver.

### `session_usage` cresce para sempre — `P`

A tabela do consumo (`workspace-screen`, W4) ganha uma linha por `usage_update`, ou seja, algumas por
turno. Nada a poda. Numa máquina em uso diário isso é um número pequeno por muito tempo — mas é a
segunda tabela do sistema que cresce sem teto, e a primeira (as transcrições) já ganhou diretório
próprio e manutenção justamente por isso.

O que provavelmente resolve: agregar em bucket diário por escopo depois de N dias e apagar as linhas
cruas. A janela de `1y` é a única que precisa de granularidade fina e ninguém a olha por dia.

**De onde veio:** a PR do consumo · **Volta quando:** a tabela passar de alguns milhões de linhas, ou
a query de `1y` começar a aparecer no tempo de carregamento da tela.

### Linhas órfãs, e a transcrição que sobrevive ao dono — `P`

Remover projeto apaga `project` e `worktree`. Continuam apontando para ids que não existem mais
`session`, `session_usage`, `memory_entry`, `action_signal`, `playbook` e `memory_proposal` — todas
com a coluna `text` e sem FK, então nada reclama. Os números da tela não erram: `usageByProject` e
`usageByWorktree` fazem `LEFT JOIN` **a partir** de `project`/`worktree`, e órfão não entra na conta.

O que vaza é disco. `sweepTranscripts` só apaga o arquivo cujo dono sumiu do registro
(`acp/transcript-maintenance.ts`), e a linha de `session` sobrevive à remoção — então a conversa de um
projeto que não existe mais fica em `~/.lumem` para sempre, comprimida aos 30 dias e nunca apagada.
**É pré-existente**, não veio da cascata: `worktree.remove` também deixa `session` para trás. A cascata
só multiplica por N.

**De onde veio:** a review da PR de remover projeto · **Volta quando:** o diretório de transcrições
crescer sem explicação, ou a primeira consulta precisar varrer órfão.

### O que o Lumem gasta sozinho — `P`

A destilação de fim de sessão e o agente de pesquisa do auto-learn sobem sessões ACP **sem linha no
banco**, de propósito. Como consequência, o consumo delas não é cobrado de projeto nenhum: atribuir a
um projeto seria contar como trabalho seu algo que o sistema fez por conta própria.

Isso deixa uma pergunta sem resposta: **quanto o Lumem gasta sozinho.** Hoje os dois interruptores
vêm desligados, então a resposta é zero — quando alguém ligar, ela deixa de ser.

**De onde veio:** `usage/record.ts`, a decisão U4 da [tela do workspace](../prd/workspace-screen/tasks.md) ·
**Volta quando:** o primeiro interruptor de token for ligado por mais de um dia.

### A árvore da sidebar não é uma árvore para quem usa leitor de tela — `P`

A árvore de **arquivos** do painel direito é `role="tree"`. A árvore de **projetos** da sidebar é um
`div` com `aria-label` e sem `role` — ou seja, o rótulo não é anunciado, e a estrutura (projeto →
worktree → sessão) não existe para tecnologia assistiva.

Consertar não é acrescentar `role="tree"` e pronto: sem `treeitem` nas linhas, uma árvore sem itens é
pior que uma div rotulada. Precisa de `treeitem`, `aria-expanded` nas linhas que abrem, e
`aria-level`.

**De onde veio:** o `openProject` do e2e, que precisou escopar por `aria-label` porque `role="tree"`
não casa · **Volta quando:** alguém navegar o app por teclado, ou na primeira passada de
acessibilidade.

### Tela de preferências — a configuração de agente não é do workspace — `M`

`agent_config` é **global** e mora no rodapé da sidebar, que é do workspace. A `agent-login` já nomeia
a mentira (A16); a [tela do workspace](../prd/workspace-screen/prd.md) recusou herdá-la, porque
misturar global com workspace numa tela nova é repetir o erro em outro lugar.

O lugar certo é uma tela de preferências, que não existe.

**De onde veio:** A16 da `agent-login`, e o §4 do PRD da tela do workspace · **Volta quando:** existir
uma segunda coisa global para configurar — política de permissão é a candidata óbvia.

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

---

## G. Primeiro acesso e casca do app

Todos vindos do [onboarding §6](../prd/onboarding/prd.md) — o desenho das nove telas propõe cada um
deles, e a v1 do fluxo não implementa nenhum.

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| ~~Instalar o adaptador pela tela~~ — **feito em 2026-08-20** | — | saiu do backlog na [agent-login](../prd/agent-login/prd.md): o que estava recusado era `npm i -g`, e o que foi feito é `--prefix` numa pasta do daemon, com versão fixa | — |
| Chave de API colada na tela | `P` | o desenho tem o caminho; o adaptador não oferece método `env_var` nenhum, então seria mecanismo do Lumem. **Onde ela mora já está decidido:** `agent_config.env`, no SQLite — e a tela terá de dizer que fica no registro do Lumem, não no chaveiro | você precisar de cobrança por token, ou de uma conta que não seja a do login local |
| Editar o adaptador pela gaveta `avançado` | `P` | hoje é leitura; trocar é remover e criar em "outro agente ACP…". Falta um `agentConfig.update` | alguém querer trocar só os argumentos sem perder a configuração |
| Login em daemon sem navegador | `P` | o adaptador troca os métodos e oferece `claude-login`, que é o mesmo mecanismo de terminal — funciona por construção e nunca foi exercitado | o daemon rodar em SSH ou container |
| Clonar projeto de uma URL | `M` | a tela 6 oferece; rede, credencial, progresso e cancelamento são feature, não um campo | você querer adicionar repo que ainda não está na máquina |
| Worktrees `externas` na sidebar | `M` | o passo 6 **detecta** as que existem fora do Lumem; listá-las pede reconciliação e ciclo de vida próprios | alguém perder tempo procurando onde foi uma worktree criada fora do Lumem |
| Paleta de comandos `⌘K` | `M` | a tela 9 promete; hoje o único atalho que existe é `⌘⏎` | a sidebar deixar de dar conta de achar as coisas |
| `⌘⇧N` (nova tarefa) e `⌥⇧P` (trocar o modo) | `P` | prometidos pela mesma tela, e são dois atalhos para ações que já existem em botão | os dois botões virarem caminho longo demais |
| Caminho das worktrees editável | `P` | hoje é `LUMEM_STATE_DIR`, global; editar pede coluna, migração e "e as que já estão no caminho antigo?" | o `~/.lumem` ficar no disco errado para alguém |
| Padrão de modelo e modo por workspace | `P` | a tela 4 oferece o seletor e não há coluna onde guardar; a conversa já escolhe por sessão | repetir a mesma troca em toda sessão nova incomodar |
| Tela de preferências | `M` | é onde `agent_config` deveria morar (buraco nº 1 do `FEATURES.md` do Open Design, e a [A16](../prd/acp-sessions/open-questions.md)); as primitivas do fluxo são o que ela vai reusar | existir a segunda coisa global para configurar |
| Renomear e remover workspace pela tela | `P` | buraco nº 2 do `FEATURES.md`: o fluxo **cria** workspace, e nada administra | você ter mais de dois workspaces |
| Pré-voo em Linux e Windows | `P` | as cinco checagens são as de macOS; Linux provavelmente passa e ninguém verificou | o Lumem rodar em outra máquina que não a sua |

---

## H. Distribuição e projeto

Os dois vieram das respostas da [distribution](../prd/distribution/open-questions.md), em 2026-08-30,
e os dois foram adiados **na mesma frase que os prometeu**.

### O daemon em background — `M`

`lumem start` volta ao prompt, e aí precisam existir `stop`, `status` e `logs`, um pidfile no state
dir, e uma resposta para "o processo morreu e o pidfile ficou". A v1 é foreground, como `vite`, e o
CLI já nasce com forma de subcomando para que isto seja acréscimo e não reescrita.

**De onde veio:** [D2](../prd/distribution/open-questions.md) — *"pode ser foreground, mas no futuro
deve ser background"* · **Volta quando:** você deixar o Lumem ligado o dia inteiro e o terminal
ocupado incomodar.

### O projeto todo em inglês — `M`

Documentação e comunicação são em português por convenção do `CLAUDE.md`; código, commit e nome de
arquivo já são em inglês. O `README.md` da raiz é o primeiro arquivo do outro lado — em inglês por
decisão, porque é a porta do repositório público e da página do npm.

Migrar o resto não é traduzir: são ~40 arquivos em `/docs`, o `CLAUDE.md`, as mensagens de erro que
aparecem em tela, e a regra de convenção que hoje diz o contrário. É trabalho de uma feature, com
gate próprio, e feito pela metade fica pior que não feito.

**De onde veio:** [D11](../prd/distribution/open-questions.md) — *"concordo com você, mas deixando
claro que eu quero passar tudo para inglês em breve"* · **Volta quando:** a primeira pessoa que não
fala português chegar ao repositório — ou você decidir a data.

### A lista de sessões de uma worktree ausente — `P`

A aba do checkout, quando a worktree sumiu do disco, some com o que deixou de ser verdade — base,
distância, idade — e mantém a lista de sessões, que é do `ScopePanel` e compartilhada com o `local` e
com a worktree viva. O §8 do protótipo não a desenha. A lista não mente: sessão de uma worktree que
sumiu continua existindo como registro, com buffer legível. Mas ela ocupa a metade de baixo de uma aba
cuja única ação útil é limpar o registro.

Tirar exige um prop novo no `ScopePanel` — o que é um custo real por um ganho de arrumação.

**De onde veio:** [worktree-first-tab T7](../prd/worktree-first-tab/tasks.md), onde o desenho e o
código discordaram e o código ganhou · **Volta quando:** alguém abrir uma worktree ausente e a lista
de sessões atrapalhar em vez de informar.

### A sessão nova não vem sempre para a frente — `P`

Criar uma sessão seleciona a aba dela: o `NewSessionMenu` espera a lista de sessões chegar e só então
chama `onCreated`. Mas o daemon também **empurra** estado, e um payload que chega em seguida sem a
sessão nova muda a identidade de `tabs` — o efeito do `useWorktreeTabs` que devolve a seleção para a aba
do checkout quando a aba escolhida não está na lista dispara e desfaz a seleção. O resultado é uma
sessão criada que fica atrás, de vez em quando.

Anterior à [worktree-first-tab](../prd/worktree-first-tab/prd.md), e nada nela mudou isso — só ficou
mais visível, porque a aba para onde a seleção volta agora tem nome. O conserto provável é o efeito
distinguir "a aba sumiu" de "a aba ainda não chegou", e isso quer dizer guardar uma seleção pendente:
lógica de estado nova numa parte que hoje é uma linha.

**De onde veio:** o e2e da worktree-first-tab, que precisou clicar na aba da sessão em vez de confiar
na seleção · **Volta quando:** aparecer em uso, ou quando a próxima feature de aba precisar confiar
que a sessão criada está na frente.
