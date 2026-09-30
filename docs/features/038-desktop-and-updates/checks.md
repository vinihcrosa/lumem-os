# O Lumem fica de pé sozinho, se atualiza, e mora na barra — checks

> **Status:** completa

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
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "writes what XML and systemd read as syntax, and reads it back the same"`

**C2** - No Linux com `systemctl --user` respondendo, `lumem start` escreve `~/.config/systemd/user/lumem.service` com `ExecStart=<node> <lumem> run`, `Environment=PATH=…`, `Environment=LUMEM_SUPERVISOR=systemd`, `Restart=always`, `RestartSec=2` e `StandardOutput=append:<stateDir>/daemon.log`, e chama `daemon-reload` e `enable --now lumem.service`, nessa ordem; se um passo sai diferente de 0, recusa nomeando o passo e o que o sistema disse, e não roda os seguintes (AC 2)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "writes the systemd unit and enables it"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "stops at the first systemd step that fails, and says which one"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "explains a failure with stderr first, then stdout, then the exit code"`

**C3** - Com o arquivo de serviço já existente e um `PATH` diferente, `lumem start` o reescreve com o `PATH`, o `node` e o `lumem` de agora antes de carregá-lo (AC 3)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "rewrites an existing service file before loading it"`

**C4** - Depois de carregar o serviço, `lumem start` sai 0 assim que `/trpc/health` responde `ok: true`, e sai 1 imprimindo as últimas 20 linhas de `<stateDir>/daemon.log` se isso não acontece em 15 s; o arquivo de serviço leva só o que a pessoa pediu — `--port`, `--host`, `--state-dir` ou as `LUMEM_*`, a flag primeiro —, nunca o padrão; um serviço carregado com o arquivo de agora mas sem daemon respondendo não é dado como de pé; e o navegador só abre com `--open` (AC 4)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "start waits for health and prints the log when it never answers"`
Proof: `pnpm smoke:service --only start-waits-for-health`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "carries into the service only what the person asked, from the flag or from the environment"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "resolves the state dir the way the daemon does"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "probes 127.0.0.1 for a daemon that listens on every interface, and the host itself otherwise"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "does not trust a service that is loaded and current when nothing answers"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "opens the browser only with --open, wherever start ends"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "says which version came up, and where"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "fails naming the wait, and the log, when the daemon never answers"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "hands the daemon only what was asked, and nothing for the state dir when none was"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/run.test.ts -t "asks every question about the origin the flags and the environment resolved"`

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
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "runs neither launchctl nor systemctl, and touches no file"`

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
Proof: `pnpm --filter @lumem/server exec vitest run src/routers/system.test.ts -t "fails loudly when the row the migration creates is missing"`

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

**C30** - `system.update` falha com `CONFLICT`, e o instalador não é chamado, em cada um dos três estados ocupados do AC 27, que é uma disjunção: 2 turnos em voo e 1 script rodando, 2 turnos e nenhum script, e nenhum turno e 1 script; a mensagem traz os dois números de cada estado (AC 27)
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
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "names the command that failed, per supervisor"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/service.test.ts -t "runs nothing where there is no supervisor"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "says so, and exits 1, when the package manager cannot even start"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "asks the daemon at the origin it was given, both when there is a service and when there is not"`

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
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "breaks a tie in size by the lower pid"`

**C47** - Um neto de um adaptador ACP entra em `agents`, um neto de um PTY entra em `terminals`, e o próprio daemon entra em `daemon` (AC 41)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/attribute.test.ts -t "attributes a process to its nearest tracked ancestor"`
Proof: `pnpm --filter @lumem/server exec vitest run src/acp/AcpManager.test.ts -t "does not list a process whose session has exited"`

**C48** - Um processo com 1,0 s de CPU acumulada numa amostra e 1,5 s na seguinte, 5 s depois, tem `cpuPercent` `10.0`; na primeira amostra dele, `null` (AC 42)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "computes cpu from the delta between samples"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "rates only what two readings can rate, from any clock"`

**C49** - Sem `system.resources` por 15 s, o daemon não lê a tabela de processos; a próxima consulta volta a ler (AC 43)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "stops sampling when nobody asks"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "stops reading exactly when nobody asked for the whole idle window"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "arms one clock when two first questions arrive together"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "ticks on a real interval when none is injected, and stop clears it"`

**C50** - No `top`, um adaptador aparece como `Claude · lumem-os/bandung`, um PTY com o nome da sessão e do checkout, e um processo sem sessão com o nome do comando (AC 44)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/sample.test.ts -t "labels the top processes by session and checkout"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/live.test.ts -t "names a script by its tab, and each adapter by its own catalog id"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/live.test.ts -t "falls back to what it can say when the database does not know the session"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/live.test.ts -t "does not fail the sample when a session leaves between listing it and naming it"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/session-place.test.ts -t "names the agent by its catalog id, and says Agente when nobody can tell"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/session-place.test.ts -t "has no checkout for a session whose worktree is gone, and no place for one that is not stored"`

