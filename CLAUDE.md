# Lumem-OS

Harness de orquestração de agentes de IA. Arquitetura cliente-servidor. Hierarquia `Workspace > Projeto (repo git) > Worktree`.

Projeto pessoal. Inspirado em compozy, superset e conductor — **não copia nada deles**.

## Estado atual

Onze features de pé — [walking-skeleton](docs/features/001-walking-skeleton/tasks.md), [ui-shell](docs/features/002-ui-shell/tasks.md), [worktree-tabs](docs/features/003-worktree-tabs/tasks.md), [right-panel](docs/features/004-right-panel/tasks.md), [file-editor](docs/features/005-file-editor/tasks.md) e [project-from-url](docs/features/011-project-from-url/tasks.md) — a quinta faz o daemon **escrever** no repositório, com autosave e CRUD pela árvore, e a sexta o faz **clonar** de uma URL git qualquer, reorganizando o diretório de estado numa árvore só (`~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`) e tornando a remoção de um projeto gerenciado uma remoção **do disco**. **Decidido em 2026-08-17** ([ADR](docs/adr/2026-08-17-1812-agent-session-is-acp-not-pty.md), com o [estudo](docs/project/pty-vs-acp.md) que o sustenta)**:** a sessão de agente migra de PTY para ACP — a feature [acp-sessions](docs/features/006-acp-sessions/prd.md) (transporte + tela da conversa) está **completa**: plano, uso e custo, seletores, comandos de barra, terminal embutido, `fs/*`, e a conversa **em disco** — fechar o Lumem e voltar não perde conversa, e retomar continua de onde parou. [35 tasks](docs/features/006-acp-sessions/tasks.md) fechadas nas fases 1, 3, 4, 5 e 6. O PTY fica para shell e como caminho alternativo. O [onboarding](docs/features/008-onboarding/prd.md) são as **nove telas do primeiro acesso**, **21 tasks fechadas**: um e2e sai de `~/.lumem` vazio e chega a um turno respondido sem tocar a API. O [agent-login](docs/features/009-agent-login/prd.md) troca os cinco campos do rodapé por **login**, com os botões vindos do `authMethods` do handshake e o adaptador instalado pelo daemon numa versão fixa. E a [workspace-memory](docs/features/007-workspace-memory/tasks.md) — a primeira que não é de tela — está **completa**: nove PRs mais o S1, o S2 e as duas telas que faltavam. O `~/.lumem` versionado pelo daemon, os sinais de ação, o portão de escrita, as superfícies, o recall explicável e a inbox de propostas vieram nas 01–05. As 06–09 são o que faz a memória **mudar comportamento**: o núcleo comportamental injetado no primeiro turno com marca d'água e sem teto, a `GET /memory/ask` que o agente consulta por `curl`, a destilação de fim de sessão que virou proposta na inbox, o **auto-learn** — pergunta sem resposta sobe agente, e evidência verificável decide entre memória e proposta — e os **playbooks**, com ciclo de vida derivado do uso e nada arquivado sozinho. Os três interruptores que gastam token vêm **desligados** e aparecem na tela. E a
[workspace-screen](docs/features/010-workspace-screen/prd.md) fecha o círculo: o workspace ganhou **tela** — no
lugar de "selecione uma worktree" —, a memória dele deixou de depender de um projeto aberto, e o
consumo de tokens virou dado somável (`session_usage`), por projeto e por worktree, com janela de
tempo resolvida no daemon. A [project-scripts](docs/features/012-project-scripts/prd.md) — **completa, 14
tasks** — conserta o que faltava depois de tudo isso: o Lumem criava worktrees que **não rodavam**.
Agora `setup`, `run`, `test` e `teardown` moram no `<repo>/.lumem/project.toml` (o arquivo que já tinha o
`id`), a worktree nova nasce preparada, e o rodapé abaixo da árvore de arquivos sobe a aplicação com
um clique — com um bloco de portas reservado por checkout, e um portão de confiança para o
`[scripts]` que veio de um repositório clonado. E a [distribution](docs/features/014-distribution/prd.md) — **completa, 16 tasks** — tira o produto do
checkout: o daemon virou **um bundle ESM** com só o par nativo por fora, ele **serve o web na própria
porta**, o binário `lumem` sobe tudo, e `npm i -g @vinihcrosa/lumem-os` instala — com uma pipeline de release cujo
passo central é **instalar o tarball num runner limpo**, porque é o único que pega `require`
dinâmico, prebuild ausente e arquivo fora do pacote. A raiz ganhou `README.md` (em inglês, com
tradução ao lado) e `LICENSE` (MIT).

E a [workspace-tasks](docs/features/022-workspace-tasks/prd.md) — **completa, 17 tasks em 5 fases**
— conserta o que o produto chamava de tarefa e não existia: o nome da worktree era o único rastro da
intenção, e sumia com o checkout. Agora ela tem tabela, corpo, estado, proveniência e **custo de
graça** — `session_usage` já tinha sessão, e a sessão passou a ter tarefa. `in_progress` é
**derivado** do primeiro prompt de uma sessão ligada a ela, nunca declarado; `done` é seu; e o agente
cria tarefa por `POST /tasks`, com a mesma regra da memória — **escrever para cima é proposta**. Ela
é a primeira feature cuja fase 0 é o **desenho**, e a T3 dele terminou *apagando* uma peça: a
triagem do quadro da `028` era cópia, e já tinha divergido. A resposta da **T4** tirou a inbox de
propostas de dentro do `MemoryPanel` — uma fila só, no topo da tela do workspace, com memória e
tarefa juntas —, e o que quase se perdeu na mudança de endereço não era layout: era a distinção entre
**fato e conclusão**. Dois achados pagaram pela fase 1 sozinhos: a migração que o `drizzle-kit` gerou
**sem a ação do estrangeiro** (apagar tarefa seria recusado em vez de anular o ponteiro da sessão), e
o `DAEMON_PREFIXES`, que sem `/tasks` faria a porta do agente ser engolida pelo servidor de arquivos
— **só no pacote instalado**.

Em **2026-09-01**, nove anotações feitas na tela `/` viraram **quatro PRDs novas**, e **as quatro
estão fechadas**.

A [run-dock-open](docs/features/015-run-dock-open/prd.md) é a menor feature do repositório, e isso é o
**resultado** das perguntas e não a premissa delas. A PRD chegou dizendo que a conta de espaço
travava: o rodapé aberto subiria a coluna direita para 640px e nasceria com metade da janela. O
desenho mediu as duas parcelas e as duas já estavam pagas — chegar não é um `toggle`, então a coluna
fica nos 360px (com ~45 colunas de terminal, preço aceito); e metade da coluna deixa **11 das 16**
linhas de árvore contra 14 da alternativa, três linhas que não pagam um segundo número de altura no
produto. Sobrou **uma linha**: o `fallback` do `useRunDock`, de `open: false` para `open: true`. A
**Q6** — descer os botões de ação para a linha de estado — foi respondida em 2026-09-01 e
**revertida em 2026-09-06**, antes de qualquer código, porque a faixa nova paga por um `＋ nova aba
de terminal` que não existe no produto; a folha do Open Design foi reescrita para registrar a
reversão, porque a regra de design não permite o contrário. E a armadilha não era o código: o padrão
fechado **nunca teve teste** em três features, então não havia o que reescrever — havia o que
escrever.

