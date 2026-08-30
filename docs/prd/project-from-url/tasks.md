# Projeto por URL git — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 22, todas respondidas
**Protótipo:** `packages/web/prototype/lumem-clone.html` — entregue pela C1, nove telas
**Sucede:** [file-editor](../file-editor/tasks.md)
**Status:** **fechada** — 17 de 17, portão verde (`gate:full`: 1142 unit/integration + 22 e2e)
**Total:** 17 tasks em 5 fases

---

## Notas de contexto

Fonte de verdade das premissas e das pendências desta feature. Quem retoma o trabalho a frio lê esta seção antes de qualquer task.

### Premissas travadas

Cada uma vem de uma pergunta **respondida** em [open-questions.md](open-questions.md). Implementar contra qualquer outra coisa é apostar.

| # | Premissa | Origem |
|---|---|---|
| **A1** | Um campo só, com detecção `/`-ou-`~` = caminho, resto = URL, e a linha `↳` dizendo o que foi entendido | Q1 |
| **A2** | Clone é **job**, não mutation que espera. Sem timeout total; timeout de silêncio | Q2, Q7 |
| **A3** | Progresso em fluxo **próprio** (`project.cloneProgress`), nunca em `events.onChange`. Estado terminal emite `project.changed` | Q3 |
| **A4** | O job vive **em memória**. O que sobrevive a restart é a varredura do lixo no disco | Q4 |
| **A5** | **Um** caminho de registro. O clone termina chamando o mesmo código do `project.add` | Q5 |
| **A6** | Colisão de nome na hora de registrar **ajusta com sufixo e diz**; não descarta o clone | Q6 |
| **A7** | `remote_url` é coluna nova, anulável, **sanitizada** | Q8 |
| **A8** | **O destino não é escolhido.** `projectHome/repo`, calculado pelo servidor, exibido, copiável, **não editável** | Q14, Q20 |
| **A9** | Lista de **permissão** de esquema — `https`, `http`, `ssh`, scp, `file`; **`git://` fora**. `--` no argv, `protocol.allow=never`, `--no-recurse-submodules` explícito | Q10, Q11, Q12, Q16 |
| **A10** | Nenhum processo desta feature pode **perguntar** nada: `GIT_ASKPASS`/`SSH_ASKPASS` vazios e `BatchMode=yes` **composto** sobre o `GIT_SSH_COMMAND` que já houver | §4.2 do PRD |
| **A11** | **Um clone por vez.** O segundo pedido é recusado nomeando o primeiro. Sem fila | Q17 |
| **A12** | `remove` de projeto **gerenciado apaga o diretório**. "Gerenciado" é a coluna `managed`, gravada no clone — nunca deduzida de `remote_url` ou do prefixo do caminho | Q15 |
| **A13** | Falha de autenticação é **estado próprio** (`failure: "auth"`), não stderr genérico repassado | Q13 |
| **A14** | Repositório vazio **clona** | Q19 |
| **A15** | **Uma árvore só:** `~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`. `worktreesDir` deixa de existir | **Q20** |
| **A16** | `projectHome` é função de `(workspace, projeto)`, **nunca de `managed`**. Projeto registrado por caminho também tem pasta na árvore — sem `repo/`, com `worktrees/` | **Q20** |
| **A17** | Worktree que se muda passa por **`git worktree repair`**. `mv` sozinho a quebra em silêncio | **Q20** |
| **A18** | Projeto sem commit **explica** em vez de deixar o git responder; `hasCommits` é calculado por requisição, como `available` | **Q21** |

### Pendências

Numeradas, e nenhuma delas vive só numa mensagem ou num comentário de código.

