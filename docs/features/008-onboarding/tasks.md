# Primeiro acesso — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 0 de 17 respondidas
**Protótipo:** `packages/web/prototype/lumem-onboarding-flow.html` — nove telas, desenho fechado e
renderizado. As tasks de cliente **portam** o que está lá; onde o desenho e o produto discordam, vale o
[§4 do PRD](prd.md) e a **T0** corrige o desenho antes de qualquer porte
**Sistema de design:** `packages/web/prototype/lumem-ds.css` — camada compartilhada, nova neste sync
**Sucede:** [acp-sessions](../acp-sessions/tasks.md) — é ela que faz o passo 3 ter para onde ir
**Status:** **21 de 21 entregues.** Gate cheio verde — 1.671 unit/integration (1 pulado) + 26 e2e.
**Total:** 21 tasks em 4 fases

> **Nenhuma task escreve `tokens.css` à mão.** O `design:sync` de 2026-08-20 trouxe as duas telas e o
> `lumem-ds.css` **sem tocar um token** — o fluxo inteiro é desenhado com os 98 semânticos que já
> existem. Token novo, se aparecer, nasce no Open Design
> ([decisão](../../project/design-source-of-truth.md)).

---

## Ordem, e por quê ela é essa

**O desenho errado não se implementa.** A **T0** é a primeira porque cinco pontos do protótipo
contradizem o produto — e um deles manda instalar o pacote errado. Portar antes de corrigir seria
escrever código a partir de uma instrução falsa, e depois ter que descobrir qual das duas fontes tinha
razão.

**A casca antes das telas.** Nenhuma das nove telas é alcançável sem o fluxo que as contém, e o fluxo é
o que substitui o `FirstRun`. Ele nasce com as duas telas que não pedem nada de novo do daemon (1 e 9),
e é isso que faz a fase 1 ter algo para olhar.

**O daemon antes da tela que o lê.** As telas 2, 3, 4 e 6 são, cada uma, uma leitura nova. A ordem
dentro da fase é sempre servidor → tela, porque componente contra endpoint que não existe é componente
testado contra a própria mentira.

**A sonda depois da detecção.** A tela 3 decide se dá para continuar; a 4 é a prova. Sonda antes de
detecção significaria subir processo sem saber se o binário existe — que é exatamente o silêncio que a
[`isCommandAvailable`](../../../packages/server/src/agents/availability.ts) foi escrita para evitar.

**O e2e por último, e um só.** Ele é o único teste que prova o §1 do PRD, e ele falha se qualquer passo
quebrar. Os oito passos já têm cobertura própria por cima — este é a costura.

---

## Decisões que sustentam o resto

### D1 — O corte entre `ui/` e `setup/` é o mesmo corte que o Open Design fez

O desenho separou `lumem-ds.css` (compartilhado) de `lumem-onboarding.css` (só desta tela). O porte
respeita a linha:

| Do desenho | Vai para | O quê |
|---|---|---|
| `lumem-ds.css` | `packages/web/src/ui/` | `wizard`, `steps`, `check`/`ck`, `choice`, `copy`, `recap`, `coach` |
| `lumem-onboarding.css` | `packages/web/src/setup/` | `flow`, `tri`, `adv`, `mode`, `wire`, `keys` |

O motivo de não jogar tudo em `setup/`: metade dessas classes é o vocabulário da **tela de
preferências** que não existe ainda, e do diagnóstico de qualquer dia. Nascer em `ui/` com entrada no
[`Styleguide`](../../../packages/web/src/ui/Styleguide.tsx) é o que evita a segunda pintura quando essa
tela chegar.

### D2 — Nada do fluxo escreve estado próprio

Sem tabela `settings`, sem flag `onboarded`, sem coluna nova. O que o fluxo produz é **dado do daemon**
— workspace, `agent_config`, projeto, worktree, sessão — e é a existência desses dados que responde
"já passou por aqui?" ([O1](open-questions.md)).

Preferência de tela (o "não mostrar de novo" do balão) fica no `localStorage`, onde as outras três já
estão ([O16](open-questions.md)).

### D3 — O pré-voo lê e não escreve

Nem para testar permissão: `access(W_OK)`, não um arquivo temporário. Uma tela de diagnóstico que
escreve é uma tela que pode ser a causa do problema que está diagnosticando.

### D4 — A sonda não é sessão

`setup.probe` chama o `AcpManager` direto, com `cwd` em `~/.lumem/probe`, **sem** passar pelo
`SessionStore`. Nenhuma linha em `session`, nenhum `session/prompt`, nenhum token
([O8](open-questions.md)). O processo morre no `finally` — inclusive quando o `session/new` falha, que
é o caminho em que vazar processo é mais fácil.

### D5 — A tela nunca instala nada

O botão "Instalar agora" do desenho não é implementado ([O6](open-questions.md)). O comando fica
selecionável, e ao lado dele o **"já instalei — verificar"**, que re-roda a `setup.agents`.

### D6 — Cada passo é saltável, menos o workspace

