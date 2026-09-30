# O Lumem fica de pé sozinho, se atualiza, e mora na barra — checks

> **Status:** em execução

Profile: standard
Plan: `docs/features/038-desktop-and-updates/prd.md`

93 checks in 5 slices · 9 one-way doors · 0 open

## Checks

Os comandos de prova rodam da raiz, escritos por extenso em cada `Proof:`. Os arquivos de teste que
ainda não existem nascem com o nome que o `Proof:` dá, e o teste tem o nome que o `-t` ou o `-g` pede.
`pnpm smoke:service` é um script novo desta feature: instala o tarball num prefixo descartável, roda
`lumem start` de verdade contra o launchd ou o `systemd --user` da máquina, e desfaz tudo no fim; `--only
<passo>` roda um passo só. Ele roda na máquina de quem verifica, não no CI, porque os runners não têm
sessão de usuário do launchd nem do systemd. `pnpm measure:resources` também é novo, e o `--only desktop`
do `pnpm smoke:install` é um passo novo do script que já existe.

### S1 - o Lumem fica de pé sem terminal · 8 files · 120 KB · ~45k

**C1** - No macOS, `lumem start` escreve `~/Library/LaunchAgents/tech.cazimi.lumem.plist` com `Label` `tech.cazimi.lumem`, `ProgramArguments` = `[<node absoluto>, <lumem absoluto>, "run"]`, `PATH` igual ao de quem chamou, `LUMEM_SUPERVISOR` = `launchd`, `KeepAlive` e `RunAtLoad` verdadeiros, e os dois `Standard*Path` = `<stateDir>/daemon.log` (AC 1)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "writes the launchd plist with the caller's PATH"`

**C2** - No Linux com `systemctl --user` respondendo, `lumem start` escreve `~/.config/systemd/user/lumem.service` com `ExecStart=<node> <lumem> run`, `Environment=PATH=…`, `Environment=LUMEM_SUPERVISOR=systemd`, `Restart=always`, `RestartSec=2` e `StandardOutput=append:<stateDir>/daemon.log`, e chama `daemon-reload` e `enable --now lumem.service`, nessa ordem (AC 2)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "writes the systemd unit and enables it"`

**C3** - Com o arquivo de serviço já existente e um `PATH` diferente, `lumem start` o reescreve com o `PATH`, o `node` e o `lumem` de agora antes de carregá-lo (AC 3)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "rewrites an existing service file before loading it"`

**C4** - Depois de carregar o serviço, `lumem start` sai 0 assim que `/trpc/health` responde `ok: true`, e sai 1 imprimindo as últimas 20 linhas de `<stateDir>/daemon.log` se isso não acontece em 15 s (AC 4)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "start waits for health and prints the log when it never answers"`
Proof: `pnpm smoke:service --only start-waits-for-health`

**C5** - Sem `launchctl` no macOS, ou com `systemctl --user` falhando no Linux, `lumem start` sai 1, não escreve arquivo nenhum, e imprime uma linha com `lumem run` (AC 5)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "refuses without a supervisor and names lumem run"`

**C6** - Com um Lumem respondendo `/trpc/health` na porta e o serviço não carregado, `lumem start` sai 1 dizendo que há outro Lumem fora do serviço naquela origem (AC 6)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "start refuses when another Lumem runs outside the service"`

**C7** - `parseCommand([])` e `parseCommand(["start"])` devolvem o mesmo comando `start`, e `parseCommand(["run"])` devolve `run` com as opções `--port`, `--host`, `--state-dir` e `--open` de hoje (AC 7, AC 8)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/args.test.ts -t "no verb is start, and run takes the foreground options"`

**C8** - `lumem run` faz o que `lumem` fazia antes desta feature: sonda a porta, diz `já tem um Lumem` quando há um, recusa porta de outro com saída 1, e sobe o daemon no mesmo processo (AC 8)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "run keeps the foreground behaviour"`

**C9** - `lumem stop` no macOS chama `launchctl bootout gui/<uid>/tech.cazimi.lumem` e apaga o plist; no Linux chama `systemctl --user disable --now lumem.service`; e sai 0 quando `/trpc/health` para de responder em até 10 s, ou 1 (AC 9)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "stop unloads the service and leaves no login item"`
Proof: `pnpm smoke:service --only stop-leaves-nothing`

**C10** - `lumem status` imprime uma linha com `rodando`, a versão, a origem e `supervisionado` ou `em primeiro plano`, e sai 0; com o daemon parado imprime `parado` e sai 3 (AC 10)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "status prints one line and exits 0 or 3"`

**C11** - `lumem logs` imprime as últimas 200 de 250 linhas de `<stateDir>/daemon.log`, e com `-f` imprime uma linha acrescentada depois do início (AC 11)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "logs prints the last 200 lines and follows with -f"`

**C12** - Sem `<stateDir>/daemon.log`, `lumem logs` sai 1 com o caminho procurado na mensagem (AC 12)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "logs names the missing file"`

**C13** - `health` responde `supervised: true` com `LUMEM_SUPERVISOR` `launchd` ou `systemd`, e `supervised: false` sem ela ou com outro valor (AC 13)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/health.test.ts -t "answers supervised from LUMEM_SUPERVISOR"`

**C14** - `health` responde `protocolVersion: 1`, e o `probePort` do CLI continua lendo `ok` e `version` dessa resposta (AC 14)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/health.test.ts -t "answers protocolVersion 1"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/port.test.ts -t "reads a health answer that carries more fields"`

**C15** - Um daemon subido por `lumem start` de verdade sobrevive ao fim do processo que o subiu, e responde `supervised: true` (AC 1, AC 2, AC 13)
Proof: `pnpm smoke:service --only survives-the-caller`

**C16** - O `scripts/smoke-install.ts` sobe o binário instalado com `lumem run`, e não com `lumem` sem verbo (AC 8)
Proof: `pnpm exec vitest run scripts/smoke-install.test.ts -t "starts the installed binary with lumem run"`

