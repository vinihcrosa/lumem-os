---
title: Agente é sempre ACP; o PTY é só do terminal
date: 2026-09-24
area: transport
summary: Decisão do Vinicius. O PTY deixa de ser caminho alternativo para agente — `agent_config` perde o transporte, toda sessão de agente nasce ACP, e a config de terminal que existia fica aposentada, visível no histórico e sem como reabrir. O terminal integrado (shell, scripts, login e o terminal que o agente ACP pede) continua PTY. Supera a frase de Riscos do ADR de 2026-08-17 que mantinha a porta aberta, e reafirma o resto dele.
supersedes: 2026-08-17-1812-agent-session-is-acp-not-pty
feature: 033-acp-only-agents
---

## Contexto

O [ADR de 2026-08-17](2026-08-17-1812-agent-session-is-acp-not-pty.md) fez da conversa ACP o
transporte de agente e, numa frase de Riscos, deixou o PTY de pé *"para shell e como caminho
alternativo, então a porta não está soldada"*. O estudo que o sustenta foi mais longe:
[`pty-vs-acp.md` §9.3](../project/pty-vs-acp.md) — *"`transport` é coluna, não bandeira … Migrar quer
dizer: ACP é o default e é onde o produto investe. Não quer dizer arrancar o PTY."*

Um mês depois, a porta aberta é um caminho que o produto oferece e não sustenta:

- **O formulário oferece, o resto ignora.** O `AgentConfigDialog` ainda tem `terminal (PTY)`, e o
  `SessionTab` monta um terminal para essa sessão. Mas memória (`memory/capture.ts:55`), tarefas
  (`tasks/progress.ts` só ouve ACP), aprendizado automático, custo, esteira e o rodapé de login já
  tratam agente-PTY como inexistente. Quem escolhe PTY recebe metade do produto sem aviso.
- **O uso já decidiu.** Em produção, 8 de 9 sessões de agente são ACP; no ambiente de dev, 22 de 22.
- **O que vem a seguir exige a sessão estruturada desde o nascimento.** Abrir agente passa a ser
  compor um prompt com **modelo e ACP escolhidos antes** de a sessão existir — um catálogo de
  modelos por adaptador, o modelo aplicado antes do primeiro turno, a worktree nascendo com o
  primeiro prompt. Nada disso tem tradução para um terminal.

## Decisão

`agent_config` não tem mais transporte, e toda sessão de agente criada daqui em diante é ACP: não
existe caminho — nem em formulário — para rodar um agente num terminal. A config de terminal que
existia é **aposentada** (`retired_at`): as sessões dela aparecem no histórico do checkout, sem
reabrir, e o daemon recusa usá-la. O PTY continua sendo o transporte do terminal integrado.

**Reafirma**, do ADR de 2026-08-17: a sessão de agente é uma conversa estruturada com o Lumem
desenhando; o shell continua PTY — `node-pty`, `xterm` e o WebSocket ficam; agente sem adaptador ACP
não entra na lista; captura estrutural, custo como dado, prompt montado pelo Lumem e permissão do
Lumem. E, dos ADRs posteriores, nada muda: o adaptador é a cópia que o daemon instalou
([2026-09-08](2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)), e o que vem dele entra
traduzido para o modelo do Lumem ([2026-09-13](2026-09-13-0038-our-model-is-king-outsiders-adapt.md)).

## Alternativas consideradas

### Status quo — PTY como alternativa atrás do formulário

**O que era:** manter `transport ∈ pty | acp` na config, com ACP como padrão e PTY a um `<select>`
de distância.

**A favor:** zero migração; a saída de cobrança do §9.2(b) do estudo continua sendo config.

**Contra:** é um caminho que nenhuma feature desde a `006` exercita de ponta a ponta, e que as
features seguintes foram construindo *em volta*. Cada tela nova precisa decidir o que faz com um
agente que não fala — e a resposta de todas até agora foi *nada*.

**Por que perdeu:** o que ele protege (a porta aberta) é mais barato de reabrir do que de manter.
Reabrir é um ADR e uma feature, se o §9.2(b) acontecer; manter é um ramo em cada tela nova, pago
todo mês, por um caminho que ninguém usa.

### O híbrido do §6.1 — o agente escolhe o transporte por config

**O que era:** agente que fala ACP pode rodar nos dois modos; o modo é do `agent_config`.

**A favor:** *"a única forma de descobrir se a tela ACP vale a pena sem apostar o produto nela"*.

**Contra:** a descoberta que ele comprava já aconteceu.

**Por que perdeu:** era um instrumento de medição, e a medição terminou — com 30 de 31 sessões de
agente em ACP nos dois ambientes.

### Arrancar o PTY do produto inteiro

**O que era:** o pedido lido ao pé da letra — nenhum PTY, em lugar nenhum.

**A favor:** um transporte a menos, `node-pty` fora do par nativo.

**Contra:** o agente ACP **pede** terminal (`terminal/*`, e o `AcpManager` só declara a capacidade se
houver `PtyManager`); o login do adaptador é um terminal; `pnpm install` não é conversa.

**Por que perdeu:** foi recusado na hora pelo Vinicius — *"sai do contexto dos agentes, mas fica para
o terminal integrado"*.

## Consequências

### Bom

- Toda sessão de agente é uma sessão que o daemon entende — memória, tarefa, custo, orçamento e
  permissão deixam de ter um caso que ignoram.
- A escolha de modelo e ACP **antes** da sessão passa a ser possível, porque não existe mais um
  agente cujo modelo o Lumem não enxerga.
- `SessionTab`, `NewSessionMenu`, `adapter-command.ts` e `SessionStore.start` perdem um ramo cada.

### Ruim

- **A saída de cobrança do §9.2(b) deixa de ser config.** Se um provedor passar a cobrar diferente o
  uso via adaptador, voltar para o CLI em terminal é um ADR e uma feature, não um `<select>`.
- **"Qualquer binário roda" acaba também no formulário.** CLI sem adaptador ACP não é agente no
  Lumem — já era verdade na lista desde a `009`.
- O backlog *"Hooks por CLI"* morre de vez: ele só voltava se sobrasse agente em PTY.

### Riscos

- **A sessão legada é histórico sem leitura.** Quem precisar do que aconteceu naquela sessão de
  terminal não tem mais o `ver registro` — a decisão foi *"aparece no histórico, mas não dá para
  reabrir"*, lida ao pé da letra. É uma sessão em produção; o custo é conhecido.
- **Reabertura.** O gatilho de reabrir esta decisão é concreto: o §9.2(b) se realizar, ou um agente
  que importa sem adaptador ACP e sem previsão de ter um.
