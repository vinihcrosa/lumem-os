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
| `pnpm gate:quick` | testes afetados pelo trabalho atual |
| `pnpm gate:full` | suíte inteira + e2e |
| `pnpm gate:build` | typecheck de tudo + build |
| `pnpm adapters:check` | pergunta ao npm se o pino de cada adaptador ACP envelheceu — e se o **runtime que ele embute** envelheceu, que é o que quebra turno. Sem rede, passa |
| `pnpm smoke:install` | empacota o `lumem`, instala num prefixo descartável e sobe — a prova de que o pacote publicado presta |
| `pnpm version:set <x.y.z>` | escreve a versão nos três lugares que têm que concordar |

Antes de dizer que uma task está pronta, rode o gate que ela declara. Detalhes em [docs/project/testing.md](docs/project/testing.md).

## Regra de design

> **O design é feito no Open Design, não aqui.** A decisão está em
> [`docs/adr/2026-08-19-2247-design-is-made-in-open-design.md`](docs/adr/2026-08-19-2247-design-is-made-in-open-design.md),
> e o estudo que a sustenta — com o custo nomeado — em
> [design-source-of-truth.md](docs/project/design-source-of-truth.md).

O projeto `lumem-os` do Open Design é a fonte. Deste lado, três arquivos são **cópia ou derivado** e
nenhum deles se edita à mão:

| Arquivo | O quê |
|---|---|
| `packages/web/src/styles/tokens.css` | cópia do Open Design |
| `packages/web/src/styles/tokens.ts` | **derivado** do `tokens.css` — o `xterm`, o CodeMirror e o Shiki precisam do hexadecimal em JavaScript |
| `packages/web/prototype/*.html` e `*.css` | cópia do Open Design, uma tela por arquivo |

`pnpm --filter @lumem/web design:sync` traz tudo e re-deriva. O `--check` diz se divergiu, sem
escrever nada.

Componente em React só usa `var(--token)`: nenhum literal de cor, de espaço ou de tipografia. É isso
que faz tela desenhada lá ser implementável aqui sem tradução. Token novo nasce no Open Design — e o
`gate:quick` confere os 119 pares de contraste, então cor escolhida à mão que reprova falha a suíte com
o nome da combinação de tela que quebrou.

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
