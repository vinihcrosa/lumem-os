# Agente é sempre ACP — perguntas

**PRD:** [prd.md](prd.md) · **Decisão:** [ADR de 2026-09-24](../../adr/2026-09-24-1620-agent-is-always-acp.md)

**Estado:** 12 perguntas de produto · **12 respondidas** (2026-09-24, Vinicius, uma por vez) · 3
medições da Fase 0 (M1–M3) **abertas** até a T2.

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

**R:** **reaplica.** A [M2](#--m2--sessionload-restaura-o-modelo) mede se já era assim.

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

**R:** **isso.** A [M1](#--m1--o-claude-expõe-effort) mede o Claude.

### [x] Q11 — `agent_config` continua existindo?

**Proposta pra reagir:** fica, sem `transport`.

**R:** **fica.** Sessões, custo e esteira continuam apontando para ela, e a config aposentada é linha
histórica.

---

## Medições da Fase 0

### [ ] M1 — O Claude expõe *effort*?

O Codex expõe `reasoning_effort` (categoria `thought_level`). O `claude-agent-acp@0.75.1`, a medir
no `configOptions` do `session/new`.

### [ ] M2 — `session/load` restaura o modelo?

Trocar o modelo por `set_config_option`, matar a sessão, `session/load`, ler o `configOptions`. Nos
dois adaptadores.

### [ ] M3 — Quanto custa abrir?

`spawn` / `initialize` / `session/new` em ms, três rodadas por adaptador — é o tempo do *"abrindo
<agente>…"* do rascunho.