| # | O quê | Estado |
|---|---|---|
| **P1** | Daemon sem autenticação, agora com procedure que faz rede, escreve **e apaga diretório** | **herdada da file-editor e amplificada duas vezes.** Não é paga aqui. Está no §4.7 e no §9 do PRD, e é ela que segura a P2 |
| **P2** | Configuração de transportes permitidos, com `http` e `file` desligáveis | **respondida e adiada** ([Q22](open-questions.md)): vem quando o daemon tiver autenticação. Até lá a lista é uma linha de código, e cada teste de recusa cita a pergunta que a decidiu |
| **P3** | **Escopo vazado, e assumido:** uma feature de clone mexe em `config.ts`, em `worktree.create`, em `CreateWorktreeDialog` e numa migração de dados | **decidida pela [Q20](open-questions.md) e pela [Q21](open-questions.md)**, e nomeada no §2.2 do PRD. O que a mantém honesta é a C4 e a C17 serem requisitos com nome (F6.12, F6.13), e não efeito colateral de outra task |
| **P4** | Renomear um projeto **não** move o `projectHome` dele. O caminho fica com o nome antigo, e a linha do banco continua certa porque é absoluta | **pré-existente, e mais visível com a árvore nova.** Não é regressão desta feature e não é corrigida por ela. Vira dívida com nome — antes ela nem tinha |
| **P5** | Sem cota de disco. Um clone pode encher o volume | aberta, aceita na v1. O que existe é cancelar e o detector de estagnação |
| **P6** | O número do timeout de silêncio (120 s) foi escolhido no desenho, não medido | **aberta, e a C6 não a fechou.** Medir de verdade exige um remoto lento, e a fixture é local: um clone de 24 MiB por `file://` fala a cada poucos milissegundos, o que não diz nada sobre um `git fetch` numa rede ruim. O número segue sendo escolha, agora dita: 120 s pega DNS pendurado e servidor que sumiu, e não pune quem é lento. Fecha quando houver um clone remoto de verdade para cronometrar |
| **P7** | Submódulos | fora da v1 por segurança, não por escopo ([Q16](open-questions.md)) |
| **P8** | ~~Teto de clones simultâneos~~ | **morta pela [Q17](open-questions.md)**: um por vez, recusa em vez de fila |
| **P9** | ~~Destino padrão por workspace~~ | **morta pela [Q14](open-questions.md)**: não há destino escolhível |
| **P10** | ~~Duas árvores para a mesma hierarquia~~ | **morta pela [Q20](open-questions.md)**: passou de incoerência aceita a trabalho feito, na C3 e na C4 |

---

## Ordem, e por quê ela é essa

**Desenho primeiro**, como nas quatro features anteriores: nove estados de tela, e sete não são o caminho feliz.

**O layout antes de tudo que escreve.** A C3 define onde as coisas moram e a C4 muda as worktrees para lá. Vêm cedo porque **todo** o resto calcula caminho — o clone, a varredura, a remoção — e porque a C4 mexe num caminho que já funciona hoje. Fazer isso depois significaria escrever tudo contra um layout que ia mudar.

**A string vira decisão antes de qualquer processo nascer.** Recusar `ext::` é a única parte que, se sair errada, sai como execução de comando arbitrário. Nasce sozinha, testada sozinha, antes de existir alguém para chamá-la.

**Depois o processo**, ainda sem contrato e sem UI: `spawn`, progresso, classificação de falha, estagnação, cancelamento e o par temporário/`rename`. Diagnostica-se melhor sem tRPC no meio — mesma razão pela qual a file-editor pôs a concorrência antes do editor.

**Depois o contrato**, onde o registro único (A5) aparece, as colunas novas entram, e o `remove` ganha o poder de apagar (A12). A C11 vem por último na fase de propósito: mexe no caminho mais perigoso do daemon.

**Por último a tela**, maior superfície e menor risco — com duas exceções: a C15 (confirmação de apagar) e a C16 (projeto sem commit), que dependem de coisas das fases anteriores existirem.

---

## Decisões que sustentam o resto

### D1 — Lista de permissão de esquema, nunca lista de bloqueio
`https`, `http`, `ssh`, scp e `file`. `git://` fora. O git aceita `ext::<comando>` como transporte: lista de bloqueio erra por omissão, e o erro é execução de comando arbitrário.

### D2 — Uma árvore só, e `projectHome` não pergunta se é gerenciado
`~/.lumem/workspaces/<workspace>/<projeto>/{repo,worktrees}`. Dois cálculos de caminho seriam duas regras de segurança, e uma delas ficaria para trás.

### D3 — Worktree se muda com `git worktree repair`, nunca com `mv` sozinho
É a única falha desta feature que é silenciosa e corrompe dado.

### D4 — O clone escreve num temporário irmão e só então `rename`
`<pai>/.lumem-clone-<jobId>` → `rename()` para o destino. Irmão para garantir o mesmo filesystem; nome previsível para a varredura de boot reconhecer.

### D5 — Um caminho de registro
O fim do clone chama o mesmo código do `project.add`. Dois caminhos seriam duas definições de projeto válido.

### D6 — Segredo morre na fronteira, em três lugares
`remote_url` sanitizada, `git remote set-url origin` depois do clone, e todo campo do job/log/erro passando pelo mesmo sanitizador. Um lugar só é o que se esquece.