**C85** - Com o `lumem` resolvido em `<g>/.pnpm/@vinihcrosa+lumem-os@0.6.1/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs` e o symlink `<g>/node_modules/@vinihcrosa/lumem-os` existindo, o plist e a unit gravam `<g>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`; sem o symlink, gravam o caminho resolvido; sob npm, o caminho não muda (AC 77)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "records the stable package path under a versioned store"`

### S2 - atualizar é um clique, e a tela não quebra · 15 files · 210 KB · ~75k

**C17** - Com a verificação ligada, o daemon pede `https://registry.npmjs.org/@vinihcrosa%2Flumem-os/latest` uma vez nos primeiros 60 s e de novo a cada 6 h (relógio falso), só com o cabeçalho `accept: application/json` além do `user-agent` (AC 15)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/check.test.ts -t "asks the registry at boot and every six hours"`

**C18** - `system.updateStatus` devolve `current` = `LUMEM_VERSION`, `latest` e `checkedAt` `null` antes da primeira verificação, e `updateAvailable` verdadeiro para `0.6.1 → 0.7.0`, falso para `0.7.0 → 0.7.0` e para `0.8.0 → 0.7.0` (AC 16)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "updateStatus reports the last check"`

**C19** - Timeout de 10 s, resposta 503 e corpo sem `version` string mantêm o `latest` e o `checkedAt` anteriores, escrevem uma linha `warn` cada, e a próxima tentativa é no tick seguinte de 6 h (AC 17)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/check.test.ts -t "keeps the last good answer when the registry fails"`

**C20** - Com `LUMEM_NO_UPDATE_CHECK=1`, ou com `daemon_settings.update_check` = `0`, o daemon não faz requisição nenhuma e `system.updateStatus` devolve `checkEnabled: false` (AC 18)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/check.test.ts -t "makes no request when the check is off"`

**C21** - Com `LUMEM_NO_UPDATE_CHECK=1`, `system.settings` devolve `updateCheckForcedOff: true`, e `/settings` mostra o interruptor de verificação desabilitado com `desligado por LUMEM_NO_UPDATE_CHECK` (AC 19)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "settings says when the environment forces the check off"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/settings/UpdateSettings.test.tsx -t "disables the check toggle forced off by the environment"`

**C22** - `system.setSettings({ updateCheck: false, autoUpdate: "idle" })` grava na única linha de `daemon_settings` e devolve os valores gravados; uma segunda chamada não cria outra linha (AC 20)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "setSettings writes the single row"`

**C23** - `system.setSettings({ autoUpdate: "always" })` falha com `BAD_REQUEST` e não muda a linha (AC 21)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "setSettings refuses an unknown autoUpdate"`

**C24** - A migração cria `daemon_settings` com uma linha `id = 1`, `update_check = 1`, `auto_update = 'off'`; um `INSERT` de `id = 2` e um `UPDATE` para `auto_update = 'sempre'` falham na restrição do banco (AC 20, AC 71)
Proof: `pnpm --filter @lumem/server exec vitest run src/db/daemon-settings.test.ts -t "keeps one row and a closed set of values"`

**C25** - Com `updateAvailable` verdadeiro e `supervised` verdadeiro, a topbar mostra `v0.6.1 → v0.7.0` e o botão `Atualizar`; sem versão nova, não mostra nada (AC 22)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/update/UpdateBanner.test.tsx -t "shows the version jump and the button"`

**C26** - Com `updateAvailable` verdadeiro e `supervised` falso, a topbar mostra `lumem upgrade` no lugar do botão (AC 23)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/update/UpdateBanner.test.tsx -t "shows the command when not supervised"`

**C27** - `system.update` supervisionado, com versão nova, sem turno em voo e sem script rodando, fecha a porta de prompt, roda o instalador do gerenciador dono da cópia com `@vinihcrosa/lumem-os@0.7.0`, e devolve `started: true` (AC 24)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "update installs with the owning package manager"`

**C28** - Com o instalador saindo 0, o daemon passa pelo `createShutdownHandler` e chama `exit(0)` (AC 25)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/install.test.ts -t "exits 0 through the shutdown handler after a good install"`

**C29** - Com o instalador saindo 1, ou falhando ao nascer (`ENOENT`), o daemon volta a aceitar prompt, não sai, e `system.updateStatus` devolve `lastError` com `1` ou com a mensagem do `ENOENT` (AC 26)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/install.test.ts -t "stays up and reports the error when the install fails"`
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "reports a failed install in updateStatus, and lets the next one start"`

**C30** - `system.update` com 2 turnos em voo e 1 script rodando falha com `CONFLICT` cuja mensagem contém `2` e `1`, e o instalador não é chamado (AC 27)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "update refuses while anything is live"`

**C31** - Um segundo `system.update` enquanto o primeiro instala falha com `CONFLICT` (AC 28)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "update refuses a second install"`

**C32** - `system.update` sem supervisor, ou com `updateAvailable` falso, falha com `PRECONDITION_FAILED` (AC 29)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "update needs a supervisor and a newer version"`

**C33** - Enquanto a instalação roda, `AcpManager.prompt` rejeita com uma mensagem que diz que o Lumem está se atualizando, e o agente falso não recebe `session/prompt` (AC 30)
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "refuses a prompt while the daemon updates"`

**C34** - Com `last-version` = `0.6.1` e `LUMEM_VERSION` = `0.7.0`, o boot copia `lumem.db` para `lumem.db.bak-0.6.1` antes de qualquer migração rodar, e grava `0.7.0` em `last-version` só depois de as migrações passarem (AC 31)
Proof: `pnpm --filter @lumem/server exec vitest run src/db/backup.test.ts -t "copies the database before migrating to a new version"`

**C35** - Com três `lumem.db.bak-*` e uma quarta cópia, a de modificação mais antiga some e sobram 3 (AC 32)
Proof: `pnpm --filter @lumem/server exec vitest run src/db/backup.test.ts -t "keeps the three newest backups"`

**C36** - Sem `last-version`, o boot não copia nada e grava `LUMEM_VERSION` depois das migrações; com uma migração falhando, `last-version` não é gravado (AC 31, AC 33)
Proof: `pnpm --filter @lumem/server exec vitest run src/db/backup.test.ts -t "records the version only after the migrations succeed"`

**C37** - Com `health.version` diferente do `LUMEM_VERSION` do bundle, a web recarrega uma vez e, depois do recarregamento, mostra `Lumem atualizado para v0.7.0` (AC 34)
Proof: `pnpm --filter @lumem/web exec vitest run src/hooks/useVersionReload.test.tsx -t "reloads once and then says what changed"`
Proof: `pnpm exec playwright test e2e/update.spec.ts -g "a página volta inteira depois da atualização"`

