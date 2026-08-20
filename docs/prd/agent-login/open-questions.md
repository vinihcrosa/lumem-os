# Conectar agente — perguntas

Registro de por que cada decisão foi tomada. Prefixo `L` de login, para não colidir com as `A` da
[acp-sessions](../acp-sessions/open-questions.md) nem com as `O` do [onboarding](../onboarding/open-questions.md).

**Estado:** 8 perguntas · **2 respondidas pelo Vinicius · 6 fechadas pela medição**

Seis destas não são opinião: o [§2 do PRD](prd.md) mediu o adaptador real e a resposta veio dele. Ficam
registradas porque a medição pode envelhecer — o adaptador é de terceiro e solta versão quase toda
semana, e o dia em que uma dessas seis mudar é o dia em que alguém vai querer saber que ela já foi
verificada uma vez, e quando.

As duas que **foram** decisão: o escopo (**L2**) e onde a chave de API moraria (**L6**).

---

### [x] L1 — O clique de login vai por `authenticate` ou roda um comando?

**Medido:** roda um comando. Os dois métodos que o `claude-agent-acp` oferece são `type: "terminal"`, e
o `authenticate` dele responde *"Method not implemented"* para os dois. O desenho descrevia
`authenticate` abrindo o navegador; o navegador é aberto pelo comando.

**O que isso comprou:** o Lumem já tinha terminal. O login virou `PtyManager.spawn` do comando que o
adaptador entregou em `_meta["terminal-auth"]`, e nenhuma parte nova de protocolo foi escrita.

**O que reabre:** um adaptador que ofereça `type: "agent"`. O painel já recusa explicando, em vez de
desenhar um botão que falha — então o dia em que aparecer, o que falta é implementar `authenticate`,
não descobrir que ele existe.

---

### [x] L2 — O daemon instala o adaptador? — **decisão do Vinicius, 2026-08-20**

**R:** sim, núcleo mais instalação automática. A chave de API fica fora.

Reverte a [D5/O6 do onboarding](../onboarding/open-questions.md), e a diferença entre o que foi
recusado e o que foi feito está no [§5 do PRD](prd.md): `--prefix` numa pasta do daemon em vez de `-g`,
versão fixa em vez de `@latest`, progresso em três linhas em vez de saída sem lugar.

**O que ela cobra:** o daemon roda `npm` e depois executa o que baixou.

---

### [x] L3 — A versão do adaptador é fixada onde?

**Medido e decidido:** numa constante em `packages/shared` (`ACP_ADAPTER_PINNED_VERSION`), hoje
`0.40.0` — que é o que o `agentInfo.version` do adaptador instalado nesta máquina reporta.

Constante e não configuração: subir a versão passa a ser mudança de código que alguém revisou. Uma
atualização de madrugada não muda o comportamento do agente.

**Nota que vale registrar:** o [pty-vs-acp §9](../../project/pty-vs-acp.md) diz `0.69.0`. O binário
instalado aqui diz `0.40.0`, e o `AgentConfigDialog` sempre usou `0.40.0` como placeholder. Onde os
dois discordam, vale o que o handshake respondeu.

---

### [x] L4 — O terminal de login é uma sessão?

**Decidido:** não, pela mesma razão que a sonda não é ([O8 do onboarding](../onboarding/open-questions.md)).
Não tem escopo — nem projeto, nem worktree — e uma linha em `session` seria uma conversa que nunca
existiu. O cliente anexa pelo socket de PTY que já fala.

**O que isso deixa de fora:** o login não aparece na lista de sessões e não sobrevive a um reinício do
daemon. As duas coisas são certas: é um comando de dois minutos, não trabalho.

---

### [x] L5 — Existe botão de sair?

**Medido:** não. O ACP tem `logout`, fechado por `agentCapabilities.auth.logout`, e este adaptador manda
`auth: null`. O painel diz onde se faz (`claude /logout`, no terminal da pessoa) em vez de oferecer um
botão que não faria nada.

É a regra que o próprio desenho escreveu: *"sem isso, o botão mentiria"*.

---

### [x] L6 — Onde a chave de API mora? — **decisão do Vinicius, 2026-08-20**

**R:** `agent_config.env`, no SQLite. E a tela terá de **dizer isso** — "fica no registro do Lumem" —
em vez de prometer chaveiro do sistema, que é o que o desenho promete hoje.

**Fora desta entrega**, e não por falta de decisão: o adaptador não oferece método `env_var` nenhum
([§2.4 do PRD](prd.md)), então o caminho seria mecanismo do Lumem e não do protocolo. Está no
[backlog](../../project/backlog.md) com esta resposta já dentro, para não ser decidido duas vezes.

---

### [x] L7 — A gaveta `avançado` edita ou só mostra?

**Decidido:** só mostra. Comando, argumentos e versão como fatos.

O motivo é que editar exige um `agentConfig.update` que não existe, e o caminho de troca já existe e é
honesto: remover e criar em **outro agente ACP…**, que é o formulário de cinco campos que continua ali
para exatamente esse caso.

**O que reabre:** alguém querendo trocar só os argumentos sem perder a configuração. Aí `update` vira
task, não antes.

---

### [x] L8 — A tela mostra conta e plano?

**Medido:** não pode. O handshake não diz conta nem plano, e ler `~/.claude` para descobrir seria o
Lumem espiando o estado interno de outro programa — que é exatamente o acoplamento que o ACP existe
para não ter.

O painel mostra o que existe: o agente, a versão que ele reportou, e o modo em que as sessões nascem. O
desenho mostrava `vinicius@technomar.com.br` e `Claude Max`; os dois saem.
