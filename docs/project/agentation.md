# Agentation — anotação visual da tela para o agente

O [Agentation](https://www.agentation.com/) é uma barra que aparece por cima da aplicação no dev.
Clicar num elemento vira uma anotação com seletor CSS, hierarquia de componente React, estilo
computado e o comentário escrito — e é isso que o agente lê, em vez de receber "o botão da direita
está estranho" e ter que adivinhar qual botão.

Entrou porque o design deste projeto é feito no [Open Design](design-source-of-truth.md) e volta para
cá como protótipo: o que faltava era o caminho de volta, da tela rodando para o agente que a
implementa.

## Como está montado

| Onde | O quê |
|---|---|
| `packages/web/src/lib/agentation.ts` | `mountAgentation()`, o guarda de ambiente e o endereço do servidor |
| `packages/web/src/main.tsx` | a chamada, depois do `render` e sem `await` |
| `.mcp.json` | o servidor MCP `agentation`, que o agente usa para ler e responder as anotações |
| `playwright.config.ts` | `VITE_AGENTATION=off` no servidor web do e2e |

A barra é montada **fora do `#root`**, num `<div id="agentation-root">` próprio. Ela é ferramenta de
desenvolvimento, não tela do produto: dentro da árvore da aplicação ela apareceria em cada teste de
componente e dentro do `StrictMode`.

## Por que não vai para produção

`mountAgentation()` começa com um `if (!import.meta.env.DEV) return`. O valor é substituído por
`false` literal no build, o `return` vira código morto, e o rollup derruba o `import()` dinâmico
junto com o pacote inteiro — o bundle publicado não menciona o agentation.

Isso é verificado, não prometido: `e2e/production.spec.ts` baixa cada asset servido pelo daemon e
falha se algum deles contiver a palavra. Trocar o guarda estático por um teste em runtime quebra
essa checagem, que é exatamente o ponto.

## Variáveis de ambiente

| Variável | Padrão | O quê |
|---|---|---|
| `VITE_AGENTATION` | ligado no dev | `off` desliga a barra. É o que o e2e passa: um elemento fixo por cima da tela só disputaria o clique com o playwright |
| `VITE_AGENTATION_ENDPOINT` | `http://127.0.0.1:4747` | onde o `agentation-mcp server` escuta. `off` deixa a barra só no `localStorage`, sem sincronia |

A porta 4747 é do processo do próprio agentation e por isso **não** entra no `ports.json`, que
descreve as portas que este repositório aloca.

## Usando

1. `pnpm dev`.
2. A barra aparece no canto inferior direito. Clicar num elemento e escrever o comentário cria a anotação.
3. Do lado do agente: `agentation_list_sessions`, `agentation_get_session`, responder e resolver — ou
   `agentation_watch_annotations`, que fica esperando a próxima anotação chegar.

Se o servidor MCP não estiver de pé, a barra mostra desconectado e guarda tudo no `localStorage`; o
que se perde é a sincronia, não a anotação.

## O que ele não é

Não é onde o design acontece. A regra do [design-source-of-truth](design-source-of-truth.md) continua
valendo: tela nova nasce no Open Design. O agentation aponta o que está errado na tela que já existe.