**C38** - Se depois do recarregamento as versões ainda diferem, a web não recarrega de novo naquela aba (AC 35)
Proof: `pnpm --filter @lumem/web exec vitest run src/hooks/useVersionReload.test.tsx -t "never reloads twice in one tab"`

**C39** - `lumem upgrade` com instalação saindo 0 e serviço carregado chama `launchctl kickstart -k gui/<uid>/tech.cazimi.lumem` (macOS) ou `systemctl --user restart lumem.service` (Linux), e imprime a versão que o `/trpc/health` responde depois; sem serviço, mantém a frase de hoje (AC 36)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "restarts the service after a good install"`

**C40** - Um daemon real sob o supervisor, depois de `system.update` com um instalador de mentira que troca o `LUMEM_VERSION` do bundle, volta respondendo a versão nova sem ninguém rodar `lumem start` (AC 25)
Proof: `pnpm smoke:service --only update-relaunches`

**C41** - Depois de uma instalação por cima com o daemon de pé, a página recarregada carrega os assets novos, e não fica em branco (AC 25, AC 34)
Proof: `pnpm exec playwright test e2e/update.spec.ts -g "a página volta inteira depois da atualização"`

### S3 - o painel tem o que mostrar · 14 files · 180 KB · ~65k

**C42** - `usage.total` com três workspaces soma `tokens` e `turns` de todas as linhas da janela; `cost` é a soma dos custos não nulos, e `null` quando todos são `null` (AC 37)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/usage.test.ts -t "total sums every workspace in the window"`
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/usage.test.ts -t "total answers null cost only when every row's cost is null"`

**C43** - `usage.total` com 1, 3 e 10 workspaces executa uma única instrução SQL (AC 38)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/usage.test.ts -t "total runs one statement whatever the workspace count"`

**C44** - `usage.total` com um `period` fora de `1d`, `7d`, `1m`, `6m`, `1y` falha com `BAD_REQUEST` (AC 37)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/usage.test.ts -t "total refuses an unknown period"`

**C45** - `agentAccount.rateLimits` devolve, para uma conta com duas sessões que relataram cota, o relato mais recente das duas, e não lista a conta sem relato (AC 39)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/agentAccount.test.ts -t "rateLimits keeps the latest report per account"`

**C46** - `system.resources` devolve os grupos `daemon`, `agents` e `terminals`, cada um com `cpuPercent` em uma casa decimal e `rssBytes`, e um `top` de no máximo 5, em `rssBytes` decrescente, a partir de uma tabela de processos de 9 linhas (AC 40)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "groups the tree and keeps the five largest"`
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "resources rounds cpuPercent to one decimal through the router"`

**C47** - Um neto de um adaptador ACP entra em `agents`, um neto de um PTY entra em `terminals`, e o próprio daemon entra em `daemon` (AC 41)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/attribute.test.ts -t "attributes a process to its nearest tracked ancestor"`

**C48** - Um processo com 1,0 s de CPU acumulada numa amostra e 1,5 s na seguinte, 5 s depois, tem `cpuPercent` `10.0`; na primeira amostra dele, `null` (AC 42)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "computes cpu from the delta between samples"`

**C49** - Sem `system.resources` por 15 s, o daemon não lê a tabela de processos; a próxima consulta volta a ler (AC 43)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "stops sampling when nobody asks"`

**C50** - No `top`, um adaptador aparece como `Claude · lumem-os/bandung`, um PTY com o nome da sessão e do checkout, e um processo sem sessão com o nome do comando (AC 44)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "labels the top processes by session and checkout"`

**C51** - A leitura da tabela de processos no macOS interpreta a saída de `ps -A -o pid=,ppid=,rss=,time=,comm=`, e no Linux lê `/proc/<pid>/stat` e `/proc/<pid>/status`, a partir de amostras gravadas das duas (AC 40, AC 42)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/process-table.test.ts -t "reads ps on darwin and proc on linux"`

**C52** - `system.status` devolve `version`, `protocolVersion`, `supervised`, `updateAvailable`, `liveTurns` = número de turnos em voo, e `attention` verdadeiro com um pedido de permissão pendente e falso sem nenhum (AC 45)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "status summarises what the shell needs"`

**C53** - Com duas contas relatando cota de 0,42 e 0,87, a manchete de `/menubar` mostra `87%`, o `kind` e o tempo até o `resetsAt` dessa conta (AC 46)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "headlines the highest quota"`

**C54** - Sem cota relatada, a manchete mostra o custo do dia (`usage.total` com `1d`); com `cost` `null`, mostra os tokens do dia (AC 47)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "headlines today's cost, or tokens without a cost"`

**C55** - `/menubar` mostra, nessa ordem, os turnos em voo com sessão e checkout, os recursos, a linha `v<versão>` com `atualização disponível: v0.7.0` ou `em dia · verificado …`, e as ações `Abrir o Lumem`, `Atualizar` e os três workspaces mais recentes (AC 48)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "lays out sessions, resources, version and actions"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "says the version is up to date, and when it was checked"`

**C56** - Sem sessão viva, a lista diz `nenhuma sessão rodando` (AC 49)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "says when nothing is running"`

**C57** - Com `system.resources` falhando, só o bloco de recursos diz `não consegui ler os recursos`, e a manchete e as sessões aparecem (AC 50)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "fails one block at a time"`

**C58** - Com versão nova disponível e 2 shells PTY abertos, `/menubar` diz `2 terminais abertos fecham ao atualizar` (AC 51)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "warns which terminals an update closes"`

**C59** - `routeOf("/menubar")` é `menubar`, e o daemon responde `GET /menubar` com `200` e o `index.html` da web (AC 52)
Proof: `pnpm --filter @lumem/web exec vitest run src/lib/route.test.ts -t "routes /menubar to the menubar screen"`
Proof: `pnpm --filter @lumem/server exec vitest run src/web/static.test.ts -t "serves the web shell for /menubar"`

**C60** - `/menubar` aberto numa aba do daemon de teste mostra a manchete, a lista de sessões e o bloco de recursos com números (AC 46, AC 48)
Proof: `pnpm exec playwright test e2e/menubar.spec.ts -g "o painel abre numa aba e mostra os três blocos"`

