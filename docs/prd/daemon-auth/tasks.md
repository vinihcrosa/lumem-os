# O daemon confere quem fala com ele — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **fase 1 completa — 7 tasks entregues em 2026-09-06.** As fases 2 e 3 estão
**esboçadas e paradas**: a fase 2 espera a [S7](open-questions.md), que nasceu lendo a S2 contra o
código, e a fase 3 depende da fase 2 para a metade "humano é quem tem o cookie".

A fase 1 saiu do tamanho que o PRD prometeu — um dia — e o que ela cobrou não estava no código de
produto: estava na suíte. Nenhum teste de transporte dizia **a quem** falava, porque nunca tinha
importado. Sob o guarda, o `Host: localhost:80` que o `light-my-request` manda por padrão é
indistinguível de uma página que fez rebinding, e isso é uma coisa boa de descobrir num teste.

---

## Antes de começar

**O que muda no daemon:** um módulo novo, `packages/server/src/auth/`, com duas metades — a decisão
(`origin-policy.ts`, funções puras sobre um registro de requisição) e a ligação (`request-guard.ts`,
um `onRequest` do Fastify e um guarda no roteador de upgrade). O roteador de upgrade
(`ws/upgrade.ts`) ganhou o guarda como primeira coisa que ele faz, antes de olhar o caminho.

**O que muda fora dele:** `@lumem/shared` ganhou `isLoopbackHost` e as listas de loopback, porque a
CLI e o daemon precisam concordar sem conversar. `LUMEM_WEB_ORIGINS` nasceu e passa pelo turbo, pelo
`run.sh` e pelo `playwright.config.ts`.

**O que não muda, e por quê:**

| Não muda | Por quê |
|---|---|
| a rota `/memory/ask` e a skill que ensina o `curl` | S4 — token por sessão é fase 3; até lá o `?session=` continua confiado, e o PRD §3 diz por quê isso é o produto |
| o `Context` do tRPC | nenhuma identidade entra nele na fase 1; entra na fase 2, com o token |
| o e2e | **nenhum spec novo** (PRD §8). A suíte inteira verde é a prova de que o browser e a API continuam entrando — e o `LUMEM_WEB_ORIGINS` no `playwright.config.ts` é a única linha que ela precisou |
| `web/static.test.ts` | monta um Fastify cru sem `createServer`, então não tem guarda — e é correto: ele testa o fallback de SPA, não a porta |

**A regra do PRD que este arquivo obedece:** *"tirar a checagem do upgrade tem que derrubar um
teste"*. Foi conferido à mão nas duas mutações — o roteador ignorando o guarda (2 testes caem) e o
`createServer` sem registrar o guarda (9 caem) — antes do primeiro commit.

---

## Fase 1 — `Host`, `Origin` e `Sec-Fetch-Site`

#### T1: A decisão, pura

**What**: `origin-policy.ts` — `checkHost`, `checkOrigin`, `needsOriginCheck`, `judge` e
`parseWebOrigins`, sobre um `GuardedRequest` que é um registro e não um `IncomingMessage`.
**Where**: `packages/server/src/auth/origin-policy.ts`, `origin-policy.test.ts`;
`packages/shared/src/loopback.ts`, `loopback.test.ts`

**Done when**:
- [x] `Host` passa só em `{127.0.0.1, localhost, [::1]}:<porta>`, caixa-insensível; falta de porta,
      porta errada, nome estranho e cabeçalho ausente são **421** com a frase que lista os três nomes
- [x] `Origin` presente tem que estar na lista — as três origens do próprio daemon mais
      `webOrigins`; `null` (a origem opaca) recusa. Ausente com `Sec-Fetch-Site: cross-site` recusa;
      `same-origin`, `same-site`, `none` passam. **Nenhum dos dois passa** — é o `curl`
- [x] Quando os dois vêm, `Origin` decide: é o mais específico
- [x] A checagem de origem se aplica a **todo upgrade**, a todo método fora de `GET`/`HEAD`, e ao
      `GET /memory/ask` — uma lista de um item, com o teste que a guarda
- [x] `parseWebOrigins` aceita vírgula, espaço e barra final, e **substitui** o default em vez de
      somar a ele
- [x] `isLoopbackHost` aceita as três grafias (`::1` e `[::1]` são a mesma) e recusa `0.0.0.0`, `::`
      e qualquer endereço de rede
- [x] Gate: `pnpm gate:quick`

#### T2: O gancho do Fastify e o guarda do upgrade

