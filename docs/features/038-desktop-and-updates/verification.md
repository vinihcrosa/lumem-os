# O Lumem fica de pé sozinho, se atualiza, e mora na barra — verification

## Rodada 1 (reprovada, em `2ab18e3b`)

A rodada 1 leu C1–C85 em `b226b4b..2ab18e3b` e reprovou. As lacunas, na ordem dela:

1. A fiação `paused: () => update.installer.installing()` da esteira do daemon não tinha prova (C83), e o
   mutante F1 sobrevivia. **Fechada na rodada 2.** O mutante morre de novo nesta rodada (M1).
2. A casa decimal do `cpuPercent` só era provada com inteiros, e abaixo do router (C46): o mutante F2.
   **Fechada na rodada 2.** Morre de novo nesta rodada (M2).
3. A metade de Linux do C78 não tinha rodado. **Fechada na rodada 3**, pelo `release.yml` em `dry_run`.
4. Havia membros da Coverage sem prova. Os três blocos do painel foram fechados pelo C86. O `.AppImage` e o
   `.deb` foram fechados na rodada 3. O `systemd --user` de verdade foi adiado pelo dono (seção *Adiado
   pelo dono*).
5. A linha *o serviço de verdade* do `Test policy` só tinha sido cumprida no launchd. A metade do systemd foi
   adiada pelo dono.
6. Havia comportamento construído sem check. **Fechado na rodada 2** pelos checks C87–C92.

## Rodada 2 (reprovada, em `2630a3ee`)

A rodada 2 leu C1–C92 e reprovou só pelo que exige Linux. 91 de 92 checks passaram, e as sete falhas
injetadas morreram. As lacunas, pela ordem:

1. A metade de Linux do C78, e o `.AppImage` e o `.deb` que ninguém tinha produzido. **Fechada na rodada
   3** pelo run 36722841349.
2. A linha *o serviço de verdade* do `Test policy` no `systemd --user`. **Adiada pelo dono** para o backlog.
3. A Q4, aberta. **Respondida (c)**; virou o critério 78 e o C93.

## Rodada 3 (reprovada, em `32f8aac6`)

A rodada 3 leu C1–C93 e reprovou por uma lacuna de teste, e não de comportamento. O CI tinha provado a
metade de Linux do C78 e produzido os artefatos. As lacunas, pela ordem:

1. **O mutante M7 sobrevivia** (C93, `packages/cli/src/menubar.ts:59`): *"o botão do Debian, quando
   existe, decide sozinho"*. **Fechada em `2d624cda`:** a tabela ganhou a linha do Ubuntu 23.10+, e o M7
   morre nesta rodada.
2. **Um membro da Coverage sem prova:** `userns_clone=1` com `apparmor_restrict=1`, o kernel do runner.
   **Fechado pela mesma linha.**

Do dono, a rodada 3 pediu uma resposta: o gatilho do item do systemd no backlog dispara na primeira tag?
A resposta está em *Adiado pelo dono*.

## Rodada 4

**Verdict**: FAIL
**Profile**: standard
**Diff range**: b226b4b..2d624cda (desde a rodada 3: `32f8aac6..2d624cda`, um commit, `2d624cda`)
**Round**: 4 - full
**Verifier**: independent sub-agent (author != verifier)

A rodada é inteira, autorizada pelo dono depois do limite de três. Os 93 checks (C1–C93) foram lidos no
`HEAD` `2d624cda`, e todas as provas rodaram de novo nesse commit. Cada citação abaixo foi impressa linha a
linha no `HEAD`. Tudo aqui é `verified at 2d624cda`, salvo o run do CI, que é de `32f8aac6`. A seção *A
evidência do CI* mostra por que ele vale para o `HEAD`.

A máquina é um macOS arm64 (Darwin 27), com o Node do `.nvmrc` (`v22.17.1`) e o launchd de verdade.

**O que mudou desde a rodada 3.** Entre `32f8aac6` e o `HEAD` só mudou uma coisa fora de `docs/`: três
linhas em `packages/cli/src/menubar.test.ts`, a sexta linha da tabela do C93 e um comentário. O resto é
documentação: a lição em `docs/project/testing.md`, a linha do `docs/README.md` e o *Fix round 4* do
`Handoff`. `git diff --stat 32f8aac6 HEAD -- . ':(exclude)docs' ':(exclude)**/*.test.ts'` sai vazio.

**O veredito é FAIL, de novo por uma lacuna de teste, e de novo no C93.** A correção fechou o caso que a
rodada 3 nomeou, e o M7 morre. O espelho dele sobrevive: o mutante M11, *"o botão do AppArmor, quando
existe, decide sozinho"*.

- Ele só erra num canto que a tabela não tem: `unprivileged_userns_clone=0` com
  `apparmor_restrict_unprivileged_userns=0`. É o kernel do runner com os dois sysctls do administrador: a
  restrição do AppArmor desligada (o contorno comum) e os user namespaces desligados (o endurecimento
  comum).
- Nesse kernel, o mutante não grava `--no-sandbox`, e o app aborta ao abrir.
- Ele passa pela prova do C93, pela suíte inteira do CLI (115 de 115) e pelos testes de `scripts/`.

O `HEAD` acerta nesse kernel: `probeSandbox` devolve `refused: true`. Mas nenhuma asserção o afirma.

A lição é a mesma da rodada 3, um passo adiante. A tabela cobre 6 dos 9 estados que o AC 78 define: dois
botões, cada um `0`, `1` ou ausente. Fechar o exemplo nomeado deixou o espelho aberto.

## Binding sources

Verified at 2d624cda. O passo 1 não se aplica: o perfil é `standard`, e esse passo só roda sob `ui`. O
plano não marca nenhuma fonte como *binding*. Os três ADRs de 2026-09-29 e a discovery estão em
`Sources`, e nenhum check os contradiz. O critério 78 e o C93 concordam com a resposta (c) da Q4 em
`open-questions.md:128`.

## Checks

Verified at 2d624cda. As provas rodaram numa invocação por pacote, com `--reporter=verbose`, sobre os
arquivos inteiros que os checks nomeiam:

| Pacote | Arquivos | Resultado |
| --- | --- | --- |
| `packages/cli` | `service`, `run`, `args`, `port`, `upgrade` e `menubar` | 6 files, **105 passed** |
| `packages/server` | 16 arquivos | **286 passed** |
| `packages/web` | 5 arquivos | **44 passed** |
| `packages/desktop` | 6 arquivos | **45 passed** |
| `packages/shared` | `desktop.test.ts` | **5 passed** |
| `scripts` | `smoke-install`, `release-workflow`, `set-version` e `package-boundaries` | **22 passed** |

Os números são os da rodada 3. A linha nova do C93 mora dentro do mesmo `it`, então não conta como teste a
mais.

