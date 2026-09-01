# O modo da conversa — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 5 perguntas · **0 respondidas**. A Q1 é a que decide o tamanho da feature.

---

### [ ] Q1 — A feature é de tela ou de política?

Duas leituras, e o custo entre elas é de uma ordem de grandeza:

- **só tela:** quando o agente não relata modos, a pílula aparece **desabilitada**, dizendo
  "este agente não oferece modos". Honesta, barata, e não resolve o que a anotação pediu;
- **tela + política:** o Lumem passa a ter modo próprio, que muda como o daemon responde a
  `session/request_permission`. É o que a anotação pede, e mexe no daemon.

**Proposta pra reagir:** **tela + política**, e a tela sozinha entra como primeira fase — ela já tira
o composer mudo do ar, e é o que se entrega enquanto as Q3 e Q4 não fecham.

**Custo de esperar:** trava a feature inteira.

**R:**

---

### [ ] Q2 — Como a pílula diz que o modo é do Lumem, e não do agente?

Se as duas parecerem iguais, alguém vai achar que pôs o agente em modo plano quando na verdade só
mudou quem responde ao pedido de permissão.

**Proposta pra reagir:** glifo próprio na pílula (`◈`) e o `title` dizendo de quem é a regra — sem
uma segunda cor. Cor já está gasta com os tons de modo, e um segundo eixo de cor no mesmo objeto não
se lê.

**Custo de esperar:** trava o desenho.

**R:**

---

### [ ] Q3 — O que exatamente `automático` aprova sozinho?

"Leitura dentro do checkout" é fácil de dizer e difícil de delimitar: ler `.env` é leitura; `git log`
é execução de comando que só lê; `curl` é leitura de outra coisa.

**Proposta pra reagir:** aprova sozinho **só** o que o ACP classifica como leitura de arquivo com
caminho **dentro do checkout**, e nada mais. Um `.env` dentro do checkout **entra** na aprovação — a
alternativa é uma lista de nomes de arquivo dentro do daemon, que envelhece mal e dá falsa segurança.
Se isso doer, a resposta é a feature de regras por caminho, não uma exceção aqui.

**Custo de esperar:** trava a fase de política.

**R:**

---

### [ ] Q4 — `liberado` precisa de portão, e de qual?

Ele deixa o agente escrever e executar sem perguntar, dentro de uma worktree.

**Proposta pra reagir:** confirmação explícita **por sessão**, com o texto dizendo o que passa a
poder acontecer — e sem "não perguntar de novo". A [project-scripts](../project-scripts/prd.md) já
tem um portão de confiança para `[scripts]` vindo de repositório clonado; o molde é o mesmo, e a
decisão dela foi que o portão é por origem e não uma vez na vida.

**Custo de esperar:** trava a fase de política.

**R:**

---

### [ ] Q5 — O modo é da sessão, do checkout ou do workspace?

Da sessão é o mais simples e o mais repetitivo: quem trabalha em `automático` vai selecionar de novo
em toda conversa nova.

**Proposta pra reagir:** **da sessão**, com o padrão vindo de uma preferência do workspace (que nasce
em "perguntar tudo"). Herdar sem poder divergir seria política global; divergir sem herdar seria
repetir sempre.

**Custo de esperar:** baixo — dá para nascer só de sessão e a herança vir depois, sem quebrar nada.

**R:**
