# A worktree como primeira aba — perguntas

**PRD:** [prd.md](prd.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Protótipo:** `packages/web/prototype/lumem-worktree-tab.html`. Ele **desenha** a proposta de cada
pergunta em vez de descrevê-la — a Q1 no §6, a Q2 no §7, a Q3 no §3, a Q5 no §5. Desenhar não é
responder: a resposta continua sendo do Vinicius, e o campo `R:` continua vazio.

**Estado:** 5 perguntas · **0 respondidas**. A Q1 é herdada da
[pull-request-status](../pull-request-status/open-questions.md) (lá é a **Q11**) e passa a ser desta
feature, porque é esta que causa o problema.

---

### [ ] Q1 — Com uma aba de sessão na frente, o que a worktree ainda diz?

Hoje o cabeçalho fixo diz sempre: branch, sujeira, caminho. Virando aba, some quando outra aba está
em foco. Três leituras:

- **só o ponto na aba** — mínimo, e obriga a clicar para saber qual branch é;
- **ponto na aba + branch escrita no caminho acima** (`… / pr-bar`) — o caminho já mostra o nome do
  checkout, e nesta versão nome e branch são a mesma string;
- **uma linha fina de estado** entre o caminho e as abas — resolve, e é exatamente o cabeçalho de
  volta, só que mais magro.

**Proposta pra reagir:** **ponto na aba + caminho**. A terceira opção é a primeira versão renomeada,
e a razão de mover era ganhar a altura de volta.

**Custo de esperar:** trava a implementação — é a diferença entre a coluna ter dois andares acima do
conteúdo ou três.

**O que o desenho acrescentou (§6):** A e B saem **idênticas** na tela, e é esse o argumento — nesta
versão do produto o nome do checkout e o nome da branch são a mesma string, e o caminho já a escreve.
B não pede um pixel a mais que A; pede que a branch continue sendo o último segmento do caminho. O dia
em que worktree e branch puderem divergir, B deixa de valer de graça.

**R:**

---

### [ ] Q2 — O `▤ arquivos` fica na barra de abas ou no cabeçalho da própria coluna?

A anotação diz que ele não é do topo do app. Sobram dois lugares: a barra de abas do checkout, ou o
`✕`/`⟳` que a própria coluna direita já tem.

**Proposta pra reagir:** **na barra de abas.** A coluna já sabe se fechar por dentro (o `✕` dela); o
que falta é onde **reabrir**, e isso tem que existir quando ela não está na tela.

**Custo de esperar:** trava um desenho pequeno, mas é o desenho da peça nova.

**O que o desenho acrescentou (§7):** os dois lugares desenhados **com a coluna fechada**, que é o
único estado em que eles diferem. No cabeçalho da coluna, não sobra controle nenhum na tela — beco sem
saída. O `✕` da coluna continua existindo nos dois casos; o que ele não pode ser é o único.

**R:**

---

### [ ] Q3 — A aba do checkout se chama pelo nome dele, ou `worktree`?

Nome (`pr-bar`) repete o que o caminho logo acima já diz. `worktree` é genérico mas não repete.

**Proposta pra reagir:** **o nome**, com o losango. A barra de abas é lida sozinha quando se procura
uma aba, e a única aba sem `✕` merece ser identificável sem subir os olhos.

**Custo de esperar:** baixo.

**O que o desenho acrescentou (§3):** a aba é a única da faixa sem `✕`, e a faixa é lida sozinha
quando se procura uma aba. O glifo do escopo carrega o "que tipo", o nome carrega o "qual" — e o
ponto âmbar ao lado carrega a sujeira, que é a informação que some quando outra aba está na frente.

**R:**

---

### [ ] Q4 — A coluna de arquivos aberta é estado do app ou do checkout?

Hoje é do app: um `useRightPanel` global, com o estado em `localStorage`. Mudando o botão de lugar, a
pergunta natural é se cada checkout deveria lembrar do seu.

**Proposta pra reagir:** **continua do app.** Mover o botão é sobre onde a ação mora, não sobre
quantos estados existem — e uma coluna que abre e fecha sozinha ao trocar de worktree é pior que uma
que fica onde você deixou.

**Custo de esperar:** nenhum para o v1; a mudança de dono seria refactor depois.

**R:**

---

### [ ] Q5 — O `local` do projeto ganha o mesmo tratamento?

O `LocalPanel` tem o mesmo cabeçalho e o mesmo `ScopePanel`. Ele é um checkout, mas não é uma
worktree.

**Proposta pra reagir:** **sim, o mesmo tratamento**, com o glifo `▭` e o nome `local`. Duas
gramáticas para dois checkouts que se alternam na mesma coluna seria a inconsistência que a feature
existe para tirar.

**Custo de esperar:** trava metade dos testes de `LocalPanel`.

**O que o desenho acrescentou (§5):** as diferenças que sobram são as de verdade — glifo `▭`, sem base
nem distância (ele **é** a base), e nenhuma ação destrutiva, porque remover o local seria remover o
projeto, e isso é outra tela.

**R:**