Sem workspace não existe app. Todo o resto tem "pular" ([O2](open-questions.md)) — inclusive o agente,
porque o Lumem roda com sessão de shell e a conversa se liga depois.

### D7 — A troca do handshake é reconstrução, e diz que é

A sonda devolve dados tipados; a tela desenha as linhas de JSON-RPC a partir deles. O rótulo é **"o que
o daemon mandou e o que voltou"**, nunca "log" ([O9](open-questions.md)).

### D9 — Pular o agente pula o handshake — nasceu na execução

`handshake` não é passo próprio: é o passo 2 ainda acontecendo. Pular o agente e cair nele faria o
daemon **subir um adaptador** para provar uma conexão que a pessoa acabou de dispensar.

Então `skip` tem uma exceção, uma só, e ela está no código com esse nome. O trilho continua dizendo
cinco passos, que é o que todas as telas dizem.

### D10 — O fluxo abre a conversa, e isso custou uma prop — nasceu na execução

O passo 5 promete **"criar e abrir a conversa"**. A aba ativa de uma worktree, porém, nasce em
`contexto` — o que é certo em todo outro caminho de entrada e errado neste.

`ScopePanel` ganhou um `openSessionId` **de um disparo só**: traz aquela aba para a frente quando ela
aparece, e depois nunca mais opina. O e2e é o que prova que a promessa da tela vale, e foi ele que
achou a falta.

### D8 — Os passos 5, 6 e 7 reusam o que já existe

`FirstRun`, [`AddProjectDialog`](../../../packages/web/src/components/AddProjectDialog.tsx) e
[`CreateWorktreeDialog`](../../../packages/web/src/components/CreateWorktreeDialog.tsx) já têm o
formulário, a validação e o erro-do-daemon de cada um desses três passos. A task **extrai** o miolo e o
usa nos dois lugares; o que não der para reusar é nomeado na própria task, com o motivo.

Recriar seria criar um segundo jeito de adicionar projeto — e o segundo jeito é o que sempre fica sem a
correção que o primeiro recebeu.

---

## Fase 1 — A casca do fluxo

**Done when da fase:** dá para atravessar as nove posições do fluxo do começo ao fim com as telas que
não pedem daemon novo, e ele não aparece para quem já tem workspace.

---

#### T0: Corrigir o desenho antes de portar ✅

**What**: Aplicar no Open Design as cinco divergências do [§4 do PRD](prd.md) e trazer por `design:sync`.
**Where**: projeto `lumem-os` do Open Design (`lumem-onboarding-flow.html`, `lumem-onboarding.css` se
mexer), depois `packages/web/prototype/` pelo sync
**Depends on**: nada

**Done when**:
- [x] O comando de instalação passa a ser `npm i -g @agentclientprotocol/claude-agent-acp` e o binário
      `claude-agent-acp` — o nome medido em [pty-vs-acp §9](../../project/pty-vs-acp.md), não
      `@zed-industries/claude-code-acp`
- [x] A seção de autenticação da tela 3 deixa de ser duas opções de rádio e passa a **relatar** o que a
      sonda achou ([O5](open-questions.md))
- [x] O sufixo `escolher…` sai das telas 5, 6 e 7 ([O10](open-questions.md))
- [x] A tela 9 lista **só** os atalhos que existem — hoje, `⌘⏎`
- [x] O rodapé do composer na tela 8 passa a dizer `⌘⏎ enviar · ⏎ nova linha`, que é o que o produto
      faz
- [x] O botão "Instalar agora" (tela 3) e o "Já tenho um `~/.lumem`" (tela 1) saem
- [x] Os dois seletores de "padrão das próximas sessões" (tela 4) saem ou viram leitura
      ([O14](open-questions.md))
- [x] `pnpm --filter @lumem/web design:sync --check` fica verde depois do sync
- [x] Nenhum token novo — se o desenho pedir um, ele nasce lá e chega pelo mesmo sync

**Tests**: nenhum — é desenho · **Gate**: nenhum
**Commit**: `chore(design): sync the corrected onboarding flow`

---

#### T1: As primitivas compartilhadas ✅

**What**: `Steps`, `CheckList`/`CheckRow`, `Choice`, `CopyCommand`, `Recap` e `Coach` em `ui/`, com o
CSS que o `lumem-ds.css` desenhou.
**Where**: `packages/web/src/ui/` (componentes novos + `index.ts` + `ui.css`),
`packages/web/src/ui/Styleguide.tsx`
**Depends on**: T0

**Done when**:
- [x] **Sete**, não seis: o `WizardCard` (mais o `WizardSection`) entrou junto, porque o cartão do
      passo é o que segura todos os outros e ficaria sem casa
- [x] E **um a menos** do que a task previa: o `Recap` não existe como componente. Ele é o
      `MetaGrid` numa segunda densidade (`variant="recap"`), porque a `dl`, o par e a razão de
      existir são os mesmos — o que muda é truncar (coluna estreita) ou quebrar linha (recibo largo).
      Uma segunda cópia seria a que deixaria de receber a correção que a primeira recebeu
