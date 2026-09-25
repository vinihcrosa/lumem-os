# O daemon confere quem fala com ele — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** em execução

**Fase 1 completa — 7 de 7 entregues**, em 2026-09-22. As seis perguntas estavam
[fechadas](open-questions.md) antes da primeira linha de código, e todas pela proposta da PRD; a S1 e
a S5 viraram o
[ADR de 2026-09-22](../../adr/2026-09-22-0718-daemon-answers-only-on-loopback-until-it-authenticates.md).

As fases 2 (token em cookie) e 3 (token por sessão) **não têm tasks**, e é por isso que o `Status:` é
`em execução` e não `completa`: elas nascem quando esta tiver rodado por um tempo. A fase 1 é a que
não depende de nada e a que fecha as três ameaças que uma aba aberta em qualquer site exerce hoje.

A ordem é a do risco, e o risco aqui é **quebrar o desenvolvimento**: a feature não acrescenta função
nenhuma, então tudo que ela pode fazer de errado é impedir o que já funcionava. Por isso a regra
nasce pura e testada (T1) antes de entrar em qualquer caminho, o `Host` vem antes do `Origin` (é a
checagem incondicional), e a T6 — o que faz `pnpm dev` e o e2e continuarem de pé — é tratada como
task e não como consequência.

**Um commit, e não sete.** A T1 sozinha não defende nada e a T6 sozinha não faz sentido: separar a
regra da ligação dela deixaria a árvore num estado em que a suíte passa e o daemon está aberto, que é
exatamente o estado que esta feature existe para acabar.

---

## Antes de começar

**O que não trava** (medido em 2026-09-22, nesta árvore):

- **não há CORS registrado**, e isso é a favor: o browser já bloqueia leitura cross-origin e já exige
  preflight para `POST` com JSON. O que falta é o que o CORS não cobre — `Host`, WebSocket e `GET`
  com efeito;
- o roteador de upgrade **já existe** (`ws/upgrade.ts`) e já escreve resposta HTTP crua em socket:
  a recusa antes do handshake tem onde morar;
- o cliente fala em **origem relativa** (`/trpc`, e `window.location` nos dois sockets), então
  nenhuma linha do `web` muda;
- a origem única da fase 2 **já existe**: desde a [distribution](../014-distribution/prd.md) o daemon
  serve o web na própria porta.

**Premissas travadas:**

- **A1** — a fase 1 **não** acrescenta credencial nenhuma. Pedido sem sinal de browser passa, e isso
  é o produto: as portas do agente são `curl` para `/memory/ask` e `POST /tasks`.
- **A2** — nenhuma tela. Recusa é `text/plain`, uma frase, como toda recusa do daemon.
- **A3** — **nenhum spec de e2e novo.** A suíte inteira continuar verde é a prova de que o browser e
  a API do e2e ainda entram, e é o teste de regressão da feature.
- **A4** — a checagem de `Host` não é configurável para desligar. A única forma de alargar é
  `LUMEM_HOST`.

---

## Fase 1 — o transporte confere quem fala

#### T1: As regras, em funções puras

**What**: `Host`, `Origin`, `Sec-Fetch-Site` e "isto é loopback?" como funções sem Fastify e sem
socket.
**Where**: `packages/server/src/auth/origins.ts`, `origins.test.ts`

**Done when**:
- [x] `parseAuthority` lê `127.0.0.1:4317`, `localhost`, `[::1]:4317`, normaliza caixa e o ponto
      final de FQDN, e devolve `null` para o que não dá para interpretar — IPv6 sem colchetes, porta
      fora da faixa, cabeçalho ausente
- [x] `isAllowedAuthority` confere **nome e porta**, e `allowedHostnames` une os três de loopback ao
      host configurado (E2)
- [x] `isAllowedFetchSite` passa sem cabeçalho (é a porta do agente) e recusa `cross-site` e
      `same-site` (E4)
