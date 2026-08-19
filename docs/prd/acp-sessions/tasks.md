# A sessão vira conversa (ACP) — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 14 de 14 respondidas
**Decisão de transporte:** [pty-vs-acp.md](../../project/pty-vs-acp.md) — **TA1–TA6** fechadas lá
**Protótipo:** `packages/web/prototype/lumem-acp-conversation.html` — desenho fechado e verificado; as tasks de cliente **portam** o que está lá, não redesenham
**Sucede:** [file-editor](../file-editor/tasks.md)
**Destrava:** [workspace-memory](../workspace-memory/roadmap.md) partes 06–09
**Status:** fases 1, 3 e 4 **concluídas** (26 de 26). **Fase 5 em execução — 0 de 6.**
**Total:** 32 tasks nas fases 1, 3, 4 e 5 do PRD

> **Já entregue com o desenho, e nenhuma task recria:** o bloco `dominio — conversa` do gerador de
> tokens (turno, estado de ferramenta, permissão, plano, uso, modo), mais `tool/cancelled` e
> `syntax/comment-diff`. São 99 pares de contraste validados. **Nenhuma task escreve `tokens.css` à
> mão** — quem precisar de token novo edita `packages/web/scripts/generate-tokens.py` e regera.

---

## A dependência que o PRD não deixa explícita

A **fase 3** do PRD tem como `Done when` "uma tarefa real roda do começo ao fim sem terminal". Isso é
impossível sem a **fase 1**: os componentes de React renderizam evento tipado, e é a fase 1 que faz
evento tipado existir. Então a ordem aqui é **1 antes de 3**, sem paralelismo entre elas — com uma
exceção deliberada, a **T1**.

A **T1** é o contrato em `packages/shared`. Ela é a primeira task da fase 1 e, ao mesmo tempo, a única
coisa de que a fase 3 precisa para começar. Depois que ela existe, cliente e servidor podem andar em
paralelo contra o mesmo `zod` — que é exatamente o que `pty-protocol.ts` já provou funcionar.

---

## Ordem, e por quê ela é essa

**Contrato antes de tudo.** O `pty-protocol.ts` mostrou o porquê: um frame de websocket chega como
string opaca, e o único lugar onde os dois lados podem concordar byte a byte é `shared`. Contrato
depois de implementação vira contrato que descreve o que já foi escrito.

**Banco antes de processo.** `transport` é coluna, e a migração que escreve `'pty'` em toda
configuração existente ([A11](open-questions.md)) tem que rodar antes de existir qualquer caminho que
leia a coluna — senão a primeira leitura acha `NULL` e o comportamento passa a depender da ordem em que
o boot aconteceu.

**Agente falso antes de agente real.** Todo o transporte é testável com um agente de mentira do outro
lado do pipe (§8 do PRD). O único teste que precisa de processo de verdade é o handshake, e ele fica
marcado e por último na fase — como o `git` real que a `right-panel` já usa.

**Permissão antes do resto da tela.** Sem o diálogo, o agente espera para sempre. E com o default
`auto` ([A9](open-questions.md)) ele é acionado pouco, o que torna esse o caminho mais fácil de quebrar
em silêncio. Ele nasce com teste próprio.

**O roteamento por `transport` por último.** É a task que troca o que o usuário vê. Ela só entra quando
os dois lados estão verdes, porque é a única cuja regressão apaga a tela que funcionava.

---

## Decisões que sustentam o resto

Detalhadas em [open-questions.md](open-questions.md) e em [pty-vs-acp.md](../../project/pty-vs-acp.md);
aqui só o que a implementação precisa ter na mão.

### D1 — `transport` é escolhido no nascimento da sessão e nunca muda

Coluna em `agent_config` (o que a configuração pede) **e** em `session` (o que aquela sessão de fato
é). Denormalizado de propósito: a reconciliação de boot precisa saber o que religar sem ir buscar a
configuração, que pode ter mudado desde então. Trocar de transporte é abrir sessão nova.

### D2 — O stream é `/acp`, não `/pty` com união de mensagens

F1.5 diz que o **mecanismo** de attach/detach é o mesmo — mesmo parâmetro de sessão, mesmo código de
fechamento 4404, mesmo replay no primeiro frame. As **mensagens** não têm nada em comum, e um endpoint
que serve as duas obriga todo cliente a discriminar antes de saber o que tem em mãos.

### D3 — Evento não reconhecido decodifica, não estoura

O protocolo evolui e a v2 é rascunho. `session/update` com variante desconhecida vira
`{ type: "unknown", method }` — visível em cinza na conversa, registrado no log do daemon. Nenhum
caminho lança por causa de um campo novo.

### D4 — Cinco estados de cartão, não quatro

`pendente`, `rodando`, `ok`, `falhou`, `interrompido` ([A14](open-questions.md)). O quinto é neutro:
`session/cancel` não produz cartão vermelho.

### D5 — Texto do agente vai verbatim

`description` de `configOptions`, nome de modo, lista de comandos de barra: em inglês, como veio
([A13](open-questions.md)). O que a tela inventa continua em português.

### D6 — A fase 3 entrega mensagem + ferramenta + permissão, e só

Plano, uso, modos, modelos, comandos de barra e terminal embutido são **fase 4**
([A2](open-questions.md)). O protótipo desenha todos; portar todos agora é fase 3 que não fecha.

---

## Fase 1 — Transporte

**Done when da fase:** uma sessão ACP roda, responde, e os eventos chegam ao cliente — verificável por
teste, não por olho. Nenhuma tela nova.

#### T1: O contrato do stream tipado

**What**: O protocolo entre a conversa no navegador e o endpoint ACP do daemon, em `zod`, com decode
que devolve resultado em vez de lançar.
**Where**: `packages/shared/src/acp-protocol.ts` + teste, `packages/shared/src/index.ts`
**Depends on**: nada

