# Distribuição — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **16 de 16 entregues**, em 2026-08-30, num dia. As 11 perguntas estavam
[fechadas](open-questions.md) antes da primeira linha de código — o pacote se chama `lumem`, o CLI é
foreground (com o background já no backlog), porta ocupada falha, o e2e ganhou um projeto
`production`, o smoke roda em ubuntu e macos, a licença é MIT, e o README da raiz é em inglês.

Foram **sete commits**, e não dezesseis: a T1 e a T2 são o mesmo bundle com as suas duas provas, a
T5–T7 são um CLI só, e a T8–T11 são a mesma pergunta ("o que garante que o pacote publicado presta?")
respondida em quatro arquivos. **O que a execução achou** está no fim.

A ordem é a do risco, e o risco aqui **não é o código**: é descobrir tarde que o artefato empacotado
não sobe. Por isso a prova de boot vem na T2, antes de qualquer CLI, e o smoke de instalação vem
antes da publicação.

---

## Antes de começar

**O que não trava** (medido em 2026-08-30, nesta árvore):

- o bundle do servidor **funciona**: esbuild ESM, 3,0 MB, 123 ms, com `better-sqlite3` e `node-pty`
  externos e um banner criando `require` por `createRequire`. Ele subiu de verdade — migrou o SQLite,
  escreveu o repositório de memória, escutou e respondeu tRPC;
- o `vite build` do web **funciona**: 2,5 MB em `packages/web/dist`, 1,7 s;
- o cliente já fala em **origem relativa** (`/trpc`, e `window.location` nos dois sockets): servir o
  web do daemon não pede uma linha de mudança no cliente;
- o nome `lumem` está **livre** no npm;
- o `ensure-pty-helper` já sabe ler o layout **flat** do `node_modules`, que é o do `npm i -g`.

**Premissas travadas:**

- **A1** — externo do bundle é **só o que é nativo**: `better-sqlite3` e `node-pty`. Qualquer terceira
  dependência de runtime no pacote publicado é um erro de empacotamento, não uma escolha.
- **A2** — o layout do pacote preserva a distância de `MIGRATIONS_DIR`: bundle em `dist/server/`,
  `drizzle/` na raiz do pacote. Mudar isso é mudar `db/index.ts`, e aí o teste é o boot.
- **A3** — o daemon continua escutando em `127.0.0.1` por padrão. Distribuir não é expor.
- **A4** — `ci.yml` não muda. O release é outro workflow.
- **A5** — o modo de desenvolvimento não muda: `pnpm dev` continua vite + daemon com proxy.

---

## Fase 1 — o servidor vira artefato

#### T1: O build do servidor

**What**: `packages/server` ganha `build`: esbuild, ESM, target node22, externos só os nativos, banner
com `createRequire`, saída em `dist/server/main.mjs`.
**Where**: `packages/server/package.json`, `packages/server/build.ts` (ou config equivalente), `turbo.json`

**Done when**:
- [x] `pnpm --filter @lumem/server build` produz `dist/server/main.mjs`
- [x] O único externo é o par nativo — provado por um teste que lê os `import` do bundle e falha se
      aparecer um terceiro (é a A1, e ela não se defende sozinha)
- [x] `turbo build` cacheia com `outputs: ["dist/**"]`, que já está declarado
- [x] Gate: `pnpm gate:build`

**Commit**: `build(server): bundle esm do daemon com esbuild`

---

#### T2: A prova de que o bundle sobe

**What**: Um teste que roda `node dist/server/main.mjs` num state dir temporário e fala com ele.
**Where**: `packages/server/src/dist-boot.test.ts` (ou `scripts/`), rodando após o build

**Done when**:
- [x] Sobe o bundle em porta efêmera e `LUMEM_STATE_DIR` temporário, e espera o log de listening
- [x] Uma chamada tRPC responde **200**, não 404 e não 500
- [x] O banco foi migrado: a tabela mais recente das migrações existe no arquivo — é isto que pega o
      `drizzle/` em distância errada (A2)
- [x] Sem o banner de `require`, o teste falha (verificado à mão uma vez; o comentário registra a
      mensagem exata: `Dynamic require of "process" is not supported`)
