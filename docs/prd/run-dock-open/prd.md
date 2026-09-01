# PRD — O rodapé de execução nasce aberto

> **Status:** v0.1 — nada implementado. Uma anotação do
> agentation sobre o `FoldedDock`: *"isso deveria ser por default
> aberto"*
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** ainda não escritas
> **Sucede:** [project-scripts](../project-scripts/prd.md), que construiu o rodapé e o fez nascer
> **fechado**
> **Desenho:** `packages/web/prototype/lumem-run-dock-open.html` — **seis quadros**, feitos no Open
> Design em 2026-09-01 e renderizados. O rodapé em si está inteiro no `lumem-run-dock.html`; esta
> folha desenha **a chegada**, que é uma conta de espaço e não uma preferência

---

## 1. O problema, em uma frase

**A coisa que o rodapé responde é a que se pergunta ao chegar — e ela chega escondida.**

A [project-scripts](../project-scripts/prd.md) resolveu "o Lumem cria worktrees que não rodam": há
`setup`, `run`, `test` e um terminal, abaixo da árvore de arquivos. Mas o rodapé nasce **recolhido**
numa tira (`FoldedDock`), então a primeira coisa que se faz ao abrir um checkout é abri-lo — e a
pergunta que ele responde, *"minha aplicação está de pé, e em que porta?"*, é a primeira que se faz
ao chegar numa worktree, não a décima.

**Critério de sucesso em uma frase:** entrar numa worktree e já ver o estado do `run` — sem clique —,
sem que isso empurre a árvore de arquivos para fora da tela nem faça a coluna direita saltar de
largura na cara de quem chegou.

## 2. O que o padrão de hoje custa, e o que mudá-lo custa

**Hoje:** `useRunDock` lê o `localStorage` e cai em `{ open: false, height: metade da janela }`. A
primeira sessão de qualquer pessoa começa fechada, e a tira recolhida mostra só um resumo.

**A conta de mudar** tem três parcelas, e nenhuma é zero:

| Parcela | O quê |
|---|---|
| **largura** | a `RUN_DOCK_PANEL_WIDTH` sobe a coluna direita para **640px** enquanto o rodapé está aberto — um terminal de 80 colunas não cabe em 360. Nascer aberto quer dizer nascer com a coluna larga, e a coluna larga come o painel central |
| **altura** | o padrão é **metade da janela**. Aberto de saída, a árvore de arquivos nasce com metade da coluna |
| **processo** | abrir o rodapé não roda nada — mas anexa o terminal da sessão viva, se houver, e a aba padrão é `Run` |

A terceira é barata. As duas primeiras são o assunto: **aberto por padrão não pode significar
"metade da janela e 640px de coluna" no primeiro contato.** Ver [Q1](open-questions.md) e
[Q2](open-questions.md).

## 3. Escopo

**F1.1** O padrão de `useRunDock`, quando não há nada em `localStorage`, passa a ser **aberto**.
**F1.2** A preferência continua sendo lembrada: quem fecha, encontra fechado na próxima vez. O padrão
é o **primeiro** contato, não uma regra que sobrepõe a pessoa.
**F1.3** A altura inicial deixa de ser metade da janela e passa a ser a **altura de leitura** — o
suficiente para ver o estado e as últimas linhas, sem tomar a árvore. Ver [Q1](open-questions.md).
**F1.4** A largura da coluna no primeiro contato não salta: ver [Q2](open-questions.md).
**F1.5** O `FoldedDock` **continua existindo**. Ele é o estado de quem fechou, e é o que diz que há
algo rodando ali sem ocupar altura.

### Fora de escopo

- Rodar `setup` ou `run` sozinho ao abrir. O rodapé mostra; quem manda rodar é a pessoa — e a
  [project-scripts](../project-scripts/prd.md) já pôs um portão de confiança na frente disso.
- Mudar as abas do rodapé, ou o que cada uma faz.

## 4. O que o desenho resolveu, e o que ele propôs de novo

O [protótipo](../../../packages/web/prototype/lumem-run-dock-open.html) desenha os três estados da
chegada — sem nada de pé, com run vivo, e sem `[scripts]` — mais um quadro por pergunta aberta. Ele
não escolhe sozinho: as respostas de [Q1](open-questions.md), [Q2](open-questions.md) e
[Q3](open-questions.md) continuam sendo do Vinicius. O que ele fez foi tirar as três da prosa e
**pôr o custo na tela**: as três alturas lado a lado, com o número de arquivos que sobram embaixo de
cada uma, e as duas larguras lado a lado, com o que cabe em cada uma.

Ao desenhar, apareceram quatro coisas que a PRD não tinha e que o escopo passa a incluir:

**F1.6 — a faixa de abas cabe em 360px.** Em 640 ela acomoda chevron + quatro abas + `＋` + os
botões de ação; em 360, não. A resposta não é encolher fonte até caber: o `＋` (gesto raro) vira item
de um `⋯`, e a **ação primária desce para a linha de estado** — onde ela é lida junto com o estado
que a justifica.

**F1.7 — a saída dobra enquanto a coluna está estreita.** `white-space: pre` em 360px corta a linha
do Vite no meio da URL, e o que some é justamente a porta. Com a coluna estreita a saída deixa de
ser um terminal fiel e passa a ser o resumo legível de um — e diz quantas linhas ficaram para trás,
em vez de deixar a rolagem ser a única pista.

**F1.8 — a saída vazia não fica preta e vazia.** Retângulo escuro sem uma linha dentro é o desenho de
*"algo quebrou"*, não de *"ainda não começou"*. Antes de qualquer processo ela mostra o que o daemon
já sabe: que nunca rodou aqui, as portas reservadas para este checkout, e quando o setup passou. É a
**mesma área** — quando o run começa, essas linhas são substituídas pela saída de verdade.

**F1.9 — o vazio que ensina ganha versão de chegada.** O bloco de `[scripts]` tem oito linhas de TOML
e foi desenhado para meia coluna. Em 192px, ou entra o exemplo ou entra a frase que explica; entra a
frase, e o exemplo fica atrás de um `ver o exemplo` que abre o rodapé inteiro. O clique que a chegada
economizou é devolvido a quem quiser — a diferença é que agora ele vem *depois* de já saber qual é o
problema, e não antes.

## 5. Como se prova

- `localStorage` vazio → o rodapé está aberto ao entrar num checkout;
- fechar, recarregar → continua fechado (a preferência ganha do padrão);
- com o rodapé aberto de saída, a árvore de arquivos ainda mostra pelo menos os primeiros arquivos
  sem rolar;
- o teste que hoje afirma o padrão fechado é **reescrito**, não apagado: ele passa a afirmar o padrão
  novo, e o motivo antigo vira comentário do que mudou;
- entrar numa worktree **não** alarga a coluna; clicar `Terminal`, abrir o rodapé ou mandar rodar
  alarga (F1.4, [Q2](open-questions.md));
- com a coluna em 360px, a linha do `Local: http://127.0.0.1:<porta>/` aparece **inteira** — dobrada
  se preciso, nunca cortada (F1.7);
- num checkout sem `[scripts]`, o bloco da chegada cabe na altura de leitura sem rolar, e
  `ver o exemplo` mostra o bloco original intacto (F1.9).
