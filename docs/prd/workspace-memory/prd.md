# PRD — Memória de workspace e aprendizado contínuo

> **Status:** v0.4 — **desenho em discussão**, nenhuma task escrita. Três rodadas de respostas aplicadas
> **Perguntas:** [open-questions.md](open-questions.md) — 38, **todas respondidas**. O que resta são
> quatro decisões de entrega de contexto (D2, D5, D7, D8)
> **Execução:** [roadmap.md](roadmap.md) — a feature decomposta em pilha de PRs
> **Discussão separada:** [context-delivery.md](context-delivery.md) — como a memória chega no agente,
> a única decisão desta feature cujo custo é cobrado em todo turno
> **As quatro decisões que mudaram o desenho:** nenhuma memória vive dentro do repositório (§5, com a
> exceção do `id` do projeto), o Lumem-OS **migra para ACP** (§4.1), o `~/.lumem` é **versionado por
> git pelo próprio Lumem** (§5), e a memória chega ao agente como **serviço, não como texto injetado**
> (§8)
> **Estudo derivado:** [PTY × ACP](../../project/pty-vs-acp.md), onde a decisão está registrada
> **Referências:** [compozy](../../references/compozy.md) §5 · [hermes](../../references/hermes.md) §3–5
> **Perguntas do projeto que esta feature responde:** [Q016–Q021](../../project/questions.md) e [Q050–Q066](../../project/questions.md)
> **Sucede:** [file-editor](../file-editor/prd.md) · **Depende de:** `acp-sessions` (a desenhar) nas fases 4–6

---

## 1. Objetivo

O Lumem-OS lembra. Não só do que aconteceu numa sessão: **do que o workspace é**.

Hoje cada sessão de agente começa do zero. Você explica de novo que o back é este repo, que o
contrato do endpoint é aquele, que naquele projeto o teste roda com um comando diferente, que você
já disse duas vezes para não mexer no `dist/`. O agente termina, a aba fecha, e o que ele aprendeu
morre com o PTY.

Esta feature é o primeiro dos três pilares do projeto que a [comparison.md](../../references/comparison.md)
identificou como ponto cego da categoria inteira — e é o pilar que dá sentido ao **workspace**.

**Critério de sucesso em uma frase:** um agente trabalhando no projeto `api` sabe, sem você contar,
o que o projeto `web` espera dele — e quando ele descobre algo durável, isso fica disponível para
os dois na próxima sessão.

### O que "workspace" quer dizer aqui

Um workspace é um conjunto de projetos que **se conhecem**. Front e back do mesmo produto,
design-system e os apps que o consomem, o serviço e o worker que lê a fila dele. O que eles
compartilham não é código: é **produto, domínio, processo e contrato**.

Isso divide o conhecimento em dois níveis com naturezas diferentes:

| Nível | O quê | Exemplo | Quem erra caro |
|---|---|---|---|
| **Projeto** | como este repo funciona | "o gate rápido é `pnpm gate:quick`", "migrations não rodam em worktree" | erra barato — o repo desmente |
| **Workspace** | o que o produto é e como o time trabalha | "usuário sem plano ativo enxerga o catálogo mas não o preço", "PR sempre com Conventional Commits", "o `api` publica em `/v2` e o `web` consome" | erra **caro** — contamina N projetos de uma vez |

Essa assimetria é a espinha do desenho inteiro: **o que é barato de errar pode ser automático; o que é
caro de errar passa por você.**

---

## 2. O problema que ninguém resolveu

Do estudo das quatro referências:

| Produto | Memória | Buraco |
|---|---|---|
| Superset | nenhuma | — |
| Conductor | tem todos os ingredientes (transcript em Postgres, prompt versionado por repo) e **não conecta nenhum** | a queixa literal de usuário é *"o agente não tem memória do trabalho anterior"* |
| Compozy | a mecânica mais rigorosa que existe: Markdown autoritativo, WAL com revert, scan determinístico, recall lexical explicável | workspace **é um diretório**. Não existe projeto, não existe grupo de repos |
| Hermes | a melhor separação fato × procedimento, ciclo de vida por uso, journey visível | **um agente por profile**. Zero escopo |

Ninguém tem o eixo que o Lumem-OS precisa. Os dois que atacaram o problema resolveram metades
diferentes, e as duas metades são necessárias.

---

## 3. O que se aprende — as três naturezas

