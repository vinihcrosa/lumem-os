# PRD — A sessão de agente vira conversa (ACP)

> **Status:** v0.3 — **as 12 perguntas de desenho estão respondidas e o spike do §2 está completo**:
> autenticação, janela de contexto e consumo, os três medidos nesta máquina
> **Perguntas:** [open-questions.md](open-questions.md) — 12 de 12
> **Decisão que originou:** [pty-vs-acp.md](../../project/pty-vs-acp.md) — migrar para ACP, 2026-08-17
> **Destrava:** [workspace-memory](../workspace-memory/roadmap.md) partes 06–09
> **Sucede:** [file-editor](../file-editor/prd.md)

---

## 1. Objetivo

A sessão de agente deixa de ser um **terminal** e passa a ser uma **conversa estruturada**. O daemon
troca JSON-RPC com o agente pelo stdin/stdout e passa a entender o que acontece: mensagem, raciocínio,
chamada de ferramenta, pedido de permissão, plano, e **quanto custou**.

Hoje o daemon lança um `node-pty` e transporta bytes com ANSI. Ele não sabe quando um turno acabou,
não sabe que arquivo foi escrito, e não sabe quantos tokens a sessão queimou. Tudo que o Lumem quer
ser — memória que aprende sozinha, custo por projeto, política de permissão própria — esbarra nisso.

**Critério de sucesso em uma frase:** você roda uma tarefa real do dia a dia na aba do Lumem, sem
terminal, e no fim a aba sabe dizer o que foi feito e quanto custou.

**O que esta feature NÃO é:** a morte do PTY. `transport` é coluna em `agent_config`; sessão de shell
continua PTY, e agente em PTY continua possível.

---

## 2. O spike — o que já foi medido

Rodado em 2026-08-17 nesta máquina, contra `@agentclientprotocol/claude-agent-acp@0.69.0`, com o
`claude` 2.1.234 instalado. **Nenhum token consumido**: o handshake e a criação de sessão não geram
inferência.

### 2.1 Autenticação — ✅ a assinatura vale

```
initialize → protocolVersion: 1, authMethods: []
session/new → sessionId, sem erro de autenticação
```

`authMethods: []` mais `session/new` bem-sucedido significa que **o adaptador usou a credencial local
do Claude Code**. Não pediu chave de API, não pediu login novo. O medo levantado pela issue #517
([§9.2b do estudo](../../project/pty-vs-acp.md)) é real para a **distribuição** pela JetBrains, e
**não se aplica** a este caso: aqui o adaptador é instalado e rodado por você.

### 2.2 Janela de contexto — ✅ 1M, e é o default

```json
"currentValue": "opus[1m]",
"options": [
  { "value": "default",           "description": "Opus (1M context)" },
  { "value": "opus[1m]",          "description": "Opus 5 com 1M context" },
  { "value": "claude-fable-5[1m]" },
  { "value": "sonnet" },
  { "value": "haiku" }
]
```

