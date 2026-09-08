# Primeiro acesso — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Estado:** 17 perguntas · **0 respondidas pelo Vinicius · 17 implementadas como propostas**

> **Implementado em 2026-08-20, seguindo todas as 17 propostas.** As perguntas ficam **abertas** de
> propósito: proposta seguida não é pergunta respondida, e cada uma destas é reversível — o que a
> implementação fez está marcado embaixo da proposta, com o que ela custou. Discordar de qualquer uma
> ainda é barato; o `**R:**` continua vazio esperando.
>
> Duas propostas a implementação **corrigiu** pelo caminho, e as correções estão registradas nas
> perguntas: a **O4** (o `~/.lumem` do desenho descreve uma máquina que não existe) e a formatação do
> disco, que ficou no servidor e não na tela ([T6](tasks.md)).

**Rodada 1 (2026-08-20):** todas nasceram de comparar as nove telas do
`lumem-onboarding-flow.html` com o que o código faz hoje. **Três** delas — **O5**, **O10** e **O15** —
são divergências do [§4 do PRD](prd.md), e nelas a pergunta não é "o que fazer": é "confirma que o
produto ganha e o desenho é corrigido no Open Design?".

As outras duas divergências do §4 **não são pergunta**: o nome do pacote do adaptador é fato medido, e
`⌘⏎` versus `⏎` é comportamento já decidido e já implementado. Nelas não falta decisão — falta corrigir
o desenho no Open Design, e isso é task.

**Como usar:** responda embaixo, no `**R:**`. Cada pergunta traz uma **proposta pra reagir** —
discordar dela é mais rápido que escrever do zero. Prefixo `O` de onboarding, para não colidir com as
`A1–A16` da [acp-sessions](../acp-sessions/open-questions.md) nem com as `Q` da
[workspace-memory](../workspace-memory/open-questions.md).

---

## A. Quando o fluxo existe

### [ ] O1 — O que faz o fluxo aparecer, e o que faz ele parar de aparecer?

Hoje é `workspaces.length === 0` que troca o app pelo `FirstRun`.
O fluxo tem nove telas e cinco passos, e a pergunta é se "já passei por isso" precisa ser um fato
gravado.

**Proposta pra reagir:** **derivado, sem estado novo.** Sem workspace → fluxo. Com workspace → app. A
tela 9 tem um botão que traz o fluxo de volta, e ele é estado de componente, não de disco.

O custo, nomeado: quem apagar o `~/.lumem` vê o fluxo outra vez. Isso é **certo** — a máquina voltou a
ser uma máquina vazia. E a alternativa (uma tabela `settings` com uma flag) tem uma falha pior: a flag
diz "concluído" enquanto o banco não tem agente ACP nenhum, e a pessoa fica sem fluxo e sem agente.


**Implementado como proposto (2026-08-20).** `setupOpen` no `App`: `null` até a lista de workspaces responder, e decidido **uma vez** — derivar a cada render desmontaria o fluxo dois passos antes do fim, porque ele cria o workspace no passo 3.
**R:**

### [ ] O2 — Cada passo é saltável?

Um fluxo obrigatório de cinco passos é o que faz gente fechar a aba. Um fluxo saltável pode deixar a
pessoa dentro do app sem nada configurado.

**Proposta pra reagir:** **saltável, menos o workspace.** Sem workspace não existe app (BEHAVIOUR §6),
então esse é o único bloqueante. Pular o agente é legítimo: o Lumem roda com sessão de shell, e a
conversa passa a ser algo que se liga depois no rodapé da sidebar.

Pré-voo com `fail` **não** bloqueia: ele avisa. `git` 2.29 é um problema que aparece na primeira
worktree, com a frase certa — e ninguém deve ficar preso numa tela de boas-vindas por causa disso.


**Implementado como proposto (2026-08-20).** Todo passo tem "pular este passo" menos o workspace. `fail` no pré-voo avisa e não bloqueia.
**R:**

### [ ] O3 — O fluxo é rota, modal ou galho do `App`?

O repositório não tem roteador. O único caminho por URL é o `/styleguide`, e ele é só em `DEV`
([`main.tsx`](../../../packages/web/src/main.tsx)).