**C51** - A leitura da tabela de processos no macOS interpreta a saída de `ps -A -o pid=,ppid=` (os pais, da tabela inteira) e de `ps -x -o pid=,ppid=,rss=,time=,comm= -p <árvore>` (memória e CPU só da árvore do Lumem), e no Linux lê `/proc/<pid>/stat` de todos e `/proc/<pid>/status` só da árvore, a partir de amostras gravadas das duas (AC 40, AC 42)
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/process-table.test.ts -t "reads ps on darwin and proc on linux"`
Proof: `pnpm --filter @lumem/server exec vitest run src/resources/process-table.test.ts -t "reads every time format ps prints, and skips what it cannot read"`

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

**C61** - Medir a árvore de processos a cada 5 s com 10 sessões abertas custa menos de 1% de CPU do daemon (a meta da C1b da discovery, experimento 3 da fase 0) (AC 43)
Proof: `pnpm measure:resources --only ten-sessions`
Proof: `pnpm --filter @lumem/server exec vitest run src/testing/measure-resources.test.ts -t "adds user and sys from time -p, in milliseconds"`
Proof: `pnpm --filter @lumem/server exec vitest run src/testing/measure-resources.test.ts -t "answers null for an output that is not time -p"`

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
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "says where the app is, per platform"`

**C63** - No macOS a instalação copia o app para `~/Applications/Lumem.app`; no Linux escreve `~/.local/share/applications/lumem.desktop` e `~/.config/autostart/lumem.desktop` (AC 54)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "puts the app where the desktop finds it"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "fails and opens nothing when the app cannot be copied, and says why"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "quotes an executable path that the .desktop would read as syntax"`

**C64** - Em `win32-x64` ou `linux-ia32`, `lumem menubar install` sai 1 e lista as quatro plataformas (AC 55)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "refuses an unsupported platform"`

**C65** - `lumem upgrade` com o pacote do app instalado instala a mesma versão dele e, no macOS, copia o app de novo (AC 56)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "takes the desktop package along"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/upgrade.test.ts -t "leaves the app alone on a machine that has none"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "fails and says why when the app cannot be copied again"`

**C66** - `lumem menubar uninstall` remove o pacote, o app ou os dois `.desktop`, e o item de login (AC 57)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "uninstall leaves nothing behind"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "does not ask an app that is not there to remove its own login item"`

**C67** - No macOS o app chama `app.setLoginItemSettings({ openAtLogin: true })` e cria um só ícone (AC 58)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "starts at login with one tray icon"`

**C68** - O app consulta `/trpc/health` e `system.status` a cada 10 s (relógio falso) (AC 59)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "polls health and status every ten seconds"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "arms one clock however many times it is started, and can start without a round"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "gives each question a timeout signal"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "does not ask the daemon a second time at boot"`

**C69** - A imagem do ícone segue a tabela de 5 entradas: `health` sem resposta → `stopped` mesmo com versão nova; `attention` → `attention`; `protocolVersion` 2 → `attention`; só versão nova → `update`; nada → `running` (AC 60)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/tray-state.test.ts -t "picks the icon by precedence"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "reads every answer that is not a healthy Lumem as stopped, each one alone"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/poll.test.ts -t "reads a health answer with no protocol as a Lumem it cannot read, and asks nothing more"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "redraws the icon, the tooltip and the menu when what shows changed, and only then"`

**C70** - No macOS, clicar no ícone abre uma janela sem moldura de 360×520 carregando `<origem>/menubar`, clicar de novo a esconde, e perder o foco a esconde (AC 61)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "toggles the panel under the icon"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "reopens exactly when the click window has passed, and not before"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "does not count a blur of a panel that was already hidden"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "registers the click handlers on macOS and none on Linux"`

**C71** - O menu de contexto tem, nessa ordem, `Abrir painel`, a linha desabilitada de estado com ` · atualização disponível` quando há, `Abrir o Lumem`, `Iniciar` ou `Parar`, `Atualizar` habilitado só com versão nova, e `Sair` (AC 62)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/menu.test.ts -t "builds the context menu in order"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "wires every menu item to what it says"`

**C72** - `Abrir o Lumem` abre uma janela em `<origem>/`, e escolher de novo foca a mesma em vez de abrir outra (AC 63)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "opens one main window and focuses it after"`