### D7 — Progresso em fluxo próprio, estrangulado em 250 ms
Quatro quadros por segundo bastam para uma barra, e o canal `events.onChange` não é para dado.

### D8 — O job é memória; o disco é o que se reconcilia
Nada de linha em SQLite afirmando "clonando" sobre um processo que morreu com o daemon.

### D9 — Nada desta feature pergunta nada ao usuário no meio
Toda pergunta interativa do git ou do ssh vira falha imediata e legível.

### D10 — Apagar só o que se prova ser do Lumem
`managed = true` **e** caminho provado dentro da árvore por `realpath` no momento de apagar, **e** sem seguir symlink. Não é a linha do banco que autoriza o `rm`.

### D11 — Nenhum teste desta feature depende de rede
Fixture é bare local por `file://`; conexão recusada é `ssh://127.0.0.1:1/x`, que falha na hora.

---

## Fase 0 — Desenho

#### C1: Protótipo das nove telas

**What**: Desenhar em HTML+CSS, sobre o mesmo `tokens.css` do app, os nove estados do §3 do PRD — e verificar por renderização.
**Where**: `packages/web/prototype/lumem-clone.html`
**Depends on**: nada

**Done when**:
- [x] Os nove estados existem: caminho local; URL reconhecida (https/ssh/file, com **"sem TLS"** no caso `http`); URL recusada com motivo; clonando com as quatro fases; **falha de autenticação com as duas saídas e o botão de converter para ssh**; falha genérica dispensável; concluído com nome ajustado; **confirmação de remoção com o caminho que vai sumir**; **projeto sem commit no diálogo de worktree**
- [x] O destino aparece como **resposta**, não como campo — e tem o gesto de copiar (A8). **A primeira versão errou isto** e a renderização pegou
- [x] O progresso está **na sidebar**, não num modal, e a barra indeterminada tem forma própria
- [x] A confirmação de remoção é desenhada como o que ela é: a mais perigosa das nove
- [x] Nenhuma cor literal: tudo por token existente. **Nenhum token novo foi preciso** — o que a feature pede já existia em `save/*`, `danger/*` e `warning/*`
- [x] Verificado por renderização, não por leitura do HTML — e ela pegou quatro coisas, uma delas um defeito do gerador que deixava as telas vazias
- [x] O que a renderização achou vai para o §3 do PRD, como nas quatro features anteriores

**Tests**: renderização · **Gate**: nenhum (não há código de app)
**Commit**: `docs(prototype): draw the nine states of cloning and removing a project`

---

## Fase 1 — O layout, e a string que vira decisão

#### C2: Parser, lista de permissão e conversão para ssh

**What**: Transformar o texto colado em uma URL git validada — ou na recusa, com a regra que falhou nomeada. E produzir a forma `ssh` de uma URL `https`, que é a saída que o F6.10 oferece.
**Where**: `packages/server/src/git/git-url.ts` + teste
**Depends on**: nada

**Done when**:
- [x] Reconhece as quatro formas: `https`/`http`, `ssh://` com porta, scp (`user@host:caminho`), `file://`
- [x] **U1** — esquema fora da lista recusa. `ext::sh -c id` recusa nomeando o esquema, e há teste para ele **por nome**
- [x] `git://` recusa com mensagem que diz **por quê** — é o único recusado que o usuário poderia esperar que funcionasse ([Q11](open-questions.md))
- [x] **U2** — `\n`, `\r`, `\0` e qualquer byte de controle recusam; URL começando com `-` recusa
- [x] **U3** — host vazio recusa em `https`/`http`/`ssh`; caminho não-absoluto recusa em `file`
- [x] `http` é aceito e **marcado como sem TLS** na resposta, para o `↳` poder dizer ([Q10](open-questions.md))
- [x] `sanitizeGitUrl` remove o `userinfo` e é **idempotente**; um teste prova que a URL sanitizada não contém o segredo, comparando por substring
- [x] `toSshForm` converte `https://host/org/repo.git` em `git@host:org/repo.git`, e devolve nulo quando a conversão não é possível
- [x] `repoNameOf` devolve o último segmento sem `.git`
- [x] Cada teste de recusa de esquema cita a pergunta que o decidiu (**P2**)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 16

**Tests**: unit, puro · **Gate**: quick
**Commit**: `feat(server): parse git urls behind an allowlist of transports`

---

