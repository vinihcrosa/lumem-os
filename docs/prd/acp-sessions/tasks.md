# A sessão vira conversa (ACP) — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 14 de 14 respondidas
**Decisão de transporte:** [pty-vs-acp.md](../../project/pty-vs-acp.md) — **TA1–TA6** fechadas lá
**Protótipo:** `packages/web/prototype/lumem-acp-conversation.html` — desenho fechado e verificado; as tasks de cliente **portam** o que está lá, não redesenham
**Sucede:** [file-editor](../file-editor/tasks.md)
**Destrava:** [workspace-memory](../workspace-memory/roadmap.md) partes 06–09
**Status:** fases 1, 3, 4, 5 e 6 **concluídas — 35 de 35.** Gate cheio verde (1.568 unit/integration + 25 e2e).
**Total:** 35 tasks nas fases 1, 3, 4, 5 e 6 do PRD

> **Já entregue com o desenho, e nenhuma task recria:** o bloco `dominio — conversa` dos tokens
> (turno, estado de ferramenta, permissão, plano, uso, modo), mais `tool/cancelled` e
> `syntax/comment-diff`. São 99 pares de contraste validados. **Nenhuma task escreve `tokens.css` à
> mão** — token novo nasce no Open Design e chega por `pnpm --filter @lumem/web design:sync`
> ([decisão](../../project/design-source-of-truth.md); até 2026-08-19 era o `generate-tokens.py`).

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

#### D14 — O replay do `session/load` vai para o lixo

O adaptador re-transmite a conversa inteira enquanto responde ao `session/load`. O
daemon **descarta** essa cópia. Ele já tem a mesma conversa em disco, e a dele é
melhor: tem os cartões de ferramenta, o plano e o consumo que o replay não carrega.
Gravar as duas mostraria a conversa duas vezes, e a segunda cópia seria a pior.

Custo nomeado: se um dia a transcrição em disco for perdida e a do agente não, não
há como reconstruir a tela a partir do agente. É aceitável — a nossa é a que a tela
sabe desenhar.

---

#### D15 — Retomar copia a transcrição para frente

A conversa antiga é **copiada** para o arquivo da sessão nova, e só então a nova escreve.
A alternativa — deixar o histórico onde está e andar a cadeia de `resumed_from_id` a cada
leitura — teria dois custos, e os dois batem em promessas já feitas: a transcrição de uma
sessão passaria a depender de arquivos que o registro tem o direito de apagar (contra a
D10), e o `attached` precisaria de um `await` no meio, quando ele é justamente o lugar que
tem de ser síncrono para não abrir buraco entre transcrição e stream.

Custo nomeado: uma conversa retomada guarda o histórico duas vezes, e uma corrente de
retomadas multiplica isso. Aceitável porque retomar é raro, o arquivo antigo esfria e é
comprimido, e um purge da linha antiga apaga a cópia antiga sem estragar a nova.

---

#### Q1: A transcrição em disco ✅

**What**: Um SQLite por sessão, com a transcrição inteira, append-only.
**Where**: `packages/server/src/acp/TranscriptStore.ts` + teste, `packages/server/src/config.ts`
**Depends on**: nada

**Done when**:
- [x] Um arquivo por sessão, sob `stateDir`, com o id da sessão no nome (D10)
- [x] `append(sessionId, entry)` e `read(sessionId)`; a ordem de leitura é a de escrita, sempre
- [x] Escrita é **append-only**: nada reescreve nem apaga uma entrada já gravada
- [x] Sessão sem transcrição lê vazio em vez de estourar — é o estado de uma sessão que nunca falou
- [x] Uma entrada que não decodifica é **pulada com log**, não derruba a leitura: um arquivo de uma versão anterior do contrato não pode inutilizar a conversa toda
- [x] `drop(id)` apaga o arquivo, para o purge da Q3
- [x] Gate: `pnpm gate:quick` — 214 testes verdes
- [x] Test count: **12** — round-trip, ordem por `seq` e não por relógio, sobrevive ao processo, dois arquivos separados, sessão que nunca falou, evento fora do contrato pulado, linha que não é JSON, drop, drop do que não existe, id que escaparia do diretório, diretório criado no primeiro boot

