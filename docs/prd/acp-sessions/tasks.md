# A sessão vira conversa (ACP) — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 14 de 14 respondidas
**Decisão de transporte:** [pty-vs-acp.md](../../project/pty-vs-acp.md) — **TA1–TA6** fechadas lá
**Protótipo:** `packages/web/prototype/lumem-acp-conversation.html` — desenho fechado e verificado; as tasks de cliente **portam** o que está lá, não redesenham
**Sucede:** [file-editor](../file-editor/tasks.md)
**Destrava:** [workspace-memory](../workspace-memory/roadmap.md) partes 06–09
**Status:** não iniciada — 0 de 18
**Total:** 18 tasks em 2 fases (as fases **1** e **3** do PRD)

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
- [ ] `ACP_WS_PATH`, `ACP_SESSION_PARAM` e `ACP_CLOSE_SESSION_NOT_FOUND` (4404) definidos, espelhando `pty-protocol.ts`
- [ ] Mensagens do daemon: `attached`, `message_chunk`, `thought_chunk`, `tool_call`, `tool_call_update`, `permission_request`, `permission_resolved`, `turn_end`, `error`, `unknown`
- [ ] Mensagens do cliente: `prompt`, `cancel`, `permission_response`
- [ ] `attached` carrega o replay da transcrição, como `snapshot` carrega o scrollback do PTY — o cliente repinta e só então aplica evento novo
- [ ] Estado do cartão é união fechada de **cinco** valores nossos — `pending`, `running`, `ok`, `failed`, `cancelled` (D4). O ACP só tem quatro (`pending`, `in_progress`, `completed`, `failed`) e **nenhum** deles é `cancelled`: o quinto é nossa tradução, e a tabela mora no comentário do schema. Um sexto valor é recusado na decodificação
- [ ] `decodeAcpServerMessage` / `decodeAcpClientMessage` devolvem `{ ok: false, error }` com o caminho do campo, nunca lançam
- [ ] Existe a variante `unknown` (D3) e ela decodifica; o **tradutor** de `session/update` para essa variante é da T4, porque só o daemon vê ACP cru — o navegador nunca vê
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 casos — JSON inválido, tipo desconhecido, estado inválido de cartão, `unknown` aceito, ida e volta de cada direção

**Tests**: unit · **Gate**: quick
**Commit**: `feat(shared): type the ACP conversation wire protocol`

---

#### T2: `transport` em `agent_config`

**What**: A coluna, o `CHECK`, e a migração que escreve `'pty'` em tudo que já existe.
**Where**: `packages/server/src/db/schema.ts`, migração, `repositories/agentConfig.ts` + teste
**Depends on**: nada

**Done when**:
- [ ] `transport` com `CHECK (transport IN ('pty','acp'))` e default `'pty'`
- [ ] Migração escreve `'pty'` em toda linha existente ([A11](open-questions.md)); teste parte de banco com linhas sem a coluna e prova que nenhuma fica `NULL`
- [ ] Um terceiro valor é recusado pelo banco, não só pela aplicação
- [ ] `adapterVersion` fixa na configuração, nunca `@latest` ([A12](open-questions.md), F5.5) — coluna própria, obrigatória quando `transport = 'acp'`
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 4 — migração de linha legada, `CHECK` de valor inválido, `acp` sem versão recusado, `pty` sem versão aceito

**Tests**: unit, com SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): make transport a column on agent_config`

---

#### T3: A sessão sabe o que ela é

**What**: `session` ganha `transport`, `acpSessionId`, `mode` e `model` (F1.3), com as invariantes no banco.
**Where**: `packages/server/src/db/schema.ts`, migração, `repositories/session.ts` + teste
**Depends on**: T2

**Done when**:
- [ ] As quatro colunas existem; `transport` com o mesmo `CHECK` e default `'pty'`
- [ ] `CHECK`: `transport = 'acp'` ⇒ `acp_session_id` não nulo; `transport = 'pty'` ⇒ nulo (D1)
- [ ] Sessão de shell é sempre `'pty'`, garantido por `CHECK` (F1.2)
- [ ] Migração escreve `'pty'` em toda sessão existente sem tocar em processo vivo
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 4 — as duas direções do `CHECK`, shell forçado a `pty`, migração de linha legada

**Tests**: unit, com SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): record transport and ACP session on session rows`