#### C3: A árvore de estado — `projectHome`, `repo/`, `worktrees/`

**What**: Um só lugar que calcula onde tudo mora, e prova que o resultado cumpre as seis regras do §4.4 do PRD.
**Where**: `packages/server/src/workspace-layout.ts` + teste, `packages/server/src/config.ts`
**Depends on**: nada

**Done when**:
- [x] `workspacesDir` entra em `ServerConfig` como `join(stateDir, "workspaces")`, e **`worktreesDir` sai** — nenhum outro módulo continua importando o nome antigo, e é o `tsc` que garante isso
- [x] `projectHome(workspace, projeto)`, `repoDir(home)` e `worktreeDir(home, nome)` são as três funções, e ninguém mais monta caminho com `join` por conta própria
- [x] `projectHome` **não recebe `managed`** (A16), e há teste com projeto não gerenciado provando que ele tem `worktrees/` na árvore
- [x] Os segmentos são **slugificados**: só `[A-Za-z0-9._-]`, nunca `.` ou `..` sozinhos, nunca vazio (fallback nomeado). Teste com nome contendo `/`, `..`, acento e string vazia (**R5** do PRD)
- [x] **D1** absoluto, normalizado, derivado de `stateDir` — inclusive com `LUMEM_STATE_DIR` relativo ou com `~`
- [x] **D2** o destino não existe, ou existe vazio
- [x] **D3** o pai é criado pelo daemon quando falta, e é erro quando existe e não é diretório
- [x] ~~**D4** não está dentro de repositório git existente~~ — **implementada e retirada.** Ver o §4.4 do PRD: ela recusava todo clone com o state dir dentro de um checkout, que é o que a suíte e2e faz e o que `git worktree add` sempre aceitou em silêncio
- [x] **D5** `repo/` e `worktrees/` não se engolem
- [x] **D6** o pai é resolvido por `realpath` antes de tudo; symlink apontando para fora é reconhecido como tal
- [x] Cada recusa tem mensagem própria: nenhuma responde "destino inválido"
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 12

**Tests**: unit, com filesystem e git de verdade (symlink e repositório não se simulam — `testing.md`) · **Gate**: quick
**Commit**: `feat(server): one tree for workspace, project and worktree`

---

#### C4: As worktrees se mudam

**What**: `worktree.create` passa a usar a árvore nova, e as worktrees já registradas se mudam numa migração de boot — com `git worktree repair` (F6.12).
**Where**: `packages/server/src/routers/worktree.ts`, `packages/server/src/boot/reconcile.ts` + testes
**Depends on**: C3

**Done when**:
- [x] `worktreePath` sai do router e vira `worktreeDir` da C3; o `create` alcança o workspace pelo `project.workspaceId`
- [x] Worktree nova nasce em `projectHome/worktrees/<nome>`, para projeto gerenciado **e** para projeto registrado por caminho (A16)
- [x] `migrateWorktreeLayout` roda no boot, **uma vez**: para cada worktree fora da árvore nova, move o diretório, roda `git worktree repair` a partir do repositório principal, e atualiza `worktree.path`
- [x] O teste da migração verifica a worktree **funcionando** depois de movida — `git status` dentro dela responde — e não só o diretório existindo. Sem `repair`, este teste falha, e é ele que prova o A17
- [x] Worktree ausente do disco **não** é movida: é marcada `missing`, como a reconciliação já faz
- [x] Falha ao mover uma não impede as outras nem o daemon de subir; o que falhou é reportado
- [x] Rodar duas vezes não faz nada na segunda
- [x] Os testes existentes de `worktree.test.ts` passam com a mudança de caminho, e nenhuma asserção de comportamento é enfraquecida para caber (**R10** do PRD)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 8 — nasce no lugar novo (gerenciado e não), migra e **funciona**, `missing` não migra, falha isolada, idempotência, `repair` ausente falha o teste