**Tests**: integration com SQLite em arquivo temporário · **Gate**: quick
**Commit**: `feat(server): keep every conversation on disk, one file per session`

---

#### Q2: O manager grava e lê pelo disco ✅

**What**: `AcpManager.transcript` deixa de ser um array em memória.
**Where**: `packages/server/src/acp/AcpManager.ts` + teste
**Depends on**: Q1

**Done when**:
- [x] Cada evento emitido é gravado; o `attached` lê do disco
- [x] O array em memória sai — ele crescia sem teto e é a razão pela qual a F5.4 existe
- [x] Uma falha de escrita é **logada e não interrompe a conversa**: perder uma linha de transcrição é ruim, perder o turno é pior
- [x] Injetável, e **em memória por padrão** — o preço é que uma ligação de produção esquecida perde transcrição em silêncio, e é por isso que o `bootstrap` ganhou teste
- [x] `forget` solta o handle e **mantém o arquivo**: esquecer o processo não é esquecer a conversa (descoberto na task — um handle por sessão pela vida do daemon é um descritor que não volta)
- [x] O `bootstrap` abre o store sob `stateDir`, e o teste de boot passa a usar um `stateDir` descartável — booting agora cria diretório, e suíte não escreve no `~/.lumem` do dev
- [x] Gate: `pnpm gate:quick` — 304 testes verdes
- [x] Test count: **6** — grava e lê no attach, sobrevive ao daemon que escreveu, duas sessões em dois arquivos, turno termina com disco recusando a escrita, conversa sobrevive ao `forget`, `bootstrap` abre o store

**Tests**: unit/integration · **Gate**: quick
**Commit**: `feat(server): read the transcript from disk instead of memory`

---

#### Q3: Comprimir o que ficou frio, e apagar o que ninguém quer ✅

**What**: Passe de manutenção no boot: comprime sessão fria, apaga transcrição órfã.
**Where**: `packages/server/src/acp/transcript-maintenance.ts` + teste, `boot/reconcile.ts`
**Depends on**: Q1

**Done when**:
- [x] Sessão encerrada há mais de 30 dias tem o arquivo comprimido (D11), e a leitura descomprime sem o chamador saber
- [x] Sessão **viva** nunca é comprimida, qualquer que seja a idade da linha
- [x] Transcrição sem linha de sessão correspondente é apagada — é o que sobra de um purge de banco
- [x] Um arquivo que não abre não impede o passe de tratar os outros; conta como falha no relatório
- [x] O passe roda no boot, **antes de aceitar conexão**, e **depois** da reconciliação de sessão órfã: marcar a órfã como `exited` é o que a torna candidata, e mexer no timestamp dela é o que a mantém quente por mais 30 dias — conservador na direção certa
- [x] Ler um arquivo comprimido **não o descomprime em disco**; escrever nele descongela primeiro, para a escrita não cair num handle em memória
- [x] Gate: `pnpm gate:quick` — 311 afetados verdes, 815 na suíte inteira do server
- [x] Test count: **15** — comprime a fria, poupa a de ontem, poupa a viva, não comprime duas vezes, o arquivo encolhe de fato, lê comprimida, leitura não escreve, escrita descongela, `drop` leva o `.gz`, apaga órfã crua e comprimida, arquivo ilegível não para o passe, arquivo estranho ignorado, diretório inexistente, e o passe no `reconcileOnBoot`

**Tests**: integration com filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): compress cold transcripts and drop orphaned ones`

---

#### Q4: `session/load` ✅

**What**: Retomar a conversa de ontem num adaptador novo (F5.2, A7, D12).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/sessions/SessionStore.ts`, `packages/server/src/routers/session.ts` + testes
**Depends on**: Q2