---

#### T4: `AcpManager` — o irmão do `PtyManager`

**What**: Lançar o adaptador, fazer o framing JSON-RPC pelo `@agentclientprotocol/sdk`, e ser dono do ciclo de vida.
**Where**: `packages/server/src/acp/AcpManager.ts` + teste, `packages/server/src/acp/fake-agent.ts` (fixture)
**Depends on**: T1

**Done when**:
- [ ] `spawn` levanta o subprocesso, faz `initialize` e `session/new`, e devolve `acpSessionId`, modos e modelos disponíveis
- [ ] `prompt`, `cancel` e `respondToPermission` implementados
- [ ] `onEvent(id, listener)` emite a união do T1, não o payload cru do protocolo — a tradução mora aqui
- [ ] Agente falso do outro lado do pipe: um script que fala JSON-RPC e nada mais. **Nenhum teste desta task consome token**
- [ ] O subprocesso é do daemon e sobrevive ao cliente (F1.4), provado por teste que fecha o listener e continua recebendo evento
- [ ] `session/update` desconhecido virou `unknown` e foi logado; a sessão continua viva (D3) — **o tradutor de ACP para a união da T1 mora aqui**, com a tabela de estado e a derivação do quinto estado a partir de `stopReason: cancelled`
- [ ] Cartão ainda `pending` ou `running` quando o turno fecha com `stopReason: cancelled` passa a `cancelled`, não a `failed` (D4) — o ACP não tem esse estado, então é a única fonte dele
- [ ] `killAll` com timeout, como o `PtyManager` já faz
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10 — handshake, prompt→chunks, tool_call→update, permissão pedida e respondida, cancel, evento desconhecido, morte do subprocesso, sobrevivência ao detach

**Tests**: unit/integration com agente falso · **Gate**: quick
**Commit**: `feat(server): drive an ACP agent over JSON-RPC`

---

#### T5: Falha de lançamento é resposta de domínio

**What**: Adaptador ausente ou versão errada vira erro nomeado, com o comando que resolve — nunca stack trace (F1.6).
**Where**: `packages/server/src/acp/AcpManager.ts`, `packages/server/src/agents/availability.ts`, `errors.ts` + teste
**Depends on**: T4

**Done when**:
- [ ] `isCommandAvailable` é reusado; nenhuma checagem nova de PATH é escrita
- [ ] Erro carrega a versão fixada e a linha de `npm i -g` correspondente, montada a partir de `adapterVersion` — não hard-coded
- [ ] Handshake que falha ou dá timeout também vira erro de domínio, não `unhandledRejection`
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 3 — comando ausente, handshake que nunca responde, `protocolVersion` incompatível

**Tests**: unit · **Gate**: quick
**Commit**: `feat(server): report ACP launch failure as a domain error`

---

#### T6: O endpoint `/acp`

**What**: Attach, detach e replay pelo mesmo mecanismo do `/pty`, com mensagem tipada em vez de bytes (F1.5, D2).
**Where**: `packages/server/src/acp/websocket.ts` + teste, `server.ts`
**Depends on**: T1, T4

**Done when**:
- [ ] Attach responde `attached` como primeiro frame, com a transcrição inteira para replay
- [ ] Sessão inexistente fecha com 4404, como o `/pty` faz
- [ ] Dois clientes na mesma sessão recebem os mesmos eventos
- [ ] Detach não mata o subprocesso
- [ ] Frame inválido do cliente responde `error` com código e **mantém a conexão aberta** — a mesma política do PTY
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 — replay, 4404, dois clientes, detach, frame inválido, prompt chegando ao agente falso

**Tests**: integration, websocket de verdade · **Gate**: quick
**Commit**: `feat(server): serve the ACP event stream over a websocket`

---

#### T7: `SessionStore` e o boot aprendem os dois transportes

