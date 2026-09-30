# O Lumem fica de pé sozinho, se atualiza, e mora na barra — verification

## Rodada 1 (reprovada, em `2ab18e3b`)

A rodada 1 leu C1–C85 em `b226b4b..2ab18e3b` e reprovou. As lacunas, na ordem dela:

1. A fiação `paused: () => update.installer.installing()` da esteira do daemon não tinha prova (C83), e o
   mutante F1 sobreviveu. **Fechada na rodada 2**, e o mutante morre de novo nesta (M1).
2. A casa decimal do `cpuPercent` só era provada com inteiros, e abaixo do router (C46): o mutante F2.
   **Fechada na rodada 2**, e morre de novo nesta (M2).
3. A metade de Linux do C78 não tinha rodado. **Fechada nesta rodada**, pelo `release.yml` em `dry_run`.
4. Havia membros da Coverage sem prova: três blocos do painel (fechado pelo C86), o `systemd --user` de
   verdade (adiado pelo dono, ver *Adiado pelo dono*) e o `.AppImage`/`.deb` (fechado nesta rodada).
5. A linha *o serviço de verdade* do `Test policy` só tinha sido cumprida no launchd. O dono decidiu
   adiar a metade do systemd.
6. Havia comportamento construído sem check. **Fechado na rodada 2** pelos checks C87–C92.

## Rodada 2 (reprovada, em `2630a3ee`)

A rodada 2 leu C1–C92 em `b226b4b..2630a3ee` e reprovou só pelo que exige Linux. 91 de 92 checks passaram,
e as sete falhas injetadas morreram. As lacunas, pela ordem, e onde cada uma está agora:

1. A metade de Linux do C78, e o `.AppImage` e o `.deb` sem ninguém tê-los produzido. **Fechada:** o job
   `app (linux-x64)` do run 36722841349, no mesmo commit do `HEAD`, rodou `pnpm smoke:install --only
   desktop` sob `xvfb` e viu a janela carregar `/menubar`. Os dois jobs de Linux produziram o `.AppImage` e o
   `.deb` (seção *A evidência do CI*).
2. A linha *o serviço de verdade* do `Test policy` no `systemd --user`. **Não rodou, e foi adiada pelo
   dono** para `docs/project/backlog.md`, com gatilho (seção *Adiado pelo dono*).
3. A Q4, aberta. **Respondida (c)**, virou o critério 78 e o C93. O kernel de verdade do runner a mediu.

As pendências só de documentação que a rodada 2 apontou (as segundas `Proof:` de C29, C37, C42 e C55, e a
linha das saídas do CLI que não são 0) foram feitas em `ffced539`, e conferidas abaixo.

## Rodada 3

**Verdict**: FAIL
**Profile**: standard
**Diff range**: b226b4b..32f8aac6 (a correção desde a rodada 2 é `2630a3ee..32f8aac6`: `a33dc9fd`, `038ea363`, `5f7a8596`, `72c6be8c`, `ffced539`, `4d5a497d`, `66806519`, `32f8aac6`)
**Round**: 3 - full
**Verifier**: independent sub-agent (author != verifier)

A rodada foi inteira. Todos os 93 checks (C1–C93) foram lidos no `HEAD` `32f8aac6`, e todas as provas
rodaram de novo. Cada citação foi relida no `HEAD`. Os arquivos de teste que a correção não tocou são
idênticos aos de `2630a3ee` (`git diff --quiet 2630a3ee HEAD` sobre eles), e as linhas citadas foram
impressas uma a uma. Tudo aqui é `verified at 32f8aac6`. A máquina é um macOS arm64 (Darwin 27), com o Node
do `.nvmrc` (`v22.17.1`) e o launchd de verdade. O Linux é o do CI (seção *A evidência do CI*).

**O veredito é FAIL, por uma lacuna de teste, e não por defeito de comportamento.** O Linux fechou: o CI
provou a metade de Linux do C78 e produziu o `.AppImage` e o `.deb`. O kernel de verdade confirmou a
premissa do C93. O que reprova é o C93:

- a tabela de cinco casos não tem a combinação que o único kernel real medido tem: o Ubuntu 24.04 do runner,
  com `unprivileged_userns_clone` = `1` **e** `apparmor_restrict_unprivileged_userns` = `1`;
- o mutante M7 vive: *"o botão do Debian, quando existe, decide sozinho"*. Nesse kernel ele não grava
  `--no-sandbox`, e o app aborta ao abrir. Ele passa pela prova do C93, pela suíte inteira do CLI (115 de
  115) e também pelo passo de Linux do smoke. O smoke só imprime o `Exec=`, e sobe o app com um
  `--no-sandbox` próprio.

O `HEAD` se comporta certo nesse kernel: o log do CI mostra a linha do porquê e o `Exec=` com a flag.
Mas nenhuma prova o afirma. A correção é uma linha na tabela.

Esta é a terceira rodada. Pelo procedimento, a lacuna vai ao dono, e não a outra rodada automática
(seção *Quem fecha*).

## Binding sources

Verified at 32f8aac6. O passo 1 não se aplica: o perfil é `standard`, e ele só roda sob `ui`. O plano não
marca nenhuma fonte como *binding*: os três ADRs de 2026-09-29 e a discovery estão em `Sources`. Nenhum
check os contradiz. O critério 78 e o C93 concordam com a resposta (c) da Q4 em `open-questions.md`.

## Checks

Verified at 32f8aac6. As provas rodaram em uma invocação por pacote, com `--reporter=verbose`, sobre os
arquivos inteiros que os checks nomeiam:

- `packages/cli`: `service`, `run`, `args`, `port`, `upgrade` e `menubar`. **105 passed**, um a mais que
  na rodada 2 (o C93);
- `packages/server`: 16 arquivos. **286 passed**;
- `packages/web`: 5 arquivos. **44 passed**;
- `packages/desktop`: 6 arquivos. **45 passed**;
- `packages/shared`: `desktop.test.ts`. **5 passed**;
- `scripts`: `smoke-install`, `release-workflow`, `set-version` e `package-boundaries`. **22 passed**, três
  a mais (o *bare runner* e os dois do `.deb`).