- [x] Cada um com o markup do desenho e **nenhum literal** de cor, espaço ou tipografia
- [x] `CheckRow` cobre os quatro estados que o desenho usa: `ok`, `warn`, `fail`, `running` — e o
      quarto existe porque a tela 2 re-verifica
- [x] `CopyCommand` copia de verdade (`navigator.clipboard`), e quando a API não existe o comando
      continua **selecionável** — que é o que importa
- [x] `Choice` é botão, não `input[type=radio]`: o desenho o usa como cartão com marcador, e um rádio
      real traria estilo de agente que o resto do app não tem
- [x] `Coach` tem as duas ações do desenho — **entendi** e **não mostrar de novo** — e não sabe onde a
      preferência é guardada (quem chama decide)
- [x] Cada um com entrada no `Styleguide`, porque é lá que a próxima tela vai descobrir que eles existem
- [x] O `Steps` é **`aria-hidden`**: toda tela que mostra o trilho também diz "passo 3 de 5" em
      palavras, e um trilho que se anunciasse leria a posição duas vezes — uma como frase, outra como
      cinco itens cujo conteúdo é a palavra "workspace"
- [x] O título do `WizardCard` é **`h2`**, não o `h1` do protótipo: no app o cartão vive sob um
      topbar cujo `h1` é o produto, e dois deixam o leitor de tela com dois sumários
- [x] O `.kbd` **subiu** de `conversation.css` para `ui/ui.css` — dica de tecla é do app, não da
      conversa. O `BORROWED` da auditoria da conversa ganhou a entrada
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **14** — Steps, os quatro estados do CheckRow, o grupo, o conserto na linha, o
      radiogroup, a opção recusada, copiar, copiar sem clipboard, as duas saídas do Coach, o Coach
      sem memória, a `dl` do recibo, e o `h2` do cartão

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the shared primitives the setup flow is drawn with`

---

#### T2: O CSS do fluxo, e a auditoria do porte ✅

**What**: `setup.css` com o que é só desta tela, mais o teste que prova que classe pedida existe.
**Where**: `packages/web/src/setup/setup.css`, `packages/web/src/setup/setup-css.test.ts`
**Depends on**: T1

**Done when**:
- [x] `flow`, `tri`, `adv`, `wire`, `keys` — **cinco**, não seis. O `.mode` do protótipo ficou fora, e
      a auditoria é quem obriga: os dois seletores de "padrão das próximas sessões" saíram na T0
      ([O14](open-questions.md)), então portar a pintura deles deixaria CSS sem markup
- [x] Duas classes que o protótipo **não** tem: `.wizard__form` (o `<form>` que dá significado nativo
      ao `⏎`) e `.key__link` (o "voltar ao fluxo" dentro de uma linha do recibo). Não é divergência de
      porte, é markup que o React precisou e o HTML solto não
- [x] A auditoria de porte segue o padrão da
      [`conversation-css.test.ts`](../../../packages/web/src/components/conversation-css.test.ts):
      **toda classe que um componente do fluxo pede existe no stylesheet**, e classe definida que
      ninguém pede é apontada
- [x] **Verificado por mutação**: apagar `.tri__g` do `setup.css` fez o teste falhar nomeando
      `tri__g`
- [x] A lista de componentes é um **`readdirSync`**, não um array à mão: array é lista que deixa de
      estar completa no dia em que alguém acrescenta uma tela — que é o dia em que este teste
      importaria. Tem um teste sobre o próprio teste, para uma pasta vazia não deixar tudo verde por
      vacuidade
- [x] Nenhum literal fora dos fios óticos de 1–2px que o resto do app já usa
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **2** — classe pedida existe, classe definida é usada

**Tests**: unitário (leitura de arquivo) · **Gate**: quick
**Commit**: `feat(web): the setup flow stylesheet, with its port audit`

---

#### T3: A casca, a régua e o portão ✅

**What**: `SetupFlow` — a casca sem sidebar, a régua de cinco passos, a navegação, e a condição que faz
o fluxo aparecer.
**Where**: `packages/web/src/setup/SetupFlow.tsx` + teste, `packages/web/src/App.tsx`
**Depends on**: T2

**Done when**:
- [x] O fluxo **substitui** o `FirstRun` no galho do `App` ([O3](open-questions.md)) — sem roteador
      novo, sem modal
- [x] Régua de cinco passos com os três estados do desenho: `done`, `now`, e por vir
- [x] `⏎` avança e `esc` volta, em toda tela, e o rodapé diz isso
- [x] Cada passo é saltável menos o workspace (D6), e pular é uma ação visível — não um `X` no canto
- [x] Sem workspace → fluxo; com workspace → app. Nenhum estado novo em disco (D2)
- [x] O `FirstRun` sai do repositório: o passo 5 é ele, dentro do fluxo. Deixar os dois seria dois
      caminhos para criar workspace, e um deles sem os outros quatro passos
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~7** — aparece sem workspace, não aparece com, avança, volta, pula, não pula o
      workspace, régua marca o passo certo

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the setup flow shell, and what makes it appear`