**Done when**:
- [x] `AcpManager.resume({ acpSessionId, ... })` lança adaptador e chama `session/load`
- [x] `SessionStore.resume(sessionId)` cria **linha nova** apontando para a antiga (D12), com o mesmo escopo, cwd e configuração
- [x] Coluna `resumed_from_id`, migração `0002` — um `ALTER TABLE ADD COLUMN` só, sem rebuild. **Sem foreign key**: é procedência, não dependência, e `ON DELETE RESTRICT` — a única regra que este schema permite — travaria o purge da sessão de ontem por causa da de hoje
- [x] `session.resume` no router, devolvendo a sessão **nova** — é para ela que a aba tem de apontar
- [x] Retomar uma sessão **viva** é recusado com motivo: dois adaptadores na mesma conversa dariam duas janelas para o mesmo histórico, ambas podendo escrever
- [x] Adaptador que não declara `loadSession` é recusado com frase, não com method-not-found de dentro do SDK
- [x] Retomar uma sessão PTY é recusado: só ACP retoma — e isso **decorre da D1**, não é regra nova
- [x] Gate: `pnpm gate:quick` — 1.530 testes verdes; `pnpm gate:build` também
- [x] Test count: **18** — 8 no manager (id novo/id antigo, `session/load` com o id certo, modo vem do load, replay descartado, turno seguinte é ouvido, recusa sem `loadSession` matando o adaptador, recusa vazia, load recusado vira falha de lançamento), 8 no store (linha nova aponta pra antiga, linha antiga intacta, herda escopo, recusa sessão viva, recusa shell, recusa inexistente, recusa sem manager, mata o adaptador que não conseguiu registrar), 2 no router
- [x] D14 acrescentada: o replay do `session/load` é descartado — a cópia em disco é melhor, e gravar as duas mostraria a conversa duas vezes. **Verificado por mutação**: sem o `if (session.loading) return`, o teste falha

**Tests**: unit/integration com agente falso · **Gate**: quick
**Commit**: `feat(server): resume yesterday's conversation in a new adapter`

---

#### Q5: A aba que reabre, e o botão que retoma ✅

**What**: Reabrir uma sessão encerrada mostra a conversa; retomar é explícito (D13).
**Where**: `packages/web/src/components/Conversation.tsx`, `packages/server/src/acp/websocket.ts`, `packages/web/src/hooks/useWorktreeTabs.ts` + testes, `conversation.css`
**Depends on**: Q4

**Done when**:
- [x] Aba de sessão ACP encerrada abre em **leitura**: a conversa inteira, composer desabilitado, dizendo que acabou
- [x] Nenhum adaptador sobe por reabrir — subir custa ~39k tokens antes da primeira palavra (D13)
- [x] `session.transcript` no router devolve **o mesmo frame `attached`** que o websocket manda, então o cliente tem uma entrada só e não duas formas de a mesma conversa parecer diferente
- [x] Um botão **retomar** que cria a sessão nova e troca a aba para ela — a seleção acontece no `onSuccess`, porque aba só existe para sessão que a lista conhece
- [x] O separador de retomada (`.daysep`) marca onde a conversa antiga termina e a nova começa, desenhado a partir do **evento gravado** e não da coluna `resumed_from_id` — assim ele cai no mesmo lugar no replay e ao vivo
- [x] `resumed` é **turno próprio**, não bloco: como bloco entraria na moldura de quem falou, recuado sob a calha, como se alguém tivesse dito
- [x] Sessão encerrada continua listada e reabrível pelo `reopen` que já existia
- [x] O CSS de `.daysep` entra agora, e a lista "o que ele deliberadamente não carrega" do teste de porte **esvaziou** — foi retirada com a nota do porquê
- [x] Descoberto: o composer também trava numa sessão que **morreu com a aba aberta** — o daemon lembra da conversa encerrada, então o socket conecta e reporta `exited`. Os dois casos são a mesma coisa para o composer
- [x] Gate: `pnpm gate:quick` — 1.553 testes verdes; `pnpm gate:build` também
- [x] Test count: **17** — 7 de leitura no componente (mostra sem abrir socket, composer travado com motivo, fim do registro, oferece retomar, não oferece sem quem receba, diz que está retomando, leitura que falhou), 2 do separador, 3 no modelo (turno próprio, carimbo do daemon, mantém plano e consumo), 4 na transcrição do store, 1 no `resumed` do store

**Tests**: componente + integration do endpoint · **Gate**: quick
**Commit**: `feat(web): reopen a finished conversation, and offer to resume it`

---

#### Q6: O e2e da frase da fase ✅

