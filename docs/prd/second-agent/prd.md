# PRD — O segundo agente

> **Status:** v0.1 — proposto em 2026-09-05, **perguntas abertas**. Sai do backlog ("Segundo e
> terceiro CLI de agente", seção B). **Um de cada vez:** este PRD é sobre **um** agente a mais, e o
> terceiro volta para o backlog até este estar de pé.
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** ainda não — nascem depois da **fase 0**, que é medição
> **Depende de:** nada de código. A fase 0 é um spike contra o adaptador real, como o §2 da
> [agent-login](../agent-login/prd.md) foi
> **Desenho:** duas telas mudam no Open Design (§8): a escolha de agente no primeiro acesso e o rodapé
> de login com mais de um agente

---

## 1. O problema, em uma frase

**O ACP foi escolhido por ser agnóstico de agente, e nada prova isso.**

O [pty-vs-acp](../../project/pty-vs-acp.md) vendeu a migração, entre outras coisas, por *"o Lumem
desenha a interface"* para qualquer agente que fale o protocolo. A v1 roda **só Claude**. O que no
código sabe que é Claude, medido em 2026-09-05:

| Onde | O quê |
|---|---|
| `shared/constants.ts` | `ACP_ADAPTER_COMMAND`, `ACP_ADAPTER_PACKAGE`, `ACP_ADAPTER_PINNED_VERSION = "0.40.0"`, `CLAUDE_CLI_COMMAND`, `ANTHROPIC_API_KEY_ENV` — cinco constantes de **um** adaptador |
| `setup/install-adapter.ts` | instala só esse pacote, em `~/.lumem/adapters` |
| `setup/agents.ts` | o relatório da máquina é `claude` + `adapter`, dois binários fixos |
| `acp/translate.ts` | o consumo lê `_meta._claude/rateLimit` |
| `acp/AcpManager.ts` | o `remedy` de falha de lançamento é `npm i -g @agentclientprotocol/claude-agent-acp@…`; os comentários sobre `authMethods` são medições desse adaptador |
| `web/setup/AgentStep.tsx`, `web/components/AgentLogin.tsx` | um agente, o dele |
| `repositories/agentConfig.ts` | `DEFAULT_AGENT_CONFIG` semeia `pty` + `claude` — anterior ao ACP |

E o que **já é** genérico, e prova que a fronteira estava no lugar certo:

| Onde | O quê |
|---|---|
| `agent_config` | `name`, `command`, `args`, `env`, `transport`, `adapter_version`. "Adicionar agente é adicionar linha" (walking-skeleton §3) |
| `session.createAgent(agentConfigId)`, `NewSessionMenu` | qualquer configuração vira sessão, e o menu lista todas |
| `shared/acp-protocol.ts` | o fio para o browser não tem Claude nele — só o `rateLimit` opcional, "porque outro agente não vai mandar" |
| `conversation-model.ts` | um fold sobre eventos do **nosso** vocabulário |

Hoje já dá para rodar Codex como `agent_config` de transporte `pty` — é o caminho alternativo que a
decisão do ACP preservou. O que falta é a **conversa**.

## 2. Por que agora

1. **Provar a arquitetura antes de construir mais sobre ela.** Se a tradução não segura um segundo
   adaptador, é melhor saber agora do que depois da [workspace-tasks](../workspace-tasks/prd.md);
2. **Dois agentes é o que dá sentido a duas perguntas do projeto:** roteamento de tarefa (Q015) e
   comparação de custo por agente — com um só, as duas são vazias;
3. **O backlog nomeou o gatilho:** "quando o primeiro estiver estável e você sentir falta do segundo".
   O primeiro está: 35 tasks fechadas, onboarding e login completos.

## 3. Qual — Codex primeiro

Por [C1](open-questions.md), e por três motivos:

- **mesma família de adaptador.** O estudo do Compozy (§7) lista `codex` como
  `npx -y @agentclientprotocol/codex-acp@latest` — o mesmo escopo npm do `claude-agent-acp`. O
  mecanismo de instalar pinado em `~/.lumem/adapters` **é reusado como está**;
- foi o que o backlog nomeou primeiro;
- é o que as três referências suportam (Conductor `0.18.0` acrescentou Codex; Compozy e Superset
  também), então há com o que comparar comportamento.

Alternativas registradas: `gemini --acp` (nativo — não há adaptador para instalar, e é uma família
**diferente**, o que prova mais e custa mais), `opencode` (a verificar como fala ACP).

## 4. Fase 0 — o que medir antes de escrever código

Como a agent-login fez: contra o adaptador **real**, com token zero onde o protocolo permite. O §4
deste PRD é **reescrito com os números** ao fim da fase, e é isso que decide a fase 1.

| # | O quê | Por que importa |
|---|---|---|
| 1 | `initialize` → `agentInfo.name`, `agentInfo.version`, `agentCapabilities` (em particular `loadSession`) | a versão pinada é **detectada**, não digitada (onboarding); sem `loadSession` o retomar da D12 não existe para este agente |
| 2 | `authMethods` **com e sem** `clientCapabilities.auth.terminal` | a lição do claude: ele só oferece login a quem declara a capacidade. Codex pode ser `terminal`, `authenticate`, ou nada |
| 3 | `session/new` → `configOptions` (categorias, valores), `availableCommands`, modos | os seletores da conversa são genéricos por `category: string`; o que muda é o que aparece |
| 4 | **um** turno de prompt: forma do `usage_update`, chaves de `_meta`, `cost` | não haverá `_claude/rateLimit`. Se não houver consumo nenhum, o rodapé tem que dizer **"não informado"**, nunca zero ([C4](open-questions.md)) |
| 5 | `terminal/*` e `fs/*`: pede ao cliente, ou faz sozinho? | o `fs-bridge` e o `terminal-bridge` só valem se o agente os usa |
| 6 | `session/load` | retomar funciona? Se não, a conversa encerrada abre em leitura (D13) e o botão de retomar some para este agente |
| 7 | login: comando em terminal, `authenticate`, ou browser? | decide se o painel da agent-login serve como está ou ganha um caminho "abra este link" |
| 8 | instalar: pacote, binário, versão a pinar, tempo de `npm install` | o `install-adapter.ts` é parametrizado por isto |

## 5. Escopo

### F1 — Catálogo de adaptadores em `shared`

As cinco constantes viram **uma lista**: `ADAPTERS: readonly AdapterSpec[]`, com `id`, `label`,
`package`, `command`, `pinnedVersion`, o CLI que ele dirige (`command`, `install`) e a variável de
chave quando existe. `install-adapter.ts` recebe a spec e instala em `~/.lumem/adapters/<id>`;
`setup.agents` relata **por spec**; o `remedy` do `AcpManager` é montado da spec. Nada no daemon sabe
o que é "codex" fora da lista — é a regra do walking-skeleton levada até o instalador.

### F2 — Onboarding e login escolhem o agente

O `AgentStep` ganha uma escolha (o componente `Choice` existe), com Claude como default
([C3](open-questions.md)). O rodapé `AgentLogin` mostra **uma linha por agente configurado**, com o
estado de cada um. O painel de login continua tirando os botões do `authMethods` — que é a força do
desenho: se o Codex também oferece métodos `terminal`, nada muda; se oferece `authenticate` ou
browser, o painel ganha esse caminho, e só ele.

### F3 — Tradução sem Claude assumido

- `translate.ts`: consumo sem `_claude/rateLimit` → `rateLimit: null`, e o rodapé diz "não informado";
- chave de `_meta` desconhecida → registrada **uma vez por sessão**, não por evento;
- o agente falso (`testing/acp-fake-agent.ts`, `e2e/support/fake-acp-agent.mjs`) ganha um **perfil**
  "codex-like": sem `rateLimit`, comandos diferentes, e — conforme a fase 0 — sem `loadSession`. É o
  perfil que os testes de integração e o e2e usam para provar a F1 e a F2 a token zero.

### F4 — A sessão já é por agente — conferir

`NewSessionMenu` lista toda `agent_config`; a cabeça da conversa mostra agente, modelo e modo. A task
aqui é **verificar** que a aba diz qual agente está falando quando há dois, e nada mais.

### F5 — Consumo por agente

`usage.byProject` e `usage.byWorktree` ganham agrupamento opcional por `agent_config` — a linha da
sessão já tem `agent_config_id`. Ter dois agentes e não poder comparar o que cada um custou seria não
ter dois agentes ([C5](open-questions.md)).

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| Terceiro agente | um por vez, cada um pagando o próprio spike. Volta ao backlog |
| Empacotar o binário do agente (o Conductor faz) | o Lumem **detecta**; a decisão do onboarding não muda |
| Política de permissão por agente | backlog B, `G` |
| Roteamento de tarefa por agente | workspace-tasks, e lá é manual (Q015) |
| Mudanças no caminho PTY | ele já aceita qualquer comando |

## 6. Decisões que já dá para tomar

- **Versão pinada por adaptador, no catálogo.** A A12 continua: nunca `@latest`.
- **O rodapé nunca inventa número.** Sem `usage` do agente, a resposta é "não informado".
- **A fase 0 decide a fase 1.** Se o Codex não tiver `loadSession`, o PRD registra e a retomada fica
  fora para ele — não se emula o que o protocolo não deu.

## 7. Riscos

| Risco | Defesa |
|---|---|
| adaptador imaturo: publica quase todo dia, pode faltar `session/load`, `terminal`, `fs` | pinar; a fase 0 mede antes; o que faltar é **degradado com aviso**, não emulado |
| login pelo browser, não pelo terminal | o painel ganha "abra este link" com o `CopyCommand` que já existe. Se for `authenticate`, é uma chamada — a mais simples de todas |
| `tool_call` com `kind` e `title` diferentes deixa os cartões piores | o `kind` é passthrough com glifo genérico por desenho. O que doer vira task de tela |
| segunda assinatura para pagar | é seu, e é o motivo de a F5 existir: comparar |
| a cabeça da conversa não deixa claro **qual** agente | F4 confere; se não deixar, é task de tela |

## 8. O que muda no Open Design

1. `AgentStep` com escolha de agente (dois cartões, Claude default);
2. rodapé `AgentLogin` com **duas** linhas — o estado por agente, dentro dos mesmos 264px;
3. o rodapé de consumo da conversa no estado "não informado pelo agente".

## 9. Fases

0. **Medir** — o §4 com números. Meio dia com o adaptador na mão;
1. **Catálogo** — F1, F3, e o perfil do agente falso. É o grosso do daemon;
2. **Telas** — F2 e F4;
3. **Consumo** — F5.

## 10. Custo nos testes

| Camada | Teste |
|---|---|
| F1 | unit: instalar recebe spec e escreve em `<stateDir>/adapters/<id>`; `setup.agents` relata por spec; o `remedy` cita o pacote certo. `npm` dublado, como hoje |
| F3 | integration com o perfil codex-like do agente falso: `usage` sem `rateLimit` → `null` no fio; `_meta` estranha → um `warn` por sessão; sem `loadSession` → `session.resume` recusa com frase |
| adaptador real | integration **marcado**, pulado quando `codex-acp` não está no PATH — o mesmo padrão do `AcpManager.probe.test.ts`. Para em `initialize` + `session/new`: token zero |
| e2e | o onboarding escolhendo Codex contra um shim chamado `codex-acp` no PATH do daemon — o mecanismo do `00-onboarding.spec.ts`, com outro nome. Duas sessões, uma por agente, na mesma worktree: cada aba diz o seu |

Portão: `gate:full`.