**Tests**: integration com git e filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): move worktrees under their project in the state tree`

---

#### C5: A proposta — o que a linha `↳` diz

**What**: Dado o texto colado, produzir `{ kind, url sanitizada, sem TLS?, nome proposto, destino calculado }` ou a recusa. Código puro; é o que a `project.parseSource` vai servir.
**Where**: `packages/server/src/git/clone-plan.ts` + teste
**Depends on**: C2, C3

**Done when**:
- [x] Detecção `/` ou `~` = caminho, resto = URL (A1), decidida **no servidor** — a do cliente é só desenho
- [x] Caminho local devolve `kind: "path"` com o caminho expandido ([Q18](open-questions.md)) e nada de nome/destino
- [x] URL devolve nome = repo sem `.git`, e destino = `repoDir(projectHome(...))` (A8)
- [x] Trocar o nome muda o destino — a função é uma só, e o teste prova que os dois andam juntos (F6.3)
- [x] `http` vem marcado, para o `↳` escrever "sem TLS"
- [x] Recusa devolve a regra que falhou, não um booleano
- [x] Gate: `pnpm gate:quick`

**Tests**: unit, puro · **Gate**: quick
**Commit**: `feat(server): turn a pasted string into a clone plan`

---

## Fase 2 — O processo

#### C6: `cloneRepository` — spawn, progresso, falha classificada, cancelamento

**What**: Rodar o clone por `spawn`, transmitir progresso, classificar a falha, morrer no silêncio, cancelar limpo, e entregar o destino final por `rename`.
**Where**: `packages/server/src/git/clone.ts` + teste
**Depends on**: C3

**Done when**:
- [x] `spawn`, não `execFile`: o progresso é lido enquanto acontece, e não há `maxBuffer` a estourar
- [x] O argv é exatamente o do §4.1 do PRD, incluindo `protocol.allow=never`, os quatro `allow=always`, `--no-recurse-submodules` e o `--`
- [x] O ambiente é o do §4.2: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=""`, `SSH_ASKPASS=""`, e `GIT_SSH_COMMAND` **composto** sobre o valor herdado — teste com um `GIT_SSH_COMMAND` pré-existente prova que ele não foi jogado fora
- [x] O progresso é fatiado por `\r` **e** `\n`, porque o git usa os dois; fases mapeadas para os seis nomes de `ClonePhase`
- [x] A falha é **classificada** em `auth | network | refused | git | internal` (A13), e há teste para o caso `auth` que não depende de rede
- [x] Linhas do remoto passam por remoção de ANSI e de bytes de controle, truncadas em 500 caracteres
- [x] O buffer retido é um anel de 64 KiB — teste despeja mais que isso e prova que a memória não cresce junto
- [x] Silêncio de 120 s mata o processo (**P6**: o número é medido nesta task e escrito aqui)
- [x] Cancelar manda `SIGTERM`, espera 5 s, manda `SIGKILL` — e só depois apaga o temporário
- [x] Clona em `<pai>/.lumem-clone-<id>` e `rename` no fim (D4)
- [x] URL com `userinfo`: o `git remote set-url origin <sanitizada>` roda depois do clone, e um teste **lê `.git/config`** e prova que o segredo não está lá
- [x] Repositório remoto **vazio** clona (A14)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 12

**Tests**: unit/integration com git de verdade; remoto é bare local por `file://` (D11); conexão recusada é `ssh://127.0.0.1:1/x`
**Gate**: quick
**Commit**: `feat(server): clone a repository with progress, cancellation and cleanup`

---

#### C7: `CloneJobStore`

**What**: A máquina de estados do job, em memória, com assinatura estrangulada e um de cada vez.
**Where**: `packages/server/src/git/CloneJobStore.ts` + teste
**Depends on**: C6

**Done when**:
- [x] Estados `cloning → registering → done | failed | cancelled`, e transição ilegal é erro, não silêncio
- [x] **Um job ativo por vez** (A11): pedir outro com um em `cloning` ou `registering` é recusa nomeando o primeiro, não fila
- [x] `subscribe(jobId, signal)` entrega instantâneos estrangulados em 250 ms, e **sempre** entrega o estado terminal, mesmo que ele caia dentro da janela do estrangulamento — é o teste que mais importa aqui
- [x] O sinal abortado libera o assinante; um teste prova que a contagem volta a zero, como `events.test.ts` faz
- [x] Jobs terminais são coletados depois de N minutos, para o daemon de semanas não acumular
- [x] Nenhum campo do job carrega `userinfo` (D6)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 7

**Tests**: unit, com relógio falso — e sem `userEvent` por perto ([P18 da file-editor](../file-editor/tasks.md)) · **Gate**: quick
**Commit**: `feat(server): track one clone job at a time, with throttled updates`

---

## Fase 3 — Contrato

#### C8: Registro único, `remote_url` e `managed`

**What**: Extrair o registro de projeto de dentro do `project.add` para uma rotina que o clone também chama (A5), e dar à linha do projeto a origem e a gerência (F6.8).
**Where**: `packages/server/src/routers/project.ts`, `packages/server/src/db/schema.ts`, `packages/server/drizzle/`, `packages/server/src/repositories/project.ts`
**Depends on**: C5

