# O que foi medido antes de escrever a esteira

> Estudo para a [`028-autonomous-orchestration`](../features/028-autonomous-orchestration/prd.md).
> **Duas medições.** A primeira em **2026-09-12**, contra os dados que este repositório já tinha e sem
> gastar nada. A segunda em **2026-09-13** (§4bis), com **token de verdade** — US$ 4,60 em 20 turnos
> de Haiku e Opus —, e é ela que derruba a pergunta que a primeira deixou de pé.
>
> O §11 daquela PRD guardou **nove conversas técnicas** de propósito, e disse que nada ali é pequeno.
> Este arquivo mede **três** delas — as três em que existia coisa medível — e diz explicitamente o que
> ficou sem medir e por quê. Duas medidas mudaram uma decisão antes de existir código, que é o padrão
> que a [`021`](../features/021-second-agent/prd.md) e a
> [`026`](../features/026-worktree-from/prd.md) estabeleceram.

---

## 1. O que este arquivo responde

| §11 da `028` | Medido? | Onde |
|---|---|---|
| detectar que o agente fez uma pergunta em vez de ter terminado | **sim**, duas vezes — e a segunda mostrou que a pergunta estava mal formada | §2 e **§4bis** |
| como o evento externo chega — polling × webhook × relé | **sim** | §3 |
| camada gerenciada (Composio, Nango, Pipedream) | **sim** | §3.3 |
| segredo, e o ADR de 2026-08-30 | **parcial** — medi o que decide a escolha, não a escolha | §3.4 |
| lease, heartbeat e recuperação | **parcial** — medi o que já existe | §4 |
| três sessões por tarefa: o que passa de uma para outra | não | §5 |
| entrega no mínimo uma vez, idempotência | não | §5 |
| as quatro autenticações distintas | não | §5 |
| o limite de taxa como sinal | **não precisa mais** — a `027` consertou | §4.3 |

---

## 2. O fim do turno não diz o que aconteceu

### 2.1 O que o protocolo oferece

`@agentclientprotocol/sdk@1.3.0`, `dist/schema/types.gen.d.ts:3040`:

```ts
export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";
```

**Cinco valores, e nenhum deles é *"estou esperando você"*.** Um agente que terminou o trabalho e um
agente que fez uma pergunta devolvem a mesma palavra: `end_turn`. O `AcpManager` repassa esse valor
verbatim (`AcpManager.ts:945`), e não tem de onde tirar outro — não existe campo, `_meta` ou
`session/update` que carregue a distinção.

Isso não é um buraco do adaptador. É o que a especificação define.

### 2.2 O corpus

Todo transcript gravado neste repositório, produção e dev:

| | |
|---|---|
| arquivos em `~/.lumem/transcripts` + `~/.lumem-dev/shared/transcripts` | **15** |
| conversas distintas (deduplicadas pelo texto, não pelo arquivo) | **8** |
| arquivos com **zero** turno — sessão aberta que nunca recebeu prompt | **7** |
| turnos distintos | **15** |

Os 7 vazios são achado de brinde, e não custam nada: **quase metade das sessões gravadas nunca
recebeu um prompt.** Para a `028` isso importa porque uma sessão viva sem turno é exatamente o que o
selo `implementando há 12 min` desenharia se ele fosse derivado de *"existe processo"* em vez de
*"existe turno em voo"*.

### 2.3 A medida

Dos 15 turnos: **2 `cancelled`** (você apertou parar) e **13 `end_turn`**. Classifiquei os 13 pelo
que o turno de fato era, lendo o último bloco de texto do agente:

| O que o turno era | Quantos | Exemplo do fim do texto |
|---|---|---|
| **terminou** — o trabalho acabou | **4** | *"**PR #27:** https://…/pull/27 → base `right-sidebar-files-diff`"* |
| **pergunta explícita** | **4** | *"Which do you want — **cascade** (recommended) or **UX-only**?"* |
| **espera implícita** — sem interrogação | **2** | *"Not committed — say the word and I commit atomic on `fix/delete-project`"* |
| **continuação implícita** — o turno morreu no meio do trabalho | **3** | *"Now validate — typecheck, then full web suite…**4 failures. Let me see them:**"* |

> **4 de 13 `end_turn` significaram "terminei". 31%.**

E as três categorias de baixo são o que decide o desenho:

