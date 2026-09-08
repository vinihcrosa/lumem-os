# De quem é o adaptador — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)

**Status:** em execução
**Histórico:** **9 das 10 entregues** (2026-09-08), com a suíte fechada: 3302 unidades e **84/84 e2e**.
A T6 ficou **parcial** e a nota está nela — a resolução passou a ignorar a coluna, o que já torna o
valor inerte, mas os dois caminhos de criação ainda o gravam. A medição veio antes (§2 da PRD) e mudou
duas decisões antes de existir código: o `cli` do Claude caiu para `null`, e a Q1 foi respondida
**contra o pedido**, com 243 MB + 301 MB na mão.

O e2e cobrou **três** vezes, e as três viraram emenda em vez de contorno no teste. A terceira foi
diagnosticada errada primeiro — chamei de flake porque passava rodando sozinha, e o que ela era é o
defeito que só a suíte inteira produz:

1. **25 specs vermelhas** porque a primeira versão de `adapterCommandForConfig` recusava toda linha
   ACP fora do catálogo. O erro era colapsar três casos em dois — a [Q4a](open-questions.md) e a
   emenda no [F1](prd.md#f1--a-resolução-não-tem-else) registram qual.
2. **O passo do agente do primeiro acesso desapareceu inteiro.** O bloco era gatilhado em
   `claude !== undefined && adapter !== undefined`, e com `cli: null` a tela parou de desenhar os
   binários, o botão de testar conexão e a linha de comando. Nenhum teste de componente pegou; o e2e
   pegou procurando um `claude-agent-acp` que não existia mais na tela.
3. **A dica do item de menu roubava o clique do vizinho.** A `.menu__hint` carrega o comando do
   agente, o caminho gerenciado é bem mais longo que o do PATH, e um caminho não tem espaço para
   quebrar: numa linha de altura fixa, sem `min-width: 0` nem `overflow`, ele vaza e intercepta o
   clique do item de baixo. A spec `acp-agent-config` falhava na suíte inteira e **passava rodando
   sozinha** — porque aí o menu tinha um item só. É a mesma família dos três defeitos da
   [023-composer-menus](../023-composer-menus/prd.md), e ganhou `menu-css.test.ts`.

A ordem tem uma regra: **fecha o buraco antes de ensinar o boot a consertar.** Se a reconciliação
vier primeiro, ela mascara o `else` — uma máquina reconciliada nunca exercita o fallback, e o teste
que devia ficar vermelho fica verde.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `packages/server/src/routers/setup.ts` | `commandFor` perde o `else`; `adapterVersion` sai do disco |
| `packages/server/src/setup/install-adapter.ts` | o ramo `package === null` para de resolver pelo PATH |
| `packages/server/src/bootstrap.ts` | a conferência de boot |
| `packages/server/src/sessions/SessionStore.ts` | `spawn` e `resume` resolvem da spec |
| `packages/server/src/routers/agentConfig.ts` | a linha deixa de carregar caminho absoluto |
| `packages/shared/src/adapters.ts` | `CLAUDE_ADAPTER.cli` → `null`, com a medição no comentário |
| `packages/server/src/acp/translate.ts` | `rateLimitOf` e o `unifiedWindows` |

**O que não muda:** as seis linhas da [§4 da PRD](prd.md#4-o-que-não-muda), cada uma com a pergunta
que a decidiu.

---

## Fase 1 — a resolução perde o `else`

### T1 — `commandFor` recusa em vez de cair no PATH

`packages/server/src/routers/setup.ts:57-60`. Devolve o caminho gerenciado, ou lança `NOT_FOUND` com
uma frase que diz **qual** adaptador falta e **onde** ele deveria estar.

**Done when:** um teste com `stateDir` sem `adapters/` recebe a recusa nomeando o id, e não
`"claude-agent-acp"`; um com o binário no lugar recebe o caminho absoluto dele. O teste que prova a
recusa tem que ficar **vermelho** contra o código de hoje — ele é o `else`.
**Gate:** `pnpm gate:quick`

### T2 — `installAdapter` não resolve spec sem pacote pelo PATH

`install-adapter.ts:168-184`. O ramo `spec.package === null` chama `resolve(spec.command)` e devolve o
que achou no PATH. Passa a recusar. O parâmetro `resolve` sai junto — ele existia só para esse ramo.

**Done when:** uma spec sintética com `package: null` produz `DomainError` dizendo que o catálogo não
tem como instalar aquele adaptador; nenhum teste da suíte depende mais da costura `resolve`.
**Gate:** `pnpm gate:quick`

---

## Fase 2 — o boot confere

### T3 — a conferência de boot, contra o disco

`bootstrap.ts`. Antes de a primeira sessão poder existir: lê a versão no `package.json` do pacote
instalado e compara com `pinnedVersion`. Divergente ou ausente → instala. Ilegível → deixa quieto e
relata, que é a regra que o `install-adapter.ts` já escreveu (não redescarregar 243 MB por chute).

Nunca `<binário> --version`: medido, o `0.40.0` responde string vazia com exit 0.

**Done when:** um `stateDir` com `0.40.0` no diretório gerenciado sobe para o pino sem ninguém pedir;
um já no pino não chama `npm`; um `npm` ausente produz uma frase e **não** impede o daemon de subir —
o que ele impede é a sessão.
**Gate:** `pnpm gate:quick`

---

## Fase 3 — o caminho não é dado de sessão

### T4 — `spawn` resolve da spec

`SessionStore.ts:270`. O `command` que vai para `acpManager.spawn` passa a ser resolvido da spec no
momento do spawn, não lido de `agent_config.command`.

**Done when:** uma linha de `agent_config` com um caminho absoluto obsoleto ainda lança o gerenciado,
e o teste prova pela chamada ao `spawn` — não pela existência do arquivo.
**Gate:** `pnpm gate:quick`

### T5 — `resume` resolve da spec

`SessionStore.ts:381`. Hoje relança `row.command` — o caminho congelado da sessão morta —, contra o
próprio comentário acima dele, que diz que *"como o adaptador é invocado hoje é configuração"*.

**Done when:** retomar uma sessão nascida no `0.40.0` lança o pino. A nota de contradição fica no
comentário, com âncora para esta task.
**Gate:** `pnpm gate:quick`

### T6 — a linha para de carregar caminho absoluto — **parcial**

`routers/agentConfig.ts`. Ela guarda **qual adaptador**. Isto tem migração: as linhas existentes têm
caminho absoluto na coluna `command`.

**Done when:** uma linha antiga com caminho de `nvm` continua funcionando (o valor é ignorado na
resolução, não interpretado), e uma nova não grava caminho de adaptador. A migração roda em cima do
`~/.lumem` real desta máquina sem perder sessão.
**Gate:** `pnpm gate:quick`

> **Metade feita, e a metade que importa.** A primeira cláusula está entregue e provada — o teste
> `"ignora o comando gravado quando o nome é um id do catálogo"` — e é ela que fecha o defeito: para
> um id de catálogo a coluna **não é lida**, então uma linha de agosto apontando para o `nvm` deixou
> de decidir qualquer coisa. O valor está inerte.
>
> A segunda **não**: `AgentLogin.tsx:283` e `HandshakeStep.tsx:77` continuam gravando o caminho na
> criação, e a coluna continua `NOT NULL`. Parar de gravar é uma mudança de contrato — `command` é
> obrigatória e serve as duas linhagens de transporte —, e fazê-la de passagem trocaria um campo
> inerte por uma migração de schema no meio de uma feature que não é sobre isso.
>
> Não vai para o backlog: fica aqui, porque é uma task desta feature que não fechou. O que decide se
> vale mexer é o dia em que um terceiro adaptador precisar de `args` próprios — aí a linha volta a ter
> conteúdo, e o que ela deve guardar precisa ser respondido de propósito.

### T7 — `adapterVersion` sai do disco, não do pino

`routers/setup.ts:212` grava `spec.pinnedVersion`. É exatamente o que o `install-adapter.ts:44-52`
chama de *"restatement of the constant instead of a report… a mentira que esconde a LUM-54"* —
consertado no `AdapterInstall.version` e não no caminho do login.

**Done when:** um login numa máquina cujo disco tem outra versão grava a **do disco**. O teste
compara os dois valores e falha se forem o mesmo por construção.
**Gate:** `pnpm gate:quick`

---

## Fase 4 — o catálogo

### T8 — `CLAUDE_ADAPTER.cli` cai para `null`

`packages/shared/src/adapters.ts`. Três medições no comentário, porque a afirmação anterior
(*"um adaptador que dirige um binário que tem que existir"*) era verdade no `0.40.0`: o handshake
fecha com `claude` fora do PATH; o daemon spawna
`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, de dentro do pacote; e os `authMethods` do
`0.75.1` têm `args: ["--cli", "auth", "login", "--claudeai"]`.

**Done when:** `setup.agents` para de reportar um `claude` do PATH como requisito do Claude, e a tela
de primeiro acesso não pede mais a instalação de um CLI que ninguém usa. O `pnpm adapters:check`
continua verde.
**Gate:** `pnpm gate:quick` + `pnpm adapters:check`

---

## Fase 5 — o que a medição achou de graça

### T9 — `rateLimitOf` lê o `unifiedWindows`

`translate.ts:360-377` exige `utilization` na raiz de `_claude/rateLimit`. O `0.75.1` a aninha em
`unifiedWindows.<janela>.utilization` — `five_hour`, `seven_day`, `seven_day_overage_included` —, e é
por isso que `rateLimit` é `null` em **todo** transcript deste repositório.

A leitura defensiva fica: bloco ausente ou malformado continua significando "nenhuma informação", e
`isUsingOverage` continua sem default.

**Done when:** o payload real medido (gravado como fixture, verbatim) produz `rateLimit` não nulo com
a janela `five_hour`; o payload antigo, de raiz plana, **continua** funcionando; e um bloco sem
nenhuma das duas formas continua devolvendo `null`.
**Gate:** `pnpm gate:quick`

### T10 — a documentação

O §Estado atual do [CLAUDE.md](../../../CLAUDE.md), o [índice](../../README.md), e o
[backlog](../../project/backlog.md) com os dois itens que esta feature adiou **com gatilho**: o
adaptador como dependência do pacote ([Q1](open-questions.md)) e as duas `configOptions` novas
([Q5](open-questions.md)).

**Done when:** `pnpm docs:check` verde, e o backlog tem as duas entradas com contexto curto, de onde
vieram e o gatilho de volta.
**Gate:** `pnpm docs:check` + `pnpm gate:full`
