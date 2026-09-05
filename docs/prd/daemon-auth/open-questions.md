# O daemon confere quem fala com ele — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** ainda não

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **0 respondidas**.

---

### [ ] S1 — A fase 1 sozinha (Host + Origin) vale, ou só sai com token?

`Host` e `Origin` fecham rebinding, sequestro de WebSocket e `GET` com efeito. Não fecham outro
processo local nem outro usuário da máquina.

**Proposta pra reagir:** sai sozinha, e **antes** de tudo. É um dia de trabalho, não muda nada para o
browser nem para o agente, e fecha as três ameaças que uma aba aberta em qualquer site pode exercer
hoje. O token vem logo depois — a origem única que ele pede já existe desde a distribution.

**Custo de esperar:** cada dia com o daemon de pé é um dia em que qualquer página que você abre pode
abrir um shell como você.

**R:**

---

### [ ] S2 — O token chega ao browser por cookie, ou a página pede e guarda?

**(a)** cookie `HttpOnly` definido em `GET /` — o script da página nunca vê o token; **(b)** a página
faz `GET /token` e guarda em memória, mandando `Authorization` em toda chamada — XSS na página lê o
token; e o WebSocket do browser não aceita cabeçalho, então o token iria na URL.

**Proposta pra reagir:** (a). Os dois defeitos de (b) são exatamente os que o cookie não tem.

**R:**

---

### [ ] S3 — `SameSite=Strict` ou `Lax`?

`Strict` não manda o cookie em navegação vinda de outro site — nem em `GET` de topo. `Lax` manda em
navegação de topo por `GET`, e não manda em `POST`, `fetch` cross-site nem em WebSocket iniciado por
outro site.

**Proposta pra reagir:** `Lax`. Toda mutação do daemon é `POST` ou WebSocket, que `Lax` já bloqueia
cross-site. O que `Strict` acrescenta é quebrar o `lumem open` e qualquer link para o Lumem vindo de
fora — e `GET /` de topo é inofensivo, porque `GET` com efeito é justamente o que a F2 trata por
`Sec-Fetch-Site`.

**R:**

---

### [ ] S4 — O `curl` do agente usa o token global do daemon, ou um token por sessão?

Global é mais simples: uma variável para tudo. Por sessão é o que fecha a **Q46**: o daemon sabe
**qual** sessão está falando, e o ator deixa de ser declarado.

**Proposta pra reagir:** por sessão (F4). O token global fica para CLI e e2e — humanos e ferramentas
suas —, e nunca é injetado num processo de agente. Injetar o global no agente seria dar a ele a chave
do daemon inteiro, inclusive `session.createShell` em outro checkout.

**R:**

---

### [ ] S5 — E quando `LUMEM_HOST` não é loopback, hoje?

A configuração aceita qualquer host, e a CLI expõe isso como flag: `lumem --host 0.0.0.0` é um daemon
aberto na rede sem nenhuma credencial, a um argumento de distância.

**Proposta pra reagir:** até a fase 2 existir, `LUMEM_HOST` fora do loopback **recusa subir**, com a
frase que explica. Depois da fase 2, sobe com token obrigatório. É o único ponto do PRD que tira uma
capacidade — e a capacidade que tira é a de se expor por engano.

**R:**

---

### [ ] S6 — Onde o token vive: `~/.lumem/secret` ou dentro do `daemon.json`?

O backlog já tem "o daemon em background", com um pidfile no state dir — um arquivo de estado que um
futuro `lumem status` vai imprimir.

**Proposta pra reagir:** arquivo separado, `secret`, `0600`, no bloco do `.gitignore` do `home.ts`, e
**nunca** dentro de um arquivo de estado. Misturar segredo com informação faz o `status` ter que
censurar o que imprime, e faz um `cat` num pedido de ajuda vazar a chave.

**R:**