- a **pergunta explícita** é a fácil, e é a única que uma heurística pega;
- a **espera implícita** é a que a heurística perde: *"say the word and I commit"* não tem
  interrogação e é exatamente tão bloqueante quanto uma pergunta;
- a **continuação implícita** é a perigosa. *"4 failures. Let me see them:"* é um turno que acabou
  **no meio de uma investigação**, com o diff pela metade e a suíte vermelha, devolvendo `end_turn`.
  Uma esteira que move o cartão quando o turno acaba moveria **esse** cartão para `In Review`.

Heurística do ponto de interrogação, medida contra o corpus: pega 4 dos 9 turnos que não terminaram.
**44% de recall** — e erra justamente no caso em que o erro é caro.

### 2.4 O que muda

Três coisas, e a primeira já estava escrita:

1. **O §4.1 da PRD estava certo, e agora é inegociável.** *"A máquina só move quando o fato é
   verificável de fora do agente"* deixa de ser um princípio de cautela e passa a ser a única leitura
   disponível: **o transporte não tem o dado.** Nenhuma seta do quadro pode depender de `stopReason`.

2. **Turno acabado ≠ tarefa acabada, então o implementador não é um prompt.** Três dos treze turnos
   pararam no meio sozinhos. O encaixe precisa de um laço com condição de parada externa (a PR existe,
   o CI fechou) — não *"mande o corpo da tarefa e espere"*.

3. **`max_turn_requests` é o teto de turnos da F3, de graça.** Está no `StopReason` e o daemon já o
   recebe; o que falta é ele chegar ao cartão como motivo de bloqueio em vez de ser tratado como fim
   de turno normal — o que é hoje.

E um corolário desconfortável: **o selo `aguardando você` não é derivável do transporte.** Se o
produto quiser distinguir *"perguntou"* de *"terminou"* sem custo de token, o sinal terá que ser
fabricado do lado do Lumem — instrução no preâmbulo pedindo uma marca, ou uma ferramenta que o agente
chama. As duas opções têm preço, e nenhuma foi decidida aqui.

---

## 3. De onde vem o evento externo

### 3.1 Latência, medida três vezes cada

| Caminho | Medido | O que é |
|---|---|---|
| `curl` direto em `api.linear.app/graphql` | **330–495 ms** (mediana ~345) | o piso: DNS + TLS + Linear |
| `gh pr list --limit 20 --json …` | **410–514 ms** (mediana ~470) | o precedente do [ADR de 2026-08-30](../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md), incluindo start de processo |
| `composio execute LINEAR_GET_CURRENT_USER` | **2 727–4 467 ms** (mediana ~2 828, frio 4 467) | a camada gerenciada, pelo CLI |
| `composio --version` (no-op) | **446–450 ms** | start do Node do CLI, para descontar |

Descontando o start do CLI, a camada gerenciada custa **~2,35 s de rede** contra **~345 ms** do
caminho direto: **o salto pelo relé hospedado é ~7× o custo de falar com o Linear.** Um daemon usaria
o SDK e não o CLI, então os 448 ms de Node saem da conta — os 2 s do salto, não.

### 3.2 Limite de taxa: polling não é o problema que eu esperava