A [sidebar-actions](docs/features/017-sidebar-actions/prd.md) está **completa** — 11 tasks, 6 perguntas mais
duas derivadas. As duas coisas que o Lumem cria passaram a se criar de onde elas moram: um `+` no
cabeçalho `Projetos` e um `+` na linha de cada projeto, e os dois diálogos viraram **modal centrado**
com véu, foco preso e devolvido ao `+` que o abriu. O `＋ adicionar projeto` saiu do rodapé e o
`CreateWorktreeDialog` saiu do `LocalPanel` — uma ação, um lugar. Ela é a primeira feature que chegou
com o **desenho pronto** e mesmo assim mudou o desenho: a **Q1** e a **Q5** foram respondidas contra
ele, e o Open Design foi **reescrito antes do código**, porque a regra não permite o contrário. A Q5 é
a que cobra: o modal do clone fica aberto até o fim, e **a tela fica presa por minutos** — em troca de
um hospedeiro só para o progresso. A Q5a é o que ela abriu: enquanto clona, `Esc`, `✕` e véu não
fecham, e a saída é `cancelar o clone`.

A nona anotação era sobre uma PR aberta que não aparece, e a
[pull-request-status](docs/features/013-pull-request-status/prd.md) está **completa**. O topo do painel direito
responde uma pergunta — **dá pra mesclar?** — em verde, vermelho ou âmbar, com o motivo ao lado; a
linha da worktree na sidebar ganha `● #19` da mesma cor, e é o único sinal que sobrevive ao painel
fechado, que é como ele nasce. O dado vem do **`gh` da sua máquina**: o Lumem não vê, não pede e não
grava token, e essa ausência é a maior parte da resposta de segurança da feature. A consulta é **por
projeto** — oito worktrees custam um processo, não oito.

Duas das onze perguntas foram respondidas **contra a proposta do PRD**, e isso mudou o corte: o Lumem
passa a **mesclar** e a **criar PR** — dois verbos, e só eles, cada um atrás de um portão que o daemon
relê antes de escrever. O e2e com um `gh` falso pagou por si mesmo três vezes, e nenhuma delas era
teste: `remoteUrl` nulo para projeto adicionado por caminho, o `⟳` que não relia, e um pedido servido
por uma leitura que **começou antes dele** — dos dois lados da rede, com o mesmo sintoma: o estado de
antes carimbado *"há 0 s"*.

A [worktree-first-tab](docs/features/018-worktree-first-tab/prd.md) está **completa** — 9 tasks, 5 perguntas
respondidas. A coluna do meio é **caminho → abas → conteúdo**: o cabeçalho fixo do checkout virou a
**primeira aba** (fixa, sem `✕`, com o ponto de sujeira que sobrevive a outra aba estar na frente), e o
`▤ arquivos` saiu da topbar para a faixa de abas do checkout. Ela reverte, com o motivo escrito, a W4
da [worktree-tabs](docs/features/003-worktree-tabs/tasks.md) — e o e2e provou de graça o que a mudança cobra:
com a conversa na frente, o nome da worktree só existe na aba.

A [session-mode](docs/features/016-session-mode/prd.md) está **completa** — 12 tasks, 6 perguntas fechadas. Ela
conserta um composer que ficava **mudo**: as pílulas eram derivadas inteiramente do `configOptions`, e
um vazio produzia zero pílula — então um agente que não relata `modes` desenhava o mesmo pixel que um
bug de transporte. Agora a pílula de modo existe sempre, e quando o agente não tem modos ela é a
**política do Lumem**: `perguntar tudo`, `automático` (leitura de arquivo dentro do checkout passa
sozinha) e `liberado`, atrás de um portão por sessão sem "não perguntar de novo". A autoria não é cor —
é o glifo `◈` mais o idioma do rótulo —, o que passa sozinho **aparece na conversa** assinado (`◈ o
Lumem aprovou`) com a linha de fecho contando o turno, e **nenhum caminho da feature nega sozinho**:
sem opção de permitir, o pedido sobe dizendo por quê.

A [second-agent](docs/features/021-second-agent/prd.md) está **completa** — 16 tasks em 4 fases, oito
perguntas — e é a primeira que **mediu antes de escrever**. A fase 0 subiu o
`@agentclientprotocol/codex-acp@1.10.0` de verdade, com o `AcpManager` deste repositório como
cliente, e o §4 da PRD foi reescrito com os números — o que mudou **duas** decisões antes de existir
código. O login do Codex não é um comando de terminal (`api-key`, `chat-gpt` que abre navegador na
máquina do daemon, e `chat-gpt-device-code` só se o cliente declarar `elicitation.url`), então a
escolha de agente **saiu** do primeiro acesso e o login virou uma **chamada**: `authenticate` mais
`elicitation/*`, sem timeout no passo que espera uma pessoa, e conferido com um `session/new` em vez
de acreditado. A tradução, ao contrário, atravessou um turno inteiro com **zero `warn`** —
`rateLimit: null`, `cost: null`, o `session_info_update` ignorado por nome —, então a F3 encolheu de
código para teste. O adaptador também **traz o próprio CLI** (285 dos 301 MB) e roda com
`PATH=/nonexistent`, o que fez `cli` ser opcional na spec. As cinco constantes de Claude viraram o
catálogo `ADAPTERS`, o `DEFAULT_AGENT_CONFIG` de `pty` parou de ser semeado, o rodapé da sidebar
passou a ter **uma linha por agente** com um `＋` no cabeçalho — 263×105px medidos no navegador —, e o
consumo do workspace passou a **abrir por agente** — uma sub-linha, não uma coluna, porque "uma
coluna por agente" é um número que o produto não controla. Cinco defeitos apareceram de graça: a
`configOption` de modo que ficava velha depois de trocar de modo, o `install` que a tela oferecia
copiar **sem versão** contra a própria regra da A12, o cabeçalho da conversa com a string `claude`
escrita à mão — com dois agentes, as duas conversas diziam a mesma coisa —, o `pip` do rodapé, que
era cinza nos três estados, e as colunas do consumo, que a folha do `workspace-screen` dizia serem
comparáveis verticalmente e **não eram**: 37px de diferença sempre que o texto de custo mudava de
largura.

A [composer-menus](docs/features/023-composer-menus/prd.md) está **completa** — 4 tasks, 5 perguntas — e é a
primeira que **achou mais defeito desenhando do que a issue relatava**. O menu do seletor aparecia
cortado porque `.composer__box` tinha `overflow: hidden`, e o recorte produzia **três** defeitos, não
um: o seletor perdia toda opção acima da borda; o menu de `/comandos` sumia **inteiro** — ele ancora
na própria caixa que recorta, em `bottom: calc(100% + 6px)`, e estava assim há três features com
teste de componente verde o tempo todo; e o menu de modo do Lumem só aparecia porque **fugiu**,
ancorando no `.composer`. O conserto é um só e não é uma fuga: a caixa deixa de recortar — os dois
cantos foram desenhados lado a lado no navegador e **são o mesmo canto**, porque nada dentro dela
pinta até a borda. Todo menu ganhou `--size-menu-max-h: 280px` com rolagem própria (nove linhas
inteiras e a décima pela metade, que é o que diz que a lista continua), e a âncora virou uma frase —
**um popover ancora no que o abre** —, com o portão do `liberado` como a exceção nomeada. A prova é
um e2e com um fake de vinte modelos que pergunta `document.elementFromPoint`, e não `toBeVisible`:
contra um elemento recortado por ancestral, o segundo fica verde.

