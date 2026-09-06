# O daemon confere quem fala com ele — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 7 perguntas · **6 fechadas em 2026-09-06 · 1 aberta (S7).** As seis foram fechadas como
**proposta seguida**, na execução da fase 1 — nenhuma foi contestada, e o código segue cada uma. A
S7 nasceu **lendo a S2 contra o código**: o cookie definido em `GET /` é entregue a quem pedir `GET /`,
e isso é exatamente quem a fase 2 existe para barrar. Ela trava a fase 2, e só ela.

> Proposta seguida não é o mesmo que pergunta debatida. A diferença fica escrita porque, se alguma
> delas doer, o lugar de mudar é aqui — e a **S5** é a que tira uma capacidade, então é a que mais
> merece um segundo olhar.

---

### [x] S1 — A fase 1 sozinha (Host + Origin) vale, ou só sai com token?

`Host` e `Origin` fecham rebinding, sequestro de WebSocket e `GET` com efeito. Não fecham outro
processo local nem outro usuário da máquina.

**Proposta pra reagir:** sai sozinha, e **antes** de tudo. É um dia de trabalho, não muda nada para o
browser nem para o agente, e fecha as três ameaças que uma aba aberta em qualquer site pode exercer
hoje. O token vem logo depois — a origem única que ele pede já existe desde a distribution.

**Custo de esperar:** cada dia com o daemon de pé é um dia em que qualquer página que você abre pode
abrir um shell como você.

**R:** sai sozinha. A execução confirmou o tamanho: um módulo de decisão pura, um gancho no Fastify, um
guarda no roteador de upgrade, e a variável `LUMEM_WEB_ORIGINS` para o vite. O que custou de verdade
foi o que o PRD já previa no §6 — todo `app.inject` da suíte mandava `Host: localhost:80`, que para o
guarda é uma página que fez rebinding.

**Decisão:** **fase 1 sozinha, entregue em 2026-09-06.** A fase 2 espera a S7.

---

### [x] S2 — O token chega ao browser por cookie, ou a página pede e guarda?

**(a)** cookie `HttpOnly` definido em `GET /` — o script da página nunca vê o token; **(b)** a página
faz `GET /token` e guarda em memória, mandando `Authorization` em toda chamada — XSS na página lê o
token; e o WebSocket do browser não aceita cabeçalho, então o token iria na URL.

**Proposta pra reagir:** (a). Os dois defeitos de (b) são exatamente os que o cookie não tem.

**R:** (a), pelo **transporte**: cookie `HttpOnly` é a única credencial que viaja sozinha num WebSocket
de browser, e a única que XSS não lê. Mas a **entrega** proposta — "definido em `GET /`" — não fecha o
que a fase 2 promete, e isso virou a **S7**.

**Decisão:** **cookie `HttpOnly`.** Como o browser o **obtém** é a S7, e a fase 2 não começa sem ela.

---

### [x] S3 — `SameSite=Strict` ou `Lax`?

`Strict` não manda o cookie em navegação vinda de outro site — nem em `GET` de topo. `Lax` manda em
navegação de topo por `GET`, e não manda em `POST`, `fetch` cross-site nem em WebSocket iniciado por
outro site.

**Proposta pra reagir:** `Lax`. Toda mutação do daemon é `POST` ou WebSocket, que `Lax` já bloqueia
cross-site. O que `Strict` acrescenta é quebrar o `lumem open` e qualquer link para o Lumem vindo de
fora — e `GET /` de topo é inofensivo, porque `GET` com efeito é justamente o que a F2 trata por
`Sec-Fetch-Site`.

**R:** `Lax`. A fase 1 é o que torna isso seguro: o único `GET` com efeito (`/memory/ask`) já recusa
`Sec-Fetch-Site: cross-site`, então o que `Lax` deixa passar — navegação de topo por `GET` — não tem
mais nada para disparar.

**Decisão:** **`Lax`.**

---

### [x] S4 — O `curl` do agente usa o token global do daemon, ou um token por sessão?

Global é mais simples: uma variável para tudo. Por sessão é o que fecha a **Q46**: o daemon sabe
**qual** sessão está falando, e o ator deixa de ser declarado.

**Proposta pra reagir:** por sessão (F4). O token global fica para CLI e e2e — humanos e ferramentas
suas —, e nunca é injetado num processo de agente. Injetar o global no agente seria dar a ele a chave
do daemon inteiro, inclusive `session.createShell` em outro checkout.

**R:** por sessão. Um detalhe que a execução da fase 1 achou para a fase 3: o id da sessão **é** o id
do processo (`SessionStore.ts` — "o agente primeiro, para o id dele ser o do registro"), então o token
por sessão tem que nascer **antes** do spawn, ou ser derivado do id depois. Fica registrado na T-F4.1
das [tasks](tasks.md).