**Done when**:
- [x] `ACP_WS_PATH`, `ACP_SESSION_PARAM` e `ACP_CLOSE_SESSION_NOT_FOUND` (4404) definidos, espelhando `pty-protocol.ts`
- [x] Mensagens do daemon: `attached`, `message_chunk`, `thought_chunk`, `tool_call`, `tool_call_update`, `permission_request`, `permission_resolved`, `turn_end`, `error`, `unknown`
- [x] Mensagens do cliente: `prompt`, `cancel`, `permission_response`
- [x] `attached` carrega o replay da transcrição, como `snapshot` carrega o scrollback do PTY — o cliente repinta e só então aplica evento novo
- [x] Estado do cartão é união fechada de **cinco** valores nossos — `pending`, `running`, `ok`, `failed`, `cancelled` (D4). O ACP só tem quatro (`pending`, `in_progress`, `completed`, `failed`) e **nenhum** deles é `cancelled`: o quinto é nossa tradução, e a tabela mora no comentário do schema. Um sexto valor é recusado na decodificação
- [x] `decodeAcpServerMessage` / `decodeAcpClientMessage` devolvem `{ ok: false, error }` com o caminho do campo, nunca lançam
- [x] Existe a variante `unknown` (D3) e ela decodifica; o **tradutor** de `session/update` para essa variante é da T4, porque só o daemon vê ACP cru — o navegador nunca vê
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 casos — JSON inválido, tipo desconhecido, estado inválido de cartão, `unknown` aceito, ida e volta de cada direção

**Tests**: unit · **Gate**: quick
**Commit**: `feat(shared): type the ACP conversation wire protocol`

---

#### T2: `transport` em `agent_config`

**What**: A coluna, o `CHECK`, e a migração que escreve `'pty'` em tudo que já existe.
**Where**: `packages/server/src/db/schema.ts`, migração, `repositories/agentConfig.ts` + teste
**Depends on**: nada

**Done when**:
- [x] `transport` com `CHECK (transport IN ('pty','acp'))` e default `'pty'`
- [x] Migração escreve `'pty'` em toda linha existente ([A11](open-questions.md)); teste parte de banco com linhas sem a coluna e prova que nenhuma fica `NULL`
- [x] Um terceiro valor é recusado pelo banco, não só pela aplicação
- [x] `adapterVersion` fixa na configuração, nunca `@latest` ([A12](open-questions.md), F5.5) — coluna própria, obrigatória quando `transport = 'acp'`
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4 — migração de linha legada, `CHECK` de valor inválido, `acp` sem versão recusado, `pty` sem versão aceito

**Tests**: unit, com SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): make transport a column on agent_config`

---

#### T3: A sessão sabe o que ela é

**What**: `session` ganha `transport`, `acpSessionId`, `mode` e `model` (F1.3), com as invariantes no banco.
**Where**: `packages/server/src/db/schema.ts`, migração, `repositories/session.ts` + teste
**Depends on**: T2

**Done when**:
- [x] As quatro colunas existem; `transport` com o mesmo `CHECK` e default `'pty'`
- [x] `CHECK`: `transport = 'acp'` ⇒ `acp_session_id` não nulo; `transport = 'pty'` ⇒ nulo (D1)
- [x] Sessão de shell é sempre `'pty'`, garantido por `CHECK` (F1.2)
- [x] Migração escreve `'pty'` em toda sessão existente sem tocar em processo vivo
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4 — as duas direções do `CHECK`, shell forçado a `pty`, migração de linha legada

**Tests**: unit, com SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): record transport and ACP session on session rows`

---

#### T4: `AcpManager` — o irmão do `PtyManager`

**What**: Lançar o adaptador, fazer o framing JSON-RPC pelo `@agentclientprotocol/sdk`, e ser dono do ciclo de vida.
**Where**: `packages/server/src/acp/AcpManager.ts` + teste, `packages/server/src/acp/fake-agent.ts` (fixture)
**Depends on**: T1

**Done when**:
- [x] `spawn` levanta o subprocesso, faz `initialize` e `session/new`, e devolve `acpSessionId`, modos e modelos disponíveis
- [x] `prompt`, `cancel` e `respondToPermission` implementados
- [x] `onEvent(id, listener)` emite a união do T1, não o payload cru do protocolo — a tradução mora aqui
- [x] Agente falso do outro lado do pipe: um script que fala JSON-RPC e nada mais. **Nenhum teste desta task consome token**
- [x] O subprocesso é do daemon e sobrevive ao cliente (F1.4), provado por teste que fecha o listener e continua recebendo evento
- [x] `session/update` desconhecido virou `unknown` e foi logado; a sessão continua viva (D3) — **o tradutor de ACP para a união da T1 mora aqui**, com a tabela de estado e a derivação do quinto estado a partir de `stopReason: cancelled`
- [x] Cartão ainda `pending` ou `running` quando o turno fecha com `stopReason: cancelled` passa a `cancelled`, não a `failed` (D4) — o ACP não tem esse estado, então é a única fonte dele
- [x] `killAll` com timeout, como o `PtyManager` já faz
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 10 — handshake, prompt→chunks, tool_call→update, permissão pedida e respondida, cancel, evento desconhecido, morte do subprocesso, sobrevivência ao detach

**Tests**: unit/integration com agente falso · **Gate**: quick
**Commit**: `feat(server): drive an ACP agent over JSON-RPC`

---

#### T5: Falha de lançamento é resposta de domínio