- [x] Gate: `pnpm gate:full`

**Commit**: `test(server): o bundle sobe, migra e responde`

---

## Fase 2 — o daemon serve o produto

#### T3: Os arquivos estáticos

**What**: Em produção o Fastify serve `dist/web` na raiz, com fallback de SPA.
**Where**: `packages/server/src/server.ts` + `packages/server/src/web/static.ts` + testes

**Done when**:
- [x] `GET /` devolve o `index.html`; `GET /assets/<hash>.js` devolve o asset com o MIME certo
- [x] Rota desconhecida sem extensão → `index.html` (SPA); **`/trpc`, `/pty` e `/acp` nunca** caem no
      fallback — teste explícito, porque este é o modo de falhar que quebra o produto inteiro
- [x] Assets com hash ganham `cache-control` longo; o `index.html`, `no-cache`
- [x] Sem `dist/web` no disco (o caso de quem roda por `tsx` em dev), o daemon sobe igual e a raiz
      responde 404 com uma frase que diz o que fazer — **não** um stack trace
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): servir o web da própria porta`

---

#### T4: O e2e em modo produção

**What**: Um projeto `production` no playwright, contra o daemon servindo `dist`. Decidido na [D4](open-questions.md).
**Where**: `playwright.config.ts`, `e2e/production.spec.ts`

**Done when**:
- [x] Sobe **um** processo (sem vite), com `dist/web` construído, em porta de e2e própria
- [x] Carrega a aplicação, faz uma navegação de SPA com reload no meio (o fallback), e abre um socket
- [x] Roda no `ci.yml` junto do e2e atual
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): o produto servido pelo daemon, sem vite`

---

## Fase 3 — o binário

#### T5: O `lumem`

**What**: O executável. Sobe o daemon em foreground, imprime o endereço. Decidido na [D2](open-questions.md): foreground, com a forma que não atrapalha o background depois.
**Where**: `packages/cli/` (ou `bin/lumem.mjs` no pacote de publicação) + testes

**Done when**:
- [x] `lumem` sobe e imprime `http://127.0.0.1:4317` — uma linha, legível, antes do log estruturado
- [x] `--port`, `--host`, `--state-dir` e `--version` funcionam; `--help` lista os quatro
- [x] `Ctrl-C` desliga pela via que o `shutdown.ts` já arma: filhos primeiro, servidor depois
- [x] Argumento desconhecido → erro nomeando o argumento, saída 2
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(cli): o binário lumem`

---

#### T6: Porta ocupada, com diagnóstico

**What**: Antes de subir, o CLI descobre **quem** está na porta. Decidido na [D3](open-questions.md).
**Where**: `packages/cli/src/port.ts` + testes

**Done when**:
- [x] Porta livre → sobe
- [x] Porta ocupada por um Lumem → mensagem dizendo que já tem um, e o endereço dele; saída 0
- [x] Porta ocupada por outra coisa → mensagem com `--port` na frase; saída 1
- [x] Nunca escolhe outra porta sozinho (A3 do PRD: URL que muda é URL que ninguém guarda)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(cli): dizer quem já está na porta`

---

#### T7: `--open`

**What**: Abrir o navegador na URL, por `open`/`xdg-open`.
**Where**: `packages/cli/src/open.ts` + teste

