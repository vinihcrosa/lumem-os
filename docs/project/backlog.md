# Backlog — o que ficou para depois

> **O que este arquivo é:** o lugar único de olhar para lembrar do que já foi discutido e adiado.
> Cada item tem **uma frase de contexto**, de onde veio, e o que precisa acontecer para ele voltar
> à mesa. Nada aqui está prometido nem estimado.
>
> **O que este arquivo não é:** roadmap, nem lista de tarefa. Tarefa vive em
> `docs/features/<NNN>-<feature>/tasks.md`; ideia sem PRD vive aqui.
>
> **Regra:** toda vez que uma discussão terminar em *"isso fica para depois"*, o item entra aqui na
> mesma hora, com o link de onde a conversa aconteceu. Item que ganhar PRD sai daqui e vira uma pasta
> em `docs/features/`, com o próximo número livre. **Ideia adiada não é decisão adiada:** se o que
> ficou para depois foi *decidir* algo difícil de reverter, o lugar é um [ADR](../adr/), não este
> arquivo.

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

**De onde veio:** [workspace-memory Q2](../features/007-workspace-memory/open-questions.md) · **Volta quando:**
a memória `contract` estiver em uso e você notar que ela mente com frequência, ou quando quiser
bloquear merge por quebra de contrato.

### Eixo de operação no funil de acesso cross-projeto — `P`

O `AccessRequest` do funil (`packages/server/src/memory/access.ts`) tem *quem*, *de onde*, *para onde*
e *o quê* — mas não tem **qual operação**. O PRD é explícito que o `lumem-memory` "sempre lê, nunca
escreve" (§11), e hoje isso é garantido pela ausência de chamador de escrita, não pelo tipo. Nomear o
eixo (`operation: "read"`, recusando o resto) custa uma coluna em `memory_access` e uma migração.

**De onde veio:** review do rework da [PR 03 de workspace-memory](../features/007-workspace-memory/tasks.md) ·
**Volta quando:** a capacidade `readNeighbourRepository` for ligada para valer, ou quando aparecer o
primeiro chamador que não seja leitura.

### Recall semântico (embeddings) — `M`

O v1 é lexical (FTS5/BM25): determinístico, explicável, de graça. Não acha "deploy" buscando
"release". Com o redesenho da entrega de contexto isso ficou **barato de trocar depois**: a memória
virou um serviço com uma pergunta como interface, então mudar o motor por dentro não toca no que o
agente vê.

**De onde veio:** [workspace-memory Q22](../features/007-workspace-memory/open-questions.md) e
[context-delivery §4.2](../features/007-workspace-memory/context-delivery.md) · **Volta quando:** a busca
lexical falhar em caso real que você consiga nomear.

### Consolidação automática ("dreaming") — `M`

Promoção e mesclagem de memória sem você pedir. O Compozy usa portões (24h, 3 sessões, score 0.75)
que, em uso pessoal, podem nunca disparar; o Hermes roda por inatividade e deixa a passada cara
desligada por padrão. O v1 do Lumem tem gatilho explícito.

**De onde veio:** [workspace-memory Q30](../features/007-workspace-memory/open-questions.md) · **Volta quando:**
existir sinal medido de uso (`recall_count`) suficiente para promover por critério objetivo em vez de
palpite de LLM.

### Aprender de ações, não só do que foi dito — `M`

Você editou por cima do agente, reverteu o commit dele, matou a sessão em 30 segundos, descartou a
worktree. É o sinal mais barato que existe e **nenhuma das quatro referências usa**. Pode entrar cedo
(é só registrar evento) e a interpretação vem depois.

**De onde veio:** [workspace-memory Q17/Q18](../features/007-workspace-memory/open-questions.md) ·
**Volta quando:** o registro cru estiver de pé e houver volume para olhar.

---

## B. Como o daemon fala com o agente

> **Saiu daqui em 2026-08-17:** *transporte ACP*. Deixou de ser ideia adiada e virou **decisão**
> ([pty-vs-acp.md §9](pty-vs-acp.md)) — e virou feature própria, [acp-sessions](../features/006-acp-sessions/prd.md):
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

**De onde veio:** [acp-sessions A10](../features/006-acp-sessions/open-questions.md) · **Volta quando:** você
perder tempo com agente parado sem perceber.

### Variáveis de ambiente na configuração de agente pela UI — `P`

O `agent_config` guarda `env` (objeto JSON) e o router aceita, mas o formulário da fase 6 não escreve:
controle de chave/valor é outro componente, e nenhum agente hoje precisa de variável para subir. Quem
precisar continua tendo a API.