**What**: Adaptador ausente ou versão errada vira erro nomeado, com o comando que resolve — nunca stack trace (F1.6).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/agents/availability.ts`, `errors.ts` + teste
**Depends on**: T4

**Done when**:
- [x] `isCommandAvailable` é reusado; nenhuma checagem nova de PATH é escrita
- [x] Erro carrega a versão fixada e a linha de `npm i -g` correspondente, montada a partir de `adapterVersion` — não hard-coded
- [x] Handshake que falha ou dá timeout também vira erro de domínio, não `unhandledRejection`
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 3 — comando ausente, handshake que nunca responde, `protocolVersion` incompatível

**Tests**: unit · **Gate**: quick
**Commit**: `feat(server): report ACP launch failure as a domain error`

---

#### T6: O endpoint `/acp`

**What**: Attach, detach e replay pelo mesmo mecanismo do `/pty`, com mensagem tipada em vez de bytes (F1.5, D2).
**Where**: `packages/server/src/acp/websocket.ts` + teste, `server.ts`
**Depends on**: T1, T4

**Done when**:
- [x] Attach responde `attached` como primeiro frame, com a transcrição inteira para replay
- [x] Sessão inexistente fecha com 4404, como o `/pty` faz
- [x] Dois clientes na mesma sessão recebem os mesmos eventos
- [x] Detach não mata o subprocesso
- [x] Frame inválido do cliente responde `error` com código e **mantém a conexão aberta** — a mesma política do PTY
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 6 — replay, 4404, dois clientes, detach, frame inválido, prompt chegando ao agente falso

**Tests**: integration, websocket de verdade · **Gate**: quick
**Commit**: `feat(server): serve the ACP event stream over a websocket`

---

#### T7: `SessionStore` e o boot aprendem os dois transportes

**What**: `start`/`close` roteiam por `transport`, e a reconciliação de boot cobre ACP como já cobre PTY (F5.3).
**Where**: `packages/server/src/sessions/SessionStore.ts`, `boot/reconcile.ts`, `routers/session.ts` + testes
**Depends on**: T3, T4

**Done when**:
- [x] `start` lê o `transport` do `agent_config`, grava na sessão, e chama o manager certo
- [x] Sessão de shell nunca chega ao `AcpManager`
- [x] `trackExits` cobre as duas origens; sessão ACP que morre vira `exited` com `exitCode`
- [x] Reconciliação de boot marca sessão ACP órfã como `exited`, igual PTY, e não tenta religar
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 6 — roteamento por transporte, shell forçado a PTY, saída rastreada nos dois, reconciliação órfã nos dois

**Tests**: unit/integration · **Gate**: quick
**Commit**: `feat(server): route session lifecycle by transport`

---

#### T8: O handshake contra o adaptador de verdade

**What**: Um teste marcado que sobe o `claude-agent-acp` instalado e prova que o `initialize` combina com o contrato do T1.
**Where**: `packages/server/src/acp/AcpManager.integration.test.ts`, `docs/project/testing.md`
**Depends on**: T4, T5

**Done when**:
- [x] Marcado e pulado quando o adaptador não está no PATH, como o teste de `git` real faz
- [x] Roda `initialize` + `session/new` + `session/close` e **nada mais** — zero token consumido, medido no spike
- [x] Falha se `protocolVersion`, `authMethods` ou a forma de `configOptions` divergirem do contrato — é o detector de quebra de versão do adaptador
- [x] `testing.md` ganha a linha do novo teste marcado e como rodá-lo
- [x] Gate: `pnpm gate:full`
- [x] Test count: 1 caso, e ele vale mais que dez falsos

**Tests**: integration marcado, processo real · **Gate**: full
**Commit**: `test(server): pin the ACP handshake against the real adapter`

---

## Fase 3 — A conversa em React

**Done when da fase:** uma tarefa real roda do começo ao fim sem terminal. Mensagem, ferramenta e
permissão — e só (D6).

#### C1: O modelo de vista da conversa

**What**: Reduzir o stream de eventos a um estado renderizável. Puro, sem React.
**Where**: `packages/web/src/lib/conversation-model.ts` + teste
**Depends on**: T1

**Done when**:
- [x] `reduce(state, event)` puro, sem `Date.now()` nem efeito
- [x] `message_chunk` e `thought_chunk` concatenam delta no turno corrente; chunk que chega sem turno aberto abre um
- [x] `tool_call_update` acha o cartão por id e muda estado, duração, delta e saída — update para id inexistente é ignorado com aviso, não estoura
- [x] `permission_request` marca a conversa como **bloqueada**, e `permission_resolved` converte o pedido no cartão da ferramenta com o veredito (o protótipo mostra isso)
- [x] `unknown` acumula numa lista visível; nunca lança
- [x] Replay de `attached` produz exatamente o mesmo estado que o stream incremental equivalente — **teste de equivalência**, porque é a garantia de que reabrir a aba não muda o que se vê
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 12 — cada tipo de evento, chunk órfão, update órfão, ordem fora de sequência, equivalência replay/incremental

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): reduce ACP events into a conversation view model`

---

#### C2: O socket da conversa

**What**: Conectar, decodificar, reconectar — espelho de `pty-socket.ts`.
**Where**: `packages/web/src/lib/acp-socket.ts` + teste
**Depends on**: T1

**Done when**:
- [x] `connectAcpSocket(sessionId, handlers)` com a mesma forma de `connectPtySocket`
- [x] Frame que não decodifica é reportado e descartado; a conexão não cai
- [x] Fechamento 4404 é distinguido de queda de rede
- [x] `send` recusa mensagem que não passa no schema **antes** de escrever no socket
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 5 — attach, frame inválido, 4404, queda de rede, envio inválido barrado

**Tests**: unit, com fake de WebSocket · **Gate**: quick
**Commit**: `feat(web): connect the browser to the ACP event stream`

---

#### C3: Mensagem e raciocínio

**What**: Os dois blocos de texto da conversa, com streaming e o raciocínio colapsado (F2.1, F2.2, A3).
**Where**: `packages/web/src/components/Message.tsx`, `Thought.tsx` + testes, `conversation.css`
**Depends on**: C1