**C73** - `Iniciar` e `Parar` rodam `<node> <lumem> start` e `<node> <lumem> stop` com os caminhos do `lumem-desktop.json` (AC 64)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/commands.test.ts -t "runs the recorded lumem to start and stop"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/commands.test.ts -t "leaves the PATH it was opened with when the config recorded none"`

**C74** - Com `health` sem resposta, o painel carrega a página local `Lumem parado` com o botão `Iniciar` (AC 65)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "shows the local stopped page when the daemon is down"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/main.test.ts -t "shows the local page in a panel opened while the daemon is down"`

**C75** - Com `protocolVersion` diferente de `1`, a linha de estado diz `app e Lumem em versões incompatíveis — rode lumem menubar install` (AC 66)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/menu.test.ts -t "says when app and daemon speak different protocols"`

**C76** - Toda janela nasce com `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`; navegar para outra origem é cancelado; e um link externo abre com `shell.openExternal` (AC 67)
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "locks every window to the daemon origin"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "opens http and https links outside, and nothing else"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/windows.test.ts -t "trusts nothing when the recorded origin is not a URL"`

**C77** - O app de verdade, subido pelo `_electron.launch` do Playwright contra um daemon de teste, cria o ícone e o painel carrega `/menubar` (AC 58, AC 61)
Proof: `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel carrega a página do daemon"`

**C78** - O `release.yml` publica os quatro `@vinihcrosa/lumem-desktop-*` na versão da tag com `--provenance`, e anexa `.zip` (macOS) e `.AppImage` e `.deb` (Linux) de cada arquitetura ao GitHub release; o `smoke:install` no macOS instala o pacote `darwin` e roda `codesign --verify`, e no Linux sobe o app sob `xvfb` (AC 68, AC 69)
Proof: `pnpm exec vitest run scripts/release-workflow.test.ts -t "publishes the four desktop packages and attaches their artifacts"`
Proof: `pnpm smoke:install --only desktop`
Proof: `pnpm exec vitest run scripts/smoke-install.test.ts -t "the default path imports nothing from the workspace"`
Proof: `pnpm exec vitest run scripts/release-workflow.test.ts -t "o .deb do app de desktop"`
Proof: `pnpm --filter @lumem/desktop exec vitest run src/packaging.test.ts -t "carries what a scoped, provenance-signed publish needs"`

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
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "fails and opens nothing when the manager leaves no package behind"`
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "says so, and exits 1, when the manager cannot even start"`

**C93** - No Linux, com `unprivileged_userns_clone` = `0` ou `apparmor_restrict_unprivileged_userns` = `1`, os dois `.desktop` levam `--no-sandbox` no `Exec=` e a saída diz por quê; com os dois liberados (ou ausentes), nenhum leva (AC 78)
Proof: `pnpm --filter @vinihcrosa/lumem-os exec vitest run src/menubar.test.ts -t "adds no-sandbox only where the kernel refuses the sandbox"`

### S5 - atualizar sozinho quando ocioso · 5 files · 70 KB · ~25k