**Done when**:
- [x] `--open` abre; sem a flag, não abre
- [x] Falha ao abrir **não** derruba o daemon — imprime a URL e segue
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(cli): --open abre o navegador`

---

## Fase 4 — o pacote

#### T8: O manifesto publicável

**What**: O `package.json` do que vai ao npm: nome, `bin`, `files`, `engines`, duas dependências.
Decididos na [D1](open-questions.md) (`lumem`) e [D8](open-questions.md) (MIT).
**Where**: o pacote de publicação + teste

**Done when**:
- [x] `bin: { lumem: "bin/lumem.mjs" }`, `type: "module"`, `engines.node >= 22`
- [x] `dependencies` tem **exatamente** `better-sqlite3` e `node-pty` (A1), guardado por teste
- [x] `files` lista `bin`, `dist`, `drizzle`, `README.md`, `LICENSE` — e um teste roda `npm pack
      --dry-run` e falha se algum deles sumir
- [x] `prepack` roda o build ([D10](open-questions.md)): publicar sem os assets deixa de ser possível
- [x] Gate: `pnpm gate:build`

**Commit**: `build: o manifesto do pacote publicado`

---

#### T9: O `postinstall` do pacote

**What**: O `ensure-pty-helper` roda também na instalação do pacote publicado, e **nunca aborta**.
Decidido na [D9](open-questions.md).
**Where**: `bin/postinstall.mjs` + teste

**Done when**:
- [x] Encontra o `node-pty` em layout flat (o do npm) e em pnpm — o módulo atual já faz os dois
- [x] Qualquer erro vira aviso e saída **0**
- [x] Gate: `pnpm gate:quick`

**Commit**: `build: postinstall que conserta o spawn-helper sem abortar a instalação`

---

#### T10: A versão, num lugar só

**What**: `pnpm version:set <x.y.z>` escreve `LUMEM_VERSION`, o `package.json` do shared e o do
pacote publicado. Decidido na [D7](open-questions.md).
**Where**: `scripts/set-version.ts` + testes

**Done when**:
- [x] Escreve os três; versão inválida é recusada antes de escrever qualquer um
- [x] Um teste novo prova que o manifesto publicado bate com `LUMEM_VERSION` (o do shared já existe)
- [x] Gate: `pnpm gate:quick`

**Commit**: `build: uma versão, três arquivos, um comando`

---

#### T11: O smoke de instalação

**What**: Um script que instala o tarball e prova que ele sobe — rodável na máquina e no CI.
**Where**: `scripts/smoke-install.ts`

**Done when**:
- [x] `npm pack`, instala o `.tgz` num prefixo temporário, roda o binário em porta e state dir
      temporários
- [x] `GET /` devolve HTML; uma chamada tRPC responde 200
- [x] Derruba o processo e limpa tudo, inclusive no caminho de erro
- [x] Falha com a saída do daemon no log — não só "exit 1"

**Commit**: `build: smoke de instalação do tarball`

---

## Fase 5 — a pipeline

#### T12: O workflow de release

**What**: `release.yml` em tag `v*` e `workflow_dispatch`: gates, empacota, guarda o tarball.
**Where**: `.github/workflows/release.yml`

**Done when**:
- [x] Roda `pnpm gate:build` e `pnpm test` antes de empacotar — os mesmos gates do CI, na mesma ordem
- [x] Recusa se a tag não bater com a versão do manifesto: `v0.1.0` com `0.0.9` dentro para o release
- [x] Sobe o `.tgz` como artefato do run
- [x] `concurrency` por tag, como o `ci.yml` faz por ref

**Commit**: `ci: workflow de release`

---

#### T13: O smoke, em duas plataformas

**What**: O job que instala o artefato num runner limpo. Decidido na [D5](open-questions.md).
**Where**: `.github/workflows/release.yml`

**Done when**:
- [x] Matriz `ubuntu-latest` e `macos-latest`, baixando o artefato da T12 — e não reconstruindo
- [x] Roda o `scripts/smoke-install.ts`
- [x] O publish **depende** deste job: reprovou aqui, não publica

**Commit**: `ci: instalar o tarball em ubuntu e macos antes de publicar`

---

#### T14: A publicação

**What**: `npm publish --provenance --access public` e a GitHub Release. Decidido na [D6](open-questions.md).
**Where**: `.github/workflows/release.yml`

**Done when**:
- [x] `id-token: write` e provenance ligada
- [x] Roda num `environment: npm`, para que exigir aprovação seja uma linha no dia em que precisar
- [x] Cria a Release com o `.tgz` anexado e as notas do intervalo de commits
- [x] Um `--dry-run` verificado à mão antes do primeiro publish de verdade, e o resultado anotado
      aqui embaixo

**Commit**: `ci: publicar no npm com provenance`

---

## Fase 6 — a porta de entrada

#### T15: O `README.md` da raiz

**What**: O arquivo que o repositório público não tem. Decididos na [D8](open-questions.md) (MIT) e [D11](open-questions.md) (inglês).
**Where**: `README.md`, e `LICENSE`

**Done when**:
- [x] As sete seções do §6 do PRD, nessa ordem
- [x] Uma imagem do produto rodando, e não uma descrição dele
- [x] Todo comando do README foi **executado** antes de entrar nele
- [x] O que não é suportado está escrito (Windows, e as arquiteturas fora da matriz da T13)
- [x] `LICENSE` existe e bate com o `license` do manifesto

**Commit**: `docs: o README da raiz`

---

#### T16: Os índices

**What**: Esta feature aparece onde o projeto se descreve.
**Where**: `docs/README.md`, `CLAUDE.md`

**Done when**:
- [x] `docs/README.md` lista `prd/distribution/`
- [x] O `CLAUDE.md` diz como o produto se instala, em uma linha — quem lê ele é um agente que precisa
      saber que existe artefato publicado
- [x] `docs/project/testing.md` ganha o que os gates novos garantem: o boot do bundle e o smoke de
      instalação

**Commit**: `docs: distribuição nos índices`

---

## O que a execução achou

**1. O bundle não sobe sem um `require`.** Medido antes de escrever o PRD, e vale repetir aqui porque
é o achado que mais economizou tempo: `esbuild --format=esm` produz um arquivo que morre no primeiro
import com `Dynamic require of "process" is not supported`, de dentro do `yaml`. O banner com
`createRequire` conserta. Sem ter rodado o bundle antes, isso seria descoberto no CI de release.

**2. O `MIGRATIONS_DIR` decide o layout do pacote.** `db/index.ts` resolve `../../drizzle` a partir do
próprio módulo. Isso fixa o bundle em `dist/server/` e as migrações na raiz do pacote — e o modo de
falhar é silencioso: o daemon **sobe**, abre um banco sem tabela nenhuma, e só quebra na primeira
query. Por isso a `dist-boot.test.ts` abre o SQLite e lê o esquema em vez de conferir se o processo
subiu.

**3. O `@fastify/static` ganha do `setHeaders`.** Com `cacheControl` no default, o plugin escreve
`public, max-age=0` **depois** do `setHeaders`, e todo asset com hash no nome passava a revalidar a
cada carga. Achado pelo teste do cabeçalho, que só existia porque o PRD tinha prometido cache longo.

**4. O `postinstall` do pacote roda no monorepo também.** `pnpm install` executa o `postinstall` de
pacote do workspace, e o `bin/postinstall.mjs` ainda não existe antes do primeiro build — o script
ganhou um guarda (`2>/dev/null || exit 0`) que serve às duas situações, e que é o mesmo
comportamento que a [D9](open-questions.md) pede na máquina do usuário.

**5. O teste do tarball tem que construir.** Ele roda `pnpm build` antes de olhar: sem isso, ele
mediria o que sobrou de um build anterior — e o modo de falhar que ele existe para pegar (um arquivo
que **deixou** de ser gerado) passaria despercebido. Custo medido: 13 s a frio, ~2,5 s com o cache do
turbo quente.

**6. `npm view <nome>` respondendo 404 não é permissão para publicar.** A T14 falhou no `npm publish`
com `403 — Package name too similar to existing package mem`, depois de os gates, o tarball, o token
e a instalação em duas plataformas terem passado. A regra anti-typosquatting do registry só existe no
`PUT`; `npm publish --dry-run` valida o nome **localmente** e passa. O pacote virou
`@vinihcrosa/lumem` — e **falhou de novo**, agora com `You cannot publish over the previously
published versions: 0.1.0`: aquele nome já era de outro projeto do mesmo escopo. Terminou em
`@vinihcrosa/lumem-os`, com dois binários (`lumem` e `lumem-os`) porque o outro pacote também instala
um `lumem`. Duas tentativas, duas recusas, e a mesma causa: **só o `PUT` decide**, e nenhuma leitura o
antecipa. O custo real foi baixo — nada foi publicado nas duas vezes, e a versão continuou livre.

**7. A imagem do README é o produto rodando, e não um protótipo.** Ela foi tirada de um daemon de
verdade, com um projeto registrado e uma worktree cortada — e num `--state-dir` temporário em `/tmp`,
para não publicar o caminho de casa de ninguém numa imagem num repositório público.