**Done when**:
- [x] Turno do usuário e do agente com a medianiz de 20px do protótipo, e a marcação portada dele
- [x] Caret visível enquanto o turno não terminou, ausente depois
- [x] Raciocínio colapsado por padrão, com linha viva enquanto escreve, e expansível (A3)
- [x] Mensagem vazia não renderiza bloco vazio
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 6 — dois papéis, caret durante/depois, colapso, expansão, mensagem vazia

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): render agent messages and collapsed reasoning`

---

#### C4: O cartão de ferramenta

**What**: O elemento que substitui o texto rolando — cinco estados, cabeçalho sempre visível, corpo colapsado com teto (F2.3, A4, D4).
**Where**: `packages/web/src/components/ToolCard.tsx` + teste, `conversation.css`
**Depends on**: C1

**Done when**:
- [x] Os **cinco** estados renderizam, cada um com sua cor de token — nenhuma cor literal
- [x] Glifo por **categoria** (ler, escrever, executar, rede, delegar), nome da ferramenta em texto — não uma cor por ferramenta
- [x] Alvo trunca pelo diretório primeiro e pelo nome só depois. O componente é testado na estrutura — os dois `span` na ordem certa, com as classes de que o CSS depende. **A prova de que o nome não sobrepõe o chip a 360px não cabe aqui:** jsdom não faz layout, toda largura é zero. Ela é da C10, que roda em Chromium
- [x] Corpo colapsado com teto de altura, e a contagem do que ficou de fora é dita na tela ("mostrar as 2.387 linhas")
- [x] Diff de escrita renderizado pelo componente que a `right-panel` já tem (A4) — nenhum renderizador de patch novo
- [x] Saída sem ligadura de fonte: `!==` não pode virar `≠`
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 10 — cinco estados, cinco categorias, truncamento a 360px, colapso, contagem do resto, reuso do visualizador de patch

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): render tool calls as cards with five states`

---

#### C5: O diálogo de permissão

**What**: O único bloco que trava a sessão. Nasce com teste próprio (F2.4).
**Where**: `packages/web/src/components/PermissionRequest.tsx` + teste, `conversation.css`
**Depends on**: C1, C2

**Done when**:
- [x] Comando aparece **inteiro**, quebrando em vez de truncar — `rm -rf` cortado é `rm -rf` aprovado no escuro
- [x] `cwd` visível
- [x] Opções vêm do protocolo, com o texto verbatim (D5); uma só é primária, e a de negar permanente é destrutiva
- [x] `⏎` aceita a primária, `esc` nega uma vez; o foco cai no diálogo quando ele aparece
- [x] Enquanto pendente, o composer está desabilitado e diz por quê
- [x] Responder envia `permission_response` uma **única** vez; segundo clique é inerte
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — render, comando longo quebrando, teclado nas duas direções, foco, composer travado, duplo clique barrado, opções verbatim

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): ask for permission without stalling the session`

---

#### C6: O sinal fora da aba visível

**What**: Pedido de permissão numa aba que não está aberta marca a aba e conta na sidebar (F2.4, [A10](open-questions.md)).
**Where**: `packages/web/src/hooks/useWorktreeTabs.ts`, `components/SidebarTree.tsx`, `Tab.tsx` + testes
**Depends on**: C1

**Done when**:
- [x] Aba com pedido pendente ganha o marcador de `permission/pending`, distinto do ponto de `running`
- [x] A contagem na worktree usa o mesmo tom, e some quando o pedido é respondido
- [x] Abrir a aba não responde o pedido sozinho
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4 — marca aparece, contagem muda de tom, resposta limpa os dois, abrir não responde

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): flag a tab waiting on permission`

---

#### C7: A conversa montada, com o composer

**What**: Juntar os blocos, rolar, e mandar prompt. Sem plano, sem uso, sem seletor (D6).
**Where**: `packages/web/src/components/Conversation.tsx` + teste, `conversation.css`
**Depends on**: C3, C4, C5

**Done when**:
- [x] Composer manda com `⌘⏎`; vazio não manda
- [x] Botão de interromper aparece só com turno no ar, e manda `cancel`
- [x] Rola para o fim quando chega evento novo **e o usuário já estava no fim**; não arranca a rolagem de quem subiu para ler
- [x] Sessão nova mostra o estado vazio do protótipo, com o custo fixo de abrir a sessão dito na tela
- [x] Falha de lançamento (T5) aparece como o bloco de domínio do protótipo, com o comando que resolve
- [x] Evento desconhecido aparece em cinza e não derruba a aba (D3)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — envio, vazio barrado, interromper, rolagem nas duas situações, vazio, falha de lançamento, evento desconhecido

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): assemble the ACP conversation with its composer`

---

#### C8: O CSS da conversa

**What**: Portar o CSS do protótipo, inteiro, sem retoque de layout.
**Where**: `packages/web/src/components/conversation.css`
**Depends on**: C3, C4, C5, C7

**Done when**:
- [x] Nenhum valor literal de cor, espaçamento ou dimensão — só `var()`, exceto fio ótico de 1–2px
- [x] As classes vêm do protótipo com o mesmo nome; divergência é bug de porte, não escolha — **e existe teste que compara os dois arquivos**, porque jsdom não aplica folha de estilo e nenhum teste de componente vê regra faltando
- [x] Nada de CSS de fase 4: o que não tem markup hoje vem com o componente que o usará
- [x] `tokens.css` **não** é editado
- [x] Gate: `pnpm gate:quick`

**Tests**: coberto pelos testes de componente · **Gate**: quick
**Commit**: `feat(web): port the conversation stylesheet from the prototype`

---

#### C9: A aba escolhe conversa ou terminal

**What**: `SessionTabPanel` roteia por `transport`. É a task que troca o que o usuário vê.
**Where**: `packages/web/src/components/SessionTab.tsx`, `hooks/useWorktreeTabs.ts` + testes
**Depends on**: C7, T7

**Done when**:
- [x] `transport: 'acp'` monta `Conversation`; `'pty'` continua montando `Terminal`, sem mudança nenhuma
- [x] A conversa também fica **montada e escondida** quando outra aba está ativa — a mesma promessa que o terminal já faz, pelo mesmo motivo
- [x] Sessão de shell nunca monta conversa
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4 — cada transporte, shell, montada-e-escondida

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): pick conversation or terminal by session transport`