E a [docs-contract](docs/features/025-docs-contract/prd.md) — **completa, 12 tasks** — é a primeira
feature que **mede a própria documentação**, e o que ela mediu mudou o pedido antes do código. O
pedido era um índice temporal com a regra *"a PRD mais recente manda"*; a regra virou **PRD não é
fonte de verdade, ADR é** — e `docs/adr/` não existia. Com a precedência num ADR, o número para de
afirmar prioridade e três problemas desaparecem sem regra nova: emenda posterior à criação (a Q6 da
`run-dock-open` foi revertida cinco dias depois do próprio número), colisão de `NNN` entre worktrees,
e *"nenhum arquivo descreve o presente"*. O `docs/prd/` virou `docs/features/NNN-nome/`, nasceram
**seis ADRs** — cinco retrospectivos, com a data real da decisão e o `Alternativas` **citando a
fonte** em vez de reconstruí-la de memória —, e os dois arquivos de `docs/project/` que eram ADR sem
o nome passaram a apontar para o sucessor, o que nunca havia acontecido. O que a medição achou é o
que decidiu o desenho: **44** declarações informais de supersessão, **4 links mortos** para um
arquivo que nunca existiu — dois criados por tasks marcadas `[x]` cujo trabalho era propagar a nota
—, e **6 campos `Status:`** que discordavam do disco, dois deles publicados nos `README` da raiz. Duas
respostas da própria PRD estavam erradas e foram **emendadas na resposta contradita**, não em
silêncio: checkbox não indica progresso aqui (a `walking-skeleton` está entregue com 244 caixas
abertas), e tasks escritas não são tasks começadas. O gate nasceu **verde**, que é o sinal de um gate
que não checa nada — cada checagem foi provada ficando vermelha de propósito.

E a [worktree-from](docs/features/026-worktree-from/prd.md) — **completa, 14 tasks em 6 fases** —
conserta o gesto mais repetido do produto: a worktree nascia **sempre da branch default**, com um
campo só, enquanto o mesmo produto já punha `● #19` na linha da sidebar. Agora o diálogo tem **quatro
origens** — default, branch existente, issue e PR —, e ela é a segunda feature a **medir antes de
escrever**: nove casos de `git worktree add` rodados de verdade mudaram três decisões antes de existir
código. O achado que decidiu o desenho é que `worktree add <path> origin/<branch>` devolve **exit 0 e
HEAD destacado** — o caminho ingênuo não erra, entrega uma worktree quebrada dizendo que deu certo —,
então nada aqui usa a forma esperta do comando, que ainda por cima **mente** quando dois remotos têm a
mesma branch. `gh issue develop` ficou de fora porque **escreve no host**, e o nome da branch é
montado localmente. As issues moram num cache **irmão** do `PrCache`, não dentro dele: aquele alimenta
uma barra que se pergunta sozinha de 15 em 15 segundos, e um `gh issue list` nesse ciclo seria ~730 ms
por projeto para um diálogo que ninguém abriu. É também a primeira worktree do produto cujo **nome não
é a branch** — com zero migração, porque as duas colunas sempre foram separadas.

E a [adapter-provenance](docs/features/027-adapter-provenance/prd.md) — **em execução** — começou como
um problema de janela de contexto e acabou num invariante de transporte. O relato era *"o Lumem mostra
200K num modelo de 1M, e não pega Opus 5 nem Fable 5.1"*; a causa é que **o pino não decidia nada.** O
daemon rodava `claude-agent-acp@0.40.0`, do PATH, havia nove dias, enquanto o `pinnedVersion` do
catálogo dizia `0.75.1` — e o `0.40.0` embute o Claude Code `2.1.160`, que não conhece nenhum dos
dois modelos. A lista que ele entregava tinha `Custom model` onde o Fable devia estar, e um
`usage_update` de 200 000 sob um rótulo que dizia *"1M context"*. O
[ADR](docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md) fecha as quatro superfícies em
que o PATH ou um caminho congelado decidiam: a resolução perde o `else`, o boot confere a versão **no
disco** contra o pino, e a invocação é resolvida da spec a cada `spawn` e a cada `resume` em vez de
lida da coluna `agent_config.command`. O `CLAUDE_ADAPTER.cli` caiu para `null` — medido três vezes: o
`0.75.1` fecha o handshake com o `claude` fora do PATH, o daemon spawna o binário de dentro do pacote,
e os `authMethods` dele pedem `--cli auth login` do próprio adaptador. A **Q1** foi respondida
**contra o pedido**: "embutido" no sentido de `dependencies` do pacote publicado custa 243 MB (Claude)
+ 301 MB (Codex) num `npm i -g`, então o que entrega a propriedade pedida — *"não deve ficar na mão do
PATH"* — é o daemon ser **dono** da cópia, e a leitura forte foi para o [backlog](docs/project/backlog.md)
com o número que a recusou. O defeito de brinde é do mesmo tipo: `rateLimitOf` exigia `utilization` na
raiz de `_claude/rateLimit` e o `0.75.1` a aninhou em `unifiedWindows.<janela>` — o rodapé de limite
está apagado em **todo** transcript do repositório, sem nada falhar.

E a [autonomous-orchestration](docs/features/028-autonomous-orchestration/prd.md) é a maior PRD do
repositório e a primeira **fatiada**: das seis partes do escopo, o `tasks.md` executa **uma** — o
quadro lendo a `022`, com a autonomia desligada —, e as **12 tasks das cinco fases estão entregues**.
O corte não é cautela: seis das nove conversas técnicas do §11 continuam guardadas, duas não têm
resposta, e uma delas **exige ADR novo** porque contradiz o [ADR de
2026-08-30](docs/adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). A fase 0 é um
[estudo](docs/project/orchestration-measurements.md), e ele mudou duas coisas antes de existir código.
A primeira é a que manda: **o `StopReason` do ACP não distingue *"terminei"* de *"te perguntei"***.
Dos **13 `end_turn`** gravados neste repositório, **4** significaram terminei — quatro eram pergunta,
dois eram espera sem interrogação, e **três eram o turno morrendo no meio do trabalho**. A heurística
do ponto de interrogação pega 4 dos 9: **44% de recall**, errando no caso caro. Isso tira o §4.1 do
terreno da cautela — *a máquina só move quando o fato é verificável de fora do agente* passa a ser a
**única leitura disponível**, porque o transporte não tem o dado. A segunda é que o modelo da `022`
não comportava o quadro: sete colunas contra quatro estados úteis, e `Backlog`/`To-Do` colapsariam no
mesmo `open` — apagando a fronteira de autorização que a coluna existe para marcar. O estudo também
mediu o que **não** entra: o precedente do `gh` **não é portável** para tracker (não existe `linear`
na máquina), polling cabe em **2,4% da cota** do Linear, e a camada gerenciada custa **~2 s** por
chamada contra ~345 ms do caminho direto. O selo é derivado de **turno em voo**, e não de processo
vivo — 7 dos 15 transcripts nunca receberam um prompt, e cada um deles pintaria *"implementando há
3 h"* pelo outro critério. A tela reproduziu a conta do Open Design (1152px de faixa + 264 da sidebar
= 1416 contra 1418 medidos) e achou três defeitos que nenhuma leitura de código pega — o mais caro
deles é que o **`ResizeObserver` vê a caixa, e o que muda é o conteúdo**. Duas perguntas ficaram
abertas e represadas até a Parte 2 (a esteira), e uma terceira **nunca precisou existir**: a Q38 levantou o arrasto
para `In Progress` como contradição, e ele **já funcionava** — sem um único teste cobrindo.