**What**: `registerRequestGuard` — um `onRequest` que responde `421`/`403` em `text/plain`, e o
`setUpgradeGuard` que o roteador de upgrade consulta **antes** de procurar o caminho. A porta julgada
é a do socket que escuta quando há um, e a configurada sob `inject`.
**Where**: `packages/server/src/auth/request-guard.ts`, `packages/server/src/ws/upgrade.ts`,
`packages/server/src/server.ts`

**Done when**:
- [x] O guarda é a primeira coisa depois de `Fastify()`, antes de qualquer rota — e o comentário no
      `createServer` diz por quê
- [x] O roteador de upgrade tem **um** guarda; instalar o segundo é erro, pelo mesmo motivo que dois
      handlers no mesmo caminho são
- [x] A recusa de upgrade é uma resposta HTTP completa (`status`, `Content-Type`, `Content-Length`,
      corpo) e o socket é destruído — o `ws` do cliente vê `unexpected-response`, nunca `open`
- [x] O 404 de caminho desconhecido passou a usar o mesmo `refuse`, com corpo
- [x] `listen({ port: 0 })` funciona: o guarda lê `app.server.address()` e não a configuração —
      sem isso toda a suíte de WebSocket recusaria o próprio cliente
- [x] Gate: `pnpm gate:quick`

#### T3: A prova sobre HTTP

**What**: o teste de transporte da F1 e da F2 por `app.inject`, com os casos do §8 do PRD.
**Where**: `packages/server/src/auth/request-guard.test.ts`

**Done when**:
- [x] `Host: evil.example:4317` → **421**, `text/plain`, corpo com os três nomes; os três loopbacks
      na porta certa → 200; porta errada → 421; caminho inexistente com `Host` ruim → **421, não 404**
- [x] `POST /trpc/workspace.create` com `Origin: http://evil.example` → **403** com a origem no corpo;
      com a origem do daemon → 200; com a do vite (default) → 200; com `LUMEM_WEB_ORIGINS` → a lista
      nova passa **e a default deixa de passar**
- [x] `GET /memory/ask` com `Sec-Fetch-Site: cross-site` → 403; com `Origin` estranho → 403; sem
      cabeçalho nenhum → 200
- [x] `GET /trpc/health` com `Sec-Fetch-Site: cross-site` → **200**: `GET` inofensivo não é julgado,
      porque o browser não consegue ler a resposta de qualquer forma
- [x] `POST` sem sinal de browser → 200 — é o e2e e a CLI
- [x] `LUMEM_HOST=0.0.0.0` faz `loadConfig` lançar: não há interruptor
- [x] Gate: `pnpm gate:quick`

#### T4: A prova sobre WebSocket, antes do handshake

**What**: listener de verdade, cliente `ws` cru, e a asserção de que a recusa é um status HTTP e não
uma conexão aberta e depois fechada.
**Where**: `packages/server/src/auth/request-guard.upgrade.test.ts`

**Done when**:
- [x] Sem sinal de browser → `open`; com a origem do próprio daemon → `open`
- [x] `Host` estranho → **421** em `unexpected-response`, com corpo; `Origin` estranho → **403**
- [x] `Host: localhost:<porta real>` com `listen({ port: 0 })` → `open` — a porta julgada é a do socket
- [x] Só `/pty` é exercitado, e o comentário diz por quê basta: o guarda roda antes do caminho, e o
      roteador é um só para `/pty` e `/acp`
- [x] **Mutação conferida:** o roteador ignorando o guarda derruba os dois testes de recusa
- [x] Gate: `pnpm gate:quick`

#### T5: Todo `app.inject` da suíte passa a dizer a quem fala

**What**: o `Host` explícito nos cinco arquivos de transporte, por um helper que aplica a mesma regra
do guarda — porta do socket quando escuta, configurada quando não.
**Where**: `packages/server/src/testing/authority.ts`; `server.test.ts`, `bootstrap.test.ts`,
`routers/files.transport.test.ts`, `memory/http.test.ts`

**Done when**:
- [x] `loopbackAuthority(app, port)` existe e o comentário diz o que o default do `light-my-request`
      significa sob o guarda
- [x] Os 19 `inject` dos quatro arquivos mandam `authority`; nenhum caso de teste mudou de asserção
- [x] `web/static.test.ts` **não** muda: ele monta Fastify cru, e a razão está registrada acima
- [x] Gate: `pnpm gate:quick`

#### T6: `LUMEM_HOST` fora do loopback não sobe (S5)