**De onde veio:** [acp-sessions R1](../features/006-acp-sessions/tasks.md) · **Volta quando:** algum agente
exigir variável de ambiente para autenticar ou para achar o binário.

### Regra de CSS sem markup no `conversation.css` — `P`

O `conversation-css.test.ts` garante que toda classe pedida por um componente existe no
stylesheet. A verificação **inversa** — toda regra tem markup que a pede — hoje encontra uma dúzia
de regras sem ninguém: estados que o protótipo desenhou e nenhum componente precisou ainda
(`conv__scroll--flow`, `out--short`, `count--asking`, `stab__dot--asking`, `perm__why`, `err`, `ok`,
`path`, `plan__glyph--done`, `btn--warn`, `btn--brand`, `composer__box--focus`). Ligar o teste é
junto com limpar essas regras — separar as duas coisas deixaria a suíte vermelha sem ninguém para
consertar.

**De onde veio:** [acp-sessions Q5](../features/006-acp-sessions/tasks.md) — a lista "o que ele
deliberadamente não carrega" esvaziou quando o `.daysep` chegou · **Volta quando:** alguém for
editar o `conversation.css` e não souber qual metade está viva.

### Forkar uma conversa — `M`

O protocolo expõe `fork` junto de `resume` e `list`. Duplicar uma conversa a partir de um ponto é
feature de produto que nenhuma das quatro referências tem — "tenta de novo daqui, com outra
abordagem", sem perder o que veio antes.

**De onde veio:** [acp-sessions A7](../features/006-acp-sessions/open-questions.md) · **Volta quando:** o
`resume` estiver de pé e você se pegar querendo bifurcar em vez de recomeçar.

### Múltiplas contas para o mesmo agente — `M`

Duas contas do Claude — pessoal e trabalho — selecionáveis por sessão, e o mesmo para os outros
agentes. O mecanismo já está identificado no [estudo do Compozy](../references/compozy.md): *provider
home isolation* — reescrever `HOME` e `XDG_*` do subprocesso dá credenciais separadas sem container.

Afeta o desenho de `agent_config` desde já: a credencial deixa de ser propriedade do **agente** e vira
propriedade de **(agente, conta)**.

**De onde veio:** [pty-vs-acp A2](pty-vs-acp.md) · **Volta quando:** você precisar rodar trabalho e
pessoal na mesma máquina sem trocar login na mão.

### Terceiro CLI de agente — `M`

O **segundo** virou PRD em 2026-09-05 e a **C1 respondeu Codex**:
[second-agent](../features/021-second-agent/prd.md). Sobra o terceiro, e ele já tem nome: **Gemini**
(`gemini --acp`), por ser de outra família — nativo, sem adaptador para instalar. O catálogo de
adaptadores já prevê o caso (`package: null` → procura no PATH), então o que ele custa é o próprio
spike, não a refatoração.

**De onde veio:** [pty-vs-acp A2](pty-vs-acp.md) · **Volta quando:** a fase 2 da second-agent
estiver de pé — o Codex conversando **e** logando pela tela.

### Desenhar a saída de comando do Codex — `P`

Medido na fase 0 (§4.5 da [second-agent](../features/021-second-agent/prd.md)): o Codex **não pede**
`terminal/*` ao cliente. Ele roda por conta própria e manda `tool_call` com
`content: [{ type: "terminal", terminalId }]` apontando para um terminal **dele** — o id da própria
`tool_call` —, com a saída em `_meta.terminal_output_delta` e o fim em `_meta.terminal_exit`. O cartão
de terminal da conversa não tem terminal para anexar, então a saída de comando dele não aparece.

**De onde veio:** fase 0 da second-agent, 2026-09-06 · **Volta quando:** você rodar um comando pelo
Codex e sentir falta de ver a saída.

### O estado de login que o agente já conta — `P`

O `codex-acp` manda uma notificação fora do protocolo, `_auth/status_update`, com
`{ kind: "account", label: "ChatGPT Plus", account: { email, plan } }` — duas vezes por processo. O
daemon ignora sem cair, e é exatamente o que o rodapé de login gostaria de mostrar: quem está logado,
e em qual plano.

**De onde veio:** fase 0 da second-agent, §4.4 · **Volta quando:** o rodapé por agente (fase 2)
existir, e a linha dele parecer vazia.

### Deslogar um agente pela tela — `P`

O Codex declara `agentCapabilities.auth.logout` e oferece um comando `/logout`. Nada no Lumem chama
nenhum dos dois: dá para entrar e não dá para sair.

