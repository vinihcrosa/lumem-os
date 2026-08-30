# PRD — Distribuição: `npm i -g @vinihcrosa/lumem`, e o build que a torna possível

> **Status:** v1.0 — **completa**. 11 perguntas respondidas e 16 tasks entregues em 2026-08-30.
> **Nasceu de:** *"precisamos implementar uma pipeline de build, e uma forma de instalar, além de
> atualizar o README.md"* — 2026-08-30. O canal de instalação (**npm global**) foi escolhido na mesma
> conversa.
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md) — 16 tasks em 6 fases
> **Depende de:** nada de produto. Depende do que já existe: o daemon Fastify, o build do web que já
> funciona, e o `preflight` do onboarding, que já diz o que falta na máquina
> **Não é feature de tela.** A segunda, depois da [workspace-memory](../workspace-memory/prd.md)
> **Deixou dívida escrita:** o daemon em background e a migração do projeto para inglês foram para o
> [backlog](../../project/backlog.md) na hora — as duas saíram das respostas D2 e D11

---

## 1. O problema, em uma frase

**O Lumem só existe dentro do checkout de quem o escreveu.** Onze features de pé, um produto que vai
do `~/.lumem` vazio até um turno respondido — e nenhuma forma de alguém *ter* isso que não seja
clonar o monorepo, instalar com pnpm e subir dois processos em duas portas.

O que falta, medido neste repositório em 2026-08-30:

| O quê | Estado hoje |
|---|---|
| Build do servidor | **não existe.** `@lumem/server` não tem script `build`; `pnpm build` roda quatro tasks e só o web produz artefato (2,5 MB em `packages/web/dist`) |
| Como o servidor roda | por `tsx` — `"start": "tsx src/main.ts"`. Um transpilador de desenvolvimento no caminho de produção |
| Como o web chega ao usuário | **pelo vite.** O daemon não serve arquivo estático nenhum; em dev o `/trpc`, o `/pty` e o `/acp` chegam pelo proxy do `vite.config.ts` |
| Binário | não existe. Não há `bin` em nenhum `package.json` |
| Instalação | não existe. Os três pacotes são `"private": true` e `"version": "0.0.0"` |
| Release | não existe. O `ci.yml` **verifica** (typecheck, build, testes, e2e) e nunca **publica** |
| README na raiz | **não existe** — nem nunca existiu: `git log --all -- README.md` volta vazio. O repositório é público em `github.com/vinihcrosa/lumem-os` e o que ele mostra na primeira tela é uma lista de arquivos |

O CLAUDE.md já reserva o lugar — *"as únicas exceções na raiz são `README.md` e este `CLAUDE.md`"* —
para um arquivo que nunca foi escrito.

## 2. Por que agora

Porque o produto passou do ponto em que a distribuição era prematura. O onboarding leva do nada até
o primeiro turno, a conversa sobrevive a fechar o daemon, a worktree nova nasce preparada e sobe a
aplicação com um clique. A única coisa entre isso e alguém usando é **empacotar**.

E porque três coisas que a distribuição exige **já estão prontas e não foram feitas para ela**:

- **o web já fala em origem relativa.** O cliente tRPC usa `url: "/trpc"`, e os dois sockets derivam
  o endereço de `window.location`. Servir o `index.html` do próprio daemon não pede mudança nenhuma
  no cliente — é o mesmo código que hoje passa pelo proxy do vite;
- **o daemon já sabe dizer o que falta na máquina.** O `preflight` do onboarding checa daemon, git
  (piso 2.30), node, diretório de estado e disco livre. Um instalador não precisa repetir isso: o
  produto já tem a tela;
- **as duas dependências nativas já são tratadas.** O `ensure-pty-helper.ts` conserta o bit de
  execução do `spawn-helper` do node-pty, e ele **já sabe ler o layout flat** (`node_modules/node-pty`),
  que é exatamente o layout de um `npm i -g`. Foi escrito para o pnpm e serve para o npm de graça.

## 3. O que a coisa é

Três coisas, e as duas primeiras existem para a terceira ser possível.

### 3.1 Um build de verdade, do servidor

`packages/server` ganha `build`: um bundle **ESM** feito com esbuild, com **só o que é nativo por
fora** — `better-sqlite3` e `node-pty`. Tudo o mais (fastify, tRPC, drizzle, o SDK do ACP, zod, yaml,
smol-toml, ws) entra no arquivo.

**Isto foi medido, não suposto.** Bundle de `src/main.ts` em 2026-08-30, nesta árvore:

| Medição | Resultado |
|---|---|
| Tamanho | **3,0 MB**, um arquivo |
| Tempo | **123 ms** |
| Sem o shim de `require` | morre no boot: `Error: Dynamic require of "process" is not supported`, dentro do `yaml@2.9.0` |
| Com `--banner:js` criando um `require` por `createRequire(import.meta.url)` | **sobe**: rodou as migrações do SQLite num state dir novo, escreveu o repositório de memória, escutou em `127.0.0.1:4999` e respondeu tRPC |

Uma armadilha de layout saiu do mesmo teste. O `db/index.ts` resolve as migrações **em relação ao
próprio arquivo**:

```ts
export const MIGRATIONS_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../drizzle");
```

Dois níveis acima do módulo. O pacote publicado tem que **preservar essa distância**: bundle em
`dist/server/main.mjs`, `drizzle/` na raiz do pacote. Um bundle solto na raiz procuraria as migrações
fora do pacote e o daemon abriria um banco sem tabela nenhuma — e o teste que provaria isso é o boot,
não o typecheck. É o único `import.meta.url` do servidor fora de testes; não há segundo caso escondido.

### 3.2 Um processo, uma porta

Em produção o daemon **serve o web**. Mesma origem, porta 4317, `index.html` com fallback de SPA, os
assets com cache longo (o vite já produz nome com hash), e as três rotas do daemon — `/trpc`, `/pty`,
`/acp` — intocadas.

O modo de desenvolvimento não muda: `pnpm dev` continua sendo vite + daemon, com o proxy. O que a
produção elimina é o segundo processo e a segunda porta, não o fluxo de trabalho de quem desenvolve.

### 3.3 Um pacote, um binário

```
npm i -g @vinihcrosa/lumem
lumem
```

**O nome curto não deu.** Verificado em 2026-08-30 que `npm view lumem` responde 404 — e isso provou
menos do que parecia: o registry recusou o `PUT` com *"Package name too similar to existing package
mem"*. A regra anti-typosquatting só roda na publicação, então nenhuma leitura a antecipa. O pacote
é escopado; o binário continua sendo `lumem`. Ver a [D1](open-questions.md).

O binário sobe o daemon, imprime o endereço e — se você deixar — abre o navegador. O produto inteiro
está no outro lado dessa URL, incluindo a primeira tela do onboarding, que é quem diagnostica a
máquina.

O que o pacote publicado contém, e nada além:

```
@vinihcrosa/lumem/
  package.json      # 2 dependências: better-sqlite3, node-pty
  bin/lumem.mjs     # o CLI
  dist/server/main.mjs
  dist/web/         # index.html + assets, saída do vite build
  drizzle/          # as migrações, na distância que o §3.1 exige
  README.md
  LICENSE
```

Nenhuma dependência de runtime que não seja nativa: o resto foi bundlado. Isso torna a instalação
um download de ~5 MB mais dois prebuilds — sem compilar nada em macOS e Linux comuns, porque os dois
pacotes nativos publicam binários prontos.

## 4. A pipeline

Duas, e elas não se misturam.

| Pipeline | Quando | O que faz | Existe? |
|---|---|---|---|
| `ci.yml` | toda PR, todo push em `main` | typecheck, build, testes, e2e | **sim**, e não muda |
| `release.yml` | tag `v*`, e `workflow_dispatch` | os gates de novo + empacota + **prova o pacote** + publica no npm + cria a Release | **não** |

O passo que não é óbvio é o terceiro. **Um job que instala o tarball num runner limpo** — `npm i -g
./lumem-<versão>.tgz`, sobe o binário, e faz duas requisições: `GET /` tem que devolver o HTML, e uma
chamada tRPC tem que responder. Em `ubuntu-latest` e `macos-latest`, porque é aí que os prebuilds
nativos são diferentes.

Esse job é a razão de a pipeline existir. Todo modo de falhar deste empacotamento — dependência nova
com `require` dinâmico, migração que ficou fora do tarball, prebuild ausente numa plataforma, `files`
esquecendo um diretório — é **invisível** para typecheck, para o vitest e para o e2e, que rodam
contra o código-fonte. Só aparece instalando.

A publicação usa **provenance** (`npm publish --provenance`), que o GitHub Actions assina com OIDC.
Custa uma linha e diz de qual commit o tarball saiu.

## 5. A versão

