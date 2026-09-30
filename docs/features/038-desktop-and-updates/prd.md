# O Lumem fica de pé sozinho, se atualiza, e mora na barra do sistema

> **Status:** completa
> **Histórico:** v0.1 — proposta em **2026-09-29**, a partir da discovery *Menu bar app and auto-update*
> no Outline ([a discovery](https://wiki.cazimi.tech/doc/menu-bar-app-and-auto-update-2026-09-29-GlrYzLAAou) ·
> [as perguntas, respondidas](https://wiki.cazimi.tech/doc/open-questions-menu-bar-and-auto-update-S8ijH9cb9K)).
> O pedido, nas palavras do dono: *"um app menu bar, que mostra o uso do lumem-os, e nele mostra a versão
> atual, e se tem update para fazer, e a outra feature é um auto update"*. As decisões de arquitetura
> desceram para três ADRs: [o daemon é o produto](../../adr/2026-09-29-2002-the-daemon-is-the-product-clients-are-shells.md),
> [o cliente Electron](../../adr/2026-09-29-2003-lumem-ships-an-electron-client-next-to-the-daemon.md) e
> [o daemon se atualiza sozinho](../../adr/2026-09-29-2004-the-daemon-updates-itself-under-a-supervisor.md).
> O resto do que a discovery respondeu está nos critérios abaixo; o que ficou em aberto está em
> [open-questions.md](open-questions.md).

## Problem

O Lumem só existe enquanto um terminal está aberto. `lumem` roda o daemon **em primeiro plano, no mesmo
processo** (`packages/cli/src/run.ts:41-43`), sem pidfile, sem launchd e sem systemd. Fechar o terminal
derruba as sessões; deixar o Lumem ligado o dia inteiro é deixar um terminal ocupado — o gatilho que o
[backlog](../../project/backlog.md) marcou para o item *"O daemon em background"*.

Atualizar custa dois passos e quebra a tela no meio. Foram **sete versões em 23 dias** (`0.1.0` em
2026-08-30 até `0.6.0` em 2026-09-22, `npm view @vinihcrosa/lumem-os time`), e cada uma pede
`lumem upgrade` e depois *"pare e suba de novo para valer"* (`packages/cli/src/upgrade.ts:191`). Entre os
dois passos, a web do daemon velho fica em branco: o `@fastify/static` com `wildcard: false` registra uma
rota por arquivo que existia no boot (`packages/server/src/web/static.ts:82`), e o `index.html` novo aponta
para assets que o daemon velho não conhece. Isso foi **lido, não reproduzido** — é o experimento 1 da fase 0.
O daemon nunca pergunta sozinho se há versão nova.

E não há onde olhar o Lumem sem abrir o navegador. Uso, versão e *"tem atualização?"* só aparecem numa aba,
e três números que importam nem existem como consulta: não há **total de todos os workspaces** (o `usage.*`
é sempre por workspace ou projeto, `packages/server/src/routers/usage.ts`); a **cota da assinatura** fica só
na memória do `AcpManager` (`rateLimits()`, `acp/AcpManager.ts:1833`); e **CPU e memória** do Lumem não são
medidos em lugar nenhum.

Quando isto sair: o Lumem sobe com a máquina e continua de pé com o terminal fechado. Um ícone na barra do
macOS ou do Linux diz se ele está rodando, se há atualização e se alguém precisa de você. O painel mostra a
cota, o gasto do dia, as sessões e quanto de CPU e memória o Lumem inteiro está usando. Atualizar é um
clique, e quem quiser liga *atualizar sozinho quando ocioso*.

## Flow

Reusa o `upgrade.ts` do CLI (registry, `compareVersions`, gerenciador dono da cópia), o `health` público,
o `AcpManager.liveTurns()` e o `rateLimits()` que já existem, o `ScriptRunner` para saber de script
rodando, as consultas de `usage/query.ts`, o roteamento escrito à mão de `web/src/lib/route.ts`, e o
`createShutdownHandler` para sair com 0.

**Parte 1 — o daemon sob um supervisor**

1. `lumem start` → `parseCommand` em `packages/cli/src/args.ts` (exists) — ganha os verbos `run`, `stop`,
   `status` e `logs` (door 1)
2. `service.ts` do CLI (new, no door - placement per conventions) — escreve o plist do launchd ou a unit do
   `systemd --user` com o `PATH` de quem chamou, e os carrega (door 2)
3. launchd ou systemd executa `<node> <lumem> run` → `run` em `packages/cli/src/run.ts` (exists) — o
   primeiro plano de hoje, com `LUMEM_SUPERVISOR` no ambiente
4. out: `health` em `packages/server/src/routers/index.ts` (exists) responde `supervised` e
   `protocolVersion` (door 4)

**Parte 2 — o update manual, num gesto só**

1. boot e um relógio de 6 h → `update/check.ts` do servidor (new, no door - placement per conventions) —
   chama o `fetchLatestVersion` e o `compareVersions` que saem de `packages/cli/src/upgrade.ts` (exists)
   para o `shared`, e guarda o resultado em memória
2. `system.updateStatus` e `system.update` num router `system` (new, no door - placement per conventions)
   — a mutação confere ocioso por `AcpManager.liveTurns()` (exists) e pelo `ScriptRunner` (exists)
3. `AcpManager.prompt` (exists) — recusa turno novo enquanto a instalação roda
4. `update/install.ts` (new, no door - placement per conventions) — roda o gerenciador dono da cópia; com
   saída 0, o `createShutdownHandler` (exists) fecha tudo e sai com 0, e o supervisor sobe a versão nova
5. boot → `openDatabase` em `packages/server/src/db/index.ts` (exists) → `db/backup.ts` (new, no door -
   placement per conventions) — antes de migrar, copia o `lumem.db` quando `<stateDir>/last-version` diz
   outra versão (door 7), e só grava a versão nova depois de as migrações passarem
6. out: `features/update/` (new, no door - placement per conventions) — o `UpdateBanner` da topbar, com o
   hook de `system.updateStatus` e o botão que chama `system.update`
7. out: `useVersionReload` em `packages/web/src/hooks/useVersionReload.ts` (new, no door - placement per
   conventions) — o `App` lhe passa o `health.version` que o `useHealth` (exists) já lê; com versão
   diferente do `LUMEM_VERSION` do bundle, recarrega a página uma vez, e uma guarda no `sessionStorage`
   impede o segundo

**Parte 3 — os dados e a página `/menubar`**

1. `usage.total` em `packages/server/src/routers/usage.ts` (exists) — uma consulta sobre todo o
   `session_usage` da janela
2. `agentAccount.rateLimits` em `packages/server/src/routers/agentAccount.ts` (exists) — lê
   `AcpManager.rateLimits()` (exists) e agrupa por conta
3. `system.resources` → `resources/sample.ts` do servidor (new, no door - placement per conventions) — lê a
   tabela de processos (`ps` no macOS, `/proc` no Linux; `process-table.ts`) só enquanto alguém olha, e
   atribui cada processo a `daemon`, `agents` ou `terminals` (`attribute.ts`) pelos PIDs que o `AcpManager`
   (exists) e o `PtyManager` (exists) conhecem; `live.ts` liga isso aos dois managers e ao banco, para o rótulo
4. `system.status` (new, no door - placement per conventions) — o resumo barato que a casca consulta
5. out: `routeOf` em `packages/web/src/lib/route.ts` (exists) ganha `/menubar` (door 5), e a tela nasce em
   `packages/web/src/features/menubar/` (new, no door - placement per conventions)

**Parte 4 — o app Electron**

1. `lumem menubar install` → `menubar.ts` do CLI (new, no door - placement per conventions) — instala o
   pacote da plataforma (door 5) com o gerenciador dono da cópia, grava o `lumem-desktop.json` (door 9) com
   `node`, `lumem`, o state dir, a origem e o `PATH`, e põe o app no lugar: `Lumem.zip` descompactado em
   `~/Applications` por `ditto` no macOS, os dois `.desktop` no Linux. `open` e `uninstall` moram no mesmo
   arquivo, e `lumem upgrade` (exists) leva o app junto por `takeDesktopAlong`
2. o processo principal em `packages/desktop/` (door 6) — o `main.ts` só liga: o ícone
   (`tray-state.ts`), o menu (`menu.ts`), as janelas e a trava de navegação (`windows.ts`) e o `Iniciar` e
   `Parar` (`commands.ts`) decidem, e o `poll.ts` pergunta `health` e `system.status`; o `index.ts` é o único
   arquivo que importa o Electron
3. out: janelas que carregam `<origem>/menubar` e `<origem>/` do daemon; com o daemon parado, uma página
   local (`assets/stopped.html`), e o `Iniciar` dela chega ao `main.ts` pelo `preload.ts`
4. release: `pack.ts` chama o `electron-builder` e monta o pacote npm de cada plataforma em volta do que
   ele produz; o job `desktop` de `release.yml` roda um por plataforma e arquitetura, e o job `publish`
   os publica antes do daemon

**Parte 5 — atualizar sozinho quando ocioso**

1. o relógio de 60 s em `update/auto.ts` (new, no door - placement per conventions) — com `auto_update`
   em `idle` no `daemon_settings` (door 3), supervisionado, com versão nova do mesmo major (depois da 1.0) e
   ocioso (`busyNow`), dispara o mesmo caminho da Parte 2, passo 3 em diante: o `installer.start`
2. `runConveyorLoop` em `packages/server/src/tasks/conveyor-loop.ts` (exists) pula a passada enquanto `installer.installing()` — a instalação do botão também: a porta
   de prompt já está fechada, e uma tarefa despachada nela gastaria uma tentativa antes de o prompt ser recusado

## Impact

| Front | What changes |
| --- | --- |
| CLI | `lumem` e `lumem start` deixam de rodar em primeiro plano e passam a instalar e subir o serviço; o primeiro plano de hoje vira `lumem run` ([Q1](open-questions.md)). Quem depende do primeiro plano hoje: o `scripts/smoke-install.ts`, que sobe o binário instalado e passa a chamar `lumem run`, e quem digita `lumem` e espera o terminal preso. O `pnpm dev` não passa pelo CLI publicado |
| CLI | `lumem upgrade` deixa de dizer *"pare e suba de novo"* quando há serviço: ele o reinicia. Com o app instalado, leva o app junto |
| domain | termo novo: **supervisionado** — o daemon roda sob launchd ou systemd (`LUMEM_SUPERVISOR` no ambiente); é o que libera o botão de atualizar |
| domain | termo novo: **ocioso** — `AcpManager.liveTurns()` vazio e nenhum script de projeto rodando; mora em `update/`; ninguém ramifica nele hoje |
| domain | termo existente: `health` respondia `{ ok, version }` e passa a responder também `supervised` e `protocolVersion`. Quem lê hoje: `probePort` no CLI (`packages/cli/src/port.ts`) e a topbar pelo `useHealth` — os dois leem só `ok` e `version`, e seguem funcionando |
| domain | termo existente: `AcpManager.prompt` aceitava sempre; passa a recusar enquanto uma instalação roda. Quem chama: `acp/websocket.ts:135`, `sessions/pending-prompt.ts:169` e a esteira em `bootstrap.ts:386`, que já tratam erro de `prompt`; e a destilação e a pesquisa da memória (`memory/capture.ts:187`, `memory/auto-learn.ts:254`), que o propagam para quem as chamou |
| domain | termo existente: para o painel, `AcpProcess` ganha `pid`, o `AcpManager` ganha `liveProcesses()` e `hasPendingPermission()` (e `rateLimits()` passa a dizer `reportedAt`, `accountId` e `adapterId`), o `PtyManager` ganha `livePids()`, e o `Context` do tRPC ganha `resources`; `PROTOCOL_VERSION` sobe para `@lumem/shared`, porque `health` e `system.status` o respondem |
| domain | termo existente: `ScriptRunner` ganha `runningCount()` (a metade de *ocioso* que ele responde); implementam a interface o `createScriptRunner` e o fake de `worktree.start.test.ts`. E `DomainErrorCode` ganha `PRECONDITION_FAILED`, que o tRPC mapeia a `PRECONDITION_FAILED` e os dois sockets (`acp/websocket.ts`, `pty/websocket.ts`) a `INTERNAL` |
| domain | termo existente: `runConveyorLoop` ganha `paused?: () => boolean`, que o `bootstrap` liga a `installer.installing()`; quem chama hoje é só o `bootstrap`, e o padrão (nunca pausa) é o comportamento de antes |
| web | `Topbar` ganha o slot `update`, que o `App` preenche com o `UpdateBanner`: `layout/` não conhece `features/`. E o `test/setup.ts` marca toda aba de teste como *já recarregou*, porque os testes de tela respondem `health` com versões que não são a do bundle |
| web | rota nova `/menubar` em `lib/route.ts`. A armadilha *"Uma tela nova derruba testes cujo mock não a conhece"* de `testing.md` se aplica |
| web | o `MenubarScreen` também roda `useVersionReload`, com a versão que o `updateStatus` já traz (`current`): o app esconde o painel em vez de fechá-lo, então ele fica aberto por dias, e uma atualização do daemon o deixaria no bundle velho (AC 34). O painel não ganha pergunta nenhuma |
| stored data | tabela nova `daemon_settings` com uma linha, criada pela migração com os padrões; nada existente muda |
| stored data | `<stateDir>/last-version` (arquivo novo) e `lumem.db.bak-<versão>` (até 3); na primeira subida com esta feature não há versão anterior registrada, então não há cópia |
| distribuição | quatro pacotes npm novos por release, e o `version:set` passa de três para quatro lugares (`packages/desktop/package.json`). O Electron (~300 MB) baixa na primeira vez que alguém o pede, e não no `pnpm install`: só o job `desktop` do release e quem roda o e2e do app pagam |
| 014 | a [`014-distribution`](../014-distribution/prd.md) §7 ganha a nota nas linhas *Auto-update* e *Assinatura e notarização*, apontando para os ADRs de 2026-09-29 |

## Relations

Uma entidade nova, `daemon_settings`, sem relação com as outras: **exatamente uma linha**, garantida por
restrição (door 3). Os dois campos são restritos a um conjunto fechado de valores (door 3). Nenhuma tabela
existente muda.

## Surface

Só o que esta feature acrescenta ou cuja assinatura muda. tRPC responde pelo mapeamento HTTP dele.

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `query health` (muda) | — | `ok`, `version`, `supervised`, `protocolVersion` | `200` |
| `query system.updateStatus` | — | `current`, `latest`, `checkedAt`, `updateAvailable`, `supervised`, `checkEnabled`, `autoUpdate`, `lastError` | `200` |
| `mutation system.update` | — | `started` | `200`, `409` (não ocioso, ou já instalando), `412` (sem supervisor, ou sem versão nova) |
| `query system.status` | — | `version`, `protocolVersion`, `supervised`, `updateAvailable`, `attention`, `liveTurns` | `200` |
| `query system.resources` | — | `groups` (`daemon`, `agents`, `terminals`: `cpuPercent`, `rssBytes`), `top` (5: `label`, `pid`, `cpuPercent`, `rssBytes`), `sampledAt` | `200` |
| `query system.settings` · `mutation system.setSettings` | `updateCheck`, `autoUpdate` | `updateCheck`, `autoUpdate`, `updateCheckForcedOff` | `200`, `400` |
| `query usage.total` | `period` | `tokens`, `cost`, `currency`, `turns` | `200`, `400` |
| `query agentAccount.rateLimits` | — | por conta: `accountId`, `adapterId`, `kind`, `utilization`, `resetsAt` | `200` |
| `query system.live` (achada ao construir a Parte 3) | — | `turns` (`sessionId`, `label`, `startedAt`), `openTerminals` | `200` |
| `query workspace.recent` (achada ao construir a Parte 3) | — | até 3: `id`, `name` | `200` |
| `GET /menubar` | — | o shell da web | `200` |

O CLI é consumido por gente e pelos arquivos de serviço, e o código de saída é o contrato dele:

| Comando | Faz | Saída |
| --- | --- | --- |
| `lumem start` (muda) · `lumem` | instala ou reescreve o serviço e o sobe | `0` subiu · `1` sem supervisor, ou outro Lumem fora do serviço |
| `lumem run` | o primeiro plano de hoje | como hoje: `0` · `1` · `2` |
| `lumem stop` | para e tira do login | `0` parou em até 10 s · `1` não parou |
| `lumem status` | uma linha: estado, versão, origem, supervisionado | `0` rodando · `3` parado |
| `lumem logs [-f]` | as últimas 200 linhas de `<stateDir>/daemon.log`, e segue com `-f` | `0` · `1` sem arquivo |
| `lumem upgrade` (muda) | instala e, com serviço, o reinicia; com app, leva o app | `0` · `1` · o código do gerenciador |
| `lumem menubar install` · `open` · `uninstall` | o app de desktop | `0` · `1` plataforma fora das quatro · o código do gerenciador quando a instalação falha, como o `lumem upgrade` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1 · os verbos do CLI | `lumem` = `lumem start` = serviço; `lumem run` = primeiro plano, e é o que o serviço executa; `stop`, `status`, `logs` ([Q1](open-questions.md)) | `lumem start --daemon`, com o primeiro plano como padrão — o modo normal passa a ser o serviço, e o arquivo de serviço precisa de um verbo que nunca mude de sentido |
| 2 · a identidade do serviço | launchd: rótulo `tech.cazimi.lumem`, arquivo `~/Library/LaunchAgents/tech.cazimi.lumem.plist`; systemd: `~/.config/systemd/user/lumem.service`; o ambiente leva `LUMEM_SUPERVISOR=launchd` ou `systemd` | `SMAppService` de dentro do app — o serviço passaria a depender do app instalado, e a A2 da discovery o quer do CLI |
| 3 · `daemon_settings` | uma linha, `CHECK (id = 1)`; `update_check` inteiro `0`/`1`, padrão `1`; `auto_update` texto `CHECK IN ('off', 'idle')`, padrão `'off'` ([Q2](open-questions.md)) | um JSON no state dir — um segundo jeito de persistir ao lado do SQLite, sem `CHECK`; só variável de ambiente — não tem como desligar pela tela |
| 4 · o contrato da casca | `health` → `{ ok: true, version, supervised, protocolVersion: 1 }`; a casca aceita só a `protocolVersion` que conhece | a casca comparar `version` por semver — toda release pareceria compatível ou incompatível por acaso |
| 5 · nomes publicados | `@vinihcrosa/lumem-desktop-darwin-arm64`, `-darwin-x64`, `-linux-x64`, `-linux-arm64`; a página `/menubar` | um pacote universal com as quatro — todo `npm i -g` baixaria centenas de MB ([ADR](../../adr/2026-09-29-2003-lumem-ships-an-electron-client-next-to-the-daemon.md)) |
| 6 · dependências novas | `electron` e `electron-builder` em `devDependencies` de `packages/desktop`; `packages/desktop` importa só de `@lumem/shared`, cercado em `scripts/package-boundaries.test.ts` | Tauri — WebKitGTK no Linux e plugins em Rust ([ADR](../../adr/2026-09-29-2003-lumem-ships-an-electron-client-next-to-the-daemon.md)) |
| 7 · a cópia do banco | `<stateDir>/last-version` com a versão da última subida; `lumem.db.bak-<versão anterior>`, até 3, a mais velha sai | uma tabela de versão dentro do próprio banco — teria de abrir o banco que se quer copiar antes de decidir copiá-lo |
| 8 · o daemon se instala | o daemon roda `npm install --global @vinihcrosa/lumem-os@<latest>` (ou o `pnpm`/`yarn`/`bun` dono da cópia) e sai com `0` para o supervisor subir a versão nova ([ADR](../../adr/2026-09-29-2004-the-daemon-updates-itself-under-a-supervisor.md)) | cópias versionadas atrás de um lançador — feature inteira; o app instalar — quem não tem o app ficaria sem |
| 9 · o que o CLI deixa para o app | `lumem-desktop.json` em `<dados do app>/lumem-desktop.json` — macOS `~/Library/Application Support/Lumem`, Linux `${XDG_CONFIG_HOME:-~/.config}/Lumem` —, com `{ node, lumem, stateDir, origin, path }` (`path` é o `PATH` do terminal, que o `Iniciar` do app entrega ao `lumem start`); o app o lê ao subir e o CLI o reescreve a cada `menubar install`. O pacote de cada plataforma leva o app **empacotado**: `Lumem.zip` no macOS (`.app` tem symlinks, e o tarball do npm não os guarda) e `app/` no Linux | o app procurar `node` e `lumem` no `PATH` — um app aberto pelo Finder ou pelo autostart não herda o `PATH` do terminal, pelo mesmo motivo de o `PATH` estar gravado no plist |

- Nada mais nesta mudança é difícil de reverter.

## Criteria

### S1: o Lumem fica de pé sem terminal (P1)

`lumem start` sobe o daemon sob o supervisor do sistema, e fechar o terminal não o derruba.

**Acceptance Criteria**

1. WHEN `lumem start` runs on macOS THEN the CLI SHALL write `~/Library/LaunchAgents/tech.cazimi.lumem.plist` with `Label` `tech.cazimi.lumem`, `ProgramArguments` equal to the absolute `node` path, the absolute `lumem` bin path and `run`, `EnvironmentVariables.PATH` equal to the caller's `PATH`, `EnvironmentVariables.LUMEM_SUPERVISOR` equal to `launchd`, `KeepAlive` true, `RunAtLoad` true, and `StandardOutPath` and `StandardErrorPath` equal to `<stateDir>/daemon.log`
2. WHEN `lumem start` runs on Linux with `systemctl --user` answering THEN the CLI SHALL write `~/.config/systemd/user/lumem.service` with `ExecStart=<node> <lumem> run`, `Environment=PATH=<caller PATH>`, `Environment=LUMEM_SUPERVISOR=systemd`, `Restart=always`, `RestartSec=2` and `StandardOutput=append:<stateDir>/daemon.log`, then run `systemctl --user daemon-reload` and `systemctl --user enable --now lumem.service`
3. WHEN `lumem start` runs and the service file already exists THEN the CLI SHALL rewrite it with the current `PATH`, `node` path and `lumem` path before loading it
4. WHEN `lumem start` has loaded the service THEN it SHALL exit 0 only after `/trpc/health` answers `ok: true` within 15 s, and SHALL exit 1 with the last 20 lines of `<stateDir>/daemon.log` otherwise
5. IF neither `launchctl` (macOS) nor a working `systemctl --user` (Linux) is available THEN `lumem start` SHALL exit 1, SHALL write no service file, and SHALL print a line naming `lumem run`
6. IF a Lumem already answers `/trpc/health` on the port while the service is not loaded THEN `lumem start` SHALL exit 1 and say that another Lumem runs outside the service at that origin
7. WHEN `lumem` runs with no verb THEN the CLI SHALL behave as `lumem start`
8. WHEN `lumem run` runs THEN the CLI SHALL start the daemon in the foreground with the port probe, flags and messages `lumem` had before this feature
9. WHEN `lumem stop` runs THEN the CLI SHALL unload the service (`launchctl bootout gui/<uid>/tech.cazimi.lumem` and remove the plist on macOS; `systemctl --user disable --now lumem.service` on Linux) and exit 0 once `/trpc/health` stops answering within 10 s, or 1 otherwise
10. WHEN `lumem status` runs THEN it SHALL print one line with `rodando` or `parado`, the version from `/trpc/health`, the origin and `supervisionado` or `em primeiro plano`, and exit 0 when running and 3 when stopped
11. WHEN `lumem logs` runs THEN it SHALL print the last 200 lines of `<stateDir>/daemon.log`, and WHEN `-f` is passed it SHALL keep printing lines appended to it until interrupted
12. IF `<stateDir>/daemon.log` does not exist THEN `lumem logs` SHALL exit 1 naming the path it looked for
13. WHILE the daemon runs with `LUMEM_SUPERVISOR` set to `launchd` or `systemd` the `health` query SHALL answer `supervised: true`, and SHALL answer `supervised: false` otherwise
14. The `health` query SHALL answer `protocolVersion: 1`
77. WHEN the running `lumem` resolves inside a package manager's versioned store (for example `<global>/.pnpm/<entry>/node_modules/@vinihcrosa/lumem-os/`) THEN the service file SHALL record the path through the stable `<global>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs` symlink when it exists, so that an upgrade by that manager changes the code the supervisor starts ([Q3](open-questions.md))

**Independent test:** `lumem start`, fechar o terminal, abrir o navegador em `127.0.0.1:4317`; `lumem status` diz `rodando · supervisionado`; `lumem stop`, e ele para.

### S2: atualizar é um clique, e a tela não quebra (P1)

O daemon sabe que há versão nova, a web mostra, e um clique instala e reinicia.

**Acceptance Criteria**

15. WHILE the update check is enabled the daemon SHALL request `https://registry.npmjs.org/@vinihcrosa%2Flumem-os/latest` once within 60 s of boot and then every 6 hours, with no header other than `accept: application/json` and the runtime's default `user-agent`
16. WHEN `system.updateStatus` is queried THEN it SHALL return `current` equal to `LUMEM_VERSION`, `latest` and `checkedAt` from the last successful check or `null` before the first one, and `updateAvailable` true exactly when `compareVersions(current, latest)` is `-1`
17. IF a registry check times out after 10 s, answers non-2xx, or answers a body without a string `version` THEN the daemon SHALL keep the previous `latest` and `checkedAt`, write one `warn` log line, and try again at the next 6-hour tick
18. WHERE `LUMEM_NO_UPDATE_CHECK=1` is set, or `daemon_settings.update_check` is `0`, the daemon SHALL make no registry request and `system.updateStatus` SHALL return `checkEnabled: false`
19. WHEN `system.settings` is queried with `LUMEM_NO_UPDATE_CHECK=1` set THEN it SHALL return `updateCheckForcedOff: true`, and `/settings` SHALL render the update-check toggle disabled with the text `desligado por LUMEM_NO_UPDATE_CHECK`
20. WHEN `system.setSettings` receives `updateCheck` or `autoUpdate` THEN the daemon SHALL write them to the single `daemon_settings` row and return the stored values
21. IF `system.setSettings` receives an `autoUpdate` outside `off` and `idle` THEN it SHALL fail with `BAD_REQUEST`
22. WHEN `updateAvailable` is true THEN the web topbar SHALL show `v<current> → v<latest>` with a button `Atualizar`
23. IF `updateAvailable` is true and `supervised` is false THEN the topbar SHALL show the command `lumem upgrade` in place of the button
24. WHEN `system.update` is called while supervised, with `updateAvailable` true, no live turn and no running project script THEN the daemon SHALL refuse new prompts, run the install command of the package manager that owns the running copy for `@vinihcrosa/lumem-os@<latest>`, and return `started: true`
25. WHEN that install exits 0 THEN the daemon SHALL shut down through `createShutdownHandler` and exit the process with code 0
26. IF that install exits non-zero or fails to spawn THEN the daemon SHALL accept prompts again, stay on `current`, and `system.updateStatus` SHALL return `lastError` with the exit code or the spawn error message
27. IF `system.update` is called while any turn is live or any project script is running THEN it SHALL fail with `CONFLICT`, name the count of live turns and running scripts in the message, and SHALL NOT start the install
28. IF `system.update` is called while an install is already running THEN it SHALL fail with `CONFLICT`
29. IF `system.update` is called while not supervised, or while `updateAvailable` is false THEN it SHALL fail with `PRECONDITION_FAILED`
30. WHILE an install is running `AcpManager.prompt` SHALL reject with an error whose message says the Lumem is updating, and SHALL NOT send `session/prompt` to the adapter
31. WHEN the daemon boots and `<stateDir>/last-version` holds a version different from `LUMEM_VERSION` THEN it SHALL copy `lumem.db` to `lumem.db.bak-<that version>` before any migration runs, and write `LUMEM_VERSION` to `<stateDir>/last-version` after the migrations succeed
32. WHEN a fourth `lumem.db.bak-*` file would exist THEN the daemon SHALL delete the oldest by modification time, keeping 3
33. IF `<stateDir>/last-version` does not exist THEN the daemon SHALL copy nothing and SHALL write `LUMEM_VERSION` to it after the migrations succeed
34. WHEN the web sees `health.version` different from the `LUMEM_VERSION` it was built with THEN it SHALL reload the page once, and after the reload SHALL show the toast `Lumem atualizado para v<version>`
35. IF after that reload the versions still differ THEN the web SHALL NOT reload again in the same tab
36. WHEN `lumem upgrade` installs with exit 0 while the service is loaded THEN it SHALL restart the service (`launchctl kickstart -k gui/<uid>/tech.cazimi.lumem` or `systemctl --user restart lumem.service`) and print the version `/trpc/health` answers after the restart

**Independent test:** publicar localmente uma versão maior num registry de teste (ou injetar o `fetchLatest`), ver o banner, clicar em `Atualizar`, e a página voltar sozinha na versão nova.

### S3: o painel tem o que mostrar (P2)

Os números que faltam existem como consulta, e a página `/menubar` os mostra, também numa aba comum.

**Acceptance Criteria**

37. WHEN `usage.total` is queried for a `period` THEN it SHALL return the sums of `tokens` and `turns` over every `session_usage` row of that window across all workspaces, and `cost` as the sum of non-null costs or `null` when every row's cost is `null`
38. The `usage.total` procedure SHALL answer with one SQL statement whatever the number of workspaces
39. WHEN `agentAccount.rateLimits` is queried THEN it SHALL return, for each agent account with a live session that reported a rate limit, the most recent report among its sessions, and SHALL omit accounts with none
40. WHEN `system.resources` is queried THEN it SHALL return the groups `daemon`, `agents` and `terminals`, each with `cpuPercent` rounded to one decimal and `rssBytes`, and `top` with at most 5 processes ordered by `rssBytes` descending
41. The daemon SHALL attribute each process to `agents` when its nearest tracked ancestor is an ACP adapter child, to `terminals` when it is a PTY child, and to `daemon` for the daemon process itself
42. The daemon SHALL compute a process's `cpuPercent` as the growth of its cumulative CPU time between two samples divided by the wall time between them, and SHALL report `null` for a process seen in its first sample
43. WHILE no `system.resources` query has arrived for 15 s the daemon SHALL NOT read the process table
44. The `top` entries SHALL carry a `label` naming the session and its checkout for adapter and PTY processes (for example `Claude · lumem-os/bandung`), and the command name otherwise
45. WHEN `system.status` is queried THEN it SHALL return `version`, `protocolVersion`, `supervised`, `updateAvailable`, `liveTurns` as the count of live turns, and `attention` true exactly when any live session has a pending permission request
46. WHEN `/menubar` loads and any account reports a rate limit THEN its headline SHALL show the highest `utilization` as a whole percentage with its `kind` and the time left until `resetsAt`
47. WHEN `/menubar` loads and no account reports a rate limit THEN its headline SHALL show today's cost from `usage.total` with `period` `1d`, or today's tokens when the cost is `null`
48. WHEN `/menubar` loads THEN it SHALL list live turns with session and checkout, the resources block, the line `v<version>` with `atualização disponível: v<latest>` or `em dia · verificado <tempo>`, and the actions `Abrir o Lumem`, `Atualizar` and the three most recent workspaces
49. IF `/menubar` has no live session THEN its session list SHALL read `nenhuma sessão rodando`
50. IF one of the queries of `/menubar` fails THEN only that block SHALL show `não consegui ler <o bloco>`, and the others SHALL render
51. WHILE an update is available and PTY shells are open `/menubar` SHALL say `<n> terminais abertos fecham ao atualizar`
52. The path `/menubar` SHALL route to the menubar screen in `routeOf`, and the daemon SHALL serve the web shell for it

**Independent test:** `pnpm dev`, abrir `127.0.0.1:4318/menubar` numa aba, abrir uma sessão do Claude e um `pnpm dev` no rodapé, e ver a cota, as sessões e os três grupos de recursos mudarem.

### S4: o ícone na barra (P2)

O app Electron mora na barra do macOS e do Linux e abre o painel e o Lumem.

**Acceptance Criteria**

53. WHEN `lumem menubar install` runs on `darwin-arm64`, `darwin-x64`, `linux-x64` or `linux-arm64` THEN the CLI SHALL install `@vinihcrosa/lumem-desktop-<platform>-<arch>@<LUMEM_VERSION>` with the package manager that owns the running copy, and write `lumem-desktop.json` in the app's data directory with the absolute `node` path, the absolute `lumem` path, the state dir and the origin
54. WHEN that install succeeds on macOS THEN the CLI SHALL copy the app to `~/Applications/Lumem.app`; on Linux it SHALL write `~/.local/share/applications/lumem.desktop` and `~/.config/autostart/lumem.desktop`
78. WHEN `lumem menubar install` runs on Linux and the kernel would refuse the Chromium sandbox (`/proc/sys/kernel/unprivileged_userns_clone` is `0`, or `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` is `1`) THEN the CLI SHALL write `--no-sandbox` into the `Exec=` of both `.desktop` files and print a line saying why, and SHALL write no `--no-sandbox` otherwise ([Q4](open-questions.md))
55. IF the platform is none of the four THEN `lumem menubar install` SHALL exit 1 and list the four supported
56. WHEN `lumem upgrade` succeeds and a `lumem-desktop` package is installed THEN it SHALL install the same version of it and, on macOS, copy the app to `~/Applications/Lumem.app` again
57. WHEN `lumem menubar uninstall` runs THEN it SHALL remove the package, `~/Applications/Lumem.app` or the two `.desktop` files, and the login item
58. WHEN the app starts on macOS THEN it SHALL call `app.setLoginItemSettings({ openAtLogin: true })` and create one tray icon
59. WHILE the app runs it SHALL query `/trpc/health` and `system.status` every 10 s
60. The tray icon SHALL use the image of the first matching state in this order: `stopped` when `health` does not answer, `attention` when `attention` is true or `protocolVersion` is not `1`, `update` when `updateAvailable` is true, else `running`
61. WHEN the tray icon is clicked on macOS THEN the app SHALL toggle a frameless 360×520 window loading `<origin>/menubar` under the icon, and hide it when it loses focus
62. The tray SHALL carry a context menu whose items are, in order: `Abrir painel`, a disabled line `<estado> · v<version>` followed by ` · atualização disponível` when there is one, `Abrir o Lumem`, `Iniciar` or `Parar`, `Atualizar` enabled only when `updateAvailable` is true, and `Sair`
63. WHEN `Abrir o Lumem` is chosen THEN the app SHALL open, or focus if already open, one window loading `<origin>/`
64. WHEN `Iniciar` or `Parar` is chosen THEN the app SHALL run `<node> <lumem> start` or `<node> <lumem> stop` with the paths in `lumem-desktop.json`
65. IF `health` does not answer when the panel opens THEN the panel SHALL show the page bundled with the app, reading `Lumem parado`, with a button `Iniciar`
66. IF `protocolVersion` is not `1` THEN the context menu status line SHALL read `app e Lumem em versões incompatíveis — rode lumem menubar install`
67. The app SHALL run every window with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`, SHALL cancel navigation to any origin other than the recorded one, and SHALL open other links with `shell.openExternal`
68. WHEN the release runs for a tag THEN it SHALL publish the four `@vinihcrosa/lumem-desktop-*` packages at the tag's version with provenance, and attach `.zip` for macOS and `.AppImage` and `.deb` for Linux, per architecture, to the GitHub release
69. WHEN `smoke:install` runs on macOS THEN it SHALL install the `darwin` package from its tarball and `codesign --verify` on the app SHALL exit 0; on Linux it SHALL start the app under `xvfb` and see a window load `/menubar`
70. WHEN `pnpm version:set <x.y.z>` runs THEN it SHALL write the version to `packages/desktop/package.json` as well as the three places it writes today

**Independent test:** `lumem menubar install`, o ícone aparece; parar o daemon, o ícone muda para parado; `Iniciar` pelo menu, ele volta.

### S5: atualizar sozinho quando ocioso (P3)

Quem liga a opção recebe a versão nova sem clicar, e nunca no meio de um turno.

**Acceptance Criteria**

71. The default of `daemon_settings.auto_update` SHALL be `off`
72. WHERE `auto_update` is `idle`, WHEN a 60-second tick finds the daemon supervised, `updateAvailable` true, no live turn and no running project script THEN the daemon SHALL start the same install path as `system.update`
73. WHILE `auto_update` is `idle` and an update waits for idle the daemon SHALL keep accepting prompts and SHALL NOT pause the conveyor
74. IF the current major is at least `1` and `latest` has a greater major THEN the daemon SHALL NOT install on its own, and SHALL keep reporting `updateAvailable`
75. WHILE the automatic install runs the conveyor SHALL NOT dispatch a new task
76. WHEN `/settings` renders THEN it SHALL show the toggle `Atualizar sozinho quando ocioso` bound to `auto_update`, disabled with the text `precisa do Lumem rodando como serviço` when `supervised` is false

**Independent test:** ligar a opção com uma versão maior injetada, deixar uma sessão pensando, ver que nada acontece; quando o turno acaba, o daemon reinicia em até um minuto e a página volta na versão nova.

## Out of scope

| Excluded | Why |
| --- | --- |
| conectar o app a um daemon remoto | depende da [`019-daemon-auth`](../019-daemon-auth/prd.md); entra no backlog |
| download avulso do app (`.dmg`, `.AppImage` solto) para quem não tem o CLI | traz a Developer ID e um segundo canal de atualização; backlog |
| Homebrew (formula e cask) e repositório apt | backlog, com o gatilho *"quando alguém quiser instalar sem Node"* ([ADR](../../adr/2026-09-29-2003-lumem-ships-an-electron-client-next-to-the-daemon.md)) |
| app de celular | outra feature; o [ADR](../../adr/2026-09-29-2002-the-daemon-is-the-product-clients-are-shells.md) diz só que ele fala com as mesmas rotas |
| Windows | a A3 da discovery; o mesmo Electron serve quando entrar |
| notificação do sistema pelo app (permissão pedida, PR verde) | a C4 da discovery disse não; os três itens continuam no backlog |
| baixar agora e aplicar no próximo boot | exige cópias versionadas ([ADR](../../adr/2026-09-29-2004-the-daemon-updates-itself-under-a-supervisor.md)); backlog |
| canal de pré-release | só o dist-tag `latest` |
| rollback automático de uma migração | a cópia do banco é o caminho manual |
| histórico de CPU e memória | o painel é ao vivo; nada é gravado |
| fallback caseiro de daemon sem supervisor (fork e pidfile) | a A2b da discovery; `lumem run` cobre |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| o que conta como *ocioso* | nenhum turno em voo e nenhum script de projeto rodando; shell aberto não impede | a B4 da discovery; a esteira em voo já é um turno em voo, porque o `in_progress` da `022` é derivado dele | y |
| o systemd reinicia em que caso | `Restart=always`, e não o `on-success` da A2b | com `on-success` um daemon que cai com erro não volta; o `systemctl --user stop` explícito não reinicia em nenhum dos dois | n |
| `lumem stop` também tira do login | sim: remove o plist no macOS, `disable` no Linux; `lumem start` os recria | *parar* que volta no próximo login surpreende; e o `start` já reescreve o arquivo toda vez | n |
| a cota por conta é gravada | não: vem da memória do `AcpManager` e some com o reinício | a C1 da discovery aceitou *"ou pelo menos servida da memória"*; gravar é uma migração por um número que se renova a cada turno | n |
| o que é *precisa de atenção* | só pedido de permissão pendente | é o único estado em que um agente parado espera uma pessoa; tarefa bloqueada já tem o quadro | n |
| o grupo *o próprio app* nos recursos | fica fora de `system.resources`; o painel o soma quando roda dentro do app | o daemon não enxerga o processo do Electron, que não é filho dele | n |
| o número opcional ao lado do ícone | fica fora desta feature | a C2 o fez opt-in; ele não muda nenhuma decisão de estado, e cabe depois como preferência do app | n |
| quem aparece em *workspaces recentes* | os três com sessão mais recente | não existe registro de *workspace aberto por último*; a sessão é o sinal que já existe | n |
| de onde vêm a lista de turnos e os terminais abertos do painel | `system.live`, à parte do `system.status` | a casca consulta o `status` a cada 10 s, e a lista custa uma leitura de banco por turno em voo para nomear sessão e checkout; o painel a consulta só enquanto está aberto. A consulta nasceu ao construir a Parte 3: o AC 48 pede a lista e o AC 51 pede a contagem, e nenhuma rota do Surface as respondia | n |
| a medição de processos | em duas passadas (primeiro os elos pai–filho da máquina, depois só a árvore do daemon): no Linux `/proc/<pid>/stat` de todos e `/proc/<pid>/status` só da árvore; no macOS `ps -A -o pid=,ppid=` e `ps -x -o pid=,ppid=,rss=,time=,comm= -p <pids da árvore>` | sem dependência nativa nova (ADR de 2026-08-30); o `%cpu` do `ps` no Linux é a média desde o início do processo | n |

**Open questions:** none - Q1 a Q4 de [open-questions.md](open-questions.md) estão respondidas: Q1 e Q2 em 2026-09-29, pela recomendação; a Q3 medida sob pnpm (critério 77); a Q4 em 2026-09-30, pela opção (c) (critério 78).

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| tela `/menubar` | estado vazio | AC 49 |
| tela `/menubar` | carregando | existing — cada bloco usa o mesmo esqueleto de carregamento do `useQuery` que as outras telas da web |
| tela `/menubar` | erro | AC 50 |
| tela `/menubar` | não autorizado | n/a - o daemon não autentica ainda; quando a `019` entrar, a página é da mesma origem e passa pelo cookie |
| tela `/menubar` | densidade e ordem | AC 48 |
| tela `/menubar` | ação destrutiva confirma | AC 51 — atualizar diz o que fecha antes; o `CONFLICT` do AC 27 recusa com turno em voo |
| banner da topbar | vazio, erro | AC 22, AC 23 — sem versão nova não há banner; a falha da verificação não aparece na topbar, só no `lastError` |
| `/settings`, os dois interruptores | desligado à força, sem supervisor | AC 19, AC 76 |
| todas as `system.*` novas | forma do erro e códigos | AC 21, AC 27, AC 28, AC 29 |
| todas as `system.*` novas | quem pode chamar, limite | n/a - a mesma fronteira de todo o `/trpc` hoje; a `019` a muda para todas de uma vez |
| todas as `system.*` novas | versionamento | AC 14 — `protocolVersion` no `health` |
| `lumem start`, `stop`, `status`, `logs`, `run` | formato de saída e códigos | AC 4, AC 5, AC 9, AC 10, AC 12 |
| `lumem start` | falha no meio | AC 4 — as últimas 20 linhas do log |
| `lumem menubar install` | falha no meio | AC 55 — e o código do gerenciador, como o `lumem upgrade` já faz |
| menu da bandeja | estados | AC 60, AC 62, AC 66 |
| janela do painel | daemon parado | AC 65 |
| ícone no Linux sem extensão (GNOME) | a exceção que não cabe | existing - `lumem menubar open` abre o painel como janela, e o `.desktop` do AC 54 o lança |

## Sources

- [discovery *Menu bar app and auto-update*](https://wiki.cazimi.tech/doc/menu-bar-app-and-auto-update-2026-09-29-GlrYzLAAou) e [as perguntas respondidas](https://wiki.cazimi.tech/doc/open-questions-menu-bar-and-auto-update-S8ijH9cb9K) — a forma, as cinco partes e a fase 0 (E2b)
- os três ADRs de 2026-09-29, linkados no histórico acima
