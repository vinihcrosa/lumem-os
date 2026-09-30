---
title: O daemon é o produto; todo cliente é uma casca sobre a web dele
date: 2026-09-29
area: architecture
summary: Decisão do Vinicius. O daemon roda sempre — local ou num servidor — e é quem tem estado, processos, terminal e arquivos. Navegador, app de desktop e, depois, o app de celular são clientes dele. O app de desktop é uma casca que carrega a interface servida pelo daemon, em vez de ter interface própria. O mobile fica livre para ter interface nativa. Responde a Q027 e a Q093. Reabre se um cliente precisar funcionar sem daemon nenhum.
feature: 038-desktop-and-updates
---

## Contexto

Até aqui o Lumem teve um cliente só: a web que o daemon serve na própria porta
([ADR de 2026-08-30](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md)). A pergunta de qual
seria o cliente principal ficou aberta desde o começo — a [Q027](../project/questions.md) (*"um cliente ou
vários falando com a mesma API?"*) e a [Q093](../project/questions.md) (*"web, desktop, TUI, ou
híbrido?"*).

A discovery de 2026-09-29 no Outline, *Menu bar app and auto-update*, respondeu as duas quando pediu um
app de menu bar e o dono descreveu para onde o produto vai:

> *"o app tem que rodar em um daemon sempre, para poder ser acessado remotamente. Um ex é rodar o daemon
> em um servidor e acesso pelo browser. — vai ter um cliente nativo, isso é mais por questão
> psicológica, um app nativo parece mais profissional que uma pagina no browser […] — o terminal é
> sempre o pty, já que tem que vir do daemon. — o acesso a arquivos já tem […] — quero que tenha um app
> mobile futuramente, que conecta no daemon."*

A referência que ele deu, o [Orca](https://github.com/stablyai/orca), tem essa forma: o mesmo renderer é
buildado para o desktop Electron (`electron.vite.config.ts`) e para a web (`vite.web.config.ts`, servida
por `orca serve` num servidor sem tela), e o app de celular é separado, em Expo.

Os fatos que tornam isso barato já estavam no código: o terminal é PTY no daemon
([ADR de 2026-09-24](2026-09-24-1620-agent-is-always-acp.md)), os arquivos passam pelo daemon, e a web
já fala com ele só por caminho relativo (`/trpc`, `/pty`, `/acp`), sem URL base.

## Decisão

O daemon é o produto: ele roda sempre, e é o único lugar com estado, processos, terminal e arquivos.
Todo cliente fala com ele pelas mesmas rotas. O cliente de desktop é uma **casca**: suas janelas carregam
páginas servidas pelo daemon, e a interface não é empacotada dentro dele.

O que isso implica:

- **A web é a interface.** Ela serve o navegador, o app de desktop e o painel do menu bar. Uma tela nova
  nasce na web e aparece em todos os clientes desktop de uma vez.
- **A casca de desktop faz só o que o navegador não faz:** ícone na barra, janela nativa, início no
  login, e iniciar ou parar o daemon local. Com o daemon parado, ela mostra uma tela mínima dela mesma.
- **Casca e daemon toleram versões diferentes.** Um app no laptop vai falar com um daemon de outra versão
  num servidor. O `health` responde uma `protocolVersion`, e a casca a confere.
- **O mobile não é casca.** Uma interface web dentro do webview do celular é o oposto da sensação nativa
  que o dono pediu. O app de celular pode ter interface própria, falando com as mesmas rotas — o Orca
  põe só o terminal numa WebView.
- **Acesso remoto passa pela autenticação.** Um daemon fora do loopback depende da
  [`019-daemon-auth`](../features/019-daemon-auth/prd.md).

**Reafirma**, do [ADR de 2026-08-30](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md): o
daemon é um bundle ESM que serve a web na própria porta, e o `npm i -g` é a instalação.

## Alternativas

### Cliente de desktop com interface própria, empacotada

- **O que era:** o React vai dentro do app, que fala com o daemon por HTTP.
- **A favor:** funciona mesmo com o daemon parado; a interface pode usar APIs do sistema direto.
- **Contra:** toda mudança de interface vira release do app; app e daemon passam a ter duas versões da
  mesma tela, e a de um servidor remoto não bate com a do laptop.
- **Por que perdeu:** a A1b da discovery. Com a interface vindo do daemon, um app serve daemon local,
  daemon remoto e navegador, e a casca quase nunca muda.

### Só a web, sem cliente nativo

- **O que era:** o navegador como único cliente, com notificação do navegador.
- **A favor:** nenhum binário próprio, nenhuma assinatura, nenhum toolchain a mais.
- **Contra:** perde o ícone na barra, a janela própria e o início no login; divide a atenção com as
  outras abas.
- **Por que perdeu:** o dono pediu o cliente nativo pelo efeito que ele tem em ficar no produto. A web
  continua sendo a interface; o que se acrescenta é a moldura.

### Uma interface para tudo, inclusive o celular

- **O que era:** a mesma web, empacotada também no celular (Tauri mobile, Capacitor).
- **A favor:** uma interface só.
- **Contra:** terminal, editor e diff numa tela de celular pedem outro desenho; o webview entrega a
  sensação que o dono quer evitar.
- **Por que perdeu:** o mobile fica livre. A regra que vale para ele é a das rotas, não a da interface.

## Consequências

### Bom

- Uma tela nova custa uma vez.
- O mesmo app abre o daemon local e, quando a `019` existir, um remoto.
- A casca é pequena e muda pouco, o que torna a atualização dela rara.

### Ruim

- Com o daemon parado, o app mostra quase nada.
- A web passa a precisar funcionar fora do Chromium quando for aberta pelo Safari de alguém num
  servidor remoto — o e2e hoje só roda Chromium (`playwright.config.ts:77`).

### Riscos — e o gatilho que traz a pergunta de volta

- **Um cliente precisar funcionar sem daemon** (modo offline, leitura de histórico sem o daemon de pé):
  reabre a casca com interface própria.
- **A `protocolVersion` mudar sem cuidado** quebra a casca instalada em máquinas que não atualizaram. Ela
  só sobe quando uma rota que a casca lê muda de forma.
