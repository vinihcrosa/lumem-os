# A barra da pull request — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 11 perguntas · **11 respondidas**. A Q2 foi decidida pelo Vinicius com a referência na
mão (v0.2 do PRD). As demais foram respondidas em **2026-09-05**, antes da implementação começar — e
uma delas **contra** a proposta escrita: a Q3 e a Q4 saíram para o lado da **escrita**, e isso muda o
§5 do PRD, o §4 e a fase 6 das tasks. Ver a nota no topo do [prd.md](prd.md).

---

### [x] Q1 — De onde vem o dado: o `gh` instalado, ou a API do host com um token nosso?

As duas leituras:

- **`gh` (e `glab`, e o que vier)**: autenticação já resolvida, no keychain da sua máquina; o Lumem
  nunca vê, guarda nem pede segredo; suporta GitHub Enterprise sem configuração nova. Custa um
  **processo por consulta** (centenas de ms), depende de um binário existir, e a saída `--json` é
  contrato de outro projeto, que pode mudar;
- **API direto, com token guardado pelo Lumem**: sem dependência de binário, mais rápido, controle
  fino de campos. Custa uma **superfície de segredo** — onde guarda, como cifra, o que faz no backup,
  o que vaza no log — e uma tela de configuração de token por host.

**Proposta pra reagir:** o `gh`. O motivo não é performance, é o §4.3 do PRD: *não guardar segredo* é
a maior parte da resposta de segurança desta feature, e ela sai de graça. O custo do processo se paga
com a consulta **por projeto** (F4.3) — oito worktrees custam um `gh`, não oito.

**Custo de esperar:** a feature inteira depende desta resposta; sem ela nada da fase 1 começa.

**R:** o `gh`.

**Decisão: o dado vem do `gh`, e o Lumem não guarda segredo nenhum.** O motivo é o do §4.3 do PRD —
*não guardar segredo* é a maior parte da resposta de segurança desta feature, e ela sai de graça. O
custo do processo se paga com a consulta **por projeto** (F4.3): o [spike](spike.md) mediu
`0,7 s` num repositório pequeno, para **todas** as PRs de uma vez.

O que a decisão **cobra**, e o spike encontrou: `gh` é contrato de outro projeto, e ele muda de
resposta conforme o estado da PR — `mergeable` volta `UNKNOWN` para PR fechada ou mesclada, e volta
resolvido para PR aberta. A tabela de veredito (P1) trata `UNKNOWN` como `pending` em vez de chutar,
e as fixtures da P0 congelam as duas formas.

---

### [x] Q2 — A barra fica acima do cabeçalho da worktree, ou dentro do painel direito?

A v0.1 deste PRD propunha **acima do cabeçalho**, com dois argumentos: o painel direito tem 360px com
três abas disputando, e ele **nasce colapsado** — um estado que só existe quando você abre uma coluna
fechada não é um estado de que você se lembra de olhar.

**R:** painel direito. E junto veio uma mudança maior: **a coluna do meio começa nas abas**, e a
primeira aba é a da worktree, com tudo o que hoje é cabeçalho fixo.

**Decisão: a barra mora no topo do painel direito, e o cabeçalho da worktree vira a primeira aba.**
Os dois argumentos da v0.1 não sumiram — viraram requisito:

- 360px foi respondido pelo desenho: a barra **empilha em duas linhas**, e a contagem das verificações
  virou o distintivo da aba `PR` em vez de disputar a mesma linha;
- o painel colapsado foi respondido pela F3.4: o **marcador na sidebar** deixou de ser enfeite e passou
  a ser o único sinal de PR que sobrevive ao painel fechado. Ele é, aliás, o que responde a pergunta
  que a feature existe para responder — qual das oito worktrees está pronta.

O que a decisão **cobra** está no §2.1 do PRD, escrito onde dói: com uma aba de sessão na frente,
branch e sujeira somem da vista.

---