**What**: Matar o daemon, subir de novo, reabrir, continuar.
**Where**: `e2e/acp-resume.spec.ts`, `e2e/support/fake-acp-agent.mjs`, `docs/project/testing.md`
**Depends on**: Q5

**Done when**:
- [x] O agente falso passa a atender `session/load`, ainda **zero token** — e ele **re-transmite** a conversa de propósito, para o e2e poder afirmar que o daemon descarta essa cópia
- [x] O e2e em **duas metades**, porque a afirmação tem duas: o reinício só dá contra daemon que a suíte controla, e esse daemon não tem browser apontado para ele. Metade pela API, metade pelo browser
- [x] A transcrição sobrevive ao reinício — é o que a fase promete
- [x] `testing.md` ganha as três linhas da matriz e duas armadilhas novas
- [x] Gate: `pnpm gate:full` — 1.555 unit/integration + 24 e2e verdes
- [x] **Verificado por mutação**: sem o `copy` e sem o evento `resumed`, os dois specs falham
- [x] Test count: **2** — o ciclo inteiro pela API (conversa, reinício, transcrição intacta, retomada, linha nova apontando pra antiga, histórico à frente, separador no fim, replay descartado, turno novo funcionando), e a tela (leitura, composer travado, `conversa encerrada`, botão, separador visível, replay ausente, e a conversa nova falando)

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): restart the daemon and keep the conversation`

---

## Fase 6 — Criar a configuração ACP sem sair da tela

**Done when da fase:** ninguém precisa de `curl` para ter um agente ACP.

### Por que isso é desta feature, e não da `walking-skeleton`

A CRUD de `agent_config` é da [walking-skeleton](../walking-skeleton/tasks.md), e ela nunca precisou
de tela: a configuração semeada — `claude-code`, PTY — já vinha pronta no boot (F6.4), e criar outra
era conveniência.

A `acp-sessions` mudou isso e não notou. Uma configuração ACP exige **dois campos que nenhuma tela
sabe escrever**: o `transport` (F1.2) e a versão pinada do adaptador (F5.5, [A12](open-questions.md)).
Sem eles não existe conversa — e como não há tela, o único caminho para usar a feature inteira é uma
chamada HTTP na mão. A feature abriu o buraco, então é ela que fecha.

### Decisões que sustentam esta fase

#### D16 — O rodapé da sidebar, e a mentira que isso conta

A ação nasce ao lado de **adicionar projeto**, no rodapé da sidebar, com o mesmo padrão de formulário
em linha do [`AddProjectDialog`](../../../packages/web/src/components/AddProjectDialog.tsx) — mesma
`Card`, mesmos `Field`, mesmo erro vindo do daemon.

A mentira, nomeada: `agent_config` **não tem workspace** — é global —, e o rodapé é do workspace. Uma
tela de preferências seria o lugar certo, e ela não existe. Fica registrado como
[A16](open-questions.md), com o gatilho que a move.

#### D17 — A validação é a do daemon, repetida de propósito

O CHECK do banco diz: versão obrigatória em `acp`, proibida em `pty`. O formulário **desabilita o
envio** nos mesmos termos, em vez de deixar o daemon recusar.

Repetir regra é dívida, e aqui ela se paga: sem isso o único jeito de descobrir que falta a versão é
enviar e ler um erro — e a regra em questão é a que separa "conversa" de "terminal", que é a escolha
mais importante do formulário. O daemon continua sendo a autoridade: o que ele recusar aparece com as
palavras dele.

#### D18 — Sem tela nova, sem protótipo novo

Toda tela deste repo passa por protótipo HTML antes de React. Esta não, e a razão é que ela **não é
tela nova**: é o formulário do `AddProjectDialog` com dois campos a mais e um `<select>` que o
[`WorkspaceSelector`](../../../packages/web/src/components/WorkspaceSelector.tsx) já desenhou. Um
protótipo aqui redesenharia o que já está desenhado.

Se a fase virar uma tela de preferências — a A16 —, aí sim: protótipo primeiro.

---

#### R1: O formulário ✅

**What**: Criar configuração de agente pela UI, com transporte e versão do adaptador.
**Where**: `packages/web/src/components/AgentConfigDialog.tsx` + teste, `sidebar.css`, `App.tsx`
**Depends on**: nada — o `agentConfig.create` já aceita os dois campos desde a fase 1

**Done when**:
- [x] Nome, comando, argumentos, transporte e versão do adaptador
- [x] Argumentos são uma linha, separados por espaço — e o que o daemon recebe é a lista
- [x] `transport: acp` **exige** a versão e `pty` a **proíbe**, no formulário (D17)
- [x] O erro do daemon aparece com as palavras dele — nome duplicado é o caso comum
- [x] Ao criar, a lista de `nova sessão` já mostra o agente novo, sem recarregar — uma chave de query, dois leitores
- [x] Padrão é **`acp`**: a A11 defaulta a *coluna* para `pty` para que migrar não mude comportamento; humano digitando neste formulário é outra pergunta — a config PTY já existe do seed, e o motivo de estar aqui é a conversa
- [x] Gate: `pnpm gate:quick` — 1.568 testes verdes
- [x] Test count: **13** (R1 + R2 juntas) — envia os dois campos que nenhuma tela escrevia, cria PTY sem versão, esconde a versão em pty, recusa envio de acp sem versão, parte os argumentos, erro do daemon, lista invalidada, formulário limpo, chip por transporte com a versão pinada na tela, fora do PATH, lista vazia, remove em dois cliques, recusa de config em uso
- [x] **Variáveis de ambiente ficaram de fora** — controle de chave/valor é outro componente. Foi para o [backlog](../../project/backlog.md)

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): add an agent configuration without leaving the app`

