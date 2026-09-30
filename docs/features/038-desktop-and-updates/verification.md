# O Lumem fica de pé sozinho, se atualiza, e mora na barra — verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: b226b4b..38e5db69 (desde a rodada 5: `2b5ac652..38e5db69`, nove commits)
**Round**: 6 - full, a última por decisão do dono
**Verifier**: independent sub-agent (author != verifier)

**O veredito aplica a regra de parada do dono**, de 2026-09-30, gravada no fim do `## Handoff` do
`checks.md` (`docs/features/038-desktop-and-updates/checks.md:542`). A decisão é do dono, e não do verificador:

- **reprova só defeito de comportamento**: um `Proof:` que falha no `HEAD`, ou código que faz a coisa errada num
  caso que um critério do `prd.md` define;
- **não reprova teste fraco sobre código que se comporta certo**: mutante sobrevivente, célula de estado sem
  prova, prova num nível mais baixo que o ideal. Isso vai para a seção *Não bloqueia (regra de parada)*, em ordem,
  com o arquivo, a linha e o teste de uma linha que fecharia cada item, para o backlog.

Nesta rodada as 174 linhas `Proof:` passaram no `HEAD` `38e5db69`, e não achei defeito de comportamento. Pela
regra, o veredito é PASS. Achei, sim, fraquezas de teste. A maior delas é nova: a leitura em duas passadas
tornou inalcançáveis as guardas de `stat` malformado que o teste do C51 afirmava. Estão todas em *Não bloqueia*,
e é ali, e não nas colunas `Killed` e `Unproven`, que a regra as coloca. O validador lê essas duas colunas como
reprovação, e a regra do dono diz que esses itens não reprovam. Escrevo isso aqui para que ninguém leia a
mudança de lugar como um item escondido.

## Rodada 1 (em `2ab18e3b`)

Veredito: reprovada. As lacunas, em ordem:

1. A fiação `paused` do `bootstrap` não tinha prova: o mutante F1 sobrevivia. Fechada na rodada 2.
2. O `cpuPercent` com uma casa decimal só era provado com inteiros: o mutante F2. Fechada na rodada 2.
3. A metade de Linux do C78 não tinha rodado. Fechada na rodada 3.
4. O `systemd --user` de verdade não tinha rodado. **Adiado pelo dono.**
5. Havia comportamento construído sem check. Fechado na rodada 2, pelos C86–C92.

## Rodada 2 (em `2630a3ee`)

Veredito: reprovada. As lacunas, em ordem:

1. A metade de Linux do C78, com o `.AppImage` e o `.deb`. Fechada na rodada 3.
2. A Q4 estava aberta. Respondida com (c), e virou o AC 78 e o C93.

## Rodada 3 (em `32f8aac6`)

Veredito: reprovada. O run 36722841349 provou a metade de Linux do C78. A lacuna:

1. O mutante M7 sobrevivia: o botão do Debian decidia sozinho (C93). Fechada em `2d624cda`.

## Rodada 4 (em `2d624cda`)

Veredito: reprovada. A lacuna:

1. O mutante M11 sobrevivia: o botão do AppArmor decidia sozinho, e errava só no estado `(0, 0)`. Fechada em
   `2b5ac652`, com a tabela dos nove estados.

## Rodada 5 (em `2b5ac652`)

Veredito: reprovada. A lacuna:

1. O mutante M14 sobrevivia (C30): trocar `!isIdle(busy)` por `liveTurns > 0 && runningScripts > 0` no router
   passava pela suíte inteira do `server`. O AC 27 é um *ou*, e a prova só tinha o estado em que os dois estão
   ocupados. **Fechada em `c8b75978`.** Nesta rodada o M14 morre no estado *2 turnos, 0 script*.

## Rodada 6

Verified at 38e5db69. É uma rodada inteira. Todas as provas rodaram neste commit, e as citações foram impressas
linha a linha neste commit. A exceção é o run 36722841349 do CI, que é de `32f8aac6`. A seção *A evidência do
CI* mostra por que ele ainda vale.

A máquina é um macOS arm64 (Darwin 27), com o Node do `.nvmrc` (`v22.17.1`) e o launchd de verdade. Ela tinha
cerca de 700 processos durante a medição.

**O que mudou desde a rodada 5.** Fora de `docs/` e dos testes, quatro arquivos:

- `packages/server/src/resources/process-table.ts` lê a tabela em duas passadas;
- `packages/server/src/resources/sample.ts` corrige os dois relógios (`disarm ??=`, `:204`), passa as raízes ao
  leitor (`:127`) e amostra a cada 5 s (`:21`);
- `packages/server/src/testing/measure-resources.ts` mede o `ps` em lote;
- `packages/web/src/features/menubar/queries.ts:58` pergunta os recursos a cada 5 s.

Os testes ganharam 260 linhas com `expect` e perderam 17. Cada uma das 17 volta igual ou mais forte:

- `toContain("restore")` virou `toEqual(["restore", "show", "focus"])`;
- `rejects.toThrow(/atualizando/)` virou `rejects.toMatchObject({ code, message })`;
- o `toBeCloseTo(33.3)` virou `20.0`, porque o intervalo passou de 3 s para 5 s;
- o `CONFLICT` e os `PRECONDITION_FAILED` sem mensagem ganharam o texto de cada recusa.

Nenhum `.skip`, `.only`, `.todo`, `xit` ou `xdescribe` entrou em `b226b4b..HEAD`.

## Binding sources

Verified at 38e5db69. O passo 1 não se aplica: o perfil é `standard`, e esse passo só roda sob `ui`. O plano não
marca nenhuma fonte como *binding*. Desde a rodada 5, o `prd.md` mudou uma linha, a das Assumptions sobre a
medição de processos (`prd.md:345`), e ela agora descreve as duas passadas que o código faz.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte marcada *binding* no plano | - | - | - |

## Checks

Verified at 38e5db69. As provas vitest rodaram numa invocação por pacote, com `--reporter=verbose`, sobre os
arquivos que os checks nomeiam:

| Pacote | Arquivos | Resultado da invocação |
| --- | --- | --- |
| `packages/cli` | `args`, `menubar`, `port`, `run`, `service` e `upgrade` | 6 files, **130 passed** |
| `packages/server` | 19 arquivos | **315 passed** |
| `packages/web` | 5 arquivos | **44 passed** |
| `packages/desktop` | 7 arquivos | **64 passed** |
| `packages/shared` | `desktop.test.ts` | **5 passed** |
| `scripts` | `package-boundaries`, `release-workflow`, `set-version` e `smoke-install` | **22 passed** |

