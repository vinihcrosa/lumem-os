# O daemon confere quem fala com ele — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **6 respondidas**, em 2026-09-22. As seis foram a proposta aceita, e o
motivo de nenhuma ter mudado de rumo é o mesmo: a PRD foi escrita depois de medir o código, e cada
proposta já vinha com o custo de não fazer. A **S1** e a **S5** viraram o
[ADR de 2026-09-22](../../adr/2026-09-22-0718-daemon-answers-only-on-loopback-until-it-authenticates.md).
O que a execução acrescentou está na [E1–E5](#decisões-que-a-execução-tomou) no fim — cinco decisões
que só apareceram com o código na mão.

---

### [x] S1 — A fase 1 sozinha (Host + Origin) vale, ou só sai com token?

`Host` e `Origin` fecham rebinding, sequestro de WebSocket e `GET` com efeito. Não fecham outro
processo local nem outro usuário da máquina.

**Proposta pra reagir:** sai sozinha, e **antes** de tudo. É um dia de trabalho, não muda nada para o
browser nem para o agente, e fecha as três ameaças que uma aba aberta em qualquer site pode exercer
hoje. O token vem logo depois — a origem única que ele pede já existe desde a distribution.

**Custo de esperar:** cada dia com o daemon de pé é um dia em que qualquer página que você abre pode
abrir um shell como você.

**R:** **Decisão: sai sozinha, e é esta feature.** A proposta, aceita sem ressalva; virou o
[ADR de 2026-09-22](../../adr/2026-09-22-0718-daemon-answers-only-on-loopback-until-it-authenticates.md),
junto com a S5. O argumento que decide não é o tamanho — é que as três ameaças da §2 **não dependem
de configuração nenhuma**: valem para o daemon como ele sobe hoje, em loopback, com o default. Um
token que chega uma semana depois não muda nada disso, e as duas partes não se atrapalham — a fase 1
vive no transporte (quem *pode* falar), a fase 2 no pedido (quem *é*). A fase 1 também não gasta
nenhuma decisão da fase 2: nenhuma linha do `Host`/`Origin` precisa saber que um cookie vai existir.

---

### [x] S2 — O token chega ao browser por cookie, ou a página pede e guarda?

**(a)** cookie `HttpOnly` definido em `GET /` — o script da página nunca vê o token; **(b)** a página
faz `GET /token` e guarda em memória, mandando `Authorization` em toda chamada — XSS na página lê o
token; e o WebSocket do browser não aceita cabeçalho, então o token iria na URL.

**Proposta pra reagir:** (a). Os dois defeitos de (b) são exatamente os que o cookie não tem.

**R:** **Decisão: (a), cookie `HttpOnly`.** O que fecha é o segundo defeito, não o primeiro: o
`WebSocket` do browser não deixa mandar cabeçalho, então em (b) o token de `/pty` e `/acp` teria que
viajar na **query string** — e query string vai para o log de requisição do próprio daemon, que é
`logger: true` em produção. Um segredo que o produto escreve no próprio log é um segredo que vaza no
primeiro pedido de ajuda com um arquivo de log anexado. O cookie viaja sozinho no upgrade, porque o
upgrade é mesma origem.

---

### [x] S3 — `SameSite=Strict` ou `Lax`?

`Strict` não manda o cookie em navegação vinda de outro site — nem em `GET` de topo. `Lax` manda em
navegação de topo por `GET`, e não manda em `POST`, `fetch` cross-site nem em WebSocket iniciado por
outro site.

**Proposta pra reagir:** `Lax`. Toda mutação do daemon é `POST` ou WebSocket, que `Lax` já bloqueia
cross-site. O que `Strict` acrescenta é quebrar o `lumem open` e qualquer link para o Lumem vindo de
fora — e `GET /` de topo é inofensivo, porque `GET` com efeito é justamente o que a F2 trata por
`Sec-Fetch-Site`.

**R:** **Decisão: `Lax`.** Proposta aceita, e a fase 1 é o que a torna barata: depois da F2, o
único `GET` com efeito do daemon (`/memory/ask`) já recusa `Sec-Fetch-Site` de fora, então o que
`Lax` deixa passar — navegação de topo por `GET` — não alcança efeito nenhum. `Strict` custaria o
`lumem --open` a partir de um link e não compraria nada que a F2 já não tenha comprado.

---

### [x] S4 — O `curl` do agente usa o token global do daemon, ou um token por sessão?

Global é mais simples: uma variável para tudo. Por sessão é o que fecha a **Q46**: o daemon sabe
**qual** sessão está falando, e o ator deixa de ser declarado.

**Proposta pra reagir:** por sessão (F4). O token global fica para CLI e e2e — humanos e ferramentas
suas —, e nunca é injetado num processo de agente. Injetar o global no agente seria dar a ele a chave
do daemon inteiro, inclusive `session.createShell` em outro checkout.

**R:** **Decisão: por sessão, e o global nunca entra em processo de agente.** Proposta aceita.
Ela é o que faz a fase 3 valer o preço: sem ela a fase 2 seria autenticação sem identidade — o daemon
saberia que quem fala é "alguém com a chave" e continuaria acreditando no `?session=` para saber
quem. Com token por sessão o escopo do `/memory/ask` deixa de ser informado por quem pergunta, que é
literalmente a Q46. E vale para as duas portas do agente: o `POST /tasks` da
[`022`](../022-workspace-tasks/prd.md) confia no mesmo `?session=`.

---

### [x] S5 — E quando `LUMEM_HOST` não é loopback, hoje?

A configuração aceita qualquer host, e a CLI expõe isso como flag: `lumem --host 0.0.0.0` é um daemon
aberto na rede sem nenhuma credencial, a um argumento de distância.

**Proposta pra reagir:** até a fase 2 existir, `LUMEM_HOST` fora do loopback **recusa subir**, com a
frase que explica. Depois da fase 2, sobe com token obrigatório. É o único ponto do PRD que tira uma
capacidade — e a capacidade que tira é a de se expor por engano.

**R:** **Decisão: recusa subir, com a frase que explica, até a fase 2.** Proposta aceita — e o
que decide é que a fase 1 **piora** o caso não-loopback se ela não fizer nada com ele. Fora do
loopback, `Host` e `Origin` passam a parecer defesa e não são: quem alcança o daemon pela rede
controla os dois cabeçalhos, porque não é um browser. Deixar subir seria entregar uma tranca que só
tranca quem já estava do lado de fora do vidro. O raciocínio inteiro, com as alternativas, está no
[ADR de 2026-09-22](../../adr/2026-09-22-0718-daemon-answers-only-on-loopback-until-it-authenticates.md).

**O que conta como loopback:** `127.0.0.0/8`, `::1` e `localhost`. `0.0.0.0` e `::` **não** — são
"todas as interfaces", que é exatamente o caso que a pergunta trata. Um `127.0.0.2` sobe, e entra na
lista de `Host` permitidos pela união da [E2](#decisões-que-a-execução-tomou).

**O que isto tira, nomeado:** quem hoje roda `lumem --host 0.0.0.0` para abrir o Lumem do celular na
mesma rede perde isso até a fase 2. É a capacidade de se expor sem credencial, e ela volta **com**
credencial.

---

### [x] S6 — Onde o token vive: `~/.lumem/secret` ou dentro do `daemon.json`?

O backlog já tem "o daemon em background", com um pidfile no state dir — um arquivo de estado que um
futuro `lumem status` vai imprimir.

**Proposta pra reagir:** arquivo separado, `secret`, `0600`, no bloco do `.gitignore` do `home.ts`, e
**nunca** dentro de um arquivo de estado. Misturar segredo com informação faz o `status` ter que
censurar o que imprime, e faz um `cat` num pedido de ajuda vazar a chave.

**R:** **Decisão: `~/.lumem/secret`, `0600`, no `.gitignore` que o `home.ts` escreve.** Proposta
aceita, e o motivo mais duro que o da proposta: o `~/.lumem` é um **repositório git** que o daemon
versiona sozinho desde a workspace-memory. Segredo dentro de arquivo de estado não é só um `cat`
distraído — é um commit automático. A regra fica sendo uma só, e dá para verificar: nenhum arquivo
que o daemon commita contém o segredo, porque o segredo mora num arquivo que o `.gitignore` exclui.

O cofre da [`028`](../028-autonomous-orchestration/prd.md) — `~/.lumem/_system/`, cifrado — **não**
serve aqui: ele guarda chave de serviço de que o Lumem depende, e o que o
[ADR do cofre](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) diz sobre o
que ele não protege vale igual para este segredo. Um arquivo `0600` é o mesmo nível do `~/.ssh`, e
cifrar com a chave ao lado não acrescentaria nada.

---

## Decisões que a execução tomou

Não são perguntas da PRD: são as escolhas que só existem com o código na mão. Ficam aqui porque
fase 2 e fase 3 as herdam.

### E1 — A porta permitida é a que o socket **está** escutando, não a configurada

`Host` tem que bater com "a porta em que o daemon escuta" (F1). São dois números diferentes quando
`LUMEM_PORT=0`: a configuração diz `0` e o kernel escolhe outra. A checagem lê
`app.server.address()` e só cai na configuração quando não há socket — que é o caso do `app.inject`.
Sem isso, todo teste de WebSocket (que sobe em porta efêmera de verdade) seria recusado, e a feature
estaria provada só contra si mesma.

### E2 — A lista de `Host` é `{127.0.0.1, localhost, [::1]}` **unida a** `config.host`

A PRD já pedia a união ("quando `LUMEM_HOST` não é loopback, o valor configurado entra na lista"), e
a S5 parecia matá-la — se não-loopback não sobe, a união nunca faria nada. Faz: `127.0.0.2` é
loopback, sobe, e **não** está no conjunto de três. A união é uma linha e é a que mantém a regra
verdadeira em vez de quase verdadeira.

### E3 — O `Origin` é conferido em tudo que não é `GET`/`HEAD`, no upgrade, e no `GET` de `/memory` e `/tasks`

A PRD diz `GET /memory/ask`, e foi escrita antes de a [`022`](../022-workspace-tasks/prd.md) existir.
A checagem pega os dois **prefixos**: são as famílias de rota fora do `/trpc` que respondem `GET` com
efeito, e uma lista de caminhos exatos é uma lista que fica desatualizada no dia em que a fase 3
acrescenta o segundo. `GET /trpc/*` fica de fora pelo motivo da PRD: sem CORS registrado, o browser
não deixa ninguém **ler** a resposta.

### E4 — Sem `Origin`, recusa qualquer `Sec-Fetch-Site` que não seja `same-origin` ou `none`

A PRD nomeia `cross-site`. `same-site` também entra na recusa, e não custa nada: para o browser,
`127.0.0.1:4318` e `127.0.0.1:4317` são o mesmo *site* e origens diferentes, então `same-site` sem
`Origin` só pode vir de outra porta da mesma máquina — que é o caso que a fase 2 existe para fechar,
não um caso legítimo. `none` é navegação digitada ou `lumem --open`, e passa.

### E5 — Recusa de upgrade é resposta HTTP crua, antes do handshake **e antes do despacho**

O roteador de upgrade (`ws/upgrade.ts`) já escrevia `404` em socket cru; a recusa segue o mesmo
caminho, com `421`/`403`, `Content-Length` e `Connection: close`. O ponto é *antes*: o
`WebSocketServer` nunca vê o socket, então não há conexão para sequestrar nem `attached` para vazar.
E antes do `404` também — quem não passa na guarda não fica sabendo nem quais caminhos existem.
