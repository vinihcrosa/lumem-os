# PRD — O rodapé de execução nasce aberto

> **Status:** v1.0 — **completa em 2026-09-01**: desenhada, decidida e implementada em quatro tasks.
> Uma anotação do
> agentation sobre o `FoldedDock`: *"isso deveria ser por default
> aberto"*
> **Perguntas:** [open-questions.md](open-questions.md) — **5 de 5 respondidas**
> **Tasks:** [tasks.md](tasks.md) — **4 de 4 entregues**
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
sem que a coluna direita salte de largura na cara de quem chegou.

*(A primeira versão desta frase pedia também "sem empurrar a árvore de arquivos para fora da tela".
Ela saiu quando a [Q1](open-questions.md) foi medida: metade da coluna deixa a árvore com 11 das 16
linhas, não com duas. A árvore paga três linhas, e não meia tela.)*

## 2. O que o padrão de hoje custa, e o que mudá-lo custa

**Hoje:** `useRunDock` lê o `localStorage` e cai em `{ open: false, height: metade da janela }`. A
primeira sessão de qualquer pessoa começa fechada, e a tira recolhida mostra só um resumo.

**A conta de mudar** tem três parcelas, e nenhuma é zero:

| Parcela | O quê |
|---|---|
| **largura** | a `RUN_DOCK_PANEL_WIDTH` sobe a coluna direita para **640px** enquanto o rodapé está aberto — um terminal de 80 colunas não cabe em 360. Nascer aberto quer dizer nascer com a coluna larga, e a coluna larga come o painel central |
| **altura** | o padrão é **metade da janela**. Aberto de saída, a árvore de arquivos nasce com metade da coluna |
| **processo** | abrir o rodapé não roda nada — mas anexa o terminal da sessão viva, se houver, e a aba padrão é `Run` |

A terceira é barata. As duas primeiras eram o assunto — e a resposta, em 2026-09-01, foi que **as
duas custam menos do que esta PRD supôs**:

- **a altura** fica em metade da janela, a mesma de hoje ([Q1](open-questions.md)). Medido no
  desenho: com a mesma lista de 16 arquivos, a árvore mostra 16 linhas com o rodapé recolhido, 14
  com uma altura de leitura de 192px e **11 com metade**. Três linhas de diferença não pagam um
  segundo número de altura no produto;
- **a largura** fica em 360px, e nada a alarga sozinho ([Q2](open-questions.md),
  [Q5](open-questions.md)). O piso de 640 continua exatamente onde está: no `toggle`. Chegar não é
  `toggle`, então chegar não alarga.

**O que essa segunda decisão realmente compra e vende** só ficou claro ao desenhar, porque a unidade
estava errada. A saída do rodapé é `xterm` com `FitAddon`, e o daemon **redimensiona o PTY** para as
colunas do painel (`Terminal.tsx:124`): 360px são **~45 colunas**, e é isso que os processos são
informados que têm. O preço não é "texto dobrado" — é `turbo` gastando 18 colunas no prefixo
`@lumem/web:dev:` e sobrando 27, e `vitest` desenhando em 80 uma tabela que tem 45. **Aceito**: os
280px do painel central que o piso de 640 cobraria de todo mundo valem mais que 80 colunas que
ninguém pediu ainda.

## 3. Escopo

**F1.1** O padrão de `useRunDock`, quando não há nada em `localStorage`, passa a ser **aberto**.
**F1.2** A preferência continua sendo lembrada: quem fecha, encontra fechado na próxima vez. O padrão
é o **primeiro** contato, não uma regra que sobrepõe a pessoa.
**F1.3** ~~A altura inicial deixa de ser metade da janela.~~ **Cortada em 2026-09-01**
([Q1](open-questions.md)): a altura fica em metade da janela, exatamente como hoje. `defaultHeight`,
`clampHeight`, `maxHeight` e `RUN_DOCK_MIN_HEIGHT` não mudam.
**F1.4** A largura da coluna no primeiro contato **não salta — e nada precisa ser escrito para isso**
([Q2](open-questions.md), [Q5](open-questions.md)). O piso de 640 já é aplicado só no `toggle`
(`App.tsx:283`); o rodapé nascer aberto significa que o primeiro `toggle` não acontece, e a coluna
fica nos 360px. Nenhum gatilho novo entra.
**F1.5** O `FoldedDock` **continua existindo**. Ele é o estado de quem fechou, e é o que diz que há
algo rodando ali sem ocupar altura.

