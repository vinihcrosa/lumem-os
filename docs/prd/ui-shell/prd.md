# PRD — Interface

> **Status:** desenho aprovado, tasks prontas para execução
> **Versão:** v0.1
> **Perguntas:** [open-questions.md](open-questions.md)
> **Protótipo:** `packages/web/prototype/lumem-shell.html` — abra no navegador

---

## 1. Objetivo

Vestir a interface que o [walking-skeleton](../walking-skeleton/prd.md) deixou de pé.

Aquela feature entregou 34 tasks e provou que a espinha aguenta peso: o daemon é dono do estado, o PTY roda no servidor, a sessão sobrevive a fechar o navegador. O que ela **não** entregou foi uma folha de estilo — nenhum CSS é importado pelo cliente hoje. As `className` existem nos componentes e não têm nada do outro lado.

Esta feature não adiciona função nenhuma. Ela desenha as que existem.

**Critério de sucesso em uma frase:** você abre o Lumem e ele parece uma ferramenta, não um formulário HTML de 1998 — e cada estado degradado do §8 do PRD do walking-skeleton tem uma aparência decidida, não uma acidental.

---

## 2. Como o desenho foi feito

Protótipo em HTML+CSS antes de qualquer React, seguindo a skill `ui-design-prototype`.

O protótipo não é uma representação da interface: é escrito na tecnologia final e lê o **mesmo** `tokens.css` que o app vai ler. Quando o desenho fechou, o CSS foi junto inteiro. Não existe passo de tradução, então não existe passo onde algo se perde.

Quatro telas, um arquivo: detalhe de worktree, sessão de agente, detalhe de projeto, e uma galeria dos estados degradados.

### O que a renderização achou

Cada um destes foi encontrado olhando o PNG, não lendo o código — e é o argumento pra fase de verificação existir:

| Achado | Correção |
|---|---|
| Terminal preso na coluna de leitura de 880px | Sessão virou exceção de layout: largura e altura cheias |
| Sidebar pintava projeto, worktree, shell e agente em quatro matizes | Estrutura ficou cinza; cor marca só o que está vivo ou quebrado |
| `accent` a 72° era o mesmo âmbar que `warning`, e os dois aparecem na mesma linha | `accent` foi para 118° |
| `brand` a 272° lia índigo, não violeta | 292° |
| Diálogo de primeiro uso e menu de agente herdaram a largura da coluna de detalhe | Tokens próprios: 420px e 300px |
| Ação terciária sem borda lia como texto, não como botão | `btn--ghost` ganhou borda sutil |

---

## 3. Fundação

### Tokens

Gerados por `packages/web/scripts/generate-tokens.py`, nunca escritos à mão. Saída em `packages/web/src/styles/`: `tokens.css` (o que o CSS lê), `tokens.ts` (o que o JavaScript lê — o tema do xterm precisa dos valores), `palette.json`.

Rampas em OKLCH, que é perceptualmente uniforme: uma escala de luminosidade compartilhada dá a todas as matizes o mesmo peso visual. Rampas escolhidas a olho não têm essa propriedade.

**Contraste é verificado, não estimado.** 60 pares reais de uso — texto/superfície, label/botão, cada cor de domínio sobre o fundo em que ela aparece de verdade. Todos AA ou melhor. Introduzir par novo exige adicionar a checagem e rodar de novo.

### Duas camadas

| Camada | Exemplo | Papel |
|---|---|---|
| Primitiva | `--brand-500`, `--neutral-990` | Matéria-prima. Nunca usada em componente. |
| Semântica | `--color-bg-panel`, `--color-session-running` | O que o componente consome. Sempre alias de primitiva. |

### Tokens de domínio

O que separa um design system genérico de um que serve a este produto. O vocabulário do Lumem tem token:

```
session/running · exited · failed · shell · agent
worktree/clean · dirty · missing
git/branch · ahead · behind · added · removed · modified
scope/global · workspace · project · worktree
daemon/online · offline
```

Quando a frase for "worktree suja precisa gritar mais", existe **um** lugar pra mudar.

### Densidade

Âncora: a linha de lista tem 28px. Todo o resto deriva dela — altura de controle, topbar, item de menu. Espaçamento base 4, nomeado pelo valor em px (`--space-12` = 12px), sem meio-passo e sem ambiguidade.

Duas famílias: Inter para interface, JetBrains Mono para tudo que é literal do domínio — caminho, branch, comando, id, saída de terminal. Em ferramenta de dev a monoespaçada é cidadã de primeira classe.

---

## 4. Escopo

### O que muda

**F1 — Fundação.** `tokens.css` importado uma vez na raiz. Fontes self-hosted (o daemon serve o app; sem CDN). Reset e estilos de documento.

**F2 — Primitivas.** `Button`, `Chip`, `Row`, `Item`, `MetaGrid`, `SectionHead`, `Banner`, `EmptyState`, `Card`, `Field`, `Menu`. Mais uma rota `/styleguide` que renderiza todas em todos os estados — é onde regressão visual aparece antes de chegar na tela.