**Done when**:
- [x] `registerProject({ path, name, workspaceId, remoteUrl, managed })` existe como rotina única: valida por `isGitRepo`, resolve a branch default, insere, emite `project.changed`
- [x] `project.add` passa a chamá-la e **não muda de comportamento** — os testes existentes de `project.test.ts` passam **sem edição**, e essa é a evidência (**R10** do PRD)
- [x] `remote_url` (`text`, anulável) e `managed` (booleana, default falso) são colunas novas; migração **gerada** por `drizzle-kit generate`, nunca escrita à mão
- [x] `project.add` grava `managed = false` sempre. Não há caminho em que um projeto registrado por caminho vire gerenciado (A12)
- [x] Um banco de antes da migração abre e migra sem perder linha — teste com fixture do schema anterior
- [x] Sufixo de colisão (`-2`, `-3`) vive nesta rotina, e devolve o nome final para quem chamou poder dizer o que fez (A6)
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 5

**Tests**: integration com SQLite de verdade · **Gate**: quick
**Commit**: `refactor(server): one registration path for local and cloned projects`

---

#### C9: As cinco procedures de clone

**What**: `parseSource`, `clone`, `cloneJobs`, `cloneProgress`, `cloneCancel` sobre o wire.
**Where**: `packages/server/src/routers/project.ts` + teste
**Depends on**: C7, C8

**Done when**:
- [x] As cinco existem com o contrato do §7 do PRD
- [x] `clone` valida URL e nome **antes** de qualquer processo nascer, e devolve a recusa com a regra nomeada (F6.2)
- [x] `clone` checa colisão de nome no workspace antes de começar, e o `rename` final usa o nome resolvido logo antes dele. **A corrida que sobra é do último `resolve` até o `INSERT`**, e quem perde ali move os bytes uma vez a mais em vez de perder o download (F6.4)
- [x] `clone` responde `BLOCKED` nomeando o clone em andamento quando já houver um (A11)
- [x] O clone termina chamando `registerProject` com `managed = true`
- [x] `cloneProgress` é `subscription`, e o estado terminal também emite `project.changed` no canal comum (A3)
- [x] `cloneCancel` só aceita em `cloning`; em `registering` responde `BLOCKED` com o motivo (F6.6)
- [x] `cloneJobs` devolve os jobs vivos do workspace — é o que faz o F5 sobreviver a um recarregamento
- [x] Nenhuma resposta, nenhum log e nenhum erro carrega `userinfo`; há teste que clona com segredo na URL e varre **as três** superfícies
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 9

**Tests**: integration (caller tRPC + git de verdade por `file://`) · **Gate**: quick
**Commit**: `feat(server): expose cloning a project over trpc`

---

#### C10: A varredura de boot

**What**: Remover o que um clone interrompido deixou (F6.7).
**Where**: `packages/server/src/boot/reconcile.ts` + teste
**Depends on**: C6

**Done when**:
- [x] `reconcileClones` remove todo `.lumem-clone-*` sob `workspacesDir` e reporta a contagem, como `reconcileWorktrees` faz
- [x] Roda no boot, ao lado das outras duas, e uma falha dela não impede o daemon de subir
- [x] **Não** toca em nada que não case com o prefixo — teste põe um diretório de nome parecido ao lado e prova que ele sobrevive
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 3