**De onde veio:** fase 0 da second-agent, §4.9 · **Volta quando:** você precisar trocar de conta num
agente — e aí ele encontra o item "múltiplas contas para o mesmo agente", acima.

### Custo por modelo, e não só por agente — `P`

A `usage.byProjectAndAgent` soma por `agent_config`. A resposta do `session/prompt` do Codex traz
`_meta.quota.model_usage[]` — token por **modelo** dentro do mesmo turno —, e o daemon lê só a
notificação. Somar por modelo é mudar a fonte do número, e isso não era da second-agent (C5).

**De onde veio:** [second-agent C5](../features/021-second-agent/open-questions.md) · **Volta quando:** você
trocar de modelo no meio do trabalho e quiser saber qual deles custou o quê.

### Índice de regras com carregamento sob demanda — `M`

O núcleo não tem teto (D5), e cresce por acréscimo. A saída elegante, quando o alarme de tamanho
começar a tocar: em vez de injetar as regras, injetar um **índice** delas — *"vou commitar → busco a
regra de commit"*. Lazy loading de diretriz, o mesmo princípio da camada 3 aplicado à camada 1.

**De onde veio:** [context-delivery D5](../features/007-workspace-memory/context-delivery.md) · **Volta
quando:** a marca d'água do núcleo passar do valor que você definir.

### Hooks por CLI — `P`, provavelmente morto

`SessionEnd`, `PostToolUse` e afins do Claude Code eram o plano B para enxergar dentro da sessão sem
trocar de transporte. **O ACP entrega os mesmos eventos, padronizados.**

**De onde veio:** [pty-vs-acp.md §6.2](pty-vs-acp.md) · **Volta quando:** sobrar agente rodando em
PTY que você queira que alimente memória — e só nesse caso.

---

## C. Tarefas e orquestração

### ~~Tarefas de workspace atravessando projetos~~ — virou PRD em 2026-09-05

Saiu do backlog: [workspace-tasks](../features/022-workspace-tasks/prd.md). O gatilho — a memória de workspace
de pé — foi atingido. O PRD é atribuição manual e `done` humano; a **fila com lease**, abaixo,
continua aqui.

### Fila com lease e múltiplos agentes puxando trabalho — `G`

Lease com deadline, heartbeat, fencing por sessão e recuperação por expiração — a mecânica que o
Compozy tem e que só se paga com múltiplos agentes autônomos.

**De onde veio:** [questions.md Q068](questions.md) · **Volta quando:** existir tarefa como entidade
e mais de um agente rodando sem você olhando.

---

## D. Git e integrações

### ~~Abstração de git host (GitLab, e não só GitHub)~~ — **virou PRD**

Ganhou pasta: [pull-request-status](../features/013-pull-request-status/prd.md), e **está implementada**. O
corte que o item pedia era *"ler, não agir"* — e ele **mudou de lugar** durante a implementação: a
[Q3](../features/013-pull-request-status/open-questions.md) e a
[Q4](../features/013-pull-request-status/open-questions.md) foram respondidas contra a proposta do PRD, e o
Lumem passou a **mesclar e a criar PR**. Os dois verbos, e só eles, cada um atrás de um portão que o
daemon relê.

O adaptador de host nasceu com uma implementação: GitHub pelo `gh`, sem token nosso em lugar nenhum.

O que **ficou** de fora, e portanto continua aqui:

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| Reexecutar verificação, aprovar, comentar | `M` | escrita no remoto, cada uma com o seu modo de falha — e nenhuma delas é o *fim do trabalho*, que foi o argumento que fez o merge entrar | a ida ao navegador para uma delas doer com frequência que você consiga nomear |
| Escolher reviewers, labels e template ao criar | `S` | é a tela do host, e ela é boa; o Lumem cria o esqueleto e o `↗` leva ao resto | alguém reclamar de editar toda PR depois de criada |
| O segundo host (GitLab por `glab`) | `M` | é o teste real do adaptador — o primeiro sempre cabe na abstração que ele mesmo gerou | existir um repositório GitLab de verdade em uso |
| Notificação quando a PR fica verde ou quebra | `M` | tentador e barato de errar: exige política de ruído, senão vira o alerta que se aprende a ignorar | as oito worktrees em paralelo existirem de verdade no dia a dia |
| "O check quebrou, peça ao agente para consertar" | `M` | a ponte entre a barra e a sessão ACP. É a ideia mais valiosa da lista e a mais perigosa: põe texto da internet dentro de um prompt (§4.7 do PRD) | ter um portão desenhado para texto de fora virar instrução |
| A aba `Review` — threads, comentários inline, sugestões | `L` | é outra feature inteira, e sempre foi | depois do segundo host |

