# Comparativo das referências

> **O que este arquivo é:** um índice navegável e uma matriz factual dos três estudos. **Não tem opinião nem decisão** — isso é seu, e vai sair das respostas do [questions.md](../project/questions.md).
>
> Documentos completos: [compozy.md](compozy.md) (2.399 linhas) · [superset.md](superset.md) (~1.785) · [conductor.md](conductor.md) (1.521)
>
> **Quarta referência, fora desta matriz:** [hermes.md](hermes.md) — estudo de recorte estreito (só
> memória, aprendizado e curadoria), feito depois, para a feature
> [workspace-memory](../prd/workspace-memory/prd.md). Ele não entra nas tabelas abaixo porque não foi
> auditado nos mesmos eixos; o que ele tem de próprio está no §11 dele, que é a divergência
> Compozy × Hermes lado a lado.
>
> `⚠️` = não confirmado no estudo · `—` = não existe / não se aplica

---

## 1. Identidade dos três

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| O que é | Daemon local que dirige CLIs de agente | Orquestrador de agentes de terminal | App Mac de worktrees paralelas |
| Licença | Open source | Elastic License 2.0 | Proprietário, freemium |
| Preço | Grátis | ⚠️ conta obrigatória | Local grátis; cloud + colaboração pagos |
| Cliente | ⚠️ daemon + CLI (Go) | Electron | **Tauri v2** (não Electron) |
| Código lido? | Sim, repo clonado | Sim — source maps do `app.asar` + repo público | Parcial — bundle + SQLite local |
| Foco do estudo | **Memória / self-learning** | **Multi-agente, multi-host, PTY** | **UX de paralelismo** |

---

## 2. Arquitetura e estado

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Modelo | Daemon local | Cliente + control plane na nuvem | App + sidecar local **+ servidor** |
| Servidor local | Sim | Host daemon | Sidecar **Bun** em `127.0.0.1:<efêmera>` |
| Control plane | — | **Postgres na nuvem, sem self-host** | Postgres (migrou de local-only) |
| Storage local | Markdown + SQLite **por sessão** (`events.db`) | SQLite | SQLite como cache |
| Roda sem conta? | Sim | **Não** — exige login mesmo com `--local` | Local sim |
| Sinal de migração | — | — | Tabelas `repos`/`workspaces`/`sessions` **com 0 linhas** locais; `session_messages` com 91.275 |

> **Leitura cruzada:** o Conductor já andou o caminho local → server-first e deixou o rastro no banco. Compozy fica local. Superset nasceu cloud. Três respostas diferentes pra mesma pergunta (Q035).

---

## 3. Hierarquia de entidades

| | **Compozy** | **Superset** | **Conductor** | **Lumem-OS (pretendido)** |
|---|---|---|---|---|
| Hierarquia | Workspace = **1 diretório** (nem precisa ser git) | `Org > Host > Projeto > Workspace` | `Repo > Workspace` | `Workspace > Projeto(repo) > Worktree` |
| "Workspace" significa | diretório de trabalho | **o worktree** | **o worktree** | **conjunto de projetos** |
| Agrupamento multi-repo | **—** | **—** (`workspace_sections` é só pasta visual) | **—** (resolve mal com `/add-dir`) | **é o ponto** |
| ID estável do projeto | ULID em `.compozy/workspace.toml` | ⚠️ registro no control plane | ⚠️ | Q043 |
| Nome do worktree | — | gerado por IA + `git branch -m` | **cidade** (295, colisão `-v2`) | Q045 |
| Identificadores separados | — | ⚠️ | **3**: diretório (imutável) ≠ branch ≠ título do PR | Q045 |

> **O achado que mais importa:** nenhuma das três tem a camada de agrupamento multi-repo. É o conceito central do `resume.md` e não existe em lugar nenhum pra copiar. Ver Q041, Q042.

---

## 4. Como falam com o agente

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Transporte | **ACP** | **PTY declarativo** | **SDK** |
| Implementa o loop? | Não | Não | Não |
| Config do agente | protocolo | linha em `host_agent_configs`: `command`/`args`/`prompt_transport`/`resume_args`/`env` | binários **empacotados** (664 MB) |
| Nº de agentes | 26 providers | **14**, zero código por agente | Claude Code, Codex |
| Custo do desenho | degradação invisível se o CLI fala mal o protocolo | sem estrutura, só texto | **exposto a billing de API** — usuários citam `$1k/month` |
| Reattach | ⚠️ | `@xterm/headless` server-side por sessão + epoch/seq/ring + `buildPreamble()` | terminal nativo `alacritty_terminal` |
| Sobrevive a upgrade? | ⚠️ | **Sim** — pty-daemon faz handoff de fds por herança de stdio | ⚠️ |

