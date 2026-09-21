# 031 — O desenho mora no código

**Status:** completa

> A decisão está em
> [`docs/adr/2026-09-20-2246-design-lives-in-the-code.md`](../../adr/2026-09-20-2246-design-lives-in-the-code.md),
> que supera a de 2026-08-19. Esta PRD é a **execução** dela.

## 1. O problema

O Open Design era a fonte e o repositório, a cópia. Três coisas vinham junto, e nenhuma era
acidente — as três estavam escritas como consequência ruim desde o primeiro dia:

1. **A cópia envelhece em silêncio.** `diff -rq` entre a pasta do Open Design e
   `packages/web/prototype/` deu **67 divergências** no dia desta feature. Um refactor de camadas do
   lado de lá — `lumem-ds.css` com 734 regras, 24 telas, uma galeria — nunca entrou aqui, e nada
   falhou.
2. **Uma pasta só**, em `~/Library/Application Support/`, para um produto cujo assunto é worktree
   paralela. Duas worktrees desenhando escrevem no mesmo lugar, e a segunda sobrescreve a primeira.
3. **O clone não contém o desenho.**

## 2. O que muda

| Sai | Entra |
|---|---|
| `packages/web/prototype/` — 50 arquivos | nada. O componente React **é** o desenho |
| `scripts/design-sync.ts` | `scripts/design-derive.ts`, só a derivação do `tokens.ts` |
| a rota `/styleguide` (557 linhas) | 19 stories em `src/ui/Primitives.stories.tsx`, o mesmo JSX |
| `tokens.css` como **cópia** | `tokens.css` como **fonte**, editável |

O ciclo default passa a ser **construir e ajustar**: escreve o React, roda `pnpm dev`, anota com o
agentation, o agente conserta pelo MCP. Desenhar antes continua existindo, e o gatilho é *se o
desenho estiver errado, o que se joga fora — código ou CSS?*.

## 3. O que fica de pé

Reafirmado no ADR, sem mudança: componente só usa `var(--token)`; `tokens.ts` é derivado e nunca
editado à mão; os 119 pares de contraste são conferidos no `gate:quick`.

## 4. O que esta feature custa, e está escrito

- **A atenção agendada.** A fase de desenho era um momento marcado para olhar uma superfície
  inteira, e foi assim que a [`023`](../023-composer-menus/prd.md) achou um `overflow: hidden` vivo
  no produto havia **três features**, com teste verde. O agentation pega o que se olha.
- **O canvas.** Degrau novo de rampa volta a ser escolhido à mão.
- **+57 pacotes** (medidos no `pnpm` deste monorepo, não os 276 de uma pasta vazia) e um segundo
  servidor de desenvolvimento.

## 5. O defeito que a execução achou, e que nenhuma leitura de código pega

O `build-storybook` **passava** enquanto o `storybook dev` servia um canvas girando para sempre.

A causa era um `viteFinal` de três palavras — `delete config.server` — escrito para impedir que o
Storybook herdasse a porta presa e o proxy do `vite.config.ts` do aplicativo. Ele derrubou junto o
plugin que injeta o `vite-app.js` do preview, e o `iframe.html` parou de pedir o script.

Nada nas duas mensagens de erro apontava para isso. A primeira era um `SyntaxError` do React
(`does not provide an export named 'default'`), a segunda acusava `allowedHosts`, e o que estava
quebrado era um **404** num terceiro arquivo que nenhuma das duas cita. O que fechou o diagnóstico
foi comparar o `iframe.html` servido com o de uma configuração mínima e ver **um `<script>` a
menos**.

A herança que o `viteFinal` queria evitar não dói: a porta vem do `-p` da linha de comando, e um
proxy para rota que a galeria nunca chama é inerte. A ausência de `viteFinal` virou comentário no
`main.ts`, porque é uma decisão e não um esquecimento.