**C61** - Medir a árvore de processos a cada 3 s com 10 sessões abertas custa menos de 1% de CPU do daemon (a meta da C1b da discovery, experimento 3 da fase 0) (AC 43)
Proof: `pnpm measure:resources --only ten-sessions`

**C86** - Com `usage.total`, `system.live` ou `system.updateStatus` falhando, só o bloco correspondente diz `não consegui ler <o bloco>` (`o consumo`, `as sessões`, `a versão`), e os outros aparecem (AC 50)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "fails alone when"`

**C87** - `system.live` devolve em `turns` só os turnos em voo, cada um com `sessionId`, `label` (`Claude · lumem-os/bandung`) e `startedAt` em ISO — uma sessão de agente ociosa não é turno —, e `openTerminals` = o número de shells abertos (AC 48, AC 51)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "live names each turn by session and checkout, and counts open shells"`

**C88** - `workspace.recent` devolve, de cinco workspaces em que quatro têm sessão, os três com a sessão mais nova, do mais novo ao mais velho, cada um com `id` e `name`; a sessão de uma worktree conta para o workspace do projeto dela, um workspace sem sessão nenhuma não entra, e sem nenhuma sessão a lista é vazia (AC 48)
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/workspace.test.ts -t "lists the three workspaces with the most recent session, newest first"`
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/workspace.test.ts -t "is empty when no session was ever opened"`

### S4 - o ícone na barra · 20 files · 240 KB · ~90k

**C62** - `lumem menubar install` em `darwin-arm64`, `darwin-x64`, `linux-x64` e `linux-arm64` instala `@vinihcrosa/lumem-desktop-<plataforma>-<arch>@<LUMEM_VERSION>` com o gerenciador dono da cópia, e grava `lumem-desktop.json` com `node`, `lumem`, o state dir e a origem (AC 53)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "installs the package of each supported platform"`

**C63** - No macOS a instalação copia o app para `~/Applications/Lumem.app`; no Linux escreve `~/.local/share/applications/lumem.desktop` e `~/.config/autostart/lumem.desktop` (AC 54)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "puts the app where the desktop finds it"`

**C64** - Em `win32-x64` ou `linux-ia32`, `lumem menubar install` sai 1 e lista as quatro plataformas (AC 55)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "refuses an unsupported platform"`

**C65** - `lumem upgrade` com o pacote do app instalado instala a mesma versão dele e, no macOS, copia o app de novo (AC 56)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "takes the desktop package along"`

**C66** - `lumem menubar uninstall` remove o pacote, o app ou os dois `.desktop`, e o item de login (AC 57)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "uninstall leaves nothing behind"`

**C67** - No macOS o app chama `app.setLoginItemSettings({ openAtLogin: true })` e cria um só ícone (AC 58)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "starts at login with one tray icon"`

**C68** - O app consulta `/trpc/health` e `system.status` a cada 10 s (relógio falso) (AC 59)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "polls health and status every ten seconds"`

**C69** - A imagem do ícone segue a tabela de 5 entradas: `health` sem resposta → `stopped` mesmo com versão nova; `attention` → `attention`; `protocolVersion` 2 → `attention`; só versão nova → `update`; nada → `running` (AC 60)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/tray-state.test.ts -t "picks the icon by precedence"`

**C70** - No macOS, clicar no ícone abre uma janela sem moldura de 360×520 carregando `<origem>/menubar`, clicar de novo a esconde, e perder o foco a esconde (AC 61)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "toggles the panel under the icon"`

**C71** - O menu de contexto tem, nessa ordem, `Abrir painel`, a linha desabilitada de estado com ` · atualização disponível` quando há, `Abrir o Lumem`, `Iniciar` ou `Parar`, `Atualizar` habilitado só com versão nova, e `Sair` (AC 62)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/menu.test.ts -t "builds the context menu in order"`

**C72** - `Abrir o Lumem` abre uma janela em `<origem>/`, e escolher de novo foca a mesma em vez de abrir outra (AC 63)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "opens one main window and focuses it after"`

**C73** - `Iniciar` e `Parar` rodam `<node> <lumem> start` e `<node> <lumem> stop` com os caminhos do `lumem-desktop.json` (AC 64)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/commands.test.ts -t "runs the recorded lumem to start and stop"`

**C74** - Com `health` sem resposta, o painel carrega a página local `Lumem parado` com o botão `Iniciar` (AC 65)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "shows the local stopped page when the daemon is down"`

**C75** - Com `protocolVersion` diferente de `1`, a linha de estado diz `app e Lumem em versões incompatíveis — rode lumem menubar install` (AC 66)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/menu.test.ts -t "says when app and daemon speak different protocols"`

**C76** - Toda janela nasce com `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`; navegar para outra origem é cancelado; e um link externo abre com `shell.openExternal` (AC 67)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "locks every window to the daemon origin"`

**C77** - O app de verdade, subido pelo `_electron.launch` do Playwright contra um daemon de teste, cria o ícone e o painel carrega `/menubar` (AC 58, AC 61)
Proof: `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel carrega a página do daemon"`

**C78** - O `release.yml` publica os quatro `@vinihcrosa/lumem-desktop-*` na versão da tag com `--provenance`, e anexa `.zip` (macOS) e `.AppImage` e `.deb` (Linux) de cada arquitetura ao GitHub release; o `smoke:install` no macOS instala o pacote `darwin` e roda `codesign --verify`, e no Linux sobe o app sob `xvfb` (AC 68, AC 69)
Proof: `pnpm exec vitest run scripts/release-workflow.test.ts -t "publishes the four desktop packages and attaches their artifacts"`
Proof: `pnpm smoke:install --only desktop`

**C79** - `pnpm version:set 0.7.0` escreve a versão também em `packages/desktop/package.json`; e `packages/desktop` importa só de `@lumem/shared`, sem ninguém importar dele (AC 70)
Proof: `pnpm exec vitest run scripts/set-version.test.ts -t "writes the desktop manifest too"`
Proof: `pnpm exec vitest run scripts/package-boundaries.test.ts -t "desktop imports only from shared"`

