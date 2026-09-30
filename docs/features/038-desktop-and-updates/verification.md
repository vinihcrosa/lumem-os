# O Lumem fica de pé sozinho, se atualiza, e mora na barra — verification

## Rodada 1 (FAIL, em `2ab18e3b`)

A rodada 1 leu os checks C1–C85 em `b226b4b..2ab18e3b` e deu FAIL. As lacunas, pela ordem do relatório
dela, e como cada uma está agora em `2630a3ee`:

1. A fiação `paused: () => update.installer.installing()` da esteira do daemon não tinha prova (C83).
   Trocá-la por `() => false` deixava 276 de 276 testes verdes: o mutante F1 sobreviveu. **Fechada:** o
   M1 abaixo morre três vezes em três.
2. A casa decimal do `cpuPercent` só era provada com valores inteiros, e só abaixo do router (C46).
   `Math.round(value)` sobrevivia: o mutante F2. **Fechada:** o M2 derruba as duas provas.
3. A metade de Linux do C78 não rodou: nem o `.AppImage`, nem o `.deb`, nem o passo de Linux do
   `smoke:install`. **Continua aberta.**
4. A Coverage tinha membros sem prova:
   - três dos quatro blocos do `/menubar` que falham sozinhos. **Fechado** pelo C86, e o M3 morre;
   - o `systemd --user` de verdade, a metade de Linux do AC 69 e o `.AppImage`/`.deb`. **Continuam
     abertos.**
5. A linha *o serviço de verdade* do `Test policy` só foi cumprida no launchd. **Continua aberta** no
   systemd.
6. Havia comportamento construído sem check que o nomeasse. **Fechado:** C87 (`system.live`), C88
   (`workspace.recent`), C89 (`menubar open`), C90 (a porta 9), C91 (o painel recarrega) e C92 (o
   código do gerenciador). O comentário de `process-table.test.ts` agora é verdade: a amostra de Linux
   é gravada.

## Rodada 2

**Verdict**: FAIL
**Profile**: standard
**Diff range**: b226b4b..2630a3ee (a correção é `2ab18e3b..2630a3ee`: `7e0a012a`, `8bb64d38`, `579cc03d`, `9c0518ee`, `23f99a4c`, `4a14f1a5`, `2630a3ee`)
**Round**: 2 - full
**Verifier**: independent sub-agent (author != verifier)

A rodada foi **inteira**, e não só sobre o diff da correção. Todos os 92 checks (C1–C92) foram lidos no
`HEAD` `2630a3ee`, e todas as provas rodaram de novo. Cada citação vem do `HEAD`, e cada seção diz
`verified at 2630a3ee`. Nada foi herdado da rodada 1 sem conferir. Nos arquivos de teste que a correção
não tocou, as linhas são as mesmas de `2ab18e3b`. Três citações da rodada 1 estavam erradas
(`usage.test.ts:210` e `:218`, e as linhas do C50) e foram corrigidas abaixo.

A máquina é um macOS arm64 (Darwin 27), com o Node do `.nvmrc` (`v22.17.1`) e o launchd de verdade.
**Não há máquina Linux.**

**O veredito é FAIL, e só pelo que exige Linux.** As duas lacunas de código da rodada 1 fecharam. As sete
falhas injetadas morreram. Os checks C86–C92 têm prova, e ela morre sob mutação. O que sobra são três
membros sem prova, todos de Linux:

- a metade de Linux do C78;
- o `systemd --user` de verdade, que é também a linha de `Test policy` não cumprida;
- o `.AppImage` e o `.deb`.

Nenhum construtor fecha isso desta máquina. Sem Linux, o veredito continua FAIL em qualquer rodada, e
por isso estas lacunas vão para o dono, e não para outra rodada de construção (seção *Quem fecha cada
lacuna*).

## Binding sources

Verified at 2630a3ee. O passo 1 não se aplica: o perfil é `standard`, e ele só roda sob `ui`. O plano
também não marca nenhuma fonte como *binding*: os três ADRs de 2026-09-29 e a discovery estão em
`Sources`. Os ADRs `2026-09-29-2002`, `-2003` e `-2004` foram lidos para julgar os checks e os riscos, e
nenhum check os contradiz.

## Checks

Verified at 2630a3ee. As provas rodaram em uma invocação por pacote, com `--reporter=verbose`, sobre os
arquivos inteiros que os checks nomeiam:

- `packages/cli`: `service`, `run`, `args`, `port`, `upgrade` e `menubar`. **104 passed**;
- `packages/server`: 16 arquivos. **286 passed**;
- `packages/web`: 5 arquivos. **44 passed**;
- `packages/desktop`: 6 arquivos. **45 passed**;
- `packages/shared`: `desktop.test.ts`. **5 passed**;
- `scripts`: `smoke-install`, `release-workflow`, `set-version` e `package-boundaries`. **19 passed**.

