# O segundo agente — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** ainda não

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **0 respondidas**. A **C1** trava a fase 0.

---

### [ ] C1 — Codex, Gemini ou opencode primeiro?

**Codex** (`@agentclientprotocol/codex-acp`): mesma família de adaptador, mesmo instalador, e você
tem credencial. **Gemini** (`gemini --acp`): nativo, nada a instalar além do CLI, e uma família
diferente — prova mais sobre a tradução. **opencode**: a verificar como fala ACP.

**Proposta pra reagir:** Codex. Custa menos e prova o que precisa ser provado agora: que a tradução
e o instalador não sabem o que é Claude. Gemini é o **terceiro** natural, justamente por ser de outra
família — e aí prova a segunda coisa.

**Custo de esperar:** cada feature construída sobre o ACP até lá é construída sobre uma premissa
não testada.

**R:**

---

### [ ] C2 — O adaptador é instalado pelo daemon, ou exigido no PATH?

O claude-agent-acp é instalado pelo daemon, pinado, em `~/.lumem/adapters` — decisão da agent-login,
com o custo nomeado. Um agente nativo (Gemini) não tem adaptador para instalar.

**Proposta pra reagir:** o catálogo diz. Spec com `package` é instalada pelo daemon; spec sem
`package` é procurada no PATH, e o pré-voo diz se falta. Uma regra, dois casos, nenhum especial.

**R:**

---

### [ ] C3 — O primeiro acesso pergunta qual agente, ou continua Claude e o segundo entra depois?

Acrescentar uma escolha na tela 3 do onboarding é mais uma decisão para quem está chegando — e a
onboarding lutou para ter **menos** decisões.

**Proposta pra reagir:** depende da fase 0. Se o login do Codex for tão simples quanto o do Claude
(comando em terminal), a escolha entra, com Claude default. Se exigir browser ou passo a mais, o
primeiro acesso continua Claude, e o Codex entra pelo rodapé de login, depois. Regra: o onboarding não
ganha uma tela por causa de um agente que a maioria dos primeiros acessos não vai escolher.

**R:**

---

### [ ] C4 — Sem `rateLimit` e sem `cost`: o rodapé de consumo mostra o quê?

O Claude manda `_meta._claude/rateLimit` e o rodapé o desenha. Outro agente pode mandar só `used` e
`size`, ou nada.

**Proposta pra reagir:** "não informado pelo agente", em texto, no lugar do número. **Nunca zero** —
zero é um número, e um agente que não reporta não cobrou nada é a mentira que a `acp-protocol.ts`
já recusa contar sobre `cost`.

**R:**

---

### [ ] C5 — Comparação entre agentes: onde, e quanto?

A F5 propõe agrupar `usage.byProject` e `byWorktree` por `agent_config`. Dá para ir mais longe:
tela de comparação, custo por turno, custo por tarefa.

**Proposta pra reagir:** só o agrupamento, e só nas duas queries que existem. A tela do workspace ganha
uma coluna quando há mais de um agente, e nada quando há um. Custo por tarefa é da
[workspace-tasks](../workspace-tasks/prd.md).

**R:**

---

### [ ] C6 — O `DEFAULT_AGENT_CONFIG` (`pty` + `claude`) continua sendo semeado?

É anterior ao ACP. O onboarding cria a configuração ACP; a semente PTY fica na lista como uma segunda
opção que ninguém pediu, e é inconsistente com o produto inteiro ter migrado.

**Proposta pra reagir:** para de semear. A configuração PTY continua criável pelo `AgentConfigDialog`
— o caminho alternativo existe, só não é oferecido por default. Está neste PRD porque ele mexe nos
mesmos arquivos; se preferir, vira item `P` no backlog.

**R:**