---

#### C10: O e2e da frase do PRD

**What**: Uma tarefa roda do começo ao fim sem terminal, contra o agente falso.
**Where**: `e2e/acp-conversation.spec.ts`, `docs/project/testing.md`
**Depends on**: C9, T8

**Done when**:
- [x] Contra o agente falso do T4, não contra o Claude — o e2e não consome token
- [x] **A medida que jsdom não faz:** com a conversa a 360px, o nome do arquivo não sobrepõe o chip de estado. É o bug que o protótipo pegou, e só um navegador de verdade responde
- [x] O caminho inteiro: abrir sessão ACP, mandar prompt, ver mensagem em streaming, ver cartão de ferramenta virar `ok`, responder um pedido de permissão, ver o turno fechar
- [x] Recarregar a página no meio replaya a transcrição e mostra o mesmo estado
- [x] `testing.md` ganha a linha da nova suíte
- [x] Gate: `pnpm gate:full`
- [x] Test count: ao menos 2 — o caminho inteiro, e o replay depois do recarregamento

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): run a real task through the conversation, no terminal`

---

## Fase 4 — Paridade funcional com o uso diário

**Done when da fase:** o que o protótipo desenha está na tela, o agente consegue pedir um terminal e
tocar arquivo pelo `FileService`, e a sessão troca de modo e de modelo. Nada de `session/load` — isso é
fase 5.

### Ordem, e por quê ela é essa

**A escrita em disco primeiro.** A `P1` é a única parte da fase que, se sair errada, sai **perigosa**:
`fs/write_text_file` é superfície nova de escrita, e com o default `auto` há menos confirmação humana no
caminho ([risco no §6](prd.md)). Ela vem antes de tudo, com o teste da guarda antes da primeira escrita
— a mesma regra que a `right-panel` seguiu.

**Depois o contrato,** pela lição da T1: contrato depois de implementação é contrato que descreve o que
já foi escrito.

**Depois o que só lê,** em ordem de custo: plano, uso, modos, comandos. Cada um traz **o seu bloco de
CSS** — o C8 não portou nenhum deles de propósito, e CSS sem markup é CSS morto.

**O terminal embutido por último dos de tela,** porque é onde os dois transportes se encontram e é a
única task da fase que mexe no `PtyManager`.

### Decisões que sustentam esta fase

#### D7 — O terminal do agente é uma sessão de PTY, e o cliente já sabe desenhar isso

`terminal/create` é o agente pedindo um shell ao **cliente**. O daemon atende com o `PtyManager` que já
existe (F3.2) — o que significa que o terminal tem um id de sessão de PTY, e o `xterm` embutido no cartão
se liga no `/pty?session=<id>` exatamente como qualquer terminal. **Nenhum caminho de streaming novo**, e
o componente `Terminal` entra sem modificação.

#### D8 — Troca de modo e de modelo é uma mensagem só

O protocolo tem `session/set_mode` para modo e `configOptions` para o resto. Do lado do navegador é uma
mensagem — `set_config` com `optionId` e `value` — e o daemon decide qual chamada do protocolo fazer. Uma
mensagem por seletor obrigaria o cliente a saber qual campo o protocolo trata de forma especial.

#### D9 — A troca persiste na sessão, não na configuração

[A8](open-questions.md): `agent_config` define o default, a sessão troca, e a troca vale para aquela
sessão. As colunas `mode` e `model` já existem (T3) e passam a ser escritas quando a troca acontece.

---

#### P1: `fs/read_text_file` e `fs/write_text_file`

**What**: O agente lê e escreve arquivo pelo `FileService`, com **a mesma guarda de caminho** da `file-editor`.
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/acp/fs-bridge.ts` + teste
**Depends on**: nada

**Done when**:
- [x] O teste da guarda vem **antes** da primeira escrita: caminho absoluto fora do checkout, `..` normalizado, symlink que escapa — todos recusados, e o `path-guard` é reusado sem exceção nova
- [x] `fs/read_text_file` respeita `line` e `limit` quando o agente os manda, e o teto de bytes do `FileService`
- [x] `fs/write_text_file` cria arquivo novo e sobrescreve existente, sempre dentro do checkout
- [x] Recusa vira erro de protocolo que o agente entende, não exceção que derruba a sessão
- [x] `clientCapabilities` passa a declarar `fs`, e **só depois** de os dois métodos existirem — um agente que ouve "sei escrever" e descobre que não, falha no meio do turno em vez de no handshake
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — leitura, leitura com janela, arquivo grande, escrita nova, sobrescrita, e as três recusas da guarda

**Tests**: unit/integration com filesystem de verdade — symlink não se simula · **Gate**: quick
**Commit**: `feat(server): let the agent read and write inside the checkout`

---

#### P2: O contrato da fase 4

**What**: Os eventos que a fase 4 renderiza, e a mensagem que troca modo e modelo.
**Where**: `packages/shared/src/acp-protocol.ts` + teste
**Depends on**: nada

**Done when**:
- [x] Eventos novos: `plan`, `usage`, `config` (modo, modelo e o resto de `configOptions`), `commands`, `terminal`
- [x] `plan` carrega as entradas com status de **três** valores (`pending`, `in_progress`, `completed`) — os do protocolo, sem quinto estado inventado
- [x] `usage` carrega `used`, `size`, custo opcional, e o **estado do limite** que o `_meta._claude/rateLimit` entrega: utilização, limiar, `isUsingOverage`, reset
- [x] `terminal` carrega o **id de sessão de PTY** (D7), não um canal novo
- [x] Mensagem do cliente: `set_config` com `optionId` e `value` (D8)
- [x] `attached` passa a carregar os `configOptions` correntes, para o seletor nascer preenchido em vez de vazio até o primeiro evento
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 10 — ida e volta de cada evento novo, `set_config`, status de plano inválido recusado, `usage` sem custo aceito