---

#### T4: Boas-vindas ✅

**What**: A tela 1 — o que o produto é, antes de pedir qualquer coisa.
**Where**: `packages/web/src/setup/Welcome.tsx` + teste
**Depends on**: T3

**Done when**:
- [x] As três frases do desenho (`tri`): worktree por tarefa, agente por ACP, vários ao mesmo tempo
- [x] O estado do daemon é **lido**, não afirmado: a versão e a porta vêm do `health`, e daemon
      inacessível aqui é o mesmo estado desenhado que o resto do app tem
- [x] Um CTA só, e ele começa o fluxo. O "Já tenho um `~/.lumem`" saiu na T0
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **3** — desenha as três frases, lê a versão do daemon, daemon fora do ar

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the welcome screen of the setup flow`

---

#### T5: Pronto ✅

**What**: A tela 9 — o recibo do que passou a existir na máquina.
**Where**: `packages/web/src/setup/Done.tsx` + teste
**Depends on**: T3

**Done when**:
- [x] O recibo é **lido do daemon** — workspace, agente com a versão pinada, projeto, worktree, sessão —
      e não montado do que o fluxo lembra de ter enviado. Recibo que mostra o que foi pedido, e não o
      que existe, é o recibo errado
- [x] Um passo pulado aparece como pulado, com o link que o resolve depois
- [x] Os atalhos: só `⌘⏎` (T0). No lugar dos três que saíram, **onde as coisas ficam** — sidebar, rodapé
      de agentes, painel direito
- [x] **Abrir o workspace** entra no app; **revisar a configuração** volta ao passo 1
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **4** — recibo do daemon, passo pulado, os dois botões

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the receipt that closes the setup flow`

---

## Fase 2 — A máquina, o agente e o handshake

**Done when da fase:** numa máquina sem o adaptador, a tela diz exatamente o que instalar; com ele, a
sonda conecta e a `agent_config` ACP nasce com a versão **detectada**.

---

#### T6: `setup.preflight` ✅

**What**: As cinco checagens da máquina, tipadas, com o conserto na própria linha.
**Where**: `packages/server/src/setup/preflight.ts` + teste, `packages/server/src/routers/setup.ts`,
`routers/index.ts`, `packages/shared/src/`
**Depends on**: nada — servidor

**Done when**:
- [x] `{ id, state: 'ok'|'warn'|'fail', label, value, fix?: { command } }`, uma por checagem
- [x] `daemon` (versão e endereço), `git` (versão + `worktree` existe), `node` (versão e caminho),
      `stateDir` (existe + `W_OK`), `disco` (livre, via `statfs`)
- [x] A resposta ganhou um campo que o PRD não previa: **`paths`** — `stateDir`, `databasePath`,
      `worktreesDir`, `transcriptsDir`. O passo do workspace diz o que foi escrito no disco, e um
      cliente compondo `~/.lumem` erraria exatamente na máquina onde alguém moveu o `LUMEM_STATE_DIR`
- [x] O `~/.lumem` do desenho está errado e a checagem corrige: o daemon cria o `stateDir` no boot,
      então quando esta tela aparece a pasta **existe** — a linha diz o que tem dentro, e é o passo 3
      que diz o que passou a ter ([O4](open-questions.md))
- [x] `git` < **2.30** é `fail` e a frase diz **por quê** — `--orphan` muda de comportamento antes
      dessa versão —, não "versão inválida"
- [x] `git` ausente do PATH é `fail`, não exceção
- [x] Uma checagem que estoura vira `fail` com a mensagem, e **as outras quatro continuam** (F2.5)
- [x] **Formatado no servidor, não na tela** — o contrário do que esta task dizia. Toda checagem
      devolve um `value` já em palavras, e fazer do disco a única que devolve número obrigaria a tela a
      saber qual das cinco linhas é especial. A consistência ganhou; o custo é que trocar GB por GiB
      é mudança de daemon
- [x] **Não escreve nada** (D3) — nem para testar permissão
- [x] `PATH` e o executor de processo entram por parâmetro, como a `availability.ts` já faz, para o
      teste não depender da máquina
- [x] **Verificado por mutação**: trocar `2.30` por `2.20` faz o teste do `git` velho falhar
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~10** — cada checagem ok, git velho, git ausente, sem permissão de escrita, uma
      checagem estourando sem levar as outras

**Tests**: unitário · **Gate**: quick
**Commit**: `feat(server): report what the machine can and cannot do`

---

#### T7: `setup.agents` ✅

**What**: Achar `claude` e o adaptador, com caminho e versão.
**Where**: `packages/server/src/setup/agents.ts` + teste, `routers/setup.ts`
**Depends on**: T6 (o router existe)

**Done when**:
- [x] Para cada binário: encontrado, caminho absoluto, versão
- [x] A versão vem de `<binário> --version` com **timeout de 3s**, e `stderr` conta como saída — vários
      CLIs escrevem versão lá