E em **2026-09-13** a `028` fechou as **43 perguntas** dela, três delas **gastando token** — US$ 4,60
em 30 turnos de Haiku e Opus, contra o adaptador que o daemon é dono. A Q39 foi **derrubada** em vez
de respondida: *terminou* e *te perguntou* **não são exclusivos** — 31% dos turnos que commitaram
deixaram pergunta em aberto —, então o selo `aguardando você` é um eixo **ortogonal** e o desenho o
fez escolha. Pior: **o commit não separa *terminou* de *desistiu inventando*** — a tarefa impossível
virou commit em 3 de 4 execuções, com o serviço inventado junto —, e o que separa é o **CI**, o que
torna a força da esteira a força da suíte do projeto. O Haiku **não perguntou nenhuma vez** em 10
turnos. E dos cinco modos do Claude, **só `bypassPermissions` fecha o laço**: o único modo que deixa a
esteira andar é o único que nunca pergunta, então a segurança dela não pode vir do modo de permissão.
Daí saiu o [ADR de 2026-09-13](docs/adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md) — **o
modelo é do Lumem, e o que vem de fora se adapta a ele**, regra geral para adaptador, banco, `gh` ou
tracker. Ele contradiz uma frase da [`016`](docs/features/016-session-mode/prd.md) com a nota no
requisito, reafirma os três ADRs em vigor, e nomeia **três vazamentos medidos** — o `stopReason`
repassado do ACP, o `session.mode` cru, e o `TaskRow` derivado do `drizzle`, que é o banco decidindo a
forma do domínio.

A **Parte 2 — A esteira** fechou em **2026-09-13**, e com ela a `028` passa a ter **33 tasks
entregues** em três fatias. O daemon **puxa da fila sem ninguém pedir**: corta a worktree, roda o
`setup`, abre a sessão do encaixe no modo que não pergunta, manda o prompt e julga — com a autonomia
nascendo em `manual` e o degrau `assistido` no meio, que prepara tudo e **para antes de enviar**. A
fase 0 dela produziu um [ADR](docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md) com
[estudo](docs/project/conveyor-durable-state.md): **a esteira não tem lease**. Dos dez invariantes do
Compozy, **seis não se aplicam** — lá qualquer sessão reivindica um run, aqui quem reivindica é o
daemon, que é um só —, **um já era grátis** (o selo é derivado, e matar a sessão o devolve na leitura
seguinte, com teste) e **três ficam**, todos sobre *quantas vezes já se tentou*. Sobraram duas
colunas: `attempts`, que zera na mudança de etapa porque mudar de etapa **é** a conclusão daquela
etapa, e `autonomy`, que não zera porque você desligou de propósito.

**O e2e achou dois defeitos que nenhuma leitura de código pega**, e o mais caro é de produto: quando o
agente é dono do seletor de modos, o daemon **não consulta** a política do Lumem — ele manda o pedido
de permissão para uma pessoa (a A1 da [`016`](docs/features/016-session-mode/prd.md)) —, e numa sessão
de esteira **não há pessoa**. O turno pendurava para sempre com o cartão dizendo `implementando` a
manhã inteira. Daí saíram duas coisas: a sessão da esteira **nasce** na política que precisa em vez de
trocar para ela — o portão do `016` protege a **troca**, e continua inteiro —, e o turno ganhou um
**teto de 30 minutos** que não existia. O segundo defeito é o log da passada, que o pino serializava
como `{"code":"BLOCKED"}` **sem a frase** — a mesma falha que o retrato do turno já tinha pago, e foi
consertá-la que permitiu diagnosticar a primeira. Um terceiro veio de um teste de fila: a regra do
arrasto contava `open` como coluna da máquina, então **pôr uma tarefa na fila desligava a autonomia
dela** e a esteira ficaria vazia para sempre sem nada falhar.

E as **Partes 5 e 6 — o tracker** fecharam junto, levando a `028` a **48 tasks e as seis partes do §6
entregues**. Elas estavam paradas por um motivo só — **de onde vem a credencial** —, e ele foi decidido **duas
vezes no mesmo dia**. O primeiro ADR disse *"do ambiente"*, apoiado em dois precedentes do produto, e
**foi superado horas depois**: o Vinicius nomeou o erro — *"a decisão do `gh` e `glab` foi específica
para eles; a do Claude Code e Codex foi por simplicidade"* —, e nenhuma das duas era regra a ser
estendida. É a primeira vez que a cadeia de `supersedes` do [`025`](docs/features/025-docs-contract/prd.md)
é exercitada neste repositório.

O que vale é o [ADR do cofre](docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md),
com [estudo](docs/project/secret-store.md): **o Lumem guarda as chaves dos serviços de que depende**,
cifradas em `~/.lumem/_system/`, com `AES-256-GCM` nativo. **Agentes, GitHub e GitLab entram numa
feature posterior** — até lá, `gh` e `apiKeyEnv` continuam como estão.

O estudo mede o que foi recusado, e os dois achados são concretos: o cofre do macOS põe o valor no
**`argv`** — `security add-generic-password -w` sem valor **pede no terminal duas vezes** em vez de
ler `stdin` —, e são **três CLIs** para três sistemas. A saída nativa resolve os dois e quebra o *"só
o par nativo por fora"* que a [`014`](docs/features/014-distribution/prd.md) comprou. E o que o cofre
**não** protege está escrito no ADR e num teste: quem já lê o seu `$HOME` como você decifra, porque a
chave está ao lado — dizer *"guardado com segurança"* sem dizer contra o quê ensina alguém a confiar
numa proteção que não existe.

O resto é **polling a 60 s** — webhook exige relé, e relé é a opção que o ADR recusou —, a issue
virando cartão **direto na To-Do**, e os quatro marcos voltando para a issue **uma vez cada**. Três
decisões que o código cobrou: o índice da chave externa é **por workspace** (a mesma issue pode
legitimamente virar tarefa em dois), o instantâneo é atualizado **mesmo com a tarefa já bloqueada** —
senão uma segunda mudança lá nunca seria vista —, e a reserva do marco acontece **antes** da escrita,
porque o lado certo de errar é um marco registrado que não saiu, e não um segundo comentário na issue
de outra pessoa. E **sem mapa de colunas, nada é movido lá**: isso é a decisão, não o default
preguiçoso.

E a **Parte 4 — Supervisão e o volante** fechou no mesmo dia, levando a `028` a **41 tasks em quatro
das seis partes**. Ela é sobre o que você vê **sem estar olhando**, e a fase 0 dela achou uma
contradição que a esteira tinha acabado de criar: o relógio do encalhe cobrava **espera por vaga**.
Com teto 2 e oito cartões devidos, os seis na fila ficavam âmbar em 30 minutos sem nada de errado —
e *"cobrar o que é desenho é a forma mais rápida de tornar o aviso invisível"* é o §8 do próprio
documento. O conserto não guarda nada: cartão na fila além das vagas **não encalha**, derivado da
mesma leitura. A notificação é **da aba** e o registro de *já avisei* é **do daemon** — é isso que faz
*"uma vez, sem repetir"* valer com duas abas e com `F5` —, e a permissão é pedida **quando alguém liga
a autonomia**, o único instante em que o pedido tem frase honesta. O que sobra sem aba aberta é uma
frase no topo do quadro que **some quando você olha**. O volante são dois verbos: `parar` **cancela e
depois** desliga (a ordem é lida de dentro do cancelamento, porque desligar primeiro deixa o turno
velho gastando sem ninguém para matá-lo) e `assumir` **não interrompe**. E a **Q59** nasceu do UC7 lido
ao pé da letra: se todo clique desligasse a autonomia, olhar o quadro viraria campo minado — então só
conta como assumir o cartão que a esteira está tocando **agora**. O `Done` limpa pela regra da Q27, com
um quarto caso que ela não tinha decidido: o interruptor **não** vale para branch não mesclada, porque
ele se chama *"PR **mesclada** sempre remove"*. E `mesclada` é lido do **git** (`ahead === 0`), não do
`gh`: vale para quem mesclou na mão e para quem nunca abriu PR.