Os 104 nomes distintos que os `-t` do `checks.md` pedem foram extraídos do arquivo e procurados um a um na
saída (`grep -F`). O nome do C62 e o do C90 se repetem. Todos aparecem com `✓`, e nenhum com `×`. O `fails
alone when` do C86 casa os três casos do `it.each`. O `o .deb do app de desktop` do C78 casa os dois testes
do `describe`. Nenhum filtro caiu no vazio. As provas que não são vitest rodaram como estão escritas (seção
*Gate*).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | plist do launchd com PATH, supervisor, KeepAlive e logs | service.test ✓ | `packages/cli/src/service.test.ts:141` - `expect(parsePlist(files.get(PLIST)!)).toEqual({ … })`; a ordem em `:160` | PASS |
| C2 | unit do systemd; `daemon-reload` e `enable --now`, nessa ordem | service.test ✓ | `packages/cli/src/service.test.ts:215` - `toContain("ExecStart=/opt/node/bin/node … run\n")`; `:223` - `expect(systemctl.slice(-3)).toEqual([…])`, e o M10 morre ali | PASS |
| C3 | reescreve o arquivo existente antes de carregar | service.test ✓ | `packages/cli/src/service.test.ts:248` - `expect(rewritten.ProgramArguments).toEqual(["/novo/bin/node", "/novo/lib/lumem.mjs", "run"])` | PASS |
| C4 | sai 0 no health; sai 1 com as últimas 20 linhas em 15 s | run.test ✓; `smoke:service --only start-waits-for-health` exit 0 | `packages/cli/src/run.test.ts:329` - `toBe(1)`; `:332` - `toContain("linha 30")`; `:335` - `toBeGreaterThanOrEqual(15_000)`; `scripts/smoke-service.ts:142` - `assert(health?.ok === true, …)` (saída: "saiu 0 e o health já respondia (v0.6.1)") | PASS |
| C5 | sem supervisor: sai 1, não escreve nada, cita `lumem run` | service.test ✓ | `packages/cli/src/service.test.ts:359` - `toEqual({ ok: false, reason: expect.stringContaining("lumem run") })`; `:361` - `files.size` 0 | PASS |
| C6 | outro Lumem fora do serviço: sai 1 | run.test ✓ | `packages/cli/src/run.test.ts:353` - `toContain("fora do serviço")` | PASS |
| C7 | sem verbo é `start`; `run` com as quatro opções | args.test ✓ | `packages/cli/src/args.test.ts:24` - `expect(parseCommand([])).toEqual(start)`; `:30` - `toEqual({ kind: "run", port: 5_000, host: "0.0.0.0", stateDir: "/tmp/x", open: true })` | PASS |
| C8 | `lumem run` é o primeiro plano de antes | run.test ✓ | `packages/cli/src/run.test.ts:292` - `toContain("já tem um Lumem em http://127.0.0.1:4317")`; `:296` - `toBe(1)` | PASS |
| C9 | stop: `bootout` e apaga o plist, ou `disable --now`; 0 ou 1 em 10 s | service.test ✓; `smoke:service --only stop-leaves-nothing` exit 0 | `packages/cli/src/service.test.ts:378` - `toContain("launchctl bootout gui/501/tech.cazimi.lumem")`; `:412` - `reason` com `"10 s"`; `scripts/smoke-service.ts:156` - `assert((await readHealth()) === null, …)` (saída: "parou, descarregou e não deixou item de login") | PASS |
| C10 | status: uma linha, 0 ou 3 | run.test ✓ | `packages/cli/src/run.test.ts:473` - `toEqual(["rodando · v0.7.0 · http://127.0.0.1:4317 · supervisionado"])`; `:478` `em primeiro plano`; `parado` e 3 logo abaixo | PASS |
| C11 | logs: 200 de 250, e `-f` segue | run.test ✓ | `packages/cli/src/run.test.ts:510` - `expect(out[0]).toBe("linha 51")`; `:530` - `toEqual(["linha 251", "linha 252"])` | PASS |
| C12 | logs sem arquivo: sai 1 com o caminho | run.test ✓ | `packages/cli/src/run.test.ts:536` - `toContain(join(stateDir, "daemon.log"))` | PASS |
| C13 | `supervised` vem de `LUMEM_SUPERVISOR` | health.test ✓ | `packages/server/src/routers/health.test.ts:27` e `:29` - `true` para `launchd` e `systemd`; `:31`, `:35` e `:37` - `false` sem ela, com `supervisord` e com vazio | PASS |
| C14 | `protocolVersion: 1`; o `probePort` segue lendo | health.test ✓; port.test ✓ | `packages/server/src/routers/health.test.ts:41` - `toEqual({ … protocolVersion: 1 })`; `packages/cli/src/port.test.ts:40` | PASS |
| C15 | sobrevive ao chamador e responde `supervised: true` | `smoke:service --only survives-the-caller` exit 0 | `scripts/smoke-service.ts:185` - `assert(health.supervised === true, …)` (saída: "o chamador morreu, e o daemon seguiu respondendo supervised: true"). Sob o launchd | PASS |
| C16 | o smoke sobe com `lumem run` | smoke-install.test ✓ | `scripts/smoke-install.test.ts:15` - `expect(args).toEqual(["run", "--port", "4397"])` | PASS |
| C17 | registry no boot e a cada 6 h, só com `accept` | check.test ✓ | `packages/server/src/update/check.test.ts:71-72` - `toBe(REGISTRY)` e `headers` `{ accept: "application/json" }`; `:78` - duas chamadas | PASS |
| C18 | `updateStatus`: `current`, nulos antes da primeira verificação, e os três `updateAvailable` | system.test ✓ | `packages/server/src/routers/system.test.ts:63` - `toEqual({ … })`; `:78`, `:85`, `:91` | PASS |
| C19 | timeout, 503 e corpo sem `version` mantêm o anterior, com um `warn` cada | check.test ✓ | `packages/server/src/update/check.test.ts:110` - `toEqual(good)`; `:122` `sem versão`; `:133` - `toHaveBeenCalledWith(10_000)` | PASS |
| C20 | verificação desligada: nenhuma requisição, `checkEnabled: false` | check.test ✓ | `packages/server/src/update/check.test.ts:193` e `:199` - `checkEnabled()` false; `:201` - `asked` não chamado | PASS |
| C21 | `updateCheckForcedOff` e o interruptor desabilitado com o texto | system.test ✓; UpdateSettings.test ✓ | `packages/server/src/routers/system.test.ts:115`; `packages/web/src/features/settings/UpdateSettings.test.tsx:41` `toBeDisabled()` e `:43` `desligado por LUMEM_NO_UPDATE_CHECK` | PASS |
| C22 | `setSettings` grava a única linha | system.test ✓ | `packages/server/src/routers/system.test.ts:138` - `toEqual([…])` da tabela inteira | PASS |
| C23 | `autoUpdate: "always"`: `BAD_REQUEST`, linha intacta | system.test ✓ | `packages/server/src/routers/system.test.ts:154` - `rejects.toMatchObject({ code: "BAD_REQUEST" })`; `:157` | PASS |
| C24 | migração: uma linha com os padrões; o CHECK recusa | daemon-settings.test ✓ | `packages/server/src/db/daemon-settings.test.ts:52` - `toEqual([…])`; `:56` - o `INSERT` de `id = 2` recusado | PASS |
| C25 | topbar `v0.6.1 → v0.7.0` e o botão; nada sem versão nova | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:39` - `findByText("v0.6.1 → v0.7.0")`; `:48` - `toBeEmptyDOMElement()` | PASS |
| C26 | sem supervisor, `lumem upgrade` no lugar do botão | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:59` - `getByText("lumem upgrade")` | PASS |
| C27 | update fecha a porta, instala com o dono, `started: true` | system.test ✓ | `packages/server/src/routers/system.test.ts:169` - `toEqual({ started: true })`; `:176` - a porta antes do instalador | PASS |
| C28 | instalação 0: sai por `createShutdownHandler` com 0 | install.test ✓ | `packages/server/src/update/install.test.ts:44` - `toHaveBeenCalledWith(0)`; `:53` - `close` antes de `exit` | PASS |
| C29 | instalação 1 ou `ENOENT`: reabre a porta, não sai, e `lastError` | install.test ✓; system.test ✓ | `packages/server/src/update/install.test.ts:78` e `:93` - `lastError()` com `"1"` e com `"spawn npm ENOENT"`; `:81` e `:95` - `exit` não chamado; `packages/server/src/routers/system.test.ts:239` - `updateStatus().lastError` com `"1"` | PASS |
| C30 | 2 turnos e 1 script: `CONFLICT` com os números | system.test ✓ | `packages/server/src/routers/system.test.ts:189-195` - `code: "CONFLICT"`, a mensagem com os números, e o instalador não chamado | PASS |
| C31 | segundo update: `CONFLICT` | system.test ✓ | `packages/server/src/routers/system.test.ts:205` e `:207` | PASS |
| C32 | sem supervisor ou sem versão nova: `PRECONDITION_FAILED` | system.test ✓ | `packages/server/src/routers/system.test.ts:216`, `:224` e `:226` | PASS |
| C33 | prompt recusado durante a instalação, e nada chega ao agente | AcpManager.test ✓ | `packages/server/src/acp/AcpManager.test.ts:504` - `rejects.toThrow(…)`; `:510` - `promptBlocks` `[]` | PASS |
| C34 | copia antes de migrar e grava a versão depois | backup.test ✓ | `packages/server/src/db/backup.test.ts:95-96` - a cópia tem só a tabela de antes; `:103` - `"0.7.0"` | PASS |
| C35 | mantém as 3 mais novas | backup.test ✓ | `packages/server/src/db/backup.test.ts:149` | PASS |
| C36 | sem `last-version` não copia; migração que falha não grava | backup.test ✓ | `packages/server/src/db/backup.test.ts:184`, `:196` e `:206` | PASS |
| C37 | recarrega uma vez e diz `Lumem atualizado para v0.7.0` | useVersionReload.test ✓; `playwright test e2e/update.spec.ts` ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:26` e `:33`; `e2e/update.spec.ts:64` - `getByText(\`Lumem atualizado para v${NEW_VERSION}\`)` | PASS |
| C38 | não recarrega duas vezes na mesma aba | useVersionReload.test ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:54` - `toHaveBeenCalledTimes(1)` | PASS |
| C39 | upgrade reinicia o serviço e imprime a versão de depois | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:165` `kickstart -k`; `:168` `v0.2.0`; `:177` `systemctl --user restart` | PASS |
| C40 | o daemon real volta na versão nova sem `lumem start` | `smoke:service --only update-relaunches` exit 0 | `scripts/smoke-service.ts:318` - `health?.version === NEW_VERSION`; `:328` - `supervised === true` (saída: "o supervisor subiu o daemon de novo, na v0.99.0, sem ninguém rodar `lumem start`"). Sob o launchd | PASS |
| C41 | a página recarregada carrega os assets novos, e não fica em branco | `playwright test e2e/update.spec.ts` ✓ (20,9 s) | `e2e/update.spec.ts:69` - `#root > *` > 0; `:72` - os assets novos | PASS |
| C42 | `usage.total` soma todos os workspaces; `cost` nulo quando todos são nulos | usage.test ✓ ×2 | `packages/server/src/routers/usage.test.ts:157` - `toEqual({ tokens: 7_500, cost: 1.75, currency: "USD", turns: 4 })`; `:172` - a metade do nulo | PASS |
| C43 | uma instrução SQL para 1, 3 e 10 workspaces | usage.test ✓ | `packages/server/src/routers/usage.test.ts:214` - `expect(counts).toEqual([1, 1, 1])` | PASS |
| C44 | `period` desconhecido: `BAD_REQUEST` | usage.test ✓ | `packages/server/src/routers/usage.test.ts:220-223` - `rejects.toMatchObject({ code: "BAD_REQUEST" })` | PASS |
| C45 | o relato mais recente, sem a conta que não relatou | agentAccount.test ✓ | `packages/server/src/routers/agentAccount.test.ts:420` - `resolves.toEqual([…])` | PASS |
| C46 | grupos com `cpuPercent` em uma casa decimal; `top` de 5 | sample.test ✓; system.test ✓ | `packages/server/src/resources/sample.test.ts:156` - `decimals.groups`; `:161` - o `top`; `:127` - o top 5; `packages/server/src/routers/system.test.ts:295` - `toBe(1.6)`, e `:296`. O M2 morre nos dois | PASS |
| C47 | atribui ao ancestral rastreado mais próximo | attribute.test ✓ | `packages/server/src/resources/attribute.test.ts:35` `"agents"`, `:39` `"terminals"`, `:41` `"daemon"` | PASS |
| C48 | 1,0 s → 1,5 s em 5 s dá `10.0`; na primeira amostra, `null` | sample.test ✓ | `packages/server/src/resources/sample.test.ts:177` - `cpuPercent: null`; `:182` - `cpuPercent: 10` | PASS |
| C49 | 15 s sem pergunta: para de ler; a próxima consulta volta | sample.test ✓ | `packages/server/src/resources/sample.test.ts:217` - `toBe(afterQuiet)`; `:222` `afterQuiet + 1` | PASS |
| C50 | rótulo por sessão e checkout | sample.test ✓ | `packages/server/src/resources/sample.test.ts:261` - `toBe("Claude · lumem-os/bandung")`; `:262`; `:266` `"node"` | PASS |
| C51 | `ps` no darwin e `/proc` no Linux, de amostras gravadas | process-table.test ✓ | `packages/server/src/resources/process-table.test.ts:152` e `:185` - `toEqual([…])` das duas | PASS |
| C52 | `system.status`: seis campos, e `attention` com permissão pendente | system.test ✓ | `packages/server/src/routers/system.test.ts:327` - `resolves.toEqual({ … })`; `:345` - `{ liveTurns: 1, attention: true }` | PASS |
| C53 | manchete `87%`, o `kind` e o tempo até o reset | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:83` `87%`; `:85` `reseta em 2 h` | PASS |
| C54 | sem cota, o custo do dia; custo nulo, os tokens | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:98` `US$ 1,75` e `:100` `{ period: "1d" }`; `:108` `48,2k tokens` | PASS |
| C55 | ordem dos blocos, linha de versão e ações | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:135` - as regiões na ordem; `:162`; `:167` os botões; `:186` `em dia · verificado há 3 min` | PASS |
| C56 | sem sessão, `nenhuma sessão rodando` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:196` | PASS |
| C57 | recursos falhando: só esse bloco diz | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:211` e `:217` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C58 | `2 terminais abertos fecham ao atualizar` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:276` | PASS |
| C59 | `routeOf("/menubar")` e `GET /menubar` com 200 | route.test ✓; static.test ✓ | `packages/web/src/lib/route.test.ts:24`; `packages/server/src/web/static.test.ts:91` `200` e `:93` o shell | PASS |
| C60 | `/menubar` numa aba mostra os três blocos | `playwright test e2e/menubar.spec.ts` ✓ (16,3 s) | `e2e/menubar.spec.ts:73` - número na manchete; `:89` - `/\d+,\d%/` no Daemon | PASS |
| C61 | medir a cada 3 s com 10 sessões custa menos de 1% | `measure:resources --only ten-sessions` três vezes, exit 0 | `packages/server/src/testing/measure-resources.ts:92` - `percent < LIMIT_PERCENT`. Saídas: **0,61%**, **0,48%** e **0,68%** (699 processos; 3,3–3,5 ms do daemon e 11–17 ms do `ps` por amostra). Só no macOS | PASS |
| C62 | `menubar install` nas quatro plataformas, e o `lumem-desktop.json` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:119` - `toContain(\`install npm install --global ${desktopPackageName(key)}@${VERSION}\`)`; `:122` - o JSON inteiro | PASS |
| C63 | `~/Applications/Lumem.app`; os dois `.desktop` | menubar.test ✓ | `packages/cli/src/menubar.test.ts:173-174` - `rm -rf` e `ditto`; `:192-194` - `Exec=… --panel`, e o autostart sem ele | PASS |
| C64 | `win32-x64` e `linux-ia32`: sai 1 e lista as quatro | menubar.test ✓ | `packages/cli/src/menubar.test.ts:254` `toBe(1)`; `:259` as quatro no erro | PASS |
| C65 | upgrade leva o pacote do app e recopia no macOS | upgrade.test ✓ | `packages/cli/src/upgrade.test.ts:245-252` | PASS |
| C66 | uninstall remove o pacote, o app ou os `.desktop`, e o item de login | menubar.test ✓ | `packages/cli/src/menubar.test.ts:309` - `expect(app).toBeGreaterThan(login)`; `:318-321` no Linux | PASS |
| C67 | `openAtLogin: true` e um só ícone | main.test ✓ | `packages/desktop/src/main.test.ts:220-221` | PASS |
| C68 | health e status a cada 10 s | poll.test ✓ | `packages/desktop/src/poll.test.ts:55` - `toEqual(["/trpc/health", "/trpc/system.status"])` | PASS |
| C69 | a tabela de 5 entradas do ícone | tray-state.test ✓ | `packages/desktop/src/tray-state.test.ts:30` `stopped`; `:33`, `:37` e `:38` `attention`; `:41` `update`; `:44` `running`. O M8 morre em `:33` | PASS |
| C70 | clique: janela de 360×520 sem moldura em `/menubar`, que esconde de novo e no blur | windows.test ✓ | `packages/desktop/src/windows.test.ts:142` - `toMatchObject({ width: 360, height: 520, frame: false })`; `:163` - `visible` false | PASS |
| C71 | o menu na ordem, e `Atualizar` só com versão nova | menu.test ✓ | `packages/desktop/src/menu.test.ts:38` - os rótulos na ordem; `:51` - `Atualizar` habilitado | PASS |
| C72 | uma janela principal, focada na segunda vez | windows.test ✓ | `packages/desktop/src/windows.test.ts:232` - `FakeWindow.all` com 1 | PASS |
| C73 | Iniciar e Parar com os caminhos gravados | commands.test ✓ | `packages/desktop/src/commands.test.ts:28` | PASS |
| C74 | daemon parado: a página local | windows.test ✓ | `packages/desktop/src/windows.test.ts:254` - `toEqual([\`file:${STOPPED_PAGE}\`])` | PASS |
| C75 | protocolo diferente: a linha de incompatível | menu.test ✓ | `packages/desktop/src/menu.test.ts:94` | PASS |
| C76 | toda janela travada na origem | windows.test ✓ | `packages/desktop/src/windows.test.ts:295` - `webPreferences`; `:304` e `:309` - `navigate` cancelado; `:317` - `external` | PASS |
| C77 | Electron de verdade: o ícone, e o painel em `/menubar` | `playwright test e2e/app.spec.ts -g …` ✓ (2,4 s) | `packages/desktop/e2e/app.spec.ts:96` - `toHaveURL(\`${DAEMON}/menubar\`)`; `:105` - `[360, 520]` | PASS |
| C78 | o release publica os 4 pacotes e anexa zip, AppImage e deb; o smoke roda no macOS e no Linux | release-workflow.test ✓ ×3; smoke-install.test ✓; `smoke:install --only desktop` exit 0 aqui (darwin-arm64) e no CI (`app (darwin-arm64)` e `app (linux-x64)`, run 36722841349) | `scripts/release-workflow.test.ts:53`, `:72` e `:83` - a matriz, o `--provenance` e `desktop/assets/*.{zip,AppImage,deb}`; `:120` - `homepage`; `:124` - o mantenedor; `scripts/smoke-install.test.ts:52` - `expect(fromWorkspace).toEqual([])`; `scripts/smoke-install.ts:314` - `codesign --verify` (saída aqui: "ad-hoc, e confere"); `scripts/smoke-install.ts:344` - lança se nenhuma janela pediu `/menubar` (saída do CI em Linux: "a janela carregou /menubar") | PASS |
| C79 | `version:set` escreve o manifesto do app; o desktop só importa do shared | set-version.test ✓; package-boundaries.test ✓ | `scripts/set-version.test.ts:46`; `scripts/package-boundaries.test.ts:152` - `toBe("")` | PASS |
| C80 | o tique ocioso só instala com `idle` | auto.test ✓ | `packages/server/src/update/auto.test.ts:109` - `off` não instala; `:120` - `idle` instala uma vez | PASS |
| C81 | esperando, aceita prompt e a esteira anda; instala depois do `turn_end` | auto.test ✓ | `packages/server/src/update/auto.test.ts:192`, `:196` e `:201`; `:215` | PASS |
| C82 | não cruza major depois da 1.0 | auto.test ✓ | `packages/server/src/update/auto.test.ts:228` - `across.install` não chamado; `:240` - o minor instala. O M9 morre em `:228` | PASS |
| C83 | durante a instalação automática a esteira não despacha | auto.test ✓; bootstrap.test ✓ | `packages/server/src/bootstrap.test.ts:308` - `[workspace.id]` antes; `:312` - a instalação começou; `:318` - `expect(dispatched).toEqual([workspace.id])` depois; `packages/server/src/update/auto.test.ts:290`. O M1 morre | PASS |
| C84 | `Atualizar sozinho quando ocioso`, desabilitado sem supervisor | UpdateSettings.test ✓ | `packages/web/src/features/settings/UpdateSettings.test.tsx:85` `toBeDisabled()` e `:87` o texto; `:104` - `{ autoUpdate: "idle" }` | PASS |
| C85 | o caminho estável sob um store versionado | service.test ✓ | `packages/cli/src/service.test.ts:175` - `programArguments(...)` com o symlink, sem ele e sob npm | PASS |
| C86 | `Consumo`, `Turnos em voo` e `Versão` falham cada um sozinho | MenubarScreen.test ✓ ×3 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:262` - `findByText(block.says)`; `:266` - ausente nos outros; `:268` - `getAllByText(/não consegui ler/)` com 1 | PASS |
| C87 | `system.live`: só os turnos em voo, com `label` e `startedAt` ISO, e `openTerminals` | system.test ✓ | `packages/server/src/routers/system.test.ts:404` - `{ turns: [], openTerminals: 0 }`; `:414` - `toEqual([…])`; `:417` ISO; `:419` - `openTerminals` 2 | PASS |
| C88 | `workspace.recent`: os três mais novos em ordem; a worktree conta; vazio sem sessão | workspace.test ✓ ×2 | `packages/server/src/routers/workspace.test.ts:396` - `toEqual([…])`; `:407` - `resolves.toEqual([])` | PASS |
| C89 | `menubar open` roda o app com `--panel`; sem app, sai 1 | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:279` - `toEqual(["/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --panel"])`; `:283` o do Linux; `:289` `toBe(1)`, `:291` `lumem menubar install` e `:292` nada rodou | PASS |
| C90 | `lumem-desktop.json` na pasta de dados, reescrito a cada install, e o app o lê de lá | menubar.test ✓ ×2; desktop.test ✓; main.test ✓ ×2 | `packages/cli/src/menubar.test.ts:122` - o JSON na pasta de dados; `:150` - reescrito; `packages/shared/src/desktop.test.ts:28` e `:36`; `packages/desktop/src/main.test.ts:293` - `expect(read, platform).toEqual([expected])`; `:323` e `:325` - sem config, diz `lumem menubar install` e sai | PASS |
| C91 | o painel recarrega uma vez quando o daemon muda de versão; com a versão igual, não | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:363` e `:369` - `reload` uma vez só; `:381` - `not.toHaveBeenCalled()` | PASS |
| C92 | install com o gerenciador falhando devolve o código, não grava e não abre o app | menubar.test ✓ | `packages/cli/src/menubar.test.ts:266` - `toBe(13)`; `:269` - nenhum `write`; `:270` - `launched` `[]` | PASS |
| C93 | `--no-sandbox` nos dois `.desktop` só onde o kernel nega o sandbox, e a saída diz por quê | menubar.test `adds no-sandbox only where the kernel refuses the sandbox` ✓ | `packages/cli/src/menubar.test.ts:224-227` - `Exec="…" --no-sandbox --panel\n` no lançador, `--no-sandbox\n` no autostart e uma linha com o porquê; `:229-232` - sem a flag e sem linha; a linha nova em `:211` (`userns_clone 1 and apparmor 1`), onde o M7 agora morre. A tabela não tem `userns_clone 0` com `apparmor 0` (o M11 vive, *Coverage*) | PASS - a prova roda e afirma os seis casos que tem. O que reprova é a Coverage e o M11 |

## Coverage

Verified at 2d624cda. Cada conjunto foi recalculado a partir da própria autoridade, e não relido da tabela
do `checks.md`:

- as rotas e as saídas do CLI vêm do `## Surface` do `prd.md`;
- as portas vêm do `## Landing`;
- os blocos do painel vêm do AC 50;
- as plataformas e os artefatos vêm dos AC 68 e 69;
- os estados do kernel vêm do AC 78: dois arquivos em `/proc/sys/kernel`, cada um `0`, `1` ou ausente, o
  que dá nove estados. O runner tem os dois arquivos, então os nove são alcançáveis num kernel de verdade
  com `sysctl -w`.

Nem o `prd.md` nem código nenhum mudou desde `32f8aac6`. Por isso, nos conjuntos cuja autoridade é o
código ou o plano, o recálculo deu os mesmos membros da rodada 3. O de estados do kernel foi refeito do
zero, e desta vez sobre os nove estados, e não sobre os casos que a tabela tinha.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas do `Surface` e seus status (11 rotas) | `prd.md` `## Surface` | `health` 200 C13 · `updateStatus` 200 C18 · `update` 200 C27, 409 C30/C31, 412 C32 · `status` 200 C52 · `resources` 200 C46 (router) · `settings`/`setSettings` 200 C22, 400 C23 · `usage.total` 200 C42, 400 C44 · `rateLimits` 200 C45 · `system.live` 200 C87 · `workspace.recent` 200 C88 · `GET /menubar` 200 C59 | - |
| verbos do CLI (10) | `prd.md` `Surface`, tabela do CLI | `start` C4 · sem verbo C7 · `run` C8 · `stop` C9 · `status` C10 · `logs` C11 · `upgrade` C39 · `menubar install` C62 · `menubar open` C89 · `menubar uninstall` C66 | - |
| saídas do CLI que não são 0 (12) | `prd.md` `Surface`, tabela do CLI | `start` 1: C5, C6 e C4 · `stop` 1: C9 · `status` 3: C10 · `logs` 1: C12 · `menubar install` 1: C64 · `menubar install` com o código do gerenciador: C92 · `menubar open` 1: C89 · `upgrade` 1: `packages/cli/src/upgrade.test.ts:87` e `:206` · `upgrade` com o código do gerenciador: `:94` e `:195` · `menubar uninstall` com o código do gerenciador: `packages/cli/src/menubar.test.ts:335`. `open` e `uninstall` fora das quatro passam pela recusa única de `packages/cli/src/menubar.ts:138` | - |
| portas de mão única (9) | `prd.md` `## Landing` | 1 C7 · 2 C1 · 3 C24 · 4 C14 · 5 C62 · 6 C79 · 7 C34 · 8 C27 · 9 C90 | - |
| supervisores, escritor de serviço (2) | `prd.md` porta 2 | launchd C1 · systemd C2 (e o M10 morre) | - |
| supervisor de verdade que esta feature deve (1, depois da decisão do dono) | `checks.md` `Test policy`, linha *o serviço de verdade*, com o adiamento em `docs/project/backlog.md:796` | launchd: os quatro passos do `pnpm smoke:service`, exit 0 aqui (C4, C9, C15 e C40). O systemd `--user` saiu do conjunto por decisão do dono, e não por prova (seção *Adiado pelo dono*) | - |
| layout do gerenciador global (3) | `prd.md` AC 77 | npm, pnpm com o symlink e pnpm sem ele: C85 | - |
| plataformas do app no install (4) | `prd.md` porta 5 | as quatro, C62, num laço sobre `DESKTOP_PLATFORMS` | - |
| as duas metades do AC 69 (2) | `prd.md` AC 69 | macOS: `pnpm smoke:install --only desktop`, exit 0 aqui e no job `app (darwin-arm64)` · Linux: o mesmo comando no job `app (linux-x64)`, com "a janela carregou /menubar" (`scripts/smoke-install.ts:344`) | - |
| artefatos do release (3 tipos × arquitetura) | `prd.md` AC 68 | `.zip` construído no CI (`app (darwin-*)`) e aqui · `.AppImage` e `.deb` construídos no CI (`building target=AppImage … Lumem-0.6.1-linux-x86_64.AppImage`, `building target=deb … Lumem-0.6.1-linux-amd64.deb`). O anexo pelo `gh release create` só roda numa tag, e o texto dele é afirmado (`scripts/release-workflow.test.ts:83`) | - |
| estados do kernel para o sandbox (9: `userns_clone` × `apparmor_restrict`, cada um `0`, `1` ou ausente) | `prd.md:281` (AC 78); `packages/cli/src/menubar.ts:56-59` | afirmados em `packages/cli/src/menubar.test.ts:204-211`: `(1, 0)` libera · `(ausente, ausente)` libera · `(0, ausente)` nega · `(ausente, 1)` nega · `(0, 1)` nega · `(1, 1)` nega (a linha nova; o M7 morre). **Três sem asserção:** `(0, 0)` nega; o M11 vive exatamente aí. `(1, ausente)` e `(ausente, 0)` liberam, sem caso | `(0, 0)` - o M11 sobrevive; `(1, ausente)` e `(ausente, 0)` - sem caso |
| os dois `.desktop` do Linux (2) | `prd.md` AC 54 e 78 | lançador e autostart, com e sem a flag: C93 (`:224-225` e `:229-230`) | - |
| estados do ícone (4) e linhas da tabela (5) | `prd.md` AC 60 | as cinco linhas, C69 (e o M8 morre) | - |
| itens do menu (6) | `prd.md` AC 62 | os seis, C71 | - |
| blocos do `/menubar` que falham sozinhos (4) | `prd.md` AC 50 | `Consumo` C86 · `Turnos em voo` C86 · `Recursos` C57 · `Versão` C86 | - |
| bloqueios do `system.update` (5) | `prd.md` AC 27–29 | turno C30 · script C30 · instalação em curso C31 · sem supervisor C32 · sem versão nova C32 | - |
| falhas do registry (3) | `prd.md` AC 17 | timeout, não 2xx e sem `version`: C19 | - |
| desfechos da instalação (3) | `prd.md` AC 25–26 | 0: C28 · não zero: C29 · falha ao nascer: C29 | - |
| grupos de recursos (3) | `prd.md` AC 41 | `daemon`, `agents` e `terminals`: C47 | - |
| manchete do painel (3) | `prd.md` AC 46–47 | cota C53 · custo C54 · tokens C54 | - |
| valores de `auto_update` (3) | `prd.md` porta 3 | `off` C80 · `idle` C80 · inválido C23 (tRPC) e C24 (CHECK) | - |
| regra do major no tique (2 lados) | `prd.md` AC 74 | `1.4.0 → 2.0.0` não instala e `0.6.1 → 0.7.0` instala: C82 (e o M9 morre) | - |
| esteira pausada durante a instalação (2 montagens) | `runConveyorLoop` em `packages/server/src/bootstrap.ts:568`, e a do teste | a do teste: C83 (`auto.test.ts`) · a do daemon: C83 (`bootstrap.test.ts:258`), e o M1 morre | - |
| startup config `LUMEM_SUPERVISOR` (2 montagens) | lida em cada montagem | o serviço de verdade: `scripts/smoke-service.ts:185` viu `supervised: true` (C15, launchd) · o harness do router: C13 | - |

**Por que os três estados contam, e não só o que tem mutante.** O AC 78 diz *"`0` **ou** `1` … e nenhum
`--no-sandbox` **de outro jeito**"*. O conjunto que ele decide é o dos nove estados, e não o dos casos que a
tabela escolheu. Dois dos três sem caso liberam, e não achei mutante plausível que erre só neles. Por isso o
M11 vem primeiro nas lacunas. Mas cada estado sem caso é um membro sem prova.

A rodada 3 contou este conjunto como *"os cinco casos da tabela, mais o do Ubuntu"*. Por isso a correção
fechou um membro, e não o conjunto. A tabela de nove linhas custa três linhas e fecha a classe.

Um caminho que o C93 não nomeia, e que por isso não conta como membro: `lumem upgrade` também escreve os
dois `.desktop`, por `takeDesktopAlong` → `placeApp` (`packages/cli/src/menubar.ts:190` e `:214-222`).
Nenhum teste afirma o `--no-sandbox` por esse caminho. O AC 78 só fala do `menubar install`, e a função é a
mesma. Fica como nota, como na rodada 3.

## Test policy rows

Verified at 2d624cda. Nenhum arquivo que estas linhas classificam mudou desde a rodada 3. Os vereditos
foram refeitos com as provas rodadas neste `HEAD`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `packages/desktop`, decide | `tray-state.ts`, `menu.ts`, `windows.ts`, `commands.ts` | vitest com o `electron` dublado: `packages/desktop/src/tray-state.test.ts:30`, `menu.test.ts:38`, `windows.test.ts:295` e `commands.test.ts:28` | yes - as 5 linhas do ícone (C69) e os 6 itens do menu (C71), cada um com asserção; o M8 prova que a precedência é afirmada |
| `packages/desktop`, a casca inteira | `main.ts`, `index.ts`, `preload.ts`, `assets/stopped.html` | um e2e com `_electron.launch`: `packages/desktop/e2e/app.spec.ts:65`, rodado aqui | yes - sobe, cria o ícone, e o painel carrega `/menubar` (macOS); em Linux, o app empacotado subiu sob `xvfb` pelo job `app (linux-x64)` (C78) |
| `packages/cli`, escritor de serviço | `service.ts` e os verbos de serviço de `run.ts` | vitest com `launchctl`, `systemctl` e o disco dublados | yes - o conteúdo por supervisor (C1, C2), a ordem (`service.test.ts:160` e `:223`, onde o M10 morre) e cada recusa (C5, C6, C9) |
| `packages/cli`, o serviço de verdade | `service.ts` contra o supervisor do sistema | `pnpm smoke:service`, local | yes, sob o launchd - os quatro passos (subir, sobreviver ao chamador, parar, voltar depois de atualizar) com exit 0 aqui. O systemd `--user` está adiado por decisão do dono (`docs/project/backlog.md:796`), com a data de volta firmada em 2026-09-30: antes da próxima tag. Nenhum check depende dele: C2 é de unidade e está provado; C4, C9, C15 e C40 dizem *o supervisor* e rodaram como escritos |

## Faults injected

Verified at 2d624cda. As mutações rodaram numa cópia descartável: `git archive HEAD` em `/tmp/v038r4/wt`,
com os `node_modules` da árvore real ligados por symlink. Nada mexeu no estado do git.

- Antes de qualquer mutação, as provas-alvo rodaram verdes na cópia: 2, 4 e 1 passed.
- Cada arquivo mutado foi restaurado da árvore real, com `cmp` conferindo, antes da falha seguinte.
- A cópia foi apagada, e o M11 rodou numa segunda cópia, também apagada.
- O porcelain da árvore real estava vazio antes. Ao fim das mutações também estava vazio, e só este
  arquivo mudou depois.

**Por que sete, e não cinco.** O pedido era o M7 e os dois sobreviventes da rodada 1 (M1 e M2), mais pelo
menos três novos. Os três novos (M8 a M10) caem em superfícies de asserção que nenhuma das quatro rodadas
tinha derrubado:

- a precedência do ícone (C69);
- a regra do major no tique (C82);
- a ordem do `systemctl` (C2).

O M11 é a mutação que o recálculo da Coverage apontou: o espelho do M7, como o M7 foi na rodada 3.

| Mutation | Location | Killed |
| --- | --- | --- |
| M7 (o sobrevivente da rodada 3) - `refused: usernsClone !== null ? usernsClone === "0" : apparmorRestrict === "1"`: *o botão do Debian, quando existe, decide sozinho* | `packages/cli/src/menubar.ts:59` | yes - C93 cai no caso novo: `userns_clone 1 and apparmor 1 (Ubuntu 23.10+): expected '[Desktop Entry]…' to contain 'Exec="…'` |
| M1 (o F1 da rodada 1) - `paused: () => update.installer.installing()` vira `paused: () => false` | `packages/server/src/bootstrap.ts:572` | yes - `does not dispatch from the daemon's own conveyor…` cai com `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| M2 (o F2 da rodada 1) - `Math.round(value * 10) / 10` vira `Math.round(value)` | `packages/server/src/resources/sample.ts:73` | yes - as duas provas do C46 caem: o amostrador (`expected { …(3) } to deeply equal { …(3) }`) e o router (`expected 2 to be 1.6`) |
| M8 (C69, novo) - a linha do `update` sobe acima da do `attention`: *versão nova vence o pedido de atenção* | `packages/desktop/src/tray-state.ts:44-45` | yes - `picks the icon by precedence` cai em `tray-state.test.ts:33` com `expected 'update' to be 'attention'` |
| M9 (C82, novo) - `major(current) >= 1` vira `major(current) > 1`: *o 1.x cruza o major sozinho* | `packages/server/src/update/auto.ts:56` | yes - `never crosses a major after 1.0 on its own` cai em `auto.test.ts:228`: `across.install` foi chamado 1 vez |
| M10 (C2, novo) - `enable --now` antes de `daemon-reload` | `packages/cli/src/service.ts:285-288` | yes - `writes the systemd unit and enables it` cai em `service.test.ts:223` com `expected [ …(3) ] to deeply equal [ …(3) ]` |
| M11 (C93, apontado pela Coverage) - `refused: apparmorRestrict !== null ? apparmorRestrict === "1" : usernsClone === "0"`: *o botão do AppArmor, quando existe, decide sozinho* | `packages/cli/src/menubar.ts:59` | no - sobrevive à prova do C93 (1 passed), à suíte inteira do CLI (9 arquivos, 115 passed) e a `scripts/smoke-install.test.ts` e `release-workflow.test.ts` (9 passed). Com `userns_clone=0` e `apparmor_restrict=0`, o `probeSandbox` mutado devolve `refused: false`, e o do `HEAD` devolve `true` (medido nas duas cópias) |

O M11 é plausível, e pela mesma razão que o M7 era. O comentário de `packages/cli/src/menubar.ts:50-55`
apresenta os dois botões como de distribuições diferentes: *"o do Debian e derivados, e o do AppArmor do
Ubuntu 23.10 em diante"*. Uma refatoração que leia *"se o arquivo do AppArmor existe, é Ubuntu novo, e o
AppArmor decide"* produz o M11. É a leitura espelhada da que produz o M7.

O kernel onde ele erra é o do runner com dois `sysctl -w` comuns: `apparmor_restrict_unprivileged_userns=0`
(o contorno que se recomenda para apps Electron no Ubuntu 24.04) e `unprivileged_userns_clone=0` (o
endurecimento). Nesse kernel, o M11 deixa o `.desktop` sem a flag, e o app aborta ao abrir. O passo de Linux
do smoke também não o pegaria: `scripts/smoke-install.ts:328` só imprime o `Exec=`, e `:337` sobe o app
com `--no-sandbox` próprio.

## A evidência do CI

Run 36722841349 (`workflow_dispatch`, `dry_run`), `headSha` `32f8aac6048114c8c6f1f8ad618a4ac8f1edcbea`. A
conclusão é `success`. Li o log salvo em `.context/phase0/dry-run-2.log` e busquei de novo, direto do GitHub,
o do job `app (linux-x64)`: `gh run view 36722841349 --log --job 109913934007`, 639 linhas. O runner é a
imagem `ubuntu-24.04`, com o kernel `6.17.0-1022-azure`.

**Vale para o `HEAD`?** Sim, para tudo que o run exercita. De `32f8aac6` a `2d624cda`, fora de `docs/` e de
`*.test.ts`, o diff é vazio. O que o run construiu e rodou são os mesmos scripts, o mesmo workflow, o mesmo
CLI e o mesmo app. A única diferença é a linha nova da tabela, e ela é provada aqui, e não no CI.

| Job | Conclusão | O que ele prova aqui |
| --- | --- | --- |
| `gates e tarball` | success | `pnpm gate:build` e `pnpm test` num runner Linux: 323 arquivos passed e 1 skipped |
| `instalar de verdade (ubuntu-latest)` e `(macos-latest)` | success | o caminho padrão do `smoke:install` num runner **sem** `pnpm install`: "✓ o pacote instala e sobe" |
| `app (linux-x64)` | success | `.AppImage` e `.deb` construídos. E `pnpm smoke:install --only desktop <tarball>`, a segunda `Proof:` do C78, com: "o kernel não deixa o Chromium criar o sandbox (apparmor_restrict_unprivileged_userns=1); os .desktop levam --no-sandbox.", `Exec="…/lumem-desktop" --no-sandbox --panel`, `phase0-q4: sandbox=refused userns_clone=1 apparmor_restrict=1`, "a janela carregou /menubar" e "✓ o app instala e confere" |
| `app (linux-arm64)` | success | `.AppImage` e `.deb` de arm64 construídos no runner x64. Sem smoke, como o workflow declara |
| `app (darwin-arm64)` | success | o `.zip`, e o smoke com "ad-hoc, e confere" e "nenhum com.apple.quarantine" |
| `app (darwin-x64)` | success | o `.zip`. Sem smoke, como o workflow declara |
| `npm` | skipped | por desenho em `dry_run`. Nem `npm publish --provenance` nem `gh release create` rodaram |

**É a prova que o C78 nomeia?** Sim, como a rodada 3 julgou. O job `app (linux-x64)` roda o comando da
segunda `Proof:` no `ubuntu-latest`, com o tarball que ele mesmo empacotou. A metade de Linux do AC 69 é a
asserção de `scripts/smoke-install.ts:344`, e ela passou. O CI não prova a publicação em si. O C78 a afirma
pelo texto do workflow, e esse texto está provado.

**E o C93 no kernel de verdade?** O runner é o caso `(1, 1)`. Ali o CLI gravou a flag e disse por quê. É o
caso que a tabela agora afirma, e é por isso que o M7 morre. O `(0, 0)` do M11 não é o kernel do runner, e
nenhuma máquina o mediu. É um estado que o AC 78 decide e que a tabela não tem.

## Adiado pelo dono

| O quê | Estado | Onde está a decisão | O que fica sem prova |
| --- | --- | --- | --- |
| `pnpm smoke:service` sob o `systemd --user` de verdade | **não rodou em máquina nenhuma**, nem aqui nem no CI, porque os runners não têm sessão de usuário | `docs/project/backlog.md:796` (seção H), com o gatilho *"houver uma máquina Linux com sessão de login à mão, ou antes da primeira release que anunciar suporte a Linux"*. **Decisão do dono em 2026-09-30, relatada pelo orquestrador:** o item fica no backlog com o gatilho como está escrito, e a próxima tag, que publica `@vinihcrosa/lumem-desktop-linux-*`, é a release que o dispara. Então ele roda antes da próxima tag, e não antes de esta feature fechar | o `lumem start` de verdade sob o `systemd --user`, o daemon sobrevivendo ao chamador numa sessão real, e o relançamento depois do `system.update`. O apoio segue sendo o da rodada 2: a unit num systemd 252 em contêiner |

**Nenhum check depende disso para passar como está escrito** (ver a linha do `Test policy`). O C15 cita o
AC 2 entre parênteses, e é ali que a ausência pesa. Mas o claim dele diz *"um daemon subido por `lumem
start` de verdade"* e rodou como escrito, sob o launchd.

A resposta do dono fecha a pergunta que a rodada 3 deixou: o gatilho dispara na próxima tag. **Consequência
prática:** a primeira tag depois desta feature fica presa a um `pnpm smoke:service` com os quatro `--only`
numa máquina Linux com sessão de login. O `docs/project/backlog.md:807-808` ainda diz o gatilho com as
palavras de antes, e não nomeia a tag. Quem cortar a próxima tag precisa saber disso por esse texto ou pelo
runbook de release.

## Gate

Verified at 2d624cda.

- `LUMEM_GATE_BASE=b226b4b pnpm gate:quick`: `docs ok` e a suíte inteira, porque uma dependência mudou.
  **324 arquivos, 5184 passed, 6 skipped, 0 failed**, `exit=0`. É o mesmo número da rodada 3, porque a linha
  nova está dentro de um `it` que já existia.
- Integridade dos testes: nenhum `.skip`, `.only`, `.todo`, `xit` ou `xdescribe` entrou em
  `b226b4b..HEAD`. Nenhuma linha de teste foi removida em `32f8aac6..HEAD`.
- `pnpm lint`: `exit=0`.
- `pnpm exec turbo typecheck --force`: `0 cached, 5 successful`. `pnpm exec tsc -p tsconfig.json --noEmit` da
  raiz: `exit=0`.
- `pnpm docs:check`: `docs ok`, `exit=0`.
- `pnpm exec playwright test e2e/update.spec.ts e2e/menubar.spec.ts`: 3 passed (41,7 s).
- `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel carrega a página
  do daemon"`: 1 passed (2,4 s).
- `pnpm smoke:service --only start-waits-for-health`, `--only stop-leaves-nothing`, `--only
  survives-the-caller` e `--only update-relaunches`: os quatro deram exit 0 sob o launchd, cada um com
  "✓ o serviço de verdade se comporta". Depois, `launchctl print gui/501/tech.cazimi.lumem-smoke` responde
  *Could not find service*, e nada do Lumem sobra em `~/Library/LaunchAgents` nem em `launchctl list`.
- `pnpm measure:resources --only ten-sessions`, três vezes: 0,61%, 0,48% e 0,68%, exit 0.
- `pnpm smoke:install --only desktop`: exit 0 em darwin-arm64 (pack, instalação num prefixo descartável,
  `codesign --verify` "ad-hoc, e confere", "nenhum com.apple.quarantine"). Nenhum processo do app ficou
  rodando.
- `pnpm smoke:install` (o caminho padrão): exit 0, com "200 text/html; charset=utf-8" e "v0.6.1".
- O porcelain antes da rodada estava vazio. Depois, só este arquivo:
  ` M docs/features/038-desktop-and-updates/verification.md`.
- `pnpm -s feature:check verification docs/features/038-desktop-and-updates`: `exit=1`, com um erro só, `o
  veredito é FAIL`. É o que um relatório reprovado deve dar, e nenhuma linha contradiz o veredito.

## Swept

Verified at 2d624cda.

- **authorization: existing** confere. `system.updateStatus`, `status`, `update`, `resources`, `live`,
  `settings` e `setSettings` (`packages/server/src/routers/system.ts:29`, `:52`, `:69`, `:105`, `:112`,
  `:114` e `:116`), `usage.total` (`usage.ts:34`), `agentAccount.rateLimits` (`agentAccount.ts:67`) e
  `workspace.recent` (`workspace.ts:28`) são `publicProcedure` (`packages/server/src/trpc.ts:144`), a mesma
  fronteira de todo o `/trpc`.
- **concurrency: C31, C33, C83**: o M1 morre de novo.
- **state transitions: C69, C80, C81**: o M8 (precedência do ícone) morre.
- A janela conhecida da S5 continua sem check, registrada no `Handoff`: uma passada da esteira já em
  `prepareCheckout` não conta como turno em voo.

## Riscos

- **O C61 voltou a ter margem.** Deu 0,61%, 0,48% e 0,68%, contra 0,95%, 0,93% e 0,52% na rodada 3. O que
  varia é o `ps`: 11–17 ms por amostra, perto da resolução de 10 ms do `time -p`. Numa máquina mais cheia,
  pode cruzar 1% sem nada ter mudado no código.
- **O passo de Linux do smoke não abre o `.desktop` que o CLI escreveu.** Ele sobe o binário com
  `--no-sandbox` próprio (`scripts/smoke-install.ts:337`). Prova que o pacote abre, e não que o lançador
  gravado abre. É o mesmo buraco por onde o M7 passava e o M11 passa.
- O clique do sistema operacional no ícone (macOS) e o `measure:resources` em Linux continuam sem rodar.
- **A próxima tag depende de uma máquina Linux com sessão de login** (seção *Adiado pelo dono*).

## Quem fecha

Esta é a rodada 4, uma além do limite de três, autorizada pelo dono. A lacuna volta ao dono, com a correção
nomeada. É pequena e mecânica, do mesmo tamanho da da rodada 3.

**Ranked gaps:**

1. **O mutante M11 sobrevive** - C93 - `packages/cli/src/menubar.ts:59`, com a tabela em
   `packages/cli/src/menubar.test.ts:204-211`. A menor correção é uma sétima linha:
   `{ name: "userns_clone 0 and apparmor 0", sysctl: { [USERNS]: "0\n", [APPARMOR]: "0\n" }, refused: true, says: "unprivileged_userns_clone=0" }`.
   Com ela o M11 cai, porque devolve `false` nesse caso.
2. **Membros da Coverage sem prova: `(0, 0)`, `(1, ausente)` e `(ausente, 0)`** - C93 - o mesmo lugar. A
   correção que fecha o conjunto, e não mais um exemplo, é a tabela dos nove estados. São três linhas além
   das seis de hoje. As duas que faltam além da do item 1:
   `{ name: "userns_clone 1, apparmor absent", sysctl: { [USERNS]: "1\n" }, refused: false, says: "" }` e
   `{ name: "userns_clone absent, apparmor 0", sysctl: { [APPARMOR]: "0\n" }, refused: false, says: "" }`.

Opcional, e fora do veredito, como na rodada 3: o passo de Linux do `smoke:install` pode **afirmar** o que
hoje imprime. Lançar pelo `Exec=` gravado, e não com um `--no-sandbox` próprio, faria do run de CI uma prova
do C93 num kernel de verdade.

**Só documentação, para depois do veredito:**

- a linha do `verification.md` em `docs/README.md:815` descreve a rodada 3 como a última;
- o gatilho do item do systemd em `docs/project/backlog.md:807-808` ainda não nomeia a próxima tag, que o
  dono decidiu ser a que o dispara.

**Lição (passo 7).** Proposta para *Armadilhas já corrigidas* de `docs/project/testing.md`. O verificador só
escreve este arquivo. É uma correção da lição que entrou em `2d624cda`, e não uma nova:

> **A tabela sobre botões independentes cobre o produto dos estados de cada botão, e não a combinação
> medida.** A lição da rodada 3 dizia *"a combinação que a plataforma-alvo entrega, medida"*, e a correção
> seguiu a regra à risca: acrescentou o `(1, 1)` do runner. O mutante espelhado, *"o outro botão, quando
> existe, decide sozinho"*, só morre no `(0, 0)`, e nenhuma máquina medida o tem. **A regra:** com dois
> botões de três estados (`0`, `1`, ausente), a tabela tem as nove linhas. O que se mede numa máquina de
> verdade vai além delas, e não no lugar delas.