- [x] **Versão não lida não é falha**: a linha diz "encontrado, versão não lida"
      ([O7](open-questions.md)). O que decide o passo é a sonda, não isto
- [x] Adaptador ausente vem com o comando de instalação, com o nome de pacote da T0
- [x] Diz se `ANTHROPIC_API_KEY` está no ambiente do daemon — **presente ou não**, nunca o valor
- [x] Reusa a `isCommandAvailable`; não escreve uma segunda busca de `PATH`
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~7** — os dois encontrados, adaptador ausente, `--version` travando, versão no
      `stderr`, chave presente, chave ausente

**Tests**: unitário · **Gate**: quick
**Commit**: `feat(server): find the agent binaries, and their versions`

---

#### T8: A sonda ✅

**What**: `setup.probe` — sobe o adaptador, faz o handshake, devolve o que veio, mata o processo.
**Where**: `packages/server/src/setup/probe.ts` + teste, `packages/server/src/acp/AcpManager.ts`
(expor `initialize`), `packages/server/src/config.ts` (`probeDir`), `routers/setup.ts`
**Depends on**: T7

**Done when**:
- [x] Devolve `protocolVersion`, `agentInfo` (nome e **versão**), `authMethods`, as capacidades
      declaradas, o id da sessão de teste e o tempo de cada etapa
- [x] O `AcpManager` passa a **guardar a resposta do `initialize`** — hoje ele lê `protocolVersion` e
      `agentCapabilities.loadSession` e descarta o resto, e é justamente o resto que a tela 4 mostra
- [x] **Nenhuma linha em `session`** e **nenhum token** (D4)
- [x] `cwd` em `~/.lumem/probe`, criado sob demanda — é a única escrita da sonda, e ela é uma pasta
      vazia
- [x] O processo morre no `finally`, inclusive quando o `session/new` falha
- [x] Falha vira frase: adaptador ausente, versão de protocolo divergente, autenticação exigida — cada
      uma com o que fazer. A `launchFailure` que a `acp-sessions` escreveu já faz metade disso
- [x] Timeout próprio, curto: uma sonda que pendura a tela é pior que uma sonda que falha
- [x] Testado com o [`acp-fake-agent`](../../../packages/server/src/testing/acp-fake-agent.ts) —
      inclusive um que **recusa** `session/new` e um que declara `authMethods` não vazio
- [x] **Verificado por mutação**: tirar o `kill` do `finally` faz o teste de processo órfão falhar
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~8**

**Tests**: integration (agente falso) · **Gate**: quick
**Commit**: `feat(server): probe the ACP adapter without opening a session`

---

#### T9: A máquina na tela ✅

**What**: A tela 2 — as cinco checagens, o aviso do `git`, e o "verificar de novo".
**Where**: `packages/web/src/setup/MachineStep.tsx` + teste
**Depends on**: T6, T3

**Done when**:
- [x] Uma `CheckRow` por checagem, com o valor que o daemon leu
- [x] `fix` aparece **selecionável**, na linha que falhou — não num banner longe dela
- [x] "Verificar de novo" re-roda a query e mostra `running` enquanto isso
- [x] Bytes são formatados **aqui** (GB), com o daemon devolvendo o número
- [x] `fail` **não bloqueia** o Continuar (D6); ele avisa
- [x] O banner do `git` mínimo, como no desenho, e ele só aparece quando a versão importa
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~6**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the machine preflight screen`

---

#### T10: O agente na tela ✅

**What**: A tela 3 — o que foi encontrado, o que instalar, e o que a autenticação vai ser.
**Where**: `packages/web/src/setup/AgentStep.tsx` + teste
**Depends on**: T7, T9

**Done when**:
- [x] As duas linhas de detecção, com caminho e versão
- [x] Adaptador ausente: comando selecionável + **"já instalei — verificar"**, e **nada** que instale
      (D5)
- [x] A autenticação é **relatada** (F3.6): credencial local, chave no ambiente, ou o método que o
      adaptador exigiu
- [x] A linha `avançado` mostra o comando, os argumentos e o env herdado — leitura, e é isso que o
      desenho já desenhou
- [x] "Testar conexão" fica **desabilitado** enquanto o adaptador não é encontrado, com a frase dizendo
      o que libera — a mesma regra da `AgentConfigDialog`
- [x] Pular o passo é possível, e o que se perde é dito numa frase: sem agente ACP, sessão é terminal
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~7**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the agent step, and what it refuses to install`

---

#### T11: O handshake na tela, e a configuração que nasce dele ✅

**What**: A tela 4 — a prova de que conectou — e a `agent_config` criada com a versão detectada.
**Where**: `packages/web/src/setup/HandshakeStep.tsx` + teste
**Depends on**: T8, T10