- [x] `isLoopbackHost` aceita `127.0.0.0/8`, `::1` e `localhost`, e recusa `0.0.0.0` e `::`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): as regras de origem do daemon, em funções puras`

---

#### T2: O `Host` no ciclo de request

**What**: Um `onRequest` que recusa com `421` qualquer requisição cujo `Host` não seja o do próprio
daemon.
**Where**: `packages/server/src/auth/guard.ts`, `server.ts`, `guard.test.ts`

**Done when**:
- [x] `Host: evil.example:<porta>` → **421**, `text/plain`, uma frase — e o detalhe (o cabeçalho que
      veio) vai para o log, não para o corpo
- [x] `127.0.0.1`, `localhost` e `[::1]` na porta em que o daemon escuta → passam
- [x] Porta errada no nome certo → **421**
- [x] A guarda é registrada **antes** de qualquer `app.register`: um `onRequest` só alcança as rotas
      dos contextos criados depois dele, e o `/trpc` inteiro nasce de um `register`
- [x] A porta conferida é a do socket (`app.server.address()`), com a configuração como último
      recurso (E1)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o daemon recusa requisição cujo Host não é o dele`

---

#### T3: `Origin` e `Sec-Fetch-Site`

**What**: A mesma guarda recusa com `403` o que veio de outra origem, onde a origem importa.
**Where**: `packages/server/src/auth/guard.ts`, `config.ts`, `guard.test.ts`, `config.test.ts`

**Done when**:
- [x] Requisição que não é `GET`/`HEAD` com `Origin` fora da lista → **403**, e isso cobre as duas
      portas do agente que mudam estado (`POST /tasks` entre elas)
- [x] `GET` de `/memory` e `/tasks` com `Sec-Fetch-Site: cross-site` → **403**; sem cabeçalho nenhum
      → **200**
- [x] `GET /trpc/*` de outro site **passa**, e o teste diz por quê (E3): sem CORS registrado o
      browser não deixa ninguém ler a resposta, e uma query não muda estado
- [x] A lista é a origem do próprio daemon mais `LUMEM_WEB_ORIGINS`, cujo default é o vite do
      `pnpm dev` — e definir a variável **substitui** o default em vez de somar a ele
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o daemon recusa pedido de browser de outra origem`

---

#### T4: A recusa antes do handshake

**What**: O roteador de upgrade aplica a mesma guarda, e recusa escrevendo HTTP cru — antes de o
`WebSocketServer` ver o socket.
**Where**: `packages/server/src/ws/upgrade.ts`, `guard.test.ts`

**Done when**:
- [x] Upgrade com `Origin` de fora → **403** e nenhum handshake; com `Host` de outro domínio →
      **421** e nenhum handshake
- [x] Upgrade sem sinal de browser, e com a origem da própria página → sobem
- [x] A recusa vem **antes do despacho**, então quem não passa não fica sabendo nem quais caminhos
      existem; e a resposta crua leva `Content-Length` e `Connection: close`, senão um cliente
      HTTP/1.1 fica esperando um corpo que não vem
- [x] Montar um endpoint de upgrade num servidor **sem** guarda é um `throw` no registro, e não um
      `?.` que passa calado
- [x] **Mutação:** desligar a checagem em `ws/upgrade.ts` derruba **exatamente dois** testes e
      nenhum outro — medido
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o upgrade de WebSocket confere a origem antes do handshake`

---

#### T5: `LUMEM_HOST` fora do loopback recusa subir

**What**: A S5. Até a fase 2 existir, um host que não é loopback não sobe — e o `lumem help` para de
prometer o contrário.
**Where**: `packages/server/src/bootstrap.ts`, `packages/cli/src/args.ts`, `bootstrap.test.ts`

**Done when**:
- [x] `LUMEM_HOST=0.0.0.0` → o daemon **não escuta**, loga a frase que explica, e sai com **1**
- [x] A recusa vem **antes** do `listen`, no mesmo lugar e com o mesmo formato do `EADDRINUSE`
- [x] O texto do `lumem help` diz que só loopback sobe, em vez de dizer que apontar para outra
      interface publica um shell