### Worktree de projeto removido não pode ser recriada — `P`

Remover projeto **registrado por caminho** tira o registro das worktrees e **não toca no disco**
([WS-Q22](../features/001-walking-skeleton/open-questions.md)). O projeto clonado não entra: lá a worktree
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

**De onde veio:** [right-panel §5](../features/004-right-panel/prd.md) · **Volta quando:** você se pegar
saindo do Lumem para commitar.

---

## E. Editor e painel de arquivos

Todos vindos de [right-panel §8](../features/004-right-panel/prd.md) e [file-editor §9](../features/005-file-editor/prd.md).

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| Watcher de filesystem | `P` | transforma conflito "descoberto ao salvar" em "avisado na hora" | recarregar na mão doer |
| Busca por conteúdo (grep) | `M` | merece desenho próprio por causa de repositório grande | você procurar coisa e não achar |
| Busca por nome na árvore | `P` | a árvore é lazy; buscar exige varrer o que não foi carregado | árvore grande incomodar |
| Diff lado a lado | `M` | outro componente inteiro, não uma variação do unificado | o unificado não bastar |
| Editar patch hunk a hunk | `M` | metade do caminho para a aba `Review` | a aba `Review` existir |
| Busca e substituição no arquivo | `P` | o CodeMirror já traz metade pronta | — |
| Histórico, blame, log | `M` | outra coluna, outro modelo mental | — |

### A faixa do rodapé de execução, e o `＋ nova aba de terminal` — `P`

O desenho da [run-dock-open](../features/015-run-dock-open/prd.md) mediu a faixa do rodapé em **494px** contra
uma coluna de 360, e propôs três coisas juntas: descer `Abrir :porta` e `parar` para a linha de
estado, apertar a faixa (`.dock__bar--tight`) e criar um `⋯` para onde o `＋` iria. Foi recusado
inteiro, porque o `＋ nova aba de terminal` **não existe no produto** — o `.dock__new` está no CSS
portado e o `RunDock.tsx` nunca o renderiza. O `⋯` nasceria com zero item, e a faixa apertaria para
caber nele.

A ordem certa é a inversa: primeiro o `＋` existir, depois o menu que o guarda.

**De onde veio:** [run-dock-open Q6 e Q6a](../features/015-run-dock-open/open-questions.md), revertida em
2026-09-06 · **Volta quando:** alguém quiser uma segunda aba de terminal no rodapé, ou quando a faixa
com um `run` vivo em 360px incomodar de verdade.

### A saída que nunca rodou diz o que o daemon já sabe — `P`

Hoje a aba de um script que nunca rodou mostra o `dock__idle`: *"este checkout ainda não rodou o run.
O botão está ali em cima."* O desenho da run-dock-open propõe, no lugar, as três coisas que o daemon
já sabe antes de qualquer processo — qual é o comando e de onde veio, que portas estão **reservadas**
para este checkout, e quando o `setup` passou. É a mesma área: quando o run começa, as três linhas
viram a saída de verdade.

Todo o dado já chega no `ScriptStatus`. O que falta é decidir se isto é uma superfície de informação
ou a saída de um terminal — e essa é a pergunta que faz disso uma feature e não um parágrafo.

**De onde veio:** o quadro 1 do `lumem-run-dock-open.html`, adiado em 2026-09-06 para o escopo da
feature continuar sendo uma linha · **Volta quando:** o rodapé nascer aberto e o retângulo vazio for a
primeira coisa que se vê na maioria das chegadas.

---

## F. Plataforma

### ~~Configuração de projeto versionada no repo~~ — **virou feature**, em [project-scripts](../features/012-project-scripts/prd.md)

O arquivo `<repo>/.lumem/project.toml` **já vai existir** — a [Q3.1](../features/007-workspace-memory/open-questions.md)
decidiu que o `id` do projeto mora nele. O que ficou para depois é o **resto** do conteúdo: script de
setup, script de run, comandos do projeto. A regra que delimita o arquivo: **o que é do repositório é
do time; o que é da instância é do Lumem.**

**De onde veio:** [workspace-memory Q3.1](../features/007-workspace-memory/open-questions.md) · **Voltou em:**
2026-08-30, como a feature [project-scripts](../features/012-project-scripts/prd.md) — o gatilho foi a
worktree que nasce sem rodar.