**Done when**:
- [x] As cinco linhas de verificação do desenho, cada uma com o dado que a sonda trouxe
- [x] A troca aparece com as setas de direção, rotulada como **reconstrução** (D7) — não "log"
- [x] A tela afirma **"nenhum token consumido"**, e isso é verdade porque não há `session/prompt` (D4)
- [x] Ao continuar, cria a `agent_config` por `agentConfig.create`, `transport: 'acp'`, com
      `adapterVersion` vindo do `agentInfo.version` — **nada digitado à mão** (F3.5)
- [x] Se já existe configuração ACP com o mesmo comando, o fluxo **reusa** em vez de deixar o daemon
      recusar o nome. Quem rodou o fluxo duas vezes não deveria ter de pensar nisso — e a recusa por
      nome duplicado continua aparecendo com as palavras do daemon quando ela acontece por outro
      motivo
- [x] "Testar de novo" re-roda a sonda
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~6**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): show the handshake, then pin the version it reported`

---

#### T12: A sonda contra o adaptador real ✅

**What**: Um integration marcado, com o `claude-agent-acp` de verdade.
**Where**: `packages/server/src/setup/probe.integration.test.ts`,
[`docs/project/testing.md`](../../project/testing.md)
**Depends on**: T8

**Done when**:
- [x] **Pulado** quando `claude-agent-acp` não está no PATH — o mesmo padrão do handshake que a
      `acp-sessions` já tem, e do `git` real da `right-panel`
- [x] Para em `initialize` + `session/new`: zero token, medido pelo spike
- [x] Falha se `protocolVersion`, `agentInfo` ou a forma de `authMethods` divergirem — é o detector de
      quebra de versão do adaptador, e é o único lugar onde ela aparece antes do usuário
- [x] A matriz do `testing.md` ganha a linha
- [x] Gate: `pnpm gate:full`
- [x] Test count: **1**

**Tests**: integration marcado · **Gate**: full
**Commit**: `test(server): probe the real adapter, when it is installed`

---

## Fase 3 — Workspace e projeto

**Done when da fase:** workspace criado dizendo o que escreveu no disco, e projeto **inspecionado antes**
de entrar.

---

#### T13: `project.inspect` ✅

**What**: Ler o repositório antes de registrar.
**Where**: `packages/server/src/routers/project.ts`, `packages/server/src/git/GitService.ts` + testes
**Depends on**: nada — servidor

**Done when**:
- [x] Devolve: é repo git?, contagem de commits, HEAD (branch e sha curto), remoto (nome e URL), árvore
      limpa ou suja, e as worktrees **já registradas** ali
- [x] É **query**: não grava nada, e um caminho recusado não deixa nada atrás (F4.4)
- [x] Cada leitura falha sozinha: repositório sem remoto e repositório sem commit são casos normais, não
      erro
- [x] Reusa `isGitRepo`, `getStatus` e `listWorktrees`; o que falta (`commitCount`, `remote`) entra no
      `GitService`, não no router
- [x] `worktrees` conta as que o **git** conhece, e a resposta diz quantas dessas o **Lumem** não
      conhece — que é a informação que a tela mostra
- [x] Integration contra repositório git real, como a `right-panel` já faz
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~8** — repo limpo, sujo, sem remoto, sem commit, com worktree externa, caminho que
      não é repo, caminho que não existe, caminho relativo recusado

**Tests**: integration (git real) · **Gate**: quick
**Commit**: `feat(server): read a repository before registering it`

---

#### T14: Workspace ✅

**What**: A tela 5 — criar o workspace, e dizer o que passou a existir no disco.
**Where**: `packages/web/src/setup/WorkspaceStep.tsx` + teste
**Depends on**: T3

**Done when**:
- [x] Nome, com o erro do daemon nas palavras dele (nome duplicado é o caso comum)
- [x] Onde as worktrees ficam: **leitura**, com `LUMEM_STATE_DIR` nomeado ao lado
      ([O11](open-questions.md))
- [x] O `Recap` do "o que este passo escreve no disco" lista os caminhos **que o daemon reporta**, não
      uma lista escrita à mão no cliente
- [x] Reusa o miolo do `FirstRun` (D8); o `FirstRun` sai do repositório na T3
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **4**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): create the first workspace inside the flow`

---

#### T15: Projeto ✅

**What**: A tela 6 — o caminho, o que o Lumem leu dali, e o aviso das worktrees que já existem.
**Where**: `packages/web/src/setup/ProjectStep.tsx` + teste
**Depends on**: T13, T14

**Done when**:
- [x] Caminho **absoluto digitado**, sem `escolher…` (T0, [O10](open-questions.md))
- [x] A inspeção roda quando o campo se acalma, e mostra as quatro linhas do desenho
- [x] Worktrees pré-existentes são `warn` com a frase do desenho: continuam onde estão, o Lumem não
      mexe. **Não** viram lista na sidebar ([O17](open-questions.md))