Misturar isso num balde só chamado "memória" é o erro que faz o índice inchar e o contexto degradar.

### 3.1 Fato

Declarativo, curto, verificável. *"O `api` roda na porta 4000 em dev."* *"Você prefere revisão com
o arquivo e a linha antes do texto."*

Custa contexto em toda sessão. Tem que ser pouco e destilado.

### 3.2 Procedimento

Como se faz **esta classe de tarefa** aqui. *"Investigar teste flaky neste monorepo: rode o gate
afetado, olhe `docs/project/testing.md`, desconfie de timer falso antes de desconfiar de rede."*

Grande demais para injetar sempre; carregado sob demanda quando a tarefa é dessa classe. É o que o
Hermes chama de skill, e é a metade que o Compozy não tem.

### 3.3 Contrato

O que um projeto **promete** a outro. *"`api` expõe `POST /v2/checkout` com este corpo; `web` depende
disso."*

Não é fato do projeto A nem do projeto B: é fato **do workspace**, com dois donos. É esta natureza
que justifica a hierarquia inteira, e é a única que nenhuma das quatro referências modela.

> **Decidido na [Q2](open-questions.md):** contrato é um **tipo de memória** com `owner_project` e
> `consumer_projects` — barato, e já responde "o que quebra se eu mudar isto?". A versão cara
> (entidade com verificação contra o código) foi para o [backlog](../../project/backlog.md).

---

## 4. A restrição que decidia tudo — e a decisão que a dissolveu

> **Resolvido em 2026-08-17: o Lumem-OS migra para ACP.** O registro está no
> [§9 do estudo](../../project/pty-vs-acp.md). Esta seção fica como está, com a análise que levou lá,
> e o §4.1 diz o que muda para esta feature.

**O daemon não via o que o agente pensa.** Uma sessão de agente é um `node-pty` rodando o CLI
que você escolheu (`packages/server/src/pty/`, `agents/availability.ts`), e o que trafega são
**bytes de terminal** — com ANSI, spinner, redesenho. Não há transcript estruturado, não há evento
de tool, não há fim-de-turno. O `RingBuffer` é scrollback, não histórico.

O Compozy resolve isso sendo dono do protocolo (ACP). O Hermes resolve sendo o agente. O Lumem-OS
não era nenhum dos dois — e era por isso que **esta era a primeira decisão a tomar**, antes de
qualquer outra:

| Caminho | Como o daemon aprende | Preço |
|---|---|---|
| **(a) MCP** — o Lumem expõe um servidor MCP com as tools de memória | o agente **chama** `lumem_memory_*` e `lumem_recall` | depende de o agente cooperar; funciona em todo CLI que fala MCP; zero parsing |
| **(b) Hooks do CLI** — `SessionEnd`/`PostToolUse` do Claude Code e equivalentes | o CLI empurra evento estruturado para o daemon | específico por CLI, e cada um tem um modelo diferente |
| **(c) Ler o transcript no disco** — `~/.claude/projects/**/*.jsonl` e afins | o daemon lê o arquivo que o CLI já grava | formato de terceiro, sem contrato, quebra sem aviso |
| **(d) Trocar PTY por ACP** | o daemon vira dono do protocolo | **medido em [pty-vs-acp.md](../../project/pty-vs-acp.md)**: o transporte são ~1.270 LOC isoladas — barato. O que custa é a **tela inteira da conversa**, que passa a ser do Lumem |
| **(e) Injetar no lançamento** — o daemon já controla `argv` e `env` (`agent_config`) | flag ou arquivo fora do checkout apontado na linha de comando | depende de o CLI ter a flag; **não** resolve captura |

~~**Proposta para reagir:** **(a) + (e)**~~ — **a proposta perdeu.** O estudo recomendava MCP mais
injeção no lançamento, com ACP como experimento fechado. A decisão foi **(d)**, e o argumento que a
sustenta está no [§9 do estudo](../../project/pty-vs-acp.md): não é a memória que paga o ACP, é o
produto inteiro — permissão, custo por token, e tudo que exige entender o que a sessão fez.

O **(a)** sobrevive dentro do **(d)**: as tools de memória continuam sendo MCP, declaradas no
`session/new`. O que morre é o **(e)** como caminho principal, e o **(b)** como plano B.

