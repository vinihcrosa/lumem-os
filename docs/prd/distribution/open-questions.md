# Distribuição — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 11 perguntas · **11 fechadas** em 2026-08-30, todas pelo Vinicius, numa resposta só. Oito
foram **proposta aceita** (D1, D3, D4, D5, D6, D7, D9, D10); uma foi **proposta aceita com prazo**
(D2 — foreground agora, background depois); uma foi **escolha entre alternativas** (D8, MIT); e uma
foi **aceita com uma correção de rumo maior que a pergunta** (D11 — o projeto todo vai para inglês).

---

### [x] D1 — O nome do pacote é `lumem`, sem escopo?

`lumem`, `lumem-os` e `@lumem/cli` estão **os três livres** no npm — verificado em 2026-08-30, 404 nos
três. O repositório é público e se chama `lumem-os`.

Um nome curto e sem escopo é o melhor para digitar e o pior para desistir: publicado uma vez, ele é
seu para sempre e some do pool. Um escopo (`@vinihcrosa/lumem`) é reversível na prática — ninguém
disputa um nome escopado — e custa oito caracteres em todo comando de instalação.

**Proposta pra reagir:** **`lumem`**, sem escopo, e o `lumem-os` reservado depois apontando para ele.
O produto se chama Lumem; o repositório é que tem sufixo.

**Custo de esperar:** trava a Fase 4 inteira e o README.

**R:** `lumem`.

**Decisão: o pacote se chama `lumem`, sem escopo.** O produto se chama Lumem; o sufixo `-os` é do
repositório, e ninguém digita repositório. O nome estava livre em 2026-08-30 e a publicação o
consome para sempre — é a decisão menos reversível desta feature, e foi tomada de olho nisso.

**Corrigida no mesmo dia, pelo registry: `@vinihcrosa/lumem`.** O `npm publish` recusou com
`403 — Package name too similar to existing package mem`. E aqui está a lição, porque ela custou um
release inteiro: **`npm view lumem` respondendo 404 prova que o nome está livre, não que ele é
publicável.** A regra anti-typosquatting do npm mora no `PUT`, e nenhum comando de leitura a
executa — nem `npm publish --dry-run`, que valida o nome só localmente. A única forma de saber é
tentar publicar.