**Proposta pra reagir:** **galho do `App`**, exatamente onde o `FirstRun` está hoje. Sem roteador novo,
sem modal (o `FEATURES.md` do Open Design diz "sem modal", e um fluxo de nove telas dentro de um modal
seria a maior violação possível dessa regra).

O que se perde: não dá para linkar um passo. Ninguém pediu, e o dia em que pedir é o dia de discutir
roteador para o app inteiro, não para uma tela.


**Implementado como proposto (2026-08-20).** Galho do `App`, no lugar exato onde o `FirstRun` estava. O `FirstRun` foi **apagado** — dois caminhos para criar workspace seria um deles pulando os outros quatro passos.
**R:**

---

## B. A máquina

### [ ] O4 — O pré-voo cria `~/.lumem`, ou só relata que ele não existe?

A tela 2 mostra `~/.lumem` como `warn` — "a pasta ainda não existe — será criada no passo 3". Mas o
daemon **já cria** o `stateDir` no boot, porque é onde o banco vive.

**Proposta pra reagir:** o desenho está descrevendo uma máquina que não existe. Quando a tela 2 é
desenhada, o daemon **já subiu** e o `~/.lumem` **já tem** `lumem.db`. Então a linha vira `ok`, com o
que tem dentro — e o passo 5 continua dizendo o que ele **passou a ter**.

Regra geral que isso estabelece: **o pré-voo não escreve nada.** Ele lê, inclusive a permissão de
escrita (com `access`, não com um arquivo de teste).


**Implementado como proposto (2026-08-20).** A proposta foi seguida e o desenho corrigido: a linha do `~/.lumem` reporta o que a pasta tem dentro, e o passo 3 diz o que ela passou a ter.
**R:**

### [ ] O5 — A autenticação é escolha ou é fato relatado?

O desenho oferece duas opções com marcador de rádio. O spike mediu `authMethods: []` e um `session/new`
bem-sucedido: **o adaptador usou a credencial local e não perguntou nada**.

**Proposta pra reagir:** **fato relatado, não escolha.** A tela mostra o que a sonda achou:

- `authMethods: []` + `session/new` ok → *"credencial local do Claude, válida"*
- `ANTHROPIC_API_KEY` no ambiente do daemon → *"chave de API, lida do ambiente do daemon"*
- o adaptador exigiu um método → o nome do método e o comando que resolve

Um marcador de rádio que não muda comportamento é pior que nenhum: ele ensina uma coisa falsa sobre
quem manda na autenticação.


**Implementado como proposto (2026-08-20).** A tela 3 relata `ANTHROPIC_API_KEY` presente ou ausente, e a tela 4 relata `authMethods`. Nenhum rádio.

**Revisto no mesmo dia, e a proposta perde metade da razão.** A [agent-login §2.1](../agent-login/prd.md)
mediu que `authMethods` vinha vazio porque o Lumem não declarava `clientCapabilities.auth.terminal` —
não porque o adaptador não tivesse o que oferecer. Com a capacidade declarada ele oferece **dois**
métodos, e aí existe escolha de verdade: com qual conta entrar. O relato continua certo para o passo 3
do fluxo (ali ainda não há handshake); a escolha existe, e mora no painel de login.
**R:**

### [ ] O6 — "Instalar agora" existe?

O desenho tem o botão, ao lado do comando copiável.

**Proposta pra reagir:** **não existe na v1.** O daemon roda como a pessoa, `npm i -g` pode exigir
`sudo`, o `npm` pode não ser o gerenciador dela, e não há onde a saída de um install de dois minutos
aparecer — sessão precisa de escopo (`project` ou `worktree`) e no passo 3 não existe nenhum dos dois.

Acima disso: um daemon local que instala software global porque um navegador clicou é procurador
confuso de manual. A tela entrega o comando **selecionável** e o botão *"já instalei — verificar"*,
que é a regra de erro que o projeto já segue: falha de domínio é frase, e quando existe conserto o
comando vem junto, selecionável — porque o conserto acontece num terminal, não ali.


**Implementado como proposto (2026-08-20).** Sem botão de instalar em lugar nenhum. `CopyCommand` mais "Já instalei — verificar".
**R:**

### [ ] O7 — A versão do binário vem de onde?

Duas fontes possíveis: rodar `<binário> --version`, ou o `agentInfo.version` que o `initialize`
devolve.

**Proposta pra reagir:** **as duas, para coisas diferentes.**

