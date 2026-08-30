# A barra da pull request — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 11 perguntas · **1 respondida**. A Q2 foi decidida pelo Vinicius com a referência na mão
(v0.2 do PRD). As Q1, Q3 e Q4 mudam o tamanho da feature; o resto é desenho.

---

### [ ] Q1 — De onde vem o dado: o `gh` instalado, ou a API do host com um token nosso?

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

**R:**

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

### [ ] Q3 — O botão `Merge` entra no v1?

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

**R:**

---

### [ ] Q4 — Sem PR, o botão **cria** a PR ou **abre a tela de comparação** do host?

- **criar** (`gh pr create`): um clique e a PR existe. Mas PR sem título pensado, sem corpo e sem
  reviewer é PR que alguém vai ter que editar — e uma tela de criação decente é feature própria;
- **abrir a comparação**: o Lumem monta a URL de `compare` com base e head e abre. Nada é escrito, e
  você cai na tela onde o host já pergunta título, corpo e reviewers.

**Proposta pra reagir:** abrir a comparação. Mesma linha da Q3, e mantém verdadeira a frase que faz a
feature simples de auditar: **nenhum caminho desta feature escreve no remoto**.

**Custo de esperar:** nenhum grande. Trocar depois é trocar a URL de destino por uma chamada.

**R:**

---

### [ ] Q5 — De quanto em quanto tempo consultar?

Poll é a única opção real: nem GitHub nem GitLab entregam webhook para uma máquina sem endereço, e
`gh` não tem *watch*.

**Proposta pra reagir:** `15s` com verificação rodando, `60s` sem, **pausado** com a janela oculta, e
backoff progressivo até `10min` depois de falha de rede. Com uma consulta por **projeto**, um dia de
trabalho com dois projetos abertos fica na casa de centenas de chamadas — longe do limite de 5.000/h
que o `gh` autenticado tem.

**Custo de esperar:** a fase 1 precisa de um número para o TTL; qualquer um serve para começar, e
mudar é uma constante.

**R:**

---

### [ ] Q6 — Verificação **na fila** (`queued`) é âmbar ou neutra?

A tela hoje pinta âmbar junto com "rodando".

- **âmbar**: "tem coisa acontecendo" é uma categoria só, e a barra não muda de cor duas vezes seguidas;
- **neutra**: fila pode durar muito tempo em runner concorrido, e âmbar longo demais vira ruído.

**Proposta pra reagir:** âmbar. A pergunta que a barra responde é "dá pra mesclar?", e a resposta na
fila é a mesma de rodando: *ainda não se sabe*.

**R:**

---

### [ ] Q7 — PR **fechada sem merge** merece qual tratamento?

Ela some da consulta de PRs abertas, e a worktree fica parecendo "sem PR" — o que é falso e sugere
abrir outra.

**Proposta pra reagir:** consultar também as fechadas recentes da branch e mostrar **neutro**, com
"fechada sem merge" e o `↗`. Custa incluir `--state all` na consulta, e um teto de idade para não
ressuscitar PR de meses atrás.

**R:**

---

### [ ] Q8 — Worktree cuja branch tem **duas** PRs abertas: qual delas a barra mostra?

Acontece com branch reaberta, com PR para `main` e para uma release, e com fork.

**Proposta pra reagir:** a mais recentemente atualizada, com um `+1` clicável ao lado do número que
troca qual está em foco. Nunca somar as duas num veredito só — isso produziria uma frase que não é
verdade sobre nenhuma delas.

**R:**

---

### [ ] Q9 — O marcador na sidebar aparece em todas as worktrees, ou só nas que têm PR?

**Proposta pra reagir:** só nas que têm. Marcador cinza em cinco linhas ensina o olho a ignorar a
coluna inteira, e aí o vermelho da sexta chega tarde.

**R:**

---

### [ ] Q10 — A quarta aba do painel se chama `PR` ou `Verificações`?

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

**R:**

---

### [ ] Q11 — Com uma aba de sessão na frente, o que a worktree ainda diz?

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

**R:**