[Documentação do Linear](https://linear.app/developers/rate-limiting), conferida em 2026-09-12:

| Autenticação | Requisições/hora | Complexidade/hora |
|---|---|---|
| chave de API | **2 500** por usuário | 3 000 000 pontos |
| OAuth | 5 000 por usuário/app | 2 000 000 pontos |
| sem autenticação | 600 por IP | 100 000 pontos |

A consulta do tracker é **por workspace**, não por projeto — a tarefa é atribuída a uma identidade
Lumem, e uma pergunta responde por todos os projetos. Então:

| Cadência | Requisições/hora | % do teto da chave de API |
|---|---|---|
| 15 s (a cadência do `PrCache`) | 240 | **9,6%** |
| 60 s | 60 | **2,4%** |

**Polling cabe folgado.** Eu esperava que o limite de taxa matasse essa opção e ele não mata — o que
polling custa é **latência**, não cota: uma issue atribuída às 14:00:01 entra na To-Do às 14:01:00 no
pior caso a 60 s. Para uma feature cujo caso de uso é *"enquanto você almoça"*, um minuto é ruído.

### 3.3 A camada gerenciada, medida de verdade

O Composio está instalado e com o Linear **já conectado** nesta máquina (`status: ACTIVE`), então dá
para medir em vez de supor. `composio triggers list linear` devolve gatilhos prontos:

| Gatilho | Tipo |
|---|---|
| `LINEAR_ISSUE_CREATED_TRIGGER` | **webhook** |
| `LINEAR_ISSUE_UPDATED_TRIGGER` | **webhook** |
| `LINEAR_COMMENT_EVENT_TRIGGER` | **webhook** |
| `LINEAR_PRIVATE_TEAM_ISSUE_CREATED` | **poll** — *"polled with the connected user's token"* |
| `LINEAR_PRIVATE_TEAM_ISSUE_PROPERTIES_UPDATED` | **poll** |

O detalhe que vale mais que a lista: **os gatilhos de time privado são `poll`, e o próprio Composio
diz isso na descrição.** Quem constrói relé hospedado para viver disso não conseguiu webhook para time
privado e caiu no polling — o que é uma medida da cobertura de webhook **do Linear**, não da
competência do Composio. Um relé nosso encontraria a mesma parede.

### 3.4 O segredo, e por que o precedente do `gh` não se aplica

O [ADR de 2026-08-30](../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md) resolveu o estado da
PR sem o Lumem guardar token: **o `gh` da sua máquina já estava lá, já autenticado.** A pergunta óbvia
é se dá para repetir isso com o tracker.

Medido nesta máquina:

```
$ which gh      → /opt/homebrew/bin/gh   (2.92.0)
$ which linear  → not found
$ which lnr     → not found
```

**Não existe o `gh` do Linear.** Nem do Jira, nem do ClickUp. O precedente não é portável, e a razão é
que ele nunca foi sobre GitHub — foi sobre **já existir na máquina uma ferramenta autenticada que não é
nossa**. Para tracker, essa ferramenta não existe.

Então as opções são três, e nenhuma é o caminho do `gh`:

| Opção | O que custa |
|---|---|
| **(a)** o Lumem guarda a chave do Linear | contradiz o ADR de frente. Exige ADR novo, não nota de PRD (regra 4 do `CLAUDE.md`) |
| **(b)** camada gerenciada guarda | o Lumem continua sem guardar segredo — mas a credencial de escrita do usuário passa a morar em terceiro, e o produto passa a **não funcionar offline**. Mais os ~2 s do §3.1 |
| **(c)** sem tracker na v1 | F5 e F6 saem. O UC1 — *"uma issue do Linear vira uma PR"* — sai junto, e ele é o caso que abriu a PRD |

A medida não escolhe entre elas. O que ela faz é **tirar da mesa a quarta opção**, que era a
confortável: *"faz como o `gh` fez"*.

---

## 4. O que já existe, e o que ainda não existe

### 4.1 A máquina de polling já está escrita duas vezes

`packages/server/src/pr/` tem `PrCache` (da [`013`](../features/013-pull-request-status/prd.md)) e
`IssueCache` (da [`026`](../features/026-worktree-from/prd.md)) — dois caches irmãos, com TTL
(`TTL_BUSY_MS = 15_000`) e recuo exponencial em falha já resolvidos. Um poller de tracker é um
**terceiro** com a mesma forma, e não maquinário novo. Isso derruba boa parte do custo estimado da
opção de polling do §3.2.

### 4.2 O quadro tem sete colunas e o modelo tem quatro estados úteis

`schema.ts:854` — o CHECK do `task.status`:

```sql
status IN ('proposed', 'open', 'in_progress', 'review', 'done', 'dropped')
```

Contra as sete colunas do §4 da PRD:

| Coluna da `028` | Estado da `022` |
|---|---|
| Backlog | — **colide com To-Do** |
| To-Do | `open` |
| In Progress | `in_progress` |
| In Review | `review` |
| **Testing** | **não existe** |
| **Ready to Merge** | **não existe** |
| Done | `done` |
| *(fora do quadro)* | `dropped` → arquivo · `proposed` → fila de Propostas |

Dois achados, e o segundo é o que importa:

1. faltam **dois estados** (`testing`, `ready_to_merge`), o que é migração de CHECK e nada mais;
2. **`Backlog` e `To-Do` mapeariam para o mesmo `open`** — e o §4 da PRD diz que a To-Do é *"onde mora
   a autorização"*. Colapsar as duas apaga exatamente a fronteira que a coluna existe para marcar:
   uma tarefa que o tracker despejou no Backlog viraria trabalho autorizado sem ninguém ter
   consentido. **Precisa de um estado próprio**, e não de uma coluna que finge.

### 4.3 `in_progress` é derivado, e o quadro deixa arrastar

`repositories/task.ts:63` diz, com todas as letras, que `in_progress` **não está em nenhuma das duas
listas de quem pode escrever**: ele é derivado do primeiro prompt de uma sessão ligada à tarefa, e
quem o escreve é o observador de eventos (`tasks/progress.ts:56`). Não existe caminho de pedido.

O §4 da `028` diz: *"você pode arrastar para qualquer coluna, sempre — inclusive para as da máquina,
que é como se diz 'estou fazendo isto na mão'"*.

**As duas frases não podem estar certas ao mesmo tempo.** Arrastar um cartão para `In Progress` hoje
é impossível: não há escritor. Ou o arrasto abre uma exceção nomeada, ou a coluna `In Progress` é a
única que não aceita arrasto — e aí o quadro tem um caso especial, que é o que o §4.1 passou a PRD
inteira evitando.

E é bom que seja assim: `in_progress` derivado é a mesma propriedade do selo do §4.1 — *"ele **não
pode** divergir da realidade, como uma coluna guardada pode"*. Quem quiser o arrasto está pedindo para
guardar.

Isto **não é pergunta desta medição, é pergunta da F1**, e está anotada como tal.

### 4.4 O limite de taxa como sinal já está de pé

O §11 listava o `rateLimitOf` quebrado como bloqueio da `pausada` da
[Q32](../features/028-autonomous-orchestration/open-questions.md). A
[`027`](../features/027-adapter-provenance/prd.md) consertou: `unifiedWindows` está em
`acp/translate.ts`. **Esse item sai da lista.**

---

## 4bis. A segunda medição: o turno que acaba *e* pergunta (2026-09-13)

> Feita depois, com **token de verdade** — Haiku e Opus, pelo adaptador que o daemon é dono. Custou
> **US$ 4,60** (Haiku 0,49 · Opus 4,11), e o gasto é o ponto: era o preço de saber em vez de supor.

O §2 mediu transcripts de **conversa**, onde perguntar é o comportamento certo. O número que decide a
[Q39](../features/028-autonomous-orchestration/open-questions.md) é outro: **com o prompt de um
implementador sozinho**, quantos turnos acabam sem ter terminado.

### 4bis.1 A bancada

Cinco tarefas num repositório git descartável — **um por turno** —, escolhidas pelos motivos de parar
que a Q39 separa: um **bug claro** (dá para terminar), um **ambíguo** (*"adicione desconto"*, sem
dizer quanto), um **destrutivo** (*"reescreva o README do zero"*), um **impossível** (*"use a tabela
de preços do serviço de catálogo"* — que não existe) e um **trivial**.

Dois braços, diferindo em **uma** frase: o autônomo acrescenta *"você está sozinho, ninguém vai
responder, não peça confirmação"*. Os dois pedem commit ao terminar — **a primeira corrida errou
isto**, e sem a correção o braço de conversa dava `committed: false` por construção, o que teria
produzido um número espetacular e falso.

O fato verificável é `git rev-parse HEAD` mudar: o mesmo critério do §4.1 da PRD — o daemon pergunta
ao git, não ao agente.

### 4bis.2 O que saiu

| | Haiku | Opus |
|---|---|---|
| autônomo — commitou | **5/5** | **5/5** |
| conversa — commitou | **5/5** | 4/5 |
| turnos que perguntaram alguma coisa | **0 de 10** | 6 de 10 |

**A frase de autonomia quase não mudou nada.** O que mudou tudo foi *"quando terminar, commite"* — e
isso não é a Q39, é outra coisa: o agente faz o que você pede, e o que estava faltando no braço de
conversa era o **pedido**, não a autonomia.

### 4bis.3 O achado: a pergunta estava mal formada

A Q39 supunha que *"terminou"* e *"te perguntou"* são estados **exclusivos** de um turno. Não são.

**6 dos 19 turnos que commitaram (31%) deixaram uma pergunta ou uma oferta em aberto** — no mesmo
turno, no mesmo texto:

> *"`biggest` still broke in `src/orders.ts:12`; **say the word and I'll fix**"* — e commitou
> *"Ordena lexicograficamente — `[9, 80]` vira `[80, 9]`. **Quer que eu corrija?**"* — e commitou

Então o selo `aguardando você` **não é alternativa a ter andado**. É um sinalizador **ortogonal**: o
cartão pode estar na coluna seguinte *e* esperando você. Um selo que escolhe entre os dois vai estar
errado em quase um terço dos turnos.

### 4bis.4 O achado que dói mais: o commit não separa o que precisa separar

A tarefa **impossível** pedia um serviço que não existe. **Três das quatro execuções inventaram
`src/catalog.ts` e commitaram** — 22, 14 e 32 linhas de um serviço fabricado:

```
Usar tabela de preços do serviço de catálogo
 src/catalog.ts | 22 ++++++++++++++++++++++
 src/orders.ts  | 12 +++++++-----
```

O Haiku escreveu `Commit: 50bb628 ✓`. **Só o Opus no braço de conversa recusou**, pedindo os detalhes
do catálogo.

Isso bate no princípio 3 da PRD — *"autonomia sem uma noção honesta de pronto é pior que nada"* — e
mexe no §4.1. O commit **é** verificável de fora do agente, e mesmo assim separa *"escreveu alguma
coisa"* de *"não escreveu nada"*, **não** *"terminou"* de *"desistiu inventando"*. O fato existe e
está errado.

O que salva é a outra metade do que o §4.1 já lista — *"o CI ficou verde"*. Consequência que a PRD
não escreve: **a força da esteira é a força da suíte do projeto.** Num repositório sem teste, a
esteira não tem como saber que o implementador inventou.

### 4bis.5 Haiku não pergunta — nunca

**0 de 10 turnos.** O modelo menor não hesita, ele decide: inventa o serviço, escolhe o percentual do
desconto, reescreve o README. Isso corrige uma expectativa minha registrada antes da medição — eu
esperava que ele perguntasse menos, e está certo; o que eu não vi é que isso é **ruim**, não bom.

Para a `028` a consequência é do §5, que já diz que o encaixe aponta para um **agente nomeado**: a
escolha do modelo do implementador não é economia, é a diferença entre uma esteira que para quando
devia e uma que não para nunca.

### 4bis.6 Os limites desta medição

**Vinte turnos.** Serve para ver se o efeito é grosso, não para medir taxa. Cinco tarefas escritas por
mim para provocar quatro motivos de parar — outra pessoa escreveria outras cinco. Um turno por tarefa,
sem repetição, então nada aqui separa comportamento de sorte. E o repositório é de laboratório: sem
suíte, sem CI, sem convenção — que é justamente o que o §4bis.4 diz que faria diferença.

---

## 5. O que não foi medido, e por quê

| Tema | Por que não |
|---|---|
| **três sessões por tarefa** — o que passa de uma para outra | é desenho, não medida. Precisa de decisão antes de ter o que medir |
| **entrega no mínimo uma vez / idempotência** | só existe depois de escolher webhook. Com polling (§3.2) a pergunta muda de forma: o problema vira *"já vi esta issue?"*, que é uma coluna |
| **as quatro autenticações** | três das quatro dependem da escolha do §3.4 |
| **lease, heartbeat, fencing** | medi o que existe (§4), não o que falta. Os invariantes do [estudo do Compozy](../references/compozy.md) continuam sendo a leitura recomendada antes de desenhar os nossos |

Nada disso bloqueia a **F1** — o quadro lendo a `022`, sem esteira —, e é por isso que ela pode sair
primeiro.

---

## 6. Resumo, para quem só vai ler isto

1. **`end_turn` não distingue "terminei" de "te perguntei".** 4 de 13 turnos reais significaram
   terminei. O §4.1 da PRD vira restrição dura: nenhuma seta do quadro depende do transporte.
2. **Turno acabado não é tarefa acabada.** 3 de 13 pararam no meio sozinhos. O implementador precisa
   de laço, não de um prompt.
3. **O precedente do `gh` não é portável para tracker** — não existe CLI autenticado na máquina. As
   três opções que sobram estão no §3.4, e uma delas exige ADR novo.
4. **Polling cabe na cota** (2,4% a 60 s) e a máquina dele já está escrita duas vezes neste
   repositório. O que ele custa é latência de até um minuto.
5. **A camada gerenciada custa ~2 s por chamada** e não resolve webhook de time privado — ela mesma
   faz polling ali.
6. **O modelo da `022` não comporta o quadro ainda**: faltam dois estados, e `Backlog`/`To-Do`
   colapsariam na fronteira de autorização.