- `claude --version` → a linha "o que foi encontrado na sua máquina" da tela 3. É informativa.
- `agentInfo.version` da sonda → **a versão pinada** que vai para `agent_config.adapter_version`.

E a regra: **versão não lida não é falha**. Timeout de 3s, e a linha diz "encontrado, versão não lida".
O que decide o passo é a sonda.


**Implementado como proposto (2026-08-20).** `--version` com timeout de 3s na tela 3; `agentInfo.version` da sonda no que é pinado. Versão não lida não é falha.
**R:**

---

## C. A sonda

### [ ] O8 — A sonda cria sessão?

`AcpManager.spawn` não depende do banco — ele gera o próprio id e devolve `AcpSessionInfo`. Mas o
`SessionStore` é quem normalmente o chama, e ele grava.

**Proposta pra reagir:** **a sonda não cria linha em `session`.** Ela chama o `AcpManager` direto, com
`cwd` em `~/.lumem/probe`, e mata o processo no fim — inclusive quando o `session/new` falha.

Consequência que vale escrever: a sonda **não gasta token**. Não há `session/prompt` no caminho, e o
spike já mediu que `initialize` + `session/new` custam zero. A tela pode afirmar isso.


**Implementado como proposto (2026-08-20).** `AcpManager.probe`, com `Session.probe` marcando a sessão para os exit watchers não serem avisados — não há linha para eles atualizarem. Teste de mutação: tirar o `kill` do `finally` derruba a suíte.
**R:**

### [ ] O9 — A "troca, sem tradução" é log de fio ou reconstrução?

A tela 4 mostra cinco linhas de JSON-RPC com seta de direção. O daemon não guarda o fio.

**Proposta pra reagir:** **reconstrução, rotulada.** A sonda devolve dados tipados e a tela desenha as
linhas a partir deles. Um log de fio de verdade exigiria interceptar o transporte do SDK, e o valor
disso — para uma tela que roda uma vez — não paga.

O rótulo importa: a tela diz **"o que o daemon mandou e o que voltou"**, não "log". Ferramenta de dev
que mostra JSON inventado como se fosse captura perde a confiança de uma vez.


**Implementado como proposto (2026-08-20).** Reconstrução, e a seção se chama **"o que o daemon mandou e o que voltou"**.
**R:**

---

## D. Workspace, projeto, tarefa

### [ ] O10 — `escolher…` sai do desenho?

Três telas prometem seletor de diretório. Ele não pode existir: o daemon pode estar em outra máquina, e
o `<input type=file>` entrega arquivo, não caminho de servidor (BEHAVIOUR §6).

**Proposta pra reagir:** **sai.** Caminho absoluto digitado, como o `AddProjectDialog` já faz. O
`field__help` ganha o que ajuda de verdade: o daemon **valida na hora** e diz qual das quatro
verificações falhou.


**Implementado como proposto (2026-08-20).** Sufixo fora do desenho (T0) e um teste que verifica que não existe `input[type=file]` na tela.
**R:**

### [ ] O11 — Onde as worktrees ficam é editável no passo 5?

Hoje é `LUMEM_STATE_DIR` — variável de ambiente do daemon, global, sem coluna nenhuma.

**Proposta pra reagir:** **leitura na v1**, com a variável de ambiente nomeada ao lado. Campo editável
significa coluna nova (em `workspace`?), migração, e a pergunta "e as worktrees que já existem no
caminho antigo?" — que é uma feature de mudança de estado, não um input.


**Implementado como proposto (2026-08-20).** Campo de leitura com `LUMEM_STATE_DIR` nomeado ao lado. O caminho vem do `preflight.paths`.
**R:**

### [ ] O12 — `project.inspect` é query separada ou o `add` devolve o que leu?

O `add` já faz duas leituras (`isGitRepo`, `resolveDefaultBranch`) antes de gravar.

**Proposta pra reagir:** **query separada.** A tela precisa mostrar o que leu **antes** de existir
registro — é isso que o desenho chama de *"o que o Lumem leu daí"*. Fazer o `add` devolver mais coisa
resolveria a leitura depois da escrita, que é a ordem errada.

E `inspect` serve a mais de uma tela: ela é o "por que este projeto está estranho?" de qualquer dia.


**Implementado como proposto (2026-08-20).** `project.inspect`, query. Oito testes de integração contra git de verdade.
**R:**