**Tests**: unit · **Gate**: quick
**Commit**: `feat(shared): type what the conversation still has to show`

---

#### P3: O plano na tela

**What**: `plan` e `plan_update` traduzidos, e o cartão que se reescreve (F2.5).
**Where**: `packages/server/src/acp/translate.ts`, `packages/web/src/lib/conversation-model.ts`, `packages/web/src/components/PlanCard.tsx` + testes, `conversation.css`
**Depends on**: P2

**Done when**:
- [x] **Um** cartão por sessão, que se reescreve: o agente reenvia o plano inteiro, e cada versão virando bloco novo encheria a conversa de cópias quase iguais
- [x] `plan_removed` apaga o cartão
- [x] Três estados com os tokens de `plan/*`; o passo corrente é o único com a cor da marca
- [x] Plano terminado **colapsa** para o cabeçalho com a contagem
- [x] Passo comprido **quebra**, não trunca — testado na largura de 360px do protótipo
- [x] O CSS de `.plan*` entra agora, junto do componente
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — três estados, reescrita, remoção, colapso, quebra, e o redutor mantendo um só cartão

**Tests**: unit (tradutor, redutor) + componente · **Gate**: quick
**Commit**: `feat(web): show the plan as one card that rewrites itself`

---

#### P4: Uso e custo

**What**: `usage_update` traduzido, e o rodapé que substitui o `/usage` (F2.7).
**Where**: `packages/server/src/acp/translate.ts`, `packages/web/src/lib/conversation-model.ts`, `packages/web/src/components/UsageFooter.tsx` + testes, `conversation.css`
**Depends on**: P2

**Done when**:
- [x] Janela, cache, custo do turno e custo acumulado da sessão
- [x] O medidor **nasce quieto**: `usage/quiet` até passar o `surpassedThreshold` que o próprio protocolo entrega, `usage/warn` depois, `usage/over` em `isUsingOverage`
- [x] `isUsingOverage` virando `true` sai do rodapé e vira **faixa** — rodapé é o que se aprende a não ler
- [x] O medidor de verdade enche: teste que prova largura proporcional, porque foi exatamente isso que o protótipo errou
- [x] Sessão sem custo reportado não mostra um `US$ 0,00` que ninguém mediu
- [x] O CSS de `.usage*`, `.u*`, `.meter*` e `.overage` entra agora
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — três tons do medidor, faixa de overage, custo ausente, acumulado, e a largura proporcional

**Tests**: unit + componente · **Gate**: quick
**Commit**: `feat(web): report what the turn cost, per turn`

---

#### P5: Modo e modelo

**What**: Os seletores, a troca, e a persistência na sessão (F2.6, D8, D9).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/acp/websocket.ts`, `packages/server/src/sessions/SessionStore.ts`, `packages/web/src/components/ConfigPills.tsx` + testes, `conversation.css`
**Depends on**: P2

**Done when**:
- [x] Uma mensagem `set_config` do cliente, e o daemon decide entre `session/set_mode` e a chamada de `configOptions` (D8)
- [x] A troca **persiste na sessão**: as colunas `mode` e `model` são escritas, e reabrir a aba mostra o que estava escolhido (D9)
- [x] Descrição de opção vai **verbatim**, em inglês (A13)
- [x] `bypassPermissions` tem tom próprio na lista e na pílula — não perguntar nada é estado, não preferência
- [x] `config_option_update` e `current_mode_update` vindos do agente atualizam a pílula sem o cliente ter pedido
- [x] Trocar durante um turno é recusado com motivo, não silenciosamente ignorado
- [x] O CSS de `.pill*` e do menu entra agora
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 10 — troca de modo, troca de modelo, persistência, atualização vinda do agente, recusa durante turno, tom do bypass

**Tests**: unit/integration (daemon) + componente · **Gate**: quick
**Commit**: `feat(web): switch mode and model, and remember the switch`

---

#### P6: Comandos de barra

**What**: O menu vindo de `available_commands_update` (F2.8).
**Where**: `packages/server/src/acp/translate.ts`, `packages/web/src/components/SlashMenu.tsx` + testes, `conversation.css`
**Depends on**: P2

**Done when**:
- [x] `/` no começo do composer abre o menu; texto depois filtra
- [x] A lista é **do agente**, com a descrição verbatim (A13) — as skills do repositório aparecem sem o Lumem saber que existem
- [x] Escolher insere o comando no composer; **não** envia sozinho — o comando pode pedir argumento
- [x] Setas e `⏎` navegam; `esc` fecha sem inserir
- [x] Agente que não manda comando nenhum não mostra menu vazio
- [x] O CSS de `.slash*` entra agora
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — abre, filtra, insere sem enviar, teclado nas três direções, lista vazia

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): offer the agent's own slash commands`

---

#### P7: O terminal que o agente pede