- [x] O banner do "seu checkout continua sendo seu", com o caminho de destino das worktrees
- [x] A recusa diz **qual** verificação falhou, que é o que o `project.add` já faz
- [x] "Clonar de uma URL" **não** existe: a opção sai da tela e vai para o backlog
- [x] Reusa o miolo do `AddProjectDialog` (D8)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~7**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): inspect a repository, then add it`

---

## Fase 4 — A primeira tarefa, o balão, e a costura

**Done when da fase:** banco vazio → primeiro turno de conversa, tudo pela tela, provado por um e2e.

---

#### T16: `worktree.plan` ✅

**What**: A prévia da worktree, sem escrever nada.
**Where**: `packages/server/src/routers/worktree.ts` + teste
**Depends on**: T13

**Done when**:
- [x] Devolve caminho de destino, branch, base (nome + **sha curto**) e o **comando `git`** que vai
      rodar
- [x] O comando é montado **no mesmo lugar** que o executa ([O13](open-questions.md)) — não uma segunda
      montagem que mente na primeira mudança de flag
- [x] Nome inválido é recusado aqui com a mesma regra do `create`, e a prévia diz qual regra
- [x] Nome já usado é dito **na prévia**, não na criação
- [x] Nada é escrito
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~5**

**Tests**: unitário + integration · **Gate**: quick
**Commit**: `feat(server): preview the worktree before creating it`

---

#### T17: A primeira tarefa ✅

**What**: A tela 7 — nome, base, a prévia, e o que abre junto.
**Where**: `packages/web/src/setup/TaskStep.tsx` + teste
**Depends on**: T16, T15

**Done when**:
- [x] Nome da tarefa e base, com a prévia do daemon atualizando junto
- [x] As duas saídas do desenho: **worktree + sessão do agente** (padrão) ou **só a worktree**
- [x] A opção da sessão só aparece quando existe `agent_config` ACP — quem pulou o passo 3 não vê uma
      escolha que não pode fazer
- [x] Criar dispara `worktree.create` e, no padrão, `session.createAgent`, **nessa ordem**, e uma falha
      na segunda não desfaz a primeira: a worktree existe e a tela diz isso
- [x] Reusa o miolo do `CreateWorktreeDialog` (D8)
- [x] Ao terminar, o fluxo **entra no app**, na aba da conversa que acabou de nascer
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **~7**

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): the first task, previewed before it exists`

---

#### T18: O balão da primeira permissão ✅

**What**: Explicar o modo `Auto` na primeira vez que ele para e pergunta.
**Where**: `packages/web/src/components/Conversation.tsx`,
`packages/web/src/hooks/useFirstPermissionCoach.ts` + testes, `setup.css` (`coach--after`)
**Depends on**: T1

**Done when**:
- [x] Aparece **depois** do pedido de permissão, nunca sobre ele: a primeira ação continua sendo
      responder
- [x] Some com **entendi**; **não mostrar de novo** grava no `localStorage`
      ([O16](open-questions.md)), com o mesmo cuidado do
      [`useActiveWorkspace`](../../../packages/web/src/hooks/useActiveWorkspace.ts) para navegador com
      storage desligado
- [x] Só na **primeira** permissão da máquina, não na primeira de cada sessão
- [x] Não bloqueia o composer — o pedido de permissão já bloqueia, e dois bloqueios pela mesma razão é
      um a mais
- [x] Gate: `pnpm gate:quick`
- [x] Test count: **4** — aparece uma vez, não aparece de novo, dispensa, storage desligado

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): explain Auto the first time it stops and asks`

---

#### T19: O e2e que prova o objetivo ✅

**What**: Banco vazio → primeiro turno de conversa, tudo pela tela.
**Where**: `e2e/onboarding.spec.ts`, [`docs/project/testing.md`](../../project/testing.md)
**Depends on**: T17, T18

**Done when**:
- [x] Começa com `~/.lumem` **vazio** e termina com uma resposta do agente na tela
- [x] Atravessa os cinco passos **pela UI**, sem tocar a API em nenhum deles — é o que o resto da suíte
      faz e é justamente o caminho que esta feature existe para tornar dispensável
- [x] Usa o [fake ACP](../../../e2e/support/fake-acp-agent.mjs) como adaptador, com `PATH` apontando
      para ele — inclusive na detecção da tela 3
- [x] Verifica o que o desenho promete e o produto tem que cumprir: a versão pinada na
      `agent_config` é a que a sonda reportou
- [x] **Verificado por mutação**: trocar `agentInfo.version` por uma versão digitada à mão no passo do
      handshake fez o spec falhar — que é a mutação que interessa, porque é a promessa central da
      feature. As outras quatro não foram exercitadas uma a uma
- [x] A matriz do `testing.md` ganha a linha
- [x] Gate: `pnpm gate:full`
- [x] Test count: **1**

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): an empty machine reaches the first turn`

---

#### T20: A documentação que a feature muda ✅

**What**: Fechar o registro: índice, estado do projeto, backlog.
**Where**: [`docs/README.md`](../../README.md), [`CLAUDE.md`](../../../CLAUDE.md),
[`docs/project/backlog.md`](../../project/backlog.md), `open-questions.md` desta feature
**Depends on**: T19

**Done when**:
- [x] O índice e o `CLAUDE.md` dizem que o primeiro acesso existe, e param de dizer que o `FirstRun` é
      o que recebe a máquina vazia
