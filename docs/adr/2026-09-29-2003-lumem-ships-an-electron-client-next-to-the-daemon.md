---
title: O Lumem entrega um cliente Electron ao lado do daemon, num pacote npm por plataforma
date: 2026-09-29
area: distribution
summary: Decisão do Vinicius. O cliente de desktop é Electron, para macOS e Linux (Windows depois), em `packages/desktop`. Ele sai em quatro pacotes npm por plataforma, opt-in por `lumem menubar install`, na mesma versão do daemon, com assinatura ad-hoc no macOS. O daemon continua sendo o bundle ESM com duas dependências nativas. Perderam Tauri, Swift e um `.dmg` assinado. Reabre se o cliente parar de ser uma casca, ou se um canal de download avulso entrar.
feature: 038-desktop-and-updates
---

## Contexto

O [ADR anterior](2026-09-29-2002-the-daemon-is-the-product-clients-are-shells.md) decidiu que o cliente de
desktop é uma casca sobre a web do daemon. Faltava de que ele é feito e como chega na máquina — e a
resposta toca três regras em vigor:

- o [ADR de 2026-08-30](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md): a instalação é
  `npm i -g`, com **duas dependências nativas só** (`better-sqlite3` e `node-pty`);
- a [`014-distribution`](../features/014-distribution/prd.md) §7 deixa de fora `.dmg` e *"assinatura e
  notarização — não há binário nativo próprio para assinar"*;
- e o cliente vai ser o primeiro binário nativo que o próprio Lumem entrega.

A discussão está na discovery de 2026-09-29 no Outline, *Menu bar app and auto-update* (A1, A1b, A1c,
D1b, D2, D4b). O ponto que decidiu entre Electron e Tauri foi o destino: a casca vai carregar a
**interface inteira** — terminal xterm com WebGL, editor, diff —, e não só um painel.

## Decisão

O cliente de desktop é **Electron**, para macOS e Linux, em `packages/desktop/`, e sai em **um pacote npm
por plataforma**: `@vinihcrosa/lumem-desktop-darwin-arm64`, `-darwin-x64`, `-linux-x64` e `-linux-arm64`.
Nenhum deles é dependência do pacote principal: `lumem menubar install` instala o da máquina, com o
gerenciador dono da cópia instalada, na versão exata do daemon.

O que isso implica:

- **Uma cadeia de confiança só.** Os pacotes saem pelo mesmo release, com OIDC e provenance, como o
  principal. Não há chave de assinatura de atualização do app.
- **Assinatura ad-hoc no macOS.** Um app escrito pelo npm não passa pelo caminho de download do
  navegador. Isso é **suposição até a fase 0 provar** (experimento 5 da discovery). Se falhar, a
  Developer ID entra.
- **O app atualiza com o daemon.** `lumem upgrade` leva os dois para a mesma versão.
- **O release anexa `.zip`, `.AppImage` e `.deb`** ao GitHub release, sem uso por ora. São as URLs de que
  um cask do Homebrew e um repositório apt vão precisar.
- **Fronteira:** `packages/desktop` importa só de `@lumem/shared`; ninguém importa dele.

**Reafirma**, do [ADR de 2026-08-30](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md): o
**daemon** é um bundle ESM que serve a web na própria porta, com as duas dependências nativas e nenhuma
outra. O Electron é um artefato à parte: o daemon não o carrega nem depende dele.

## Alternativas

### Tauri v2

- **O que era:** casca em Rust sobre o webview do sistema — o que o Conductor usa.
- **A favor:** ~5–15 MB por plataforma contra ~100 MB, ~30–60 MB de memória contra 100–150 MB, IPC
  restrito por padrão. Para uma casca que só mostra um painel, ganha.
- **Contra:** no Linux o motor é o WebKitGTK, o mais fraco dos três, com problemas conhecidos de GPU e de
  janela em branco; o terminal é o coração do produto. Cada integração nativa futura é um plugin em Rust,
  fora do oxlint, do vitest e do Stryker.
- **Por que perdeu:** A1c da discovery. O destino é um cliente com a interface inteira, e o Electron
  roda o mesmo Chromium que o e2e já testa.

### Casca Swift com `WKWebView`

- **O que era:** a recomendação original da discovery (opção S).
- **A favor:** poucas centenas de linhas nativas, alguns KB.
- **Contra:** só macOS.
- **Por que perdeu:** A3 — o cliente tem que rodar em macOS e Linux.

### Todas as plataformas no pacote principal

- **O que era:** o `.app` e o AppImage dentro do tarball do `@vinihcrosa/lumem-os`.
- **Contra:** todo `npm i -g` baixaria centenas de MB, inclusive quem nunca vai abrir o app.
- **Por que perdeu:** D1b. O `optionalDependencies` com `os`/`cpu` perdeu pelo mesmo motivo.

### `.dmg` assinado, cask do Homebrew

- **O que era:** o caminho tradicional de app de Mac.
- **Contra:** Developer ID (US$ 99 por ano) e notarização no CI. Desde 2026-09-01 o Homebrew tirou o
  `--no-quarantine`, então um cask sem notarização cai em *"app is damaged"*. É um segundo canal de
  atualização, com versão própria.
- **Por que perdeu:** D1b e D2. Fica no backlog, com o gatilho *"quando alguém quiser instalar sem
  Node"*.

## Consequências

### Bom

- O app e o daemon andam na mesma versão, e uma instalação atualiza os dois.
- TypeScript de ponta a ponta: o harness inteiro cobre o app.

### Ruim

- ~100 MB por plataforma, e ~100 MB no `pnpm install` de quem desenvolve.
- Quatro pacotes a mais por release.
- Rodar sem assinatura de verdade depende de um comportamento do macOS que a Apple pode mudar.

### Riscos — e o gatilho que traz a pergunta de volta

- **O Gatekeeper passar a pôr quarentena em app escrito pelo npm**, ou o npm recusar um tarball de
  ~100 MB: a fase 0 mede antes da Parte 4; se cair, a Developer ID e um `.dmg` entram.
- **O cliente deixar de ser casca** (interface própria, sem daemon): reabre o Tauri, porque o argumento
  do Chromium idêntico perde força.
- **Windows entrar:** o mesmo Electron serve, com um quinto pacote e a decisão de assinatura de lá.
