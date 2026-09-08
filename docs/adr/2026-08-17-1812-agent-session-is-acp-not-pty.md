---
title: A sessão de agente é ACP, não PTY
date: 2026-08-17
area: transport
summary: O Lumem desenha a conversa em vez de hospedar um terminal, porque captura de aprendizado, custo por token e política de permissão precisam que o daemon entenda a sessão — e um PTY só entrega bytes.
feature: 006-acp-sessions
---

## Contexto

A memória de workspace depende de o daemon **entender** a sessão. Com PTY ele só vê bytes de
terminal: não sabe quando um turno acabou, o que foi lido, o que foi escrito, nem quanto custou.
Antes de decidir *como* aprender, era preciso decidir *o que dá para ver*.

A restrição que bifurca a decisão: **adotar ACP como transporte único é a decisão mais cara de
desfazer do projeto inteiro** — o estudo do Compozy diz o mesmo — e nenhuma pergunta em aberto da
memória exigia que ela fosse tomada naquele momento.

## Decisão

A sessão de agente deixa de ser um terminal com o CLI desenhando e passa a ser uma **conversa
estruturada, com o Lumem desenhando**, sobre o Agent Client Protocol. A sessão de **shell** continua
PTY — `node-pty`, `xterm` e o WebSocket ficam, sem discussão. Agente sem adaptador ACP não entra na
lista.

## Alternativas consideradas

O estudo inteiro está em [`docs/project/pty-vs-acp.md`](../project/pty-vs-acp.md) — 557 linhas, com o
custo de migração medido (§4), os prós e contras desconsiderando a migração (§5), e os caminhos que
não são "um ou outro" (§6). O que segue não repete o estudo; nomeia por que cada caminho perdeu.

### Ficar no PTY com captura cooperativa

- **O que era:** a recomendação do **§7** — *"não migrar agora, não fechar a porta"*, em três
  movimentos: MCP no lançamento mais injeção por flag e sinais próprios; depois hooks por CLI se
  doer; e só então `transport` no `agent_config` com uma tela ACP mínima para **um** agente, como
  experimento fechado.
- **A favor:** destravava a feature de memória inteira sem tocar no transporte, e era **reversível
  por definição** — se o caminho morresse, apagavam-se algumas linhas de `agent_config`. O que a
  memória precisa (escrever, buscar, injetar, saber quando a sessão acabou) o primeiro movimento já
  dava.
- **Contra:** captura **cooperativa**. Agente que não chama a tool e não tem hook não ensina nada, e
  o Lumem teria que mostrar isso em vez de fingir que aprendeu.
- **Por que perdeu:** ela otimizava para reversibilidade e custo imediato; a decisão otimiza para o
  que o produto quer ser. O argumento registrado pelo autor no §9: *"é o melhor jeito de ter controle
  de várias features como a memória, e outras que são futuro como consumo de token por projeto, por
  feature"*. O custo por token é o caso que decide — ele é **invisível** no PTY e não fica visível
  com nenhum dos três movimentos.

### Hooks por CLI, sem trocar o transporte

- **O que era:** o segundo movimento do §7, isolado — subir a qualidade da captura para quem tem
  hook e degradar para injeção por flag para quem não tem.
- **A favor:** captura estrutural de graça em um dos CLIs, sem tela nova.
- **Contra:** um contrato por CLI, e nenhum deles é seu.
- **Por que perdeu:** a política de permissão pelo Lumem (TA3) e o custo por turno não chegam por
  hook em nenhum dos CLIs. O caminho resolvia captura e deixava as outras duas de fora.

## Consequências

### Bom

- **Captura vira estrutural.** Turno, `tool_call`, arquivo escrito e `usage_update` chegam sozinhos.
  A frase *"captura vira cooperativa"* — o preço mais duro do §4 do PRD da memória — **deixou de
  valer**.
- **Custo por token passa a existir como dado.** `usage_update` por turno virou consumo somável por
  projeto e por worktree, e depois por agente.
- **O Lumem monta o prompt:** prepend no `session/prompt` e MCP declarado no `session/new`.
- **A permissão pode ser do Lumem**, e virou — a política de modo da `016-session-mode`.

### Ruim

- **A tela da conversa passou a ser trabalho nosso, e é grande.** O §7 dizia isso, e continua
  verdadeiro como **preço**, não como impedimento.
- **Agente sem adaptador ACP não entra na lista** (TA2). É perda de alcance, deliberada.
- Adaptador de terceiro no caminho crítico (TA4, aceito): o `codex-acp` traz o próprio CLI — 285 dos
  301 MB — e roda com `PATH=/nonexistent`.

### Riscos

- **Não há gatilho formal de reabertura** (TA6). A garantia é o `transport` continuar sendo coluna:
  o PTY fica para shell e como caminho alternativo, então a porta não está soldada.
- O protocolo é jovem, e o que ele **não** relata varia por agente. Medido na
  [`021-second-agent`](../features/021-second-agent/prd.md) §4: o Codex atravessou um turno inteiro
  com `rateLimit: null` e `cost: null`. Mitigação: campo ausente é ausente na tela, nunca zero.
