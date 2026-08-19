# Perguntas em aberto — Lumem-OS

> **Como usar:** responda embaixo de cada pergunta, no campo `**R:**`. Quando responder, mude o status para `[x]`.
> Perguntas novas entram no fim de cada seção com numeração contínua. Nada é apagado — perguntas respondidas viram registro de decisão.
>
> Rodada atual: **R1** (pré-pesquisa das referências)

---

## Índice de rodadas

| Rodada | Origem | Perguntas |
|---|---|---|
| R1 | Leitura do `resume.md` | Q001–Q028 |
| R2 | Estudo das referências (compozy / superset / conductor) | Q029–Q096 |

**Tags de origem na R2:** `[cz]` compozy · `[ss]` superset · `[cd]` conductor · `[×N]` levantada por N referências independentes (sinal forte).

---

## A. Escopo e propósito

### [ ] Q001 — Qual é a dor #1 que o Lumem-OS tem que matar?
Você disse "quero satisfazer minhas dores com desenvolvimento com IA". Se o projeto só resolvesse **uma** coisa e nada mais, qual seria? Isso define o que é MVP e o que é "depois".
Opções pra reagir: (a) perder contexto entre projetos; (b) gerenciar N agentes em paralelo sem virar caos; (c) tarefas atravessando front/back; (d) o agente não aprender nada de uma sessão pra outra; (e) outra.

**R:** Isso é muito dificil de responder, são muitos problemas, muitas coisas que eu quero implementar que não tem nas outras plataformas, o Lumem precisa ter praticamente tudo que o superset tem, o que eu diria que seria o primeiro ponto de ruptura é a parte dos workspaces, dessa forma

### [x] Q002 — Lumem-OS é um harness ou um orquestrador em cima de harnesses?
Ou seja: ele **é** o loop de agente (você implementa o loop de tool-calling, contexto, etc), ou ele **dirige** o Claude Code / Codex / outros CLIs que já existem, tratando cada um como um processo caixa-preta?
Isso muda tudo: modelo de dados, streaming, controle de contexto, custo de manutenção.

**R (2026-08-17):** **orquestrador — dirige agentes existentes, por ACP.** Respondida junto com a
Q029/Q030/Q031; o registro está em [pty-vs-acp.md](pty-vs-acp.md).

### [ ] Q003 — Só você usa, ou outras pessoas usam um dia?
Projeto pessoal ≠ single-user. Se um dia tiver 2 usuários no mesmo servidor, isso muda auth, isolamento e modelo de dados desde o início. Vale pagar esse preço agora, depois, ou nunca?

**R:**

### [ ] Q004 — Qual o critério de "funcionando"?
O que precisa acontecer pra você largar o Conductor/Superset e usar o Lumem no dia a dia? Descreva o cenário concreto ("consigo abrir 3 worktrees do lorebase e...").

**R:**

---

## B. Hierarquia e modelo de dados

### [ ] Q005 — Workspace pode ter projeto compartilhado com outro workspace?
Ex.: um repo de `design-system` que serve dois produtos. É N:N (projeto pertence a vários workspaces) ou 1:N (projeto pertence a um workspace só)? N:N complica muito o escopo de memória.

**R:**

### [ ] Q006 — Existe algo acima de workspace?
Tipo "org" ou "conta". Ou workspace é a raiz e ponto final?

**R:**

### [ ] Q007 — Worktree é o mesmo que "sessão de agente"?
Cenários: (a) 1 worktree = 1 agente = 1 tarefa, sempre; (b) várias sessões de agente na mesma worktree ao longo do tempo; (c) vários agentes simultâneos na mesma worktree. Qual você quer suportar?

**R:**

### [ ] Q008 — Projeto tem que ser sempre repositório git?
E monorepo com vários apps — é 1 projeto ou N projetos? E projeto sem git (pasta de docs, notas de produto do workspace)?

**R:**

### [ ] Q009 — Onde vivem as worktrees no disco?
(a) dentro do repo (`repo/.worktrees/x`); (b) num diretório central do Lumem (`~/.lumem/worktrees/<projeto>/<id>`); (c) você escolhe por projeto. Impacta `.gitignore`, backup, e ferramentas que escaneiam a pasta do repo.

**R:**

### [ ] Q010 — O que acontece com a worktree quando a tarefa termina?
Apaga automático? Arquiva? Deixa pra você limpar manual? Merge automático? E se tiver mudanças não commitadas?

**R:**

---

## C. Tarefas

### [ ] Q011 — Tarefa é a unidade central do sistema, ou é acessório?
Tudo passa por uma tarefa (agente nunca roda sem tarefa), ou dá pra só "abrir um agente e conversar" sem cerimônia? O segundo caso é o que mais se usa no dia a dia; o primeiro é o que dá rastreabilidade.

**R:**

### [ ] Q012 — Tarefa criada por agente para outro projeto: entra direto ou passa por você?
Você citou o fluxo "agente percebe que outro projeto precisa mudar e cria a tarefa lá". Isso vai direto pro backlog do outro projeto, ou cai numa fila de triagem sua? Sem triagem, o backlog vira lixão de sugestões de LLM.

**R:**

### [ ] Q013 — Tarefas do Lumem substituem ou espelham ClickUp/Jira/Linear?
Você já usa ClickUp. Duas fontes de verdade é uma dor conhecida. Opções: (a) Lumem é a fonte de verdade; (b) Lumem espelha/sincroniza; (c) Lumem só referencia por link.

**R:**

### [ ] Q014 — Existe dependência entre tarefas?
"Task B só começa quando A mergear" — precisa disso no v1, ou é over-engineering agora?

**R:**