### [ ] O13 — Vale mostrar o comando `git` que vai rodar?

A tela 7 mostra `git worktree add -b primeira-tarefa …/primeira-tarefa main` na prévia.

**Proposta pra reagir:** **vale, e é uma das melhores coisas do desenho.** É ferramenta de dev: mostrar
o comando faz a pessoa entender o modelo em um segundo, e torna a tela auditável — se o resultado
surpreender, o comando estava na tela.

Custo: o texto tem que ser o comando **de verdade**, montado no daemon pelo mesmo lugar que o executa.
Uma segunda montagem no cliente seria uma frase que mente na primeira mudança de flag.


**Implementado como proposto (2026-08-20).** `worktree.plan` devolve o comando, montado no router que executa. A prévia também recusa antes: branch tomada e pasta ocupada.
**R:**

### [ ] O14 — O padrão de modelo e modo das próximas sessões é guardado?

A tela 4 tem seletor de `opus[1m] · sonnet · haiku` e de `Auto · Plano · Sem perguntar`, sob o título
"padrão das próximas sessões".

**Proposta pra reagir:** **fora da v1.** Não existe onde guardar: nem `agent_config` nem `workspace`
têm a coluna, e criar uma para atender um seletor de tela é a ordem invertida — o dado nasce da
necessidade, não do desenho. A conversa já escolhe modelo e modo **por sessão**, e o agente é a
autoridade sobre a lista.

Os dois seletores saem do desenho da tela 4, ou viram leitura ("as sessões nascem no modo `Auto`").


**Implementado como proposto (2026-08-20).** Fora. A tela 4 mostra em leitura como as próximas sessões nascem, e os seletores saíram do desenho.
**R:**

---

## E. A conversa e o fim

### [ ] O15 — Os atalhos que a tela 9 promete existem?

Ela lista quatro. Existe um: `⌘⏎`.

**Proposta pra reagir:** a tela lista **só o que existe**, e os três outros vão para o
[backlog](../../project/backlog.md). Tela de boas-vindas que ensina atalho inexistente é a pior lição
possível — a primeira coisa que a pessoa tenta não funciona, e a segunda ela não tenta.

Se a lista de um item ficar pobre, o lugar tem melhor uso: **onde as coisas ficam** (a sidebar, o
rodapé, o painel direito), que é o que a pessoa vai procurar em seguida.


**Implementado como proposto (2026-08-20).** A tela 9 lista `⌘⏎` e mais três linhas de **onde as coisas ficam**. Um teste verifica que `⌘K`, `⌘⇧N` e `⌥⇧P` não aparecem.
**R:**

### [ ] O16 — O balão de ensino da primeira permissão: onde vive o "não mostrar de novo"?

**Proposta pra reagir:** `localStorage`, como o [`useRightPanel`](../../../packages/web/src/hooks/useRightPanel.ts)
e o [`useTreeExpansion`](../../../packages/web/src/hooks/useTreeExpansion.ts) já fazem. É preferência de
tela; o daemon não tem opinião sobre o que essa pessoa já leu.

Gatilho para mudar: no dia em que existir mais de um cliente para o mesmo daemon, isso vira preferência
de servidor — e aí é a mesma discussão de todas as outras três chaves que já estão no `localStorage`.


**Implementado como proposto (2026-08-20).** `useFirstPermissionCoach`, com o mesmo cuidado do `useActiveWorkspace` para storage desligado. Uma vez por **máquina**, não por sessão.
**R:**

### [ ] O17 — O grupo `Externas` da sidebar (tela 8) entra?

A tela 8 desenha um grupo `Externas` com uma worktree marcada *"fora do Lumem"* — e a tela 6 já
detectou que ela existe.

**Proposta pra reagir:** **não entra.** A tela 8 é o produto, e esta feature não a redesenha. Detectar
no passo 6 é honesto e barato (`git worktree list` já é chamado); **listar** na sidebar é feature de
sidebar, com reconciliação, estado e ciclo de vida próprios.

Vai para o [backlog](../../project/backlog.md) com o gatilho: quando alguém perder tempo procurando
onde foi uma worktree que criou fora do Lumem.


**Implementado como proposto (2026-08-20).** Fora. O passo 6 detecta e avisa; a sidebar não mudou.
**R:**
