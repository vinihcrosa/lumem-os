# Três semanas com a memória ligada — perguntas

**PRD:** [prd.md](prd.md) · **Diário:** [journal.md](journal.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **0 respondidas**. As **U2, U3 e U4 são os critérios**, e têm que estar
respondidas antes da semana 1 — depois do primeiro número, qualquer limiar é ajuste de resultado.

---

### [ ] U1 — Os interruptores continuam por `env`, ou ganham arquivo ou tela?

Hoje `LUMEM_MEMORY_DISTILL`, `LUMEM_MEMORY_AUTO_LEARN` e o orçamento são só `env`; ligar é reiniciar
o daemon. A `memory.settings` mostra os três como leitura.

**Proposta pra reagir:** `env`. São três toggles, mudados duas vezes em três semanas, e o `lumem`
instalado lê as mesmas variáveis (`LUMEM_MEMORY_DISTILL=1 lumem`). Uma tela de configuração é
exatamente o tipo de código que este PRD existe para **não** escrever antes de saber se a coisa
configurada vale.

**R:**

---

### [ ] U2 — Qual número diz que a camada 3 está viva?

O §6 do `context-delivery.md` chama "chamadas ao `lumem-memory` por sessão" de **o número mais
importante**: perto de zero, a camada 3 é decoração.

**Proposta pra reagir:** mediana **≥ 1** pergunta por sessão, contando só sessões com **três turnos ou
mais** — sessão de uma pergunta não tem por que consultar nada. Abaixo disso, a skill ensina uma porta
que o agente não abre, e o que se mede na semana 1 é se ele abre sem ninguém escrever por ele.

**R:**

---

### [ ] U3 — Qual é o critério para a destilação valer?

A destilação vira propostas na inbox. Se você rejeita a maioria, é ruído caro; se ignora, é cerimônia.

**Proposta pra reagir:** duas condições, as duas: **≥ 50%** das propostas aprovadas (com ou sem
edição), **e** nenhuma proposta pendente por mais de **48 horas** em média. A segunda é a que pega a
inbox que você parou de abrir.

**R:**

---

### [ ] U4 — Qual é o critério para o auto-learn valer?

Ele escreve sozinho, atrás de evidência e portão. O que decide é o que **sobra** e o que **custa**.

**Proposta pra reagir:** **≥ 50%** das memórias que ele criou ainda existem ao fim da semana 3 (você
não apagou), **e** o custo com `purpose = auto_learn` fica em **≤ 10%** do consumo das sessões de
usuário da mesma semana. Acima disso ele está comprando conhecimento caro demais.

**R:**

---

### [ ] U5 — Qual é o segundo workspace?

Três semanas só no repositório do Lumem é uma carga enviesada: você conhece o código, e a memória de
workspace não tem dois projetos para atravessar.

**Proposta pra reagir:** um par **front e back** real seu, que já exista e tenha trabalho a fazer nas
três semanas. É literalmente o caso da `vision.md`. Se não houver um, a medição da memória de
**workspace** fica sem dado, e o PRD deve dizer isso no §7 em vez de fingir.

**R:**

---

### [ ] U6 — "Vermelho" congela o quê, exatamente?

**Proposta pra reagir:** a seção A do backlog inteira — nenhum item dela vira PRD até um número do
`report` mudar. Bug em memória entra. Melhoria em memória **não**, mesmo pequena, mesmo "só isso": é
o "só isso" que este PRD existe para parar.

**R:**
