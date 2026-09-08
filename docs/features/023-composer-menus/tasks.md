# Os menus do composer — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** completa
**Histórico:** **4 tasks em 2 fases, todas entregues** (2026-09-07). As cinco perguntas estão respondidas; as três primeiras no Open Design, antes do código, porque a geometria de menu nasce lá — é a regra de [design-source-of-truth](../../project/design-source-of-truth.md).

O conserto é uma declaração a menos e duas a mais. **A armadilha é a prova**: o defeito é geometria,
e todo teste de componente do repositório é jsdom, onde nada é recortado por nada. Foi assim que o
menu de `/comandos` ficou **invisível por três features tendo teste**.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `lumem-ds.css` (Open Design) | `.composer__box` perde `overflow: hidden` |
| `tokens.css` (Open Design) | nasce `--size-menu-max-h: 280px` |
| `lumem-composer-menus.html/.css` (Open Design) | a folha nova: os três defeitos desenhados, o conserto, e a tabela de âncoras |
| `conversation.css` | as mesmas três coisas, mais a âncora do `.mmenu` |
| `Conversation.tsx`, `LumemModePill.tsx` | o menu do modo volta para dentro da pílula |
| `fake-acp-agent.mjs` | `LUMEM_FAKE_MANY_MODELS=1` — vinte modelos, zero token |
| `composer-menus.spec.ts` | o e2e que só o navegador pode rodar |

**O que não muda** — e cada um tem uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| a âncora do `.gate` | [Q3](open-questions.md) — cartão de 420px alinha com a caixa, e a pílula já saiu de cena |
| a âncora do `.slash` dos comandos | [Q3](open-questions.md) — quem o abre é o campo, e o campo é a caixa |
| navegação por teclado no menu do seletor | fora de escopo, no [backlog](../../project/backlog.md) |
| o estouro de texto **dentro** da pílula | a issue já o tira de escopo |

---

## Fase 1 — o desenho (Open Design)

#### T1: O recorte sai do design system, e o teto nasce como token

**What**: `.composer__box` perde `overflow: hidden` no `lumem-ds.css`, com o comentário dizendo o que
o recorte cortava e por que os cantos não precisam dele. `tokens.css` ganha `--size-menu-max-h`.
**Where**: Open Design → `lumem-ds.css`, `tokens.css`
**Done when**: `pnpm --filter @lumem/web design:sync` traz os dois e re-deriva o `tokens.ts` com
`'menu-max-h': 280`.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue

#### T2: A folha `lumem-composer-menus`, com os três defeitos desenhados

**What**: A tela nova. O §1 desenha o **estado de hoje** com a classe `.clip`, que devolve o
`overflow: hidden` à caixa — os três quadros são o pixel que o produto emite, não erro de protótipo.
O §2 é o conserto, com os dois cantos lado a lado. O §3 é a tabela de âncoras.
**Where**: Open Design → `lumem-composer-menus.html`, `lumem-composer-menus.css`
**Done when**: aberto no navegador, o §1 mostra 3 de 20 opções no primeiro quadro e **nenhum** menu
no segundo; o §2 mostra os 20 com barra de rolagem e o menu de comandos inteiro.
**Gate**: renderizado e conferido no navegador
**Status**: ✅ entregue — foi o §2 que produziu a medição da [Q1](open-questions.md), e o §1 que
achou o defeito do menu de comandos

---

## Fase 2 — o produto

#### T3: A caixa deixa de recortar, os menus ganham teto, e o do modo volta para a pílula

**What**: As três coisas na `conversation.css`, e a mudança de hospedagem no React: a
`LumemModeMenu` sai de baixo do `.composer` e vira irmã da pílula dentro do mesmo `.config`. O
`gateOpen`/`modeMenuOpen` continuam no `Conversation` — o portão é do composer.
**Where**: `packages/web/src/components/conversation.css`, `Conversation.tsx`, `LumemModePill.tsx`
**Done when**: os comentários que justificavam a fuga passam a dizer o que mudou, e não somem.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue

#### T4: O e2e que pergunta o que o mouse pergunta

**What**: `LUMEM_FAKE_MANY_MODELS=1` no fake (vinte modelos), e três testes:
a opção do **topo** recebe o clique; a lista longa tem **teto com conteúdo maior que ele** e o fundo
é alcançável rolando o menu; o menu de **comandos** aparece e escolher insere. A pergunta é
`document.elementFromPoint`, não `toBeVisible` — [Q5](open-questions.md).
**Where**: `e2e/composer-menus.spec.ts`, `e2e/support/fake-acp-agent.mjs`
**Done when**: os três passam com o conserto e **falham sem ele**, conferido um por um.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue — RED conferido: `o clique na primeira opção não chega nela`,
`o clique no comando não chega nele`, `o menu passou do teto de 280px`