**Tests**: unit com filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): sweep interrupted clones on boot`

---

#### C11: `remove` apaga o que é gerenciado

**What**: A reversão do F2.5 do walking-skeleton, limitada a `managed = true`, com as regras do §4.6 do PRD.
**Where**: `packages/server/src/routers/project.ts` + teste, `packages/server/src/git/managed-dir.ts` + teste
**Depends on**: C8, C3

**Done when**:
- [x] **A1** só apaga com `managed = true` — projeto registrado por caminho tem o repositório **intocado**, e há teste explícito, porque é o F2.5 que continua valendo para ele
- [x] **A2** o caminho é provado dentro de `workspacesDir` por `realpath` com separador, **no momento de apagar** — não pelo que a linha do banco diz. Teste com `path` apontando para fora prova a recusa
- [x] **A2.1** apaga `projectHome/repo`, e então apaga `projectHome` **só se ele ficou vazio**; `projectHome` com coisa dentro é erro, não `rm -rf`
- [x] **A3** `path` que é symlink recusa, e não é seguido
- [x] **A4** worktrees (`ON DELETE RESTRICT`) e sessões rodando continuam bloqueando antes de qualquer `rm`
- [x] **A5** o diretório some **antes** de o registro sair; se o `rm` falhar, o registro fica e o erro é dito
- [x] Diretório já ausente do disco não é erro: o registro sai, e a remoção é idempotente
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 9

**Tests**: integration com filesystem e SQLite de verdade · **Gate**: quick
**Commit**: `feat(server): delete the clone when removing a lumem-managed project`

---

## Fase 4 — A tela

#### C12: O campo que aceita as duas coisas

**What**: `AddProjectDialog` passa a aceitar URL, com a linha `↳`, o nome editável e o destino exibido.
**Where**: `packages/web/src/components/AddProjectDialog.tsx` + teste
**Depends on**: C9, C1

**Done when**:
- [x] Um campo só (A1); a linha `↳` mostra o que o **servidor** entendeu, via `parseSource` com debounce
- [x] Caminho local esconde nome e destino, e o fluxo antigo continua idêntico — o teste existente do diálogo passa **sem edição**
- [x] URL mostra nome editável e destino **exibido e copiável, nunca editável** (A8); mudar o nome muda o destino à vista
- [x] `http` mostra "sem TLS" em texto ([Q10](open-questions.md))
- [x] URL recusada mostra o motivo do servidor, e o botão fica desabilitado
- [x] Com um clone em andamento, o botão diz qual é, em vez de enfileirar (A11)
- [x] Fechar o diálogo **não** cancela um clone em andamento
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 6

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): accept a git url where a project path used to go`

---

#### C13: O progresso na sidebar

**What**: A entrada em clone na lista de projetos, com barra, fase em português e cancelar.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `packages/web/src/hooks/useCloneJob.ts` + testes
**Depends on**: C12

**Done when**:
- [x] O job vivo vem de `cloneJobs` no primeiro render, e de `cloneProgress` depois — recarregar a página não perde o acompanhamento
- [x] As seis fases aparecem em português (F6.5); sem porcentagem, a barra é indeterminada
- [x] Cancelar aparece só em `cloning` e some em `registering` (F6.6)
- [x] Terminado, a entrada vira projeto de verdade sem recarregar — pelo `project.changed` que já existe
- [x] O texto vindo do remoto é renderizado como texto (§4.5)
- [x] A assinatura é desfeita ao desmontar; um teste prova que não sobra nenhuma
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 5

**Tests**: componente + hook · **Gate**: quick
**Commit**: `feat(web): show clone progress where the project will appear`

---

#### C14: As falhas — e o fluxo próprio da autenticação

**What**: Os desfechos ruins com texto que diz o que fazer, e o F6.10 inteiro.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `packages/web/src/components/AddProjectDialog.tsx` + testes
**Depends on**: C13