A **Parte 3 — Orçamento e limites** fechou em **2026-09-13**, e ela veio **antes da esteira**: a Q43
mediu que o único modo do Claude que deixa a esteira andar é o único que **nunca pergunta**, então a
segurança dela não pode vir do modo de permissão — tem que vir do CI, do orçamento e do teto de
turnos. Os três tetos moram no workspace, `NULL` é *sem teto* e `0` é *bloqueia tudo*, e a decisão é
**função pura de três saídas**: quem conduz é **avisado** e decide, a esteira **para** — mesmo número,
mesma leitura, verbos diferentes (Q45). O teto em dinheiro não é cobrável contra todo adaptador (o
Codex relata `cost: null`), então ele tem **duas unidades**, e um produto que só soubesse cobrar em
dólar deixaria um workspace com Codex rodando sem teto nenhum. Duas tasks estão **anotadas em vez de
fingidas**: a recusa por cota **não tem código no protocolo** — o login tem `-32000` e é por código
que o daemon o reconhece, *porque o texto é do adaptador* —, e o cartão bloqueado não tem o que
desenhar até a esteira existir, porque escrever o CSS agora recriaria as 13 classes órfãs que a Parte
1 pagou. Três achados de processo: o `drizzle-kit` voltou a gerar um `SELECT` lendo colunas que ainda
não existem na origem — **cinco migrações depois** do `0001`, o que faz a armadilha ser do gerador e
não daquela migração —, uma variante nova de `AcpEvent` **derruba o typecheck da tela** (e isso é o
contrato funcionando), e o **mock compartilhado é parte do contrato**: esquecê-lo quebrou cinco testes
de telas sem relação com orçamento.

E a **Parte 7 — O parecer do revisor** fechou em **2026-09-15**, levando a `028` a **61 tasks**. Ela
**não veio de discussão**: veio de rodar a esteira contra uma tarefa de verdade, vinda do Linear —
**US$ 11,41** e 453 884 tokens em seis sessões, com o cartão parado em `In Review` e o revisor
reprovando duas vezes enquanto o daemon escrevia `portão verde`. Três defeitos empilhados, e o
primeiro escondia os outros: a esteira **se declarava agente**, e o `AGENT_MAY_SET` da
[`022`](docs/features/022-workspace-tasks/prd.md) recusava **três das quatro setas** — o `throw` virava
uma linha de log que ninguém lia. A regra da `022` está certa e fica; quem estava errado era a esteira,
que é o daemon. E o motivo de a suíte não ver era estrutural: o `conveyor.test.ts` injeta um `advance`
falso, e o `conveyor-ports.test.ts` **não existia** — as 48 tasks fecharam com a tradução entre a
política e o banco nunca exercitada.

Com as setas andando, o buraco de verdade apareceu: **o portão não tinha entrada nenhuma do revisor.**
A resposta é a [Q67](docs/features/028-autonomous-orchestration/open-questions.md) — **dois baldes**, e
o que os separa não é a verdade do achado, é **quem consegue resolver a discussão**. `bloqueia` traz o
comando que o demonstra, e **o daemon reroda**: reproduziu, o cartão volta ao implementador;
não reproduziu, o achado cai e fica registrado que o revisor afirmou o que não se sustenta. `anota` é
julgamento — arquitetura, convenção, nome ruim —, **não segura nada** e vai para a pull request, onde
uma pessoa lê antes de mesclar. É a resposta ao relato que abriu a parte — *"toda vez que você pede um
review para um agente, ele vai achar alguma coisa"* — sem censurar o revisor: ele acha quanto quiser, e
só o que ele demonstra segura. `bounces` é coluna separada de `attempts` porque aquele zera na mudança
de etapa, e o ciclo implementador ↔ revisor troca de etapa a cada passo: nenhum teto chegaria.

A PR passou a abrir **quando o implementador fecha pela primeira vez**, o que dá endereço ao balde
`anota` e faz o marco `pr` do §6 — que existia e nunca disparou — passar a disparar. E há **uma
conversa por encaixe**: um implementador, um revisor, um testador por tarefa, fechada quando a tarefa
**sai** da etapa, e não a cada turno (as duas tasks se contradiziam, e `session/load` sobe um adaptador
novo — o par não sobrevive ao ciclo imediato).

**A prova veio em duas rodadas, e as duas acharam coisa.** A primeira foi contra a `LUM-51` de verdade:
o revisor postou 4 achados (1 `bloqueia`, 3 `anota`), o daemon rerodou o `grep`, bateu com o `expected`
e devolveu o cartão — e o implementador foi mexer exatamente onde o achado apontava. De graça, dois
defeitos de produção: o teto de orçamento **funcionou pela primeira vez**, e a porta do parecer
**viajava dentro do preâmbulo de memória**, que some inteiro num workspace sem acervo — o estado de
todo workspace novo. A segunda rodada é o e2e, com um revisor falso e zero token, e ela achou o pior
modo de falha que a parte podia ter: **um parecer vazio não gravava nada**, então *"olhei e não achei
nada"* era lido como *"o revisor não deixou parecer"* — o cartão travava **porque o revisor acertou**.
O conserto é o **recibo** (`task_review`): o parecer é o evento, os achados são o conteúdo. Ela também
achou que a esteira lia `project.remoteUrl` **cru**, nulo em todo projeto adicionado por caminho — a
mesma metade que a [`013`](docs/features/013-pull-request-status/prd.md) já tinha esquecido uma vez —,
e que o parecer da volta passada contava como parecer desta. O verbo `pr comment` entrou com a nota no
requisito **F7.1** da `013`, que dizia *"e nada mais"*.

E um quinto apareceu **usando o produto**, no mesmo dia: a esteira em `autônomo` abria sessão que
**pedia permissão a cada passo**. `session/load` traz a conversa e sobe um adaptador **novo**, no modo
padrão dele — quem aplicava `bypassPermissions` era só o caminho do nascimento. Como a conversa fecha
quando a tarefa sai da etapa, a segunda vez de todo encaixe é uma retomada: o caminho consertado era o
raro. Junto veio o pedaço silencioso — o `lumemMode` só chegava à linha pelo `watchConfig`, que
observa **troca**, então uma conversa que nasce liberada e nunca troca de nada deixava a linha dizendo
`perguntar tudo` sobre uma sessão que o daemon tratava como liberada.

E um sexto, lendo por que o cartão não saía de `In Progress` depois de o implementador consertar o que
a revisão devolveu: o **portão esperava 20 segundos pelo teste do projeto**. O `runToCompletion` tem
esse default, e o nome dele diz para quê — `TEARDOWN_TIMEOUT_MS`, *"curto, porque a remoção não pode
ficar refém dele"* —; a esteira chamava sem opções e herdava o teto de uma operação cuja pressa é o
oposto da dela. Na `LUM-51` o `pnpm gate:quick` foi morto aos **20,3 s** e o portão leu *"não chegou a
rodar"*: **duas das quatro tentativas** do cartão foram embora assim, e com esse teto nenhum projeto
com suíte de verdade passa no portão — que é justamente o que a Q53 chama de a força da esteira.

E a rodada seguinte — **a primeira em que o laço inteiro funcionou**: o implementador trabalhou 15
minutos, commitou, e o portão rodou o teste do projeto em 56 s e **reprovou**. Dois achados nela, e os
dois do mesmo tipo — **o nome dizia uma coisa e o dado era outra**. O teto de `turnsPerSession`
contava `usage_update` e não turno: o adaptador mandou **97 num turno só**, então o teto que a Parte 3
desenhou para proteger quem **não relata dinheiro** disparava dentro do primeiro turno, sempre. E a
recusa do teto — cuja frase é boa, *"parou no teto do workspace — 60 turnos por sessão"* — subia como
**exceção**: cada passada gastava uma tentativa e subia um adaptador de 243 MB para ouvir o mesmo não,
até o cartão parar com *"parou depois de 2 tentativas"*. Decisão do daemon virou resposta, e só ela:
adaptador morto continua sendo falha. E o teste que reprovou não era do agente — era o **node**: o
daemon roda os scripts por `$SHELL -lc`, e um shell de login **não interativo** não carrega o nvm, então
o terminal rodava v22 e o daemon v26, com 340 testes quebrando no jsdom.
A `028` fecha a Parte 7 com **61 tasks**.