**What**: a recusa nos dois lugares — a CLI antes de sondar a porta, e o `loadConfig` para quem sobe
o daemon sem a CLI. Mais `LUMEM_WEB_ORIGINS` na configuração.
**Where**: `packages/server/src/config.ts`, `config.test.ts`; `packages/cli/src/run.ts`, `args.ts`,
`run.test.ts`

**Done when**:
- [x] `loadConfig({ LUMEM_HOST: "0.0.0.0" })` lança com a frase que nomeia a fase 2; `127.0.0.1`,
      `localhost` e `::1` passam
- [x] `lumem --host 0.0.0.0` sai com **2** e a frase, **sem** sondar a porta e sem subir; `LUMEM_HOST`
      do ambiente recebe o mesmo tratamento; `--host localhost` sonda `http://localhost:4317`
- [x] O caso especial de `0.0.0.0` no `origin` do `run.ts` sumiu — era código para um valor que agora
      não chega lá
- [x] O `HELP` da CLI deixa de dizer "nada nele autentica" e passa a dizer o que ele confere
- [x] `webOrigins` tem o vite como default e `LUMEM_WEB_ORIGINS` o substitui
- [x] Gate: `pnpm gate:quick`

#### T7: O desenvolvimento e o e2e continuam entrando

**What**: `LUMEM_WEB_ORIGINS` chega ao daemon nos três lugares em que o web mora noutra porta.
**Where**: `turbo.json`, `scripts/workspace/run.sh`, `playwright.config.ts`,
`docs/project/workspaces.md`

**Done when**:
- [x] `turbo.json` deixa a variável passar — sem isso `pnpm dev` exportaria para ninguém, do mesmo
      jeito que o `LUMEM_STATE_DIR` já mordeu uma vez
- [x] `run.sh` exporta a lista a partir da porta que **ele** escolheu, para o modo isolado funcionar
- [x] O daemon de dev do playwright recebe a origem do vite; o daemon de **produção** do playwright
      não recebe nada, porque lá o daemon é a origem
- [x] `pnpm gate:full` verde, **sem e2e novo** — é a regressão da feature
- [x] Gate: `pnpm gate:full`

---

## Fase 2 — token (F3) · **parada na S7**

> Esboço. Não começa antes da [S7](open-questions.md) ter resposta, porque a S7 muda a T-F3.2.

- **T-F3.1** — `~/.lumem/secret`: 32 bytes no primeiro boot, `0600`, no bloco do `.gitignore` do
  `home.ts` (S6). Teste: o arquivo nasce com o modo certo e sobrevive ao segundo boot.
- **T-F3.2** — o browser obtém o cookie `HttpOnly`, `SameSite=Lax`, `Path=/` (S2, S3). **Como**
  ele o obtém é a S7. Em desenvolvimento o web é o vite, então a rota que entrega o cookie tem que
  passar pelo proxy — `GET /` **não** passa, e isso também precisa de resposta.
- **T-F3.3** — `Authorization: Bearer` para CLI, e2e e `curl`; o `Context` do tRPC ganha identidade.
- **T-F3.4** — tudo exige um dos dois, **menos** `GET /`, `/assets/*` e `/trpc/health`. Sem
  credencial: `401`, texto. O e2e (`e2e/support/daemon.ts`) e o `probePort` da CLI passam a
  mandar o `Bearer`, e o `smoke:install` também.
- **T-F3.5** — `LUMEM_HOST` fora do loopback volta a subir, com token obrigatório (S5), e o `Host`
  configurado entra na lista da F1.

## Fase 3 — identidade de sessão (F4) · **fecha a Q46**

- **T-F4.1** — token por sessão injetado como `LUMEM_SESSION_TOKEN` no `env` do adaptador e do
  shell. **Armadilha achada na fase 1:** o id da sessão é o id do processo (`SessionStore.ts`), então
  o token nasce antes do spawn ou é derivado do id depois — decidir antes de codar.
- **T-F4.2** — `/memory/ask` aceita o `Bearer` de sessão e **deriva** a sessão dele; `?session=`
  deixa de existir. A skill (`skill.ts`) e o `preamble.ts` mudam no mesmo commit.
- **T-F4.3** — `actor` deixa de ser declarado: `agent` é quem apresenta token de sessão, `human` é
  quem tem o cookie. O `writeMemorySchema` deriva, e a Q27 passa a valer contra quem quer burlá-la.
- **T-F4.4** — o agente falso do e2e imprime o `env` que recebeu; token inventado → `401`.