A sessão **nasce** em Opus com 1M de contexto. O relato de fallback para 200K (issue #786) não se
reproduziu aqui — e o `[1m]` é um valor de modelo selecionável, exatamente como no CLI.

### 2.3 Consumo — ✅ sai da assinatura, e o protocolo **entrega o estado do limite**

Um prompt real (`"Responda apenas com a palavra: ok"`), autorizado, no modelo default:

```json
usage_update: { "used": 39200, "size": 1000000,
  "cost": { "amount": 0.235433, "currency": "USD" },
  "_meta": { "_claude/rateLimit": {
      "status": "allowed_warning", "rateLimitType": "seven_day",
      "utilization": 0.94, "isUsingOverage": false,
      "surpassedThreshold": 0.75, "resetsAt": 1787004000 } } }

resultado: { "stopReason": "end_turn",
  "usage": { "inputTokens": 2, "outputTokens": 4,
             "cachedReadTokens": 16486, "cachedWriteTokens": 22708,
             "totalTokens": 39200 } }
```

**`rateLimitType: "seven_day"` é o limite da assinatura**, não crédito de API — é a janela de sete dias
dos planos Max. Somado ao fato de que **não existe `ANTHROPIC_API_KEY` neste ambiente** (a credencial
é o OAuth no Keychain), a conclusão não tem terceira hipótese: **o caminho ACP consome a assinatura,
igual ao CLI**.

E o `/usage` deixou de ser necessário: o protocolo entrega `utilization`, `resetsAt`, `isUsingOverage`
e o limiar de aviso **por turno**. Isso é melhor do que o que existe hoje no Lumem — dá para mostrar
"94% do ciclo, reseta às 19h" na própria aba.

#### Dois achados que mudam contas de outras features

| Achado | Consequência |
|---|---|
| **`size: 1000000`** confirmado em uso real | a janela de 1M não é só o rótulo do seletor: é o que o turno reporta |
| **39.200 tokens para responder "ok"** — 22.708 de escrita de cache + 16.486 de leitura | **o custo fixo de abrir uma sessão é dominado pelo system prompt do agente**, não por nada nosso. O bloco de memória do [context-delivery](../workspace-memory/context-delivery.md) entra num orçamento onde ~39k já são do próprio Claude Code |

### 2.4 O que mais o spike revelou, e muda o desenho

| Achado | Por que importa |
|---|---|
| `sessionCapabilities`: `resume`, `fork`, `list`, `delete`, `close` + `loadSession: true` | A sessão é **retomável e forkável pelo protocolo**. O modelo de abas do Lumem ganha isso de graça — inclusive "continuar a conversa de ontem" |
| `modes`: `auto`, `default` (Manual), `acceptEdits`, `plan`, `dontAsk` | O seletor de modo é dado do protocolo, não invenção nossa |
| `configOptions`: `mode`, `model`, `effort`, `fast`, `agent` | `effort` (`low`…`max`) e `fast` viram controle de UI, e são exatamente o que o roteamento por tipo de trabalho precisaria |
| `mcpCapabilities: { http, sse }` | Os servidores MCP do Lumem entram por aqui — é o canal da camada 3 da memória |
| `promptCapabilities`: `image`, `embeddedContext` | Colar imagem e anexar contexto são suportados |
| extensões `_meta`: `steering`, `goal`, `jetbrains.air` | Há superfície além do padrão; nada disso é obrigatório |

---

## 3. Escopo

### F1 — Transporte

**F1.1** `AcpManager`, irmão do `PtyManager`: lança o subprocesso, faz o framing JSON-RPC pelo SDK
oficial (`@agentclientprotocol/sdk`), e é dono do ciclo de vida.
**F1.2** `agent_config` ganha `transport ∈ pty | acp`. Sessão de shell é sempre `pty`.
**F1.3** `session` ganha o que o protocolo exige: `acpSessionId`, modo corrente, modelo corrente.
**F1.4** A sessão **sobrevive ao cliente**, como já sobrevive hoje: o subprocesso é do daemon.
**F1.5** O stream para o cliente deixa de ser bytes e passa a ser **evento tipado**. O mecanismo de
attach/detach do WebSocket é o mesmo.
**F1.6** Falha de lançamento é resposta de domínio, não stack trace — o `isCommandAvailable` já faz
isso para o PTY e a lógica é a mesma.

### F2 — A conversa na tela

**F2.1** Renderizador de mensagem, com `agent_message_chunk` em streaming.
**F2.2** Raciocínio (`agent_thought_chunk`) colapsado por padrão.
**F2.3** **Cartão de chamada de ferramenta**, com estado (pendente, rodando, ok, falhou), alvo e
resultado. É o elemento que substitui o "texto rolando" do terminal.
**F2.4** **Diálogo de permissão** (`session/request_permission`). Sem ele o agente trava — é o único
item da F2 que é bloqueante de verdade. O default é `auto` ([A9](open-questions.md)), e isso **não**
dispensa o diálogo: em `auto` o classificador resolve o que consegue e **o resto sobe para você**.
Como ele passa a ser acionado pouco, ganha teste próprio — caminho pouco exercitado é caminho que
quebra sem ninguém ver.
**F2.5** Vista de plano (`plan`).
**F2.6** Seletor de **modo** e de **modelo**, alimentados por `configOptions`.
**F2.7** Uso e custo do turno (`usage_update`).
**F2.8** Entrada com comandos de barra, a partir de `available_commands_update`.

### F3 — O terminal que o agente pede

**F3.1** `terminal/create`, `output`, `wait_for_exit`, `kill`, `release`: quando o agente pede um
terminal, ele aparece **dentro da conversa**, não numa aba paralela.
**F3.2** O que já existe do `PtyManager` é reusado — este é o caso em que os dois transportes se
encontram.

### F4 — Arquivo

**F4.1** `fs/read_text_file` e `fs/write_text_file` atendidos pelo `FileService`, com **a mesma guarda
de caminho** da `file-editor`. O agente não ganha um caminho novo para escapar do checkout.

### F5 — Ciclo de vida

**F5.1** `session/cancel` ligado ao botão de interromper.
**F5.2** `session/load` para retomar sessão anterior (o spike confirmou `loadSession: true`).
**F5.3** Boot do daemon reconcilia sessões ACP como já reconcilia PTY.
**F5.4** A **transcrição inteira é guardada**, num banco por sessão, com compressão do que passou de
30 dias ([A6](open-questions.md)). Medido no seu uso: 3,9 GB/ano cru, ~1 GB/ano comprimido — barato
demais para justificar descartar o insumo da destilação de memória.
**F5.5** A versão do adaptador é **fixa** no `agent_config`, nunca `@latest` ([A12](open-questions.md)).
**F5.6** Migração escreve `transport: 'pty'` em toda configuração existente ([A11](open-questions.md)).

---

## 4. O que isso destrava

| Consumidor | O que passa a existir |
|---|---|
| [workspace-memory 06–09](../workspace-memory/roadmap.md) | injeção no `session/prompt`, captura estrutural por turno, auto-learn, telemetria de playbook |
| Custo por projeto e por worktree | `usage_update` agregado — [backlog](../../project/backlog.md) |
| Política de permissão do Lumem | o diálogo da F2.4 é o primeiro passo; a política vem depois — [backlog](../../project/backlog.md) |

---

## 5. Não-objetivos

| Fora | Por quê |
|---|---|
| Arrancar o PTY | `transport` é coluna. Shell precisa dele, e ele é a saída se o billing mudar |
| Suportar N agentes de uma vez | **Só Claude no v1** ([TA2](../../project/pty-vs-acp.md)). Codex e opencode entram um por feature |
| Política de permissão configurável | O diálogo sim, a política não. É feature própria |
| Reimplementar o TUI do Claude Code | A tela é do Lumem, com o vocabulário do protocolo. Paridade visual com o CLI não é meta |
| Multi-conta por agente | Backlog, e o mecanismo já está identificado (home isolation) |
| Loop de agente próprio | O Lumem dirige; não implementa loop ([Q029 do projeto](../../project/questions.md)) |

---

## 6. Riscos

| O quê | Por quê | Mitigação |
|---|---|---|
| A tela ficar pior que o terminal | é uma reimplementação de algo maduro | protótipo antes de React, como toda tela deste repo; e o PTY continua a um `transport` de distância |
| Adaptador de terceiro quebrar | `claude-agent-acp` é da Zed, com release quase diária | pinar versão, e tratar erro de protocolo como falha de domínio visível — nunca silenciosa |
| Billing mudar | anunciado e cancelado uma vez em 2026 | §2.3 mostra que hoje sai da assinatura, e o `transport` continua sendo a saída. O `_claude/rateLimit` por turno é o detector: `isUsingOverage` mudando de `false` é o aviso que chega antes da fatura |
| Permissão travar a sessão | sem o diálogo, o agente espera para sempre — e com o default `auto` ele é acionado raramente, então quebra em silêncio | F2.4 é a primeira coisa da F2 a existir, **com teste próprio**; e o pedido fora da aba visível marca a aba e conta na sidebar |
| Escrita fora do checkout | `fs/write_text_file` é superfície nova de escrita — e com o default `auto` há **menos confirmação humana no caminho** | F4.1 reusa a guarda da `file-editor`, sem exceção. Com `auto`, ela deixa de ser rede e vira o **piso** |
| Evento desconhecido derrubar a aba | o protocolo evolui, e a v2 é rascunho | tudo que não é reconhecido é **ignorado com log**, nunca lançado |

---

## 7. Fases

| Fase | O quê | Done when |
|---|---|---|
| **0** | O spike | §2 — **feito**, os três eixos |
| **1** | Transporte: `AcpManager`, `transport` na coluna, stream tipado, sem tela nova | Uma sessão ACP roda, responde, e os eventos chegam ao cliente (verificável por teste, não por olho) |
| **2** | Protótipo HTML da conversa | As cinco superfícies desenhadas e renderizadas: mensagem, ferramenta, permissão, plano, uso |
| **3** | A conversa em React: **mensagem + ferramenta + permissão**, e só ([A2](open-questions.md)) | Uma tarefa real roda do começo ao fim sem terminal |
| **4** | Terminal embutido, plano, modos, modelos, comandos de barra, uso | Paridade funcional com o uso diário |
| **5** | Retomar sessão (`session/load`), reconciliação no boot | Fechar o Lumem e voltar não perde conversa |

---

## 8. Custo nos testes

O transporte é testável sem LLM: o SDK permite um agente de mentira do outro lado do pipe, e é assim
que a fase 1 deve ser verificada — mensagem entra, evento sai. O que **não** dá para testar sem
processo real é o handshake com o adaptador; isso vira um teste de integração marcado, como o `git`
real que a `right-panel` já usa.

A tela é testada como as outras: componente por componente, e um e2e que roda uma conversa contra um
agente falso.