E a [settings](docs/features/030-settings/prd.md) — **completa, 16 tasks em 5 fases** — dá ao produto
a primeira **rota** e a primeira tela de configuração. O problema era que **dado de configuração
dividia pixel com dado de acompanhamento**: um `<p class="tlist__budget">` de **79 linhas** — três
tetos, uma variável de ambiente, os degraus da esteira, o paralelismo e o interruptor de limpeza —
ficava acima da lista de tarefas. Ajuste se faz uma vez por mês; a lista se lê todo dia.

O roteamento é **três endereços escritos à mão** — `/`, `/tasks`, `/settings` —, e a Q2 mediu os três
níveis antes de escolher: `react-router@7` são **4,79 MB** e duas dependências, `wouter` **77 KB** e
nenhuma, à mão são ~40 linhas. As duas pontas já existiam (o daemon serve o shell para qualquer
caminho, e o vite devolveu **200 `text/html`** em `/settings`); faltava o cliente ler
`location.pathname`. O **checkout continua seleção, e não lugar**: selecionar usa `replaceState`,
porque com `push` o botão voltar viraria *desfazer seleção* — e ele não perde endereço nenhum, já que
recarregar a página sempre o descartou. O N3 — workspace, projeto e checkout na URL — virou a
**LUM-63**, que é onde as ADRs de roteamento vão nascer; esta não virou ADR porque **falha o primeiro
dos três testes**: `/settings` vale nos três níveis, e trocar 40 linhas por uma biblioteca é uma
tarde.

O achado que mudou o corte é que **`workspace.setBudget` não tinha chamador na web**: os três tetos e
o paralelismo eram somente-leitura no produto inteiro, e o único jeito de pôr um teto era um teste —
a `028` Parte 3 entregou a metade que *mostra*. A tela é o **primeiro escritor**, e ela preserva os
três estados que o banco distingue: `null` é *sem teto*, `0` é *bloqueia tudo*, e o campo vazio é o
**gesto** de tirar o teto. Grava no `blur`, nunca por tecla, e **sem botão salvar** — o retorno reusa
as palavras e os `--color-save-*` do editor.

Das **10 perguntas, quatro foram respondidas contra a proposta**. A **Q3** pôs a etiqueta de dono
**por controle**, porque `integrações` **não tem um dono** — a chave é da máquina e o mapa de colunas
do tracker é do repositório, e são **quatro** donos e não três. A **Q5** derrubou a premissa da
própria pergunta: o `aria-label="Telas do workspace"` era **descrição**, não regra, e a entrada foi
para a `SidebarNav`. A **Q6** disse *não sobra nada* no rodapé da sidebar — o que faz a conta da
coluna fechar **positiva**, porque a terceira linha cobra 28px e o rodapé devolve 73 a 105 —, e a
**Q6a** recusou o sinal passivo de agente caído por **escala**: uma linha por agente não cabe, e um
sinal com barra de rolagem deixa de ser sinal. Daí saiu **notificações**, no
[backlog](docs/project/backlog.md).

O desenho veio **antes** do código e a folha foi **renderizada e medida** — ela achou quatro defeitos
que nenhuma leitura de código pega, e o mais reaproveitável não é desta feature: **a largura da
coluna mora no `.body`**, então uma sidebar montada num `flex` encolhe para 188,6px e a folha passa a
medir uma coluna que o produto não tem. A fase 4 achou o defeito mais instrutivo: **o e2e do teto
`null` passava com a escrita quebrada**, porque um workspace que nunca teve teto já tem `null` — o
caso media o default e chamava de resultado.

E a [design-in-the-code](docs/features/031-design-in-the-code/prd.md) — **completa, 8 tasks** — tira o
desenho de fora do repositório. O Open Design era a fonte e daqui saía uma cópia, e a cópia estava
**67 arquivos atrás** no dia da decisão: um refactor de camadas de lá — `lumem-ds.css` com 734 regras,
24 telas — nunca entrou, e nada falhou. Some a isso **uma pasta só** em `~/Library/Application
Support/` para um produto cujo assunto é worktree paralela, e um clone que não contém o desenho. O
[ADR](docs/adr/2026-09-20-2246-design-lives-in-the-code.md) supera o de 2026-08-19 e **reafirma** o
que fica: `var(--token)` em todo componente, `tokens.ts` derivado, os pares de contraste no gate.
Agora o componente React **é** o desenho, a galeria é o **Storybook**, e o agentation anota nas duas
superfícies. A rota `/styleguide` virou 19 stories com o mesmo JSX; o `design:sync` virou
`design:derive`; os protótipos saíram, com o histórico no `lumem-os-design`, arquivado. A alternativa
mais forte — ficar no Open Design com um **symlink por worktree** — foi medida nesta máquina e
**funciona**; perdeu por pedido, e isso está escrito em vez de omitido. O defeito da execução é do
tipo que só o navegador pega: o `build-storybook` **passava** enquanto o `storybook dev` girava para
sempre, e a causa era um `delete config.server` de três palavras que derrubou o plugin do preview —
nenhuma das duas mensagens de erro cita o 404 que era o problema. O que a feature **custa** está
escrito: a atenção agendada da fase de desenho, que é como a [`023`](docs/features/023-composer-menus/prd.md)
achou um `overflow: hidden` vivo no produto havia três features, com teste verde.