**What**: `start`/`close` roteiam por `transport`, e a reconciliação de boot cobre ACP como já cobre PTY (F5.3).
**Where**: `packages/server/src/sessions/SessionStore.ts`, `boot/reconcile.ts`, `routers/session.ts` + testes
**Depends on**: T3, T4

**Done when**:
- [ ] `start` lê o `transport` do `agent_config`, grava na sessão, e chama o manager certo
- [ ] Sessão de shell nunca chega ao `AcpManager`
- [ ] `trackExits` cobre as duas origens; sessão ACP que morre vira `exited` com `exitCode`
- [ ] Reconciliação de boot marca sessão ACP órfã como `exited`, igual PTY, e não tenta religar
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 — roteamento por transporte, shell forçado a PTY, saída rastreada nos dois, reconciliação órfã nos dois

**Tests**: unit/integration · **Gate**: quick
**Commit**: `feat(server): route session lifecycle by transport`

---

#### T8: O handshake contra o adaptador de verdade

**What**: Um teste marcado que sobe o `claude-agent-acp` instalado e prova que o `initialize` combina com o contrato do T1.
**Where**: `packages/server/src/acp/AcpManager.integration.test.ts`, `docs/project/testing.md`
**Depends on**: T4, T5

**Done when**:
- [ ] Marcado e pulado quando o adaptador não está no PATH, como o teste de `git` real faz
- [ ] Roda `initialize` + `session/new` + `session/close` e **nada mais** — zero token consumido, medido no spike
- [ ] Falha se `protocolVersion`, `authMethods` ou a forma de `configOptions` divergirem do contrato — é o detector de quebra de versão do adaptador
- [ ] `testing.md` ganha a linha do novo teste marcado e como rodá-lo
- [ ] Gate: `pnpm gate:full`
- [ ] Test count: 1 caso, e ele vale mais que dez falsos

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
- [ ] `reduce(state, event)` puro, sem `Date.now()` nem efeito
- [ ] `message_chunk` e `thought_chunk` concatenam delta no turno corrente; chunk que chega sem turno aberto abre um
- [ ] `tool_call_update` acha o cartão por id e muda estado, duração, delta e saída — update para id inexistente é ignorado com aviso, não estoura
- [ ] `permission_request` marca a conversa como **bloqueada**, e `permission_resolved` converte o pedido no cartão da ferramenta com o veredito (o protótipo mostra isso)
- [ ] `unknown` acumula numa lista visível; nunca lança
- [ ] Replay de `attached` produz exatamente o mesmo estado que o stream incremental equivalente — **teste de equivalência**, porque é a garantia de que reabrir a aba não muda o que se vê
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 12 — cada tipo de evento, chunk órfão, update órfão, ordem fora de sequência, equivalência replay/incremental

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): reduce ACP events into a conversation view model`

---

#### C2: O socket da conversa

**What**: Conectar, decodificar, reconectar — espelho de `pty-socket.ts`.
**Where**: `packages/web/src/lib/acp-socket.ts` + teste
**Depends on**: T1

**Done when**:
- [ ] `connectAcpSocket(sessionId, handlers)` com a mesma forma de `connectPtySocket`
- [ ] Frame que não decodifica é reportado e descartado; a conexão não cai
- [ ] Fechamento 4404 é distinguido de queda de rede
- [ ] `send` recusa mensagem que não passa no schema **antes** de escrever no socket
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 5 — attach, frame inválido, 4404, queda de rede, envio inválido barrado

**Tests**: unit, com fake de WebSocket · **Gate**: quick
**Commit**: `feat(web): connect the browser to the ACP event stream`

---

#### C3: Mensagem e raciocínio

**What**: Os dois blocos de texto da conversa, com streaming e o raciocínio colapsado (F2.1, F2.2, A3).
**Where**: `packages/web/src/components/Message.tsx`, `Thought.tsx` + testes, `conversation.css`
**Depends on**: C1

**Done when**:
- [ ] Turno do usuário e do agente com a medianiz de 20px do protótipo, e a marcação portada dele
- [ ] Caret visível enquanto o turno não terminou, ausente depois
- [ ] Raciocínio colapsado por padrão, com linha viva enquanto escreve, e expansível (A3)
- [ ] Mensagem vazia não renderiza bloco vazio
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 — dois papéis, caret durante/depois, colapso, expansão, mensagem vazia

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): render agent messages and collapsed reasoning`

