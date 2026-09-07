# O segundo agente — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **6 respondidas** (2026-09-06). A C1 foi respondida na
[issue #41](https://github.com/vinihcrosa/lumem-os/issues/41), e as cinco seguintes pela **fase 0** —
o §4 do PRD tem os números que cada uma cita.

---

### [x] C1 — Codex, Gemini ou opencode primeiro?

**Codex** (`@agentclientprotocol/codex-acp`): mesma família de adaptador, mesmo instalador, e você
tem credencial. **Gemini** (`gemini --acp`): nativo, nada a instalar além do CLI, e uma família
diferente — prova mais sobre a tradução. **opencode**: a verificar como fala ACP.

**Proposta pra reagir:** Codex. Custa menos e prova o que precisa ser provado agora: que a tradução
e o instalador não sabem o que é Claude. Gemini é o **terceiro** natural, justamente por ser de outra
família — e aí prova a segunda coisa.

**Custo de esperar:** cada feature construída sobre o ACP até lá é construída sobre uma premissa
não testada.

**R:** Codex, como a proposta. A issue #41 já nasceu com o nome dele no título, e a fase 0 mostrou
que "mesma família" comprava menos do que parecia — dentro do mesmo escopo npm, o Codex não precisa
do CLI no PATH, não pede `fs` nem `terminal` ao cliente e não faz login por comando. Três diferenças
de comportamento que um agente "parecido" não deveria ter, e é justamente isso que se queria medir.

**Decisão:** Codex primeiro, por `@agentclientprotocol/codex-acp`, pinado em `1.10.0`. Gemini fica
como terceiro no [backlog](../../project/backlog.md), com o motivo que a C1 já dava: outra família,
prova outra coisa.

---

### [x] C2 — O adaptador é instalado pelo daemon, ou exigido no PATH?

O claude-agent-acp é instalado pelo daemon, pinado, em `~/.lumem/adapters` — decisão da agent-login,
com o custo nomeado. Um agente nativo (Gemini) não tem adaptador para instalar.

**Proposta pra reagir:** o catálogo diz. Spec com `package` é instalada pelo daemon; spec sem
`package` é procurada no PATH, e o pré-voo diz se falta. Uma regra, dois casos, nenhum especial.

**R:** a proposta, com **um campo a mais** que a medição pediu. O `codex-acp` traz o próprio
`@openai/codex` por `optionalDependencies` — 285 dos 301 MB da instalação —, e com
`PATH=/nonexistent` o handshake ainda responde (§4.8). Então o CLI que a spec dirige não é sempre um
requisito: ele é **opcional na spec**. Uma spec com `cli` faz o pré-voo relatar dois binários, como
hoje; uma spec sem `cli` relata um, e diz que o agente vem dentro do adaptador.

**Decisão:** `AdapterSpec` com `package` opcional (com → o daemon instala pinado em
`<stateDir>/adapters/<id>`; sem → procura no PATH e o pré-voo diz se falta) e `cli` opcional (sem →
um binário no relatório). Duas regras, quatro casos, nenhum `if (id === "codex")`.

---

### [x] C3 — O primeiro acesso pergunta qual agente, ou continua Claude e o segundo entra depois?

Acrescentar uma escolha na tela 3 do onboarding é mais uma decisão para quem está chegando — e a
onboarding lutou para ter **menos** decisões.

**Proposta pra reagir:** depende da fase 0. Se o login do Codex for tão simples quanto o do Claude
(comando em terminal), a escolha entra, com Claude default. Se exigir browser ou passo a mais, o
primeiro acesso continua Claude, e o Codex entra pelo rodapé de login, depois. Regra: o onboarding não
ganha uma tela por causa de um agente que a maioria dos primeiros acessos não vai escolher.

**R:** o primeiro acesso **continua Claude**, e a regra da proposta é que decide — o gatilho dela
aconteceu. Medido em §4.2: o Codex não oferece nenhum método `type: "terminal"`. Os métodos são
`api-key` (uma chave que alguém digita) e `chat-gpt` (o **adaptador** chama `open(authUrl)` e o
navegador abre na máquina do **daemon**); o terceiro, `chat-gpt-device-code` — o único honesto para um
daemon que não é o desktop de quem clicou —, só aparece se o cliente declarar `elicitation.url`, uma
capacidade que este daemon ainda não implementa. Isso é mais que "um passo a mais": é o caminho mais
novo e menos testado do produto, e ele não vai na frente de quem está chegando.

**Decisão:** o `AgentStep` fica como está, com Claude. O Codex entra pelo rodapé `AgentLogin`, depois
do primeiro acesso, e a F2 paga o `authenticate` e o `elicitation/*`. Se algum dia a escolha entrar no
onboarding, ela entra **depois** de esse caminho ter rodagem — e aí é outra PRD.

---

### [x] C4 — Sem `rateLimit` e sem `cost`: o rodapé de consumo mostra o quê?

O Claude manda `_meta._claude/rateLimit` e o rodapé o desenha. Outro agente pode mandar só `used` e
`size`, ou nada.

**Proposta pra reagir:** "não informado pelo agente", em texto, no lugar do número. **Nunca zero** —
zero é um número, e um agente que não reporta não cobrou nada é a mentira que a `acp-protocol.ts`
já recusa contar sobre `cost`.

**R:** a regra fica, e a fase 0 mostrou que ela **já está cumprida** — por isso a resposta é mais
estreita que a pergunta. Medido em §4.4: o Codex manda `usage_update` com `{ used, size }` e nada
mais; o `translate.ts` devolveu `cost: null` e `rateLimit: null` sem uma linha de mudança, e o
`UsageFooter` simplesmente não desenha o bloco de limite quando ele é nulo. Não há "não informado"
para escrever aqui: há um comportamento para **fixar em teste**, e ele nunca teve um.

O caso que continua sem prova é o agente que não manda `usage_update` **nenhum** — e esse agente não
é o Codex. Ele entra como teste com o perfil do agente falso, não como tela nova.

**Decisão:** nada de novo no rodapé. A F3 vira teste: `used`/`size` sem `rateLimit` → `null` no fio e
bloco de limite ausente na tela; **nenhum** `usage_update` → nenhum número, nunca zero. "Não
informado pelo agente" em texto fica para quando existir um agente que justifique a frase.

---

### [x] C5 — Comparação entre agentes: onde, e quanto?

A F5 propõe agrupar `usage.byProject` e `byWorktree` por `agent_config`. Dá para ir mais longe:
tela de comparação, custo por turno, custo por tarefa.

**Proposta pra reagir:** só o agrupamento, e só nas duas queries que existem. A tela do workspace ganha
uma coluna quando há mais de um agente, e nada quando há um. Custo por tarefa é da
[workspace-tasks](../workspace-tasks/prd.md).

**R:** a proposta, sem mudança. A fase 0 encontrou um `usage` mais rico na **resposta** do
`session/prompt` — `_meta.quota.model_usage[]`, com token por modelo (§4.4) — e a tentação de somar
por modelo em vez de por agente aparece aí. Não agora: o `session_usage` já soma o que a notificação
dá, a linha da sessão já tem `agent_config_id`, e o agrupamento é uma cláusula. Ler a resposta do
prompt é mudar a fonte do número, e isso não é desta feature.

**Decisão:** agrupamento opcional por `agent_config` em `usage.byProject` e `usage.byWorktree`, e
coluna na tela do workspace **só quando há mais de um agente**. Custo por modelo e custo por tarefa
vão para o [backlog](../../project/backlog.md).

---

### [x] C6 — O `DEFAULT_AGENT_CONFIG` (`pty` + `claude`) continua sendo semeado?

É anterior ao ACP. O onboarding cria a configuração ACP; a semente PTY fica na lista como uma segunda
opção que ninguém pediu, e é inconsistente com o produto inteiro ter migrado.

**Proposta pra reagir:** para de semear. A configuração PTY continua criável pelo `AgentConfigDialog`
— o caminho alternativo existe, só não é oferecido por default. Está neste PRD porque ele mexe nos
mesmos arquivos; se preferir, vira item `P` no backlog.

**R:** para de semear, como a proposta — e o catálogo dá o motivo que faltava. Com `ADAPTERS` no
`shared`, semear significa **escolher uma spec**, e `pty` + `claude` não é uma delas: é um transporte
sem adaptador. Uma semente que não sai do catálogo seria a sexta constante de Claude escondida num
lugar novo, no exato PR que tira as outras cinco.

**Decisão:** o `DEFAULT_AGENT_CONFIG` deixa de ser semeado. Quem já tem a linha no banco continua com
ela — não há migração que apague configuração de ninguém —, e o `AgentConfigDialog` continua criando
`pty` para quem quiser. A task carrega o teste de que uma instalação nova nasce **sem** ela e o
`NewSessionMenu` não fica vazio por causa disso.
