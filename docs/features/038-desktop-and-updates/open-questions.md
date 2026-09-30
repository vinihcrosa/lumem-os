# O Lumem fica de pé sozinho, se atualiza, e mora na barra — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 4 perguntas · **3 respondidas** (Q1 e Q2 em 2026-09-29, pela recomendação; Q3 medida) · **1 aberta**, a Q4, achada construindo a Parte 4.

A discovery do Outline já respondeu 22 perguntas e 7 desdobramentos em 2026-09-29
([as perguntas](https://wiki.cazimi.tech/doc/open-questions-menu-bar-and-auto-update-S8ijH9cb9K)), e o
que elas decidiram está nos critérios e nos ADRs. As duas daqui apareceram escrevendo o plano: a
discovery disse *que* existe `lumem start`, `stop`, `status` e `logs` e *que* existe uma preferência de
atualizar sozinho, mas não o que acontece com o `lumem` de hoje nem onde a preferência mora.

---

- [x] **Q1 — O `lumem` sem verbo passa a subir o serviço, ou continua em primeiro plano?**

  Hoje `lumem` e `lumem start` são a mesma coisa: o daemon em primeiro plano, preso ao terminal
  (`packages/cli/src/args.ts`, o verbo padrão é `start`). O comentário do `Command` já previa esta hora:
  *"the shape has to survive the answer to D2: the daemon runs in the foreground today and will run in
  the background later"*.

  **Opções:**
  - **(a)** `lumem` = `lumem start` = **o serviço**; o primeiro plano vira `lumem run`, que é também o que
    o launchd e o systemd executam.
  - **(b)** `lumem` continua em **primeiro plano**; só `lumem start` sobe o serviço.
  - **(c)** `lumem start --daemon` para o serviço, e tudo o mais como hoje.

  **Recomendação: (a).** O modo normal passa a ser o serviço, e o comando mais curto deve fazer a coisa
  normal. O arquivo de serviço precisa de um verbo que nunca mude de sentido, e `run` é esse verbo. O
  preço é uma mudança que quem digita `lumem` sente: o terminal volta na hora. A nota da release diz, e
  `lumem run` está a um verbo de distância.

  **O que a resposta muda:** os critérios 7 e 8, a linha 1 do `Landing`, o `HELP` do CLI, e o
  `scripts/smoke-install.ts`. Com (b), o critério 7 passa a dizer *primeiro plano* e o `lumem run` pode
  nem existir; com (c), a porta 1 muda de forma.

  **R:** (a) (2026-09-29). `lumem` = `lumem start` = o serviço; o primeiro plano é `lumem run`.

- [x] **Q2 — Onde mora a preferência global do daemon (procurar atualização, atualizar sozinho)?**

  Não existe lugar para configuração **da máquina** no banco: os tetos são colunas de `workspace`, e as
  chaves de memória da `007` são variáveis de ambiente lidas no boot (`packages/server/src/config.ts`). A
  B8 da discovery pediu um interruptor em `/settings`, e a B1 pediu a opção *atualizar sozinho*.

  **Opções:**
  - **(a)** uma tabela `daemon_settings` com **uma linha só** (`CHECK (id = 1)`) e colunas tipadas com
    `CHECK`, como as de `workspace`.
  - **(b)** uma tabela chave-valor (`key`, `value`), para caber a próxima preferência sem migração.
  - **(c)** um `settings.json` no state dir.
  - **(d)** só variável de ambiente, sem interruptor na tela.

  **Recomendação: (a).** É o mesmo jeito que o banco já guarda configuração (colunas com `CHECK` em
  `workspace`), e o `CHECK` é o que impede um `auto_update = 'sim'` de entrar. A (b) troca o `CHECK` por
  validação na aplicação, que é o que a armadilha *"Uma restrição escrita em comentário não é uma
  restrição"* de `testing.md` já cobrou. A (c) cria um segundo jeito de persistir ao lado do SQLite. A (d)
  não atende a B8.

  **O que a resposta muda:** a linha 3 do `Landing` e o `Relations`; os critérios 18, 20, 21 e 71 falam de
  `daemon_settings`. Com (b), os critérios passam a dizer a chave; com (c), o critério 20 vira escrita de
  arquivo, com a regra do `mode` da armadilha *"`mode` no `writeFileSync` só vale na criação"*.

  **R:** (a) (2026-09-29). Uma tabela `daemon_settings` com uma linha só e colunas com `CHECK`.

- [x] **Q3 — O caminho do `lumem` gravado no arquivo de serviço sobrevive a uma atualização feita pelo pnpm ou pelo bun?**

  Achada na Parte 2, lendo o diff da Parte 1. `lumem start` grava no plist e na unit o `lumem` **absoluto**,
  e `ownPath()` (`packages/cli/src/run.ts`) o resolve com `realpathSync` — o que é certo para o npm, onde
  `bin/lumem` é um symlink para `lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`, que **não muda** de
  versão em versão. No pnpm o destino real fica dentro de `.pnpm/@vinihcrosa+lumem-os@<versão>/…`, que **tem
  a versão no caminho**. Depois de `pnpm add --global …@<nova>` (do `lumem upgrade` ou do botão), o
  supervisor relança `node <caminho da versão velha> run`, e esse diretório pode ter sido removido pelo
  próprio pnpm: o serviço entra em laço de reinício, com o daemon morto. O mesmo vale para o `bun`, que
  também guarda por versão. **Nada disto foi medido nesta máquina** — só o npm foi exercitado pelo
  `smoke:service`.

  **Opções:**
  - **(a)** gravar o caminho **sem** resolver o symlink do pacote (o `node_modules/@vinihcrosa/lumem-os` do
    prefixo global), e só resolver o symlink de `bin/`.
  - **(b)** depois de instalar com sucesso, o `lumem upgrade` e o daemon **reescrevem o arquivo de serviço**
    com o caminho do `lumem` novo (o daemon sabe o dele por `import.meta.url`).
  - **(c)** o botão de atualizar só existir sob o npm; pnpm e bun ficam com `lumem upgrade` e reinício à mão.

  **Recomendação: (a).** É a que mantém o arquivo de serviço imutável entre versões, que é o que a porta 2
  prometeu (*"o verbo que o arquivo chama nunca muda de sentido"*). A (b) acrescenta um caminho de
  escrita ao daemon, e a (c) tira o gesto de quem mais atualiza. Antes de escolher: medir o pnpm de verdade,
  com `pnpm add -g` de um tarball, e ver se o diretório velho some.

  **O que a resposta muda:** `ownPath()` e o C1 (o conteúdo do plist), e o `smoke:service`, que hoje só roda
  sob o npm.

  **R:** (a) (2026-09-29), medido. Com `pnpm add -g` de um tarball num `PNPM_HOME` descartável, o shim
  `$PNPM_HOME/lumem` executa `node <global>/.pnpm/@vinihcrosa+lumem-os@<spec>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`,
  então `process.argv[1]` já chega com a versão no caminho. Depois de `pnpm add -g` de outro tarball, o
  diretório velho **continua existindo** e o symlink `<global>/node_modules/@vinihcrosa/lumem-os` passa a
  apontar para o novo. O defeito, então, não é laço de reinício: é o supervisor subir o **código velho** e a
  atualização não valer. A regra: o arquivo de serviço grava o caminho pelo symlink estável do pacote
  (`<global>/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`) sempre que ele existe, e o resolvido só
  quando não há outro — virou o critério 77 e o C85. O `bun` não foi medido.

- [ ] **Q4 — O app abre no Linux sem `--no-sandbox`, em uma distribuição que restringe user namespaces?**

  Achada na Parte 4, escrevendo o pacote do Linux. As janelas do app são `sandbox: true` (AC 67), e o
  Chromium só sobe o sandbox de processo de duas formas: o helper `chrome-sandbox` **setuid root**, ou
  *user namespaces* sem privilégio. Um `npm i -g` de usuário não consegue pôr o setuid, então o app depende
  do segundo — e o Ubuntu 23.10 em diante o restringe por AppArmor
  (`kernel.apparmor_restrict_unprivileged_userns=1`), caso em que o Electron recusa abrir com *"The SUID
  sandbox helper binary was found, but is not configured correctly"*. **Não foi medido:** não há máquina
  Linux aqui, e isto é o comportamento conhecido do Electron nessas distribuições. O que foi feito no
  código: o `.desktop` que o CLI escreve **não** leva `--no-sandbox`, e o passo do `smoke:install --only
  desktop` no Linux o passa só ele (o runner do GitHub tem a restrição, e o passo prova o pacote, e não a
  trava).

  **Opções:**
  - **(a)** deixar como está e documentar: em Ubuntu 24.04, liberar o binário do app por um perfil do
    AppArmor, ou o `sysctl`. A trava do AC 67 fica inteira, e quem tem a restrição faz um passo à mão.
  - **(b)** o `.desktop` sempre leva `--no-sandbox`. Abre em todo lugar, e o sandbox de renderizador some
    em todo lugar — o app só carrega `127.0.0.1`, mas o AC 67 fica sem o que o sustenta.
  - **(c)** `lumem menubar install` lê `/proc/sys/kernel/unprivileged_userns_clone` e o sysctl do AppArmor, e
    escreve `--no-sandbox` **só** onde o sandbox não subiria — dizendo isso na saída. O sandbox fica onde o
    sistema o deixa existir.

  **Recomendação: (c), depois de medir (a) num Ubuntu 24.04 de verdade.** Se o app abrir com a restrição
  ligada, a Q4 se fecha sozinha em (a); se não abrir, (c) é o caminho que não tira a trava de quem pode tê-la.

  **O que a resposta muda:** o `desktopEntry` de `packages/cli/src/menubar.ts` e o C63 (o conteúdo do
  `.desktop`); com (b), o AC 67 ganha uma ressalva no Linux.