E a [web-architecture](docs/features/032-web-architecture/prd.md) — **completa, 34 tasks em 9
fases** — dá ao `web` a camada de dados que faltava: **33** componentes falavam com `trpc.*` direto
(a PRD estimava 32; o disco tinha mais um, `App.tsx`, esquecido pelo ping de saúde), a invalidação de
cache estava espalhada em 26 arquivos, e `queryKeys.ts` convivia com 21 chaves escritas à mão em 16
arquivos. O sensor que prova cada fase, `architecture.test.ts`, nasceu na fase 0 com três regras e
fecha com **oito**, cada uma com uma lista de exceção que **só encolhe** — e a fase 3 é a primeira a
admitir, no próprio texto, que *"lista em zero"* era o critério errado: das 33 exceções do início,
sobram **cinco** por desenho — quatro recursos que as sete tasks da fase nunca prometeram cobrir
(`files`, `changes`, `memory`, `usage`) e um `useQueries` que bate quatro hooks de uma vez.
`LumemEvent`, `BoardCard` e `Seal` migraram para `@lumem/shared`, com o mesmo `switch` exaustivo que
`AcpEvent` já tinha — variante nova **derruba o typecheck**, dos dois lados, em vez de sumir em
silêncio. A fase 4 é o `git mv` de 113 arquivos numa PR só: `components/` e `setup/` viraram nove
pastas em `features/<domínio>/`, cada uma com um `index.ts` que é a única porta e um `index.css` que
é a única cascata. Ela achou o que nenhuma leitura de código via: o sistema de arquivo
*case-insensitive* confundiu `Board.tsx` com o `board.ts` que se mudou para o mesmo diretório, e o
`tsc` recusou com `TS1149` antes de qualquer teste rodar — resolvido renomeando o segundo para
`board-columns.ts`. E `checkout-tab.test.tsx` foi o único teste, de 1196, que a mudança de endereço
quebrou: um `vi.mock` do `index.js` que espalha `importOriginal()` a cada chamada devolve uma
identidade nova de `Terminal` a cada render, e um `toBe()` que comparava nó entre renderizações
passou a falhar sem o componente ter mudado. A fase 6 deu teto de 400 linhas a `features/`, com um
mapa que só encolhe: `Conversation.tsx` caiu de 830 para 119 linhas com o transporte extraído para
`useConversationSession.ts` e `Composer`/`Transcript` como irmãs; `MemoryPanel.tsx` de 1006 para 90,
em cinco arquivos por aba; `AgentLogin.tsx` de 861 para 140, em quatro mais `agent-words.ts`. As três
divisões repetiram a **mesma** armadilha de teste, três vezes: o `*-css.test.ts` de cada feature lê
os componentes por uma lista escrita à mão, e uma classe que **parou** de ser pedida por um arquivo
que saiu da lista não aciona nada — o teste continua verde e cego. `css-blocks.test.ts` (fase 7) é a
resposta estrutural: lê o `web` inteiro por `readdirSync`, sem lista nenhuma, e achou sozinho três
duplicações reais que as tasks anteriores não cobriam (um terceiro `.empty {}` em `right-panel.css`,
`.act` copiado byte a byte entre `sidebar.css` e `agent-login.css`, uma `container query` duplicada) e
três telas **sem uma linha de CSS sequer** desde que foram escritas — a classe de defeito que a `028`
Parte 3 já tinha pago, com as 13 órfãs. A fase 5, que é a fase 0 da LUM-63, deu ao `web` o primeiro
store fora de componente: `lib/navigation.ts` guarda `selection` e `arrival` em estado de módulo, de
propósito — e foi exatamente isso que vazou seleção de um teste para o seguinte dentro do mesmo
arquivo, até ganhar `resetNavigationForTests()` no `afterEach` global. `App.tsx` encolheu de 497 para
**171** linhas e para **três** `useState`, com `WorkspaceShell`, `MainColumn` e `RightColumn` ao lado
dele. E a fase 8 fecha a feature com a galeria: cinco stories dos estados caros que o [ADR do desenho
no código](docs/adr/2026-09-20-2246-design-lives-in-the-code.md) promete e a galeria não tinha
(workspace sem acervo, orçamento bloqueado, vinte modelos no seletor, permissão pendente na conversa,
a coluna de arquivos). O plano pedia o mesmo `vi.mock` que os testes de componente usam, compartilhado
entre story e teste — e ele não alcança um `.stories.tsx`: `storybook build` nunca passa pelo Vitest.
Três dos cinco componentes não tocam `trpc` — são presentacionais, ou o transporte é injetável, como
o `connect` que o teste da conversa já usava —; os outros dois, que leem por
`@tanstack/react-query`, ganharam um `QueryClient` com `staleTime: Infinity` e o cache pré-carregado
pelas mesmas funções de `queryKeys.ts`, sem chave escrita à mão e sem mock — provado com um navegador
de verdade: zero erro de console e zero chamada de rede em `/trpc`, `/acp` ou `/pty` nas cinco
stories.

Comece pelo [índice da documentação](docs/README.md).

| Onde | O quê |
|---|---|
| [docs/project/vision.md](docs/project/vision.md) | visão do projeto, escrita pelo Vinicius |
| [docs/project/questions.md](docs/project/questions.md) | perguntas de design do projeto, respondidas aos poucos |
| [docs/project/testing.md](docs/project/testing.md) | matriz de cobertura, gates, e as armadilhas já corrigidas |
| [docs/project/agentation.md](docs/project/agentation.md) | a barra de anotação visual do dev — clicar na tela vira contexto estruturado para o agente, pelo MCP `agentation` |
| [docs/project/backlog.md](docs/project/backlog.md) | tudo que ficou para depois. **Ideia adiada entra aqui na mesma hora**, com contexto curto e gatilho de volta |
| [docs/project/workspaces.md](docs/project/workspaces.md) | scripts de setup/run/teardown, e os dois ambientes: `~/.lumem` de produção e `~/.lumem-dev/shared` de desenvolvimento |
| [docs/references/](docs/references/) | estudo das quatro referências + comparativo |
| [docs/adr/](docs/adr/) | **as decisões em vigor.** Liste a pasta e leia o frontmatter antes de propor arquitetura |
| [docs/project/pty-vs-acp.md](docs/project/pty-vs-acp.md) | o estudo que sustentou a decisão de transporte: por que ACP, o que ela custa, e a recomendação contrária que perdeu |
| [docs/features/](docs/features/) | PRD, perguntas e tasks por feature, em `NNN-nome/` |

Construção é incremental: uma parte por vez, bem feita, antes de ir pra próxima.

## Código

Monorepo pnpm + Turborepo. `packages/shared` (contratos), `packages/server` (daemon Fastify + tRPC), `packages/web` (React + Vite).

| Comando | O quê |
|---|---|
| `pnpm dev` | sobe daemon e web juntos, no ambiente de dev (`~/.lumem-dev/shared`, nunca o `~/.lumem` de produção) — ver [workspaces.md](docs/project/workspaces.md) |
| `pnpm storybook` | a galeria das primitivas, na 6006. Substituiu a rota `/styleguide` — ver a **Regra de design** |
| `pnpm gate:quick` | testes afetados pelo trabalho atual |
| `pnpm gate:full` | suíte inteira + e2e |
| `pnpm gate:build` | typecheck de tudo + build |
| `pnpm adapters:check` | pergunta ao npm se o pino de cada adaptador ACP envelheceu — e se o **runtime que ele embute** envelheceu, que é o que quebra turno. Sem rede, passa |
| `pnpm smoke:install` | empacota o `lumem`, instala num prefixo descartável e sobe — a prova de que o pacote publicado presta |
| `pnpm version:set <x.y.z>` | escreve a versão nos três lugares que têm que concordar |

Antes de dizer que uma task está pronta, rode o gate que ela declara. Detalhes em [docs/project/testing.md](docs/project/testing.md).

## Regra de design

> **O desenho mora no código.** A decisão está em
> [`docs/adr/2026-09-20-2246-design-lives-in-the-code.md`](docs/adr/2026-09-20-2246-design-lives-in-the-code.md),
> que supera a de 2026-08-19 — o Open Design saiu. O estudo do período anterior, com o custo que a
> cópia cobrou, continua em
> [design-source-of-truth.md](docs/project/design-source-of-truth.md).

Não há fonte fora do repositório, e não há cópia. Um arquivo só continua sendo **derivado**, e esse
não se edita à mão:

| Arquivo | O quê |
|---|---|
| `packages/web/src/styles/tokens.css` | **a fonte.** Cor, espaço, raio e tipografia existem aqui e em nenhum outro lugar |
| `packages/web/src/styles/tokens.ts` | **derivado** do `tokens.css` — o `xterm`, o CodeMirror e o Shiki precisam do hexadecimal em JavaScript |

`pnpm --filter @lumem/web design:derive` re-deriva; `--check` diz se divergiu sem escrever. Quem
**garante** é o `gate:quick`, que compara o `tokens.ts` commitado com o que a derivação produz.

Componente em React só usa `var(--token)`: nenhum literal de cor, de espaço ou de tipografia. O
`gate:quick` confere os **122 pares de contraste**, então cor escolhida à mão que reprova falha a
suíte com o nome da combinação de tela que quebrou.