---

#### C4: O cartão de ferramenta

**What**: O elemento que substitui o texto rolando — cinco estados, cabeçalho sempre visível, corpo colapsado com teto (F2.3, A4, D4).
**Where**: `packages/web/src/components/ToolCard.tsx` + teste, `conversation.css`
**Depends on**: C1

**Done when**:
- [ ] Os **cinco** estados renderizam, cada um com sua cor de token — nenhuma cor literal
- [ ] Glifo por **categoria** (ler, escrever, executar, rede, delegar), nome da ferramenta em texto — não uma cor por ferramenta
- [ ] Alvo trunca pelo diretório primeiro e pelo nome só depois: **teste na largura de 360px prova que o nome não sobrepõe o chip de estado** (o protótipo pegou exatamente isso)
- [ ] Corpo colapsado com teto de altura, e a contagem do que ficou de fora é dita na tela ("mostrar as 2.387 linhas")
- [ ] Diff de escrita renderizado pelo componente que a `right-panel` já tem (A4) — nenhum renderizador de patch novo
- [ ] Saída sem ligadura de fonte: `!==` não pode virar `≠`
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 10 — cinco estados, cinco categorias, truncamento a 360px, colapso, contagem do resto, reuso do visualizador de patch

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): render tool calls as cards with five states`

---

#### C5: O diálogo de permissão

**What**: O único bloco que trava a sessão. Nasce com teste próprio (F2.4).
**Where**: `packages/web/src/components/PermissionRequest.tsx` + teste, `conversation.css`
**Depends on**: C1, C2

**Done when**:
- [ ] Comando aparece **inteiro**, quebrando em vez de truncar — `rm -rf` cortado é `rm -rf` aprovado no escuro
- [ ] `cwd` visível
- [ ] Opções vêm do protocolo, com o texto verbatim (D5); uma só é primária, e a de negar permanente é destrutiva
- [ ] `⏎` aceita a primária, `esc` nega uma vez; o foco cai no diálogo quando ele aparece
- [ ] Enquanto pendente, o composer está desabilitado e diz por quê
- [ ] Responder envia `permission_response` uma **única** vez; segundo clique é inerte
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 — render, comando longo quebrando, teclado nas duas direções, foco, composer travado, duplo clique barrado, opções verbatim

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): ask for permission without stalling the session`

---

#### C6: O sinal fora da aba visível

**What**: Pedido de permissão numa aba que não está aberta marca a aba e conta na sidebar (F2.4, [A10](open-questions.md)).
**Where**: `packages/web/src/hooks/useWorktreeTabs.ts`, `components/SidebarTree.tsx`, `Tab.tsx` + testes
**Depends on**: C1

**Done when**:
- [ ] Aba com pedido pendente ganha o marcador de `permission/pending`, distinto do ponto de `running`
- [ ] A contagem na worktree usa o mesmo tom, e some quando o pedido é respondido
- [ ] Abrir a aba não responde o pedido sozinho
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 4 — marca aparece, contagem muda de tom, resposta limpa os dois, abrir não responde

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): flag a tab waiting on permission`

---

#### C7: A conversa montada, com o composer

**What**: Juntar os blocos, rolar, e mandar prompt. Sem plano, sem uso, sem seletor (D6).
**Where**: `packages/web/src/components/Conversation.tsx` + teste, `conversation.css`
**Depends on**: C3, C4, C5

**Done when**:
- [ ] Composer manda com `⌘⏎`; vazio não manda
- [ ] Botão de interromper aparece só com turno no ar, e manda `cancel`
- [ ] Rola para o fim quando chega evento novo **e o usuário já estava no fim**; não arranca a rolagem de quem subiu para ler
- [ ] Sessão nova mostra o estado vazio do protótipo, com o custo fixo de abrir a sessão dito na tela
- [ ] Falha de lançamento (T5) aparece como o bloco de domínio do protótipo, com o comando que resolve
- [ ] Evento desconhecido aparece em cinza e não derruba a aba (D3)
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 — envio, vazio barrado, interromper, rolagem nas duas situações, vazio, falha de lançamento, evento desconhecido

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): assemble the ACP conversation with its composer`

