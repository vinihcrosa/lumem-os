# Os agentes saem da sidebar e moram em /settings — checks

> **Status:** em execução

Profile: light
Plan: nenhum — mudança pequena, sem porta de mão única (Linear LUM-57)

## Intent

O login de agente existe em dois lugares: o rodapé da sidebar (`<AgentLogin />`) e a seção *Agentes* de
`/settings`. O rodapé é cópia, e uma cópia que mente: `agent_config` é **global** e o rodapé é do workspace.
A `030-settings` aprovou a terceira linha da `SidebarNav` contando com os 73–105px que ele devolve.

Quando isto entrar, o rodapé da sidebar não tem agente nenhum. Conectar, reconectar e cadastrar um ACP de
fora do catálogo acontecem em `/settings`, que diz que a configuração é da máquina. E o `entrar ↓` da pílula
de agente e modelo — que hoje não leva a lugar nenhum — abre `/settings` rolado até a seção daquele agente.

10 checks in 3 slices · 0 one-way doors · 0 open

## Checks

Os testes novos moram em `packages/web/src/agents-in-settings.test.tsx`; o `agent-config.test.tsx` passa a
abrir a gaveta por `/settings`. Os comandos rodam da raiz.

### S1 - o rodapé perde os agentes · ~6 files

**C1** - O rodapé da sidebar não tem botão `conectar um agente`, nem cabeçalho `Agentes`, nem a frase `nenhum agente conectado`, mesmo com uma `agent_config` listada
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "the sidebar footer has no agent in it"`

**C2** - As credenciais continuam no rodapé (LUM-58 as leva): o cabeçalho `Credenciais` segue lá
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "the sidebar footer keeps the credentials"`

**C3** - `AgentRow`, `ConnectPanel`, `AgentPanel` e `AgentLogin` não existem mais em `packages/web/src`
Proof: `! git grep -nE "\b(AgentRow|ConnectPanel|AgentPanel|AgentLogin)\b" -- 'packages/web/src/**/*.ts' 'packages/web/src/**/*.tsx' ':!packages/web/src/architecture.test.ts'`

### S2 - o que só o rodapé tinha vai para /settings · ~4 files

**C4** - `/settings` tem o botão `outro agente ACP…`, e ele abre a gaveta com os campos Nome, Comando, Argumentos e Versão do adaptador
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "settings offers the other-ACP drawer"`

**C5** - A gaveta em `/settings` envia `agentConfig.create` com `{ name, command, args, adapterVersion }` — a versão vai junto — e o `adicionar` fica desabilitado sem versão
Proof: `pnpm --filter @lumem/web exec vitest run src/agent-config.test.tsx -t "sends the pinned version no other screen could write, and no transport"`
Proof: `pnpm --filter @lumem/web exec vitest run src/agent-config.test.tsx -t "will not submit an ACP agent without a version"`

**C6** - A seção *Agentes* diz que a configuração vale para a máquina e não para o workspace, e não fala mais do *rodapé da coluna*
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "settings says the agent configuration is the machine's"`

### S3 - o `entrar ↓` leva a /settings · ~5 files

**C7** - No rascunho de uma aba, a pílula de um agente instalado e sem login mostra `entrar ↓`, e clicar nele leva o endereço a `/settings#agent-<adapterId>` e tira a seleção da worktree
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "entrar from the draft pill opens settings at that agent"`

**C8** - No modal de nova worktree, o mesmo `entrar ↓` leva a `/settings#agent-<adapterId>` e fecha o modal
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "entrar from the new-worktree composer opens settings and closes it"`

**C9** - Abrir `/settings#agent-<adapterId>` rola até a primeira linha do grupo `agente <label>` e põe o foco nela — também quando `/settings` já está aberta e só o fragmento muda; sem hash, nada é rolado nem focado. (O grupo é `display: contents`, sem caixa: o foco vai na linha.)
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "the hash scrolls to that agent's section"`
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "the hash scrolls when settings is already open"`
Proof: `pnpm --filter @lumem/web exec vitest run src/agents-in-settings.test.tsx -t "without a hash nothing is scrolled or focused"`
Proof: `pnpm exec playwright test e2e/settings.spec.ts -g "põe o foco na linha daquele agente"`

**C10** - De ponta a ponta, num navegador: cadastrar um ACP de fora do catálogo em `/settings` e conversar com ele; e conectar o Codex em `/settings`, que ganha uma linha `conta …` ao lado do grupo do Claude Code
Proof: `pnpm exec playwright test e2e/second-agent.spec.ts -g "conecta o segundo agente em /settings"`
Proof: `pnpm exec playwright test e2e/acp-agent-config.spec.ts -g "creates the ACP agent from the screen, then talks to it"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| o que o rodapé deixa de ter (3) | botão `conectar um agente` C1 · cabeçalho `Agentes` C1 · `nenhum agente conectado` C1 | - |
| componentes sem chamador (4) | `AgentRow` C3 · `ConnectPanel` C3 · `AgentPanel` C3 · `AgentLogin` C3 | - |
| quem monta a pílula com `onLogin` (2) | `DraftAgentTab` C7 · `NewWorktreeComposerModal` C8 | - |
| campos da gaveta (4) | Nome C4 · Comando C4 · Argumentos C4 · Versão do adaptador C4 C5 | - |

- Claims naming a route or address: C7, C8, C9 — each has a proof that reads `window.location`.
- No other check claims more than the single case its proof exercises.

## Swept

- validation: C5
- failure modes: existing - `agent-config.test.tsx` "says what the daemon refused, in the daemon's words"
- idempotency: n/a - nenhuma escrita nova; a gaveta é a mesma
- authorization: n/a - a tela é local e o daemon continua a autoridade
- concurrency: n/a - sem estado compartilhado novo
- data lifecycle: n/a - nenhum dado criado ou migrado
- dependency failure: existing - `agent-config.test.tsx` "shows the refusal when the agent is still in use"
- state transitions: C7, C8, C9
- observability: n/a - agente caído não ganha faixa nova (`030` Q6a); o caminho é notificações, no backlog

## Out of scope

- As credenciais (`<Credentials />`) — ficam no rodapé até a LUM-58.
- Um sinal passivo de agente caído — a `030` o recusou por escala; a resposta é notificações.

## Handoff

- S1–S3 = ~15 arquivos, todos em `packages/web` (mais três specs e2e); abaixo do orçamento — um construtor.
- Mechanism: one builder