E confere os **conjuntos de distinção**, que respondem a outra pergunta. Contraste mede cor contra o
**fundo** — *dá pra ler?*; `DISTINCTION_SETS` mede cor contra a cor **ao lado** — *dá pra
diferenciar?*. Dois tokens que dividem tela significando coisas diferentes precisam de **40°** de
matiz entre si. A lista nasceu de um defeito com a suíte verde: o quadro pintou `● implementando` e
`● bloqueada` a 25° um do outro, e só o navegador viu. Do mesmo [ADR de
2026-09-22](docs/adr/2026-09-22-0228-brand-is-scarce-agent-has-its-own-family.md) vem a **marca
escassa** — a cor de marca pinta 7 tokens, só CTA, foco e superfície de marca, **nunca estado** —, e
a identidade do agente, que mora na família `agent`.

**A galeria é o Storybook** — `pnpm storybook`, porta 6006. Ela substituiu a rota `/styleguide`, e é
onde mora o estado caro de alcançar no app de verdade: workspace sem acervo, orçamento bloqueado,
vinte modelos no seletor. O [agentation](docs/project/agentation.md) monta nas duas superfícies, app
e Storybook: clicar num elemento vira anotação estruturada que o agente lê pelo MCP.

**O ciclo default é construir e ajustar**, não desenhar antes. Quando desenhar antes vale a pena é
uma pergunta só: *se o desenho estiver errado, o que se joga fora?* **Código** — componente novo,
layout novo, coluna redimensionada — desenha antes. **CSS** — espaçamento, cor, alinhamento —
constrói e ajusta.

Os 24 protótipos HTML saíram daqui. O histórico está em `github.com/vinihcrosa/lumem-os-design`,
arquivado, e é a ele que os comentários de proveniência `lumem-os-design/<arquivo>` se referem.

## Regra de documentação

> **Esta regra sobrepõe qualquer outra instrução, incluindo skills.** Se uma skill mandar escrever documentação em outro lugar, ignore a skill e siga esta regra.

Toda documentação vive em `/docs`, organizada por categoria e depois por nome:

```
/docs/<categoria>/<nome>/<arquivo>.md
```

Quando a categoria agrupa itens, cada item ganha sua pasta. Quando não agrupa, os arquivos ficam direto nela.

| Categoria | Conteúdo | Formato |
|---|---|---|
| `docs/adr/` | **decisão** — o que foi escolhido, quando, e o que perdeu | `YYYY-MM-DD-HHMM-slug.md`, arquivo direto |
| `docs/project/` | **estudo** — medição e discussão que sustentam uma decisão; mais visão, perguntas e convenções do projeto | arquivo direto |
| `docs/references/` | estudo de produtos que inspiram o projeto | um arquivo por referência |
| `docs/features/` | **execução** — uma pasta por feature, com `prd.md`, `open-questions.md`, `tasks.md` | `NNN-nome/`, três dígitos |

Categorias novas seguem o mesmo padrão. Sempre atualize o [índice](docs/README.md) ao criar arquivo novo.

Nada de documentação solta na raiz, nem espalhada perto do código. As únicas exceções na raiz são `README.md` e este `CLAUDE.md`.

### O que cada camada pode afirmar

> **`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa · o código está em vigor.**

**ADR não descreve o sistema, descreve escolhas.** A posição atual sobre uma *decisão* é a cadeia de
ADR lida até o fim; a posição atual sobre *comportamento* é o código. É por isso que o §Estado atual
deste arquivo existe: **ele é a projeção**, e nada mais é.

As sete regras — o desenho está na [`docs/features/025-docs-contract/`](docs/features/025-docs-contract/prd.md):

1. **O número da feature é ordem de leitura, não prioridade.** Três dígitos, ordem de merge do git,
   atribuído na criação e **nunca renumerado** depois de ter referência de fora. Lacuna é permitida;
   colisão entre worktrees se resolve renumerando a que mergeou depois.
2. **Precedência mora em `docs/adr/`.** PRD não é fonte de verdade.
3. **ADR existe se passa nos três testes, todos:** difícil de reverter · surpreendente sem contexto ·
   produto de um trade-off real. Falha um e é uma nota na PRD. *Se você não sabe nomear uma
   alternativa real, provavelmente não é ADR.*
4. **ADR não se reverte em parte.** Se só parte mudou, o ADR novo **reafirma o que fica**. Nota de
   PRD nunca derruba ADR sozinha — se ela precisa disso, o que falta é um ADR.
5. **Estado se deriva, não se escreve.** ADR superado ⇔ outro o nomeia em `supersedes`; **não existe
   campo `status:`** e nenhum ADR é editado depois de escrito. PRD proposta ⇔ não tem `tasks.md`, e
   `tasks.md` **não nasce vazio**.
6. **A nota no requisito contradito fica** — no requisito, com âncora para quem contradiz, e
   **delimitando o que sobrou de pé**. *Decisão revertida sem registro é decisão que volta sozinha.*
7. **Sem índice gerado.** A pasta é o índice e o frontmatter é o resumo. Antes de propor ou mudar
   arquitetura, liste `docs/adr/` e leia o frontmatter do que parecer relevante — **uma decisão lá
   vale mais que o seu instinto**, e contradizê-la em silêncio é o defeito, não a discordância.

O `**Status:**` de uma PRD tem gramática fechada, e o `gate:full` compara com o disco:

```
**Status:** proposta | em execução | completa | superada por <link do ADR>
```

## Convenções

- Documentação e comunicação em português. Código, commit e nome de arquivo em inglês.
- **Caminho da aplicação em inglês** — `home`, `tasks` —, e ele está do lado do **código**, não do da
  comunicação: um caminho é identificador, como nome de arquivo e nome de variável. O rótulo
  `Tarefas` se traduz; para onde ele aponta, não. A alternativa é caminho localizado (`/tarefas` em
  pt, `/tasks` em en) e ela custa o que parece ganhar — o mesmo lugar com dois endereços, e um link
  colado no chat que abre errado para quem está no outro idioma. **Custa zero adotar agora:** o
  aplicativo não tem rota nenhuma (só o `/styleguide`, e só em DEV), então não há o que migrar; o
  dia em que houver, cada rota publicada é um link que alguém guardou. Decidido em **2026-09-14**, e
  **não virou ADR de propósito** — ele extende a linha acima em vez de contradizê-la, e hoje falha o
  teste de *"difícil de reverter"*. Quando o produto ganhar URL de verdade, aí passa.
- Nome de arquivo em kebab-case.
- **Escreva por extenso, e não abreviado.** Uma abreviação que economiza cinco letras custa uma
  releitura inteira no dia em que duas coisas diferentes ficam com a mesma cara. A
  [`028`](docs/features/028-autonomous-orchestration/prd.md) produziu o caso: o §6 numerava as partes
  do escopo como `F1..F6` e o `tasks.md` numerava as etapas de construção como `Fase 0..4` — nada em
  lugar nenhum dizia que eram **coisas diferentes**, e `F3` contra `fase 3` é indistinguível em voz
  alta. Escreva **Parte 3 — Orçamento e limites** e **Fase 3 — a tela**; o documento fica mais
  comprido e para de exigir que quem lê adivinhe.
- **Numeração diferente pede nome diferente.** Se um documento numera duas coisas, as duas precisam de
  substantivos distintos — *parte* e *fase*, não `F` e `Fase`. E quem cita de fora cita pelo nome
  inteiro.
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](docs/project/questions.md) se for do projeto todo.
- Ideia que ficou pra depois não vira memória de conversa: vai pro [backlog](docs/project/backlog.md), com uma frase de contexto, de onde veio, e o gatilho que traz de volta.
- Discussão grande demais pra caber numa pergunta vira arquivo próprio em `docs/project/`, e a pergunta linka pra ele — como a [PTY × ACP](docs/project/pty-vs-acp.md) fez. Quando ela **decide** algo difícil de reverter, o arquivo é o estudo e a decisão vira um [ADR](docs/adr/).