---

#### C8: O CSS da conversa

**What**: Portar o CSS do protótipo, inteiro, sem retoque de layout.
**Where**: `packages/web/src/components/conversation.css`
**Depends on**: C3, C4, C5, C7

**Done when**:
- [ ] Nenhum valor literal de cor, espaçamento ou dimensão — só `var()`, exceto fio ótico de 1–2px
- [ ] As classes vêm do protótipo com o mesmo nome; divergência é bug de porte, não escolha
- [ ] `tokens.css` **não** é editado
- [ ] Gate: `pnpm gate:quick`

**Tests**: coberto pelos testes de componente · **Gate**: quick
**Commit**: `feat(web): port the conversation stylesheet from the prototype`

---

#### C9: A aba escolhe conversa ou terminal

**What**: `SessionTabPanel` roteia por `transport`. É a task que troca o que o usuário vê.
**Where**: `packages/web/src/components/SessionTab.tsx`, `hooks/useWorktreeTabs.ts` + testes
**Depends on**: C7, T7

**Done when**:
- [ ] `transport: 'acp'` monta `Conversation`; `'pty'` continua montando `Terminal`, sem mudança nenhuma
- [ ] A conversa também fica **montada e escondida** quando outra aba está ativa — a mesma promessa que o terminal já faz, pelo mesmo motivo
- [ ] Sessão de shell nunca monta conversa
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 4 — cada transporte, shell, montada-e-escondida

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): pick conversation or terminal by session transport`

---

#### C10: O e2e da frase do PRD

**What**: Uma tarefa roda do começo ao fim sem terminal, contra o agente falso.
**Where**: `e2e/acp-conversation.spec.ts`, `docs/project/testing.md`
**Depends on**: C9, T8

**Done when**:
- [ ] Contra o agente falso do T4, não contra o Claude — o e2e não consome token
- [ ] O caminho inteiro: abrir sessão ACP, mandar prompt, ver mensagem em streaming, ver cartão de ferramenta virar `ok`, responder um pedido de permissão, ver o turno fechar
- [ ] Recarregar a página no meio replaya a transcrição e mostra o mesmo estado
- [ ] `testing.md` ganha a linha da nova suíte
- [ ] Gate: `pnpm gate:full`
- [ ] Test count: ao menos 2 — o caminho inteiro, e o replay depois do recarregamento

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): run a real task through the conversation, no terminal`

---

## O que fica de fora, e onde entra

| Fora desta pilha | Onde |
|---|---|
| Plano na tela, uso e custo, seletor de modo/modelo/esforço, comandos de barra | **Fase 4** do PRD — o protótipo já os desenha, e o CSS deles já está portado no C8 |
| Terminal que o agente pede (`terminal/*`) | **Fase 4**, F3 do PRD — é onde os dois transportes se encontram |
| `fs/read_text_file` e `fs/write_text_file` atendidos pelo `FileService` | **Fase 4**, F4 do PRD. Até lá o agente usa as ferramentas dele, como hoje |
| Retomar sessão (`session/load`), reconciliação de conversa no boot | **Fase 5** do PRD |
| Transcrição inteira no banco, com compressão acima de 30 dias (F5.4) | **Fase 5** — o replay do T1/C1 vive em memória até lá, e isso é suficiente para a fase 3 fechar |
| Política de permissão configurável | Feature própria — [backlog](../../project/backlog.md) |
| Fechar a [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786): encher contexto e ver onde a compactação dispara | O PRD diz que é **barato junto da primeira tela e caro depois**. Não é task daqui, mas é a hora — entra como medição na fase 4 |