**F3 — Casca.** Topbar com wordmark e estado do daemon. Sidebar com árvore unificada: indentação por profundidade, colapso e expansão persistidos, rodapé de ação.

**F4 — Detalhes.** Projeto, worktree e sessão ganham crumb, título, chips de estado, barra de ações, grade de metadados e listas.

**F5 — Estados.** Primeiro uso, vazio, carregando, daemon offline, e cada bloqueio do §8 com aparência decidida.

### O que sai de lugar

| O quê | De onde | Pra onde | Por quê |
|---|---|---|---|
| `AddProjectDialog` | fim da `ProjectList` | rodapé da sidebar | é ação do workspace, não item da lista |
| `CreateWorktreeDialog` | dentro da `WorktreeTree` | ações do `ProjectDetail` | é ação do projeto, não da árvore |
| `NewSessionMenu` | fileira de botões, um por config | menu suspenso | com 3 agentes a fileira já não cabe |
| `<header>` do app | `App.tsx` | `AppShell` | o shell é quem sabe a forma da tela |

### Não-objetivos

Cada linha é uma tentação que vai aparecer durante a implementação.

| Fora | Por quê |
|---|---|
| Tema claro | O produto é uma ferramenta de terminal. Escuro primeiro; claro quando alguém pedir. |
| Responsivo / mobile | Não existe uso móvel de um harness de agentes. |
| Animação e transição | Custa tempo e esconde latência real. Depois. |
| Ícones SVG | Ficam os glifos Unicode do protótipo. Trocar é uma task isolada. |
| Busca na árvore | Volta quando a árvore for grande o bastante pra doer. |
| Atalhos de teclado | Merecem desenho próprio, não migalhas. |
| Storybook | A rota `/styleguide` faz o papel sem dependência nova. |
| Campo novo no servidor | Esta feature é o cliente. Contrato muda em feature própria. |

---

## 5. Restrições

**Nenhum valor literal fora de `tokens.css`.** Nada de `#1a1a1a`, `padding: 12px`, `height: 28px` em componente. Sempre `var()`. Exceção tolerada: ajuste ótico de 1–2px sem token.

**Componente lê só a camada semântica.** Primitiva direto em componente quebra a promessa de trocar a marca mudando uma rampa.

**`tokens.css` não se edita à mão.** Edite o bloco `CONFIG` do gerador e rode de novo. O arquivo diz isso no topo.

**Toda task fecha com o gate que ela declara.** Nenhuma fecha com teste vermelho.

---

## 6. Custo nos testes

Os testes web assertam texto literal que muda. `"2 à frente, 3 atrás"` vira o chip `↑2 de main`; `"a branch não é apagada"` sai da tela. São ~890 linhas em 5 arquivos de teste.

Cada task atualiza os testes que ela quebra, na mesma task. Não existe "arruma os testes depois".

---

## 7. Riscos

**O terminal é onde o desenho pode falhar em produção.** O protótipo desenha um terminal falso, com HTML. O real é o xterm, que pinta seu próprio canvas com suas próprias cores ANSI. Se o tema não for montado a partir dos tokens, o terminal vai brigar com o resto da tela — e é o elemento que ocupa mais pixels do app.

**Colapso muda o que está montado.** Hoje toda `SessionList` monta sempre, e é por isso que dá pra saber que existe agente rodando numa worktree fechada. Se colapsar desmontar a query, o pip verde some e o produto perde seu sinal central. A correção é arquitetural, não cosmética: a query sobe pra um hook e a linha lê o mesmo cache que a lista.

**~~`Date` que não é `Date`~~ — risco descartado.** A leitura inicial dizia que `session.createdAt` chegaria como string ISO tipada como `Date`, porque não há transformer no tRPC e a coluna é `timestamp_ms` no Drizzle. O typecheck da T4 desmentiu: o tRPC v11 modela a serialização JSON na própria inferência, então o tipo que chega ao cliente **já é** `string`. A metade do runtime estava certa — o daemon responde `"2026-08-15T06:20:23.234Z"` — mas o tipo não mente, e o compilador pega quem tratar como `Date`.

A lição que sobra é outra, e essa vale: **tipo derivado do contrato não se redeclara.** A primeira versão do `useSessionsByScope` escrevia à mão a forma que a query devolve, e foi isso que produziu o erro — a declaração local dizia `kind: "shell" | "agent"` enquanto a coluna é `text` e o servidor devolve `string`. Deixar a inferência fazer o trabalho custa nada e não drifta.

---

## 8. Depois desta versão

- Tema claro, agora que a camada semântica torna isso uma troca de rampa
- Ícones SVG no lugar dos glifos
- Atalhos de teclado e navegação por teclado na árvore
- Diff e status da worktree como UI, não só terminal
- Campos de agregação no servidor, se a contagem derivada no cliente virar gargalo