**Done when**:
- [x] `failure: "auth"` tem **tela própria** (A13): nomeia as duas saídas — chave no `ssh-agent`, ou `credential.helper` — e não repassa o stderr cru
- [x] Para URL `https`, um botão converte para a forma `ssh` e reabre o diálogo já preenchido, usando o `toSshForm` da C2
- [x] As demais falhas mostram o texto do git, e dizem qual classe é
- [x] Job em `failed` fica visível até ser dispensado; não some sozinho, porque some sozinho é a mesma coisa que não ter acontecido
- [x] Nome ajustado por colisão é dito por extenso, com o nome antigo e o novo (A6)
- [x] Nada disso mostra `userinfo`, e há teste com segredo na URL
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 6

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): give authentication failures a way out`

---

#### C15: A confirmação de apagar

**What**: A tela mais perigosa das nove: remover um projeto gerenciado diz o caminho que vai sumir.
**Where**: `packages/web/src/components/SidebarTree.tsx` (ou onde vive o menu do projeto) + teste
**Depends on**: C11, C1

**Done when**:
- [x] Projeto **gerenciado** pede confirmação que **mostra o caminho absoluto** que será apagado, e diz que é irreversível
- [x] Projeto **não gerenciado** mantém a remoção de hoje, com o texto de hoje — nenhuma menção a apagar repositório
- [x] Os dois textos são distinguíveis à primeira leitura: é a diferença entre tirar da lista e apagar do disco
- [x] Bloqueio por worktree ou por sessão rodando aparece **antes** da confirmação, não depois
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4

**Tests**: componente · **Gate**: quick
**Commit**: `feat(web): say which directory disappears before deleting it`

---

#### C16: Projeto sem commit explica

**What**: O F6.13 — `hasCommits` na visão do projeto, e o diálogo de worktree dizendo por que ainda não dá.
**Where**: `packages/server/src/routers/project.ts`, `packages/server/src/routers/worktree.ts`, `packages/web/src/components/CreateWorktreeDialog.tsx` + testes
**Depends on**: C8

**Done when**:
- [x] `hasCommits` entra na visão do projeto, **calculado por requisição** — como `available`, e nunca guardado (A18)
- [x] `CreateWorktreeDialog` explica e desabilita, em vez de deixar o git responder "invalid reference"
- [x] `worktree.create` **também** recusa, com a mesma frase: a tela evita, o servidor impede
- [x] Um commit feito por fora faz a recusa sumir sem recarregar a página — é o que prova que o valor não foi guardado
- [x] Gate: `pnpm gate:quick`
- [x] Test count: ao menos 4

**Tests**: integration (servidor) + componente · **Gate**: quick
**Commit**: `feat(server,web): explain why a repository with no commits has no worktrees`

---

## Fase 5 — Prova

#### C17: e2e

**What**: Os critérios de aceite, de ponta a ponta, sem rede.
**Where**: `e2e/clone-project.spec.ts`
**Depends on**: C16

**Done when**:
- [x] Fixture cria um bare local; o teste cola `file:///…` e vê progresso, fase e conclusão
- [x] O projeto clonado aparece na sidebar e **corta uma worktree**, em `projectHome/worktrees/<nome>` (critério 10 do PRD)
- [x] `ext::sh -c id` e `git://host/r.git` são recusados na tela, antes de qualquer processo
- [x] Cancelar no meio deixa a sidebar limpa e o disco sem o temporário
- [x] **Remover o projeto clonado apaga o diretório**, e o teste verifica o disco (critério 11)
- [x] **Remover um projeto registrado por caminho não apaga o repositório dele**, e o teste verifica o disco (critério 12)
- [x] Clonar um repositório **vazio**: o projeto nasce, e o diálogo de worktree explica (critério 13)
- [x] Gate: `pnpm gate:full`

**Tests**: e2e Playwright · **Gate**: full
**Commit**: `test(e2e): clone a project from a url, cut a worktree, remove it`

---

## Risco

| Risco | Por quê | Onde é endereçado |
|---|---|---|
| **Worktree movida sem `git worktree repair`** | Quebra em silêncio e continua parecendo íntegra: caminhos absolutos no `.git` dela e no `gitdir` do repositório | C4, e o critério é a worktree **funcionar** depois de movida, não o diretório existir |
| Apagar o diretório errado | Superfície nova, e a de consequência menos reversível | C11 (as regras, e a A2 provando por `realpath` na hora), C15 (a confirmação diz o caminho), C17 (os dois lados verificados no disco) |
| `ext::` escapar da validação | Uma lista de bloqueio esquecida = execução de comando arbitrário | C2 (U1, teste nominal), C6 (`protocol.allow=never` para redirects) |
| Segredo da URL sobreviver em algum canto | Três superfícies independentes: `.git/config`, banco, mensagens | C2 (sanitizador), C6 (`remote set-url` + teste que lê `.git/config`), C9 (teste das três superfícies) |
| Nome com barra virando diretório | Nome de workspace e de projeto são texto livre, e agora viram caminho | C3 (slugificação dos segmentos) |
| Dois cálculos de caminho | Se `projectHome` dependesse de `managed`, metade dos projetos ficaria fora das regras do §4.4 | C3 (A16, com teste de projeto não gerenciado) |
| Clone pendurado sem morrer nem avisar | Qualquer pergunta interativa do git ou do ssh | C6 (ambiente do §4.2 + estagnação), C14 (a mensagem, e a saída) |
| Estado terminal perdido no estrangulamento | 250 ms de janela engolindo o último instantâneo deixa a barra em 97% para sempre | C7, e é o teste nomeado como o que mais importa |
| Lixo no disco após queda do daemon | Clone dura minutos; queda no meio é o caso normal | C6 (nome previsível), C10 (varredura) |
| Regressão em `project.add`, `project.remove` ou `worktree.create` | A C4, a C8 e a C11 mexem no caminho que **todos** os projetos usam | Nas três, os testes existentes passam **sem edição**, e isso é o critério |