### [x] Q3 — O botão `Merge` entra no v1?

A referência tem. O PRD não.

- **entra**: fecha o ciclo dentro do Lumem — e é honestamente a ação que você quer quando lê "pronta
  para merge". Custa: escrita no remoto, irreversível para o time, estratégia (`squash`/`rebase`/
  `merge`), confirmação, e o que fazer com a worktree depois (remover? avisar?);
- **não entra**: o `↗` te põe na PR, onde o botão já existe, com regra e confirmação do host.

**Proposta pra reagir:** não entra. O corte "ler, não agir" é o que faz esta feature caber numa
release; e o item do backlog que ela substitui avisava exatamente isso — *"o escopo mata quem tenta
fazer completo de primeira"*.

**Custo de esperar:** você continua indo ao navegador para mesclar — um clique a mais, no fim do
trabalho, e não no meio dele.

**R:** entra. **Contra a proposta**, e a decisão é do Vinicius, em 2026-09-05.

**Decisão: o `Merge` entra no v1, com portão.** O argumento que ganhou é o mesmo que justifica a
feature inteira: com oito worktrees em paralelo, a ida ao navegador é **por worktree**, e o fim do
trabalho é onde ela dói mais — a PR ficou verde, e a única coisa que falta é um clique que o Lumem
sabe dar.

O que a decisão **cobra**, e está escrito onde dói:

- a frase *"nenhum caminho desta feature escreve no remoto"* **deixa de ser verdade**. Ela era a
  parte mais barata da auditoria de segurança, e agora o §4 do PRD tem uma seção própria para a
  escrita;
- mesclar é **irreversível para o time inteiro**, então não é um clique: é um clique mais uma
  confirmação que diz o número, a base, a estratégia e o que acontece com a branch;
- a estratégia (`squash` / `rebase` / `merge`) é do **host**, não nossa — o Lumem oferece as que o
  repositório permite e não inventa nenhuma;
- o veredito continua sendo o portão: só PR com veredito `ready` oferece o botão. Vermelho e âmbar
  **não** oferecem, porque um merge forçado a partir de um estado que a barra pintou de vermelho é
  exatamente o modo de falha que a barra existe para evitar.

O que **continua fora**: reexecutar verificação, aprovar e comentar. Cada uma é uma superfície
própria, e nenhuma delas é o fim do trabalho.

---

### [x] Q4 — Sem PR, o botão **cria** a PR ou **abre a tela de comparação** do host?

- **criar** (`gh pr create`): um clique e a PR existe. Mas PR sem título pensado, sem corpo e sem
  reviewer é PR que alguém vai ter que editar — e uma tela de criação decente é feature própria;
- **abrir a comparação**: o Lumem monta a URL de `compare` com base e head e abre. Nada é escrito, e
  você cai na tela onde o host já pergunta título, corpo e reviewers.

**Proposta pra reagir:** abrir a comparação. Mesma linha da Q3, e mantém verdadeira a frase que faz a
feature simples de auditar: **nenhum caminho desta feature escreve no remoto**.

**Custo de esperar:** nenhum grande. Trocar depois é trocar a URL de destino por uma chamada.

**R:** cria. **Contra a proposta**, junto com a Q3.

**Decisão: o Lumem cria a PR, e a tela de comparação fica como saída.** Mesma linha da Q3: o
paralelismo é o que paga a feature, e abrir PR é o gesto que se repete **uma vez por worktree**.

O que a decisão **cobra**:

- criar PR precisa de **título e corpo**, e os dois vêm da tela — o que quebra a regra do §4.1 de
  que *nenhuma string de UI entra na linha de comando*. A regra não sumiu: ela ganhou a forma que
  aguenta o caso, no §4 do PRD — `--flag=valor` num **único** token de `argv` (nada de valor solto
  que possa ser lido como flag), corpo por **arquivo temporário** e não por argumento, e recusa de
  caractere de controle antes de qualquer coisa;