**Ficou aqui, e é filho desta:** **copiar arquivos para a worktree nova** (`.env`, credenciais). É
sobre segredo, não sobre script, e merece decisão própria — `M`. **Volta quando:** alguém copiar `.env`
na mão pela terceira vez.

### Memória compartilhada entre instâncias do Lumem — `G`

Efeito colateral da Q3.1: com o `id` do projeto commitado, duas instâncias do Lumem passam a ter a
**mesma chave** para o mesmo projeto. Isso não faz nada hoje, e é exatamente a peça que faltaria para
um dia compartilhar memória de projeto, ou de contrato, entre pessoas do time — sem migração de dados.

**De onde veio:** [workspace-memory Q3.1](../features/007-workspace-memory/open-questions.md) · **Volta
quando:** existir uma segunda pessoa usando Lumem no mesmo repositório.

### `lumem-memory` lendo os repositórios — só a **capacidade ligada** ficou para depois — `M`

A D8 decidiu que ler os repositórios do workspace é **objetivo declarado, não "talvez"**. Por isso o
**funil de acesso cross-projeto e o registro de acesso nascem na PR 03**
([roadmap](../features/007-workspace-memory/roadmap.md)) — com a capacidade **desligada**, porque adaptar
depois seria retrabalho no lugar mais sensível do sistema.

O que ficou aqui é só **ligar a capacidade**: declarar por projeto quais repositórios o serviço pode
ler, e o serviço passar a responder a partir do código além do acervo.

**De onde veio:** [context-delivery D8](../features/007-workspace-memory/context-delivery.md) · **Volta
quando:** a taxa de "não sei" do serviço for alta e o acervo, sozinho, não der conta.

### `references/` do playbook — o material de apoio carregado sob demanda — `P`

O §9 da `workspace-memory` desenha o playbook como `PLAYBOOK.md` **mais** um `references/` carregado
sob demanda: o corpo é o procedimento curto, e o material longo — saída de comando exemplo, tabela de
códigos de erro, trecho de log — fica ao lado, lido só quando o passo precisa.

A PR 09 entregou o corpo e deixou o lugar pronto: o playbook mora num **diretório próprio** desde o
primeiro dia, justamente para o `references/` poder nascer ali sem migrar o disco de ninguém.

**De onde veio:** [§9 do PRD](../features/007-workspace-memory/prd.md) e a PR 09 · **Volta quando:** o primeiro
playbook precisar de anexo — sinal de que o corpo está virando documento em vez de procedimento.

### Índice de regras com carregamento sob demanda — `M`

Hoje o núcleo da memória entra inteiro no primeiro turno, sem teto (D5). A ideia do Vinicius para
quando o alarme da marca d'água começar a tocar: o núcleo injeta um **índice de regras**, e o agente
busca a regra específica quando esbarra nela — "vou commitar, deixa eu ver a regra de commit".

É mais elegante que teto, porque nunca corta diretriz no meio; e é mais barato que o núcleo inteiro,
porque o que entra em todo turno passa a ser uma linha por regra em vez do corpo dela.

**De onde veio:** [context-delivery D5](../features/007-workspace-memory/context-delivery.md) · **Volta
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

### ~~O que o Lumem gasta sozinho~~ — virou a F1 da memory-dogfooding, em 2026-09-05

O gatilho — *"o primeiro interruptor de token ligado por mais de um dia"* — é exatamente o protocolo
da [memory-dogfooding](../features/020-memory-dogfooding/prd.md). A F1 dela grava o consumo dessas sessões com
um `purpose` (`distill`, `auto_learn`) **separado** do consumo do usuário, o que preserva a razão de
não gravar: nada disso é contado como trabalho seu. **De onde veio:** `usage/record.ts`, a decisão U4
da [tela do workspace](../features/010-workspace-screen/tasks.md).

### Atalho de teclado para criar worktree — `P`

`⌘N` no projeto selecionado. É a ação mais repetida do produto, e a única com candidato óbvio.

Ficou fora do v1 da [sidebar-actions](../features/017-sidebar-actions/prd.md) porque um atalho global precisa
saber **o que está em foco** antes de decidir de quem a tecla é: a mesma combinação dentro de um
terminal embutido ou de um editor CodeMirror pertence a eles, e um atalho que rouba `⌘N` do `xterm` é
pior que não ter atalho. Precisa de uma noção de "escopo de foco" que o app não tem.