**C89** - `lumem menubar open` roda o app instalado com `--panel` (`~/Applications/Lumem.app/Contents/MacOS/Lumem --panel` no macOS, `<pacote>/app/lumem-desktop --panel` no Linux) e sai 0; sem o app instalado, sai 1 dizendo `lumem menubar install` e não roda nada (AC 54, o ícone no Linux sem extensão)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "opens the panel as a window through the installed app"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "says how to install when the app is not there"`

**C90** - O `lumem-desktop.json` (porta 9) fica em `<dados do app>` — `~/Library/Application Support/Lumem` no macOS, `${XDG_CONFIG_HOME:-~/.config}/Lumem` no Linux — com `{ node, lumem, stateDir, origin, path }`; cada `lumem menubar install` o reescreve; e o app o lê nessa mesma pasta e, sem ele, diz `lumem menubar install` e sai (AC 53, AC 64)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "installs the package of each supported platform"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "rewrites lumem-desktop.json on every install"`
Proof: `pnpm --filter @lumem/shared exec vitest run src/desktop.test.ts -t "desktopDataDir"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "reads lumem-desktop.json from the folder the CLI writes it to"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "says how to fix a missing config, and quits"`

**C91** - Com o `current` do `system.updateStatus` diferente do `LUMEM_VERSION` do bundle, o painel `/menubar` aberto recarrega uma vez, e não de novo depois de recarregar (as versões ainda diferem); com a versão igual, não recarrega (AC 34, AC 35)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "reloads once when the daemon changes version under an open panel"`
Proof: `pnpm --filter @lumem/web exec vitest run src/features/menubar/MenubarScreen.test.tsx -t "does not reload a panel that is already on the daemon's version"`

**C92** - `lumem menubar install` com o gerenciador saindo diferente de zero devolve esse código, não grava arquivo nenhum e não abre o app (AC 53)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "returns the manager's code and writes nothing when the install fails"`

**C93** - No Linux, com `unprivileged_userns_clone` = `0` ou `apparmor_restrict_unprivileged_userns` = `1`, os dois `.desktop` levam `--no-sandbox` no `Exec=` e a saída diz por quê; com os dois liberados (ou ausentes), nenhum leva (AC 78)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "adds no-sandbox only where the kernel refuses the sandbox"`

### S5 - atualizar sozinho quando ocioso · 5 files · 70 KB · ~25k

**C80** - Com `auto_update` em `idle`, um tick de 60 s supervisionado, com versão nova, sem turno em voo e sem script rodando, dispara o mesmo instalador do `system.update`; com `auto_update` em `off` (o padrão), o mesmo tick não dispara nada (AC 71, AC 72)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "installs on an idle tick only when the setting is idle"`

**C81** - Enquanto espera ocioso, o daemon aceita prompt e a esteira continua despachando; um turno em voo por três ticks não dispara nada, e o tick depois do `turn_end` dispara (AC 72, AC 73)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "waits for idle without draining"`

**C82** - Com a versão atual `1.4.0` e o `latest` `2.0.0`, o tick não instala e `updateAvailable` continua verdadeiro; com `0.6.1 → 0.7.0`, instala (AC 74)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "never crosses a major after 1.0 on its own"`

**C83** - Durante a instalação automática, a esteira não despacha tarefa nova (AC 75)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "the conveyor dispatches nothing while it installs"`
Proof: `pnpm --filter @lumem/server exec vitest run src/bootstrap.test.ts -t "does not dispatch from the daemon's own conveyor while it installs by itself"`

**C84** - `/settings` mostra `Atualizar sozinho quando ocioso` ligado ao `auto_update`, e desabilitado com `precisa do Lumem rodando como serviço` quando `supervised` é falso (AC 76)
Proof: `pnpm --filter @lumem/web exec vitest run src/features/settings/UpdateSettings.test.tsx -t "binds the auto-update toggle and needs a supervisor"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `query health` statuses (1) | 200 C13 | - |
| `query system.updateStatus` statuses (1) | 200 C18 | - |
| `mutation system.update` statuses (3) | 200 C27 · 409 C30 · 412 C32 | - |
| `query system.status` statuses (1) | 200 C52 | - |
| `query system.resources` statuses (1) | 200 C46 (o amostrador e o router) | - |
| `system.settings` / `system.setSettings` statuses (2) | 200 C22 · 400 C23 | - |
| `query usage.total` statuses (2) | 200 C42 · 400 C44 | - |
| `query agentAccount.rateLimits` statuses (1) | 200 C45 | - |
| `query system.live` statuses (1) | 200 C87 | - |
| `query workspace.recent` statuses (1) | 200 C88 | - |
| `GET /menubar` statuses (1) | 200 C59 | - |
| verbos do CLI (10) | `start` C4 · `run` C8 · sem verbo C7 · `stop` C9 · `status` C10 · `logs` C11 · `upgrade` C39 · `menubar install` C62 · `menubar open` C89 · `menubar uninstall` C66 | - |
| saídas do CLI que não são 0 (12) | `start` 1 sem supervisor C5 · `start` 1 outro Lumem C6 · `start` 1 sem health C4 · `stop` 1 C9 · `status` 3 C10 · `logs` 1 C12 · `menubar install` 1 C64 · `menubar install` com o código do gerenciador C92 · `menubar open` 1 sem app C89 · `upgrade` 1 C39 (`upgrade.test.ts`, `com o registry fora do ar, falha sem tocar na instalação` e `says so when the supervisor refuses to restart…`) · `upgrade` com o código do gerenciador C39 (`upgrade.test.ts`, `instalador que falha devolve o código dele…`) · `menubar uninstall` com o código do gerenciador C66 (`menubar.test.ts`, `keeps the app when the manager refuses to remove the package`). `open` e `uninstall` fora das quatro plataformas passam pela recusa única que `menubar()` faz antes do despacho (C64), sem caso próprio | - |
| supervisores (2) | launchd C1 · systemd C2 | - |
| layout do gerenciador global (3) | npm C85 · pnpm com symlink estável C85 · sem symlink C85 | - |
| plataformas do app (4) | `darwin-arm64` C62 · `darwin-x64` C62 · `linux-x64` C62 · `linux-arm64` C62 | - |
| estados do ícone (4) | `stopped` C69 · `attention` C69 · `update` C69 · `running` C69 | - |
| bloqueios do `system.update` (5) | turno em voo C30 · script rodando C30 · instalação já em curso C31 · sem supervisor C32 · sem versão nova C32 | - |
| falhas do registry (3) | timeout C19 · não 2xx C19 · corpo sem `version` C19 | - |
| desfechos da instalação (3) | saída 0 C28 · saída não zero C29 · falha ao nascer C29 | - |
| grupos de recursos (3) | `daemon` C47 · `agents` C47 · `terminals` C47 | - |
| manchete do painel (3) | cota C53 · custo C54 · tokens sem custo C54 | - |
| blocos do painel que falham sozinhos (4) | `Consumo` C86 · `Turnos em voo` C86 · `Recursos` C57 · `Versão` C86 | - |
| valores de `auto_update` (3) | `off` C80 · `idle` C80 · inválido C23 | - |
| portas de mão única (9) | 1 verbos C7 · 2 identidade do serviço C1 · 3 `daemon_settings` C24 · 4 contrato da casca C14 · 5 nomes publicados C62 · 6 dependências e fronteira C79 · 7 cópia do banco C34 · 8 o daemon se instala C27 · 9 o que o CLI deixa para o app C90 | - |
| startup config: `LUMEM_SUPERVISOR` (2 assemblies) | o serviço de verdade C15 · o harness de teste do router C13 | - |
| `paused` da esteira durante a instalação (2 montagens) | a do teste, `runConveyorLoop` direto C83 · a do daemon, montada pelo `bootstrap` C83 | - |

