# PRD — O rodapé de execução nasce aberto

> **Status:** v0.1 — nada implementado. Uma anotação do
> agentation sobre o `FoldedDock`: *"isso deveria ser por default
> aberto"*
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** ainda não escritas
> **Sucede:** [project-scripts](../project-scripts/prd.md), que construiu o rodapé e o fez nascer
> **fechado**
> **Desenho:** o `lumem-run-dock.html` já desenha os dois estados. Esta feature escolhe qual deles é
> o primeiro que se vê

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

## 4. Como se prova

- `localStorage` vazio → o rodapé está aberto ao entrar num checkout;
- fechar, recarregar → continua fechado (a preferência ganha do padrão);
- com o rodapé aberto de saída, a árvore de arquivos ainda mostra pelo menos os primeiros arquivos
  sem rolar;
- o teste que hoje afirma o padrão fechado é **reescrito**, não apagado: ele passa a afirmar o padrão
  novo, e o motivo antigo vira comentário do que mudou.
