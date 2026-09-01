# O rodapé aberto por padrão — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 3 perguntas · **0 respondidas**.

---

### [ ] Q1 — Com que altura ele nasce?

Hoje o padrão é **metade da janela** — escolhido para quem **abriu** o rodapé de propósito, para ler
a saída de um `pnpm dev`. Nascer assim é outra coisa: a árvore de arquivos apareceria pela metade
para quem nunca pediu o rodapé.

Três leituras: metade (o de hoje); uma **altura de leitura** fixa (~200px: cabeçalho, estado, porta e
as últimas linhas); ou **duas alturas** — nasce baixo, e a primeira vez que alguma coisa roda ele
sobe para a metade.

**Proposta pra reagir:** **altura de leitura**, e a pessoa arrasta. A terceira opção é um rodapé que
se mexe sozinho, e coisa que se mexe sozinha na tela é o que se aprende a não olhar.

**Custo de esperar:** trava a feature — é a decisão inteira.

**R:**

---

### [ ] Q2 — A coluna direita salta para 640px no primeiro contato?

A `RUN_DOCK_PANEL_WIDTH = 640` existe porque um terminal de 80 colunas não cabe em 360. Se o rodapé
nasce aberto, ou a coluna nasce com 640 (e come o painel central para todo mundo), ou o terminal
nasce estreito.

**Proposta pra reagir:** o piso de 640 só se aplica quando a pessoa **abre** o rodapé ou quando algo
começa a **rodar** nele. Aberto por padrão, com altura de leitura e sem terminal anexado, não precisa
de 80 colunas — precisa mostrar estado e porta.

**Custo de esperar:** trava a feature junto com a Q1: as duas são a mesma conta de espaço.

**R:**

---

### [ ] Q3 — Aberto por padrão vale para o checkout que não declara `[scripts]`?

Um projeto sem `[scripts]` no `project.toml` não tem `setup` nem `run` — o rodapé aberto ali mostra
um vazio com um convite (*"peça ao agente para escrever"*).

**Proposta pra reagir:** **sim, vale.** É onde a promessa da feature mais aparece: é o único lugar do
produto que diz que este repositório não sabe se levantar, e escondê-lo atrás de um clique é como
não tê-lo.

**Custo de esperar:** baixo.

**R:**
