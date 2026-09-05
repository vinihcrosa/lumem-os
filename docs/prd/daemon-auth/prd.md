# PRD — O daemon confere quem fala com ele

> **Status:** v0.1 — proposto em 2026-09-05, **perguntas abertas**. Sai do backlog ("Autenticação do
> daemon", seção F) e da **Q46** da [workspace-memory](../workspace-memory/open-questions.md), que é a
> identidade de ator. O gatilho do backlog era "quando o daemon escutar fora do loopback"; a avaliação
> de arquitetura do mesmo dia mostrou que duas das ameaças não esperam por isso.
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** ainda não — nascem depois das perguntas respondidas
> **Depende de:** nada. A origem única que a fase 2 precisa **já existe**: desde a
> [distribution](../distribution/prd.md) o daemon serve o web na própria porta (`web/static.ts`). O
> vite continua sendo uma segunda origem **só em desenvolvimento**
> **Desenho:** nenhuma tela. Recusa é texto, como toda recusa do daemon

---

## 1. O problema, em uma frase

**O daemon executa comandos com as suas permissões e não confere quem pediu.**

Medido no código em 2026-09-05:

| O quê | Onde |
|---|---|
| escuta em loopback por default | `config.ts`: `host: "127.0.0.1"` |
| nenhuma autenticação em rota nenhuma | não há plugin, hook, nem identidade no `Context` (`trpc.ts`) |
| o upgrade de WebSocket despacha **só por path** | `ws/upgrade.ts` — não lê `Origin` nem `Host` |
| `/pty` e `/acp` não olham `Origin` | `pty/websocket.ts`, `acp/websocket.ts` |
| nenhuma rota confere `Host` | default do Fastify |
| **nenhum CORS registrado** — isto ajuda | o browser bloqueia leitura cross-origin e exige preflight para `POST` com JSON |
| `GET /memory/ask` é texto puro, sem credencial | `memory/http.ts` — **por desenho**: é a porta do `curl` do agente |
| o `?session=` do `/memory/ask` é **confiado** | quem informa o id da sessão define escopo e ator |
| a CLI aceita `--host 0.0.0.0` | `packages/cli/src/args.ts` — expor o daemon na rede é um flag, e nenhuma credencial vem junto |

O que o daemon pode fazer por quem pedir: abrir shell (`session.createShell`) e escrever nele (`/pty`),
criar e apagar arquivo dentro de qualquer checkout registrado (`files.*`), rodar `git worktree`,
mandar prompt para um agente (`/acp`) e responder pedido de permissão por ele, gastar token pelo
auto-learn. Tudo com as suas permissões de usuário.

## 2. As ameaças, em ordem de realidade

### 2.1 DNS rebinding — a única que não depende de nada

Uma página em `evil.example` com TTL zero. Na segunda resolução o domínio passa a apontar para
`127.0.0.1`. Para o browser, `http://evil.example:4317` é a **mesma origem** da página que ele já
carregou; nenhuma regra de CORS se aplica. Daí `fetch("/trpc/session.createShell", …)`, depois
`new WebSocket("ws://evil.example:4317/pty?session=<o id que voltou>")`, depois `rm -rf`. Execução
remota como você, a partir de uma aba.

O daemon recebe `Host: evil.example:4317`. **Conferir `Host` é a única defesa**, e é suficiente.

### 2.2 Sequestro de WebSocket cross-site

WebSocket não obedece CORS. Qualquer página pode abrir `ws://127.0.0.1:4317/acp?session=<id>` e, se
souber o id, ler a transcrição inteira no `attached` e mandar `prompt`. Hoje o id é um UUID que não
aparece em URL nenhuma — mitigação real, mas por acidente de o cliente não ter roteador. Conferir
`Origin` fecha isto independentemente do id. E a conta subiu com a
[session-mode](../session-mode/prd.md): uma sessão em `liberado` executa sem perguntar, então um socket
sequestrado nela é um agente fazendo o que o atacante mandar no `prompt`.

### 2.3 Efeito colateral por `GET`

Query do tRPC é `GET`, e `GET /memory/ask` **tem efeito**: grava `memory_usage` e, com o auto-learn
ligado, **sobe um agente e gasta token**. Um `<img src="http://127.0.0.1:4317/memory/ask?q=…">` em
qualquer página dispara isso. `Host` fecha a variante por rebinding; `Sec-Fetch-Site: cross-site`,
que todo browser moderno manda, fecha a variante direta.

### 2.4 Fora deste PRD

| Ameaça | Por quê fica de fora |
|---|---|
| outro **usuário** da mesma máquina, no mesmo loopback | é o que o token da fase 2 resolve, e ele é fase 2 porque a máquina é sua |
| o **agente** dentro da sessão fazendo o que não devia | é política de permissão — backlog B, `G` |
| escutar fora do loopback, TLS, multi-host | backlog, `G`. A **S5** decide o que o daemon faz **hoje** quando `LUMEM_HOST` não é loopback |

## 3. O que a decisão do ACP impõe aqui

A porta do agente é `curl` para `/memory/ask`, ensinada no prompt, "copiável sem raciocínio"
(`http.ts`). Então qualquer credencial que o agente precise apresentar tem que chegar até ele **sem
ele pedir**: variável de ambiente injetada pelo daemon no processo que o próprio daemon lança. O
`AcpManager` lança o adaptador e o `PtyManager` lança o shell — os dois já montam `env`.

## 4. Escopo

### F1 — `Host` permitido (fase 1)

Um `onRequest` do Fastify **e** o roteador de upgrade recusam qualquer requisição cujo `Host` não
esteja em `{127.0.0.1, localhost, [::1]}` com a porta em que o daemon escuta. Quando `LUMEM_HOST` não
é loopback, o valor configurado entra na lista. Recusa: `421 Misdirected Request`, `text/plain`, uma
frase. Aplica-se **antes** do handshake de WebSocket.

Não é configurável para desligar. A única forma de alargar é `LUMEM_HOST`.

### F2 — `Origin` e `Sec-Fetch-Site` (fase 1)

Para todo upgrade de WebSocket, toda requisição que não é `GET`, e para `GET /memory/ask`:

- se veio `Origin`, ele tem que estar na lista: a origem do próprio daemon (que já serve o web,
  `web/static.ts`) mais as origens de desenvolvimento de `LUMEM_WEB_ORIGINS` — default
  `http://127.0.0.1:4318,http://localhost:4318`. O `.superset/run.sh` passa a exportar a variável com a
  porta que ele escolheu;
- se não veio `Origin` mas veio `Sec-Fetch-Site: cross-site`, recusa;
- sem nenhum dos dois — `curl`, o e2e pela API, o agente — **passa**. É a porta do produto.

Recusa: `403`, `text/plain`, uma frase. O socket é fechado antes do handshake.

**A fase 1 inteira cabe num dia**, e fecha 2.1, 2.2 e 2.3.

### F3 — Token (fase 2)

A origem única que isto pede já existe: o daemon instalado serve o web na própria porta desde a
distribution.

O que a fase 1 não fecha: um processo local qualquer — outro usuário, ou um `curl` de uma página que
achou como forjar `Host` — fala com o daemon. O token fecha:

- o daemon gera 32 bytes aleatórios no primeiro boot e guarda em `~/.lumem/secret`, modo `0600`
  ([S6](open-questions.md));
- **browser:** `GET /` responde com o cookie `lumem_token`, `HttpOnly`, `SameSite`
  ([S3](open-questions.md)), `Path=/`. Mesma origem, então ele viaja sozinho para `/trpc` e para o
  upgrade. Pelo proxy do vite também funciona: o `Set-Cookie` atravessa o proxy, o browser o guarda
  para `127.0.0.1:4318`, e o proxy o devolve;
- **CLI, e2e, `curl`:** `Authorization: Bearer <token>`;
- tudo exige um dos dois, **menos** `GET /`, `/assets/*` e `/trpc/health`. Sem credencial: `401`,
  texto.

### F4 — Identidade de sessão (fase 3) — fecha a Q46

O daemon gera um token **por sessão** e o injeta como `LUMEM_SESSION_TOKEN` no `env` do adaptador e
do shell daquela sessão. `/memory/ask` — e o futuro `POST /tasks` da
[workspace-tasks](../workspace-tasks/prd.md) — aceitam esse token como `Bearer` e **derivam** a sessão
dele; o `?session=` deixa de existir. A skill que ensina o `curl` é gerada pelo daemon (`skill.ts`),
então as duas coisas mudam no mesmo commit.

Consequência: **ator provado.** `agent` é quem apresenta token de sessão; `human` é quem tem o cookie.
O `actor` do `writeMemorySchema`, hoje "declarado, e ainda não provado", passa a ser derivado — e a
Q27 da memória (escrever para cima é proposta) passa a proteger contra quem quer burlá-la, não só
contra engano.

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| TLS | loopback. Volta com multi-host |
| Escutar fora do loopback | idem. A **S5** só decide o que fazer com quem já configura isso hoje |
| Múltiplos usuários com identidades distintas | há um usuário. O token distingue "você" de "não você", e é tudo |
| Keychain do sistema | um arquivo `0600` no state dir que o daemon já versiona com `.gitignore` é o mesmo nível de proteção do `~/.ssh` |
| Rate limiting | ninguém está atacando por volume um daemon de loopback |

## 5. Decisões que já dá para tomar

- **`Host` é incondicional.** Sem flag para desligar: a única forma de alargar é configurar outro host.
- **Requisição sem sinal de browser passa na fase 1.** Porque a porta do agente é `curl`, e é o
  produto. A fase 2 é o que fecha isso — com uma credencial que o daemon entrega ao agente.
- **Recusa é uma frase.** `421` e `403` em `text/plain`, o mesmo padrão de todo erro do daemon.
- **A fase 1 não depende de nada.** A lista de origens tem a do daemon e, só em desenvolvimento, a
  do vite.

## 6. Riscos

| Risco | Defesa |
|---|---|
| quebrar o desenvolvimento por Superset, que escolhe porta do vite por workspace | `run.sh` exporta `LUMEM_WEB_ORIGINS`; o e2e (`4418`) entra pelo `playwright.config.ts` |
| `localhost` resolvendo para `::1` | `[::1]` está na lista; o vite já escuta em `127.0.0.1` explicitamente |
| o cookie e o `lumem --open`: navegação de fora com `SameSite=Strict` | o primeiro `GET /` **define** o cookie na resposta, então a página seguinte já o tem. Mesmo assim a **S3** propõe `Lax` |
| `LUMEM_SESSION_TOKEN` no `env` do shell vaza para qualquer processo daquela sessão | é o desenho: o token é **daquela** sessão. O vazamento máximo é a própria sessão falar por si |
| testes com `app.inject` usam `Host: localhost:80` por default | a porta vem da configuração; o caller (`createTestCaller`) não passa por HTTP e não sente. `files.transport.test.ts` e os testes de WebSocket passam `Host` |
| um `Host` com porta diferente da escutada (proxy na frente) | não há proxy na frente em loopback. Quando houver, é `LUMEM_HOST` |

## 7. Fases

1. **F1 + F2** — um dia. Fecha as três ameaças reais;
2. **F3** — logo depois: a origem única já existe;
3. **F4** — junto com a F3 da workspace-tasks, ou antes: é o que faz "quem escreveu isto" deixar de
   ser uma declaração.

## 8. Custo nos testes

| Camada | Teste |
|---|---|
| F1 | integration `app.inject`: `Host: evil.example:4317` → `421`; `localhost:<porta>`, `127.0.0.1:<porta>`, `[::1]:<porta>` → passam; porta errada → `421`. Upgrade com `Host` ruim → socket fechado sem handshake (cliente `ws` cru) |
| F2 | upgrade com `Origin` fora da lista → `403` antes do handshake; `Origin` da lista → `attached`. `POST /trpc/...` com `Origin` ruim → `403`. `GET /memory/ask` com `Sec-Fetch-Site: cross-site` → `403`; sem cabeçalho nenhum → `200`. **Mutação:** tirar a checagem do upgrade tem que derrubar um teste |
| F3 | `GET /` define o cookie com as flags; `/trpc/*` sem cookie e sem `Bearer` → `401`; com qualquer um dos dois → passa; `/trpc/health` sem nada → passa. O arquivo `secret` nasce `0600` |
| F4 | o agente falso imprime o `env` que recebeu: contém `LUMEM_SESSION_TOKEN`; `/memory/ask` com `Bearer` de sessão registra `memory_usage` **naquela** sessão; token inventado → `401`; `?session=` deixa de ser aceito |
| e2e | **nenhum novo.** A suíte inteira continua verde é a prova de que o browser e a API do e2e ainda entram — e é o teste de regressão da feature |

Portão: `gate:full`.
