# O modo da conversa — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **6 fechadas** em 2026-09-01, e a fonte de cada uma está escrita:
**duas pelo desenho** (Q2 e Q4 — o `lumem-session-mode.html` desenha a resposta delas), **três como
proposta seguida** (Q1, Q3, Q5 — nenhuma foi contestada, e a implementação as segue) e **uma achada
lendo o código** (Q6 — o desenho não a viu, o `AcpManager` sim).

> Proposta seguida não é o mesmo que pergunta debatida. A diferença fica escrita porque, se alguma
> delas doer, o lugar de mudar é aqui — e a Q1 é a que mais custa se estiver errada.

---

### [x] Q1 — A feature é de tela ou de política?

Duas leituras, e o custo entre elas é de uma ordem de grandeza:

- **só tela:** quando o agente não relata modos, a pílula aparece **desabilitada**, dizendo
  "este agente não oferece modos". Honesta, barata, e não resolve o que a anotação pediu;
- **tela + política:** o Lumem passa a ter modo próprio, que muda como o daemon responde a
  `session/request_permission`. É o que a anotação pede, e mexe no daemon.

**Proposta pra reagir:** **tela + política**, e a tela sozinha entra como primeira fase — ela já tira
o composer mudo do ar, e é o que se entrega enquanto as Q3 e Q4 não fecham.

**Custo de esperar:** trava a feature inteira.

**R:** **tela + política.** A anotação pediu *"poder selecionar o modo automático, se tá liberado, se
tem que perguntar tudo"* — três valores, e os três são política de permissão. Entregar só a tela seria
desenhar uma pílula que não faz nada, o que é pior que a barra muda: a barra muda pelo menos não
mente.

A fase 1 continua sendo a tela, mas **não como entrega parcial** — como ordem de construção. O
contrato e a pílula existem antes do daemon decidir qualquer coisa, e é isso que permite testar a
tela contra um agente falso sem esperar a política ficar de pé.

**Decisão:** tela + política. Fases 1 → 4 em ordem, sem paralelismo entre a 2 e a 3.

---

### [x] Q2 — Como a pílula diz que o modo é do Lumem, e não do agente?

Se as duas parecerem iguais, alguém vai achar que pôs o agente em modo plano quando na verdade só
mudou quem responde ao pedido de permissão.

**Proposta pra reagir:** glifo próprio na pílula (`◈`) e o `title` dizendo de quem é a regra — sem
uma segunda cor. Cor já está gasta com os tons de modo, e um segundo eixo de cor no mesmo objeto não
se lê.

**Custo de esperar:** trava o desenho.

**R:** **glifo `◈`, e mais um segundo sinal que já estava de graça no dado.** O desenho
(`lumem-session-mode.html`, §2) mostrou uma coisa que a pergunta não tinha visto: o Lumem rotula em
**português e em caixa de frase** (*Perguntar tudo*), e o agente entrega a **string crua do
protocolo**, em inglês (`bypassPermissions`, `Plan Mode`, `acceptEdits`). Duas pílulas lado a lado
nunca vão parecer da mesma origem, e isso não custou uma linha de CSS.

A alternativa simétrica — `◆` no agente também — foi desenhada e **recusada**: `◆` já significa
*sessão de agente* na sidebar e na aba, e repeti-lo na pílula dá dois sentidos ao mesmo glifo na mesma
tela. Além disso obrigaria a decidir o que fazer com as pílulas de modelo e esforço, que também são do
agente. A assimetria é o preço, e ele é menor.

> **A dependência que isso cria:** fechar a [A13](../acp-sessions/open-questions.md) em favor de
> **traduzir** a string do agente apaga metade deste sinal, e aí o glifo passa a carregar a autoria
> sozinho. Está escrito no §7 do desenho.

**Decisão:** glifo `◈` + rótulo em português. Sem segunda cor. Fonte: o desenho.

---

### [x] Q3 — O que exatamente `automático` aprova sozinho?

"Leitura dentro do checkout" é fácil de dizer e difícil de delimitar: ler `.env` é leitura; `git log`
é execução de comando que só lê; `curl` é leitura de outra coisa.

**Proposta pra reagir:** aprova sozinho **só** o que o ACP classifica como leitura de arquivo com
caminho **dentro do checkout**, e nada mais. Um `.env` dentro do checkout **entra** na aprovação — a
alternativa é uma lista de nomes de arquivo dentro do daemon, que envelhece mal e dá falsa segurança.
Se isso doer, a resposta é a feature de regras por caminho, não uma exceção aqui.

**Custo de esperar:** trava a fase de política.

**R:** **a proposta, e ela é implementável sem tocar no contrato compartilhado.** O
`acp-protocol.ts` já carrega `kind: "read"` e `locations[].path` no `toolCall` do
`session/request_permission` — a classificação é dado do protocolo, não heurística nossa.

A regra, escrita para não ter borda:

1. `toolCall.kind === "read"`, e mais nada. `execute` que só lê (`git log`) **não entra**: o protocolo
   não distingue `git log` de `git push`, e adivinhar pelo nome do comando é a lista de nomes que a
   pergunta já rejeitou, com outro disfarce;
2. `locations` **não vazio** — sem caminho não há como julgar, e o silêncio vira "sim";
3. **todos** os `locations[].path`, depois de resolvidos, dentro do `cwd` da sessão. Um só fora
   derruba o pedido inteiro para a pessoa.

Um `.env` dentro do checkout **entra**, e isso está dito na descrição do menu — não numa nota de
rodapé. A alternativa envelhece mal e dá falsa segurança.

**Decisão:** `kind === "read"` + `locations` não vazio + todos os caminhos dentro do `cwd`. Nada mais.

---

### [x] Q4 — `liberado` precisa de portão, e de qual?

Ele deixa o agente escrever e executar sem perguntar, dentro de uma worktree.

**Proposta pra reagir:** confirmação explícita **por sessão**, com o texto dizendo o que passa a
poder acontecer — e sem "não perguntar de novo". A [project-scripts](../project-scripts/prd.md) já
tem um portão de confiança para `[scripts]` vindo de repositório clonado; o molde é o mesmo, e a
decisão dela foi que o portão é por origem e não uma vez na vida.

**Custo de esperar:** trava a fase de política.

**R:** **portão por sessão, desenhado no §5.** Três coisas ficaram decididas ao desenhar, e as três
são de propósito:

- **o escopo aparece como caminho em disco**, não como "a worktree". É o caminho que diz o tamanho do
  estrago;
- **o foco nasce em `cancelar`**, e o botão perigoso é `btn--danger`, não o primário;
- **não existe caixinha de lembrar.** O dia em que o portão virar preferência salva, ele deixa de ser
  portão.

A diferença para a `project-scripts` importa e está escrita: lá o portão é **por origem**, porque
confiar num repositório é durável; aqui é **por sessão**, porque liberar um agente não é.

**Decisão:** confirmação por sessão, sem memória. Fonte: o desenho.

---

### [x] Q5 — O modo é da sessão, do checkout ou do workspace?

Da sessão é o mais simples e o mais repetitivo: quem trabalha em `automático` vai selecionar de novo
em toda conversa nova.

**Proposta pra reagir:** **da sessão**, com o padrão vindo de uma preferência do workspace (que nasce
em "perguntar tudo"). Herdar sem poder divergir seria política global; divergir sem herdar seria
repetir sempre.

**Custo de esperar:** baixo — dá para nascer só de sessão e a herança vir depois, sem quebrar nada.

**R:** **da sessão, com o padrão herdado do workspace**, e as duas partes entram juntas porque a
segunda é uma coluna e um `SELECT`.

O que **não** entra: herdar `liberado`. O padrão do workspace aceita `ask` e `auto`; uma sessão nova
**nunca** nasce liberada, porque o portão da Q4 é por sessão e um padrão que o atravesse sozinho o
anula. Se alguém marcar o workspace como `liberado`, o valor é recusado na escrita — não silenciado na
leitura, que é o modo de falha que ninguém percebe.

**Decisão:** coluna na sessão + coluna de padrão no workspace, restrita a `ask | auto`.

---

### [x] Q6 — E se o agente não oferecer nenhuma opção de "permitir"?

Achada lendo o `AcpManager`, e o desenho não a viu.

O daemon **não responde "sim" no abstrato**: o `session/request_permission` resolve com um `outcome`
que carrega **uma das `options` que o agente mandou** (`AcpManager.ts:948`). Aprovar sozinho é
escolher a opção de `kind: "allow_once"`.

Um agente pode mandar um conjunto onde essa opção não existe: só `reject_*`, ou uma única opção com
`kind` que o schema não reconhece. Aí o `automático` não tem o que escolher.

**Proposta pra reagir:** **cair para perguntar**, sempre, e dizer por quê no próprio pedido. Nunca
negar sozinho.

**Custo de esperar:** trava a fase de política — é o caminho que faz o `automático` falhar em
silêncio.

**R:** **a proposta.** Negar sozinho seria a pior falha desta feature: o agente para, a pessoa não vê
nada, e o modo que prometia acelerar vira o que trava. Então a ordem é:

1. a política diz "aprova" **e** existe uma opção `allow_once` → o daemon responde com ela;
2. a política diz "aprova" **mas** não existe opção `allow_once` → o pedido **sobe para a pessoa**,
   com o `perm__why` dizendo que o agente não ofereceu por onde aprovar;
3. a política diz "pergunta" → sobe, como hoje.

Vale igual para `automático` e para `liberado`. **Nenhum caminho desta feature nega sozinho** — o
único jeito de um pedido virar "não" continua sendo alguém clicando.

**Decisão:** sem opção `allow_once`, o pedido sobe com o motivo dito. Nunca nega sozinho.