- Rotas que nomeiam status ou forma de resposta: C13, C14, C18, C22, C23, C27, C30, C32, C42, C44, C45, C46, C52, C59, C87, C88 — cada uma com prova que atravessa o router
- Nenhum outro check afirma mais do que o caso único que a prova dele exercita

## Test policy

A [matriz de `testing.md`](../../project/testing.md) responde as camadas do `server` e da web que esta
feature toca (router por caller, banco em arquivo temporário, rota por e2e). Duas camadas são novas e ela
não as cobre: o **processo principal do Electron** e o **escritor de serviço do CLI**.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| `packages/desktop`, decide (estado do ícone, menu, trava de navegação, comandos) | vitest com `electron` dublado | um caso por linha da tabela de decisão (as 5 do ícone, os 6 itens do menu) |
| `packages/desktop`, a casca inteira | um e2e com `_electron.launch` | o caminho feliz: sobe, cria o ícone, o painel carrega a página do daemon |
| `packages/cli`, escritor de serviço | vitest com `launchctl`, `systemctl` e o disco dublados | o conteúdo do arquivo por supervisor, a ordem dos comandos, e cada recusa |
| `packages/cli`, o serviço de verdade | `pnpm smoke:service`, local | subir, sobreviver ao chamador, parar, e voltar depois de atualizar |

Evidence:

- `tray-state.ts`: 4 estados com precedência, 5 entradas na tabela → decide
- `service.ts`: 2 supervisores × escrever, carregar, descarregar, mais a recusa sem supervisor → decide
- análogo no repositório: a instalação do adaptador, provada por unit com `npm` dublado e nenhum
  `npm install` de verdade (a linha *instalação do adaptador* da matriz)

Cost: ~9 provas de unidade em 6 arquivos novos, um e2e de Electron e um script local. Sem estas linhas, a
tabela de estado do ícone e os dois supervisores só seriam provados pelo caminho que o e2e e o
`smoke:service` por acaso atravessam.

## Swept

- validation: C21, C23, C24, C44
- failure modes: C4, C19, C29, C57
- idempotency: C3, C22, C31, C38
- authorization: existing - a mesma fronteira de todo o `/trpc`; a `019` a muda para todas as rotas de uma vez, e o `CONFLICT`/`PRECONDITION_FAILED` de C30 e C32 guardam o que é perigoso
- concurrency: C31, C33, C83
- data lifecycle: C34, C35, C36
- dependency failure: C19, C29, C74
- state transitions: C69, C80, C81
- observability: C19, C10, C11

## Handoff

Tamanho, com a conta, escrito depois dos checks e antes de qualquer código:

- S1 = ~45k, no CLI e um arquivo do servidor; S2 entra em `update/`, `db/`, `acp/` e na web e chega a
  ~120k; S3 leva a ~185k; S4 abre `packages/desktop` e o release e leva a ~275k; S5 fecha em ~300k.
- Passa do orçamento de 150k de um construtor. **Corte proposto: um construtor por fatia**, na ordem
  S1 → S2 → S3 → S4 → S5, cada um abaixo do orçamento. S4 depende dos experimentos 4, 5 e 6 da fase 0; S1
  e S2 dependem do 1 e do 2.