- PR sem título pensado continua sendo PR ruim, então o formulário **propõe** e não decide: o título
  nasce do último commit da branch, e o corpo nasce vazio;
- a branch precisa estar **publicada**, e publicar é `git push`, que é escrita no remoto também. O
  Lumem oferece publicar no mesmo gesto, dizendo que vai fazer isso;
- `abrir a comparação no GitHub ↗` **continua existindo** ao lado, para quem quer o formulário
  completo do host — reviewers, template, labels. O Lumem não reimplementa aquela tela.

---

### [x] Q5 — De quanto em quanto tempo consultar?

Poll é a única opção real: nem GitHub nem GitLab entregam webhook para uma máquina sem endereço, e
`gh` não tem *watch*.

**Proposta pra reagir:** `15s` com verificação rodando, `60s` sem, **pausado** com a janela oculta, e
backoff progressivo até `10min` depois de falha de rede. Com uma consulta por **projeto**, um dia de
trabalho com dois projetos abertos fica na casa de centenas de chamadas — longe do limite de 5.000/h
que o `gh` autenticado tem.

**Custo de esperar:** a fase 1 precisa de um número para o TTL; qualquer um serve para começar, e
mudar é uma constante.

**R:** a proposta, inteira.

**Decisão: `15s` com verificação rodando, `60s` sem, pausado com a janela oculta e pausado com o
painel colapsado, backoff progressivo até `10min` depois de falha.** O par "pausado" é o que faz a
conta fechar: painel fechado que continua consultando é processo gasto para ninguém ver, e o painel
**nasce** fechado. Os números são constantes num lugar só, porque mudá-los é mudar uma constante.

---

### [x] Q6 — Verificação **na fila** (`queued`) é âmbar ou neutra?

A tela hoje pinta âmbar junto com "rodando".

- **âmbar**: "tem coisa acontecendo" é uma categoria só, e a barra não muda de cor duas vezes seguidas;
- **neutra**: fila pode durar muito tempo em runner concorrido, e âmbar longo demais vira ruído.

**Proposta pra reagir:** âmbar. A pergunta que a barra responde é "dá pra mesclar?", e a resposta na
fila é a mesma de rodando: *ainda não se sabe*.

**R:** âmbar.

**Decisão: `queued` é âmbar, junto com `running`.** A pergunta que a barra responde é "dá pra
mesclar?", e a resposta na fila é a mesma de rodando: *ainda não se sabe*. Fila longa vira ruído
âmbar, e é um custo aceito — o alternativo é uma barra que muda de cor duas vezes no mesmo minuto.

---

### [x] Q7 — PR **fechada sem merge** merece qual tratamento?

Ela some da consulta de PRs abertas, e a worktree fica parecendo "sem PR" — o que é falso e sugere
abrir outra.

**Proposta pra reagir:** consultar também as fechadas recentes da branch e mostrar **neutro**, com
"fechada sem merge" e o `↗`. Custa incluir `--state all` na consulta, e um teto de idade para não
ressuscitar PR de meses atrás.

**R:** a proposta.

**Decisão: a consulta é `--state all`, e PR fechada sem merge aparece em neutro, com teto de idade.**
O teto existe para não ressuscitar PR de meses atrás: só a PR **mais recente** da branch é
considerada, e ela precisa ter sido atualizada dentro da janela. Sem isso, uma worktree reaproveitada
mostraria para sempre uma PR que ninguém lembra.

---

### [x] Q8 — Worktree cuja branch tem **duas** PRs abertas: qual delas a barra mostra?

Acontece com branch reaberta, com PR para `main` e para uma release, e com fork.

**Proposta pra reagir:** a mais recentemente atualizada, com um `+1` clicável ao lado do número que
troca qual está em foco. Nunca somar as duas num veredito só — isso produziria uma frase que não é
verdade sobre nenhuma delas.

**R:** a proposta.