**Decisão:** **token por sessão (F4).** O global nunca entra num processo de agente.

---

### [x] S5 — E quando `LUMEM_HOST` não é loopback, hoje?

A configuração aceita qualquer host, e a CLI expõe isso como flag: `lumem --host 0.0.0.0` é um daemon
aberto na rede sem nenhuma credencial, a um argumento de distância.

**Proposta pra reagir:** até a fase 2 existir, `LUMEM_HOST` fora do loopback **recusa subir**, com a
frase que explica. Depois da fase 2, sobe com token obrigatório. É o único ponto do PRD que tira uma
capacidade — e a capacidade que tira é a de se expor por engano.

**R:** recusa subir, nos **dois** lugares: a CLI recusa `--host` (e `LUMEM_HOST` do ambiente) antes de
sondar a porta, porque o daemon lê a configuração no `import` e um `throw` lá vira stack trace em vez
de frase; e o `loadConfig` recusa também, porque a CLI não é o único jeito de subir o daemon. A lista
de loopback mora em `@lumem/shared` (`isLoopbackHost`) para os dois concordarem sem conversar. A frase
nomeia a fase que vai levantar a recusa.

Consequência colateral: a F1 do PRD dizia "quando `LUMEM_HOST` não é loopback, o valor configurado
entra na lista". Com a S5, isso **não existe** até a fase 2 — a lista de `Host` é fixa nos três nomes
de loopback mais a porta em que o daemon escuta.

**Decisão:** **recusa subir**, na CLI e no daemon, até a fase 2.

---

### [x] S6 — Onde o token vive: `~/.lumem/secret` ou dentro do `daemon.json`?

O backlog já tem "o daemon em background", com um pidfile no state dir — um arquivo de estado que um
futuro `lumem status` vai imprimir.

**Proposta pra reagir:** arquivo separado, `secret`, `0600`, no bloco do `.gitignore` do `home.ts`, e
**nunca** dentro de um arquivo de estado. Misturar segredo com informação faz o `status` ter que
censurar o que imprime, e faz um `cat` num pedido de ajuda vazar a chave.

**R:** arquivo separado. O `home.ts` já faz `chmod 0700` no state dir e já escreve o bloco do
`.gitignore` entre marcadores — o `secret` entra no mesmo bloco, na fase 2.

**Decisão:** **`~/.lumem/secret`, `0600`, ignorado pelo git, nunca dentro de estado.**

---

### [ ] S7 — Quem pede `GET /` ganha o cookie. Então o que o token fecha?

A F3 do PRD entrega o cookie na resposta de `GET /`. Mas `GET /` é uma das três rotas que a F3 deixa
**sem** credencial — e tem que deixar, porque é como a página chega ao browser. Então qualquer processo
local que faça `curl -i http://127.0.0.1:4317/` lê o `Set-Cookie` e tem o token. É **exatamente** o
ator que a fase 2 existe para barrar (§4 do PRD: *"um processo local qualquer — outro usuário, ou um
`curl` de uma página que achou como forjar `Host`"*).

O que a S2 escolheu — cookie `HttpOnly` — continua certo; o que falta é o **primeiro passo**: como o
browser prova, uma vez, que é você. As saídas conhecidas, da mais barata à mais correta:

| Saída | Como | O que custa |
|---|---|---|
| **Token na URL de abertura** | o daemon imprime `http://127.0.0.1:4317/?token=…` ao subir e o `lumem --open` abre essa URL; o `GET /?token=…` troca o token pelo cookie e redireciona para `/` limpo. É o modelo do Jupyter | quem abre o Lumem digitando o endereço precisa copiar a URL do terminal, uma vez por browser. O vite em desenvolvimento não imprime nada disso — precisa de um caminho de dev |
| **Só quando escutar fora do loopback** | em loopback, aceitar que outro usuário da **sua** máquina é uma ameaça fora do PRD (§2.4 já diz que a máquina é sua), e o cookie em `GET /` fica como defesa em profundidade; a troca por token na URL só entra com `LUMEM_HOST` fora do loopback | a fase 2 deixa de fechar o que o §4 diz que fecha, e o PRD precisa dizer isso |
| **Pareamento** | o primeiro browser pede, o daemon imprime um código no terminal, a página pede o código | mais tela, mais estado, e é o que o Jupyter **não** faz por um motivo: a URL já é o código |

**Proposta pra reagir:** **token na URL de abertura**, com o `lumem --open` já abrindo a URL certa e
o `pnpm dev` escrevendo o token na saída do `run.sh`. É o único dos três que fecha o que o §4 promete,
e o custo — copiar uma URL uma vez — é o mesmo que todo mundo já paga no Jupyter.

**Custo de esperar:** a fase 2 inteira. A fase 1 não depende disto e já saiu.

**R:** _(aberta)_