### [ ] Q015 — Quem escolhe qual agente pega qual tarefa?
(a) você aponta manualmente; (b) fila e o primeiro agente livre pega; (c) roteamento por tipo de tarefa/skill do agente.

**R:**

---

## D. Memória e self-learning

> **Estas perguntas ganharam feature.** O desenho está em
> [prd/workspace-memory/prd.md](../prd/workspace-memory/prd.md) e as perguntas refinadas, com proposta
> pra reagir em cada uma, em [open-questions.md](../prd/workspace-memory/open-questions.md). As
> Q016–Q021 continuam valendo como registro; quando uma delas for respondida lá, anote nos dois
> arquivos — é a mesma regra da [seção G.3](#g3-memória-e-self-learning).

### [x] Q016 — O que exatamente o sistema deve aprender?
Marque tudo que quiser: convenções de código do projeto; comandos que funcionam (build/test/lint); arquitetura e onde ficam as coisas; suas preferências de estilo de resposta; erros que já cometeu e não pode repetir; conhecimento de produto/domínio; processo do time (como abre PR, formato de commit); performance/qualidade dos próprios agentes.

**R:** respondida pela feature — [§3 do PRD](../prd/workspace-memory/prd.md): três naturezas, **fato**, **procedimento** e **contrato**, com taxonomia fechada de 7 tipos na [PR 02](../prd/workspace-memory/tasks.md). Não é um balde só chamado "memória".

### [x] Q017 — O aprendizado é automático ou curado?
(a) o agente escreve na memória sozinho quando acha relevante; (b) tudo que ele aprende vira proposta que você aprova; (c) híbrido — automático por projeto, curado por workspace (workspace é conhecimento mais caro de errar).

**R:** respondida pela feature — **(c) híbrido**, e é a assimetria que sustenta o desenho ([§1 do PRD](../prd/workspace-memory/prd.md)): o que é barato de errar (projeto) pode ser automático; o que é caro de errar (workspace) entra como **proposta** na inbox e passa por você ([Q27](../prd/workspace-memory/open-questions.md): `domain`, `process` e `contract` escritos por agente viram proposta; `project` e `reference` vão direto).

### [x] Q018 — Como a memória evita virar lixo?
Memória que só cresce degrada o contexto. Precisa de: decay temporal? contagem de uso? revisão periódica? contradição detectada resolve como? Ou você prefere memória append-only e limpa na mão?

**R:** respondida pela feature — **sinal de uso** (`recall_count`, `last_recalled_at`, score) na [PR 04](../prd/workspace-memory/roadmap.md) e poda por **uso medido**, não por decay cego. Teto não é o mecanismo: a [D5](../prd/workspace-memory/context-delivery.md) decidiu **sem teto no núcleo** — cortar diretriz no meio produz regra errada, não regra menor — e pôs **marca d'água** medida e visível no lugar. Contradição resolve por **shadow, nunca merge** — ver Q020.

### [x] Q019 — Formato da memória: arquivos markdown versionados ou banco?
(a) markdown no repo (versionado, revisável em PR, o time vê); (b) markdown fora do repo (`~/.lumem/memory/...`, privado seu); (c) banco + embeddings (busca semântica, mas opaco); (d) combinação.

**R:** respondida pela feature — **(b) markdown fora do repo**, em `~/.lumem/`, com o **banco derivado e reconstruível** por `reindex` (premissas A1–A4 de [tasks.md](../prd/workspace-memory/tasks.md)). E o `~/.lumem` é **versionado por git pelo próprio Lumem** ([Q36](../prd/workspace-memory/open-questions.md)), o que devolve o histórico sem devolver o lixo ao repositório. Só o `id` do projeto fica dentro do repo, em `.lumem/project.toml` ([Q3.1](../prd/workspace-memory/open-questions.md)).

### [x] Q020 — Memória de workspace vs projeto: como resolve conflito?
Se o workspace diz "sempre use camelCase" e o projeto diz "esse repo é snake_case", quem ganha? Precedência fixa (mais específico ganha) ou explícita?

**R:** respondida pela feature — **precedência fixa por especificidade, e shadow em vez de merge** ([§7 do PRD](../prd/workspace-memory/prd.md)): projeto > workspace > global, identidade `(tipo, slug)`. O perdedor continua no disco e o sombreamento vira evento. Nada é concatenado em silêncio.

### [x] Q021 — Aprender sobre "o comportamento do usuário" — até onde?
Isso é potencialmente invasivo (grava tudo que você faz). Qual o limite confortável: só o que você aprova/rejeita nos diffs? suas correções em cima do agente? seus prompts? tudo?

**R:** respondida pela feature, e os dois eixos que a pergunta mistura têm respostas diferentes. **Captura:** a transcrição da sessão é gravada **inteira** — a [A6 da acp-sessions](../prd/acp-sessions/open-questions.md) fechou em "guarda tudo, o custo é baixo", medido em 3,9 GB/ano nas suas próprias transcrições. **Memória:** nada disso vira memória sozinho. O limite não está na captura, está no **portão** ([§7 do PRD](../prd/workspace-memory/prd.md)): proveniência obrigatória, `WHAT_NOT_TO_SAVE`, e o §10 lista **"dump de transcript"** entre o que *nunca* é capturado como memória. Tudo que passa é auditável e reversível por `git revert`. Se o desconforto for com a **gravação** e não com a memória, é a A6 que precisa reabrir, não esta.

---

## E. Git e integrações

### [ ] Q022 — Abstração de git host: qual o nível?
(a) interface comum mínima (listar PRs, criar PR, status de CI) com adapters GitHub/GitLab; (b) recurso completo por host (reviews, comentários inline, threads); (c) só GitHub no v1 e a abstração fica pra depois.
O (b) é onde a maioria dos projetos morre de escopo.

**R:**

### [ ] Q023 — O Lumem mexe no git sozinho?
Ele commita? Faz push? Abre PR sem perguntar? Faz merge? Ou toda ação que escreve no remoto é confirmação sua?

**R:**

### [ ] Q024 — Quais integrações são realmente necessárias no v1?
GitHub, GitLab, ClickUp, Teams, CI... ou nada disso e o v1 é só git local + agentes?

**R:**

---

## F. Arquitetura e stack

### [ ] Q025 — Servidor roda onde?
(a) local, no seu Mac, como daemon; (b) numa VPS/homelab, e você conecta de vários lugares; (c) local mas preparado pra remoto depois. Você já tem Portainer/k8s à mão, o que torna (b) plausível.

**R:**

### [ ] Q026 — Se o servidor é remoto, o código vive onde?
Agente precisa do repo em disco. Se o servidor é remoto, ou o repo tá lá (e seu editor local não vê), ou tem agente local conectado ao servidor. Qual modelo?

**R:**

### [ ] Q027 — Qual o cliente principal?
(a) TUI/CLI; (b) app desktop; (c) web; (d) CLI primeiro, UI depois. E: um cliente ou vários falando com a mesma API?

**R:**

### [ ] Q028 — Stack: qual linguagem pro servidor e por quê?
Critérios que importam aqui: você mantém sozinho, precisa spawnar/supervisionar processos, precisa de streaming, e precisa que seja gostoso de mexer daqui a 6 meses.

**R:**

---

## G. Rodada R2 — pós-pesquisa das referências

Consolidação das 80 perguntas levantadas pelos três estudos, deduplicadas em 68.

### ⚠️ As 8 que travam o resto

Se você responder só oito, responda estas — cada uma trava um bloco inteiro de decisões e é cara de reverter depois:

| # | Pergunta | Trava |
|---|---|---|
| Q029 | Implementar o loop de agente ou dirigir CLIs existentes? | modelo de dados, streaming, custo de manutenção — tudo |
| Q041 | Uma task pode gerar worktrees em N projetos? Como fica o review? | o conceito que nenhuma referência tem; é o seu diferencial |
| Q051 | Memória de projeto vive dentro ou fora do repo? | todo o design de self-learning |
| Q069 | Qual o sinal canônico de "tarefa concluída"? | se existe orquestração durável ou é grep de tela |
| Q083 | Container por worktree, ou worktree pelada? | isolamento de runtime — a queixa nº 1 da categoria |
| Q032 | Fronteira estado-no-banco × estado-em-arquivo. Tarefas ficam onde? | schema, sync, o que é revisável em PR |
| Q093 | Qual o cliente principal? | multi-host, terminal nativo, custo de build |
| Q095 | Otimizar pra 5 agentes ou 50? | são dois produtos diferentes |

---

### G.1 Arquitetura fundacional

#### [x] Q029 — Você implementa o loop de agente ou dirige agentes existentes? `[cz][ss][cd] [×3]`
As três referências escolheram **dirigir**, nenhuma implementa o loop. Ganham: zero manutenção de tool-calling, N providers de graça, billing resolvido pelo provider. Perdem: controle fino de contexto e streaming, e degradação invisível quando o CLI fala o protocolo mal.
É a decisão mais cara de reverter. *(responde Q002)*

**R (2026-08-17):** **dirigir** — como as três referências. O Lumem não implementa loop de agente.
Registro em [pty-vs-acp.md](pty-vs-acp.md).

#### [x] Q030 — Se dirige: por qual transporte? `[cz][ss][cd]`
Cada referência escolheu um: **PTY declarativo** (superset — `command`/`args`/`prompt_transport`/`resume_args`, 14 agentes, zero código por agente), **ACP** (compozy — protocolo estruturado, 26 providers), **SDK** (conductor — controle total da UI, mas amarrado a um vendor).
PTY é o denominador comum universal; ACP/SDK dão estrutura. Suportar mais de um dobra superfície.

**R (2026-08-17):** **ACP**, com PTY mantido como caminho de primeira classe — `transport` é coluna
de `agent_config`, não bandeira. Sessão de shell continua sendo PTY de qualquer jeito, e ele é a
saída se o billing do caminho ACP mudar. O estudo inteiro, com o custo medido e os riscos que a
pesquisa achou depois, está em [pty-vs-acp.md](pty-vs-acp.md) §9.

#### [x] Q031 — Suportar modo estruturado **e** TUI puro na mesma casca? `[cd]`
O Conductor usa SDK e ficou exposto quando a Anthropic passou a cobrar SDK como API (usuários citando *"$1k/month"*). A saída deles foi um TUI embutido — que mata a UI que era o valor do produto.
Se a casca de gerenciamento (worktree, diff, checks, PR, task) funcionar por cima de qualquer um dos dois, você resolve o risco de billing e a queixa *"perdi o feel do Claude Code"* de uma vez. Vale desenhar assim desde o início?

**R (2026-08-17):** **sim** — e essa pergunta ficou profética. A Q030 fechou em ACP, e o mesmo risco
que derrubou o Conductor apareceu na pesquisa: pelo caminho ACP a autenticação por assinatura pode
não valer, e a Anthropic já anunciou (e cancelou) uma separação de pools de billing para uso via
Agent SDK. Por isso a decisão manteve `transport` como **coluna**: a casca funciona por cima dos
dois, e voltar uma sessão para PTY é config, não refactor. Ver [pty-vs-acp.md §9.2](pty-vs-acp.md).

#### [ ] Q032 — Qual a fronteira entre "estado no banco" e "estado em arquivo no repo"? `[cz]`
O Compozy põe no repo: `workspace.toml`, `AGENT.md`, `SKILL.md`, `loop.yaml`, memória. No banco: tasks, runs, eventos, sinais. Regra implícita: *o que o humano edita fica em arquivo*.
Você adota a mesma regra? E principalmente: **tarefas ficam onde?**

**R:**

#### [ ] Q033 — Paridade obrigatória cliente ↔ API desde o v1 ("nada só na UI")? `[cz]`
É o que permite um agente operar o Lumem-OS tão bem quanto você — pré-requisito pra delegação real. Custa disciplina em toda feature. *(refina Q027)*

**R:**

#### [ ] Q034 — Um SQLite por sessão, ou banco único? `[cz]`
Compozy separa (`~/.compozy/sessions/<id>/events.db`): isolamento de I/O, purge trivial, zero contenção de write lock. Custa N arquivos abertos e query cross-sessão cara — que é justamente o insumo do self-learning.

**R:**

#### [ ] Q035 — O servidor roda 100% autônomo, sem conta? `[ss]`
O Superset **exige login mesmo com `--local`** — control plane é Postgres na nuvem, sem self-host. Se o Lumem-OS pode rodar offline, o que (se algo) fica na nuvem, e como resolver identidade de projeto entre hosts sem registro central? *(refina Q025)*

**R:**

#### [ ] Q036 — Multi-usuário: um servidor+DB por org, ou tenancy no schema? `[ss]`
Decide se trocar de workspace/org é trocar de processo. *(refina Q003)*

**R:**

#### [ ] Q037 — Autorização mora na rota ou no listener? `[cz]`
O Compozy monta inventários de rota diferentes por superfície (loopback sem auth, gateway com device token, ingress só webhooks) — assim é impossível esquecer o middleware numa rota nova. Se o servidor vai ser remoto, essa decisão é agora.

**R:**

#### [ ] Q038 — `create` idempotente com `id` cunhado pelo cliente? `[ss]`
`id` do cliente + resposta `alreadyExists` + lock por chave lógica. Decide se a UI pode pintar otimista e se um agente pode dar retry cego numa criação.

**R:**

#### [ ] Q039 — `create` síncrono, enfileirado, ou os dois? `[ss]`
Superset expõe os dois: síncrono pra CLI/agente, enfileirado com evento `settled` pra UI. Se houver proxy remoto com cap de request, a decisão é forçada.

**R:**

#### [ ] Q040 — Pontos de extensão: hooks deny-only, ou plugin com poder total? `[cz]`
Compozy deixa hooks reescreverem quase tudo mas **nunca alargarem permissão** (4 guards). Barato de impor no começo, caro de retrofitar.

**R:**

---

### G.2 Hierarquia, projeto, worktree, identidade

#### [ ] Q041 — Uma task pode gerar worktrees em **múltiplos projetos**? E como fica o review? `[cd][ss] [×2]`
O agente do Conductor chamou isso de "provavelmente a decisão de arquitetura mais consequente do projeto".
Suas tasks vivem no workspace, e workspace é multi-repo. Então uma task pode tocar front + back ao mesmo tempo. Se pode: o review é **um PR por projeto** (simples, mas você perde a visão do todo) ou **um diff agregado cross-repo** (o que nenhuma referência tem)? E como se coordena merge de dois PRs que só funcionam juntos?

**R:**

#### [ ] Q042 — Onde vive o workspace se seus projetos estão em hosts diferentes? `[ss]`
Nenhuma das três referências tem agrupamento multi-repo — `workspace_sections` do Superset é só pasta visual. Se o workspace guarda tarefas, memória, secrets e config compartilhados, ele é entidade de nuvem, de host, ou replicada? *(refina Q005)*

**R:**

#### [ ] Q043 — Qual a chave estável de identidade do projeto? `[cz]`
Compozy grava ULID em `<repo>/.compozy/workspace.toml` pra sobreviver a `mv`. Candidatos: path (quebra ao mover), remote URL (quebra em repo local, fork, múltiplos remotes), ULID em arquivo no repo (entra no git, o time vê). *(refina Q008)*

> **A `workspace-memory` refina esta pergunta** e já decidiu para o escopo dela: `id` em
> `<repo>/.lumem/project.toml`, adotado se existir, gerado com permissão se não, com detecção de fork
> por remote ([Q3.1](../prd/workspace-memory/open-questions.md)). Fica `[ ]` aqui porque a decisão do
> **projeto todo** é mais ampla que a da feature — se esta fechar diferente, a da feature segue.

**R:**

#### [ ] Q044 — Worktree é entidade gerenciada pelo Lumem-OS, ou responsabilidade do agente? `[cz]`
**Dado relevante: o Compozy tentou e desistiu** — v0.2 tinha worktrees, v0.3 marcou "Deferred". Se o Lumem-OS gerencia, precisa de: criação, naming, GC, política pra mudanças não commitadas, e o que acontece quando você abre no editor. O design doc deles rejeita explicitamente `<repo>/.worktrees/` em favor de `~/.compozy/worktrees/<workspace>/<name>`. *(refina Q009 e Q010)*

**R:**

#### [ ] Q045 — Nome da worktree: dicionário memorável ou slug derivado da task? `[cd]`
O Conductor usa nomes de cidade (295 delas, colisão vira `-v2`) e mantém **três identificadores separados**: diretório (imutável) ≠ branch (o agente renomeia) ≠ título do PR (o que a sidebar mostra). Diretório imutável evita quebrar caminho absoluto no contexto do agente.
Como você já tem ID de task, `<task-id>-<slug>` seria estável **e** legível. Vale abrir mão da graça das cidades?

**R:**

#### [ ] Q046 — Nomeação por IA de branch/título — vale? Com qual credencial? `[ss]`
Superset gera com o CLI do agente (`cwd: tmpdir()`, chaves removidas do env) e depois faz `git branch -m` sem renomear o diretório. Alternativa: nomear antes de criar e aceitar a latência na criação.

**R:**

#### [ ] Q047 — O checkout principal é um worktree especial? `[ss]`
Superset modela `type='main'` com unique index. Decide o que `list`/`delete`/`archive` fazem com ele.

**R:**

#### [ ] Q048 — N sessões de agente por worktree — e como fica o checkpoint? `[cd]`
O Conductor faz checkpoint **por worktree** e a própria doc admite que quebra com múltiplos chats. Se você permite N sessões por worktree (provavelmente deveria), precisa decidir agora: checkpoint por sessão com detecção de conflito, ou lock de revert quando há outra sessão ativa?
Vale ler o `checkpointer.sh` deles (10,7 KB de bash): snapshots em `refs/conductor-checkpoints/*` sem mover HEAD, exit codes semânticos. *(refina Q007)*

**R:**

#### [ ] Q049 — Qual o gate de merge? `[cd]`
Conductor bloqueia por comentários em aberto. Você quer: comentários resolvidos, checks de CI verdes, aprovação humana obrigatória, política configurável por projeto? E quem pode dar override — você, ou o agente também?

**R:**

---

### G.3 Memória e self-learning

> **Estas perguntas ganharam feature.** O desenho está em
> [prd/workspace-memory/prd.md](../prd/workspace-memory/prd.md) e as perguntas refinadas, com proposta
> pra reagir em cada uma, em [open-questions.md](../prd/workspace-memory/open-questions.md). As
> Q050–Q066 continuam valendo como registro; quando uma delas for respondida lá, anote nos dois
> arquivos. A quarta referência ([hermes.md](../references/hermes.md)) nasceu dessa discussão.

> **Contexto:** nenhuma das três referências resolve isso. O Superset não tem nada. O Conductor tem todos os ingredientes (transcripts pesquisáveis em Postgres, prompts versionados por repo) e **não conecta nenhum** — a queixa literal de usuário é *"o agente não tem memória do trabalho anterior, das suas convenções, das decisões passadas"*. Só o Compozy atacou o problema de frente, e é de lá que vem quase toda a mecânica abaixo.

#### [ ] Q050 — Markdown autoritativo ou banco autoritativo? `[cz]`
Compozy: Markdown na fonte + SQLite derivado e **reconstruível** (`reindex` regenera tudo do `.md`), explicitamente anti-vector-DB. Dá diff, revisão e portabilidade; custa pipeline de sync. Banco autoritativo + export é mais fácil de manter consistente e pior de revisar. *(refina Q019)*

**R:**

#### [ ] Q051 — Memória de projeto vive **dentro** do repo (versionada, o time vê) ou **fora** (`~/.lumem`, sua)? `[cz][cd] [×2]`
Compozy põe em `<repo>/.compozy/memory/` — entra no git se você não ignorar. Ótimo pra conhecimento de projeto, péssimo pra preferência pessoal e pra "erros que o agente cometeu".
Proposta pra reagir: aprendizado **de projeto** commitado no repo (herdável pelo time, revisável em PR) e aprendizado **de workspace** + comportamento seu no servidor. *(refina Q019)*

**R:**

#### [ ] Q052 — Qual sua taxonomia fechada de tipos de memória? `[cz]`
Compozy tem 4 (`user`, `feedback`, `project`, `reference`) e **rejeita o resto na fronteira**. Seu caso tem um eixo a mais. Proposta: `user`, `feedback`, `project`, `domain` (produto/negócio, nível workspace), `process` (como o time trabalha, nível workspace), `reference`.
Fecha nisso? E qual o **default de escopo por tipo**?

**R:**

#### [ ] Q053 — Conflito workspace × projeto: shadow ou merge? `[cz]`
Compozy sombreia por identidade `(type, slug)` — mais específico ganha, o outro fica no disco e vira evento. Previsível e explicável. *(responde Q020 com mecanismo concreto)*

**R:**

#### [ ] Q054 — O que dispara a captura de memória? `[cz]`
Do mais barato ao mais caro: (a) só comando explícito; (b) fim de sessão; (c) na compactação de contexto; (d) a cada mensagem persistida (o que o Compozy faz). Cada nível é uma chamada de LLM recorrente a mais. Onde começa, e o que faz subir de nível?

**R:**

#### [ ] Q055 — Sub-agentes e sessões filhas alimentam a memória? `[cz]`
Compozy diz não taxativamente: só a sessão raiz, sub-agente gera chatter operacional. Você concorda, ou tem caso em que o sub-agente é justamente quem descobre a coisa durável?

**R:**

#### [ ] Q056 — WAL de decisões de memória desde o v1? `[cz]`
Compozy grava uma `Decision` com `prior_content`, `rule_trace`, `llm_trace` e `idempotency_key` **antes** de tocar o arquivo. Dá `revert` real, auditoria de "por que essa memória existe" e replay idempotente no boot. Custa uma tabela, um índice parcial e uma etapa de replay.

**R:**

#### [ ] Q057 — Recall lexical (FTS5/BM25) basta, ou embeddings desde o começo? `[cz]`
Lexical é determinístico e de graça, mas não acha "deploy" buscando "release". Embeddings acham, mas trazem não-determinismo, custo de indexação e opacidade. Híbrido (lexical primeiro, embedding como desempate) é opção?

**R:**

#### [ ] Q058 — Como a memória chega no contexto: índice, tool, ou destilada em regras? `[cz][cd] [×2]`
Três desenhos possíveis:
(a) **injeção automática** de top-K no contexto de todo worktree novo — funciona sempre, polui contexto, custa token;
(b) **índice + tool** (Compozy: só o `MEMORY.md` entra no prompt, com header cache-estável por sha256 pra preservar prefix cache; o corpo vem sob demanda) — muito mais barato, mas **depende do agente lembrar de pedir**;
(c) **destilação periódica** por um job em regras versionadas no repo (vira `AGENTS.md`/`CLAUDE.md` que todo agente lê de graça).
Você confia no (b)? Ou (c) + (a) enxuto?

**R:**

#### [ ] Q059 — A memória vale na sessão **atual**, ou só a partir da próxima? `[cz]`
Compozy congela o snapshot no boot e nunca reescreve o prompt entregue — bom pro cache, ruim pro feedback loop. *"Eu corrijo o agente e ele para de errar agora"* exige injeção mid-session, que quebra o prefix cache.

**R:**

#### [ ] Q060 — Aprender de **ações**, não só de transcript? `[cz]`
Esse é o buraco do Compozy: ele extrai do que foi **dito**, não do que foi **feito**. Sinais disponíveis de graça: diff aceito vs rejeitado, quantas vezes você reescreveu o que o agente fez, tempo até você interromper, quais tarefas você cancela.
Muito mais valioso e muito mais invasivo. Até onde? *(refina Q021)*

**R:**

#### [ ] Q061 — Existe consolidação ("dreaming")? O que dispara, e qual o critério de promoção? `[cz]`
Compozy promove por sinal de recall real: `score = 0.30·freq + 0.35·relevância + 0.20·recência + 0.15·frescor`. **Memória nunca recuperada nunca é promovida** — critério objetivo, não o LLM chutando o que é importante.
Gatilho manual, cron, ou portão automático?

**R:**

#### [ ] Q062 — Quem poda a memória? `[cz]`
Compozy **não apaga nada automaticamente** — decay é só de relevância (score, banner, shadow) e a poda real é uma fase de prompt do curador. É aceitável a memória só crescer no disco enquanto o ranking a esconde? *(responde Q018 com modelo concreto)*

**R:**

#### [ ] Q063 — Quem escreve a memória de **workspace**? `[cz]`
Conhecimento de produto e processo é o mais caro de errar e o que mais contamina. Curadoria só sua, proposta do agente + sua aprovação, ou automático igual ao de projeto? *(responde Q017 com o eixo workspace/projeto separado)*

**R:**

#### [ ] Q064 — Um agente do projeto A pode escrever memória que afeta o projeto B? `[cz]`
Sem controle, o agente do backend ensina algo errado pro frontend. Com controle, você vira o gargalo. Meio-termo: escreve como proposta, aplica na consolidação.

**R:**

#### [ ] Q065 — Agentes podem consultar o histórico de outros agentes? Qual o escopo? `[cd][cz] [×2]`
No Conductor o `conductor sql` sobre transcripts é exposto aos agentes no cloud. Isso é exatamente o insumo do self-learning — **e** um vetor de vazamento de contexto entre projetos.
O Compozy tem `workspaceaccess` (`ActorKind` × `Seam` × `Decision`, auditado, fail-closed), mas o consent de sessão vive num map em memória que some quando a sessão para. Qual o default: permitido dentro do mesmo workspace, pede aprovação, ou negado? E a aprovação persiste?

**R:**

#### [ ] Q066 — Como evitar envenenamento? `[ss][cz] [×2]`
Um agente que errou "aprende" o erro e ensina os próximos. O anticorpo mais reusável que apareceu é a regra `WHAT_NOT_TO_SAVE` do Compozy: **"o que dá pra derivar lendo o repositório não é memória"** — e ela vale mesmo quando o usuário pede pra salvar.
Que outros filtros de fronteira você quer? Confirmação por N ocorrências? Só salva o que sobreviveu a um teste/PR mergeado?

**R:**

---

### G.4 Tarefas e orquestração

#### [ ] Q067 — Criar tarefa dispara execução, ou existe fronteira separada de "enfileirar run"? `[cz]`
Compozy separa: `create` grava intenção, `publish/start/approve` enfileira. Esse é exatamente o ponto de triagem natural pra tarefa criada por agente pra outro projeto. Cerimônia útil ou peso morto? *(responde Q011 e Q012 juntos)*

**R:**

#### [ ] Q068 — Fila com lease, ou atribuição manual? `[cz]`
Fila exige lease com deadline, heartbeat, fencing por sessão e recuperação de expiração. Atribuição manual não exige nada disso. Compozy suporta os dois com o invariante duro de **1 lease ativo por sessão**. *(responde Q015)*

**R:**

#### [ ] Q069 — DAG persistido ou convenção de prompt? E **qual o sinal canônico de conclusão**? `[ss]`
O Superset faz por convenção: o coordenador procura a string `SUPERSET_WORKER_DONE` num snapshot de tela, e a própria skill admite que *"não são eventos duráveis"*. Sem DAG não há retry, estado, nem recuperação.
Se for DAG, a pergunta difícil é o sinal de conclusão: exit code do processo? arquivo de resultado escrito pelo agente? comando de verificação rodado pelo servidor? hook `Stop`?
⚠️ O hook `Stop` do Claude Code é fim de **turno**, não de **tarefa** — usar ele é a armadilha óbvia.

**R:**

#### [ ] Q070 — O agente pode declarar **por que** travou, de forma processável? `[cz]`
Blocks tipados mudam o que o sistema faz sozinho: `transient` se auto-limpa, `needs_input` te notifica, `capability` pede credencial. Vale o modelo, ou "status: blocked + texto livre" resolve?

**R:**

#### [ ] Q071 — Quer o *completion claim gate*? `[cz]`
Verificar no banco os side-effects que o agente **afirma** ter feito, e **rejeitar** a conclusão se não bateu. Poucas dezenas de linhas, e é a defesa mais barata contra "criei a task X" quando X não existe. Estender pra commit feito / PR aberta / arquivo alterado?

**R:**

#### [ ] Q072 — Quais guardas de loop entram no v1? `[cz]`
`iteration_cap`, `no_progress.window`, `budget.on_exceeded`, `terminal_states`. Se o agente vai rodar sem você olhando, quais são obrigatórias já — e o que acontece quando estoura: mata, pausa, ou notifica?

**R:**

#### [ ] Q073 — Saída de agente é texto livre ou JSON com schema? `[cz]`
Compozy exige `output_schema` por nó de loop, com `enum` no `status`. Impor em toda execução, ou só em fluxo multi-passo?

**R:**

#### [ ] Q074 — Tasks nativas, espelho read-only, ou sync bidirecional? `[ss]`
Superset faz bidirecional com Linear/GitHub/GitLab — e paga o preço (`sync_error`, `last_synced_at`, resolução de conflito). Você já usa ClickUp. *(refina Q013)*

**R:**

---

### G.5 Execução, falha e recuperação

#### [ ] Q075 — Multi-passo executa o grafo uma vez, ou replaneja a cada iteração? `[cz]`
Compozy replaneja (modelo de gerações): dá tabela de sucessão por causa, ratchet de melhor resultado e retry seletivo, ao custo de complexidade grande. Executar uma vez resolve 90% do "rodar N tarefas em ordem de dependência".

**R:**

#### [ ] Q076 — Qual sua classificação de falha, e o que é retry-elegível? `[cz]`
Compozy fecha em 8 classes e só retenta `transport` e `attempt_timeout`; falha não anotada **sempre escala**, absorção nunca é implícita. Sem lista explícita você vai retentar erro de prompt e erro de autoria — que nunca passam.

**R:**

#### [ ] Q077 — Retry automático de "rodar um agente": ligado ou desligado por default? `[cz]`
Compozy **desliga** (`maxAttempts = 0`) e obriga o autor a declarar. É a diferença entre uma falha custar 1× e custar 3× sem ninguém perceber.

**R:**

#### [ ] Q078 — O que acontece quando o processo do agente morre no meio da tarefa? `[cz]`
(a) marca falha, alguém reinicia do zero; (b) requeue automático (refaz tudo, inclusive o que já foi commitado); (c) **death-resume** — reinjeta a faixa do que já foi feito e manda continuar (Compozy, com limite de 3 mortes seguidas).
Só o (c) não perde nem duplica trabalho, mas exige guardar a sequência de eventos por sessão.

**R:**

#### [ ] Q079 — Guardas de tempo: por tentativa, por tarefa, ou nenhuma? `[cz]`
Compozy tem `timeout` (uma tentativa) e `deadline` (tentativas + backoff), mas **nenhum limite herdado** — agente silencioso roda pra sempre. Teto default por tarefa? E ao estourar: mata, pausa, ou avisa?

**R:**

#### [ ] Q080 — Quem escreve o estado da tarefa: o runtime ou o agente? `[cz]`
No Compozy o `status` no Markdown é escrito pelo próprio agente via prompt, e o `task_run` no banco pelo runtime — duas fontes de verdade que divergem. O agente reporta e o runtime decide, ou o arquivo é a verdade?

**R:**

#### [ ] Q081 — Agendamento faz parte do v1? Qual a política de catch-up? `[cz][ss] [×2]`
Superset terceiriza pra QStash (cron externo + JWT de 300 s + relay; host offline = run perdido, sem tracking de resultado). Compozy resolve exactly-once com fire ID determinístico `hash(jobID + scheduledAt)` + constraint UNIQUE.
E você precisa decidir catch-up (`skip_missed`, `coalesce`, `replay`, `run_once_on_catchup`) — porque "o daemon ficou 3 dias desligado" vai acontecer. *(refina Q024)*

**R:**

#### [ ] Q082 — Protocolo de attach/detach completo desde o início, ou replay simples de buffer? `[ss]`
O Superset faz epoch + seq + ring buffer + repaint nudge, lendo de um **`@xterm/headless` server-side por sessão** (devolve o alt-screen renderizado, não log cru), com `buildPreamble()` pra resync de modos no reattach e `isBracketedPasteActive()` pra framing do send.
Caro de fazer, pior de retrofitar — todo o contrato de wire muda. Vale ler o pty-daemon deles: handoff de fds por herança de stdio (`prepare-upgrade` → spawn do sucessor → snapshot → `upgrade-ack`), que é o que faz sessão sobreviver a upgrade de binário.

**R:**

---

### G.6 Isolamento, permissões e segurança

#### [ ] Q083 — Você resolve isolamento de **runtime**, ou só de código? `[cd][ss] [×2]`
A crítica mais dura e mais repetida contra a categoria inteira: worktree isola *código*, não *runtime* — `.env`, `node_modules`, portas, Docker e bancos continuam compartilhados. As três referências transferem o trabalho pro usuário escrever script.
**Como o seu servidor pode ser Linux, container por worktree vira a opção natural, não a exótica.** Compose isolado, rede própria, volume de deps cacheado. Custa imagem, cold start e complexidade.
Vale ser esta a aposta diferencial? E quem define a política — projeto, workspace, ou tarefa?

**R:**

#### [ ] Q084 — Dependências: reinstalar, symlinkar, ou overlay? Qual o alvo de tempo de criação? `[cd]`
Conductor reinstala: correto, lento, caro em disco. Com container dá pra usar layer cache / volume compartilhado. O alvo é worktree em **10 s** ou em **3 min**? A resposta muda o design inteiro.

**R:**

#### [ ] Q085 — Portas: alocar ou só detectar? `[ss][cd] [×2]`
Superset só **detecta** portas em escuta e rotula — `port_base` é coluna morta, alocação fica com o script do usuário. Conductor **aloca** (`port_forwards` com UNIQUE em `local_port`, servidor é a autoridade).
Alocar faixa por worktree (injetando `$LUMEM_PORT_BASE` no env) resolve o atrito mais citado — mas cria contrato novo com todo repo. E com multi-host, faixa fixa quebra.

**R:**

#### [ ] Q086 — Qual o modelo de permissão do agente sobre filesystem e shell? `[cz][ss] [×2]`
**Todas as referências rodam com aprovação desligada.** Superset: todos os presets com as flags de skip. Compozy: 3 modos, mas o default de fábrica é `approve-all`, o path jail **não cobre o argv de terminal**, e não há sandbox de SO — na prática, exec arbitrário.
Você aceita isso num projeto pessoal, ou quer pelo menos allowlist de comando + path jail real? ⚠️ Nota técnica: matching por ToolID (o que o Compozy faz) **não** consegue expressar "Bash só com prefixo X".

**R:**

#### [ ] Q087 — Aprovações persistem? Com qual granularidade? `[cz]`
Compozy tem grant durável com chave `(workspace, agent, tool, sha256(input))` e 4 níveis de precedência, mas o prompt sempre grava o mais específico. Você quer "sempre permitir esse comando nesse projeto"?

**R:**

#### [ ] Q088 — Precisa de egress policy pro agente? `[cz]`
Compozy tem default-deny com IP pinado no dialer e strip de `Authorization` em redirect — mas **só pro próprio daemon**, não pro subprocesso do agente, que sai pela rede livremente. Se o agente vai ler PR e issue de terceiro, isso importa?

**R:**

#### [ ] Q089 — Conteúdo externo é tratado como **dado, nunca instrução**? `[cz]`
Compozy escaneia prompt injection e runas invisíveis antes de persistir, e escaneia até conteúdo de skill, bloqueando o load em finding crítico. v1 ou risco aceitável num setup single-user?

**R:**

#### [ ] Q090 — Empacotar os binários dos agentes, ou usar o PATH do usuário? `[cd]`
Conductor empacota e é enfático (*"não atualize nem modifique"*): elimina bug de compatibilidade, custa **664 MB** nesta máquina, e quebra quem tem MCP/config custom no PATH. Com servidor centralizado você empacota uma vez por servidor — isso muda a conta a seu favor?

**R:**

#### [ ] Q091 — Quantas camadas de config pro `setup`? `[ss]`
Superset resolve em 3 camadas (repo → worktree → `~/.superset/projects/<repo-path>/`) + overlay `config.local.json` com `{before, after}`, merge por chave. Setup roda em terminal visível, teardown em PTY invisível — mesma primitiva, paridade total de ambiente.
Cada camada é uma linha de suporte a mais quando o setup falha. Copiar as 3, ou simplificar pra repo + local?

**R:**

---

### G.7 Multi-host

#### [ ] Q092 — Hosts registrados com afinidade de worktree? E como resolve port forwarding remoto? `[ss][cd] [×2]`
Superset usa relay reverso; Conductor foi de local puro → local + cloud sandbox, com ponte `RunLocalCommand` (a nuvem chama o Mac). Opções: relay próprio, Tailscale/WireGuard, SSH, ou combinação.
⚠️ Forwarding de porta de host remoto é limitação **declarada** do Superset — ninguém resolveu. Se você quer "abrir no editor" e "ver o preview" com o código em outra máquina, isso precisa de resposta cedo. *(refina Q026)*

**R:**

---

### G.8 Cliente e UX

#### [ ] Q093 — Qual o cliente: web, desktop, TUI, ou híbrido? `[ss][cd] [×2]`
Conductor é **Tauri v2** (não Electron — mito do HN desmentido): binário arm64 único de 66 MB, WebKit do sistema, terminal nativo via `alacritty_terminal`. Superset é Electron e paga em memória.
Web dá multi-plataforma de graça e cai naturalmente no multi-host, mas você perde terminal nativo, notificação do SO, "abrir no editor", deep link e acesso ao filesystem local. Híbrido (web pra acompanhar, desktop pra trabalhar) vale a manutenção dupla? *(refina Q027)*

**R:**

#### [ ] Q094 — Adotar a fila "próximo que precisa de atenção"? E quanto do modelo de inbox? `[cd]`
O `⌥L` do Conductor é a primitiva que faz paralelismo escalar: transforma supervisão de N agentes em **fila**, não em dashboard. Se você trouxer uma coisa só de UX das três referências, é essa.
O modelo completo deles (unread + pinned + important + assignee + watchers + following) é bastante máquina de estado. Só `unread` + "próximo que precisa de atenção" entrega 80%. O resto só vale com multiplayer — que não está no seu escopo.

**R:**

#### [ ] Q095 — Otimizar pra 5 agentes simultâneos ou pra 50? `[cd]`
Os dados do estudo: **3–5 é confortável, 10–20 só pra quem domina o codebase, e o gargalo é revisão humana, não compute.**
Otimizar pra 5 (foco, fila, diff excelente) é um produto. Otimizar pra 50 (dashboard, agregação, auto-merge, confiança sem ler) é outro. Escolher errado aqui desperdiça meses.

**R:**

---

### G.9 Produto (baixa prioridade — projeto é pessoal)

#### [ ] Q096 — Onde fica a fronteira cliente/servidor, considerando o que é monetizável? `[cd]`
O Conductor virou freemium: local grátis, **cloud + colaboração pagos**. A lição é que a fronteira monetizável é **colaboração e execução remota**, não orquestração local.
Você disse que não tem pretensão comercial — então isso só importa como sanidade de design: se um dia mudar de ideia, a fronteira estará no lugar certo de graça?

**R:**