- Mechanism: handoff — um `lumem-dev` por fatia, escolhido em 2026-09-29. As linhas de `Test policy` entraram na matriz de `testing.md` no mesmo dia
- **Boundary:** C1–C16 closed at 0d6bb0e
- **Settled mid-build:** `lumem start` deixa em paz um serviço cujo arquivo já é o que escreveria agora (`lumem` sem verbo é `start`, e reiniciar derrubaria sessões); só reinicia quando o arquivo mudou. O que a pessoa pediu (`--port`, `--host`, `--state-dir` ou as `LUMEM_*`) viaja no ambiente do arquivo de serviço, e mais nada — o padrão não é gravado. No Linux, com a unit já ativa, `start` acrescenta `systemctl --user restart` depois do `enable --now`. `LUMEM_SERVICE_LABEL` e `LUMEM_SERVICE_UNIT` são ganchos de teste do `smoke:service` (os padrões são os da porta 2). O `status` lê `supervised` por um `readHealth` novo; o `probePort` não mudou de forma (o teste do C14 é `toEqual`). O `protocolVersion: 1` mora inline no router; a S4 o sobe para `@lumem/shared` se o app precisar importá-lo. Os testes de primeiro plano de `run.test.ts` passaram a chamar `lumem run`, com as mesmas asserções.
- **Abandoned:** nada. O passo `update-relaunches` do `smoke:service` (C40) não foi construído — é da S2, e o script sai 2 dizendo isso.
- **Boundary (S2):** C17–C41 closed at 5e3718e3. O `smoke:service --only update-relaunches` e o `e2e/update.spec.ts` passaram na máquina de quem construiu (macOS, launchd de verdade); o e2e três vezes seguidas.
- **Settled mid-build (S2):** o `REGISTRY_URL` passou a escrever `@vinihcrosa%2Flumem-os` (o `@` sem escapar), como o AC 15 e o C17 escrevem — o registry responde 200 às duas grafias, e o `%40` de antes estava afirmado por uma linha do `upgrade.test.ts`, que agora afirma a URL inteira. `fetchLatestVersion`, `compareVersions`, `detectPackageManager` e `installCommand` subiram para `@lumem/shared`, e `upgrade.ts` os reexporta. *Ocioso* é `busyNow` em `update/idle.ts`, e a S5 o reusa: `AcpManager.liveTurns()` mais o novo `ScriptRunner.runningCount()`. A porta de prompt é `AcpManager.setUpdating` (`BLOCKED`, que o tRPC mapeia a `CONFLICT`); `PRECONDITION_FAILED` entrou em `DomainErrorCode`. `system.update` volta na hora que a instalação **começa**; quem diz como acabou é `updateStatus.lastError`. O banco é copiado por `VACUUM INTO`, e não por `cp`, por causa do `-wal`. Nenhum dos três testes que simulam o supervisor é o launchd: o `smoke:service` é, e o e2e o faz relançando o processo. O `smoke:service` e o e2e trocam a versão, a URL do registry e o `npm` **de fora do daemon** (o bundle instalado, um executável na frente do `PATH`), então o daemon não ganhou nenhum gancho de teste. A Q3 de `open-questions.md` está aberta: sob pnpm ou bun o plist pode apontar para um diretório com a versão no caminho.
- **Abandoned (S2):** nada. Não construído, por ser da S5: o interruptor `Atualizar sozinho quando ocioso` de `/settings` (C84) e o tique de 60 s (C80–C83); `auto_update` só é lido e gravado.
- **Boundary (S3):** C42–C61 e C85 closed at 402e48d6 (o C85 sozinho em ce094310, antes de tudo). Provas: as 21 rodadas uma a uma, verdes; `pnpm measure:resources --only ten-sessions` deu **0,44–0,47%** em três rodadas no macOS (~3 ms do daemon e ~11 ms do `ps` por amostra, numa tabela de ~650 processos); o `e2e/menubar.spec.ts` passou três vezes seguidas.
- **Settled mid-build (S3):** o C85 é `ServiceHost.exists()` mais uma regra em `service.ts`: `<g>/.pnpm/<pacote>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs` grava `<g>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs` quando o symlink existe; o `bun` continua sem medida, e a Q3 fechou. Duas rotas que o Surface não tinha, porque o AC 48 pede a lista de turnos com sessão e checkout e o AC 51 a contagem de shells: `system.live` (`turns`, `openTerminals`) e `workspace.recent` — linhas no Surface e nas Assumptions antes do código. `system.status` ficou barato de propósito (a casca o consulta a cada 10 s), e por isso `attention` é só `AcpManager.hasPendingPermission()`. `AcpManager.rateLimits()` passou a dizer `reportedAt`, `accountId` e `adapterId`; com duas sessões numa conta vale o relato mais recente, e sessão fora do catálogo não aparece. `cpuPercent` de **grupo** é `number | null`: a soma dos processos que já têm taxa, `null` enquanto nenhum tem — o C46 só tem número a partir da segunda amostra; a primeira amostra depois de 15 s de pausa volta a ser a primeira (a taxa entre duas leituras de minutos é média de outra coisa). No `top` só a **raiz** da sessão (o adaptador, o PTY) leva o nome da sessão; o filho dela é o nome do comando. O título do agente é o id do catálogo com inicial maiúscula (`Claude`), e não o `label` (`Claude Code`), porque o exemplo do AC 44 é `Claude · lumem-os/bandung`. `PROTOCOL_VERSION` subiu para `@lumem/shared`. `/menubar` é decidido no `App` **antes** de qualquer hook do shell: a página abre um socket a menos que o workspace. **Para a S4:** o botão `Abrir o Lumem` do painel é `<a href="/" target="_blank">` e os workspaces recentes chamam `window.open("/", "_blank")` depois de gravar `lumem.activeWorkspaceId` — o `setWindowOpenHandler` do app precisa mandar uma URL da mesma origem para a janela principal (C72), e não para o `shell.openExternal` do C76. O painel não roda o `useVersionReload`: depois de uma atualização, uma janela do painel que ficou aberta continua com o bundle velho até ser recarregada. `measure:resources` mede amostra a amostra e não o processo numa janela (um `tsx` parado gasta 0,6–0,9% de CPU sozinho), e o `pnpm` mostra 1 mesmo quando o script sai 2.
- **Abandoned (S3):** nada. A amostra de Linux do C51 (`/proc/<pid>/stat` e `status`) **não é gravada**: não houve máquina Linux aqui, e o texto segue o formato do kernel (o `comm` com espaço e parêntese, `utime` e `stime` em ticks de 100 Hz) — a de macOS é o `ps` desta máquina. Quem verifica no Linux confere o `/proc` de verdade.
- **Boundary (S4):** C62–C79 closed at 3f5b1674. Provas: as 19 rodadas uma a uma, verdes, e o `pnpm smoke:install --only desktop` saiu 0 no macOS arm64 (a metade de Linux **não rodou**: não há máquina Linux aqui); o e2e do app (`packages/desktop/e2e/app.spec.ts`) passou com o Electron de verdade, e ganhou dois casos além do C77 — o painel com o daemon parado e um segundo lançamento com `--uninstall` encerrando o que está rodando. **Fase 0, experimento 4:** os tarballs medidos são `darwin-arm64` 126,1 MB, `darwin-x64` 133,1 MB, `linux-x64` 124,5 MB (296 MB desempacotado) e `linux-arm64` 127,1 MB (301 MB); o `npm publish --dry-run` **não foi rodado** — o guarda do repositório recusa `npm publish` até com `--dry-run` —, então quem aceita ~130 MB (e o corpo em base64 do PUT, ~170 MB) só se sabe na primeira tag, e o desenho já publica os pacotes do app **antes** do daemon. **Experimento 5:** o `.app` sai do zip do pacote instalado por `npm i -g` sem `com.apple.quarantine` (só `com.apple.provenance`), o `codesign --verify --deep --strict` sai 0 com assinatura ad-hoc, e um `open` do app copiado para uma pasta descartável o pôs de pé (três processos do Electron, depois de 6 s) sem prompt do Gatekeeper — a decisão D2 fica como está.
- **Settled mid-build (S4):** o `lumem-desktop.json` é a porta 9, com Landing row antes do código, e leva um quinto campo, `path` (o `PATH` do terminal): o `Iniciar` do app roda `lumem start`, que grava o `PATH` de quem chamou no serviço, e o de um app aberto pelo Finder é `/usr/bin:/bin`. O **npm descarta symlink** (medido), então o pacote do macOS leva `Lumem.zip`, que o CLI abre com `ditto`, e o do Linux leva a pasta desempacotada, que o `.desktop` executa. `lumem menubar open` roda o binário com `--panel` (chega à instância viva pelo `second-instance`) e `uninstall` roda `--uninstall`, que tira o item de login **depois** de pedir a trava de instância única — antes, o processo novo saía sozinho e o app continuava na barra. O `install` abre o app; o `upgrade` só o copia de novo, então um app já rodando segue no código velho até reabrir. No macOS o clique abre o painel e o menu sai do clique direito (`setContextMenu` engole o clique); no Linux o menu é o caminho e o painel é uma janela comum. `Atualizar` do menu **abre o painel**, e não instala: é lá que a tela diz que terminais fecham (AC 51). O app só se registra no login quando empacotado (`app.isPackaged`): o e2e tinha deixado o Electron do `node_modules` nos itens de login, e foi desfeito com `--uninstall` — sobrou, desabilitado, um registro `Lumem` de `/tmp` do experimento 5, que só `sfltool resetbtm` (de tudo) tira. `window.open` de mesma origem vai para a janela principal e a foca **sem recarregar**: um workspace recente escolhido no painel só vale quando a janela principal ainda não está aberta. O painel roda o `useVersionReload` com a versão do `updateStatus` (`current`), e não do `health`: assim ele não ganha pergunta, e o teste do `App` que diz que `/menubar` não chama `health` segue inteiro. O Electron 44 baixa o binário na primeira vez que alguém o pede, então o `pnpm install` não baixa nada e o `ELECTRON_SKIP_BINARY_DOWNLOAD` não existe para pular; só o job `desktop` do release e o e2e o pagam. O release empacota o Linux das duas arquiteturas no runner x64 (cross-arch do electron-builder; a pasta `linux-arm64-unpacked` saiu daqui de um host macOS) e cada nome novo no npm precisa do trusted publisher configurado antes da primeira tag. A Q4 (sandbox do Chromium no Linux com user namespaces restritos) está aberta.
- **Abandoned (S4):** nada foi cortado dos checks. Não rodou aqui: a metade de Linux do `smoke:install --only desktop`, o `.AppImage` e o `.deb` (as ferramentas x86 do electron-builder falham num macOS arm64 sem Rosetta — `spawn -86`; num runner Linux nascem), o `npm publish --dry-run` e o `release.yml` em si. O `windows.test.ts` prova a guarda de 300 ms contra o clique que tirou o foco, mas o clique de verdade no ícone não foi exercitado: o Playwright não alcança a barra de menus.
- **Boundary (S5):** C80–C84 closed at 24afcdd7 (C80–C83 em 13f65155, C84 em 24afcdd7). Provas: as cinco rodadas uma a uma, verdes; `gate:quick` desde `c494f7b`, `lint`, `typecheck` e `docs:check` saíram 0; `e2e/settings.spec.ts`, `e2e/conveyor.spec.ts` e `e2e/update.spec.ts` passaram (16 casos).
- **Settled mid-build (S5):** o tique mora em `update/auto.ts` e chama o **mesmo** `installer.start` do `system.update`, com o mesmo `busyNow`; o que decide é relido no instante do `start`, porque a contagem de scripts é assíncrona e um turno pode abrir nesse meio tempo. A única ponta que ele pediu da esteira é `runConveyorLoop({ paused })`, ligada no `bootstrap` a `installer.installing()`: a passada inteira é pulada, e por isso vale também para a instalação do botão (a porta de prompt já está fechada, e uma tarefa despachada nela gastaria uma tentativa antes de o prompt ser recusado). Antes da instalação a esteira anda e o daemon aceita prompt — o C81 prova as duas coisas com a esteira de verdade (`runConveyorLoop`) e um `AcpManager` real. Cruzar o major é `major(current) >= 1 && major(latest) > major(current)`: `0.9.2 → 1.0.0` instala (sob `0.x` qualquer aumento vale), `1.4.0 → 1.5.0` também, e o botão manual continua atravessando o major. `bootstrap` ganhou `update.autoIntervalMs` (só um teste passa) para o teste de fiação provar que o tique é armado depois do `listen` e sai pelo desligamento do daemon. O teto de linhas do `bootstrap.ts` subiu de 843 para 868, com motivo. Em `/settings` o interruptor lê `supervised` do `updateStatus`; enquanto ele não chegou fica desabilitado **sem** o texto, porque ainda não se sabe.
- **Abandoned (S5):** nada foi cortado dos checks. Não provado por teste: a fiação `paused: () => update.installer.installing()` do `bootstrap` (a esteira do daemon tem intervalo fixo de 15 s, sem gancho de teste; o `auto.test.ts` prova o `paused` do `runConveyorLoop`, e trocar a linha do `bootstrap` por `() => false` deixa tudo verde). Janela conhecida e não fechada: uma passada da esteira já em `prepareCheckout` (antes do prompt) não é turno em voo nem script rodando, então o `busyNow` a vê ociosa; o prompt dela será recusado pela porta fechada e a tentativa gasta.
- **Fix round 1 (verificação de 2026-09-30):** o `paused` do `bootstrap` ganhou prova na esteira que o daemon monta (C83, segunda prova; o gancho é `conveyorSetInterval`, e trocar a linha por `() => false` deixa o teste vermelho); o `cpuPercent` em uma casa decimal ganhou valores fracionários no amostrador e no router (C46, segunda prova; `Math.round(value)` no `round1` deixa os dois vermelhos); C86–C92 dão check ao que a construção acrescentou sem nome — falha isolada dos blocos, `system.live`, `workspace.recent`, `menubar open`, a porta 9, o recarregamento do painel e o código do gerenciador no `menubar install`. A amostra de Linux do C51 agora é gravada (kernel Linux aarch64). Continuam sem prova, por dependerem de máquina que esta sessão não tem: a metade de Linux do C78 e o `systemd --user` de verdade; e a Q4, aberta.