- [x] A decisão está no
      [ADR](../../adr/2026-09-22-0718-daemon-answers-only-on-loopback-until-it-authenticates.md),
      com as alternativas que perderam
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o daemon só sobe em loopback enquanto nada nele autentica`

---

#### T6: O desenvolvimento e a suíte continuam de pé

**What**: O que a guarda cobra de quem já existia: a porta do vite por workspace, a do e2e, e os 20
`app.inject` que mandavam `localhost:80`.
**Where**: `scripts/workspace/run.sh`, `playwright.config.ts`, `packages/server/src/testing/http.ts`,
e os quatro arquivos de teste que falam HTTP por `createServer`

**Done when**:
- [x] `run.sh` exporta `LUMEM_WEB_ORIGINS` com a porta de vite que ele mesmo escolheu
- [x] O daemon do e2e recebe a origem da porta do e2e pelo `playwright.config.ts` — e a porta errada
      ali derruba a suíte, que é a prova de que a linha não é decoração
- [x] `testing/http.ts` dá o `Host` certo a `app.inject`, **importando** a resolução de porta da
      guarda em vez de reescrevê-la — é o que importa para o teste que sobe em porta efêmera
- [x] Gate: `pnpm gate:full` — **4081 testes de unidade e os 116 e2e**, sem spec novo

**Commit**: `test(server): o Host que a guarda exige, nos testes que falam HTTP`

---

#### T7: A documentação

**What**: O ADR, a matriz de cobertura, o índice e o estado do projeto.
**Where**: `docs/adr/`, `docs/project/testing.md`, `docs/project/workspaces.md`, `docs/README.md`,
`CLAUDE.md`, `README.md`, `README.pt-BR.md`

**Done when**:
- [x] O ADR existe e passa nos três testes da regra de documentação, com as alternativas nomeadas
- [x] `testing.md` ganha a linha da camada nova, com o que o teste de mutação mede
- [x] O índice lista o ADR e diz que a fase 1 saiu; os dois `README` param de prometer que apontar
      para outra interface funciona
- [x] Gate: `pnpm gate:build` e o `check-docs`

**Commit**: `docs(019): as seis perguntas fechadas, o ADR do loopback e a fase 1 entregue`

---

## O que a execução achou

**A porta é a do socket, não a da configuração.** A PRD diz "a porta em que o daemon escuta", e com
`LUMEM_PORT=0` esses são dois números diferentes — a configuração diz `0` e o kernel escolhe outro.
Conferir contra a configuração daria `421` em todo daemon de porta efêmera, o que inclui **todos** os
testes de WebSocket, que são justamente onde o upgrade é exercido de verdade. Virou a
[E1](open-questions.md#decisões-que-a-execução-tomou).

**`app.inject` manda `localhost:80`, e o §6 da PRD já sabia.** Vinte chamadas em quatro arquivos. Em
vez de espalhar o cabeçalho por todas, um `inject(app, config, options)` em `testing/http.ts` resolve
a porta **chamando a função da guarda**, não copiando a regra — então o teste que sobe de verdade e o
que só injeta usam a mesma resolução e nenhum dos dois fica sabendo por quê. Dois arquivos que falam
HTTP **não** precisaram de nada: `tasks/http.test.ts` e `web/static.test.ts` montam um Fastify cru,
sem `createServer`, então não têm guarda — e isso é o desenho, não um buraco: a guarda é do daemon,
e quem monta meio daemon está testando outra coisa.

**`127.0.0.2` é loopback e o macOS não escuta nele.** O teste que subia o daemon em `127.0.0.2` para
provar a união da [E2](open-questions.md#decisões-que-a-execução-tomou) falhou com exit 1: `lo0` só
tem `127.0.0.1` configurado por padrão no macOS, e a faixa inteira é comportamento do Linux. O teste
saiu; o que prova a regra é o unit de `isLoopbackHost` e o de `allowedHostnames`, que não dependem de
sistema operacional. A regra continua certa — um `--host 127.0.0.2` no Linux sobe, e no macOS falha
no `listen` com a mensagem que já existia.

**A prova por mutação tem dois testes, e nenhum a mais.** Desligar a checagem em `ws/upgrade.ts`
derruba exatamente `recusa a origem de fora antes do handshake` e `recusa o Host de outro domínio
antes do handshake`. É o número certo: se derrubasse zero, a checagem seria decorativa; se derrubasse
a suíte inteira, o teste não seria sobre o upgrade.

**A lista de origens é carregada, e foi medido.** O risco do §6 da PRD — *"quebrar o desenvolvimento
por Superset, que escolhe porta do vite por workspace"* — não é teórico: o proxy do vite **encaminha
o `Origin` do browser** (ele reescreve só o `Host`, por causa do `changeOrigin`). Trocar o
`LUMEM_WEB_ORIGINS` do `playwright.config.ts` por uma porta errada derruba o `00-onboarding` no
primeiro `POST`. É a prova de que a checagem está no caminho real do browser, e não só no
`app.inject` — e de que as duas linhas de configuração são o que mantém o desenvolvimento de pé.

**Nenhum e2e novo, e é o ponto.** Os 116 specs passam, incluindo os cinco de `production` — um
daemon, sem vite, contra `dist`. A feature toca o caminho de **toda** requisição do produto; um spec
novo provaria uma recusa, e o que precisa de prova é que nada legítimo passou a ser recusado.