**De onde veio:** [Q6](../features/017-sidebar-actions/open-questions.md) da `sidebar-actions` · **Volta
quando:** existir um segundo atalho global querendo a mesma decisão — ou quando alguém contar quantas
vezes por dia clica no `+`.

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
a mentira (A16); a [tela do workspace](../features/010-workspace-screen/prd.md) recusou herdá-la, porque
misturar global com workspace numa tela nova é repetir o erro em outro lugar.

O lugar certo é uma tela de preferências, que não existe.

**De onde veio:** A16 da `agent-login`, e o §4 do PRD da tela do workspace · **Volta quando:** existir
uma segunda coisa global para configurar — política de permissão é a candidata óbvia.

### ~~Autenticação do daemon~~ — virou PRD em 2026-09-05

Saiu do backlog: [daemon-auth](../features/019-daemon-auth/prd.md). O gatilho era "quando o daemon escutar
fora do loopback"; a avaliação de arquitetura de 2026-09-05 mostrou que DNS rebinding e sequestro de
WebSocket não esperam por isso — não há checagem de `Host` nem de `Origin` em rota nenhuma, e a CLI
já expõe `--host`.

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

Todos vindos do [onboarding §6](../features/008-onboarding/prd.md) — o desenho das nove telas propõe cada um
deles, e a v1 do fluxo não implementa nenhum.

| Item | Peso | Contexto de uma frase | Volta quando |
|---|---|---|---|
| ~~Instalar o adaptador pela tela~~ — **feito em 2026-08-20** | — | saiu do backlog na [agent-login](../features/009-agent-login/prd.md): o que estava recusado era `npm i -g`, e o que foi feito é `--prefix` numa pasta do daemon, com versão fixa | — |
| Chave de API colada na tela | `P` | o desenho tem o caminho; o adaptador não oferece método `env_var` nenhum, então seria mecanismo do Lumem. **Onde ela mora já está decidido:** `agent_config.env`, no SQLite — e a tela terá de dizer que fica no registro do Lumem, não no chaveiro | você precisar de cobrança por token, ou de uma conta que não seja a do login local |
| Editar o adaptador pela gaveta `avançado` | `P` | hoje é leitura; trocar é remover e criar em "outro agente ACP…". Falta um `agentConfig.update` | alguém querer trocar só os argumentos sem perder a configuração |
| Login em daemon sem navegador | `P` | o adaptador troca os métodos e oferece `claude-login`, que é o mesmo mecanismo de terminal — funciona por construção e nunca foi exercitado | o daemon rodar em SSH ou container |
| Clonar projeto de uma URL | `M` | a tela 6 oferece; rede, credencial, progresso e cancelamento são feature, não um campo | você querer adicionar repo que ainda não está na máquina |
| Worktrees `externas` na sidebar | `M` | o passo 6 **detecta** as que existem fora do Lumem; listá-las pede reconciliação e ciclo de vida próprios | alguém perder tempo procurando onde foi uma worktree criada fora do Lumem |
| Paleta de comandos `⌘K` | `M` | a tela 9 promete; hoje o único atalho que existe é `⌘⏎` | a sidebar deixar de dar conta de achar as coisas |
| `⌘⇧N` (nova tarefa) e `⌥⇧P` (trocar o modo) | `P` | prometidos pela mesma tela, e são dois atalhos para ações que já existem em botão | os dois botões virarem caminho longo demais |
| Caminho das worktrees editável | `P` | hoje é `LUMEM_STATE_DIR`, global; editar pede coluna, migração e "e as que já estão no caminho antigo?" | o `~/.lumem` ficar no disco errado para alguém |
| Padrão de modelo e modo por workspace | `P` | a tela 4 oferece o seletor e não há coluna onde guardar; a conversa já escolhe por sessão | repetir a mesma troca em toda sessão nova incomodar |
| Tela de preferências | `M` | é onde `agent_config` deveria morar (buraco nº 1 do `FEATURES.md` do Open Design, e a [A16](../features/006-acp-sessions/open-questions.md)); as primitivas do fluxo são o que ela vai reusar | existir a segunda coisa global para configurar |
| Renomear e remover workspace pela tela | `P` | buraco nº 2 do `FEATURES.md`: o fluxo **cria** workspace, e nada administra | você ter mais de dois workspaces |
| Pré-voo em Linux e Windows | `P` | as cinco checagens são as de macOS; Linux provavelmente passa e ninguém verificou | o Lumem rodar em outra máquina que não a sua |

---

## H. Distribuição e projeto

Os dois vieram das respostas da [distribution](../features/014-distribution/open-questions.md), em 2026-08-30,
e os dois foram adiados **na mesma frase que os prometeu**.

### O daemon em background — `M`

