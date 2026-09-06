# O rodapé aberto por padrão — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 7 perguntas · **7 respondidas**.

As seis primeiras foram respondidas **no Open Design em 2026-09-01**, com o desenho ao lado da
alternativa recusada — a folha é a `lumem-run-dock-open.html`. A **Q6 foi revertida em 2026-09-06**,
antes de qualquer linha de código, e a folha foi reescrita para registrar isso: é a regra de
[design-source-of-truth](../../project/design-source-of-truth.md), e ela não permite o contrário.

---

### [x] Q1 — Com que altura ele nasce?

Hoje o padrão é **metade da janela** — escolhido para quem **abriu** o rodapé de propósito, para ler
a saída de um `pnpm dev`. Nascer assim é outra coisa: a árvore de arquivos apareceria pela metade
para quem nunca pediu o rodapé.

Três leituras: metade (o de hoje); uma **altura de leitura** fixa (~200px: cabeçalho, estado, porta e
as últimas linhas); ou **duas alturas** — nasce baixo, e a primeira vez que alguma coisa roda ele
sobe para a metade.

**Proposta pra reagir:** **altura de leitura**, e a pessoa arrasta. A terceira opção é um rodapé que
se mexe sozinho, e coisa que se mexe sozinha na tela é o que se aprende a não olhar.

**R (2026-09-01, contra a proposta):** **metade — a altura que já existe.** O quadro 3 da folha
desenhou as três alturas na mesma coluna de 576px, com a mesma lista de 16 arquivos, e **mediu**: 16
linhas de árvore com o rodapé recolhido, **14** com a altura de leitura, **11** com metade. A
diferença entre a alternativa e o que já existe é de **três linhas** — e o preço da alternativa era
um **segundo número de altura** no produto: um para quem chega, outro para quem abre, e a pergunta
"por que ele mudou de tamanho?" para sempre. Três linhas de árvore não pagam isso.

A terceira leitura — nasce baixo e sobe quando algo roda — caiu junto, e por outro motivo: é a árvore
que você estava lendo encolhendo porque um processo subiu em outro canto. **`defaultHeight()`, o
clamp, o teto e o piso ficam exatamente como estão.**

---

### [x] Q2 — A coluna direita salta para 640px no primeiro contato?

A `RUN_DOCK_PANEL_WIDTH = 640` existe porque um terminal de 80 colunas não cabe em 360. Se o rodapé
nasce aberto, ou a coluna nasce com 640 (e come o painel central para todo mundo), ou o terminal
nasce estreito.

**Proposta pra reagir:** o piso de 640 só se aplica quando a pessoa **abre** o rodapé ou quando algo
começa a **rodar** nele.

**R (2026-09-01):** **a coluna fica em 360px, e nada a alarga sozinho.** O piso de 640 continua
exatamente onde já está: no `toggle`, em `App.tsx`. Chegar não abre — o rodapé **já estava** aberto
—, então chegar não alarga. Metade da proposta passou (o gatilho do chevron, que já existia) e a
outra metade caiu: **rodar não alarga** (Q5). **Nenhuma linha de código sai desta resposta.**

| | |
|---|---|
| **sobe para 640** | abrir o rodapé pelo chevron quando ele estava fechado (o que o `App.tsx` já faz) · arrastar a alça da coluna |
| **não sobe** | entrar na worktree · o daemon reconciliar um `run` de pé · trocar de worktree com o rodapé aberto · **mandar rodar** |
| **nunca desce** | coluna alargada é preferência lembrada; fechar o rodapé não a estreita de volta |

---

### [x] Q3 — Aberto por padrão vale para o checkout que não declara `[scripts]`?

Um projeto sem `[scripts]` no `project.toml` não tem `setup` nem `run` — o rodapé aberto ali mostra
um vazio com um convite (*"peça ao agente para escrever"*).

**Proposta pra reagir:** **sim, vale.** É onde a promessa da feature mais aparece: é o único lugar do
produto que diz que este repositório não sabe se levantar, e escondê-lo atrás de um clique é como
não tê-lo.

**R (2026-09-01, com a proposta):** **vale, e com o bloco intacto.** Com metade da coluna o vazio que
ensina cabe inteiro — as oito linhas de TOML e os dois botões. A versão compacta que o desenho havia
proposto para uma altura de leitura de 192px **caiu junto com a Q1**, e isso é uma economia: um
estado a menos para manter.

---

### [x] Q4 — O que "coluna estreita" custa, em unidade de verdade?

**R (2026-09-01):** não existe "texto dobrado". A saída do rodapé é `xterm` com `FitAddon`, e o
daemon **redimensiona o PTY** para as colunas que o painel tem — 360px são **~45 colunas**, e é isso
que os processos são informados que têm. O preço real é o `turbo` gastando 18 colunas no prefixo
`@lumem/web:dev:` e sobrando 27, e o `vitest` desenhando em 45 uma tabela feita para 80. **Aceito:**
os 280px de painel central que o piso de 640 cobraria de todo mundo, toda vez, valem mais que 80
colunas que ninguém pediu ainda.

---

### [x] Q5 — Mandar rodar alarga a coluna?

**R (2026-09-01):** **não. Rodar roda, e não mexe na tela.** Um gatilho a mais é uma coisa a mais que
se move sem gesto — e é justamente o defeito pelo qual a terceira leitura da Q1 foi recusada.

---

### [x] Q6 — Os botões de ação descem para a linha de estado?

O desenho mediu a faixa inteira — `⌄` + quatro abas + `＋` + os botões de ação — em **494px**, e a
coluna na chegada tem 360: estoura em 134. A folha propôs tirar dela o que não é leitura: os botões
descem para a **linha de estado**, o `＋` (gesto raro) vira item de um `⋯`, e a faixa ganha uma
variante compacta (`.dock__bar--tight`) — **em qualquer largura**, para não haver dois lugares onde
`parar` pode estar.

**R (2026-09-01, com a proposta; revertida em 2026-09-06):** **nada desce. A faixa fica como está.**

O que derrubou não é gosto — é que a proposta paga por um gesto que **não existe**: o
`＋ nova aba de terminal` está no CSS portado (`.dock__new`) e o `RunDock.tsx` **nunca o renderiza**.
A aba `Terminal` é uma só. Construir o `⋯` seria construir um menu cujo único item desenhado ainda
não foi feito, e a `--tight` existe para abrir espaço para ele. Sem os três, a conta muda: `⌄` mais
as quatro abas cabem em 360 com folga.

E o escopo desta feature é o que a Q1 já dizia — **uma linha**. Uma feature chamada "o rodapé nasce
aberto" que reorganiza a faixa é duas features com um nome só.

**O que a reversão custa, dito:** com um `run` vivo numa coluna de 360px, a faixa carrega
`Abrir :55061` e `parar` além das abas, e fica apertada. Isso é verdade **hoje** também, para quem
abre o rodapé — a feature não cria o aperto, só o põe na frente de mais gente. Se ele incomodar, a
Q6a é onde a conversa volta.

---

### [x] Q6a — Então o `⋯`, o `＋` e a faixa compacta, quando?

**R (2026-09-06):** **quando o `＋ nova aba de terminal` existir** — que é o que dá conteúdo ao `⋯`.
Antes disso o menu nasceria com zero item e a `--tight` apertaria a faixa para caber nele. Foi para o
[backlog](../../project/backlog.md), junto com a saída vazia informativa do quadro 1, que é certa e é
de outra feature.
