# Os scripts do projeto — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 11 perguntas · **11 fechadas** em 2026-08-30, e a fonte de cada uma está escrita:
**quatro pelo desenho aprovado** (S1, S3, S9, S11 — o `lumem-run-dock.html` desenha a resposta delas,
e ele foi aprovado) e **sete como proposta seguida** (S2, S4, S5, S6, S7, S8, S10 — nenhuma foi
contestada, e a implementação as segue). Proposta seguida não é o mesmo que pergunta debatida, e é
por isso que a diferença fica escrita: se alguma delas doer, o lugar de mudar é aqui.

---

### [x] S1 — O rodapé fica no painel direito mesmo?

A imagem que originou a feature é do Conductor, onde o painel de arquivos **é metade da janela**. No
Lumem o painel direito vai de **260 a 720 px** (`useRightPanel.ts`), e um terminal de 80 colunas quer
uns 640 — então o rodapé nasceria espremido no melhor caso e ilegível no comum.

Três leituras:

- **rodapé do painel direito**, como na imagem: o modelo mental é o certo ("o repo em cima, o que ele
  faz embaixo"), e o custo é subir o teto de largura do painel quando o rodapé está aberto;
- **rodapé do painel central**, atravessando a largura toda, abaixo da conversa: cabe sem negociar
  pixel, mas separa o `run` da árvore de arquivos — que é justamente a associação que a imagem faz;
- **aba de sessão**, como o shell já é hoje: custo zero de layout, e o `run` vira mais uma aba que
  compete com a conversa. É o que existe hoje, e é o que ninguém usa para isso.

**Proposta pra reagir:** rodapé do **painel direito**, como na imagem, com altura arrastável, e o teto
de largura do painel subindo enquanto ele estiver aberto. O modelo mental vale o ajuste de layout, e o
terminal do rodapé é para ler saída — não para trabalhar dentro dele o dia inteiro.

**Custo de esperar:** trava o desenho no Open Design, e com ele a feature inteira. É a primeira.

**R:** Aprovado o desenho, com o rodapé na coluna da direita.

**Decisão: rodapé do painel direito, e o teto de largura da coluna sobe enquanto ele está aberto.**
O modelo mental — o repositório em cima, o que ele faz embaixo — vale o ajuste de layout, e o quadro 2
do protótipo existe para registrar o que foi recusado: o painel central cabe sem negociar pixel e paga
com o significado. O terminal do rodapé é para **ler saída**, não para trabalhar dentro dele o dia
inteiro; quem quer isso tem a aba de sessão, que continua existindo.

---

### [x] S2 — O formato é `[scripts]` com três strings?

O §3.1 propõe três linhas. As alternativas existem e as duas referências deste repositório divergem:
o `.superset/config.json` usa **lista de comandos** por fase (`"setup": ["a", "b"]`); o
`.conductor/settings.toml` usa **string por fase** mais uma tabela de runs nomeados.

**Proposta pra reagir:** **string única por fase**, executada por `$SHELL -lc`. Quem precisa de dois
passos escreve um `.sh` — e um repositório que leva o Lumem a sério vai querer esse arquivo de
qualquer jeito, porque é ele que o Superset e o Conductor também chamam.

**Custo de esperar:** nenhum imediato — mas mudar de string para lista depois é migração de arquivo
commitado, no repositório de outra pessoa.

**R:** Sem contestação — segue a proposta.

**Decisão: string única por fase, executada por `$SHELL -lc`.** Quem precisa de dois passos escreve um
`.sh` — e um repositório que leva o Lumem a sério vai querer esse arquivo de qualquer jeito, porque é
ele que o Superset e o Conductor também chamam. O formato aceita crescer para tabela nomeada sem
migração, que é o que a S9 protege.

---

### [x] S3 — O setup roda sozinho quando a worktree nasce?

O Conductor e o Superset rodam. É o comportamento que faz "worktree nova já vem pronta" ser verdade —
e é a coisa que a §1 do PRD diz que falta.

Contra: é execução de script sem gesto, e a criação de worktree hoje é uma operação de segundos que
passaria a ser de minutos, com uma barra de progresso e um jeito de falhar.

**Proposta pra reagir:** roda sozinho, **em segundo plano**, e a worktree fica utilizável na hora. O
rodapé abre na aba `Setup` mostrando o que está acontecendo; a conversa com o agente não espera. Um
interruptor por projeto desliga isso.

**Custo de esperar:** entregar a feature sem isso é entregar o rodapé, não a promessa — a worktree
continua nascendo vazia, e você continua rodando setup na mão, só que agora dentro do produto.

**R:** Aprovado o desenho, que assume o setup automático.

**Decisão: roda sozinho quando a worktree nasce, em segundo plano.** A worktree fica utilizável na
hora e a conversa com o agente não espera. O preço está desenhado no quadro 3 e é o pior estado da
feature — worktree criada com setup quebrado —, e ele tem tela em vez de silêncio.

---

### [x] S4 — Setup que falha deixa a worktree criada?

Git criou o checkout, o registro entrou no banco, e o `pnpm install` saiu 1.

**Proposta pra reagir:** **a worktree fica.** Desfazer seria apagar diretório por causa de rede ruim,
e a `project-from-url` já ensinou o quanto apagar diretório é caro de acertar. O que muda é a tela: a
worktree aparece marcada como *"setup falhou"*, com o botão de rodar de novo ao lado — o mesmo lugar
onde a saída inteira está.

**Custo de esperar:** o pior estado da feature é justamente esse, e ele acontece na primeira vez que
alguém usa.

**R:** Sem contestação — segue a proposta, e o desenho já a mostra.

**Decisão: a worktree fica.** Desfazer seria apagar diretório por causa de rede ruim, e a
`project-from-url` já ensinou o quanto apagar diretório é caro de acertar. O que muda é uma **tira**
dentro da aba `Setup`, e não um diálogo: diálogo some e leva o motivo junto.

---

### [x] S5 — O Lumem reserva porta por checkout?

Sem isso, duas worktrees do mesmo projeto sobem na mesma porta e a segunda morre. Com isso, o Lumem
vira alocador de portas — e assume um problema que não é dele até o dia em que é.

O precedente é forte: o Conductor reserva **dez** portas por workspace e passa a primeira em
`CONDUCTOR_PORT`; o `scripts/workspace/env.sh` **deste repositório** lê exatamente essa variável, e
quando ela não existe deriva um par do hash do caminho. Ou seja: o problema já foi resolvido duas
vezes aqui dentro, por fora do produto.

**Proposta pra reagir:** reservar um **bloco de portas por checkout**, gravado (não sorteado a cada
run), exposto como `LUMEM_RUN_PORT` e `LUMEM_RUN_PORT_1..N`. Usar é opcional; ignorar não quebra nada.

**Custo de esperar:** o `run` só serve para uma worktree por vez — que é exatamente o cenário que o
Lumem existe para não ter.

**R:** Sem contestação — segue a proposta.

**Decisão: bloco de portas reservado por checkout, gravado, exposto como `LUMEM_RUN_PORT`.** Usar é
opcional e ignorar não quebra nada — mas sem isso duas worktrees do mesmo projeto sobem na mesma porta
e a segunda morre, que é exatamente o cenário que o Lumem existe para não ter. O precedente é o
`CONDUCTOR_PORT`, que o `scripts/workspace/env.sh` deste repositório já lê.

---

### [x] S6 — Como o `Abrir :PORTA` descobre a porta?

Três caminhos:

- **variável de ambiente** (**S5**): determinístico, e só
  funciona para o projeto que decidiu ler a variável;
- **regex na saída**: pega o `Local: http://127.0.0.1:55061/` do Vite e mais uns dez formatos comuns;
  erra em silêncio no resto, e "erra em silêncio" aqui significa abrir a porta errada;
- **inspecionar processos filhos** (`lsof`, árvore de PID): funciona sempre e é a mais cara — o PTY não
  entrega a árvore de processos de graça, e o comportamento muda entre macOS e Linux.

**Proposta pra reagir:** as duas primeiras. A variável quando o projeto a usa; a regex como atalho,
limitada aos primeiros N KB da saída depois do start, e com o botão dizendo **de onde** veio o número.
A terceira fica fora — está no §5 do PRD como não-objetivo.

**Custo de esperar:** o `run` fica sem o botão que é metade do valor dele.

**R:** Sem contestação — segue a proposta, e o desenho acrescentou uma coisa.

**Decisão: variável primeiro, regex como atalho, e a tela diz de onde veio o número.** A terceira via
— inspecionar processos filhos — fica fora. O acréscimo do desenho é a **proveniência escrita ao lado
do botão**: um botão que abre a porta errada é pior que não ter botão, e dizer de onde saiu o número
é o que separa um erro legível de um mistério.

---

### [x] S7 — O `[scripts]` que vale é o da branch do checkout?

O arquivo é commitado, então **cada worktree tem o seu**. Uma branch que mexe no setup muda o setup só
dela — o que é a coisa certa, e também significa que trocar de branch pode trocar o comando que roda
sem ninguém avisar.

**Proposta pra reagir:** vale o do checkout, sempre, lido **na hora de rodar** — não em cache de quando
o projeto foi aberto. É a mesma semântica de qualquer script versionado, e a alternativa (o arquivo da
branch padrão valendo para todo mundo) mente exatamente para quem está mexendo nele.

**Custo de esperar:** decide onde o daemon lê o arquivo, então trava a primeira task de daemon.

**R:** Sem contestação — segue a proposta.

**Decisão: vale o `project.toml` do checkout, lido na hora de rodar.** É a semântica de qualquer
script versionado. A alternativa — a branch padrão valendo para todo mundo — mente exatamente para
quem está mexendo no arquivo.

---

### [x] S8 — Existe `teardown`, e ele roda quando?

O Superset e o Conductor têm (`archive` lá). Serve para derrubar container, liberar porta, apagar
volume — coisas que sobrevivem à worktree e que ninguém lembra de limpar.

**Proposta pra reagir:** existe, roda na **remoção da worktree**, com timeout curto, e **falha dele não
impede a remoção** — a alternativa é uma worktree que você não consegue apagar por causa de um script
que quebrou.

**Custo de esperar:** baixo. É a única das três fases que dá para adiar sem furar a promessa da
feature.

**R:** Sem contestação — segue a proposta.

**Decisão: existe, roda na remoção da worktree, com timeout curto, e falha dele não impede a
remoção.** Worktree que não se apaga por causa de um script quebrado é pior que a sujeira que o script
ia limpar.

---

### [x] S9 — Um script de run, ou vários nomeados?

O Conductor tem vários (`[scripts.run.dev]`, com ícone e `default`). O caso real deste repositório é
um só. O caso real de um monorepo com API e front é dois.

**Proposta pra reagir:** **um agora**, com o formato preparado — `run = "…"` é o açúcar de
`[scripts.run] default = "dev"` no dia em que precisar. Um seletor de scripts numa faixa que ainda
nem foi desenhada é desenho de problema que não apareceu.

**Custo de esperar:** nenhum, se o formato aceitar crescer sem migração. Se não aceitar, o custo é
alto e chega tarde — e é por isso que a pergunta existe agora.

**R:** Aprovado o desenho, com um `run` só e sem seletor.

**Decisão: um agora, com o formato preparado.** `run = "…"` é o açúcar de `[scripts.run] default =
"dev"` no dia em que precisar — então crescer não é migração de arquivo commitado no repositório de
outra pessoa. Um seletor numa faixa que acabou de nascer é desenho de problema que não apareceu.

---

### [x] S10 — E o script que é só da minha máquina?

A regra do arquivo é clara — *"o que é do repositório é do time; o que é da instância é do Lumem"* —, e
a primeira pessoa que quiser um `run` diferente do time vai querer editar o TOML commitado. A regra
morre aí, em silêncio, se não houver outro lugar.

**Proposta pra reagir:** **fora do escopo agora, mas o lugar já nomeado**: sobrescrita por checkout no
**banco**, nunca no arquivo. Enquanto não existir, a resposta honesta na tela é *"o script vem do
repositório"* — e não um campo editável que grava no commit de alguém.

**Custo de esperar:** o risco do §10, e ele chega junto com o primeiro usuário que não seja o Vinicius.

**R:** Sem contestação — segue a proposta.

**Decisão: fora do escopo, com o lugar nomeado.** Sobrescrita por checkout mora no **banco**, nunca no
arquivo commitado. Enquanto ela não existir, a tela diz a verdade — *"o script vem do repositório"* —
em vez de oferecer um campo editável que grava no commit de alguém.

---

### [x] S11 — Projeto clonado de URL: o setup roda automático na primeira vez?

A [project-from-url](../project-from-url/prd.md) fez o Lumem clonar de uma string colada. Somando com a
**S3**, colar uma URL passaria a significar executar
um script de um estranho — o pior caminho possível para esta feature.

**Proposta pra reagir:** o `[scripts]` de um projeto **recém-clonado** nasce **não confiado**. A
primeira execução é sempre um gesto, com o comando visível — o mesmo padrão do `worktree.plan`, que já
mostra o comando de git antes de rodar. Depois disso, o automático da S3 vale.

**Custo de esperar:** não dá para esperar: se a S3 for implementada antes desta, a janela existe.

**R:** Aprovado o desenho, com "confiar neste projeto" como escolha por projeto.

**Decisão: o `[scripts]` de um projeto clonado nasce não confiado, e a confiança é por projeto nesta
máquina.** A primeira execução mostra o comando antes de rodar — o mesmo padrão do `worktree.plan` —
e volta a perguntar se o comando mudar. Perguntar a cada execução seria treinar o clique automático,
que é o oposto de uma proteção.