`lumem start` volta ao prompt, e aí precisam existir `stop`, `status` e `logs`, um pidfile no state
dir, e uma resposta para "o processo morreu e o pidfile ficou". A v1 é foreground, como `vite`, e o
CLI já nasce com forma de subcomando para que isto seja acréscimo e não reescrita.

Junto com ele, **subir com a máquina**: launchd no macOS, com o `PATH` capturado na hora do install —
o do launchd é mínimo e não acha `git` nem o adaptador. É o que faz três semanas de uso contínuo
([memory-dogfooding](../features/020-memory-dogfooding/prd.md)) não dependerem de lembrar de abrir um terminal.

**De onde veio:** [D2](../features/014-distribution/open-questions.md) — *"pode ser foreground, mas no futuro
deve ser background"* · **Volta quando:** você deixar o Lumem ligado o dia inteiro e o terminal
ocupado incomodar.

### O projeto todo em inglês — `M`

Documentação e comunicação são em português por convenção do `CLAUDE.md`; código, commit e nome de
arquivo já são em inglês. O `README.md` da raiz é o primeiro arquivo do outro lado — em inglês por
decisão, porque é a porta do repositório público e da página do npm.

Migrar o resto não é traduzir: são ~40 arquivos em `/docs`, o `CLAUDE.md`, as mensagens de erro que
aparecem em tela, e a regra de convenção que hoje diz o contrário. É trabalho de uma feature, com
gate próprio, e feito pela metade fica pior que não feito.

**De onde veio:** [D11](../features/014-distribution/open-questions.md) — *"concordo com você, mas deixando
claro que eu quero passar tudo para inglês em breve"* · **Volta quando:** a primeira pessoa que não
fala português chegar ao repositório — ou você decidir a data.

### A lista de sessões de uma worktree ausente — `P`

A aba do checkout, quando a worktree sumiu do disco, some com o que deixou de ser verdade — base,
distância, idade — e mantém a lista de sessões, que é do `ScopePanel` e compartilhada com o `local` e
com a worktree viva. O §8 do protótipo não a desenha. A lista não mente: sessão de uma worktree que
sumiu continua existindo como registro, com buffer legível. Mas ela ocupa a metade de baixo de uma aba
cuja única ação útil é limpar o registro.

Tirar exige um prop novo no `ScopePanel` — o que é um custo real por um ganho de arrumação.

**De onde veio:** [worktree-first-tab T7](../features/018-worktree-first-tab/tasks.md), onde o desenho e o
código discordaram e o código ganhou · **Volta quando:** alguém abrir uma worktree ausente e a lista
de sessões atrapalhar em vez de informar.

### A sessão nova não vem sempre para a frente — `P`

Criar uma sessão seleciona a aba dela: o `NewSessionMenu` espera a lista de sessões chegar e só então
chama `onCreated`. Mas o daemon também **empurra** estado, e um payload que chega em seguida sem a
sessão nova muda a identidade de `tabs` — o efeito do `useWorktreeTabs` que devolve a seleção para a aba
do checkout quando a aba escolhida não está na lista dispara e desfaz a seleção. O resultado é uma
sessão criada que fica atrás, de vez em quando.

Anterior à [worktree-first-tab](../features/018-worktree-first-tab/prd.md), e nada nela mudou isso — só ficou
mais visível, porque a aba para onde a seleção volta agora tem nome. O conserto provável é o efeito
distinguir "a aba sumiu" de "a aba ainda não chegou", e isso quer dizer guardar uma seleção pendente:
lógica de estado nova numa parte que hoje é uma linha.

**De onde veio:** o e2e da worktree-first-tab, que precisou clicar na aba da sessão em vez de confiar
na seleção · **Volta quando:** aparecer em uso, ou quando a próxima feature de aba precisar confiar
que a sessão criada está na frente.

### Teclado no menu do seletor de configuração — `P`

O `.slash` dos comandos de barra navega com setas e escolhe com `⏎`; o `.slash` do seletor
(`modelo`, `modo`, `esforço`) não — ele é uma lista de botões que só o mouse percorre. Com o teto de
280px isso passou a ter consequência: a partir da décima opção, a única maneira de chegar num modelo
é rolar com o mouse.

Dar teclado a ele é `aria-activedescendant` ou foco por índice, `Home`/`End`, `Esc` para fechar e o
foco de volta na pílula — a mesma matéria do foco preso dos modais da
[sidebar-actions](../features/017-sidebar-actions/prd.md). É uma feature de acessibilidade com escopo próprio,
não efeito colateral de remover um `overflow`.

