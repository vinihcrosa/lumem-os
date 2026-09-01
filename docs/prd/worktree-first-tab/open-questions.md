# A worktree como primeira aba — perguntas

**PRD:** [prd.md](prd.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Protótipo:** `packages/web/prototype/lumem-worktree-tab.html`. Ele **desenha** a proposta de cada
pergunta em vez de descrevê-la — a Q1 nos §6 A–D, a Q2 no §7, a Q3 no §3, a Q5 no §5.

**Estado:** 5 perguntas · **5 respondidas**.

> **Como elas foram respondidas, 2026-09-01.** Eu tinha parado com a Q1 e a Q5 travando a
> implementação, e o Vinicius mandou implementar tudo. Então **cada uma foi decidida pela proposta que
> já estava escrita e desenhada** — nenhuma resposta inventou caminho novo, e a única que mudou de
> forma foi a Q1, porque o código desmentiu o argumento dela antes de virar linha. Isto está escrito
> aqui, e não só no commit, porque decisão tomada por default é a que volta como pergunta.

A Q1 é herdada da
[pull-request-status](../pull-request-status/open-questions.md) (lá é a **Q11**) e passa a ser desta
feature, porque é esta que causa o problema.

---

### [x] Q1 — Com uma aba de sessão na frente, o que a worktree ainda diz?

Hoje o cabeçalho fixo diz sempre: branch, sujeira, caminho. Virando aba, some quando outra aba está
em foco. Três leituras:

- **só o ponto na aba** — mínimo, e obriga a clicar para saber qual branch é;
- **ponto na aba + branch escrita no caminho acima** (`… / pr-bar`) — o caminho já mostra o nome do
  checkout, e nesta versão nome e branch são a mesma string;
- **uma linha fina de estado** entre o caminho e as abas — resolve, e é exatamente o cabeçalho de
  volta, só que mais magro.

**Proposta pra reagir:** **ponto na aba + caminho, com o caminho escrevendo a branch quando ela
diverge do nome** (a B′ abaixo). A terceira opção é a primeira versão renomeada, e a razão de mover
era ganhar a altura de volta.

**Custo de esperar:** trava a implementação — é a diferença entre a coluna ter dois andares acima do
conteúdo ou três.

**O que o desenho acrescentou (§6):** A e B saem **idênticas** na tela. O argumento de B é que, no
caminho padrão, o nome do checkout e o nome da branch são a mesma string e o caminho já a escreve —
então B não pede um pixel a mais que A.

**E o que o código desmentiu.** Esse "padrão" não é regra. O
`components/worktree-ui.test.tsx:97` já prova o contrário — uma worktree chamada `outra` com a branch
`feature/outra`, e a sidebar imprime as duas quando divergem. O `crumb__here` imprime o **nome**.
Então B perde a branch exatamente no caso em que ela importa: worktree importada, ou clonada de fora
pela [project-from-url](../project-from-url/prd.md). O caso está desenhado no **§6 D** do protótipo, e
com ele a pergunta ganha uma quarta leitura:

- **B′ — ponto + caminho, e o caminho escreve a branch quando ela diverge.** Custa uma linha de
  lógica, nenhum pixel no caso comum, e mantém a promessa em vez de assumi-la. É o que eu proponho
  agora, no lugar de B.

A alternativa barata seria pôr a branch no `title` da aba, mas informação que só existe em `title` não
existe para quem não usa mouse.

**R: a leitura B′ — ponto na aba, e o caminho escreve a branch quando ela diverge do nome.**
Decidida em 2026-09-01, com a forma que o §6 D obrigou: a B pura assumia que nome e branch são a mesma
string, e o `worktree-ui.test.tsx:97` já provava o contrário. Implementada no `WorktreePanel`, onde a
condição é uma linha (`branch !== name`) e o comentário diz por quê. A alternativa barata — a branch só
no `title` da aba — foi recusada: informação que só existe em `title` não existe para quem não usa
mouse.

---

### [x] Q2 — O `▤ arquivos` fica na barra de abas ou no cabeçalho da própria coluna?

A anotação diz que ele não é do topo do app. Sobram dois lugares: a barra de abas do checkout, ou o
`✕`/`⟳` que a própria coluna direita já tem.

**Proposta pra reagir:** **na barra de abas.** A coluna já sabe se fechar por dentro (o `✕` dela); o
que falta é onde **reabrir**, e isso tem que existir quando ela não está na tela.

**Custo de esperar:** trava um desenho pequeno, mas é o desenho da peça nova.

**O que o desenho acrescentou (§7):** os dois lugares desenhados **com a coluna fechada**, que é o
único estado em que eles diferem. No cabeçalho da coluna, não sobra controle nenhum na tela — beco sem
saída. O `✕` da coluna continua existindo nos dois casos; o que ele não pode ser é o único.

**R: na barra de abas.** Decidida em 2026-09-01 pelo argumento que o §7 desenhou e que nenhuma
descrição substituiu: com a coluna fechada, o cabeçalho dela **não existe**, e um interruptor que só
existe enquanto está ligado é um botão de desligar. O `✕` da coluna continua lá — fechar por dentro é o
gesto de quem está olhando para ela.

---

### [x] Q3 — A aba do checkout se chama pelo nome dele, ou `worktree`?

Nome (`pr-bar`) repete o que o caminho logo acima já diz. `worktree` é genérico mas não repete.

**Proposta pra reagir:** **o nome**, com o losango. A barra de abas é lida sozinha quando se procura
uma aba, e a única aba sem `✕` merece ser identificável sem subir os olhos.

**Custo de esperar:** baixo.

**O que o desenho acrescentou (§3):** a aba é a única da faixa sem `✕`, e a faixa é lida sozinha
quando se procura uma aba. O glifo do escopo carrega o "que tipo", o nome carrega o "qual" — e o
ponto âmbar ao lado carrega a sujeira, que é a informação que some quando outra aba está na frente.

**R: o nome, com o glifo do escopo.** Decidida em 2026-09-01. E a implementação achou uma prova a
mais que o desenho não previa: a spec `session-record` chama a worktree dela de `registro`, que é
também a nota da aba de uma sessão morta — o localizador casou com as duas. A colisão é a etiqueta
fazendo trabalho de verdade em dois lugares, que é exatamente o argumento de dar nome à aba.

---

### [x] Q4 — A coluna de arquivos aberta é estado do app ou do checkout?

Hoje é do app: um `useRightPanel` global, com o estado em `localStorage`. Mudando o botão de lugar, a
pergunta natural é se cada checkout deveria lembrar do seu.

**Proposta pra reagir:** **continua do app.** Mover o botão é sobre onde a ação mora, não sobre
quantos estados existem — e uma coluna que abre e fecha sozinha ao trocar de worktree é pior que uma
que fica onde você deixou.

**Custo de esperar:** nenhum para o v1; a mudança de dono seria refactor depois.

**R: continua do app.** Decidida em 2026-09-01, sem mudar nada: o `useRightPanel` segue único, com o
valor em `localStorage`. O botão mudou de lugar, não de dono. O `App` passa o interruptor para os dois
painéis e eles o entregam à faixa de abas — plumbing em vez de um segundo estado, porque duas fontes
para "a coluna está aberta" é o bug que ninguém consegue reproduzir.

---

### [x] Q5 — O `local` do projeto ganha o mesmo tratamento?

O `LocalPanel` tem o mesmo cabeçalho e o mesmo `ScopePanel`. Ele é um checkout, mas não é uma
worktree.

**Proposta pra reagir:** **sim, o mesmo tratamento**, com o glifo `▭` e o nome `local`. Duas
gramáticas para dois checkouts que se alternam na mesma coluna seria a inconsistência que a feature
existe para tirar.

**Custo de esperar:** trava metade dos testes de `LocalPanel`.

**O que o desenho acrescentou (§5):** as diferenças que sobram são as de verdade — glifo `▭`, sem base
nem distância (ele **é** a base), e nenhuma ação destrutiva, porque remover o local seria remover o
projeto, e isso é outra tela.

**R: sim, o mesmo tratamento.** Decidida em 2026-09-01. As diferenças que sobraram são as de verdade:
glifo `▭`, sem base nem distância (ele **é** a base) e sem estado da árvore (o daemon reporta status da
worktree que criou, não do repositório que apenas registrou). E o desenho errava num ponto, corrigido
no protótipo e não no código: o `local` **tem** ação destrutiva — `remover projeto` —, e ela não
confirma em banner como a da worktree; abre uma tela própria, porque para um projeto clonado ela apaga
o diretório.