**C80** - Com `auto_update` em `idle`, um tick de 60 s supervisionado, com versão nova, sem turno em voo e sem script rodando, dispara o mesmo instalador do `system.update`; com `auto_update` em `off` (o padrão), o mesmo tick não dispara nada, e com `idle` mas sem supervisor, sem versão nova ou com um script rodando, também não; o que decide é relido no instante da instalação (o interruptor desligado, ou um turno aberto, durante a espera por scripts recusam), um tique lento não é ultrapassado pelo seguinte, e uma falha antes da instalação vira aviso e não trava o tique seguinte (AC 71, AC 72)
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "installs on an idle tick only when the setting is idle"`
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "does nothing without a supervisor, a newer version, or with a script running"`
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "decides again at the instant of the install, not at the start of the tick"`
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "does not let a slow tick be overtaken by the next one"`
Proof: `pnpm --filter @lumem/server exec vitest run src/update/auto.test.ts -t "never throws: a failure before the install becomes a warning, and the next tick runs"`

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
| estados do kernel para o sandbox, `userns_clone`/`apparmor_restrict` (9) | `ausente`/`ausente` C93 · `ausente`/`0` C93 · `ausente`/`1` C93 · `1`/`ausente` C93 · `1`/`0` C93 · `1`/`1` C93 · `0`/`ausente` C93 · `0`/`0` C93 · `0`/`1` C93 | - |
| layout do gerenciador global (3) | npm C85 · pnpm com symlink estável C85 · sem symlink C85 | - |
| plataformas do app (4) | `darwin-arm64` C62 · `darwin-x64` C62 · `linux-x64` C62 · `linux-arm64` C62 | - |
| estados do ícone (4) | `stopped` C69 · `attention` C69 · `update` C69 · `running` C69 | - |
| bloqueios do `system.update` (7) | turno em voo e script rodando juntos C30 · turno em voo sem script C30 · script rodando sem turno C30 · instalação já em curso C31 · sem supervisor C32 · sem versão nova C32 · ocioso (0 turnos, 0 scripts) aceita C27 | - |
| `menubar open`, pacote do app × `.app` copiado: macOS 2×2 e Linux com ou sem pacote (6) | macOS pacote+app abre C89 · macOS só pacote C89 · macOS só app C89 · macOS nenhum C89 · Linux pacote abre C89 · Linux sem pacote C89 | - |
| o que `lumem start` leva ao arquivo de serviço, flag × ambiente por variável (10) | nada C4 · `--port` C4 · `LUMEM_PORT` C4 · os dois C4 · `--host` C4 · `LUMEM_HOST` C4 · os dois C4 · `--state-dir` C4 · `LUMEM_STATE_DIR` C4 · os três juntos C4 | - |
| o que decide o tique automático, relido no instante da instalação (3) | interruptor desligado durante a espera C80 · turno aberto durante a espera C80 · nada mudou, instala C80 | - |
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
- **Fix round 2 (verificação de 2026-09-30):** o C93 (Q4 respondida em (c)) está construído: `lumem menubar install` e `upgrade` leem `unprivileged_userns_clone` e `apparmor_restrict_unprivileged_userns` por `host.read` e só levam `--no-sandbox` aos dois `.desktop` onde o kernel nega o sandbox, dizendo por quê numa linha; a prova é uma tabela de cinco casos, e as mutações "sempre" e "nunca" a deixam vermelha. O passo de Linux do `smoke:install --only desktop` imprime o `Exec=` que o install escreveu e, antes da execução com `--no-sandbox`, abre o app uma vez sem ele e imprime `phase0-q4: sandbox=<ok|refused|unknown> userns_clone=… apparmor_restrict=…` — uma medição que não derruba o passo, e que **não rodou**: não há Linux aqui, então a resposta vem do `release.yml` em `dry_run`. C29, C37, C42 e C55 ganharam a segunda `Proof:`; a linha das saídas do CLI que não são 0 passou de 9 para 12 membros; o `runConveyorLoop` do Flow é `(exists)`. Continuam sem prova, por dependerem de máquina: a metade de Linux do C78 (e o `.AppImage`/`.deb`) e o `systemd --user` de verdade, agora no backlog.
- **Fix round 3 (release dry run, 2026-09-30):** o primeiro `release.yml` de verdade (`dry_run`) achou dois defeitos que nenhuma máquina local mostra. (1) O `smoke:install` do caminho padrão rodava num runner sem `pnpm install` e morria com `Cannot find package '@lumem/shared'`, porque a S4 lhe dera `import` estático de código do workspace; agora o código do workspace entra por `import()` dentro do passo `--only desktop`, e o teste `the default path imports nothing from the workspace` o guarda. Reproduzido num `git archive` do commit, sem `node_modules`: o script de antes morre com o mesmo erro do CI e o de agora instala o tarball, sobe o `lumem run` e confere `/` e `trpc/health`. (2) O `electron-builder` construía o `.AppImage` e caía no `.deb` com `Please specify project homepage`: o `packages/desktop/package.json` ganhou `homepage` (o `linux.maintainer` com e-mail já existia), e dois testes em `release-workflow.test.ts` exigem o `homepage` e o mantenedor. **Não provado aqui:** o `.deb` em si — o `fpm` não roda num macOS arm64 —, que só o `release.yml` refeito prova. C78 ganhou duas `Proof:`.
- **Fix round 4 (verificação de 2026-09-30, rodada 3):** a tabela do C93 ganhou a combinação do Ubuntu 23.10+ (`userns_clone=1`, `apparmor=1`), a que o runner do `release.yml` mediu; o mutante M7 da rodada 3 (deixar o botão do Debian decidir sozinho) agora derruba a prova.
- **Fix round 5 (verificação de 2026-09-30, rodada 4):** a tabela do C93 passou a cobrir os 9 estados dos dois botões do kernel, e não só os exemplos; o M7 da rodada 3, o M11 da rodada 4 e mais cinco mutantes de precedência e de ausência derrubam a prova.
- **Fix round 6 (verificação de 2026-09-30, rodada 5):** o C30 prova o AC 27 com cada botão sozinho (2 turnos e 0 scripts, 0 turnos e 1 script) além dos dois juntos, e o M14 (`&&` no lugar de `||`) e as duas metades soltas dele caem. Em vez de fechar só o M14, a varredura que a rodada pediu foi **mecânica**: o Stryker, apontado para os arquivos que a 038 decide (`update/`, `resources/`, `routers/system.ts`, `db/backup.ts`, as pontas de `usage`, `agentAccount`, `AcpManager`, `ScriptRunner`, `conveyor-loop`, `config`), e também para `packages/cli` (`service`, `menubar`, `upgrade`, `run`) e `packages/desktop` (todos os módulos de `src/`), com um `stryker.*.config.json` descartável. Cada sobrevivente em decisão virou um caso no teste que o check nomeia (ou numa segunda `Proof:`); o resto está classificado na tabela abaixo. O que a varredura achou além dos casos: **um defeito** em `resources/sample.ts` — duas primeiras `system.resources` juntas armavam dois relógios e o primeiro ficava sem quem o desarme — (uma linha: `disarm ??= every(...)`, com teste). **C61:** o `time -p` do macOS **trunca** cada leitura a 10 ms e o `ps` era medido sozinho, dez vezes: ele perdia ~10 ms dos ~25 que o `ps` gasta e o número saía bom demais (0,43–0,60%, com `ps` a 10–15 ms); agora o `ps` é medido em lote de 50 dentro de um `sh` e dá 24,0–24,8 ms, e o custo **real** é de 0,91–0,95% numa tabela de ~690 processos — dentro da meta, mas com 5–9% de folga, e o custo do `ps` cresce com a tabela.
- **Fix round 7 (C61, a medição honesta passou do limite):** com o `ps` medido em lote, a amostra custava 1,09% (3,72 ms do daemon + 29,00 ms do `ps`, numa tabela de 794 processos), porque o `ps -A -o pid=,ppid=,rss=,time=,comm=` pede memória, CPU e caminho do executável de **toda** a máquina para usar dezenas. A leitura passou a duas passadas (`process-table.ts`): os elos `pid`/`ppid` da máquina inteira, a árvore montada a partir dos PIDs que o daemon rastreia (`ProcessTableReader` agora recebe as raízes), e só então `rss`, CPU acumulada e comando **da árvore**; no Linux o `stat` de todos e o `status` só da árvore. Um processo que some entre as passadas não volta (no Linux, `stat` sem `status` agora é ausência, e não linha com memória zero). **Achado de medição:** no macOS `ps -p a,b` com dois pids ou mais, sem `-x`, gasta ~28 ms de CPU de sistema mesmo para 13 processos (um pid só, ~1 ms); com `-x` devolve os mesmos pids e gasta ~2 ms — a segunda passada leva `-x` por isso, e a primeira continua sendo o custo dominante (~16 ms, o `sysctl` da tabela inteira). O `measure:resources` repete em lote de 50 os comandos que a **última leitura de fato lançou** (gravados no `exec` do leitor, com os PIDs reais), e não um `ps` escrito no script. Três rodadas, máquina com ~800 processos e árvore de 11–12: **0,69%** (5,02 + 15,80 ms), **0,91%** (5,17 + 22,00 ms), **0,80%** (5,90 + 18,00 ms) — dentro da meta, com folga de 9% a 31% e a variação de uma máquina ocupada; o custo do daemon subiu de ~3,7 para ~5 ms (dois `execFile` por amostra). O **C51** segue verde, mas o texto dele ainda nomeia o `ps -A -o pid=,ppid=,rss=,time=,comm=`: o enunciado de um check é do dono.
- **Fix round 8 (PR #107, o CI):** (1) o `scripts.test.ts` falhava sob carga porque o `worktree.create` dispara o `setup` **sem esperar**, e o gancho lê o `[scripts]` depois de a chamada voltar — com o arquivo que o teste já escreveu, ele roda o comando do teste uma segunda vez, e a linha mais nova (a do gancho) passa a ser a que o `status` devolve: o `outputAvailable` do teste do `forget` lia a execução errada, e o teste do `runningCount` (o que o ocioso do C30 e do C80 conta) via três scripts em vez de dois. O caller de teste ganhou `settled()`, que espera os `start` em voo, e o `setup()` do teste o chama antes de declarar; nenhuma asserção mudou. (2) O C60 provava `\d+ MB`, mais estreito que *"números"* — um agente num runner passa de 1 GB e o painel escreve `1,2 GB`; agora aceita `MB` ou `GB` nos dois grupos. O teste também ganhou prazo: a CPU espera a segunda amostra (5 s), ele gasta ~19 s parado, e na suíte inteira passou dos 30 s do padrão — o prazo total é de 120 s, e cada espera mantém o seu. (3) Sonar: `pack.ts` escolhe um caso de um `switch` de literais e perdeu o `--out` (ninguém o usava, e ele ia para um `rmSync` recursivo); a página `Lumem parado` leva o estilo e o script em arquivos e o CSP dispensa `unsafe-inline` (um caso novo no e2e do desktop prova que o script roda sob ele); o `pnpm/action-setup` do job do app está fixado por SHA (v6.0.10); os dois smokes saíram da cobertura e da análise, como a bancada da `036`. Nenhum enunciado de check nem linha de `Landing` mudou.
- **Fix round 9 (PR #107, o CI, segunda rodada):** (1) o teste de scrollback do `PtyManager` falhou no Ubuntu com o buffer parado em `line3`: o `sh` imprimia 200 linhas e **saía**, e no Linux o fechamento do slave descarta o que o master ainda não leu — a saída não atrasou, nunca chegou, e a espera pela saída da rodada anterior (que tratava o `line181`) não podia ajudar. Reproduzido num `node:22` em Docker com o node-pty puro (shell que sai: ~290 de 600 perdem a última linha de 1000; o mesmo com um `sleep` no fim: 0 de 600); no macOS não reproduz. O teste agora roda `…; sleep 30` (o `afterEach` mata), como o `websocket.test.ts` já fazia; nenhuma asserção mudou. O `PtyManager` não foi tocado. (2) O C60 fechava afirmando *"nenhuma sessão rodando"* num daemon dividido pela suíte inteira — nove turnos de specs anteriores ficam nele —, e a tentativa que falhava deixava a worktree `painel-barra` para o reteste. Agora a worktree tem um nome por tentativa, a sessão é fechada pelo daemon (`session.close`) e o painel tem de mostrar que **aquele** turno sumiu. A afirmação do C60 (*o painel abre numa aba e mostra os três blocos com números*) não mudou. Nenhum enunciado de check nem linha de `Landing` mudou.

### Varredura das condições compostas (rodada 6)

Cada condição composta de um módulo de decisão da 038, como **produto dos estados dos operandos**. "Mutantes" é o que o Stryker gerou sobre a condição (operador trocado, operando fixado em `true`/`false`, string apagada, guarda removida), mais o que rodei à mão onde a rodada nomeava (M14 e as duas metades).

| Condição | Estados | Coberto por | Mutantes | Resultado |
| --- | --- | --- | --- | --- |
| `system.update`: turno em voo **ou** script (AC 27) | (2,1) (2,0) (0,1) (0,0) | C30 (os três que recusam) e C27 (o que aceita) | `&&` (M14), só `liveTurns > 0`, só `runningScripts > 0` | os três morrem; antes só o (2,1) |
| `system.update`: supervisor, versão nova, instalando (AC 28–29) | cada um sozinho | C31, C32 (com o texto de cada recusa) | strings das recusas | morrem; `latest === null ||` é equivalente (`updateAvailable()` já é falso sem `latest`) |
| `setSettings`: campo presente × ausente | `{}`, um campo, os dois | C22 (`{}` devolve o que já estava) | `> 0`, `>= 0`, `true` no guarda de `SET` vazio | morrem; `input.x === undefined ? {} : …` (duas camadas) é equivalente |
| tique: supervisor **e** `idle` **e** sem instalação **e** versão **e** major **e** ocioso | cada um falhando sozinho | C80, C81, C82 | `!supervised \|\|` (M16), `isIdle` com `\|\|` (M13), major `0.x`/`≥1` (M15), `split(".")` virando `split("")` (`9 → 10`), `v` na frente | morrem; `.trim()` e `/v/` sem âncora são equivalentes |
| tique: o que decide relido no `start`; tique lento; falha | desligado na espera · turno na espera · lento · lança | C80 (três casos novos) | `checking \|\|` e `checking = true`, `latest === null \|\|` e `liveTurns > 0` do fim, o `catch` | morrem; o tique desligado não pergunta ao banco |
| `rateLimits`: conta **e** adaptador presentes; o mais recente | sem conta · sem adaptador · as duas · empate | C45 | `&&`, cada operando fixado, `?.` de `account` | morrem; o **empate** de `reportedAt` (`>=`) não é dito pelo AC 39 e fica como está |
| rótulo do `top` e dos turnos | agente no catálogo · fora dele · sem linha · script × terminal · worktree ou projeto que sumiu · agente que saiu no meio | C50, C87 | `find` por `pid`, `adapterId == null`, `scriptName === null`, `?.` de `where`, `?.` do projeto | morrem; `root.sessionId === null` é inalcançável (toda raiz tem sessão) |
| taxa de CPU: sem amostra **ou** intervalo ≤ 0 **ou** CPU menor | as quatro, mais CPU igual (0%) | C48 | `wall <= 0`, `< before`, `at - previous.at` com relógio longe do zero | morrem |
| amostrador: silêncio de 15 s, empate de tamanho, dois relógios | 14 999 ms · 15 000 ms · empate · duas primeiras perguntas | C49, C46 | `>=`, `now() + lastAskedAt`, `a.pid - b.pid`, `disarm = every` | morrem; **achou o defeito dos dois relógios** |
| tabela de processos: formato do `ps` e do `/proc` | `D-HH:MM:SS`, `H:MM:SS`, `M:SS`, `M:SS.cc`, lixo antes e depois, `comm` com espaço; `stat` sem `(`, sem `)`, `ppid` ou CPU que não são número, entrada que não é pid | C51 | regex (âncoras, `\d`, `?`), dias, `\|\|` de `open`/`close`, `isNaN` de cada um | morrem; `Number.isNaN` do tempo, `.trim()`/`\s` do `stat` e a âncora do `VmRSS` são equivalentes |
| `last-version`: ausente × vazio × igual × diferente; banco presente × ausente | sem arquivo com banco · vazio · igual · diferente · diferente sem banco | C34, C36 | `last !== null`, o `catch`, `text === ""` | morrem |
| `liveProcesses`: rodando **e** com pid | exited com pid · sem pid · rodando com pid | C47 | `state === "running" &&` | morre; em `hasPendingPermission` o mesmo operando é equivalente (`cancelPending` esvazia o mapa na saída) |
| `supervisorOf` e a recusa do `installService` | launchd · systemd · `win32` (sem supervisor) | C5 (o motivo diz qual) | `supervisor === null`, a ternária do motivo | morrem; `supervisorAnswers` para `null` é inalcançável |
| `installService`: passo do systemd que falha; detalhe do erro | daemon-reload · enable · restart · bootstrap; stderr · stdout · código | C2, C3 | `code !== 0` de cada um, o rótulo do passo, `trim`, a precedência | morrem |
| caminho estável do pnpm (AC 77) | loja com symlink · sem · npm · sufixo · outro pacote | C85 | regex sem `$`, `exists` | morrem; regex sem `^` é equivalente |
| escape do plist e da unit | `& < > " '` · `%` · `$` · aspas · barra · espaço | C1 | cada `replace` apagado | morrem |
| `lumem start`: ocupante × carregado × atual × `--open` | outro · Lumem fora do serviço · carregado e atual · carregado e velho · nada · carregado e atual sem daemon | C4 (seis casos novos) | `kind === "lumem"`, `isCurrent`, `command.open` nos três finais, `probe({})` | morrem |
| `lumem start`: flag × ambiente por variável; `~` | dez casos; `~` · `~/x` · `~outro` · absoluto | C4 | `\|\|`→`&&` de cada variável, a chave do ambiente, `raw === "~" \|\|` | morrem |
| `menubar open`: pacote **ou** `.app` ausente | seis casos | C89 | `\|\|`→`&&`, cada operando | morrem |
| `menubar install`: gerenciador, pacote no disco, `ditto` | sai ≠ 0 · lança · sem pacote · `ditto` falha com e sem `stderr` | C92, C63 | `exists(packageDir)`, `placed !== null`, `unzip.code === 0`, `\|\|` do motivo | morrem |
| `menubar install`/`upgrade` no Linux: os dois `.desktop` | lançador · autostart · caminho com `"` `$` `` ` `` `\` | C63, C93 | `extra = ""`, `Icon=`, o escape de `Exec=` | morrem |
| `menubar uninstall`: `.app` copiado × não | os dois | C66 | `exists(macApp)` | morre |
| `upgrade`: serviço carregado × não; reinício; espera | carregado · não · reinício falha · nunca responde · responde velho e depois livre | C39 | `occupant.kind !== "lumem"`, `probe({})` | morrem |
| `upgrade`: app junto | sem `desktop` · plataforma sem app · pacote ausente · presente | C65 | `layout === null \|\|` | morre |
| `tray-state`: `reachable`, `attention` **ou** protocolo, versão nova | as cinco linhas | C69 | todos | 100%: nenhum sobrevivente |
| `menu`: estado × compatível × atenção × atualização | os seis itens, parado, incompatível | C71, C75 | todos | só o `"?"` de versão nula, inalcançável a partir do `poll` |
| `windows`: mesma origem **ou** página local; web link; `window.open` | mesma origem · página local · outra origem · `http:` · `https:` · `file:` · `ftp:` · origem que não é URL | C76, C72 | `sameOrigin`, `isWebLink`, `daemonOrigin !== null &&`, `guard` | morrem; `catch` de `originOf`/`isWebLink` e `showingStopped` inicial são equivalentes |
| `windows`: clique logo depois do blur; painel escondido; minimizada | 299 ms · 300 ms · blur com painel escondido · minimizada · não | C70, C72 | `<`→`<=`, `!isVisible()`, `isMinimized()` | morrem |
| `poll`: `ok`, `health.ok`, `version`, `protocolVersion`, relógio | cada metade falhando sozinha; sem protocolo; `start` duas vezes; `start(false)` | C68, C69 | `!response.ok`, cada operando, `typeof protocolVersion`, `timer !== undefined`, `immediate` | morrem; `readData` (`?.`, `&&`, `catch`) é equivalente (o `?.`/`=== true` depois absorve) |
| `main`: macOS × Linux, dedupe, `isUp`, segunda rodada no boot | click · menu · mesmo snapshot · daemon parado · boot | C67–C71, C74 | `!onLinux`, `key === shown`, `isUp`, `poller.start(false)`, `redraw` | morrem; `poller?.`, `app.dock?.`, `shown = ""` e `Iniciar` de `url === undefined` são equivalentes |
| `commands`: `PATH` gravado × ausente | os dois | C73 | `config.path === undefined ? {} : …` | morre |
| `packaging`: manifesto do pacote | quatro plataformas | C78 | `license`, `repository`, `homepage`, `publishConfig`, `description` | morrem |

**Stryker, antes e depois** (`stryker run` com `coverageAnalysis: perTest`, `vitest.dir` de cada pacote): servidor — 867 mutantes, 718 mortos e 3 por tempo, **100 sobreviventes** e 45 sem cobertura; depois, 868, 788 e 3, **41** e 35. CLI — 4 arquivos, 672 mortos, 131 sobreviventes e 106 sem cobertura; depois, 813, **23** e 73. Desktop — 402, 77 e 5; depois, 459, **23** e 2.

**O que sobrou, e por quê não se persegue.** Servidor, 76: 10 são texto de `log` (`log?.warn`/`info`); 35 são o adaptador do processo e do disco de verdade e valores de reserva que o tipo já garante (`execFile`, `spawn`, `readFile`, `timer.unref`, `?? ""`, o `{ tokens: 0 … }` de um agregado que sempre devolve linha) — o `measure:resources` e o `smoke:service` os exercitam; 7 são a alça do banco da cópia (`readonly`, `close`, `force`), que nenhum teste observa; 24 são equivalentes (as 19 linhas acima, mais o `.trim()`, o `/v/` e o `?? ""` do major, e dois valores de reserva que a próxima linha sobrescreve). CLI, 96: 69 são o adaptador de sistema (`nodeServiceHost`, `spawnDetached`, `runInstall`, `untilInterrupted`), 16 são texto de saída informativa ou valor de reserva e 11 são equivalentes (`DAEMON_ENTRY`, `?? probePort`, `running = "?"`, o `join` do plist, os `?? ""` do regex). Desktop, 25: equivalentes ou de configuração (`setName`, o título da dica que o `redraw` logo sobrescreve, `?.` de variável ainda não atribuída, `showingStopped` inicial que o `load` reescreve, o `closed` que o `isDestroyed` já cobre).
- **Texto do C51 (2026-09-30):** acompanha as duas passadas da leitura (a de pais, da tabela inteira; a de memória e CPU, só da árvore) que o conserto do C61 introduziu. O que o C51 afirma não mudou — interpretar as duas saídas a partir de amostras gravadas —, só o comando que ele nomeia.
- **Intervalo do C61 (2026-09-30, decisão do dono):** a amostragem passou de 3 s para 5 s — a discovery admitia de 3 a 5 s. Com a medição honesta, 3 s dava 0,69–1,09% de um núcleo com ~800 processos, colado no limite de 1%. O limite e o resto do claim não mudaram.
- **Regra de parada (2026-09-30, decisão do dono):** a rodada 6 da verificação é a última. Bloqueia só **defeito de comportamento** — um `Proof:` que falha, ou código que faz a coisa errada num caso que um AC define. **Não bloqueia** teste fraco sobre código que se comporta certo (mutante sobrevivente, célula de estado sem prova): isso vira lista no relatório e entrada no backlog, e a feature fecha com a decisão registrada.