**De onde veio:** [composer-menus](../features/023-composer-menus/prd.md), fora de escopo declarado ·
**Volta quando:** alguém precisar trocar de modelo sem mouse, ou na primeira feature de
acessibilidade de teclado.

### O menu que abre para baixo quando não cabe para cima — `P`

Todo popover do composer abre para cima, com `bottom: 100%`. O teto de 280px faz isso caber nas
janelas que o produto suporta — a conta está na [Q4](../features/023-composer-menus/open-questions.md) —, mas
é um número contra outro número, e não uma garantia: uma janela baixa o bastante volta a empurrar o
menu para fora da tela por cima.

O conserto é medir o espaço disponível e virar a abertura, com re-medição no `resize`. É
posicionamento com estado, e não uma declaração de CSS.

**De onde veio:** [composer-menus Q4](../features/023-composer-menus/open-questions.md) · **Volta quando:** a
primeira janela real em que o menu não couber.

---

## I. Harness do repositório

Tudo aqui saiu da [auditoria de harness](harness-audit.md) de 2026-09-07 e foi **tirado de escopo com
motivo** na [dev-harness](../features/024-dev-harness/prd.md). Não é o que falta descobrir: é o que já foi
decidido não fazer agora.

### Formatador no repositório inteiro — `M`

Não existe `prettier`, `biome` nem `oxlint` — nem lint, nem formatação. A [T9](../features/024-dev-harness/tasks.md)
traz **lint de correção** e deixa formatação de fora, porque reformatar 105.757 linhas num commit apaga
o `git blame` de um repositório de 24 dias, onde o histórico ainda é a melhor documentação de por que
cada linha existe.

**De onde veio:** [dev-harness §4](../features/024-dev-harness/prd.md) · **Volta quando:** entrar a segunda
pessoa no repositório — a partir daí a discussão de estilo passa a custar tempo de duas pessoas, que é
exatamente o que um formatador compra.

### Sandbox de filesystem para o agente — `M`

A [T4](../features/024-dev-harness/tasks.md) versiona um `deny` com alvos **nomeados** (`~/.npmrc`, `~/.aws`,
`~/.ssh`, `~/.lumem`, `~/.claude`). Isso é lista, e lista tem borda: cobre o que a auditoria mediu, não
o que ninguém pensou. Sandbox de verdade — o agente só vê o checkout — é a versão sem borda, e é
decisão de ferramenta, não de repositório.

**De onde veio:** [harness-audit §6](harness-audit.md), itens 6 e 7 · **Volta quando:** o `deny` da T4
for atravessado por um caminho que ele não previu, ou quando o agente rodar sem supervisão de tela.

### `CODEOWNERS` e aprovação obrigatória em PR — `P`

A [T2](../features/024-dev-harness/tasks.md) protege a `main` com PR e checks obrigatórios, mas com
`required_approving_review_count: 0` — o GitHub não permite aprovar a própria PR, e exigir uma
aprovação num repositório de uma pessoa travaria o merge para sempre. `CODEOWNERS` teria a regra
`* @vinihcrosa`, que não regula nada.

**De onde veio:** [dev-harness Q8](../features/024-dev-harness/open-questions.md) · **Volta quando:** o primeiro
colaborador — no mesmo dia, `required_approving_review_count` vai a 1 e o `CODEOWNERS` nasce.

### Grading de qualidade por domínio, com histórico — `M`

A auditoria pontuou 13 dimensões uma vez, à mão. A versão contínua é nota por domínio ou camada, com
série temporal, que responde "o `memory/` está piorando?" com curva em vez de impressão.

**De onde veio:** [harness-audit §7](harness-audit.md) · **Volta quando:** a [T9](../features/024-dev-harness/tasks.md)
(lint), a [T10](../features/024-dev-harness/tasks.md) (arquitetura) e a [T14](../features/024-dev-harness/tasks.md)
(mutação) existirem — antes disso não há métrica de onde tirar nota.

### Regras de lint com informação de tipo — `M`

Depende da resposta da [Q2](../features/024-dev-harness/open-questions.md): se o `typescript-eslint` não couber
no orçamento de 60s do `gate:build`, a T9 adota `oxlint` e a classe de defeito que **só** análise de
tipo pega — `no-floating-promises` à frente, num daemon cheio de `async` disparado — fica sem sensor.

**De onde veio:** [dev-harness T9](../features/024-dev-harness/tasks.md) · **Volta quando:** a medição da Q2
apontar `oxlint`, ou quando aparecer o primeiro bug de promessa não-aguardada em produção.