> Os três dirigem CLI externo, por três transportes diferentes. Ninguém implementa o loop. Ver Q029, Q030, Q031.

---

## 5. Isolamento

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Worktrees | **removidas na v0.3** ("Deferred") | sim, é a unidade central | sim, é a unidade central |
| Onde no disco | design doc propõe `~/.compozy/worktrees/<ws>/<name>`, **rejeita** `<repo>/.worktrees/` | — | — |
| Isola runtime? | — | **Não** | **Não** |
| `.env`, deps, Docker, DB | do usuário | do usuário | do usuário (reinstala `node_modules`) |
| Portas | — | só **detecta** e rotula (`port_base` é coluna morta) | **aloca** (`port_forwards`, UNIQUE em `local_port`) |
| Sandbox de SO | **não tem** (o "sandbox" não é sandbox) | não | não |
| Container | — | — | cloud sandbox (opção paga) |

> **A queixa nº 1 da categoria inteira**, repetida desde 2025: *worktree isola código, não runtime*. Os três empurram o problema pro script de setup do usuário. Ver Q083, Q084, Q085.

---

## 6. Permissões

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Default de fábrica | **`approve-all`** | **aprovação desligada em todos os presets** | ⚠️ |
| Modos | `deny-all` / `approve-reads` / `approve-all` | — | — |
| Path jail | sim, mas **não cobre o argv de terminal** | — | — |
| Grant durável | `(workspace, agent, tool, sha256(input))`, 4 níveis | — | — |
| Egress policy | default-deny — **só pro daemon**, não pro agente | — | — |
| Prompt injection | scanner de runas invisíveis antes de persistir; bloqueia load de skill | — | — |
| Na prática | exec arbitrário | exec arbitrário | ⚠️ |

> Ver Q086, Q087, Q088, Q089.

---

## 7. Orquestração e durabilidade

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Modelo | **replan por geração** (grafo replanejado a cada iteração) | **convenção de prompt** | paralelismo manual |
| Estado persistido | sim, eventos por sessão | **não** — a skill admite *"not durable events"* | ⚠️ |
| Sinal de conclusão | eventos + claim gate | coordenador faz **grep de `SUPERSET_WORKER_DONE` num screenshot de tela** | humano olha |
| Retry | 8 classes de falha, só `transport` e `attempt_timeout` são elegíveis; **default desligado** | — | — |
| Morte do processo | **death-resume** (reinjeta o que já foi feito, limite 3) | run falha | ⚠️ |
| Guardas | `iteration_cap`, `no_progress.window`, `budget`, `terminal_states` | — | — |
| Verificação | **completion claim gate** — confere no banco os efeitos que o agente afirma | — | — |
| Agendamento | fire ID determinístico `hash(jobID+scheduledAt)` + UNIQUE = exactly-once | **QStash externo** + JWT 300 s + relay; host offline = run perdido | — |
| Saga de destruição | ⚠️ | **archive-first** como commit point, un-archive em falha, reconciliação no boot, `teardownMode` separado de `force` | checkpoints em `refs/conductor-checkpoints/*` sem mover HEAD |

> Ver Q069 (o sinal canônico de conclusão), Q075–Q081.

---

## 8. Git e integrações

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| GitHub | bridge de comentário — **não vem compilado nos releases** | Octokit + `gh`, completo | completo |
| GitLab | só via MCP | **nenhum** | ⚠️ |
| Tasks | entidade nativa, `create` ≠ `publish` | nativa + **sync bidirecional** (Linear/GH/GL) | — |
| Gate de merge | — | — | bloqueia por comentário em aberto |
| Review | — | — | `diff_comments` com threads e resolução |

> Ver Q049, Q074. Nenhuma referência resolve GitLab de verdade — se é requisito seu, nasce sem exemplo.

---