Hoje ela mora em dois lugares que um teste mantém iguais — `LUMEM_VERSION` em
`packages/shared/src/constants.ts` e o `version` do `packages/shared/package.json`, com
`constants.test.ts` provando a igualdade — e num terceiro que não existe ainda: o do pacote
publicado.

Um script escreve os três (`pnpm version:set 0.1.0`), o teste que já existe guarda dois, e um novo
guarda o terceiro. Quem publica roda um comando; ninguém edita três arquivos na mão.

A primeira versão publicada é **0.1.0**, não `1.0.0` e não `0.0.0`: o produto funciona ponta a ponta
e não tem promessa de estabilidade nenhuma para fazer.

## 6. O README

O arquivo que o repositório público não tem. Ele é o único artefato desta feature que uma pessoa lê
antes de instalar, então o critério dele é: **quem chega pelo GitHub entende o que é e instala, ou
decide que não quer, em dois minutos.**

| Seção | O quê |
|---|---|
| O que é | uma frase, e uma imagem do produto rodando |
| Instalar | `npm i -g @vinihcrosa/lumem` e o que a máquina precisa: node 22, git 2.30, e o `claude` CLI para a conversa |
| Rodar | `lumem`, a URL, e a primeira tela |
| O que ele faz | workspace → projeto → worktree, conversa por ACP, memória, scripts do projeto — a lista curta, cada item linkando o PRD |
| Como funciona | cinco linhas de arquitetura: daemon Fastify + tRPC, web React, SQLite em `~/.lumem`, worktrees de verdade no disco |
| Desenvolver | `pnpm dev`, os três gates, e o link para [docs/README.md](../../README.md) |
| Estado e licença | o que está pronto, o que não está, e sob qual licença — **o repositório não tem `LICENSE`** e um projeto público sem licença é "todos os direitos reservados" por omissão ([Q8](open-questions.md)) |

**Em inglês** — decidido na [D11](open-questions.md), com um `README.pt-BR.md` linkado na primeira
linha. É a porta de um repositório público e de uma página do npm, e é também o primeiro arquivo de
uma migração maior: a resposta veio junto com *"quero passar tudo para inglês em breve"*, e essa
intenção está no [backlog](../../project/backlog.md) com o gatilho. O `/docs` continua em português
por enquanto.

## 7. O que fica de fora

Nomeado, para não virar escopo por acidente:

| Fora | Por quê |
|---|---|
| Windows | o produto é worktree, PTY e shell de login. Vale uma feature, não um bullet |
| Auto-update | `npm i -g @vinihcrosa/lumem@latest` é a atualização da v1 |
| Homebrew, Docker, AppImage, `.dmg` | canais adicionais só fazem sentido depois de o primeiro ter usuários |
| Assinatura e notarização | não há binário nativo próprio para assinar |
| Daemon remoto, multiusuário, autenticação | o Lumem escuta em `127.0.0.1` por decisão de projeto. Mudar isso é outra feature, e é uma feature de segurança |
| Telemetria | não vai ter. Está aqui escrito para que a ausência seja uma decisão e não um esquecimento |

## 8. Riscos

| Risco | O que segura |
|---|---|
| Uma dependência nova quebra o bundle com `require` dinâmico | o job de smoke do §4, que **instala e sobe**. É o único que pega isso |
| Falta prebuild nativo numa plataforma | o mesmo job, em ubuntu e macos. E o README diz o que é suportado |
| Um arquivo necessário fica fora do tarball | `files` explícito no `package.json`, e o smoke, que roda a partir do tarball e não da árvore |
| Publicar cedo demais e queimar o nome | `0.1.0` e um README honesto sobre o estado |
| O bundle esconde uma dependência de dev no caminho de produção | o pacote publicado declara **duas** dependências; qualquer outra coisa que ele precise em runtime falha no smoke |

## 9. Done when

1. `pnpm build` produz `packages/server/dist/server/main.mjs` e `packages/web/dist/`, e o servidor
   bundlado **sobe** — provado por teste, não por inspeção;
2. o daemon serve o web na própria porta, e o e2e roda **uma vez em modo produção**: sem vite, contra
   `dist`;
3. `lumem` existe como binário, com `--port`, `--host`, `--state-dir` e `--version`;
4. `npm pack` produz um tarball que, instalado num runner limpo em ubuntu e macos, sobe e responde
   `/` e `/trpc`;
5. uma tag `v*` publica no npm com provenance e cria a Release;
6. o `README.md` da raiz existe, e alguém que nunca viu o projeto consegue instalar por ele;
7. `docs/README.md` lista esta feature.
