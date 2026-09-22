---
title: O daemon só atende em loopback enquanto nada nele autentica
date: 2026-09-22
area: security
summary: A fase 1 da [`019`](../features/019-daemon-auth/prd.md) confere de **onde** o pedido poderia ter vindo — `Host`, `Origin`, `Sec-Fetch-Site` — e não **quem** o mandou, que é a fase 2. Duas consequências que não são óbvias e não se revertem de graça: pedido sem sinal nenhum de browser **passa**, porque é a porta do `curl` do agente e do e2e; e `LUMEM_HOST` fora do loopback **recusa subir**, em vez de subir com aviso. Fora do loopback os dois cabeçalhos não defendem nada — quem chega pela rede não é um browser e escreve ambos como quiser.
---

## Contexto

O daemon executa comando com as suas permissões e não conferia quem pediu. Medido no código em
2026-09-05, e a
[PRD](../features/019-daemon-auth/prd.md) tem a tabela inteira: nenhuma autenticação em rota nenhuma,
o upgrade de WebSocket despachando **só por path**, nenhuma rota olhando `Host`. A favor havia uma
coisa só, e por acidente: **não há CORS registrado**, então o browser já bloqueia leitura
cross-origin e já exige preflight para `POST` com JSON.

O que o CORS não cobre é exatamente onde estavam as três ameaças reais:

1. **DNS rebinding.** Uma página em `evil.example` com TTL zero; na segunda resolução o domínio
   aponta para `127.0.0.1`. Para o browser é a **mesma origem** da página que ele já carregou, então
   regra de CORS nenhuma se aplica. Daí `fetch("/trpc/session.createShell")` e `rm -rf`. O daemon
   recebe `Host: evil.example:4317`, e **conferir `Host` é a única defesa**.
2. **Sequestro de WebSocket.** WebSocket não obedece CORS. Qualquer página abre
   `ws://127.0.0.1:4317/acp?session=<id>` e, sabendo o id, lê a transcrição inteira no `attached` e
   manda `prompt`. Com a [`016`](../features/016-session-mode/prd.md) a conta subiu: uma sessão em
   `liberado` executa sem perguntar.
3. **`GET` com efeito.** `GET /memory/ask` grava `memory_usage` e, com o auto-learn ligado, **sobe um
   agente e gasta token**. Um `<img src>` em qualquer página dispara isso.

E a CLI aceita `--host 0.0.0.0`: expor o daemon na rede era um flag, sem credencial nenhuma junto.

O ponto que força este ADR é que **as três não esperam o daemon sair do loopback**. O gatilho que o
backlog tinha — *"quando o daemon escutar fora do loopback"* — descrevia uma quarta ameaça, e as três
que existem hoje valem para o daemon como ele sobe por padrão.

## Decisão

### 1. A fase 1 é transporte, não credencial — e ela sai sozinha

O daemon confere de **onde** o pedido poderia ter vindo antes de existir qualquer noção de **quem** o
mandou. `Host` em toda requisição e em todo upgrade; `Origin` e `Sec-Fetch-Site` onde a origem
importa — todo upgrade, todo método que não é `GET`/`HEAD`, e o `GET` das famílias que respondem com
efeito (`/memory`, `/tasks`).

**Um pedido sem sinal nenhum de browser passa.** Não é descuido: a porta do agente é `curl` para
`/memory/ask` e `POST /tasks`, ensinada no prompt e *"copiável sem raciocínio"*, e o e2e fala com o
daemon pela API. Fechar isso é a fase 2, com uma credencial que o daemon **entrega** a quem tem
direito a ela — e é por isso que a fase 1 não precisa esperar por ela.

### 2. Loopback é imposto, não é o default

`LUMEM_HOST` fora de `127.0.0.0/8`, `::1` ou `localhost` **recusa subir**, com a frase que explica, e
o processo sai com 1.

Isto não é cautela: é que a fase 1 **piora** o caso não-loopback se não fizer nada com ele. Fora do
loopback, `Host` e `Origin` passam a *parecer* defesa e não são — quem alcança o daemon pela rede não
é um browser, e escreve os dois cabeçalhos como quiser. Deixar subir seria entregar uma tranca que só
tranca quem já estava do lado de fora do vidro.

É o único ponto da feature que **tira uma capacidade**, e a capacidade que tira é a de se expor sem
credencial. Ela volta **com** credencial, na fase 2.

## Alternativas

**Avisar e subir mesmo assim.** É o que quase todo daemon local faz, e é o que não muda nada: um
aviso no log de boot não é lido por quem digitou `--host 0.0.0.0` justamente para alcançar o Lumem do
celular. O que decide contra não é paternalismo — é que aqui o custo de errar é shell como você, na
rede, e o produto ainda não tem como distinguir você de outra pessoa. Perde por assimetria: quem
queria a capacidade espera pela fase 2, quem se expôs por engano não paga nada.

**Entregar o token primeiro, e só depois `Host`/`Origin`.** Teria fechado também o caso do processo
local. Perde pelo prazo: a fase 2 pede cookie, `Set-Cookie` no `GET /`, `Authorization` para CLI e
e2e, e um arquivo `0600` no state dir — e enquanto ela não sai, **toda aba aberta em qualquer site**
pode abrir um shell. A fase 1 é um dia e não gasta nenhuma decisão da fase 2: nenhuma linha do
`Host`/`Origin` precisa saber que um cookie vai existir.

**Registrar CORS.** Não resolve nenhuma das três. Rebinding é mesma-origem para o browser; WebSocket
não obedece CORS; e `GET` com efeito por `<img>` é `no-cors`, que CORS não bloqueia — bloqueia a
*leitura* da resposta, e o efeito já aconteceu. CORS endereça um problema que este daemon não tem,
porque ele já não manda cabeçalho nenhum de CORS.

**Deixar a checagem de `Host` desligável por flag.** É o pedido que aparece na primeira vez que
alguém põe um proxy na frente. Recusado porque um interruptor de segurança com default ligado é um
interruptor que vira instrução de blog em seis meses. A única forma de alargar a lista é `LUMEM_HOST`
— configurar *outro host*, não desligar a conferência.

## Consequências

**O que fica protegido:** as três ameaças acima, todas exercíveis hoje por uma aba aberta em qualquer
site.

**O que não fica, e está dito:** outro processo local, ou outro usuário da mesma máquina, continua
falando com o daemon à vontade. `Host` e `Origin` são cabeçalhos — só um browser é obrigado a dizer a
verdade neles. Isso é a fase 2, e dizer *"o daemon agora é autenticado"* seria ensinar alguém a
confiar numa proteção que não existe.

**O desenvolvimento passa a depender de uma variável.** O `pnpm dev` serve a página pelo vite, numa
segunda porta, e para o browser isso é outra origem: `LUMEM_WEB_ORIGINS` é como a porta escolhida por
workspace entra na lista. O `run.sh` exporta a que `resolve_ports` escolheu e o `playwright.config.ts`
a do e2e — e foi **medido** que a linha é carregada: apontá-la para a porta errada derruba a primeira
mutação da suíte, porque o proxy do vite encaminha o `Origin` do browser.

**A fase 2 herda duas coisas.** A origem única que ela precisa já existe desde a
[distribution](../features/014-distribution/prd.md), e o contrato *"sem sinal de browser passa"* é
exatamente o que ela troca por *"sem credencial não passa"* — o que exige o token por sessão da fase
3 chegar ao agente sem ele pedir.

**Gatilho de revisitar:** a fase 2 entregue. Aí `LUMEM_HOST` fora do loopback volta a subir, com
token obrigatório, e este ADR é reafirmado em parte por quem escrever o próximo.