**Decisão: a mais recentemente atualizada, com `+N` ao lado do número.** Nunca somar as duas num
veredito só — isso produziria uma frase que não é verdade sobre nenhuma delas. O `+N` diz que existe
mais, e o `↗` leva à que está em foco.

---

### [x] Q9 — O marcador na sidebar aparece em todas as worktrees, ou só nas que têm PR?

**Proposta pra reagir:** só nas que têm. Marcador cinza em cinco linhas ensina o olho a ignorar a
coluna inteira, e aí o vermelho da sexta chega tarde.

**R:** a proposta.

**Decisão: só as que têm PR ganham marcador.** Marcador cinza em cinco linhas ensina o olho a ignorar
a coluna inteira, e aí o vermelho da sexta chega tarde.

---

### [x] Q10 — A quarta aba do painel se chama `PR` ou `Verificações`?

Isto não é gosto: é régua. Com `Verificações`, as quatro abas somam ~352px numa faixa de ~348 úteis a
360px de painel — e a quarta fica atrás de uma barra de rolagem horizontal, que é o pior lugar
possível para o único aviso de que algo quebrou. Foi o que a renderização achou.

As saídas possíveis: encurtar o nome (`PR`), tirar a contagem da aba, deixar a faixa rolar, ou
renomear as abas que já existem.

**Proposta pra reagir:** `PR`. Cabe com folga, é o mesmo termo que a barra logo acima já usa (`#19`),
sobra espaço para a contagem — que é o que a pessoa procura —, e a aba fica com um nome que aguenta
crescer (se um dia ela mostrar mais coisa da PR além das verificações). O custo é a única palavra em
inglês da faixa, num produto que fala português.

**Custo de esperar:** o protótipo já está com `PR`; trocar depois é uma string e um teste.

**R:** `PR`.

**Decisão: a aba se chama `PR`.** O nome saiu da régua, não do gosto: com `Verificações` as quatro
abas somavam ~352px numa faixa de ~348 úteis a 360px, e a quarta ficava atrás de uma barra de
rolagem horizontal — o pior lugar possível para o único aviso de que algo quebrou. O custo é a única
palavra em inglês da faixa, e ele é aceito.

---

### [x] Q11 — Com uma aba de sessão na frente, o que a worktree ainda diz?

É a conta da Q2, e a única parte dela que ainda tem escolha. O `ScopePanel` de hoje mantém o cabeçalho
acima das abas exatamente para essa informação não se mexer.

- **nada além do ponto de sujeira** (a proposta): a faixa de abas fica limpa, e o resto está a um
  clique na primeira aba;
- **uma linha fina de estado** entre as abas e o conteúdo, com branch e sujeira: não some nunca, mas
  recria o cabeçalho que a mudança acabou de tirar, com outro nome;
- **chips na própria aba da worktree**, dentro do rótulo: cabe pouco e trunca cedo.

**Proposta pra reagir:** só o ponto na aba (sujeira) e o marcador na sidebar (PR). É pouco de
propósito: o valor da mudança é a coluna do meio virar uma coisa só, e reintroduzir uma faixa fixa
desfaz isso.

**Custo de esperar:** a F0 é a primeira fase; se a resposta for "linha fina", ela nasce junto e custa
pouco. Depois custa mexer duas vezes na mesma tela.

**R:** respondida **pela entrega**, e não por escolha: a
[worktree-first-tab](../018-worktree-first-tab/prd.md) foi implementada em 2026-09-01 com a proposta —
só o ponto de sujeira na aba do checkout.

**Decisão: só o ponto na aba (sujeira) e o marcador na sidebar (PR).** Nenhuma linha fina de estado
entre as abas e o conteúdo. Uma coisa que a entrega acrescentou e esta feature precisa saber: a aba
do checkout **já tem ponto**, então o sinal de PR na coluna do meio não pode ser um segundo ponto na
mesma aba — ele mora na sidebar, e só lá.