> **Duas correções que este PRD acumulou.** A v0.1 dizia que trocar PTY por ACP "reescreve a espinha
> do produto" — medido, é falso: o transporte é pequeno e isolado, o caro é a tela. E a v0.1 propunha
> gerar um bloco dentro do `AGENTS.md`/`CLAUDE.md` **do checkout**; a decisão do §5 derrubou isso, e
> com o ACP o problema deixa de existir — o Lumem monta o prompt, sem tocar em arquivo do repositório
> ([Q35](open-questions.md#-q35--como-a-memória-chega-no-cli-sem-escrever-nada-no-repositório-lm)).

### 4.1 O que a decisão por ACP muda aqui

A escolha foi **(d)**, e ela derruba o preço mais duro deste PRD: **captura deixa de ser
cooperativa.**

| O que esta feature ganha | Vindo de |
|---|---|
| fim de turno, sem heurística | o ciclo `session/prompt` → `session/update` termina |
| o que foi feito no turno, tipado | `tool_call` / `tool_call_update` — inclusive arquivo escrito e comando rodado |
| custo por turno | `usage_update` → consumo por projeto, por worktree, por classe de tarefa |
| injeção sem tocar no repositório | o Lumem monta o prompt: prepend no `session/prompt`, MCP declarado no `session/new` |
| o mesmo material que o Compozy e o Hermes têm | e que, com PTY, nós não teríamos |

**O que continua valendo inteiro:** o portão de escrita (§7), a proveniência, o shadow, a inbox e o
WAL. Nada disso dependia do transporte — eles existem porque memória escrita por agente é perigosa,
e isso não mudou. O que mudou é que agora existe **matéria-prima** para o passo de captura.

**O que a decisão cobra:** a memória passa a depender de uma feature que ainda não existe. As fases
do §15 foram reordenadas por causa disso, e o §16 ganhou a dependência nova.

**E o risco que veio junto, depois de investigado** (§9.2 do estudo): hoje o caminho ACP **consome a
assinatura normalmente** — é o que a Anthropic documenta e é a mesma categoria em que o Conductor já
roda todo dia. A janela de contexto **não encolhe por ser ACP**: a compactação é do próprio Claude
Code, e o 1M é o mesmo botão do CLI. O que sobra é um risco de política — a separação de pools foi
anunciada e cancelada em 2026, e pode voltar com aviso — e um relato aberto de fallback para 200K que
o spike tem que reproduzir ou descartar.

---

## 5. Onde o conhecimento vive

**Decidido ([Q3](open-questions.md), [Q7](open-questions.md), [Q8](open-questions.md)): nenhuma
memória entra no repositório.** Nem memória, nem playbook. Tudo vive sob `~/.lumem`, gerenciado pelo
Lumem, com interface própria.

**Com uma exceção, decidida na [Q3.1](open-questions.md): a identidade do projeto.**
`<repo>/.lumem/project.toml` guarda o `id` — e só o que for universal para o time (script de setup e
de run, quando existirem). Ao adicionar um projeto, o Lumem lê o arquivo: se há ID, adota; se não há,
gera e **pergunta antes de escrever**. A regra que separa é a sua:

> **O que é do repositório é do time; o que é da instância é do Lumem.**

Um ID igual em todas as máquinas é característica do projeto. Caminho de worktree, escopo de memória e
estado do daemon não são — e nunca entram ali.

**E o `~/.lumem` é versionado por git, pelo próprio Lumem** ([Q36](open-questions.md)) — `git init`
no bootstrap, um commit por mudança aplicada, remoto opcional e seu. A divisão é a do
[ai-memory](https://github.com/akitaonrails/ai-memory): **versiona-se a fonte da verdade, ignora-se o
derivado**.

```text
~/.lumem/                           # git init aqui
  memory/                           # VOCÊ — atravessa workspace · VERSIONADO
    MEMORY.md  user_<slug>.md  feedback_<slug>.md

  workspaces/<workspace-id>/
    memory/                         # WORKSPACE — domínio, processo, contrato
      MEMORY.md
      domain_<slug>.md  process_<slug>.md  contract_<slug>.md
    inbox/                          # propostas aguardando sua revisão
    projects/<project-id>/
      memory/                       # PROJETO — decisão, constraint, referência
        MEMORY.md  project_<slug>.md  reference_<slug>.md
      playbooks/
        <classe-de-tarefa>/PLAYBOOK.md
        <classe-de-tarefa>/references/*.md

  context/                          # blocos montados por sessão · IGNORADO
  _system/                          # inbox bruta, DLQ, artefatos · IGNORADO, nunca injetado
  lumem.db                          # índice FTS5 + WAL + sinais · IGNORADO (derivado, `reindex` refaz)
```

Commitar um SQLite binário a cada escrita daria histórico ilegível e repositório inchado; o banco é
reconstruível a partir do Markdown, então fica de fora.

**Markdown continua sendo a fonte da verdade; o banco é derivado e reconstruível**
(`lumem memory reindex`) — pelos motivos do Compozy: diff, revisão humana, portabilidade, e índice
corrompido vira um comando em vez de perda de dado. Sair do repositório **não** significa virar
banco opaco: o diretório inteiro é Markdown legível, e você pode versioná-lo por conta própria
([Q36](open-questions.md)).

O argumento que fechou: **memória é conhecimento do Lumem sobre o projeto, não artefato do projeto.**
Deixar isso dentro de um repo — que pode nem ser seu — produz arquivo órfão que ninguém sabe de onde
veio no dia em que o Lumem sair de cena.

**O preço, explícito:**

| Perdido | O que compensa |
|---|---|
| ~~histórico por git~~ — **recuperado** | a [Q36](open-questions.md) trouxe o git de volta, agora sobre o `~/.lumem`. O que mudou é **de quem** é o repositório: seu, não do time. E criou a [Q37](open-questions.md): git e WAL agora se sobrepõem |
| review em PR | a inbox de propostas (§11) é a revisão **antes**; o `git diff` do `~/.lumem` é a auditoria **depois** |
| herança pelo time | ninguém herda nada ao clonar. É conhecimento da sua máquina — ver [Q36](open-questions.md) |
| ~~identidade gravada no repo~~ — **revertido** | a [Q3.1](open-questions.md) devolveu **um** arquivo ao repositório: `<repo>/.lumem/project.toml`, só com o `id`. Um ID igual para você e para o time é característica **do projeto**, não da instância — passa na regra. Memória continua fora |

---

## 6. Taxonomia proposta

Fechada, validada na fronteira, com escopo default derivado do tipo — porque escolher escopo é a
decisão que o agente mais erra.

| Tipo | O quê | Escopo default | Quem pode escrever |
|---|---|---|---|
| `user` | você: preferências, jeito de trabalhar | global | agente (propõe), você |
| `feedback` | correção recorrente, erro que não pode repetir | global | agente (propõe), você |
| `project` | decisão, constraint, arquitetura viva deste repo | projeto | agente, direto |
| `domain` | produto e negócio: regra, conceito, vocabulário | **workspace** | agente **propõe**, você aplica |
| `process` | como o time trabalha: PR, commit, release | **workspace** | agente **propõe**, você aplica |
| `contract` | o que um projeto promete a outro | **workspace**, com projeto-dono | agente do dono propõe |
| `reference` | fato externo, runbook, link que não muda | projeto ou workspace | agente, direto |

E, separado da tabela porque **não é memória**, o `playbook`: procedimento, arquivo com corpo,
carregado sob demanda, com ciclo de vida por uso (§9).

Regra de escopo em uma frase: **escrever para baixo é livre, escrever para cima é proposta.**

---

## 7. O portão de escrita

Um caminho só, para toda origem — tool MCP, comando seu, hook, importação. A ordem é a do Compozy,
com a régua menor que o §12.6 daquele estudo recomendou:

1. **Scan determinístico**, sem LLM: segredo/credencial, prompt injection, runas Unicode invisíveis.
   Poucas regras, focadas. Nada de rejeitar toda crase tripla.
2. **`WHAT_NOT_TO_SAVE`** versionada, com a regra que vale ouro: *o que dá para derivar lendo o
   repositório não é memória* — e ela vale **mesmo quando você pede para salvar**.
3. **Duplicata exata** por hash → no-op.
4. **Identidade `(tipo, slug)`** → existe? `update`. Não existe? `add`.
5. **Ambiguidade genuína** → aí sim um desempate por LLM, com timeout e fallback `noop`.
6. **Decisão persistida antes de tocar o arquivo** — porque `revert` real e replay pós-crash são o
   que tornam aceitável um sistema que escreve sozinho. Com o git da [Q36](open-questions.md) por
   baixo, o WAL ficou **mais magro** ([Q37](open-questions.md), decidida): o conteúdo anterior é o
   commit anterior, e o WAL guarda a *decisão* — origem, regra, confiança, idempotência, resultado, e
   o SHA que ela produziu. Rejeição e no-op vivem **só** no WAL, porque não viram arquivo.

Toda entrada carrega **proveniência**: origem, sessão, projeto, confiança, e `superseded_by` quando
substituída. Quando a escrita nasceu de uma proposta aprovada, ela carrega também `proposed_by` e
`proposal_id` — porque aprovar grava com ator `human`, e sem esses dois campos a origem morreria no
momento em que a proposta é aceita. Sem isso, memória de workspace escrita por agente é irrastreável — e é a mais cara de
errar.

### Precedência: shadow, nunca merge

Identidade `(tipo, slug)`. O escopo mais específico **sombreia** o mais genérico: projeto > workspace
> global. O perdedor continua no disco e o sombreamento vira evento. Nada é concatenado em silêncio.

---

## 8. Como chega no contexto

> **Discussão própria:** [context-delivery.md](context-delivery.md). É a única decisão desta feature
> cujo custo é **recorrente** — cobrado em todo turno de toda sessão —, e por isso ganhou arquivo
> separado, com os quatro desenhos possíveis, o que o ACP muda, o que precisa ser medido, e seis
> perguntas abertas (D1–D6).

O resumo, para não precisar abrir o arquivo agora — **núcleo, skill e serviço**:

| Camada | O quê entra | Como | Custo |
|---|---|---|---|
| **1. Núcleo** | **diretriz de comportamento**, estilo *rules* do Cursor. Não explica como as coisas funcionam, não fala de outros projetos | injetado sempre | cresce devagar, e é o que muda comportamento |
| **2. Skill** | ensina a estrutura da memória e **como chamar o `lumem-memory`** | injetada sempre | **fixo** — não cresce com o acervo |
| **3. `lumem-memory`** | o serviço que **é** a memória: guarda, busca, responde, e pode subir agente para achar o que falta | chamado sob demanda | por pergunta, não por turno |

**Nada que cresce com o acervo entra no prompt.** Cem memórias não viram cem linhas de índice: viram
uma porta e a instrução de como usá-la. A implementação por trás da porta fica livre — FTS5 hoje,
vetor amanhã, sem tocar no que o agente vê.

O preço, e ele tem mecanismo no §5 daquele arquivo: sem índice, o agente não sabe **o que existe** —
então o núcleo carrega a diretiva mínima de que a memória existe e quando consultá-la; e o
**auto-learn** (não sabe → pesquisa → cria memória → responde) é escrita automática, então passa pelo
mesmo portão, com proveniência própria.

Duas decisões do arquivo que valem repetir aqui, porque mudam o que a implementação precisa fazer:

- **o núcleo não tem teto.** Cortar diretriz no meio produz regra errada, não regra menor. No lugar do
  teto entra **marca d'água**: o tamanho é medido, a variação é mostrada, e passar do valor que você
  definir dispara alarme — nunca corte;
- **o que o auto-learn escreve depende da evidência, não do assunto.** Resposta sustentada por
  artefato verificável (arquivo, linha, saída de comando) vira memória direta com a evidência
  anexada; resposta que é síntese vira proposta. Escopo de workspace é proposta sempre.

Nada disso é escrito dentro do checkout: com ACP, o Lumem monta o prompt e declara as tools no
`session/new` ([Q35](open-questions.md)).

Duas regras herdadas do estudo, ambas por motivo de custo real:

- **header estável por hash** — sem mudança de memória, o bloco sai byte a byte idêntico, e o prefix
  cache do provider continua valendo;
- **snapshot congelado** — a sessão em curso mantém o que recebeu; a próxima vê o novo. Ver
  [Q11](open-questions.md), porque isso conflita com *"eu corrijo o agente e ele para de errar agora"*.

E um banner de frescor: memória com mais de um dia entra com *"verifique contra o estado atual antes
de afirmar como fato"*. Envelhecer não é o mesmo que estar errado.

---

## 9. Playbooks — o procedimento

A metade que vem do Hermes, adaptada:

- **nomeado por classe de tarefa**, nunca por artefato da sessão. "Investigar teste flaky" sim;
  "consertar o PR 412" não;
- corpo em `PLAYBOOK.md` com `references/` carregado sob demanda;
- **ordem de preferência fechada na escrita**: atualizar o playbook que estava carregado → atualizar
  um guarda-chuva existente → acrescentar arquivo de apoio → só então criar um novo;
- **telemetria em sidecar**: quantas vezes foi carregado, quando pela última vez;
- ciclo `active → stale → archived` derivado do uso, com `pinned` como opt-out ortogonal, e
  **arquivar em vez de apagar**, com reativação por uso;
- playbook de **projeto** e de **workspace** vivem os dois sob `~/.lumem` (§5). O ganho de "o time
  herda" morreu com a decisão de não sujar o repositório, e isso é preço aceito, não esquecimento.

**Decidido na [Q14](open-questions.md):** fonte única no Lumem, **projeção por CLI**. O playbook vive
em `~/.lumem`; o Lumem projeta no formato que cada CLI lê — e, com ACP, boa parte da projeção pode ser
**tool** declarada no `session/new` em vez de arquivo. Nada de inventar o nono formato de skill, e
nada dentro do repositório.

E a telemetria de uso, que parecia impossível sem controlar o agente, ficou viável: o adaptador ACP
passou a expor chamadas de Skill com nome e tipo, então o carregamento chega como `tool_call`
([Q16](open-questions.md)). Continua sendo subcontagem — por isso **nada é arquivado
automaticamente**: vira sugestão na revisão.

---

## 10. Captura — quando o sistema aprende

Do mais barato ao mais caro, e a proposta é **começar nos dois primeiros**:

1. **Explícita** — você ou o agente chamam a tool. Custo zero, sinal altíssimo.
2. **Fim de sessão** — um passo de destilação com modelo barato sobre uma **projeção limitada** do que
   a sessão fez. Uma chamada por sessão, não por turno ([Q19](open-questions.md), com o gatilho
   configurável desde o desenho), e **desligado por padrão** até o portão provar que segura.
3. **Correção detectada** — você reescreve o que o agente fez, ou reverte o commit dele. É o sinal
   mais barato que existe e nenhuma das referências usa. Ver [Q17](open-questions.md).
4. **Consolidação periódica** — gatilho explícito primeiro; automático só quando houver sinal medido
   que justifique.

**Fora do v1:** extração a cada mensagem (o próprio estudo do Compozy manda não copiar) e destilação
por turno — que agora é **possível** com ACP, e continua sendo cara.

**Só a sessão raiz alimenta a memória automaticamente** ([Q21](open-questions.md)). Com ACP isso deixa
de ser esperança e vira regra verificável: a linhagem da sessão está no protocolo.

**E tudo isso é instrumentado desde o primeiro dia** ([Q20](open-questions.md)): tokens gastos na
destilação, candidatos gerados, aceitos pelo portão, aprovados por você. Sem esses números, decidir
entre "por sessão" e "por turno" seria palpite.

### O que nunca é capturado

Segredo, credencial e `.env`. Estado efêmero ("o que estou fazendo agora", "próximos passos").
Histórico do git — ele já é o histórico do git. Estrutura de diretório e convenção derivável do
repositório. Dump de transcript. E, especificamente para nós: **nada aprendido dentro de uma worktree
descartada vira memória de workspace sem passar por revisão** — worktree é experimento, e experimento
abandonado não é conhecimento.

---

## 11. Cross-projeto — a parte perigosa

É aqui que a feature ganha ou perde.

| Ação | Decidido |
|---|---|
| Agente do projeto A **lê** memória de workspace | **livre** ([Q26](open-questions.md)) — é para isso que o workspace existe |
| Agente do projeto A **lê** memória de projeto de B | **livre**, e registrado na proveniência do que for aprendido |
| Agente do projeto A **lê** arquivos do repo de B | passa por funil único, fail-closed, auditado — **memória e arquivo são coisas diferentes** |
| O **`lumem-memory`** lê arquivos dos projetos do workspace para responder | **objetivo declarado** ([D8](context-delivery.md)) — mas a v1 entrega o funil com a capacidade **desligada**, e o registro de acesso já funcionando. Sempre leitura, nunca escrita |
| Agente do projeto A **escreve** memória de workspace | **proposta** ([Q27](open-questions.md)) — inbox, não índice |
| Agente do projeto A **escreve** memória do projeto B | **negado**. Vira tarefa para B, não memória |

**Leitura é livre; escrita para cima é revisada.** É a assimetria que faz o workspace valer a pena sem
deixar um agente contaminar N projetos.

E a fronteira do workspace **é sua** ([Q28](open-questions.md)): o Lumem não tenta adivinhar que um
repo de cliente não devia ver o vizinho. Workspace é fronteira de confiança, não pasta de organização
— e isso é frase de documentação, não mecanismo.

A última linha conecta com o fluxo que a [vision.md](../../project/vision.md) descreve — "o agente
percebe que outro projeto precisa mudar e cria a tarefa lá". **Tarefa é outra feature**; o que esta
precisa garantir é que a fronteira exista e que nada atravesse por acidente.

E uma regra emprestada do Compozy que vale demais aqui: **um agente nunca aprova a própria proposta.**

---

## 12. O que aparece na tela

Nada disso é útil se for invisível — a lição do `journey` do Hermes.

- **Inbox de propostas**: o que os agentes querem ensinar ao workspace, com origem, evidência e
  diff. Aprovar, editar antes de aprovar, ou rejeitar com motivo.
- **Vista de memória por escopo**, com o que está sombreando o quê.
- **Linha do tempo**: o que foi aprendido, quando, por qual sessão, e o botão de desfazer — que agora
  tem dois caminhos, o WAL e o `git revert` do `~/.lumem`.
- **Os números do §6 do [context-delivery](context-delivery.md)**: quanto a memória custou de contexto,
  quantas vezes o agente perguntou, quantas sessões ensinaram algo. Sistema que aprende sozinho sem
  medição é fé.
- Um sinal discreto na aba quando a sessão em curso escreveu ou propôs algo.

O desenho passa pela skill `ui-design-prototype`, como todas as features de tela deste repo — e só
depois vira React.

---

## 13. Não-objetivos

| Fora | Por quê |
|---|---|
| Treinar modelo, fine-tune, pesos | "Self-learning" aqui é curadoria de conhecimento. Nada toca modelo |
| Embeddings e busca semântica no v1 | Lexical é determinístico, explicável e de graça no SQLite. A interface de recall fica plugável, mas o v1 não traz vetor |
| Consolidação automática com portões de 24h/3 sessões/score | Para uso pessoal pode nunca disparar. Gatilho explícito primeiro |
| Memória por worktree | Worktree é execução. Se o que se aprendeu ali vale, vale para o projeto |
| Extração a cada mensagem | Custo recorrente por ganho que aparece dias depois |
| Multi-usuário, papéis, permissão por pessoa | Projeto pessoal. Um operador |
| Sincronizar com ClickUp/Jira | Outra feature, outro PRD |
| Construir o transporte e a tela do ACP | **Decidido que vai acontecer** ([estudo](../../project/pty-vs-acp.md)), e esta feature foi o argumento que fechou — mas é feature própria, com PRD próprio. Aqui ela é dependência, não escopo |

---

## 14. Riscos

| O quê | Por quê | Mitigação |
|---|---|---|
| **Envenenamento cruzado** | um agente errado ensina o workspace, e N projetos herdam o erro | escrita para cima é proposta; proveniência obrigatória; `revert` real; nenhum agente aprova a própria proposta |
| **Prompt injection persistente** | você vai ler issue e PR de terceiro, e memória entra no system prompt | scan determinístico antes de persistir; conteúdo recuperado entra cercado e marcado como dado; scrubber no streaming |
| **Vazamento entre projetos** | workspace com repo de cliente e repo pessoal | fronteira explícita no §11, fail-closed, auditada |
| **Memória mentindo sobre o repo** | o código mudou e a memória não | banner de frescor; regra de não salvar o que se deriva lendo o repo; verificação de contrato contra o código, se a Q1 fechar em entidade |
| **Degradar todo turno** | índice cresce e o contexto encolhe | teto por escopo; índice em vez de corpo; poda por uso |
| ~~Captura cooperativa não acontecer~~ — **morreu com a decisão por ACP** | era o risco de o agente nunca chamar a tool | a captura passa a ser estrutural (§4.1). O que sobra é medir e mostrar quantas sessões ensinaram algo, que continua valendo |
| **Depender da feature maior do projeto** | as fases 4–6 esperam o ACP, que ainda nem tem PRD | as fases 1–3 foram escolhidas por não dependerem dele; se o ACP atrasar, a memória entrega o núcleo assim mesmo |
| **A Anthropic reativar a separação de pools de billing** | anunciada para 15/jun/2026 e cancelada no mesmo dia, com promessa de retrabalhar e avisar antes (§9.2 do estudo) | `transport` continua sendo coluna: voltar uma sessão para PTY — o lado *first-party*, poupado — é config, não refactor |
| **Segredo virar memória** | agente cola `.env` no que "aprendeu" | scan bloqueia; e o teste dessa regra é obrigatório |
| **Auto-learn inventar e a invenção virar verdade** | o `lumem-memory` responde o que não sabe subindo um agente que pesquisa — e o resultado vira memória sem ninguém revisar | mesmo portão, `source_actor: auto_research`, evidência obrigatória, confiança baixa, marcada como **não verificada**, e escopo de workspace só como proposta ([context-delivery §5.2](context-delivery.md)) |
| **O agente nunca perguntar** | sem índice injetado, o acervo só é alcançado por pergunta | diretriz no núcleo + mapa na skill + **medição** de chamadas por sessão. Perto de zero significa que o desenho precisa mudar, e o número existe desde a fase 2 |
| **Complexidade engolir a feature** | são quatro subsistemas (escrita, recall, playbook, propostas) | fatiar como o resto do repo: uma parte por vez, com gate |

---

## 15. Fases prováveis

Sem tasks ainda — isto é a ordem de risco proposta para a discussão fechar em cima.

| Fase | O quê | Por que aí | Depende de ACP? |
|---|---|---|---|
| **1** | Escrita e leitura de memória com escopo, portão único, WAL, proveniência e **git** — via tool MCP e comando | É o núcleo, e é a única parte grande que **não** depende de transporte. Pode andar em paralelo com a feature de ACP | não |
| **2** | Recall lexical (FTS5) com tool de busca, com sinal de uso **e a instrumentação do [§6 do context-delivery](context-delivery.md)** | Faz a memória grande valer a pena, é insumo de toda poda futura, e é o que permite decidir as camadas com dado em vez de palpite | não |
| **3** | Inbox de propostas + UI de revisão — inclusive a revisão do **núcleo** destilado ([D1](context-delivery.md)) | Destrava a memória de workspace escrita por agente, e o núcleo é o texto de maior alcance do sistema | não |
| **4** | Injeção no `session/prompt` + MCP declarado no `session/new` | Primeiro valor real dentro da sessão | **sim** |
| **5** | Captura estrutural: fim de turno, `tool_call`, `usage_update` | O que a decisão por ACP comprou — e só faz sentido com o portão da fase 1 provado | **sim** |
| **6** | Playbooks com ciclo de vida por uso | A segunda natureza, depois que a primeira estiver de pé | parcial (medir uso é melhor com ACP) |

**A reordenação é consequência direta da decisão por ACP.** As três primeiras fases foram escolhidas
por serem exatamente o que **não** espera a feature de transporte — assim a memória avança enquanto
o ACP é desenhado, em vez de ficar bloqueada atrás da maior feature do projeto.

A antiga fase 0 ("fechar como o daemon aprende") sumiu: foi respondida no
[estudo PTY × ACP](../../project/pty-vs-acp.md). O que ficou no lugar dela é o **spike medido** de
autenticação, billing e janela de contexto — mas ele pertence à feature de ACP, não a esta.

---

## 16. Dependências

- **Sessão de agente por ACP** — §4.1. Bloqueia as **fases 4, 5 e 6**; as três primeiras andam sem
  ela. É a maior dependência que esta feature já teve, e ela virou feature própria a desenhar
  (`docs/prd/acp-sessions/`, ainda não escrita).
- **Workspace como entidade real.** Existe na tabela (`packages/server/src/db/schema.ts`) e não tem
  identidade estável em disco. Memória amarrada a `id` de linha não sobrevive a nada; precisa de
  identificador durável que **não** more no repositório — a proposta é o hash do primeiro commit
  ([Q3.1](open-questions.md), refina a Q048 do projeto).
- **Projeto com identidade estável** — resolvido na [Q3.1](open-questions.md): `id` em
  `<repo>/.lumem/project.toml`, adotado se existir, gerado e escrito com sua permissão se não. O
  commit raiz e o remote continuam sendo usados, mas só para **detectar fork** — quando dois caminhos
  com remotes diferentes reivindicam o mesmo ID.
- **Um lugar na tela** — a `right-panel` já provou que dá para acrescentar coluna sem quebrar o resto.