O `checks.md` tem 174 linhas `Proof:`, e 172 são distintas. As duas repetidas são o e2e do C37 e do C41, e o
`installs the package of each supported platform` do C62 e do C90. Elas pedem 163 nomes vitest distintos. Procurei
cada nome na saída, preso ao arquivo dele (`grep "✓" | grep -F <arquivo> | grep -F <nome>`). Os 163 aparecem com
`✓`, e a saída não tem nenhum `×`. Nenhum filtro caiu no vazio. O `fails alone when` do C86 casa os três casos do
`it.each`. As provas que não são vitest estão na seção *Gate*.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | plist do launchd com PATH, supervisor, KeepAlive e logs | service.test ✓ ×2 | `packages/cli/src/service.test.ts:142` - `expect(parsePlist(files.get(PLIST)!)).toEqual({ … })`; `:511` - o PATH com `' " & < >` lido de volta igual | PASS |
| C2 | unit do systemd; `daemon-reload` e `enable --now`, nessa ordem; recusa no passo que falha | service.test ✓ ×3 | `packages/cli/src/service.test.ts:227` - `toContain("ExecStart=/opt/node/bin/node … run\n")`; `:234` - `systemctl.slice(-3)` na ordem; `:465` - o texto inteiro com o passo; `:467` - os seguintes não rodam | PASS |
| C3 | reescreve o arquivo existente antes de carregar | service.test ✓ | `packages/cli/src/service.test.ts:260` - `expect(rewritten.ProgramArguments).toEqual(["/novo/bin/node", "/novo/lib/lumem.mjs", "run"])`; `:262` - a escrita antes do `bootstrap` | PASS |
| C4 | sai 0 no health; sai 1 com as 20 linhas em 15 s; o serviço leva só o pedido; `--open` | run.test ✓ ×11; `smoke:service --only start-waits-for-health` exit 0 | `packages/cli/src/run.test.ts:333` - `toBe(1)`; `:336` - `"linha 30"`; `:338` - sem `"linha 10"`; `:339` - `toBeGreaterThanOrEqual(15_000)`; `:605` - `expect(carried(fake), name).toEqual(carries)`; `:667` - carregado e atual sem daemon recarrega; `:718` - o navegador só com `--open`; `scripts/smoke-service.ts:142` (saída: "saiu 0 e o health já respondia (v0.6.1)") | PASS |
| C5 | sem supervisor: sai 1, não escreve nada, cita `lumem run` | service.test ✓ | `packages/cli/src/service.test.ts:374` - `toEqual({ ok: false, reason: expect.stringContaining("lumem run") })`; `:380` - `files.size` 0 | PASS |
| C6 | outro Lumem fora do serviço: sai 1 | run.test ✓ | `packages/cli/src/run.test.ts:355` - `toBe(1)`; `:357` - `toContain("fora do serviço")`; `:362` - nenhum arquivo | PASS |
| C7 | sem verbo é `start`; `run` com as quatro opções | args.test ✓ | `packages/cli/src/args.test.ts:24` - `expect(parseCommand([])).toEqual(start)`; `:27` - `run` | PASS |
| C8 | `lumem run` é o primeiro plano de antes | run.test ✓ | `packages/cli/src/run.test.ts:289` - `toBe("Lumem v0.1.0 — http://127.0.0.1:4317")`; `:296` - `toContain("já tem um Lumem em http://127.0.0.1:4317")` | PASS |
| C9 | stop: `bootout` e apaga o plist, ou `disable --now`; 0 ou 1 em 10 s | service.test ✓ ×2; `smoke:service --only stop-leaves-nothing` exit 0 | `packages/cli/src/service.test.ts:397` - `toContain("launchctl bootout gui/501/tech.cazimi.lumem")`; `:398` - o plist some; `:404` - `disable --now`; `:431` - `"10 s"`; `:578` - em primeiro plano nada roda; `scripts/smoke-service.ts:156` (saída: "parou, descarregou e não deixou item de login") | PASS |
| C10 | status: uma linha, 0 ou 3 | run.test ✓ | `packages/cli/src/run.test.ts:480` - `toEqual(["rodando · v0.7.0 · http://127.0.0.1:4317 · supervisionado"])`; `:488` - `toBe(3)`; `:489` `parado` | PASS |
| C11 | logs: 200 de 250, e `-f` segue | run.test ✓ | `packages/cli/src/run.test.ts:518` - `toHaveLength(200)`; `:519` - `toBe("linha 51")`; `:535` com `-f` | PASS |
| C12 | logs sem arquivo: sai 1 com o caminho | run.test ✓ | `packages/cli/src/run.test.ts:543` - `toBe(1)`; `:545` - `toContain(join(stateDir, "daemon.log"))` | PASS |
| C13 | `supervised` vem de `LUMEM_SUPERVISOR` | health.test ✓ | `packages/server/src/routers/health.test.ts:27` - `true` para `launchd`, e as linhas seguintes para `systemd`, vazio e outro valor | PASS |
| C14 | `protocolVersion: 1`; o `probePort` segue lendo | health.test ✓; port.test ✓ | `packages/server/src/routers/health.test.ts:41` - `toEqual({ … protocolVersion: 1 })`; `packages/cli/src/port.test.ts:40` | PASS |
| C15 | sobrevive ao chamador e responde `supervised: true` | `smoke:service --only survives-the-caller` exit 0 | `scripts/smoke-service.ts:185` - `assert(health.supervised === true, …)` (saída: "o chamador morreu, e o daemon seguiu respondendo supervised: true"), sob o launchd | PASS |
| C16 | o smoke sobe com `lumem run` | smoke-install.test ✓ | `scripts/smoke-install.test.ts:15` - `expect(args).toEqual(["run", "--port", "4397"])` | PASS |
| C17 | registry no boot e a cada 6 h, só com `accept` | check.test ✓ | `packages/server/src/update/check.test.ts:71` - `toBe(REGISTRY)`; `:72` - `headers` `{ accept: "application/json" }`; `:78` - a segunda chamada | PASS |
| C18 | `updateStatus`: `current`, nulos antes, e os três `updateAvailable` | system.test ✓ | `packages/server/src/routers/system.test.ts:63` - `toEqual({ … })`; `:78` `true`; `:85` e `:91` `false` | PASS |
| C19 | timeout, 503 e sem `version` mantêm o anterior, um `warn` cada | check.test ✓ | `packages/server/src/update/check.test.ts:115` - `toEqual(good)`; `:117` `TimeoutError`; `:122` `503`; `:127` `sem versão`; `:138` - `toHaveBeenCalledWith(10_000)` | PASS |
| C20 | verificação desligada: nenhuma requisição, `checkEnabled: false` | check.test ✓ | `packages/server/src/update/check.test.ts:169` - `request` não chamado; `:198` e `:204` - `checkEnabled()` false; `:206` | PASS |
| C21 | `updateCheckForcedOff` e o interruptor desabilitado com o texto | system.test ✓; UpdateSettings.test ✓ | `packages/server/src/routers/system.test.ts:115`; `packages/web/src/features/settings/UpdateSettings.test.tsx:41` `toBeDisabled()` e `:43` `desligado por LUMEM_NO_UPDATE_CHECK` | PASS |
| C22 | `setSettings` grava a única linha; a linha ausente falha alto | system.test ✓ ×2 | `packages/server/src/routers/system.test.ts:132` - os valores gravados; `:138` - `toEqual([…])` da tabela inteira; `:159` - `rejects.toThrow(/daemon_settings/)` | PASS |
| C23 | `autoUpdate: "always"`: `BAD_REQUEST`, linha intacta | system.test ✓ | `packages/server/src/routers/system.test.ts:166` - `rejects` com `BAD_REQUEST`; `:172` - a linha como estava | PASS |
| C24 | migração: uma linha com os padrões; o CHECK recusa | daemon-settings.test ✓ | `packages/server/src/db/daemon-settings.test.ts:52` - `toEqual([…])`; `:56` - o `INSERT` de `id = 2` recusado | PASS |
| C25 | topbar `v0.6.1 → v0.7.0` e o botão; nada sem versão nova | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:39` - `findByText("v0.6.1 → v0.7.0")`; `:48` - `toBeEmptyDOMElement()` | PASS |
| C26 | sem supervisor, `lumem upgrade` no lugar do botão | UpdateBanner.test ✓ | `packages/web/src/features/update/UpdateBanner.test.tsx:59` - `getByText("lumem upgrade")`; `:60` sem botão | PASS |
| C27 | update fecha a porta, instala com o dono, `started: true` | system.test ✓ | `packages/server/src/routers/system.test.ts:184` - `toEqual({ started: true })`; `:185` - o comando; `:191` - a porta antes do instalador | PASS |
| C28 | instalação 0: sai por `createShutdownHandler` com 0 | install.test ✓ | `packages/server/src/update/install.test.ts:44` - `toHaveBeenCalledWith(0)`; `:53` - `close` antes de `exit` | PASS |
| C29 | instalação 1 ou `ENOENT`: reabre a porta, não sai, e `lastError` | install.test ✓; system.test ✓ | `packages/server/src/update/install.test.ts:80` `"1"` e `:95` `"spawn npm ENOENT"`; `:83` e `:97` - `exit` não chamado; `packages/server/src/routers/system.test.ts:276` e `:280` - a próxima começa | PASS |
| C30 | `CONFLICT` com os dois números nos três estados ocupados, e o instalador não roda | system.test ✓ | `packages/server/src/routers/system.test.ts:198-201` - os estados `(2, 1)`, `(2, 0)` e `(0, 1)`; `:213-216` - `code: "CONFLICT"` e `message: expect.stringMatching(says)`; `:219-220` - `install` e `hold` não chamados. O M14 morre | PASS |
| C31 | segundo update: `CONFLICT` | system.test ✓ | `packages/server/src/routers/system.test.ts:230` - `CONFLICT` com `"atualização em andamento"`; `:235` - uma instalação só | PASS |
| C32 | sem supervisor ou sem versão nova: `PRECONDITION_FAILED` | system.test ✓ | `packages/server/src/routers/system.test.ts:244` com `"lumem upgrade"`; `:255` e `:260` com `"versão nova"`; `:265` | PASS |
| C33 | prompt recusado durante a instalação, e nada chega ao agente | AcpManager.test ✓ | `packages/server/src/acp/AcpManager.test.ts:504` - `rejects.toMatchObject({ … /o Lumem est[aá] se atualizando/ })`; `:511` - `promptBlocks` `[]` | PASS |
| C34 | copia antes de migrar e grava a versão depois | backup.test ✓ | `packages/server/src/db/backup.test.ts:95` - `["lumem.db.bak-0.6.1"]`; `:96` - a cópia tem só a tabela de antes; `:103` - `"0.7.0"` | PASS |
| C35 | mantém as 3 mais novas | backup.test ✓ | `packages/server/src/db/backup.test.ts:149` | PASS |
| C36 | sem `last-version` não copia; migração que falha não grava | backup.test ✓ | `packages/server/src/db/backup.test.ts:184` e `:185`; `:195` - vazio e só espaço; `:208` - `"0.6.1"` fica | PASS |
| C37 | recarrega uma vez e diz `Lumem atualizado para v0.7.0` | useVersionReload.test ✓; `e2e/update.spec.ts` ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:26` e `:33`; `e2e/update.spec.ts:64` - `getByText(\`Lumem atualizado para v${NEW_VERSION}\`)` | PASS |
| C38 | não recarrega duas vezes na mesma aba | useVersionReload.test ✓ | `packages/web/src/hooks/useVersionReload.test.tsx:54` - `toHaveBeenCalledTimes(1)` | PASS |
| C39 | upgrade reinicia o serviço e imprime a versão de depois | upgrade.test ✓ ×3; service.test ✓ ×2 | `packages/cli/src/upgrade.test.ts:165` `kickstart -k`; `:168` `v0.2.0`; `:200` - o `ENOENT`; `:218` - a origem dada; `packages/cli/src/service.test.ts:546` e `:552` - o comando por supervisor; `:568` - nada sem supervisor | PASS |
| C40 | o daemon real volta na versão nova sem `lumem start` | `smoke:service --only update-relaunches` exit 0 | `scripts/smoke-service.ts:318` - `health?.version === NEW_VERSION`; `:328` - `supervised === true` (saída: "o supervisor subiu o daemon de novo, na v0.99.0, sem ninguém rodar `lumem start`"), sob o launchd | PASS |
| C41 | a página recarregada carrega os assets novos, e não fica em branco | `e2e/update.spec.ts` ✓ (20,8 s) | `e2e/update.spec.ts:69` - `#root > *` > 0 | PASS |
| C42 | `usage.total` soma tudo; `cost` nulo só quando todos são nulos | usage.test ✓ ×2 | `packages/server/src/routers/usage.test.ts:157` - `toEqual({ tokens: 7_500, cost: 1.75, currency: "USD", turns: 4 })`; `:172` | PASS |
| C43 | uma instrução SQL para 1, 3 e 10 workspaces | usage.test ✓ | `packages/server/src/routers/usage.test.ts:214` - `expect(counts).toEqual([1, 1, 1])` | PASS |
| C44 | `period` desconhecido: `BAD_REQUEST` | usage.test ✓ | `packages/server/src/routers/usage.test.ts:223` | PASS |
| C45 | o relato mais recente por conta, sem a que não relatou | agentAccount.test ✓ | `packages/server/src/routers/agentAccount.test.ts:420` - `resolves.toEqual([…])`; `:455` - só a conta com relato | PASS |
| C46 | grupos com `cpuPercent` em uma casa; `top` de 5; empate pelo pid | sample.test ✓ ×2; system.test ✓ | `packages/server/src/resources/sample.test.ts:119` e `:127`; `:156` e `:161` - os decimais; `:361` - o empate; `packages/server/src/routers/system.test.ts:332` - `toBe(1.6)`. O M2 morre nos dois | PASS |
| C47 | atribui ao ancestral rastreado mais próximo | attribute.test ✓; AcpManager.test ✓ | `packages/server/src/resources/attribute.test.ts:35` `"agents"`, `:38` `"terminals"`; `packages/server/src/acp/AcpManager.test.ts:3342` - a sessão que saiu não é listada | PASS |
| C48 | 1,0 s → 1,5 s em 5 s dá `10.0`; na primeira amostra, `null` | sample.test ✓ ×2 | `packages/server/src/resources/sample.test.ts:177` - `cpuPercent: null`; `:182` - `cpuPercent: 10`; `:311` - `{ 100: 10, 101: 0, 102: null }` | PASS |
| C49 | 15 s sem pergunta: para de ler; a próxima volta; um relógio só | sample.test ✓ ×4 | `packages/server/src/resources/sample.test.ts:218` - `toBe(afterQuiet)`; `:223` `afterQuiet + 1`; `:341-349` - 14 999 ms lê, 15 000 ms desarma; `:380` - `expect(armed).toBe(1)`; `:383`; `:409` - `stop` limpa o relógio real | PASS |
| C50 | rótulo por sessão e checkout, e o nome do comando fora dela | sample.test ✓; live.test ✓ ×3; session-place.test ✓ ×2 | `packages/server/src/resources/sample.test.ts:262` - `toBe("Claude · lumem-os/bandung")`; `:268` `"vim"`; `packages/server/src/resources/live.test.ts:126`, `:129` `"Run · lumem-os/bandung"`, `:158` e `:182`; `packages/server/src/resources/session-place.test.ts:42` `"Agente"` e `:54` | PASS |
| C51 | `ps` em duas passadas no darwin, `/proc` no Linux, de amostras gravadas | process-table.test ✓ ×2 | `packages/server/src/resources/process-table.test.ts:182` - `toEqual([…])` da árvore de cinco, numa tabela de oito; `:195` - `["ps -A -o pid=,ppid=", "ps -x -o pid=,ppid=,rss=,time=,comm= -p 557,2391,4242,4300,4400"]`; `:218` - o `/proc`; `:334` - os formatos de tempo | PASS |
| C52 | `system.status`: seis campos, e `attention` com permissão pendente | system.test ✓ | `packages/server/src/routers/system.test.ts:364` - `resolves.toEqual({ … })`; `:382` - `{ liveTurns: 1, attention: true }`; `:390` | PASS |
| C53 | manchete `87%`, o `kind` e o tempo até o reset | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:83` `87%`; `:84`; `:85` `reseta em 2 h` | PASS |
| C54 | sem cota, o custo do dia; custo nulo, os tokens | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:98` `US$ 1,75`; `:100` `{ period: "1d" }`; `:108` `48,2k tokens` | PASS |
| C55 | ordem dos blocos, linha de versão e ações | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:135` - as regiões na ordem; `:162`; `:167`; `:186` `em dia · verificado há 3 min` | PASS |
| C56 | sem sessão, `nenhuma sessão rodando` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:196` | PASS |
| C57 | recursos falhando: só esse bloco diz | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:211` e `:217` | PASS |
| C58 | `2 terminais abertos fecham ao atualizar` | MenubarScreen.test ✓ | `packages/web/src/features/menubar/MenubarScreen.test.tsx:276` | PASS |
| C59 | `routeOf("/menubar")` e `GET /menubar` com 200 | route.test ✓; static.test ✓ | `packages/web/src/lib/route.test.ts:24`; `packages/server/src/web/static.test.ts:91` | PASS |
| C60 | `/menubar` numa aba mostra os três blocos | `e2e/menubar.spec.ts` ✓ (19,6 s) | `e2e/menubar.spec.ts:73` - número na manchete; `:89` - `/\d+,\d%/` no Daemon. É o leitor de duas passadas de verdade, no daemon do e2e | PASS |
| C61 | a cada 5 s com 10 sessões, menos de 1% | `measure:resources --only ten-sessions` três vezes, exit 0; measure-resources.test ✓ ×2 | `packages/server/src/testing/measure-resources.ts:101` - `percent < LIMIT_PERCENT`. Saídas: **0,53%**, **0,53%** e **0,52%** (4,00 + 22,40, 4,79 + 21,80 e 6,01 + 19,80 ms por amostra), numa árvore de 11 processos; `packages/server/src/testing/measure-resources.test.ts:47` e `:52` | PASS |
| C62 | `menubar install` nas quatro plataformas, e o `lumem-desktop.json` | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:134` - `toContain(\`install npm install --global ${desktopPackageName(key)}@${VERSION}\`)`; `:137` - o JSON inteiro; `:286` e `:290` | PASS |
| C63 | `~/Applications/Lumem.app`; os dois `.desktop` | menubar.test ✓ ×3 | `packages/cli/src/menubar.test.ts:188-192` - `rm -rf` antes do `ditto`; `:236` - o `Exec=` entre aspas; `:308` e `:314` - o porquê de cada falha | PASS |
| C64 | `win32-x64` e `linux-ia32`: sai 1 e lista as quatro | menubar.test ✓ | `packages/cli/src/menubar.test.ts:334` `toBe(1)`; `:337` nada rodou; `:339` as quatro | PASS |
| C65 | upgrade leva o pacote do app e recopia no macOS | upgrade.test ✓ ×2; menubar.test ✓ | `packages/cli/src/upgrade.test.ts:293` e `:297`; `:337-338` - sem app, nada; `packages/cli/src/menubar.test.ts:473` e `:475` | PASS |
| C66 | uninstall remove o pacote, o app ou os `.desktop`, e o item de login | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:422` - `expect(app).toBeGreaterThan(login)`; `:432-434` em Linux; `:444` - sem app, nenhum `--uninstall` | PASS |
| C67 | `openAtLogin: true` e um só ícone | main.test ✓ | `packages/desktop/src/main.test.ts:231` - `toEqual([{ openAtLogin: true }])`; `:232` - um ícone | PASS |
| C68 | health e status a cada 10 s | poll.test ✓ ×3; main.test ✓ | `packages/desktop/src/poll.test.ts:55` - `toEqual(["/trpc/health", "/trpc/system.status"])`; `:62`, `:65` e `:66` `POLL_EVERY_MS` 10 000; `:196`; `packages/desktop/src/main.test.ts:525` | PASS |
| C69 | a tabela de 5 entradas do ícone | tray-state.test ✓; poll.test ✓ ×2; main.test ✓ | `packages/desktop/src/tray-state.test.ts:30` `stopped`; `:33` e `:37` `attention`; `:41` `update`; `:44` `running`; `packages/desktop/src/poll.test.ts:148` e `:163`; `packages/desktop/src/main.test.ts:489` e `:495` | PASS |
| C70 | clique: 360×520 sem moldura em `/menubar`, esconde de novo e no blur | windows.test ✓ ×3; main.test ✓ | `packages/desktop/src/windows.test.ts:142` - `toMatchObject({ width: 360, height: 520, frame: false })`; `:153` `/menubar`; `:203` e `:208` - 299 e 300 ms; `:218`; `packages/desktop/src/main.test.ts:503` e `:507` | PASS |
| C71 | o menu na ordem, e `Atualizar` só com versão nova | menu.test ✓; main.test ✓ | `packages/desktop/src/menu.test.ts:38` - os rótulos na ordem; `:46`; `:51`; `packages/desktop/src/main.test.ts:534-544` - cada item faz o que diz | PASS |
| C72 | uma janela principal, focada na segunda vez | windows.test ✓ | `packages/desktop/src/windows.test.ts:272` - `<origem>/`; `:275` e `:282` - `["show", "focus"]` | PASS |
| C73 | Iniciar e Parar com os caminhos gravados | commands.test ✓ ×2 | `packages/desktop/src/commands.test.ts:28`; `:52` - o PATH de quem abriu | PASS |
| C74 | daemon parado: a página local | windows.test ✓; main.test ✓ | `packages/desktop/src/windows.test.ts:309` - `toEqual([\`file:${STOPPED_PAGE}\`])`; `:315`; `packages/desktop/src/main.test.ts:518` | PASS |
| C75 | protocolo diferente: a linha de incompatível | menu.test ✓ | `packages/desktop/src/menu.test.ts:94` | PASS |
| C76 | toda janela travada na origem | windows.test ✓ ×3 | `packages/desktop/src/windows.test.ts:350` - `webPreferences`; `:359-362` - `navigate` cancelado fora da origem; `:398` e `:406` - `external`; `:415-416` | PASS |
| C77 | Electron de verdade: o ícone, e o painel em `/menubar` | `playwright test e2e/app.spec.ts -g …` ✓ (2,4 s) | `packages/desktop/e2e/app.spec.ts:96` - `toHaveURL(\`${DAEMON}/menubar\`)`; `:105` - `[360, 520]` | PASS |
| C78 | o release publica os 4 pacotes e anexa zip, AppImage e deb; o smoke no macOS e no Linux | release-workflow.test ✓ ×3; smoke-install.test ✓; packaging.test ✓; `smoke:install --only desktop` exit 0 aqui, e o CI (run 36722841349) em `app (darwin-arm64)` e `app (linux-x64)` | `scripts/release-workflow.test.ts:53`, `:72` e `:83`; `:120` e `:124`; `scripts/smoke-install.test.ts:52`; `packages/desktop/src/packaging.test.ts:38-42`; `scripts/smoke-install.ts:314` (saída aqui: "ad-hoc, e confere"); `scripts/smoke-install.ts:344` (saída do CI em Linux: "a janela carregou /menubar") | PASS |
| C79 | `version:set` escreve o manifesto do app; o desktop só importa do shared | set-version.test ✓; package-boundaries.test ✓ | `scripts/set-version.test.ts:46`; `scripts/package-boundaries.test.ts:152` - `toBe("")` | PASS |
| C80 | o tique só instala com `idle`, supervisionado, com versão e ocioso; relido no `start`; tique lento; falha | auto.test ✓ ×5 | `packages/server/src/update/auto.test.ts:111` - `off` não instala; `:123` - `idle` instala uma vez; `:145`, `:150` e `:156` - sem supervisor, sem versão e com script; `:179` e `:190` - relido; `:219` e `:223`; `:241` e `:247`. O M16 morre na prova nomeada | PASS |
| C81 | esperando, aceita prompt e a esteira anda; instala depois do `turn_end` | auto.test ✓ | `packages/server/src/update/auto.test.ts:286` - `install` não chamado com o turno; `:290` - `resolves.toBe("end_turn")`; `:295` - a esteira; `:303` | PASS |
| C82 | não cruza major depois da 1.0 | auto.test ✓ | `packages/server/src/update/auto.test.ts:322` - `across.install` não chamado; `:324` - `updateAvailable()` segue true; `:334` e `:340` - o minor e o `0.9.2 → 1.0.0` instalam | PASS |
| C83 | durante a instalação automática a esteira não despacha | auto.test ✓; bootstrap.test ✓ | `packages/server/src/update/auto.test.ts:401` - `conveyorTick` uma vez; `:410`; `packages/server/src/bootstrap.test.ts:318` - `expect(dispatched).toEqual([workspace.id])`. O M1 morre | PASS |
| C84 | `Atualizar sozinho quando ocioso`, desabilitado sem supervisor | UpdateSettings.test ✓ | `packages/web/src/features/settings/UpdateSettings.test.tsx:85` `toBeDisabled()`; `:87` o texto; `:104` - `{ autoUpdate: "idle" }` | PASS |
| C85 | o caminho estável sob um store versionado | service.test ✓ | `packages/cli/src/service.test.ts:176` - com o symlink; `:188` - sem; `:208` - sob npm | PASS |
| C86 | `Consumo`, `Turnos em voo` e `Versão` falham cada um sozinho | MenubarScreen.test ✓ ×3 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:262` - `findByText(block.says)`; `:266` - ausente nos outros; `:268` - com 1 | PASS |
| C87 | `system.live`: só os turnos em voo, `label`, `startedAt` ISO e `openTerminals` | system.test ✓ | `packages/server/src/routers/system.test.ts:433` - `{ turns: [], openTerminals: 0 }`; `:451` - `toEqual([…])`; `:454` ISO; `:456` - 2 | PASS |
| C88 | `workspace.recent`: os três mais novos em ordem; vazio sem sessão | workspace.test ✓ ×2 | `packages/server/src/routers/workspace.test.ts:396` - `toEqual([…])`; `:407` - `resolves.toEqual([])` | PASS |
| C89 | `menubar open` roda o app com `--panel`; sem app, sai 1 | menubar.test ✓ ×2 | `packages/cli/src/menubar.test.ts:372` - `toEqual(["/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --panel"])`; `:376` o do Linux; `:382` `toBe(1)`; `:384`; `:401-404` - os seis casos | PASS |
| C90 | `lumem-desktop.json` na pasta de dados, reescrito, e o app o lê de lá | menubar.test ✓ ×2; desktop.test ✓; main.test ✓ ×2 | `packages/cli/src/menubar.test.ts:137` e `:165`; `packages/shared/src/desktop.test.ts:28` e `:36`; `packages/desktop/src/main.test.ts:304` - `toEqual([expected])`; `:335` e `:337` | PASS |
| C91 | o painel recarrega uma vez quando o daemon muda de versão | MenubarScreen.test ✓ ×2 | `packages/web/src/features/menubar/MenubarScreen.test.tsx:363` e `:369`; `:381` - `not.toHaveBeenCalled()` | PASS |
| C92 | install com o gerenciador falhando: o código, nada gravado, nada aberto | menubar.test ✓ ×3 | `packages/cli/src/menubar.test.ts:359` - `toBe(13)`; `:362`; `:363` - `launched` `[]`; `:296-300`; `:349-353` | PASS |
| C93 | `--no-sandbox` nos dois `.desktop` só onde o kernel nega, e a saída diz por quê | menubar.test ✓ | `packages/cli/src/menubar.test.ts:248-257` - as nove linhas, uma por estado; `:270-273` - `Exec="…" --no-sandbox --panel\n`, o autostart e o porquê; `:275-278` - sem a flag. M7 e M11 morrem | PASS |

## Coverage

Verified at 38e5db69. Cada conjunto foi recalculado a partir da própria autoridade, e não relido da tabela do
`checks.md`: as rotas e as saídas do CLI vêm do `## Surface` do `prd.md`, as portas do `## Landing`, e os
estados de cada condição, do código que a decide. Os conjuntos que o diff desta rodada não tocou vêm da rodada 5,
e cada prova deles rodou de novo aqui.

Onde um membro só é afirmado por um teste que roda no gate mas que nenhum `Proof:` nomeia, ou onde a asserção
passa por outro motivo, a célula `Unproven` fica vazia e o membro aponta para *Não bloqueia*. Isso é a regra de
parada do dono, e não um membro provado.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas do `Surface` e seus status (11 rotas) | `prd.md` `## Surface` | `health` 200 C13 · `updateStatus` 200 C18 · `update` 200 C27, 409 C30/C31, 412 C32 · `status` 200 C52 · `resources` 200 C46 · `settings`/`setSettings` 200 C22, 400 C23 · `usage.total` 200 C42, 400 C44 · `rateLimits` 200 C45 · `system.live` 200 C87 · `workspace.recent` 200 C88 · `GET /menubar` 200 C59 | - |
| verbos do CLI (10) | `prd.md` `Surface`, tabela do CLI | `start` C4 · sem verbo C7 · `run` C8 · `stop` C9 · `status` C10 · `logs` C11 · `upgrade` C39 · `menubar install` C62 · `menubar open` C89 · `menubar uninstall` C66 | - |
| saídas do CLI que não são 0 (12) | `prd.md` `Surface`, tabela do CLI | `start` 1: C5, C6 e C4 · `stop` 1: C9 · `status` 3: C10 · `logs` 1: C12 · `menubar install` 1: C64 · o código do gerenciador no `install`: C92 · `menubar open` 1: C89 · `upgrade` 1: C39 (`upgrade.test.ts:198`) · o código do gerenciador no `upgrade` e no `uninstall`: carregados da rodada 5 | - |
| portas de mão única (9) | `prd.md` `## Landing` | 1 C7 · 2 C1 · 3 C24 · 4 C14 · 5 C62 · 6 C79 · 7 C34 · 8 C27 · 9 C90 | - |
| supervisores, escritor de serviço (2) | `prd.md` porta 2 | launchd C1 · systemd C2 | - |
| supervisor de verdade que esta feature deve (1, depois da decisão do dono) | `Test policy`, linha *o serviço de verdade*; `docs/project/backlog.md:796` | launchd: os quatro passos do `smoke:service`, exit 0 aqui. O `systemd --user` saiu do conjunto por decisão do dono (*Adiado pelo dono*) | - |
| **bloqueios do `system.update` (AC 27–29), como estados** | `prd.md:235-237`; `packages/server/src/routers/system.ts:71-93` | turno e script `(2, 1)`, turno sem script `(2, 0)`, script sem turno `(0, 1)`: C30 (`system.test.ts:198-201`) · ocioso `(0, 0)` aceita: C27 · já instalando: C31 · sem supervisor e sem versão nova, cada um sozinho: C32 | - |
| **a leitura da tabela em duas passadas (C51)**: darwin (os elos, a árvore, o `-x`, árvore vazia, raiz morta, pai em laço, morto entre as passadas) · Linux (`stat` de todos, `status` só da árvore, `stat` sem `status`) | `packages/server/src/resources/process-table.ts:70-195` | os dois comandos e a árvore no darwin: C51 (`process-table.test.ts:182` e `:195`) · `stat` sem `status` no Linux: C51 (`:375`) · o `status` só da árvore no Linux: teste sem `Proof:` (N2) · árvore vazia, raiz morta e laço: teste sem `Proof:` (`:256`) · `stat` malformado: afirmado, mas por outro motivo (N1) | - |
| **o amostrador**: primeira pergunta arma, duas juntas armam um relógio, 15 s desarmam, as raízes vão ao leitor | `packages/server/src/resources/sample.ts:124-210` | armar e desarmar C49 · um relógio para duas perguntas C49 (`sample.test.ts:380`) · as raízes que o daemon rastreia: teste sem `Proof:` (N3) | - |
| **o intervalo de amostragem do C61 (5 s)** | `checks.md` C61; `packages/server/src/resources/sample.ts:21` | medido a 5 s pelo `measure:resources`, que lê a constante · nenhuma asserção nomeada diz 5 (N4) | - |
| estados do kernel para o sandbox (9) | `prd.md:281` (AC 78); `packages/cli/src/menubar.ts:56-59` | os nove em `packages/cli/src/menubar.test.ts:248-257`, afirmados em `:264-278`; M7 morre em `(1, 1)` e M11 em `(0, 0)` | - |
| layout do gerenciador global (3) | `prd.md` AC 77 | npm, pnpm com o symlink e pnpm sem ele: C85 | - |
| plataformas do app no install (4) | `prd.md` porta 5 | as quatro, C62, num laço sobre `DESKTOP_PLATFORMS` | - |
| as duas metades do AC 69 (2) | `prd.md` AC 69 | macOS: `smoke:install --only desktop`, exit 0 aqui · Linux: o job `app (linux-x64)` do run 36722841349 | - |
| artefatos do release (3 tipos × arquitetura) | `prd.md` AC 68 | `.zip`, `.AppImage` e `.deb` no run 36722841349; o anexo do `gh release create` é afirmado no texto (`scripts/release-workflow.test.ts:83`) | - |
| estados do ícone (4), linhas da tabela (5) e itens do menu (6) | `prd.md` AC 60 e 62 | C69 e C71 | - |
| blocos do `/menubar` que falham sozinhos (4) | `prd.md` AC 50 | `Consumo`, `Turnos em voo` e `Versão` C86 · `Recursos` C57 | - |
| condições do tique automático (AC 72) | `prd.md:308`; `packages/server/src/update/auto.ts:74-80` | `off` e `idle` C80 · sem supervisor, sem versão e com script: C80, segunda prova · turno em voo C81 · major C82 | - |
| falhas do registry (3) e desfechos da instalação (3) | `prd.md` AC 17 e AC 25–26 | C19 · C28 e C29 | - |
| grupos de recursos (3) e manchete do painel (3) | `prd.md` AC 41 e AC 46–47 | C47 · C53 e C54 | - |
| valores de `auto_update` (3) e a regra do major (4) | `prd.md` porta 3 e AC 74 | `off`, `idle` C80, inválido C23 e C24 · os quatro casos C82 | - |
| esteira pausada durante a instalação (2 montagens) | `runConveyorLoop` em `packages/server/src/bootstrap.ts:572`, e a do teste | as duas, C83; o M1 morre | - |
| startup config `LUMEM_SUPERVISOR` (2 montagens) | lida em cada montagem | o serviço de verdade `scripts/smoke-service.ts:185` (C15) · o harness do router C13 | - |

## Test policy rows

Verified at 38e5db69. Desde a rodada 5, esta linha mudou só o que os testes afirmam, e não o código de
`packages/desktop` nem de `packages/cli`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `packages/desktop`, decide | `tray-state.ts`, `menu.ts`, `windows.ts`, `commands.ts` | vitest com o `electron` dublado: `packages/desktop/src/tray-state.test.ts:30`, `menu.test.ts:38`, `windows.test.ts:350` e `commands.test.ts:28` | yes - as 5 linhas do ícone (C69) e os 6 itens do menu (C71), cada um com asserção |
| `packages/desktop`, a casca inteira | `main.ts`, `index.ts`, `preload.ts`, `assets/stopped.html` | um e2e com `_electron.launch`: `packages/desktop/e2e/app.spec.ts:65`, rodado aqui | yes - sobe, cria o ícone, e o painel carrega `/menubar` (macOS); em Linux o app empacotado subiu sob `xvfb` pelo job `app (linux-x64)` |
| `packages/cli`, escritor de serviço | `service.ts` e os verbos de serviço de `run.ts` | vitest com `launchctl`, `systemctl` e o disco dublados | yes - o conteúdo por supervisor (C1, C2), a ordem (`service.test.ts:161` e `:234`) e cada recusa (C5, C6, C9, e o passo do systemd em `:465`) |
| `packages/cli`, o serviço de verdade | `service.ts` contra o supervisor do sistema | `pnpm smoke:service`, local | yes, sob o launchd - os quatro passos com exit 0 aqui. O `systemd --user` foi adiado pelo dono (`docs/project/backlog.md:796`), com gatilho antes da próxima tag |

## Faults injected

Verified at 38e5db69. As mutações rodaram numa cópia descartável: `git archive HEAD` em `/tmp/v038r6/wt`, com
os `node_modules` da árvore real ligados por symlink. Nada mexeu no estado do git.

- Antes de qualquer mutação, as provas-alvo rodaram verdes na cópia: 59 testes em quatro arquivos do `server`, e
  20 no `menubar.test.ts`.
- Cada arquivo mutado foi restaurado da árvore real, com `cmp` conferindo, antes da falha seguinte. No fim, os
  arquivos de `packages/server/src` e `packages/cli/src` da cópia batiam com os da árvore real.
- A cópia foi apagada no fim.
- O porcelain da árvore real era ` M docs/features/038-desktop-and-updates/verification.md` antes, o relatório
  da rodada 5 ainda sem commit. Ao fim das mutações era o mesmo.

Cada mutante roda primeiro contra as provas que o check nomeia. Quando elas deixam passar, roda contra o arquivo.
Os cinco pedidos (M7, M11, M14, M1, M2) e o M16 da rodada 5 são reinjeções. Os seis novos atacam as superfícies
que esta rodada criou: os dois relógios, as duas passadas, as raízes e o intervalo.

| Mutation | Location | Killed |
| --- | --- | --- |
| M7 - `refused: usernsClone !== null ? usernsClone === "0" : apparmorRestrict === "1"`: o botão do Debian decide sozinho | `packages/cli/src/menubar.ts:59` | yes - C93 cai em `userns 1, apparmor 1 (Ubuntu 23.10+): expected '[Desktop Entry]…' to contain 'Exec="…'` |
| M11 - `refused: apparmorRestrict !== null ? apparmorRestrict === "1" : usernsClone === "0"`: o botão do AppArmor decide sozinho | `packages/cli/src/menubar.ts:59` | yes - C93 cai em `userns 0, apparmor 0` |
| M14 - `if (!isIdle(busy))` vira `if (busy.liveTurns > 0 && busy.runningScripts > 0)`, e o import de `isIdle` sai | `packages/server/src/routers/system.ts:8` e `:85` | yes - C30 cai com `promise resolved "{ started: true }" instead of rejecting`. Sobrevivia na rodada 5 |
| M1 - `paused: () => update.installer.installing()` vira `paused: () => false` | `packages/server/src/bootstrap.ts:572` | yes - C83 cai com `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| M2 - `Math.round(value * 10) / 10` vira `Math.round(value)` | `packages/server/src/resources/sample.ts:84` | yes - as duas provas do C46: o amostrador (`expected { …(3) } to deeply equal { …(3) }`) e o router (`expected 2 to be 1.6`) |
| M16 - o tique perde `!supervised \|\|` | `packages/server/src/update/auto.ts:75` | yes - agora pela prova nomeada do C80 (`does nothing without a supervisor…`), com `expected "vi.fn()" to not be called at all` |
| M17 (novo) - `disarm ??= every(…)` vira `disarm = every(…)`: o defeito dos dois relógios de volta | `packages/server/src/resources/sample.ts:204` | yes - C49 cai em `arms one clock when two first questions arrive together`: `expected 2 to be 1` |
| M18 (novo) - a árvore não desce: some o `queue.push(...(childrenOf.get(pid) ?? []))` | `packages/server/src/resources/process-table.ts:96` | yes - C51 cai: `expected [ …(1) ] to deeply equal [ …(4) ]` |
| M19 (novo) - o Linux lê o `status` de todos: some o `if (!inTree.has(entry.pid)) continue;` | `packages/server/src/resources/process-table.ts:172` | yes, pelo arquivo - sobrevive às duas provas do C51 e cai em `reads the Linux status file only for the tree…` (`process-table.test.ts:279`), que nenhum `Proof:` nomeia (N2) |
| M20 (novo) - o Linux volta a aceitar `stat` sem `status`, com memória zero | `packages/server/src/resources/process-table.ts:176` | yes - C51 cai em `reads every time format ps prints…`: `expected [ [ 10, 'node', 50540544 ], …(1) ] to deeply equal [ [ 10, 'node', 50540544 ] ]` |
| M21 (novo) - o amostrador pede ao leitor só o pid do daemon: `read([roots.daemonPid])` | `packages/server/src/resources/sample.ts:127` | yes, pelo arquivo - sobrevive às 25 provas nomeadas de `sample`, `live` e `system` e cai em `asks the reader only for the pids the daemon tracks…` (`sample.test.ts:414`), sem `Proof:` (N3) |
| M22 (novo) - `SAMPLE_INTERVAL_MS` volta para `3_000` | `packages/server/src/resources/sample.ts:21` | yes, pelo arquivo, e por acaso - sobrevive às provas nomeadas do C49 e do C61 e cai em `reports a process born between samples as null…`, cujo relógio fixo de 5 s deixa de bater. O `measure:resources` daria ~0,87% a 3 s e passaria (N4) |

**O Stryker, nos dois arquivos de produção que mudaram.** Rodei o Stryker na mesma cópia, com um
`stryker.*.json` descartável, `mutate` em `process-table.ts` e `sample.ts`, e os testes de `resources/` e do
router `system`. O resultado, e o que sobrevive, está em *Não bloqueia* (N1 e N5). Um sobrevivente foi conferido
à mão (S1) e está lá também. Nenhum deles entra na coluna `Killed` acima, pela regra do dono.

## Não bloqueia (regra de parada)

A regra é do dono, de 2026-09-30 (`checks.md:542`). Cada item aqui é teste fraco sobre código que se comporta
certo no `HEAD`. Nenhum é um `Proof:` que falha, e nenhum é uma saída errada num caso que um critério define. Vão
para o backlog, nesta ordem. A coluna *Teste que fecha* é o teste de uma linha que fecharia cada um.

| # | O quê | Onde | Teste que fecha |
| --- | --- | --- | --- |
| N1 | **A leitura em duas passadas tornou inalcançáveis as guardas de `stat` malformado do Linux.** O teste as provava com entradas `stat` sem `(`, sem `)`, com `ppid` que não é número, e com entradas que não são pid (`12abc`). Nenhuma dessas entradas tem `status`. Antes de `e921c107`, a linha sem `status` entrava com memória zero, e a guarda era quem a tirava. Agora a segunda passada descarta quem não tem `status`, e a asserção passa por esse motivo. O S1 (`if (open === -1 \|\| close === -1)` vira `if (false)`) sobrevive ao arquivo inteiro. O Stryker acha 25 sobreviventes em `process-table.ts`: os de `:137`, `:138`, `:141`, `:162` e `:166` são dessa classe, e a varredura do `Handoff` (`checks.md:513`) ainda os dá como mortos, porque foi escrita antes de `e921c107`. Em produção todo pid de `/proc` tem `status`, então hoje as guardas decidem sozinhas. O código as mantém, e o comportamento está certo | `packages/server/src/resources/process-table.ts:137-166`; `packages/server/src/resources/process-table.test.ts:347-362` | dar `status` às entradas malformadas: `["/proc/24/status", STATUS_10]`, e o mesmo para 20, 21, 22, 23, 25, `12abc` e `abc12`, no mapa do teste de `:313` |
| N2 | **O `status` só da árvore, no Linux, não tem prova nomeada.** As duas provas do C51 chamam o leitor de Linux com todos os pids como raízes, e aí a árvore é a tabela inteira. O M19 sobrevive a elas e cai num teste que roda no gate, sem `Proof:` | `packages/server/src/resources/process-table.ts:172`; teste em `process-table.test.ts:279` | nomear `reads the Linux status file only for the tree, and never a process that died before it` como terceira `Proof:` do C51 |
| N3 | **As raízes que o amostrador passa ao leitor não têm prova nomeada.** Todo leitor falso das provas do C46–C50 ignora o argumento. O M21 sobrevive a elas | `packages/server/src/resources/sample.ts:127`; teste em `sample.test.ts:414` | nomear `asks the reader only for the pids the daemon tracks, and attributes with the same answer` como `Proof:` do C51 ou do C47 |
| N4 | **Os 5 s do C61 não são afirmados.** O claim diz *"a cada 5 s"*, e nenhuma asserção nomeada diz 5. O `measure:resources` lê a constante e imprime o intervalo, mas a 3 s mediria ~0,87% e sairia 0. O M22 só morre por acaso | `packages/server/src/resources/sample.ts:21` | `expect(SAMPLE_INTERVAL_MS).toBe(5_000)` num teste que o C61 nomeie |
| N5 | **Mais cinco sobreviventes do Stryker em `sample.ts`.** `disarm?.()` virando `disarm()` sobrevive (`:191`): nenhum teste chama `stop()` sem relógio armado, que é o caminho de um daemon que desliga sem ninguém ter olhado os recursos. Os outros são o `timer.unref()` e o `clearInterval` do relógio real (`:72-74`), o `label: ""` provisório (`:145`) e o `if (latest === null)` (`:206`), que ninguém alcança depois da primeira amostra. A conta: 109 mortos e 6 sobreviventes em `sample.ts`; 173 mortos, 1 por tempo, 25 sobreviventes e 23 sem cobertura em `process-table.ts`. Os 23 sem cobertura são o `nodeProcessTableHost`, que o `measure:resources` e o e2e do C60 exercitam | `packages/server/src/resources/sample.ts:191` | `createResourceSampler(…).stop()` antes de qualquer pergunta, com `expect(() => sampler.stop()).not.toThrow()` |
| N6 | **A leitura de duas passadas no Linux nunca rodou num kernel de verdade.** O C51 prova o `/proc` com amostras gravadas. O run 36722841349 é de `32f8aac6`, anterior a `e921c107`, e o C78 afirma só que a janela carregou `/menubar`, e não os números do bloco de recursos. O macOS rodou de verdade: o e2e do C60 viu `/\d+,\d%/` no Daemon, e o `measure:resources` a árvore de 11 | `packages/server/src/resources/process-table.ts:159-180` | `pnpm measure:resources --only ten-sessions` numa máquina Linux, ou um passo do `release.yml` em `dry_run` que o rode |
| N7 | **Uma falha intermitente de `runningCount` sob carga.** Na suíte inteira do `server` na cópia, sob carga (e com um mutante não relacionado em `process-table.ts`), `counts the scripts that are running, in every checkout` recebeu 3 onde esperava 2 (`packages/server/src/routers/scripts.test.ts:107`). Não reproduziu sozinho (3 vezes), nem em quatro rodadas paralelas com o `bootstrap.test.ts`, nem no `gate:quick`. A causa não está achada. Se fosse real, a mensagem do `CONFLICT` do AC 27 contaria scripts a mais, mas a recusa seria a mesma | `packages/server/src/scripts/ScriptRunner.ts:358-366` | repetir o teste com `--repeat` sob `LUMEM_TEST_PRIORITY=normal`, e imprimir as linhas `running` quando o número não bater |
| N8 | **Testes do `bootstrap` deixam o relógio da verificação armado depois de fechar o banco.** Na mesma rodada sob carga, o tique de 10 s de `check.ts` disparou três vezes depois de o banco fechar: `TypeError: The database connection is not open`, com origem em `src/bootstrap.test.ts`. Em produção a ordem está certa, porque `update.check.stop()` (`bootstrap.ts:636`) vem antes de `openedDatabase.close()` (`:656`). Mas o `checkNow` promete *"nunca lança"* (`check.ts:47`) e chama `enabled()` fora do `try` (`:65`) | `packages/server/src/update/check.ts:65` | `enabled` que lança, e `await expect(check.checkNow()).resolves.toBeUndefined()` |
| N9 | Carregados da rodada 5, sem mudança: o passo de Linux do `smoke:install` sobe o app com o `--no-sandbox` próprio, e não pelo `Exec=` que o CLI escreveu; o clique do sistema no ícone não é exercitado; o `measure:resources` só roda no macOS | `scripts/smoke-install.ts:337` | lançar pelo `Exec=` do `.desktop` gravado, e afirmar `phase0-q4` em vez de imprimir |
| N10 | Documentação. O `testing.md` não registra a armadilha que a rodada achou na medição: o `time -p` do macOS trunca cada leitura a 10 ms, e um `ps` medido sozinho perdia metade do custo. Está em `checks.md:495` e no comentário de `measure-resources.ts:110-113`, mas não em *Armadilhas já corrigidas*. O cabeçalho de `measure-resources.ts:9-10` ainda cita a meta da fase 0 com *"a cada 3 s"*, o que é histórico mas lê como vigente. O `refetchInterval: 5_000` de `queries.ts:58` repete à mão a constante do daemon | `docs/project/testing.md`; `packages/server/src/testing/measure-resources.ts:9` | uma entrada nova em *Armadilhas já corrigidas* |

## A evidência do CI

Run 36722841349 (`workflow_dispatch`, `dry_run`), `headSha` `32f8aac6048114c8c6f1f8ad618a4ac8f1edcbea`,
conclusão `success` (`gh run view 36722841349 --json conclusion,headSha,event`). O log salvo é
`.context/phase0/dry-run-2.log`, com 1 058 927 bytes. Dele: "phase0-q4: sandbox=refused userns_clone=1
apparmor_restrict=1" (linha 6701), "a janela carregou /menubar" (6704) e "✓ o app instala e confere" (6706),
todas do job `app (linux-x64)`.

**Vale para o `HEAD`?** Sim, para o que o C78 e o C93 afirmam. De `32f8aac6` a `38e5db69`, fora de `docs/` e dos
testes, mudaram quatro arquivos:

- `packages/server/src/resources/process-table.ts`;
- `packages/server/src/resources/sample.ts`;
- `packages/server/src/testing/measure-resources.ts`;
- `packages/web/src/features/menubar/queries.ts`.

`git diff --name-only 32f8aac6 HEAD -- .github scripts packages/desktop packages/cli/src/menubar.ts
packages/cli/src/upgrade.ts packages/shared`, sem os testes, sai vazio. O workflow, os scripts de smoke e release,
o pacote do app e o `menubar` do CLI são os mesmos que o run construiu e rodou. O que mudou é do servidor: como
ele lê a tabela de processos e a cada quanto amostra. O C78 não afirma nada disso: afirma que o pacote instala, que
o app sobe sob `xvfb` e que uma janela pede `/menubar`. O C93 no kernel de verdade é o estado `(1, 1)` do runner,
com o mesmo CLI. O que o run **não** cobre no `HEAD` é a leitura nova no Linux, e ela está em *Não bloqueia*
(N6).

## Adiado pelo dono

| O quê | Estado | Onde está a decisão | O que fica sem prova |
| --- | --- | --- | --- |
| `pnpm smoke:service` sob o `systemd --user` de verdade | não rodou em máquina nenhuma. Os runners não têm sessão de usuário | `docs/project/backlog.md:796`, com o gatilho em `:807`: **antes da próxima tag** | o `lumem start` de verdade sob o `systemd --user`, a sobrevivência ao chamador numa sessão real e o relançamento depois do `system.update`. O apoio é a unit num systemd 252 em contêiner, da rodada 2 |

Isso não é uma falha desta rodada. Nenhum check depende disso para passar como está escrito: o C15 e o C40 dizem
*o supervisor*, e rodaram sob o launchd.

## Gate

Verified at 38e5db69.

- `LUMEM_GATE_BASE=b226b4b pnpm gate:quick`: `docs ok`, e a suíte inteira, porque uma dependência mudou. **325
  arquivos, 5248 passed, 6 skipped, 0 failed**, `exit=0`. Um arquivo a mais que na rodada 5: o
  `session-place.test.ts`, novo.
- `pnpm lint`: `exit=0`.
- `pnpm exec turbo typecheck --force`: `Cached: 0 cached, 5 total`, `Tasks: 5 successful, 5 total`. `pnpm exec tsc
  -p tsconfig.json --noEmit` da raiz: `exit=0`.
- `pnpm docs:check`: `docs ok`, `exit=0`.
- `pnpm exec playwright test e2e/update.spec.ts e2e/menubar.spec.ts`: 3 passed (49,2 s). `o painel abre numa aba
  e mostra os três blocos` (C60) e `a página volta inteira depois da atualização` (C37, C41), cada um com `✓`.
- `pnpm --filter @lumem/desktop exec playwright test e2e/app.spec.ts -g "o app sobe e o painel carrega a página
  do daemon"`: 1 passed (2,4 s), para o C77.
- `pnpm smoke:service --only start-waits-for-health`, `--only stop-leaves-nothing`, `--only survives-the-caller`
  e `--only update-relaunches`: os quatro deram exit 0 sob o launchd, cada um com "✓ o serviço de verdade se
  comporta". Depois, `launchctl print gui/501/tech.cazimi.lumem-smoke` responde *Could not find service*, e
  `launchctl list` não tem `lumem-smoke`. O `tech.cazimi.lumem.plist` em `~/Library/LaunchAgents` é o serviço de
  produção do dono, de 12:36, e não um resto do smoke, que usa outro rótulo (`scripts/smoke-service.ts:41`).
- `pnpm measure:resources --only ten-sessions`, três vezes, cada uma com exit 0 e "✓ dentro do limite":

  | Rodada | Daemon por amostra | `ps` por amostra | Custo |
  | --- | --- | --- | --- |
  | 1 | 4,00 ms | 22,40 ms | 0,53% |
  | 2 | 4,79 ms | 21,80 ms | 0,53% |
  | 3 | 6,01 ms | 19,80 ms | 0,52% |

  O autor mediu 0,52–0,71%, e a rodada 5 mediu 0,89–0,99% a 3 s.
- `pnpm smoke:install --only desktop`: exit 0 em darwin-arm64, com "ad-hoc, e confere", "nenhum
  com.apple.quarantine" e "✓ o app instala e confere". Nenhum processo do app ficou rodando.
- `pnpm smoke:install` (o caminho padrão): exit 0, com "200 text/html; charset=utf-8", "v0.6.1" e "✓ o pacote
  instala e sobe".
- O porcelain antes da rodada e depois de tudo: ` M docs/features/038-desktop-and-updates/verification.md`.
- `pnpm -s feature:check verification docs/features/038-desktop-and-updates`: `validate-verification: 0 erro(s), 0 aviso(s) em docs/features/038-desktop-and-updates/verification.md`, `exit=0`, sobre este arquivo.

## Swept

Verified at 38e5db69.

- **authorization: existing** confere: as rotas novas são `publicProcedure` (`packages/server/src/trpc.ts:144`),
  a mesma fronteira de todo o `/trpc`.
- **concurrency: C31, C33, C83**: o M1 morre. Nesta rodada entra um quarto caso que a varredura achou: as duas
  primeiras perguntas de `system.resources` juntas (C49, M17).
- **state transitions: C69, C80, C81**: as linhas do ícone estão afirmadas; o tique morre sem supervisor, agora
  pela prova nomeada (M16).
- **failure modes, dependency failure**: o AC 27 está fechado (M14).
- A janela conhecida da S5 continua registrada no `Handoff`, sem check: uma passada da esteira já em
  `prepareCheckout` não conta como turno em voo.

## Quem fecha

Esta é a rodada 6, a última por decisão do dono. O veredito é PASS pela regra de parada dele: as 174 provas
passam no `HEAD`, e não há defeito de comportamento. Os dez itens de *Não bloqueia* vão para o backlog, pela ordem.

**Lição (passo 7).** Proposta para *Armadilhas já corrigidas* de `docs/project/testing.md`. O verificador só
escreve este arquivo:

> **Mudar o caminho do código pode tornar inalcançável a guarda que um teste afirmava, e o teste continua
> verde.** Na 038, o teste do `/proc` provava as guardas de `stat` malformado com entradas sem `status`. Enquanto
> a leitura aceitava linha sem `status`, a guarda era quem tirava a entrada. Depois das duas passadas, é a falta
> de `status` que tira, e remover a guarda passa pelo arquivo inteiro. A varredura de mutantes da mesma rodada,
> escrita antes da mudança, ainda a dava como morta. **A regra:** uma varredura de mutantes vale para o commit em
> que rodou. Depois de mudar o código que ela cobriu, roda de novo nos arquivos mudados. E a entrada que prova uma
> guarda tem de passar por todos os outros filtros, para que só a guarda possa tirá-la.