**What**: `terminal/create`, `output`, `wait_for_exit`, `kill`, `release` atendidos pelo `PtyManager`, e o `xterm` dentro do cartão (F3, A5, D7).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/acp/terminal-bridge.ts` + teste, `packages/web/src/components/ToolCard.tsx`
**Depends on**: P1, P2

**Done when**:
- [x] Os cinco métodos atendidos pelo `PtyManager` que já existe — **nenhum gerenciador de processo novo**
- [x] O terminal do agente é uma sessão de PTY com id, e o cartão monta o `Terminal` existente apontado para `/pty?session=<id>` (D7)
- [x] `release` esquece a sessão; `kill` mata; sessão de terminal não aparece como aba na worktree
- [x] `wait_for_exit` resolve com o código de saída de verdade
- [x] Terminal do agente é limpo quando a sessão ACP morre — subprocesso órfão é o que o `killAll` existe para evitar
- [x] `clientCapabilities` passa a declarar `terminal`, depois de os cinco existirem
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — criar, ler saída, esperar saída, matar, liberar, não virar aba, limpeza na morte da sessão

**Tests**: integration com PTY de verdade · **Gate**: quick
**Commit**: `feat(server): give the agent a terminal inside its own card`

---

#### P8: O e2e da paridade

**What**: Um turno que usa tudo o que a fase 4 acrescentou.
**Where**: `e2e/acp-conversation.spec.ts`, `e2e/support/fake-acp-agent.mjs`, `docs/project/testing.md`
**Depends on**: P3, P4, P5, P6, P7

**Done when**:
- [x] O agente falso passa a mandar plano, uso, comandos e a pedir um terminal — ainda **zero token**
- [x] O e2e vê: plano avançando, rodapé de uso com número, menu de barra abrindo, terminal do agente dentro do cartão
- [x] Troca de modelo pela pílula, e o valor sobrevive a um recarregamento
- [x] `testing.md` ganha a linha do que a fase 4 acrescentou
- [x] Gate: `pnpm gate:full`
- [x] Test count: ao menos 3 — o turno completo, a troca persistida, o terminal embutido

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): exercise everything phase 4 added`

---

## Fase 5 — Fechar o Lumem e voltar não perde conversa

**Done when da fase:** matar o daemon, subir de novo, reabrir a aba e continuar a conversa de ontem.

### Ordem, e por quê ela é essa

**A gravação antes de qualquer coisa que dependa dela.** Sem transcrição em disco não existe "reabrir";
e uma transcrição escrita errado é a única parte desta fase que **perde dado do usuário**, o que a
coloca no mesmo lugar que a `P1` teve na fase 4.

**Depois a leitura, depois o resume.** Ler a conversa de ontem não precisa de agente nenhum; retomá-la
precisa de processo novo e de `session/load`. São duas features, e a primeira é a que faz a gravação
valer — então ela vem antes.

**A compressão por último dos de servidor,** porque ela mexe em arquivo que já tem dado dentro.

### Decisões que sustentam esta fase

#### D10 — Um banco por sessão

[A6](open-questions.md): a transcrição inteira vai para disco, num SQLite **por sessão**. Purge e
arquivamento ficam triviais — é um arquivo. O custo medido no uso real do Vinicius: 3,9 GB/ano cru,
~1 GB/ano comprimido, e o fluxo ACP deve ser **menor** que isso porque o `.jsonl` do Claude Code carrega
`file-history-snapshot` e anexos que o protocolo não repassa. Trate 3,9 GB como teto, não previsão.

#### D11 — A compressão é do arquivo, não da linha

"Comprimir o que passou de 30 dias" tem duas leituras. Comprimir **linha por linha** rende pouco — JSON
de um evento é pequeno e o cabeçalho do gzip domina — e complica todo caminho de leitura. Comprimir o
**arquivo inteiro** de uma sessão fria rende o máximo e não toca o caminho de leitura quente: sessão de
mais de 30 dias já acabou, e reabrir uma é raro. O custo, nomeado: reabrir uma conversa de 40 dias paga
uma descompressão.

#### D12 — Retomar é sessão nova apontando para a antiga

`session/load` não ressuscita o processo de ontem: ele nasce um adaptador novo e diz a ele qual conversa
carregar. Então retomar **cria uma linha de sessão nova**, com o `acpSessionId` da antiga e um ponteiro
para ela. A conversa continua; a sessão que morreu continua morta, com sua transcrição intacta.

Isso também é o que mantém a D1 verdadeira: `transport` é escolhido no nascimento e nunca muda, e uma
sessão retomada nasce ACP porque só ACP retoma.

#### D13 — Ler não é retomar

Reabrir a aba de uma sessão que acabou mostra a conversa **de leitura**, direto do disco, sem subir
adaptador nenhum. Retomar é um ato explícito, com um botão — porque subir um adaptador custa ~39k tokens
de system prompt antes da primeira palavra ([§2.3 do PRD](prd.md)), e ninguém deve pagar isso por ter
clicado numa aba para reler algo.

---

#### Q1: A transcrição em disco

**What**: Um SQLite por sessão, com a transcrição inteira, append-only.
**Where**: `packages/server/src/acp/TranscriptStore.ts` + teste, `packages/server/src/config.ts`
**Depends on**: nada

**Done when**:
- [ ] Um arquivo por sessão, sob `stateDir`, com o id da sessão no nome (D10)
- [ ] `append(entry)` e `read()`; a ordem de leitura é a de escrita, sempre
- [ ] Escrita é **append-only**: nada reescreve nem apaga uma entrada já gravada
- [ ] Sessão sem transcrição lê vazio em vez de estourar — é o estado de uma sessão que nunca falou
- [ ] Uma entrada que não decodifica é **pulada com log**, não derruba a leitura: um arquivo de uma versão anterior do contrato não pode inutilizar a conversa toda
- [ ] `drop(id)` apaga o arquivo, para o purge da Q3
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 — round-trip, ordem, arquivo ausente, entrada inválida pulada, drop, dois arquivos não se misturam

**Tests**: integration com SQLite em arquivo temporário · **Gate**: quick
**Commit**: `feat(server): keep every conversation on disk, one file per session`

---

#### Q2: O manager grava e lê pelo disco

**What**: `AcpManager.transcript` deixa de ser um array em memória.
**Where**: `packages/server/src/acp/AcpManager.ts` + teste
**Depends on**: Q1

**Done when**:
- [ ] Cada evento emitido é gravado; o `attached` lê do disco
- [ ] O array em memória sai — hoje ele cresce sem teto e é a razão pela qual a F5.4 existe
- [ ] Uma falha de escrita é **logada e não interrompe a conversa**: perder uma linha de transcrição é ruim, perder o turno é pior
- [ ] Injetável, para o teste não precisar de arquivo quando o assunto não é disco
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 5 — grava, lê no attach, sobrevive a falha de escrita, duas sessões separadas