Os 99 nomes de teste que os `-t` do `checks.md` pedem foram procurados um a um na saída (`grep -F`).
Todos aparecem com `✓` e nenhum com `×`. O `fails alone when` do C86 casa os três casos do `it.each`.
Nenhum filtro caiu no vazio. As provas que não são vitest rodaram como estão escritas (seção *Gate*).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | plist do launchd com PATH, supervisor, KeepAlive e logs | service.test ✓ | `packages/cli/src/service.test.ts:141` - `expect(parsePlist(files.get(PLIST)!)).toEqual({ Label: "tech.cazimi.lumem", … })`; a ordem em `:160` | PASS |
| C2 | unit do systemd; `daemon-reload` e `enable --now`, nessa ordem | service.test ✓ | `packages/cli/src/service.test.ts:215` - `toContain("ExecStart=/opt/node/bin/node … run\n")`; `:223` - `expect(systemctl.slice(-3)).toEqual([…])` | PASS |
| C3 | reescreve o arquivo existente antes de carregar | service.test ✓ | `packages/cli/src/service.test.ts:248` - `expect(rewritten.ProgramArguments).toEqual(["/novo/bin/node", "/novo/lib/lumem.mjs", "run"])` | PASS |
| C4 | sai 0 no health; sai 1 com as últimas 20 linhas em 15 s | run.test ✓; `smoke:service --only start-waits-for-health` exit 0 | `packages/cli/src/run.test.ts:329` - `toBe(1)`; `:332-334` - contém a `linha 30` e a `linha 11`, e não a `linha 10`; `:335` `now() >= 15_000`. `scripts/smoke-service.ts:142` (saída: "saiu 0 e o health já respondia (v0.6.1)") | PASS |
| C5 | sem supervisor: sai 1, não escreve nada, cita `lumem run` | service.test ✓ | `packages/cli/src/service.test.ts:359` - `toEqual({ ok: false, reason: expect.stringContaining("lumem run") })`; `:361` - `files.size` 0 | PASS |
| C6 | outro Lumem fora do serviço: sai 1 | run.test ✓ | `packages/cli/src/run.test.ts:353` - `toContain("fora do serviço")` | PASS |
| C7 | sem verbo é `start`; `run` com as quatro opções | args.test ✓ | `packages/cli/src/args.test.ts:24` - `expect(parseCommand([])).toEqual(start)`; `:30` - `toEqual({ kind: "run", port: 5_000, host: "0.0.0.0", stateDir: "/tmp/x", open: true })` | PASS |
| C8 | `lumem run` é o primeiro plano de antes | run.test ✓ | `packages/cli/src/run.test.ts:292` - `toContain("já tem um Lumem em …")`; `:296-297` - `toBe(1)` e `third` não chamado | PASS |
| C9 | stop: `bootout` e apaga o plist, ou `disable --now`; 0 ou 1 em 10 s | service.test ✓; `smoke:service --only stop-leaves-nothing` exit 0 | `packages/cli/src/service.test.ts:378` - `toContain("launchctl bootout gui/501/tech.cazimi.lumem")`; `:412` - `reason` com `"10 s"`; `scripts/smoke-service.ts:156` (saída: "parou, descarregou e não deixou item de login") | PASS |
| C10 | status: uma linha, 0 ou 3 | run.test ✓ | `packages/cli/src/run.test.ts:473` - `toEqual(["rodando · v0.7.0 · http://127.0.0.1:4317 · supervisionado"])`; `:478` `em primeiro plano`; `parado` e 3 logo abaixo | PASS |
| C11 | logs: 200 de 250, e `-f` segue | run.test ✓ | `packages/cli/src/run.test.ts:510` - `expect(out[0]).toBe("linha 51")`; `:530` - `toEqual(["linha 251", "linha 252"])` | PASS |
| C12 | logs sem arquivo: sai 1 com o caminho | run.test ✓ | `packages/cli/src/run.test.ts:536` - `toContain(join(stateDir, "daemon.log"))` | PASS |
| C13 | `supervised` vem de `LUMEM_SUPERVISOR` | health.test ✓ | `packages/server/src/routers/health.test.ts:27-37` - `true` para `launchd` e `systemd`; `false` sem ela, com `supervisord` e com vazio | PASS |
| C14 | `protocolVersion: 1`; o `probePort` segue lendo | health.test ✓; port.test ✓ | `packages/server/src/routers/health.test.ts:41` - `toEqual({ ok: true, version, supervised: false, protocolVersion: 1 })`; `packages/cli/src/port.test.ts:40` | PASS |
| C15 | sobrevive ao chamador e responde `supervised: true` | `smoke:service --only survives-the-caller` exit 0 | `scripts/smoke-service.ts:185` - `assert(health.supervised === true, …)` (saída: "o chamador morreu, e o daemon seguiu respondendo supervised: true") | PASS |
| C16 | o smoke sobe com `lumem run` | smoke-install.test ✓ | `scripts/smoke-install.test.ts:12` - `expect(args).toEqual(["run", "--port", "4397"])` | PASS |
| C17 | registry no boot e a cada 6 h, só com `accept` | check.test ✓ | `packages/server/src/update/check.test.ts:71-72` - `toBe(REGISTRY)` e `headers` `{ accept: "application/json" }`; `:78` - duas chamadas | PASS |
| C18 | `updateStatus`: `current`, nulos antes da primeira verificação, e os três `updateAvailable` | system.test ✓ | `packages/server/src/routers/system.test.ts:63` - `toEqual({ current: LUMEM_VERSION, latest: null, checkedAt: null, … })`; `:78`, `:85`, `:91` | PASS |
| C19 | timeout, 503 e corpo sem `version` mantêm o anterior, com um `warn` cada | check.test ✓ | `packages/server/src/update/check.test.ts:110` - `toEqual(good)`; `:122` `sem versão`; `:133` - `toHaveBeenCalledWith(10_000)` | PASS |
| C20 | verificação desligada: nenhuma requisição, `checkEnabled: false` | check.test ✓ | `packages/server/src/update/check.test.ts:193` e `:199` - `checkEnabled()` false; `:201` - `asked` não chamado | PASS |
| C21 | `updateCheckForcedOff` e o interruptor desabilitado com o texto | system.test ✓; UpdateSettings.test ✓ | `packages/server/src/routers/system.test.ts:115`; `packages/web/src/features/settings/UpdateSettings.test.tsx:41` `toBeDisabled()` e `:43` `desligado por LUMEM_NO_UPDATE_CHECK` | PASS |
| C22 | `setSettings` grava a única linha | system.test ✓ | `packages/server/src/routers/system.test.ts:138` - `toEqual([{ id: 1, updateCheck: 1, autoUpdate: "off" }])` | PASS |
| C23 | `autoUpdate: "always"`: `BAD_REQUEST`, linha intacta | system.test ✓ | `packages/server/src/routers/system.test.ts:154` - `rejects.toMatchObject({ code: "BAD_REQUEST" })`; `:157` | PASS |
| C24 | migração: uma linha com os padrões; o CHECK recusa | daemon-settings.test ✓ | `packages/server/src/db/daemon-settings.test.ts:52` - `toEqual([{ id: 1, updateCheck: 1, autoUpdate: "off" }])`; `:56` `CHECK constraint failed` | PASS |
| C25 | topbar `v0.6.1 → v0.7.0` e o botão; nada sem versão nova | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:39` - `findByText("v0.6.1 → v0.7.0")`; `:48` - `toBeEmptyDOMElement()` | PASS |
| C26 | sem supervisor, `lumem upgrade` no lugar do botão | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:59` - `getByText("lumem upgrade")` | PASS |
| C27 | update fecha a porta, instala com o dono, `started: true` | system.test ✓ | `packages/server/src/routers/system.test.ts:169-176` - `toEqual({ started: true })`, o instalador com `…@0.7.0`, e a porta antes dele | PASS |
| C28 | instalação 0: sai por `createShutdownHandler` com 0 | install.test ✓ | `packages/server/src/update/install.test.ts:44` - `toHaveBeenCalledWith(0)`; `:53` - `close` antes de `exit` | PASS |
| C29 | instalação 1 ou `ENOENT`: reabre a porta, não sai, e `lastError` | install.test ✓ | `packages/server/src/update/install.test.ts:78` e `:93` - `lastError()` com `"1"` e com `"spawn npm ENOENT"`; `:81` e `:95` - `exit` não chamado. O `updateStatus.lastError` do claim é afirmado pelo router em `packages/server/src/routers/system.test.ts:239`, num teste que nenhum `Proof:` nomeia. Ele rodou: ✓ `reports a failed install in updateStatus` | PASS |
| C30 | 2 turnos e 1 script: `CONFLICT` com os números | system.test ✓ | `packages/server/src/routers/system.test.ts:189-195` - `code: "CONFLICT"`, `message: /2 turnos.*1 script/`, e o instalador não chamado | PASS |
| C31 | segundo update: `CONFLICT` | system.test ✓ | `packages/server/src/routers/system.test.ts:205-207` | PASS |
| C32 | sem supervisor ou sem versão nova: `PRECONDITION_FAILED` | system.test ✓ | `packages/server/src/routers/system.test.ts:216`, `:224` e `:226` | PASS |
| C33 | prompt recusado durante a instalação, e nada chega ao agente | AcpManager.test ✓ | `packages/server/src/acp/AcpManager.test.ts:504` - `rejects.toThrow(/…se atualizando/)`; `:510` - `promptBlocks` `[]` | PASS |
| C34 | copia antes de migrar e grava a versão depois | backup.test ✓ | `packages/server/src/db/backup.test.ts:95-96` e `:103` | PASS |
| C35 | mantém as 3 mais novas | backup.test ✓ | `packages/server/src/db/backup.test.ts:149` | PASS |
| C36 | sem `last-version` não copia; migração que falha não grava | backup.test ✓ | `packages/server/src/db/backup.test.ts:184`, `:196` e `:206` | PASS |
| C37 | recarrega uma vez e diz `Lumem atualizado para v0.7.0` | useVersionReload.test ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:26` e `:33` - `reload` 1 vez, `updatedTo` `"0.7.0"`. O texto está em `e2e/update.spec.ts:64`, que rodou (C41) | PASS |
| C38 | não recarrega duas vezes na mesma aba | useVersionReload.test ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:54` - `toHaveBeenCalledTimes(1)` | PASS |
| C39 | upgrade reinicia o serviço e imprime a versão de depois | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:165` `kickstart -k`; `:168` `v0.2.0`; `:177` `systemctl --user restart` | PASS |
| C40 | o daemon real volta na versão nova sem `lumem start` | `smoke:service --only update-relaunches` exit 0 | `scripts/smoke-service.ts:328` (saída: "o supervisor subiu o daemon de novo, na v0.99.0, sem ninguém rodar `lumem start`") | PASS |
| C41 | a página recarregada carrega os assets novos, e não fica em branco | `playwright test e2e/update.spec.ts` ✓ (20,9 s) | `e2e/update.spec.ts:69` - `#root > *` > 0; `:72` - os assets novos | PASS |
| C42 | `usage.total` soma todos os workspaces; `cost` nulo quando todos são nulos | usage.test ✓ | `packages/server/src/routers/usage.test.ts:157` - `toEqual({ tokens: 7_500, cost: 1.75, currency: "USD", turns: 4 })`. A metade do nulo está em `:172`, num teste que nenhum `Proof:` nomeia. Ele rodou: ✓ `total answers null cost only…` | PASS |
| C43 | uma instrução SQL para 1, 3 e 10 workspaces | usage.test ✓ | `packages/server/src/routers/usage.test.ts:214` - `expect(counts).toEqual([1, 1, 1])` | PASS |
| C44 | `period` desconhecido: `BAD_REQUEST` | usage.test ✓ | `packages/server/src/routers/usage.test.ts:220-223` - `rejects.toMatchObject({ code: "BAD_REQUEST" })` | PASS |
| C45 | o relato mais recente, sem a conta que não relatou | agentAccount.test ✓ | `packages/server/src/routers/agentAccount.test.ts:420` - `resolves.toEqual([{ accountId: work.id, … utilization: 0.4 … }])` | PASS |
| C46 | grupos com `cpuPercent` em uma casa decimal; `top` de 5 | sample.test ✓; system.test `resources rounds cpuPercent…` ✓ | `packages/server/src/resources/sample.test.ts:156` - `toEqual({ daemon: { cpuPercent: 1.6 … }, agents: { cpuPercent: 1.3 … }, terminals: { cpuPercent: 1.8 … } })`; `:161` - `top` com `0.5`, `1.6`, `0.4`, `0.4`, `0.2`; `:127` - o top 5 por `rssBytes`. Pelo router: `packages/server/src/routers/system.test.ts:295` - `toBe(1.6)`, e `:296` | PASS |
| C47 | atribui ao ancestral rastreado mais próximo | attribute.test ✓ | `packages/server/src/resources/attribute.test.ts:35` `"agents"`, `:39` `"terminals"`, `:41` `"daemon"` | PASS |
| C48 | 1,0 s → 1,5 s em 5 s dá `10.0`; na primeira amostra, `null` | sample.test ✓ | `packages/server/src/resources/sample.test.ts:177` - `cpuPercent: null`; `:182` - `cpuPercent: 10` | PASS |
| C49 | 15 s sem pergunta: para de ler; a próxima consulta volta | sample.test ✓ | `packages/server/src/resources/sample.test.ts:217` - `toBe(afterQuiet)`; `:222` `afterQuiet + 1` | PASS |
| C50 | rótulo por sessão e checkout | sample.test ✓ | `packages/server/src/resources/sample.test.ts:261` - `toBe("Claude · lumem-os/bandung")`; `:262` `Terminal · …`; `:266` `"node"` | PASS |
| C51 | `ps` no darwin e `/proc` no Linux, de amostras gravadas | process-table.test ✓ | `packages/server/src/resources/process-table.test.ts:152` e `:185` - `toEqual([…])` das duas. A amostra de Linux agora é gravada (`:8-18`). Conferido: os três `stat` têm 52 campos, como o `/proc/self/stat` de um `node:22-slim` neste kernel (`6.10.14-linuxkit`), e o `status` tem os campos novos (`Kthread`, `untag_mask`) | PASS |
| C52 | `system.status`: seis campos, e `attention` com permissão pendente | system.test ✓ | `packages/server/src/routers/system.test.ts:327` - `resolves.toEqual({ version, protocolVersion: 1, supervised: true, … })`; `:345` - `{ liveTurns: 1, attention: true }` | PASS |
| C53 | manchete `87%`, o `kind` e o tempo até o reset | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:83-85` | PASS |
| C54 | sem cota, o custo do dia; custo nulo, os tokens | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:98` `US$ 1,75` e `:100` `{ period: "1d" }`; `:108` `48,2k tokens` | PASS |
| C55 | ordem dos blocos, linha de versão e ações | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:135` - as regiões na ordem; `:162` `atualização disponível: v0.7.0`; `:167` os botões. O `em dia · verificado …` está em `:186`, num teste que nenhum `Proof:` nomeia. Ele rodou: ✓ | PASS |
| C56 | sem sessão, `nenhuma sessão rodando` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:196` | PASS |
| C57 | recursos falhando: só esse bloco diz | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:211` e `:217` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C58 | `2 terminais abertos fecham ao atualizar` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:276` | PASS |
| C59 | `routeOf("/menubar")` e `GET /menubar` com 200 | route.test ✓; static.test ✓ | `packages/web/src/lib/route.test.ts:24`; `packages/server/src/web/static.test.ts:91` e `:93` | PASS |
| C60 | `/menubar` numa aba mostra os três blocos | `playwright test e2e/menubar.spec.ts` ✓ (16,3 s) | `e2e/menubar.spec.ts:73` - número na manchete; `:89` - `/\d+,\d%/` no Daemon | PASS |
| C61 | medir a cada 3 s com 10 sessões custa menos de 1% | `measure:resources --only ten-sessions` duas vezes, exit 0 | `packages/server/src/testing/measure-resources.ts:92`. Saídas: **0,44%** e **0,43%** (637 e 640 processos). Só no macOS | PASS |
| C62 | `menubar install` nas quatro plataformas, e o `lumem-desktop.json` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:117` - `toContain("install npm install --global ${desktopPackageName(key)}@${VERSION}")`; `:120` - o JSON inteiro | PASS |
| C63 | `~/Applications/Lumem.app`; os dois `.desktop` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:171-172` - `rm -rf` e `ditto`; `:190-192` - `Exec=… --panel`, e o autostart sem ele. Depende da Q4 no Linux (*O que não rodou*) | PASS |
| C64 | `win32-x64` e `linux-ia32`: sai 1 e lista as quatro | menubar.test ✓ | `packages/cli/src/menubar.test.ts:213` `toBe(1)`; `:218` as quatro no erro | PASS |
| C65 | upgrade leva o pacote do app e recopia no macOS | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:245-252` | PASS |
| C66 | uninstall remove o pacote, o app ou os `.desktop`, e o item de login | menubar.test ✓ | `packages/cli/src/menubar.test.ts:268` - `expect(app).toBeGreaterThan(login)`; `:277-280` no Linux | PASS |
| C67 | `openAtLogin: true` e um só ícone | main.test ✓ | `packages/desktop/src/main.test.ts:220-221` | PASS |
| C68 | health e status a cada 10 s | poll.test ✓ | `packages/desktop/src/poll.test.ts:55` - `toEqual(["/trpc/health", "/trpc/system.status"])`, e a contagem cresce a cada 10 s logo abaixo | PASS |
| C69 | a tabela de 5 entradas do ícone | tray-state.test ✓ | `packages/desktop/src/tray-state.test.ts:30-44` - `stopped`, `attention` três vezes, `update` e `running` | PASS |
| C70 | clique: janela de 360×520 sem moldura em `/menubar`, que esconde de novo e no blur | windows.test ✓ | `packages/desktop/src/windows.test.ts:142` - `toMatchObject({ width: 360, height: 520, frame: false })`; `:163` - `visible` false. O clique do sistema operacional não é exercitado | PASS |
| C71 | o menu na ordem, e `Atualizar` só com versão nova | menu.test ✓ | `packages/desktop/src/menu.test.ts:38-51` | PASS |
| C72 | uma janela principal, focada na segunda vez | windows.test ✓ | `packages/desktop/src/windows.test.ts:232` - `FakeWindow.all` com 1 | PASS |
| C73 | Iniciar e Parar com os caminhos gravados | commands.test ✓ | `packages/desktop/src/commands.test.ts:28` | PASS |
| C74 | daemon parado: a página local | windows.test ✓ | `packages/desktop/src/windows.test.ts:254` - `toEqual([`file:${STOPPED_PAGE}`])` | PASS |
| C75 | protocolo diferente: a linha de incompatível | menu.test ✓ | `packages/desktop/src/menu.test.ts:94` | PASS |
| C76 | toda janela travada na origem | windows.test ✓ | `packages/desktop/src/windows.test.ts:295` - `webPreferences` com `sandbox: true`; `:304-309` - `navigate` cancelado para fora; `:317` - `external` | PASS |
| C77 | Electron de verdade: o ícone, e o painel em `/menubar` | `playwright test e2e/app.spec.ts -g …` ✓ (974 ms) | `packages/desktop/e2e/app.spec.ts:96` - `toHaveURL(`${DAEMON}/menubar`)`; `:105` - `[360, 520]`. O clique vem de dentro do processo | PASS |
| C78 | o release publica os 4 pacotes e anexa zip, AppImage e deb; o smoke roda no macOS e no Linux | release-workflow.test ✓; `smoke:install --only desktop` exit 0, **só no macOS arm64** | `scripts/release-workflow.test.ts:53`, `:72` e `:83` - a matriz, o `--provenance` e `desktop/assets/*.{zip,AppImage,deb}`; `scripts/smoke-install.ts:257` - `codesign --verify` (saídas: "ad-hoc, e confere", "nenhum com.apple.quarantine", tarball de 126,1 MB) | FAIL - só a metade de macOS está provada. O passo de Linux (`scripts/smoke-install.ts:269`, o app sob `xvfb`) não rodou em máquina nenhuma, e nenhum `.AppImage` ou `.deb` foi produzido. Precisa de Linux |
| C79 | `version:set` escreve o manifesto do app; o desktop só importa do shared | set-version.test ✓; package-boundaries.test ✓ | `scripts/set-version.test.ts:46`; `scripts/package-boundaries.test.ts:152` - `toBe("")` | PASS |
| C80 | o tique ocioso só instala com `idle` | auto.test ✓ | `packages/server/src/update/auto.test.ts:109` - `off`: não instala; `:120` - `idle`: instala uma vez | PASS |
| C81 | esperando, aceita prompt e a esteira anda; instala depois do `turn_end` | auto.test ✓ | `packages/server/src/update/auto.test.ts:192`, `:196` e `:201`; `:215` | PASS |
| C82 | não cruza major depois da 1.0 | auto.test ✓ | `packages/server/src/update/auto.test.ts:228` - `across.install` não chamado; `:240` - o minor instala | PASS |
| C83 | durante a instalação automática a esteira não despacha | auto.test ✓; bootstrap.test `does not dispatch from the daemon's own conveyor…` ✓ | na esteira que o daemon monta: `packages/server/src/bootstrap.test.ts:308` - `toEqual([workspace.id])` antes; `:312` - a instalação começou; `:318` - `expect(dispatched).toEqual([workspace.id])` depois de três disparos. Na do teste: `packages/server/src/update/auto.test.ts:290` | PASS |
| C84 | `Atualizar sozinho quando ocioso`, desabilitado sem supervisor | UpdateSettings.test ✓ | `packages/web/src/features/settings/UpdateSettings.test.tsx:85` `toBeDisabled()` e `:87` o texto; `:104` - `{ autoUpdate: "idle" }` | PASS |
| C85 | o caminho estável sob um store versionado | service.test ✓ | `packages/cli/src/service.test.ts:175` - `programArguments(...)` com o symlink, sem ele e sob npm | PASS |
| C86 | `Consumo`, `Turnos em voo` e `Versão` falham cada um sozinho | MenubarScreen.test `fails alone when` ✓ ×3 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:262` - `findByText(block.says)` no bloco que falhou; `:266` - `queryByText(/não consegui ler/)` ausente nos outros; `:268` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C87 | `system.live`: só os turnos em voo, com `label` e `startedAt` ISO, e `openTerminals` | system.test ✓ | `packages/server/src/routers/system.test.ts:404` - a sessão ociosa dá `{ turns: [], openTerminals: 0 }`; `:414` - `toEqual([{ sessionId: agent.id, label: "Claude · lumem-os/bandung", … }])`; `:417` ISO; `:419` - `openTerminals` 2 | PASS |
| C88 | `workspace.recent`: os três mais novos em ordem; a worktree conta; vazio sem sessão | workspace.test ✓ ×2 | `packages/server/src/routers/workspace.test.ts:396` - `toEqual([{ id: recente.id, … }, { id: antigo.id, … }, { id: meio.id, … }])`; `:407` - `resolves.toEqual([])` | PASS |
| C89 | `menubar open` roda o app com `--panel`; sem app, sai 1 | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:238` - `toEqual(["/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --panel"])`; `:242` no Linux; `:248` `toBe(1)`, `:250` `lumem menubar install` e `:251` nada rodou | PASS |
| C90 | `lumem-desktop.json` na pasta de dados, reescrito a cada install, e o app o lê de lá | menubar.test ✓ ×2; desktop.test ✓; main.test ✓ ×2 | `packages/cli/src/menubar.test.ts:120` - o JSON em `/Users/ana/Library/Application Support/Lumem` e em `/Users/ana/.config/Lumem`; `:148` - o arquivo velho foi reescrito; `packages/shared/src/desktop.test.ts:28-36`; `packages/desktop/src/main.test.ts:293` - `expect(read, platform).toEqual([expected])` com os caminhos literais; `:323` e `:325` - sem config, diz `lumem menubar install` e sai | PASS |
| C91 | o painel recarrega uma vez quando o daemon muda de versão; com a versão igual, não | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:363` e `:369` - `reload` uma vez só; `:381` - `not.toHaveBeenCalled()` | PASS |
| C92 | install com o gerenciador falhando devolve o código, não grava e não abre o app | menubar.test ✓ | `packages/cli/src/menubar.test.ts:225` - `toBe(13)`; `:228` - nenhum `write`; `:229` - `launched` `[]` | PASS |

## Coverage

Verified at 2630a3ee. Cada conjunto foi recalculado a partir da própria autoridade, e não relido da
tabela do `checks.md`:

- as rotas e as saídas do CLI vêm do `## Surface` do `prd.md`;
- as portas vêm do `## Landing`, com nove linhas;
- os blocos do painel vêm do AC 50;
- o supervisor de verdade vem da linha *o serviço de verdade* do `Test policy`;
- as plataformas e os artefatos vêm dos AC 68 e 69.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas do `Surface` e seus status (11 rotas) | `prd.md` `## Surface` | `health` 200 C13 · `updateStatus` 200 C18 · `update` 200 C27, 409 C30/C31, 412 C32 · `status` 200 C52 · `resources` 200 C46 (router, `system.test.ts:295`) · `settings`/`setSettings` 200 C22, 400 C23 · `usage.total` 200 C42, 400 C44 · `rateLimits` 200 C45 · `system.live` 200 C87 · `workspace.recent` 200 C88 · `GET /menubar` 200 C59 | - |
| verbos do CLI (10) | `prd.md` `Surface`, tabela do CLI | `start` C4 · sem verbo C7 · `run` C8 · `stop` C9 · `status` C10 · `logs` C11 · `upgrade` C39 · `menubar install` C62 · `menubar open` C89 · `menubar uninstall` C66 | - |
| saídas do CLI que não são 0 | `prd.md` `Surface`, tabela do CLI | `start` 1: C5, C6 e C4 · `run` 1: C8 · `stop` 1: C9 · `status` 3: C10 · `logs` 1: C12 · `menubar install` 1 fora das quatro: C64 · `menubar install` com o código do gerenciador: C92 · `menubar open` 1 sem app: C89. Três membros têm asserção só em testes que nenhum `Proof:` nomeia, e todos rodaram: `upgrade` 1 (`upgrade.test.ts:87`, e `:206` com o restart recusado), `upgrade` com o código do gerenciador (`:94` e `:195`), e `uninstall` com o código do gerenciador (`menubar.test.ts:294`). `open` e `uninstall` fora das quatro não têm caso próprio. O ramo é um só e vem antes do despacho (`packages/cli/src/menubar.ts:111`), e o AC 55 só fala do `install` | - |
| portas de mão única (9) | `prd.md` `## Landing` | 1 C7 · 2 C1 · 3 C24 · 4 C14 · 5 C62 · 6 C79 · 7 C34 · 8 C27 · 9 C90 | - |
| supervisores, escritor de serviço (2) | `prd.md` porta 2 | launchd C1 · systemd C2 | - |
| supervisor de verdade (2) | `checks.md` `Test policy`, linha *o serviço de verdade* | launchd: os quatro passos do `pnpm smoke:service`, exit 0 aqui (C4, C9, C15 e C40) · systemd `--user`: nenhuma máquina Linux. O apoio num contêiner (*O que não rodou*) não é a prova que a linha pede | systemd --user |
| layout do gerenciador global (3) | `prd.md` AC 77 | npm, pnpm com o symlink, pnpm sem ele: C85 | - |
| plataformas do app no install (4) | `prd.md` porta 5 | as quatro C62, num laço sobre `DESKTOP_PLATFORMS` | - |
| as duas metades do AC 69 (2) | `prd.md` AC 69 | macOS: `pnpm smoke:install --only desktop`, exit 0 aqui (C78) · Linux: não rodou | metade de Linux |
| artefatos do release (3) | `prd.md` AC 68 | `.zip`: produzido aqui pelo `smoke:install`, e afirmado no `release.yml` · `.AppImage` e `.deb`: só o texto do workflow é afirmado (`scripts/release-workflow.test.ts:83`), e nenhuma máquina os produziu | .AppImage, .deb |
| estados do ícone (4) e linhas da tabela (5) | `prd.md` AC 60 | as cinco linhas, C69 | - |
| itens do menu (6) | `prd.md` AC 62 | os seis, C71 | - |
| blocos do `/menubar` que falham sozinhos (4) | `prd.md` AC 50; `BlockError` em `Headline.tsx:37`, `TurnList.tsx:14`, `ResourcesBlock.tsx` e `VersionLine.tsx:15` | `Consumo` C86 · `Turnos em voo` C86 · `Recursos` C57 · `Versão` C86 | - |
| bloqueios do `system.update` (5) | `prd.md` AC 27–29 | turno C30 · script C30 · instalação em curso C31 · sem supervisor C32 · sem versão nova C32 | - |
| falhas do registry (3) | `prd.md` AC 17 | timeout, não 2xx e sem `version`: C19 | - |
| desfechos da instalação (3) | `prd.md` AC 25–26 | 0: C28 · não zero: C29 · falha ao nascer: C29 | - |
| grupos de recursos (3) | `prd.md` AC 41 | `daemon`, `agents` e `terminals`: C47 | - |
| manchete do painel (3) | `prd.md` AC 46–47 | cota C53 · custo C54 · tokens C54 | - |
| valores de `auto_update` (3) | `prd.md` porta 3 | `off` C80 · `idle` C80 · inválido C23 (tRPC) e C24 (CHECK) | - |
| esteira pausada durante a instalação (2 montagens) | `runConveyorLoop` em `packages/server/src/bootstrap.ts:568`, e a do teste | a do teste: C83 (`auto.test.ts`) · a do daemon: C83 (`bootstrap.test.ts:258`), e o M1 morre | - |
| startup config `LUMEM_SUPERVISOR` (2 montagens) | lida em cada montagem | o serviço de verdade: `packages/cli/src/service.ts` a escreve, e `scripts/smoke-service.ts:185` viu `supervised: true` (C15) · o harness do router: C13 | - |

## Test policy rows

Verified at 2630a3ee.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `packages/desktop`, decide | `tray-state.ts`, `menu.ts`, `windows.ts`, `commands.ts` | vitest com o `electron` dublado: `packages/desktop/src/tray-state.test.ts:30`, `menu.test.ts:38`, `windows.test.ts:295` e `commands.test.ts:28` | yes - as 5 linhas do ícone (C69) e os 6 itens do menu (C71), cada um com asserção |
| `packages/desktop`, a casca inteira | `main.ts`, `index.ts`, `preload.ts`, `assets/stopped.html` | um e2e com `_electron.launch`: `packages/desktop/e2e/app.spec.ts:65`, rodado aqui | yes - sobe, cria o ícone, e o painel carrega `/menubar` (macOS) |
| `packages/cli`, escritor de serviço | `service.ts` e os verbos de serviço de `run.ts` | vitest com `launchctl`, `systemctl` e o disco dublados | yes - o conteúdo por supervisor (C1, C2), a ordem (`service.test.ts:160`, `:223`) e cada recusa (C5, C6, C9) |
| `packages/cli`, o serviço de verdade | `service.ts` contra o supervisor do sistema | `pnpm smoke:service`, local | gap - no launchd, os quatro passos rodaram aqui com exit 0. No systemd `--user`, nunca rodou em máquina nenhuma |

## Faults injected

Verified at 2630a3ee. As mutações rodaram numa cópia descartável: `git archive HEAD` em `/tmp/v038r2/wt`,
com os `node_modules` da árvore real ligados por symlink. Nada mexeu no estado do git. Antes de
qualquer mutação, a linha de base das oito provas-alvo rodou verde na cópia. Cada arquivo mutado foi
restaurado da árvore real antes da falha seguinte, e a cópia foi apagada no fim.

O porcelain da árvore real é o mesmo antes e depois: `?? docs/features/038-desktop-and-updates/verification.md`.

**Por que sete, e não cinco.** O M1 e o M2 repetem os dois sobreviventes da rodada 1, como o pedido
manda. Os outros cinco caem em superfícies de asserção que a correção criou (C86 e C90), ou que ganharam
check nesta correção (C88, C91 e C92) e nunca tinham sido feitas falhar. O teto de cinco existe contra a
cota que cresce com o risco. Aqui cada falha a mais derruba uma prova diferente, que nenhuma outra falha
derruba.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 (o F1 da rodada 1) - `paused: () => update.installer.installing()` vira `paused: () => false` | `packages/server/src/bootstrap.ts:572` | yes - `bootstrap.test.ts` `does not dispatch from the daemon's own conveyor…` cai com `expected [ …(2) ] to deeply equal [ Array(1) ]`, **três vezes em três**. O comando da rodada 1 (`auto.test.ts`, `bootstrap.test.ts` e `src/tasks`) agora dá `1 failed \| 276 passed`, onde antes dava 276 de 276 verdes |
| M2 (o F2 da rodada 1) - `round1 = Math.round(value * 10) / 10` vira `Math.round(value)` | `packages/server/src/resources/sample.ts:73` | yes - as duas provas do C46 caem: o amostrador (`expected { …(3) } to deeply equal`) e o router (`expected 2 to be 1.6`) |
| M3 - o `<BlockError what="o consumo" />` vira `<BlockLoading …/>`, e o erro do `Consumo` não aparece | `packages/web/src/features/menubar/Headline.tsx:37` | yes - `fails alone when 'usage.total' fails…` cai (C86). Os outros dois casos seguem verdes, como devem |
| M4 - `return code;` vira `return 1;` quando o gerenciador falha no `menubar install` | `packages/cli/src/menubar.ts:127` | yes - C92 cai com `expected 1 to be 13` |
| M5 - `desktopDataDir({ platform, … })` vira `desktopDataDir({ platform: "darwin", … })`, e o app lê da pasta errada no Linux | `packages/desktop/src/main.ts:112` | yes - C90 (`reads lumem-desktop.json from the folder…`) cai com `linux: expected [ Array(1) ] to deeply equal` |
| M6 - `useVersionReload({ served: status.data?.current, … })` vira `served: undefined`, e o painel nunca recarrega | `packages/web/src/features/menubar/MenubarScreen.tsx:34` | yes - a primeira prova do C91 cai com `expected "vi.fn()" to be called 1 times, but got 0 times` |
| M7 - `orderBy(desc(lastOpened), …)` vira `asc(lastOpened)` | `packages/server/src/repositories/workspace.ts:96` | yes - C88 (`lists the three workspaces…`) cai |

O C87 e o C89 ficaram sem falha própria. As asserções deles são `toEqual` de valores literais
(`system.test.ts:414`, `menubar.test.ts:238`). O C89 já tinha teste na rodada 1.

## Gate

Verified at 2630a3ee.

- `LUMEM_GATE_BASE=b226b4b pnpm gate:quick`, rodado duas vezes. Deu `docs ok` e a suíte inteira, porque
  uma dependência mudou: **324 arquivos, 5180 passed, 6 skipped, 0 failed**, `exit=0`. São 7 a mais que
  os 5173 da rodada 1: o `bootstrap`, o router do `resources`, os três casos do C86, o `rewrites` do CLI
  e o `reads` do desktop;
- nenhum `.skip`, `.only` ou `.todo` entrou no diff da feature, e a correção não removeu teste nenhum.
  A troca das amostras de `/proc` do C51 manteve os dois casos que importam: o `comm` com espaço e
  parêntese, e o `utime` somado ao `stime` (`151 + 1`);
- `pnpm lint`: `exit=0`. `pnpm docs:check`: `docs ok`, `exit=0`;
- `pnpm typecheck`: veio do cache do turbo (5 de 5), então foi refeito. O
  `tsc -p tsconfig.json --noEmit` deu `exit=0`, e o `turbo typecheck --force` deu `0 cached, 5 successful`,
  `exit=0`;
- `pnpm exec playwright test e2e/update.spec.ts e2e/menubar.spec.ts`: 3 passed (41,5 s). O
  `[WebServer] Error: read ECONNRESET` impresso durante o relançamento do daemon é ruído, e o teste
  passou. `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel
  carrega a página do daemon"`: 1 passed;
- `pnpm smoke:service --only start-waits-for-health`, `--only stop-leaves-nothing`,
  `--only survives-the-caller` e `--only update-relaunches`: os quatro deram exit 0 no launchd. Depois,
  `launchctl print gui/501/tech.cazimi.lumem-smoke` responde *Could not find service*, e não sobra nada
  do Lumem em `~/Library/LaunchAgents`;
- `pnpm measure:resources --only ten-sessions`, duas vezes: 0,44% e 0,43%, exit 0;
- `pnpm smoke:install --only desktop`: exit 0 no darwin-arm64. Rodou o pack, a instalação num prefixo
  descartável, o `codesign --verify` e a checagem de quarentena. Nenhum processo do app ficou rodando.

## O que não rodou, e o que isso deixa sem prova

**O veredito depende destas linhas, e só delas.** Sem as três primeiras, cada check, cada membro e cada
linha de `Test policy` estaria provado. Com elas, o C78, três membros da Coverage e uma linha de
`Test policy` ficam sem prova.

| O quê | Por quê | O que fica sem prova | Apoio colhido aqui (não é a prova nomeada) |
| --- | --- | --- | --- |
| `pnpm smoke:service` sob o `systemd --user` | não há máquina Linux. Um contêiner não tem a sessão de usuário que o script espera | o `lumem start` de verdade no Linux: `daemon-reload` e `enable --now` contra o systemd, sobreviver ao chamador numa sessão real, e o relançamento do daemon real depois do `exit(0)` do `system.update` | a unit foi gerada pelo `renderService` do `service.ts` com um host Linux (`ExecStart` com caminho entre aspas, `append:`, `Restart=always`). Num contêiner com systemd 252 (Debian 12, linger ligado para um usuário): `systemd-analyze --user verify` saiu 0; `daemon-reload` e `enable --now` saíram 0, e o link em `default.target.wants` nasceu; um `lumem.mjs` falso respondeu `supervised: true`, o que mostra o `LUMEM_SUPERVISOR` chegando; o log foi acrescentado em `daemon.log`; depois de um `exit 0`, o systemd o relançou (`NRestarts=1`, `ExecMainStatus=0`, pid 307 → 330); `disable --now` parou o processo e tirou o link. Não é o pacote real nem o script, e não há sessão de login |
| a metade de Linux do `smoke:install --only desktop` (C78, AC 69) | não há Linux com o repositório instalado | o pacote `linux-x64` instalado por `npm i -g`, o `.desktop` escrito pelo CLI de verdade, e o app subindo sob `xvfb` até carregar `/menubar` | nenhum nesta rodada. A rodada 1 abriu `linux-arm64` sob `xvfb` num contêiner, **com** `--no-sandbox` |
| `.AppImage` e `.deb` (C78, AC 68) | as ferramentas x86 do electron-builder não rodam neste macOS arm64 sem Rosetta, e nesta rodada ninguém os produziu | que eles nasçam, e que o `gh release create` os ache em `desktop/assets/` | nenhum |
| `npm publish` com `--provenance`, e o `release.yml` em si | o guarda recusa `npm publish`, e o workflow só roda numa tag | que o registry aceite um tarball de ~126 MB (126,1 MB medidos para darwin-arm64), e o trusted publisher dos quatro nomes novos. O check afirma o texto do workflow, e esse texto está provado | nenhum |
| `measure:resources` no Linux | não há Linux | o custo de ler `/proc` com 10 sessões | nenhum |
| o clique do sistema operacional no ícone (macOS) | o Playwright não alcança a barra de menus | a guarda de 300 ms sob o evento de verdade | nenhum |
| **Q4**, aberta em `open-questions.md` | é decisão do dono e medição num Ubuntu 23.10 ou mais novo | se o `.desktop` do C63, que não leva `--no-sandbox`, abre onde os user namespaces são restritos. A rodada 1 viu, num contêiner, o app sem `--no-sandbox` abortar com a mesma falha que a Q4 descreve. Nenhum check falha por ela, mas a trava do AC 67 no Linux depende da resposta | nenhum |

## Swept

Verified at 2630a3ee.

- **authorization: existing** — confere. `system.*` (`packages/server/src/routers/system.ts:29-116`),
  `usage.total` (`usage.ts:34`), `agentAccount.rateLimits` (`agentAccount.ts:67`) e `workspace.recent`
  (`workspace.ts:28`) são `publicProcedure` (`packages/server/src/trpc.ts:144`), a mesma fronteira de
  todo o `/trpc`.
- **concurrency: C31, C33, C83** — o C83 agora está provado para a esteira do daemon (M1).
- A janela conhecida continua sem check que a reclame: uma passada da esteira já em `prepareCheckout`
  não é turno em voo nem script rodando, então o `busyNow` a vê ociosa. O handoff da S5 a registra. Não
  contradiz o AC 72.

## Quem fecha cada lacuna

Esta é a rodada 2 de três. As lacunas que sobraram não se fecham com código, e uma terceira rodada de
construção nesta máquina chegaria ao mesmo FAIL. Por isso elas vão para o dono agora.

**Do dono. Estas decidem o veredito:**

1. A metade de Linux do C78 (`scripts/smoke-install.ts:269`) e o `.AppImage`/`.deb`. Os caminhos: rodar
   `pnpm smoke:install --only desktop` numa máquina Linux x64 e produzir os dois artefatos; ou decidir,
   no `checks.md`, que isso é provado pela primeira tag no runner, com uma entrada no backlog e o
   gatilho. A escolha é do dono, e não do verificador.
2. A linha *o serviço de verdade* do `Test policy` no systemd `--user` (C2, C15 e C40 no Linux). Os
   caminhos: rodar os quatro passos de `pnpm smoke:service` numa sessão Linux de verdade; ou aceitar o
   apoio do contêiner acima e registrar isso no `checks.md`.
3. A Q4. É decisão de produto, e a mesma máquina Linux (Ubuntu 24.04) a mede. Ela não derruba nenhum check
   hoje, mas decide o C63 e a trava do AC 67 no Linux.

**De um construtor, só documentação. Nenhuma destas mexe no veredito:**

- os `Proof:` de C29, C37, C42 e C55 não nomeiam o teste que afirma parte do claim. Esses testes são
  `system.test.ts:231`, `e2e/update.spec.ts:64`, `usage.test.ts:161` e `MenubarScreen.test.tsx:175`.
  Todos existem e rodaram;
- a linha *saídas do CLI que não são 0* do `checks.md` omite o `upgrade` 1, o `upgrade` com o código do
  gerenciador e o `uninstall` com o código do gerenciador, que são afirmados sem check. Ela também não
  diz que `open` e `uninstall` fora das quatro plataformas passam pela mesma recusa do `install`;
- `docs/README.md:813` descreve o `open-questions.md` com *"3 perguntas, 3 respondidas"*. O arquivo tem
  4, com a Q4 aberta. A linha do `verification.md` no índice descreve a rodada 1 e precisa dizer a 2.

**Lições (passo 7).** As duas lições da rodada 1 já estão em *Armadilhas já corrigidas* de
`docs/project/testing.md`, pelo commit `4a14f1a5`:

- a prova de uma opção tem de passar pela montagem que a liga;
- a casa decimal precisa de um valor que só o cálculo certo produz.

Esta rodada não achou nenhum teste verde que deixasse um defeito passar. O que sobra é ambiente que não
rodou, e isso não é armadilha de teste.