**E corrigida uma segunda vez, pelo mesmo caminho: `@vinihcrosa/lumem-os`.** O
`@vinihcrosa/lumem` também foi recusado — `You cannot publish over the previously published versions:
0.1.0` —, porque o escopo **já tinha um pacote com esse nome**: o
[vinihcrosa/lumem](https://github.com/vinihcrosa/lumem), a camada de memória, com três versões
publicadas em agosto de 2026. O 403 protegeu; nada foi sobrescrito.

Duas coisas ficaram decididas junto:

- **o nome é `@vinihcrosa/lumem-os`**, igual ao repositório. Um `@lumem/*` foi considerado e pedia
  criar a organização antes — fica para quando houver um segundo pacote deste projeto para publicar;
- **o pacote instala dois binários** apontando para o mesmo arquivo: `lumem`, que é o comando, e
  `lumem-os`. O outro pacote também cria um link chamado `lumem`, e o último a instalar ganha — o
  segundo nome é o que continua funcionando numa máquina que tem os dois.

**A lição, agora com duas evidências:** o registry é a única autoridade sobre o nome, e ele só
responde no `PUT`. Um 404 de leitura não diz nada sobre similaridade, e nem sobre o que já existe
dentro do seu próprio escopo.

---

### [x] D2 — `lumem` sozinho sobe em foreground, ou vira daemon de verdade?

Duas formas, e elas mudam o CLI inteiro:

- **foreground**: `lumem` ocupa o terminal, `Ctrl-C` derruba. É o que o `shutdown.ts` já espera — ele
  arma SIGINT/SIGTERM e mata os filhos na ordem certa;
- **em background**: `lumem start` volta ao prompt, e aí precisam existir `lumem stop`, `lumem
  status`, `lumem logs`, um pidfile no state dir, e uma resposta para "o processo morreu e o pidfile
  ficou".

**Proposta pra reagir:** **foreground na v1**, com `--open` abrindo o navegador. É o comportamento do
`vite`, do `next dev` e de quase tudo que se instala global para uso local; e é o único que não pede
gerência de ciclo de vida que o produto ainda não tem. `lumem stop` entra quando alguém reclamar.

**Custo de esperar:** trava a Fase 3.

**R:** Pode ser foreground, mas no futuro deve ser background.

**Decisão: foreground na v1, e o background é dívida declarada.** `lumem` ocupa o terminal e
`Ctrl-C` desliga pela via que o `shutdown.ts` já arma. O que a resposta acrescenta à proposta é o
prazo: `lumem start` em background, com `stop`, `status` e `logs`, é para acontecer — então entra no
[backlog](../../project/backlog.md) agora, e o CLI da T5 nasce com a forma que não atrapalha isso
(subcomando implícito, e não flags soltas em cima de um verbo único).

---

### [x] D3 — Porta ocupada: falhar, ou procurar outra?

O daemon usa 4317 por padrão. Se já tem um Lumem lá, subir outro é quase sempre erro — dois daemons
no mesmo `~/.lumem` compartilham SQLite e worktrees. Se tem **outra coisa** lá, falhar com
`EADDRINUSE` cru é hostil.

**Proposta pra reagir:** **falhar, com mensagem que distingue os dois casos**. O CLI faz um `GET /` no
endereço antes de subir: se responder como Lumem, a mensagem é *"já tem um Lumem em
http://127.0.0.1:4317 — abra ele"* (e com `--open`, abre); se responder outra coisa ou recusar, é
*"a porta 4317 está ocupada; use `--port`"*. Nunca escolher porta sozinho: uma URL que muda é uma URL
que ninguém guarda.

**R:** Falhar.

**Decisão: falha, com a mensagem que distingue os dois casos.** Nunca escolher outra porta sozinho.
Um Lumem já vivo na porta é caso de apontar para ele, não de subir um segundo daemon no mesmo
`~/.lumem`.

---

### [x] D4 — O e2e roda uma vez contra o `dist`, ou continua só contra o vite?

A suíte hoje sobe vite + daemon pelo `playwright.config.ts`. Em produção não tem vite: tem o daemon
servindo arquivo estático. Nada no e2e atual passaria perto dessa diferença — e o fallback de SPA, o
MIME dos assets e a rota que não pode engolir `/trpc` moram exatamente ali.

**Proposta pra reagir:** **um projeto novo no playwright**, `production`, com um punhado de specs
(carrega, faz um turno, reconecta o socket) rodando contra o daemon servindo `dist`. Não a suíte
inteira: o que muda é o transporte dos assets, não o produto.

**Custo de esperar:** a Fase 2 entrega sem prova.

**R:** Pode ser da forma que você falou.

**Decisão: um projeto `production` no playwright, com um punhado de specs contra o daemon servindo
`dist`.** Não a suíte inteira: o que muda em produção é o transporte dos assets, e é isso que
precisa de prova.

---

### [x] D5 — O smoke de instalação roda em quais plataformas?

O `ci.yml` roda só `ubuntu-latest` hoje — e o comentário dele diz por quê: as armadilhas de teste do
repositório são as que "só o Linux acha". Mas os prebuilds nativos de `better-sqlite3` e `node-pty`
são por plataforma **e por arquitetura**, e o `spawn-helper` é um problema de macOS.

**Proposta pra reagir:** `ubuntu-latest` **e** `macos-latest` (que é arm64 hoje) no job de smoke do
release. Dois runners, um `npm i -g` cada, dois `curl`. Linux arm64 e macOS x64 ficam sem cobertura, e
isso fica escrito no README em vez de virar promessa.

**R:** Pode ser.

**Decisão: smoke de instalação em `ubuntu-latest` e `macos-latest`.** Linux arm64 e macOS x64 ficam
sem cobertura, e isso vai escrito no README em vez de virar promessa silenciosa.

---

### [x] D6 — Publicar exige aprovação humana, ou tag basta?

Uma tag `v0.1.0` empurrada por engano publica uma versão que **não se despublica** depois de 72 horas.
O GitHub tem `environment:` com required reviewer, que transforma o publish num botão.

**Proposta pra reagir:** **tag basta, com o publish num environment `npm`** — que hoje não tem
reviewer configurado, e ganha um no dia em que existir uma segunda pessoa. O ganho de segurança sem
segunda pessoa é ilusório; a estrutura para adicionar é que importa.

**R:** Tag basta.

**Decisão: a tag publica, e o publish roda num `environment: npm` sem reviewer.** A estrutura para
exigir aprovação fica pronta; ligar o reviewer é uma linha no dia em que houver uma segunda pessoa.

---

### [x] D7 — Como a versão é bumpada: `npm version`, script próprio, ou changesets?

Ela mora em três lugares depois desta feature (`LUMEM_VERSION`, `packages/shared/package.json`, e o
manifesto publicado). Changesets é excelente para monorepo que publica **vários** pacotes; aqui
publica-se **um**.

**Proposta pra reagir:** **um script**, `pnpm version:set <x.y.z>`, que escreve os três e é guardado
por teste. Changesets quando houver um segundo pacote publicado.

**R:** Concordo.

**Decisão: `pnpm version:set <x.y.z>` escreve os três lugares, guardado por teste.** Changesets
quando houver um segundo pacote publicado — hoje publica-se um.

---

### [x] D8 — Qual licença?

O repositório é **público e não tem `LICENSE`**, o que legalmente é "todos os direitos reservados": no
estado atual ninguém pode usar nem forkar, e um pacote no npm sem licença é um pacote que empresa
nenhuma instala.

**Proposta pra reagir:** **MIT**. É a menos surpreendente, e o projeto é pessoal e sem modelo de
negócio declarado. Se a intenção for algum dia cobrar, a resposta é outra (AGPL, ou fonte disponível
sem licença open source) — e é melhor decidir agora que depois de aceitar contribuição de terceiro.

**Custo de esperar:** trava o README e o `package.json` publicado.

**R:** MIT.

**Decisão: MIT.** O repositório é público desde antes desta feature e estava sem licença, o que
significa todos os direitos reservados: ninguém podia usar nem forkar o que estava à vista. A
`LICENSE` entra na T15, junto do README, e o manifesto publicado declara o mesmo.

---

### [x] D9 — O `postinstall` do pacote publicado pode falhar silencioso?

O `ensure-pty-helper` conserta o bit de execução do `spawn-helper`. No pacote publicado ele precisa
rodar de novo (o layout é outro), e um `postinstall` que **lança** aborta o `npm i -g` inteiro.

**Proposta pra reagir:** **avisa e sai com 0**. O produto sem o bit corrigido perde os terminais, e o
`preflight` da primeira tela é quem tem que dizer isso — com a mensagem certa, na tela, e não num log
de instalação que ninguém releu. Instalação abortada por causa de um `chmod` é pior que um terminal
que não abre.

**R:** Concordo.

**Decisão: o `postinstall` avisa e sai com 0.** Instalação abortada por um `chmod` é pior que um
terminal que não abre — e quem diagnostica terminal que não abre é o `preflight` da primeira tela,
com a mensagem certa, e não um log de instalação que ninguém releu.

---

### [x] D10 — O `dist/web` vai versionado no repositório?

Não deveria — está no `.gitignore`. Mas o pacote publicado precisa dele, então o release **tem que
buildar antes de empacotar**, e `npm publish` a partir de uma árvore limpa é uma armadilha conhecida
(publica sem os assets, e o pacote instala e serve 404).

**Proposta pra reagir:** `prepack` roda o build, e o smoke instala **do tarball**. Assim publicar sem
os assets deixa de ser possível: ou o `prepack` construiu, ou o smoke reprova.

**R:** Concordo.

**Decisão: `prepack` roda o build, e o smoke instala do tarball.** Publicar sem os assets deixa de
ser possível: ou o `prepack` construiu, ou o smoke reprova antes do publish.

---

### [x] D11 — O README é em português?

Toda a documentação do projeto é. Mas o README é a porta de um repositório **público** e de um pacote
npm, e o npm mostra esse mesmo arquivo na página do pacote.

**Proposta pra reagir:** **README em inglês na raiz**, com um `README.pt-BR.md` linkado na primeira
linha — e nada mais em inglês. É a única exceção, é a porta de entrada, e ela não conflita com a regra
do repositório porque a regra fala de `/docs`, que continua inteiro em português.

**R:** Concordo com você, mas deixando claro que eu quero passar tudo para inglês em breve.

**Decisão: README da raiz em inglês, com `README.pt-BR.md` linkado na primeira linha — e a tradução
do resto vira item de backlog.** A resposta é maior que a pergunta: a exceção deixa de ser exceção e
passa a ser o primeiro arquivo de uma migração. O `/docs` continua em português **por enquanto**, e
o [backlog](../../project/backlog.md) registra a intenção com o gatilho — porque uma migração de
idioma que fica só na memória da conversa é uma migração que não acontece.