Os 105 nomes que os `-t` do `checks.md` pedem foram extraídos do arquivo e procurados um a um na saída
(`grep -F`). Todos aparecem com `✓`, e nenhum com `×`. O `fails alone when` do C86 casa os três casos do
`it.each`, e o `o .deb do app de desktop` do C78 casa os dois testes do `describe`. Nenhum filtro caiu no
vazio. As provas que não são vitest rodaram como estão escritas (seção *Gate*).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | plist do launchd com PATH, supervisor, KeepAlive e logs | service.test ✓ | `packages/cli/src/service.test.ts:141` - `expect(parsePlist(files.get(PLIST)!)).toEqual({ Label: "tech.cazimi.lumem", … })`; a ordem em `:160` | PASS |
| C2 | unit do systemd; `daemon-reload` e `enable --now`, nessa ordem | service.test ✓ | `packages/cli/src/service.test.ts:215` - `toContain("ExecStart=/opt/node/bin/node … run\n")`; `:223` - `expect(systemctl.slice(-3)).toEqual([…])` | PASS |
| C3 | reescreve o arquivo existente antes de carregar | service.test ✓ | `packages/cli/src/service.test.ts:248` - `expect(rewritten.ProgramArguments).toEqual(["/novo/bin/node", "/novo/lib/lumem.mjs", "run"])` | PASS |
| C4 | sai 0 no health; sai 1 com as últimas 20 linhas em 15 s | run.test ✓; `smoke:service --only start-waits-for-health` exit 0 | `packages/cli/src/run.test.ts:329` - `toBe(1)`; `:332` - `toContain("linha 30")`; `:335` - `now() >= 15_000`; `scripts/smoke-service.ts:142` - `assert(health?.ok === true, …)` (saída: "saiu 0 e o health já respondia (v0.6.1)") | PASS |
| C5 | sem supervisor: sai 1, não escreve nada, cita `lumem run` | service.test ✓ | `packages/cli/src/service.test.ts:359` - `toEqual({ ok: false, reason: expect.stringContaining("lumem run") })`; `:361` - `files.size` 0 | PASS |
| C6 | outro Lumem fora do serviço: sai 1 | run.test ✓ | `packages/cli/src/run.test.ts:353` - `toContain("fora do serviço")` | PASS |
| C7 | sem verbo é `start`; `run` com as quatro opções | args.test ✓ | `packages/cli/src/args.test.ts:24` - `expect(parseCommand([])).toEqual(start)`; `:30` - `toEqual({ kind: "run", port: 5_000, host: "0.0.0.0", stateDir: "/tmp/x", open: true })` | PASS |
| C8 | `lumem run` é o primeiro plano de antes | run.test ✓ | `packages/cli/src/run.test.ts:292` - `toContain("já tem um Lumem em http://127.0.0.1:4317")`; `:296` - `toBe(1)` | PASS |
| C9 | stop: `bootout` e apaga o plist, ou `disable --now`; 0 ou 1 em 10 s | service.test ✓; `smoke:service --only stop-leaves-nothing` exit 0 | `packages/cli/src/service.test.ts:378` - `toContain("launchctl bootout gui/501/tech.cazimi.lumem")`; `:412` - `reason` com `"10 s"`; `scripts/smoke-service.ts:156` - `assert((await readHealth()) === null, …)` (saída: "parou, descarregou e não deixou item de login") | PASS |
| C10 | status: uma linha, 0 ou 3 | run.test ✓ | `packages/cli/src/run.test.ts:473` - `toEqual(["rodando · v0.7.0 · http://127.0.0.1:4317 · supervisionado"])`; `:478` `em primeiro plano`; `parado` e 3 logo abaixo | PASS |
| C11 | logs: 200 de 250, e `-f` segue | run.test ✓ | `packages/cli/src/run.test.ts:510` - `expect(out[0]).toBe("linha 51")`; `:530` - `toEqual(["linha 251", "linha 252"])` | PASS |
| C12 | logs sem arquivo: sai 1 com o caminho | run.test ✓ | `packages/cli/src/run.test.ts:536` - `toContain(join(stateDir, "daemon.log"))` | PASS |
| C13 | `supervised` vem de `LUMEM_SUPERVISOR` | health.test ✓ | `packages/server/src/routers/health.test.ts:27` e `:29` - `true` para `launchd` e `systemd`; `:31`, `:35` e `:37` - `false` sem ela, com `supervisord` e com vazio | PASS |
| C14 | `protocolVersion: 1`; o `probePort` segue lendo | health.test ✓; port.test ✓ | `packages/server/src/routers/health.test.ts:41` - `toEqual({ ok: true, version, supervised: false, protocolVersion: 1 })`; `packages/cli/src/port.test.ts:40` | PASS |
| C15 | sobrevive ao chamador e responde `supervised: true` | `smoke:service --only survives-the-caller` exit 0 | `scripts/smoke-service.ts:185` - `assert(health.supervised === true, …)` (saída: "o chamador morreu, e o daemon seguiu respondendo supervised: true"). Sob o launchd | PASS |
| C16 | o smoke sobe com `lumem run` | smoke-install.test ✓ | `scripts/smoke-install.test.ts:15` - `expect(args).toEqual(["run", "--port", "4397"])` | PASS |
| C17 | registry no boot e a cada 6 h, só com `accept` | check.test ✓ | `packages/server/src/update/check.test.ts:71-72` - `toBe(REGISTRY)` e `headers` `{ accept: "application/json" }`; `:78` - duas chamadas | PASS |
| C18 | `updateStatus`: `current`, nulos antes da primeira verificação, e os três `updateAvailable` | system.test ✓ | `packages/server/src/routers/system.test.ts:63` - `toEqual({ current: LUMEM_VERSION, latest: null, checkedAt: null, … })`; `:78`, `:85`, `:91` | PASS |
| C19 | timeout, 503 e corpo sem `version` mantêm o anterior, com um `warn` cada | check.test ✓ | `packages/server/src/update/check.test.ts:110` - `toEqual(good)`; `:122` `sem versão`; `:133` - `toHaveBeenCalledWith(10_000)` | PASS |
| C20 | verificação desligada: nenhuma requisição, `checkEnabled: false` | check.test ✓ | `packages/server/src/update/check.test.ts:193` e `:199` - `checkEnabled()` false; `:201` - `asked` não chamado | PASS |
| C21 | `updateCheckForcedOff` e o interruptor desabilitado com o texto | system.test ✓; UpdateSettings.test ✓ | `packages/server/src/routers/system.test.ts:115`; `packages/web/src/features/settings/UpdateSettings.test.tsx:41` `toBeDisabled()` e `:43` `desligado por LUMEM_NO_UPDATE_CHECK` | PASS |
| C22 | `setSettings` grava a única linha | system.test ✓ | `packages/server/src/routers/system.test.ts:138` - `toEqual([{ id: 1, updateCheck: 1, autoUpdate: "off" }])` | PASS |
| C23 | `autoUpdate: "always"`: `BAD_REQUEST`, linha intacta | system.test ✓ | `packages/server/src/routers/system.test.ts:154` - `rejects.toMatchObject({ code: "BAD_REQUEST" })`; `:157` | PASS |
| C24 | migração: uma linha com os padrões; o CHECK recusa | daemon-settings.test ✓ | `packages/server/src/db/daemon-settings.test.ts:52` - `toEqual([{ id: 1, updateCheck: 1, autoUpdate: "off" }])`; `:56` | PASS |
| C25 | topbar `v0.6.1 → v0.7.0` e o botão; nada sem versão nova | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:39` - `findByText("v0.6.1 → v0.7.0")`; `:48` - `toBeEmptyDOMElement()` | PASS |
| C26 | sem supervisor, `lumem upgrade` no lugar do botão | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:59` - `getByText("lumem upgrade")` | PASS |
| C27 | update fecha a porta, instala com o dono, `started: true` | system.test ✓ | `packages/server/src/routers/system.test.ts:169` - `toEqual({ started: true })`; `:176` - a porta antes do instalador | PASS |
| C28 | instalação 0: sai por `createShutdownHandler` com 0 | install.test ✓ | `packages/server/src/update/install.test.ts:44` - `toHaveBeenCalledWith(0)`; `:53` - `close` antes de `exit` | PASS |
| C29 | instalação 1 ou `ENOENT`: reabre a porta, não sai, e `lastError` | install.test ✓; system.test `reports a failed install in updateStatus…` ✓ | `packages/server/src/update/install.test.ts:78` e `:93` - `lastError()` com `"1"` e com `"spawn npm ENOENT"`; `:81` e `:95` - `exit` não chamado; pelo router, `packages/server/src/routers/system.test.ts:239` - `updateStatus().lastError` com `"1"` (segunda `Proof:`, desde `ffced539`) | PASS |
| C30 | 2 turnos e 1 script: `CONFLICT` com os números | system.test ✓ | `packages/server/src/routers/system.test.ts:189-195` - `code: "CONFLICT"`, a mensagem com os números, e o instalador não chamado | PASS |
| C31 | segundo update: `CONFLICT` | system.test ✓ | `packages/server/src/routers/system.test.ts:205` e `:207` | PASS |
| C32 | sem supervisor ou sem versão nova: `PRECONDITION_FAILED` | system.test ✓ | `packages/server/src/routers/system.test.ts:216`, `:224` e `:226` | PASS |
| C33 | prompt recusado durante a instalação, e nada chega ao agente | AcpManager.test ✓ | `packages/server/src/acp/AcpManager.test.ts:504` - `rejects.toThrow(…)`; `:510` - `promptBlocks` `[]` | PASS |
| C34 | copia antes de migrar e grava a versão depois | backup.test ✓ | `packages/server/src/db/backup.test.ts:95-96` - a cópia tem só a tabela de antes; `:103` - `"0.7.0"` | PASS |
| C35 | mantém as 3 mais novas | backup.test ✓ | `packages/server/src/db/backup.test.ts:149` | PASS |
| C36 | sem `last-version` não copia; migração que falha não grava | backup.test ✓ | `packages/server/src/db/backup.test.ts:184`, `:196` e `:206` | PASS |
| C37 | recarrega uma vez e diz `Lumem atualizado para v0.7.0` | useVersionReload.test ✓; `playwright test e2e/update.spec.ts` ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:26` e `:33` - `reload` 1 vez, `updatedTo` `"0.7.0"`; o texto em `e2e/update.spec.ts:64` - `getByText(\`Lumem atualizado para v${NEW_VERSION}\`)` (segunda `Proof:`, desde `ffced539`) | PASS |
| C38 | não recarrega duas vezes na mesma aba | useVersionReload.test ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:54` - `toHaveBeenCalledTimes(1)` | PASS |
| C39 | upgrade reinicia o serviço e imprime a versão de depois | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:165` `kickstart -k`; `:168` `v0.2.0`; `:177` `systemctl --user restart` | PASS |
| C40 | o daemon real volta na versão nova sem `lumem start` | `smoke:service --only update-relaunches` exit 0 | `scripts/smoke-service.ts:318` - `health?.version === NEW_VERSION`, e `:328` - `supervised === true` (saída: "o supervisor subiu o daemon de novo, na v0.99.0, sem ninguém rodar `lumem start`"). Sob o launchd | PASS |
| C41 | a página recarregada carrega os assets novos, e não fica em branco | `playwright test e2e/update.spec.ts` ✓ (20,9 s) | `e2e/update.spec.ts:69` - `#root > *` > 0; `:72` - os assets novos | PASS |
| C42 | `usage.total` soma todos os workspaces; `cost` nulo quando todos são nulos | usage.test ✓ ×2 | `packages/server/src/routers/usage.test.ts:157` - `toEqual({ tokens: 7_500, cost: 1.75, currency: "USD", turns: 4 })`; `:172` - a metade do nulo (segunda `Proof:`, desde `ffced539`) | PASS |
| C43 | uma instrução SQL para 1, 3 e 10 workspaces | usage.test ✓ | `packages/server/src/routers/usage.test.ts:214` - `expect(counts).toEqual([1, 1, 1])` | PASS |
| C44 | `period` desconhecido: `BAD_REQUEST` | usage.test ✓ | `packages/server/src/routers/usage.test.ts:220-223` - `rejects.toMatchObject({ code: "BAD_REQUEST" })` | PASS |
| C45 | o relato mais recente, sem a conta que não relatou | agentAccount.test ✓ | `packages/server/src/routers/agentAccount.test.ts:420` - `resolves.toEqual([{ accountId: work.id, … }])` | PASS |
| C46 | grupos com `cpuPercent` em uma casa decimal; `top` de 5 | sample.test ✓; system.test `resources rounds cpuPercent…` ✓ | `packages/server/src/resources/sample.test.ts:156` - `decimals.groups` com `1.6`, `1.3` e `1.8`; `:161` - o `top`; `:127` - o top 5 por `rssBytes`; pelo router, `packages/server/src/routers/system.test.ts:295` - `toBe(1.6)`, e `:296` | PASS |
| C47 | atribui ao ancestral rastreado mais próximo | attribute.test ✓ | `packages/server/src/resources/attribute.test.ts:35` `"agents"`, `:39` `"terminals"`, `:41` `"daemon"` | PASS |
| C48 | 1,0 s → 1,5 s em 5 s dá `10.0`; na primeira amostra, `null` | sample.test ✓ | `packages/server/src/resources/sample.test.ts:177` - `cpuPercent: null`; `:182` - `cpuPercent: 10` | PASS |
| C49 | 15 s sem pergunta: para de ler; a próxima consulta volta | sample.test ✓ | `packages/server/src/resources/sample.test.ts:217` - `toBe(afterQuiet)`; `:222` `afterQuiet + 1` | PASS |
| C50 | rótulo por sessão e checkout | sample.test ✓ | `packages/server/src/resources/sample.test.ts:261` - `toBe("Claude · lumem-os/bandung")`; `:262` `Terminal · …`; `:266` `"node"` | PASS |
| C51 | `ps` no darwin e `/proc` no Linux, de amostras gravadas | process-table.test ✓ | `packages/server/src/resources/process-table.test.ts:152` e `:185` - `toEqual([…])` das duas | PASS |
| C52 | `system.status`: seis campos, e `attention` com permissão pendente | system.test ✓ | `packages/server/src/routers/system.test.ts:327` - `resolves.toEqual({ version, protocolVersion: 1, supervised: true, … })`; `:345` - `{ liveTurns: 1, attention: true }` | PASS |
| C53 | manchete `87%`, o `kind` e o tempo até o reset | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:83` `87%`; `:85` `reseta em 2 h` | PASS |
| C54 | sem cota, o custo do dia; custo nulo, os tokens | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:98` `US$ 1,75` e `:100` `{ period: "1d" }`; `:108` `48,2k tokens` | PASS |
| C55 | ordem dos blocos, linha de versão e ações | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:135` - as regiões na ordem; `:162` `atualização disponível: v0.7.0`; `:167` os botões; `:186` `em dia · verificado há 3 min` (segunda `Proof:`, desde `ffced539`) | PASS |
| C56 | sem sessão, `nenhuma sessão rodando` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:196` | PASS |
| C57 | recursos falhando: só esse bloco diz | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:211` e `:217` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C58 | `2 terminais abertos fecham ao atualizar` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:276` | PASS |
| C59 | `routeOf("/menubar")` e `GET /menubar` com 200 | route.test ✓; static.test ✓ | `packages/web/src/lib/route.test.ts:24`; `packages/server/src/web/static.test.ts:91` `200` e `:93` o shell | PASS |
| C60 | `/menubar` numa aba mostra os três blocos | `playwright test e2e/menubar.spec.ts` ✓ (16,6 s) | `e2e/menubar.spec.ts:73` - número na manchete; `:89` - `/\d+,\d%/` no Daemon | PASS |
| C61 | medir a cada 3 s com 10 sessões custa menos de 1% | `measure:resources --only ten-sessions` três vezes, exit 0 | `packages/server/src/testing/measure-resources.ts:92` - `percent < LIMIT_PERCENT`. Saídas: **0,95%**, **0,93%** e **0,52%** (781–698 processos, carga 3,8–6,1). Passa, mas com margem estreita (ver *Riscos*). Só no macOS | PASS |
| C62 | `menubar install` nas quatro plataformas, e o `lumem-desktop.json` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:119` - `toContain(\`install npm install --global ${desktopPackageName(key)}@${VERSION}\`)`; `:122` - o JSON inteiro | PASS |
| C63 | `~/Applications/Lumem.app`; os dois `.desktop` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:173-174` - `rm -rf` e `ditto`; `:192-194` - `Exec=… --panel`, e o autostart sem ele | PASS |
| C64 | `win32-x64` e `linux-ia32`: sai 1 e lista as quatro | menubar.test ✓ | `packages/cli/src/menubar.test.ts:251` `toBe(1)`; `:256` as quatro no erro | PASS |
| C65 | upgrade leva o pacote do app e recopia no macOS | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:245-252` | PASS |
| C66 | uninstall remove o pacote, o app ou os `.desktop`, e o item de login | menubar.test ✓ | `packages/cli/src/menubar.test.ts:306` - `expect(app).toBeGreaterThan(login)`; `:315-318` no Linux | PASS |
| C67 | `openAtLogin: true` e um só ícone | main.test ✓ | `packages/desktop/src/main.test.ts:220-221` | PASS |
| C68 | health e status a cada 10 s | poll.test ✓ | `packages/desktop/src/poll.test.ts:55` - `toEqual(["/trpc/health", "/trpc/system.status"])` | PASS |
| C69 | a tabela de 5 entradas do ícone | tray-state.test ✓ | `packages/desktop/src/tray-state.test.ts:30-44` - `stopped`, `attention` três vezes, `update` e `running` | PASS |
| C70 | clique: janela de 360×520 sem moldura em `/menubar`, que esconde de novo e no blur | windows.test ✓ | `packages/desktop/src/windows.test.ts:142` - `toMatchObject({ width: 360, height: 520, frame: false })`; `:163` - `visible` false | PASS |
| C71 | o menu na ordem, e `Atualizar` só com versão nova | menu.test ✓ | `packages/desktop/src/menu.test.ts:38` - os rótulos na ordem; `:51` - `Atualizar` habilitado | PASS |
| C72 | uma janela principal, focada na segunda vez | windows.test ✓ | `packages/desktop/src/windows.test.ts:232` - `FakeWindow.all` com 1 | PASS |
| C73 | Iniciar e Parar com os caminhos gravados | commands.test ✓ | `packages/desktop/src/commands.test.ts:28` | PASS |
| C74 | daemon parado: a página local | windows.test ✓ | `packages/desktop/src/windows.test.ts:254` - `toEqual([\`file:${STOPPED_PAGE}\`])` | PASS |
| C75 | protocolo diferente: a linha de incompatível | menu.test ✓ | `packages/desktop/src/menu.test.ts:94` | PASS |
| C76 | toda janela travada na origem | windows.test ✓ | `packages/desktop/src/windows.test.ts:295` - `webPreferences` com `sandbox: true`; `:304` e `:309` - `navigate` cancelado; `:317` - `external` | PASS |
| C77 | Electron de verdade: o ícone, e o painel em `/menubar` | `playwright test e2e/app.spec.ts -g …` ✓ (1,2 s) | `packages/desktop/e2e/app.spec.ts:96` - `toHaveURL(\`${DAEMON}/menubar\`)`; `:105` - `[360, 520]` | PASS |
| C78 | o release publica os 4 pacotes e anexa zip, AppImage e deb; o smoke roda no macOS e no Linux | release-workflow.test ✓ ×3; smoke-install.test `the default path…` ✓; `smoke:install --only desktop` exit 0 aqui (darwin-arm64) e no CI (`app (darwin-arm64)` e `app (linux-x64)`, run 36722841349 em `32f8aac6`) | `scripts/release-workflow.test.ts:53`, `:72` e `:83` - a matriz, o `--provenance` e `desktop/assets/*.{zip,AppImage,deb}`; `:120` - `homepage` e `:124` - o mantenedor; `scripts/smoke-install.test.ts:52` - `expect(fromWorkspace).toEqual([])`; `scripts/smoke-install.ts:314` - `codesign --verify` (saída aqui e no CI: "ad-hoc, e confere"); `scripts/smoke-install.ts:344` - lança se nenhuma janela pediu `/menubar` (saída do CI em Linux: "a janela carregou /menubar", "✓ o app instala e confere") | PASS |
| C79 | `version:set` escreve o manifesto do app; o desktop só importa do shared | set-version.test ✓; package-boundaries.test ✓ | `scripts/set-version.test.ts:46`; `scripts/package-boundaries.test.ts:152` - `toBe("")` | PASS |
| C80 | o tique ocioso só instala com `idle` | auto.test ✓ | `packages/server/src/update/auto.test.ts:109` - `off` não instala; `:120` - `idle` instala uma vez | PASS |
| C81 | esperando, aceita prompt e a esteira anda; instala depois do `turn_end` | auto.test ✓ | `packages/server/src/update/auto.test.ts:192`, `:196` e `:201`; `:215` | PASS |
| C82 | não cruza major depois da 1.0 | auto.test ✓ | `packages/server/src/update/auto.test.ts:228` - `across.install` não chamado; `:240` - o minor instala | PASS |
| C83 | durante a instalação automática a esteira não despacha | auto.test ✓; bootstrap.test `does not dispatch…` ✓ | `packages/server/src/bootstrap.test.ts:308` - `[workspace.id]` antes; `:312` - a instalação começou; `:318` - `expect(dispatched).toEqual([workspace.id])` depois; `packages/server/src/update/auto.test.ts:290` | PASS |
| C84 | `Atualizar sozinho quando ocioso`, desabilitado sem supervisor | UpdateSettings.test ✓ | `packages/web/src/features/settings/UpdateSettings.test.tsx:85` `toBeDisabled()` e `:87` o texto; `:104` - `{ autoUpdate: "idle" }` | PASS |
| C85 | o caminho estável sob um store versionado | service.test ✓ | `packages/cli/src/service.test.ts:175` - `programArguments(...)` com o symlink, sem ele e sob npm | PASS |
| C86 | `Consumo`, `Turnos em voo` e `Versão` falham cada um sozinho | MenubarScreen.test `fails alone when` ✓ ×3 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:262` - `findByText(block.says)`; `:266` - ausente nos outros; `:268` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C87 | `system.live`: só os turnos em voo, com `label` e `startedAt` ISO, e `openTerminals` | system.test ✓ | `packages/server/src/routers/system.test.ts:404` - `{ turns: [], openTerminals: 0 }`; `:414` - `toEqual([{ sessionId: agent.id, label: "Claude · lumem-os/bandung", … }])`; `:417` ISO; `:419` - `openTerminals` 2 | PASS |
| C88 | `workspace.recent`: os três mais novos em ordem; a worktree conta; vazio sem sessão | workspace.test ✓ ×2 | `packages/server/src/routers/workspace.test.ts:396` - `toEqual([{ id: recente.id, … }, …])`; `:407` - `resolves.toEqual([])` | PASS |
| C89 | `menubar open` roda o app com `--panel`; sem app, sai 1 | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:276` - `toEqual(["/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --panel"])`; `:280` no Linux; `:286` `toBe(1)`, `:288` `lumem menubar install` e `:289` nada rodou | PASS |
| C90 | `lumem-desktop.json` na pasta de dados, reescrito a cada install, e o app o lê de lá | menubar.test ✓ ×2; desktop.test ✓; main.test ✓ ×2 | `packages/cli/src/menubar.test.ts:122` - o JSON na pasta de dados; `:150` - reescrito; `packages/shared/src/desktop.test.ts:28` e `:36`; `packages/desktop/src/main.test.ts:293` - `expect(read, platform).toEqual([expected])`; `:323` e `:325` - sem config, diz `lumem menubar install` e sai | PASS |
| C91 | o painel recarrega uma vez quando o daemon muda de versão; com a versão igual, não | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:363` e `:369` - `reload` uma vez só; `:381` - `not.toHaveBeenCalled()` | PASS |
| C92 | install com o gerenciador falhando devolve o código, não grava e não abre o app | menubar.test ✓ | `packages/cli/src/menubar.test.ts:263` - `toBe(13)`; `:266` - nenhum `write`; `:267` - `launched` `[]` | PASS |
| C93 | `--no-sandbox` nos dois `.desktop` só onde o kernel nega o sandbox, e a saída diz por quê | menubar.test `adds no-sandbox only where the kernel refuses the sandbox` ✓ | `packages/cli/src/menubar.test.ts:221-224` - `Exec="…" --no-sandbox --panel\n` no lançador, `--no-sandbox\n` no autostart e uma linha com o porquê; `:226-229` - sem a flag e sem linha. O comportamento em kernel de verdade está no log do CI (seção *A evidência do CI*), e não numa asserção. A tabela não tem o caso do Ubuntu (M7, *Coverage*) | PASS - a prova roda e afirma os cinco casos que tem. O que reprova é a Coverage e o M7 |

## Coverage

Verified at 32f8aac6. Cada conjunto foi recalculado a partir da própria autoridade, e não relido da tabela
do `checks.md`:

- as rotas e as saídas do CLI vêm do `## Surface` do `prd.md`;
- as portas vêm do `## Landing`;
- os blocos do painel vêm do AC 50;
- as plataformas e os artefatos vêm dos AC 68 e 69;
- os estados do kernel vêm do AC 78 e do próprio kernel: dois arquivos em `/proc/sys/kernel`, cada um `0`,
  `1` ou ausente. Um deles foi lido de verdade no runner.

Nos conjuntos em que a correção não mexeu na autoridade, o recálculo deu os mesmos membros da rodada 2.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas do `Surface` e seus status (11 rotas) | `prd.md` `## Surface` | `health` 200 C13 · `updateStatus` 200 C18 · `update` 200 C27, 409 C30/C31, 412 C32 · `status` 200 C52 · `resources` 200 C46 (router) · `settings`/`setSettings` 200 C22, 400 C23 · `usage.total` 200 C42, 400 C44 · `rateLimits` 200 C45 · `system.live` 200 C87 · `workspace.recent` 200 C88 · `GET /menubar` 200 C59 | - |
| verbos do CLI (10) | `prd.md` `Surface`, tabela do CLI | `start` C4 · sem verbo C7 · `run` C8 · `stop` C9 · `status` C10 · `logs` C11 · `upgrade` C39 · `menubar install` C62 · `menubar open` C89 · `menubar uninstall` C66 | - |
| saídas do CLI que não são 0 (12, e o `checks.md` agora diz 12) | `prd.md` `Surface`, tabela do CLI | `start` 1: C5, C6 e C4 · `stop` 1: C9 · `status` 3: C10 · `logs` 1: C12 · `menubar install` 1: C64 · `menubar install` com o código do gerenciador: C92 · `menubar open` 1: C89 · `upgrade` 1: `packages/cli/src/upgrade.test.ts:87` e `:206` · `upgrade` com o código do gerenciador: `:94` e `:195` · `menubar uninstall` com o código do gerenciador: `packages/cli/src/menubar.test.ts:332`. `open` e `uninstall` fora das quatro passam pela recusa única de `packages/cli/src/menubar.ts:138` | - |
| portas de mão única (9) | `prd.md` `## Landing` | 1 C7 · 2 C1 · 3 C24 · 4 C14 · 5 C62 · 6 C79 · 7 C34 · 8 C27 · 9 C90 | - |
| supervisores, escritor de serviço (2) | `prd.md` porta 2 | launchd C1 · systemd C2 | - |
| supervisor de verdade que esta feature deve (1, depois da decisão do dono) | `checks.md` `Test policy`, linha *o serviço de verdade*, com o adiamento de `docs/project/backlog.md:796` | launchd: os quatro passos do `pnpm smoke:service`, exit 0 aqui (C4, C9, C15 e C40). O systemd `--user` saiu do conjunto por decisão do dono, e não por prova: está em *Adiado pelo dono* | - |
| layout do gerenciador global (3) | `prd.md` AC 77 | npm, pnpm com o symlink e pnpm sem ele: C85 | - |
| plataformas do app no install (4) | `prd.md` porta 5 | as quatro C62, num laço sobre `DESKTOP_PLATFORMS` | - |
| as duas metades do AC 69 (2) | `prd.md` AC 69 | macOS: `pnpm smoke:install --only desktop`, exit 0 aqui e no job `app (darwin-arm64)` · Linux: o mesmo comando no job `app (linux-x64)` em `32f8aac6`, com "a janela carregou /menubar" (`scripts/smoke-install.ts:344`) | - |
| artefatos do release (3 tipos × arquitetura) | `prd.md` AC 68 | `.zip`: `Lumem-0.6.1-mac-arm64.zip` e `-mac-x64.zip`, construídos no CI e aqui · `.AppImage` e `.deb`: `Lumem-0.6.1-linux-x64.*` e `-linux-arm64.*`, construídos no CI. O artefato `desktop-linux-x64` foi baixado e aberto: `assets/…AppImage` (ELF x86-64), `assets/…deb` (`ar` com `debian-binary`, `control.tar.xz` e `data.tar.xz`) e `linux-x64/*.tgz`, no formato que os globs do `publish` leem. O anexo pelo `gh release create` só roda numa tag, e o texto dele é afirmado (`scripts/release-workflow.test.ts:83`) | - |
| estados do kernel para o sandbox (AC 78: os dois botões, cada um `0`, `1` ou ausente) | `prd.md` AC 78; `packages/cli/src/menubar.ts:56-59`; o `/proc/sys` do runner | `userns_clone` 0 com o outro ausente · `apparmor` 1 com o outro ausente · os dois negando · `1`/`0` liberados · os dois ausentes: C93 (`packages/cli/src/menubar.test.ts:204-208`). **O único kernel real medido** (Ubuntu 24.04 do runner: `userns_clone=1` e `apparmor_restrict=1`) não é um caso da tabela. O `HEAD` acerta nele no CI, mas é saída de log, e nenhuma prova o afirma. O M7 é exatamente isso | `userns_clone=1` com `apparmor_restrict=1` (o Ubuntu 23.10 em diante) |
| os dois `.desktop` do Linux (2) | `prd.md` AC 54 e 78 | lançador e autostart, com e sem a flag: C93 (`:221-222` e `:226-227`), e o M6 morre | - |
| estados do ícone (4) e linhas da tabela (5) | `prd.md` AC 60 | as cinco linhas, C69 | - |
| itens do menu (6) | `prd.md` AC 62 | os seis, C71 | - |
| blocos do `/menubar` que falham sozinhos (4) | `prd.md` AC 50 | `Consumo` C86 · `Turnos em voo` C86 · `Recursos` C57 · `Versão` C86 | - |
| bloqueios do `system.update` (5) | `prd.md` AC 27–29 | turno C30 · script C30 · instalação em curso C31 · sem supervisor C32 · sem versão nova C32 | - |
| falhas do registry (3) | `prd.md` AC 17 | timeout, não 2xx e sem `version`: C19 | - |
| desfechos da instalação (3) | `prd.md` AC 25–26 | 0: C28 · não zero: C29 · falha ao nascer: C29 | - |
| grupos de recursos (3) | `prd.md` AC 41 | `daemon`, `agents` e `terminals`: C47 | - |
| manchete do painel (3) | `prd.md` AC 46–47 | cota C53 · custo C54 · tokens C54 | - |
| valores de `auto_update` (3) | `prd.md` porta 3 | `off` C80 · `idle` C80 · inválido C23 (tRPC) e C24 (CHECK) | - |
| esteira pausada durante a instalação (2 montagens) | `runConveyorLoop` em `packages/server/src/bootstrap.ts:568`, e a do teste | a do teste: C83 (`auto.test.ts`) · a do daemon: C83 (`bootstrap.test.ts:258`), e o M1 morre | - |
| startup config `LUMEM_SUPERVISOR` (2 montagens) | lida em cada montagem | o serviço de verdade: `scripts/smoke-service.ts:185` viu `supervised: true` (C15, launchd) · o harness do router: C13 | - |

Um caminho que o C93 não nomeia, e que por isso não conta como membro: `lumem upgrade` também escreve os
dois `.desktop`, por `takeDesktopAlong` → `placeApp` (`packages/cli/src/menubar.ts:190` e `:214-222`). Nenhum
teste afirma o `--no-sandbox` por ele. O AC 78 só fala do `menubar install`, e a função é a mesma. Fica
como nota.

## Test policy rows

Verified at 32f8aac6.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `packages/desktop`, decide | `tray-state.ts`, `menu.ts`, `windows.ts`, `commands.ts` | vitest com o `electron` dublado: `packages/desktop/src/tray-state.test.ts:30`, `menu.test.ts:38`, `windows.test.ts:295` e `commands.test.ts:28` | yes - as 5 linhas do ícone (C69) e os 6 itens do menu (C71), cada um com asserção |
| `packages/desktop`, a casca inteira | `main.ts`, `index.ts`, `preload.ts`, `assets/stopped.html` | um e2e com `_electron.launch`: `packages/desktop/e2e/app.spec.ts:65`, rodado aqui | yes - sobe, cria o ícone, e o painel carrega `/menubar` (macOS). Em Linux, o app empacotado subiu sob `xvfb` no CI (C78) |
| `packages/cli`, escritor de serviço | `service.ts` e os verbos de serviço de `run.ts` | vitest com `launchctl`, `systemctl` e o disco dublados | yes - o conteúdo por supervisor (C1, C2), a ordem (`service.test.ts:160`, `:223`) e cada recusa (C5, C6, C9) |
| `packages/cli`, o serviço de verdade | `service.ts` contra o supervisor do sistema | `pnpm smoke:service`, local | yes, sob o launchd - os quatro passos (subir, sobreviver ao chamador, parar, voltar depois de atualizar) rodaram aqui com exit 0. O systemd `--user` **não rodou em máquina nenhuma**. Está adiado por decisão do dono em 2026-09-30 (`docs/project/backlog.md:796`, com gatilho). Nenhum check depende dele: o C2, o único check de systemd, é de unidade e está provado; C4, C9, C15 e C40 dizem *o supervisor* e rodaram como escritos. O C15 cita o AC 2 entre parênteses, e é ali que a ausência pesa |

## Faults injected

Verified at 32f8aac6. As mutações rodaram numa cópia descartável: `git archive HEAD` em `/tmp/v038r3/wt`,
com os `node_modules` da árvore real ligados por symlink. Nada mexeu no estado do git. Antes de qualquer
mutação, as provas-alvo rodaram verdes na cópia (3, 1 e 3 passed). Cada arquivo mutado foi restaurado de
`HEAD` antes da falha seguinte (`cmp` com a árvore real), e a cópia foi apagada no fim. O porcelain da árvore
real estava vazio antes. Depois, o único arquivo mudado é este `verification.md` (seção *Gate*).

**Por que sete.** M1 e M2 repetem os dois sobreviventes da rodada 1, como o pedido manda. M3 a M6 caem nas
quatro superfícies de asserção que a correção criou e que nenhuma falha tinha derrubado:

- a detecção do C93;
- os dois `.desktop` do C93;
- o *bare runner*;
- o `homepage` do `.deb`.

O M7 é a mutação da detecção que o recálculo da Coverage apontou.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 (o F1 da rodada 1) - `paused: () => update.installer.installing()` vira `paused: () => false` | `packages/server/src/bootstrap.ts:572` | yes - `does not dispatch from the daemon's own conveyor…` cai com `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| M2 (o F2 da rodada 1) - `round1 = Math.round(value * 10) / 10` vira `Math.round(value)` | `packages/server/src/resources/sample.ts:73` | yes - as duas provas do C46 caem: o amostrador (`expected { …(3) } to deeply equal`) e o router (`expected 2 to be 1.6`) |
| M3 (C93, detecção) - `refused: usernsClone === "0" \|\| apparmorRestrict === "1"` perde o `\|\| apparmorRestrict === "1"` | `packages/cli/src/menubar.ts:59` | yes - C93 cai no caso `apparmor 1` |
| M4 (C78, *bare runner*) - volta um `import { desktopPlatformOf } from "../packages/shared/src/desktop.js"` estático | `scripts/smoke-install.ts:24` (inserido logo depois do `import type`) | yes - `the default path imports nothing…` cai com `expected [ '../packages/shared/src/desktop.js' ] to deeply equal []` |
| M5 (C78, `.deb`) - o `homepage` sai de `packages/desktop/package.json` | `packages/desktop/package.json:10` | yes - `names a project homepage…` cai com `expected undefined to be 'https://github.com/vinihcrosa/lumem-os'` |
| M6 (C93, os dois `.desktop`) - o autostart é escrito com `[]` no lugar de `flags` | `packages/cli/src/menubar.ts:222` | yes - C93 cai no caso `userns_clone 0` |
| M7 (C93, detecção) - `refused: usernsClone !== null ? usernsClone === "0" : apparmorRestrict === "1"`: *o botão do Debian, quando existe, decide sozinho* | `packages/cli/src/menubar.ts:59` | no - sobrevive à prova do C93 (1 passed), à suíte inteira do CLI (9 arquivos, 115 passed) e a `scripts/smoke-install.test.ts` e `release-workflow.test.ts` (9 passed). Com `userns_clone=1` e `apparmor_restrict=1`, o `probeSandbox` mutado devolve `refused: false`, e o do `HEAD` devolve `true`. É o kernel do runner, e o de todo Ubuntu desde 23.10. O passo de Linux do smoke também não o pegaria: `scripts/smoke-install.ts:328` só imprime o `Exec=`, e `:337` sobe o app com `--no-sandbox` próprio |

O M7 é plausível, e não inventado. O comentário de `packages/cli/src/menubar.ts:50-55` apresenta os dois
botões como de distribuições diferentes (*"o do Debian e derivados, e o do AppArmor do Ubuntu"*). O Ubuntu é
derivado do Debian e tem os dois, com o do Debian em `1`. Uma refatoração que siga essa leitura produz o M7.

## A evidência do CI

Run 36722841349 (`workflow_dispatch`, `dry_run`), `headSha` `32f8aac6048114c8c6f1f8ad618a4ac8f1edcbea`, que
é o `HEAD` deste relatório. Li o log salvo em `.context/phase0/dry-run-2.log`. Busquei de novo, direto do
GitHub, o log do job `app (linux-x64)` (`gh run view 36722841349 --log --job 109913934007`), e as linhas
abaixo são as mesmas. O runner é Ubuntu 24.04.5 LTS, com o kernel `6.17.0-1022-azure`.

| Job | Conclusão | O que ele prova aqui |
| --- | --- | --- |
| `gates e tarball` | success | `pnpm gate:build` e `pnpm test` num runner Linux: 323 arquivos, 5176 passed, 14 skipped |
| `instalar de verdade (ubuntu-latest)` e `(macos-latest)` | success | o caminho padrão do `smoke:install` num runner **sem** `pnpm install`: "✓ o pacote instala e sobe". É o defeito (1) da correção 3, fechado no `HEAD` |
| `app (linux-x64)` | success | `.AppImage` e `.deb` construídos (`building target=deb … Lumem-0.6.1-linux-amd64.deb`, o defeito (2) fechado). E `pnpm smoke:install --only desktop <tarball>`, a segunda `Proof:` do C78, com: "o kernel não deixa o Chromium criar o sandbox (apparmor_restrict_unprivileged_userns=1); os .desktop levam --no-sandbox.", `Exec="…/lumem-desktop" --no-sandbox --panel`, `phase0-q4: sandbox=refused userns_clone=1 apparmor_restrict=1`, "a janela carregou /menubar" e "✓ o app instala e confere" |
| `app (linux-arm64)` | success | `.AppImage` e `.deb` de arm64 construídos no runner x64. Sem smoke, como o workflow declara |
| `app (darwin-arm64)` | success | o `.zip`, e o smoke com "ad-hoc, e confere" e "nenhum com.apple.quarantine" |
| `app (darwin-x64)` | success | o `.zip`. Sem smoke, como o workflow declara |
| `npm` | skipped | por desenho em `dry_run` (`if: github.ref_type == 'tag' \|\| inputs.dry_run == false`). Nem `npm publish --provenance` nem `gh release create` rodaram |

**Esta é a prova que o C78 nomeia?** Sim. A segunda `Proof:` é `pnpm smoke:install --only desktop`, e o job
`app (linux-x64)` roda esse comando no `ubuntu-latest`, com o tarball que o próprio job empacotou (o argumento
posicional que `parseSmokeArgs` aceita, `scripts/smoke-install.test.ts:25`), no mesmo commit. A metade de
Linux do AC 69 (*"start the app under `xvfb` and see a window load `/menubar`"*) é a asserção de
`scripts/smoke-install.ts:344`, e ela passou. O que o CI **não** prova é a publicação em si. O C78 a afirma
pelo texto do workflow, e esse texto está provado.

**E o C93 no kernel de verdade?** O runner é o caso que a Q4 temia: `apparmor_restrict=1`, e o app **sem**
a flag não carregou o painel (`sandbox=refused`, saiu em cerca de 1 s). Nesse kernel, o CLI do `HEAD` gravou
a flag nos `.desktop` e disse por quê. Isso confirma a premissa do critério 78 e o comportamento do `HEAD`.
Não é uma asserção, porque o smoke só imprime o `Exec=`, e é por isso que o M7 não morre aqui.

## Adiado pelo dono

| O quê | Estado | Onde está a decisão | O que fica sem prova |
| --- | --- | --- | --- |
| `pnpm smoke:service` sob o `systemd --user` de verdade | **não rodou em máquina nenhuma**, nem aqui nem no CI (os runners não têm sessão de usuário) | `docs/project/backlog.md:796` (seção H), com gatilho: *"houver uma máquina Linux com sessão de login à mão, ou antes da primeira release que anunciar suporte a Linux"*. E a linha *Fix round 2* do `Handoff` do `checks.md`. A decisão (opção (b), 2026-09-30) me foi relatada pelo orquestrador, e é o que esses dois registros dizem. Não a presenciei | o `lumem start` de verdade sob o `systemd --user`, o daemon sobrevivendo ao chamador numa sessão real, e o relançamento depois do `system.update`. O apoio é o da rodada 2: a unit do `renderService` num systemd 252 em contêiner, com `daemon-reload`, `enable --now`, `LUMEM_SUPERVISOR` chegando e o relançamento depois de um `exit 0` |

**Nenhum check depende disso para passar como está escrito** (ver a linha do `Test policy`). Sem a decisão do
dono, este membro seria uma segunda razão de FAIL. Com ela, sai do que a feature deve, e está dito aqui, e
não escondido.

**O gatilho merece atenção.** A primeira tag depois desta feature publica
`@vinihcrosa/lumem-desktop-linux-x64` e `-linux-arm64`, e um `lumem start` no Linux grava a unit do systemd.
Isso pode já ser *"anunciar suporte a Linux"*. Cabe ao dono dizer se o gatilho dispara nessa tag.

## Gate

Verified at 32f8aac6.

- `LUMEM_GATE_BASE=b226b4b pnpm gate:quick` deu `docs ok` e a suíte inteira, porque uma dependência mudou:
  **324 arquivos, 5184 passed, 6 skipped, 0 failed**, `exit=0`. São 4 a mais que os 5180 da rodada 2: o C93,
  o *bare runner* e os dois do `.deb`. Nenhum `.skip`, `.only` ou `.todo` entrou na correção, e nenhum teste
  saiu;
- `pnpm lint`: `exit=0`;
- `pnpm typecheck`: `exit=0`, mas o turbo veio do cache (`5 cached, 5 total`, `FULL TURBO`), então foi
  refeito. `pnpm exec turbo typecheck --force` deu `0 cached, 5 successful`, e o `tsc -p tsconfig.json
  --noEmit` da raiz deu `exit=0`;
- `pnpm docs:check`: `docs ok`, `exit=0`;
- `pnpm exec playwright test e2e/update.spec.ts e2e/menubar.spec.ts`: 3 passed (42,7 s). O `ECONNRESET` e o
  `EPIPE` do proxy do vite durante o relançamento são ruído, e os testes passaram.
  `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel carrega a
  página do daemon"`: 1 passed (1,2 s);
- `pnpm smoke:service --only start-waits-for-health`, `--only stop-leaves-nothing`, `--only
  survives-the-caller` e `--only update-relaunches`: os quatro deram exit 0 sob o launchd. Depois,
  `launchctl print gui/501/tech.cazimi.lumem-smoke` responde *Could not find service*, e nada do Lumem sobra
  em `~/Library/LaunchAgents` nem em `launchctl list`;
- `pnpm measure:resources --only ten-sessions`, três vezes: 0,95%, 0,93% e 0,52%, exit 0;
- `pnpm smoke:install --only desktop`: exit 0 em darwin-arm64 (pack, instalação num prefixo descartável,
  `codesign --verify` e a checagem de quarentena). Nenhum processo do app ficou rodando;
- `pnpm smoke:install` (o caminho padrão): exit 0, com "200 text/html" e "v0.6.1";
- o porcelain antes da rodada estava vazio. Depois, só este arquivo:
  ` M docs/features/038-desktop-and-updates/verification.md`.
- `pnpm -s feature:check verification docs/features/038-desktop-and-updates`: `exit=1`, com um erro só, `o veredito é FAIL`. É o que um relatório reprovado deve dar, e nenhuma linha contradiz o veredito.

## Swept

Verified at 32f8aac6.

- **authorization: existing** — confere. `system.updateStatus`, `status`, `update`, `resources`, `live`,
  `settings` e `setSettings` (`packages/server/src/routers/system.ts:29`, `:52`, `:69`, `:105`, `:112`, `:114`
  e `:116`), `usage.total` (`usage.ts:34`), `agentAccount.rateLimits` (`agentAccount.ts:67`) e
  `workspace.recent` (`workspace.ts:28`) são `publicProcedure` (`packages/server/src/trpc.ts:144`), a mesma
  fronteira de todo o `/trpc`.
- **concurrency: C31, C33, C83** — o M1 morre de novo.
- A janela conhecida da S5 continua sem check, e está registrada no `Handoff`: uma passada da esteira já em
  `prepareCheckout` não é turno em voo.

## Riscos

- **C61 com margem estreita.** A mesma prova deu 0,44% e 0,43% na rodada 2, e agora 0,95%, 0,93% e 0,52%. O
  que mudou foi o `ps`: 24 ms por amostra contra 11–12 ms, com 781 processos e carga em torno de 5. O `time
  -p` tem resolução de 10 ms, e ela domina a conta. Passa, mas numa máquina mais cheia pode cruzar 1% sem
  nada ter mudado no código.
- **O passo de Linux do smoke não abre o `.desktop` que o CLI escreveu.** Ele sobe o binário com
  `--no-sandbox` próprio (`scripts/smoke-install.ts:337`). Prova que o pacote abre, e não que o lançador
  gravado abre. É o mesmo buraco por onde o M7 passa.
- O clique do sistema operacional no ícone (macOS) e o `measure:resources` em Linux continuam sem rodar,
  como na rodada 2.

## Quem fecha

Esta é a rodada 3 de três. Pelo procedimento, a lacuna vai ao dono agora, com a correção nomeada. Ela é
pequena e mecânica.

**Ranked gaps:**

1. **O mutante M7 sobrevive** - C93 - `packages/cli/src/menubar.ts:59`, com a tabela em
   `packages/cli/src/menubar.test.ts:204-208`. A menor correção é uma sexta linha na tabela, com o kernel que
   o runner mediu:
   `{ name: "userns_clone 1 and apparmor 1 (Ubuntu 23.10+)", sysctl: { [USERNS]: "1\n", [APPARMOR]: "1\n" }, refused: true, says: "apparmor_restrict_unprivileged_userns=1" }`.
   Com ela o M7 cai, porque devolve `false` nesse caso.
2. **Membro sem prova na Coverage: `userns_clone=1` com `apparmor_restrict=1`** - C93 - o mesmo lugar. Fecha
   com a mesma linha.

Opcional, e fora do veredito: o passo de Linux do `smoke:install` pode **afirmar** o que hoje imprime.
Lançar com `--no-sandbox` se e só se a medição `phase0-q4` deu `refused` faria do run de CI uma prova do C93
em kernel de verdade, e não só um log.

**Do dono, e fora do veredito:** dizer se o gatilho do item do systemd no backlog dispara na primeira tag,
que publica os pacotes de Linux.

**Só documentação, para depois do veredito:** a linha do `verification.md` em `docs/README.md` ainda descreve
a rodada 2.

**Lição (passo 7).** Proposta para *Armadilhas já corrigidas* de `docs/project/testing.md` (o verificador só
escreve este arquivo):

> **Tabela de casos que testa cada botão sozinho deixa passar a combinação que a máquina de verdade tem.**
> O C93 testava `userns_clone=0` e `apparmor=1` cada um com o outro **ausente**, e o Ubuntu tem os dois, com
> `userns_clone=1`. Uma detecção que deixa o botão do Debian decidir sozinho passava na tabela inteira. Um
> run numa máquina real que só **imprime** o valor não pega isso. A regra: **uma tabela sobre botões
> independentes precisa da combinação que a plataforma-alvo entrega, medida, e o run real afirma o que
> mede.**