## 9. Memória e self-learning — a coluna que decide o projeto

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Tem? | **Sim, é o produto** | **Não. Nada.** | Ingredientes soltos, **não conectados** |
| Fonte da verdade | **Markdown no disco**; SQLite derivado e reconstruível (`reindex`) | — | Postgres (transcripts) + git (prompts) |
| Anti-vector-DB? | **Sim, explicitamente** | — | — |
| Onde vive | `<repo>/.compozy/memory/` — **entra no git** | — | 3 lugares desconexos |
| Escrita | write controller único, **WAL antes da mutação** (`prior_content`, `rule_trace`, `llm_trace`, `idempotency_key`) | — | — |
| Extração | **~25 regex determinísticos** → hash → filename → entity-slot → LLM só em ambiguidade (`max_latency=300ms`, fallback `noop`) | — | — |
| Taxonomia | 4 tipos fechados (`user`, `feedback`, `project`, `reference`); rejeita o resto na fronteira | — | — |
| Filtro de entrada | **`WHAT_NOT_TO_SAVE`**: *o que dá pra derivar lendo o repo não é memória* — vale mesmo se o usuário pedir | — | — |
| Conflito de escopo | shadow por `(type, slug)`, mais específico ganha | — | — |
| Promoção | `0.30·freq + 0.35·relevância + 0.20·recência + 0.15·frescor`; **nunca recuperada = nunca promovida** | — | — |
| Poda | **nenhuma automática** — decay é só de ranking | — | — |
| No prompt | só o índice `MEMORY.md`, header cache-estável por sha256; corpo por tool | — | — |
| Timing | snapshot **congelado no boot**, nunca reescrito | — | — |
| Aprende de ações? | **Não** — só do que foi dito, não do que foi feito | — | — |
| Queixa de usuário | — | — | *"o agente não tem memória do trabalho anterior, das suas convenções, das decisões passadas"* |

> **O buraco da categoria, em uma frase:** o Compozy sabe extrair memória de conversa mas não de ação; o Conductor tem os dados da ação e não extrai nada; o Superset não tem nem os dados. Ver Q050–Q066.

---

## 10. UX

| | **Compozy** | **Superset** | **Conductor** |
|---|---|---|---|
| Supervisão de N agentes | ⚠️ | terminais + `terminals read` | **`⌥L` = próximo que precisa de atenção** |
| Modelo mental | — | dashboard | **fila** |
| Inbox | — | — | unread + pinned + important + assignee + watchers + following |
| Estado da task | — | — | `derived_status` **e** `manual_status` separados |
| Fila de mensagens | — | — | persistida (`sent_at NULL` + `queue_order`) |
| Nº confortável de agentes | ⚠️ | ⚠️ | **3–5**; 10–20 só pra quem domina o codebase |
| Gargalo real | — | — | **revisão humana, não compute** |

> `⌥L` é a primitiva de UX mais transferível dos três estudos: transforma supervisão em fila, não em dashboard. Ver Q094, Q095.

---

## 11. Maior força e maior fraqueza de cada um

| | Maior força | Maior fraqueza |
|---|---|---|
| **Compozy** | Disciplina de escrita de memória: regra antes de LLM, WAL antes de mutar, taxonomia fechada, promoção por recall real | Não tem hierarquia, worktrees foram removidas, git host quase inexistente, permissão é exec arbitrário |
| **Superset** | Engenharia de processo: pty-daemon com handoff de fds, xterm headless server-side, saga de destruição archive-first | Orquestração é grep de tela, sem durabilidade, GitHub-only, exige nuvem |
| **Conductor** | UX: a fila `⌥L`, três identificadores separados, diff com threads, checkpoints sem mover HEAD | Isola código e não runtime, zero memória, refém do billing de SDK |

---

## 12. Onde ler, por decisão

Para responder as 8 perguntas travantes do [questions.md](../project/questions.md):

| Decisão | Ler |
|---|---|
| **Q029** loop vs dirigir | compozy §3 e §13-Q053 · superset §5 · conductor §3 |
| **Q041** task multi-projeto | conductor §2 e §13-2 · superset §2 |
| **Q051** memória no repo ou fora | compozy **§5 inteira** · conductor §7 e §13-8 |
| **Q069** sinal de conclusão | superset §5 · compozy §4 |
| **Q083** container vs worktree | conductor §6 e §10 · superset §8 |
| **Q032** banco × arquivo | compozy §3 e §6 |
| **Q093** cliente | conductor §3 e §8 · superset §3 |
| **Q095** 5 ou 50 agentes | conductor §5 e §10 |

Seções que valem ler inteiras, independente de decisão:
- **compozy §5** (memória) — é o único material real que existe sobre o assunto
- **conductor §8** (UX) — decisões de interação que você não vai reinventar melhor
- **superset §4** (ciclo de vida do workspace) — o passo a passo mais completo dos três
- **conductor §10** (pontos fracos) — reclamações reais de usuário, é o mapa das oportunidades