---

#### R2: A lista, e o que fazer com um erro de digitação ✅ — entregue junto da R1

**What**: Ver as configurações que existem, com o transporte de cada uma, e remover.
**Where**: `packages/web/src/components/AgentConfigDialog.tsx` + teste
**Depends on**: R1

**Done when**:
**Entregue no mesmo commit da R1, e de propósito:** a lista e o formulário são um painel só, e um
commit que adicionasse o formulário sem a lista entregaria uma tela onde um erro de digitação não tem
remédio — que é exatamente a reclamação que abriu esta fase.

- [x] Cada configuração aparece com o comando e um chip dizendo **conversa** ou **terminal**
- [x] O chip é **neutro**: a cor já está falada pelo estado (`fora do PATH`), e elemento com dois eixos de cor não tem nenhum — a palavra carrega o fato
- [x] Remover, com o refresh que faz o menu de sessão acompanhar
- [x] **Dois cliques** para remover, não um: um clique errado custa redigitar quatro campos. Não é modal — o daemon recusando config em uso é a guarda que importa, esta é só sobre o ponteiro escorregar
- [x] Configuração em uso por alguma sessão é recusada pelo daemon (`IN_USE`) e a recusa aparece — sem isso o usuário lê "não deu" e não sabe por quê
- [x] Fora do PATH aparece na lista também, como já aparece no menu (F6.5): a lista não é um lugar diferente da verdade
- [x] A versão pinada aparece na linha (`claude-agent-acp @0.40.0`) — a A12 tornou a versão dado justamente para poder ser lida
- [x] Gate: `pnpm gate:quick`
- [x] Test count: contadas na R1

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): list agent configurations, and remove one`

---

#### R3: O e2e que apaga o `curl` ✅

**What**: Criar a configuração ACP pela tela e conversar com ela.
**Where**: `e2e/acp-agent-config.spec.ts`, `docs/project/testing.md`
**Depends on**: R2

**Done when**:
- [x] O e2e cria a configuração ACP **pela UI**, sem tocar na API, e abre uma conversa com ela
- [x] É a única prova que interessa: o resto da suíte cria a configuração pela API, o que é justamente o caminho que esta fase existe para tornar dispensável
- [x] **Verificado por mutação**: sem enviar `transport` e `adapterVersion`, o spec falha
- [x] Gate: `pnpm gate:full` — 1.568 unit/integration + 25 e2e
- [x] Test count: **1** — criar pela tela, ler o chip de transporte de volta do daemon, lançar e conversar

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): create the ACP agent from the screen, then talk to it`

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
