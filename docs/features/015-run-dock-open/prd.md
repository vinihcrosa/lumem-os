# PRD — O rodapé de execução nasce aberto

> **Status:** v0.2 — **7 perguntas respondidas**, escopo fechado. Nasceu de uma anotação do
> agentation sobre o `FoldedDock`: *"isso deveria ser por default aberto"*
> **Perguntas:** [open-questions.md](open-questions.md) — as seis primeiras no Open Design em
> 2026-09-01; a **Q6 revertida em 2026-09-06**, antes do código
> **Tasks:** [tasks.md](tasks.md)
> **Sucede:** [project-scripts](../012-project-scripts/prd.md), que construiu o rodapé e o fez nascer
> **fechado**
> **Desenho:** o `lumem-run-dock.html` já desenha os dois estados. Esta feature escolhe qual deles é
> o primeiro que se vê

---

## 1. O problema, em uma frase

**A coisa que o rodapé responde é a que se pergunta ao chegar — e ela chega escondida.**

A [project-scripts](../012-project-scripts/prd.md) resolveu "o Lumem cria worktrees que não rodam": há
`setup`, `run`, `test` e um terminal, abaixo da árvore de arquivos. Mas o rodapé nasce **recolhido**
numa tira (`FoldedDock`), então a primeira coisa que se faz ao abrir um checkout é abri-lo — e a
pergunta que ele responde, *"minha aplicação está de pé, e em que porta?"*, é a primeira que se faz
ao chegar numa worktree, não a décima.

**Critério de sucesso em uma frase:** entrar numa worktree e já ver o estado do `run` — sem clique —,
sem que isso empurre a árvore de arquivos para fora da tela nem faça a coluna direita saltar de
largura na cara de quem chegou.

## 2. O que o padrão de hoje custa, e o que mudá-lo custa

**O que era:** `useRunDock` lia o `localStorage` e caía em `{ open: false, height: metade da janela }`.
A primeira sessão de qualquer pessoa começava fechada, e a tira recolhida mostrava só um resumo.

**A conta de mudar** tinha três parcelas, e a resposta das duas primeiras foi a mesma: **a conta já
estava paga.** O que se descobriu medindo é que nenhuma das duas parcelas era o que a prosa acima
supunha:

| Parcela | O quê |
|---|---|
| **largura** | a `RUN_DOCK_PANEL_WIDTH` sobe a coluna para **640px** — mas ela sobe **no `toggle`**, e chegar não é um `toggle`. Nascer aberto é nascer **sem nunca ter passado por ele**: a coluna fica nos 360px de sempre, e o terminal chega com ~45 colunas ([Q2](open-questions.md), [Q4](open-questions.md)) |
| **altura** | metade da coluna. Medido no desenho, numa coluna de 576px: a árvore mostra **11 das 16 linhas** em vez de 16 — não a metade inútil que esta PRD supunha. A alternativa (altura de leitura fixa) valia **três linhas** e custava um segundo número de altura ([Q1](open-questions.md)) |
| **processo** | abrir o rodapé não roda nada — mas anexa o terminal da sessão viva, se houver, e a aba padrão é `Run` |

**As três parcelas saíram de graça**, e é isso que faz esta feature ser uma linha de código: o
`fallback` do `useRunDock`, de `open: false` para `open: true`.

## 3. Escopo

**F1.1** O padrão de `useRunDock`, quando não há nada em `localStorage`, passa a ser **aberto**.
**F1.2** A preferência continua sendo lembrada: quem fecha, encontra fechado na próxima vez. O padrão
é o **primeiro** contato, não uma regra que sobrepõe a pessoa.
**F1.3** A altura inicial **não muda**: `defaultHeight()`, o clamp, o teto e o piso ficam como estão
([Q1](open-questions.md)). Um segundo número de altura no produto é o que a resposta recusou.
**F1.4** A largura da coluna no primeiro contato **não salta**, e nenhum gatilho novo é criado para
isso — o piso de 640 continua só no chevron e na alça ([Q2](open-questions.md),
[Q5](open-questions.md)).
**F1.5** O `FoldedDock` **continua existindo**. Ele é o estado de quem fechou, e é o que diz que há
algo rodando ali sem ocupar altura.

### Fora de escopo

- Rodar `setup` ou `run` sozinho ao abrir. O rodapé mostra; quem manda rodar é a pessoa — e a
  [project-scripts](../012-project-scripts/prd.md) já pôs um portão de confiança na frente disso.
- Mudar as abas do rodapé, ou o que cada uma faz.
- **A faixa.** O desenho propôs descer os botões de ação para a linha de estado, apertar a faixa e
  criar um `⋯`; foi **recusado** ([Q6](open-questions.md)). Uma feature chamada "o rodapé nasce
  aberto" que reorganiza a faixa é duas features com um nome só.
- **A saída vazia informativa** — o quadro 1 do desenho troca o retângulo vazio pelo que o daemon já
  sabe (comando, portas reservadas, último setup). É certo, e é de outra feature: foi para o
  [backlog](../../project/backlog.md).

## 4. Como se prova

- `localStorage` vazio → o rodapé está aberto ao entrar num checkout;
- fechar, recarregar → continua fechado (a preferência ganha do padrão);
- com o rodapé aberto de saída, a árvore de arquivos ainda mostra os primeiros arquivos sem rolar;
- **a coluna continua em 360px** ao chegar, e mandar rodar não a alarga — só o chevron e a alça;
- o comentário que hoje justifica o padrão fechado é **reescrito**, não apagado: ele passa a dizer o
  padrão novo, e o motivo antigo fica registrado como o que mudou.