**Tests**: unit/integration · **Gate**: quick
**Commit**: `feat(server): read the transcript from disk instead of memory`

---

#### Q3: Comprimir o que ficou frio, e apagar o que ninguém quer

**What**: Passe de manutenção no boot: comprime sessão fria, apaga transcrição órfã.
**Where**: `packages/server/src/acp/transcript-maintenance.ts` + teste, `boot/reconcile.ts`
**Depends on**: Q1

**Done when**:
- [ ] Sessão encerrada há mais de 30 dias tem o arquivo comprimido (D11), e a leitura descomprime sem o chamador saber
- [ ] Sessão **viva** nunca é comprimida, qualquer que seja a idade da linha
- [ ] Transcrição sem linha de sessão correspondente é apagada — é o que sobra de um purge de banco
- [ ] Um arquivo que não abre não impede o passe de tratar os outros; conta como falha no relatório
- [ ] O passe roda no boot, **antes de aceitar conexão**, como a reconciliação de worktree já faz
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 — comprime a fria, poupa a nova, poupa a viva, lê comprimida, apaga órfã, um arquivo ruim não para o passe

**Tests**: integration com filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): compress cold transcripts and drop orphaned ones`

---

#### Q4: `session/load`

**What**: Retomar a conversa de ontem num adaptador novo (F5.2, A7, D12).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/sessions/SessionStore.ts`, `packages/server/src/routers/session.ts` + testes
**Depends on**: Q2

**Done when**:
- [ ] `AcpManager.resume(acpSessionId, options)` lança adaptador e chama `session/load`
- [ ] `SessionStore.resume(sessionId)` cria **linha nova** apontando para a antiga (D12), com o mesmo escopo, cwd e configuração
- [ ] A transcrição antiga é lida do disco e vira o ponto de partida do `attached` — a conversa continua onde parou, visualmente
- [ ] Retomar uma sessão **viva** é recusado com motivo: já existe uma aba com ela
- [ ] Adaptador que não declara `loadSession` é recusado com motivo, não com stack trace
- [ ] Retomar uma sessão PTY é recusado: só ACP retoma
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 — retoma, linha nova aponta para a antiga, transcrição continua, recusa em sessão viva, recusa sem `loadSession`, recusa em PTY

**Tests**: unit/integration com agente falso · **Gate**: quick
**Commit**: `feat(server): resume yesterday's conversation in a new adapter`

---

#### Q5: A aba que reabre, e o botão que retoma

**What**: Reabrir uma sessão encerrada mostra a conversa; retomar é explícito (D13).
**Where**: `packages/web/src/components/Conversation.tsx`, `packages/server/src/acp/websocket.ts`, `packages/web/src/hooks/useWorktreeTabs.ts` + testes, `conversation.css`
**Depends on**: Q4

**Done when**:
- [ ] Aba de sessão ACP encerrada abre em **leitura**: a conversa inteira, composer desabilitado, dizendo que acabou
- [ ] Nenhum adaptador sobe por reabrir — subir custa ~39k tokens antes da primeira palavra (D13)
- [ ] Um botão **retomar** que cria a sessão nova e troca a aba para ela
- [ ] O separador de retomada do protótipo (`.daysep`) marca onde a conversa antiga termina e a nova começa
- [ ] Sessão encerrada continua listada e reabrível pelo `reopen` que já existe
- [ ] O CSS de `.daysep` entra agora
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 — leitura, composer travado, botão retoma, separador, PTY sem botão

**Tests**: componente + integration do endpoint · **Gate**: quick
**Commit**: `feat(web): reopen a finished conversation, and offer to resume it`

---

#### Q6: O e2e da frase da fase

**What**: Matar o daemon, subir de novo, reabrir, continuar.
**Where**: `e2e/acp-resume.spec.ts`, `e2e/support/fake-acp-agent.mjs`, `docs/project/testing.md`
**Depends on**: Q5

**Done when**:
- [ ] O agente falso passa a atender `session/load`, ainda **zero token**
- [ ] O e2e: conversa, reinicia o daemon, reabre a aba, vê a conversa inteira, retoma, e o turno novo continua depois do separador
- [ ] A transcrição sobrevive ao reinício — é o que a fase promete
- [ ] `testing.md` ganha a linha do que a fase 5 acrescentou
- [ ] Gate: `pnpm gate:full`
- [ ] Test count: ao menos 2 — o ciclo inteiro, e a conversa aparecendo em leitura sem adaptador ter subido

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): restart the daemon and keep the conversation`

---

## O que fica de fora, e onde entra

| Fora desta pilha | Onde |
|---|---|
| Plano na tela, uso e custo, seletor de modo/modelo/esforço, comandos de barra | **Fase 4**, `P3`–`P6` desta pilha. Cada bloco de CSS vem junto do componente que o usa |
| Terminal que o agente pede (`terminal/*`) | **Fase 4**, `P7` — é onde os dois transportes se encontram |
| `fs/read_text_file` e `fs/write_text_file` atendidos pelo `FileService` | **Fase 4**, `P1` — a primeira da fase, porque é a única que sai perigosa se sair errada |
| Retomar sessão (`session/load`) | **Fase 5**, `Q4`–`Q5` desta pilha |
| Transcrição inteira no banco, com compressão acima de 30 dias (F5.4) | **Fase 5**, `Q1`–`Q3` — vem primeiro na fase, porque é a única parte dela que perde dado do usuário se sair errada |
| **Forkar** uma conversa | [backlog](../../project/backlog.md) ([A7](open-questions.md)) — o protocolo oferece, e é desenho de produto, não de transporte |
| Política de permissão configurável | Feature própria — [backlog](../../project/backlog.md) |
| Fechar a [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786): encher contexto e ver onde a compactação dispara | O PRD diz que é **barato junto da primeira tela e caro depois**. Não é task daqui, mas é a hora — entra como medição na fase 4 |