### Fora de escopo

- Rodar `setup` ou `run` sozinho ao abrir. O rodapé mostra; quem manda rodar é a pessoa — e a
  [project-scripts](../project-scripts/prd.md) já pôs um portão de confiança na frente disso.
- Mudar as abas do rodapé, ou o que cada uma faz.

## 4. O que o desenho mudou nesta PRD

O [protótipo](../../../packages/web/prototype/lumem-run-dock-open.html) — seis quadros, feitos no
Open Design e renderizados — desenhou os três estados da chegada e **um quadro por pergunta**. Ele
não escolheu: pôs o custo na tela com números medidos, e as cinco respostas vieram do Vinicius em
2026-09-01. Duas dessas respostas **encolheram a feature**, e uma coisa que o desenho propôs
sobreviveu:

**F1.6 — os dois botões de ação descem para a linha de estado.** Medido, não estimado: a faixa
completa do rodapé mede **494px**, e numa coluna de 360 ela estoura em 134. O que estoura são
`Abrir :porta` e `parar` — tirando esses dois, chevron + quatro abas + `＋` cabem. Eles vão para a
linha de estado, onde são lidos junto com o estado que os justifica. É a **única** mudança de layout
que a feature exige, e ela existe porque a coluna fica em 360.

**Em qualquer largura** ([Q6](open-questions.md)): um layout só, sem `@container` e sem uma segunda
posição para `parar`. Em 640px sobra espaço na linha, e o que entra é o comando mais a proveniência da
porta — as duas coisas que em 360 são as primeiras a sair.

**F1.7 — não existe.** *(era: "a saída dobra enquanto a coluna está estreita")* A saída do rodapé é
`xterm` com `FitAddon`. Ele reflui sozinho e o daemon redimensiona o PTY junto — a dobra não é nossa
para escolher, e não há CSS a escrever. O que a decisão da [Q2](open-questions.md) aceitou é o
número: **~45 colunas** na chegada.

**F1.8 — a saída vazia mostra o que o daemon já sabe.** Retângulo escuro sem uma linha dentro é o
desenho de *"algo quebrou"*, não de *"ainda não começou"*. Antes de qualquer processo, no lugar do
terminal vazio: que nunca rodou aqui, as portas reservadas para este checkout, e quando o setup
passou. É a **mesma área** — quando o run começa, o terminal toma o lugar. Sobreviveu porque é
exatamente o que a chegada tem para mostrar quando não há saída.

**F1.9 — não existe.** *(era: "o vazio que ensina ganha versão de chegada")* Ele só era necessário
para uma altura de leitura de 192px. Com metade da coluna o bloco de `[scripts]` cabe inteiro, com as
oito linhas de TOML e os botões — e é um estado a menos para manter.

## 5. Como se prova

- `localStorage` vazio → o rodapé está aberto ao entrar num checkout;
- fechar, recarregar → continua fechado (a preferência ganha do padrão);
- com o rodapé aberto de saída, a árvore de arquivos ainda mostra pelo menos os primeiros arquivos
  sem rolar;
- o teste que hoje afirma o padrão fechado é **reescrito**, não apagado: ele passa a afirmar o padrão
  novo, e o motivo antigo vira comentário do que mudou;
- entrar numa worktree **não** alarga a coluna: o `localStorage` vazio dá rodapé aberto e coluna em
  360px, e nem reconciliar um `run` de pé nem mandar rodar mexem nisso (F1.4, [Q2](open-questions.md),
  [Q5](open-questions.md));
- abrir o rodapé pelo chevron, depois de ter fechado, **continua** subindo o piso para 640 — o
  comportamento de hoje não regride;
- numa coluna de 360px a faixa não estoura: `Abrir :porta` e `parar` aparecem na linha de estado, e
  nenhum controle sai da tela (F1.6);
- numa worktree que nunca rodou, o corpo do `Run` **não** é um terminal vazio: mostra comando,
  portas do checkout e o último setup (F1.8).
