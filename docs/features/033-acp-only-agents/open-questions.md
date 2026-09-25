# Agente é sempre ACP — perguntas

**PRD:** [prd.md](prd.md) · **Decisão:** [ADR de 2026-09-24](../../adr/2026-09-24-1620-agent-is-always-acp.md)

**Estado:** 12 perguntas de produto · **12 respondidas** (2026-09-24, Vinicius, uma por vez) · 3
medições da Fase 0 (M1–M3) **medidas** pela T2 · 2 perguntas derivadas delas (M1a, M2a) **respondidas**
(2026-09-24, Vinicius).

As perguntas vieram de uma discovery que mediu o código e o banco antes de perguntar. Duas respostas
foram **contra a proposta**: a [Q2](#x-q2--criar-worktree-pelo-modal-cria-uma-tarefa) (proposta: criar
tarefa; resposta: não) e a [Q8](#x-q8--em-qual-modelo-a-pílula-nasce) (proposta: último modelo usado;
resposta: o padrão do ACP). Uma resposta **mudou o desenho** depois de dada: a
[Q6](#x-q6--o-primeiro-prompt-espera-o-setup) empurrou o encadeamento *worktree → sessão → setup →
prompt* da web para o daemon, porque a espera pode durar minutos e a aba pode fechar no meio.

---

### [x] Q0 — O PTY sai de onde?

O pedido foi *"não tenha mais o pty, apenas acps"*. Ao pé da letra, sairia também o shell, os scripts
do rodapé, o terminal de login e o terminal que o próprio agente ACP pede (`terminal/*`).

**Proposta pra reagir:** só do agente.

**R:** **só do contexto dos agentes.** O terminal integrado continua PTY.

### [x] Q1 — Fechar o modal perde o texto?

**Proposta pra reagir:** rascunho por projeto em memória da aba.

**R:** **isso.** A worktree só nasce no `Create`; fechar guarda o texto por projeto; `F5` perde. Sem
`localStorage`.

### [x] Q2 — Criar worktree pelo modal cria uma tarefa?

A [`022`](../022-workspace-tasks/prd.md) existe porque *"o nome da worktree era o único rastro da
intenção"*, e o texto do modal é exatamente uma intenção.

**Proposta pra reagir:** sim — título da primeira linha, corpo do prompt, sessão ligada.

**R:** **não.** O modal cria worktree e sessão, e só. O prompt vive na conversa. O caminho *tarefa →
worktree* da `022` continua separado.

### [x] Q3 — O que acontece com a config de terminal que já existe?

Produção tem `claude-code` (`pty`) com uma sessão; a FK da sessão é `restrict`.

**Proposta pra reagir:** manter como histórico, com a config aposentada.

**R:** **legado, sem acesso.** A config fica no banco e some de toda escolha; o daemon recusa usá-la.
Na lista de sessões do checkout, a sessão antiga **aparece no histórico, mas não dá para reabrir**.
Leitura da implementação: sem `reabrir`, sem `ver registro`, sem `nova sessão igual`.

### [x] Q4 — A sessão nasce ao abrir a aba ou no primeiro envio?

Ansiosa (hoje): a pílula e os `/comandos` vêm da sessão viva; trocar de ACP é matar e subir de novo;
aba abandonada deixa processo vivo. Preguiçosa: nada sobe até mandar; o primeiro envio espera o
adaptador subir; o menu `/` depende de um cache.

**Proposta pra reagir:** preguiçosa, com os comandos no catálogo.

**R:** **preguiçosa.**

**Achado depois da resposta:** o `claude-agent-acp` manda os comandos **assíncronos** depois do
`session/new`, eles dependem do `cwd` (skills do projeto), e o Codex só os manda depois do primeiro
prompt. Então o catálogo guarda comandos **por projeto**, vindos de sessões reais — e a primeira
conversa de um projeto com Codex tem o menu `/` vazio no rascunho, com a dica dizendo por quê.

### [x] Q5 — Onde fica o catálogo de modelos?

**Proposta pra reagir:** em disco, `~/.lumem/_system/`, invalidado pela troca de pino.

**R:** **em disco.**

### [x] Q6 — O primeiro prompt espera o `setup`?

**Proposta pra reagir:** espera, mostrando o progresso; falhou, mostra o erro e pergunta se manda.

**R:** **espera.** Consequência: o encadeamento vai para o daemon (`worktree.start`), com o prompt
pendente gravado na sessão.

### [x] Q7 — Retomar mantém o modelo?

A esteira já reaplica à mão, o que sugere que o `session/load` não restaura.

**Proposta pra reagir:** reaplicar o modelo gravado; sumiu, avisar.

**R:** **reaplica.** A [M2](#x-m2--sessionload-restaura-o-modelo) mede se já era assim.

### [x] Q8 — Em qual modelo a pílula nasce?

**Proposta pra reagir:** o último usado no workspace.

**R:** **o padrão do ACP** — o `currentValue` do `session/new`. ACP inicial `claude`. A
[`008` O14](../008-onboarding/open-questions.md) continua *fora*.

### [x] Q9 — Anexo (`+`) e sugestões de contexto entram na v1?

**Proposta pra reagir:** fora da v1.

**R:** **fora da v1, mas é bem importante.** Os dois estão no [backlog](../../project/backlog.md) §B,
marcados como importantes, com o gatilho *"a v1 das duas telas entregue"*.

### [x] Q10 — A pílula mostra o *effort*?

**Proposta pra reagir:** quando o ACP expõe; some quando não.

**R:** **isso.** A [M1](#x-m1--o-claude-expõe-effort) mede o Claude.

### [x] Q11 — `agent_config` continua existindo?

**Proposta pra reagir:** fica, sem `transport`.

**R:** **fica.** Sessões, custo e esteira continuam apontando para ela, e a config aposentada é linha
histórica.

---

## Medições da Fase 0

Medidas pela T2 em **2026-09-24**, sem nenhum `session/prompt`. Os números, com as tabelas, estão
na [PRD §5](prd.md#5-medições-fase-0).

### [x] M1 — O Claude expõe *effort*?

O Codex expõe `reasoning_effort` (categoria `thought_level`). O `claude-agent-acp@0.75.1`, a medir
no `configOptions` do `session/new`.

**R (medido):** **expõe.** id `effort`, categoria `thought_level`, choices `default`, `low`,
`medium`, `high`, `xhigh`, `max`; aqui nasceu em `xhigh`, que é o `effortLevel` do
`~/.claude/settings.json` desta máquina, e não um padrão do adaptador — como o `opus[1m]` do
modelo, que é o `settings.model` dela: o *"padrão do ACP"* da [Q8](#x-q8--em-qual-modelo-a-pílula-nasce)
é a configuração local de quem roda o daemon (no Codex, o `config.toml`). A pílula de *effort* da
[Q10](#x-q10--a-pílula-mostra-o-effort) **aparece para o Claude**, pelo mesmo caminho que para o
Codex (`thought_level`).

**Achado que a Q10 não previa:** a opção **depende do modelo**. `haiku` não tem `effort`; `sonnet`
e `claude-fable-5-1[1m]` têm `effort` e perdem `fast`; o Codex muda as **choices** do
`reasoning_effort` por modelo (`gpt-5.5` vai até `xhigh`; `gpt-6-astra` chega a `ultra`). Então o
catálogo alimentado só pelo `session/new` conhece o *effort* **do modelo padrão**, e não o do modelo
escolhido na pílula — ver a [M1a](#--m1a--o-catálogo-guarda-effort-por-modelo).

### [x] M1a — O catálogo guarda *effort* por modelo?

Derivada da M1. O `session/new` devolve as opções de um modelo só — o padrão. Escolher
`haiku` na pílula do rascunho mostraria um *effort* que não existe, e escolher `gpt-6-astra`
esconderia `max` e `ultra`.

**R (decidido em 2026-09-24):** **o catálogo guarda por modelo.** O probe percorre os modelos com
`set_config_option` (grátis — é o que a T2 fez, uma chamada por modelo) e grava as opções de
*effort* por modelo no `AdapterCatalog`. A pílula do rascunho lê do modelo escolhido, não do padrão.
Afeta T7, T8 e a pílula (F3.3).

### [x] M2 — `session/load` restaura o modelo?

Trocar o modelo por `set_config_option`, matar a sessão, `session/load`, ler o `configOptions`. Nos
dois adaptadores.

**R (medido):** **não restaura, em nenhum dos dois.** A troca por `set_config_option` vive só na
memória do processo, e o que volta no `session/load` é a configuração **local do usuário**:

- **Claude:** o `settings.model` do `~/.claude/settings.json`, quando existe (aqui, `opus[1m]` — e o
  adaptador ainda chama `setModel` por cima do modelo do transcript); sem ele, o modelo da última
  resposta real do transcript. Trocado para `haiku` e recarregado ⇒ `opus[1m]` com a config desta
  máquina, `claude-sonnet-4-6` (o do transcript) com uma config isolada. Nunca `haiku`.
- **Codex:** o `model`/`model_reasoning_effort` do `~/.codex/config.toml`, sempre. Thread com o
  último turno em `gpt-5.6-luna`, trocada para `gpt-6-astra`/`high` ⇒ recarregada em
  `gpt-5.5`/`medium`. Nem o último turno sobrevive.

Consequência: a T11 **não** é no-op — sem ela, toda retomada volta ao padrão local. Reaplicar
funciona (`set_config_option` aceito na sessão recém-carregada, nos dois). O *effort* volta ao padrão
pela mesma regra (`xhigh` no Claude, `medium` no Codex), que é exatamente o gatilho do item
*"Retomar reaplica o effort"* que a T24 leva ao backlog.

**Achado de brinde:** `session/load` de uma conversa que **nunca recebeu um turno** falha — Claude
`Resource not found`, Codex `Internal error`. Nenhum dos dois grava a conversa antes do primeiro
prompt. Ver a [M2a](#--m2a--e-a-sessão-com-prompt-pendente-que-o-daemon-perdeu).

### [x] M2a — E a sessão com prompt pendente que o daemon perdeu?

Derivada da M2. A [Q6](#x-q6--o-primeiro-prompt-espera-o-setup) grava o prompt pendente
numa sessão criada **antes** do `setup` terminar. Se o daemon cair nesse intervalo (o teto é 10
min), a sessão existe na linha e **não tem turno** — então retomá-la por `session/load` falha pela
M2.

**R (decidido em 2026-09-24):** **retomar vira `session/new` com o mesmo modelo.** A sessão sem
turno não tenta `session/load` (que falharia); o daemon abre uma sessão nova, reaplica o modelo
gravado, e tenta mandar o prompt pendente de novo pela mesma máquina de estados da T12. Afeta T11 e
T12.

### [x] M3 — Quanto custa abrir?

`spawn` / `initialize` / `session/new` em ms, três rodadas por adaptador — é o tempo do *"abrindo
<agente>…"* do rascunho.

**R (medido):** **Claude ~2,5–4,4 s, Codex ~0,2–0,5 s.** Total do `probe`, três rodadas:

| | diretório vazio | este checkout |
|---|---|---|
| Claude | 3070 / 2781 / 2483 ms | 4224 / 4391 / 2893 ms |
| Codex | 390 / 182 / 185 ms | 466 / 198 / 195 ms |

No Claude, 92–96% é `session/new` (2328–4066 ms); `initialize` fica em 149–363 ms e `spawn` em 1–5
ms. No Codex a primeira rodada é a fria (390 ms) e as seguintes ~185 ms. O *"abrindo claude…"* do
rascunho é visível — segundos, não um piscar — e o do Codex quase não aparece.
