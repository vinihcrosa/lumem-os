# O desenho mora no código — Tasks

**PRD:** [prd.md](prd.md)
**Status:** completa
**Histórico:** escritas e entregues em **2026-09-20**, as oito no mesmo dia. A T1 custou o dobro
das outras sete juntas por um defeito de configuração cuja mensagem de erro apontava para outros
dois lugares — está no §5 da PRD.

Uma fase só: a troca é atômica. Deixar as duas superfícies de pé ao mesmo tempo — protótipo e
Storybook — recriaria em uma semana a divergência que esta feature existe para apagar.

## Fase 1 — A troca

- [x] **T1 — Storybook de pé.** `storybook@10.6.0` + `@storybook/react-vite@10.6.0` em
      `@lumem/web`. `.storybook/main.ts` com `stories: ["../src/**/*.stories.tsx"]` e telemetria
      desligada; `.storybook/preview.tsx` importando os CSS na mesma ordem do `main.tsx` e montando
      o agentation.
      **Done when:** `pnpm --filter @lumem/web build-storybook` termina, e o `storybook dev`
      **renderiza** uma story no navegador — as duas coisas, porque a primeira passou enquanto a
      segunda estava quebrada.

- [x] **T2 — Um decorator, não uma regra.** Toda story nasce dentro de `.sg__body`, com a largura
      máxima do detalhe. Primitiva medida numa faixa larga demais mente sobre onde ela quebra, e
      "lembrar de embrulhar" é o tipo de regra que a próxima story esquece.
      **Done when:** `preview.tsx` tem o decorator global e `src/ui/stories.css` tem só as classes
      que arrumam exemplo — a moldura de página da `styleguide.css` não vem junto.

- [x] **T3 — As 19 seções viram 19 stories.** Mesmo JSX, mesmos dados falsos e plausíveis. A seção
      `Row`, que tinha estado, virou um componente próprio dentro do arquivo de stories.
      **Done when:** `src/ui/Primitives.stories.tsx` lista as 19, e `Styleguide.tsx` e
      `styleguide.css` foram apagados.

- [x] **T4 — A rota sai.** `main.tsx` perde o ramo `/styleguide`; `routeOf("/styleguide")` continua
      devolvendo `home`, agora como o caso que importa — link velho abre o aplicativo, não uma tela
      de erro que o produto não tem.
      **Done when:** `pnpm --filter @lumem/web test` verde, com o comentário do `route.test.ts`
      dizendo por que a asserção sobreviveu ao endereço.

- [x] **T5 — O Open Design sai.** `packages/web/prototype/` (50 arquivos) e `scripts/design-sync.ts`
      apagados; `scripts/design-derive.ts` no lugar, com `--check`; `design:sync` vira
      `design:derive` no `package.json`.
      **Done when:** `pnpm --filter @lumem/web design:derive --check` passa e nada no repositório
      menciona `design:sync`.

- [x] **T6 — `tokens.css` deixa de ser cópia.** O cabeçalho dele, o do `tokens.ts` emitido, o
      docblock do `tokens-from-css.ts` e o do `tokens.test.ts` diziam que a fonte estava no Open
      Design.
      **Done when:** o `tokens.ts` commitado é o que a derivação produz, e o teste que compara os
      dois continua verde.

- [x] **T7 — Nenhum caminho morto.** 15 comentários de proveniência apontavam para
      `packages/web/prototype/<arquivo>`, que deixou de existir. Passam a citar
      `lumem-os-design/<arquivo>`, o repositório arquivado.
      **Done when:** `pnpm docs:check` verde — e ele achou um 16º, um link markdown para
      `Styleguide.tsx` no `tasks.md` da `008`.

- [x] **T8 — A documentação.** O ADR, com `supersedes`; a nota de superação no estudo; a **Regra de
      design** do `CLAUDE.md` reescrita; `pnpm storybook` na tabela de comandos; o índice.
      **Done when:** `pnpm docs:check` e `pnpm gate:build` verdes.
