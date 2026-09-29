# O plano do plan mode — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 4 perguntas · **4 respondidas** em 2026-09-29, **todas pela proposta**. A Q1 e a Q2 vieram
da própria
[LUM-65](https://linear.app/lumem-os/issue/LUM-65/plano-estado-visivel-em-plan-mode-e-aprovar-ou-recusar-o-plano-com-ele),
com a proposta dela; a Q3 a issue deixou aberta; a Q4 nasceu de escrever o critério do registro. A Q3
e a Q4 foram aceitas em branco — *"o que ficou em branco é porque eu aceitei"*.

---

### [x] Q1 — As opções do adaptador aparecem verbatim ou traduzidas?

O adaptador manda `name` em inglês — *"Yes, clear context (32% used) and use auto mode"*, *"No, keep
planning"*. A A13 da [`006`](../006-acp-sessions/prd.md) diz que texto do agente é literal, e o
schema já carrega isso (`acpPermissionOptionSchema`, *"shown verbatim (A13)"*). Traduzir exigiria uma
tabela por `optionId` — `exit-plan-clear-auto`, `exit-plan-auto`, `exit-plan-default`, `reject` —, que é
vocabulário de um adaptador dentro do web.

**Proposta pra reagir:** **verbatim**, com o texto do Lumem em volta em português — o cabeçalho do
cartão, o *"ou continuar planejando"* antes da recusa, o registro depois. *"clear context"* apaga o
contexto da conversa, e o texto exato de quem vai apagar pesa na decisão.

**O que a resposta muda:** o critério 11 e o 14 (o registro repete o `name` escolhido). Traduzido, nasce
uma tabela por `optionId` e um caso para o `optionId` que ela não conhece.

**R (2026-09-29): verbatim** — *"não precisa traduzir nada."* A proposta fica como está.

---

### [x] Q2 — A política do Lumem pode aprovar o plano sozinha?

Hoje o `liberado` aprova tudo que tem uma opção `allow_once` (`permission-policy.ts:47-88`), e o pedido
de sair do plan mode tem uma (*"Yes, manually approve edits"*). Só vale para agente **sem** modos
(`modeOwnerOf`), que em tese não tem plan mode — mas nada no código o garante.

**Proposta pra reagir:** **nunca**, nos três valores. Aprovar plano é decisão de pessoa: é o momento em
que ela lê o que vai ser feito. O pedido fica pendente com *"aprovar um plano é decisão sua"* no
`policyReason`.

**O que a resposta muda:** o critério 9. Se a resposta for *"o `liberado` aprova"*, o critério inverte e
o cartão precisa de um registro para `verdictBy: "lumem"`.

**R (2026-09-29): nunca** — aceita a proposta.

---

### [x] Q3 — O rótulo "Plano" da lista de passos muda?

O `PlanCard` (`PlanCard.tsx:47-55`) mostra **"Plano"** e *"N de M"* para a lista de passos que o agente
publica (`sessionUpdate: "plan"`). Esta feature põe na mesma tela **o plano** do plan mode — o texto que
se aprova. Com os dois chamados de *plano*, *"aprovei o plano"* fica ambíguo.

Opções:

- **"Passos"** — é o que a lista é, e não colide com nada;
- **"Tarefas"** — colide com a tarefa da [`022`](../022-workspace-tasks/prd.md), que é entidade;
- **deixar "Plano"** — e chamar o do plan mode de outra coisa (*"proposta"*), contra o nome que o
  próprio modo tem.

**Proposta pra reagir:** **"Passos"** — *"Passos · 3 de 7"*. O nome do componente (`PlanCard`) e do
evento (`plan`) ficam: o evento é do protocolo, e renomear o componente não muda o que se lê.

**O que a resposta muda:** o critério 5.

**R (2026-09-29): "Passos"** — aceita a proposta, sem comentário.

---

### [x] Q4 — Depois da decisão, o plano fica aberto ou recolhido?

Depois de aprovar, o agente começa a trabalhar e a conversa cresce abaixo do cartão. Um plano de 60
linhas aberto empurra tudo; recolhido, some o que foi aprovado — que é o que se quer conferir quando o
agente se desvia dele.

**Proposta pra reagir:** **recolhido**, com o registro (*"plano aprovado — Yes, and use auto mode"*) e um
botão *"ver o plano"* que o abre inteiro. Pendente, ele está sempre aberto.

**O que a resposta muda:** o critério 17.

**R (2026-09-29): recolhido** — aceita a proposta, sem comentário.