- [x] A [seção G do backlog](../../project/backlog.md) — escrita junto deste PRD, porque adiamento
      entra na hora — continua verdadeira: o que a implementação adiar a mais entra ali, com gatilho
- [x] Toda pergunta que a implementação respondeu na prática vira `[x]` com o motivo — e o que ela
      abriu vira pergunta nova
- [x] O que o portão **não** prova fica escrito, como a `file-editor` fez
- [x] Gate: nenhum — documentação

**Tests**: nenhum · **Gate**: nenhum
**Commit**: `docs(onboarding): the first-run flow exists, and what it deferred`

---

## O que fica de fora, e onde entra

| Fora desta feature | Onde |
|---|---|
| Instalar o adaptador pela tela | [backlog](../../project/backlog.md) — [O6](open-questions.md). Volta se instalar à mão virar a reclamação mais comum de quem tenta usar |
| Clonar projeto de uma URL | [backlog](../../project/backlog.md) — rede, credencial, progresso e cancelamento são feature própria |
| Worktrees `externas` listadas na sidebar | [backlog](../../project/backlog.md) — [O17](open-questions.md). A detecção fica; a listagem é feature de sidebar |
| Paleta de comandos (`⌘K`), `⌘⇧N`, `⌥⇧P` | [backlog](../../project/backlog.md) — a tela 9 promete e o produto não tem |
| Caminho das worktrees editável | [backlog](../../project/backlog.md) — [O11](open-questions.md); pede coluna, migração e mudança de estado |
| Padrão de modelo e modo das próximas sessões | [backlog](../../project/backlog.md) — [O14](open-questions.md); não há onde guardar, e criar coluna para um seletor é a ordem invertida |
| Tela de preferências (onde `agent_config` deveria morar) | buraco nº 1 do `FEATURES.md` do Open Design, e a [A16](../acp-sessions/open-questions.md). As primitivas da **T1** são o que ela vai reusar |
| Renomear e remover workspace pela tela | buraco nº 2 do `FEATURES.md`; o fluxo cria, não administra |
| Pré-voo em Linux e Windows | fora — o PRD §6 diz que ninguém verificou, em vez de fingir que sim |

---

## O que a execução achou

Nove coisas que o plano não previa. Todas estão nas tasks acima; aqui é a lista curta.

| O quê | Onde ficou |
|---|---|
| **O desenho instalava o pacote errado** — e a T0 existia justamente para isso, mas a correção precisou de sete edições, não uma: comando, binário, `pid`, o adaptador da conversa e o recibo repetiam o nome | T0 |
| **`agentInfo.version` existe de verdade** — o integration marcado passou contra o `claude-agent-acp` instalado nesta máquina, então a promessa "versão detectada, não digitada" está medida e não suposta | T12 |
| **O `Recap` não deveria existir** — é o `MetaGrid` em outra densidade. Duas primitivas com a mesma `dl` e a mesma razão de ser é a duplicação que este repo pune | T1 |
| **O `.mode` não foi portado** — e é a auditoria de porte que obriga: a T0 tirou os seletores do desenho, então a pintura deles seria CSS sem markup | T2 |
| **Os bytes ficaram formatados no servidor** — o contrário do que a task dizia. Cinco checagens que devolvem palavras e uma que devolve número obrigariam a tela a saber qual é a especial | T6 |
| **O `preflight` ganhou `paths`** — o PRD não previa, e o passo do workspace não tinha como dizer a verdade sem ele | T6 |
| **Pular o agente tem de pular o handshake** — senão o daemon sobe um adaptador para provar o que a pessoa dispensou | D9 |
| **Abrir a conversa não era de graça** — a aba de uma worktree nasce em `contexto`, e a promessa do passo 5 exigiu um `openSessionId` de um disparo | D10 |
| **O `ensureWorkspace` do e2e virou uma caminhada de cinco telas** — e expôs uma corrida que já existia no `ensureProject`: `isVisible` responde sobre o quadro atual, e a lista de projetos chega um round trip depois da sidebar | T19 |

### O que o portão não prova

- **Nenhuma tela foi vista em navegador de verdade além do e2e.** O jsdom não aplica stylesheet: a
  auditoria garante que a classe existe, não que o cartão caiba na janela. O protótipo renderizado é o
  que responde por isso, e ele é a fonte.
- **O pré-voo é o de macOS.** `statfs` e o formato do `git --version` foram exercitados aqui e com
  seams; Linux provavelmente passa e ninguém verificou.
- **A sonda contra adaptador que exige autenticação é dublê.** O caminho existe, tem teste com agente
  falso, e nunca rodou contra um adaptador real pedindo login — porque o desta máquina não pede.
- **`⏎` avança porque é `submit` de formulário.** Foi verificado em jsdom e no e2e por clique; a
  navegação por teclado pura, tela a tela, não tem teste próprio.
- **Quatro dos cinco passos do e2e não foram mutados um a um.** A mutação exercitada foi a da versão
  pinada.
